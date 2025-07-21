/**
 * @license
 * Copyright Google LLC All Rights Reserved.
 *
 * Use of this source code is governed by an MIT-style license that can be
 * found in the LICENSE file at https://angular.dev/license
 */

/**
 * @fileoverview This file defines the data structures and configuration for
 * supported package managers. It is the single source of truth for all
 * package-manager-specific commands, flags, and output parsing.
 */

import { Logger } from './logger';
import { PackageManifest, PackageMetadata } from './package-metadata';
import {
  parseNpmLikeInstalledVersion,
  parseNpmLikeManifest,
  parseNpmLikeMetadata,
  parseYarnLegacyInstalledVersion,
  parseYarnLegacyManifest,
  parseYarnModernInstalledVersion,
} from './parsers';

/**
 * An interface that describes the commands and properties of a package manager.
 */
export interface PackageManagerDescriptor {
  /** The binary executable for the package manager. */
  readonly binary: string;

  /** The lockfile names used by the package manager. */
  readonly lockfiles: readonly string[];

  /** The command to add a package. */
  readonly addCommand: string;

  /** The command to install all dependencies. */
  readonly installCommand: readonly string[];

  /** The flag to force a clean installation. */
  readonly forceFlag: string;

  /** The flag to save a package with an exact version. */
  readonly saveExactFlag: string;

  /** The flag to save a package with a tilde version range. */
  readonly saveTildeFlag: string;

  /** The flag to save a package as a dev dependency. */
  readonly saveDevFlag: string;

  /** The flag to prevent the lockfile from being updated. */
  readonly noLockfileFlag: string;

  /** A function that returns the arguments and environment variables to use a custom registry. */
  readonly getRegistryOptions?: (registry: string) => {
    args?: string[];
    env?: Record<string, string>;
  };

  /** The command to get the package manager's version. */
  readonly versionCommand: readonly string[];

  /** The command to get the installed version of a package. */
  readonly getInstalledVersionCommand: readonly string[];

  /** The command to fetch the registry manifest of a package. */
  readonly getManifestCommand: readonly string[];

  /** A function that formats the arguments for field-filtered registry views. */
  readonly viewCommandFieldArgFormatter?: (fields: readonly string[]) => string[];

  /** A collection of functions to parse the output of specific commands. */
  readonly outputParsers: {
    /** A function to parse the output of `getInstalledVersionCommand`. */
    getInstalledVersion: (stdout: string, packageName: string, logger?: Logger) => string | null;

    /** A function to parse the output of `getManifestCommand` for a specific version. */
    getPackageManifest: (stdout: string, logger?: Logger) => PackageManifest | null;

    /** A function to parse the output of `getManifestCommand` for the full package metadata. */
    getRegistryMetadata: (stdout: string, logger?: Logger) => PackageMetadata | null;
  };
}

/** A type that represents the name of a supported package manager. */
export type PackageManagerName = keyof typeof SUPPORTED_PACKAGE_MANAGERS;

/**
 * A map of supported package managers to their descriptors.
 * This is the single source of truth for all package-manager-specific
 * configuration and behavior.
 */
export const SUPPORTED_PACKAGE_MANAGERS: { [name: string]: PackageManagerDescriptor } = {
  npm: {
    binary: 'npm',
    lockfiles: ['package-lock.json', 'npm-shrinkwrap.json'],
    addCommand: 'install',
    installCommand: ['install'],
    forceFlag: '--force',
    saveExactFlag: '--save-exact',
    saveTildeFlag: '--save-tilde',
    saveDevFlag: '--save-dev',
    noLockfileFlag: '--no-package-lock',
    getRegistryOptions: (registry: string) => ({ args: ['--registry', registry] }),
    versionCommand: ['--version'],
    getInstalledVersionCommand: ['list', '--depth=0', '--json'],
    getManifestCommand: ['view', '--json'],
    viewCommandFieldArgFormatter: (fields) => [...fields],
    outputParsers: {
      getInstalledVersion: parseNpmLikeInstalledVersion,
      getPackageManifest: parseNpmLikeManifest,
      getRegistryMetadata: parseNpmLikeMetadata,
    },
  },
  yarn: {
    binary: 'yarn',
    lockfiles: ['yarn.lock'],
    addCommand: 'add',
    installCommand: ['install'],
    forceFlag: '--force',
    saveExactFlag: '--exact',
    saveTildeFlag: '--tilde',
    saveDevFlag: '--dev',
    noLockfileFlag: '--no-lockfile',
    getRegistryOptions: (registry: string) => ({ env: { NPM_CONFIG_REGISTRY: registry } }),
    versionCommand: ['--version'],
    getInstalledVersionCommand: ['list', '--depth=0', '--json'],
    getManifestCommand: ['npm', 'info', '--json'],
    viewCommandFieldArgFormatter: (fields) => ['--fields', fields.join(',')],
    outputParsers: {
      getInstalledVersion: parseYarnModernInstalledVersion,
      getPackageManifest: parseNpmLikeManifest,
      getRegistryMetadata: parseNpmLikeMetadata,
    },
  },
  'yarn-legacy': {
    binary: 'yarn',
    lockfiles: ['yarn.lock'],
    addCommand: 'add',
    installCommand: ['install'],
    forceFlag: '--force',
    saveExactFlag: '--exact',
    saveTildeFlag: '--tilde',
    saveDevFlag: '--dev',
    noLockfileFlag: '--no-lockfile',
    getRegistryOptions: (registry: string) => ({ args: ['--registry', registry] }),
    versionCommand: ['--version'],
    getInstalledVersionCommand: ['list', '--depth=0', '--json'],
    getManifestCommand: ['info', '--json'],
    outputParsers: {
      getInstalledVersion: parseYarnLegacyInstalledVersion,
      getPackageManifest: parseYarnLegacyManifest,
      getRegistryMetadata: parseNpmLikeMetadata,
    },
  },
  pnpm: {
    binary: 'pnpm',
    lockfiles: ['pnpm-lock.yaml'],
    addCommand: 'add',
    installCommand: ['install'],
    forceFlag: '--force',
    saveExactFlag: '--save-exact',
    saveTildeFlag: '--save-tilde',
    saveDevFlag: '--save-dev',
    noLockfileFlag: '--no-lockfile',
    getRegistryOptions: (registry: string) => ({ args: ['--registry', registry] }),
    versionCommand: ['--version'],
    getInstalledVersionCommand: ['list', '--depth=0', '--json'],
    getManifestCommand: ['view', '--json'],
    viewCommandFieldArgFormatter: (fields) => [...fields],
    outputParsers: {
      getInstalledVersion: parseNpmLikeInstalledVersion,
      getPackageManifest: parseNpmLikeManifest,
      getRegistryMetadata: parseNpmLikeMetadata,
    },
  },
  bun: {
    binary: 'bun',
    lockfiles: ['bun.lockb', 'bun.lock'],
    addCommand: 'add',
    installCommand: ['install'],
    forceFlag: '--force',
    saveExactFlag: '--exact',
    saveTildeFlag: '', // Bun does not have a flag for tilde, it defaults to caret.
    saveDevFlag: '--development',
    noLockfileFlag: '', // Bun does not have a flag for this.
    getRegistryOptions: (registry: string) => ({ args: ['--registry', registry] }),
    versionCommand: ['--version'],
    getInstalledVersionCommand: ['pm', 'ls', '--json'],
    getManifestCommand: ['pm', 'view', '--json'],
    viewCommandFieldArgFormatter: (fields) => [...fields],
    outputParsers: {
      getInstalledVersion: parseNpmLikeInstalledVersion,
      getPackageManifest: parseNpmLikeManifest,
      getRegistryMetadata: parseNpmLikeMetadata,
    },
  },
};

/**
 * The order of precedence for package managers.
 * This is a best-effort ordering based on estimated Angular community usage and default presence.
 */
export const PACKAGE_MANAGER_PRECEDENCE: readonly PackageManagerName[] = [
  'pnpm',
  'yarn',
  'yarn-legacy',
  'bun',
  'npm',
];
