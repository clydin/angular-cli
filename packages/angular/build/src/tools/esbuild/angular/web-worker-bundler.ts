/**
 * @license
 * Copyright Google LLC All Rights Reserved.
 *
 * Use of this source code is governed by an MIT-style license that can be
 * found in the LICENSE file at https://angular.dev/license
 */

import type { BuildFailure, PluginBuild } from 'esbuild';
import type { CompilerPluginOptions } from './compiler-plugin';

export function bundleWebWorker(
  build: PluginBuild,
  pluginOptions: CompilerPluginOptions,
  workerFile: string,
) {
  try {
    return build.esbuild.buildSync({
      ...build.initialOptions,
      platform: 'browser',
      write: false,
      bundle: true,
      metafile: true,
      format: 'esm',
      entryNames: 'worker-[hash]',
      entryPoints: [workerFile],
      sourcemap: pluginOptions.sourcemap,
      // Zone.js is not used in Web workers so no need to disable
      supported: undefined,
      // Plugins are not supported in sync esbuild calls
      plugins: undefined,
    });
  } catch (error) {
    if (error && typeof error === 'object' && 'errors' in error && 'warnings' in error) {
      return error as BuildFailure;
    }
    throw error;
  }
}
