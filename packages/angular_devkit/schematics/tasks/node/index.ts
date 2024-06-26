/**
 * @license
 * Copyright Google LLC All Rights Reserved.
 *
 * Use of this source code is governed by an MIT-style license that can be
 * found in the LICENSE file at https://angular.dev/license
 */

import { TaskExecutor, TaskExecutorFactory } from '../../src';
import { NodePackageName, NodePackageTaskFactoryOptions } from '../package-manager/options';
import {
  RepositoryInitializerName,
  RepositoryInitializerTaskFactoryOptions,
} from '../repo-init/options';
import { RunSchematicName } from '../run-schematic/options';

export class BuiltinTaskExecutor {
  static readonly NodePackage: TaskExecutorFactory<NodePackageTaskFactoryOptions> = {
    name: NodePackageName,
    create: (options) =>
      import('../package-manager/executor').then((mod) => mod.default(options)) as Promise<
        TaskExecutor<{}>
      >,
  };
  static readonly RepositoryInitializer: TaskExecutorFactory<RepositoryInitializerTaskFactoryOptions> =
    {
      name: RepositoryInitializerName,
      create: (options) => import('../repo-init/executor').then((mod) => mod.default(options)),
    };
  static readonly RunSchematic: TaskExecutorFactory<{}> = {
    name: RunSchematicName,
    create: () =>
      import('../run-schematic/executor').then((mod) => mod.default()) as Promise<TaskExecutor<{}>>,
  };
}
