/**
 * @license
 * Copyright Google LLC All Rights Reserved.
 *
 * Use of this source code is governed by an MIT-style license that can be
 * found in the LICENSE file at https://angular.dev/license
 */

export type JsonValue = boolean | string | number | JsonArray | JsonObject | null;

export type JsonObject = {
  [name: string]: JsonValue;
};

export type JsonArray = Array<JsonValue>;

/**
 * Iteratively checks if a value conforms to the JsonValue type, handling circular references.
 * This function is internal and used by `isJsonObject` and `isJsonArray` when deep checking is enabled.
 *
 * @param value The value to check.
 * @returns True if the value is a valid JsonValue, false otherwise.
 */
function isJsonValue(value: unknown): value is JsonValue {
  // A stack is used to simulate recursion for iterative traversal.
  // Each element in the stack is a value to check.
  // To handle cycle detection correctly (supporting DAGs but rejecting cycles), ancestors are tracked.
  // This is done by pushing a 'cleanup' marker for objects onto the stack.
  // When a 'cleanup' marker is encountered, the corresponding object is removed from the 'visited' set.
  const stack: { val: unknown; cleanup: boolean }[] = [{ val: value, cleanup: false }];
  const visited = new Set<unknown>();

  while (stack.length > 0) {
    const current = stack.pop();
    if (current === undefined) {
      // This code path should ideally be unreachable during normal execution.
      // If reached, it indicates an unexpected internal state, which makes the input invalid.
      return false;
    }
    const { val, cleanup } = current;

    if (cleanup) {
      visited.delete(val);
      continue;
    }

    if (
      val === null ||
      typeof val === 'boolean' ||
      typeof val === 'number' ||
      typeof val === 'string'
    ) {
      continue;
    }

    if (typeof val !== 'object') {
      return false;
    }

    if (visited.has(val)) {
      return false;
    }

    // Mark as visited and schedule cleanup
    visited.add(val);
    stack.push({ val, cleanup: true });

    // Push children
    if (Array.isArray(val)) {
      for (const elem of val) {
        stack.push({ val: elem, cleanup: false });
      }
    } else {
      for (const name in val) {
        if (Object.prototype.hasOwnProperty.call(val, name)) {
          stack.push({ val: (val as JsonObject)[name], cleanup: false });
        }
      }
    }
  }

  return true;
}

/**
 * Checks if the value is a JSON object.
 *
 * This checks if the value is a non-null, non-array object.
 * If `deep` is true, it also recursively verifies that all properties are valid JSON values.
 *
 * @param value The value to check.
 * @param deep Whether to recursively check if the object's properties are valid JSON values.
 * @returns True if the value is a JSON object, false otherwise.
 */
export function isJsonObject(value: unknown, deep: boolean = false): value is JsonObject {
  // A JSON object must be a non-null, non-array object.
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    return false;
  }

  // If not performing a deep check, the shallow structural check is sufficient.
  if (!deep) {
    return true;
  }

  // For a deep check, use the iterative `isJsonValue` function.
  return isJsonValue(value);
}

/**
 * Checks if the value is a JSON array.
 *
 * This checks if the value is an array.
 * If `deep` is true, it also recursively verifies that all elements are valid JSON values.
 *
 * @param value The value to check.
 * @param deep Whether to recursively check if the array's elements are valid JSON values.
 * @returns True if the value is a JSON array, false otherwise.
 */
export function isJsonArray(value: unknown, deep: boolean = false): value is JsonArray {
  // A JSON array must be an array.
  if (!Array.isArray(value)) {
    return false;
  }

  // If not performing a deep check, the shallow structural check is sufficient.
  if (!deep) {
    return true;
  }

  // For a deep check, use the iterative `isJsonValue` function.
  return isJsonValue(value);
}
