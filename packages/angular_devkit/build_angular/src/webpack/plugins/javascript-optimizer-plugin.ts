/**
 * @license
 * Copyright Google LLC All Rights Reserved.
 *
 * Use of this source code is governed by an MIT-style license that can be
 * found in the LICENSE file at https://angular.io/license
 */

import { Worker } from 'worker_threads';
import { maxWorkers } from '../../utils/environment-options';

/**
 * The maximum number of Workers that will be created to execute optimize requests.
 */
const MAX_OPTIMIZE_WORKERS = maxWorkers;

const PLUGIN_NAME = 'angular-esbuild-optimizer';

export interface JavaScriptOptimizerOptions {
  advanced: boolean;
  define: Record<string, string | number | boolean>;
  sourcemap: boolean;
  target: 'es5' | 'es2015';
  keepNames: boolean;
  removeLicenses: boolean;
}

export class JavaScriptOptimizer {
  private workers: Worker[] = [];

  constructor(public options: Partial<JavaScriptOptimizerOptions> = {}) {}

  apply(compiler: import('webpack').Compiler) {
    const { OriginalSource, SourceMapSource } = compiler.webpack.sources;

    compiler.hooks.compilation.tap(PLUGIN_NAME, (compilation) => {
      compilation.hooks.processAssets.tapAsync(
        {
          name: PLUGIN_NAME,
          stage: compiler.webpack.Compilation.PROCESS_ASSETS_STAGE_OPTIMIZE_SIZE,
        },
        (compilationAssets, callback) => {
          const scriptsToOptimize = [];
          for (const assetName of Object.keys(compilationAssets)) {
            if (assetName.endsWith('.js')) {
              const scriptAsset = compilation.getAsset(assetName);
              if (scriptAsset && !scriptAsset.info.minimized) {
                const { source, map } = scriptAsset.source.sourceAndMap();
                scriptsToOptimize.push({
                  name: scriptAsset.name,
                  code: typeof source === 'string' ? source : source.toString(),
                  map,
                });
              }
            }
          }

          if (scriptsToOptimize.length === 0) {
            callback();

            return;
          }

          let define: Record<string, string> | undefined;
          if (this.options.define) {
            define = {};
            for (const [key, value] of Object.entries(this.options.define)) {
              define[key] = String(value);
            }
          }
          const optimizeOptions = {
            sourcemap: this.options.sourcemap,
            define,
            keepNames: this.options.keepNames,
            target: Number((this.options.target ?? 'es2015').slice(2)),
            removeLicenses: this.options.removeLicenses,
            advanced: this.options.advanced,
          };

          let completionCount = 0;

          scriptsToOptimize.sort((a, b) => a.code.length - b.code.length);

          for (let i = 0; i < scriptsToOptimize.length; ++i) {
            if (this.workers.length < MAX_OPTIMIZE_WORKERS) {
              this.workers[this.workers.length] = this.createWorker(
                (name, code, map) => {
                  completionCount++;
                  try {
                    let optimizedAsset;
                    if (map) {
                      optimizedAsset = new SourceMapSource(code, name, map);
                    } else {
                      optimizedAsset = new OriginalSource(code, name);
                    }
                    compilation.updateAsset(name, optimizedAsset, { minimized: true });
                  } finally {
                    if (completionCount >= scriptsToOptimize.length) {
                      this.close();
                      callback();
                    }
                  }
                },
                (name, error) => {
                  completionCount++;
                  try {
                    const optimizationError = new compiler.webpack.WebpackError(
                      `Optimization error [${name}]: ${error.stack || error.message}`,
                    );
                    compilation.errors.push(optimizationError);
                  } finally {
                    if (completionCount >= scriptsToOptimize.length) {
                      this.close();
                      callback();
                    }
                  }
                },
              );
            }

            const { name, code, map } = scriptsToOptimize[i];
            this.workers[i % MAX_OPTIMIZE_WORKERS].postMessage({
              asset: {
                name,
                code,
                map,
              },
              options: optimizeOptions,
            });
          }
        },
      );
    });
  }

  private createWorker(
    resultCallback: (name: string, code: string, map?: string) => void,
    errorCallback: (name: string, error: Error) => void,
  ): Worker {
    const workerPath = require.resolve('./javascript-optimizer-worker');
    const worker = new Worker(workerPath);

    worker.on('message', (response) => {
      if (response.result) {
        resultCallback(response.name, response.result.code, response.result.map);
      } else {
        errorCallback(response.name, response.error);
      }
    });

    worker.on('error', (error) => {
      errorCallback('<internal>', error);
    });

    return worker;
  }

  private close() {
    for (const worker of this.workers) {
      try {
        void worker.terminate();
      } catch {}
    }
  }
}
