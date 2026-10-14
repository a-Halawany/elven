/*
 * CP-6 B94 §IM+§AD — the PURE pieces of the implementation part: the route parsers (the caller's own request, refused in the class form
 * before any port runs — the ports re-check every rule), the wording helpers (a gate line, a cohort share below k INDETERMINATE), the
 * adoption contracts against the B92 contract rules (no person dimension, k ≥ 5, a rate's numerator and denominator, a registered
 * computation key, a review action never punitive), the PDP block (exact rules; the lead in no approving rule; the human gates), and EVERY
 * refusal text 0114_b94_x_im.sql raises driven through the central mapper with its SQLSTATE (403 → 404 → 409 → 422 by class).
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { asObservationRefusal } from '../../src/observation/observation-errors.js';
import { DELIVERY_NOUNS } from '../../src/delivery/seams.js';
import { PERSON_DIMENSIONS } from '../../src/analytics/seams.js';
import { ADOPTION_CONTRACTS, ADOPTION_METRIC_KEYS } from '../../src/delivery/implementation/adoption-definitions.js';
import { definitionsB } from '../../src/analytics/computations-b/definitions-b.js';
import { PdpService } from '../../src/policy/pdp.service.js';
import {
  NONOVERRIDABLE, cohortShare, gateLine, parseDecision, parseGolive, parseItem, parseOpen, parsePath, parsePersonRecord, parseReadiness, parseRevise, parseTransition,
} from '../../src/delivery/implementation/implementation-logic.js';

const ID = '01a1327e-3aa4-740a-9612-ecd7aeeedbfd';
const HEX = 'a'.repeat(64);

describe('the route parsers — the caller\'s own request', () => {
  it('open: key, title, the target domain, the profile, the plan', () => {
    expect(parseOpen({ key: 'corridor-golive', title: 'Corridor go-live', targetDomainId: ID, plan: { objective: 'x' } })).toMatchObject({ ok: true, value: { profile: 'local-dev', onboardingProgrammeId: null } });
    expect(parseOpen({ key: 'Bad Key', title: 'Corridor go-live', targetDomainId: ID, plan: {} })).toMatchObject({ ok: false, cls: 'key' });
    expect(parseOpen({ key: 'corridor', title: 'abc', targetDomainId: ID, plan: {} })).toMatchObject({ ok: false, cls: 'title' });
    expect(parseOpen({ key: 'corridor', title: 'Corridor go-live', targetDomainId: 'x', plan: {} })).toMatchObject({ ok: false, cls: 'request' });
    expect(parseOpen({ key: 'corridor', title: 'Corridor go-live', targetDomainId: ID, plan: {}, deploymentProfile: 'mainframe' })).toMatchObject({ ok: false, cls: 'profile' });
    expect(parseOpen({ key: 'corridor', title: 'Corridor go-live', targetDomainId: ID, plan: [] })).toMatchObject({ ok: false, cls: 'plan' });
  });
  it('revise and transitions: the version read, a reason, a known act (an unknown act is a 404)', () => {
    expect(parseRevise({ expectedVersion: 2, title: 'New title here' })).toMatchObject({ ok: true, value: { expectedVersion: 2, plan: null } });
    expect(parseRevise({ expectedVersion: 2 })).toMatchObject({ ok: false, cls: 'request' });
    expect(parseRevise({ title: 'x' })).toMatchObject({ ok: false, cls: 'request' });
    expect(parseTransition('hold', { expectedVersion: 3, reason: 'the board asks for a pause' })).toMatchObject({ ok: true, value: { act: 'hold' } });
    expect(parseTransition('fly', { expectedVersion: 3, reason: 'the board asks for a pause' })).toMatchObject({ ok: false, cls: 'act', status: 404 });
    expect(parseTransition('hold', { expectedVersion: 3, reason: 'short' })).toMatchObject({ ok: false, cls: 'reason' });
  });
  it('items: a closed kind, a key, a title (a retirement needs none), the expected version (0 = new)', () => {
    expect(parseItem({ kind: 'journey', key: 'j-briefing', title: 'The briefing journey', attributes: { journey_ref: 'JRN-01', priority: true } })).toMatchObject({ ok: true, value: { expectedVersion: 0, retire: false } });
    expect(parseItem({ kind: 'person', key: 'p', title: 'abcd' })).toMatchObject({ ok: false, cls: 'kind' });
    expect(parseItem({ kind: 'risk', key: 'r1', title: null, retire: true, expectedVersion: 2 })).toMatchObject({ ok: true, value: { retire: true } });
    expect(parseItem({ kind: 'risk', key: 'r1', title: 'abc' })).toMatchObject({ ok: false, cls: 'title' });
    expect(parseItem({ kind: 'risk', key: 'r1', title: 'A risk', attributes: [] })).toMatchObject({ ok: false, cls: 'attributes' });
  });
  it('decisions name the exact digest; readiness items a closed kind; go-live an approve names the cadence and a priority journey', () => {
    expect(parseDecision('implementation change', { decision: 'approve', digest: HEX, reason: 'the sponsor agrees' }, ['approve', 'reject'])).toMatchObject({ ok: true });
    expect(parseDecision('implementation change', { decision: 'approve', digest: 'abc', reason: 'the sponsor agrees' }, ['approve', 'reject'])).toMatchObject({ ok: false, cls: 'digest' });
    expect(parseReadiness({ key: 'role-risk', kind: 'role_filled', title: 'A risk owner', spec: { role: 'risk_owner' } })).toMatchObject({ ok: true, value: { blocking: true, expectedVersion: 0 } });
    expect(parseReadiness({ key: 'measure', kind: 'adoption_rate', title: 'A percentage', spec: {} })).toMatchObject({ ok: false, cls: 'kind' });   // no measure kind exists: a measure never releases the gate
    expect(parseGolive({ decision: 'approve', gateDigest: HEX, cadenceId: ID, journeys: [ID, ID], reason: 'ready and accepted' })).toMatchObject({ ok: true, value: { journeys: [ID] } });
    expect(parseGolive({ decision: 'approve', gateDigest: HEX, journeys: [ID], reason: 'ready and accepted' })).toMatchObject({ ok: false, cls: 'cadence' });
    expect(parseGolive({ decision: 'approve', gateDigest: HEX, cadenceId: ID, journeys: [], reason: 'ready and accepted' })).toMatchObject({ ok: false, cls: 'journeys' });
    expect(parseGolive({ decision: 'withhold', gateDigest: HEX, reason: 'not until the owner is named' })).toMatchObject({ ok: true, value: { cadenceId: null } });
    expect(parseGolive({ decision: 'override', gateDigest: HEX, reason: 'force it through' })).toMatchObject({ ok: false, cls: 'decision' });
  });
  it('paths and person records: no score, no rank, no performance purpose — complete | not_yet only', () => {
    expect(parsePath({ key: 'exec-onboarding', roles: ['executive', 'executive'], title: 'Exec', contentRef: 'kb://x' })).toMatchObject({ ok: true, value: { roles: ['executive'] } });
    expect(parsePath({ key: 'exec-onboarding', roles: [] })).toMatchObject({ ok: false, cls: 'roles' });
    expect(parsePersonRecord('training record', { subject: ID, state: 'complete' })).toMatchObject({ ok: true, value: { purpose: 'enablement_readiness', outcome: 'complete' } });
    expect(parsePersonRecord('training record', { subject: ID, state: 'complete', score: 90 })).toMatchObject({ ok: false, cls: 'person', status: 403 });
    expect(parsePersonRecord('competence record', { subject: ID, outcome: 'complete', rank: 1 })).toMatchObject({ ok: false, cls: 'person', status: 403 });
    expect(parsePersonRecord('competence record', { subject: ID, outcome: 'excellent' })).toMatchObject({ ok: false, cls: 'outcome' });
    expect(parsePersonRecord('training record', { subject: ID, state: 'complete', purpose: 'performance_review' })).toMatchObject({ ok: false, cls: 'purpose' });
    expect(parsePersonRecord('training record', { subject: ID, state: 'complete', retainDays: 5000 })).toMatchObject({ ok: false, cls: 'retention' });
  });
});

describe('wording (never judging)', () => {
  it('a non-overridable gate line says it is filled, never waived; a cohort below k shows no share', () => {
    expect(NONOVERRIDABLE).toEqual(['role_filled', 'owner_resolved', 'accessibility_attested']);
    expect(gateLine({ title: 'A risk owner', kind: 'role_filled', reason: 'nobody holds risk_owner', overridable: false })).toMatch(/not overridable: it is filled, never waived/);
    expect(gateLine({ title: 'A note', kind: 'custom', reason: 'not yet confirmed', overridable: true })).not.toMatch(/not overridable/);
    expect(cohortShare(3, 3)).toMatch(/^INDETERMINATE — 3 holder\(s\), below k = 5/);
    expect(cohortShare(5, 6)).toBe('5 of 6 (83 %)');
  });
});

describe('the adoption contracts and MET-039 v2 (B92 contract rules)', () => {
  it('ADP-001 and ADP-002: a rate by role × wave, k ≥ 5, never a person dimension, a registered computation key of their own, a review never punitive', () => {
    expect(ADOPTION_METRIC_KEYS).toEqual(['ADP-001', 'ADP-002']);
    for (const c of ADOPTION_CONTRACTS) {
      expect(c.metricKey).toMatch(/^[A-Z][A-Z0-9]{1,9}-[A-Za-z0-9.-]{1,40}$/);
      expect(c.kind).toBe('rate'); expect(c.numerator).toBeTruthy(); expect(c.denominator).toBeTruthy();
      expect(c.dimensions).toEqual(['role', 'wave']);
      expect(c.dimensions.filter((d) => (PERSON_DIMENSIONS as readonly string[]).includes(d))).toEqual([]);
      expect(c.kMin).toBeGreaterThanOrEqual(5); expect(c.floorN).toBeGreaterThanOrEqual(5);
      expect(c.privacyClass).toBe('aggregate');
      expect(c.computationKey).toBe(`${c.metricKey.toLowerCase().replace('-', '')}_${String(c.computationKey).split('_').slice(1).join('_')}`);
      expect(c.action).toMatch(/never an automatic or punitive decision/);
      expect(String(c.serves.decision_classes)).toMatch(/never released by a measure/);
    }
  });
  it('MET-039 v2 is SUPPORTED: duration in days, floor 1, the registered computation, no dimension, the owner a DOMAIN role', () => {
    const m = definitionsB.find((x) => x.metricKey === 'MET-039')!;
    expect(m).toMatchObject({ kind: 'duration', unit: 'days', floorN: 1, dimensions: [], unsupportedReason: null, ownerRole: 'product_analytics_owner', computationKey: ['met039', 'time_to_accepted_operation'].join('_') });
    expect(m.exclusions.map((x) => x.reason).join(' | ')).toMatch(/not yet accepted/);
  });
});

describe('the PDP block (exact rules; no lead approves; the human gates)', () => {
  const pdp = new PdpService();
  const tenant = '01a1327e-0000-7000-8000-000000000001'; const domain = '01a1327e-0000-7000-8000-000000000002';
  const decide = (action: string, roles: Array<[string, 'TENANT' | 'DOMAIN']>, kind: 'human' | 'agent' = 'human', scope: 'TENANT' | 'DOMAIN' = 'DOMAIN') => pdp.evaluate({
    principal: { principalId: ID, kind, assurance: kind === 'human' ? 'password' : 'agent_grant', bindings: roles.map(([roleCode, s]) => ({ roleCode, scope: s, tenantId: tenant, domainId: s === 'DOMAIN' ? domain : null })) } as never,
    delegationId: null, action, objectType: 'IMP', objectId: null, purposeId: 'implementation', context: { scope, tenantId: tenant, domainId: scope === 'DOMAIN' ? domain : null },
    consequenceClass: 'C2', environment: { deployment: 'local-dev', clockQuality: 'trusted' },
  });
  const allowed = (r: { decision: string }) => r.decision === 'allow' || r.decision === 'allow_with_obligations';
  it('the lead opens and coordinates; it holds no approving, accepting, attesting or competence rule', () => {
    expect(allowed(decide('implementation.programme.open', [['implementation_lead', 'TENANT']], 'human', 'TENANT'))).toBe(true);
    expect(allowed(decide('implementation.readiness.declare', [['implementation_lead', 'TENANT']]))).toBe(true);
    for (const a of ['implementation.golive.approve', 'implementation.change.approve', 'implementation.readiness.accept_residual', 'implementation.readiness.retire',
                     'implementation.training.path.attest', 'implementation.competence.record', 'implementation.shadow.resolve', 'implementation.shadow.review', 'implementation.readiness.confirm']) {
      expect(allowed(decide(a, [['implementation_lead', 'TENANT']], 'human', a === 'implementation.change.approve' ? 'TENANT' : 'DOMAIN')), a).toBe(false);
    }
  });
  it('the sponsor and the authority approve go-live as named humans (the human gate obligation — the PEP refuses an agent holding the role)', () => {
    const r = decide('implementation.golive.approve', [['customer_sponsor', 'TENANT']]);
    expect(allowed(r)).toBe(true);
    expect(r.obligations).toContainEqual({ type: 'human_gate' });
    expect(allowed(decide('implementation.golive.approve', [['onboarding_authority', 'TENANT']]))).toBe(true);
    expect(decide('implementation.golive.approve', [['customer_sponsor', 'TENANT']], 'agent').obligations).toContainEqual({ type: 'human_gate' });   // the PEP refuses the agent (the harness shows it)
    expect(allowed(decide('implementation.competence.record', [['enablement_assessor', 'DOMAIN']]))).toBe(true);
  });
  it('the actions are exact: a neighbour of a rule is not allowed by it', () => {
    expect(allowed(decide('implementation.golive.approve.force', [['customer_sponsor', 'TENANT']]))).toBe(false);
    expect(allowed(decide('implementation.programme', [['implementation_lead', 'TENANT']], 'human', 'TENANT'))).toBe(false);
  });
});

describe('every refusal text of 0114_b94_x_im.sql through the central mapper', () => {
  // the part's section of the folded 0114 (§IM+§AD, up to §SV)
  const sqlText = (() => { const all = readFileSync(fileURLToPath(new URL('../../migrations/0114_b94_onboarding_implementation_service.sql', import.meta.url)), 'utf8'); const a = all.indexOf('-- §IM+§AD — the implementation programme'); const b = all.indexOf('-- §SV — the service portal', a + 1); if (a < 0 || b < 0) throw new Error('the folded 0114 lost its section banners'); return all.slice(a, b); })();
  const nouns = DELIVERY_NOUNS.join('|');
  const raises = [...sqlText.matchAll(new RegExp(`RAISE EXCEPTION '((${nouns}) rejected \\(([a-z_]+)\\):[^']*(?:''[^']*)*)'[^;]*?USING ERRCODE = '([0-9A-Z]{5})'`, 'g'))]
    .map((m) => ({ text: m[1]!.replace(/''/g, '\''), noun: m[2]!, cls: m[3]!, code: m[4]! }));
  it('the part raises its refusals in the class form with B94 nouns (and only those)', () => {
    expect(raises.length).toBeGreaterThan(100);
    expect(new Set(raises.map((r) => r.noun))).toEqual(new Set(['implementation programme', 'implementation change', 'training path', 'training record', 'competence record', 'adoption cohort',
      'shadow finding', 'readiness item', 'go-live gate']));
    const all = [...sqlText.matchAll(/RAISE EXCEPTION '([^']+)/g)].map((m) => m[1]!);
    for (const t of all) expect(t, t).toMatch(new RegExp(`^(%|(${nouns}) rejected \\(|% rows )`));
  });
  it('each maps 403 (actor, authority, separation_of_duties, person) → 404 (unknown_*) → 409 (state, stale, duplicate, held) → 422 (the rest); the SQLSTATE agrees', () => {
    for (const r of raises) {
      const message = r.text.replace(/%/g, 'X');
      const ex = asObservationRefusal({ message, code: r.code }, 'unit');
      expect(ex, message).not.toBeNull();
      const want = ['actor', 'authority', 'separation_of_duties', 'person', 'access', 'ownership'].includes(r.cls) ? 403 : r.cls.startsWith('unknown_') ? 404
        : ['state', 'stale', 'duplicate', 'held'].includes(r.cls) ? 409 : 422;
      expect(ex!.getStatus(), message).toBe(want);
      expect(r.code, message).toBe(ex!.getStatus() === 403 ? '42501' : ex!.getStatus() === 404 ? '23503' : '22023');
    }
  });
});
