/**
 * @license
 * Copyright Google LLC All Rights Reserved.
 *
 * Use of this source code is governed by an MIT-style license that can be
 * found in the LICENSE file at https://angular.dev/license
 */

import type { Plugin, ResolveOptions } from 'esbuild';
import assert from 'node:assert';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { basename, dirname, join } from 'node:path';
import { LoadResultCache, createCachedLoad } from './load-result-cache';

/**
 * Options for the Angular WASM esbuild plugin
 * @see createWasmPlugin
 */
export interface WasmPluginOptions {
  /** Allow generation of async (proposal compliant) WASM imports. This requires zoneless to enable async/await. */
  allowAsync?: boolean;
  /** Load results cache. */
  cache?: LoadResultCache;
}

const WASM_INIT_NAMESPACE = 'angular:wasm:init';
const WASM_CONTENTS_NAMESPACE = 'angular:wasm:contents';
const WASM_RESOLVE_SYMBOL = Symbol('WASM_RESOLVE_SYMBOL');

// See: https://github.com/tc39/proposal-regexp-unicode-property-escapes/blob/fe6d07fad74cd0192d154966baa1e95e7cda78a1/README.md#other-examples
const ecmaIdentifierNameRegExp = /^(?:[$_\p{ID_Start}])(?:[$_\u200C\u200D\p{ID_Continue}])*$/u;

/**
 * Creates an esbuild plugin to use WASM files with import statements and expressions.
 * The default behavior follows the WebAssembly/ES mode integration proposal found at
 * https://github.com/WebAssembly/esm-integration/tree/main/proposals/esm-integration.
 * This behavior requires top-level await support which is only available in zoneless
 * Angular applications. A non-compliant synchronous behavior is also available to
 * applications using Zone.js by using the `sync: true` import attribute. This synchronous
 * behavior causes a default export of an initializer function to be available when
 * importing the WASM file.
 *
 * @returns An esbuild plugin.
 */
export function createWasmPlugin(options: WasmPluginOptions): Plugin {
  const { allowAsync = false } = options;

  return {
    name: 'angular-wasm',
    setup(build): void {
      build.onResolve({ filter: /.wasm$/ }, async (args) => {
        // Skip if already resolving the WASM file to avoid infinite resolution
        if (args.pluginData?.[WASM_RESOLVE_SYMBOL]) {
          return;
        }
        // Skip if not an import statement or expression
        if (args.kind !== 'import-statement' && args.kind !== 'dynamic-import') {
          return;
        }

        // When in the initialization namespace, the content has already been resolved
        // and only needs to be loaded for use with the initialization code.
        if (args.namespace === WASM_INIT_NAMESPACE) {
          return {
            namespace: WASM_CONTENTS_NAMESPACE,
            path: join(args.resolveDir, args.path),
            pluginData: args.pluginData,
          };
        }

        // Skip if a custom loader is defined
        if (build.initialOptions.loader?.['.wasm'] || args.with['loader']) {
          return;
        }

        // Attempt full resolution of the WASM file
        const resolveOptions: ResolveOptions & { path?: string } = {
          ...args,
          pluginData: { [WASM_RESOLVE_SYMBOL]: true },
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
          namespace: WASM_INIT_NAMESPACE,
        };
      });

      build.onLoad({ filter: /.wasm$/, namespace: WASM_INIT_NAMESPACE }, async (args) => {
        // Default to the WebAssembly/ES mode integration proposal behavior of async loading
        let sync = false;
        if (args.with.sync !== undefined) {
          if (args.with.sync !== 'true' && args.with.sync !== 'false') {
            return {
              errors: [
                { text: 'WASM "sync" import attribute value must be either "true" or "false"' },
              ],
            };
          }
          sync = args.with.sync === 'true';
        }

        // Ensure async mode is support if requested
        if (!sync && !allowAsync) {
          return {
            errors: [
              {
                text: 'WASM/ES module integration imports are not supported with Zone.js applications',
              },
            ],
          };
        }

        const wasmContents = await readFile(args.path);
        // Inline WASM code less than 10kB
        const inlineWasm = wasmContents.byteLength < 10_000;

        let initContents = `import ${inlineWasm ? 'wasmData' : 'wasmPath'} from ${JSON.stringify(basename(args.path))}`;
        initContents += inlineWasm ? ' with { loader: "binary" };' : ';\n\n';

        // Create initialization function
        initContents += generateInitFunction(!inlineWasm, wasmContents);

        if (sync) {
          // Export the initialize function in sync mode
          initContents += 'export default init;\n';
        } else {
          // Analyze WASM for imports and exports in async mode
          const wasm = await WebAssembly.compile(wasmContents);
          const importModuleNames = new Set(
            WebAssembly.Module.imports(wasm).map((value) => value.module),
          );
          const exportNames = WebAssembly.Module.exports(wasm).map((value) => value.name);
          // Ensure export names are valid JavaScript identifiers
          const invalidExportNames = exportNames.filter(
            (name) => !ecmaIdentifierNameRegExp.test(name),
          );
          if (invalidExportNames.length > 0) {
            return {
              errors: invalidExportNames.map((name) => ({
                text: 'WASM export names must be valid JavaScript identifiers',
                notes: [
                  {
                    text: `The export "${name}" is not valid. The WASM file should be updated to remove this error.`,
                  },
                ],
              })),
            };
          }

          // Add import statements and setup import object
          initContents += 'const importObject = Object.create(null);\n';
          let importIndex = 0;
          for (const moduleName of importModuleNames) {
            // Add a namespace import for each module name
            initContents += `import * as wasm_import_${++importIndex} from ${JSON.stringify(moduleName)};\n`;
            // Add the namespace object to the import object
            initContents += `importObject[${JSON.stringify(moduleName)}] = wasm_import_${importIndex};\n`;
          }

          // Instantiate the module
          initContents += 'const instance = await init(importObject);\n';

          // Add exports
          const exportNameList = exportNames.join(', ');
          initContents += `const { ${exportNameList} } = instance.exports;\n`;
          initContents += `export { ${exportNameList} }\n`;
        }

        return {
          contents: initContents,
          loader: 'js',
          resolveDir: dirname(args.path),
          pluginData: { wasmContents },
          watchFiles: [args.path],
        };
      });

      build.onLoad({ filter: /.wasm$/, namespace: WASM_CONTENTS_NAMESPACE }, async (args) => {
        const contents = args.pluginData.wasmContents ?? (await readFile(args.path));

        let loader: 'binary' | 'file' = 'file';
        if (args.with.loader) {
          assert(
            args.with.loader === 'binary' || args.with.loader === 'file',
            'WASM loader type should only be binary or file.',
          );
          loader = args.with.loader;
        }

        return {
          contents,
          loader,
          watchFiles: [args.path],
        };
      });
    },
  };
}

function generateInitFunction(streaming: boolean, wasmContents: Uint8Array) {
  let resultContents;
  if (streaming) {
    const fetchOptions = {
      integrity: 'sha256-' + createHash('sha-256').update(wasmContents).digest('base64'),
    };
    const fetchContents = `fetch(new URL(wasmPath, import.meta.url), ${JSON.stringify(fetchOptions)})`;
    resultContents = `await WebAssembly.instantiateStreaming(${fetchContents}, imports)`;
  } else {
    resultContents = 'await WebAssembly.instantiate(wasmData, imports)';
  }

  const contents = `
let mod;
async function init(imports) {
  if (mod) {
    return await WebAssembly.instantiate(mod, imports);
  }

  const result = ${resultContents};
  mod = result.module;

  return result.instance;
}
`;

  return contents;
}
