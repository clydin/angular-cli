/**
 * @license
 * Copyright Google LLC All Rights Reserved.
 *
 * Use of this source code is governed by an MIT-style license that can be
 * found in the LICENSE file at https://angular.dev/license
 */

import type {
  AstFactory,
  BinaryOperator,
  LeadingComment,
  ObjectLiteralProperty,
  SourceMapRange,
  TemplateLiteral,
  UnaryOperator,
  VariableDeclarationType,
} from '@angular/compiler-cli/src/ngtsc/translator';
import type {
  BuiltInType,
  Parameter,
} from '@angular/compiler-cli/src/ngtsc/translator/src/api/ast_factory';

/**
 * An implementation of `AstFactory` that generates JavaScript code strings directly.
 */
export class StringAstFactory implements AstFactory<string, unknown, string> {
  constructor(private readonly sourceCode: string = '') {}

  private render(expr: unknown): string {
    if (typeof expr === 'string') {
      return expr;
    }
    if (
      typeof expr === 'object' &&
      expr !== null &&
      typeof (expr as { start?: number; end?: number }).start === 'number' &&
      typeof (expr as { end?: number }).end === 'number'
    ) {
      const { start, end } = expr as { start: number; end: number };

      return this.sourceCode.slice(start, end);
    }

    return String(expr);
  }

  attachComments(_statement: string, _leadingComments: LeadingComment[]): void {}

  createArrayLiteral(elements: unknown[]): string {
    return `[${elements.map((e) => this.render(e)).join(', ')}]`;
  }

  createAssignment(target: unknown, operator: BinaryOperator, value: unknown): string {
    return `(${this.render(target)} ${operator} ${this.render(value)})`;
  }

  createBinaryExpression(
    leftOperand: unknown,
    operator: BinaryOperator,
    rightOperand: unknown,
  ): string {
    return `(${this.render(leftOperand)} ${operator} ${this.render(rightOperand)})`;
  }

  createBlock(body: string[]): string {
    return `{\n${body.join('\n')}\n}`;
  }

  createCallExpression(callee: unknown, args: unknown[], pure: boolean): string {
    let renderedCallee = this.render(callee);
    if (renderedCallee.startsWith('function') || renderedCallee.includes('=>')) {
      renderedCallee = `(${renderedCallee})`;
    }
    const annotation = pure ? '/*@__PURE__*/ ' : '';

    return `${annotation}${renderedCallee}(${args.map((a) => this.render(a)).join(', ')})`;
  }

  createCallChain(callee: unknown, args: unknown[], pure: boolean, isOptional: boolean): string {
    const annotation = pure ? '/*@__PURE__*/ ' : '';
    const operator = isOptional ? '?.' : '';

    return `${annotation}${this.render(callee)}${operator}(${args.map((a) => this.render(a)).join(', ')})`;
  }

  createConditional(condition: unknown, thenExpression: unknown, elseExpression: unknown): string {
    return `(${this.render(condition)} ? ${this.render(thenExpression)} : ${this.render(elseExpression)})`;
  }

  createElementAccess(expression: unknown, element: unknown): string {
    return `${this.render(expression)}[${this.render(element)}]`;
  }

  createElementAccessChain(expression: unknown, element: unknown, isOptional: boolean): string {
    const operator = isOptional ? '?.' : '';

    return `${this.render(expression)}${operator}[${this.render(element)}]`;
  }

  createExpressionStatement(expression: unknown): string {
    return `${this.render(expression)};`;
  }

  createFunctionDeclaration(
    functionName: string,
    parameters: Parameter<string>[],
    body: string,
  ): string {
    const params = parameters.map((p) => p.name).join(', ');

    return `function ${functionName}(${params}) ${body}`;
  }

  createFunctionExpression(
    functionName: string | null,
    parameters: Parameter<string>[],
    body: string,
  ): string {
    const name = functionName ? ` ${functionName}` : '';
    const params = parameters.map((p) => p.name).join(', ');

    return `function${name}(${params}) ${body}`;
  }

  createArrowFunctionExpression(parameters: Parameter<string>[], body: unknown): string {
    const params = parameters.map((p) => p.name).join(', ');

    return `(${params}) => ${this.render(body)}`;
  }

  createDynamicImport(url: unknown): string {
    return `import(${this.render(url)})`;
  }

  createIdentifier(name: string): string {
    return name;
  }

  createIfStatement(
    condition: unknown,
    thenStatement: string,
    elseStatement: string | null,
  ): string {
    const elseClause = elseStatement ? ` else ${elseStatement}` : '';

    return `if (${this.render(condition)}) ${thenStatement}${elseClause}`;
  }

  createLiteral(value: string | number | boolean | null | undefined): string {
    if (value === undefined) {
      return 'undefined';
    }

    return JSON.stringify(value);
  }

  createNewExpression(expression: unknown, args: unknown[]): string {
    return `new ${this.render(expression)}(${args.map((a) => this.render(a)).join(', ')})`;
  }

  createObjectLiteral(properties: ObjectLiteralProperty<unknown>[]): string {
    const props = properties.map((p) => {
      if (p.kind === 'spread') {
        return `...${this.render(p.expression)}`;
      }

      const key = p.quoted ? JSON.stringify(p.propertyName) : p.propertyName;

      return `${key}: ${this.render(p.value)}`;
    });

    return `{\n${props.join(',\n')}\n}`;
  }

  createParenthesizedExpression(expression: unknown): string {
    return `(${this.render(expression)})`;
  }

  createPropertyAccess(expression: unknown, propertyName: string): string {
    return `${this.render(expression)}.${propertyName}`;
  }

  createPropertyAccessChain(
    expression: unknown,
    propertyName: string,
    isOptional: boolean,
  ): string {
    const operator = isOptional ? '?.' : '';

    return `${this.render(expression)}${operator}.${propertyName}`;
  }

  createReturnStatement(expression: unknown | null): string {
    return `return${expression !== null ? ` ${this.render(expression)}` : ''};`;
  }

  createTaggedTemplate(tag: unknown, template: TemplateLiteral<unknown>): string {
    return `${this.render(tag)}${this.createTemplateLiteral(template)}`;
  }

  createTemplateLiteral(template: TemplateLiteral<unknown>): string {
    let result = '`';
    for (let i = 0; i < template.elements.length; i++) {
      result += template.elements[i].raw;
      if (i < template.expressions.length) {
        result += `\${${this.render(template.expressions[i])}}`;
      }
    }
    result += '`';

    return result;
  }

  createThrowStatement(expression: unknown): string {
    return `throw ${this.render(expression)};`;
  }

  createTypeOfExpression(expression: unknown): string {
    return `typeof ${this.render(expression)}`;
  }

  createVoidExpression(expression: unknown): string {
    return `void ${this.render(expression)}`;
  }

  createUnaryExpression(operator: UnaryOperator, operand: unknown): string {
    return `${operator}${this.render(operand)}`;
  }

  createVariableDeclaration(
    variableName: string,
    initializer: unknown | null,
    variableType: VariableDeclarationType,
    _type: string | null = null,
  ): string {
    const init = initializer !== null ? ` = ${this.render(initializer)}` : '';

    return `${variableType} ${variableName}${init};`;
  }

  createRegularExpressionLiteral(body: string, flags: string | null): string {
    return `/${body}/${flags ?? ''}`;
  }

  createSpreadElement(expression: unknown): string {
    return `...${this.render(expression)}`;
  }

  createBuiltInType(_type: BuiltInType): string {
    return '';
  }

  createExpressionType(_expression: unknown, _typeParams: string[] | null): string {
    return '';
  }

  createArrayType(_elementType: string): string {
    return '';
  }

  createMapType(_valueType: string): string {
    return '';
  }

  transplantType(_type: string): string {
    return '';
  }

  setSourceMapRange<T extends string | unknown>(
    node: T,
    _sourceMapRange: SourceMapRange | null,
  ): T {
    return node;
  }
}
