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

import { Logger } from './logger';
import { PackageManifest, PackageMetadata } from './package-metadata';

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

/**
 * Parses the output of `npm list` or a compatible command to find the version of a package.
 * @param stdout The standard output of the command.
 * @param packageName The name of the package to find.
 * @param logger An optional logger instance.
 * @returns The version of the package, or null if it is not found.
 */
export function parseNpmLikeInstalledVersion(
  stdout: string,
  packageName: string,
  logger?: Logger,
): string | null {
  logger?.debug(`Parsing npm-like installed version for '${packageName}'...`);
  logStdout(stdout, logger);

  if (!stdout) {
    logger?.debug('  stdout is empty. No version found.');

    return null;
  }

  const data = JSON.parse(stdout);
  // npm list returns an array when used with multiple package names.
  const dependencies = Array.isArray(data) ? data[0].dependencies : data.dependencies;
  const version = dependencies?.[packageName]?.version ?? null;

  logger?.debug(`  Found version: ${version}`);

  return version;
}

/**
 * Parses the output of `yarn list` (classic) to find the version of a package.
 * @param stdout The standard output of the command.
 * @param packageName The name of the package to find.
 * @param logger An optional logger instance.
 * @returns The version of the package, or null if it is not found.
 */
export function parseYarnLegacyInstalledVersion(
  stdout: string,
  packageName: string,
  logger?: Logger,
): string | null {
  logger?.debug(`Parsing yarn classic installed version for '${packageName}'...`);
  logStdout(stdout, logger);

  if (!stdout) {
    logger?.debug('  stdout is empty. No version found.');

    return null;
  }

  for (const line of stdout.split('\n')) {
    if (!line) {
      continue;
    }
    const json = JSON.parse(line);
    if (json.type === 'tree' && json.data?.trees) {
      const dep = json.data.trees.find((d: { name: string }) =>
        d.name.startsWith(`${packageName}@`),
      );
      if (dep) {
        const version = dep.name.split('@').pop() ?? null;
        logger?.debug(`  Found version: ${version}`);

        return version;
      }
    }
  }

  logger?.debug('  No version found.');

  return null;
}

/**
 * Parses the output of `yarn list` (modern) to find the version of a package.
 * @param stdout The standard output of the command.
 * @param packageName The name of the package to find.
 * @param logger An optional logger instance.
 * @returns The version of the package, or null if it is not found.
 */
export function parseYarnModernInstalledVersion(
  stdout: string,
  packageName: string,
  logger?: Logger,
): string | null {
  logger?.debug(`Parsing yarn modern installed version for '${packageName}'...`);
  logStdout(stdout, logger);

  if (!stdout) {
    logger?.debug('  stdout is empty. No version found.');

    return null;
  }

  // Modern yarn `list` command outputs a single JSON object with a `trees` property.
  // Each line is not a separate JSON object.
  try {
    const data = JSON.parse(stdout);
    const dep = data.trees.find((d: { name: string }) => d.name.startsWith(`${packageName}@`));
    if (dep) {
      const version = dep.name.split('@').pop() ?? null;
      logger?.debug(`  Found version: ${version}`);

      return version;
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
          const dep = json.data.trees.find((d: { name: string }) =>
            d.name.startsWith(`${packageName}@`),
          );
          if (dep) {
            const version = dep.name.split('@').pop() ?? null;
            logger?.debug(`  Found version (fallback): ${version}`);

            return version;
          }
        }
      } catch (innerError) {
        logger?.debug(`  Ignoring non-JSON line: ${innerError}`);
        // Ignore lines that are not valid JSON.
      }
    }
  }

  logger?.debug('  No version found.');

  return null;
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
