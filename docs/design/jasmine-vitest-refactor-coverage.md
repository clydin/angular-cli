# Jasmine to Vitest API Coverage Analysis

## High-Level Summary

The transformer provides **substantial coverage** for the most common parts of the Jasmine API, focusing on patterns that have direct or idiomatic equivalents in Vitest. The goal is not 100% automated migration, as some Jasmine features require manual, context-aware refactoring. For unsupported features, the transformer correctly leaves the code as-is and, in many cases, adds a `TODO` comment to guide the developer.

### Status Definitions

- `✅ **Covered**`: The schematic reliably transforms the API into a functional Vitest equivalent.
- `⚠️ **Partially Covered**`: The schematic attempts a transformation that succeeds for common cases but falls back to adding a `TODO` for more complex or dynamic cases.
- `❌ **Unsupported**`: The schematic makes no attempt to transform the code. Its only action is to identify the API and add a `TODO` comment explaining that manual migration is required.

---

## Detailed API Coverage Breakdown

### 1. Global Test Functions & Keywords

| API                       | Status         | Notes                                                                                |
| :------------------------ | :------------- | :----------------------------------------------------------------------------------- |
| `describe`, `it`          | ✅ **Covered** | Base functions are preserved.                                                        |
| `fdescribe`, `fit`        | ✅ **Covered** | Transformed to `describe.only`, `it.only` by `transformFocusedAndSkippedTests`.      |
| `xdescribe`, `xit`        | ✅ **Covered** | Transformed to `describe.skip`, `it.skip` by `transformFocusedAndSkippedTests`.      |
| `beforeEach`, `afterEach` | ✅ **Covered** | `done` callback is handled by `transformDoneCallback`.                               |
| `beforeAll`, `afterAll`   | ✅ **Covered** | `done` callback is handled by `transformDoneCallback`.                               |
| `pending()`               | ✅ **Covered** | Transformed to a skipped test (`it.skip`) with a TODO comment by `transformPending`. |
| `fail()`                  | ✅ **Covered** | Transformed to `throw new Error()` by `transformFail`.                               |
| `DoneFn` (done callback)  | ✅ **Covered** | Fully handled by `transformDoneCallback`, which converts tests to `async/await`.     |

### 2. Spies (`spyOn`, `createSpy`, etc.)

| API                      | Status                   | Notes                                                                                                                                 |
| :----------------------- | :----------------------- | :------------------------------------------------------------------------------------------------------------------------------------ |
| `spyOn`, `spyOnProperty` | ✅ **Covered**           | Transformed to `vi.spyOn` by `transformSpies`.                                                                                        |
| `spyOnAllFunctions`      | ❌ **Unsupported**       | A `TODO` comment is added, as Vitest has no direct equivalent.                                                                        |
| `jasmine.createSpy`      | ✅ **Covered**           | Transformed to `vi.fn()` by `transformSpies`.                                                                                         |
| `jasmine.createSpyObj`   | ⚠️ **Partially Covered** | `transformCreateSpyObj` handles array and object literals but adds a `TODO` for dynamic variables that cannot be statically analyzed. |
| `spy.and.returnValue`    | ✅ **Covered**           | Transformed to `.mockReturnValue()` by `transformSpies`.                                                                              |
| `spy.and.returnValues`   | ✅ **Covered**           | Transformed to chained `.mockReturnValueOnce()` calls by `transformSpies`.                                                            |
| `spy.and.callFake`       | ✅ **Covered**           | Transformed to `.mockImplementation()` by `transformSpies`.                                                                           |
| `spy.and.callThrough`    | ✅ **Covered**           | The call is removed, as this is the default behavior in Vitest.                                                                       |
| `spy.and.throwError`     | ✅ **Covered**           | Transformed to `.mockImplementation(() => { throw new Error(...) })`.                                                                 |
| `spy.and.resolveTo`      | ✅ **Covered**           | Transformed to `.mockResolvedValue(...)`.                                                                                             |
| `spy.and.rejectWith`     | ✅ **Covered**           | Transformed to `.mockRejectedValue(...)`.                                                                                             |
| `spy.and.stub`           | ✅ **Covered**           | Transformed to `.mockImplementation(() => {})`.                                                                                       |
| `spy.calls.reset`        | ✅ **Covered**           | Transformed to `.mockClear()` by `transformSpyReset`.                                                                                 |
| `spy.calls` inspection   | ✅ **Covered**           | `any`, `count`, `argsFor`, `allArgs`, `all`, `mostRecent`, `first` are handled by `transformSpyCallInspection`.                       |
| `toHaveBeenCalledBefore` | ✅ **Covered**           | Transformed to compare `mock.invocationCallOrder` properties.                                                                         |

### 3. Matchers (`expect(...)`)

Most 1:1 matchers (`toBe`, `toEqual`) are left as-is since they are compatible.

| API                           | Status             | Notes                                                                                                                                     |
| :---------------------------- | :----------------- | :---------------------------------------------------------------------------------------------------------------------------------------- |
| `expect().nothing()`          | ✅ **Covered**     | The statement is removed and a `TODO` comment is added explaining that it is redundant in Vitest.                                         |
| `expect().withContext()`      | ✅ **Covered**     | Transformed to the `expect(..., 'message')` syntax.                                                                                       |
| `expectAsync`                 | ✅ **Covered**     | All matchers (`.toBeResolved`, `.toBeRejectedWith`, etc.) are transformed by `transformExpectAsync`.                                      |
| `toHaveBeenCalledOnceWith`    | ✅ **Covered**     | Transformed into two separate `expect` calls (`toHaveBeenCalledTimes` and `toHaveBeenCalledWith`) by `transformCalledOnceWith`.           |
| Syntactic Sugar Matchers      | ✅ **Covered**     | `toBeTrue`, `toBeFalse`, `toBePositiveInfinity`, `toBeNegativeInfinity`, `toHaveSize` are handled by `transformSyntacticSugarMatchers`.   |
| `toThrowMatching`             | ❌ **Unsupported** | A `TODO` comment is added. Vitest's `toThrow` does not accept a predicate function directly.                                              |
| `toHaveClass` (DOM Matcher)   | ✅ **Covered**     | Transformed to `expect(element.classList.contains(...)).toBe(...)`.                                                                       |
| `toHaveSpyInteractions`       | ❌ **Unsupported** | A specific `TODO` is added, as there is no direct equivalent. Requires manual checking of `mock.calls.length`.                            |
| `expectAsync().toBePending()` | ❌ **Unsupported** | A specific `TODO` is added, as there is no direct equivalent. Requires manual check with `Promise.race`.                                  |
| Most standard matchers        | ✅ **Covered**     | Matchers like `toBe`, `toEqual`, `toContain`, `toThrow`, `toHaveBeenCalled` are compatible with Vitest and do not require transformation. |

### 4. Asymmetric Matchers (`jasmine.any`, etc.)

| API                              | Status             | Notes                                                                                                                                 |
| :------------------------------- | :----------------- | :------------------------------------------------------------------------------------------------------------------------------------ |
| `jasmine.any`                    | ✅ **Covered**     | Transformed to `expect.any` by `transformAsymmetricMatchers`.                                                                         |
| `jasmine.anything`               | ✅ **Covered**     | Transformed to `expect.anything`.                                                                                                     |
| `jasmine.objectContaining`       | ✅ **Covered**     | Transformed to `expect.objectContaining`.                                                                                             |
| `jasmine.arrayContaining`        | ✅ **Covered**     | Transformed to `expect.arrayContaining`.                                                                                              |
| `jasmine.stringMatching`         | ✅ **Covered**     | Transformed to `expect.stringMatching`.                                                                                               |
| `jasmine.stringContaining`       | ✅ **Covered**     | Transformed to `expect.stringContaining`.                                                                                             |
| `jasmine.is`                     | ✅ **Covered**     | When used with `toEqual`, transformed to `.toBe()` by `transformComplexMatchers`.                                                     |
| `jasmine.truthy`, `falsy`        | ✅ **Covered**     | When used with `toEqual`, transformed to `.toBeTruthy()` / `.toBeFalsy()` by `transformComplexMatchers`.                              |
| `jasmine.arrayWithExactContents` | ✅ **Covered**     | Transformed into two `expect` calls (`toHaveLength` and `toEqual(expect.arrayContaining(...))`) by `transformArrayWithExactContents`. |
| `jasmine.empty`                  | ✅ **Covered**     | Transformed to `.toHaveLength(0)`.                                                                                                    |
| `jasmine.notEmpty`               | ✅ **Covered**     | Transformed to `.not.toHaveLength(0)`.                                                                                                |
| `jasmine.mapContaining`          | ❌ **Unsupported** | Vitest does not have a built-in matcher for Maps.                                                                                     |
| `jasmine.setContaining`          | ❌ **Unsupported** | Vitest does not have a built-in matcher for Sets.                                                                                     |

### 5. Other Jasmine APIs

This includes miscellaneous and environment-related APIs, which have **limited but intentional coverage**.

| API                                                                      | Status             | Notes                                                                                                                                      |
| :----------------------------------------------------------------------- | :----------------- | :----------------------------------------------------------------------------------------------------------------------------------------- |
| `jasmine.clock`                                                          | ✅ **Covered**     | `install`, `uninstall`, `tick`, and `mockDate` are transformed to their `vi` equivalents by `transformTimerMocks`.                         |
| `jasmine.DEFAULT_TIMEOUT_INTERVAL`                                       | ✅ **Covered**     | Transformed to `vi.setConfig({ testTimeout: ... })` by `transformDefaultTimeoutInterval`.                                                  |
| `jasmine.addMatchers`                                                    | ❌ **Unsupported** | A `TODO` is added. This requires manual migration to `expect.extend()`, which has a different structure.                                   |
| `jasmine.addCustomEqualityTester`                                        | ❌ **Unsupported** | A `TODO` is added. This requires manual migration to `expect.addEqualityTesters()`.                                                        |
| `jasmine.getEnv` and its methods (`addReporter`, `configure`, `execute`) | ❌ **Unsupported** | A `TODO` is added. Vitest has a different configuration and reporter system, so this requires manual setup.                                |
| `setSpecProperty`, `setSuiteProperty`                                    | ❌ **Unsupported** | A specific `TODO` is added. Vitest has no direct equivalent for attaching metadata to test results at runtime.                             |
| Unknown `jasmine.*` properties                                           | ❌ **Unsupported** | A `TODO` is added for any `jasmine` property not explicitly handled by another transformer. This is a fallback to prevent silent failures. |
