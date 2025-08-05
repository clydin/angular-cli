/**
 * @license
 * Copyright Google LLC All Rights Reserved.
 *
 * Use of this source code is governed by an MIT-style license that can be
 * found in the LICENSE file at https://angular.dev/license
 */

/**
 * @fileoverview This file contains transformers dedicated to converting Jasmine's spying
 * functionality to Vitest's mocking APIs. It handles the creation of spies (`spyOn`,
 * `createSpy`, `createSpyObj`), spy strategies (`and.returnValue`, `and.callFake`),
 * and the inspection of spy calls (`spy.calls.reset`, `spy.calls.mostRecent`).
 */

import ts from '../../../third_party/github.com/Microsoft/TypeScript/lib/typescript';
import { createPropertyAccess, createViCallExpression } from '../utils/ast-helpers';
import { getJasmineMethodName, isJasmineCallExpression } from '../utils/ast-validation';
import { addTodoComment } from '../utils/comment-helpers';
import { RefactorReporter } from '../utils/refactor-reporter';

export function transformSpies(node: ts.Node, reporter: RefactorReporter): ts.Node {
  if (!ts.isCallExpression(node)) {
    return node;
  }

  if (
    ts.isIdentifier(node.expression) &&
    (node.expression.text === 'spyOn' || node.expression.text === 'spyOnProperty')
  ) {
    return ts.factory.updateCallExpression(
      node,
      createPropertyAccess('vi', 'spyOn'),
      node.typeArguments,
      node.arguments,
    );
  }

  if (ts.isPropertyAccessExpression(node.expression)) {
    const pae = node.expression;

    if (
      ts.isPropertyAccessExpression(pae.expression) &&
      ts.isIdentifier(pae.expression.name) &&
      pae.expression.name.text === 'and'
    ) {
      const spyCall = pae.expression.expression;
      let newMethodName: string | undefined;
      if (ts.isIdentifier(pae.name)) {
        switch (pae.name.text) {
          case 'returnValue':
            newMethodName = 'mockReturnValue';
            break;
          case 'resolveTo':
            newMethodName = 'mockResolvedValue';
            break;
          case 'rejectWith':
            newMethodName = 'mockRejectedValue';
            break;
          case 'returnValues': {
            const returnValues = node.arguments;
            if (returnValues.length === 0) {
              // No values, so it's a no-op. Just transform the spyOn call.
              return transformSpies(spyCall, reporter);
            }
            // spy.and.returnValues(a, b) -> spy.mockReturnValueOnce(a).mockReturnValueOnce(b)
            let chainedCall: ts.Expression = spyCall;
            for (const value of returnValues) {
              const mockCall = ts.factory.createCallExpression(
                createPropertyAccess(chainedCall, 'mockReturnValueOnce'),
                undefined,
                [value],
              );
              chainedCall = mockCall;
            }

            return chainedCall;
          }
          case 'callFake':
            newMethodName = 'mockImplementation';
            break;
          case 'callThrough':
            return transformSpies(spyCall, reporter); // .and.callThrough() is redundant, just transform spyOn.
          case 'stub': {
            const newExpression = createPropertyAccess(spyCall, 'mockImplementation');
            const arrowFn = ts.factory.createArrowFunction(
              undefined,
              undefined,
              [],
              undefined,
              ts.factory.createToken(ts.SyntaxKind.EqualsGreaterThanToken),
              ts.factory.createBlock([], /* multiline */ true),
            );

            return ts.factory.createCallExpression(newExpression, undefined, [arrowFn]);
          }
          case 'throwError': {
            const errorArg = node.arguments[0];
            const throwStatement = ts.factory.createThrowStatement(
              ts.isNewExpression(errorArg)
                ? errorArg
                : ts.factory.createNewExpression(
                    ts.factory.createIdentifier('Error'),
                    undefined,
                    node.arguments,
                  ),
            );
            const arrowFunction = ts.factory.createArrowFunction(
              undefined,
              undefined,
              [],
              undefined,
              ts.factory.createToken(ts.SyntaxKind.EqualsGreaterThanToken),
              ts.factory.createBlock([throwStatement], true),
            );
            const newExpression = createPropertyAccess(spyCall, 'mockImplementation');

            return ts.factory.createCallExpression(newExpression, undefined, [arrowFunction]);
          }
          default:
            reporter.recordTodo('unsupported-spy-strategy');
            addTodoComment(
              node,
              `Unsupported spy strategy ".and.${pae.name.text}()" found. Please migrate this manually.`,
            );
        }
      }

      if (newMethodName) {
        const newExpression = createPropertyAccess(spyCall, newMethodName);

        return ts.factory.updateCallExpression(
          node,
          newExpression,
          node.typeArguments,
          node.arguments,
        );
      }
    }
  }

  const jasmineMethodName = getJasmineMethodName(node);
  switch (jasmineMethodName) {
    case 'createSpy':
      // jasmine.createSpy(name, originalFn) -> vi.fn(originalFn)
      return createViCallExpression('fn', node.arguments.length > 1 ? [node.arguments[1]] : []);
    case 'spyOnAllFunctions':
      reporter.recordTodo('spyOnAllFunctions');
      addTodoComment(
        node,
        'Vitest does not have a direct equivalent for jasmine.spyOnAllFunctions().' +
          ' Please spy on individual methods manually using vi.spyOn().',
      );

      return node;
  }

  return node;
}

export function transformCreateSpyObj(node: ts.Node, reporter: RefactorReporter): ts.Node {
  if (!isJasmineCallExpression(node, 'createSpyObj')) {
    return node;
  }

  if (node.arguments.length < 2) {
    reporter.recordTodo('createSpyObj-single-argument');
    addTodoComment(
      node,
      'jasmine.createSpyObj called with a single argument is not supported for transformation.',
    );

    return node;
  }

  const methods = node.arguments[1];
  const propertiesArg = node.arguments[2];
  let properties: ts.PropertyAssignment[] = [];

  if (ts.isArrayLiteralExpression(methods)) {
    properties = createSpyObjWithArray(methods);
  } else if (ts.isObjectLiteralExpression(methods)) {
    properties = createSpyObjWithObject(methods);
  } else {
    reporter.recordTodo('createSpyObj-dynamic-variable');
    addTodoComment(
      node,
      'Cannot transform jasmine.createSpyObj with a dynamic variable. Please migrate this manually.',
    );

    return node;
  }

  if (propertiesArg) {
    if (ts.isObjectLiteralExpression(propertiesArg)) {
      properties.push(...(propertiesArg.properties as unknown as ts.PropertyAssignment[]));
    } else {
      reporter.recordTodo('createSpyObj-dynamic-property-map');
      addTodoComment(
        node,
        'Cannot transform jasmine.createSpyObj with a dynamic property map. Please migrate this manually.',
      );
    }
  }

  return ts.factory.createObjectLiteralExpression(properties, true);
}

function createSpyObjWithArray(methods: ts.ArrayLiteralExpression): ts.PropertyAssignment[] {
  return methods.elements
    .map((element) => {
      if (ts.isStringLiteral(element)) {
        return ts.factory.createPropertyAssignment(
          ts.factory.createIdentifier(element.text),
          createViCallExpression('fn'),
        );
      }

      return undefined;
    })
    .filter((p): p is ts.PropertyAssignment => !!p);
}

function createSpyObjWithObject(methods: ts.ObjectLiteralExpression): ts.PropertyAssignment[] {
  return methods.properties
    .map((prop) => {
      if (ts.isPropertyAssignment(prop) && ts.isIdentifier(prop.name)) {
        const methodName = prop.name.text;
        const returnValue = prop.initializer;
        const mockFn = createViCallExpression('fn');
        const mockReturnValue = createPropertyAccess(mockFn, 'mockReturnValue');

        return ts.factory.createPropertyAssignment(
          ts.factory.createIdentifier(methodName),
          ts.factory.createCallExpression(mockReturnValue, undefined, [returnValue]),
        );
      }

      return undefined;
    })
    .filter((p): p is ts.PropertyAssignment => !!p);
}

export function transformSpyReset(node: ts.Node): ts.Node {
  if (
    ts.isCallExpression(node) &&
    ts.isPropertyAccessExpression(node.expression) &&
    ts.isIdentifier(node.expression.name) &&
    node.expression.name.text === 'reset' &&
    ts.isPropertyAccessExpression(node.expression.expression)
  ) {
    const callsPae = node.expression.expression;
    if (ts.isIdentifier(callsPae.name) && callsPae.name.text === 'calls') {
      const spyIdentifier = callsPae.expression;
      const newExpression = createPropertyAccess(spyIdentifier, 'mockClear');

      return ts.factory.updateCallExpression(node, newExpression, node.typeArguments, []);
    }
  }

  return node;
}

function getSpyIdentifierFromCalls(node: ts.PropertyAccessExpression): ts.Expression | undefined {
  if (ts.isIdentifier(node.name) && node.name.text === 'calls') {
    return node.expression;
  }

  return undefined;
}

function createMockedSpyMockProperty(spyIdentifier: ts.Expression): ts.PropertyAccessExpression {
  const mockedSpy = ts.factory.createCallExpression(
    createPropertyAccess('vi', 'mocked'),
    undefined,
    [spyIdentifier],
  );

  return createPropertyAccess(mockedSpy, 'mock');
}

export function transformSpyCallInspection(node: ts.Node, reporter: RefactorReporter): ts.Node {
  // mySpy.calls.mostRecent().args -> vi.mocked(mySpy).mock.lastCall
  if (
    ts.isPropertyAccessExpression(node) &&
    ts.isIdentifier(node.name) &&
    node.name.text === 'args'
  ) {
    const mostRecentCall = node.expression;
    if (
      ts.isCallExpression(mostRecentCall) &&
      ts.isPropertyAccessExpression(mostRecentCall.expression)
    ) {
      const mostRecentPae = mostRecentCall.expression; // mySpy.calls.mostRecent
      if (
        ts.isIdentifier(mostRecentPae.name) &&
        mostRecentPae.name.text === 'mostRecent' &&
        ts.isPropertyAccessExpression(mostRecentPae.expression)
      ) {
        const spyIdentifier = getSpyIdentifierFromCalls(mostRecentPae.expression);
        if (spyIdentifier) {
          const mockProperty = createMockedSpyMockProperty(spyIdentifier);

          return createPropertyAccess(mockProperty, 'lastCall');
        }
      }
    }
  }

  if (ts.isCallExpression(node) && ts.isPropertyAccessExpression(node.expression)) {
    const pae = node.expression; // e.g., mySpy.calls.count
    const spyIdentifier = ts.isPropertyAccessExpression(pae.expression)
      ? getSpyIdentifierFromCalls(pae.expression)
      : undefined;

    if (spyIdentifier) {
      const mockProperty = createMockedSpyMockProperty(spyIdentifier);
      const callsProperty = createPropertyAccess(mockProperty, 'calls');

      const callName = pae.name.text;
      switch (callName) {
        case 'any':
          return ts.factory.createBinaryExpression(
            createPropertyAccess(callsProperty, 'length'),
            ts.SyntaxKind.GreaterThanToken,
            ts.factory.createNumericLiteral(0),
          );
        case 'count':
          return createPropertyAccess(callsProperty, 'length');
        case 'first':
          return ts.factory.createElementAccessExpression(callsProperty, 0);
        case 'all':
        case 'allArgs':
          return callsProperty;
        case 'argsFor':
          return ts.factory.createElementAccessExpression(callsProperty, node.arguments[0]);
        case 'mostRecent':
          if (
            !ts.isPropertyAccessExpression(node.parent) ||
            !ts.isIdentifier(node.parent.name) ||
            node.parent.name.text !== 'args'
          ) {
            reporter.recordTodo('mostRecent-without-args');
            addTodoComment(
              node,
              'Direct usage of mostRecent() is not supported.' +
                ' Please refactor to access .args directly or use vi.mocked(spy).mock.lastCall.',
            );
          }

          return node;
      }
    }
  }

  return node;
}
