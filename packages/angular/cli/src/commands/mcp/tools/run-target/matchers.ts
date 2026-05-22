/**
 * @license
 * Copyright Google LLC All Rights Reserved.
 *
 * Use of this source code is governed by an MIT-style license that can be
 * found in the LICENSE file at https://angular.dev/license
 */

import type { StatusMatcher } from './types';

export const ESBUILD_MATCHER: StatusMatcher = {
  startRegexes: [/❯ Changes detected\. Rebuilding\.\.\./],
  successRegexes: [
    /Application bundle generation complete\./,
    /✔ Changes detected\. Rebuilding\.\.\./,
    /Watch mode enabled\. Watching for file changes\.\.\./,
  ],
  failureRegexes: [/Application bundle generation failed\./],
};

export const WEBPACK_MATCHER: StatusMatcher = {
  startRegexes: [/compiling\.\.\./i],
  successRegexes: [/Compiled successfully\./i],
  failureRegexes: [/Failed to compile\./i],
};

export const GENERIC_FALLBACK_MATCHER: StatusMatcher = {
  startRegexes: [/rebuilding\.\.\./i, /compiling\.\.\./i, /re-running/i],
  successRegexes: [/success/i, /complete/i, /compiled/i, /ready/i],
  failureRegexes: [/failed/i, /error/i],
};

/**
 * Resolves the appropriate StatusMatcher based on the builder name.
 */
export function getStatusMatcher(builder?: string): StatusMatcher {
  if (!builder) {
    return GENERIC_FALLBACK_MATCHER;
  }

  if (
    builder === '@angular/build:application' ||
    builder === '@angular-devkit/build-angular:application'
  ) {
    return ESBUILD_MATCHER;
  }

  if (
    builder === '@angular-devkit/build-angular:browser' ||
    builder === '@angular-devkit/build-angular:dev-server'
  ) {
    return WEBPACK_MATCHER;
  }

  return GENERIC_FALLBACK_MATCHER;
}
