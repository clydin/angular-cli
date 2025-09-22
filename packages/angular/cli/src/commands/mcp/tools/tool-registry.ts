/**
 * @license
 * Copyright Google LLC All Rights Reserved.
 *
 * Use of this source code is governed by an MIT-style license that can be
 * found in the LICENSE file at https://angular.dev/license
 */

import type { McpServer, ToolCallback } from '@modelcontextprotocol/sdk/server/mcp.js';
import { ZodRawShape } from 'zod';
import type { AnalyticsCollector } from '../../../analytics/analytics-collector';
import type { AngularWorkspace } from '../../../utilities/config';

type ToolConfig = Parameters<McpServer['registerTool']>[1];

export interface McpToolContext {
  server: McpServer;
  workspace?: AngularWorkspace;
  logger: { warn(text: string): void };
  exampleDatabasePath?: string;
}

export type McpToolFactory<TInput extends ZodRawShape> = (
  context: McpToolContext,
) => ToolCallback<TInput> | Promise<ToolCallback<TInput>>;

export interface McpToolDeclaration<TInput extends ZodRawShape, TOutput extends ZodRawShape> {
  name: string;
  title?: string;
  description: string;
  annotations?: ToolConfig['annotations'];
  inputSchema?: TInput;
  outputSchema?: TOutput;
  factory: McpToolFactory<TInput>;
  shouldRegister?: (context: McpToolContext) => boolean | Promise<boolean>;
  isReadOnly?: boolean;
  isLocalOnly?: boolean;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type AnyMcpToolDeclaration = McpToolDeclaration<any, any>;

export function declareTool<TInput extends ZodRawShape, TOutput extends ZodRawShape>(
  declaration: McpToolDeclaration<TInput, TOutput>,
): McpToolDeclaration<TInput, TOutput> {
  return declaration;
}

export async function registerTools(
  server: McpServer,
  context: Omit<McpToolContext, 'server'>,
  declarations: AnyMcpToolDeclaration[],
  analytics?: AnalyticsCollector,
): Promise<void> {
  for (const declaration of declarations) {
    const toolContext = { ...context, server };
    if (declaration.shouldRegister && !(await declaration.shouldRegister(toolContext))) {
      continue;
    }

    const {
      name: toolName,
      factory,
      shouldRegister,
      isReadOnly,
      isLocalOnly,
      ...config
    } = declaration;

    const originalHandler = await factory(toolContext);

    // Add declarative characteristics to annotations
    config.annotations ??= {};
    if (isReadOnly !== undefined) {
      config.annotations.readOnlyHint = isReadOnly;
    }
    if (isLocalOnly !== undefined) {
      // openWorldHint: false means local only
      config.annotations.openWorldHint = !isLocalOnly;
    }

    // If analytics are disabled, just register the original handler and continue.
    if (!analytics) {
      server.registerTool(toolName, config, originalHandler);
      continue;
    }

    // If analytics are enabled, create and register the wrapped handler.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const analyticsHandler: ToolCallback<any> = async (input: any, requestHandlerExtra) => {
      const startTime = Date.now();
      let toolStatus: 'success' | 'error' = 'success';

      try {
        return await originalHandler(input, requestHandlerExtra);
      } catch (e) {
        toolStatus = 'error';
        throw e;
      } finally {
        const toolDuration = Date.now() - startTime;
        const clientName = server.server.getClientVersion()?.name ?? 'unknown';

        // This code only runs if analytics is available
        analytics.reportMcpToolInvocation({
          toolName,
          clientName,
          toolStatus,
          toolDuration,
        });
      }
    };

    server.registerTool(toolName, config, analyticsHandler);
  }
}
