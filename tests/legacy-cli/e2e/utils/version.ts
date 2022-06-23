import * as fs from 'fs';
import * as semver from 'semver';

export function readNgVersion(): string {
  const packageJson = JSON.parse(
    fs.readFileSync('./node_modules/@angular/core/package.json', 'utf8'),
  ) as { version: string };
  return packageJson['version'];
}

export function ngVersionMatches(range: string): boolean {
  return semver.satisfies(readNgVersion(), range);
}
