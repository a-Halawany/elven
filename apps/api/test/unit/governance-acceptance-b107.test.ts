/**
 * B107 §AR (0115_b107_x_ar) — the PURE rules of scope-specific acceptance: the vocabularies mirror the SQL functions; PAT-48's blanket test;
 * the effective scope (FEX-31) and the expansion (ES-71-004) mirrors; the opt-in gate's exemptions and prefix match (Q5); the consequence
 * preview (OBJ-40); and every refusal the §AR ports raise maps centrally to the status its class names, with the SQLSTATE that agrees.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { asObservationRefusal } from '../../src/observation/observation-errors.js';
import {
  CLASSES, EVIDENCE_KINDS, EVIDENCE_SUBJECTS, MIN_OBLIGATIONS, OBLIGATIONS, OBLIGATION_ROLES, OPERATIONAL_SCOPE_KEYS, RECORD_KINDS, SLOTS, acceptanceGateExemption, blanketPath,
  classRank, consequencePreview, effectiveScope, expansion, journeyText, matchesPrefix, matchingCapability, missingScopeKeys, nextCheck, requiredObligations,
} from '../../src/governance/acceptance/acceptance-logic.js';

// the part's section of the folded 0115 (§AR, up to §DG)
const SQL = (() => { const all = readFileSync(fileURLToPath(new URL('../../migrations/0115_b107_governance_registries_acceptance.sql', import.meta.url)), 'utf8'); const x = all.indexOf('-- §AR — scope-specific acceptance records'); const y = all.indexOf('-- §DG — design governance', x + 1); if (x < 0 || y < 0) throw new Error('the folded 0115 lost its section banners'); return all.slice(x, y); })();
/** The ARRAY[...] literal a SQL function returns (the first one after its name). */
function sqlArray(fn: string, after = ''): string[] {
  const at = SQL.indexOf(`FUNCTION governance.${fn}`);
  if (at < 0) throw new Error(`no ${fn} in the migration`);
  const from = after === '' ? at : SQL.indexOf(after, at);
  const a = SQL.indexOf('ARRAY[', from); const b = SQL.indexOf(']', a);
  return SQL.slice(a + 6, b).split(',').map((x) => x.trim().replace(/^'|'$/g, '')).filter((x) => x !== '' && !x.startsWith('::'));
}

describe('§AR · the vocabularies mirror the SQL', () => {
  it('kinds, obligations, evidence kinds and subjects, slots, operational keys', () => {
    expect([...RECORD_KINDS]).toEqual(sqlArray('ar_kinds'));
    expect([...OBLIGATIONS]).toEqual(sqlArray('ar_obligations'));
    expect([...EVIDENCE_KINDS]).toEqual(sqlArray('ar_evidence_kinds'));
    expect([...EVIDENCE_SUBJECTS]).toEqual(sqlArray('ar_evidence_subjects'));
    expect([...OPERATIONAL_SCOPE_KEYS]).toEqual(sqlArray('ar_operational_scope_keys'));
    expect([...SLOTS.operational]).toEqual(sqlArray('ar_slots', "WHEN 'operational'"));
    expect([...SLOTS.capability]).toEqual(sqlArray('ar_slots', "WHEN 'capability'"));
    for (const k of RECORD_KINDS) expect([...MIN_OBLIGATIONS[k]]).toEqual(sqlArray('ar_min_obligations', `WHEN '${k}'`));
    for (const o of OBLIGATIONS) expect([...OBLIGATION_ROLES[o]]).toEqual(sqlArray('ar_obligation_roles', `WHEN '${o}'`));
  });
  it('one role never covers every obligation: every kind\'s minimum spans at least two roles (ES-71-002)', () => {
    for (const k of RECORD_KINDS) expect(new Set(MIN_OBLIGATIONS[k].flatMap((o) => OBLIGATION_ROLES[o])).size, k).toBeGreaterThanOrEqual(2);
  });
});

describe('§AR · PAT-48 and the scope', () => {
  it('blanket values anywhere (a string or an empty list), never a legitimate exact value', () => {
    expect(blanketPath({ roles: ['*'] })).toBe('roles.[0]');
    expect(blanketPath({ journeys: [], data_versions: { a: 'all' } })).toBe('data_versions.a');
    expect(blanketPath({ journeys: ['JRN-12'], period: { from: '2026-10-15', to: '2027-01-01' }, deployment_profile: 'local-dev', note: 'Any day' })).toBeNull();
    expect(blanketPath({ entitlement: ' ANY ' })).toBe('entitlement');
  });
  it('missing keys by kind; the obligations a version will require', () => {
    expect(missingScopeKeys({ journeys: [] }, 'capability')).toEqual(['capability_version', 'roles', 'deployment_profile', 'entitlement', 'data_versions', 'model_versions', 'configuration_digest', 'consequence_class', 'period']);
    expect(missingScopeKeys({}, 'operational')).toEqual(expect.arrayContaining(['artifacts', 'integrations', 'data_classes', 'workloads', 'products', 'infrastructure']));
    expect(requiredObligations('capability', ['security', 'product'])).toEqual(['customer', 'independent_assurance', 'product', 'security']);
    expect(requiredObligations('release', [])).toEqual(['independent_assurance', 'product']);
    expect(classRank('C2')).toBe(3); expect(classRank('C9')).toBeNull(); expect([...CLASSES]).toHaveLength(5);
  });
});

describe('§AR · FEX-31 and ES-71-004 (the mirrors of ar_effective_scope and ar_expansion)', () => {
  const scope = { domain: 'd1', journeys: ['J1', 'J2'], roles: ['r1', 'r2'], deployment_profile: 'local-dev', data_versions: { a: '1', b: '2' }, model_versions: { m: '1' }, consequence_class: 'C2' };
  it('the effective scope removes exactly what the affected items cover; a whole-scope item removes nothing', () => {
    const e = effectiveScope(scope, [{ covers: { journeys: ['J2'], data: ['b'] } }, { covers: {} }]);
    expect(e).toMatchObject({ journeys: ['J1'], roles: ['r1', 'r2'], data_versions: { a: '1' }, removed: { journeys: ['J2'], roles: [], data: ['b'] } });
    expect(effectiveScope(scope, []).journeys).toEqual(['J1', 'J2']);
  });
  it('expansion names a new domain, journey, role, profile, data, model and a higher class — nothing for the same or a narrower scope', () => {
    expect(expansion(scope, { ...scope, domain: 'd2', journeys: ['J1', 'J3'], deployment_profile: 'saas', data_versions: { a: '9', c: '1' }, model_versions: { m: '2', n: '1' }, consequence_class: 'C3', roles: ['r1', 'r9'] }))
      .toEqual(['domain d2', 'journey J3', 'role r9', 'deployment profile saas', 'data c', 'model n', 'consequence class C3']);
    expect(expansion(scope, { ...scope, journeys: ['J1'], consequence_class: 'C1', data_versions: { a: '3' } })).toEqual([]);
  });
});

describe('§AR · the opt-in request gate (Q5)', () => {
  it('never gated: a human gate, the mandatory controls, governance, warnings and attention, corrections and withdrawals, reads', () => {
    const cases: Array<[string, boolean, string | null]> = [
      ['domain.supply.assess', true, 'human_gate'], ['identity.session.create', false, 'mandatory_control'], ['retention.export.request', false, 'mandatory_control'],
      ['governance.acceptance.propose', false, 'governance'], ['executive.attention.item.ack', false, 'warning_control'], ['prediction.warning.raise', false, 'warning_control'],
      ['prediction.forecast.withdraw', false, 'correction_withdrawal'], ['observation.correction.correct_item', false, 'correction_withdrawal'],
      ['observation.source.read', false, 'read_existing'], ['domain.supply.list', false, 'read_existing'],
      ['domain.supply.assess', false, null], ['observation.source.register', false, null],
    ];
    for (const [a, g, x] of cases) expect(acceptanceGateExemption(a, g), a).toBe(x);
  });
  it('the prefix match: a trailing dot covers the family, otherwise exact; the longest enforced prefix wins', () => {
    expect(matchesPrefix('domain.supply.assess', 'domain.supply.')).toBe(true);
    expect(matchesPrefix('domain.supplyx.assess', 'domain.supply.')).toBe(false);
    expect(matchesPrefix('domain.supply.assess', 'domain.supply.assess')).toBe(true);
    expect(matchesPrefix('domain.supply.assessed', 'domain.supply.assess')).toBe(false);
    expect(matchingCapability('domain.supply.assess', [{ capability: 'A', prefixes: ['domain.'] }, { capability: 'B', prefixes: ['domain.supply.'] }])).toBe('B');
    expect(matchingCapability('twin.run', [{ capability: 'A', prefixes: ['domain.'] }])).toBeNull();
  });
});

describe('§AR · OBJ-40 words and the timer', () => {
  it('the consequence preview names the exact scope, the first expiry, the conditions, the exceptions, the release substitution and the claim', () => {
    const lines = consequencePreview({ kind: 'release', subject_key: 'RC-1', obligations: ['independent_assurance', 'product'],
      scope_tuple: { tenant: 't', domain: 'd', deployment_profile: 'local-dev', entitlement: 'x', capability_version: '1', journeys: ['JRN-24'], roles: ['executive'], data_versions: { a: '1' },
                     model_versions: {}, configuration_digest: 'f'.repeat(64), consequence_class: 'C2', period: { from: '2026-10-15', to: '2027-01-01' }, release: { key: 'RC-1' } },
      evidence: [{ valid_until: '2026-12-01T00:00:00Z' }, { valid_until: '2026-11-01T00:00:00Z' }], conditions: [{ key: 'slot:backup', due: '2026-11-10' }], exceptions: [{ key: 'EXC-1', expires_at: '2026-12-31' }] });
    const text = lines.join('\n');
    expect(text).toMatch(/RC-1 becomes ACCEPTED for exactly this scope — and nothing outside it/);
    expect(text).toMatch(/the first expires 2026-11-01T00:00:00Z — at that instant the capability is CONSTRAINED/);
    expect(text).toMatch(/Conditions: 1 open — slot:backup by 2026-11-10/);
    expect(text).toMatch(/Exceptions carried: EXC-1 \(expires 2026-12-31\)/);
    expect(text).toMatch(/not a signed release/);
    expect(lines.at(-1)).toMatch(/^Claim: demonstration — real acceptance .* is R2/);
  });
  it('the next check is the earliest future instant; the journey in words', () => {
    const now = new Date('2026-10-15T12:00:00Z');
    expect(nextCheck({ evidence: [{ valid_until: '2026-10-20T00:00:00Z' }, { valid_until: '2026-10-14T00:00:00Z' }], conditions: [{ due: '2026-10-16' }], period_to: '2027-01-01', review_date: null }, now))
      .toBe('2026-10-17T00:00:00.000Z');
    expect(journeyText({ stages: [{ stage: 'trace', done: true }, { stage: 'build', done: false }], current: 'build' })).toBe('at build — done: trace');
    expect(journeyText({ stages: [{ stage: 'attest', done: true }], current: null })).toBe('complete (attest)');
  });
});

describe('§AR · every refusal the ports raise maps to its class, with an agreeing SQLSTATE', () => {
  const raises = [...SQL.matchAll(/RAISE EXCEPTION '((acceptance record|acceptance attestation) rejected \(([a-z_]+)\)[^']*(?:''[^']*)*)'[\s\S]*?USING ERRCODE = '([0-9A-Z]{5})'/g)];
  it('there are refusals to check', () => { expect(raises.length).toBeGreaterThan(80); });
  it('403 ⇔ 42501 · 404 ⇔ 23503 · 409 ⇔ 23505 · 422 ⇔ 22023, and the central row agrees', () => {
    const expected = (cls: string) => (['actor', 'ownership', 'authority', 'separation_of_duties', 'person', 'access'].includes(cls) ? 403
      : cls.startsWith('unknown_') ? 404 : ['state', 'stale', 'duplicate', 'held', 'expired'].includes(cls) ? 409 : 422);
    const code = { 403: '42501', 404: '23503', 409: '23505', 422: '22023' } as Record<number, string>;
    for (const m of raises) {
      const [, text, , cls, errcode] = m as unknown as [string, string, string, string, string];
      const want = expected(cls);
      expect(errcode, text).toBe(code[want]);
      const mapped = asObservationRefusal(Object.assign(new Error(text.replace(/%/g, 'x')), { code: errcode }), 'c');
      expect(mapped?.getStatus(), text).toBe(want);
    }
  });
});
