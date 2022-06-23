/**
 * @license
 * Copyright Google LLC All Rights Reserved.
 *
 * Use of this source code is governed by an MIT-style license that can be
 * found in the LICENSE file at https://angular.io/license
 */

import { normalize } from '@angular-devkit/core';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { findUp } from './find-up';

const CLI_PACKAGE_NAME = '@angular/cli';

export function findWorkspaceFile(currentDirectory = process.cwd()): string | null {
  const possibleConfigFiles = ['angular.json', '.angular.json'];
  const configFilePath = findUp(possibleConfigFiles, currentDirectory);
  if (configFilePath === null) {
    return null;
  }

  const possibleDir = path.dirname(configFilePath);

  const homedir = os.homedir();
  if (normalize(possibleDir) === normalize(homedir)) {
    const packageJsonPath = path.join(possibleDir, 'package.json');

    try {
      const packageJsonText = fs.readFileSync(packageJsonPath, 'utf-8');
      const packageJson = JSON.parse(packageJsonText) as {
        dependencies?: Record<string, string>;
        devDependencies?: Record<string, string>;
      };
      if (
        !(
          packageJson.dependencies?.[CLI_PACKAGE_NAME] ||
          packageJson.devDependencies?.[CLI_PACKAGE_NAME]
        )
      ) {
        // No CLI dependency
        return null;
      }
    } catch {
      // No or invalid package.json
      return null;
    }
  }

  return configFilePath;
}
