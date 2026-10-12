/**
 * B94 §SA — the pure logic of responsibility and support access (support-logic.ts): the reconciliation's findings, the grant window, a
 * grant's status on a clock, the consequence preview, the matrix rows' shape. Construction evidence only (SYNTHETIC values).
 */
import { describe, expect, it } from 'vitest';
import { consequencePreview, grantMinutes, grantStatus, matrixRows, reconcileFindings, VOCABULARY } from '../../src/delivery/support/support-logic.js';

const resolved = { state: 'resolved', principals: ['p1'] };
const row = (key: string, res: Record<string, unknown> = resolved, op = 1, auth = 1) => ({ key, owner_role: VOCABULARY[key] ?? 'domain_admin', operator_role: 'domain_admin', customer_authority: 'onboarding_authority', resolution: res, operator_holders: op, authority_holders: auth });
const all = Object.keys(VOCABULARY).map((k) => row(k));
const base = (over: Record<string, unknown> = {}) => ({
  matrix: { matrix_id: 'm', version: 1, digest: 'd', support_boundary: { digest: 'b1', tier: 'premium', version: 1 } }, rows: all, vocabulary: VOCABULARY,
  engineers: [{ principal: 'e1', other_roles: [] }], live_grants: [{ grant_id: 'g1', engineer_holds_role: true }],
  routes: { 'support.access': { route_roles: ['domain_admin'], holders: 1 }, 'responsibility.gap': { route_roles: ['domain_admin'], holders: 1 } },
  agents: [{ agent_id: 'a1', kind: 'attention', owner_active: true, escalation_active: true }], support_boundary: { digest: 'b1', tier: 'premium', version: 1 }, ...over,
});

describe('B94 §SA · reconciliation findings (IA-04-002)', () => {
  it('a reconciled domain has no finding', () => { expect(reconcileFindings(base())).toEqual([]); });
  it('no approved matrix is a gap', () => {
    expect(reconcileFindings(base({ matrix: null, rows: [] }))).toEqual([expect.objectContaining({ class: 'gap', kind: 'matrix_undeclared' })]);
  });
  it('unfilled / ambiguous owners are gaps, listed first; unfilled operators and authorities are drift', () => {
    const f = reconcileFindings(base({ rows: [row('risk.ownership', { state: 'unfilled', reason: 'nobody holds risk_owner in the domain' }, 0, 0), row('support.access', { state: 'ambiguous' }),
      ...all.filter((r) => !['risk.ownership', 'support.access'].includes(r.key))] }));
    expect(f.slice(0, 2).map((x) => [x.class, x.kind, x.key])).toEqual([['gap', 'owner_ambiguous', 'support.access'], ['gap', 'owner_unfilled', 'risk.ownership']]);
    expect(f.find((x) => x.kind === 'owner_unfilled')?.detail).toBe('nobody holds risk_owner in the domain');
    expect(f.filter((x) => x.class === 'drift').map((x) => x.kind).sort()).toEqual(['authority_unfilled', 'operator_unfilled']);
  });
  it('drift: an undeclared vocabulary key, a support engineer with customer roles, a grant without the role, an unrouted class, an ownerless agent', () => {
    const f = reconcileFindings(base({ rows: all.filter((r) => r.key !== 'evidence.custody'), engineers: [{ principal: 'e1', other_roles: ['domain_admin'] }],
      live_grants: [{ grant_id: 'g1', engineer_holds_role: false }], routes: { 'support.access': { route_roles: null, holders: 0 }, 'responsibility.gap': { route_roles: ['risk_owner'], holders: 0 } },
      agents: [{ agent_id: 'a1', kind: 'attention', owner_active: false, escalation_active: true }] }));
    expect(f.every((x) => x.class === 'drift')).toBe(true);
    expect(f.map((x) => x.kind)).toEqual(['agent_owner_inactive', 'class_unrouted', 'grant_without_role', 'responsibility_undeclared', 'route_unfilled', 'support_privilege']);
    expect(f.find((x) => x.kind === 'support_privilege')?.detail).toMatch(/also holds domain_admin/);
  });
  it('a changed contract support boundary is drift — never a matrix change (IA-04-003)', () => {
    const f = reconcileFindings(base({ support_boundary: { digest: 'b2', tier: 'standard', version: 2 } }));
    expect(f).toEqual([expect.objectContaining({ class: 'drift', kind: 'support_boundary_changed' })]);
    expect(f[0]?.detail).toMatch(/tier standard \(contract v2\).*approved with tier premium/);
  });
  it('is deterministic (the same observation → the same list)', () => {
    const o = base({ engineers: [{ principal: 'e2', other_roles: ['x'] }, { principal: 'e1', other_roles: ['y'] }] });
    expect(reconcileFindings(o)).toEqual(reconcileFindings(JSON.parse(JSON.stringify(o)) as Record<string, unknown>));
  });
});

describe('B94 §SA · the grant window, status and preview (PR-69-003)', () => {
  it('duration: default 240; 15 min – 24 h; whole minutes', () => {
    expect(grantMinutes(undefined)).toEqual({ ok: true, minutes: 240 });
    expect(grantMinutes(15)).toEqual({ ok: true, minutes: 15 });
    expect(grantMinutes(1440)).toEqual({ ok: true, minutes: 1440 });
    expect(grantMinutes(14)).toMatchObject({ ok: false });
    expect(grantMinutes(1441)).toMatchObject({ ok: false });
    expect(grantMinutes(30.5)).toMatchObject({ ok: false });
    expect(grantMinutes('60')).toMatchObject({ ok: false });
  });
  it('status on the database clock: an approved grant past its expiry is expired before any sweep', () => {
    const now = '2026-10-13T12:00:00.000Z';
    expect(grantStatus({ state: 'requested' }, now)).toBe('pending');
    expect(grantStatus({ state: 'approved', expires_at: '2026-10-13T12:00:01.000Z' }, now)).toBe('live');
    expect(grantStatus({ state: 'approved', expires_at: '2026-10-13T12:00:00.000Z' }, now)).toBe('expired_unswept');
    for (const s of ['lapsed', 'revoked', 'denied', 'withdrawn']) expect(grantStatus({ state: s }, now)).toBe(s);
  });
  it('the preview names the case, the scope, the window, what never happens and the revocation', () => {
    const p = consequencePreview({ case_ref: 'CASE-0042', purpose: 'diagnose the stalled feed', action_scope: ['diagnose.source', 'diagnose.runs'], object_scope: { sources: ['s1'] }, duration_minutes: 240 });
    expect(p[0]).toBe('For case CASE-0042: diagnose the stalled feed');
    expect(p[1]).toMatch(/diagnose.source, diagnose.runs — on 1 named source only/);
    expect(p[2]).toMatch(/For 4 h from the approval/);
    expect(p[3]).toMatch(/^Never: a write/);
    expect(consequencePreview({ duration_minutes: 75 })[2]).toMatch(/1 h 15 min/);
  });
});

describe('B94 §SA · matrix rows', () => {
  it('accepts camel or snake keys; refuses what is not a row list', () => {
    expect(matrixRows([{ key: 'support.access', title: 'Support access', ownerRole: 'domain_admin', operatorRole: 'domain_admin', customerAuthority: 'onboarding_authority',
      accessPath: 'the control center', evidenceProducer: 'the access log', escalationPath: 'the domain admin' }])).toMatchObject({ ok: true, rows: [{ owner_role: 'domain_admin', owner_principal_id: null }] });
    expect(matrixRows([])).toMatchObject({ ok: false });
    expect(matrixRows([['x']])).toMatchObject({ ok: false });
    expect(matrixRows('rows')).toMatchObject({ ok: false });
  });
});
