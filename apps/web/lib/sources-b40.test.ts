import { describe, expect, it } from 'vitest';
import {
  candidatePayload, candidateProblems, economicsLine, evaluationPayload, evaluationProblems, impactRows, impactSummary, listOf, markerCauseLabel, ownerName,
  registryEffect, registryNote, rightsConsequence, rightsPayload, rightsProblems, roleEligibility, useStatement, versionBinding,
} from './sources-b40';

/* B40 §RG — the pure model of the source registry pages. Every value here is SYNTHETIC. */
const candidate = { name: 'Red Sea shipping notices (SYNTHETIC)', publisher: 'Regional notice service (SYNTHETIC)', howFound: 'cited by two carrier advisories', termsUrl: 'https://notices.example/terms',
  purposes: 'corridor monitoring\ninternal briefings', assessment: 'timely; observational authority only' };
const evaluation = { authority: 'observational publisher (SYNTHETIC)', rightsEvidence: 'terms permit internal monitoring', coverageFit: 'Red Sea and Gulf of Aden, universe v1', cost: 'no fee',
  risks: 'lag of hours', tests: [{ name: 'schema parses', outcome: 'pass', note: '' }, { name: '', outcome: 'fail', note: '' }], recommendation: 'approve', reason: 'authority and rights stand' };

describe('the request rules mirror the ports\' own', () => {
  it('a list is typed one per line or comma-separated, trimmed, each named once', () => {
    expect(listOf(' a, b\nA\n\n c ')).toEqual(['a', 'b', 'c']);
  });
  it('a candidate: name, publisher, how found, an https terms address or none, purposes, the assessment', () => {
    expect(candidateProblems(candidate)).toEqual([]);
    expect(candidatePayload(candidate)).toMatchObject({ termsUrl: 'https://notices.example/terms', purposes: ['corridor monitoring', 'internal briefings'] });
    expect(candidatePayload({ ...candidate, termsUrl: ' ' }).termsUrl).toBeNull();
    expect(candidateProblems({ ...candidate, termsUrl: 'http://x.example', purposes: '' })).toEqual([
      'The terms are an https address, or leave it empty when none is published yet.', 'Propose at least one purpose (one per line).']);
  });
  it('an evaluation: the six assessments, the tests (an unnamed row ignored), a recommendation; approval never beside a failed test', () => {
    expect(evaluationProblems(evaluation)).toEqual([]);
    expect(evaluationPayload(evaluation, 1)).toMatchObject({ contractVersion: 1, risks: ['lag of hours'], contractTests: [{ name: 'schema parses', outcome: 'pass', note: null }] });
    expect(evaluationProblems({ ...evaluation, tests: [{ name: 'replay admitted', outcome: 'fail', note: '' }] })).toContain('An evaluation recommending approval records no failed contract test — recommend revise, or fix the contract.');
    expect(evaluationProblems({ ...evaluation, recommendation: 'maybe' })).toContain('Recommend approve, revise or reject.');
  });
  it('a rights change: a reason; evidence for a withdrawal and a restoration; not twice; a narrowing keeps a strict subset; a deletion obligation stated or none', () => {
    const cur = { purposes: ['corridor monitoring', 'internal briefings'], withdrawn: false };
    const w = { operation: 'withdraw' as const, reason: 'the publisher revoked the licence', evidence: 'notice ref RSN-1 (SYNTHETIC)', deletionObligation: '', purposes: '' };
    expect(rightsProblems(w, cur)).toEqual([]);
    expect(rightsPayload(w, 2)).toEqual({ contractVersion: 2, operation: 'withdraw', reason: 'the publisher revoked the licence', evidence: 'notice ref RSN-1 (SYNTHETIC)', deletionObligation: null, purposes: null });
    expect(rightsProblems({ ...w, evidence: '' }, cur)[0]).toMatch(/^Cite the evidence of the withdrawal/);
    expect(rightsProblems(w, { ...cur, withdrawn: true })).toEqual(['The rights already stand withdrawn; a restoration lifts the withdrawal.']);
    expect(rightsProblems({ ...w, operation: 'restore' }, cur)).toEqual(['The rights stand no withdrawal; there is nothing to restore.']);
    expect(rightsProblems({ ...w, deletionObligation: 'del' }, cur)[0]).toMatch(/^A deletion obligation says/);
    expect(rightsProblems({ ...w, operation: 'narrow', purposes: 'corridor monitoring' }, cur)).toEqual([]);
    expect(rightsPayload({ ...w, operation: 'narrow', purposes: 'corridor monitoring' }, 2).purposes).toEqual(['corridor monitoring']);
    expect(rightsProblems({ ...w, operation: 'narrow', purposes: 'corridor monitoring\ninternal briefings' }, cur)[0]).toMatch(/strict subset/);
    expect(rightsProblems({ ...w, operation: 'narrow', purposes: 'resale' }, cur)[0]).toMatch(/strict subset/);
  });
  it('the binding a rights change carries is the contract version it read (server-enforced); none without a version', () => {
    expect(versionBinding(3)).toBe('contract-v3');
    expect(versionBinding(null)).toBeNull();
    expect(versionBinding(0)).toBeNull();
  });
});

describe('the impact, in rows with their owners (never content)', () => {
  const impact = {
    statement: '2 product(s), 1 claim(s) and 1 further reference(s) rest on this source\'s evidence (3 evidence object(s))', evidence: { objects: 3, versions: 4 },
    products: [{ kind: 'forecast', id: 'f1', title: 'corridor transits', via: 'series x', owner: { id: 'p-000000001', name: 'N. Eriksen (SYNTHETIC)' } },
               { kind: 'assumption', id: 'a1', title: 'transits recover', via: 'rests on claim c1', owner: null }],
    claims: [{ kind: 'claim', id: 'c1', ref: 'CLM:c1@1', evidence_id: 'e0000000001', owner: { id: '0123456789abcdef', name: null } }],
    products_count: 2, claims_count: 1,
    forward: { options: { count: 1, items: [{ ref: 'DPK:p1@1', option: 'reroute', title: 'Corridor decision', owner: { id: 'o1', name: 'C. Brenner (SYNTHETIC)' } }] }, briefings: { items: [] }, publications: { items: [] }, strategy: { items: [] }, constructed: { count: 0, items: [] } },
    use: 'the decision-active use of this source\'s evidence is REFUSED (rights_withdrawn) until the rights are restored; reading stays as it was',
  };
  it('each resting product, claim and option with its kind, its owner (or "no named owner") and how it rests', () => {
    const r = impactRows(impact);
    expect(r.map((x) => [x.group, x.kind, x.owner])).toEqual([
      ['product', 'Forecast', 'N. Eriksen (SYNTHETIC)'], ['product', 'Assumption', 'no named owner (routed to the class\'s roles)'], ['claim', 'Claim', '01234567…'], ['option', 'Package option', 'C. Brenner (SYNTHETIC)']]);
    expect(r[2]!.via).toBe('rests on evidence e0000000…');
    expect(JSON.stringify(r)).not.toMatch(/object_value|payload|base64/);
    expect(impactRows(null)).toEqual([]);
  });
  it('the summary says the server\'s statement and what was counted beyond the bound', () => {
    expect(impactSummary(impact)).toBe('2 product(s), 1 claim(s) and 1 further reference(s) rest on this source\'s evidence (3 evidence object(s)). Evidence held: 3 object(s), 4 version(s).');
    expect(impactSummary({ ...impact, products_count: 250 })).toMatch(/3 of 251 products and claims are listed; the rest are counted\.$/);
    expect(impactSummary(undefined)).toBe('The impact has not been read.');
    expect(useStatement(impact)).toMatch(/REFUSED \(rights_withdrawn\)/);
    expect(ownerName(undefined)).toMatch(/^no named owner/);
  });
  it('the server\'s preview in the Command Review\'s words — the versions and what each becomes, the owners, a blocker when not possible', () => {
    const preview = { possible: true, versions: [{ contract_version: 1, rights_state: 'confirmed', lifecycle: 'active', after: { rights_state: 'withdrawn', lifecycle: 'suspended' } }], impact: { ...impact, resting: 4, owners: [{ id: 'o1', name: 'C. Brenner (SYNTHETIC)' }] } };
    const c = rightsConsequence(preview, 'withdraw')!;
    expect(c).toMatchObject({ source: 'server', affected: ['v1 confirmed/active → withdrawn/suspended'], users: ['C. Brenner (SYNTHETIC)'], blockers: [], residualRisk: '4 product(s), claim(s) and reference(s) rest on the source\'s evidence' });
    expect(c.effect).toMatch(/refused until the rights are restored — reading stays as it was$/);
    expect(rightsConsequence({ ...preview, possible: false, statement: 'the rights already stand withdrawn', impact: { resting: 0, owners: [] } }, 'withdraw')).toMatchObject({ blockers: ['the rights already stand withdrawn'], users: ['nobody named — nothing rests on it yet'] });
    expect(rightsConsequence(null, 'restore')).toBeNull();
    expect(rightsConsequence(preview, 'restore')!.reversibility).toMatch(/withdrawn again/);
  });
});

describe('the registry record, in words', () => {
  it('the v4 gate or the recorded v1–v3 path; the economics against the run meter; the marker cause', () => {
    expect(registryNote({ v4: true })).toMatch(/^SRC@v4/);
    expect(registryNote({ v4: false })).toMatch(/not recorded before B40$/);
    expect(economicsLine({ declared: true, runs: 3, period: 'month', cost_per_run: 2, currency: 'EUR', cost: 6, budget_per_period: 5, over_budget: true, owner: 'ops' }))
      .toBe('3 run(s) this month × 2 EUR = 6 EUR of a 5 EUR budget — OVER BUDGET (owner ops).');
    expect(economicsLine({ declared: false, statement: 'no economics declared (an SRC@v1–v3 contract — not recorded before B40)' })).toMatch(/not recorded before B40/);
    expect(economicsLine(null)).toMatch(/not recorded before B40/);
    expect(markerCauseLabel('rights')).toBe('rights withdrawn');
    expect(markerCauseLabel('health')).toBe('source health');
  });
});

describe('eligibility from the person\'s bindings, and the stated effects', () => {
  const b = [{ roleCode: 'collection_manager', scope: 'DOMAIN', tenantId: 't', domainId: 'd1' }, { roleCode: 'customer_sponsor', scope: 'TENANT', tenantId: 't', domainId: null }];
  it('a domain role in this domain; a tenant role at the tenant; otherwise the reason in words (the server still decides)', () => {
    expect(roleEligibility(b, ['collection_manager'], { domainId: 'd1' }, 'Evaluating')).toMatchObject({ can: true, role: 'collection_manager', basis: 'you hold collection_manager in this domain' });
    expect(roleEligibility(b, ['collection_manager'], { domainId: 'd2' }, 'Evaluating')).toMatchObject({ can: false, reason: 'Evaluating is the act of a collection_manager in this domain — you hold none; the server would refuse it' });
    expect(roleEligibility(b, ['customer_sponsor', 'tenant_admin'], { domainId: 'd1', tenantScope: true }, 'The customer approval')).toMatchObject({ can: true, basis: 'you hold customer_sponsor for the tenant' });
  });
  it('each registry act states its effect (as stated, never as computed); an unknown act has none', () => {
    for (const a of ['observation.source.discover', 'observation.source.register', 'observation.source.evaluate', 'observation.source.customer_approve', 'observation.source.stewardship', 'observation.source.incident']) {
      expect(registryEffect(a), a).toMatchObject({ source: 'stated', blockers: [] });
      expect(registryEffect(a)!.reversibility.length, a).toBeGreaterThan(10);
    }
    expect(registryEffect('observation.nothing')).toBeNull();
  });
});
