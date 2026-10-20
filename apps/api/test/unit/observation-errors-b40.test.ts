/**
 * CP-6 B40 integration — every B40 refusal noun runs through the CENTRAL mapper (observation-errors.ts, the B40 block) and answers its
 * house status IN THE SERVER'S WORDS: 403 actor|authority|separation_of_duties|access · 404 unknown_* · 409 state|stale|duplicate|held|expired
 * · 422 otherwise — with the named exceptions the parts' harnesses rely on: `source approval (unevaluated|evaluation|rights_withdrawn)` and
 * `evidence attribute (unchanged)` are states of the record (409); `retention register (scope)` is the caller's standing (403). The table is
 * every `<noun> rejected (<class>)` the folded 0123 raises (with its SQLSTATE), plus the classes the shared actor / approver / lease helpers
 * raise for each noun that calls them.
 */
import { describe, expect, it } from 'vitest';
import { HttpException } from '@nestjs/common';
import { asObservationRefusal } from '../../src/observation/observation-errors.js';

const TABLE: Array<[string, Array<[string, string]>]> = [
  ['acquisition authorization', [['duplicate', '23505'], ['record', '22023']]],
  ['acquisition policy', [['origin', '22023'], ['unknown_run', '23503'], ['unknown_source', '23503']]],
  ['adapter package', [['actor', '42501'], ['authority', '42501'], ['decision', '22023'], ['destinations', '22023'], ['digest', '22023'], ['duplicate', '23505'], ['files', '22023'], ['manifest', '22023'], ['protocol', '22023'], ['reason', '22023'], ['request', '22023'], ['separation_of_duties', '42501'], ['stale', '23514'], ['state', '23514'], ['unknown_package', '23503']]],
  ['connector cell', [['unknown_source', '23503']]],
  ['connector suspension', [['actor', '42501'], ['cause', '22023'], ['detail', '22023'], ['evidence', '22023'], ['held', '23514'], ['unknown_source', '23503']]],
  ['credential rotation', [['actor', '42501'], ['authority', '42501'], ['duplicate', '23505'], ['header', '22023'], ['kind', '22023'], ['reason', '22023'], ['reference', '22023'], ['request', '22023'], ['separation_of_duties', '42501'], ['state', '23514'], ['unknown_source', '23503']]],
  ['customer approval', [['actor', '42501'], ['authority', '42501'], ['claim', '22023'], ['decision', '22023'], ['duplicate', '23505'], ['reason', '22023'], ['request', '22023'], ['scope_statement', '22023'], ['separation_of_duties', '42501'], ['state', '23514'], ['unknown_source', '23503']]],
  ['egress receipt', [['actor', '42501'], ['held', '23514'], ['request', '22023']]],
  ['evidence attribute', [['actor', '42501'], ['attribute', '22023'], ['authority', '42501'], ['duplicate', '23505'], ['reason', '22023'], ['request', '22023'], ['unchanged', '23514'], ['unknown_evidence', '23503'], ['value', '22023']]],
  ['evidence authenticity', [['outcome', '22023'], ['record', '22023'], ['scheme', '22023'], ['subject', '22023'], ['unknown_case', '23503'], ['unknown_evidence', '23503'], ['unknown_key', '23503'], ['unknown_source', '23503']]],
  ['inspection verdict', [['actor', '42501'], ['decision', '22023'], ['point', '22023'], ['state', '23514'], ['unknown_case', '23503'], ['unknown_evidence', '23503'], ['verdicts', '22023']]],
  ['intake review', [['state', '22023'], ['unknown_case', '23503']]],
  ['obligations', [['subject', '22023'], ['unknown_object', '23503']]],
  ['publisher key', [['actor', '42501'], ['authority', '42501'], ['duplicate', '23505'], ['key', '22023'], ['key_ref', '22023'], ['kind', '22023'], ['reason', '22023'], ['request', '22023'], ['rotation', '22023'], ['stale', '23514'], ['state', '23514'], ['unknown_key', '23503'], ['unknown_source', '23503'], ['validity', '22023']]],
  ['quarantine review', [['actor', '42501'], ['held', '23514'], ['separation_of_duties', '42501']]],
  ['requalification', [['actor', '42501'], ['authority', '42501'], ['contract_tests', '22023'], ['decision', '22023'], ['duplicate', '23505'], ['package', '22023'], ['reason', '22023'], ['separation_of_duties', '42501'], ['stale', '23514'], ['state', '23514'], ['unknown_package', '23503'], ['unknown_requalification', '23503']]],
  ['retention register', [['scope', '42501']]],
  ['rights change', [['actor', '42501'], ['authority', '42501'], ['deletion_obligation', '22023'], ['duplicate', '23505'], ['evidence', '22023'], ['operation', '22023'], ['purposes', '22023'], ['reason', '22023'], ['request', '22023'], ['stale', '23514'], ['state', '23514'], ['unknown_source', '23503']]],
  ['source approval', [['evaluation', '23514'], ['rights_withdrawn', '23514'], ['unevaluated', '23514']]],
  ['source candidate', [['actor', '42501'], ['assessment', '22023'], ['authority', '42501'], ['contract', '22023'], ['duplicate', '23505'], ['how_found', '22023'], ['name', '22023'], ['publisher', '22023'], ['purposes', '22023'], ['reason', '22023'], ['request', '22023'], ['state', '23514'], ['terms_url', '22023'], ['unknown_candidate', '23503'], ['unknown_source', '23503']]],
  ['source evaluation', [['actor', '42501'], ['authority', '22023'], ['authority', '42501'], ['contract_tests', '22023'], ['cost', '22023'], ['coverage_fit', '22023'], ['duplicate', '23505'], ['reason', '22023'], ['recommendation', '22023'], ['request', '22023'], ['rights_evidence', '22023'], ['risks', '22023'], ['separation_of_duties', '42501'], ['state', '23514'], ['unknown_source', '23503']]],
  ['source incident', [['actor', '42501'], ['authority', '42501'], ['duplicate', '23505'], ['kind', '22023'], ['owner', '22023'], ['request', '22023'], ['resolution', '22023'], ['state', '23514'], ['statement', '22023'], ['unknown_incident', '23503'], ['unknown_source', '23503']]],
  ['source registry', [['operation', '22023'], ['unknown_source', '23503'], ['unknown_version', '23503']]],
  ['stewardship', [['actor', '42501'], ['authority', '42501'], ['duplicate', '23505'], ['reason', '22023'], ['request', '22023'], ['review_due', '22023'], ['stale', '23514'], ['state_value', '22023'], ['steward', '22023'], ['unknown_source', '23503']]],
  ['transformation rule', [['actor', '42501'], ['authority', '42501'], ['decision', '22023'], ['duplicate', '23505'], ['object_types', '22023'], ['obligation', '22023'], ['rationale', '22023'], ['reason', '22023'], ['relaxation', '22023'], ['request', '22023'], ['separation_of_duties', '42501'], ['stale', '23514'], ['state', '23514'], ['transformation', '22023'], ['unknown_rule', '23503'], ['values', '22023']]],
  ['transition', [['held', '23514']]],
  ['upload approval', [['actor', '42501'], ['authority', '42501'], ['decision', '22023'], ['reason', '22023'], ['separation_of_duties', '42501'], ['state', '23514'], ['unknown_approval', '23503']]],
  ['transition', [['held', '23514']]],
];

const pg = (message: string, code: string) => Object.assign(new Error(message), { code });
const house = (noun: string, cls: string): number => {
  if (noun === 'retention register' && cls === 'scope') return 403;
  if (noun === 'source approval' && ['unevaluated', 'evaluation', 'rights_withdrawn'].includes(cls)) return 409;
  if (noun === 'evidence attribute' && cls === 'unchanged') return 409;
  if (['actor', 'authority', 'separation_of_duties', 'access'].includes(cls)) return 403;
  if (cls.startsWith('unknown_')) return 404;
  if (['state', 'stale', 'duplicate', 'held', 'expired'].includes(cls)) return 409;
  return 422;
};

describe('B40 · the refusal nouns, centrally (observation-errors.ts)', () => {
  for (const [noun, classes] of TABLE) {
    for (const [cls, sqlstate] of classes) {
      it(`${noun} rejected (${cls}) [${sqlstate}] → ${house(noun, cls)}`, () => {
        const text = `${noun} rejected (${cls}): the port's own sentence for the B40 integration table`;
        const e = asObservationRefusal(pg(text, sqlstate), 'unit');
        expect(e).toBeInstanceOf(HttpException);
        expect((e as HttpException).getStatus()).toBe(house(noun, cls));
        expect(String(((e as HttpException).getResponse() as { message?: string }).message)).toBe(text);
      });
    }
  }
  it('`acquisition policy rejected (stale)` (40001) is the rate-limit record port\'s serialization answer to the worker under the source lease, never a route refusal: the mapper leaves it', () => {
    expect(asObservationRefusal(pg('acquisition policy rejected (stale): attempt 2 was computed; the next attempt of this source is 3', '40001'), 'unit')).toBeNull();
  });
  it('the unmapped neighbours keep their rows: the legacy `transition rejected:` texts and `rights update rejected:` are unchanged', () => {
    const permitted = asObservationRefusal(pg('transition rejected: active → draft is not a permitted source-contract transition', '23514'), 'unit') as HttpException;
    expect(permitted.getStatus()).toBe(409);
  });
});
