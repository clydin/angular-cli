/**
 * @license
 * Copyright Google LLC All Rights Reserved.
 *
 * Use of this source code is governed by an MIT-style license that can be
 * found in the LICENSE file at https://angular.dev/license
 */

import type { json } from '@angular-devkit/core';
import { Rule, SchematicContext, Tree, chain } from '@angular-devkit/schematics';
import { DependencyType, ExistingBehavior, addDependency } from '../../utility/dependency';
import { latestVersions } from '../../utility/latest-versions';
import { allTargetOptions, updateWorkspace } from '../../utility/workspace';
import { Builders } from '../../utility/workspace-models';
import { analyzeKarmaConfig } from '../karma/karma-config-analyzer';
import { compareKarmaConfigToDefault, hasDifferences } from '../karma/karma-config-comparer';

function updateProjects(tree: Tree, context: SchematicContext): Rule {
  return updateWorkspace(async (workspace) => {
    let hasMigratedAny = false;
    let needsCoverage = false;
    const removableKarmaConfigs = new Map<string, boolean>();

    for (const [projectName, project] of workspace.projects) {
      // Find the test target to migrate
      const testTarget = project.targets.get('test');
      if (!testTarget) {
        continue;
      }

      let isKarma = false;
      let needDevkitPlugin = false;
      // Check if target uses legacy Karma builders
      switch (testTarget.builder) {
        case Builders.Karma:
          isKarma = true;
          needDevkitPlugin = true;
          break;
        case Builders.BuildKarma:
          isKarma = true;
          break;
      }

      if (!isKarma) {
        continue;
      }

      // Store custom build options to move to a new build configuration if needed
      // Match Karma behavior where AOT was disabled by default
      const customBuildOptions: Record<string, json.JsonValue | undefined> = {
        aot: false,
        optimization: false,
        extractLicenses: false,
      };
      // List of build options that are supported by the new unit-test builder
      const buildOptionsKeys = [
        'assets',
        'styles',
        'scripts',
        'polyfills',
        'inlineStyleLanguage',
        'stylePreprocessorOptions',
        'externalDependencies',
        'loader',
        'define',
        'fileReplacements',
        'webWorkerTsConfig',
        'aot',
      ];

      for (const [, options] of allTargetOptions(testTarget, false)) {
        // Collect custom build options
        for (const key of buildOptionsKeys) {
          if (options[key] !== undefined) {
            customBuildOptions[key] = options[key];
            delete options[key];
          }
        }

        // Map Karma options to Unit-Test options
        if (options['codeCoverage'] !== undefined) {
          options['coverage'] = options['codeCoverage'];
          delete options['codeCoverage'];
        }

        if (options['codeCoverageExclude'] !== undefined) {
          options['coverageExclude'] = options['codeCoverageExclude'];
          delete options['codeCoverageExclude'];
        }

        if (options['coverage'] === true || options['coverageExclude'] !== undefined) {
          needsCoverage = true;
        }

        if (options['sourceMap'] !== undefined) {
          context.logger.info(
            `Project "${projectName}" has "sourceMap" set for tests. ` +
              `In unit-test builder with Vitest, source maps are always enabled. The option has been removed.`,
          );
          delete options['sourceMap'];
        }

        // Convert browser list to array format if it is a comma-separated string
        const browsers = options['browsers'];
        if (typeof browsers === 'string') {
          options['browsers'] = browsers.split(',').map((b) => b.trim());
        } else if (browsers === false) {
          options['browsers'] = [];
        }

        // Check if the karma configuration file can be safely removed
        const karmaConfig = options['karmaConfig'];
        if (typeof karmaConfig === 'string') {
          let isRemovable = removableKarmaConfigs.get(karmaConfig);
          if (isRemovable === undefined && tree.exists(karmaConfig)) {
            const content = tree.readText(karmaConfig);
            const analysis = analyzeKarmaConfig(content);

            if (analysis.hasUnsupportedValues) {
              isRemovable = false;
            } else {
              const diff = await compareKarmaConfigToDefault(
                analysis,
                projectName,
                karmaConfig,
                needDevkitPlugin,
              );
              isRemovable = !hasDifferences(diff) && diff.isReliable;
            }
            removableKarmaConfigs.set(karmaConfig, isRemovable);
          }

          if (isRemovable) {
            tree.delete(karmaConfig);
          } else {
            context.logger.warn(
              `Project "${projectName}" uses a custom Karma configuration file "${karmaConfig}". ` +
                `Tests have been migrated to use Vitest, but you may need to manually migrate custom settings ` +
                `from this Karma config to a Vitest config (e.g. vitest.config.ts).`,
            );
          }
        }

        // Map the main entry file to the setupFiles of the unit-test builder
        const mainFile = options['main'];
        if (typeof mainFile === 'string') {
          options['setupFiles'] = [...((options['setupFiles'] as string[]) || []), mainFile];

          context.logger.info(
            `Project "${projectName}" uses a "main" entry file for tests: "${mainFile}". ` +
              `This has been mapped to the unit-test builder "setupFiles" array. ` +
              `Please ensure you remove any TestBed.initTestEnvironment calls from this file ` +
              `as the builder now handles test environment initialization automatically.`,
          );
        }
        delete options['main'];
      }

      // If we have custom build options, create a testing configuration
      if (Object.keys(customBuildOptions).length > 0) {
        const buildTarget = project.targets.get('build');
        if (buildTarget) {
          buildTarget.configurations ??= {};

          let configName = 'testing';
          if (buildTarget.configurations[configName]) {
            let counter = 1;
            while (buildTarget.configurations[`${configName}-${counter}`]) {
              counter++;
            }
            configName = `${configName}-${counter}`;
          }

          buildTarget.configurations[configName] = { ...customBuildOptions };

          testTarget.options ??= {};
          testTarget.options['buildTarget'] = `:build:${configName}`;
        }
      }

      // Update builder
      testTarget.builder = '@angular/build:unit-test';
      testTarget.options ??= {};
      testTarget.options['runner'] = 'vitest';

      hasMigratedAny = true;
    }

    if (hasMigratedAny) {
      const rules = [
        addDependency('vitest', latestVersions['vitest'], {
          type: DependencyType.Dev,
          existing: ExistingBehavior.Skip,
        }),
      ];

      if (needsCoverage) {
        rules.push(
          addDependency('@vitest/coverage-v8', latestVersions['@vitest/coverage-v8'], {
            type: DependencyType.Dev,
            existing: ExistingBehavior.Skip,
          }),
        );
      }

      return chain(rules);
    }
  });
}

export default function (): Rule {
  return updateProjects;
}
