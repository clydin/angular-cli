/**
 * @license
 * Copyright Google LLC All Rights Reserved.
 *
 * Use of this source code is governed by an MIT-style license that can be
 * found in the LICENSE file at https://angular.dev/license
 */

import { buildApplication } from '../../index';
import { APPLICATION_BUILDER_INFO, BASE_OPTIONS, describeBuilder } from '../setup';

describeBuilder(buildApplication, APPLICATION_BUILDER_INFO, (harness) => {
  describe('Behavior: "Supports Proto compilation via imports"', () => {
    const protoSchema = `
      syntax = "proto3";
      package awesomepackage;
      message AwesomeMessage {
        string awesome_field = 1;
      }
    `;

    it('should compile proto schema to a dynamic loader module and load it', async () => {
      harness.useTarget('build', {
        ...BASE_OPTIONS,
      });

      // Write .proto schema
      await harness.writeFile('src/awesome.proto', protoSchema);

      // Write TS file importing the proto
      await harness.writeFile(
        'src/main.ts',
        `
          // @ts-ignore
          import awesome from './awesome.proto';

          console.log(awesome);
          const type = awesome.lookupType('awesomepackage.AwesomeMessage');
          console.log(type.name);
        `,
      );

      const { result } = await harness.executeOnce();
      expect(result?.success).toBeTrue();

      const mainOutput = harness.expectFile('dist/browser/main.js').content;
      // Ensure the generated code imports protobufjs/light
      expect(mainOutput).toContain('protobufjs/light');
      // Ensure the json descriptor is compiled into the source
      expect(mainOutput).toContain('awesome_field');
      expect(mainOutput).toContain('awesomepackage');
    });

    it('should support loading raw proto schema text via with { loader: "text" }', async () => {
      harness.useTarget('build', {
        ...BASE_OPTIONS,
      });

      await harness.writeFile('src/awesome.proto', protoSchema);

      await harness.writeFile(
        'src/main.ts',
        `
          // @ts-ignore
          import awesomeRawText from './awesome.proto' with { loader: 'text' };

          console.log(awesomeRawText);
        `,
      );

      const { result } = await harness.executeOnce();
      expect(result?.success).toBeTrue();

      const mainOutput = harness.expectFile('dist/browser/main.js').content;
      console.log('--- DEBUG MAIN OUTPUT: ', mainOutput);
      // Should not import protobufjs/light
      expect(mainOutput).not.toContain('protobufjs/light');
      // Should contain the raw string content
      expect(mainOutput).toContain('message AwesomeMessage');
    });

    it('should fail build and report compiler errors if proto is invalid', async () => {
      harness.useTarget('build', {
        ...BASE_OPTIONS,
      });

      // Write invalid proto
      await harness.writeFile(
        'src/awesome.proto',
        `
          syntax = "proto3";
          invalid line;
        `,
      );

      await harness.writeFile(
        'src/main.ts',
        `
          // @ts-ignore
          import awesome from './awesome.proto';
          console.log(awesome);
        `,
      );

      const { result } = await harness.executeOnce();
      expect(result?.success).toBeFalse();
      expect(result?.errors?.[0]?.text).toContain('Protobuf compilation failed');
    });
  });
});
