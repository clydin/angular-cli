/**
 * @license
 * Copyright Google LLC All Rights Reserved.
 *
 * Use of this source code is governed by an MIT-style license that can be
 * found in the LICENSE file at https://angular.dev/license
 */

import type { PartialMessage } from 'esbuild';
import * as path from 'node:path';
import type { AngularCompilation } from '../../angular/compilation';
import type { CompilerPluginOptions } from './compiler-plugin';

export function createCompilerOptionsTransformer(
  setupWarnings: PartialMessage[] | undefined,
  pluginOptions: CompilerPluginOptions,
  preserveSymlinks: boolean | undefined,
  customConditions: string[] | undefined,
): Parameters<AngularCompilation['initialize']>[2] {
  return (compilerOptions) => {
    // target of 9 is ES2022 (using the number avoids an expensive import of typescript just for an enum)
    if (compilerOptions.target === undefined || compilerOptions.target < 9 /** ES2022 */) {
      // If 'useDefineForClassFields' is already defined in the users project leave the value as is.
      // Otherwise fallback to false due to https://github.com/microsoft/TypeScript/issues/45995
      // which breaks the deprecated `@Effects` NGRX decorator and potentially other existing code as well.
      compilerOptions.target = 9 /** ES2022 */;
      compilerOptions.useDefineForClassFields ??= false;

      // Only add the warning on the initial build
      setupWarnings?.push({
        text:
          `TypeScript compiler options 'target' and 'useDefineForClassFields' are set to 'ES2022' and ` +
          `'false' respectively by the Angular CLI.`,
        location: { file: pluginOptions.tsconfig },
        notes: [
          {
            text:
              'To control ECMA version and features use the Browserslist configuration. ' +
              'For more information, see https://angular.dev/tools/cli/build#configuring-browser-compatibility',
          },
        ],
      });
    }

    if (compilerOptions.compilationMode === 'partial') {
      setupWarnings?.push({
        text: 'Angular partial compilation mode is not supported when building applications.',
        location: null,
        notes: [{ text: 'Full compilation mode will be used instead.' }],
      });
      compilerOptions.compilationMode = 'full';
    }

    // Enable incremental compilation by default if caching is enabled and incremental is not explicitly disabled
    if (
      compilerOptions.incremental !== false &&
      pluginOptions.sourceFileCache?.persistentCachePath
    ) {
      compilerOptions.incremental = true;
      // Set the build info file location to the configured cache directory
      compilerOptions.tsBuildInfoFile = path.join(
        pluginOptions.sourceFileCache?.persistentCachePath,
        '.tsbuildinfo',
      );
    } else {
      compilerOptions.incremental = false;
    }

    if (compilerOptions.module === undefined || compilerOptions.module < 5 /** ES2015 */) {
      compilerOptions.module = 7; /** ES2022 */
      setupWarnings?.push({
        text: `TypeScript compiler options 'module' values 'CommonJS', 'UMD', 'System' and 'AMD' are not supported.`,
        location: null,
        notes: [{ text: `The 'module' option will be set to 'ES2022' instead.` }],
      });
    }

    if (compilerOptions.isolatedModules && compilerOptions.emitDecoratorMetadata) {
      setupWarnings?.push({
        text: `TypeScript compiler option 'isolatedModules' may prevent the 'emitDecoratorMetadata' option from emitting all metadata.`,
        location: null,
        notes: [
          {
            text:
              `The 'emitDecoratorMetadata' option is not required by Angular` +
              'and can be removed if not explictly required by the project.',
          },
        ],
      });
    }

    // Synchronize custom resolve conditions.
    // Set if using the supported bundler resolution mode (bundler is the default in new projects)
    if (
      compilerOptions.moduleResolution === 100 /* ModuleResolutionKind.Bundler */ ||
      compilerOptions.module === 200 /** ModuleKind.Preserve */
    ) {
      compilerOptions.customConditions = customConditions;
    }

    return {
      ...compilerOptions,
      noEmitOnError: false,
      composite: false,
      inlineSources: !!pluginOptions.sourcemap,
      inlineSourceMap: !!pluginOptions.sourcemap,
      sourceMap: undefined,
      mapRoot: undefined,
      sourceRoot: undefined,
      preserveSymlinks,
      externalRuntimeStyles: pluginOptions.externalRuntimeStyles,
      _enableHmr: !!pluginOptions.templateUpdates,
      supportTestBed: !!pluginOptions.includeTestMetadata,
      supportJitMode: !!pluginOptions.includeTestMetadata,
    };
  };
}
