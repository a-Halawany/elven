/**
 * B107 §PG — the workspace's PURE logic (request shapes, eligibility wording, the effective state), the READ-ONLY repository registers
 * (EXCEPTIONS.md reported, never governed; the C15 SCX dispositions shown), the exact PDP block, and every refusal text of
 * 0115_b107_x_pg.sql through the central mapper with its SQLSTATE. No database. SYNTHETIC fixtures.
 *
 * The NON-BLOCKING REPORT (Q6): the last case reads the repository's EXCEPTIONS.md as of TODAY and PRINTS every entry still `open` past its
 * expiry — it never fails on them (renewing or closing an entry is the owner's act on the file; a blocking check would turn CI red on merge).
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { asObservationRefusal } from '../../src/observation/observation-errors.js';
import { PdpService } from '../../src/policy/pdp.service.js';
import { changeShape, conflictShape, constitutionalIn, eligibility, evidenceShape, exceptionEffectiveState, exceptionShape, recordShape, resolutionShape, rightsShape, scopeShape }
  from '../../src/governance/workspace/workspace-logic.js';
import { parseEngineeringExceptions, parseSupplyChainDispositions, readRepositoryRegisters, repositoryRoot } from '../../src/governance/workspace/repository-registers.js';

const ID = '01a1327e-0000-7000-8000-00000000000a'; const ID2 = '01a1327e-0000-7000-8000-00000000000b';
const HEX = 'a'.repeat(64);
const EV = [{ kind: 'test_report', ref: 'vitest:x', digest: HEX, captured_at: '2026-10-14T10:00:00Z', valid_until: '2026-12-01T00:00:00Z' }];

describe('the request shapes (a malformed request is the caller\'s 422, never a cast error)', () => {
  it('evidence: kind, ref, a 64-hex digest, an instant captured; valid_until an instant or absent', () => {
    expect(evidenceShape(EV)).toEqual({ ok: true });
    expect(evidenceShape([])).toMatchObject({ ok: false, field: 'evidence' });
    expect(evidenceShape([{ ...EV[0], digest: 'abc' }])).toMatchObject({ ok: false, reason: expect.stringMatching(/64 hex/) });
    expect(evidenceShape([{ ...EV[0], captured_at: 'yesterday' }])).toMatchObject({ ok: false, reason: expect.stringMatching(/instant/) });
    expect(evidenceShape([{ ...EV[0], valid_until: null }])).toEqual({ ok: true });
  });
  it('an exception: a named expiry ("later" is not one), ids are ids, the customer scope, the evidence; a renewal may omit what it keeps', () => {
    const base = { systemScope: [ID], owner: ID2, expiresAt: '2026-11-01T00:00:00Z', customerScope: { all: true }, evidence: EV };
    expect(exceptionShape(base, false)).toEqual({ ok: true });
    expect(exceptionShape({ ...base, expiresAt: 'later' }, false)).toMatchObject({ ok: false, field: 'expiresAt', reason: expect.stringMatching(/"later" is not an expiry/) });
    expect(exceptionShape({ ...base, systemScope: [] }, false)).toMatchObject({ ok: false, field: 'systemScope' });
    expect(exceptionShape({ ...base, owner: 'ops' }, false)).toMatchObject({ ok: false, field: 'owner' });
    expect(exceptionShape({ ...base, customerScope: { domains: [{ tenant: ID, domain: 'x' }] } }, false)).toMatchObject({ ok: false, field: 'customerScope' });
    expect(exceptionShape({ ...base, expandsAuthority: 'yes' }, false)).toMatchObject({ ok: false, field: 'expandsAuthority' });
    expect(exceptionShape({ expiresAt: '2026-11-01T00:00:00Z', evidence: EV }, true)).toEqual({ ok: true });
    expect(exceptionShape({ expiresAt: '2026-11-01T00:00:00Z', evidence: EV }, false)).toMatchObject({ ok: false });
  });
  it('a change, a conflict, a resolution, a record, a rights matrix, a baseline scope', () => {
    expect(changeShape({ changeClass: 'interface', subjects: [ID] })).toEqual({ ok: true });
    expect(changeShape({ changeClass: 'vibes', subjects: [ID] })).toMatchObject({ ok: false, field: 'changeClass' });
    expect(changeShape({ changeClass: 'interface', subjects: [] })).toMatchObject({ ok: false, field: 'subjects' });
    expect(conflictShape({ kind: 'cross_volume', conflicting: [ID, ID2] })).toEqual({ ok: true });
    expect(conflictShape({ kind: 'cross_volume', conflicting: [ID, 'x'] })).toMatchObject({ ok: false });
    expect(resolutionShape({ mode: 'closure', prevailing: ID, rationale: 'the highest authority prevails here' })).toEqual({ ok: true });
    expect(resolutionShape({ mode: 'amendment', prevailing: ID, rationale: 'the highest authority prevails here' })).toMatchObject({ ok: false, field: 'changeProposal' });
    expect(recordShape({ kind: 'debt', owner: ID, details: { dueOn: '2026-12-01' } }, false)).toEqual({ ok: true });
    expect(recordShape({ kind: 'debt', owner: ID, details: { dueOn: 'soon' } }, false)).toMatchObject({ ok: false, field: 'details' });
    expect(recordShape({ title: 'an amendment keeps its kind' }, true)).toEqual({ ok: true });
    expect(rightsShape([{ subject: 'exception', duty: 'approve', role: 'independent_assurance', principal: ID, delegate: { to: ID2, until: '2026-10-20' } }])).toEqual({ ok: true });
    expect(rightsShape([{ subject: 'exception', duty: 'sign', role: 'independent_assurance' }])).toMatchObject({ ok: false });
    expect(rightsShape([{ subject: 'exception', duty: 'approve', role: 'x', delegate: { to: ID2 } }])).toMatchObject({ ok: false, reason: expect.stringMatching(/until/) });
    const scope = { capability_version: 'v', journeys: ['J'], roles: ['r'], tenant_or_domain: 't', deployment_profile: 'local-dev', entitlement: 'core', data_versions: ['d'],
                    model_versions: ['m'], configuration_digest: HEX, consequence_class: 'C2', period: 'p' };
    expect(scopeShape(scope)).toEqual({ ok: true });
    expect(scopeShape({ ...scope, journeys: [] })).toMatchObject({ ok: false, reason: expect.stringMatching(/missing: journeys/) });
    expect(scopeShape({ ...scope, consequence_class: 'C9' })).toMatchObject({ ok: false });
  });
});

describe('eligibility is WORDED (the port decides); the effective state never shows an expired exception in force', () => {
  const base = { callerKind: 'human', caller: ID, callerRoles: ['independent_assurance'], requiredRoles: ['independent_assurance'], proposer: ID2, state: 'proposed', openState: 'proposed' };
  it('every refusing reason is listed', () => {
    expect(eligibility(base)).toEqual({ can_decide: true, reasons: [] });
    expect(eligibility({ ...base, callerKind: 'agent' }).reasons[0]).toMatch(/a named human decides/);
    expect(eligibility({ ...base, proposer: ID }).reasons).toContain('you proposed it — never self-approved');
    expect(eligibility({ ...base, owner: ID }).reasons).toContain('you own it — the approver is independent of the owner');
    expect(eligibility({ ...base, componentOwners: [ID], expands: true }).reasons).toContain('you own a component whose authority it expands (ES-02-004)');
    expect(eligibility({ ...base, callerRoles: ['product_authority'] }).reasons[0]).toMatch(/you hold none of independent_assurance/);
    expect(eligibility({ ...base, held: ['under review'] }).reasons).toContain('HELD: under review');
    expect(eligibility({ ...base, rights: { governed: true, allowed: false, reason: 'assigned to someone else' } }).reasons).toContain('assigned to someone else');
    expect(eligibility({ ...base, state: 'approved' }).can_decide).toBe(false);
  });
  it('an approved exception past its expiry reads `expired (sweep pending)`; constitutional invariants are named', () => {
    expect(exceptionEffectiveState('approved', '2026-10-01T00:00:00Z', new Date('2026-10-02T00:00:00Z'))).toBe('expired (sweep pending)');
    expect(exceptionEffectiveState('approved', '2026-10-03T00:00:00Z', new Date('2026-10-02T00:00:00Z'))).toBe('approved');
    expect(exceptionEffectiveState('proposed', '2026-10-01T00:00:00Z', new Date('2026-10-02T00:00:00Z'))).toBe('proposed');
    expect(constitutionalIn(['Tenant_Isolation ', 'export_integrity', 'human_authority'])).toEqual(['tenant_isolation', 'human_authority']);
  });
});

describe('the repository registers are READ ONLY: EXCEPTIONS.md reported, the C15 dispositions shown', () => {
  const MD = ['# register', '```yaml', 'exception_id:            EXC-T-001', 'title:                   A synthetic one', 'owner:                   Someone', 'approver:                Someone else',
              'requirement_ids:         [IA-01-001, IA-01-002]', 'expiry_date:             2026-09-30', 'status:                  open       # controlled enum', '```',
              '## a correction record', '```yaml', 'record: not an exception', 'status: closed', '```',
              '```yaml', 'exception_id: EXC-T-002', 'expiry_date: 2026-12-31', 'status: open', '```',
              '```yaml', 'exception_id: EXC-T-003', 'expiry_date: 2026-01-01', 'status: closed', '```'].join('\n');
  it('parses the yaml blocks carrying an exception_id; an open entry past its expiry is EXPIRED (a closed one is not)', () => {
    const r = parseEngineeringExceptions(MD, '2026-10-15');
    expect(r.map((x) => x.id)).toEqual(['EXC-T-001', 'EXC-T-002', 'EXC-T-003']);
    expect(r[0]).toMatchObject({ status: 'open', expired: true, days_past_expiry: 15, requirement_ids: ['IA-01-001', 'IA-01-002'], owner: 'Someone' });
    expect(r[1]).toMatchObject({ expired: false, days_past_expiry: null });
    expect(r[2]).toMatchObject({ status: 'closed', expired: false });
    expect(() => parseEngineeringExceptions(MD, '15.10.2026')).toThrow(/today is a day/);
  });
  it('the repository\'s own EXCEPTIONS.md as of 2026-10-15: EXC-P0-003 expired 2026-09-30 (REPORTED); EXC-P0-001 not yet', () => {
    const root = repositoryRoot();
    expect(root).not.toBeNull();
    const r = parseEngineeringExceptions(readFileSync(join(root!, 'EXCEPTIONS.md'), 'utf8'), '2026-10-15');
    expect(r.find((x) => x.id === 'EXC-P0-003')).toMatchObject({ expiry_date: '2026-09-30', status: 'open', expired: true, days_past_expiry: 15 });
    expect(r.find((x) => x.id === 'EXC-P0-001')).toMatchObject({ expiry_date: '2026-10-31', expired: false });
  });
  it('the C15 dispositions: listed with their expiry, the image digest shortened; nothing here writes the file', () => {
    const root = repositoryRoot()!;
    const before = readFileSync(join(root, 'scripts/gate/scanner-exclusions.json'), 'utf8');
    const d = parseSupplyChainDispositions(before, '2026-10-15');
    expect(d.length).toBeGreaterThan(0);
    expect(d.every((x) => /^SCX-\d+$/.test(x.id))).toBe(true);
    expect(d.every((x) => !x.image.includes('@sha256:') || x.image.endsWith('…'))).toBe(true);
    const reg = readRepositoryRegisters('2026-10-15');
    expect(reg.engineering.available && reg.supply_chain.available).toBe(true);
    expect(reg.supply_chain.note).toMatch(/never governed here/);
    expect(readFileSync(join(root, 'scripts/gate/scanner-exclusions.json'), 'utf8')).toBe(before);
  });
  it('NON-BLOCKING REPORT: the engineering exceptions open past their expiry as of today (printed, never failed on)', () => {
    const reg = readRepositoryRegisters();
    const expired = reg.engineering.entries.filter((e) => e.expired);
    // eslint-disable-next-line no-console
    console.info(`B107 §PG engineering-exception report (${reg.read_on}, non-blocking): ${expired.length === 0 ? 'no open entry is past its expiry'
      : expired.map((e) => `${e.id} expired ${e.expiry_date} (${e.days_past_expiry} days) — the owner renews or closes it in EXCEPTIONS.md`).join('; ')}`);
    expect(reg.engineering.available).toBe(true);
  });
});

describe('the PDP block `workspace` (exact rules; PLATFORM roles only; every approval human-gated)', () => {
  const pdp = new PdpService();
  const decide = (action: string, roles: string[], kind: 'human' | 'agent' = 'human', scope: 'PLATFORM' | 'DOMAIN' = 'PLATFORM') => pdp.evaluate({
    principal: { principalId: ID, kind, assurance: kind === 'human' ? 'password' : 'agent_grant',
                 bindings: roles.map((roleCode) => ({ roleCode, scope, tenantId: scope === 'PLATFORM' ? null : ID2, domainId: scope === 'PLATFORM' ? null : ID })) } as never,
    delegationId: null, action, objectType: 'GEX', objectId: null, purposeId: 'governance', context: { scope, tenantId: scope === 'PLATFORM' ? null : ID2, domainId: scope === 'PLATFORM' ? null : ID },
    consequenceClass: 'C2', environment: { deployment: 'local-dev', clockQuality: 'trusted' },
  });
  const allowed = (r: { decision: string }) => r.decision === 'allow' || r.decision === 'allow_with_obligations';
  const APPROVALS: Array<[string, string]> = [['governance.baseline.owner.assign', 'product_authority'], ['governance.baseline.decide', 'product_authority'], ['governance.rights.decide', 'product_authority'],
    ['governance.exception.decide', 'independent_assurance'], ['governance.exception.close', 'independent_assurance'], ['governance.remediation.decide', 'product_authority'],
    ['governance.conflict.resolve', 'product_authority'], ['governance.change.decide', 'product_authority'], ['governance.record.decide', 'operations_authority'],
    ['governance.record.review', 'operations_authority'], ['governance.record.close', 'product_authority']];
  it('every approval is human-gated (the PEP refuses an agent holding the role)', () => {
    for (const [a, role] of APPROVALS) {
      const r = decide(a, [role]);
      expect(allowed(r), a).toBe(true);
      expect(r.obligations, a).toContainEqual({ type: 'human_gate' });
    }
  });
  it('the steward approves nothing; proposals, the sweep and the posture are not gated', () => {
    for (const [a] of APPROVALS.filter(([x]) => !['governance.record.decide', 'governance.record.review', 'governance.record.close'].includes(x))) expect(allowed(decide(a, ['conformance_steward'])), a).toBe(false);
    for (const a of ['governance.exception.propose', 'governance.change.propose', 'governance.conflict.raise', 'governance.exception.sweep', 'governance.posture.record', 'governance.baseline.propose', 'governance.rights.propose']) {
      const r = decide(a, ['conformance_steward'], 'agent');
      expect(allowed(r), a).toBe(true);
      expect(r.obligations, a).not.toContainEqual({ type: 'human_gate' });
    }
  });
  it('a local team (a DOMAIN or TENANT role) reaches no workspace act; the rules are exact', () => {
    for (const [a] of APPROVALS) expect(allowed(decide(a, ['domain_admin'], 'human', 'DOMAIN')), a).toBe(false);
    expect(allowed(decide('governance.exception.decide.force', ['independent_assurance']))).toBe(false);
    expect(allowed(decide('governance.exception', ['independent_assurance']))).toBe(false);
    expect(allowed(decide('governance.exception.decide', ['platform_admin']))).toBe(false);
  });
});

describe('every refusal text of 0115_b107_x_pg.sql through the central mapper, by its SQLSTATE', () => {
  const sqlText = readFileSync(join(__dirname, '../../migrations/0115_b107_x_pg.sql'), 'utf8');
  const raises = [...sqlText.matchAll(/RAISE EXCEPTION '((?:[^']|'')+)'[^;]*?ERRCODE = '(\d{5}|[0-9A-Z]{5})'/g)].map((m) => ({ text: (m[1] ?? '').replace(/''/g, "'"), code: m[2] ?? '' }));
  const STATUS: Record<string, number> = { '42501': 403, '23503': 404, '23505': 409, '22023': 422 };
  it('the texts are in the class form with this part\'s nouns (or the shared signature port\'s) and each maps to its SQLSTATE\'s status', () => {
    expect(raises.length).toBeGreaterThan(120);
    for (const r of raises) {
      expect(r.text, r.text).toMatch(/^(% rejected|product baseline rejected|decision rights rejected|governance exception rejected|conformance conflict rejected|change proposal rejected|governance record rejected|signature rejected) \(/);
      if (r.text.startsWith('% ') || r.text.startsWith('signature ')) continue;   // the noun is the caller's (a shared helper) / the shared signature port's
      const msg = r.text.replace(/%/g, 'x');
      const mapped = asObservationRefusal(Object.assign(new Error(msg), { code: r.code }), 'c');
      expect(mapped?.getStatus(), msg).toBe(STATUS[r.code]);
    }
  });
});
