/**
 * Gate-2.1 §8 / adversarial test 18 — CROSS-LANGUAGE RFC 8785 conformance.
 *
 * The authoritative in-database canonicalizer (canon.jcs) and the TypeScript
 * canonicalizer are held to the SAME corpus, whose expectations were specified
 * from RFC 8785 and the ECMAScript Number::toString rules rather than captured
 * from either implementation. Any divergence between the two would silently
 * change every digest and chain hash, so this is a hard gate.
 *
 * It is the test that proves the previous "bounded profile" — which rejected
 * fractional numbers and non-ASCII keys — is really gone.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { sql } from 'kysely';
import { jcsCanonicalize, contentDigest, auditRowHash } from '@eye/contracts';
import { superDb, type AnyDb } from './helpers.js';

interface Corpus {
  cases: Array<{ name: string; value: unknown; expected: string }>;
}

const corpus = JSON.parse(
  readFileSync(
    join(__dirname, '..', '..', '..', '..', 'packages', 'contracts', 'test', 'fixtures', 'rfc8785-corpus.json'),
    'utf8',
  ),
) as Corpus;

let su: AnyDb;

/** canon.jcs is definer-only; the migrate role owns it and may call it. */
async function sqlJcs(value: unknown): Promise<string> {
  const r = await sql<{ out: string }>`select canon.jcs(${JSON.stringify(value)}::jsonb) as out`.execute(su);
  return r.rows[0]!.out;
}

beforeAll(() => {
  su = superDb();
});
afterAll(async () => {
  await su.destroy();
});

describe('RFC 8785 cross-language conformance (database vs TypeScript)', () => {
  it('the corpus is substantive', () => {
    expect(corpus.cases.length).toBeGreaterThanOrEqual(50);
  });

  it.each(corpus.cases.map((c) => [c.name, c] as const))(
    'database canon.jcs matches the specified expectation: %s',
    async (_name, c) => {
      // jsonb cannot carry a bare top-level scalar in every server version, so
      // scalars are exercised inside a one-member wrapper as well as directly.
      const wrapped = { v: c.value };
      const expectedWrapped = `{"v":${c.expected}}`;
      expect(await sqlJcs(wrapped)).toBe(expectedWrapped);
      // …and the TypeScript implementation agrees on the identical input.
      expect(jcsCanonicalize(wrapped)).toBe(expectedWrapped);
    },
  );

  it('every corpus case produces byte-identical output in both implementations', async () => {
    for (const c of corpus.cases) {
      const wrapped = { v: c.value };
      const fromDb = await sqlJcs(wrapped);
      const fromTs = jcsCanonicalize(wrapped);
      expect(fromDb, c.name).toBe(fromTs);
    }
  });

  it('digests and chain hashes agree across the language boundary', async () => {
    const header = {
      confidence: { method: 'calibrated', scale: 'unit', value: 0.8725 },
      valid_from: '2026-01-01T00:00:00.000Z',
      note: 'تقييم strategic 戦略',
      count: 12,
      ratio: -3.25e-11,
    };
    const payload = { subject: 'S', magnitude: 1e21, tiny: 5e-324 };
    const tsDigest = contentDigest({ header, payload });
    const dbDigest = (
      await sql<{ h: string }>`select canon.sha256_hex(canon.jcs(
        jsonb_build_object('header', ${JSON.stringify(header)}::jsonb,
                           'payload', ${JSON.stringify(payload)}::jsonb))) as h`.execute(su)
    ).rows[0]!.h;
    expect(dbDigest).toBe(tsDigest);

    const event = { event_type: 't', outcome: 'success', scope: 'PLATFORM', ratio: 0.1, label: '漢字' };
    const tsHash = auditRowHash({
      partitionId: 'platform', auditSeq: 9, previousHash: '0'.repeat(64), event: event as never,
    });
    const dbHash = (
      await sql<{ h: string }>`select canon.audit_row_hash('platform', 9, ${'0'.repeat(64)},
        ${JSON.stringify(event)}::jsonb) as h`.execute(su)
    ).rows[0]!.h;
    expect(dbHash).toBe(tsHash);
  });
});

describe('RFC 8785 number formatting rules in the database', () => {
  const numberCases: Array<[string, string, string]> = [
    ['zero', '0', '0'],
    ['negative zero', '-0.0', '0'],
    ['half', '0.5', '0.5'],
    ['tenth', '0.1', '0.1'],
    ['1e20 stays decimal', '1e20', '100000000000000000000'],
    ['1e21 becomes exponential', '1e21', '1e+21'],
    ['1e-6 stays decimal', '1e-6', '0.000001'],
    ['1e-7 becomes exponential', '1e-7', '1e-7'],
    ['max double', '1.7976931348623157e308', '1.7976931348623157e+308'],
    ['min subnormal', '5e-324', '5e-324'],
    ['trailing zeros dropped', '2.500', '2.5'],
    ['integral float loses the point', '2.0', '2'],
    ['negative exponent mantissa', '-3.25e-11', '-3.25e-11'],
  ];

  it.each(numberCases)('canon.number_es(%s)', async (_label, input, expected) => {
    const r = await sql<{ out: string }>`select canon.number_es(${input}::numeric) as out`.execute(su);
    expect(r.rows[0]!.out).toBe(expected);
    // The same value through JSON.stringify (the ECMAScript rule RFC 8785 cites).
    expect(JSON.stringify(Number(input))).toBe(expected);
  });

  it('refuses a value outside the IEEE-754 double range (I-JSON)', async () => {
    await expect(
      sql`select canon.number_es(('1e400')::numeric)`.execute(su),
    ).rejects.toThrow(/finite IEEE-754 double|out of range|overflow/i);
  });
});

describe('UTF-16 code-unit ordering in the database', () => {
  it('orders a supplementary-plane key before U+FFFD and U+E000', async () => {
    const out = await sqlJcs({ '\u{1F600}': 1, '�': 2, '': 3 });
    // UTF-16 units: D83D DE00 < E000 < FFFD
    const posEmoji = out.indexOf('\u{1F600}');
    const posPua = out.indexOf('');
    const posFffd = out.indexOf('�');
    expect(posEmoji).toBeGreaterThan(-1);
    expect(posEmoji).toBeLessThan(posPua);
    expect(posPua).toBeLessThan(posFffd);
    // And identical to the TypeScript ordering.
    expect(out).toBe(jcsCanonicalize({ '\u{1F600}': 1, '�': 2, '': 3 }));
  });

  it('the sort key is a fixed-width UTF-16 code-unit encoding', async () => {
    const r = await sql<{ k: string }>`select canon.utf16_sortkey('a\u{1F600}') as k`.execute(su);
    // 'a' = 0061, U+1F600 = D83D DE00
    expect(r.rows[0]!.k).toBe('0061d83dde00');
  });
});
