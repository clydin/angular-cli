/**
 * @license
 * Copyright Google LLC All Rights Reserved.
 *
 * Use of this source code is governed by an MIT-style license that can be
 * found in the LICENSE file at https://angular.dev/license
 */

import type * as ParcelWatcher from '@parcel/watcher';
import type * as Chokidar from 'chokidar';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { toPosixPath } from '../../utils/path';

export class ChangedFiles {
  readonly added = new Set<string>();
  readonly modified = new Set<string>();
  readonly removed = new Set<string>();

  get all(): string[] {
    return Array.from(new Set([...this.added, ...this.modified, ...this.removed]));
  }

  toDebugString(): string {
    const content = {
      added: Array.from(this.added),
      modified: Array.from(this.modified),
      removed: Array.from(this.removed),
    };

    return JSON.stringify(content, null, 2);
  }
}

export interface BuildWatcher extends AsyncIterableIterator<ChangedFiles> {
  add(paths: string | readonly string[]): void;
  remove(paths: string | readonly string[]): void;
  close(): Promise<void>;
}

export interface WatcherOptions {
  polling?: boolean;
  interval?: number;
  ignored?: string[];
  followSymlinks?: boolean;
  cwd?: string;
}

/**
 * Probes the filesystem at the specified target directory to determine whether it is case-sensitive.
 */
function isFileSystemCaseSensitive(targetDir: string = process.cwd()): boolean {
  try {
    const resolved = path.resolve(targetDir);
    // Invert the casing of the target directory path.
    const altCase =
      resolved === resolved.toLowerCase() ? resolved.toUpperCase() : resolved.toLowerCase();

    // If the path contains no alphabetic characters (e.g. root '/'), invert-casing
    // produces the exact same string. Fall back to platform-specific defaults in this case.
    if (resolved === altCase) {
      return process.platform !== 'win32' && process.platform !== 'darwin';
    }

    // If both the original path and the inverted-casing path exist on disk,
    // the filesystem is case-insensitive (returns false).
    return !fs.existsSync(altCase);
  } catch {
    // If an error occurs (e.g., permission denied), default to the platform-specific
    // behavior (case-insensitive on Windows/macOS, sensitive on Linux/Unix).
    return process.platform !== 'win32' && process.platform !== 'darwin';
  }
}

/**
 * Normalizes a file system path string to POSIX format (forward slashes '/')
 * and strips trailing slashes (except root '/' or Windows drive root 'C:/').
 */
export function toPosixPathNormalized(pathString: string): string {
  let posixPath = toPosixPath(pathString);
  if (posixPath.length > 1 && posixPath.endsWith('/') && !/^[a-zA-Z]:\/$/.test(posixPath)) {
    posixPath = posixPath.slice(0, -1);
  }

  return posixPath;
}

/**
 * Returns a lookup key for set lookups and matching, lowercasing on case-insensitive file systems.
 */
function toLookupKey(posixPath: string, isCaseSensitive: boolean): string {
  return isCaseSensitive ? posixPath : posixPath.toLowerCase();
}

/**
 * Determines whether a file path lookup key or any of its parent directories are present in watchedFiles.
 */
function isPathWatched(fileLookupKey: string, watchedFiles: Set<string>): boolean {
  if (watchedFiles.has(fileLookupKey)) {
    return true;
  }

  let current = fileLookupKey;
  while (true) {
    const parent = path.posix.dirname(current);
    if (parent === current) {
      break;
    }
    if (watchedFiles.has(parent)) {
      return true;
    }
    current = parent;
  }

  return false;
}

class WatcherQueue {
  private readonly nextQueue: ((value?: ChangedFiles) => void)[] = [];
  private currentChangedFiles: ChangedFiles | undefined;
  private isClosed = false;

  addChange(type: 'added' | 'modified' | 'removed', file: string): void {
    if (this.isClosed) {
      return;
    }

    const changedFiles = (this.currentChangedFiles ??= new ChangedFiles());
    changedFiles[type].add(file);
    this.flush();
  }

  addChanges(
    changes: ReadonlyArray<{ type: 'added' | 'modified' | 'removed'; file: string }>,
  ): void {
    if (this.isClosed || changes.length === 0) {
      return;
    }

    const changedFiles = (this.currentChangedFiles ??= new ChangedFiles());
    for (const { type, file } of changes) {
      changedFiles[type].add(file);
    }
    this.flush();
  }

  private flush(): void {
    if (
      this.currentChangedFiles &&
      this.currentChangedFiles.all.length > 0 &&
      this.nextQueue.length > 0
    ) {
      const next = this.nextQueue.shift();
      if (next) {
        const result = this.currentChangedFiles;
        this.currentChangedFiles = undefined;
        next(result);
      }
    }
  }

  async next(): Promise<IteratorResult<ChangedFiles>> {
    if (
      this.currentChangedFiles &&
      this.currentChangedFiles.all.length > 0 &&
      this.nextQueue.length === 0
    ) {
      const result = { value: this.currentChangedFiles };
      this.currentChangedFiles = undefined;

      return result;
    }

    if (this.isClosed) {
      return { done: true, value: undefined as unknown as ChangedFiles };
    }

    return new Promise((resolve) => {
      this.nextQueue.push((value) =>
        resolve(value ? { value } : { done: true, value: undefined as unknown as ChangedFiles }),
      );
    });
  }

  close(): void {
    if (this.isClosed) {
      return;
    }

    this.isClosed = true;
    this.currentChangedFiles = undefined;

    let next;
    while ((next = this.nextQueue.shift()) !== undefined) {
      next();
    }
  }
}

export async function createWatcher(options?: WatcherOptions): Promise<BuildWatcher> {
  if (options?.polling) {
    return createChokidarWatcher(options);
  }

  try {
    const parcelWatcher = await import('@parcel/watcher');

    return await createParcelWatcher(options, parcelWatcher);
  } catch {
    return createChokidarWatcher(options);
  }
}

/**
 * Checks whether a file path is located inside a parent directory.
 *
 * Input Expectations:
 * - Both `file` and `dir` must be normalized POSIX-style paths (using forward slashes '/').
 * - Both paths must share the same casing normalization (e.g., lowercased on case-insensitive file systems).
 */
export function isPathInside(file: string, dir: string): boolean {
  if (file === dir) {
    return false;
  }

  const dirWithSlash = dir.endsWith('/') ? dir : dir + '/';

  return file.startsWith(dirWithSlash);
}

async function createParcelWatcher(
  options: WatcherOptions | undefined,
  parcelWatcher: typeof ParcelWatcher,
): Promise<BuildWatcher> {
  const watchedFiles = new Set<string>();
  const queue = new WatcherQueue();

  const isCaseSensitive = isFileSystemCaseSensitive(options?.cwd);
  const rootDirPosix = toPosixPathNormalized(options?.cwd ?? process.cwd());
  const rootDirLookupKey = toLookupKey(rootDirPosix, isCaseSensitive);
  const extraSubscriptions = new Map<string, ParcelWatcher.AsyncSubscription>();
  const pendingSubscriptions = new Map<string, Promise<ParcelWatcher.AsyncSubscription>>();
  const externalDirFiles = new Map<string, Set<string>>();

  const handleEvents = (events: ParcelWatcher.Event[]) => {
    const changes: { type: 'added' | 'modified' | 'removed'; file: string }[] = [];
    for (const event of events) {
      const posixPath = toPosixPathNormalized(event.path);
      const lookupKey = toLookupKey(posixPath, isCaseSensitive);
      if (!isPathWatched(lookupKey, watchedFiles)) {
        continue;
      }

      const type =
        event.type === 'create' ? 'added' : event.type === 'delete' ? 'removed' : 'modified';
      changes.push({ type, file: posixPath });
    }

    if (changes.length > 0) {
      queue.addChanges(changes);
    }
  };

  const subscription = await parcelWatcher.subscribe(
    rootDirPosix,
    (err, events) => {
      if (!err) {
        handleEvents(events);
      }
    },
    {
      ignore: options?.ignored,
    },
  );

  const isCoveredByExistingExternal = (dirLookupKey: string): boolean => {
    for (const existingDir of extraSubscriptions.keys()) {
      if (dirLookupKey === existingDir || isPathInside(dirLookupKey, existingDir)) {
        return true;
      }
    }
    for (const pendingDir of pendingSubscriptions.keys()) {
      if (dirLookupKey === pendingDir || isPathInside(dirLookupKey, pendingDir)) {
        return true;
      }
    }

    return false;
  };

  const ensureExternalWatched = async (posixPath: string, lookupKey: string) => {
    if (isPathInside(lookupKey, rootDirLookupKey) || lookupKey === rootDirLookupKey) {
      return;
    }

    const dirPath = path.posix.dirname(posixPath);
    const dirKey = path.posix.dirname(lookupKey);
    let dirSet = externalDirFiles.get(dirKey);
    if (!dirSet) {
      dirSet = new Set<string>();
      externalDirFiles.set(dirKey, dirSet);
    }
    dirSet.add(lookupKey);

    if (isCoveredByExistingExternal(dirKey)) {
      return;
    }

    const subPromise = parcelWatcher.subscribe(
      dirPath,
      (err, events) => {
        if (!err) {
          handleEvents(events);
        }
      },
      {
        ignore: options?.ignored,
      },
    );

    pendingSubscriptions.set(dirKey, subPromise);

    try {
      const sub = await subPromise;
      if (externalDirFiles.has(dirKey) && !isCoveredByExistingExternal(dirKey)) {
        extraSubscriptions.set(dirKey, sub);

        // Subsume any nested child subscriptions that are now covered by this parent subscription
        for (const [childDir, childSub] of extraSubscriptions.entries()) {
          if (childDir !== dirKey && isPathInside(childDir, dirKey)) {
            extraSubscriptions.delete(childDir);
            void childSub.unsubscribe();
          }
        }
      } else {
        void sub.unsubscribe();
      }
    } catch {
      // Ignore subscription errors for missing or restricted external directories
    } finally {
      pendingSubscriptions.delete(dirKey);
    }
  };

  const buildWatcher: BuildWatcher = {
    [Symbol.asyncIterator]() {
      return this;
    },

    next() {
      return queue.next();
    },

    add(paths) {
      const targets = typeof paths === 'string' ? [paths] : paths;
      for (const file of targets) {
        const posixPath = toPosixPathNormalized(file);
        const lookupKey = toLookupKey(posixPath, isCaseSensitive);
        if (!watchedFiles.has(lookupKey)) {
          watchedFiles.add(lookupKey);
          void ensureExternalWatched(posixPath, lookupKey);
        }
      }
    },

    remove(paths) {
      const targets = typeof paths === 'string' ? [paths] : paths;
      for (const file of targets) {
        const posixPath = toPosixPathNormalized(file);
        const lookupKey = toLookupKey(posixPath, isCaseSensitive);
        if (watchedFiles.delete(lookupKey)) {
          if (!isPathInside(lookupKey, rootDirLookupKey) && lookupKey !== rootDirLookupKey) {
            const dirKey = path.posix.dirname(lookupKey);
            const dirSet = externalDirFiles.get(dirKey);
            if (dirSet) {
              dirSet.delete(lookupKey);
              if (dirSet.size === 0) {
                externalDirFiles.delete(dirKey);
                const sub = extraSubscriptions.get(dirKey);
                if (sub) {
                  extraSubscriptions.delete(dirKey);
                  void sub.unsubscribe();
                }
              }
            }
          }
        }
      }
    },

    async close() {
      try {
        if (subscription) {
          await subscription.unsubscribe();
        }
        if (pendingSubscriptions.size > 0) {
          await Promise.allSettled(Array.from(pendingSubscriptions.values()));
        }
        for (const sub of extraSubscriptions.values()) {
          await sub.unsubscribe();
        }
      } finally {
        extraSubscriptions.clear();
        pendingSubscriptions.clear();
        externalDirFiles.clear();
        queue.close();
      }
    },
  };

  return buildWatcher;
}

async function createChokidarWatcher(
  options?: WatcherOptions,
  chokidarModule?: typeof Chokidar,
): Promise<BuildWatcher> {
  const chokidar = chokidarModule ?? (await import('chokidar'));
  const watchedFiles = new Set<string>();
  const queue = new WatcherQueue();

  const rootDir = options?.cwd ?? process.cwd();
  const isCaseSensitive = isFileSystemCaseSensitive(rootDir);

  const watcher = chokidar.watch([], {
    ignoreInitial: true,
    ignored: options?.ignored,
    followSymlinks: options?.followSymlinks,
    usePolling: !!options?.polling,
    interval: options?.interval,
  });

  const handleEvent = (type: 'added' | 'modified' | 'removed', rawPath: string) => {
    const posixPath = toPosixPathNormalized(rawPath);
    const lookupKey = toLookupKey(posixPath, isCaseSensitive);
    if (!isPathWatched(lookupKey, watchedFiles)) {
      return;
    }

    queue.addChange(type, posixPath);
  };

  watcher.on('add', (path) => handleEvent('added', path));
  watcher.on('change', (path) => handleEvent('modified', path));
  watcher.on('unlink', (path) => handleEvent('removed', path));

  const buildWatcher: BuildWatcher = {
    [Symbol.asyncIterator]() {
      return this;
    },

    next() {
      return queue.next();
    },

    add(paths) {
      const targets = typeof paths === 'string' ? [paths] : paths;
      const newPaths: string[] = [];
      for (const p of targets) {
        const posixPath = toPosixPathNormalized(p);
        const lookupKey = toLookupKey(posixPath, isCaseSensitive);
        if (!watchedFiles.has(lookupKey)) {
          watchedFiles.add(lookupKey);
          newPaths.push(posixPath);
        }
      }
      if (newPaths.length > 0) {
        watcher.add(newPaths);
      }
    },

    remove(paths) {
      const targets = typeof paths === 'string' ? [paths] : paths;
      const removePaths: string[] = [];
      for (const p of targets) {
        const posixPath = toPosixPathNormalized(p);
        const lookupKey = toLookupKey(posixPath, isCaseSensitive);
        if (watchedFiles.has(lookupKey)) {
          watchedFiles.delete(lookupKey);
          removePaths.push(posixPath);
        }
      }
      if (removePaths.length > 0) {
        watcher.unwatch(removePaths);
      }
    },

    async close() {
      try {
        await watcher.close();
      } finally {
        queue.close();
      }
    },
  };

  return buildWatcher;
}
