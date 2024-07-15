/**
 * @license
 * Copyright Google LLC All Rights Reserved.
 *
 * Use of this source code is governed by an MIT-style license that can be
 * found in the LICENSE file at https://angular.dev/license
 */

import type { Loader, Plugin, ResolveOptions } from 'esbuild';
import { readFile } from 'node:fs/promises';
import { basename, dirname, join } from 'node:path';

const SUPPORTED_LOADERS: Loader[] = ['binary', 'file', 'text'];

const IMAGE_INIT_NAMESPACE = 'angular:image:init';
const IMAGE_RESOLVE_SYMBOL = Symbol('IMAGE_RESOLVE_SYMBOL');

export function createLoaderImportAttributePlugin(): Plugin {
  return {
    name: 'angular-loader-import-attributes',
    setup(build) {
      build.onResolve({ filter: /\.(avif|webp)$/ }, async (args) => {
        if (args.with['loader'] !== 'file') {
          return;
        }

        // Skip if already resolving the image file to avoid infinite resolution
        if (args.pluginData?.[IMAGE_RESOLVE_SYMBOL]) {
          return;
        }

        // When in the initialization namespace, the content has already been resolved
        // and only needs to be loaded for use with the initialization code.
        if (args.namespace === IMAGE_INIT_NAMESPACE) {
          return {
            path: join(args.resolveDir, args.path),
            pluginData: args.pluginData,
          };
        }

        // Attempt full resolution of the WASM file
        const resolveOptions: ResolveOptions & { path?: string } = {
          ...args,
          pluginData: { [IMAGE_RESOLVE_SYMBOL]: true },
        };
        // The "path" property will cause an error if used in the resolve call
        delete resolveOptions.path;

        const result = await build.resolve(args.path, resolveOptions);

        // Skip if there are errors, is external, or another plugin resolves to a custom namespace
        if (result.errors.length > 0 || result.external || result.namespace !== 'file') {
          // Reuse already resolved result
          return result;
        }

        return {
          ...result,
          namespace: IMAGE_INIT_NAMESPACE,
        };
      });

      // Loader for image initialization code that adds metadata information to exports
      build.onLoad({ filter: /./, namespace: IMAGE_INIT_NAMESPACE }, async (args) => {
        let contents = `import imagePath from ${JSON.stringify(basename(args.path))} with { loader: "file" }\nexport default imagePath;\n`;

        // TODO: Calculate width and height

        contents += `const width = 50;\nconst height = 100;\nexport { width, height }\n`;

        return {
          contents,
          resolveDir: dirname(args.path),
          loader: 'js',
        };
      });

      // Loader for non-specific file types
      build.onLoad({ filter: /./ }, async (args) => {
        const loader = args.with['loader'] as Loader | undefined;
        if (!loader) {
          return undefined;
        }

        if (!SUPPORTED_LOADERS.includes(loader)) {
          return {
            errors: [
              {
                text: 'Unsupported loader import attribute',
                notes: [
                  { text: 'Attribute value must be one of: ' + SUPPORTED_LOADERS.join(', ') },
                ],
              },
            ],
          };
        }

        return {
          contents: await readFile(args.path),
          loader,
        };
      });
    },
  };
}
