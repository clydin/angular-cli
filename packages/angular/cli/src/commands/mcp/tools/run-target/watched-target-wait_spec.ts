/**
 * @license
 * Copyright Google LLC All Rights Reserved.
 *
 * Use of this source code is governed by an MIT-style license that can be
 * found in the LICENSE file at https://angular.dev/license
 */

import {
  type MockMcpToolContext,
  addProjectToWorkspace,
  createMockContext,
} from '../../testing/test-utils';
import type { ActiveWatchedTarget } from './watched-target-manager';
import { runWait } from './watched-target-wait';

describe('watched_target.wait Tool', () => {
  let mockContext: MockMcpToolContext;

  beforeEach(() => {
    const mock = createMockContext();
    mockContext = mock.context;
    addProjectToWorkspace(mock.projects, 'my-app');
    mockContext.workspace.extensions['defaultProject'] = 'my-app';
  });

  it('should block until rebuild completes successfully and return log slice', async () => {
    const mockTarget = {
      workspacePath: '/test',
      projectName: 'my-app',
      targetName: 'serve',
      instanceId: 'default',
      buildInProgress: true,
      logs: [
        'Initial build log line.',
        '❯ Changes detected. Rebuilding...',
        'Compiled successfully.',
      ],
      latestBuildLogStartIndex: 1,
      latestBuildStatus: 'success' as const,
    };

    mockContext.watchedTargetManager.get.and.returnValue(
      mockTarget as unknown as ActiveWatchedTarget,
    );

    // Trigger buildInProgress transition to false after 100ms
    setTimeout(() => {
      mockTarget.buildInProgress = false;
    }, 100);

    const { structuredContent } = await runWait({ target: 'serve' }, mockContext);

    expect(structuredContent.status).toBe('success');
    expect(structuredContent.logs).toEqual([
      '❯ Changes detected. Rebuilding...',
      'Compiled successfully.',
    ]);
  });

  it('should resolve immediately with success status if build is not currently in progress', async () => {
    const mockTarget = {
      workspacePath: '/test',
      projectName: 'my-app',
      targetName: 'serve',
      instanceId: 'default',
      buildInProgress: false,
      logs: ['Initial log.', 'Rebuilt successfully.'],
      latestBuildLogStartIndex: 1,
      latestBuildStatus: 'success' as const,
    };

    mockContext.watchedTargetManager.get.and.returnValue(
      mockTarget as unknown as ActiveWatchedTarget,
    );

    const { structuredContent } = await runWait({ target: 'serve' }, mockContext);

    expect(structuredContent.status).toBe('success');
    expect(structuredContent.logs).toEqual(['Rebuilt successfully.']);
  });

  it('should resolve cleanly with timeout status if the deadline is exceeded', async () => {
    const mockTarget = {
      workspacePath: '/test',
      projectName: 'my-app',
      targetName: 'serve',
      instanceId: 'default',
      buildInProgress: true,
      logs: [],
      latestBuildStatus: 'unknown' as const,
    };

    mockContext.watchedTargetManager.get.and.returnValue(
      mockTarget as unknown as ActiveWatchedTarget,
    );

    const { structuredContent } = await runWait({ target: 'serve', timeout: 10 }, mockContext);

    expect(structuredContent.status).toBe('timeout');
    expect(structuredContent.logs).toBeUndefined();
  });

  it('should throw a descriptive error listing all active targets if requested target is not running', async () => {
    mockContext.watchedTargetManager.get.and.returnValue(undefined);
    mockContext.watchedTargetManager.list.and.returnValue([
      {
        workspacePath: '/test',
        projectName: 'my-app',
        targetName: 'serve',
        instanceId: 'default',
      } as unknown as ActiveWatchedTarget,
    ]);

    await expectAsync(runWait({ target: 'build' }, mockContext)).toBeRejectedWithError(
      /No active watched target matches the requested target 'build'/,
    );
  });
});
