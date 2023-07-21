/**
 * @license
 * Copyright Google LLC All Rights Reserved.
 *
 * Use of this source code is governed by an MIT-style license that can be
 * found in the LICENSE file at https://angular.dev/license
 */

import { type Metafile, build } from 'esbuild';
import assert from 'node:assert';
import { createHash } from 'node:crypto';
import { convertOutputFile } from '../../tools/esbuild/utils';
import { createVirtualModulePlugin } from '../../tools/esbuild/virtual-module-plugin';
import { type BuildOutputFile, BuildOutputFileType } from '../dev-server/internal';

/**
 * Preliminary preload runtime code.
 *
 * This currently provides a single function that adds a preload link element for
 * a given analyzer generated preload lookup table.
 */
const PRELOAD_RUNTIME = `
  const present = new Set();
  globalThis[Symbol.for('__ANGULAR_PRELOAD__')] = function(id) {
    const urls = table[id];
    if (urls) {
      for (const url of urls) {
        if (present.has(url)) continue;
        present.add(url);
        const link = document.createElement("link");
        link.href = url;
        link.rel = "modulepreload";
        document.head.appendChild(link);
      }
    }
  };
`;

function createPreloadId(sourcePath: string): string {
  return createHash('sha256').update(sourcePath).digest('base64').slice(0, 8);
}

function analyzePreloads(
  metafile: Metafile,
  initial: { has(key: string): boolean },
): Record<string, string[]> {
  const preloadTable: Record<string, string[]> = {};
  const eagerChunks = new Set<string>();

  for (const [file, outputEntry] of Object.entries(metafile.outputs)) {
    if (!outputEntry.entryPoint || !file.endsWith('.js')) {
      continue;
    }

    // Collect any eagerly loaded chunks and use this set to filter the runtime preload list.
    if (initial.has(file) || eagerChunks.has(file)) {
      for (const importEntry of outputEntry.imports) {
        if (importEntry.kind !== 'import-statement') {
          continue;
        }

        eagerChunks.add(importEntry.path);
      }

      continue;
    }

    // The value is an array to allow for transitive static imports to also be included.
    // This minimizes potential request cascades when the file is evaluated and used in the application.
    // NOTE: This is currently only a shallow list of imports.
    const chunks = [file];
    for (const importEntry of outputEntry.imports) {
      if (importEntry.kind !== 'import-statement' || eagerChunks.has(importEntry.path)) {
        continue;
      }

      chunks.push(importEntry.path);
    }

    // The identifier is based off the project relative path of the imported source file. The size is fixed to 8 characters.
    // Consumers of the preload runtime should perform the same identifier generation for any dynamically imported source files
    // that will be preloaded.
    const id = createPreloadId(outputEntry.entryPoint);
    assert(
      preloadTable[id] === undefined,
      `Invalid preload runtime identifier condition [${outputEntry.entryPoint}]`,
    );

    // Store the chunks that should be preloaded for a given identifier
    preloadTable[id] = chunks;
  }

  // Post-filter entries since all eager chunks may not have been discovered prior to a preload entry
  for (const [id, chunks] of Object.entries(preloadTable)) {
    preloadTable[id] = chunks.filter((chunk) => !eagerChunks.has(chunk));
  }

  return preloadTable;
}

export async function generatePreloadRuntime(
  metafile: Metafile,
  initial: { has(key: string): boolean },
  minify: boolean,
  entryNames: string,
): Promise<BuildOutputFile | undefined> {
  const preloadTable = analyzePreloads(metafile, initial);

  // If there are no entries then the preload runtime is not needed
  if (Object.keys(preloadTable).length === 0) {
    return;
  }

  // Generate the complete preload runtime code with table entries
  const preloadCode = `const table = ${JSON.stringify(
    preloadTable,
    null,
    2,
  )};\n${PRELOAD_RUNTIME}\n`;

  // Generate the final output runtime code based on provided application options
  const output = await build({
    write: false,
    minify,
    // `outdir` is required otherwise the output file name is the literal `<stdout>`
    outdir: '/',
    entryNames,
    entryPoints: { 'ngplr': 'angular:preload-runtime' },
    plugins: [
      createVirtualModulePlugin({
        namespace: 'angular:preload-runtime',
        loadContent() {
          return {
            contents: preloadCode,
            loader: 'js',
          };
        },
      }),
    ],
  });

  assert(
    output.outputFiles.length === 1,
    'Preload runtime generation should only have one output file.',
  );
  const outputFile = output.outputFiles[0];

  // Remove leading slash due to required `outdir` esbuild option (set to `/`)
  outputFile.path = outputFile.path.slice(1);

  return convertOutputFile(outputFile, BuildOutputFileType.Browser);
}
