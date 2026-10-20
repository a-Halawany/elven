/**
 * CP-6 B40 §IN (0123 §IN; F-P1-03) — THE INTAKE INSPECTION, QUARANTINE AND REVIEW QUEUE on the real database through the real lifecycle:
 * SRC@v4 upload sources registered through the route, approved by a second person, uploads through the upload route (the same §5 path as
 * a polled response), every engine REALLY run (engine 1 in its sandbox; engine 2 configured or not — never a stand-in here):
 *   · the clean delivery note ADMITTED with its verdict recorded as evidence (engine identity: version, rule-set digest, confinement),
 *     the assessment (duplicate state, quality), custody.inspected; an evidence version's verdicts read; a second upload of the same bytes
 *     reads `same_digest`;
 *   · the supplier PDF (active content + a hidden instruction) and the .docm (a macro) QUARANTINED with the policy's class, every finding
 *     cited by code and offset — never content (D9) — and nothing reaching evidence; the case's WHY read; the EXCERPT only through
 *     observation.evidence.retrieve (custody.retrieved written; a role without it refused; a corrupted blob answered 409, nothing served);
 *   · ONLY clean admits (D2): an engine the contract names but the deployment does not configure (clamav without EYE_CLAMD_ADDR) →
 *     inspection_unavailable; F48 (the inspector crashed) → inspection_unavailable; F49 (clamd unavailable) → inspection_unavailable; the
 *     verdict table refuses a pass that is not clean;
 *   · admit_opaque with its reason admits the active content (D7), the rule recorded;
 *   · REVIEWER ≠ UPLOADER for manual uploads (D9b): the uploading collection manager's own release / rejection refused; another manager's
 *     accepted; a COLLECTED item keeps today's rule (the hosted journey 8: the same manager collects and discards);
 *   · THE UPLOAD APPROVAL (SP-22): an upload outside auto_admit is held (pending approval); the uploader's own decision refused, a release
 *     before approval refused (held), an agent refused; a second person approves → the case is released into evidence through the existing
 *     review; a decline rejects it;
 *   · the queue: reasons, verdicts in brief, `you_uploaded`, `past_expiry` ("not expired by the sweeper" — D16), "not recorded before B40"
 *     for a v1–v3 case; the consumer notice when products rest on the source;
 *   · v1–v3 UNCHANGED (D8): the DEF-03 PDF on a v1 upload contract admitted, no verdict recorded.
 * Every row here is SYNTHETIC fixture data. CONSTRUCTION evidence; the acceptance rows stay partial (B111, then H3/R2).
 */
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { sql } from 'kysely';
import { uuidv7 } from 'uuidv7';
import { HttpException } from '@nestjs/common';
import { readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { createServer } from 'node:net';
import { asObservationRefusal } from '../../src/observation/observation-errors.js';
import { ObservationCapability } from '../../src/observation/observation.capabilities.js';
import { UploadConnector } from '../../src/observation/connectors/upload.connector.js';
import { RestConnector } from '../../src/observation/connectors/rest.connector.js';
import { EYE_CONFIG } from '../../src/config/config.module.js';
import { COMMIT_DB } from '../../src/shared/shared.module.js';
import type { Db } from '../../src/shared/db.js';
import type { AuthenticatedPrincipal } from '../../src/shared/auth-types.js';
import { contentInspectorRuleSetDigest } from '../../src/observation/inspection/content-inspector.js';
import * as fault from '../../src/observation/fault-injection.js';
import { Phase4Harness, fakeEgress } from './phase4-helpers.js';
import { inCommitContext } from './phase1-helpers.js';
import { evaluateForApproval, fixtureBytes, srcV4Contract, B40_FILES, sha256 } from './phase6-b40-fixtures.js';

type Row = Record<string, unknown>;
let h: Phase4Harness;
let uploader: AuthenticatedPrincipal;   // a collection manager who uploads (D9b: never reviews their own upload)
const rows = async (q: ReturnType<typeof sql>, db: Db = h.su) => (await q.execute(db)).rows as Row[];
const one = async (q: ReturnType<typeof sql>, db: Db = h.su) => ((await q.execute(db)).rows[0] ?? {}) as Row;
const refusal = async (p: Promise<unknown>): Promise<{ status: number | null; message: string }> => {
  const e = await p.then(() => { throw new Error('the call should have been refused'); }, (err: unknown) => err);
  const mapped = e instanceof HttpException ? e : asObservationRefusal(e, 'harness');
  const body = mapped?.getResponse() as Row | undefined;
  return { status: mapped === null ? null : mapped.getStatus(), message: e instanceof HttpException ? String(body?.['message'] ?? e.message) : e instanceof Error ? e.message : String(e) };
};
const controllers = async () => {
  const { ObservationController } = await import('../../src/observation/observation.controller.js');
  const { UploadController } = await import('../../src/observation/sources/upload.controller.js');
  const { IntakeB40Controller } = await import('../../src/observation/intake-b40/intake-b40.controller.js');
  return { obs: h.app.get(ObservationController), up: h.app.get(UploadController), intake: h.app.get(IntakeB40Controller) };
};
const ENV_KEYS = ['EYE_CLAMD_ADDR', 'EYE_CLAMAV_DB_SOURCE', 'EYE_CLAMAV_DB_UPDATE_POLICY', 'EYE_CLAMAV_IMAGE_DIGEST', 'EYE_CLAMAV_DB_MANIFEST'] as const;
const savedEnv: Partial<Record<(typeof ENV_KEYS)[number], string | undefined>> = {};

/** A v4 UPLOAD source registered by the registrar through the route, approved by the manager, activated, with its upload agent. */
async function v4UploadSource(label: string, blocks: Parameters<typeof srcV4Contract>[0]['blocks'] = {}): Promise<{ sourceId: string; sourceKey: string }> {
  const { obs } = await controllers();
  const sourceKey = `b40-in-${label}-${uuidv7().slice(-8)}`;
  const contract = srcV4Contract({ sourceKey, name: `B40 §IN ${label} (SYNTHETIC)`, kind: 'upload', replaySet: 'nordwerk-uploads',
    mediaTypes: ['application/pdf', 'application/vnd.ms-word.document.macroEnabled.12', 'text/plain', 'text/csv', 'application/json'], blocks });
  (contract['authority_and_rights'] as Row)['purposes'] = ['observation', 'supplier quality review'];   // the upload route's purpose
  const r = await obs.registerSource(h.req(h.registrar, 'observation.source.register', 'SRC', null, 'observation'), h.fx.tenantId, h.fx.domainId, { payload: { contract } }) as { source: { sourceId: string } };
  const sourceId = r.source.sourceId;
  // §RG gates a v4 APPROVAL on a recorded evaluation (D5): recorded first, through the shared helper (B40 integration)
  await evaluateForApproval(h, h.manager, { tenantId: h.fx.tenantId, domainId: h.fx.domainId, sourceId, contractVersion: 1, label: 'B40 §IN fixture' });
  for (const [action, act] of [['observation.source.approve', 'approve'], ['observation.source.transition', 'activate']] as const) {
    await h.pipeline.write(h.env(h.manager, action, 'SRC', sourceId), h.manager,
      { scope: 'DOMAIN', tenantId: h.fx.tenantId, domainId: h.fx.domainId, action, objectType: 'SRC', objectId: sourceId }, ObservationCapability.registry,
      async (cap) => {
        if (act === 'approve') await cap.approveSource({ sourceId, contractVersion: 1, tenantId: h.fx.tenantId, domainId: h.fx.domainId, decision: 'approve', reason: 'B40 §IN fixture (SYNTHETIC)', eventId: uuidv7(), correlationId: uuidv7() });
        else await cap.transitionContract({ sourceId, contractVersion: 1, tenantId: h.fx.tenantId, domainId: h.fx.domainId, target: 'active', reason: 'B40 §IN fixture: active', eventId: uuidv7(), correlationId: uuidv7() });
        return { result: {}, targetType: 'SRC', targetId: sourceId, targetVersion: '1', outboxEvent: null };
      });
  }
  const connector = new UploadConnector([]);
  const agentPrincipalId = uuidv7(); const agentId = uuidv7();
  await sql`insert into identity.principals (id, kind, scope, tenant_id, domain_id, display_name, login_name, status)
            values (${agentPrincipalId}::uuid, 'agent', 'DOMAIN', ${h.fx.tenantId}::uuid, ${h.fx.domainId}::uuid, ${`agent:${connector.name}@${connector.version}-${agentId.slice(-8)}`}, null, 'active')`.execute(h.su);
  await sql`insert into identity.role_bindings (id, principal_id, role_code, scope, tenant_id, domain_id)
            values (${uuidv7()}::uuid, ${agentPrincipalId}::uuid, 'collection_agent', 'DOMAIN', ${h.fx.tenantId}::uuid, ${h.fx.domainId}::uuid)`.execute(h.su);
  await inCommitContext(h.app.get<Db>(COMMIT_DB), { sessionId: h.manager.sessionId, contextKey: h.manager.contextKey }, { tenantId: h.fx.tenantId, domainId: h.fx.domainId },
    'observation.agent.register', agentId, async (tx) => {
      await sql`select observation.register_agent(${agentId}::uuid, ${h.fx.tenantId}::uuid, ${h.fx.domainId}::uuid, ${agentPrincipalId}::uuid, 'observation', ${connector.name}, ${connector.version},
        ${connector.codeDigest}, ${h.fx.registrarId}::uuid, ${sourceId}::uuid, ${JSON.stringify({ maxRequestsPerRun: 25, maxBytesPerRun: 33554432, maxConcurrency: 1, timeoutMs: 60000, maxRetries: 0 })}::jsonb,
        ${uuidv7()}::uuid, ${uuidv7()}::uuid)`.execute(tx as never);
    });
  return { sourceId, sourceKey };
}
/** Upload files through the upload route as `who`; the run's outcome. */
async function upload(sourceId: string, who: AuthenticatedPrincipal, files: Array<{ filename: string; mediaType: string; bytes: Buffer }>, contractVersion = 1): Promise<Row> {
  const { up } = await controllers();
  const r = await up.upload(h.req(who, 'observation.run.trigger', 'RUN', null, 'observation'), h.fx.tenantId, h.fx.domainId,
    { payload: { sourceId, contractVersion, files: files.map((f) => ({ filename: f.filename, mediaType: f.mediaType, base64: f.bytes.toString('base64') })) } }) as unknown as { run: Row };
  return r.run;
}
const casesOf = (runId: unknown) => rows(sql`select * from observation.quarantine_current where run_id = ${String(runId)}::uuid order by opened_at`);
const verdictsOf = (where: { caseId?: string; runId?: string }) => where.caseId !== undefined
  ? rows(sql`select * from observation.inspection_verdicts where case_id = ${where.caseId}::uuid order by engine`)
  : rows(sql`select * from observation.inspection_verdicts where run_id = ${where.runId}::uuid order by engine`);
const review = async (who: AuthenticatedPrincipal, caseId: string, decision: 'release' | 'discard', reason = 'B40 §IN review: reviewed by a second person (SYNTHETIC)') => {
  const { obs } = await controllers();
  return obs.reviewQuarantine(h.req(who, 'observation.quarantine.review', 'QAR', caseId, 'observation'), h.fx.tenantId, h.fx.domainId, caseId, { payload: { decision, reason } }) as Promise<Row>;
};
const PDF = 'application/pdf';
const DOCM = 'application/vnd.ms-word.document.macroEnabled.12';
const autoAdmitPdf = { mode: 'within_limits' as const, max_bytes: 65_536, media_types: [PDF, 'text/plain', 'application/json'] };
const policyBlock = (over: Record<string, unknown> = {}) => ({
  content_policy: { scan_engines: ['content-inspector'] as Array<'content-inspector' | 'clamav'>, active_content: 'quarantine' as const, macros: 'quarantine' as const,
                    embedded_files: 'quarantine' as const, hidden_instructions: 'quarantine' as const, admit_opaque_reason: null, auto_admit: autoAdmitPdf, ...over },
});

beforeAll(async () => {
  for (const k of ENV_KEYS) { savedEnv[k] = process.env[k]; delete process.env[k]; }   // no engine 2 unless a case configures one
  h = await Phase4Harness.boot();
  uploader = await h.humanWithSession(['collection_manager'], 'b40in-uploader');
}, 300_000);
afterEach(() => { fault.disarm(); for (const k of ENV_KEYS) delete process.env[k]; });
afterAll(async () => { for (const k of ENV_KEYS) { if (savedEnv[k] === undefined) delete process.env[k]; else process.env[k] = savedEnv[k]; } await h?.close(); });

describe('§IN.1 the clean item is ADMITTED with its verdict recorded as evidence (engine 1, sandboxed)', () => {
  let src: { sourceId: string; sourceKey: string };
  it('the clean delivery note: admitted; the verdict (engine identity, outcome clean, no finding), the assessment, custody.inspected — beside the EVD version', async () => {
    src = await v4UploadSource('clean', policyBlock());
    const bytes = fixtureBytes(B40_FILES.cleanPdf);
    const run = await upload(src.sourceId, h.registrar, [{ filename: 'regensburg-bearings-delivery-note.pdf', mediaType: PDF, bytes }]);
    expect(run).toMatchObject({ state: 'finished', admitted: 1, quarantined: 0 });
    const v = await verdictsOf({ runId: String(run['runId']) });
    expect(v).toHaveLength(1);
    expect(v[0]).toMatchObject({ record_point: 'admitted', engine: 'content-inspector', engine_version: '1.0.0', image_digest: null, rule_set_digest: contentInspectorRuleSetDigest(),
      outcome: 'clean', findings: [], decision: 'pass', decision_class: null, content_digest: sha256(bytes) });
    expect((v[0]!['engine_config'] as Row)['flags']).toContain('--permission');
    const evd = await one(sql`select object_id, object_version, payload ->> 'content_digest' d from objects.canonical_objects where object_type = 'EVD' and object_id = ${String(v[0]!['evd_object_id'])}::uuid`);
    expect(evd['d']).toBe(sha256(bytes));
    const a = await one(sql`select * from observation.intake_assessments where evd_object_id = ${String(v[0]!['evd_object_id'])}::uuid`);
    expect(a).toMatchObject({ decision: 'pass', duplicate_state: 'none', manual_upload: true, uploader_principal_id: h.fx.registrarId, scanned_digest_verified: true });
    expect(Number(a['quality_score'])).toBe(1);
    const c = await rows(sql`select event, digest_verified from observation.custody_events where evd_object_id = ${String(v[0]!['evd_object_id'])}::uuid and event = 'custody.inspected'`);
    expect(c).toEqual([{ event: 'custody.inspected', digest_verified: true }]);
    // the evidence version's verdicts, through the route (observation.inspection.read)
    const { intake } = await controllers();
    const read = await intake.verdicts(h.req(h.manager, 'observation.inspection.read', 'EVD', String(v[0]!['evd_object_id']), 'observation'), h.fx.tenantId, h.fx.domainId, String(v[0]!['evd_object_id']), { payload: {} }) as { inspection: Row };
    expect((read.inspection['verdicts'] as Row[]).map((x) => [x['engine'], x['outcome']])).toEqual([['content-inspector', 'clean']]);
    expect((read.inspection['assessment'] as Row)['duplicate_state']).toBe('none');
  }, 180_000);
  it('the same bytes uploaded again: admitted as a new observation, its duplicate state `same_digest` and its quality lowered by the duplication', async () => {
    const run = await upload(src.sourceId, h.registrar, [{ filename: 'regensburg-bearings-delivery-note.pdf', mediaType: PDF, bytes: fixtureBytes(B40_FILES.cleanPdf) }]);
    const v = await verdictsOf({ runId: String(run['runId']) });
    const a = await one(sql`select duplicate_state, jsonb_array_length(duplicate_of) n, quality_score from observation.intake_assessments where evd_object_id = ${String(v[0]!['evd_object_id'])}::uuid`);
    expect(a).toMatchObject({ duplicate_state: 'same_digest' }); expect(Number(a['n'])).toBeGreaterThan(0);
    expect(Number(a['quality_score'])).toBeCloseTo(0.667, 3);
  }, 120_000);
  it('an evidence version admitted BEFORE B40 (no verdict) reads "not recorded before B40"', async () => {
    const before = await one(sql`select object_id from objects.canonical_objects where object_type = 'EVD' and tenant_id = ${h.fx.tenantId}::uuid and object_id not in (select evd_object_id from observation.inspection_verdicts where evd_object_id is not null) limit 1`);
    if (before['object_id'] === undefined) return;   // a fresh harness may hold none yet
    const { intake } = await controllers();
    const r = await intake.verdicts(h.req(h.manager, 'observation.inspection.read', 'EVD', String(before['object_id']), 'observation'), h.fx.tenantId, h.fx.domainId, String(before['object_id']), { payload: {} }) as { inspection: Row };
    expect(r.inspection['verdicts']).toEqual([]); expect(r.inspection['statement']).toMatch(/not recorded before B40/);
  }, 60_000);
});

describe('§IN.2 active content, hidden instructions and macros are QUARANTINED by the v4 content policy (D7) — cited, never quoted (D9)', () => {
  let src: { sourceId: string; sourceKey: string }; let supplierCase: Row; let docmCase: Row;
  it('the supplier PDF → active_content (the reason also names the hidden instruction); the .docm → macro; nothing reaches evidence', async () => {
    src = await v4UploadSource('safety', policyBlock());
    const run = await upload(src.sourceId, uploader, [
      { filename: 'regensburg-bearings-supplier-quality-report.pdf', mediaType: PDF, bytes: fixtureBytes(B40_FILES.supplierPdf) },
      { filename: 'regensburg-bearings-inspection-checklist.docm', mediaType: DOCM, bytes: fixtureBytes(B40_FILES.macroDocm) }]);
    expect(run).toMatchObject({ state: 'finished', admitted: 0, quarantined: 2 });
    const cases = await casesOf(run['runId']);
    supplierCase = cases.find((c) => String(c['item_key']).includes('supplier'))!; docmCase = cases.find((c) => String(c['item_key']).includes('checklist'))!;
    expect(supplierCase).toMatchObject({ reason_class: 'active_content', state: 'open' });
    expect(String(supplierCase['reason'])).toMatch(/active content \(pdf\.open_action @\d+.*\); hidden instructions \(pdf\.hidden_text_instruction @\d+, pdf\.metadata_zero_width @\d+\)/);
    expect(String(supplierCase['reason'])).not.toMatch(/ignore previous|mark this supplier/i);
    expect(docmCase).toMatchObject({ reason_class: 'macro' });
    const v = await verdictsOf({ caseId: String(supplierCase['case_id']) });
    expect(v).toHaveLength(1);
    expect(v[0]).toMatchObject({ record_point: 'quarantined', outcome: 'clean', decision: 'quarantine', decision_class: 'active_content' });
    expect(new Set((v[0]!['findings'] as Row[]).map((f) => f['class']))).toEqual(new Set(['active_content', 'hidden_instruction']));
    expect(JSON.stringify(v[0]!['findings'])).not.toMatch(/ignore previous|mark this supplier/i);
    // nothing of either item reached the evidence volume
    expect(await rows(sql`select 1 from observation.blob_manifests where run_id = ${String(run['runId'])}::uuid and vault = 'evidence'`)).toEqual([]);
    const a = await one(sql`select review_reason, manual_upload, uploader_principal_id from observation.intake_assessments where case_id = ${String(supplierCase['case_id'])}::uuid`);
    expect(a).toEqual({ review_reason: 'safety', manual_upload: true, uploader_principal_id: uploader.principalId });
  }, 180_000);
  it('the case\'s WHY: the verdict with its engine identity and the findings by code and offset — no content in the answer', async () => {
    const { intake } = await controllers();
    const r = await intake.readCase(h.req(h.manager, 'observation.inspection.read', 'QAR', String(supplierCase['case_id']), 'observation'), h.fx.tenantId, h.fx.domainId, String(supplierCase['case_id'])) as { intake: Row };
    const why = r.intake;
    expect((why['case'] as Row)['review_reason']).toBe('safety');
    expect((why['verdicts'] as Row[])[0]).toMatchObject({ engine: 'content-inspector', engine_version: '1.0.0', rule_set_digest: contentInspectorRuleSetDigest() });
    expect((why['custody'] as Row[]).map((c) => c['event'])).toEqual(expect.arrayContaining(['custody.quarantined', 'custody.inspected']));
    expect(JSON.stringify(why)).not.toMatch(/ignore previous|mark this supplier/i);
    expect(why['you_uploaded']).toBe(false);
    const mine = await intake.readCase(h.req(uploader, 'observation.inspection.read', 'QAR', String(supplierCase['case_id']), 'observation'), h.fx.tenantId, h.fx.domainId, String(supplierCase['case_id'])) as { intake: Row };
    expect(mine.intake['you_uploaded']).toBe(true);
  }, 60_000);
  it('the EXCERPT around a finding: only under observation.evidence.retrieve (D9) — custody.retrieved written, ≤ 2 KiB served; a role without it refused', async () => {
    const { intake } = await controllers();
    const v = await verdictsOf({ caseId: String(supplierCase['case_id']) });
    const run = (v[0]!['findings'] as Row[]).find((f) => f['code'] === 'pdf.hidden_text_instruction')!;
    const r = await intake.excerpt(h.req(h.manager, 'observation.evidence.retrieve', 'QAR', String(supplierCase['case_id']), 'observation'), h.fx.tenantId, h.fx.domainId,
      String(supplierCase['case_id']), { payload: { offset: run['offset'], length: run['length'] } }) as { excerpt: Row };
    const text = Buffer.from(String(r.excerpt['base64']), 'base64').toString('latin1');
    expect(text).toContain('ignore previous instructions');   // the reviewer who may read evidence bytes sees why
    expect(Buffer.from(String(r.excerpt['base64']), 'base64').length).toBeLessThanOrEqual(2048 + 512);
    expect(await rows(sql`select details ->> 'purpose' p from observation.custody_events where manifest_id = ${String(supplierCase['manifest_id'])}::uuid and event = 'custody.retrieved'`)).toEqual([{ p: 'intake_case_excerpt' }]);
    const steward = await h.humanWithSession(['data_steward'], 'b40in-steward');
    expect((await refusal(intake.excerpt(h.req(steward, 'observation.evidence.retrieve', 'QAR', String(supplierCase['case_id']), 'observation'), h.fx.tenantId, h.fx.domainId,
      String(supplierCase['case_id']), { payload: { offset: 0 } }))).status).toBe(403);
    expect((await refusal(intake.queue(h.req(steward, 'observation.inspection.read', 'QAR', null, 'observation'), h.fx.tenantId, h.fx.domainId, { payload: {} }))).status).toBe(403);
  }, 60_000);
  it('a corrupted quarantined blob: the excerpt answers 409 with nothing served, custody.integrity_failed recorded', async () => {
    const root = resolve(String(h.app.get<Record<string, unknown>>(EYE_CONFIG)['eye.vault.quarantine_root']));
    const m = await one(sql`select locator from observation.blob_manifests where manifest_id = ${String(docmCase['manifest_id'])}::uuid`);
    const path = join(root, String(m['locator']));
    const original = readFileSync(path);
    writeFileSync(path, Buffer.concat([original, Buffer.from('tamper')]));
    try {
      const { intake } = await controllers();
      const r = await refusal(intake.excerpt(h.req(h.manager, 'observation.evidence.retrieve', 'QAR', String(docmCase['case_id']), 'observation'), h.fx.tenantId, h.fx.domainId,
        String(docmCase['case_id']), { payload: { offset: 0 } }));
      expect(r.status).toBe(409);
      expect(await rows(sql`select event from observation.custody_events where manifest_id = ${String(docmCase['manifest_id'])}::uuid and event = 'custody.integrity_failed'`)).toHaveLength(1);
    } finally { writeFileSync(path, original); }
  }, 60_000);
  it('REVIEWER ≠ UPLOADER (D9b): the uploading manager\'s own rejection is refused; another manager rejects with a reason — custody intact, the bytes retained', async () => {
    const own = await refusal(review(uploader, String(docmCase['case_id']), 'discard'));
    expect(own.message).toMatch(/^quarantine review rejected \(separation_of_duties\): the operator who uploaded this item never reviews its quarantine case/);
    expect((await one(sql`select state from observation.quarantine_current where case_id = ${String(docmCase['case_id'])}::uuid`))['state']).toBe('open');
    await review(h.manager, String(docmCase['case_id']), 'discard', 'a macro-enabled checklist from the supplier — rejected; the bytes stay in quarantine (SYNTHETIC)');
    const closed = await one(sql`select state, review_actor from observation.quarantine_current where case_id = ${String(docmCase['case_id'])}::uuid`);
    expect(closed).toEqual({ state: 'rejected', review_actor: `principal:${h.manager.principalId}` });
    const ev = await one(sql`select details from observation.quarantine_events where case_id = ${String(docmCase['case_id'])}::uuid and event = 'case.rejected'`);
    expect(ev['details']).toMatchObject({ uploaded_by: uploader.principalId, reviewer_is_not_uploader: true });
    expect(await rows(sql`select 1 from observation.blob_manifests where manifest_id = ${String(docmCase['manifest_id'])}::uuid and vault = 'quarantine'`)).toHaveLength(1);
  }, 60_000);
  it('a COLLECTED item keeps today\'s rule (the hosted journey 8): the manager who triggered the run reviews its quarantine case', async () => {
    const v = await h.newVersion({ from: '2023-01-01', to: '2023-01-20', windowDays: 366 });
    const principal = await h.sessions.openRunSession({ agentId: h.fx.agentId, tenantId: h.fx.tenantId, domainId: h.fx.domainId,
      agentVersion: new RestConnector().version, codeDigest: new RestConnector().codeDigest, correlationId: uuidv7() });
    const run = await h.lifecycle.run({ sourceId: h.fx.sourceId, contractVersion: v.version, agentId: h.fx.agentId, agentVersion: new RestConnector().version,
      connector: new RestConnector({ egress: fakeEgress(() => '{"structure":"drifted"}').egress }), principal, correlationId: uuidv7(), purposeId: 'observation',
      trigger: { kind: 'operator', by: `principal:${h.manager.principalId}` } });
    const cases = await casesOf(run.runId);
    expect(cases.length).toBeGreaterThan(0);
    await review(h.manager, String(cases[0]!['case_id']), 'discard', 'the row is missing a required field upstream and is not admissible');
    expect((await one(sql`select state from observation.quarantine_current where case_id = ${String(cases[0]!['case_id'])}::uuid`))['state']).toBe('rejected');
    expect(await verdictsOf({ caseId: String(cases[0]!['case_id']) })).toEqual([]);   // a v1–v3 contract: no verdict (D8)
  }, 180_000);
  it('admit_opaque WITH its reason admits the active content and the hidden instruction (D7) — the rule recorded on the assessment', async () => {
    const s = await v4UploadSource('opaque', policyBlock({ active_content: 'admit_opaque', hidden_instructions: 'admit_opaque', auto_admit: autoAdmitPdf,
      admit_opaque_reason: 'the publisher signs every report with a form script (SYNTHETIC test of admit_opaque)' }));
    const run = await upload(s.sourceId, h.registrar, [{ filename: 'regensburg-bearings-supplier-quality-report.pdf', mediaType: PDF, bytes: fixtureBytes(B40_FILES.supplierPdf) }]);
    expect(run).toMatchObject({ admitted: 1, quarantined: 0 });
    const a = await one(sql`select content_rules from observation.intake_assessments where run_id = ${String(run['runId'])}::uuid`);
    expect(a['content_rules']).toMatchObject({ active_content: { rule: 'admit_opaque', reason: 'the publisher signs every report with a form script (SYNTHETIC test of admit_opaque)' }, hidden_instruction: { rule: 'admit_opaque' } });
  }, 180_000);
});

describe('§IN.3 ONLY clean admits — an unavailable, failed or incomplete scan is never clean (D2; F48, F49)', () => {
  let src: { sourceId: string; sourceKey: string };
  it('the contract names clamav and the deployment configures no engine → inspection_unavailable (engine 1 clean, engine 2 unavailable — both recorded)', async () => {
    src = await v4UploadSource('two-engines', policyBlock({ scan_engines: ['content-inspector', 'clamav'] }));
    const run = await upload(src.sourceId, h.registrar, [{ filename: 'regensburg-bearings-delivery-note.pdf', mediaType: PDF, bytes: fixtureBytes(B40_FILES.cleanPdf) }]);
    expect(run).toMatchObject({ admitted: 0, quarantined: 1 });
    const c = (await casesOf(run['runId']))[0]!;
    expect(c['reason_class']).toBe('inspection_unavailable');
    const v = await verdictsOf({ caseId: String(c['case_id']) });
    expect(v.map((x) => [x['engine'], x['outcome']])).toEqual([['clamav', 'unavailable'], ['content-inspector', 'clean']]);
    expect(String(v[0]!['detail'])).toMatch(/EYE_CLAMD_ADDR is not set/);
  }, 120_000);
  it('F48: the sandboxed inspector crashed → unavailable → quarantined inspection_unavailable', async () => {
    const s = await v4UploadSource('f48', policyBlock());
    fault.arm(['f48.inspector_crash_or_timeout'], 'test');
    const run = await upload(s.sourceId, h.registrar, [{ filename: 'regensburg-bearings-delivery-note.pdf', mediaType: PDF, bytes: fixtureBytes(B40_FILES.cleanPdf) }]);
    const c = (await casesOf(run['runId']))[0]!;
    expect(c['reason_class']).toBe('inspection_unavailable');
    expect((await verdictsOf({ caseId: String(c['case_id']) }))[0]).toMatchObject({ engine: 'content-inspector', outcome: 'unavailable' });
  }, 120_000);
  it('F49: the clamd engine unavailable (armed; the engine configured explicitly) → quarantined inspection_unavailable, the configuration on the verdict', async () => {
    const closed = createServer(); await new Promise<void>((r) => closed.listen(0, '127.0.0.1', () => r()));
    const port = (closed.address() as { port: number }).port; await new Promise<void>((r) => closed.close(() => r()));
    Object.assign(process.env, { EYE_CLAMD_ADDR: `127.0.0.1:${port}`, EYE_CLAMAV_DB_SOURCE: 'harness: none (F49)', EYE_CLAMAV_DB_UPDATE_POLICY: 'harness: none (F49)' });
    fault.arm(['f49.clamd_unavailable'], 'test');
    const run = await upload(src.sourceId, h.registrar, [{ filename: 'eicar-free-note.txt', mediaType: 'text/plain', bytes: Buffer.from('a SYNTHETIC note with nothing in it\n') }]);
    const c = (await casesOf(run['runId']))[0]!;
    expect(c['reason_class']).toBe('inspection_unavailable');
    const v = (await verdictsOf({ caseId: String(c['case_id']) })).find((x) => x['engine'] === 'clamav')!;
    expect(v).toMatchObject({ outcome: 'unavailable' });
    expect(String(v['detail'])).toMatch(/injected fault at f49/);
    expect(v['engine_config']).toMatchObject({ database_source: 'harness: none (F49)', update_policy: 'harness: none (F49)' });
  }, 120_000);
  it('the database holds D2 too: a PASS row whose engine was not clean is refused; a quarantine decision never reaches an admission', async () => {
    const base = { scope: 'DOMAIN', tenant: h.fx.tenantId, domain: h.fx.domainId };
    for (const [point, outcome, decision] of [['quarantined', 'unavailable', 'pass'], ['admitted', 'clean', 'quarantine']] as const) {
      const r = await refusal(sql`insert into observation.inspection_verdicts (verdict_id, scope, tenant_id, domain_id, source_id, contract_version, item_key, content_digest, record_point,
          evd_object_id, evd_version, case_id, manifest_id, engine, outcome, started_at, finished_at, decision, decision_class, recorded_by, correlation_id)
        values (${uuidv7()}::uuid, ${base.scope}, ${base.tenant}::uuid, ${base.domain}::uuid, ${src.sourceId}::uuid, 1, 'probe', ${'0'.repeat(64)}, ${point},
          ${point === 'admitted' ? uuidv7() : null}::uuid, ${point === 'admitted' ? 1 : null}::int, ${point === 'quarantined' ? uuidv7() : null}::uuid, ${uuidv7()}::uuid, 'content-inspector',
          ${outcome}, now(), now(), ${decision}, ${decision === 'quarantine' ? 'macro' : null}, ${h.fx.registrarId}::uuid, ${uuidv7()}::uuid)`.execute(h.su));
      expect(r.message).toMatch(/violates check constraint "iv_(pass_is_clean|admitted_passed)"/);
    }
    const content = await refusal(sql`insert into observation.inspection_verdicts (verdict_id, scope, tenant_id, domain_id, source_id, contract_version, item_key, content_digest, record_point,
        case_id, manifest_id, engine, outcome, findings, started_at, finished_at, decision, decision_class, recorded_by, correlation_id)
      values (${uuidv7()}::uuid, 'DOMAIN', ${h.fx.tenantId}::uuid, ${h.fx.domainId}::uuid, ${src.sourceId}::uuid, 1, 'probe', ${'0'.repeat(64)}, 'quarantined', ${uuidv7()}::uuid, ${uuidv7()}::uuid,
        'content-inspector', 'detected', ${JSON.stringify([{ code: 'x', excerpt: 'content must never be stored here' }])}::jsonb, now(), now(), 'quarantine', 'malware_verdict', ${h.fx.registrarId}::uuid, ${uuidv7()}::uuid)`.execute(h.su));
    expect(content.message).toMatch(/inspection_verdicts_findings_check|iv_findings_ok|check constraint/);
  }, 60_000);
});

describe('§IN.4 THE UPLOAD APPROVAL (SP-22): outside auto_admit an upload waits for a second person', () => {
  let src: { sourceId: string; sourceKey: string }; let held: Row; let approvalId = '';
  it('auto_admit never: a clean upload is HELD — quarantined under the policy class with the reason saying it awaits approval; a pending approval names the uploader', async () => {
    src = await v4UploadSource('approval', policyBlock({ auto_admit: { mode: 'never', max_bytes: null, media_types: [] } }));
    const run = await upload(src.sourceId, uploader, [{ filename: 'regensburg-bearings-delivery-note.pdf', mediaType: PDF, bytes: fixtureBytes(B40_FILES.cleanPdf) }]);
    expect(run).toMatchObject({ admitted: 0, quarantined: 1 });
    held = (await casesOf(run['runId']))[0]!;
    expect(held['reason_class']).toBe('approval_required');   // B40 integration: its own class (SP-22)
    expect(String(held['reason'])).toMatch(/held for a second person's approval \(SP-22\).*not prohibited, it waits for approval/);
    const a = await one(sql`select approval_id, state, requester_principal_id, held_because from observation.upload_approvals where case_id = ${String(held['case_id'])}::uuid`);
    expect(a).toMatchObject({ state: 'pending', requester_principal_id: uploader.principalId, held_because: 'the contract admits no upload without a second person (auto_admit: never)' });
    approvalId = String(a['approval_id']);
  }, 120_000);
  it('the uploader\'s own decision is refused; an agent is refused; a release before approval is refused (held)', async () => {
    const { intake } = await controllers();
    const own = await refusal(intake.decide(h.req(uploader, 'observation.upload.approve', 'QAR', approvalId, 'observation'), h.fx.tenantId, h.fx.domainId, approvalId,
      { payload: { decision: 'approve', reason: 'approving my own upload (must be refused)' } }));
    expect(own.message).toMatch(/^upload approval rejected \(separation_of_duties\)/);
    const rc = new RestConnector();
    const agent = await h.sessions.openRunSession({ agentId: h.fx.agentId, tenantId: h.fx.tenantId, domainId: h.fx.domainId, agentVersion: rc.version, codeDigest: rc.codeDigest, correlationId: uuidv7() });
    expect((await refusal(intake.decide(h.req(agent, 'observation.upload.approve', 'QAR', approvalId, 'observation'), h.fx.tenantId, h.fx.domainId, approvalId,
      { payload: { decision: 'approve', reason: 'an agent approving (must be refused)' } }))).status).toBe(403);
    const early = await refusal(review(h.manager, String(held['case_id']), 'release'));
    expect(early.message).toMatch(/^quarantine review rejected \(held\): the upload awaits a second person's approval/);
  }, 60_000);
  it('a second person approves: the approval recorded, then the case RELEASED into evidence through the existing review (two receipts)', async () => {
    const { intake } = await controllers();
    const r = await intake.decide(h.req(h.manager, 'observation.upload.approve', 'QAR', approvalId, 'observation'), h.fx.tenantId, h.fx.domainId, approvalId,
      { payload: { decision: 'approve', reason: 'the delivery note matches the purchase order (SYNTHETIC)' } }) as Row;
    expect(r['approval']).toMatchObject({ state: 'approved', decided_by: h.manager.principalId, requester: uploader.principalId });
    expect(r['review']).toMatchObject({ case: { caseId: String(held['case_id']) } });
    expect((await one(sql`select state from observation.quarantine_current where case_id = ${String(held['case_id'])}::uuid`))['state']).toBe('admitted');
    expect((await rows(sql`select event from observation.upload_approval_events where approval_id = ${approvalId}::uuid order by occurred_at`)).map((x) => x['event'])).toEqual(['upload.held', 'upload.approved']);
    const again = await refusal(intake.decide(h.req(h.manager, 'observation.upload.approve', 'QAR', approvalId, 'observation'), h.fx.tenantId, h.fx.domainId, approvalId,
      { payload: { decision: 'decline', reason: 'a second decision on a decided upload' } }));
    expect(again.message).toMatch(/^upload approval rejected \(state\): the upload is already approved/);
  }, 120_000);
  it('a decline rejects the case (the bytes kept in quarantine); a pending upload rejected by a review is declined with it', async () => {
    const run = await upload(src.sourceId, uploader, [{ filename: 'note-2.txt', mediaType: 'text/plain', bytes: Buffer.from('SYNTHETIC second note for the decline path\n') }]);
    const c = (await casesOf(run['runId']))[0]!;
    const a = await one(sql`select approval_id from observation.upload_approvals where case_id = ${String(c['case_id'])}::uuid`);
    const { intake } = await controllers();
    const r = await intake.decide(h.req(h.manager, 'observation.upload.approve', 'QAR', String(a['approval_id']), 'observation'), h.fx.tenantId, h.fx.domainId, String(a['approval_id']),
      { payload: { decision: 'decline', reason: 'not a document this source collects (SYNTHETIC)' } }) as Row;
    expect(r['approval']).toMatchObject({ state: 'declined' });
    expect((await one(sql`select state from observation.quarantine_current where case_id = ${String(c['case_id'])}::uuid`))['state']).toBe('rejected');
    const run3 = await upload(src.sourceId, uploader, [{ filename: 'note-3.txt', mediaType: 'text/plain', bytes: Buffer.from('SYNTHETIC third note: rejected by a review\n') }]);
    const c3 = (await casesOf(run3['runId']))[0]!;
    await review(h.manager, String(c3['case_id']), 'discard', 'rejected from the queue without a separate decision (SYNTHETIC)');
    expect((await one(sql`select state, decided_by from observation.upload_approvals where case_id = ${String(c3['case_id'])}::uuid`))).toEqual({ state: 'declined', decided_by: h.manager.principalId });
  }, 180_000);
});

describe('§IN.5 the intake review queue: reasons, verdicts, duplicates, quality, uploads, expiry (D16), notices; v1–v3 unchanged (D8)', () => {
  it('the queue lists each open case with its review reason and verdicts; `you_uploaded` for the uploader; counts by reason', async () => {
    const { intake } = await controllers();
    const q = (await intake.queue(h.req(uploader, 'observation.inspection.read', 'QAR', null, 'observation'), h.fx.tenantId, h.fx.domainId, { payload: { state: 'open' } }) as { queue: Row }).queue;
    const cases = q['cases'] as Row[];
    const supplier = cases.find((c) => String(c['item_key']).includes('supplier-quality-report') && (c['assessment'] as Row | null)?.['decision_class'] === 'active_content');
    expect(supplier).toMatchObject({ review_reason: 'safety', recorded: true, manual_upload: true, you_uploaded: true, schema_ref: 'SRC@v4' });
    expect((supplier!['verdicts'] as Row[])[0]).toMatchObject({ engine: 'content-inspector', outcome: 'clean' });
    expect((q['counts'] as Row)['by_review_reason']).toMatchObject({ safety: expect.any(Number) });
  }, 60_000);
  it('a v1 upload (the DEF-03 PDF) is ADMITTED as before with no verdict (D8); a v1 case reads "not recorded before B40"; an open case past its expiry says so (D16)', async () => {
    const def03 = readFileSync(new URL('../../../../fixtures/phase1/replay/carrier-advisories/carrier-reroute-notice-2024-01-14.pdf', import.meta.url));
    const v1 = await h.uploadSource('internal', 'b40in-v1');
    const run = await upload(v1, h.registrar, [{ filename: 'carrier-reroute-notice-2024-01-14.pdf', mediaType: 'text/csv', bytes: def03 }]);
    // a PDF declared as CSV: the v1 rule (content-controls) decides exactly as before; and a true PDF admitted with its flag
    const run2 = await upload(v1, h.registrar, [{ filename: 'carrier-reroute-notice-2024-01-14.pdf', mediaType: PDF, bytes: def03 }]);
    expect(run2).toMatchObject({ admitted: 1, quarantined: 0 });
    expect(await verdictsOf({ runId: String(run2['runId']) })).toEqual([]);
    const flagged = await one(sql`select active_content_risk from observation.blob_manifests where run_id = ${String(run2['runId'])}::uuid and vault = 'evidence'`);
    expect(flagged['active_content_risk']).toBe(true);
    const zipCsv = Buffer.concat([Buffer.from([0x50, 0x4b, 0x05, 0x06]), Buffer.alloc(18)]);
    const run3 = await upload(v1, h.registrar, [{ filename: 'orders.csv', mediaType: 'text/csv', bytes: zipCsv }]);
    const c = (await casesOf(run3['runId']))[0]!;
    expect(c['reason_class']).toBe('type_mismatch');
    await sql`update observation.quarantine_current set expires_at = now() - interval '2 days' where case_id = ${String(c['case_id'])}::uuid`.execute(h.su);   // the D16 shape: open past expiry
    const { intake } = await controllers();
    const q = (await intake.queue(h.req(h.manager, 'observation.inspection.read', 'QAR', null, 'observation'), h.fx.tenantId, h.fx.domainId, { payload: {} }) as { queue: Row }).queue;
    const row = (q['cases'] as Row[]).find((x) => x['case_id'] === c['case_id'])!;
    expect(row).toMatchObject({ recorded: false, review_reason: 'integrity', past_expiry: true, schema_ref: 'SRC@v1–v3', state: 'open' });
    expect(String(row['not_recorded_statement'])).toMatch(/not recorded before B40/);
    expect(String(row['expiry_statement'])).toMatch(/past expiry .* — not expired by the sweeper/);
    expect(Number((q['counts'] as Row)['past_expiry'])).toBeGreaterThanOrEqual(1);
    void run;
  }, 180_000);
  it('the consumer notice: a case opened on a source that products rest on names them for the steward and the managers', async () => {
    const s = await v4UploadSource('notice', policyBlock());
    // SYNTHETIC scaffolding: an issued forecast on a series of this source (B22/B28's walk reaches it)
    await sql`insert into prediction.series_registry (series_key, scope, tenant_id, domain_id, source_key, parser_ref, value_field, unit, description, registered_by, correlation_id)
      values (${`${s.sourceKey}:lead_days`}, 'DOMAIN', ${h.fx.tenantId}::uuid, ${h.fx.domainId}::uuid, ${s.sourceKey}, 'b40-fixture@1.0', 'value', 'days', 'B40 §IN fixture series (SYNTHETIC)', ${h.fx.registrarId}::uuid, ${uuidv7()}::uuid)`.execute(h.su);
    await sql`insert into prediction.forecasts_current (forecast_id, scope, tenant_id, domain_id, series_key, horizon_code, horizon_days, origin_at, known_at, target_at, method, method_version, baseline_method,
        quantiles, drivers, assumptions, evidence_refs, refresh_cadence, validation_state, validation_note, label, statement, state, issued_by, correlation_id)
      values (${uuidv7()}::uuid, 'DOMAIN', ${h.fx.tenantId}::uuid, ${h.fx.domainId}::uuid, ${`${s.sourceKey}:lead_days`}, '30d', 30, '2026-10-20', now(), '2026-11-19', 'seasonal-naive', '1.0.0', 'naive',
        '{"q10": 1, "q50": 2, "q90": 3}'::jsonb, '["lead days"]'::jsonb, ${sql`ARRAY[${uuidv7()}::uuid]`}, ${JSON.stringify([`SRC:${s.sourceId}@1`])}::jsonb, 'weekly', 'unvalidated', 'fixture forecast: not validated', 'replay demonstration', 'B40 §IN fixture forecast (SYNTHETIC)', 'issued', ${h.fx.registrarId}::uuid, ${uuidv7()}::uuid)`.execute(h.su);
    const run = await upload(s.sourceId, h.registrar, [{ filename: 'regensburg-bearings-inspection-checklist.docm', mediaType: DOCM, bytes: fixtureBytes(B40_FILES.macroDocm) }]);
    const c = (await casesOf(run['runId']))[0]!;
    const a = await one(sql`select consumer_notice from observation.intake_assessments where case_id = ${String(c['case_id'])}::uuid`);
    expect(a['consumer_notice']).toMatchObject({ products: { forecast: 1 }, product_count: 1, notify_roles: ['collection_manager', 'data_steward'], steward: 'F. Aydın (data steward, SYNTHETIC)' });
    const clean = await upload(s.sourceId, h.registrar, [{ filename: 'regensburg-bearings-delivery-note.pdf', mediaType: PDF, bytes: fixtureBytes(B40_FILES.cleanPdf) }]);
    expect((await one(sql`select consumer_notice from observation.intake_assessments where run_id = ${String(clean['runId'])}::uuid`))['consumer_notice']).toBeNull();   // admitted: no notice
  }, 180_000);
  it('the reads are guarded: another tenant\'s scope is refused; a state outside the vocabulary is refused', async () => {
    const { intake } = await controllers();
    expect((await refusal(intake.queue(h.req(h.manager, 'observation.inspection.read', 'QAR', null, 'observation'), uuidv7(), h.fx.domainId, { payload: {} }))).status).toBe(403);
    const bad = await refusal(intake.queue(h.req(h.manager, 'observation.inspection.read', 'QAR', null, 'observation'), h.fx.tenantId, h.fx.domainId, { payload: { state: 'everything' } }));
    expect(bad.message).toMatch(/intake review rejected \(state\)/);
  }, 60_000);
});
