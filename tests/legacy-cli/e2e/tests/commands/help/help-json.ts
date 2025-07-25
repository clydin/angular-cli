import assert from 'node:assert/strict';
import { silentNg } from '../../../utils/process';

export default async function () {
  // This test is use as a sanity check.
  const addHelpOutputSnapshot = JSON.stringify({
    'name': 'config',
    'command': 'ng config [json-path] [value]',
    'shortDescription':
      'Retrieves or sets Angular configuration values in the angular.json file for the workspace.',
    'longDescriptionRelativePath': '@angular/cli/src/commands/config/long-description.md',
    'longDescription':
      'A workspace has a single CLI configuration file, `angular.json`, at the top level.\nThe `projects` object contains a configuration object for each project in the workspace.\n\nYou can edit the configuration directly in a code editor,\nor indirectly on the command line using this command.\n\nThe configurable property names match command option names,\nexcept that in the configuration file, all names must use camelCase,\nwhile on the command line options can be given dash-case.\n\nFor further details, see [Workspace Configuration](reference/configs/workspace-config).\n\nFor configuration of CLI usage analytics, see [ng analytics](cli/analytics).\n',
    'options': [
      {
        'name': 'global',
        'type': 'boolean',
        'aliases': ['g'],
        'default': false,
        'description': "Access the global configuration in the caller's home directory.",
      },
      {
        'name': 'help',
        'type': 'boolean',
        'description': 'Shows a help message for this command in the console.',
      },
      {
        'name': 'json-path',
        'type': 'string',
        'description':
          'The configuration key to set or query, in JSON path format. For example: "a[3].foo.bar[2]". If no new value is provided, returns the current value of this key.',
        'positional': 0,
      },
      {
        'name': 'value',
        'type': 'string',
        'description': 'If provided, a new value for the given configuration key.',
        'positional': 1,
      },
    ],
  });

  const { stdout } = await silentNg('config', '--help', '--json-help');
  const output = JSON.stringify(JSON.parse(stdout.trim()));

  assert.strictEqual(
    output,
    addHelpOutputSnapshot,
    `ng config JSON help output didn\'t match snapshot.`,
  );

  const { stdout: stdout2 } = await silentNg('--help', '--json-help');
  assert.doesNotThrow(
    () => JSON.parse(stdout2.trim()),
    `'ng --help ---json-help' failed to return JSON.`,
  );

  const { stdout: stdout3 } = await silentNg('generate', '--help', '--json-help');
  assert.doesNotThrow(
    () => JSON.parse(stdout3.trim()),
    `'ng generate --help ---json-help' failed to return JSON.`,
  );
}
