import { execute } from '../../index';
import {
  BASE_OPTIONS,
  describeBuilder,
  UNIT_TEST_BUILDER_INFO,
  setupApplicationTarget,
} from '../setup';

describeBuilder(execute, UNIT_TEST_BUILDER_INFO, (harness) => {
  describe('Behavior: "TestBed.overrideComponent warning in AOT"', () => {
    it('should warn when overrideComponent is called in AOT mode', async () => {
      setupApplicationTarget(harness, {
        aot: true,
      });

      harness.useTarget('test', {
        ...BASE_OPTIONS,
      });

      harness.writeFile(
        'src/app/aot-warning.spec.ts',
        `
        import { Component } from '@angular/core';
        import { TestBed } from '@angular/core/testing';
        import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';

        @Component({
          selector: 'test-comp',
          template: '',
        })
        class TestComponent {}

        describe('Override Warning', () => {
          let warnSpy: any;

          beforeEach(() => {
            warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
          });

          afterEach(() => {
            warnSpy.mockRestore();
          });

          it('should log warning when overriding template', () => {
            TestBed.configureTestingModule({
              imports: [TestComponent],
            }).overrideComponent(TestComponent, {
              set: { template: 'new template' }
            });

            expect(warnSpy).toHaveBeenCalled();
            expect(warnSpy.mock.calls[0][0]).toContain('WARNING: \\'TestBed.overrideComponent\\' was called');
          });

          it('should NOT log warning when only overriding providers', () => {
            TestBed.configureTestingModule({
              imports: [TestComponent],
            }).overrideComponent(TestComponent, {
              set: { providers: [] }
            });

            expect(warnSpy).not.toHaveBeenCalled();
          });
        });
      `,
      );

      // Overwrite default to avoid noise
      harness.writeFile(
        'src/app/app.component.spec.ts',
        `
        import { describe, it, expect } from 'vitest';
        describe('Ignored', () => { it('pass', () => expect(true).toBe(true)); });
      `,
      );

      const { result } = await harness.executeOnce();
      expect(result?.success).toBeTrue();
    });

    it('should NOT warn when overrideComponent is called in JIT mode', async () => {
      setupApplicationTarget(harness, {
        aot: false,
      });

      harness.useTarget('test', {
        ...BASE_OPTIONS,
      });

      harness.writeFile(
        'src/app/jit-no-warning.spec.ts',
        `
        import { Component } from '@angular/core';
        import { TestBed } from '@angular/core/testing';
        import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';

        @Component({
          selector: 'test-comp',
          template: '',
        })
        class TestComponent {}

        describe('JIT No Warning', () => {
          let warnSpy: any;

          beforeEach(() => {
            warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
          });

          afterEach(() => {
            warnSpy.mockRestore();
          });

          it('should not log warning', () => {
            TestBed.configureTestingModule({
              imports: [TestComponent],
            }).overrideComponent(TestComponent, {
              set: { template: 'new template' }
            });

            expect(warnSpy).not.toHaveBeenCalled();
          });
        });
      `,
      );

      // Overwrite default to avoid noise
      harness.writeFile(
        'src/app/app.component.spec.ts',
        `
        import { describe, it, expect } from 'vitest';
        describe('Ignored', () => { it('pass', () => expect(true).toBe(true)); });
      `,
      );

      const { result } = await harness.executeOnce();
      expect(result?.success).toBeTrue();
    });
  });
});
