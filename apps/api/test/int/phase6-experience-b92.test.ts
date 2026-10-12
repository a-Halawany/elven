/**
 * CP-6 B92 §UX (migration 0113_b92_x_ux; UX-70-001..006, CAP-PD-09; DESIGN D12–D14) — THE EXPERIENCE-QUALITY WORKFLOW on a real database through
 * the real pipeline, PDP, ports and controller. Every persona, purpose, journey, event and pseudonym here is SYNTHETIC fixture data; the
 * harness proves SOFTWARE CAPABILITY — never a real-provider or signed acceptance (UX-70-006's named authorities → R2 / B107).
 *
 *   UX1 · consent: the person's own grant / withdrawal for an approved purpose; history; a changed purpose needs a new consent; nobody grants
 *         for another; an agent has none to give (PEP and port); RLS shows a person only their own rows.
 *   UX2 · telemetry definitions + the privacy review (a named privacy officer, never the proposer, at the digest) + hold / release (routed
 *         privacy review) + versions; minimisation of the whitelist (content, identifiers, free text, persons refused).
 *   UX3 · ingestion: consented → collected; not consented → NOT collected, counted without shape, no error; held → refused (state), counted
 *         with its shape; outside the whitelist → refused (minimisation), counted; retired → refused; unknown → 404; the recovery.
 *   UX4 · pseudonymity: no principal id, no correlation id, no instant finer than the day stored; the pseudonym rotates per day and per
 *         purpose; no runtime role reads the events or the salt; the audit row names no event; k at read (a segment below k suppressed).
 *   UX5 · journeys, segments, baselines (determinate with uncertainty; indeterminate below the floor, below k, for a partial period, with no
 *         events, while held), thresholds (the owner approves, never the proposer) → a crossing routed as a REVIEW finding.
 *   UX6 · experiments: the variant kinds, no engagement proxy, no manipulation; TWO approvals by two people, neither the proposer; the
 *         assignment (the control without consent); SRM invalidation (routed); a privacy hold and a drifted definition invalidate; a valid
 *         analysis with Newcombe's interval; the conclusion by a named owner (adopt only on a valid, better arm).
 *   UX7 · findings → actions: the agent proposes; the agent is refused deciding at the PEP and at the port; the owner decides against the
 *         consequence preview (stale → 409); hold_collection, retire_measure, backlog_item, dismissal; the finding's proposer never decides.
 *   UX8 · the governed purge (counts per definition, never silent) and the export (aggregates only, k suppression, the digest verified).
 *   UXE · the `product_analytics` licence on a CONTRACTED tenant (runs LAST: it contracts the harness tenant): recording is gated (EYE-ENT-001);
 *         a consent withdrawal, the person's own read, the workspace and a human-gated act stay available; reissued, recording passes.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { sql } from 'kysely';
import { uuidv7 } from 'uuidv7';
import { createHash } from 'node:crypto';
import { HttpException } from '@nestjs/common';
import type { AuthenticatedPrincipal } from '../../src/shared/auth-types.js';
import type { EntitlementsVendorController } from '../../src/commercial/entitlements/entitlements.controller.js';
import { asObservationRefusal } from '../../src/observation/observation-errors.js';
import { ExperienceController } from '../../src/analytics/experience/experience.controller.js';
import { ExecutiveController } from '../../src/executive/executive.controller.js';
import { Phase4Harness } from './phase4-helpers.js';

type Row = Record<string, unknown>;
let h: Phase4Harness; let c: ExperienceController;
const T = () => h.fx.tenantId; const D = () => h.fx.domainId;
const RUN = uuidv7().slice(-6);
const arr = (v: unknown): Row[] => (Array.isArray(v) ? (v as Row[]) : []);
const sha = (s: string) => createHash('sha256').update(s).digest('hex');
const pseud = () => sha(`synthetic-pseudonym-${uuidv7()}`);

// ── personas (SYNTHETIC) ─────────────────────────────────────────────────────────────────────────
let analyst: AuthenticatedPrincipal; let analyst2: AuthenticatedPrincipal;
let owner: AuthenticatedPrincipal; let owner2: AuthenticatedPrincipal;
let privacy: AuthenticatedPrincipal; let dual: AuthenticatedPrincipal;   // dual: the owner's AND the privacy officer's roles (one person)
let users: AuthenticatedPrincipal[] = []; let nc: AuthenticatedPrincipal;  // the people whose experience is measured; nc never consents
let dadmin: AuthenticatedPrincipal; let outsider: AuthenticatedPrincipal; let foreign: AuthenticatedPrincipal;
let agent: AuthenticatedPrincipal;        // the attention agent (an agent, claims agent)
let agentAnalyst: AuthenticatedPrincipal; // an agent holding a human role: the PEP's human gate refuses it
let machineOwner: AuthenticatedPrincipal; // an AGENT in the database holding the owner's role, its session claiming a human: the PEP passes, the PORT refuses
let otherDomain = '';

// ── refusals ─────────────────────────────────────────────────────────────────────────────────────
const refusal = async (p: Promise<unknown>): Promise<{ status: number | null; code: string | null; message: string }> => {
  const e = await p.then(() => { throw new Error('the call should have been refused'); }, (err: unknown) => err);
  const mapped = e instanceof HttpException ? e : asObservationRefusal(e, 'harness');
  if (mapped === null) return { status: null, code: null, message: e instanceof Error ? e.message : String(e) };
  const r = mapped.getResponse() as { code?: string; message?: string };
  return { status: mapped.getStatus(), code: r.code ?? null, message: String(r.message ?? (e instanceof Error ? e.message : '')) };
};
const refused = async (p: Promise<unknown>, re: RegExp, status: number) => { const r = await refusal(p); expect(r.message).toMatch(re); expect(r.status, r.message).toBe(status); return r; };
const one = async (q: ReturnType<typeof sql>) => ((await q.execute(h.su)).rows[0] ?? {}) as Row;
const rows = async (q: ReturnType<typeof sql>) => (await q.execute(h.su)).rows as Row[];
const rq = (as: AuthenticatedPrincipal, action: string, ot = 'AJN', id: string | null = null, domainId?: string) => {
  const r = h.req(as, action, ot, id, 'intelligence') as { eyeEnvelope: Row };
  if (domainId !== undefined) r.eyeEnvelope['domain_id'] = domainId;
  return r as never;
};
const P = (payload: Row) => ({ payload });

// ── the routes (the controller, as the web calls it) ─────────────────────────────────────────────
const self = (as: AuthenticatedPrincipal) => c.self(rq(as, 'analytics.consent.read', 'ACN'), T(), D()) as Promise<Row>;
const grant = (as: AuthenticatedPrincipal, purposeKey: string, extra: Row = {}) => c.grant(rq(as, 'analytics.consent.grant', 'ACN'), T(), D(), P({ purposeKey, ...extra })) as Promise<{ consent: Row }>;
const withdraw = (as: AuthenticatedPrincipal, purposeKey: string) => c.withdraw(rq(as, 'analytics.consent.withdraw', 'ACN'), T(), D(), P({ purposeKey })) as Promise<{ consent: Row }>;
const record = (as: AuthenticatedPrincipal, payload: Row) => c.record(rq(as, 'analytics.telemetry.record', 'ATE'), T(), D(), P(payload)) as Promise<{ telemetry: Row }>;
const define = (as: AuthenticatedPrincipal, payload: Row) => c.define(rq(as, 'analytics.telemetry.define', 'ATD'), T(), D(), P(payload)) as Promise<{ definition: Row }>;
const review = (as: AuthenticatedPrincipal, id: string, payload: Row) => c.review(rq(as, 'analytics.telemetry.review', 'ATD', id), T(), D(), id, P(payload)) as Promise<{ definition: Row }>;
const hold = (as: AuthenticatedPrincipal, id: string, reason: string) => c.hold(rq(as, 'analytics.telemetry.hold', 'ATD', id), T(), D(), id, P({ reason })) as Promise<{ definition: Row }>;
const release = (as: AuthenticatedPrincipal, id: string, reason: string) => c.release(rq(as, 'analytics.telemetry.release', 'ATD', id), T(), D(), id, P({ reason })) as Promise<{ definition: Row }>;
const retire = (as: AuthenticatedPrincipal, id: string, reason: string) => c.retire(rq(as, 'analytics.telemetry.retire', 'ATD', id), T(), D(), id, P({ reason })) as Promise<{ definition: Row }>;
const purge = (as: AuthenticatedPrincipal, reason: string) => c.purge(rq(as, 'analytics.telemetry.purge', 'APG'), T(), D(), P({ reason })) as Promise<{ purge: Row }>;
const journey = (as: AuthenticatedPrincipal, payload: Row) => c.journey(rq(as, 'analytics.experience.journey.declare'), T(), D(), P(payload)) as Promise<{ journey: Row }>;
const segment = (as: AuthenticatedPrincipal, payload: Row) => c.segment(rq(as, 'analytics.experience.segment.declare', 'ASG'), T(), D(), P(payload)) as Promise<{ segment: Row }>;
const baseline = (as: AuthenticatedPrincipal, payload: Row) => c.baseline(rq(as, 'analytics.experience.baseline.record', 'ABL'), T(), D(), P(payload)) as Promise<{ baseline: Row }>;
const proposeThreshold = (as: AuthenticatedPrincipal, payload: Row) => c.proposeThreshold(rq(as, 'analytics.experience.threshold.propose', 'ATH'), T(), D(), P(payload)) as Promise<{ threshold: Row }>;
const decideThreshold = (as: AuthenticatedPrincipal, id: string, payload: Row) =>
  c.decideThreshold(rq(as, payload['decision'] === 'retire' ? 'analytics.experience.threshold.retire' : 'analytics.experience.threshold.decide', 'ATH', id), T(), D(), id, P(payload)) as Promise<{ threshold: Row }>;
const proposeExperiment = (as: AuthenticatedPrincipal, payload: Row) => c.proposeExperiment(rq(as, 'analytics.experiment.propose', 'AEX'), T(), D(), P(payload)) as Promise<{ experiment: Row }>;
const approveExperiment = (as: AuthenticatedPrincipal, id: string, payload: Row) => c.approveExperiment(rq(as, 'analytics.experiment.approve', 'AEX', id), T(), D(), id, P(payload)) as Promise<{ experiment: Row }>;
const assignment = (as: AuthenticatedPrincipal, id: string) => c.assignment(rq(as, 'analytics.experiment.assignment.read', 'AEX', id), T(), D(), id) as Promise<{ assignment: Row }>;
const analyse = (as: AuthenticatedPrincipal, id: string) => c.analyse(rq(as, 'analytics.experiment.analyse', 'AEX', id), T(), D(), id) as Promise<{ analysis: Row }>;
const conclude = (as: AuthenticatedPrincipal, id: string, payload: Row) => c.conclude(rq(as, 'analytics.experiment.conclude', 'AEX', id), T(), D(), id, P(payload)) as Promise<{ experiment: Row }>;
const proposeFinding = (as: AuthenticatedPrincipal, payload: Row) => c.proposeFinding(rq(as, 'analytics.experience.finding.propose', 'AFI'), T(), D(), P(payload)) as Promise<{ finding: Row }>;
const preview = (as: AuthenticatedPrincipal, id: string, payload: Row) => c.preview(rq(as, 'analytics.read', 'AFI', id), T(), D(), id, P(payload)) as Promise<{ preview: Row }>;
const decide = (as: AuthenticatedPrincipal, id: string, payload: Row) => c.decide(rq(as, 'analytics.experience.action.decide', 'AAC', id), T(), D(), id, P(payload)) as Promise<{ action: Row }>;
const exportCreate = (as: AuthenticatedPrincipal, title: string) => c.exportCreate(rq(as, 'analytics.export.create', 'AXP'), T(), D(), P({ title })) as Promise<{ export: Row }>;
const exportRead = (as: AuthenticatedPrincipal, id: string, domainId = D()) => c.exportRead(rq(as, 'analytics.read', 'AXP', id, domainId), T(), domainId, id) as Promise<{ export: Row }>;
const workspace = (as: AuthenticatedPrincipal) => c.workspace(rq(as, 'analytics.read'), T(), D()) as Promise<Row>;

// ── fixtures ─────────────────────────────────────────────────────────────────────────────────────
const PURPOSE = 'experience-telemetry';
async function plantPurpose(key: string, kind: string, o: { version?: number; state?: string; retention?: number } = {}): Promise<string> {
  const id = uuidv7(); const state = o.state ?? 'approved';
  await sql`insert into analytics.purposes (purpose_id, scope, tenant_id, domain_id, purpose_key, version, title, purpose_kind, description, retention_days, state, digest, proposed_by,
      decided_by, decided_at, decision_reason, correlation_id)
    values (${id}::uuid, 'DOMAIN', ${T()}::uuid, ${D()}::uuid, ${key}, ${o.version ?? 1}, ${`${key} (SYNTHETIC purpose)`}, ${kind},
      ${`the SYNTHETIC ${kind} purpose ${key} the B92 §UX harness collects under`}, ${o.retention ?? 180}, ${state}, ${sha(`${key}-${o.version ?? 1}-${RUN}`)}, ${analyst.principalId}::uuid,
      ${state === 'proposed' ? null : privacy.principalId}::uuid, ${state === 'proposed' ? null : new Date().toISOString()}::timestamptz, ${state === 'proposed' ? null : 'approved for the harness (SYNTHETIC)'}, ${uuidv7()}::uuid)`.execute(h.su);
  return id;
}
async function machine(roles: string[], label: string, claimKind: 'human' | 'agent', assurance: 'password' | 'agent_grant'): Promise<AuthenticatedPrincipal> {
  const id = uuidv7();
  await sql`insert into identity.principals (id, kind, scope, tenant_id, domain_id, display_name, login_name, status)
            values (${id}::uuid, 'agent', 'DOMAIN', ${T()}::uuid, ${D()}::uuid, ${`b92ux-${label}-${id.slice(-8)}`}, ${`b92ux-${label.slice(0, 5)}-${id.slice(-8)}`}, 'active')`.execute(h.su);
  for (const role of roles) await sql`insert into identity.role_bindings (id, principal_id, role_code, scope, tenant_id, domain_id) values (${uuidv7()}::uuid, ${id}::uuid, ${role}, 'DOMAIN', ${T()}::uuid, ${D()}::uuid)`.execute(h.su);
  return h.openSession({ ...h.manager, principalId: id, kind: claimKind, assurance, homeScope: 'DOMAIN', homeDomainId: D(), bindings: roles.map((roleCode) => ({ roleCode, scope: 'DOMAIN', tenantId: T(), domainId: D() })) } as AuthenticatedPrincipal);
}
/** a journey (the analyst's) and an APPROVED definition per step (the analyst defines, the privacy officer reviews at the digest) */
async function journeyWithDefs(key: string, steps: string[], fields: Row = {}): Promise<Record<string, Row>> {
  await journey(analyst, { key, title: `${key} (SYNTHETIC journey)`, purposeKey: PURPOSE, objective: `people complete ${key} without help or error (SYNTHETIC quality objective)`, steps, floor: 5 });
  const out: Record<string, Row> = {};
  for (const s of steps) {
    const d = (await define(analyst, { eventKey: `${key}.${s}`, title: `${key} ${s} (SYNTHETIC)`, journeyKey: key, stepKey: s, fields })).definition;
    out[s] = (await review(privacy, String(d['definition_id']), { decision: 'approve', reason: 'whitelisted enumerations only; minimised', digest: d['digest'] })).definition;
  }
  return out;
}
/** SYNTHETIC events inserted by the superuser (the population a baseline or an analysis measures); day = 'today' or YYYY-MM-DD */
type Ev = { def: Row; pseudonym: string; outcome: string; day?: string; duration?: number | null; roles?: string[]; experiment?: string | null; variant?: string | null };
async function plant(evs: Ev[]): Promise<void> {
  const data = evs.map((e) => ({ definition_id: e.def['definition_id'], definition_version: e.def['version'], event_key: e.def['event_key'], purpose_key: e.def['purpose_key'], journey_key: e.def['journey_key'],
    step_key: e.def['step_key'], pseudonym: e.pseudonym, roles: e.roles ?? ['domain_analyst'], outcome: e.outcome, duration_ms: e.duration ?? null, experiment_id: e.experiment ?? null, variant: e.variant ?? null,
    day: e.day ?? null }));
  for (let i = 0; i < data.length; i += 400) {
    await sql`insert into analytics.telemetry_events (scope, tenant_id, domain_id, definition_id, definition_version, event_key, purpose_key, journey_key, step_key, pseudonym, roles, outcome, duration_ms, fields, experiment_id, variant, event_day)
      select 'DOMAIN', ${T()}::uuid, ${D()}::uuid, x.definition_id, x.definition_version, x.event_key, x.purpose_key, x.journey_key, x.step_key, x.pseudonym, x.roles, x.outcome, x.duration_ms, '{}'::jsonb,
             x.experiment_id, x.variant, coalesce(x.day::date, analytics.aux_today())
        from jsonb_to_recordset(${JSON.stringify(data.slice(i, i + 400))}::jsonb) as x(definition_id uuid, definition_version int, event_key text, purpose_key text, journey_key text, step_key text,
             pseudonym text, roles text[], outcome text, duration_ms int, experiment_id uuid, variant text, day text)`.execute(h.su);
  }
}
/** units of a two-step journey (start → finish): `success` of them finish */
function units(defs: Record<string, Row>, n: number, success: number, o: { experiment?: string; variant?: string; day?: string } = {}): Ev[] {
  const out: Ev[] = [];
  for (let i = 0; i < n; i++) {
    const ps = pseud();
    out.push({ def: defs['start'] as Row, pseudonym: ps, outcome: 'started', experiment: o.experiment ?? null, variant: o.variant ?? null, day: o.day });
    if (i < success) out.push({ def: defs['finish'] as Row, pseudonym: ps, outcome: 'success', duration: 1000 + i, experiment: o.experiment ?? null, variant: o.variant ?? null, day: o.day });
  }
  return out;
}
const itemsOf = (subject: string) => rows(sql`select signal_class, subject_kind, state, route_roles, title from executive.attention_items where subject_id = ${subject}::uuid order by created_at`);

let J1: Record<string, Row> = {};   // review-drilldown: open → drill_down → done
let J2: Record<string, Row> = {};   // experience-page: open → act

beforeAll(async () => {
  h = await Phase4Harness.boot();
  c = h.app.get(ExperienceController);
  analyst = await h.humanWithSession(['product_analyst'], 'b92ux-analyst');
  analyst2 = await h.humanWithSession(['product_analyst'], 'b92ux-analyst-2');
  owner = await h.humanWithSession(['product_analytics_owner'], 'b92ux-owner');
  owner2 = await h.humanWithSession(['product_analytics_owner'], 'b92ux-owner-2');
  privacy = await h.humanWithSession(['privacy_officer'], 'b92ux-privacy');
  dual = await h.humanWithSession(['product_analytics_owner', 'privacy_officer'], 'b92ux-dual');
  for (const [i, r] of ['executive', 'decision_owner', 'domain_analyst', 'strategy_owner', 'executive', 'board_member'].entries()) users.push(await h.humanWithSession([r], `b92ux-user-${i}`));
  nc = await h.humanWithSession(['executive'], 'b92ux-no-consent');
  dadmin = await h.humanWithSession(['domain_admin'], 'b92ux-dadmin');
  outsider = await h.humanWithSession(['simulation_operator'], 'b92ux-outsider');
  agent = await machine(['attention_agent'], 'attention', 'agent', 'agent_grant');
  agentAnalyst = await machine(['domain_analyst'], 'agent-analyst', 'agent', 'agent_grant');
  machineOwner = await machine(['product_analytics_owner', 'domain_analyst'], 'machine-owner', 'human', 'password');
  otherDomain = uuidv7();
  await sql`insert into tenancy.domains (id, tenant_id, name, status, activated_at) values (${otherDomain}::uuid, ${T()}::uuid, ${'b92ux-other-' + RUN}, 'active', clock_timestamp())`.execute(h.su);
  foreign = await h.humanWithSession(['product_analytics_owner'], 'b92ux-foreign', 'DOMAIN', { domainId: otherDomain });
  // the purposes (§MD's ports are a part's: planted by the superuser, the prelude idiom) — SYNTHETIC
  await plantPurpose(PURPOSE, 'product_improvement', { retention: 180 });
  await plantPurpose('mission-outcomes', 'mission_outcome');
  await plantPurpose('ux-research', 'product_improvement');
  await plantPurpose('proposed-only', 'product_improvement', { state: 'proposed' });
  // the published attention policy: experience findings to the product analytics owner, privacy reviews to the privacy officer (SYNTHETIC)
  await h.app.get(ExecutiveController).publishAttentionPolicy(h.req(dadmin, 'executive.attention.policy.publish', 'ATP', null, 'executive'), T(), D(), { payload: {
    reason: 'B92 §UX harness: experience findings to the product analytics owner; privacy reviews to the privacy officer',
    rules: { classes: {
      'analytics.experience': { materiality: { min_consequence: 'C1', min_confidence: 0.5 }, route_roles: ['product_analytics_owner'], ack_within_minutes: 1440, escalate_to_roles: ['domain_admin'], max_escalations: 1, suppression: { allowed: false }, notify: 'in_app' },
      'analytics.privacy': { materiality: { min_consequence: 'C1', min_confidence: 0.5 }, route_roles: ['privacy_officer'], ack_within_minutes: 1440, escalate_to_roles: ['domain_admin'], max_escalations: 1, suppression: { allowed: false }, notify: 'in_app' },
    }, overload: { max_open_per_role: 50 } } } as never });
}, 600_000);

afterAll(async () => { await h?.close(); });

describe('UX1 · consent: the person\'s own, for an approved purpose', () => {
  it('positive: a person grants consent for the approved telemetry purpose — current, its history, a repeated grant unchanged; withdrawn; granted again', async () => {
    const u = users[0] as AuthenticatedPrincipal;
    const g = (await grant(u, PURPOSE)).consent;
    expect(g).toMatchObject({ decision: 'granted', purpose_key: PURPOSE, purpose_version: 1, unchanged: false, current: true, principal_id: u.principalId });
    expect((await grant(u, PURPOSE)).consent).toMatchObject({ unchanged: true, current: true });
    let s = arr((await self(u))['purposes']).find((x) => x['purpose_key'] === PURPOSE) as Row;
    expect(s).toMatchObject({ consented: true });
    expect(arr(s['history']).map((x) => x['decision'])).toEqual(['granted']);
    expect((await withdraw(u, PURPOSE)).consent).toMatchObject({ decision: 'withdrawn', current: false });
    s = arr((await self(u))['purposes']).find((x) => x['purpose_key'] === PURPOSE) as Row;
    expect(s['consented']).toBe(false);
    expect((await grant(u, PURPOSE)).consent).toMatchObject({ decision: 'granted', current: true });
    for (const x of users.slice(1)) await grant(x, PURPOSE);
    // the self read lists only telemetry purposes (a mission-outcome purpose is not one a person is asked to consent to)
    expect(arr((await self(u))['purposes']).map((x) => x['purpose_key'])).not.toContain('mission-outcomes');
  });
  it('refusal: an unknown or unapproved purpose (404), a purpose of another kind (422), consent for ANOTHER person (403 person), an agent (PEP human gate), an agent claiming a human (the port)', async () => {
    const u = users[0] as AuthenticatedPrincipal;
    await refused(grant(u, 'proposed-only'), /^consent rejected \(unknown_purpose\): proposed-only has no approved purpose/, 404);
    await refused(grant(u, 'no-such-purpose'), /^consent rejected \(unknown_purpose\)/, 404);
    await refused(grant(u, 'mission-outcomes'), /^consent rejected \(purpose\): mission-outcomes is a mission_outcome purpose/, 422);
    await refused(grant(u, PURPOSE, { forPrincipal: nc.principalId }), /^consent rejected \(person\): consent is given by the person themselves/, 403);
    await refused(grant(agentAnalyst, PURPOSE), /human gate: analytics\.consent\.grant requires a named human principal/, 403);
    await refused(grant(machineOwner, PURPOSE), /^consent rejected \(actor\): consent is a person's own act/, 403);
    await refused(grant(agent, PURPOSE), /./, 403);
  });
  it('the person\'s rows only: another person\'s self read shows none of theirs; the privacy officer sees counts, never who', async () => {
    const s = arr((await self(nc))['purposes']).find((x) => x['purpose_key'] === PURPOSE) as Row;
    expect(s).toMatchObject({ consented: false, history: [] });
    const counts = arr((await workspace(privacy))['consent_counts']).find((x) => x['purpose_key'] === PURPOSE) as Row;
    expect(counts).toMatchObject({ consenting_now: users.length, withdrawals_recorded: 1 });
    expect(JSON.stringify(counts)).not.toContain((users[0] as AuthenticatedPrincipal).principalId);
    await expect(sql`update analytics.consents set decision = 'granted'`.execute(h.su)).rejects.toThrow(/append/i);
  });
  it('recovery: a CHANGED purpose (a new approved version) needs a new consent — the old one never carries over; granted again, it is current', async () => {
    const u = users[1] as AuthenticatedPrincipal;
    await grant(u, 'ux-research');
    expect((arr((await self(u))['purposes']).find((x) => x['purpose_key'] === 'ux-research') as Row)['consented']).toBe(true);
    await sql`update analytics.purposes set state = 'superseded' where purpose_key = 'ux-research' and tenant_id = ${T()}::uuid and domain_id = ${D()}::uuid`.execute(h.su);
    await plantPurpose('ux-research', 'product_improvement', { version: 2 });
    expect((arr((await self(u))['purposes']).find((x) => x['purpose_key'] === 'ux-research') as Row)['consented']).toBe(false);
    expect((await grant(u, 'ux-research')).consent).toMatchObject({ purpose_version: 2, current: true, unchanged: false });
  });
});

describe('UX2 · telemetry definitions, the privacy review, hold and release', () => {
  it('positive: journeys (the objective first) and a definition per step — the analyst defines, a named privacy officer approves at the digest; the retention from the purpose', async () => {
    const j = (await journey(analyst, { key: 'review-drilldown', title: 'The operating review: open, drill down, done (SYNTHETIC)', purposeKey: PURPOSE,
      objective: 'a reviewer reaches the records behind a metric without help or error (SYNTHETIC quality objective)', steps: ['open', 'drill_down', 'done'], floor: 5 })).journey;
    expect(j).toMatchObject({ journey_key: 'review-drilldown', version: 1, state: 'active', steps: ['open', 'drill_down', 'done'] });
    const d = (await define(analyst, { eventKey: 'review-drilldown.open', title: 'review opened (SYNTHETIC)', journeyKey: 'review-drilldown', stepKey: 'open',
      fields: { view: { type: 'enum', values: ['list', 'detail'] }, keyboard: { type: 'bool' } } })).definition;
    expect(d).toMatchObject({ state: 'proposed', version: 1, retention_days: null, collection: 'open' });
    const a = (await review(privacy, String(d['definition_id']), { decision: 'approve', reason: 'enumerations and a flag only; nothing names a person or carries content', digest: d['digest'] })).definition;
    expect(a).toMatchObject({ state: 'approved', retention_days: 180, decided_by: privacy.principalId });
    J1['open'] = a;
    for (const s of ['drill_down', 'done']) {
      const x = (await define(analyst, { eventKey: `review-drilldown.${s}`, title: `review ${s} (SYNTHETIC)`, journeyKey: 'review-drilldown', stepKey: s, fields: {} })).definition;
      J1[s] = (await review(privacy, String(x['definition_id']), { decision: 'approve', reason: 'no field at all; the step and its duration only', digest: x['digest'] })).definition;
    }
    J2 = await journeyWithDefs('experience-page', ['open', 'act'], { tab: { type: 'enum', values: ['journeys', 'definitions', 'experiments', 'findings', 'exports'] } });
  });
  it('refusal — MINIMISATION: free text, content, an identifier, a person, an unbounded number, a type outside the four', async () => {
    const base = { eventKey: 'review-drilldown.bad', title: 'bad (SYNTHETIC)', journeyKey: 'review-drilldown', stepKey: 'open' };
    await refused(define(analyst, { ...base, fields: { comment: { type: 'enum', values: ['a'] } } }), /^telemetry definition rejected \(minimisation\): the field comment would carry content/, 422);
    await refused(define(analyst, { ...base, fields: { search_term: { type: 'enum', values: ['a'] } } }), /^telemetry definition rejected \(minimisation\)/, 422);
    await refused(define(analyst, { ...base, fields: { record_id: { type: 'enum', values: ['a'] } } }), /^telemetry definition rejected \(minimisation\): the field record_id/, 422);
    await refused(define(analyst, { ...base, fields: { user_id: { type: 'int', min: 0, max: 1 } } }), /^telemetry definition rejected \(person\)/, 403);
    await refused(define(analyst, { ...base, fields: { answer: { type: 'text' } } }), /^telemetry definition rejected \(minimisation\): the field answer has a type enum \| int \| duration_ms \| bool/, 422);
    await refused(define(analyst, { ...base, fields: { rows: { type: 'int' } } }), /^telemetry definition rejected \(fields\): the int field rows declares integer bounds/, 422);
  });
  it('refusal — the review: the proposer never reviews (one person with both roles), a stale digest (409), a non-privacy officer (PDP), an agent defining (PDP); an unknown step, a purpose of another kind', async () => {
    const d = (await define(dual, { eventKey: 'review-drilldown.sod', title: 'sod (SYNTHETIC)', journeyKey: 'review-drilldown', stepKey: 'done', fields: {} })).definition;
    await refused(review(dual, String(d['definition_id']), { decision: 'approve', reason: 'approving my own definition', digest: d['digest'] }), /^telemetry definition rejected \(separation_of_duties\)/, 403);
    await refused(review(privacy, String(d['definition_id']), { decision: 'approve', reason: 'a stale digest is refused', digest: 'f'.repeat(64) }), /^telemetry definition rejected \(stale\)/, 409);
    await refused(review(owner, String(d['definition_id']), { decision: 'approve', reason: 'not a privacy officer', digest: d['digest'] }), /./, 403);
    await refused(define(agent, { eventKey: 'review-drilldown.agent', title: 'agent (SYNTHETIC)', journeyKey: 'review-drilldown', stepKey: 'open', fields: {} }), /./, 403);
    await refused(define(analyst, { eventKey: 'review-drilldown.x', title: 'x (SYNTHETIC)', journeyKey: 'review-drilldown', stepKey: 'nowhere', fields: {} }), /^telemetry definition rejected \(step\)/, 422);
    await refused(journey(analyst, { key: 'mission-journey', title: 'mission (SYNTHETIC)', purposeKey: 'mission-outcomes', objective: 'a mission outcome is not a telemetry purpose (SYNTHETIC)', steps: ['a1', 'b1'] }),
      /^experience journey rejected \(purpose\): mission-outcomes is a mission_outcome purpose/, 422);
    // recovery: rejected, then a new version approved
    const r = (await review(privacy, String(d['definition_id']), { decision: 'reject', reason: 'not needed for the purpose', digest: d['digest'] })).definition;
    expect(r['state']).toBe('rejected');
    const v2 = (await define(analyst, { eventKey: 'review-drilldown.sod', title: 'sod v2 (SYNTHETIC)', journeyKey: 'review-drilldown', stepKey: 'done', fields: {} })).definition;
    expect(v2['version']).toBe(2);
  });
  it('hold / release: the privacy officer holds collection (the privacy review routed to the privacy officer), a second hold 409, an analyst holding (PDP); released (the items closed); a new version supersedes', async () => {
    const id = String((J2['act'] as Row)['definition_id']);
    const held = (await hold(privacy, id, 'a privacy review of what the act step collects')).definition;
    expect(held).toMatchObject({ collection: 'held', hold_reason: 'a privacy review of what the act step collects' });
    const items = await itemsOf(id);
    expect(items).toEqual([expect.objectContaining({ signal_class: 'analytics.privacy', subject_kind: 'telemetry_definition', state: 'open', route_roles: ['privacy_officer'] })]);
    await refused(hold(privacy, id, 'held twice is refused'), /^telemetry definition rejected \(state\): collection of experience-page\.act v1 is already held/, 409);
    await refused(hold(analyst, id, 'an analyst does not hold collection'), /./, 403);
    await refused(hold(agent, id, 'an agent never holds collection'), /./, 403);
    const rel = (await release(privacy, id, 'reviewed: the whitelist is minimal')).definition;
    expect(rel).toMatchObject({ collection: 'open', hold_reason: null });
    expect((await itemsOf(id)).map((x) => x['state'])).toEqual(['closed']);
    await refused(release(privacy, id, 'released twice is refused'), /^telemetry definition rejected \(state\): collection of experience-page\.act v1 is not held/, 409);
    const v2 = (await define(analyst, { eventKey: 'experience-page.act', title: 'act v2 (SYNTHETIC)', journeyKey: 'experience-page', stepKey: 'act', fields: {} })).definition;
    J2['act'] = (await review(privacy, String(v2['definition_id']), { decision: 'approve', reason: 'the tab field is no longer needed', digest: v2['digest'] })).definition;
    expect(J2['act']).toMatchObject({ version: 2, state: 'approved' });
    expect((await one(sql`select state from analytics.telemetry_definitions where definition_id = ${id}::uuid`))['state']).toBe('superseded');
  });
});

describe('UX3 · ingestion: consented, not consented, held, minimisation, retired', () => {
  const OPEN = 'review-drilldown.open';
  it('positive: every consented person\'s events are collected (202 {collected: true}) — the UTC day, the version; the not-consented person is NOT collected, answered without an error, counted with no shape', async () => {
    for (const u of users) {
      expect((await record(u, { eventKey: OPEN, outcome: 'started', fields: { view: 'list', keyboard: true }, deviceClass: 'desktop', locale: 'en' })).telemetry).toMatchObject({ collected: true, definition_version: 1 });
      await record(u, { eventKey: 'review-drilldown.drill_down', outcome: 'success', durationMs: 2400 });
      await record(u, { eventKey: 'review-drilldown.done', outcome: 'success', durationMs: 900 });
    }
    const n = (await record(nc, { eventKey: OPEN, outcome: 'started', fields: { view: 'detail' } })).telemetry;
    expect(n).toEqual({ collected: false, reason: 'not_consented', purpose_key: PURPOSE });
    const att = await one(sql`select disposition, shape from analytics.telemetry_attempts where definition_id = ${String((J1['open'] as Row)['definition_id'])}::uuid and disposition = 'not_consented'`);
    expect(att).toEqual({ disposition: 'not_consented', shape: {} });
    expect(Number((await one(sql`select count(*)::int n from analytics.telemetry_events where definition_id = ${String((J1['open'] as Row)['definition_id'])}::uuid`))['n'])).toBe(users.length);
  });
  it('refusal — held: refused (state) 409, the attempt counted with its SHAPE (the known field names, never a value); recovery: released, collected again', async () => {
    const id = String((J1['open'] as Row)['definition_id']);
    await hold(privacy, id, 'the view field is under privacy review');
    await refused(record(users[0] as AuthenticatedPrincipal, { eventKey: OPEN, outcome: 'started', fields: { view: 'detail' } }),
      /^telemetry event rejected \(state\): collection of review-drilldown\.open v1 is held by the privacy review/, 409);
    const att = await one(sql`select shape from analytics.telemetry_attempts where definition_id = ${id}::uuid and disposition = 'held'`);
    expect(att['shape']).toEqual({ fields: ['view'], unknown_fields: 0, outcome_given: true, duration_given: false });
    expect(JSON.stringify(att)).not.toContain('detail');
    await release(privacy, id, 'reviewed: the view field is an enumeration');
    expect((await record(users[0] as AuthenticatedPrincipal, { eventKey: OPEN, outcome: 'started', fields: { view: 'detail' } })).telemetry['collected']).toBe(true);
  });
  it('refusal — minimisation: a field outside the whitelist (422, counted: the number of unknown fields, never their names), a value outside its enumeration, a person in the fields (403), content in a field (route)', async () => {
    const u = users[0] as AuthenticatedPrincipal;
    await refused(record(u, { eventKey: OPEN, outcome: 'started', fields: { view: 'list', secretnote: 'x' } }), /^telemetry event rejected \(minimisation\): review-drilldown\.open v1 collects only its approved whitelist: 1 field\(s\) outside/, 422);
    const att = await one(sql`select shape from analytics.telemetry_attempts where definition_id = ${String((J1['open'] as Row)['definition_id'])}::uuid and disposition = 'minimisation' limit 1`);
    expect(att['shape']).toMatchObject({ fields: ['view'], unknown_fields: 1 });
    expect(JSON.stringify(att)).not.toContain('secretnote');
    await refused(record(u, { eventKey: OPEN, outcome: 'started', fields: { view: 'everything' } }), /^telemetry event rejected \(minimisation\): .*the field view is outside its allowed values/, 422);
    await refused(record(u, { eventKey: OPEN, outcome: 'started', fields: { user_id: 'x' } }), /^telemetry event rejected \(person\)/, 403);
    await refused(record(u, { eventKey: OPEN, outcome: 'started', fields: { view: { text: 'a long free text that carries content' } } }), /^telemetry event rejected \(minimisation\): the field view is not a scalar/, 422);
    await refused(record(u, { eventKey: OPEN, outcome: 'started', locale: 'en-GB' }), /^telemetry event rejected \(minimisation\): .*two-letter code/, 422);
  });
  it('refusal — unknown (404), retired (409, counted), an agent (PDP); retirement keeps the history readable', async () => {
    const u = users[0] as AuthenticatedPrincipal;
    await refused(record(u, { eventKey: 'nothing-defined.here', outcome: 'started' }), /^telemetry event rejected \(unknown_definition\)/, 404);
    await refused(record(agent, { eventKey: OPEN, outcome: 'started' }), /./, 403);
    const x = await journeyWithDefs('retire-journey', ['first', 'second']);
    await record(u, { eventKey: 'retire-journey.first', outcome: 'started' });   // u consented to the journey's purpose in UX1
    const r = (await retire(owner, String((x['first'] as Row)['definition_id']), 'the journey is no longer measured')).definition;
    expect(r).toMatchObject({ state: 'retired', retire_reason: 'the journey is no longer measured' });
    await refused(record(u, { eventKey: 'retire-journey.first', outcome: 'started' }), /^telemetry event rejected \(state\): retire-journey\.first v1 was retired/, 409);
    await refused(retire(owner, String((x['first'] as Row)['definition_id']), 'retired twice is refused'), /^telemetry definition rejected \(state\)/, 409);
    const counts = ((await workspace(owner))['collection'] as Row)[String((x['first'] as Row)['definition_id'])] as Row;
    expect(counts).toMatchObject({ stored: 1, not_collected: { retired: 1 } });
  });
});

describe('UX4 · pseudonymity: no principal id, the daily pseudonym, nothing readable by a runtime role, k at read', () => {
  it('the stored event carries no principal id, no correlation id and no instant finer than the day — its columns and its values', async () => {
    const cols = (await rows(sql`select column_name, data_type from information_schema.columns where table_schema = 'analytics' and table_name = 'telemetry_events'`)).map((x) => String(x['column_name']));
    for (const forbidden of ['principal_id', 'actor', 'correlation_id', 'recorded_at', 'created_at', 'occurred_at', 'session_id']) expect(cols).not.toContain(forbidden);
    expect((await one(sql`select data_type from information_schema.columns where table_schema = 'analytics' and table_name = 'telemetry_events' and column_name = 'event_day'`))['data_type']).toBe('date');
    const all = JSON.stringify(await rows(sql`select * from analytics.telemetry_events where tenant_id = ${T()}::uuid`));
    for (const u of [...users, nc]) expect(all).not.toContain(u.principalId);
  });
  it('the pseudonym is the person\'s for this purpose on this UTC day — another day or another purpose gives another one; nothing in the audit chain names the event', async () => {
    const u = users[2] as AuthenticatedPrincipal;
    const today = String((await one(sql`select analytics.aux_today()::text as d`))['d']);
    const mine = String((await one(sql`select analytics.aux_pseudonym(${T()}::uuid, ${u.principalId}::uuid, ${PURPOSE}, ${today}::date) as p`))['p']);
    const tomorrow = String((await one(sql`select analytics.aux_pseudonym(${T()}::uuid, ${u.principalId}::uuid, ${PURPOSE}, (${today}::date + 1)) as p`))['p']);
    const other = String((await one(sql`select analytics.aux_pseudonym(${T()}::uuid, ${u.principalId}::uuid, 'ux-research', ${today}::date) as p`))['p']);
    expect(mine).toMatch(/^[0-9a-f]{64}$/); expect(tomorrow).not.toBe(mine); expect(other).not.toBe(mine);
    const stored = await rows(sql`select pseudonym, roles, event_day::text as d from analytics.telemetry_events where pseudonym = ${mine}`);
    expect(stored.length).toBe(3);
    expect(stored[0]).toMatchObject({ roles: ['domain_analyst'], d: today });
    const audit = JSON.stringify(await rows(sql`select event from audit.audit_events where action = 'analytics.telemetry.record' and tenant_id = ${T()}::uuid`));
    expect(audit).not.toContain(mine);
    for (const e of await rows(sql`select event_id::text from analytics.telemetry_events where pseudonym = ${mine}`)) expect(audit).not.toContain(String(e['event_id']));
  });
  it('no runtime role reads the events or the salt (permission denied for eye_app and eye_commit); a consent row of another person is invisible under RLS', async () => {
    for (const role of ['eye_app', 'eye_commit']) {
      await expect(h.su.transaction().execute(async (tx) => { await sql.raw(`set local role ${role}`).execute(tx); await sql`select count(*) from analytics.telemetry_events`.execute(tx); })).rejects.toThrow(/permission denied/);
      await expect(h.su.transaction().execute(async (tx) => { await sql.raw(`set local role ${role}`).execute(tx); await sql`select salt from analytics.telemetry_salt`.execute(tx); })).rejects.toThrow(/permission denied/);
    }
  });
  it('k at read: a segment of one role resting on fewer than 5 distinct pseudonyms is SUPPRESSED (indeterminate, its n withheld in the workspace) — never singled out', async () => {
    await segment(analyst, { key: 'role-board', dimension: 'role', value: 'board_member', k: 5 });
    const today = String((await one(sql`select analytics.aux_today()::text as d`))['d']);
    const b = (await baseline(analyst, { journeyKey: 'review-drilldown', measure: 'task_success_rate', segmentKey: 'role-board', period: `R7@${today}` })).baseline;
    expect(b).toMatchObject({ state: 'indeterminate', value: null, k_observed: 1, k_min: 5 });
    expect(JSON.stringify(b['reasons'])).toMatch(/at most 1 distinct pseudonyms on any day, below k = 5: it is suppressed/);
    const seg = arr((arr((await workspace(owner))['journeys']).find((x) => (x['journey'] as Row)['journey_key'] === 'review-drilldown') as Row)['segments']).find((x) => x['segment_key'] === 'role-board') as Row;
    expect(seg).toMatchObject({ n: null, value: null, k_observed: null });
    expect(String(seg['suppressed'])).toMatch(/below k = 5/);
    await refused(segment(analyst, { key: 'person-seg', dimension: 'principal', value: 'x' }), /^experience segment rejected \(person\)/, 403);
    await refused(segment(analyst, { key: 'tiny-k', dimension: 'locale', value: 'en', k: 2 }), /^experience segment rejected \(k\)/, 422);
  });
});

describe('UX5 · baselines, thresholds and the routed review', () => {
  let b1: Row = {};
  it('positive: a baseline over 2026-09 from the events — task success 15/20 = 0.75 with Wilson\'s interval, n, k, the definitions it rests on, the source revision; a step latency p50 with the median\'s interval', async () => {
    // SYNTHETIC: 20 journey instances over 4 days of 2026-09 (5 distinct pseudonyms a day); 15 finish; the last 4 error on the drill-down
    // (none of them finishes), 3 of them recover
    const evs: Ev[] = [];
    for (let i = 0; i < 20; i++) {
      const ps = pseud(); const day = `2026-09-0${1 + Math.floor(i / 5)}`; const roles = i % 2 === 0 ? ['domain_analyst', 'executive'] : ['domain_analyst'];
      evs.push({ def: J1['open'] as Row, pseudonym: ps, outcome: 'started', day, roles });
      evs.push({ def: J1['drill_down'] as Row, pseudonym: ps, outcome: i >= 16 ? 'error' : 'success', duration: 1000 * (i + 1), day, roles });
      if (i >= 16 && i < 19) evs.push({ def: J1['drill_down'] as Row, pseudonym: ps, outcome: 'recovered', day, roles });
      if (i < 15) evs.push({ def: J1['done'] as Row, pseudonym: ps, outcome: 'success', duration: 500, day, roles });
    }
    await plant(evs);
    b1 = (await baseline(analyst, { journeyKey: 'review-drilldown', measure: 'task_success_rate', period: '2026-09' })).baseline;
    expect(b1).toMatchObject({ state: 'determinate', n: 20, k_observed: 5, floor_n: 5, period_key: '2026-09', reasons: [], crossings: [] });
    expect(Number(b1['value'])).toBeCloseTo(0.75, 6);
    expect(b1['uncertainty']).toMatchObject({ method: 'wilson', level: 0.95 });
    expect(String(b1['source_revision'])).toMatch(/^[0-9a-f]{64}$/);
    expect(arr(b1['definitions_used']).map((x) => x['event_key']).sort()).toEqual(['review-drilldown.done', 'review-drilldown.drill_down', 'review-drilldown.open']);
    const lat = (await baseline(analyst, { journeyKey: 'review-drilldown', measure: 'step_p50_ms', stepKey: 'drill_down', period: '2026-09' })).baseline;
    expect(lat).toMatchObject({ state: 'determinate', n: 16 });
    expect(Number(lat['value'])).toBe(8500);
    expect(lat['uncertainty']).toMatchObject({ method: 'order_statistics' });
  });
  it('indeterminate, explained — below the floor (4 errors < 5), a role segment below k, a partial period, no event at all (not a measured zero)', async () => {
    const er = (await baseline(analyst, { journeyKey: 'review-drilldown', measure: 'error_recovery_rate', period: '2026-09' })).baseline;
    expect(er).toMatchObject({ state: 'indeterminate', value: null, n: 4, numerator: 3 });
    expect(JSON.stringify(er['reasons'])).toMatch(/n = 4 is below the journey's floor 5/);
    await segment(analyst, { key: 'role-exec', dimension: 'role', value: 'executive' });
    const ex = (await baseline(analyst, { journeyKey: 'review-drilldown', measure: 'task_success_rate', segmentKey: 'role-exec', period: '2026-09' })).baseline;
    expect(ex).toMatchObject({ state: 'indeterminate', value: null });
    expect(JSON.stringify(ex['reasons'])).toMatch(/below k = 5/);
    const now = new Date(String((await one(sql`select clock_timestamp()::text as n`))['n']));
    const cur = `${now.getUTCFullYear()}-Q${Math.floor(now.getUTCMonth() / 3) + 1}`;
    const part = (await baseline(analyst, { journeyKey: 'review-drilldown', measure: 'task_success_rate', period: cur })).baseline;
    expect(JSON.stringify(part['reasons'])).toMatch(/a partial period is not presented as the period/);
    const none = (await baseline(analyst, { journeyKey: 'review-drilldown', measure: 'task_success_rate', period: '2026-06' })).baseline;
    expect(none).toMatchObject({ state: 'indeterminate', value: null, n: 0 });
    expect(JSON.stringify(none['reasons'])).toMatch(/nothing to measure, not a measured zero/);
    await refused(baseline(analyst, { journeyKey: 'review-drilldown', measure: 'time_on_page', period: '2026-09' }), /^experience baseline rejected \(measure\)/, 422);
    await refused(baseline(outsider, { journeyKey: 'review-drilldown', measure: 'task_success_rate', period: '2026-09' }), /./, 403);
  });
  it('thresholds: proposed by the analyst, approved by a named owner at the digest; the proposer never approves; a stale digest 409; a crossing → a FINDING routed to the owner as a REVIEW (never an automatic decision)', async () => {
    const t = (await proposeThreshold(analyst, { journeyKey: 'review-drilldown', measure: 'task_success_rate', bound: 'min', value: 0.8, rationale: 'four in five reviewers reach the records (SYNTHETIC)' })).threshold;
    expect(t['state']).toBe('proposed');
    await refused(decideThreshold(owner, String(t['threshold_id']), { decision: 'approve', reason: 'a stale digest is refused', digest: '0'.repeat(64) }), /^experience baseline rejected \(stale\)/, 409);
    await refused(decideThreshold(analyst, String(t['threshold_id']), { decision: 'approve', reason: 'the analyst approves nothing', digest: t['digest'] }), /./, 403);
    const own = (await proposeThreshold(owner2, { journeyKey: 'review-drilldown', measure: 'step_p50_ms', stepKey: 'drill_down', bound: 'max', value: 30000, rationale: 'the drill-down answers within 30 s' })).threshold;
    await refused(decideThreshold(owner2, String(own['threshold_id']), { decision: 'approve', reason: 'approving my own threshold', digest: own['digest'] }), /^experience baseline rejected \(separation_of_duties\)/, 403);
    expect((await decideThreshold(owner, String(t['threshold_id']), { decision: 'approve', reason: 'the objective the review serves', digest: t['digest'] })).threshold['state']).toBe('approved');
    const b = (await baseline(analyst, { journeyKey: 'review-drilldown', measure: 'task_success_rate', period: '2026-09' })).baseline;
    expect(arr(b['crossings'])).toHaveLength(1);
    const cross = arr(b['crossings'])[0] as Row;
    const f = await one(sql`select origin_kind, state, statement, proposed_by from analytics.experience_findings where finding_id = ${String(cross['finding_id'])}::uuid`);
    expect(f).toMatchObject({ origin_kind: 'threshold', state: 'proposed' });
    expect(String(f['statement'])).toMatch(/is 0\.75.*below the approved min of 0\.8 — a review, not a decision/);
    expect(await itemsOf(String(cross['finding_id']))).toEqual([expect.objectContaining({ signal_class: 'analytics.experience', subject_kind: 'experience_finding', state: 'open', route_roles: ['product_analytics_owner'] })]);
  });
  it('a held definition qualifies the baseline (indeterminate: collection held) — released, it is determinate again', async () => {
    const id = String((J1['done'] as Row)['definition_id']);
    await hold(privacy, id, 'a privacy question about the done step');
    const q = (await baseline(analyst, { journeyKey: 'review-drilldown', measure: 'step_p50_ms', stepKey: 'drill_down', period: '2026-09' })).baseline;
    expect(q).toMatchObject({ state: 'indeterminate', value: null });
    expect(JSON.stringify(q['reasons'])).toMatch(/collection on this journey is held by the privacy review/);
    await release(privacy, id, 'answered: the done step carries no field');
    expect((await baseline(analyst, { journeyKey: 'review-drilldown', measure: 'step_p50_ms', stepKey: 'drill_down', period: '2026-09' })).baseline['state']).toBe('determinate');
  });
});

describe('UX6 · experiments: approved alternatives, two approvals, assignment, SRM / hold / drift invalidation, the conclusion', () => {
  const VARIANTS = [{ key: 'control', kind: 'layout', description: 'the current layout of the step (the control)' },
    { key: 'compact', kind: 'layout', description: 'the records table first, the chart folded below it' }];
  const base = (journeyKey: string) => ({ journeyKey, title: `${journeyKey} layout (SYNTHETIC)`, hypothesis: 'putting the records first lets reviewers finish the step more often', measure: 'task_success_rate', variants: VARIANTS, minSample: 20 });
  async function running(journeyKey: string): Promise<Row> {
    const x = (await proposeExperiment(analyst, base(journeyKey))).experiment;
    await approveExperiment(owner, String(x['experiment_id']), { role: 'product_analytics_owner', decision: 'approve', reason: 'the alternatives are honest layouts', digest: x['digest'] });
    return (await approveExperiment(privacy, String(x['experiment_id']), { role: 'privacy_officer', decision: 'approve', reason: 'no new collection; arms by pseudonym', digest: x['digest'] })).experiment;
  }
  let JA: Record<string, Row> = {}; let JB: Record<string, Row> = {}; let JC: Record<string, Row> = {}; let JD: Record<string, Row> = {};
  it('refusal at proposal: an engagement proxy as the measure, a variant kind outside the four, manipulation in the hypothesis, no control first', async () => {
    JA = await journeyWithDefs('exp-srm', ['start', 'finish']); JB = await journeyWithDefs('exp-valid', ['start', 'finish']);
    JC = await journeyWithDefs('exp-drift', ['start', 'finish']); JD = await journeyWithDefs('exp-hold', ['start', 'finish']);
    await refused(proposeExperiment(analyst, { ...base('exp-srm'), measure: 'time_on_page' }), /^ux experiment rejected \(engagement\)/, 422);
    await refused(proposeExperiment(analyst, { ...base('exp-srm'), variants: [VARIANTS[0], { key: 'nudge', kind: 'urgency_banner', description: 'a banner nudging the reviewer to hurry' }] }), /^ux experiment rejected \(variants\): a variant is a layout \| wording \| ordering \| default_visibility/, 422);
    await refused(proposeExperiment(analyst, { ...base('exp-srm'), hypothesis: 'a countdown creates urgency and makes reviewers finish faster' }), /^ux experiment rejected \(manipulation\)/, 422);
    await refused(proposeExperiment(analyst, { ...base('exp-srm'), variants: [VARIANTS[1], VARIANTS[0]] }), /^ux experiment rejected \(variants\): the first variant is `control`/, 422);
    await refused(proposeExperiment(agent, base('exp-srm')), /./, 403);
  });
  it('two approvals, two people, neither the proposer, at the digest: one person holding both roles fills one; the proposer never approves; a stale digest 409; an agent (PEP)', async () => {
    const x = (await proposeExperiment(analyst, base('exp-srm'))).experiment;
    const id = String(x['experiment_id']);
    expect(x).toMatchObject({ state: 'proposed', primary_measure: 'task_success_rate' });
    expect((await assignment(users[0] as AuthenticatedPrincipal, id)).assignment).toMatchObject({ assigned: false, arm: { key: 'control' } });
    await refused(approveExperiment(dual, id, { role: 'privacy_officer', decision: 'approve', reason: 'a stale digest is refused', digest: '1'.repeat(64) }), /^ux experiment rejected \(stale\)/, 409);
    expect((await approveExperiment(dual, id, { role: 'product_analytics_owner', decision: 'approve', reason: 'honest layouts, an experience measure', digest: x['digest'] })).experiment['state']).toBe('proposed');
    await refused(approveExperiment(dual, id, { role: 'privacy_officer', decision: 'approve', reason: 'the same person cannot fill both approvals', digest: x['digest'] }), /^ux experiment rejected \(separation_of_duties\): the two approvals are two different people/, 403);
    await refused(approveExperiment(owner, id, { role: 'product_analytics_owner', decision: 'approve', reason: 'the owner\'s approval is given already', digest: x['digest'] }), /^ux experiment rejected \(duplicate\)/, 409);
    await refused(approveExperiment(owner, id, { role: 'privacy_officer', decision: 'approve', reason: 'the owner is not a privacy officer', digest: x['digest'] }), /^ux experiment rejected \(authority\)/, 403);
    const ownProp = (await proposeExperiment(owner2, base('exp-srm'))).experiment;
    await refused(approveExperiment(owner2, String(ownProp['experiment_id']), { role: 'product_analytics_owner', decision: 'approve', reason: 'approving my own experiment', digest: ownProp['digest'] }), /^ux experiment rejected \(separation_of_duties\): the proposer/, 403);
    await refused(approveExperiment(agentAnalyst, id, { role: 'privacy_officer', decision: 'approve', reason: 'an agent never approves', digest: x['digest'] }), /./, 403);
    const run = (await approveExperiment(privacy, id, { role: 'privacy_officer', decision: 'approve', reason: 'no new collection; deterministic arms', digest: x['digest'] })).experiment;
    expect(run).toMatchObject({ state: 'running' });
    expect(arr(run['approvals']).map((a) => a['role']).sort()).toEqual(['privacy_officer', 'product_analytics_owner']);
  });
  it('the assignment: a consented person gets a stable arm (never stored); the person without consent always gets the control; the event carries the arm the SERVER computed', async () => {
    const x = (await rows(sql`select experiment_id::text from analytics.ux_experiments where journey_key = 'exp-srm' and state = 'running'`))[0] as Row;
    const id = String(x['experiment_id']); const u = users[3] as AuthenticatedPrincipal;
    const a1 = (await assignment(u, id)).assignment; const a2 = (await assignment(u, id)).assignment;
    expect(a1).toMatchObject({ assigned: true }); expect(a2['arm']).toEqual(a1['arm']);
    expect((await assignment(nc, id)).assignment).toMatchObject({ assigned: false, arm: { key: 'control' } });
    expect(String((await assignment(nc, id)).assignment['reason'])).toMatch(/^not_consented/);
    const r = (await record(u, { eventKey: 'exp-srm.start', outcome: 'started', experimentId: id })).telemetry;
    expect(r['variant']).toBe((a1['arm'] as Row)['key']);
  });
  it('SRM: 80 units in the control, 20 in the alternative — the analysis is INVALID, the experiment invalidated and routed; adopting is refused; concluded inconclusive by a named owner', async () => {
    const id = String(((await rows(sql`select experiment_id::text from analytics.ux_experiments where journey_key = 'exp-srm' and state = 'running'`))[0] as Row)['experiment_id']);
    await plant([...units(JA, 80, 40, { experiment: id, variant: 'control' }), ...units(JA, 20, 10, { experiment: id, variant: 'compact' })]);
    const an = (await analyse(analyst, id)).analysis;
    expect(an).toMatchObject({ verdict: 'invalid', experiment_state: 'invalidated' });
    expect(JSON.stringify(an['reasons'])).toMatch(/sample-ratio mismatch: χ² = /);
    expect(an['srm']).toMatchObject({ check: 'sample_ratio', passed: false });
    expect(await itemsOf(id)).toEqual([expect.objectContaining({ signal_class: 'analytics.experience', subject_kind: 'experiment', state: 'open', route_roles: ['product_analytics_owner'] })]);
    await refused(analyse(analyst, id), /^ux experiment rejected \(state\): the experiment is invalidated/, 409);
    await refused(conclude(owner, id, { conclusion: 'adopt', arm: 'compact', analysisId: an['analysis_id'], analysisDigest: an['digest'], reason: 'adopting on an invalid analysis' }), /^ux experiment rejected \(evidence\)/, 422);
    const done = (await conclude(owner, id, { conclusion: 'inconclusive', analysisId: an['analysis_id'], analysisDigest: an['digest'], reason: 'the assignment broke; re-run after the fix' })).experiment;
    expect(done).toMatchObject({ state: 'concluded', conclusion: { conclusion: 'inconclusive' } });
    expect((await itemsOf(id)).map((x) => x['state'])).toEqual(['closed']);
  });
  it('valid: 40 / 40 units, 20 vs 36 finish — Newcombe\'s interval excludes 0 (better); a stale analysis digest 409; the proposer never concludes; adopted by a named owner (advisory, nothing automatic)', async () => {
    const x = await running('exp-valid'); const id = String(x['experiment_id']);
    await plant([...units(JB, 40, 20, { experiment: id, variant: 'control' }), ...units(JB, 40, 36, { experiment: id, variant: 'compact' })]);
    const an = (await analyse(analyst, id)).analysis;
    expect(an).toMatchObject({ verdict: 'valid', experiment_state: 'running', reasons: [] });
    const cmp = arr(an['comparisons'])[0] as Row;
    expect(cmp).toMatchObject({ arm: 'compact', against: 'control', claim: 'better', interval: { method: 'newcombe', level: 0.95 } });
    expect(Number(cmp['difference'])).toBeCloseTo(0.4, 6);
    expect(Number((cmp['interval'] as Row)['lo'])).toBeGreaterThan(0);
    await refused(conclude(owner, id, { conclusion: 'adopt', arm: 'compact', analysisId: an['analysis_id'], analysisDigest: '2'.repeat(64), reason: 'a stale analysis digest is refused' }), /^ux experiment rejected \(stale\)/, 409);
    await refused(conclude(analyst, id, { conclusion: 'adopt', arm: 'compact', analysisId: an['analysis_id'], analysisDigest: an['digest'], reason: 'the analyst concludes nothing' }), /./, 403);
    await refused(conclude(owner, id, { conclusion: 'adopt', arm: 'control', analysisId: an['analysis_id'], analysisDigest: an['digest'], reason: 'the control is not a compared arm' }), /^ux experiment rejected \(arm\)/, 422);
    const done = (await conclude(owner, id, { conclusion: 'adopt', arm: 'compact', analysisId: an['analysis_id'], analysisDigest: an['digest'], reason: 'the records-first layout helps reviewers finish' })).experiment;
    expect(done).toMatchObject({ state: 'concluded', conclusion: { conclusion: 'adopt', arm: 'compact' } });
    expect(String((done['conclusion'] as Row)['advisory'])).toMatch(/never automatic/);
  });
  it('insufficient: below the minimum sample per arm — no claim, adopting refused', async () => {
    const x = await running('exp-valid'); const id = String(x['experiment_id']);
    await plant([...units(JB, 6, 3, { experiment: id, variant: 'control' }), ...units(JB, 6, 5, { experiment: id, variant: 'compact' })]);
    const an = (await analyse(analyst, id)).analysis;
    expect(an).toMatchObject({ verdict: 'insufficient', comparisons: [] });
    expect(JSON.stringify(an['reasons'])).toMatch(/n = 6 is below the minimum sample 20/);
    await refused(conclude(owner, id, { conclusion: 'adopt', arm: 'compact', analysisId: an['analysis_id'], analysisDigest: an['digest'], reason: 'too few to adopt anything' }), /^ux experiment rejected \(evidence\)/, 422);
  });
  it('drift and a privacy hold INVALIDATE: a definition re-approved under a running experiment (drift, at analysis); a hold on its journey (at once, routed)', async () => {
    const xc = await running('exp-drift'); const idc = String(xc['experiment_id']);
    const v2 = (await define(analyst, { eventKey: 'exp-drift.finish', title: 'finish v2 (SYNTHETIC)', journeyKey: 'exp-drift', stepKey: 'finish', fields: { mode: { type: 'enum', values: ['a', 'b'] } } })).definition;
    await review(privacy, String(v2['definition_id']), { decision: 'approve', reason: 'a mode enumeration added', digest: v2['digest'] });
    const an = (await analyse(analyst, idc)).analysis;
    expect(an).toMatchObject({ verdict: 'invalid', experiment_state: 'invalidated' });
    expect(JSON.stringify(an['reasons'])).toMatch(/the event semantics drifted during the experiment/);
    const xd = await running('exp-hold'); const idd = String(xd['experiment_id']);
    const held = (await hold(privacy, String((JD['start'] as Row)['definition_id']), 'a privacy question about the start step')).definition;
    expect(arr((held['effect'] as Row)['experiments_invalidated'])).toEqual([idd]);
    expect((await one(sql`select state, invalidation ->> 'cause' as cause from analytics.ux_experiments where experiment_id = ${idd}::uuid`))).toEqual({ state: 'invalidated', cause: 'privacy_hold' });
    expect((await itemsOf(idd)).map((x) => x['signal_class'])).toEqual(['analytics.experience']);
    expect((await assignment(users[0] as AuthenticatedPrincipal, idd)).assignment).toMatchObject({ assigned: false, arm: { key: 'control' } });
    await release(privacy, String((JD['start'] as Row)['definition_id']), 'answered; the experiment stays invalidated');
  });
});

describe('UX7 · findings → human-decided actions', () => {
  let fAgent: Row = {}; let fOwner2: Row = {};
  it('the agent PROPOSES a finding (AI may propose) — routed to the owner for review; an unknown origin 404', async () => {
    const b = (await rows(sql`select baseline_id::text from analytics.experience_baselines where journey_key = 'review-drilldown' and measure = 'task_success_rate' and state = 'determinate' order by recorded_at desc limit 1`))[0] as Row;
    fAgent = (await proposeFinding(agent, { originKind: 'baseline', originId: b['baseline_id'], journeyKey: 'review-drilldown', statement: 'reviewers abandon the drill-down on the done step a quarter of the time (agent)', evidence: { baseline_id: b['baseline_id'] } })).finding;
    expect(fAgent).toMatchObject({ state: 'proposed', proposed_by_kind: 'agent', origin_kind: 'baseline' });
    expect((await itemsOf(String(fAgent['finding_id'])))[0]).toMatchObject({ signal_class: 'analytics.experience', route_roles: ['product_analytics_owner'] });
    await refused(proposeFinding(analyst, { originKind: 'baseline', originId: uuidv7(), statement: 'a finding from nowhere is refused' }), /^experience finding rejected \(unknown_origin\)/, 404);
    await refused(proposeFinding(outsider, { originKind: 'baseline', originId: b['baseline_id'], statement: 'an outsider proposes nothing here' }), /./, 403);
  });
  it('refusal: the agent deciding (PEP: no rule), an agent holding the owner\'s role claiming a human (the PORT), the finding\'s proposer deciding, an analyst (PDP)', async () => {
    const id = String(fAgent['finding_id']);
    const pv = (await preview(owner, id, { kind: 'backlog_item' })).preview;
    const body = { decision: 'act', kind: 'backlog_item', reason: 'record it for the next release', findingDigest: fAgent['digest'], previewDigest: pv['preview_digest'] };
    await refused(decide(agent, id, body), /./, 403);
    await refused(decide(machineOwner, id, body), /^experience action rejected \(actor\): deciding the action a finding leads to is a named human's act/, 403);
    await refused(decide(analyst, id, body), /./, 403);
    fOwner2 = (await proposeFinding(owner2, { originKind: 'baseline', originId: (fAgent['evidence'] as Row)['baseline_id'], journeyKey: 'review-drilldown', statement: 'the drill-down latency doubles for keyboard users' })).finding;
    const pv2 = (await preview(owner2, String(fOwner2['finding_id']), { kind: 'research_request' })).preview;
    await refused(decide(owner2, String(fOwner2['finding_id']), { decision: 'act', kind: 'research_request', reason: 'deciding my own finding', findingDigest: fOwner2['digest'], previewDigest: pv2['preview_digest'] }),
      /^experience action rejected \(separation_of_duties\)/, 403);
  });
  it('the consequence PREVIEW is what is decided: a stale preview 409 (re-read), then hold_collection by the owner — collection held, the privacy review routed, the finding actioned, its items closed', async () => {
    const id = String(fAgent['finding_id']); const target = String((J1['done'] as Row)['definition_id']);
    const wrong = (await preview(owner, id, { kind: 'backlog_item' })).preview;
    await refused(decide(owner, id, { decision: 'act', kind: 'hold_collection', targetId: target, reason: 'stop collecting the done step', findingDigest: fAgent['digest'], previewDigest: wrong['preview_digest'] }),
      /^experience action rejected \(stale\): the consequence preview is now/, 409);
    const pv = (await preview(owner, id, { kind: 'hold_collection', targetId: target })).preview;
    expect(pv).toMatchObject({ kind: 'hold_collection', automatic: false, admissible: true, target: { kind: 'telemetry_definition', event_key: 'review-drilldown.done' } });
    expect(JSON.stringify(pv['effects'])).toMatch(/STOPS \(held\)/);
    const a = (await decide(owner, id, { decision: 'act', kind: 'hold_collection', targetId: target, reason: 'stop collecting the done step until reviewed', findingDigest: fAgent['digest'], previewDigest: pv['preview_digest'] })).action;
    expect(a).toMatchObject({ decision: 'act', kind: 'hold_collection', target_kind: 'telemetry_definition', decided_by: owner.principalId });
    expect((await one(sql`select collection from analytics.telemetry_definitions where definition_id = ${target}::uuid`))['collection']).toBe('held');
    expect((await itemsOf(target)).map((x) => x['signal_class'])).toContain('analytics.privacy');
    expect((await itemsOf(id)).every((x) => x['state'] === 'closed')).toBe(true);
    await refused(decide(owner, id, { decision: 'dismiss', reason: 'decided twice is refused', findingDigest: fAgent['digest'], previewDigest: pv['preview_digest'] }), /^experience action rejected \(state\)/, 409);
    // only the privacy officer releases the hold the owner's action placed
    await refused(release(owner, target, 'the owner does not release'), /./, 403);
    await release(privacy, target, 'reviewed after the owner\'s hold');
  });
  it('retire_measure (a threshold — retired, its history kept), a backlog item (recorded; nothing automatic), a dismissal; an unknown finding 404', async () => {
    const th = (await rows(sql`select threshold_id::text from analytics.experience_thresholds where journey_key = 'review-drilldown' and state = 'approved'`))[0] as Row;
    const cross = (await rows(sql`select finding_id::text, digest from analytics.experience_findings where origin_kind = 'threshold' and state = 'proposed' order by proposed_at limit 1`))[0] as Row;
    const pv = (await preview(owner, String(cross['finding_id']), { kind: 'retire_measure', targetId: th['threshold_id'] })).preview;
    expect(JSON.stringify(pv['effects'])).toMatch(/is RETIRED: no crossing of it opens a review any more; its history stays readable/);
    await decide(owner, String(cross['finding_id']), { decision: 'act', kind: 'retire_measure', targetId: th['threshold_id'], reason: 'the 0.8 floor no longer serves the objective', findingDigest: cross['digest'], previewDigest: pv['preview_digest'] });
    expect((await one(sql`select state from analytics.experience_thresholds where threshold_id = ${String(th['threshold_id'])}::uuid`))['state']).toBe('retired');
    const pb = (await preview(owner, String(fOwner2['finding_id']), { kind: 'backlog_item' })).preview;
    const ab = (await decide(owner, String(fOwner2['finding_id']), { decision: 'act', kind: 'backlog_item', reason: 'a keyboard-first drill-down in the backlog', findingDigest: fOwner2['digest'], previewDigest: pb['preview_digest'] })).action;
    expect(ab['effect']).toMatchObject({ recorded: 'backlog_item', automatic: false });
    const f3 = (await proposeFinding(analyst2, { originKind: 'experiment', originId: (await rows(sql`select experiment_id::text from analytics.ux_experiments where journey_key = 'exp-valid' limit 1`))[0]?.['experiment_id'], journeyKey: 'exp-valid', statement: 'the compact layout may only help on desktop' })).finding;
    const pd = (await preview(owner, String(f3['finding_id']), {})).preview;
    expect(pd).toMatchObject({ kind: null, admissible: true });
    expect((await decide(owner, String(f3['finding_id']), { decision: 'dismiss', reason: 'the analysis showed no device effect', findingDigest: f3['digest'], previewDigest: pd['preview_digest'] })).action).toMatchObject({ decision: 'dismiss', kind: null });
    await refused(preview(owner, uuidv7(), {}), /^experience action rejected \(unknown_finding\)/, 404);
  });
});

describe('UX8 · the governed purge and the export', () => {
  it('purge: raw events older than their retention are deleted by the privacy officer — counted per definition (zeros recorded), never silent; nobody else purges; nothing else deletes', async () => {
    const def = J1['open'] as Row;
    await plant([0, 1, 2].map(() => ({ def, pseudonym: pseud(), outcome: 'started', day: String(new Date(Date.now() - 200 * 86_400_000).toISOString().slice(0, 10)) })));
    const before = Number((await one(sql`select count(*)::int n from analytics.telemetry_events where definition_id = ${String(def['definition_id'])}::uuid`))['n']);
    await refused(purge(owner, 'the owner does not purge'), /./, 403);
    const p = (await purge(privacy, 'the quarterly retention purge (SYNTHETIC)')).purge;
    expect(Number(p['total_deleted'])).toBe(3);
    const row = arr(p['counts']).find((x) => x['definition_id'] === def['definition_id']) as Row;
    expect(row).toMatchObject({ deleted: 3, remaining: before - 3, retention_days: 180 });
    expect(arr(p['counts']).some((x) => Number(x['deleted']) === 0)).toBe(true);
    await expect(sql`delete from analytics.telemetry_events where definition_id = ${String(def['definition_id'])}::uuid`.execute(h.su)).rejects.toThrow(/only the governed purge/);
    expect(arr((await workspace(privacy))['purges'])[0]).toMatchObject({ total_deleted: 3 });
  });
  it('export: an AGGREGATE package with its digest — no raw event, no pseudonym, no principal; a segment below k suppressed; the download re-verifies; the analyst (PDP) and another domain (404) refused', async () => {
    const x = (await exportCreate(owner, 'Experience quality, 2026-09 (SYNTHETIC)')).export;
    expect(x).toMatchObject({ schema_ref: 'AUX-EXPORT@v1' });
    const dl = (await exportRead(analyst, String(x['export_id']))).export;
    expect(dl).toMatchObject({ verified: true, digest: x['digest'] });
    expect(sha(String(dl['canonical']))).toBe(x['digest']);
    const text = String(dl['canonical']); const pkg = JSON.parse(text) as Row;
    for (const p of (await rows(sql`select distinct pseudonym from analytics.telemetry_events where tenant_id = ${T()}::uuid`))) expect(text).not.toContain(String(p['pseudonym']));
    for (const u of [...users, nc]) expect(text).not.toContain(u.principalId);
    expect(text).not.toContain('"pseudonym"');
    const sup = arr(pkg['baselines']).find((b) => b['segment_key'] === 'role-board') as Row;
    expect(sup).toMatchObject({ n: null, value: null });
    expect(String(sup['suppressed'])).toMatch(/below k/);
    expect(arr(pkg['telemetry_definitions']).length).toBeGreaterThan(0);
    expect(arr(pkg['experiments']).some((e) => arr(e['analyses']).length > 0)).toBe(true);
    await refused(exportCreate(analyst, 'an analyst does not export'), /./, 403);
    await refused(exportRead(foreign, String(x['export_id']), otherDomain), /^analytics export rejected \(unknown_export\)/, 404);
  });
  it('the workspace: per journey the four-part anatomy (objective → metrics with lineage → segments with uncertainty → findings and actions, experiments), the definitions, the collection tallies, the items', async () => {
    const ws = await workspace(owner);
    const j = arr(ws['journeys']).find((x) => (x['journey'] as Row)['journey_key'] === 'review-drilldown') as Row;
    expect(j['objective']).toMatchObject({ purpose_key: PURPOSE });
    expect(arr(j['metrics']).some((m) => m['state'] === 'determinate' && arr(m['definitions_used']).length > 0)).toBe(true);
    expect(arr(j['findings']).some((f) => f['action'] !== null)).toBe(true);
    expect(arr(ws['definitions']).length).toBeGreaterThan(5);
    expect(arr(ws['items']).length).toBeGreaterThan(0);
    expect(arr(ws['ledger']).length).toBeGreaterThan(0);
    await refused(workspace(outsider), /./, 403);
  });
});

// ═════════════════════════════════════════════════════════════════════════════════════════════
describe('UXE · the product_analytics licence on a CONTRACTED tenant (runs LAST: it contracts the harness tenant)', () => {
  const PK = { core: `b92ux-core-${RUN}`, pa: `b92ux-pa-${RUN}` };
  const SKU = { core: `EYE-B92UX-CORE-${RUN}`.toUpperCase(), pa: `EYE-B92UX-PA-${RUN}`.toUpperCase() };
  let vapi: EntitlementsVendorController; let vendor: AuthenticatedPrincipal;
  const vreq = (p: AuthenticatedPrincipal, action: string) => ({ eyeEnvelope: { ...h.env(p, action, 'LIC', null, 'commercial'), scope: 'PLATFORM', tenant_id: null, domain_id: null }, eyePrincipal: p }) as never;
  const OPEN = 'review-drilldown.open';
  it('positive: uncontracted, a consented person\'s event is collected; the catalogue claims analytics.telemetry.record under product_analytics', async () => {
    const { EntitlementsVendorController: V } = await import('../../src/commercial/entitlements/entitlements.controller.js');
    vapi = h.app.get(V);
    const id = uuidv7();
    await sql`insert into identity.principals (id, kind, scope, tenant_id, domain_id, display_name, login_name, status) values (${id}::uuid, 'human', 'PLATFORM', null, null, ${`b92ux-vendor-${RUN} (SYNTHETIC)`}, ${`b92ux-vendor-${id.slice(-8)}`}, 'active')`.execute(h.su);
    await sql`insert into identity.role_bindings (id, principal_id, role_code, scope, tenant_id, domain_id) values (${uuidv7()}::uuid, ${id}::uuid, 'commercial_authority', 'PLATFORM', null, null)`.execute(h.su);
    vendor = await h.openSession({ ...h.manager, principalId: id, homeScope: 'PLATFORM', homeTenantId: null, homeDomainId: null, bindings: [{ roleCode: 'commercial_authority', scope: 'PLATFORM', tenantId: null, domainId: null }] } as AuthenticatedPrincipal);
    expect((await record(users[4] as AuthenticatedPrincipal, { eventKey: OPEN, outcome: 'started' })).telemetry['collected']).toBe(true);
    expect(await one(sql`select (commercial.cen_action_capability('analytics.telemetry.record')).capability_key as k`)).toMatchObject({ k: 'product_analytics' });
  });
  it('refusal: contracted without product_analytics — recording answers EYE-ENT-001 / 403; a withdrawal, the person\'s own read, the workspace and a human-gated export pass the gate', async () => {
    await vapi.declarePackage(vreq(vendor, 'commercial.offer.package'), { payload: { key: PK.core, expectedVersion: 0, title: 'Core only (SYNTHETIC)', capabilities: [], tier: 'foundation', reason: 'the core package of the B92 §UX harness' } });
    await vapi.declarePackage(vreq(vendor, 'commercial.offer.package'), { payload: { key: PK.pa, expectedVersion: 0, title: 'Product analytics (SYNTHETIC)', capabilities: ['product_analytics'], tier: 'strategic_cell', reason: 'the product analytics capability for the B92 §UX harness' } });
    for (const [code, pkg] of [[SKU.core, PK.core], [SKU.pa, PK.pa]] as const) {
      await vapi.declareSku(vreq(vendor, 'commercial.offer.sku'), { payload: { code, expectedVersion: 0, title: `${pkg} 12 months`, packageKey: pkg, termMonths: 12, reason: 'a twelve-month synthetic term' } });
    }
    await vapi.issueLicence(vreq(vendor, 'commercial.licence.issue'), T(), { payload: { skuCode: SKU.core, orderRef: `SYNTH-B92UX-${RUN}-1`, reason: 'the core licence of the harness tenant' } });
    const r = await refused(record(users[4] as AuthenticatedPrincipal, { eventKey: OPEN, outcome: 'started' }), /^capability unavailable \(entitlement\): product_analytics is not licensed/, 403);
    expect(r.code).toBe('EYE-ENT-001');
    expect((await withdraw(users[4] as AuthenticatedPrincipal, PURPOSE)).consent).toMatchObject({ decision: 'withdrawn' });
    expect(arr((await self(users[4] as AuthenticatedPrincipal))['purposes']).length).toBeGreaterThan(0);
    expect(arr((await workspace(owner))['journeys']).length).toBeGreaterThan(0);
    expect((await exportCreate(owner, 'Exported under a lapsed entitlement (SYNTHETIC)')).export['digest']).toMatch(/^[0-9a-f]{64}$/);
  });
  it('recovery: the licence reissued with product_analytics — the person consents again and the same event is collected', async () => {
    await vapi.issueLicence(vreq(vendor, 'commercial.licence.issue'), T(), { payload: { skuCode: SKU.pa, orderRef: `SYNTH-B92UX-${RUN}-2`, reason: 'the tenant adds the product analytics capability' } });
    await grant(users[4] as AuthenticatedPrincipal, PURPOSE);
    expect((await record(users[4] as AuthenticatedPrincipal, { eventKey: OPEN, outcome: 'started' })).telemetry['collected']).toBe(true);
  });
});
