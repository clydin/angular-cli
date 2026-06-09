/**
 * @license
 * Copyright Google LLC All Rights Reserved.
 *
 * Use of this source code is governed by an MIT-style license that can be
 * found in the LICENSE file at https://angular.dev/license
 */

import { scopeAuthOptions } from './package-metadata';

describe('scopeAuthOptions', () => {
  it('should scope unscoped _authToken to registries', () => {
    const options = {
      _authToken: 'my-token',
    };
    const registries = ['https://registry.npmjs.org/', 'https://npm.pkg.github.com/'];
    const result = scopeAuthOptions(options, registries);
    expect(result['//registry.npmjs.org/:_authToken']).toBe('my-token');
    expect(result['//npm.pkg.github.com/:_authToken']).toBe('my-token');
  });

  it('should scope unscoped username and password to registries', () => {
    const options = {
      username: 'my-user',
      password: 'my-password',
    };
    const registries = ['https://registry.npmjs.org/'];
    const result = scopeAuthOptions(options, registries);
    expect(result['//registry.npmjs.org/:username']).toBe('my-user');
    expect(result['//registry.npmjs.org/:_password']).toBe('my-password');
  });

  it('should scope unscoped _auth token to registries', () => {
    const options = {
      _auth: 'base64auth',
    };
    const registries = ['https://registry.npmjs.org/'];
    const result = scopeAuthOptions(options, registries);
    expect(result['//registry.npmjs.org/:_auth']).toBe('base64auth');
  });

  it('should not overwrite existing scoped auth options', () => {
    const options = {
      _authToken: 'global-token',
      '//registry.npmjs.org/:_authToken': 'specific-token',
    };
    const registries = ['https://registry.npmjs.org/', 'https://npm.pkg.github.com/'];
    const result = scopeAuthOptions(options, registries);
    expect(result['//registry.npmjs.org/:_authToken']).toBe('specific-token');
    expect(result['//npm.pkg.github.com/:_authToken']).toBe('global-token');
  });

  it('should handle registries with pathnames correctly', () => {
    const options = {
      _authToken: 'my-token',
    };
    const registries = ['https://npm.pkg.github.com/angular/'];
    const result = scopeAuthOptions(options, registries);
    expect(result['//npm.pkg.github.com/angular/:_authToken']).toBe('my-token');
  });

  it('should not scope global auth fallback to a registry that already has other auth configured', () => {
    const options = {
      _authToken: 'global-token',
      '//registry.npmjs.org/:username': 'specific-user',
      '//registry.npmjs.org/:_password': 'specific-password',
    };
    const registries = ['https://registry.npmjs.org/'];
    const result = scopeAuthOptions(options, registries);

    expect(result['//registry.npmjs.org/:_authToken']).toBeUndefined();
    expect(result['//registry.npmjs.org/:username']).toBe('specific-user');
  });
});
