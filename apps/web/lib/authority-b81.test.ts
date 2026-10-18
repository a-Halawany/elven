import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  ACT_ROLES, AUTHORITY_SURFACES, CONTEST_PATHS, DECISION_ACTIVE_TYPES, INTERACTION_CLASSES, actionClassOf, approvalFrom, assertNoExecution, commandHandoff, commandReviewGate,
  consequenceFromPreview, consequenceStated, contestRows, decisionDigestView, deferIntake, deferLine, digestFreeze, eligibility, findBulkApprovals, isConsequential, isIrreversible,
  missingContestPaths, reviewRecordView, reviewRequested, rolesIn, seamClassOf, signatureReceiptView, typedPhrase, typedState, withdrawalView, type Eligibility,
} from './authority-b81';
import { APPEAL_SUBJECT_KINDS } from './explanation-b35';
import { paletteEntries } from './shell-b80';
import { LIBRARY_B81 } from './b81-seams';

/**
 * CP-6 B81 §HA (F-P7-E-20) — the human-authority patterns' contract, as pure functions over the record (CONSTRUCTION evidence; the walk
 * demonstrates; H3 accepts). Reads the real source where the clause is about the whole product (the PDP action names, no bulk approval, the
 * library exports, the contest paths' pages). Every persona and record here is SYNTHETIC.
 */
const WEB = join(__dirname, '..');
const API = join(WEB, '..', 'api');
function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    if (name === 'node_modules' || name === '.next') continue;
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (/\.tsx?$/.test(name)) out.push(p);
  }
  return out;
}
const PDP = readFileSync(join(API, 'src', 'policy', 'pdp.service.ts'), 'utf8');
/** The PDP rules in order: the prefix, exact or not, and the roles (any of) — first match wins, as the PDP reads them. */
const RULES = PDP.split(/actionPrefix:\s*/).slice(1).map((chunk) => {
  const prefix = /^'([^']+)'/.exec(chunk)?.[1] ?? '';
  const head = chunk.split(/requiredAnyRole|\n\s*\}/)[0]!;
  const roles = [...(/^[\s\S]*?requiredAnyRole:\s*\[([\s\S]*?)\]/.exec(chunk.split(/\n\s*\},?\s*\n/)[0]!)?.[1] ?? '').matchAll(/role:\s*'([a-z_]+)'/g)].map((r) => r[1]!);
  return { prefix, exact: /exact:\s*true/.test(head), roles };
}).filter((r) => r.prefix !== '');
const ruleFor = (action: string) => RULES.find((r) => (r.exact ? action === r.prefix : action.startsWith(r.prefix)));
const PDP_ACTIONS = [...new Set(RULES.map((r) => r.prefix).filter((p) => !p.endsWith('.')))];

const ok: Eligibility = { can: true, reason: null, role: 'decision_approver', basis: 'role decision_approver; named by the approver policy' };
const D1 = 'a1b2c3d4'.repeat(8); const D2 = 'f0e1d2c3'.repeat(8);

describe('REL-10 — every PDP action name has ONE interaction class; the classes stay distinct', () => {
  it('the real PDP bundle: every action maps to one of the seven classes; reads are navigation; the authority verbs are never navigation or draft', () => {
    expect(PDP_ACTIONS.length).toBeGreaterThan(300);
    const counts: Record<string, number> = {};
    for (const a of PDP_ACTIONS) {
      const c = actionClassOf(a);
      expect(INTERACTION_CLASSES, a).toContain(c);
      counts[c] = (counts[c] ?? 0) + 1;
      if (/\.read$/.test(a)) expect(c, a).toBe('navigation');
      if (/\.(approve|commit|sign|certify)$/.test(a)) expect(['approval', 'effect'], a).toContain(c);
    }
    for (const c of INTERACTION_CLASSES) expect(counts[c] ?? 0, `class ${c} is used`).toBeGreaterThan(0);
  });
  it('the decision acts: review, acknowledgment, approval, rejection, deferral, publication and effect are separate (HX-12 on the library)', () => {
    expect(actionClassOf('decision.read')).toBe('navigation');
    expect(actionClassOf('decision.package.option')).toBe('draft');
    expect(actionClassOf('decision.package.propose')).toBe('review');
    expect(actionClassOf('decision.gate.review')).toBe('review');
    expect(actionClassOf('decision.gate.acknowledge')).toBe('acknowledgment');
    expect(actionClassOf('decision.gate.ready')).toBe('review');
    expect(actionClassOf('decision.gate.request_information')).toBe('review');
    expect(actionClassOf('decision.approve')).toBe('approval');
    expect(actionClassOf('decision.gate.reject')).toBe('approval');
    expect(actionClassOf('decision.gate.defer')).toBe('approval');
    expect(actionClassOf('decision.sign.decision')).toBe('approval');
    expect(actionClassOf('decision.distribute')).toBe('publication');
    expect(actionClassOf('executive.publication.publish')).toBe('publication');
    expect(actionClassOf('decision.commit')).toBe('effect');
    expect(actionClassOf('decision.commit.preview'), 'the committer\'s recorded reading, not the commitment').toBe('review');
    expect(actionClassOf('something.entirely.unknown'), 'an unknown write fails closed as an effect').toBe('effect');
    expect(['navigation', 'draft', 'acknowledgment', 'review'].map((c) => isConsequential(c as never))).toEqual([false, false, false, false]);
    expect(['approval', 'publication', 'effect'].map((c) => isConsequential(c as never))).toEqual([true, true, true]);
  });
  it('the seam\'s ActionClass and PAT-16\'s irreversible acts', () => {
    expect(['decision.read', 'decision.package.option', 'decision.package.propose', 'decision.approve', 'decision.sign.decision', 'decision.commit', 'decision.package.withdraw', 'twin.simulation.cancel']
      .map(seamClassOf)).toEqual(['read', 'draft', 'propose', 'approve', 'sign', 'commit', 'withdraw', 'destroy']);
    expect(['decision.commit', 'decision.sign.decision', 'prediction.warning.close', 'twin.experiment.cancel'].map(isIrreversible)).toEqual([true, true, true, true]);
    expect(['decision.approve', 'decision.sign.approval', 'decision.gate.defer', 'decision.package.propose', 'decision.read'].map(isIrreversible)).toEqual([false, false, false, false, false]);
  });
  it('ACT_ROLES are the PDP rules\' own roles (first match wins), so the banner never offers what the PDP refuses', () => {
    for (const [action, roles] of Object.entries(ACT_ROLES)) {
      const r = ruleFor(action);
      expect(r, action).toBeDefined();
      expect([...r!.roles].sort(), action).toEqual([...roles].sort());
    }
  });
});

describe('CMP-046 / HX-09 — eligibility: the role, the policy, separation of duties, recusal, delegation, the state; the reason in words', () => {
  const base = { action: 'decision.approve', me: 'p-okafor-0000', isHuman: true, roles: ['decision_approver'], requiredRoles: ['decision_approver'], policy: { principals: ['p-okafor-0000'] }, state: 'proposed', openStates: ['proposed', 'under_review', 'approved'] };
  it('POSITIVE: the named approver on an open version', () => {
    expect(eligibility(base)).toEqual({ can: true, reason: null, role: 'decision_approver', basis: 'role decision_approver; named by the approver policy' });
    expect(eligibility({ ...base, policy: { roles: ['decision_approver'] } }).can).toBe(true);
    expect(eligibility({ ...base, policy: { principals: ['someone-else'] }, delegations: [{ delegator: 'someone-else-1234', delegate: 'p-okafor-0000', live: true }] }).basis).toMatch(/by delegation from someone-/);
  });
  it('REFUSALS, each with its reason: an agent, no role, a closed state, separation of duties, a recusal, not named, an ended delegation', () => {
    expect(eligibility({ ...base, isHuman: false }).reason).toMatch(/^the human gate/);
    expect(eligibility({ ...base, roles: ['executive'] }).reason).toBe('you hold none of the roles this act requires (decision_approver)');
    expect(eligibility({ ...base, state: 'deferred' }).reason).toMatch(/^the version is deferred — this act is offered on proposed, under review, approved only$/);
    expect(eligibility({ ...base, me: 'p-brandt-0000', roles: ['decision_approver', 'decision_authority'], policy: { principals: ['p-brandt-0000'] },
      excluded: [{ principal: 'p-brandt-0000', why: 'you are this package\'s owner — an owner never approves their own version' }] }).reason).toBe('separation of duties: you are this package\'s owner — an owner never approves their own version');
    expect(eligibility({ ...base, recused: ['p-okafor-0000'] }).reason).toMatch(/^you recused/);
    expect(eligibility({ ...base, policy: { principals: ['someone-else'] } }).reason).toMatch(/^the approver policy does not name you/);
    expect(eligibility({ ...base, policy: { principals: ['someone-else'] }, delegations: [{ delegator: 'x', delegate: 'p-okafor-0000', live: false }] }).can).toBe(false);
  });
  it('the roles in a domain: platform, the domain\'s own, the tenant\'s — never another domain\'s', () => {
    expect(rolesIn([{ roleCode: 'decision_approver', scope: 'DOMAIN', tenantId: 't', domainId: 'd' }, { roleCode: 'executive', scope: 'DOMAIN', tenantId: 't', domainId: 'other' },
      { roleCode: 'auditor', scope: 'TENANT', tenantId: 't', domainId: null }, { roleCode: 'platform_admin', scope: 'PLATFORM', tenantId: null, domainId: null }], { tenantId: 't', domainId: 'd' }))
      .toEqual(['auditor', 'decision_approver', 'platform_admin']);
  });
});

describe('CMP-047 / PAT-16 / CMP-044 / PAT-17 / PAT-07 — the digest freeze, the typed confirmation and the Command Review gate', () => {
  it('the digest freeze: the review binds what it showed; a change is a new version; no digest is not frozen', () => {
    expect(digestFreeze(D1, D1)).toEqual({ frozen: true, reason: null });
    expect(digestFreeze(D1, D2).reason).toMatch(/^the digest changed while you reviewed \(a1b2c3d4…c3d4 → f0e1d2c3…d2c3\): this is a new version/);
    expect(digestFreeze(null, D1).frozen).toBe(false);
    expect(digestFreeze(D1, null).reason).toMatch(/has no digest yet/);
  });
  it('the typed phrase: the short digest (or the name); exact — never a generic OK', () => {
    expect(typedPhrase({ digest: D1 })).toBe('a1b2c3d4');
    expect(typedPhrase({ digest: null, name: ' Bab el-Mandeb corridor reroute (SYNTHETIC) ' })).toBe('Bab el-Mandeb corridor reroute (SYNTHETIC)');
    expect(typedState('a1b2c3d4', ' a1b2c3d4 ')).toEqual({ ok: true, reason: null });
    expect(typedState('a1b2c3d4', 'A1B2C3D4').ok, 'case is not normalised').toBe(false);
    expect(typedState('a1b2c3d4', 'OK').reason).toBe('what you typed is not a1b2c3d4 — the act stays disabled');
    expect(typedState('a1b2c3d4', '').reason).toBe('type a1b2c3d4 to confirm');
    expect(typedState('', 'anything').ok).toBe(false);
  });
  it('the gate: eligible + frozen + consequence read + rationale + (irreversible) the typed phrase — every unmet condition named', () => {
    const s = { eligibility: ok, shownDigest: D1, currentDigest: D1, consequenceRead: true, rationale: { value: 'The reroute keeps the line running.', min: 8 } };
    expect(commandReviewGate({ action: 'decision.approve' }, s)).toEqual({ enabled: true, reasons: [] });
    /* PAT-17: required before effect — the preview not read keeps the act disabled */
    expect(commandReviewGate({ action: 'decision.approve' }, { ...s, consequenceRead: false }).reasons).toEqual(['read the consequence preview first — the act is enabled only after it']);
    /* PAT-16: the commit needs the typed phrase; a wrong one keeps it disabled */
    expect(commandReviewGate({ action: 'decision.commit' }, { ...s, rationale: null }).reasons).toEqual(['this act cannot be undone: a typed confirmation is required']);
    expect(commandReviewGate({ action: 'decision.commit' }, { ...s, rationale: null, typed: { phrase: 'a1b2c3d4', value: 'yes' } }).enabled).toBe(false);
    expect(commandReviewGate({ action: 'decision.commit' }, { ...s, rationale: null, typed: { phrase: 'a1b2c3d4', value: 'a1b2c3d4' } }).enabled).toBe(true);
    /* everything at once, in order */
    expect(commandReviewGate({ action: 'decision.sign.decision' }, { eligibility: { can: false, reason: 'the approver policy does not name you', role: null, basis: '' }, shownDigest: D1, currentDigest: D2,
      consequenceRead: false, rationale: { value: 'short', min: 8 }, typed: { phrase: 'a1b2c3d4', value: '' }, source: 'palette' }).reasons).toEqual([
      'the approver policy does not name you', 'a palette never approves — open the review and act deliberately', expect.stringMatching(/^the digest changed/),
      'read the consequence preview first — the act is enabled only after it', 'state your rationale (8+ characters, recorded with your name)', 'type a1b2c3d4 to confirm']);
  });
  it('UX-ADR-008: navigation, chat, defaults, acknowledgment, bulk and the palette never yield an approval', () => {
    for (const src of ['navigation', 'chat', 'default', 'acknowledgment', 'bulk', 'palette'] as const) expect(approvalFrom(src, { enabled: true }), src).toBeNull();
    expect(approvalFrom('deliberate', { enabled: false })).toBeNull();
    expect(approvalFrom('deliberate', { enabled: true })).toBe('deliberate');
  });
});

describe('PAT-07 — no bulk approve / commit / sign path in apps/web', () => {
  it('the scan finds a batch inside one handler and bulk copy; a per-item control rendered in a list is not bulk', () => {
    const bulk = { path: 'apps/web/app/x/page.tsx', text: "const run = async () => { await Promise.all(rows.map((r) => api.approve(scope, r.id, 1, p))); };\n" };
    const loop = { path: 'apps/web/app/y/page.tsx', text: "async function all() {\n  for (const r of rows) {\n    await gates.commit(scope, r.id, 1, d, pd);\n  }\n}\n" };
    const copy = { path: 'apps/web/app/z/page.tsx', text: "<button>Approve all selected</button>\n" };
    const perItem = { path: 'apps/web/app/w/page.tsx', text: "{r.approvals.map((a) => (<li key={a.id}><GovernedButton label=\"Sign my approval\" onRun={async () => { await api.sign(scope, p, v, 'approval', a.d, a.id); }} /></li>))}\n" };
    const f = findBulkApprovals([bulk, loop, copy, perItem]);
    expect(f.map((x) => [x.file, x.line])).toEqual([['apps/web/app/x/page.tsx', 1], ['apps/web/app/y/page.tsx', 2], ['apps/web/app/z/page.tsx', 1]]);
    expect(findBulkApprovals([{ path: 'apps/web/lib/a.test.ts', text: bulk.text }])).toEqual([]);
  });
  it('the REAL web source (app, components, lib): no bulk authority path', () => {
    const files = [...walk(join(WEB, 'app')), ...walk(join(WEB, 'components')), ...walk(join(WEB, 'lib'))].map((p) => ({ path: relative(WEB, p).split('\\').join('/'), text: readFileSync(p, 'utf8') }));
    expect(files.length).toBeGreaterThan(100);
    expect(findBulkApprovals(files)).toEqual([]);
  });
});

describe('UX-ADR-008 — the palette and intent execute nothing: a command entry only opens the page\'s Command Review', () => {
  it('B80\'s navigation entries pass; a command hand-off passes and names its action under review=', () => {
    expect(() => assertNoExecution(paletteEntries() as unknown as Array<Record<string, unknown>>)).not.toThrow();
    const h = commandHandoff('decision.approve', '/decisions/packages/0001', 'Approve corridor reroute (SYNTHETIC)');
    expect(h.href).toBe('/decisions/packages/0001?review=decision.approve');
    expect(commandHandoff('decision.commit', '/decisions?package=0001', 'Commit').href).toBe('/decisions?package=0001&review=decision.commit');
    expect(() => assertNoExecution([{ ...h }])).not.toThrow();
    expect(reviewRequested('?package=1&review=decision.approve')).toBe('decision.approve');
    expect(reviewRequested('?review=<script>')).toBeNull();
  });
  it('REFUSED: an entry that carries a function, an execute kind, a command without its review hand-off, an off-site link', () => {
    expect(() => assertNoExecution([{ kind: 'command', action: 'decision.approve', href: '/decisions?review=decision.approve', run: () => undefined }])).toThrow(/carries run\(\)/);
    expect(() => assertNoExecution([{ kind: 'execute', href: '/decisions' }])).toThrow(/is not admitted/);
    expect(() => assertNoExecution([{ kind: 'command', action: 'decision.approve', href: '/decisions' }])).toThrow(/does not hand off to its Command Review/);
    expect(() => assertNoExecution([{ kind: 'command', action: 'decision.approve', href: '/decisions?review=decision.commit' }])).toThrow(/does not hand off/);
    expect(() => assertNoExecution([{ kind: 'navigate', href: 'https://elsewhere.example/' }])).toThrow(/does not lead to a page of this product/);
    expect(() => assertNoExecution([{ kind: 'search', href: '//elsewhere.example/' }])).toThrow(/does not lead/);
  });
});

describe('CMP-045 / HX-13 — the consequence: the server preview in words; where none exists, the effect STATED (and said so)', () => {
  it('the commit preview (decision.commit_preview): effect, affected objects and people, reversibility, residual risk, audit, blockers', () => {
    const v = consequenceFromPreview({ intended_effect: { statement: 'Commit: Reroute via the Cape', bound_action: 'decision.commit', op_class: 'C3' }, affected_objects: { decision: 'd-0000000000001', objectives: ['o1'], runs: ['r1', 'r2'] },
      reversibility: 'reversible within one sailing', residual_risk: { conditions_failed: 0, source_impact_outstanding: 1 }, blockers: [], would_commit: true });
    expect(v).toMatchObject({ effect: 'Commit: Reroute via the Cape (decision.commit, C3)', affected: ['decision d-000000…', '1 objective(s)', '2 run(s)'], reversibility: 'reversible within one sailing',
      residualRisk: '0 failing condition(s), 1 source-impact marker(s) outstanding', source: 'server', blockers: [] });
    expect(consequenceFromPreview({}).reversibility).toBe('not stated');
  });
  it('the catalogue states the effect for an act no server preview exists for; an unknown act has none (never invented)', () => {
    expect(consequenceStated('decision.approve')).toMatchObject({ source: 'stated', reversibility: 'revocable by you until the commitment' });
    expect(consequenceStated('decision.gate.defer')!.effect).toMatch(/nothing is deleted/);
    expect(consequenceStated('decision.sign.decision')!.reversibility).toMatch(/^cannot be undone/);
    expect(consequenceStated('unknown.act')).toBeNull();
  });
});

describe('CMP-047 / CMP-048 / PAT-06 / PAT-08 / PAT-11 — the digest, the signature receipt, the review record, the defer, the withdrawal', () => {
  const pkg = { statement: 'Whether to reroute the corridor consignments around the Cape (SYNTHETIC)', versions: [
    { version: 1, version_digest: D1, options: [{ key: 'status-quo', title: 'Do nothing', kind: 'status_quo', consequences: [{ kind: 'run', id: 'run-000000000001', version: 1 }] }, { key: 'reroute', title: 'Reroute via the Cape', kind: 'intervention', consequences: [] }],
      choice: { option_key: 'reroute', rationale: 'keeps the line running' }, dissent: [{ position: 'against', rationale: 'premium too high' }], constraints: ['no air freight above 60 t/week'], missing_information: [] },
    { version: 2, version_digest: null, options: [], choice: null, dissent: [], constraints: [] },
  ] };
  it('the decision digest: the frozen version whole; a newer version named, never moved to in place; a draft is not frozen', () => {
    const d = decisionDigestView(pkg, 1)!;
    expect(d).toMatchObject({ version: 1, digest: D1, frozen: true, options: ['Do nothing (status-quo, status quo)', 'Reroute via the Cape (reroute)'], evidence: ['run run-0000…@1'],
      recommendation: 'option reroute — “keeps the line running”', dissent: ['against — premium too high'], conditions: ['constraint: no air freight above 60 t/week'], newer: 2 });
    expect(d.note).toMatch(/^frozen at a1b2c3d4…c3d4 — any change is a new version/);
    expect(decisionDigestView(pkg, 2)!).toMatchObject({ frozen: false, newer: null, recommendation: 'no choice yet — a menu of options is not a proposal' });
    expect(decisionDigestView(pkg, 9)).toBeNull();
  });
  it('the signature receipt: actor, command, object, time, result, the key — VERIFIED only as the server says; copyable whole', () => {
    const r = signatureReceiptView({ signature_id: 'sig-1', signer: 'p-brandt-0000', subject_digest: D1, signed_at: '2026-10-19T09:00:00.000Z', bound_action: 'decision.sign.decision', key_id: 'ed25519:0123456789abcdef', verified: true },
      { command: 'decision.sign.decision', object: 'DPK pkg-1 v1', role: 'decision authority' });
    expect(r).toMatchObject({ signer: 'p-brandt-0000', role: 'decision authority', digest: D1, verified: true, keyId: 'ed25519:0123456789abcdef', result: 'VERIFIED by the server', boundAction: 'decision.sign.decision' });
    expect(r.copy.split('\n')).toEqual(['signature sig-1', 'signer p-brandt-0000 (decision authority)', 'command decision.sign.decision', 'object DPK pkg-1 v1', `digest ${D1}`, 'key ed25519:0123456789abcdef', 'signed at 2026-10-19T09:00:00.000Z', 'result VERIFIED by the server']);
    expect(signatureReceiptView({ verified: false }, { command: 'decision.sign.approval', object: 'APR a' }).result).toMatch(/^NOT VERIFIED/);
  });
  it('the review record: reviewer, version, evidence, findings — not decision authority; other acts are not reviews', () => {
    expect(reviewRecordView({ action: 'review', actor_principal_id: 'p-hoffmann-01', version: 1, rationale: 'Read the corridor evidence; the AIS lag is noted.', at: '2026-10-19T08:00:00Z' }, D1))
      .toEqual({ reviewer: 'p-hoffmann-01', version: 1, evidence: 'the version as proposed (a1b2c3d4…c3d4)', findings: 'Read the corridor evidence; the AIS lag is noted.', at: '2026-10-19T08:00:00Z', act: 'reviewed', authority: 'not decision authority' });
    expect(reviewRecordView({ action: 'ready', information_package_digest: D2, rationale: 'independent read' }, D1)!.evidence).toBe('the information package f0e1d2c3…d2c3');
    expect(reviewRecordView({ action: 'defer' }, D1)).toBeNull();
  });
  it('the defer intake: rationale, next review, conditions, owner — every gap named; the line says what a pre-B81 defer did not capture', () => {
    const now = new Date('2026-10-19T09:00:00Z');
    const f = { rationale: 'Deferred until the broker confirms (SYNTHETIC)', nextReviewAt: '2026-10-26T09:00', conditions: ['  The broker confirms pre-clearance '], owner: '' };
    expect(deferIntake(f, now)).toEqual({ rationale: 'Deferred until the broker confirms (SYNTHETIC)', nextReviewAt: new Date('2026-10-26T09:00').toISOString(), conditions: ['The broker confirms pre-clearance'] });
    expect(deferIntake({ ...f, owner: '0190a1b2-c3d4-7e5f-8a9b-0c1d2e3f4a5b' }, now)).toMatchObject({ owner: '0190a1b2-c3d4-7e5f-8a9b-0c1d2e3f4a5b' });
    expect(deferIntake({ ...f, conditions: [] }, now)).toBe('state at least one condition for the next review');
    expect(deferIntake({ ...f, conditions: ['same thing', 'Same Thing'] }, now)).toBe('state each condition once');
    expect(deferIntake({ ...f, nextReviewAt: '2026-10-18T09:00' }, now)).toBe('the next review is in the future');
    expect(deferIntake({ ...f, nextReviewAt: '2027-06-01T09:00' }, now)).toBe('the next review is within 180 days');
    expect(deferIntake({ ...f, owner: 'L. Brandt' }, now)).toMatch(/is a principal id/);
    expect(deferIntake({ ...f, rationale: 'later' }, now)).toBe('state the rationale (8+ characters)');
    expect(deferLine({ action: 'defer', next_review_at: '2026-10-26T09:00:00Z', defer_conditions: ['The broker confirms'], defer_owner_principal_id: '0190a1b2-c3d4-7e5f-8a9b-0c1d2e3f4a5b' }))
      .toBe('deferred to 2026-10-26T09:00:00Z · owner 0190a1b2… · conditions: “The broker confirms”');
    expect(deferLine({ action: 'defer', next_review_at: '2026-10-26T09:00:00Z', defer_conditions: null, defer_owner_principal_id: null })).toMatch(/recorded before conditions and an owner were captured$/);
    expect(deferLine({ action: 'review' })).toBeNull();
  });
  it('the withdrawal: identity, reason, recipients, replacement — absence said, nothing erased', () => {
    expect(withdrawalView({})).toEqual({ identity: 'withdrawn — the actor is not recorded', reason: 'no reason recorded', recipients: ['no distribution recorded — nobody had received the record'], replacement: 'no replacement recorded', erased: false });
    expect(withdrawalView({ by: 'p-brandt-000000', at: '2026-10-19', reason: 'superseded by the Cape plan', recipients: [{ recipient_principal_id: 'p-okafor-000000', channel: 'in_app' }], replacement: { href: '/decisions?package=2', label: 'package 2' } }))
      .toEqual({ identity: 'withdrawn by p-brandt… at 2026-10-19', reason: 'superseded by the Cape plan', recipients: ['p-okafor… via in_app'], replacement: 'replaced by package 2', erased: false });
  });
});

describe('HX-14 — every decision-active type has a contest path (challenge, evidence, reviewer, status, escalation, outcome)', () => {
  it('the registry: no decision-active type without a contest path; each appeal kind is B35\'s; each page exists', () => {
    expect(missingContestPaths(DECISION_ACTIVE_TYPES)).toEqual([]);
    expect(missingContestPaths([...DECISION_ACTIVE_TYPES, 'warning']), 'a decision-active type without a contest path fails').toEqual(['warning']);
    for (const c of CONTEST_PATHS) {
      if (c.appeal !== null) expect(APPEAL_SUBJECT_KINDS as readonly string[], c.type).toContain(c.appeal);
      expect(statSync(join(WEB, 'app', ...c.page.split('/').filter(Boolean), 'page.tsx')).isFile(), c.page).toBe(true);
    }
  });
  it('the rows: a B36 challenge and a B35 appeal case in the six fields', () => {
    const rows = contestRows([{ challenge_id: 'c1', challenger_principal_id: 'p-auditor-00001', standing: 'member', reason: 'the second source was never audited', resolved_at: null }],
      [{ case_id: 'a1', appellant_principal_id: 'p-lange-0000001', evidence: [{}, {}], grounds: 'the AIS feed was stale', adjudicator_principal_id: null, state: 'opened', deadline_at: '2026-10-26T00:00Z', overdue: true, outcome: null }]);
    expect(rows).toEqual([
      { kind: 'challenge', id: 'c1', raisedBy: 'p-audito… (member)', evidence: 'the second source was never audited', reviewer: 'the package owner (to resolve)', status: 'open — the commitment is held', escalation: 'before the commitment — the commit is held while it is open', outcome: 'pending' },
      { kind: 'appeal', id: 'a1', raisedBy: 'p-lange-…', evidence: '2 evidence item(s) — grounds: the AIS feed was stale', reviewer: 'no adjudicator assigned yet', status: 'opened', escalation: 'OVERDUE — the response was due 2026-10-26T00:00Z', outcome: 'not adjudicated' },
    ]);
  });
});

describe('UX-ADR-007 / the library — authority as product state on every consequential gate; the components are the seams\'', () => {
  it('each consequential gate names its route (a page that exists) and its parts; a gate not composed yet names its carrier', () => {
    for (const s of AUTHORITY_SURFACES) {
      expect(statSync(join(WEB, 'app', ...s.route.split('/').filter(Boolean), 'page.tsx')).isFile(), s.route).toBe(true);
      expect(s.digest && s.receipt, s.gate).toBe(true);
    }
    expect(AUTHORITY_SURFACES.filter((s) => s.carrier === null).map((s) => s.route)).toEqual(['/decisions', '/decisions/board', '/observation/sources/new', '/admin/tenants']);
  });
  it('components/authority.tsx exports exactly the seams\' names, and nothing in apps/web/app forks them', () => {
    const text = readFileSync(join(WEB, 'components', 'authority.tsx'), 'utf8');
    const exported = [...text.matchAll(/^export function ([A-Z][A-Za-z0-9]*)\b/gm)].map((m) => m[1]).sort();
    expect(exported).toEqual([...LIBRARY_B81.authority.exports].sort());
    const pages = walk(join(WEB, 'app')).map((p) => ({ path: relative(WEB, p), text: readFileSync(p, 'utf8') }));
    const forks = pages.flatMap((f) => LIBRARY_B81.authority.exports.filter((n) => new RegExp(`(?:function|const)\\s+${n}\\b`).test(f.text)).map((n) => `${f.path}: ${n}`));
    expect(forks).toEqual([]);
    expect(text, 'GovernedButton is composed, never redefined').toMatch(/import \{[^}]*GovernedButton[^}]*\} from '\.\/observation'/);
    expect(text, 'Receipt is composed, never redefined').toMatch(/import \{[^}]*Receipt[^}]*\} from '\.\/ui'/);
  });
});
