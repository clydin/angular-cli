/**
 * @license
 * Copyright Google LLC All Rights Reserved.
 *
 * Use of this source code is governed by an MIT-style license that can be
 * found in the LICENSE file at https://angular.io/license
 */

import { transform } from 'esbuild';
import { minify } from 'terser';
import { sources } from 'webpack';
import { parentPort } from 'worker_threads';

/**
 * A request to optimize JavaScript using the supplied options.
 */
interface OptimizeRequestMessage {
  /**
   * The options to use when optimizing.
   */
  options: {
    advanced: boolean;
    define?: Record<string, string>;
    keepNames: boolean;
    removeLicenses: boolean;
    sourcemap: boolean;
    target: 5 | 2015;
  };

  /**
   * The JavaScript asset to optimize.
   */
  asset: {
    name: string;
    code: string;
    map: string;
  };
}

if (!parentPort) {
  throw new Error('Optimize worker must be executed as a Worker.');
}

// eslint-disable-next-line @typescript-eslint/no-misused-promises
parentPort.on('message', async ({ asset, options }: OptimizeRequestMessage) => {
  try {
    const esbuildResult = await transform(asset.code, {
      minifyIdentifiers: !options.keepNames,
      minifySyntax: true,
      // NOTE: Disabling whitespace ensures unused pure annotations are kept
      minifyWhitespace: false,
      legalComments: options.removeLicenses ? 'none' : 'inline',
      sourcefile: asset.name,
      sourcemap: options.sourcemap,
      define: options.define,
      keepNames: options.keepNames,
      target: `es${options.target}`,
    });

    let map;
    if (asset.map && esbuildResult.map) {
      map = new sources.SourceMapSource(
        esbuildResult.code,
        asset.name,
        esbuildResult.map,
        asset.code,
        asset.map,
        true,
      ).map();
    }

    const terserResult = await optimizeWithTerser(
      asset.name,
      esbuildResult.code,
      options.sourcemap,
      // TODO: Investigate why this fails for some packages: wco.supportES2015 ? 2015 : 5;
      5,
      options.advanced,
    );

    if (map && terserResult.map) {
      map = new sources.SourceMapSource(
        terserResult.code,
        asset.name,
        terserResult.map,
        esbuildResult.code,
        map,
        true,
      ).map();
    }

    parentPort?.postMessage({ name: asset.name, result: { code: terserResult.code, map } });
  } catch (error) {
    parentPort?.postMessage({ name: asset.name, error });
  }
});

async function optimizeWithTerser(
  name: string,
  code: string,
  sourcemaps: boolean,
  target: 5 | 2015,
  advanced: boolean,
): Promise<{ code: string; map?: object }> {
  const result = await minify(
    { [name]: code },
    {
      compress: {
        passes: advanced ? 3 : 1,
        pure_funcs: ['forwardRef'],
        pure_getters: advanced,
      },
      ecma: target,
      mangle: false,
      safari10: true,
      format: {
        ascii_only: true,
        webkit: true,
        wrap_func_args: false,
      },
      sourceMap:
        sourcemaps &&
        ({
          asObject: true,
          // typings don't include asObject option
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
        } as any),
    },
  );

  if (!result.code) {
    throw new Error('Terser failed for unknown reason.');
  }

  return { code: result.code, map: result.map as object };
}
