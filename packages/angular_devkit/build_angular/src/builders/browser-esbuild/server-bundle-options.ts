/**
 * @license
 * Copyright Google LLC All Rights Reserved.
 *
 * Use of this source code is governed by an MIT-style license that can be
 * found in the LICENSE file at https://angular.io/license
 */

import type { BuildOptions, Plugin } from 'esbuild';
import assert from 'node:assert';
import { pathToFileURL } from 'url';
import { SourceFileCache } from './compiler-plugin';
import { NormalizedBrowserOptions } from './options';

export function createServerCodeBundleOptions(
  options: NormalizedBrowserOptions,
  sourceFileCache: SourceFileCache,
): BuildOptions {
  const {
    workspaceRoot,
    serverEntryPoint,
    optimizationOptions,
    sourcemapOptions,
    tsconfig,
    outputNames,
    externalDependencies,
    preserveSymlinks,
    fileReplacements,
  } = options;

  assert(
    serverEntryPoint,
    'createServerCodeBundleOptions should not be called without a defined serverEntryPoint.',
  );

  return {
    absWorkingDir: workspaceRoot,
    bundle: true,
    // format: 'esm',
    entryPoints: {
      'server': serverEntryPoint,
    },
    entryNames: outputNames.bundles,
    assetNames: outputNames.media,
    target: ['node14', 'node16', 'node18'],
    mainFields: ['es2020', 'module', 'main'],
    conditions: ['es2020', 'es2015', 'module'],
    resolveExtensions: ['.ts', '.tsx', '.mjs', '.js'],
    metafile: true,
    legalComments: options.extractLicenses ? 'none' : 'eof',
    logLevel: options.verbose ? 'debug' : 'silent',
    minify: optimizationOptions.scripts,
    pure: ['forwardRef'],
    outdir: workspaceRoot,
    sourcemap: sourcemapOptions.scripts && (sourcemapOptions.hidden ? 'external' : true),
    // splitting: true,
    tsconfig,
    external: externalDependencies,
    write: false,
    platform: 'node',
    preserveSymlinks,
    plugins: [createCacheProxyPlugin(sourceFileCache, fileReplacements)],
    define: {
      // Only set to false when script optimizations are enabled. It should not be set to true because
      // Angular turns `ngDevMode` into an object for development debugging purposes when not defined
      // which a constant true value would break.
      ...(optimizationOptions.scripts ? { 'ngDevMode': 'false' } : undefined),
      // Only AOT mode is supported currently
      'ngJitMode': 'false',
    },
  };
}

function createCacheProxyPlugin(
  sourceFileCache: SourceFileCache,
  fileReplacements?: Record<string, string>,
): Plugin {
  return {
    name: 'angular-cache-proxy',
    setup(build) {
      build.onLoad({ filter: /\.[cm]?[jt]sx?$/ }, async (args) => {
        const request = fileReplacements?.[args.path] ?? args.path;

        let contents = sourceFileCache.typeScriptFileCache.get(pathToFileURL(request).href);

        contents ??= sourceFileCache.babelFileCache.get(args.path);

        if (contents === undefined) {
          // throw new Error('File should always be present in the cache: ' + args.path);

          return null;
        }

        return {
          contents,
          loader: 'js',
        };
      });
    },
  };
}
