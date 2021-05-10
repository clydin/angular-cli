import { packages } from '../../../../lib/packages';
import { getGlobalVariable } from '../utils/env';
import { npm, silentNpm } from '../utils/process';
import { isPrereleaseCli } from '../utils/project';

async function publishLocal(specifier: string, tags: string[], registry: string): Promise<void> {
  const { stdout: stdoutPack1 } = await silentNpm(
    'pack',
    specifier,
    '--registry=https://registry.npmjs.org',
  );
  for (const tag of tags) {
    await npm('publish', stdoutPack1.trim(), `--registry=${registry}`, `--tag=${tag}`);
  }
}

export default async function () {
  const testRegistry = getGlobalVariable('package-registry');
  const prerelease = isPrereleaseCli();
  await npm(
    'run',
    'admin',
    '--',
    'publish',
    '--no-versionCheck',
    '--no-branchCheck',
    `--registry=${testRegistry}`,
    '--tag',
    prerelease ? 'next' : 'latest',
  );

  const cliVersionParts = packages['@angular/cli'].version.split('.');
  const version = prerelease ? 'next' : `${cliVersionParts[0]}.${cliVersionParts[1]}`;
  const angularPackages = [
    'animations',
    'common',
    'compiler',
    'core',
    'forms',
    'platform-browser',
    'platform-browser-dynamic',
    'router',
  ];
  const ltsVersions = ['8', '9', '10', '11'];
  for (const angularPackage of angularPackages) {
    await publishLocal(`@angular/${angularPackage}@${version}`, ['latest', 'next'], testRegistry);

    for (const ltsVersion of ltsVersions) {
      await publishLocal(
        `@angular/${angularPackage}@${ltsVersion}`,
        [`lts-${ltsVersion}`],
        testRegistry,
      );
    }
  }
}
