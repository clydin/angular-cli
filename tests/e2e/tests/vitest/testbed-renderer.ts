import assert from 'node:assert/strict';
import { writeFile } from '../../utils/fs';
import { applyVitestBuilder } from '../../utils/vitest';
import { ng } from '../../utils/process';

export default async function (): Promise<void> {
  await applyVitestBuilder();
  await ng('generate', 'component', 'my-comp');

  await writeFile(
    'src/app/my-comp/my-comp.component.spec.ts',
    `
    import { TestBed, TestComponentRenderer } from '@angular/core/testing';
    import { BrowserTestingModule } from '@angular/platform-browser/testing';
    import { describe, it, expect } from 'vitest';
    import { MyCompComponent } from './my-comp.component';

    describe('MyCompComponent TestBed Integration', () => {
      it('should instantiate and retrieve TestComponentRenderer cleanly without NG0201', () => {
        const fixture = TestBed.createComponent(MyCompComponent);
        expect(fixture).toBeDefined();

        const injectedRenderer = TestBed.inject(TestComponentRenderer, null);
        expect(injectedRenderer).not.toBeNull();
        expect(injectedRenderer.constructor.name).toMatch(/DOMTestComponentRenderer$/);
      });
    });
  `,
  );

  const { stdout } = await ng('test');

  assert.match(stdout, /1 passed/, 'Expected TestBed integration test to pass successfully.');
}
