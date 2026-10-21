/**
 * B40 §VA — the pure models of the authenticity pages (lib/authenticity-b40): the outcome words (never colour alone), the key register, one
 * evidence object's authenticity (the hosted journey 7's sentence kept EXACTLY for an item with no recorded outcome), the inherited
 * obligations, the per-tenant retention register and the forms' unmet conditions. Every row here is SYNTHETIC; no key literal (a
 * fingerprint is assembled from parts).
 */
import { describe, expect, it } from 'vitest';
import {
  AUTHENTICITY_OUTCOMES, OUTCOME_WORDS, UNKNOWN_NOTE, asOutcome, attributeFormProblems, attributeValue, attributeValueText, contentAuthenticityNote, decisionUse,
  keyFormProblems, ruleFormProblems, schemeStatement, toEvidenceAuthenticity, toKeyRegister, toObligations, toRetentionRegister, toRules, typesOf,
} from './authenticity-b40';

const FP = ['ed25519', 'a1b2c3d4e5f60718'].join(':');

describe('the outcomes, in words', () => {
  it('each outcome has its own glyph and word; an unknown value is not_recorded; only VERIFIED establishes, only FAILED is refused', () => {
    const glyphs = AUTHENTICITY_OUTCOMES.map((o) => OUTCOME_WORDS[o].glyph);
    expect(new Set(glyphs).size).toBe(glyphs.length);
    expect(asOutcome('verified')).toBe('verified');
    expect(asOutcome('something')).toBe('not_recorded');
    expect(decisionUse('verified')).toBe('established');
    expect(decisionUse('failed')).toBe('refused');
    for (const o of ['unsigned', 'unavailable', 'not_recorded'] as const) expect(decisionUse(o)).toBe('unknown');
    expect(OUTCOME_WORDS.failed.sentence).toMatch(/admitted marked, readable, refused at every decision-active use/);
  });
});

describe('the key register and one evidence object', () => {
  const read = { as_of: '2026-10-21T00:00:00Z', sources: [{ source_id: 's1', source_key: 'djibouti-customs', name: 'Djibouti customs (SYNTHETIC)',
    versions: [{ contract_version: 1, lifecycle_state: 'active', v4: true, scheme: 'ed25519_detached', key_refs: ['customs-2026'], tls_spki_pins: [] }],
    keys: [{ key_id: 'k1', key_ref: 'customs-2026', kind: 'signing_key', algorithm: 'Ed25519', fingerprint: FP, state: 'in_force', valid_from: '2026-10-20T00:00:00Z', valid_to: null }],
    events: [{ event: 'key.declared', key_id: 'k1', actor: 'p1', at: '2026-10-20T00:00:00Z', details: { reason: 'the key page (SYNTHETIC)' } }],
    outcomes: { verified: 1, failed: 1, unsigned: 0, unavailable: 0, unknown_signer: 1, last_recorded_at: null } }] };
  it('a source, its scheme in words, its keys and its outcomes', () => {
    const r = toKeyRegister(read);
    expect(r.sources[0]).toMatchObject({ name: 'Djibouti customs (SYNTHETIC)', keys: [{ keyRef: 'customs-2026', fingerprint: FP, state: 'in_force' }], outcomes: { failed: 1, unknown_signer: 1 } });
    expect(schemeStatement(r.sources[0]!)).toBe('contract v1 declares detached Ed25519 signatures under key reference customs-2026');
    expect(schemeStatement({ ...r.sources[0]!, versions: [{ ...r.sources[0]!.versions[0]!, v4: false, scheme: null }] })).toMatch(/^contract v1 \(SRC@v1–v3\) declares no publisher signature scheme — content authenticity unknown; not recorded before B40$/);
  });
  it('a v1–v3 version reads "not recorded before B40" and the page keeps the hosted journey 7\'s sentence EXACTLY', () => {
    const v = toEvidenceAuthenticity({ versions: [{ version: 1, v4: false, authenticity: { outcome: 'not_recorded', statement: 'not recorded before B40 — …' }, attributes: { recorded: false, statement: 'not recorded before B40 — …' } }] });
    expect(v[0]).toMatchObject({ outcome: 'not_recorded', attributes: { recorded: false } });
    expect(contentAuthenticityNote(v[0]!)).toEqual({ kind: 'unknown' });
    expect(contentAuthenticityNote(null)).toEqual({ kind: 'unknown' });
    const text = `${UNKNOWN_NOTE.lead} ${UNKNOWN_NOTE.strong}${UNKNOWN_NOTE.rest}`;
    expect(text).toMatch(/^Content authenticity is unknown, and that is the honest answer rather than a gap\./);
    expect(text).toMatch(/Neither establishes that the content is genuinely the publisher/);
  });
  it('a FAILED version says it stays admitted and readable and is refused at decision-active use; VERIFIED names its key', () => {
    const [f, ok] = toEvidenceAuthenticity({ versions: [
      { version: 2, v4: true, scheme: 'ed25519_detached', authenticity: { outcome: 'failed', detail: { statement: 'the detached Ed25519 signature did not verify' } }, attributes: { recorded: true, current: {}, history: [] } },
      { version: 1, v4: true, scheme: 'ed25519_detached', authenticity: { outcome: 'verified', key: read.sources[0]!.keys[0], signature_digest: 'ab'.repeat(32) },
        attributes: { recorded: true, current: { language: { value: 'fr', basis: 'steward', basis_ref: 'principal:p1', reason: 'published in French' }, geographic_scope: { value: ['Djibouti'], basis: 'source_contract', basis_ref: 'SRC:s1@1' } },
          history: [{ attribute: 'language', value: 'en', basis: 'source_contract' }, { attribute: 'language', value: 'fr', basis: 'steward' }] } },
    ] });
    const n = contentAuthenticityNote(f!);
    expect(n).toMatchObject({ kind: 'recorded', outcome: 'failed' });
    expect((n as { text: string }).text).toMatch(/^AUTHENTICITY FAILED: the detached Ed25519 signature did not verify\. The evidence stays admitted and readable; it is shown weak and refused at every decision-active use/);
    expect((contentAuthenticityNote(ok!) as { text: string }).text).toMatch(new RegExp(`^VERIFIED: .* Key ${FP} \\(customs-2026\\), in force\\.`));
    expect(ok!.attributes.current.map((a) => a.attribute)).toEqual(['geographic_scope', 'language']);
    expect(attributeValueText(ok!.attributes.current[0]!)).toBe('Djibouti');
    expect(attributeValueText({ attribute: 'licence', value: { contract_licence: 'synthetic-test-licence', statement: 'the contract’s licence stands' } })).toBe('the contract’s licence stands — contract licence: synthetic-test-licence');
  });
});

describe('the inherited obligations and the rules', () => {
  it('each obligation carries its status words; D22\'s NULL header reads as carried; the rule register keeps the digest', () => {
    const v = toObligations({ ref: 'CLM:c1@1', open_findings: 1, inputs: { objects: 3, evidence: 1, truncated: false }, header_basis: { statement: 'recorded before B50 — no header basis is recorded for this version' },
      limitations: ['the location, model, agent and side-effect policy dimensions are B62\'s (F-P7D-04) — not folded here'],
      obligations: [
        { obligation: 'classification', inherited: 'internal', header: 'public', status: 'not_satisfied', detail: 'less restrictive', imposed_by: ['EVD:e1@1'], rule: null },
        { obligation: 'residency', inherited: 'EU', header: null, status: 'carried', detail: 'a meaningful NULL', imposed_by: { EU: ['EVD:e1@1'] }, rule: null },
        { obligation: 'rights', inherited: { prohibited_uses: ['redistribution'], permitted_purposes: null, withdrawn_or_expired: [] }, header: null, status: 'carried', detail: '', imposed_by: [], rule: null },
      ] });
    expect(v.obligations.map((o) => o.statusWords.slice(0, 1))).toEqual(['✕', '→', '→']);
    expect(v.obligations[1]).toMatchObject({ inherited: 'EU', header: null, imposedBy: ['EU: 1 input(s)'] });
    expect(v.obligations[2]!.inherited).toBe('prohibited: redistribution · permitted purposes: no terms declared');
    expect(v.basis).toMatch(/^recorded before B50/);
    expect(toRules({ rules: [{ rule_id: 'r1', digest: 'd'.repeat(64), obligation: 'classification', transformation: 'aggregation', from_value: 'internal', to_value: 'public', object_types: ['CLM'], rationale: 'x', state: 'proposed', events: [] }] })[0])
      .toMatchObject({ digest: 'd'.repeat(64), from: 'internal', to: 'public', types: ['CLM'], state: 'proposed' });
  });
});

describe('the per-tenant retention register', () => {
  it('domains, schedules (evidence, overdue, next expiry, held, open actions) and the unscheduled profiles', () => {
    const r = toRetentionRegister({ as_of: 't', domains: [{ domain_id: 'd1', name: 'Supply Corridor Intelligence (SYNTHETIC)', status: 'active', evidence: 12, holds: 1,
      schedules: [{ schedule_id: 's1', retention_profile: '24 months', action_kind: 'review', target_kind: 'evidence', due_after: '400 days', state: 'active', evidence: 4, overdue: 0, next_expiry: '2027-11-24T00:00:00Z', held: 1, open_actions: 0 }],
      unscheduled_profiles: [{ retention_profile: 'default', evidence: 8, oldest: '2026-09-01T00:00:00Z' }] }] });
    expect(r.domains[0]).toMatchObject({ evidence: 12, holds: 1, schedules: [{ profile: '24 months', evidence: 4, overdue: 0, nextExpiry: '2027-11-24T00:00:00Z', held: 1 }], unscheduled: [{ profile: 'default', evidence: 8 }] });
  });
});

describe('the forms\' unmet conditions (the server re-checks every one)', () => {
  it('the key form', () => {
    expect(keyFormProblems({ sourceId: '', keyRef: 'x', kind: 'signing_key', pem: 'not a pem', pin: '', reason: 'short' })).toHaveLength(4);
    expect(keyFormProblems({ sourceId: 's1', keyRef: 'customs-pin', kind: 'tls_spki_pin', pem: '', pin: `${'A'.repeat(43)}=`, reason: 'the portal’s TLS key (SYNTHETIC)' })).toEqual([]);
  });
  it('the rule form: types are three capitals and never evidence; a rationale of 20+', () => {
    expect(ruleFormProblems({ obligation: 'sensitivity', transformation: 'aggregation', from: 'commercial', to: 'none', types: 'CLM, FCT', rationale: 'aggregates carry no commercial detail' })).toEqual([]);
    expect(ruleFormProblems({ obligation: 'x', transformation: 'Agg', from: 'a', to: 'a', types: 'EVD', rationale: 'short' })).toHaveLength(5);
    expect(typesOf('clm, fct clm')).toEqual(['CLM', 'FCT']);
  });
  it('the attribute form and the value it sends', () => {
    expect(attributeFormProblems({ attribute: 'language', value: 'French', reason: 'published in French' })).toEqual(['the language is a BCP 47 tag (en, de-DE, und)']);
    expect(attributeValue('geographic_scope', 'Djibouti, Horn of Africa\nRed Sea')).toEqual(['Djibouti', 'Horn of Africa', 'Red Sea']);
    expect(attributeValue('licence', ' CC BY 4.0 ')).toEqual({ statement: 'CC BY 4.0' });
    expect(attributeValue('language', ' fr ')).toBe('fr');
  });
});
