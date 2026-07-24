/**
 * @license
 * Copyright Google LLC All Rights Reserved.
 *
 * Use of this source code is governed by an MIT-style license that can be
 * found in the LICENSE file at https://angular.dev/license
 */

import type { Loader, OnLoadResult, PartialMessage } from 'esbuild';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import type { Cache as PersistentCacheStore } from './cache';
import { LoadResultCache, MemoryLoadResultCache } from './load-result-cache';

/**
 * Serialized representation of any esbuild load result stored in persistent cache.
 */
export interface CachedLoadResultEntry {
  /** Compiled output string or binary data */
  contents: string | Uint8Array;

  /** esbuild loader type */
  loader?: Loader;

  /** Absolute paths of all imported/watched dependency files */
  watchFiles: string[];

  /** Map of watchFile absolute paths to content hashes */
  watchFilesHashes: Record<string, string>;

  /** Warnings emitted during load processing */
  warnings?: PartialMessage[];

  /** Errors emitted during load processing */
  errors?: PartialMessage[];
}

function hashContent(content: string | Uint8Array): string {
  return createHash('sha256').update(content).digest('hex');
}

/**
 * Calculates a unique cache key by updating the hash incrementally.
 * This prevents implicit string coercion of large binary content buffers.
 */
function calculateCacheKey(
  globalConfigHash: string,
  path: string,
  content: string | Uint8Array,
): string {
  return createHash('sha256').update(globalConfigHash).update(path).update(content).digest('hex');
}

/**
 * Validates that all imported watch files exist on disk and their content hashes match.
 * Processes files in parallel chunks of 8 to avoid exhausting file descriptors.
 */
async function isCacheEntryValid(watchFilesHashes: Record<string, string>): Promise<boolean> {
  const watchFiles = Object.keys(watchFilesHashes);
  const concurrencyLimit = 8;

  for (let i = 0; i < watchFiles.length; i += concurrencyLimit) {
    const chunk = watchFiles.slice(i, i + concurrencyLimit);
    const results = await Promise.all(
      chunk.map(async (filePath) => {
        try {
          const currentContent = await readFile(filePath);

          return hashContent(currentContent) === watchFilesHashes[filePath];
        } catch {
          return false;
        }
      }),
    );

    if (results.some((isValid) => !isValid)) {
      return false;
    }
  }

  return true;
}

/**
 * Computes hashes for an array of watch file paths.
 * Processes files in parallel chunks of 8 to avoid exhausting file descriptors.
 */
async function computeHashesForWatchFiles(watchFiles: string[]): Promise<Record<string, string>> {
  const watchFilesHashes: Record<string, string> = {};
  const concurrencyLimit = 8;

  for (let i = 0; i < watchFiles.length; i += concurrencyLimit) {
    const chunk = watchFiles.slice(i, i + concurrencyLimit);
    await Promise.all(
      chunk.map(async (filePath) => {
        try {
          const content = await readFile(filePath);
          watchFilesHashes[filePath] = hashContent(content);
        } catch {
          // Ignore unreadable files
        }
      }),
    );
  }

  return watchFilesHashes;
}

export class PersistentLoadResultCache implements LoadResultCache {
  private readonly memoryCache = new MemoryLoadResultCache();

  constructor(
    private readonly persistentStore?: PersistentCacheStore<CachedLoadResultEntry>,
    private readonly globalConfigHash: string = '',
  ) {}

  /**
   * Retrieves a load result from cache.
   * Checks L1 memory cache first for immediate watch-mode speed, falling back to L2 persistent disk
   * store on L1 cache miss. L2 persistent cache entries are validated against dependency content hashes.
   */
  async get(path: string): Promise<OnLoadResult | undefined> {
    // 1. Check L1 Memory Cache
    const memoryResult = this.memoryCache.get(path);
    if (memoryResult) {
      return memoryResult;
    }

    if (!this.persistentStore) {
      return undefined;
    }

    // 2. Check L2 Persistent Disk Cache
    let content: string | Uint8Array;
    const filePath = path.startsWith('file:') ? path.slice(5) : path;
    try {
      content = await readFile(filePath);
    } catch {
      return undefined;
    }

    const cacheKey = calculateCacheKey(this.globalConfigHash, path, content);
    const cached = await this.persistentStore.get(cacheKey);

    if (cached && (await isCacheEntryValid(cached.watchFilesHashes))) {
      const result: OnLoadResult = {
        contents: cached.contents,
        loader: cached.loader,
        watchFiles: cached.watchFiles,
        warnings: cached.warnings,
        errors: cached.errors,
      };

      // Populate L1 Memory Cache for subsequent lookups
      await this.memoryCache.put(path, result);

      return result;
    }

    return undefined;
  }

  /**
   * Stores a load result in both L1 memory cache and L2 persistent disk store.
   */
  async put(path: string, result: OnLoadResult): Promise<void> {
    await this.memoryCache.put(path, result);

    if (this.persistentStore && result.contents) {
      let content: string | Uint8Array;
      const filePath = path.startsWith('file:') ? path.slice(5) : path;
      try {
        content = await readFile(filePath);
      } catch {
        content = '';
      }

      const cacheKey = calculateCacheKey(this.globalConfigHash, path, content);
      const watchFilesHashes = await computeHashesForWatchFiles(result.watchFiles ?? []);

      await this.persistentStore.put(cacheKey, {
        contents: result.contents,
        loader: result.loader,
        watchFiles: result.watchFiles ?? [],
        watchFilesHashes,
        warnings: result.warnings,
        errors: result.errors,
      });
    }
  }

  /**
   * Invalidates cached entries affected by a modified dependency file during watch mode.
   *
   * Note: Invalidation of L1 memory cache is sufficient for active watch mode.
   * Cross-process/cold start stale entries in L2 persistent store are automatically handled
   * during `get()` via dependency content hash verification (`isCacheEntryValid`).
   */
  invalidate(path: string): boolean {
    return this.memoryCache.invalidate(path);
  }

  get watchFiles(): ReadonlyArray<string> {
    return this.memoryCache.watchFiles;
  }
}
