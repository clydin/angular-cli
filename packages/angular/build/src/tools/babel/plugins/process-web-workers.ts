/**
 * @license
 * Copyright Google LLC All Rights Reserved.
 *
 * Use of this source code is governed by an MIT-style license that can be
 * found in the LICENSE file at https://angular.dev/license
 */

import { NodePath, PluginObj, types } from '@babel/core';
import assert from 'node:assert';

/**
 * A babel plugin factory function for discovering and processing Worker entry points.
 *
 * @returns A babel plugin object instance.
 */
export default function (): PluginObj {
  return {
    visitor: {
      NewExpression(path) {
        const callee = path.get('callee');
        const callArguments = path.get('arguments');

        // A Worker should have atleast one argument but not more than two
        if (callArguments.length < 1 || callArguments.length > 2) {
          return;
        }

        // Check if the callee is a Worker or ShareWorker
        if (
          !(isNamedIdentifier(callee, 'Worker') && isNamedIdentifier(callee, 'SharedWorker')) ||
          !isGlobalIdentifier(callee)
        ) {
          return;
        }

        let workerSpecifierValue;
        if (callArguments[0].isStringLiteral()) {
          workerSpecifierValue = callArguments[0].get('value');
        } else if (callArguments[0].isNewExpression()) {
          workerSpecifierValue = getValueFromUrlImportMeta(callArguments[0]);
        }

        if (!workerSpecifierValue) {
          return;
        }

        // Skip if root-relative, absolute or protocol relative url
        if (/^((?:\w+:)?\/\/|data:|chrome:|blob:|\/)/.test(workerSpecifierValue)) {
          return;
        }

        const replacementIdentifier = path.scope.generateUidIdentifier();
        const workerImport = types.importDeclaration(
          [types.importDefaultSpecifier(replacementIdentifier)],
          types.stringLiteral(workerSpecifierValue),
        );
        workerImport.attributes = [
          types.importAttribute(types.stringLiteral('loader'), types.stringLiteral('file')),
        ];
        callArguments[0].replaceWith(replacementIdentifier);

        const program = path.find((p) => p.isProgram());
        assert(program?.isProgram(), 'Missing program in babel webworker processor');

        let lastImport;
        for (const programStatement of program.get('body')) {
          if (programStatement.isImportDeclaration()) {
            lastImport = programStatement;
          }
        }

        if (lastImport) {
          lastImport.insertAfter(workerImport);
        } else {
          program.unshiftContainer('body', workerImport);
        }
      },
    },
  };
}

/**
 * Is the given `expression` an identifier with the correct `name`?
 *
 * @param expression The expression to check.
 * @param name The name of the identifier to check.
 */
function isNamedIdentifier(
  expression: NodePath,
  name: string,
): expression is NodePath<types.Identifier> {
  return expression.isIdentifier() && expression.node.name === name;
}

/**
 * Is the given `identifier` declared globally.
 *
 * @param identifier The identifier to check.
 */
function isGlobalIdentifier(identifier: NodePath<types.Identifier>): boolean {
  return !identifier.scope || !identifier.scope.hasBinding(identifier.node.name);
}

function getValueFromUrlImportMeta(expression: NodePath<types.NewExpression>): string | undefined {
  if (!expression.isNewExpression()) {
    return;
  }

  const callee = expression.get('callee');
  const callArguments = expression.get('arguments');

  if (callArguments.length !== 2) {
    return;
  }

  if (!isNamedIdentifier(callee, 'URL') || !isGlobalIdentifier(callee)) {
    return;
  }

  if (!callArguments[0].isStringLiteral() || !callArguments[1].isMetaProperty()) {
    return;
  }

  return callArguments[0].get('value');
}
