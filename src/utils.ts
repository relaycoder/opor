/**
 * A simple deep equality check.
 * Handles objects, arrays, and primitives.
 * Does not handle Dates, RegExps, Maps, Sets correctly, but is sufficient for JSON-like data.
 */
export function deepEqual(a: any, b: any): boolean {
  if (a === b) return true;

  if (a && b && typeof a === 'object' && typeof b === 'object') {
    if (a.constructor !== b.constructor) return false;

    let length, i;
    if (Array.isArray(a)) {
      length = a.length;
      if (length !== b.length) return false;
      for (i = length; i-- > 0; ) {
        if (!deepEqual(a[i], b[i])) return false;
      }
      return true;
    }

    const keys = Object.keys(a);
    length = keys.length;
    if (length !== Object.keys(b).length) return false;

    for (i = length; i-- > 0; ) {
      const key = keys[i];
      if (key && (!Object.prototype.hasOwnProperty.call(b, key) || !deepEqual(a[key], b[key])))
        return false;
    }

    return true;
  }

  // true if both NaN, false otherwise
  return a !== a && b !== b;
}