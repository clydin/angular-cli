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

const watchedTargetStopInputSchema = z.object({
  ...workspaceAndProjectOptions,
  target: z
    .string()
    .describe(
      'The target name of the active background watched process to terminate (e.g., "serve").',
    ),
  instanceId: z
    .string()
    .optional()
    .describe('Optional identifier used to isolate concurrent runs of the target.'),
});

export type WatchedTargetStopInput = z.infer<typeof watchedTargetStopInputSchema>;

const watchedTargetStopOutputSchema = z.object({
  status: z.enum(['success', 'failure']).describe('Teardown status.'),
});

export type WatchedTargetStopOutput = z.infer<typeof watchedTargetStopOutputSchema>;

export async function runStop(input: WatchedTargetStopInput, context: McpToolContext) {
  const { workspacePath, projectName } = await resolveWorkspaceAndProject({
    host: context.host,
    server: context.server,
    workspacePathInput: input.workspace,
    projectNameInput: input.project,
    mcpWorkspace: context.workspace,
  });

  const instanceId = input.instanceId || 'default';
  const stopped = context.watchedTargetManager.stop(
    workspacePath,
    projectName,
    input.target,
    instanceId,
  );

  if (!stopped) {
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
      `Failed to stop watched target. No active watched target matches the requested target '${input.target}' ` +
        `(instance: '${instanceId}') for project '${projectName}'.\n` +
        `Currently running background processes:\n${runningList}\n` +
        `Please verify you provided the correct workspace, project, target, and instanceId arguments.`,
    );
  }

  const structuredContent: WatchedTargetStopOutput = {
    status: 'success',
  };

  return createStructuredContentOutput(structuredContent);
}

export const WATCHED_TARGET_STOP_TOOL: McpToolDeclaration<
  typeof watchedTargetStopInputSchema.shape,
  typeof watchedTargetStopOutputSchema.shape
> = declareTool({
  name: 'watched_target.stop',
  title: 'Stop Watched Background Target',
  description: `
<Purpose>
Terminates a running background watched target process cleanly and removes it from the workspace map registry.
Use this tool when a background job (such as serve dev server or continuous testing) is no longer needed.
</Purpose>
<Use Cases>
* Stopping an active background serve devserver once coding tasks or E2E assertions complete.
* Cleaning up background processes to free system memory before moving to other workspace tasks.
</Use Cases>
<Operational Notes>
* This tool dynamically terminates the process group cleanly.
* If multiple concurrent background processes exist for the same target, you MUST pass the matching 'instanceId'.
* Throws a descriptive error showing all active running background processes if the target cannot be found.
</Operational Notes>
`,
  isReadOnly: false,
  isLocalOnly: true,
  inputSchema: watchedTargetStopInputSchema.shape,
  outputSchema: watchedTargetStopOutputSchema.shape,
  factory: (context) => (input) => runStop(input, context),
});
