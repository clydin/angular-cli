/**
 * @license
 * Copyright Google LLC All Rights Reserved.
 *
 * Use of this source code is governed by an MIT-style license that can be
 * found in the LICENSE file at https://angular.dev/license
 */

import { SchematicTestRunner, UnitTestTree } from '@angular-devkit/schematics/testing';
import { Schema as ApplicationOptions } from '../application/schema';
import { Schema as WorkspaceOptions } from '../workspace/schema';
import { Schema as ClassOptions } from './schema';

describe('Class Schematic', () => {
  const schematicRunner = new SchematicTestRunner(
    '@schematics/angular',
    require.resolve('../collection.json'),
  );
  const defaultOptions: ClassOptions = {
    name: 'foo',
    type: '',
    skipTests: true,
    project: 'bar',
  };

  const workspaceOptions: WorkspaceOptions = {
    name: 'workspace',
    newProjectRoot: 'projects',
    version: '6.0.0',
  };

  const appOptions: ApplicationOptions = {
    name: 'bar',
    inlineStyle: false,
    inlineTemplate: false,
    routing: false,
    skipTests: false,
    skipPackageJson: false,
  };
  let appTree: UnitTestTree;
  beforeEach(async () => {
    appTree = await schematicRunner.runSchematic('workspace', workspaceOptions);
    appTree = await schematicRunner.runSchematic('application', appOptions, appTree);
  });

  it('should create just the class file', async () => {
    const tree = await schematicRunner.runSchematic('class', defaultOptions, appTree);

    expect(tree.files).toContain('/projects/bar/src/app/foo.ts');
    expect(tree.files).not.toContain('/projects/bar/src/app/foo.spec.ts');
  });

  it('should create the class and spec file', async () => {
    const options = {
      ...defaultOptions,
      skipTests: false,
    };
    const tree = await schematicRunner.runSchematic('class', options, appTree);
    expect(tree.files).toContain('/projects/bar/src/app/foo.ts');
    expect(tree.files).toContain('/projects/bar/src/app/foo.spec.ts');
  });

  it('should create an class named "Foo"', async () => {
    const tree = await schematicRunner.runSchematic('class', defaultOptions, appTree);

    const fileContent = tree.readContent('/projects/bar/src/app/foo.ts');
    expect(fileContent).toMatch(/export class Foo/);
  });

  it('should put type in the file name', async () => {
    const options = { ...defaultOptions, type: 'model' };

    const tree = await schematicRunner.runSchematic('class', options, appTree);
    expect(tree.files).toContain('/projects/bar/src/app/foo.model.ts');
  });

  it('should split the name to name & type with split on "."', async () => {
    const options = { ...defaultOptions, name: 'foo.model' };
    const tree = await schematicRunner.runSchematic('class', options, appTree);
    const classPath = '/projects/bar/src/app/foo.model.ts';
    const content = tree.readContent(classPath);
    expect(content).toMatch(/export class FooModel/);
  });

  it('should respect the path option', async () => {
    const options = { ...defaultOptions, path: 'zzz' };
    const tree = await schematicRunner.runSchematic('class', options, appTree);
    expect(tree.files).toContain('/zzz/foo.ts');
  });

  it('should respect the sourceRoot value', async () => {
    const config = JSON.parse(appTree.readContent('/angular.json'));
    config.projects.bar.sourceRoot = 'projects/bar/custom';
    appTree.overwrite('/angular.json', JSON.stringify(config, null, 2));
    appTree = await schematicRunner.runSchematic('class', defaultOptions, appTree);
    expect(appTree.files).toContain('/projects/bar/custom/app/foo.ts');
  });

  it('should respect the skipTests flag', async () => {
    const options = {
      ...defaultOptions,
      skipTests: true,
    };
    const tree = await schematicRunner.runSchematic('class', options, appTree);
    expect(tree.files).toContain('/projects/bar/src/app/foo.ts');
    expect(tree.files).not.toContain('/projects/bar/src/app/foo.spec.ts');
  });

  it('should error when class name contains invalid characters', async () => {
    const options = { ...defaultOptions, name: '1Clazz' };

    await expectAsync(
      schematicRunner.runSchematic('class', options, appTree),
    ).toBeRejectedWithError('Class name "1Clazz" is invalid.');
  });
});
