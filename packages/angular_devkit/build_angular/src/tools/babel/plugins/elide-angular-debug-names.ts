/**
 * @license
 * Copyright Google LLC All Rights Reserved.
 *
 * Use of this source code is governed by an MIT-style license that can be
 * found in the LICENSE file at https://angular.io/license
 */

import { PluginObj, types } from '@babel/core';

/**
 * A babel plugin factory function for eliding Angular signal and inject token debug names.
 *
 * @returns A babel plugin object instance.
 */
export default function (): PluginObj {
  return {
    visitor: {
      CallExpression(path) {
        const callee = path.get('callee');

        let calleeName;
        if (callee.isMemberExpression()) {
          const calleeProperty = callee.get('property');
          if (calleeProperty.isIdentifier()) {
            calleeName = calleeProperty.node.name;
          }
        } else if (callee.isIdentifier()) {
          calleeName = callee.node.name;
        }

        if (!calleeName) {
          return;
        }

        // TODO: Use scope to find imported name
        if (calleeName !== 'signal') {
          return;
        }

        const callArguments = path.get('arguments');

        if (callArguments.length !== 2 || !callArguments[1].isObjectExpression()) {
          return;
        }

        const signalOptionsProperties = callArguments[1].get('properties');
        for (const property of signalOptionsProperties) {
          if (!property.isObjectProperty()) {
            continue;
          }

          if (property.get('key').isIdentifier({ name: 'debugName' })) {
            if (signalOptionsProperties.length === 1) {
              callArguments[1].remove();
            } else {
              property.remove();
            }
            break;
          }
        }
      },
      NewExpression(path) {
        const callee = path.get('callee');

        let calleeName;
        if (callee.isMemberExpression()) {
          const calleeProperty = callee.get('property');
          if (calleeProperty.isIdentifier()) {
            calleeName = calleeProperty.node.name;
          }
        } else if (callee.isIdentifier()) {
          calleeName = callee.node.name;
        }

        if (!calleeName) {
          return;
        }

        // TODO: Use scope to find imported name
        if (calleeName !== 'InjectionToken') {
          return;
        }

        const callArguments = path.get('arguments');

        if (callArguments.length < 1 || callArguments.length > 2) {
          return;
        }

        const tokenNameArgument = callArguments[0];

        if (tokenNameArgument.isStringLiteral() && tokenNameArgument.node.value.length > 0) {
          tokenNameArgument.node.value = '';
        } else if (tokenNameArgument.isExpression() && tokenNameArgument.isPure()) {
          tokenNameArgument.replaceWith(types.stringLiteral(''));
        }
      },
    },
  };
}
