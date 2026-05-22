/**
 * @license
 * Copyright Google LLC All Rights Reserved.
 *
 * Use of this source code is governed by an MIT-style license that can be
 * found in the LICENSE file at https://angular.dev/license
 */

import type { ChildProcess } from 'node:child_process';
import type { Host } from '../../host';
import { getStatusMatcher } from './matchers';
import { WatchedTargetManager } from './watched-target-manager';

describe('WatchedTargetManager', () => {
  let manager: WatchedTargetManager;
  let mockHost: jasmine.SpyObj<Host>;
  let mockProcess: jasmine.SpyObj<ChildProcess>;
  let spawnedCount: number;

  beforeEach(() => {
    manager = new WatchedTargetManager();
    spawnedCount = 0;

    mockProcess = jasmine.createSpyObj<ChildProcess>('ChildProcess', ['kill', 'on']);
    mockProcess.stdout = jasmine.createSpyObj('stdout', ['on']);
    mockProcess.stderr = jasmine.createSpyObj('stderr', ['on']);

    mockHost = jasmine.createSpyObj<Host>('Host', ['startNgProcess']);
    mockHost.startNgProcess.and.callFake(() => {
      spawnedCount++;

      return mockProcess;
    });
  });

  afterEach(() => {
    manager.stopAll();
  });

  it('should spawn a new background watched target process successfully', () => {
    const activeTarget = manager.startOrUpdate(
      {
        workspacePath: '/test',
        projectName: 'my-app',
        targetName: 'serve',
        statusMatcher: getStatusMatcher('@angular-devkit/build-angular:dev-server'),
        options: { port: 4200 },
        args: ['serve', 'my-app', '--port=4200'],
      },
      mockHost,
    );

    expect(mockHost.startNgProcess).toHaveBeenCalledWith(['serve', 'my-app', '--port=4200'], {
      cwd: '/test',
    });
    expect(spawnedCount).toBe(1);
    expect(activeTarget.projectName).toBe('my-app');
    expect(activeTarget.instanceId).toBe('default');
    expect(activeTarget.logs).toEqual([]);
  });

  it('should reuse the active process idempotently if configuration options are identical', () => {
    // 1. First spawn
    const target1 = manager.startOrUpdate(
      {
        workspacePath: '/test',
        projectName: 'my-app',
        targetName: 'serve',
        statusMatcher: getStatusMatcher('@angular-devkit/build-angular:dev-server'),
        options: { port: 4200, configuration: 'development' },
        args: ['serve', 'my-app', '--port=4200'],
      },
      mockHost,
    );

    // 2. Second spawn with identical options
    const target2 = manager.startOrUpdate(
      {
        workspacePath: '/test',
        projectName: 'my-app',
        targetName: 'serve',
        statusMatcher: getStatusMatcher('@angular-devkit/build-angular:dev-server'),
        options: { port: 4200, configuration: 'development' },
        args: ['serve', 'my-app', '--port=4200'],
      },
      mockHost,
    );

    expect(spawnedCount).toBe(1); // Reuse!
    expect(mockProcess.kill).not.toHaveBeenCalled();
    expect(target1).toBe(target2);
  });

  it('should auto-kill the old process and spawn fresh if configuration options differ (clobbering)', () => {
    // 1. First spawn on port 4200
    const target1 = manager.startOrUpdate(
      {
        workspacePath: '/test',
        projectName: 'my-app',
        targetName: 'serve',
        statusMatcher: getStatusMatcher('@angular-devkit/build-angular:dev-server'),
        options: { port: 4200 },
        args: ['serve', 'my-app', '--port=4200'],
      },
      mockHost,
    );

    // 2. Second spawn on port 8080
    const target2 = manager.startOrUpdate(
      {
        workspacePath: '/test',
        projectName: 'my-app',
        targetName: 'serve',
        statusMatcher: getStatusMatcher('@angular-devkit/build-angular:dev-server'),
        options: { port: 8080 },
        args: ['serve', 'my-app', '--port=8080'],
      },
      mockHost,
    );

    expect(mockProcess.kill).toHaveBeenCalledTimes(1); // Terminated old process!
    expect(spawnedCount).toBe(2); // Spawned fresh!
    expect(target1).not.toBe(target2);
  });

  it('should isolate processes concurrently if custom instanceId option is provided (aliasing)', () => {
    // 1. Spawn instance "default"
    const target1 = manager.startOrUpdate(
      {
        workspacePath: '/test',
        projectName: 'my-app',
        targetName: 'serve',
        statusMatcher: getStatusMatcher('@angular-devkit/build-angular:dev-server'),
        options: { port: 4200 },
        args: ['serve', 'my-app', '--port=4200'],
      },
      mockHost,
    );

    // 2. Spawn instance "preview" concurrently
    const target2 = manager.startOrUpdate(
      {
        workspacePath: '/test',
        projectName: 'my-app',
        targetName: 'serve',
        statusMatcher: getStatusMatcher('@angular-devkit/build-angular:dev-server'),
        instanceId: 'preview',
        options: { port: 8080 },
        args: ['serve', 'my-app', '--port=8080'],
      },
      mockHost,
    );

    expect(mockProcess.kill).not.toHaveBeenCalled(); // No termination!
    expect(spawnedCount).toBe(2); // Both running side-by-side!
    expect(target1.instanceId).toBe('default');
    expect(target2.instanceId).toBe('preview');
    expect(manager.list().length).toBe(2);
  });

  describe('StatusMatcher Log Parsing', () => {
    it('should resolve ESBUILD_MATCHER correctly and parse build success/failure logs', () => {
      const target = manager.startOrUpdate(
        {
          workspacePath: '/test',
          projectName: 'my-app',
          targetName: 'serve',
          statusMatcher: getStatusMatcher('@angular-devkit/build-angular:application'),
          args: ['serve'],
        },
        mockHost,
      );

      expect(target.buildInProgress).toBeTrue();

      // Simulate rebuilding trigger log
      manager['addLog'](target, '❯ Changes detected. Rebuilding...');
      expect(target.buildInProgress).toBeTrue();

      // Simulate success trigger log
      manager['addLog'](target, 'Application bundle generation complete.');
      expect(target.buildInProgress).toBeFalse();
      expect(target.latestBuildStatus).toBe('success');
    });

    it('should resolve WEBPACK_MATCHER correctly and parse webpack success logs', () => {
      const target = manager.startOrUpdate(
        {
          workspacePath: '/test',
          projectName: 'my-app',
          targetName: 'serve',
          statusMatcher: getStatusMatcher('@angular-devkit/build-angular:dev-server'),
          args: ['serve'],
        },
        mockHost,
      );

      expect(target.buildInProgress).toBeTrue();

      // Simulate webpack success log
      manager['addLog'](target, 'Compiled successfully.');
      expect(target.buildInProgress).toBeFalse();
      expect(target.latestBuildStatus).toBe('success');
    });
  });

  it('should terminate all active background targets cleanly on stopAll', () => {
    manager.startOrUpdate(
      {
        workspacePath: '/test',
        projectName: 'my-app',
        targetName: 'serve',
        statusMatcher: getStatusMatcher(''),
        args: ['serve'],
      },
      mockHost,
    );

    manager.stopAll();
    expect(mockProcess.kill).toHaveBeenCalledTimes(1);
    expect(manager.list().length).toBe(0);
  });
});
