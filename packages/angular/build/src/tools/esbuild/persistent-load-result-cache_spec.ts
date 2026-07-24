/**
 * @license
 * Copyright Google LLC All Rights Reserved.
 *
 * Use of this source code is governed by an MIT-style license that can be
 * found in the LICENSE file at https://angular.dev/license
 */

import type { OnLoadResult } from 'esbuild';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { Cache as PersistentCacheStore } from './cache';
import {
  type CachedLoadResultEntry,
  PersistentLoadResultCache,
} from './persistent-load-result-cache';

describe('PersistentLoadResultCache', () => {
  let mockStore: Map<string, CachedLoadResultEntry>;
  let persistentStore: PersistentCacheStore<CachedLoadResultEntry>;
  let tmpDir: string;
  let file1: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()), 'persistent-cache-test-'));
    file1 = path.join(tmpDir, 'test.js');
    fs.writeFileSync(file1, 'console.log("hello");');

    mockStore = new Map();
    persistentStore = {
      async get(key: string) {
        return mockStore.get(key);
      },
      async put(key: string, value: CachedLoadResultEntry) {
        mockStore.set(key, value);
      },
    } as unknown as PersistentCacheStore<CachedLoadResultEntry>;
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('should return undefined on L1 and L2 cache miss', async () => {
    const cache = new PersistentLoadResultCache(persistentStore, 'global-hash');
    const result = await cache.get(file1);
    expect(result).toBeUndefined();
  });

  it('should hit L2 persistent store and return cached output when dependencies are valid', async () => {
    const cache = new PersistentLoadResultCache(persistentStore, 'global-hash');
    const sampleResult: OnLoadResult = {
      contents: 'console.log("hello");',
      loader: 'js',
      watchFiles: [file1],
    };

    await cache.put(file1, sampleResult);

    // Create a second cache instance (simulating cold start)
    const coldCache = new PersistentLoadResultCache(persistentStore, 'global-hash');
    const hit = await coldCache.get(file1);

    expect(hit).toBeDefined();
    expect(hit?.contents).toBe('console.log("hello");');
    expect(hit?.loader).toBe('js');
  });

  it('should invalidate L2 persistent cache hit if a watch dependency file is modified', async () => {
    const cache = new PersistentLoadResultCache(persistentStore, 'global-hash');
    const sampleResult: OnLoadResult = {
      contents: 'console.log("hello");',
      loader: 'js',
      watchFiles: [file1],
    };

    await cache.put(file1, sampleResult);

    // Modify dependency file
    fs.writeFileSync(file1, 'console.log("world");');

    const coldCache = new PersistentLoadResultCache(persistentStore, 'global-hash');
    const hit = await coldCache.get(file1);

    expect(hit).toBeUndefined();
  });
});
