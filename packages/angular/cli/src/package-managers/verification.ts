/**
 * @license
 * Copyright Google LLC All Rights Reserved.
 *
 * Use of this source code is governed by an MIT-style license that can be
 * found in the LICENSE file at https://angular.dev/license
 */

/**
 * @fileoverview This file contains logic for verifying that a package manager
 * is installed and for determining the version of a package manager.
 */

import { Host } from './host';
import { Logger } from './logger';
import { PackageManagerName, SUPPORTED_PACKAGE_MANAGERS } from './package-manager-descriptor';

/**
 * Gets the version of yarn installed on the system.
 * @param host A `Host` instance for running commands.
 * @param logger An optional logger instance.
 * @returns A promise that resolves to the yarn version string, or null if yarn is not installed.
 */
export async function getYarnVersion(host: Host, logger?: Logger): Promise<string | null> {
  logger?.debug(`Getting yarn version...`);

  try {
    const { stdout } = await host.runCommand('yarn', ['--version']);
    const version = stdout.trim();
    logger?.debug(`Yarn version is '${version}'.`);

    return version;
  } catch (e) {
    logger?.debug('Failed to get yarn version.');

    return null;
  }
}

/**
 * Checks if a package manager is installed on the system.
 * @param host A `Host` instance for running commands.
 * @param name The name of the package manager to check.
 * @param logger An optional logger instance.
 * @returns A promise that resolves to true if the package manager is installed, false otherwise.
 */
export async function isPackageManagerInstalled(
  host: Host,
  name: PackageManagerName,
  logger?: Logger,
): Promise<boolean> {
  logger?.debug(`Verifying if '${name}' is installed...`);
  const descriptor = SUPPORTED_PACKAGE_MANAGERS[name];
  if (!descriptor) {
    logger?.debug(`'${name}' is not a supported package manager.`);

    return false;
  }

  try {
    await host.runCommand(descriptor.binary, descriptor.versionCommand, { stdio: 'ignore' });
    logger?.debug(`Verification check succeeded.`);

    return true;
  } catch {
    logger?.debug('Verification check failed.');

    return false;
  }
}
