/**
 * Gate-2.1 §8 / adversarial test 18 — RFC 8785 conformance of the TypeScript
 * canonicalizer, driven by the SAME corpus that the database implementation is
 * held to (see apps/api/test/int/rfc8785-crosslang.test.ts, which runs every
 * case through canon.jcs and asserts byte equality with these expectations).
 *
 * The corpus deliberately includes the cases the previous bounded profile got
 * wrong: fractional numbers, exponent boundaries (1e20/1e21, 1e-6/1e-7),
 * negative zero, subnormals, Unicode and supplementary-plane keys whose UTF-16
 * code-unit order differs from byte and code-point order, and multilingual values.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { jcsCanonicalize, jcsBytes, JcsError } from '../src/jcs.js';

interface Corpus {
  cases: Array<{ name: string; value: unknown; expected: string; $comment?: string }>;
  reject: Array<{ name: string; reason: string }>;
}

const corpus = JSON.parse(
  readFileSync(join(__dirname, 'fixtures', 'rfc8785-corpus.json'), 'utf8'),
) as Corpus;

describe('RFC 8785 conformance corpus (TypeScript)', () => {
  it('the corpus is substantive', () => {
    expect(corpus.cases.length).toBeGreaterThanOrEqual(50);
  });

  it.each(corpus.cases.map((c) => [c.name, c] as const))('%s', (_name, c) => {
    expect(jcsCanonicalize(c.value)).toBe(c.expected);
  });

  it('canonical bytes are UTF-8 of the canonical string', () => {
    for (const c of corpus.cases) {
      expect(new TextDecoder().decode(jcsBytes(c.value))).toBe(c.expected);
    }
  });
});

describe('RFC 8785 / I-JSON validity rules (TypeScript)', () => {
  it('rejects NaN and both infinities', () => {
    for (const bad of [Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY]) {
      expect(() => jcsCanonicalize(bad)).toThrow(JcsError);
      expect(() => jcsCanonicalize({ v: bad })).toThrow(JcsError);
      expect(() => jcsCanonicalize([bad])).toThrow(JcsError);
    }
  });

  it('rejects an exponent that overflows the double range', () => {
    // 1e400 parses to Infinity in ECMAScript, so it must be refused.
    expect(() => jcsCanonicalize(Number('1e400'))).toThrow(JcsError);
  });

  it('rejects undefined members rather than silently dropping them', () => {
    expect(() => jcsCanonicalize({ a: undefined })).toThrow(JcsError);
  });

  it('rejects bigint rather than coercing it', () => {
    expect(() => jcsCanonicalize({ a: 1n })).toThrow(JcsError);
  });

  it('sorts by UTF-16 code units, not code points', () => {
    // U+1F600 encodes as D83D DE00; U+FFFD is a single unit FFFD. D83D < FFFD,
    // so the supplementary key sorts FIRST even though its code point is larger.
    const out = jcsCanonicalize({ '\u{1F600}': 1, '�': 2 });
    expect(out.indexOf('\u{1F600}')).toBeLessThan(out.indexOf('�'));
  });

  it('negative zero and positive zero share canonical bytes', () => {
    expect(jcsCanonicalize(-0)).toBe('0');
    expect(jcsCanonicalize(0)).toBe('0');
  });
});
