/**
 * @license
 * Copyright Google LLC All Rights Reserved.
 *
 * Use of this source code is governed by an MIT-style license that can be
 * found in the LICENSE file at https://angular.dev/license
 */

import type { EncodedSourceMap } from '@ampproject/remapping';
import remapping from '@ampproject/remapping';
import type { DeclarationScope } from '@angular/compiler-cli/linker';
import { FileLinker, LinkerEnvironment, needsLinking } from '@angular/compiler-cli/linker';
import type {
  AbsoluteFsPath,
  ReadonlyFileSystem,
} from '@angular/compiler-cli/src/ngtsc/file_system';
import type { Logger } from '@angular/compiler-cli/src/ngtsc/logging';
import MagicString from 'magic-string';
import { Visitor, parseSync } from 'oxc-parser';
import { loadInputSourceMap } from '../../../utils/source-map';
import { OxcAstHost } from './oxc-ast-host';
import { StringAstFactory } from './string-ast-factory';

class InlineDeclarationScope implements DeclarationScope<unknown, unknown> {
  getConstantScopeRef(): null {
    return null;
  }
}

const noopFileSystem: ReadonlyFileSystem = {
  exists: () => false,
  readFile: () => '',
  resolve: (...paths: string[]) => paths.join('/'),
  dirname: (path: string) => path.split('/').slice(0, -1).join('/'),
  relative: (_from: string, to: string) => to,
} as unknown as ReadonlyFileSystem;

const noopLogger: Logger = {
  level: 1,
  debug: () => {},
  info: () => {},
  warn: () => {},
  error: () => {},
};

export interface OxcLinkerOptions {
  sourcemap?: boolean;
  jit?: boolean;
}

/**
 * Executes Angular partial declaration linking on the specified JavaScript file
 * using `oxc-parser` and `magic-string`.
 *
 * @param filename The full path to the file.
 * @param code The source code content.
 * @param options Linker options (sourcemap, jit).
 * @returns An object containing the transformed code and optional source map.
 */
export function linkWithOxc(filename: string, code: string, options: OxcLinkerOptions = {}) {
  if (!needsLinking(filename, code)) {
    return { code, map: undefined };
  }

  const s = new MagicString(code);
  const astHost = new OxcAstHost();
  const astFactory = new StringAstFactory(code);

  const linkerEnvironment = LinkerEnvironment.create(
    noopFileSystem,
    noopLogger,
    astHost,
    astFactory,
    { linkerJitMode: options.jit ?? false },
  );

  const fileLinker = new FileLinker(linkerEnvironment, filename as AbsoluteFsPath, code);
  const declarationScope = new InlineDeclarationScope();

  const { program } = parseSync(filename, code, { range: true });
  let hasLinked = false;

  const visitor = new Visitor({
    CallExpression(node) {
      const calleeName = astHost.getSymbolName(node.callee);
      if (calleeName && fileLinker.isPartialDeclaration(calleeName)) {
        const args = astHost.parseArguments(node);
        const linkedCode = fileLinker.linkPartialDeclaration(calleeName, args, declarationScope);

        s.overwrite(node.start, node.end, linkedCode as string);
        hasLinked = true;
      }
    },
  });

  visitor.visit(program);

  if (!hasLinked) {
    return { code, map: undefined };
  }

  let map: string | undefined;
  if (options.sourcemap) {
    const rawMap = s.generateMap({ hires: true, source: filename });
    const inputMap = loadInputSourceMap(filename, code);
    if (inputMap) {
      map = remapping([rawMap as EncodedSourceMap, inputMap], () => null).toString();
    } else {
      map = rawMap.toString();
    }
  }

  return {
    code: s.toString(),
    map,
  };
}
