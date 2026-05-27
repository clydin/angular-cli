/**
 * @license
 * Copyright Google LLC All Rights Reserved.
 *
 * Use of this source code is governed by an MIT-style license that can be
 * found in the LICENSE file at https://angular.dev/license
 */

import { z } from 'zod';
import { workspaceAndProjectOptions } from '../../shared-options';
import { createStructuredContentOutput } from '../../utils';
import { resolveWorkspaceAndProject } from '../../workspace-utils';
import { type McpToolContext, type McpToolDeclaration, declareTool } from '../tool-registry';
import type { BuildStatus } from './watched-target-manager';

const WATCH_DELAY_MS = 250;
const DEFAULT_TIMEOUT_MS = 30000;
const MAX_TIMEOUT_MS = 300000;

const watchedTargetWaitInputSchema = z.object({
  ...workspaceAndProjectOptions,
  target: z
    .string()
    .describe('The target name of the active background watched process to await (e.g., "serve").'),
  instanceId: z
    .string()
    .optional()
    .describe('Optional identifier used to isolate concurrent runs of the target.'),
  timeout: z
    .number()
    .optional()
    .describe('Time in milliseconds to wait before timing out. Defaults to 30,000ms.'),
});

export type WatchedTargetWaitInput = z.infer<typeof watchedTargetWaitInputSchema>;

const watchedTargetWaitOutputSchema = z.object({
  status: z.enum(['success', 'failure', 'timeout']).describe('Rebuild compilation status.'),
  logs: z
    .array(z.string())
    .optional()
    .describe('Sanitized log lines recorded since the start of the rebuild.'),
});

export type WatchedTargetWaitOutput = z.infer<typeof watchedTargetWaitOutputSchema>;

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export async function runWait(input: WatchedTargetWaitInput, context: McpToolContext) {
  const { workspacePath, projectName } = await resolveWorkspaceAndProject({
    host: context.host,
    server: context.server,
    workspacePathInput: input.workspace,
    projectNameInput: input.project,
    mcpWorkspace: context.workspace,
  });

  const instanceId = input.instanceId || 'default';
  const activeTarget = context.watchedTargetManager.get(
    workspacePath,
    projectName,
    input.target,
    instanceId,
  );

  if (!activeTarget) {
    const activeTargets = context.watchedTargetManager.list();
    if (activeTargets.length === 0) {
      throw new Error('No background watched targets are currently running.');
    }

    const runningList = activeTargets
      .map(
        (t) =>
          `- Target '${t.targetName}' (instance: '${t.instanceId}') ` +
          `for project '${t.projectName}' in path '${t.workspacePath}'`,
      )
      .join('\n');

    throw new Error(
      `No active watched target matches the requested target '${input.target}' ` +
        `(instance: '${instanceId}') for project '${projectName}'.\n` +
        `Currently running background processes:\n${runningList}\n` +
        `Please verify you provided the correct workspace, project, target, and instanceId arguments.`,
    );
  }

  const requestedTimeout = input.timeout ?? DEFAULT_TIMEOUT_MS;
  const timeout = Math.min(Math.max(requestedTimeout, 0), MAX_TIMEOUT_MS);
  const deadline = Date.now() + timeout;

  await wait(WATCH_DELAY_MS);

  while (activeTarget.buildInProgress) {
    if (Date.now() > deadline) {
      const structuredContent: WatchedTargetWaitOutput = {
        status: 'timeout',
        logs: undefined,
      };

      return createStructuredContentOutput(structuredContent);
    }

    await wait(WATCH_DELAY_MS);
  }

  const startIdx = activeTarget.latestBuildLogStartIndex ?? 0;
  const logs = activeTarget.logs.slice(startIdx);

  const structuredContent: WatchedTargetWaitOutput = {
    status:
      activeTarget.latestBuildStatus === 'unknown' ? 'success' : activeTarget.latestBuildStatus,
    logs,
  };

  return createStructuredContentOutput(structuredContent);
}

export const WATCHED_TARGET_WAIT_TOOL: McpToolDeclaration<
  typeof watchedTargetWaitInputSchema.shape,
  typeof watchedTargetWaitOutputSchema.shape
> = declareTool({
  name: 'watched_target.wait',
  title: 'Wait for Watched Rebuild',
  description: `
<Purpose>
Blocks the execution thread reactively until the active rebuild compilation of a background watched target completes.
Use this tool immediately after saving file changes if you need to await and verify successful recompilation logs.
</Purpose>
<Use Cases>
* Awaiting devserver compilation completion after modifying project code files.
* Verifying that background tests or builds compile successfully with zero errors after changes.
</Use Cases>
<Operational Notes>
* This tool is reactive and polls the running process log stream, resolving immediately upon compilation transition.
* If you spawn multiple concurrent background processes for the same target, you MUST pass the matching 'instanceId'.
* Throws a descriptive error showing all active running background processes if the requested target is not found.
</Operational Notes>
`,
  isReadOnly: true,
  isLocalOnly: true,
  inputSchema: watchedTargetWaitInputSchema.shape,
  outputSchema: watchedTargetWaitOutputSchema.shape,
  factory: (context) => (input) => runWait(input, context),
});
