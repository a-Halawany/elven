/**
 * GATE-2.2 C11 — STRICT RFC 8785 / I-JSON REJECTION CORPUS.
 *
 * The positive corpus (rfc8785-conformance.test.ts + the cross-language SQL run)
 * proves the canonical BYTES are right. This corpus proves the equally important
 * half: inputs that cannot be represented unambiguously as I-JSON are REJECTED,
 * not silently coerced. A coercion is a silent change of meaning, and two
 * different inputs must never be able to share canonical bytes.
 *
 * Each case below was a real defect before this closure:
 *   * `[undefined]` was converted to `[null]`.
 *   * `[1,,3]` (a hole) serialized to the syntactically INVALID JSON `[1,,3]`.
 *   * lone surrogates were accepted and escaped.
 *   * `new Date()` enumerated to `{}` — identical bytes to an empty object.
 */
import { describe, expect, it } from 'vitest';
import { jcsCanonicalize, jcsBytes, JcsError } from '../src/jcs.js';

describe('C11 — non-finite and non-JSON numeric values are rejected', () => {
  it.each([
    ['NaN', Number.NaN],
    ['Infinity', Number.POSITIVE_INFINITY],
    ['-Infinity', Number.NEGATIVE_INFINITY],
  ])('rejects %s', (_label, v) => {
    expect(() => jcsCanonicalize(v)).toThrow(JcsError);
    expect(() => jcsCanonicalize({ n: v })).toThrow(/non-finite/);
    expect(() => jcsCanonicalize([v])).toThrow(/non-finite/);
  });

  it('rejects bigint rather than guessing a representation', () => {
    expect(() => jcsCanonicalize({ n: 1n })).toThrow(/bigint/);
  });
});

describe('C11 — undefined, functions and symbols are rejected everywhere', () => {
  it('rejects a bare undefined', () => {
    expect(() => jcsCanonicalize(undefined)).toThrow(JcsError);
  });

  it('rejects an undefined OBJECT member instead of dropping the key', () => {
    expect(() => jcsCanonicalize({ a: 1, b: undefined })).toThrow(/undefined member value at key "b"/);
  });

  it('rejects an undefined ARRAY element instead of converting it to null', () => {
    // This is the regression that mattered most: [undefined] and [null] are
    // different inputs and must not share canonical bytes.
    expect(() => jcsCanonicalize([undefined])).toThrow(/undefined array element at index 0/);
    expect(jcsCanonicalize([null])).toBe('[null]');
  });

  it('rejects functions and symbols in both positions', () => {
    expect(() => jcsCanonicalize({ f: () => 1 })).toThrow(/function/);
    expect(() => jcsCanonicalize([Symbol('s')])).toThrow(/symbol/);
  });
});

describe('C11 — sparse arrays are rejected (they produced INVALID JSON)', () => {
  it('rejects a hole rather than emitting an empty slot', () => {
    // eslint-disable-next-line no-sparse-arrays
    const sparse = [1, , 3] as unknown[];
    expect(() => jcsCanonicalize(sparse)).toThrow(/sparse array: index 1 is a hole/);
  });

  it('rejects a trailing hole created by length extension', () => {
    const a: unknown[] = [1];
    a.length = 3;
    expect(() => jcsCanonicalize(a)).toThrow(/sparse array/);
  });

  it('accepts an explicitly dense array', () => {
    expect(jcsCanonicalize([1, null, 3])).toBe('[1,null,3]');
  });
});

describe('C11 — lone UTF-16 surrogates are rejected in values AND keys', () => {
  const HIGH = '\uD800';
  const LOW = '\uDC00';

  it('rejects an unpaired HIGH surrogate in a value', () => {
    expect(() => jcsCanonicalize({ k: `a${HIGH}b` })).toThrow(/unpaired UTF-16 surrogate/);
  });

  it('rejects an unpaired LOW surrogate in a value', () => {
    expect(() => jcsCanonicalize({ k: `a${LOW}b` })).toThrow(/unpaired UTF-16 surrogate/);
  });

  it('rejects a trailing lone high surrogate at end of string', () => {
    expect(() => jcsCanonicalize({ k: `end${HIGH}` })).toThrow(/unpaired UTF-16 surrogate/);
  });

  it('rejects a lone surrogate in an OBJECT KEY', () => {
    expect(() => jcsCanonicalize({ [`bad${HIGH}`]: 1 })).toThrow(/key contains an unpaired UTF-16 surrogate/);
  });

  it('ACCEPTS a well-formed surrogate PAIR (a real supplementary character)', () => {
    // U+1F600 is a legitimate pair and must still canonicalize.
    expect(jcsCanonicalize({ k: '\u{1F600}' })).toBe('{"k":"\u{1F600}"}');
    expect(jcsBytes({ k: '\u{1F600}' }).length).toBeGreaterThan(0);
  });
});

describe('C11 — non-plain objects are rejected (they enumerated to {})', () => {
  it.each([
    ['Date', new Date('2026-08-05T00:00:00.000Z')],
    ['Map', new Map([['a', 1]])],
    ['Set', new Set([1])],
    ['RegExp', /x/],
  ])('rejects %s instead of silently producing {}', (_label, v) => {
    expect(() => jcsCanonicalize({ v })).toThrow(/non-plain object/);
  });

  it('accepts a null-prototype plain object', () => {
    const o = Object.create(null) as Record<string, unknown>;
    o['a'] = 1;
    expect(jcsCanonicalize(o)).toBe('{"a":1}');
  });

  it('a Date and an empty object can no longer share canonical bytes', () => {
    expect(jcsCanonicalize({})).toBe('{}');
    expect(() => jcsCanonicalize(new Date())).toThrow(/non-plain object/);
  });
});
