/**
 * @license
 * Copyright Google LLC All Rights Reserved.
 *
 * Use of this source code is governed by an MIT-style license that can be
 * found in the LICENSE file at https://angular.dev/license
 */

import { logging } from '@angular-devkit/core';
import * as semver from 'semver';
import { PackageManager, PackageManifest, PackageMetadata } from '../../package-managers';

export type VersionRange = string & { __VERSION_RANGE: void };
export type PeerVersionTransform = string | ((range: string) => string);

// Angular guarantees that a major is compatible with its following major (so packages that depend
// on Angular 5 are also compatible with Angular 6). This is, in code, represented by verifying
// that all other packages that have a peer dependency of `"@angular/core": "^5.0.0"` actually
// supports 6.0, by adding that compatibility to the range, so it is `^5.0.0 || ^6.0.0`.
// We export it to allow for testing.
export function angularMajorCompatGuarantee(range: string) {
  let newRange = semver.validRange(range);
  if (!newRange) {
    return range;
  }
  let major = 1;
  while (!semver.gtr(major + '.0.0', newRange)) {
    major++;
    if (major >= 99) {
      // Use original range if it supports a major this high
      // Range is most likely unbounded (e.g., >=5.0.0)
      return newRange;
    }
  }

  // Add the major version as compatible with the angular compatible, with all minors. This is
  // already one major above the greatest supported, because we increment `major` before checking.
  // We add minors like this because a minor beta is still compatible with a minor non-beta.
  newRange = range;
  for (let minor = 0; minor < 20; minor++) {
    newRange += ` || ^${major}.${minor}.0-alpha.0 `;
  }

  return semver.validRange(newRange) || range;
}

// This is a map of packageGroupName to range extending function. If it isn't found, the range is
// kept the same.
const knownPeerCompatibleList: { [name: string]: PeerVersionTransform } = {
  '@angular/core': angularMajorCompatGuarantee,
};

export interface PackageVersionInfo {
  version: VersionRange;
  packageJson: PackageManifest;
  updateMetadata: UpdateMetadata;
}

export interface PackageInfo {
  name: string;
  npmPackageJson: PackageMetadata;
  installed: PackageVersionInfo;
  target?: PackageVersionInfo;
  packageJsonRange: string;
}

export interface UpdateMetadata {
  packageGroupName?: string;
  packageGroup: { [packageName: string]: string };
  migrations?: string;
}

export class UpdateWorkflow {
  constructor(
    private readonly packageManager: PackageManager,
    private readonly logger: logging.LoggerApi,
  ) {}

  private _updatePeerVersion(infoMap: Map<string, PackageInfo>, name: string, range: string) {
    // Resolve packageGroupName.
    const maybePackageInfo = infoMap.get(name);
    if (!maybePackageInfo) {
      return range;
    }
    if (maybePackageInfo.target) {
      name = maybePackageInfo.target.updateMetadata.packageGroupName || name;
    } else {
      name = maybePackageInfo.installed.updateMetadata.packageGroupName || name;
    }

    const maybeTransform = knownPeerCompatibleList[name];
    if (maybeTransform) {
      if (typeof maybeTransform == 'function') {
        return maybeTransform(range);
      } else {
        return maybeTransform;
      }
    }

    return range;
  }

  private _validateForwardPeerDependencies(
    name: string,
    infoMap: Map<string, PackageInfo>,
    peers: { [name: string]: string },
    peersMeta: { [name: string]: { optional?: boolean } },
    logger: logging.LoggerApi,
    next: boolean,
  ): boolean {
    let validationFailed = false;
    for (const [peer, range] of Object.entries(peers)) {
      logger.debug(`Checking forward peer ${peer}...`);
      const maybePeerInfo = infoMap.get(peer);
      const isOptional = peersMeta[peer] && !!peersMeta[peer].optional;
      if (!maybePeerInfo) {
        if (!isOptional) {
          logger.warn(
            [
              `Package ${JSON.stringify(name)} has a missing peer dependency of`,
              `${JSON.stringify(peer)} @ ${JSON.stringify(range)}.`,
            ].join(' '),
          );
        }

        continue;
      }

      const peerVersion =
        maybePeerInfo.target && maybePeerInfo.target.packageJson.version
          ? maybePeerInfo.target.packageJson.version
          : maybePeerInfo.installed.version;

      logger.debug(`  Range intersects(${range}, ${peerVersion})...`);
      if (!semver.satisfies(peerVersion, range, { includePrerelease: next || undefined })) {
        logger.error(
          [
            `Package ${JSON.stringify(name)} has an incompatible peer dependency to`,
            `${JSON.stringify(peer)} (requires ${JSON.stringify(range)},`,
            `would install ${JSON.stringify(peerVersion)})`,
          ].join(' '),
        );

        validationFailed = true;
        continue;
      }
    }

    return validationFailed;
  }

  private _validateReversePeerDependencies(
    name: string,
    version: string,
    infoMap: Map<string, PackageInfo>,
    logger: logging.LoggerApi,
    next: boolean,
  ) {
    for (const [installed, installedInfo] of infoMap.entries()) {
      const installedLogger = logger.createChild(installed);
      installedLogger.debug(`${installed}...`);
      const peers = (installedInfo.target || installedInfo.installed).packageJson.peerDependencies;

      for (const [peer, range] of Object.entries(peers || {})) {
        if (peer != name) {
          // Only check peers to the packages we're updating. We don't care about peers
          // that are unmet but we have no effect on.
          continue;
        }

        // Ignore peerDependency mismatches for these packages.
        // They are deprecated and removed via a migration.
        const ignoredPackages = [
          'codelyzer',
          '@schematics/update',
          '@angular-devkit/build-ng-packagr',
          'tsickle',
          '@nguniversal/builders',
        ];
        if (ignoredPackages.includes(installed)) {
          continue;
        }

        // Override the peer version range if it's known as a compatible.
        const extendedRange = this._updatePeerVersion(infoMap, peer, range);

        if (!semver.satisfies(version, extendedRange, { includePrerelease: next || undefined })) {
          logger.error(
            [
              `Package ${JSON.stringify(installed)} has an incompatible peer dependency to`,
              `${JSON.stringify(name)} (requires`,
              `${JSON.stringify(range)}${extendedRange == range ? '' : ' (extended)'},`,
              `would install ${JSON.stringify(version)}).`,
            ].join(' '),
          );

          return true;
        }
      }
    }

    return false;
  }

  private _getUpdateMetadata(
    packageJson: PackageManifest,
    logger: logging.LoggerApi,
  ): UpdateMetadata {
    const metadata = packageJson['ng-update'];

    const result: UpdateMetadata = {
      packageGroup: {},
    };

    if (!metadata || typeof metadata != 'object' || Array.isArray(metadata)) {
      return result;
    }

    if (metadata['packageGroup']) {
      const packageGroup = metadata['packageGroup'];
      if (Array.isArray(packageGroup) && packageGroup.every((x) => typeof x == 'string')) {
        result.packageGroup = packageGroup.reduce((group, name) => {
          group[name] = packageJson.version;

          return group;
        }, result.packageGroup);
      } else if (
        typeof packageGroup == 'object' &&
        packageGroup &&
        !Array.isArray(packageGroup) &&
        Object.values(packageGroup).every((x) => typeof x == 'string')
      ) {
        result.packageGroup = packageGroup;
      } else {
        logger.warn(`packageGroup metadata of package ${packageJson.name} is malformed. Ignoring.`);
      }

      result.packageGroupName = Object.keys(result.packageGroup)[0];
    }

    if (typeof metadata['packageGroupName'] == 'string') {
      result.packageGroupName = metadata['packageGroupName'];
    }

    if (metadata['migrations']) {
      const migrations = metadata['migrations'];
      if (typeof migrations != 'string') {
        logger.warn(`migrations metadata of package ${packageJson.name} is malformed. Ignoring.`);
      } else {
        result.migrations = migrations;
      }
    }

    return result;
  }

  private async _buildPackageInfo(
    packages: Map<string, VersionRange>,
    allDependencies: ReadonlyMap<string, VersionRange>,
    npmPackageJson: PackageMetadata,
  ): Promise<PackageInfo> {
    const name = npmPackageJson.name;
    const packageJsonRange = allDependencies.get(name);
    if (!packageJsonRange) {
      throw new Error(`Package ${JSON.stringify(name)} was not found in package.json.`);
    }

    // Find out the currently installed version.
    const installedPackage = await this.packageManager.getInstalledPackage(name);
    let installedVersion = installedPackage?.version;
    let installedPackageJson: PackageManifest | null = null;

    if (installedPackage) {
      // Use the manifest from disk if available to get the exact state
      try {
        const fs = await import('node:fs/promises');
        const content = await fs.readFile(
          require.resolve(`${name}/package.json`, { paths: [process.cwd()] }),
          'utf8',
        );
        installedPackageJson = JSON.parse(content) as PackageManifest;
        installedVersion = installedPackageJson.version;
      } catch {
        // Fallback to registry if local read fails or strict mode prevents it
      }
    }

    const packageVersionsNonDeprecated: string[] = [];
    for (const version of npmPackageJson.versions) {
      packageVersionsNonDeprecated.push(version);
    }

    const findSatisfyingVersion = (targetVersion: VersionRange): VersionRange | undefined =>
      semver.maxSatisfying(packageVersionsNonDeprecated, targetVersion) as VersionRange | undefined;

    if (!installedVersion) {
      // Find the version from NPM that fits the range to max.
      installedVersion = findSatisfyingVersion(packageJsonRange);
    }

    if (!installedVersion) {
      throw new Error(
        `An unexpected error happened; could not determine version for package ${name}.`,
      );
    }

    // If we didn't get local manifest, try to fetch from registry
    if (!installedPackageJson && npmPackageJson.versions.includes(installedVersion)) {
      try {
        installedPackageJson = await this.packageManager.getRegistryManifest(
          name,
          installedVersion,
        );
      } catch {}
    }

    if (!installedPackageJson) {
      throw new Error(
        `An unexpected error happened; package ${name} has no version ${installedVersion}.`,
      );
    }

    let targetVersion: VersionRange | undefined = packages.get(name);
    if (targetVersion) {
      if (npmPackageJson['dist-tags'][targetVersion]) {
        targetVersion = npmPackageJson['dist-tags'][targetVersion] as VersionRange;
      } else if (targetVersion == 'next') {
        targetVersion = npmPackageJson['dist-tags']['latest'] as VersionRange;
      } else {
        targetVersion = findSatisfyingVersion(targetVersion);
      }
    }

    if (targetVersion && semver.lte(targetVersion, installedVersion)) {
      this.logger.debug(`Package ${name} already satisfied by package.json (${packageJsonRange}).`);
      targetVersion = undefined;
    }

    let target: PackageVersionInfo | undefined;
    if (targetVersion) {
      const targetManifest = await this.packageManager.getRegistryManifest(name, targetVersion);
      if (targetManifest) {
        target = {
          version: targetVersion,
          packageJson: targetManifest,
          updateMetadata: this._getUpdateMetadata(targetManifest, this.logger),
        };
      }
    }

    return {
      name,
      npmPackageJson,
      installed: {
        version: installedVersion as VersionRange,
        packageJson: installedPackageJson,
        updateMetadata: this._getUpdateMetadata(installedPackageJson, this.logger),
      },
      target,
      packageJsonRange,
    };
  }

  private async _addPackageGroup(
    packages: Map<string, VersionRange>,
    allDependencies: ReadonlyMap<string, VersionRange>,
    npmPackageJson: PackageMetadata,
  ): Promise<void> {
    const maybePackage = packages.get(npmPackageJson.name);
    if (!maybePackage) {
      return;
    }

    const info = await this._buildPackageInfo(packages, allDependencies, npmPackageJson);
    const version =
      (info.target && info.target.version) ||
      npmPackageJson['dist-tags'][maybePackage] ||
      maybePackage;

    let targetManifest = info.target?.packageJson;
    if (!targetManifest || targetManifest.version !== version) {
      targetManifest =
        (await this.packageManager.getRegistryManifest(npmPackageJson.name, version)) || undefined;
    }

    if (!targetManifest) {
      return;
    }
    const ngUpdateMetadata = targetManifest['ng-update'];
    if (!ngUpdateMetadata) {
      return;
    }

    const packageGroup = ngUpdateMetadata['packageGroup'];
    if (!packageGroup) {
      return;
    }
    let packageGroupNormalized: Record<string, string> = {};
    if (Array.isArray(packageGroup) && !packageGroup.some((x) => typeof x != 'string')) {
      packageGroupNormalized = packageGroup.reduce(
        (acc, curr) => {
          acc[curr] = maybePackage;

          return acc;
        },
        {} as { [name: string]: string },
      );
    } else if (
      typeof packageGroup == 'object' &&
      packageGroup &&
      !Array.isArray(packageGroup) &&
      Object.values(packageGroup).every((x) => typeof x == 'string')
    ) {
      packageGroupNormalized = packageGroup;
    } else {
      this.logger.warn(
        `packageGroup metadata of package ${npmPackageJson.name} is malformed. Ignoring.`,
      );

      return;
    }

    for (const [name, value] of Object.entries(packageGroupNormalized)) {
      if (!packages.has(name) && allDependencies.has(name)) {
        packages.set(name, value as VersionRange);
      }
    }
  }

  private async _addPeerDependencies(
    packages: Map<string, VersionRange>,
    allDependencies: ReadonlyMap<string, VersionRange>,
    npmPackageJson: PackageMetadata,
    npmPackageJsonMap: Map<string, PackageMetadata>,
  ): Promise<void> {
    const maybePackage = packages.get(npmPackageJson.name);
    if (!maybePackage) {
      return;
    }

    const info = await this._buildPackageInfo(packages, allDependencies, npmPackageJson);
    const version =
      (info.target && info.target.version) ||
      npmPackageJson['dist-tags'][maybePackage] ||
      maybePackage;

    let targetManifest = info.target?.packageJson;
    if (!targetManifest || targetManifest.version !== version) {
      targetManifest =
        (await this.packageManager.getRegistryManifest(npmPackageJson.name, version)) || undefined;
    }

    if (!targetManifest) {
      return;
    }

    for (const [peer, range] of Object.entries(targetManifest.peerDependencies || {})) {
      if (packages.has(peer)) {
        continue;
      }

      const peerPackageJson = npmPackageJsonMap.get(peer);
      if (peerPackageJson) {
        const peerInfo = await this._buildPackageInfo(packages, allDependencies, peerPackageJson);
        if (semver.satisfies(peerInfo.installed.version, range)) {
          continue;
        }
      }

      packages.set(peer, range as VersionRange);
    }
  }

  async analyze(
    packages: Map<string, VersionRange>,
    allDependencies: ReadonlyMap<string, VersionRange>,
    verbose = false,
    next = false,
    force = false,
  ): Promise<Map<string, PackageInfo>> {
    const npmDeps = new Map(
      [...allDependencies.entries()].filter(([name]) => {
        // Basic filter; in real scenario we'd check registry existence more robustly
        return true;
      }),
    );

    // Initial Metadata Fetch
    const initialDepsToFetch = new Set([...packages.keys(), ...npmDeps.keys()]);
    const allPackageMetadata = await Promise.all(
      Array.from(initialDepsToFetch).map(async (depName) => {
        try {
          return await this.packageManager.getRegistryMetadata(depName);
        } catch {
          return null;
        }
      }),
    );

    const npmPackageJsonMap = allPackageMetadata.reduce((acc, npmPackageJson) => {
      if (npmPackageJson) {
        acc.set(npmPackageJson.name, npmPackageJson);
      }

      return acc;
    }, new Map<string, PackageMetadata>());

    // Expansion Loop
    let lastPackagesSize;
    do {
      lastPackagesSize = packages.size;
      for (const npmPackageJson of npmPackageJsonMap.values()) {
        await this._addPackageGroup(packages, allDependencies, npmPackageJson);
        await this._addPeerDependencies(
          packages,
          allDependencies,
          npmPackageJson,
          npmPackageJsonMap,
        );
      }
    } while (packages.size > lastPackagesSize);

    // Build Final Info Map
    const packageInfoMap = new Map<string, PackageInfo>();
    for (const npmPackageJson of npmPackageJsonMap.values()) {
      packageInfoMap.set(
        npmPackageJson.name,
        await this._buildPackageInfo(packages, allDependencies, npmPackageJson),
      );
    }

    // Validation
    if (packages.size > 0) {
      const sublog = new logging.LevelCapLogger('validation', this.logger.createChild(''), 'warn');
      const peersErrors = this._validateUpdatePackages(packageInfoMap, force, next, sublog);
      if (peersErrors && !force) {
        throw new Error('Incompatible peer dependencies found. Use --force to proceed.');
      }
    }

    return packageInfoMap;
  }

  private _validateUpdatePackages(
    infoMap: Map<string, PackageInfo>,
    force: boolean,
    next: boolean,
    logger: logging.LoggerApi,
  ): boolean {
    logger.debug('Updating the following packages:');
    infoMap.forEach((info) => {
      if (info.target) {
        logger.debug(`  ${info.name} => ${info.target.version}`);
      }
    });

    let peerErrors = false;
    infoMap.forEach((info) => {
      const { name, target } = info;
      if (!target) {
        return;
      }

      const pkgLogger = logger.createChild(name);
      logger.debug(`${name}...`);

      const { peerDependencies = {}, peerDependenciesMeta = {} } = target.packageJson;
      peerErrors =
        this._validateForwardPeerDependencies(
          name,
          infoMap,
          peerDependencies,
          peerDependenciesMeta,
          pkgLogger,
          next,
        ) || peerErrors;
      peerErrors =
        this._validateReversePeerDependencies(name, target.version, infoMap, pkgLogger, next) ||
        peerErrors;
    });

    return peerErrors;
  }
}
