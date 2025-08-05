/**
 * @license
 * Copyright Google LLC All Rights Reserved.
 *
 * Use of this source code is governed by an MIT-style license that can be
 * found in the LICENSE file at https://angular.dev/license
 */

import ts from '../../third_party/github.com/Microsoft/TypeScript/lib/typescript';
import {
  transformDoneCallback,
  transformFocusedAndSkippedTests,
  transformPending,
} from './transformers/jasmine-lifecycle';
import {
  transformArrayWithExactContents,
  transformAsymmetricMatchers,
  transformCalledOnceWith,
  transformComplexMatchers,
  transformExpectAsync,
  transformExpectNothing,
  transformSyntacticSugarMatchers,
  transformToHaveClass,
  transformWithContext,
  transformtoHaveBeenCalledBefore,
} from './transformers/jasmine-matcher';
import {
  transformDefaultTimeoutInterval,
  transformFail,
  transformTimerMocks,
  transformUnknownJasmineProperties,
  transformUnsupportedJasmineCalls,
} from './transformers/jasmine-misc';
import {
  transformCreateSpyObj,
  transformSpies,
  transformSpyCallInspection,
  transformSpyReset,
} from './transformers/jasmine-spy';

import { RefactorReporter } from './utils/refactor-reporter';

/**
 * Transforms a string of Jasmine test code to Vitest test code.
 * This is the main entry point for the transformation.
 * @param content The source code to transform.
 * @param reporter The reporter to track TODOs.
 * @returns The transformed code.
 */
export function transformJasmineToVitest(content: string, reporter: RefactorReporter): string {
  const sourceFile = ts.createSourceFile(
    'spec.ts',
    content,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TS,
  );

  const transformer: ts.TransformerFactory<ts.SourceFile> = (context) => {
    const visitor: ts.Visitor = (node) => {
      let transformedNode: ts.Node | readonly ts.Node[] = node;

      // Transform the node itself based on its type
      if (ts.isCallExpression(transformedNode)) {
        const transformations = [
          transformWithContext,
          (node: ts.Node) => transformSpies(node, reporter),
          (node: ts.Node) => transformCreateSpyObj(node, reporter),
          transformTimerMocks,
          (node: ts.Node) => transformExpectAsync(node, reporter),
          (node: ts.Node) => transformSyntacticSugarMatchers(node, reporter),
          transformSpyReset,
          transformFocusedAndSkippedTests,
          (node: ts.Node) => transformSpyCallInspection(node, reporter),
          transformComplexMatchers,
          (node: ts.Node) => transformUnsupportedJasmineCalls(node, reporter),
          (node: ts.Node) => transformPending(node, context, reporter),
          transformDoneCallback,
          transformtoHaveBeenCalledBefore,
          transformToHaveClass,
        ];

        for (const transformer of transformations) {
          transformedNode = transformer(transformedNode, context);
        }
      } else if (ts.isPropertyAccessExpression(transformedNode)) {
        const transformations = [
          transformAsymmetricMatchers,
          (node: ts.Node) => transformSpyCallInspection(node, reporter),
          (node: ts.Node) => transformUnknownJasmineProperties(node, reporter),
        ];

        for (const transformer of transformations) {
          transformedNode = transformer(transformedNode);
        }
      } else if (ts.isExpressionStatement(transformedNode)) {
        const statementTransformers = [
          transformCalledOnceWith,
          (node: ts.Node) => transformArrayWithExactContents(node, reporter),
          transformFail,
          transformDefaultTimeoutInterval,
          (node: ts.Node) => transformExpectNothing(node, reporter),
        ];

        for (const transformer of statementTransformers) {
          const result = transformer(transformedNode);
          if (result !== transformedNode) {
            transformedNode = result;
            break;
          }
        }
      }

      // Visit the children of the node to ensure they are transformed
      if (Array.isArray(transformedNode)) {
        return transformedNode.map((node) => ts.visitEachChild(node, visitor, context));
      } else {
        return ts.visitEachChild(transformedNode as ts.Node, visitor, context);
      }
    };

    return (node) => ts.visitNode(node, visitor) as ts.SourceFile;
  };

  const result = ts.transform(sourceFile, [transformer]);
  const printer = ts.createPrinter();

  return printer.printFile(result.transformed[0]);
}
