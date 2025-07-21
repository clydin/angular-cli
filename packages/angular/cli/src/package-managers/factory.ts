/**
 * @license
 * Copyright Google LLC All Rights Reserved.
 *
 * Use of this source code is governed by an MIT-style license that can be
 * found in the LICENSE file at https://angular.dev/license
 */

import { major } from 'semver';
import { discover } from './discovery';
import { Host, NodeJS_HOST } from './host';
import { Logger } from './logger';
import { PackageManager } from './package-manager';
import { PackageManagerName, SUPPORTED_PACKAGE_MANAGERS } from './package-manager-descriptor';
import { getYarnVersion, isPackageManagerInstalled } from './verification';

/**
 * Determines the package manager to use for a given project.
 *
 * This function will determine the package manager by checking for a configured
 * package manager, discovering the package manager from lockfiles, or falling
 * back to a default. It also handles differentiation between yarn classic and modern.
 *
 * @param host A `Host` instance for interacting with the file system and running commands.
 * @param cwd The directory to start the search from.
 * @param configured An optional, explicitly configured package manager.
 * @param logger An optional logger instance.
 * @returns A promise that resolves to an object containing the name and source of the package manager.
 */
async function determinePackageManager(
  host: Host,
  cwd: string,
  configured?: PackageManagerName,
  logger?: Logger,
): Promise<{ name: PackageManagerName; source: 'configured' | 'discovered' | 'default' }> {
  let name: PackageManagerName;
  let source: 'configured' | 'discovered' | 'default';

  if (configured) {
    name = configured;
    source = 'configured';
    logger?.debug(`Using configured package manager: '${name}'.`);
  } else {
    const discovered = await discover(host, cwd, logger);
    if (discovered) {
      name = discovered;
      source = 'discovered';
      logger?.debug(`Discovered package manager: '${name}'.`);
    } else {
      name = 'npm';
      source = 'default';
      logger?.debug(`No lockfile found. Using default package manager: 'npm'.`);
    }
  }

  if (name === 'yarn') {
    const version = await getYarnVersion(host, logger);
    if (version && major(version) < 2) {
      name = 'yarn-legacy';
      logger?.debug(`Detected yarn classic. Using 'yarn-legacy'.`);
    }
  }

  return { name, source };
}

/**
 * Creates a new `PackageManager` instance for a given project.
 *
 * This function is the main entry point for the package manager abstraction.
 * It will determine, verify, and instantiate the correct package manager.
 *
 * @param options An object containing the options for creating the package manager.
 * @returns A promise that resolves to a new `PackageManager` instance.
 */
export async function createPackageManager(options: {
  cwd: string;
  configuredPackageManager?: PackageManagerName;
  logger?: Logger;
  dryRun?: boolean;
}): Promise<PackageManager> {
  const { cwd, configuredPackageManager, logger, dryRun } = options;
  const host = NodeJS_HOST;

  const { name, source } = await determinePackageManager(
    host,
    cwd,
    configuredPackageManager,
    logger,
  );

  if (!SUPPORTED_PACKAGE_MANAGERS[name]) {
    throw new Error(`Unsupported package manager: "${name}"`);
  }

  // Do not verify if the package manager is installed during a dry run.
  if (!dryRun) {
    const isInstalled = await isPackageManagerInstalled(host, name, logger);
    if (!isInstalled) {
      if (source === 'default') {
        throw new Error(
          `'npm' was selected as the default package manager, but it is not installed or` +
            ` cannot be found in the PATH. Please install 'npm' to continue.`,
        );
      } else {
        throw new Error(
          `The project is configured to use '${name}', but it is not installed or cannot be` +
            ` found in the PATH. Please install '${name}' to continue.`,
        );
      }
    }
  }

  logger?.debug(`Successfully created PackageManager for '${name}'.`);
  const descriptor = SUPPORTED_PACKAGE_MANAGERS[name];

  return new PackageManager(host, cwd, descriptor, { dryRun, logger });
}
