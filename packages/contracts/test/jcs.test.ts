import { describe, expect, it } from 'vitest';
import { jcsCanonicalize, JcsError } from '../src/jcs.js';

describe('JCS (RFC 8785) canonicalization', () => {
  it('sorts object members by UTF-16 code units', () => {
    expect(jcsCanonicalize({ b: 1, a: 2, A: 3 })).toBe('{"A":3,"a":2,"b":1}');
  });

  it('serializes numbers per ECMAScript shortest round-trip (RFC 8785 §3.2.2.3 examples)', () => {
    expect(jcsCanonicalize(333333333.33333329)).toBe('333333333.3333333');
    expect(jcsCanonicalize(1e30)).toBe('1e+30');
    expect(jcsCanonicalize(4.5)).toBe('4.5');
    expect(jcsCanonicalize(2e-3)).toBe('0.002');
    expect(jcsCanonicalize(1e-27)).toBe('1e-27');
    expect(jcsCanonicalize(0)).toBe('0');
  });

  it('produces no insignificant whitespace and stable nesting', () => {
    expect(jcsCanonicalize({ z: [1, { y: null, x: 'a' }], a: true })).toBe(
      '{"a":true,"z":[1,{"x":"a","y":null}]}',
    );
  });

  it('escapes strings per JSON shortest form', () => {
    expect(jcsCanonicalize('a"b\\c\nd')).toBe('"a\\"b\\\\c\\nd"');
    expect(jcsCanonicalize('€')).toBe('"€"');
  });

  it('rejects non-finite numbers', () => {
    expect(() => jcsCanonicalize(Number.NaN)).toThrow(JcsError);
    expect(() => jcsCanonicalize(Number.POSITIVE_INFINITY)).toThrow(JcsError);
  });

  it('rejects undefined object member values instead of dropping them silently', () => {
    expect(() => jcsCanonicalize({ a: undefined })).toThrow(JcsError);
  });

  it('array undefined holes become null (JSON semantics), arrays keep order', () => {
    expect(jcsCanonicalize([3, 1, 2])).toBe('[3,1,2]');
  });
});
