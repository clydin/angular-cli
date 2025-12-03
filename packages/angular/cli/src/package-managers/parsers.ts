/**
 * @license
 * Copyright Google LLC All Rights Reserved.
 *
 * Use of this source code is governed by an MIT-style license that can be
 * found in the LICENSE file at https://angular.dev/license
 */

/**
 * @fileoverview This file contains the parser functions that are used to
 * interpret the output of various package manager commands. Separating these
 * into their own file improves modularity and allows for focused testing.
 */

import { ErrorInfo } from './error';
import { Logger } from './logger';
import { PackageManifest, PackageMetadata } from './package-metadata';
import { InstalledPackage } from './package-tree';

const MAX_LOG_LENGTH = 1024;

function logStdout(stdout: string, logger?: Logger): void {
  if (!logger) {
    return;
  }

  let output = stdout;
  if (output.length > MAX_LOG_LENGTH) {
    output = `${output.slice(0, MAX_LOG_LENGTH)}... (truncated)`;
  }

  logger.debug(`  stdout:\n${output}`);
}

interface NpmListDependency {
  version: string;
  path?: string;
  [key: string]: unknown;
}

/**
 * Parses the output of `npm list` or a compatible command.
 *
 * The expected JSON structure is:
 * ```json
 * {
 *   "dependencies": {
 *     "@angular/cli": {
 *       "version": "18.0.0",
 *       "path": "/path/to/project/node_modules/@angular/cli", // path is optional
 *       ... (other package.json properties)
 *     }
 *   }
 * }
 * ```
 *
 * @param stdout The standard output of the command.
 * @param logger An optional logger instance.
 * @returns A map of package names to their installed package details.
 */
export function parseNpmLikeDependencies(
  stdout: string,
  logger?: Logger,
): Map<string, InstalledPackage> {
  logger?.debug(`Parsing npm-like dependency list...`);
  logStdout(stdout, logger);

  const dependencies = new Map<string, InstalledPackage>();
  if (!stdout) {
    logger?.debug('  stdout is empty. No dependencies found.');

    return dependencies;
  }

  let data = JSON.parse(stdout);
  if (Array.isArray(data)) {
    // pnpm returns an array of projects.
    data = data[0];
  }

  const dependencyMaps = [data.dependencies, data.devDependencies, data.unsavedDependencies].filter(
    (d) => !!d,
  );

  if (dependencyMaps.length === 0) {
    logger?.debug('  `dependencies` property not found. No dependencies found.');

    return dependencies;
  }

  for (const dependencyMap of dependencyMaps) {
    for (const [name, info] of Object.entries(dependencyMap as Record<string, NpmListDependency>)) {
      dependencies.set(name, {
        name,
        version: info.version,
        path: info.path,
      });
    }
  }

  logger?.debug(`  Found ${dependencies.size} dependencies.`);

  return dependencies;
}

/**
 * Parses the output of `yarn list` (classic).
 *
 * The expected output is a JSON stream (JSONL), where each line is a JSON object.
 * The relevant object has a `type` of `'tree'` with a `data` property.
 * Yarn classic does not provide a path, so the `path` property will be `undefined`.
 *
 * ```json
 * {"type":"tree","data":{"trees":[{"name":"@angular/cli@18.0.0","children":[]}]}}
 * ```
 *
 * @param stdout The standard output of the command.
 * @param logger An optional logger instance.
 * @returns A map of package names to their installed package details.
 */
export function parseYarnClassicDependencies(
  stdout: string,
  logger?: Logger,
): Map<string, InstalledPackage> {
  logger?.debug(`Parsing yarn classic dependency list...`);
  logStdout(stdout, logger);

  const dependencies = new Map<string, InstalledPackage>();
  if (!stdout) {
    logger?.debug('  stdout is empty. No dependencies found.');

    return dependencies;
  }

  for (const line of stdout.split('\n')) {
    if (!line) {
      continue;
    }
    const json = JSON.parse(line);
    if (json.type === 'tree' && json.data?.trees) {
      for (const info of json.data.trees) {
        const name = info.name.split('@')[0];
        const version = info.name.split('@').pop();
        dependencies.set(name, {
          name,
          version,
        });
      }
    }
  }

  logger?.debug(`  Found ${dependencies.size} dependencies.`);

  return dependencies;
}

/**
 * Parses the output of `yarn list` (modern).
 *
 * The expected JSON structure is a single object.
 * Yarn modern does not provide a path, so the `path` property will be `undefined`.
 *
 * ```json
 * {
 *   "trees": [
 *     { "name": "@angular/cli@18.0.0", "children": [] }
 *   ]
 * }
 * ```
 *
 * @param stdout The standard output of the command.
 * @param logger An optional logger instance.
 * @returns A map of package names to their installed package details.
 */
export function parseYarnModernDependencies(
  stdout: string,
  logger?: Logger,
): Map<string, InstalledPackage> {
  logger?.debug(`Parsing yarn modern dependency list...`);
  logStdout(stdout, logger);

  const dependencies = new Map<string, InstalledPackage>();
  if (!stdout) {
    logger?.debug('  stdout is empty. No dependencies found.');

    return dependencies;
  }

  // Modern yarn `list` command outputs a single JSON object with a `trees` property.
  // Each line is not a separate JSON object.
  try {
    const data = JSON.parse(stdout);
    for (const info of data.trees) {
      const name = info.name.split('@')[0];
      const version = info.name.split('@').pop();
      dependencies.set(name, {
        name,
        version,
      });
    }
  } catch (e) {
    logger?.debug(
      `  Failed to parse as single JSON object: ${e}. Falling back to line-by-line parsing.`,
    );
    // Fallback for older versions of yarn berry that might still output json lines
    for (const line of stdout.split('\n')) {
      if (!line) {
        continue;
      }
      try {
        const json = JSON.parse(line);
        if (json.type === 'tree' && json.data?.trees) {
          for (const info of json.data.trees) {
            const name = info.name.split('@')[0];
            const version = info.name.split('@').pop();
            dependencies.set(name, {
              name,
              version,
            });
          }
        }
      } catch (innerError) {
        logger?.debug(`  Ignoring non-JSON line: ${innerError}`);
        // Ignore lines that are not valid JSON.
      }
    }
  }

  logger?.debug(`  Found ${dependencies.size} dependencies.`);

  return dependencies;
}

/**
 * Parses the output of `npm view` or a compatible command to get a package manifest.
 * @param stdout The standard output of the command.
 * @param logger An optional logger instance.
 * @returns The package manifest object.
 */
export function parseNpmLikeManifest(stdout: string, logger?: Logger): PackageManifest | null {
  logger?.debug(`Parsing npm-like manifest...`);
  logStdout(stdout, logger);

  if (!stdout) {
    logger?.debug('  stdout is empty. No manifest found.');

    return null;
  }

  return JSON.parse(stdout);
}

/**
 * Parses the output of `npm view` or a compatible command to get package metadata.
 * @param stdout The standard output of the command.
 * @param logger An optional logger instance.
 * @returns The package metadata object.
 */
export function parseNpmLikeMetadata(stdout: string, logger?: Logger): PackageMetadata | null {
  logger?.debug(`Parsing npm-like metadata...`);
  logStdout(stdout, logger);

  if (!stdout) {
    logger?.debug('  stdout is empty. No metadata found.');

    return null;
  }

  return JSON.parse(stdout);
}

/**
 * Parses the output of `yarn info` (classic).
 * @param stdout The standard output of the command.
 * @param logger An optional logger instance.
 * @returns The package manifest object.
 */
export function parseYarnLegacyManifest(stdout: string, logger?: Logger): PackageManifest | null {
  logger?.debug(`Parsing yarn classic manifest...`);
  logStdout(stdout, logger);

  if (!stdout) {
    logger?.debug('  stdout is empty. No manifest found.');

    return null;
  }

  const data = JSON.parse(stdout);

  // Yarn classic wraps the manifest in a `data` property.
  return data.data ?? data;
}

/**
 * Parses the stderr output of npm, pnpm, modern yarn, or bun to extract structured error information.
 *
 * This parser uses a multi-stage approach. It first attempts to parse the entire `stderr` as a
 * single JSON object, which is the standard for modern tools like pnpm, yarn, and bun. If JSON
 * parsing fails, it falls back to a line-by-line regex-based approach to handle the plain
 * text output from older versions of npm.
 *
 * Example JSON output (pnpm):
 * ```json
 * {
 *   "code": "E404",
 *   "summary": "Not Found - GET https://registry.npmjs.org/@angular%2fnon-existent - Not found",
 *   "detail": "The requested resource '@angular/non-existent@*' could not be found or you do not have permission to access it."
 * }
 * ```
 *
 * Example text output (npm):
 * ```
 * npm error code E404
 * npm error 404 Not Found - GET https://registry.npmjs.org/@angular%2fnon-existent - Not found
 * ```
 *
 * @param stderr The standard error output of the command.
 * @param logger An optional logger instance.
 * @returns An `ErrorInfo` object if parsing is successful, otherwise `null`.
 */
export function parseNpmLikeError(stderr: string, logger?: Logger): ErrorInfo | null {
  logger?.debug(`Parsing npm-like error output...`);
  logStdout(stderr, logger); // Log stderr for debugging purposes

  if (!stderr) {
    logger?.debug('  stderr is empty. No error found.');

    return null;
  }

  // Attempt to parse as JSON first (common for pnpm, modern yarn, bun)
  try {
    const jsonError = JSON.parse(stderr);
    if (
      jsonError &&
      typeof jsonError.code === 'string' &&
      (typeof jsonError.summary === 'string' || typeof jsonError.message === 'string')
    ) {
      const summary = jsonError.summary || jsonError.message;
      logger?.debug(`  Successfully parsed JSON error with code '${jsonError.code}'.`);

      return {
        code: jsonError.code,
        summary,
        detail: jsonError.detail,
      };
    }
  } catch (e) {
    logger?.debug(`  Failed to parse stderr as JSON: ${e}. Attempting regex fallback.`);
    // Fallback to regex for plain text errors (common for npm)
  }

  // Regex for npm-like error codes (e.g., `npm ERR! code E404` or `npm error code E404`)
  const errorCodeMatch = stderr.match(/npm (ERR!|error) code (E\d{3}|[A-Z_]+)/);
  if (errorCodeMatch) {
    const code = errorCodeMatch[2]; // Capture group 2 is the actual error code
    let summary: string | undefined;

    // Find the most descriptive summary line (the line after `npm ERR! code ...` or `npm error code ...`).
    for (const line of stderr.split('\n')) {
      if (line.startsWith('npm ERR!') && !line.includes(' code ')) {
        summary = line.replace('npm ERR! ', '').trim();
        break;
      } else if (line.startsWith('npm error') && !line.includes(' code ')) {
        summary = line.replace('npm error ', '').trim();
        break;
      }
    }

    logger?.debug(`  Successfully parsed text error with code '${code}'.`);

    return {
      code,
      summary: summary || `Package manager error: ${code}`,
    };
  }

  logger?.debug('  Failed to parse npm-like error. No structured error found.');

  return null;
}

/**
 * Parses the stderr output of yarn classic to extract structured error information.
 *
 * This parser first attempts to find an HTTP status code (e.g., 404, 401) in the verbose output.
 * If found, it returns a standardized error code (`E${statusCode}`).
 * If no HTTP status code is found, it falls back to parsing generic JSON error lines.
 *
 * Example verbose output (with HTTP status code):
 * ```json
 * {"type":"verbose","data":"Request \"https://registry.npmjs.org/@angular%2fnon-existent\" finished with status code 404."}
 * ```
 *
 * Example generic JSON error output:
 * ```json
 * {"type":"error","data":"Received invalid response from npm."}
 * ```
 *
 * @param stderr The standard error output of the command.
 * @param logger An optional logger instance.
 * @returns An `ErrorInfo` object if parsing is successful, otherwise `null`.
 */
export function parseYarnClassicError(stderr: string, logger?: Logger): ErrorInfo | null {
  logger?.debug(`Parsing yarn classic error output...`);
  logStdout(stderr, logger); // Log stderr for debugging purposes

  if (!stderr) {
    logger?.debug('  stderr is empty. No error found.');

    return null;
  }

  // First, check for any HTTP status code in the verbose output.
  const statusCodeMatch = stderr.match(/finished with status code (\d{3})/);
  if (statusCodeMatch) {
    const statusCode = statusCodeMatch[1];
    logger?.debug(`  Detected HTTP status code '${statusCode}' in verbose output.`);

    return {
      code: `E${statusCode}`,
      summary: `Request failed with status code ${statusCode}.`,
    };
  }

  // Fallback to the JSON error type if no HTTP status code is present.
  for (const line of stderr.split('\n')) {
    if (!line) {
      continue;
    }
    try {
      const json = JSON.parse(line);
      if (json.type === 'error' && typeof json.data === 'string') {
        const summary = json.data;
        logger?.debug(`  Successfully parsed generic yarn classic error.`);

        return {
          code: 'UNKNOWN_ERROR',
          summary,
        };
      }
    } catch (e) {
      // Ignore lines that are not valid JSON or not error types
      logger?.debug(`  Ignoring non-JSON or non-error line: ${e}`);
    }
  }

  logger?.debug('  Failed to parse yarn classic error. No structured error found.');

  return null;
}
