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
import { runStop } from './watched-target-stop';

describe('watched_target.stop Tool', () => {
  let mockContext: MockMcpToolContext;

  beforeEach(() => {
    const mock = createMockContext();
    mockContext = mock.context;
    addProjectToWorkspace(mock.projects, 'my-app');
    mockContext.workspace.extensions['defaultProject'] = 'my-app';
  });

  it('should cleanly stop active background target and return success status', async () => {
    mockContext.watchedTargetManager.stop.and.returnValue(true);

    const { structuredContent } = await runStop({ target: 'serve' }, mockContext);

    expect(mockContext.watchedTargetManager.stop).toHaveBeenCalledWith(
      '/test',
      'my-app',
      'serve',
      'default',
    );
    expect(structuredContent.status).toBe('success');
  });

  it('should throw a descriptive error listing all active targets if requested target cannot be stopped', async () => {
    mockContext.watchedTargetManager.stop.and.returnValue(false);
    mockContext.watchedTargetManager.list.and.returnValue([
      {
        workspacePath: '/test',
        projectName: 'my-app',
        targetName: 'serve',
        instanceId: 'default',
      } as unknown as ActiveWatchedTarget,
    ]);

    await expectAsync(runStop({ target: 'build' }, mockContext)).toBeRejectedWithError(
      /Failed to stop watched target. No active watched target matches the requested target 'build'/,
    );
  });
});
