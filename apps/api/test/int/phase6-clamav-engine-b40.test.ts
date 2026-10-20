/**
 * CP-6 B40 §IN — THE REAL-ENGINE INTEGRATION HARNESS (DESIGN D2, the owner's word; L1-C07, V03-T-074, DAT-IN-11): a REAL ClamAV engine over
 * clamd, end to end through the real intake — an SRC@v4 upload contract naming BOTH engines (content-inspector, clamav), uploads through the
 * upload route, the inspect stage, the verdicts recorded as evidence with the engine + signature-database identity:
 *   · a CLEAN input (the committed delivery note) → ADMITTED; the clamav verdict `clean` with the engine version, the daily database version
 *     and build time as the engine reports them, the declared databases, the configured image digest, the database source and update policy;
 *   · the HARMLESS DETECTION FIXTURE (the EICAR test string, assembled in memory by eicarTestBytes(), never a file) → QUARANTINED
 *     malware_verdict, the signature name as the finding's code;
 *   · an engine ERROR ANSWER (the harness substitutes a malformed command; the engine's own `UNKNOWN COMMAND`) → failed → QUARANTINED
 *     inspection_failed; the engine's stream-size REFUSAL (a chunk declared past its limit) → incomplete → QUARANTINED inspection_incomplete;
 *   · the engine STOPPED (EYE_CLAMD_CONTAINER names the container: `docker stop` — otherwise an unreachable address, said so) → unavailable →
 *     QUARANTINED inspection_unavailable. Never clean.
 *
 * IT RUNS ONLY WHEN `EYE_CLAMD_ADDR` NAMES A REACHABLE clamd (with EYE_CLAMAV_DB_SOURCE and EYE_CLAMAV_DB_UPDATE_POLICY set explicitly);
 * otherwise every case is SKIPPED and the reason is printed — never green by omission. THE IMAGE IS NOT ADMITTED (DESIGN "D2 — the admission
 * result"): run locally against the EVALUATION engine (the unadmitted clamav/clamav:1.5.4_base-debian arm64 child, loopback :3310, the
 * database volume eye-clamav-db), its results are EVALUATION EVIDENCE of an unadmitted image (evidence/cp6/b40-clamav-evaluation.txt);
 * EXC-P1-001 stays OPEN. EYE_B40_CLAMAV_EVIDENCE_OUT (a path outside the repository) receives the observed verdicts as JSON.
 * Every row here is SYNTHETIC fixture data.
 */
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { sql } from 'kysely';
import { uuidv7 } from 'uuidv7';
import { execFileSync } from 'node:child_process';
import { rmSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { EYE_CONFIG } from '../../src/config/config.module.js';
import { ObservationCapability } from '../../src/observation/observation.capabilities.js';
import { UploadConnector } from '../../src/observation/connectors/upload.connector.js';
import { ClamdAdapter, clamdConfigFromEnv } from '../../src/observation/inspection/clamd-adapter.js';
import { COMMIT_DB } from '../../src/shared/shared.module.js';
import type { Db } from '../../src/shared/db.js';
import { Phase4Harness } from './phase4-helpers.js';
import { inCommitContext } from './phase1-helpers.js';
import { evaluateForApproval, eicarTestBytes, fixtureBytes, srcV4Contract, B40_FILES } from './phase6-b40-fixtures.js';

type Row = Record<string, unknown>;

/* ── reachability, decided before any case is collected (a skipped case says why) ───────────────────────────────────────────────── */
const { config, problem } = clamdConfigFromEnv();
let skipReason: string | null = problem === null ? null : `SKIPPED — ${problem}`;
let reportedVersion: string | null = null;
if (config !== null) {
  const a = new ClamdAdapter(config);
  if (!(await a.ping())) skipReason = `SKIPPED — EYE_CLAMD_ADDR ${config.host}:${config.port} names no reachable clamd (PING got no PONG)`;
  else reportedVersion = (await a.identity())?.reported ?? null;
}
if (skipReason !== null) console.warn(`[phase6-clamav-engine-b40] ${skipReason}. The real-engine integration is NOT proven by this run (DESIGN D2).`);
else console.warn(`[phase6-clamav-engine-b40] running against ${config!.host}:${config!.port} — ${reportedVersion} (evaluation engine; the image is not admitted)`);

let h: Phase4Harness;
let sourceId = '';
const observed: Row[] = [];
/** The quarantined EICAR blob's path: REMOVED after use (the string is never left on disk — D18 / D19). */
const eicarBlobs: string[] = [];
const rows = async (q: ReturnType<typeof sql>) => (await q.execute(h.su)).rows as Row[];

async function v4Source(): Promise<string> {
  const { ObservationController } = await import('../../src/observation/observation.controller.js');
  const obs = h.app.get(ObservationController);
  const sourceKey = `b40-clamav-eval-${uuidv7().slice(-8)}`;
  const contract = srcV4Contract({ sourceKey, name: 'B40 §IN real-engine evaluation (SYNTHETIC)', kind: 'upload', replaySet: 'nordwerk-uploads',
    mediaTypes: ['application/pdf', 'text/plain'], blocks: { content_policy: { scan_engines: ['content-inspector', 'clamav'], active_content: 'quarantine', macros: 'quarantine',
      embedded_files: 'quarantine', hidden_instructions: 'quarantine', admit_opaque_reason: null, auto_admit: { mode: 'within_limits', max_bytes: 65_536, media_types: ['application/pdf', 'text/plain'] } } } });
  (contract['authority_and_rights'] as Row)['purposes'] = ['observation'];
  const r = await obs.registerSource(h.req(h.registrar, 'observation.source.register', 'SRC', null, 'observation'), h.fx.tenantId, h.fx.domainId, { payload: { contract } }) as { source: { sourceId: string } };
  const id = r.source.sourceId;
  await evaluateForApproval(h, h.manager, { tenantId: h.fx.tenantId, domainId: h.fx.domainId, sourceId: id, contractVersion: 1, label: 'B40 §IN real-engine fixture' });   // B40 integration: §RG's gate (D5)
  for (const action of ['observation.source.approve', 'observation.source.transition'] as const) {
    await h.pipeline.write(h.env(h.manager, action, 'SRC', id), h.manager, { scope: 'DOMAIN', tenantId: h.fx.tenantId, domainId: h.fx.domainId, action, objectType: 'SRC', objectId: id },
      ObservationCapability.registry, async (cap) => {
        if (action === 'observation.source.approve') await cap.approveSource({ sourceId: id, contractVersion: 1, tenantId: h.fx.tenantId, domainId: h.fx.domainId, decision: 'approve', reason: 'B40 §IN real-engine fixture (SYNTHETIC)', eventId: uuidv7(), correlationId: uuidv7() });
        else await cap.transitionContract({ sourceId: id, contractVersion: 1, tenantId: h.fx.tenantId, domainId: h.fx.domainId, target: 'active', reason: 'B40 §IN real-engine fixture: active', eventId: uuidv7(), correlationId: uuidv7() });
        return { result: {}, targetType: 'SRC', targetId: id, targetVersion: '1', outboxEvent: null };
      });
  }
  const connector = new UploadConnector([]); const agentPrincipalId = uuidv7(); const agentId = uuidv7();
  await sql`insert into identity.principals (id, kind, scope, tenant_id, domain_id, display_name, login_name, status)
            values (${agentPrincipalId}::uuid, 'agent', 'DOMAIN', ${h.fx.tenantId}::uuid, ${h.fx.domainId}::uuid, ${`agent:${connector.name}-${agentId.slice(-8)}`}, null, 'active')`.execute(h.su);
  await sql`insert into identity.role_bindings (id, principal_id, role_code, scope, tenant_id, domain_id)
            values (${uuidv7()}::uuid, ${agentPrincipalId}::uuid, 'collection_agent', 'DOMAIN', ${h.fx.tenantId}::uuid, ${h.fx.domainId}::uuid)`.execute(h.su);
  await inCommitContext(h.app.get<Db>(COMMIT_DB), { sessionId: h.manager.sessionId, contextKey: h.manager.contextKey }, { tenantId: h.fx.tenantId, domainId: h.fx.domainId },
    'observation.agent.register', agentId, async (tx) => {
      await sql`select observation.register_agent(${agentId}::uuid, ${h.fx.tenantId}::uuid, ${h.fx.domainId}::uuid, ${agentPrincipalId}::uuid, 'observation', ${connector.name}, ${connector.version},
        ${connector.codeDigest}, ${h.fx.registrarId}::uuid, ${id}::uuid, ${JSON.stringify({ maxRequestsPerRun: 25, maxBytesPerRun: 33554432, maxConcurrency: 1, timeoutMs: 60000, maxRetries: 0 })}::jsonb,
        ${uuidv7()}::uuid, ${uuidv7()}::uuid)`.execute(tx as never);
    });
  return id;
}
async function upload(filename: string, mediaType: string, bytes: Buffer): Promise<{ run: Row; cases: Row[]; verdicts: Row[] }> {
  const { UploadController } = await import('../../src/observation/sources/upload.controller.js');
  const r = await h.app.get(UploadController).upload(h.req(h.registrar, 'observation.run.trigger', 'RUN', null, 'observation'), h.fx.tenantId, h.fx.domainId,
    { payload: { sourceId, contractVersion: 1, files: [{ filename, mediaType, base64: bytes.toString('base64') }] } }) as unknown as { run: Row };
  const runId = String(r.run['runId']);
  const cases = await rows(sql`select case_id, reason_class, reason, state from observation.quarantine_current where run_id = ${runId}::uuid`);
  const verdicts = await rows(sql`select engine, engine_version, image_digest, signature_databases, engine_config, outcome, findings, detail, record_point, decision, decision_class
                                    from observation.inspection_verdicts where run_id = ${runId}::uuid order by engine`);
  observed.push({ case: filename, run: { state: r.run['state'], admitted: r.run['admitted'], quarantined: r.run['quarantined'] }, quarantine: cases.map((c) => ({ reason_class: c['reason_class'], reason: c['reason'] })), verdicts });
  return { run: r.run, cases, verdicts };
}
const clamav = (v: Row[]) => v.find((x) => x['engine'] === 'clamav')!;

describe.skipIf(skipReason !== null)(`B40 §IN · the REAL ClamAV engine end to end (evaluation engine — the image is not admitted)${skipReason === null ? '' : ` — ${skipReason}`}`, () => {
  beforeAll(async () => { h = await Phase4Harness.boot(); sourceId = await v4Source(); }, 300_000);
  afterAll(async () => {
    const out = process.env['EYE_B40_CLAMAV_EVIDENCE_OUT'];
    if (out !== undefined && out !== '') writeFileSync(out, JSON.stringify({ engine: `${config?.host}:${config?.port}`, version_reported: reportedVersion, observed }, null, 2));
    for (const p of eicarBlobs) rmSync(p, { force: true });   // the harmless detection string removed after use
    await h?.close();
  });

  it('a CLEAN input is ADMITTED; the clamav verdict carries the engine and signature-database identity, the image digest, the database source and update policy', async () => {
    const { run, verdicts } = await upload('regensburg-bearings-delivery-note.pdf', 'application/pdf', fixtureBytes(B40_FILES.cleanPdf));
    expect(run).toMatchObject({ admitted: 1, quarantined: 0 });
    const v = clamav(verdicts);
    expect(v).toMatchObject({ record_point: 'admitted', outcome: 'clean', decision: 'pass', image_digest: config!.imageDigest });
    expect(String(v['engine_version'])).toMatch(/^\d+\.\d+\.\d+/);
    const daily = (v['signature_databases'] as Row[]).find((d) => d['name'] === 'daily')!;
    expect(daily['version']).toMatch(/^\d+$/); expect(daily['buildTime']).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(v['engine_config']).toMatchObject({ database_source: config!.databaseSource, update_policy: config!.updatePolicy, version_reported: reportedVersion });
  }, 180_000);
  it('the EICAR test string (assembled in memory) is DETECTED and QUARANTINED malware_verdict, the signature name as the finding\'s code', async () => {
    const { run, cases, verdicts } = await upload('eicar-probe.txt', 'text/plain', eicarTestBytes());
    expect(run).toMatchObject({ admitted: 0, quarantined: 1 });
    expect(cases[0]).toMatchObject({ reason_class: 'malware_verdict', state: 'open' });
    const v = clamav(verdicts);
    expect(v).toMatchObject({ outcome: 'detected', decision: 'quarantine', decision_class: 'malware_verdict' });
    expect((v['findings'] as Row[])[0]!['code']).toMatch(/^clamav:.*eicar/i);
    const m = await rows(sql`select m.locator from observation.blob_manifests m join observation.quarantine_current q on q.manifest_id = m.manifest_id where q.case_id = ${String(cases[0]!['case_id'])}::uuid`);
    eicarBlobs.push(join(resolve(String(h.app.get<Record<string, unknown>>(EYE_CONFIG)['eye.vault.quarantine_root'])), String(m[0]!['locator'])));
  }, 180_000);
  it('an engine ERROR ANSWER (the engine\'s own UNKNOWN COMMAND to a substituted command) is failed → QUARANTINED inspection_failed', async () => {
    const spy = vi.spyOn(ClamdAdapter.prototype, 'instreamCommand').mockReturnValue(Buffer.from('zINSTREAMX\0', 'latin1'));
    try {
      const { cases, verdicts } = await upload('note-failed.txt', 'text/plain', Buffer.from('a SYNTHETIC note for the engine-error case\n'));
      expect(cases[0]).toMatchObject({ reason_class: 'inspection_failed' });
      expect(clamav(verdicts)).toMatchObject({ outcome: 'failed' });
      expect(String(clamav(verdicts)['detail'])).toMatch(/UNKNOWN COMMAND/);
    } finally { spy.mockRestore(); }
  }, 180_000);
  it('the engine\'s stream-size REFUSAL (a chunk declared past its limit) is incomplete → QUARANTINED inspection_incomplete', async () => {
    const spy = vi.spyOn(ClamdAdapter.prototype, 'frames').mockImplementation(function* () { const b = Buffer.alloc(4); b.writeUInt32BE(0x7ffffff0, 0); yield b; });
    try {
      const { cases, verdicts } = await upload('note-incomplete.txt', 'text/plain', Buffer.from('a SYNTHETIC note for the stream-limit case\n'));
      expect(cases[0]).toMatchObject({ reason_class: 'inspection_incomplete' });
      expect(clamav(verdicts)).toMatchObject({ outcome: 'incomplete' });
    } finally { spy.mockRestore(); }
  }, 180_000);
  it('the engine STOPPED (or unreachable) is unavailable → QUARANTINED inspection_unavailable — never clean', async () => {
    const container = process.env['EYE_CLAMD_CONTAINER'];
    if (container !== undefined && container !== '') execFileSync('docker', ['stop', container], { stdio: 'ignore' });
    else process.env['EYE_CLAMD_ADDR'] = '127.0.0.1:1';   // no container named: an unreachable address stands in for the stopped engine (stated)
    const { cases, verdicts } = await upload('regensburg-bearings-delivery-note.pdf', 'application/pdf', fixtureBytes(B40_FILES.cleanPdf));
    expect(cases[0]).toMatchObject({ reason_class: 'inspection_unavailable' });
    expect(clamav(verdicts)).toMatchObject({ outcome: 'unavailable' });
    observed[observed.length - 1]!['how_stopped'] = container !== undefined && container !== '' ? `docker stop ${container}` : 'EYE_CLAMD_ADDR pointed at 127.0.0.1:1 (no container named)';
  }, 180_000);
});
