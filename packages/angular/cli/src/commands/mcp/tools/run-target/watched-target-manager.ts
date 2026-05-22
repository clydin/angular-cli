/**
 * @license
 * Copyright Google LLC All Rights Reserved.
 *
 * Use of this source code is governed by an MIT-style license that can be
 * found in the LICENSE file at https://angular.dev/license
 */

import type { ChildProcess } from 'node:child_process';
import { type Host, processStreamLines } from '../../host';
import type { OptionValue, StatusMatcher } from './types';

export type BuildStatus = 'success' | 'failure' | 'unknown';

export interface ActiveWatchedTarget {
  workspacePath: string;
  projectName: string;
  targetName: string;
  instanceId: string;
  options?: Record<string, OptionValue>;
  process: ChildProcess;
  logs: string[];
  buildInProgress: boolean;
  latestBuildLogStartIndex?: number;
  latestBuildStatus: BuildStatus;
  statusMatcher: StatusMatcher;
}

function areOptionsEqual(
  a?: Record<string, OptionValue>,
  b?: Record<string, OptionValue>,
): boolean {
  if (!a && !b) {
    return true;
  }
  if (!a || !b) {
    return false;
  }
  const keysA = Object.keys(a).sort();
  const keysB = Object.keys(b).sort();
  if (keysA.length !== keysB.length) {
    return false;
  }
  for (let i = 0; i < keysA.length; i++) {
    if (keysA[i] !== keysB[i]) {
      return false;
    }
    const valA = a[keysA[i]];
    const valB = b[keysB[i]];
    if (Array.isArray(valA) && Array.isArray(valB)) {
      if (valA.length !== valB.length) {
        return false;
      }
      for (let j = 0; j < valA.length; j++) {
        if (valA[j] !== valB[j]) {
          return false;
        }
      }
    } else if (valA !== valB) {
      return false;
    }
  }

  return true;
}

export class WatchedTargetManager {
  private readonly targets = new Map<string, ActiveWatchedTarget>();

  private getMapKey(
    workspacePath: string,
    projectName: string,
    targetName: string,
    instanceId: string,
  ): string {
    return `${workspacePath}:${projectName}:${targetName}:${instanceId}`;
  }

  /**
   * Spawns or updates a watched background process using Smart Hybrid tracking.
   */
  startOrUpdate(
    {
      workspacePath,
      projectName,
      targetName,
      statusMatcher,
      instanceId,
      options,
      args,
    }: {
      workspacePath: string;
      projectName: string;
      targetName: string;
      statusMatcher: StatusMatcher;
      instanceId?: string;
      options?: Record<string, OptionValue>;
      args: string[];
    },
    host: Host,
  ): ActiveWatchedTarget {
    const activeId = instanceId || 'default';
    const key = this.getMapKey(workspacePath, projectName, targetName, activeId);
    const existing = this.targets.get(key);

    if (existing) {
      // 1. Idempotency: If options are identical, return the active instance immediately
      if (areOptionsEqual(existing.options, options)) {
        return existing;
      }

      // 2. Auto-Clobbering: Terminate old process and spawn fresh if options differ
      this.stopTarget(existing);
    }

    // 3. Spawn fresh background watched target process
    const childProcess = host.startNgProcess(args, {
      stdio: 'pipe',
      cwd: workspacePath,
    });

    const activeTarget: ActiveWatchedTarget = {
      workspacePath,
      projectName,
      targetName,
      instanceId: activeId,
      options,
      process: childProcess,
      logs: [],
      buildInProgress: true,
      latestBuildStatus: 'unknown',
      statusMatcher,
    };

    processStreamLines(childProcess.stdout, (line) => this.addLog(activeTarget, line));
    processStreamLines(childProcess.stderr, (line) => this.addLog(activeTarget, line));

    childProcess.on('close', () => {
      const current = this.targets.get(key);
      if (current && current.process === childProcess) {
        this.targets.delete(key);
      }
    });

    this.targets.set(key, activeTarget);

    return activeTarget;
  }

  private addLog(target: ActiveWatchedTarget, log: string) {
    target.logs.push(log);
    const matcher = target.statusMatcher;

    if (matcher.startRegexes.some((regex) => regex.test(log))) {
      target.buildInProgress = true;
      target.latestBuildLogStartIndex = target.logs.length - 1;
    } else if (matcher.successRegexes.some((regex) => regex.test(log))) {
      target.buildInProgress = false;
      target.latestBuildStatus = 'success';
    } else if (matcher.failureRegexes.some((regex) => regex.test(log))) {
      target.buildInProgress = false;
      target.latestBuildStatus = 'failure';
    }
  }

  private stopTarget(target: ActiveWatchedTarget) {
    target.process.kill();
  }

  /**
   * Stops a specific target by project/target name and instanceId.
   */
  stop(
    workspacePath: string,
    projectName: string,
    targetName: string,
    instanceId = 'default',
  ): boolean {
    const key = this.getMapKey(workspacePath, projectName, targetName, instanceId);
    const target = this.targets.get(key);
    if (target) {
      this.stopTarget(target);
      this.targets.delete(key);

      return true;
    }

    return false;
  }

  /**
   * Stops all running background watched targets (used on server close/teardown).
   */
  stopAll(): void {
    for (const target of this.targets.values()) {
      this.stopTarget(target);
    }
    this.targets.clear();
  }

  /**
   * Retrieves an active watched target registry.
   */
  get(
    workspacePath: string,
    projectName: string,
    targetName: string,
    instanceId = 'default',
  ): ActiveWatchedTarget | undefined {
    const key = this.getMapKey(workspacePath, projectName, targetName, instanceId);

    return this.targets.get(key);
  }

  /**
   * Lists all active running background targets.
   */
  list(): ActiveWatchedTarget[] {
    return Array.from(this.targets.values());
  }
}
