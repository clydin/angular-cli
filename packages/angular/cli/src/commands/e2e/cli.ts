/**
 * @license
 * Copyright Google LLC All Rights Reserved.
 *
 * Use of this source code is governed by an MIT-style license that can be
 * found in the LICENSE file at https://angular.dev/license
 */

import { MissingTargetChoice } from '../../command-builder/architect-base-command-module';
import { ArchitectCommandModule } from '../../command-builder/architect-command-module';
import { CommandModuleImplementation } from '../../command-builder/command-module';
import { RootCommands } from '../command-config';

export default class E2eCommandModule
  extends ArchitectCommandModule
  implements CommandModuleImplementation
{
  override missingTargetChoices: MissingTargetChoice[] = [
    {
      name: 'Playwright',
      value: 'playwright-ng-schematics',
    },
    {
      name: 'Cypress',
      value: '@cypress/schematic',
    },
    {
      name: 'Nightwatch',
      value: '@nightwatch/schematics',
    },
    {
      name: 'WebdriverIO',
      value: '@wdio/schematics',
    },
    {
      name: 'Puppeteer',
      value: '@puppeteer/ng-schematics',
    },
  ];

  multiTarget = true;
  command = 'e2e [project]';
  aliases = RootCommands['e2e'].aliases;
  describe = 'Builds and serves an Angular application, then runs end-to-end tests.';
  longDescriptionPath?: string;
}
