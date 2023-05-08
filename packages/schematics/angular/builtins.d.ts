/**
 * @license
 * Copyright Google LLC All Rights Reserved.
 *
 * Use of this source code is governed by an MIT-style license that can be
 * found in the LICENSE file at https://angular.io/license
 */

declare module 'schematics:dependency' {
  export * from '@schematics/angular/utility/dependency';
}

declare module 'schematics:angular' {
  export * from '@schematics/angular/private/components';
  export { Builders as AngularBuilder } from '@schematics/angular/utility/workspace-models';
}
