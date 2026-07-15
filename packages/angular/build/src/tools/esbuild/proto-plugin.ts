/**
 * @license
 * Copyright Google LLC All Rights Reserved.
 *
 * Use of this source code is governed by an MIT-style license that can be
 * found in the LICENSE file at https://angular.dev/license
 */

import type { Loader, Plugin, ResolveOptions } from 'esbuild';
import { readFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { assertIsError } from '../../utils/error';
import { type LoadResultCache, createCachedLoad } from './load-result-cache';
import { SUPPORTED_LOADERS } from './loader-import-attribute-plugin';

const PROTO_RESOLVE_SYMBOL = Symbol('PROTO_RESOLVE_SYMBOL');

// Lazy-loaded instance of protobufjs
let protobufJs: typeof import('protobufjs') | undefined;

export interface ProtoPluginOptions {
  cache?: LoadResultCache;
}

/**
 * Creates an esbuild plugin to compile `.proto` files using `protobufjs`.
 * @param options The plugin options, including an optional load cache.
 * @returns An esbuild plugin.
 */
export function createProtoPlugin(options?: ProtoPluginOptions): Plugin {
  const cache = options?.cache;

  return {
    name: 'angular-proto',
    setup(build) {
      build.onResolve({ filter: /\.proto$/ }, async (args) => {
        // Skip if already resolving the proto file to avoid infinite resolution
        if (args.pluginData?.[PROTO_RESOLVE_SYMBOL]) {
          return undefined;
        }

        // Skip if a custom loader is defined for '.proto' in the initial options
        if (build.initialOptions.loader?.['.proto']) {
          return undefined;
        }

        // Skip if a standard fallback loader attribute is specified (e.g., with { loader: 'text' })
        const loader = args.with?.['loader'] as Loader | undefined;
        if (loader && SUPPORTED_LOADERS.includes(loader)) {
          return undefined;
        }

        // Resolve the absolute path of the proto file
        const resolveOptions: ResolveOptions & { path?: string } = {
          ...args,
          pluginData: {
            ...args.pluginData,
            [PROTO_RESOLVE_SYMBOL]: true,
          },
        };
        delete resolveOptions.path;

        const result = await build.resolve(args.path, resolveOptions);
        if (result.errors.length > 0) {
          return result;
        }

        return {
          ...result,
          namespace: 'proto-namespace',
        };
      });

      build.onLoad(
        { filter: /.*/, namespace: 'proto-namespace' },
        createCachedLoad(cache, async (args) => {
          try {
            protobufJs ??= await import('protobufjs');
          } catch {
            return {
              errors: [
                {
                  text: 'Unable to load the "protobufjs" package.',
                  location: null,
                  notes: [
                    {
                      text:
                        'Ensure that the "protobufjs" Node.js package is installed within the project. ' +
                        "If not present, installation via the project's package manager should resolve the error.",
                    },
                  ],
                },
              ],
            };
          }

          const protobuf = protobufJs;
          const root = new protobuf.Root();
          const watchFiles = new Set<string>();

          const loadRecursive = async (filePath: string) => {
            if (watchFiles.has(filePath)) {
              return;
            }
            watchFiles.add(filePath);

            const content = await readFile(filePath, 'utf8');
            const parsed = protobuf.parse(content, root);

            if (parsed.imports) {
              for (const importPath of parsed.imports) {
                const commonModule = protobuf.common.get(importPath);
                if (commonModule?.nested) {
                  root.addJSON(commonModule.nested);
                  continue;
                }

                const resolveResult = await build.resolve(importPath, {
                  resolveDir: dirname(filePath),
                  kind: 'import-statement',
                });
                if (resolveResult.errors.length > 0) {
                  throw new Error(
                    `Failed to resolve import "${importPath}": ${resolveResult.errors[0].text}`,
                  );
                }
                await loadRecursive(resolveResult.path);
              }
            }
          };

          try {
            await loadRecursive(args.path);
            const jsonDescriptor = root.toJSON();

            // Generate JavaScript module code that loads the JSON descriptor using protobufjs/light
            const contents = [
              `import protobuf from 'protobufjs/light';`,
              `const json = ${JSON.stringify(jsonDescriptor)};`,
              `const root = protobuf.Root.fromJSON(json);`,
              `export default root;`,
            ].join('\n');

            return {
              contents,
              loader: 'js',
              watchFiles: Array.from(watchFiles),
            };
          } catch (error) {
            assertIsError(error);

            return {
              errors: [
                {
                  text: `Protobuf compilation failed: ${error.message}`,
                  location: null,
                },
              ],
              watchFiles: Array.from(watchFiles),
            };
          }
        }),
      );
    },
  };
}
