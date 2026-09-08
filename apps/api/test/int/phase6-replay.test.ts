/**
 * PHASE 6 · P6-M3 — Decision Replay, through the real database and controller.
 *
 * F5: for a committed package, known / believed / tested are reconstructed strictly
 * under the version's known_at and observed_through and the commit's decided_at; decided
 * holds the version and digest, the dissent, the approvals, the commitment and the
 * commit's policy and audit records; observed holds only what was recorded after
 * decided_at and at or before the bound as_of. A later correction keeps the cited
 * version as history with the later version under observed; a withdrawal is reported
 * unavailable, never substituted; a later reproduction, revocation and walk land under
 * observed; two readers under the same cut-offs and as_of get the same content digest
 * and different invocation records; an earlier as_of excludes what came after it; no
 * later-recorded version ever enters the earlier layers. Nothing here is browser evidence.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { sql } from 'kysely';
import { Phase4Harness } from './phase4-helpers.js';
import { bootDecisionWorld, decisionCalls, message, status, type DecisionWorld } from './phase6-fixtures.js';
import type { ObservationController } from '../../src/observation/observation.controller.js';


let h: Phase4Harness; let w: DecisionWorld; let c: ReturnType<typeof decisionCalls>; let observation: ObservationController;
let P: { pkg: string; v: number; digest: string; approvalId: string; commitmentId: string };
let decidedAt = '';
let t0 = '';           // an as_of right after the decision, before the world moved
let firstDigest = '';
let preRepro = '';

const T = () => h.fx.tenantId; const D = () => h.fx.domainId;
type Layers = { known: Array<Record<string, unknown>>; believed: Record<string, Array<Record<string, unknown>>>; tested: Record<string, Array<Record<string, unknown>>>; decided: Record<string, unknown>; observed: Record<string, Array<Record<string, unknown>>> };
const allRecordedAt = (l: Layers): string[] => [
  ...l.known.map((x) => String(x['recorded_at'])),
  ...Object.values(l.believed).flat().map((x) => x['recorded_at']).filter((x): x is string => typeof x === 'string'),
  ...(l.tested['runs'] ?? []).map((x) => String(x['completed_at'])),
  ...(l.tested['reproductions'] ?? []).map((x) => String(x['reproduced_at'])),
  ...(l.tested['twin_versions'] ?? []).map((x) => String(x['admitted_at'])),
];
/** The database's clock plus a margin, as ISO text — the clock every recorded_at is stamped by. */
const dbNow = async (plusSeconds: number): Promise<string> => String((await sql<{ t: string }>`select decision.iso(clock_timestamp() + make_interval(secs => ${plusSeconds})) t`.execute(h.su)).rows[0]?.t);
const reproduce = (runId: string) => w.twins.reproduce(h.req(w.operator, 'simulation.reproduce', 'SIM', runId), T(), D(), runId, { payload: {} }) as Promise<{ reproduction: { verdict: string } }>;

beforeAll(async () => {
  h = await Phase4Harness.boot();
  w = await bootDecisionWorld(h);
  c = decisionCalls(h, w);
  const { ObservationController: O } = await import('../../src/observation/observation.controller.js');
  observation = h.app.get(O);
  // The decision: a full draft plus an unsimulated option resting on the assumption; dissent; a reproduction BEFORE the decision; approval; commit.
  const d = await c.fullDraft();
  await c.option(d.pkg, d.v, { key: 'wait', title: 'Wait for the corridor to reopen', kind: 'intervention', consequences: [{ kind: 'assumption', id: w.assumptionId }], unsimulatedReason: 'no run models waiting; rests on the corridor assumption' });
  const pr = await c.propose(d.pkg, d.v);
  await c.dissent(d.pkg, d.v, { position: 'against the reroute', rationale: 'The Cape adds fourteen days we do not have before the February build.', citation: { kind: 'run', id: w.airId } }, w.approver2);
  const rp = await reproduce(w.rerouteId);
  expect(rp.reproduction.verdict).toBe('reproduced');
  preRepro = (await sql<{ id: string }>`select reproduction_id::text id from simulation.reproductions where run_id = ${w.rerouteId}::uuid order by reproduced_at desc limit 1`.execute(h.su)).rows[0]?.id ?? '';
  const a = await c.approve(d.pkg, d.v, { decision: 'approve', versionDigest: pr.proposal.versionDigest, rationale: 'The reroute keeps the line running; the premium is acceptable.' });
  const cm = await c.commit(d.pkg, d.v, pr.proposal.versionDigest);
  P = { pkg: d.pkg, v: d.v, digest: pr.proposal.versionDigest, approvalId: a.approval.approvalId, commitmentId: cm.commitment.commitmentId };
  decidedAt = String((await sql<{ d: string }>`select decision.iso(decided_at) d from decision.packages_current where package_id = ${P.pkg}::uuid`.execute(h.su)).rows[0]?.d);
  // the upper bound is a WORLD instant: the database's clock, not this process's (the two may drift)
  t0 = await dbNow(0);
}, 300_000);

afterAll(async () => { await h?.close(); });

describe('P6-M3 · F5 — the replay reconstructs five layers under exact cut-offs', () => {
  it('refuses a package that is not committed and an as_of before the decision; every reader role may replay, a collection manager may not', async () => {
    const q = await c.proposed();
    expect(await status(c.replay(q.pkg, q.v))).toBe(409);
    expect(await message(c.replay(q.pkg, q.v))).toMatch(/not committed/);
    expect(await message(c.replay(P.pkg, P.v, { asOf: '2020-01-01T00:00:00Z' }))).toMatch(/as_of .* is before decided_at/);
    expect(await status(c.replay(P.pkg, P.v, { asOf: t0 }, h.manager))).toBe(403);
    expect((await sql<{ n: string }>`select count(*)::text n from decision.replays where package_id = ${P.pkg}::uuid`.execute(h.su)).rows[0]?.n).toBe('0');
  });

  it('known / believed / tested hold only what was recorded under the cut-offs; decided holds the version, dissent, approval, commitment and the commit\'s policy and audit records', async () => {
    const r = (await c.replay(P.pkg, P.v, { asOf: t0 }, w.executive)).replay;
    firstDigest = r.contentDigest;
    const L = r.layers as Layers;
    expect(r.cutoffs).toMatchObject({ observed_through: '2024-01-17' });
    expect(String(r.cutoffs['decided_at']).slice(0, 19)).toBe(decidedAt.slice(0, 19));
    // known: the evidence the options cite directly and the evidence the runs' twin version was grounded on — each with its digest
    const knownIds = L.known.map((x) => String(x['id']));
    expect(knownIds).toContain(w.evd.id);
    expect(knownIds).toEqual(expect.arrayContaining([w.records.inv.id, w.records.ship.id, w.records.terms.id]));
    expect(L.known.every((x) => /^[0-9a-f]{64}$/.test(String(x['digest'])))).toBe(true);
    expect(L.known.find((x) => String(x['id']) === w.evd.id)?.['via']).toBe('option:reroute');
    expect(String(L.known.find((x) => String(x['id']) === w.records.inv.id)?.['via'])).toMatch(/^twin:/);
    // believed: the assumption with the verification it had at known_at; the twin's declared validation status
    expect(L.believed['assumptions']?.map((x) => String(x['id']))).toEqual([w.assumptionId]);
    expect(L.believed['assumptions']?.[0]?.['verification_at_known_at']).toBe('unverified');
    expect(L.believed['twins']?.[0]?.['validation_status']).toBe('unvalidated (synthetic grounding)');
    // tested: the two runs with their digests, the twin version they ran on, the pre-decision reproduction verdict
    expect((L.tested['runs'] ?? []).map((x) => String(x['run_id'])).sort()).toEqual([w.controlId, w.rerouteId].sort());
    expect((L.tested['runs'] ?? []).every((x) => /^[0-9a-f]{64}$/.test(String(x['outputs_digest'])))).toBe(true);
    expect((L.tested['twin_versions'] ?? []).map((x) => `${String(x['twin_id'])}@${String(x['version'])}`)).toEqual([`${w.twinId}@${w.v1}`]);
    expect(L.tested['twin_versions']?.[0]?.['verification_at_decided_at']).toBe('verified');
    expect((L.tested['reproductions'] ?? []).map((x) => String(x['reproduction_id']))).toEqual([preRepro]);
    // decided
    const dec = L.decided;
    expect((dec['version'] as Record<string, unknown>)['version_digest']).toBe(P.digest);
    expect((dec['dissent'] as unknown[]).length).toBe(1);
    expect((dec['approvals'] as Array<Record<string, unknown>>).map((a) => a['approval_id'])).toEqual([P.approvalId]);
    expect((dec['approvals'] as Array<Record<string, unknown>>)[0]?.['revoked_before_decision']).toBe(false);
    expect((dec['commitment'] as Record<string, unknown>)['commitment_id']).toBe(P.commitmentId);
    expect((dec['commitment'] as Record<string, unknown>)['op_class']).toBe('C3');
    expect(String((dec['commitment'] as Record<string, unknown>)['policy_decision_id'])).toMatch(/^[0-9a-f-]{36}$/);
    expect(dec['policy']).toMatchObject({ decision: 'allow_with_obligations', consequence_class: 'C3', action: 'decision.commit', obligations: [{ type: 'human_gate' }] });
    expect(Number((dec['audit'] as Record<string, unknown>)['audit_seq'])).toBeGreaterThan(0);
    expect(String((dec['audit'] as Record<string, unknown>)['row_hash'])).toMatch(/^[0-9a-f]{64}$/);
    // observed: nothing yet; nothing excluded or unavailable
    expect(Object.values(L.observed).every((arr) => arr.length === 0)).toBe(true);
    expect(r.excluded).toEqual([]);
    expect(r.unavailable).toEqual([]);
    // hindsight: nothing in the earlier layers was recorded after the decision
    for (const t of allRecordedAt(L)) expect(new Date(t).getTime(), t).toBeLessThanOrEqual(new Date(decidedAt).getTime());
    // the RPL record
    const obj = (await sql<Record<string, unknown>>`select object_type, schema_ref, method_ref, source_object_ids, quality_state from objects.canonical_objects where object_id = ${r.replayId}::uuid`.execute(h.su)).rows[0] as Record<string, unknown>;
    expect(obj['object_type']).toBe('RPL');
    expect(obj['schema_ref']).toBe('RPL@v1');
    expect(obj['source_object_ids']).toEqual([`DPK:${P.pkg}@${P.v}`, `CMT:${P.commitmentId}@1`]);
    expect((obj['quality_state'] as Record<string, unknown>)['content_digest']).toBe(firstDigest);
    const row = (await sql<Record<string, unknown>>`select * from decision.replays where replay_id = ${r.replayId}::uuid`.execute(h.su)).rows[0] as Record<string, unknown>;
    expect(row['content_digest']).toBe(firstDigest);
    expect(String(row['reader_principal_id'])).toBe(w.executive.principalId);
  });

  it('the same cut-offs and as_of by two other readers: the same content digest, different invocation records', async () => {
    const a = (await c.replay(P.pkg, P.v, { asOf: t0 }, w.owner)).replay;
    const b = (await c.replay(P.pkg, P.v, { asOf: t0 }, w.approver)).replay;
    expect(a.contentDigest).toBe(firstDigest);
    expect(b.contentDigest).toBe(firstDigest);
    expect(a.invocation['reader']).toBe(`principal:${w.owner.principalId}`);
    expect(b.invocation['reader']).toBe(`principal:${w.approver.principalId}`);
    expect(a.replayId).not.toBe(b.replayId);
    expect((await sql<{ n: string }>`select count(distinct content_digest)::text n from decision.replays where package_id = ${P.pkg}::uuid`.execute(h.su)).rows[0]?.n).toBe('1');
    expect((await sql<{ n: string }>`select count(distinct reader_principal_id)::text n from decision.replays where package_id = ${P.pkg}::uuid`.execute(h.su)).rows[0]?.n).toBe('3');
  });

  it('the world moves after the decision: a correction stays history, a withdrawal becomes unavailable, a later reproduction, revocation and walk land under observed', async () => {
    // a publisher correction of the inventory document the twin cited (its cited version is retained)
    const cor = await observation.submitCorrection(h.req(h.manager, 'observation.correction.receive', 'COR', null, 'observation'), T(), D(),
      { payload: { sourceId: w.uploadSourceId, kind: 'correction', channel: 'operator re-upload', publisherRef: 'inventory restated', reason: 'the inventory count was restated after a stock take', affectedEvdIds: [w.records.inv.id] } }) as { correction: { caseId: string } };
    await observation.applyCorrection(h.req(h.manager, 'observation.correction.apply', 'COR', cor.correction.caseId, 'observation'), T(), D(), cor.correction.caseId,
      { payload: { decision: 'apply', affectedEvdIds: [w.records.inv.id], reason: 'restatement verified' } });
    // a withdrawal of the terms document
    const wd = await observation.submitCorrection(h.req(h.manager, 'observation.correction.receive', 'COR', null, 'observation'), T(), D(),
      { payload: { sourceId: w.uploadSourceId, kind: 'withdrawal', channel: 'operator', publisherRef: 'terms document withdrawn', reason: 'the terms document was withdrawn by its author', affectedEvdIds: [w.records.terms.id] } }) as { correction: { caseId: string } };
    await observation.applyCorrection(h.req(h.manager, 'observation.correction.apply', 'COR', wd.correction.caseId, 'observation'), T(), D(), wd.correction.caseId,
      { payload: { decision: 'apply', affectedEvdIds: [w.records.terms.id], reason: 'withdrawal verified' } });
    // a reproduction after the decision, a revocation after the decision, and the operator-initiated walk from the correction
    const rp2 = await reproduce(w.rerouteId);
    expect(rp2.reproduction.verdict).toBe('unreproducible');
    await c.revoke(P.pkg, P.approvalId, 'I would not approve this today');
    await w.graph.propagate(h.req(w.twinOwner, 'graph.impact.propagate', 'INV', w.records.inv.id, 'graph'), T(), D(),
      { payload: { triggerKind: 'evidence_correction', triggerObjectId: w.records.inv.id, correctionCaseId: cor.correction.caseId } });
    const t1 = await dbNow(0);
    const r = (await c.replay(P.pkg, P.v, { asOf: t1 }, w.executive)).replay;
    const L = r.layers as Layers;
    // known: the corrected inventory document stays at its cited version as history; so does the withdrawn terms document — as the version that was cited —
    // while its availability is reported apart from the content, with the reason and the version that withdrew it
    const inv = L.known.find((x) => String(x['id']) === w.records.inv.id);
    expect(inv).toBeDefined();
    expect(Number(inv?.['version'])).toBe(w.records.inv.version);
    const terms = L.known.find((x) => String(x['id']) === w.records.terms.id);
    expect(Number(terms?.['version'])).toBe(w.records.terms.version);
    expect(r.unavailable).toEqual([expect.objectContaining({ layer: 'known', id: w.records.terms.id, version: w.records.terms.version, reason: 'withdrawn', by_version: 2 })]);
    // observed: the later versions (the correction and the withdrawal), the later reproduction, the revocation, the walk's twin event
    const later = L.observed['later_versions'] ?? [];
    expect(later.map((x) => `${String(x['id'])}:${String(x['lifecycle_state'])}`).sort()).toEqual([`${w.records.inv.id}:corrected`, `${w.records.terms.id}:withdrawn`].sort());
    expect(later.every((x) => Number(x['version']) > 1)).toBe(true);
    expect((L.observed['reproductions'] ?? []).map((x) => x['verdict'])).toEqual(['unreproducible']);
    expect((L.observed['approval_revocations'] ?? []).map((x) => x['approval_id'])).toEqual([P.approvalId]);
    expect((L.observed['twin_events'] ?? []).map((x) => x['event'])).toEqual(['version.unverified']);
    expect((L.observed['package_events'] ?? []).map((x) => x['event'])).toEqual(['approval.revoked']);
    // the earlier layers did not move: the approval still counts as it stood, the pre-decision verdict is still the only one tested
    expect((L.decided['approvals'] as Array<Record<string, unknown>>).map((a) => a['approval_id'])).toEqual([P.approvalId]);
    expect((L.tested['reproductions'] ?? []).map((x) => String(x['reproduction_id']))).toEqual([preRepro]);
    expect(L.tested['twin_versions']?.[0]?.['verification_at_decided_at']).toBe('verified');
    for (const t of allRecordedAt(L)) expect(new Date(t).getTime(), t).toBeLessThanOrEqual(new Date(decidedAt).getTime());
    expect(r.contentDigest).not.toBe(firstDigest);
  }, 180_000);

  it('an earlier as_of excludes what came after it: the content digest equals the first replay\'s, the availability list is today\'s', async () => {
    const r = (await c.replay(P.pkg, P.v, { asOf: t0 }, w.authority)).replay;
    expect(r.contentDigest).toBe(firstDigest);
    const L = r.layers as Layers;
    expect(Object.values(L.observed).every((arr) => arr.length === 0)).toBe(true);
    // availability is reported at THIS instant, apart from the content: the withdrawal is known now, the cited version is still the history
    expect(r.unavailable.length).toBe(1);
    expect(L.known.find((x) => String(x['id']) === w.records.terms.id)).toBeDefined();
    const list = await c.replays(P.pkg);
    expect(list.replays.length).toBe(5);
    expect(new Set(list.replays.map((x) => String(x['content_digest']))).size).toBe(2);
    await expect(sql`delete from decision.replays where package_id = ${P.pkg}::uuid`.execute(h.su)).rejects.toThrow(/append-only|prohibited/i);
  });
});
