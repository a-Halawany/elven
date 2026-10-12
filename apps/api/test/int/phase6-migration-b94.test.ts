/**
 * CP-6 B94 §MG (migration 0114 §MG) — GOVERNED MIGRATION, CUTOVER, DOMAIN ACTIVATION, ROLLBACK AND ACCEPTANCE (AT-67: PR-67-003, PR-67-005,
 * PR-67-006, CAP-DL-06 / CAP-PD-06, JRN-23, UX-66-003..006) on a real database through the real pipeline, ports and controllers.
 *
 * CONSTRUCTION ONLY: every tenant, domain, persona, supplier, figure and approval here is SYNTHETIC fixture data — an approval or acceptance
 * by a fixture persona proves the SOFTWARE; the act on eye_demo DEMONSTRATES it; real customer acceptance (AT-67's signed record, PR-67-006,
 * UX-66-006) is R2 and never claimed. The target domains are DRAFT domains and the programmes are §ON's records, both PLANTED by the
 * superuser here (§ON's ports are another part's); the responsibility matrix is §SA's, planted the same way (phase6-prelude-b94's idiom).
 *
 * AT-67's fixture classes, each named in the titles: POSITIVE (the JRN-23 journey: map → rehearse → reconcile → remediate → rehearse →
 * cut over → reconcile → activate → rollback proof → accept), NEGATIVE, STALE (a digest seen before a change → 409), UNAUTHORIZED ROLE (the
 * lead approving, a lead holding the authority role, an agent at the PEP's human gate, an agent claiming a human at the PORT), CROSS-TENANT,
 * CORRECTION (mapping v2 and a corrected file), REPLAY (the ledger reconstructs the wave), and THE FAULT EXERCISE (a reconciliation failure →
 * held; an owner gap → held, filled → released; execution outside the approved mapping → refused; a post-cutover difference → held and
 * activation refused; a real rollback of an activated domain).
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { sql } from 'kysely';
import { uuidv7 } from 'uuidv7';
import { createHash, generateKeyPairSync } from 'node:crypto';
import { crc32 } from 'node:zlib';
import { mkdtempSync, readFileSync, realpathSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { HttpException } from '@nestjs/common';
import type { Envelope } from '@eye/contracts';
import type { AuthenticatedPrincipal } from '../../src/shared/auth-types.js';
import type { Db } from '../../src/shared/db.js';
import { COMMIT_DB } from '../../src/shared/shared.module.js';
import { asObservationRefusal } from '../../src/observation/observation-errors.js';
import { ObservationCapability } from '../../src/observation/observation.capabilities.js';
import { UploadConnector } from '../../src/observation/connectors/upload.connector.js';
import { SignatureService } from '../../src/executive/signatures/signature.service.js';
import { MigrationController, MigrationTenantController } from '../../src/delivery/migration/migration.controller.js';
import { MigrationService } from '../../src/delivery/migration/migration.service.js';
import { parseLegacy, type MappingSpec } from '../../src/delivery/migration/legacy.js';
import { Phase4Harness, uploadContract } from './phase4-helpers.js';
import { inCommitContext } from './phase1-helpers.js';

// THE SIGNING KEY (the approvals sign) and this file's own vault roots — set before the harness boots.
const PAIR = generateKeyPairSync('ed25519');
process.env['EYE_EXECUTIVE_SIGNING_KEY_DEMO'] = PAIR.privateKey.export({ format: 'der', type: 'pkcs8' }).toString('base64');
const VAULT_DIR = realpathSync(mkdtempSync(join(tmpdir(), 'eye-b94mg-vault-')));
process.env['EYE_VAULT_QUARANTINE_ROOT'] = join(VAULT_DIR, 'quarantine');
process.env['EYE_VAULT_EVIDENCE_ROOT'] = join(VAULT_DIR, 'evidence');
process.env['EYE_VAULT_ARCHIVE_ROOT'] = join(VAULT_DIR, 'archive');
process.env['EYE_VAULT_EXPORT_ROOT'] = join(VAULT_DIR, 'export');

type Row = Record<string, unknown>;
let h: Phase4Harness; let mg: MigrationController; let mgt: MigrationTenantController; let svc: MigrationService;
const T = () => h.fx.tenantId;
const RUN = uuidv7().slice(-6);
const FIXTURES = resolve(__dirname, '../../../../fixtures/phase7');
const LEGACY = readFileSync(join(FIXTURES, 'nordwerk-polska-supplier-risk-legacy.csv'), 'utf8');
const CORRECTED = readFileSync(join(FIXTURES, 'nordwerk-polska-supplier-risk-legacy-corrected.csv'), 'utf8');
const arr = (v: unknown): Row[] => (Array.isArray(v) ? (v as Row[]) : []);
const one = async (q: ReturnType<typeof sql>) => ((await q.execute(h.su)).rows[0] ?? {}) as Row;
const rows = async (q: ReturnType<typeof sql>) => (await q.execute(h.su)).rows as Row[];

// ── refusals ─────────────────────────────────────────────────────────────────────────────────────
const refusal = async (p: Promise<unknown>): Promise<{ status: number | null; code: string | null; message: string }> => {
  const e = await p.then(() => { throw new Error('the call should have been refused'); }, (err: unknown) => err);
  const mapped = e instanceof HttpException ? e : asObservationRefusal(e, 'harness');
  if (mapped === null) return { status: null, code: null, message: e instanceof Error ? e.message : String(e) };
  const r = mapped.getResponse() as { code?: string; message?: string };
  return { status: mapped.getStatus(), code: r.code ?? null, message: String(r.message ?? (e instanceof Error ? e.message : '')) };
};
const refused = async (p: Promise<unknown>, re: RegExp, status: number) => { const r = await refusal(p); expect(r.message).toMatch(re); expect(r.status, r.message).toBe(status); return r; };

// ── envelopes: DOMAIN (the target domain) or TENANT ────────────────────────────────────────────
function envOf(p: AuthenticatedPrincipal, action: string, objectType: string, objectId: string | null, domainId: string | null, tenantId = T(), purpose = 'onboarding'): Envelope {
  return {
    message_id: uuidv7(), scope: domainId === null ? 'TENANT' : 'DOMAIN', tenant_id: tenantId, domain_id: domainId, principal_id: `principal:${p.principalId}`, purpose_id: purpose, action,
    side_effect_class: action.endsWith('.read') ? 'none' : 'reversible', consequence_class: 'C2', object_type: objectType, object_id: objectId, schema_version: 'v1',
    issued_at: new Date().toISOString(), clock_quality: 'trusted', correlation_id: uuidv7(), trace_id: 'b94-mg',
  } as unknown as Envelope;
}
const rq = (p: AuthenticatedPrincipal, action: string, objectType: string, objectId: string | null, domainId: string | null, tenantId = T(), purpose = 'onboarding') =>
  ({ eyeEnvelope: envOf(p, action, objectType, objectId, domainId, tenantId, purpose), eyePrincipal: p }) as never;

// ── personas (SYNTHETIC; TENANT-homed — a TENANT binding needs one) ───────────────────────────────
async function persona(kind: 'human' | 'agent', label: string, tenantRoles: string[], domainRoles: Array<{ role: string; domainId: string }> = [], tenantId = T(),
                        session: { kind?: 'human' | 'agent'; assurance?: 'password' | 'agent_grant' } = {}): Promise<AuthenticatedPrincipal> {
  const id = uuidv7();
  await sql`insert into identity.principals (id, kind, scope, tenant_id, domain_id, display_name, login_name, status)
            values (${id}::uuid, ${kind}, 'TENANT', ${tenantId}::uuid, null, ${`b94mg-${label}-${id.slice(-8)} (SYNTHETIC)`}, ${`b94mg-${label.slice(0, 6)}-${id.slice(-8)}`}, 'active')`.execute(h.su);
  const bindings: AuthenticatedPrincipal['bindings'] = [];
  for (const role of tenantRoles) {
    await sql`insert into identity.role_bindings (id, principal_id, role_code, scope, tenant_id, domain_id) values (${uuidv7()}::uuid, ${id}::uuid, ${role}, 'TENANT', ${tenantId}::uuid, null)`.execute(h.su);
    bindings.push({ roleCode: role, scope: 'TENANT', tenantId, domainId: null });
  }
  for (const b of domainRoles) {
    await sql`insert into identity.role_bindings (id, principal_id, role_code, scope, tenant_id, domain_id) values (${uuidv7()}::uuid, ${id}::uuid, ${b.role}, 'DOMAIN', ${tenantId}::uuid, ${b.domainId}::uuid)`.execute(h.su);
    bindings.push({ roleCode: b.role, scope: 'DOMAIN', tenantId, domainId: b.domainId });
  }
  return h.openSession({ ...h.manager, principalId: id, kind: session.kind ?? kind, assurance: session.assurance ?? (kind === 'human' ? 'password' : 'agent_grant'),
                         homeScope: 'TENANT', homeTenantId: tenantId, homeDomainId: null, bindings } as AuthenticatedPrincipal);
}
let lead: AuthenticatedPrincipal; let authority: AuthenticatedPrincipal; let leadAuthority: AuthenticatedPrincipal; let agentLead: AuthenticatedPrincipal;
let agentAuthority: AuthenticatedPrincipal; let machineAuthority: AuthenticatedPrincipal; let tenantAdmin: AuthenticatedPrincipal; let dataOwner: AuthenticatedPrincipal;
let outsider: AuthenticatedPrincipal; let otherTenant = ''; let otherDomain = '';

// ── a DRAFT target domain with its programme, upload source, matrix and attention policy (all planted / fixture) ──────────
interface Target { domainId: string; programmeId: string; sourceId: string; registrar: AuthenticatedPrincipal; manager: AuthenticatedPrincipal; dadmin: AuthenticatedPrincipal; matchEntity: string }
async function target(label: string): Promise<Target> {
  const domainId = uuidv7(); const programmeId = uuidv7();
  await sql`insert into tenancy.domains (id, tenant_id, name, status) values (${domainId}::uuid, ${T()}::uuid, ${`NORDWERK Polska — Supplier Risk ${label} ${RUN} (SYNTHETIC)`}, 'draft')`.execute(h.su);
  await sql`insert into tenancy.lifecycle_events (id, scope, tenant_id, domain_id, event, actor, details) values (${uuidv7()}::uuid, 'DOMAIN', ${T()}::uuid, ${domainId}::uuid, 'domain.drafted', 'fixture',
            ${JSON.stringify({ planted_by: 'phase6-migration-b94 (the §ON port is another part\'s)' })}::jsonb)`.execute(h.su);
  await sql`insert into onboarding.programmes (programme_id, version, tenant_id, programme_key, title, target_domain_id, owner_principal_id, state, plan, digest, created_by, correlation_id)
            values (${programmeId}::uuid, 1, ${T()}::uuid, ${`polska-onboarding-${label}-${RUN}`}, ${`NORDWERK Polska onboarding ${label} (SYNTHETIC)`}, ${domainId}::uuid, ${lead.principalId}::uuid,
                    'in_progress', '{"planted": true}'::jsonb, ${'a'.repeat(64)}, ${lead.principalId}::uuid, ${uuidv7()}::uuid)`.execute(h.su);
  const registrar = await persona('human', `${label}-registrar`, [], [{ role: 'domain_analyst', domainId }]);
  const manager = await persona('human', `${label}-manager`, [], [{ role: 'collection_manager', domainId }]);
  const dadmin = await persona('human', `${label}-dadmin`, [], [{ role: 'domain_admin', domainId }]);
  // the upload source of the TARGET domain: registered, approved by the other operator, active; its upload agent
  const { ObservationController } = await import('../../src/observation/observation.controller.js');
  const key = `nordwerk-polska-legacy-${label}-${RUN}`;
  const c = uploadContract(key) as Row;
  const contract = { ...c, name: `NORDWERK Polska legacy supplier-risk register ${label} (SYNTHETIC)`, publisher: 'NORDWERK Polska purchasing (synthetic)' };
  const reg = await h.app.get(ObservationController).registerSource(rq(registrar, 'observation.source.register', 'SRC', null, domainId, T(), 'observation') as never, T(), domainId, { payload: { contract } }) as { source: { sourceId: string } };
  const sourceId = reg.source.sourceId;
  for (const [action, act] of [['observation.source.approve', 'approve'], ['observation.source.transition', 'active']] as const) {
    await h.pipeline.write(envOf(manager, action, 'SRC', sourceId, domainId, T(), 'observation'), manager, { scope: 'DOMAIN', tenantId: T(), domainId, action, objectType: 'SRC', objectId: sourceId }, ObservationCapability.registry,
      async (cap) => {
        if (act === 'approve') await cap.approveSource({ sourceId, contractVersion: 1, tenantId: T(), domainId, decision: 'approve', reason: 'B94 §MG fixture: the legacy register', eventId: uuidv7(), correlationId: uuidv7() });
        else await cap.transitionContract({ sourceId, contractVersion: 1, tenantId: T(), domainId, target: 'active', reason: 'B94 §MG fixture: active', eventId: uuidv7(), correlationId: uuidv7() });
        return { result: {}, targetType: 'SRC', targetId: sourceId, targetVersion: '1', outboxEvent: null };
      });
  }
  const connector = new UploadConnector([]); const agentPrincipalId = uuidv7(); const agentId = uuidv7();
  await sql`insert into identity.principals (id, kind, scope, tenant_id, domain_id, display_name, login_name, status)
            values (${agentPrincipalId}::uuid, 'agent', 'DOMAIN', ${T()}::uuid, ${domainId}::uuid, ${`agent:${connector.name}@${connector.version}-${agentId.slice(-8)}`}, null, 'active')`.execute(h.su);
  await sql`insert into identity.role_bindings (id, principal_id, role_code, scope, tenant_id, domain_id) values (${uuidv7()}::uuid, ${agentPrincipalId}::uuid, 'collection_agent', 'DOMAIN', ${T()}::uuid, ${domainId}::uuid)`.execute(h.su);
  await inCommitContext(h.app.get<Db>(COMMIT_DB), { sessionId: manager.sessionId, contextKey: manager.contextKey }, { tenantId: T(), domainId }, 'observation.agent.register', agentId, async (tx) => {
    await sql`select observation.register_agent(${agentId}::uuid, ${T()}::uuid, ${domainId}::uuid, ${agentPrincipalId}::uuid, 'observation', ${connector.name}, ${connector.version}, ${connector.codeDigest},
      ${registrar.principalId}::uuid, ${sourceId}::uuid, ${JSON.stringify({ maxRequestsPerRun: 25, maxBytesPerRun: 33554432, maxConcurrency: 1, timeoutMs: 60000, maxRetries: 0 })}::jsonb, ${uuidv7()}::uuid, ${uuidv7()}::uuid)`.execute(tx as never);
  });
  // the attention policy of the target domain: migration holds and responsibility gaps to its administrator (SYNTHETIC)
  const { ExecutiveController } = await import('../../src/executive/executive.controller.js');
  await h.app.get(ExecutiveController).publishAttentionPolicy(rq(dadmin, 'executive.attention.policy.publish', 'ATP', null, domainId, T(), 'executive') as never, T(), domainId, { payload: {
    reason: 'B94 §MG harness: migration holds and responsibility gaps to the domain administrator',
    rules: { classes: {
      'onboarding.migration': { materiality: { min_consequence: 'C1', min_confidence: 0.5 }, route_roles: ['domain_admin'], ack_within_minutes: 1440, escalate_to_roles: ['domain_admin'], max_escalations: 1, suppression: { allowed: false }, notify: 'in_app' },
      'responsibility.gap': { materiality: { min_consequence: 'C1', min_confidence: 0.5 }, route_roles: ['domain_admin'], ack_within_minutes: 240, escalate_to_roles: ['domain_admin'], max_escalations: 1, suppression: { allowed: false }, notify: 'in_app' },
    }, overload: { max_open_per_role: 50 } } } as never });
  // §SA's approved matrix (planted): data.migration's accountable owner is NAMED (dataOwner) — who does not hold the role yet (unfilled)
  const matrix = uuidv7();
  await sql`insert into service.responsibility_matrices (matrix_id, version, tenant_id, domain_id, state, digest, proposed_by, decided_by, decided_at, signature_id, correlation_id)
            values (${matrix}::uuid, 1, ${T()}::uuid, ${domainId}::uuid, 'approved', ${'c'.repeat(64)}, ${lead.principalId}::uuid, ${authority.principalId}::uuid, clock_timestamp(), ${uuidv7()}::uuid, ${uuidv7()}::uuid)`.execute(h.su);
  await sql`insert into service.responsibility_rows (matrix_id, version, responsibility_key, tenant_id, domain_id, title, owner_role, owner_principal_id, operator_role, customer_authority, access_path, evidence_producer, escalation_path)
            values (${matrix}::uuid, 1, 'data.migration', ${T()}::uuid, ${domainId}::uuid, 'Data migration into the subsidiary domain (SYNTHETIC)', 'onboarding_authority', ${dataOwner.principalId}::uuid,
                    'implementation_lead', 'onboarding_authority', 'the migration workspace', 'the migration ledger', 'the onboarding authority, then the customer sponsor')`.execute(h.su);
  // an organization already in the target domain (the configure step created it): one legacy row matches it
  const matchEntity = uuidv7();
  const name = 'Huta Gliwice Stal Sp. z o.o. (SYNTHETIC)';
  await sql`insert into graph.entities_current (entity_id, scope, tenant_id, domain_id, entity_type, canonical_name, normalized_name, lifecycle_state, created_by, correlation_id)
            values (${matchEntity}::uuid, 'DOMAIN', ${T()}::uuid, ${domainId}::uuid, 'organization', ${name}, onboarding.mg_normal(${name}), 'active', ${lead.principalId}::uuid, ${uuidv7()}::uuid)`.execute(h.su);
  await sql`insert into graph.entity_events (event_id, scope, tenant_id, domain_id, entity_id, event, actor_principal_id, details, correlation_id)
            values (${uuidv7()}::uuid, 'DOMAIN', ${T()}::uuid, ${domainId}::uuid, ${matchEntity}::uuid, 'entity.created', ${lead.principalId}::uuid, '{"fixture": true}'::jsonb, ${uuidv7()}::uuid)`.execute(h.su);
  return { domainId, programmeId, sourceId, registrar, manager, dadmin, matchEntity };
}
async function upload(tg: Target, filename: string, text: string | Buffer, mediaType = 'text/csv'): Promise<{ id: string; bytesDigest: string }> {
  const { UploadController } = await import('../../src/observation/sources/upload.controller.js');
  const bytes = typeof text === 'string' ? Buffer.from(text, 'utf8') : text;
  const res = await h.app.get(UploadController).upload(rq(tg.registrar, 'observation.run.trigger', 'RUN', null, tg.domainId, T(), 'observation') as never, T(), tg.domainId,
    { payload: { sourceId: tg.sourceId, contractVersion: 1, files: [{ filename, mediaType, base64: bytes.toString('base64'), documentTime: null }] } });
  const itemKey = `upload:${filename}@${createHash('sha256').update(bytes).digest('hex').slice(0, 16)}`;
  const r = (await rows(sql`select e.object_id::text id, (e.payload ->> 'content_digest') bytes_digest from objects.canonical_objects e
      join objects.canonical_objects o on o.object_type = 'OBS' and e.source_object_ids @> to_jsonb(array['OBS:' || o.object_id::text])
     where e.object_type = 'EVD' and e.tenant_id = ${T()}::uuid and e.domain_id = ${tg.domainId}::uuid and o.payload ->> 'item_key' = ${itemKey} order by e.recorded_at desc limit 1`))[0];
  if (r === undefined) throw new Error(`upload of ${filename} admitted no evidence: ${JSON.stringify(res).slice(0, 1500)}`);
  return { id: String(r['id']), bytesDigest: String(r['bytes_digest']) };
}

/** A minimal STORED zip (an .xlsx container's shape: one entry) — the workbook a customer might send instead of a CSV export. */
function workbook(): Buffer {
  const name = Buffer.from('[Content_Types].xml'); const data = Buffer.from('<?xml version="1.0"?><Types/>'); const crc = crc32(data);
  const local = Buffer.alloc(30); local.writeUInt32LE(0x04034b50, 0); local.writeUInt16LE(20, 4); local.writeUInt32LE(crc, 14); local.writeUInt32LE(data.length, 18); local.writeUInt32LE(data.length, 22); local.writeUInt16LE(name.length, 26);
  const central = Buffer.alloc(46); central.writeUInt32LE(0x02014b50, 0); central.writeUInt16LE(20, 4); central.writeUInt16LE(20, 6); central.writeUInt32LE(crc, 16); central.writeUInt32LE(data.length, 20); central.writeUInt32LE(data.length, 24);
  central.writeUInt16LE(name.length, 28); central.writeUInt32LE(0, 42);
  const cdOffset = local.length + name.length + data.length; const cdSize = central.length + name.length;
  const eocd = Buffer.alloc(22); eocd.writeUInt32LE(0x06054b50, 0); eocd.writeUInt16LE(1, 8); eocd.writeUInt16LE(1, 10); eocd.writeUInt32LE(cdSize, 12); eocd.writeUInt32LE(cdOffset, 16);
  return Buffer.concat([local, name, data, central, name, eocd]);
}

// ── the mapping versions (the lead's) ────────────────────────────────────────────────────────────
const V1: MappingSpec = { key_column: 'Supplier No', columns: [
  { column: 'Supplier No', field: 'legacy_id', transforms: ['trim', 'upper'], ignore: false },
  { column: 'Supplier Name', field: 'name', transforms: ['trim', 'collapse_spaces'], ignore: false },
  { column: 'Country', field: 'country', transforms: ['iso_country'], ignore: false },
  { column: 'Risk Rating', field: 'risk_rating', transforms: ['rating_scale'], ignore: false },
  { column: 'Category', field: 'risk_category', transforms: ['trim', 'lower', 'null_if_blank'], ignore: false },
  { column: 'Annual Spend (EUR)', field: 'annual_spend_eur', transforms: ['null_if_blank', 'decimal'], ignore: false },
  { column: 'Last Review', field: 'last_review_on', transforms: ['null_if_blank', 'date_iso'], ignore: false },
] };
const V2: MappingSpec = { ...V1, columns: [...V1.columns, { column: 'Buyer Note', field: null, transforms: [], ignore: true }] };

// ── the route calls (in process) ─────────────────────────────────────────────────────────────────
const W = (tg: Target) => tg.domainId;
const open = (as: AuthenticatedPrincipal, tg: Target, key: string, over: Row = {}) => mg.open(rq(as, 'onboarding.wave.open', 'migration_wave', null, W(tg)), T(), W(tg),
  { payload: { programmeId: tg.programmeId, key, title: `Supplier-risk register ${key} (SYNTHETIC)`, sourceId: tg.sourceId, identifierSystem: `nwp-legacy-supplier-${RUN}`,
               identifierAuthority: 'NORDWERK Polska purchasing register (SYNTHETIC)', ...over } }) as Promise<{ wave: Row }>;
const detail = (as: AuthenticatedPrincipal, tg: Target, wave: string) => mg.read(rq(as, 'onboarding.read', 'migration_wave', wave, W(tg)), T(), W(tg), wave) as unknown as Promise<Row & { wave: Row; mappings: Row[]; rehearsals: Row[]; staging: Record<string, Row[]>; cutovers: Row[]; current_cutover: Row | null; cutover_detail: Row | null; items: Row[]; ledger: Row[]; replay: Row; viewer: Row; owner: Row; domain: Row; evidences: Row[] }>;
const propose = (as: AuthenticatedPrincipal, tg: Target, wave: string, spec: MappingSpec, basis = 'manual') => mg.propose(rq(as, 'onboarding.mapping.propose', 'migration_wave', wave, W(tg)), T(), W(tg), wave,
  { payload: { spec, basis, rationale: 'the legacy register columns mapped to the canonical supplier fields (SYNTHETIC)' } }) as Promise<{ mapping: Row }>;
const decide = (as: AuthenticatedPrincipal, tg: Target, wave: string, version: number, digest: string, decision = 'approve') => mg.decide(rq(as, 'onboarding.mapping.approve', 'migration_wave', wave, W(tg)), T(), W(tg), wave, String(version),
  { payload: { digest, decision, reason: `the mapping v${version} reviewed column by column against the register (SYNTHETIC)` } }) as Promise<{ mapping: Row }>;
const rehearse = (as: AuthenticatedPrincipal, tg: Target, wave: string, evidenceId: string, mappingVersion: number | null = null) => mg.rehearse(rq(as, 'onboarding.rehearsal.run', 'migration_wave', wave, W(tg)), T(), W(tg), wave,
  { payload: { evidenceId, mappingVersion } }) as Promise<{ rehearsal: Row }>;
const request = (as: AuthenticatedPrincipal, tg: Target, wave: string, rehearsalId: string) => mg.request(rq(as, 'onboarding.cutover.request', 'cutover', null, W(tg)), T(), W(tg), wave, { payload: { rehearsalId } }) as Promise<{ cutover: Row; held: boolean; blocking: Row[] }>;
const recheck = (as: AuthenticatedPrincipal, tg: Target, cutover: string) => mg.recheck(rq(as, 'onboarding.cutover.recheck', 'cutover', cutover, W(tg)), T(), W(tg), cutover) as Promise<{ cutover: Row; held: boolean; blocking: Row[] }>;
const approve = (as: AuthenticatedPrincipal, tg: Target, cutover: string, digest: string) => mg.approve(rq(as, 'onboarding.cutover.approve', 'cutover', cutover, W(tg)), T(), W(tg), cutover,
  { payload: { digest, reason: 'the rehearsal reconciles; the data transfer is approved (SYNTHETIC)' } }) as unknown as Promise<{ held: boolean; cutover: Row }>;
const execute = (as: AuthenticatedPrincipal, tg: Target, cutover: string) => mg.execute(rq(as, 'onboarding.cutover.execute', 'cutover', cutover, W(tg)), T(), W(tg), cutover) as Promise<{ cutover: Row; failures: Row[] }>;
const reconcile = (as: AuthenticatedPrincipal, tg: Target, cutover: string) => mg.reconcile(rq(as, 'onboarding.cutover.reconcile', 'cutover', cutover, W(tg)), T(), W(tg), cutover) as Promise<{ reconciliation: Row; held: boolean }>;
const activate = (as: AuthenticatedPrincipal, tg: Target, cutover: string) => mgt.activate(rq(as, 'tenancy.domain.activate', 'domain', tg.domainId, null), T(), tg.domainId, { payload: { cutoverId: cutover } }) as Promise<{ activation: Row }>;
const rehearseRollback = (as: AuthenticatedPrincipal, tg: Target, cutover: string) => mg.rehearseRollback(rq(as, 'onboarding.rollback.rehearse', 'cutover', cutover, W(tg)), T(), W(tg), cutover) as Promise<{ rollback: Row }>;
const executeRollback = (as: AuthenticatedPrincipal, tg: Target, cutover: string, rehearsalId: string, digest: string) => mg.executeRollback(rq(as, 'onboarding.rollback.execute', 'cutover', cutover, W(tg)), T(), W(tg), cutover,
  { payload: { rehearsalId, digest, reason: 'the migrated records are withdrawn by plan (SYNTHETIC fault exercise)' } }) as Promise<{ rollback: Row }>;
const JOURNEYS = ['JRN-23']; const ROLES = ['implementation_lead', 'onboarding_authority', 'tenant_admin'];
const candidate = (as: AuthenticatedPrincipal, tg: Target, wave: string, journeys = JOURNEYS) => mg.candidate(rq(as, 'onboarding.read', 'migration_wave', wave, W(tg)), T(), W(tg), wave,
  { payload: { journeys, roles: ROLES } }) as Promise<{ candidate: Row; digest: string; claim: string }>;
const accept = (as: AuthenticatedPrincipal, tg: Target, wave: string, digest: string, decision = 'accept', journeys = JOURNEYS) => mg.accept(rq(as, 'onboarding.acceptance.decide', 'migration_wave', wave, W(tg)), T(), W(tg), wave,
  { payload: { decision, journeys, roles: ROLES, digest, reason: `the migration ${decision === 'accept' ? 'is accepted' : 'is withheld'} by the customer authority (SYNTHETIC persona — a demonstration)` } }) as Promise<{ acceptance: Row }>;
const items = async (subject: string, cls?: string) => rows(sql`select signal_class, state, title from executive.attention_items where subject_id = ${subject}::uuid ${cls === undefined ? sql`` : sql`and signal_class = ${cls}`} order by created_at`);

let A: Target; let B: Target;
let evA: { id: string; bytesDigest: string }; let evAc: { id: string; bytesDigest: string }; let evB: { id: string; bytesDigest: string };

beforeAll(async () => {
  h = await Phase4Harness.boot();
  mg = h.app.get(MigrationController); mgt = h.app.get(MigrationTenantController); svc = h.app.get(MigrationService);
  lead = await persona('human', 'lead', ['implementation_lead']);
  authority = await persona('human', 'authority', ['onboarding_authority']);
  leadAuthority = await persona('human', 'lead-auth', ['implementation_lead', 'onboarding_authority']);
  agentLead = await persona('agent', 'agent-lead', ['implementation_lead']);
  agentAuthority = await persona('agent', 'agent-auth', ['onboarding_authority']);
  machineAuthority = await persona('agent', 'machine-auth', ['onboarding_authority'], [], T(), { kind: 'human', assurance: 'password' });   // an AGENT whose session claims a human
  tenantAdmin = await persona('human', 'tadmin', ['tenant_admin']);
  dataOwner = await persona('human', 'data-owner', []);
  // another tenant: its domain and its own implementation lead (the cross-tenant probes)
  otherTenant = uuidv7(); otherDomain = uuidv7();
  await sql`insert into tenancy.tenants (id, name, status, residency_profile, retention_profile, activated_at) values (${otherTenant}::uuid, ${`b94mg-other-${RUN}`}, 'active', 'EU', 'default', clock_timestamp())`.execute(h.su);
  await sql`insert into tenancy.domains (id, tenant_id, name, status) values (${otherDomain}::uuid, ${otherTenant}::uuid, ${`b94mg-other-domain-${RUN}`}, 'draft')`.execute(h.su);
  outsider = await persona('human', 'outsider', ['implementation_lead', 'onboarding_authority', 'tenant_admin'], [], otherTenant);
  A = await target('a'); B = await target('b');
  evA = await upload(A, `nordwerk-polska-legacy-${RUN}.csv`, LEGACY);
  evAc = await upload(A, `nordwerk-polska-legacy-corrected-${RUN}.csv`, CORRECTED);
  evB = await upload(B, `nordwerk-polska-legacy-b-${RUN}.csv`, CORRECTED);
}, 600_000);
afterAll(async () => { await h?.close(); });

// ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
describe('AT-67 · the JRN-23 journey on wave A (SYNTHETIC): open → map → rehearse → reconcile → remediate → cut over → activate → accept', () => {
  let wave = ''; let v1 = ''; let v2 = ''; let r1: Row = {}; let r2: Row = {}; let cut = ''; let cutDigest = '';

  it('positive · the lead opens a wave into the programme\'s DRAFT target domain from its upload source', async () => {
    const w = (await open(lead, A, `polska-suppliers-${RUN}`)).wave;
    wave = String(w['wave_id']);
    expect(w).toMatchObject({ state: 'planned', held: false, domain_id: A.domainId, programme_id: A.programmeId, source_id: A.sourceId });
  });
  it('negative · a wave into an ACTIVE domain (not the programme\'s target), a duplicate key, an unknown programme, a non-upload source — refused', async () => {
    await refused(mg.open(rq(lead, 'onboarding.wave.open', 'migration_wave', null, h.fx.domainId), T(), h.fx.domainId, { payload: { programmeId: A.programmeId, key: `x-${RUN}`, title: 'Wrong domain (SYNTHETIC)',
      sourceId: A.sourceId, identifierSystem: 'nwp-x', identifierAuthority: 'register' } }), /^migration wave rejected \(target\)/, 422);
    await refused(open(lead, A, `polska-suppliers-${RUN}`), /^migration wave rejected \(duplicate\)/, 409);
    await refused(open(lead, A, `p-${RUN}`, { programmeId: uuidv7() }), /^migration wave rejected \(unknown_programme\)/, 404);
    await refused(open(lead, A, `q-${RUN}`, { sourceId: uuidv7() }), /^migration wave rejected \(unknown_source\)/, 404);
  });
  it('unauthorized role · the onboarding authority does not open waves (the PDP: no qualifying role)', async () => {
    await refused(open(authority, A, `auth-${RUN}`), /no qualifying role binding/, 403);
  });
  it('UX-66-004 · automation SUGGESTS a mapping from the evidence header — every column suggested, none approved; the note column has no confident field', async () => {
    const s = await mg.suggest(rq(lead, 'onboarding.read', 'migration_wave', wave, W(A)), T(), W(A), wave, { payload: { evidenceId: evA.id } }) as { suggestions: Row[]; columns: string[] };
    expect(s.columns).toEqual(['Supplier No', 'Supplier Name', 'Country', 'Risk Rating', 'Category', 'Annual Spend (EUR)', 'Last Review', 'Buyer Note']);
    expect(s.suggestions.every((x) => x['suggested'] === true && x['approved'] === false)).toBe(true);
    expect(s.suggestions.map((x) => x['field'])).toEqual(['legacy_id', 'name', 'country', 'risk_rating', 'risk_category', 'annual_spend_eur', 'last_review_on', null]);
  });
  it('negative · a mapping outside the closed lists (an unknown transform, an unknown field, no key) is refused before any port', async () => {
    await refused(propose(lead, A, wave, { ...V1, columns: V1.columns.map((c, i) => (i === 2 ? { ...c, transforms: ['geocode' as never] } : c)) }), /^migration mapping rejected \(spec\): geocode is not a transform of the closed list/, 422);
    await refused(propose(lead, A, wave, { ...V1, columns: V1.columns.map((c, i) => (i === 3 ? { ...c, field: 'credit_score' as never } : c)) }), /credit_score is not a canonical field/, 422);
    await refused(propose(lead, A, wave, { ...V1, key_column: 'Country' }), /key_column is the column mapped to legacy_id/, 422);
  });
  it('positive · the lead PROPOSES mapping v1 (adopting the suggestions, the note column left out)', async () => {
    const m = (await propose(lead, A, wave, V1, 'adopted_suggestions')).mapping;
    expect(m).toMatchObject({ version: 1, state: 'proposed', basis: 'adopted_suggestions', proposed_by_kind: 'human' });
    v1 = String(m['digest']);
  });
  it('unauthorized role · the lead (PDP), a lead holding the authority role (separation_of_duties), an agent (the PEP\'s human gate), an agent claiming a human (the PORT: actor) never approve', async () => {
    await refused(decide(lead, A, wave, 1, v1), /no qualifying role binding/, 403);
    await refused(decide(leadAuthority, A, wave, 1, v1), /^migration mapping rejected \(separation_of_duties\): an implementation lead never approves/, 403);
    const g = await refusal(decide(agentAuthority, A, wave, 1, v1));
    expect(g.status).toBe(403); expect(g.code).toBe('EYE-WFL-002'); expect(g.message).toMatch(/human gate/);
    await refused(decide(machineAuthority, A, wave, 1, v1), /^migration mapping rejected \(actor\): approving a migration mapping is a named human's act/, 403);
  });
  it('stale · a digest that is not v1\'s is refused 409', async () => {
    await refused(decide(authority, A, wave, 1, 'f'.repeat(64)), /^migration mapping rejected \(stale\)/, 409);
  });
  it('positive · the onboarding authority APPROVES v1 on its digest — signed (kind mapping, verifiable)', async () => {
    const m = (await decide(authority, A, wave, 1, v1)).mapping;
    expect(m).toMatchObject({ state: 'approved', decided_by: authority.principalId });
    const sig = await one(sql`select subject_digest, key_id, signature, signer from executive.signatures where signature_id = ${String(m['signature_id'])}::uuid`);
    expect(sig).toMatchObject({ subject_digest: v1, signer: authority.principalId });
    expect(new SignatureService().verify(sig as never)).toBe(true);
  });
  it('negative · CSV ONLY — an xlsx workbook collected as evidence is refused by the rehearsal with the residual (no spreadsheet parser in B94)', async () => {
    const x = await upload(A, `nordwerk-polska-legacy-${RUN}.xlsx`, workbook(), 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    await refused(rehearse(lead, A, wave, x.id, 1), /^migration rehearsal rejected \(format\): the legacy file is an xlsx workbook: B94 migrates CSV only .*residual: xlsx intake/, 422);
    await refused(rehearse(lead, A, wave, uuidv7(), 1), /^migration rehearsal rejected \(unknown_evidence\)/, 404);
  });
  it('positive · REHEARSAL 1 (the legacy file, mapping v1): the reconciliation report — 48 rows: 43 would_create, 1 would_match, 2 rejected (missing key, formula cell), 2 ambiguous (one duplicate supplier), 1 unmapped column', async () => {
    r1 = (await rehearse(lead, A, wave, evA.id, 1)).rehearsal;
    expect(r1['counts']).toMatchObject({ rows: 48, mapped: 44, would_create: 43, would_match: 1, rejected: 2, rejected_missing_key: 1, rejected_formula_cell: 1, ambiguous: 2, conflict: 0, unmapped_columns: 1 });
    expect(r1['unmapped_columns']).toEqual(['Buyer Note']);
    expect(r1['blocking']).toBe(5);
    expect(Number((r1['counts'] as Row)['formula_cells_recorded'])).toBeGreaterThanOrEqual(1);
    const st = await rows(sql`select row_no, legacy_id, disposition, reasons, formula_cells, match_entity_id::text m from onboarding.migration_staging where rehearsal_id = ${String(r1['rehearsal_id'])}::uuid order by row_no`);
    const formula = st.find((x) => (x['reasons'] as string[]).some((r) => r.startsWith('formula_cell')));
    expect(formula).toMatchObject({ disposition: 'rejected' }); expect((formula?.['formula_cells'] as string[]).length).toBe(1);
    expect(st.filter((x) => x['disposition'] === 'ambiguous').map((x) => x['legacy_id'])).toEqual(['NWP-S-0700', 'NWP-S-0700']);
    expect(st.find((x) => x['disposition'] === 'would_match')).toMatchObject({ legacy_id: 'NWP-S-0500', m: A.matchEntity });
  });
  it('fault · a reconciliation failure HOLDS the wave (the blocking list) and raises an onboarding.migration item routed to the domain admin', async () => {
    const d = await detail(lead, A, wave);
    expect(d.wave).toMatchObject({ state: 'rehearsing', held: true });
    expect(arr(d.wave['held_reasons'])[0]).toMatchObject({ kind: 'reconciliation', blocking: 5 });
    expect(await items(wave, 'onboarding.migration')).toEqual([expect.objectContaining({ state: 'open' })]);
  });
  it('determinism · the same evidence + mapping + target state → the same input and plan digests (rehearsal 2)', async () => {
    const again = (await rehearse(lead, A, wave, evA.id, 1)).rehearsal;
    expect(again['seq']).toBe(Number(r1['seq']) + 1);
    expect(again['input_digest']).toBe(r1['input_digest']); expect(again['plan_digest']).toBe(r1['plan_digest']);
  });
  it('fault · a cutover requested on a failing rehearsal is HELD: the owner of data.migration is unfilled (never inferred) and the reconciliation blocks — both items raised', async () => {
    const latest = (await detail(lead, A, wave)).rehearsals.find((r) => r['kind'] === 'rehearsal') as Row;
    const c = await request(lead, A, wave, String(latest['rehearsal_id']));
    expect(c.held).toBe(true);
    expect(c.blocking.map((b) => b['kind'])).toEqual(['owner_gap', 'reconciliation']);
    expect(c.blocking[0]).toMatchObject({ state: 'unfilled', responsibility: 'data.migration', escalation_path: 'the onboarding authority, then the customer sponsor' });
    const id = String(c.cutover['cutover_id']);
    expect((await items(id)).map((i) => i['signal_class']).sort()).toEqual(['onboarding.migration', 'responsibility.gap']);
    // the authority's approval is refused 409 held — and the hold is recorded (the ledger says so)
    const r = await refused(approve(authority, A, id, String(c.cutover['plan_digest'])), /^migration cutover rejected \(held\): the cutover is held — owner_gap/, 409);
    expect(r.code).toBe('EYE-STA-002');
    expect((await rows(sql`select event from onboarding.events where subject_id = ${id}::uuid order by occurred_at`)).map((e) => e['event'])).toEqual(['cutover.held', 'cutover.held']);
  });
  it('correction · mapping v2 (the note column declared IGNORED) proposed; rehearsal on the CORRECTED file under the PROPOSED v2 is clean — yet a cutover on it is held: the mapping is not the approved one', async () => {
    const m = (await propose(lead, A, wave, V2)).mapping;
    expect(m).toMatchObject({ version: 2, state: 'proposed' }); v2 = String(m['digest']);
    r2 = (await rehearse(lead, A, wave, evAc.id, 2)).rehearsal;
    expect(r2['counts']).toMatchObject({ rows: 48, mapped: 48, would_create: 47, would_match: 1, rejected: 0, ambiguous: 0, conflict: 0, unmapped_columns: 0 });
    expect(r2['blocking']).toBe(0); expect(r2['mapping_state']).toBe('proposed');
    const d = await detail(lead, A, wave);
    expect(d.wave).toMatchObject({ state: 'rehearsing', held: false });   // the reconciliation hold released; the earlier requested cutover superseded
    expect(d.cutovers.every((c) => c['state'] === 'superseded')).toBe(true);
    expect((await items(wave, 'onboarding.migration')).every((i) => i['state'] === 'open')).toBe(true);    // the wave item closes only on a clean run against the APPROVED mapping
    const c = await request(lead, A, wave, String(r2['rehearsal_id']));
    expect(c.blocking.map((b) => b['kind'])).toEqual(['owner_gap', 'mapping_not_approved']);
  });
  it('stale · v2 approved on v1\'s digest → 409; on its own digest → approved (v1 superseded); the mapping hold released on recheck, the owner gap stands', async () => {
    await refused(decide(authority, A, wave, 2, v1), /^migration mapping rejected \(stale\)/, 409);
    await decide(authority, A, wave, 2, v2);
    const states = (await detail(lead, A, wave)).mappings.map((m) => `${String(m['version'])}:${String(m['state'])}`);
    expect(states).toEqual(['2:approved', '1:superseded']);
    const cur = (await detail(lead, A, wave)).current_cutover as Row;
    const rc = await recheck(lead, A, String(cur['cutover_id']));
    expect(rc.blocking.map((b) => b['kind'])).toEqual(['owner_gap']);
  });
  it('positive · rehearsal 3 against the APPROVED v2 is clean: the wave RECONCILED, its item closed; the requested cutover superseded', async () => {
    r2 = (await rehearse(lead, A, wave, evAc.id)).rehearsal;
    expect(r2).toMatchObject({ mapping_version: 2, mapping_state: 'approved', blocking: 0 });
    const d = await detail(lead, A, wave);
    expect(d.wave).toMatchObject({ state: 'reconciled', held: false });
    expect((await items(wave, 'onboarding.migration')).every((i) => i['state'] === 'closed')).toBe(true);
  });
  it('fault → recovery · the owner gap holds the cutover; the named owner is bound → RELEASED on recheck (the responsibility.gap item closed)', async () => {
    const c = await request(lead, A, wave, String(r2['rehearsal_id']));
    cut = String(c.cutover['cutover_id']); cutDigest = String(c.cutover['plan_digest']);
    expect(c.blocking.map((b) => b['kind'])).toEqual(['owner_gap']);
    expect(cutDigest).toBe(r2['plan_digest']);
    await sql`insert into identity.role_bindings (id, principal_id, role_code, scope, tenant_id, domain_id) values (${uuidv7()}::uuid, ${dataOwner.principalId}::uuid, 'onboarding_authority', 'TENANT', ${T()}::uuid, null)`.execute(h.su);
    const rc = await recheck(authority, A, cut);
    expect(rc.held).toBe(false); expect(rc.blocking).toEqual([]);
    expect((await items(cut)).map((i) => `${String(i['signal_class'])}:${String(i['state'])}`).sort()).toEqual(['onboarding.migration:closed', 'responsibility.gap:closed']);
    expect((await detail(authority, A, wave)).owner).toMatchObject({ state: 'resolved', owner_principal_id: dataOwner.principalId });
  });
  it('unauthorized role / stale · the lead (PDP), the agent (human gate), a stale digest — refused; the authority APPROVES the cutover on the rehearsal digest (signed)', async () => {
    await refused(approve(lead, A, cut, cutDigest), /no qualifying role binding/, 403);
    expect((await refusal(approve(agentAuthority, A, cut, cutDigest))).code).toBe('EYE-WFL-002');
    await refused(approve(authority, A, cut, String(r1['plan_digest'])), /^migration cutover rejected \(stale\)/, 409);
    const out = await approve(authority, A, cut, cutDigest);
    expect(out.held).toBe(false);
    expect(out.cutover).toMatchObject({ state: 'approved', approved_by: authority.principalId });
    const sig = await one(sql`select subject_kind, subject_digest, key_id, signature from executive.signatures where signature_id = ${String(out.cutover['signature_id'])}::uuid`);
    expect(sig).toMatchObject({ subject_kind: 'cutover', subject_digest: cutDigest });
    expect(new SignatureService().verify(sig as never)).toBe(true);
    expect((await detail(lead, A, wave)).wave['state']).toBe('cutover_approved');
  });
  it('fault · EXECUTION OUTSIDE THE APPROVED MAPPING is refused (contract_changed): a field the mapping does not map, an extra column, a row the plan does not migrate — nothing written', async () => {
    const parsed = parseLegacy(Buffer.from(CORRECTED, 'utf8'), V2);
    const env = () => envOf(agentLead, 'onboarding.cutover.execute', 'cutover', cut, W(A));
    const forged = parsed.rows.map((r, i) => (i === 3 ? { ...r, values: { ...r.values, tax_id: 'PL1234567890' } } : r));
    await refused(svc.executeParsed(env(), agentLead, T(), W(A), cut, evAc.bytesDigest, { columns: parsed.columns, rows: forged }), /^migration cutover rejected \(contract_changed\): row \d+ carries field tax_id/, 422);
    await refused(svc.executeParsed(env(), agentLead, T(), W(A), cut, evAc.bytesDigest, { columns: [...parsed.columns, 'Tax Id'], rows: parsed.rows }), /^migration cutover rejected \(contract_changed\): columns outside the approved mapping/, 422);
    await refused(svc.executeParsed(env(), agentLead, T(), W(A), cut, evAc.bytesDigest, { columns: parsed.columns, rows: parsed.rows.slice(1) }), /^migration cutover rejected \(contract_changed\): the rows read now are not the rows/, 422);
    await refused(svc.executeParsed(env(), agentLead, T(), W(A), cut, evAc.bytesDigest, parsed, [999]), /^migration cutover rejected \(contract_changed\): row 999 is not a row the approved plan migrates/, 422);
    expect((await one(sql`select count(*)::int n from onboarding.migration_executed_rows where cutover_id = ${cut}::uuid`))['n']).toBe(0);
    expect((await one(sql`select state from onboarding.migration_cutovers where cutover_id = ${cut}::uuid`))['state']).toBe('approved');
  });
  it('positive · AUTOMATION EXECUTES INSIDE THE APPROVED PLAN (an agent holding the lead\'s role): 47 entities created, 1 matched — the risk rating rides as PROVENANCE', async () => {
    const out = await execute(agentLead, A, cut);
    expect(out.failures).toEqual([]);
    expect(out.cutover).toMatchObject({ state: 'executed', executed_by: agentLead.principalId, executed_by_kind: 'agent', execution: { rows: 48, created: 47, matched: 1, failed: 0 } });
    const ids = await one(sql`select count(*)::int n, count(distinct entity_id)::int e from graph.entity_identifiers where domain_id = ${A.domainId}::uuid and system_key = ${`nwp-legacy-supplier-${RUN}`}`);
    expect(ids).toMatchObject({ n: 48, e: 48 });
    const matched = await one(sql`select entity_id::text e from graph.entity_identifiers where domain_id = ${A.domainId}::uuid and identifier_value = 'NWP-S-0500'`);
    expect(matched['e']).toBe(A.matchEntity);
    const prov = await one(sql`select details -> 'migration' m from graph.entity_events where domain_id = ${A.domainId}::uuid and event = 'entity.identified' and details ->> 'value' = 'NWP-S-1004'`);
    expect(prov['m']).toMatchObject({ cutover_id: cut, legacy_id: 'NWP-S-1004', values: { risk_rating: 'critical', country: 'DE' }, synthetic: true });
    expect((await one(sql`select count(*)::int n from prediction.exposure_current where domain_id = ${A.domainId}::uuid`))['n']).toBe(0);   // never an exposure by the migration
    await refused(execute(agentLead, A, cut), /^migration cutover rejected \(state\): the cutover is executed, not approved/, 409);
  });
  it('negative · activation before the post-cutover reconciliation is refused (the domain stays draft); not by the lead (the tenancy authority\'s act)', async () => {
    await refused(activate(tenantAdmin, A, cut), /^migration cutover rejected \(held\): the post-cutover reconciliation does not equal/, 409);
    await refused(activate(lead, A, cut), /no qualifying role binding/, 403);
    expect((await one(sql`select status from tenancy.domains where id = ${A.domainId}::uuid`))['status']).toBe('draft');
  });
  it('positive · the POST-CUTOVER RECONCILIATION equals the approved rehearsal → verified; the tenant admin ACTIVATES the domain (lifecycle domain.activated)', async () => {
    const r = await reconcile(lead, A, cut);
    expect(r.held).toBe(false);
    expect(r.reconciliation).toMatchObject({ kind: 'post_cutover', equal: true, compared_to: r2['rehearsal_id'], counts: { expected: 48, observed: 48, failed: 0, unexpected: 0 } });
    const a = (await activate(tenantAdmin, A, cut)).activation;
    expect(a).toMatchObject({ status: 'active', cutover_id: cut });
    const dom = (await detail(lead, A, wave)).domain as Row;
    expect(dom['status']).toBe('active');
    expect(arr(dom['events']).map((e) => e['event'])).toEqual(['domain.drafted', 'domain.activated']);
    await refused(activate(tenantAdmin, A, cut), /^migration cutover rejected \(state\): domain .* is active, not draft/, 409);
  });
  it('JRN-23 rollback proof · the lead REHEARSES the rollback (the plan and its digest recorded — nothing retired)', async () => {
    const b = (await rehearseRollback(lead, A, cut)).rollback;
    expect(b).toMatchObject({ kind: 'rehearsal' });
    expect(arr((b['plan'] as Row)['retire'])).toHaveLength(47); expect(arr((b['plan'] as Row)['keep_identifiers'])).toHaveLength(1);
    expect((b['plan'] as Row)['domain']).toMatchObject({ status: 'active', revert_to: 'draft' });
    expect((await one(sql`select count(*)::int n from graph.entities_current where domain_id = ${A.domainId}::uuid and lifecycle_state = 'active'`))['n']).toBe(48);
  });
  it('WS-20 · the authority WITHHOLDS acceptance first: recorded, the domain stays active and the wave activated (prior safe operation preserved)', async () => {
    const c = await candidate(authority, A, wave);
    const w = (await accept(authority, A, wave, c.digest, 'withhold')).acceptance;
    expect(w).toMatchObject({ decision: 'withheld', claim: 'demonstration', signature_id: null });
    expect((await detail(lead, A, wave)).wave['state']).toBe('activated');
  });
  it('unauthorized role / stale · the lead, an agent, a digest of other journeys — refused', async () => {
    const c = await candidate(authority, A, wave);
    await refused(accept(lead, A, wave, c.digest), /no qualifying role binding/, 403);
    expect((await refusal(accept(agentAuthority, A, wave, c.digest))).code).toBe('EYE-WFL-002');
    await refused(accept(authority, A, wave, c.digest, 'accept', ['JRN-23', 'JRN-01']), /^onboarding acceptance rejected \(stale\)/, 409);
  });
  it('PR-67-006 · the authority ACCEPTS on the candidate digest: the exact versions and digests bound, signed, claim `demonstration`; the programme\'s next version accepted', async () => {
    const c = await candidate(authority, A, wave);
    expect(c.claim).toBe('demonstration');
    expect(c.candidate).toMatchObject({ mapping: { version: 2, digest: v2 }, licence: { state: 'uncontracted' }, journeys: ['JRN-23'], roles: ROLES, deployment_profile: 'local-dev',
      post_cutover: { equal: true }, cutover: { cutover_id: cut, plan_digest: cutDigest, state: 'activated' }, claim: 'demonstration', capability_version: 'B94 §MG (migration 0114)' });
    expect(arr(c.candidate['rehearsals']).map((r) => r['seq'])).toEqual([1, 2, 3, 4]);
    const a = (await accept(authority, A, wave, c.digest)).acceptance;
    expect(a).toMatchObject({ decision: 'accepted', claim: 'demonstration', digest: c.digest });
    const sig = await one(sql`select subject_kind, subject_digest, key_id, signature from executive.signatures where signature_id = ${String(a['signature_id'])}::uuid`);
    expect(sig['subject_kind']).toBe('acceptance'); expect(new SignatureService().verify(sig as never)).toBe(true);
    const p = await rows(sql`select version, state, superseded_at is null cur from onboarding.programmes where programme_id = ${A.programmeId}::uuid order by version`);
    expect(p).toEqual([{ version: 1, state: 'in_progress', cur: false }, { version: 2, state: 'accepted', cur: true }]);
    expect(await one(sql`select claim from onboarding.migration_acceptances where acceptance_id = ${String(a['acceptance_id'])}::uuid`)).toEqual({ claim: 'demonstration' });
    // `customer` is never written by this product: the record is append-only and its claim is `demonstration` by constraint
    expect((await refusal(sql`update onboarding.migration_acceptances set claim = 'customer' where acceptance_id = ${String(a['acceptance_id'])}::uuid`.execute(h.su))).message).toMatch(/append-only|append only/i);
    expect(await sql`insert into onboarding.migration_acceptances (acceptance_id, tenant_id, domain_id, wave_id, programme_id, decision, claim, bound, digest, reason, decided_by, correlation_id)
      values (${uuidv7()}::uuid, ${T()}::uuid, ${A.domainId}::uuid, ${wave}::uuid, ${A.programmeId}::uuid, 'withheld', 'customer', '{}'::jsonb, ${'d'.repeat(64)}, 'a customer claim is never recorded', ${authority.principalId}::uuid, ${uuidv7()}::uuid)`
      .execute(h.su).then(() => 'no error', (e: unknown) => (e instanceof Error ? e.message : String(e)))).toMatch(/migration_acceptances_claim_check|claim/);
  });
  it('replay · the ledger alone reconstructs the wave: its state, the approved mapping, the cutover states, the activation and the acceptance', async () => {
    const l = await mg.ledger(rq(authority, 'onboarding.read', 'migration_wave', wave, W(A)), T(), W(A), wave) as unknown as { wave_state: string; replay: Row; events: Row[] };
    expect(l.replay).toMatchObject({ wave_state: 'accepted', wave_held: false, approved_mapping: 2, domain_activated: true, acceptance: 'accepted' });
    expect(l.replay['wave_state']).toBe(l.wave_state);
    expect((l.replay['cutovers'] as Record<string, Row>)[cut]).toEqual({ state: 'activated', held: false });
    expect(Object.values(l.replay['cutovers'] as Record<string, Row>).filter((c) => c['state'] === 'superseded')).toHaveLength(2);
    expect((l.replay['mappings'] as Row)).toEqual({ 1: 'superseded', 2: 'approved' });
    expect(arr(l.replay['rehearsals']).map((r) => r['reconciled'])).toEqual([false, false, true, true]);
    expect(l.events.map((e) => e['event'])).toEqual(expect.arrayContaining(['wave.opened', 'mapping.proposed', 'mapping.approved', 'reconciliation.failed', 'rehearsal.reconciled', 'cutover.held',
      'cutover.released', 'cutover.approved', 'cutover.executed', 'cutover.reconciled', 'domain.activated', 'rollback.rehearsed', 'acceptance.withheld', 'acceptance.recorded']));
  });
  it('UX-66-004/-005 · the workspace read renders eligibility, the exact digests and the blocking state; the ledger and staging are append-only', async () => {
    const asLead = await detail(lead, A, wave);
    expect(asLead.viewer).toMatchObject({ approve_cutover: { eligible: false }, operate: { eligible: true } });
    expect(String((asLead.viewer['approve_mapping'] as Row)['reason'])).toMatch(/onboarding_authority/);
    const asAuth = await detail(authority, A, wave);
    expect(asAuth.viewer).toMatchObject({ approve_mapping: { eligible: true }, operate: { eligible: false } });
    expect(asAuth.staging[String(r2['rehearsal_id'])]).toHaveLength(48);
    expect(await refusal(sql`update onboarding.migration_staging set disposition = 'would_create' where rehearsal_id = ${String(r1['rehearsal_id'])}::uuid`.execute(h.su))).toMatchObject({ message: expect.stringMatching(/append-only|append only/i) });
    expect(await refusal(sql`delete from onboarding.events where subject_id = ${wave}::uuid`.execute(h.su))).toMatchObject({ message: expect.stringMatching(/append-only|append only/i) });
  });
});

// ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
describe('AT-67 · the fault exercise on wave B (SYNTHETIC): a post-cutover difference holds; activation refused; recovered; then a REAL rollback of the activated domain', () => {
  let wave = ''; let cut = ''; let rb: Row = {};
  it('setup · wave B mapped, approved, rehearsed clean, the owner resolved, the cutover approved and executed', async () => {
    wave = String((await open(lead, B, `polska-b-${RUN}`)).wave['wave_id']);
    const m = (await propose(lead, B, wave, V2)).mapping;
    await decide(authority, B, wave, 1, String(m['digest']));
    const r = (await rehearse(lead, B, wave, evB.id)).rehearsal;
    expect(r['blocking']).toBe(0);
    const c = await request(lead, B, wave, String(r['rehearsal_id']));   // the data owner already holds the authority role: resolved
    expect(c.held).toBe(false);
    cut = String(c.cutover['cutover_id']);
    await approve(authority, B, cut, String(c.cutover['plan_digest']));
    expect((await execute(lead, B, cut)).cutover).toMatchObject({ state: 'executed', execution: { created: 47, matched: 1, failed: 0 } });
  });
  it('fault · an out-of-band change to a migrated entity → the post-cutover reconciliation DIFFERS: the cutover held, an item raised, activation refused (the domain stays draft)', async () => {
    const victim = String((await one(sql`select entity_id::text e from onboarding.migration_executed_rows where cutover_id = ${cut}::uuid and outcome = 'created' order by row_no limit 1`))['e']);
    await sql`update graph.entities_current set lifecycle_state = 'retired' where entity_id = ${victim}::uuid`.execute(h.su);
    const r = await reconcile(lead, B, cut);
    expect(r.held).toBe(true);
    expect(r.reconciliation).toMatchObject({ equal: false, counts: { expected: 48, observed: 47 } });
    const d = await detail(lead, B, wave);
    expect(d.wave).toMatchObject({ state: 'executed', held: true });
    expect(arr(d.wave['held_reasons']).map((x) => x['kind'])).toContain('post_cutover');
    expect((await items(cut, 'onboarding.migration')).map((i) => i['state'])).toEqual(['open']);
    await refused(activate(tenantAdmin, B, cut), /^migration cutover rejected \(held\)/, 409);
    // recovery: the change is repaired; the reconciliation equal → verified, the item closed
    await sql`update graph.entities_current set lifecycle_state = 'active' where entity_id = ${victim}::uuid`.execute(h.su);
    expect((await reconcile(lead, B, cut)).held).toBe(false);
    expect((await items(cut, 'onboarding.migration')).map((i) => i['state'])).toEqual(['closed']);
    await activate(tenantAdmin, B, cut);
    expect((await one(sql`select status from tenancy.domains where id = ${B.domainId}::uuid`))['status']).toBe('active');
  });
  it('rollback · rehearsed by the lead; the lead cannot execute it (PDP); the authority on a stale digest → 409', async () => {
    rb = (await rehearseRollback(lead, B, cut)).rollback;
    await refused(executeRollback(lead, B, cut, String(rb['rollback_id']), String(rb['digest'])), /no qualifying role binding/, 403);
    await refused(executeRollback(authority, B, cut, String(rb['rollback_id']), 'e'.repeat(64)), /^migration rollback rejected \(stale\)/, 409);
  });
  it('rollback · EXECUTED by the authority on the rehearsal\'s digest: 47 created entities RETIRED (append-only), the matched one kept, the activation REVERTED and re-recorded', async () => {
    const x = (await executeRollback(authority, B, cut, String(rb['rollback_id']), String(rb['digest']))).rollback;
    expect(x).toMatchObject({ kind: 'executed', rehearsal_of: rb['rollback_id'], plan: { retired: 47, domain_reverted: true } });
    expect(await one(sql`select count(*) filter (where lifecycle_state = 'retired')::int r, count(*) filter (where lifecycle_state = 'active')::int a from graph.entities_current where domain_id = ${B.domainId}::uuid`)).toEqual({ r: 47, a: 1 });
    expect((await one(sql`select status from tenancy.domains where id = ${B.domainId}::uuid`))['status']).toBe('draft');
    const ev = (await rows(sql`select event from tenancy.lifecycle_events where domain_id = ${B.domainId}::uuid order by occurred_at`)).map((e) => e['event']);
    expect(ev).toEqual(['domain.drafted', 'domain.activated', 'domain.activation_reverted']);
    expect((await one(sql`select count(*)::int n from graph.entity_identifiers where domain_id = ${B.domainId}::uuid`))['n']).toBe(48);   // identifiers stay as history
    const l = await mg.ledger(rq(authority, 'onboarding.read', 'migration_wave', wave, W(B)), T(), W(B), wave) as unknown as { wave_state: string; replay: Row };
    expect(l.wave_state).toBe('rolled_back');
    expect(l.replay).toMatchObject({ wave_state: 'rolled_back', domain_activated: false });
    await refused(executeRollback(authority, B, cut, String(rb['rollback_id']), String(rb['digest'])), /^migration rollback rejected \(state\)/, 409);
  });
  it('negative · an acceptance of a rolled-back wave is refused (only withholding remains)', async () => {
    const c = await candidate(authority, B, wave);
    await refused(accept(authority, B, wave, c.digest), /^onboarding acceptance rejected \(state\)/, 409);
  });
});

// ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
describe('AT-67 · cross-tenant, recovery and withdrawal', () => {
  let C: Target;
  beforeAll(async () => { C = await target('c'); }, 300_000);
  it('cross-tenant · another tenant\'s principal reads and acts on nothing of this tenant (scope resolution refuses)', async () => {
    const waves = await mgt.list(rq(lead, 'onboarding.read', 'migration_wave', null, null), T()) as { waves: Row[]; programmes: Row[] };
    const any = String(waves.waves[0]?.['wave_id']);
    for (const call of [
      () => mg.read(rq(outsider, 'onboarding.read', 'migration_wave', any, W(A), T()), T(), W(A), any),
      () => mgt.list(rq(outsider, 'onboarding.read', 'migration_wave', null, null, T()), T()),
      () => open(outsider, A, `outsider-${RUN}`),
    ]) { const r = await refusal(call()); expect(r.status).toBe(403); expect(r.code).toBe('EYE-TEN-001'); }
    // in its own tenant the outsider sees none of these waves
    const own = await mgt.list(rq(outsider, 'onboarding.read', 'migration_wave', null, null, otherTenant), otherTenant) as { waves: Row[] };
    expect(own.waves).toEqual([]);
    // activation of another tenant's domain through this tenant's context: not a domain of this tenant
    const c = String((await one(sql`select cutover_id::text c from onboarding.migration_cutovers where domain_id = ${A.domainId}::uuid and state = 'activated'`))['c']);
    await refused(mgt.activate(rq(tenantAdmin, 'tenancy.domain.activate', 'domain', otherDomain, null), T(), otherDomain, { payload: { cutoverId: c } }), /^migration cutover rejected \(unknown_domain\)/, 404);
  });
  it('isolation · a wave read through another domain\'s route is unknown (RLS)', async () => {
    const wave = String((await one(sql`select wave_id::text w from onboarding.migration_waves where domain_id = ${A.domainId}::uuid limit 1`))['w']);
    await refused(mg.read(rq(lead, 'onboarding.read', 'migration_wave', wave, h.fx.domainId), T(), h.fx.domainId, wave), /^migration wave rejected \(unknown_wave\)/, 404);
  });
  it('recovery · the authority\'s role revoked → its approval refused (authority); a fresh binding → admitted; a rejected proposal → a new version approved', async () => {
    const tc = C;
    const wave = String((await open(lead, tc, `polska-c-${RUN}`)).wave['wave_id']);
    const m1 = (await propose(lead, tc, wave, V2)).mapping;
    const held = await persona('human', 'temp-auth', ['onboarding_authority']);
    await sql`update identity.role_bindings set revoked_at = clock_timestamp() where principal_id = ${held.principalId}::uuid`.execute(h.su);
    const temp = await h.openSession(held);   // a fresh session still CLAIMING the revoked binding: the PEP admits it, the database's context refuses it
    await refused(decide(temp, tc, wave, 1, String(m1['digest'])), /authority insufficient|rejected \(authority\)/, 403);
    const fresh = await persona('human', 'fresh-auth', ['onboarding_authority']);
    expect((await decide(fresh, tc, wave, 1, String(m1['digest']), 'reject')).mapping).toMatchObject({ state: 'rejected', signature_id: null });
    const m2 = (await propose(lead, tc, wave, V1)).mapping;
    expect((await decide(fresh, tc, wave, 2, String(m2['digest']))).mapping).toMatchObject({ state: 'approved' });
  });
  it('negative · the proposer never approves its own mapping (separation_of_duties at the port, even holding the authority role)', async () => {
    const wave = String((await one(sql`select wave_id::text w from onboarding.migration_waves where wave_key = ${`polska-c-${RUN}`}`))['w']);
    const tc = { domainId: String((await one(sql`select domain_id::text d from onboarding.migration_waves where wave_id = ${wave}::uuid`))['d']) } as Target;
    const selfish = await persona('human', 'selfish', ['onboarding_authority']);
    // a proposal recorded by an authority-holding human is approved by nobody who proposed it (the port's test)
    await sql`insert into identity.role_bindings (id, principal_id, role_code, scope, tenant_id, domain_id) values (${uuidv7()}::uuid, ${selfish.principalId}::uuid, 'implementation_lead', 'TENANT', ${T()}::uuid, null)`.execute(h.su);
    const s2 = await h.openSession({ ...selfish, bindings: [...selfish.bindings, { roleCode: 'implementation_lead', scope: 'TENANT', tenantId: T(), domainId: null }] });
    const m = (await propose(s2, tc, wave, V2)).mapping;
    await refused(decide(s2, tc, wave, Number(m['version']), String(m['digest'])), /^migration mapping rejected \(separation_of_duties\)/, 403);
  });
  it('withdrawal · a wave that never cut over is withdrawn by the lead (records kept); not by the authority', async () => {
    await refused(open(lead, A, `polska-w-${RUN}`), /^migration wave rejected \(state\)/, 409);   // A's programme is accepted and its domain active
    const wave = String((await open(lead, C, `polska-w-${RUN}`, { identifierSystem: `nwp-w-${RUN}` })).wave['wave_id']);
    await refused(mg.withdraw(rq(authority, 'onboarding.wave.withdraw', 'migration_wave', wave, W(C)), T(), W(C), wave, { payload: { reason: 'not needed any more (SYNTHETIC)' } }), /no qualifying role binding/, 403);
    const w = await mg.withdraw(rq(lead, 'onboarding.wave.withdraw', 'migration_wave', wave, W(C)), T(), W(C), wave, { payload: { reason: 'not needed any more (SYNTHETIC)' } }) as { wave: Row };
    expect(w.wave['state']).toBe('withdrawn');
    await refused(propose(lead, C, wave, V2), /^migration mapping rejected \(state\)/, 409);
  });
  it('the tenant overview lists the programmes with their target domains and waves (TENANT read)', async () => {
    const l = await mgt.list(rq(authority, 'onboarding.read', 'migration_wave', null, null), T()) as { programmes: Row[]; waves: Row[] };
    const pa = l.programmes.find((p) => p['programme_id'] === A.programmeId);
    expect(pa).toMatchObject({ state: 'accepted', version: 2, target_domain_id: A.domainId });
    expect(l.waves.length).toBeGreaterThanOrEqual(4);
  });
});
