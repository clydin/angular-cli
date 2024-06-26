/**
 * @license
 * Copyright Google LLC All Rights Reserved.
 *
 * Use of this source code is governed by an MIT-style license that can be
 * found in the LICENSE file at https://angular.dev/license
 */

import { jobs } from '@angular-devkit/architect';
import * as path from 'path';
import { lastValueFrom } from 'rxjs';
import { NodeModuleJobRegistry } from './job-registry';

const root = path.join(__dirname, '../../../../../tests/angular_devkit/architect/node/jobs');

describe('NodeModuleJobScheduler', () => {
  it('works', async () => {
    const registry = new NodeModuleJobRegistry();
    const scheduler = new jobs.SimpleScheduler(registry);

    const job = scheduler.schedule(path.join(root, 'add'), [1, 2, 3]);
    expect(await lastValueFrom(job.output)).toBe(6);
  });
});
