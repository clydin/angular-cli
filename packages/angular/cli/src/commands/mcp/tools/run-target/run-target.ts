/**
 * @license
 * Copyright Google LLC All Rights Reserved.
 *
 * Use of this source code is governed by an MIT-style license that can be
 * found in the LICENSE file at https://angular.dev/license
 */

import { createStructuredContentOutput } from '../../utils';
import { resolveWorkspaceAndProject } from '../../workspace-utils';
import { type McpToolContext, declareTool } from '../tool-registry';
import { BuildTargetStrategy } from './build-target-strategy';
import { GenericTargetStrategy } from './generic-target-strategy';
import type { TargetStrategy } from './strategy';
import { type RunTargetInput, runTargetInputSchema, runTargetOutputSchema } from './types';
import { UnitTestTargetStrategy } from './unit-test-strategy';

const FALLBACK_STRATEGY = new GenericTargetStrategy();
const STRATEGIES: TargetStrategy[] = [new BuildTargetStrategy(), new UnitTestTargetStrategy()];

export async function runTarget(input: RunTargetInput, context: McpToolContext) {
  const { workspace, workspacePath, projectName } = await resolveWorkspaceAndProject({
    host: context.host,
    server: context.server,
    workspacePathInput: input.workspace,
    projectNameInput: input.project,
    mcpWorkspace: context.workspace,
  });

  const targetDefinition = workspace.projects.get(projectName)?.targets.get(input.target);
  const builder = targetDefinition?.builder;

  const strategy = STRATEGIES.find((s) => s.canHandle(input.target, builder)) ?? FALLBACK_STRATEGY;

  const result = await strategy.execute(
    {
      workspacePath,
      projectName,
      targetName: input.target,
      targetDefinition,
      configuration: input.configuration,
      instanceId: input.instanceId,
      options: input.options,
    },
    context,
  );

  return createStructuredContentOutput(result);
}

export const RUN_TARGET_TOOL = declareTool({
  name: 'run_target',
  title: 'Run Project Target',
  description: `
<Purpose>
Executes a configured target (such as build, test, serve, lint, e2e) for an Angular project.
This is the single, unified interface for executing all project tasks natively.
</Purpose>
<Use Cases>
* Building an application or library.
* Starting a watched development server (e.g., 'serve') in the background.
* Running unit tests, E2E tests, or linters.
* Deploying or running custom workspace targets discovered via 'list_projects'.
</Use Cases>
<Operational Notes>
* Mandatory Discovery: You MUST discover available project targets by calling 'list_projects' first.
* Headless Testing: For official builders, the test target automatically runs in headless mode
  and disables watch mode to guarantee clean execution.
* Output Paths: For official builders, successful builds return the build directory in 'outputPath' under the extensions metadata.
* Watched Background Processes: Watch mode (e.g. the 'serve' target or passing 'watch: true' in options) is supported.
  Spawning a watched target returns a success status immediately while the process runs continuously in the background.
* Isolating Concurrent Instances: For watched processes, you can optionally supply an 'instanceId' (e.g., 'preview', 'testing')
  to run multiple background instances of the exact same target concurrently. Do NOT pass 'instanceId' for one-off runs.
</Operational Notes>`,
  isReadOnly: false,
  isLocalOnly: true,
  inputSchema: runTargetInputSchema.shape,
  outputSchema: runTargetOutputSchema.shape,
  factory: (context) => (input) => runTarget(input, context),
});
