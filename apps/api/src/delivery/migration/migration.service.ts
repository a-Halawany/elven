/**
 * B94 §MG (0114 §MG) — GOVERNED MIGRATION, CUTOVER, DOMAIN ACTIVATION, ROLLBACK AND ACCEPTANCE (PR-67-003, PR-67-005, PR-67-006, CAP-DL-06 /
 * CAP-PD-06, AT-67, JRN-23, UX-66-003..006): the orchestration the ports do not do — the evidence bytes READ FIRST (an audited read, then the
 * vault read verified against the manifest's digest, then the pure parse — `legacy.ts`), and only then the governed write that records,
 * classifies and digests (the port is authoritative: every rule is a port's; a refusal is the port's text `<noun> rejected (<class>): …`).
 *
 * THE PRINCIPLES: the CUSTOMER'S AUTHORITY approves the mapping, the cutover (the data transfer), the rollback and the acceptance — a named
 * human holding onboarding_authority, on the exact digest, never the proposer, never an implementation lead, never an agent (the PORT
 * re-checks `onboarding.assert_approver`; the PEP's human gate too); every approval is SIGNED (SignatureService — kinds mapping, cutover,
 * acceptance); AUTOMATION executes only INSIDE the approved plan (the execution writes the approved staging rows, named by number, after the
 * evidence re-read reproduces the approved input digest — else `contract_changed`); a gap HOLDS (an owner gap, a failed reconciliation, an
 * unapproved mapping — the hold recorded, its items raised, the route answering 409 `held` with the blocking list); nothing is shown
 * migrated, reconciled or accepted by inference.
 *
 * THREE CLAIMS: CONSTRUCTION (this code and phase6-migration-b94); DEMONSTRATED OPERATION (the act on SYNTHETIC NORDWERK records); REAL
 * CUSTOMER ACCEPTANCE (AT-67, PR-67-006, UX-66-006 — R2: an acceptance record's claim is `demonstration`, always).
 */
import { HttpException, Injectable, Logger, type OnModuleInit } from '@nestjs/common';
import { ModuleRef } from '@nestjs/core';
import type { Envelope } from '@eye/contracts';
import type { AuthenticatedPrincipal } from '../../shared/auth-types.js';
import { newId } from '../../shared/ids.js';
import { PipelineService } from '../../pipeline/pipeline.service.js';
import { VaultService, VaultIntegrityError } from '../../observation/vault/vault.service.js';
import { SignatureService, type SignatureSubjectKind } from '../../executive/signatures/signature.service.js';
import { BOUNDARY, domainRoute, governedRead, governedWrite, receipt, refuseDelivery, tenantRoute, type DeliveryNoun } from '../seams.js';
import { MigrationCapability, type MigrationReads } from './migration.capabilities.js';
import { LegacyFormatError, parseCsv, parseLegacy, suggestMapping, type MappingSpec, type ParsedLegacy } from './legacy.js';
import { replayWave } from './replay.js';

type Row = Record<string, unknown>;
export const READ = 'onboarding.read';
export const MG_BOUNDARY = `${BOUNDARY} §MG: suppliers migrate to graph entities with a legacy identifier; the risk rating rides as provenance (an exposure is proposed by the domain's risk owner after go-live, never by the migration); CSV only (xlsx → residual).`;
export const APPROVAL_RULE = 'approved by a named human holding onboarding_authority, on the exact digest — never the proposer, never an implementation lead, never an agent (the port re-checks)';
const textOf = (e: unknown): string => (e instanceof HttpException ? String((e.getResponse() as { message?: string }).message ?? e.message) : (e instanceof Error ? e.message : String(e)));
const str = (v: unknown): string => (typeof v === 'string' ? v : v === null || v === undefined ? '' : String(v));

/** What the reading principal may do here (ADVISORY — the page renders eligibility; every port re-checks). */
export function viewerEligibility(p: AuthenticatedPrincipal, proposers: { mapping: string | null; cutover: string | null; rollback: string | null; executor: string | null }) {
  const roles = p.bindings.map((b) => b.roleCode);
  const human = p.kind === 'human'; const authority = roles.includes('onboarding_authority'); const lead = roles.includes('implementation_lead');
  const approve = (proposer: string | null, what: string) => {
    if (!human) return { eligible: false, reason: `${what} is a named human's act; an agent never approves` };
    if (!authority) return { eligible: false, reason: `${what} is the act of an onboarding_authority` };
    if (lead) return { eligible: false, reason: 'an implementation lead never approves or accepts on the customer\'s behalf' };
    if (proposer !== null && proposer === p.principalId) return { eligible: false, reason: `${what} is never approved by its proposer` };
    return { eligible: true, reason: APPROVAL_RULE };
  };
  return {
    principal_id: p.principalId, kind: p.kind, roles,
    approve_mapping: approve(proposers.mapping, 'approving a mapping'),
    approve_cutover: approve(proposers.cutover, 'approving a cutover'),
    execute_rollback: approve(proposers.rollback, 'executing a rollback'),
    accept: approve(proposers.executor, 'accepting a migration'),
    operate: { eligible: lead, reason: lead ? 'the implementation lead proposes, rehearses, requests and executes inside the approved plan' : 'proposing, rehearsing and executing are the implementation lead\'s acts' },
    activate: { eligible: roles.includes('tenant_admin'), reason: 'activating a domain is the tenant administrator\'s act (the tenancy authority), after a verified cutover' },
  };
}

@Injectable()
export class MigrationService implements OnModuleInit {
  private readonly log = new Logger('delivery.migration');
  private vault: VaultService | null = null;
  private readonly signer = new SignatureService();
  constructor(private readonly moduleRef: ModuleRef, private readonly pipeline: PipelineService) {}

  onModuleInit(): void {
    try { this.vault = this.moduleRef.get(VaultService, { strict: false }); } catch { this.vault = null; }
    if (this.vault === null) this.log.warn('no evidence vault in this application: migration rehearsals and executions cannot read the legacy evidence');
  }

  // ───────────────────────── reads ─────────────────────────
  private read<T>(env: Envelope, p: AuthenticatedPrincipal, t: string, d: string | null, objectType: string | null, objectId: string | null, fn: (cap: MigrationReads) => Promise<T>) {
    const route = d === null ? tenantRoute(t, READ, objectType, objectId) : domainRoute(t, d, READ, objectType, objectId);
    return governedRead(this.pipeline, env, p, route, MigrationCapability.read, fn);
  }
  private write<T>(env: Envelope, p: AuthenticatedPrincipal, t: string, d: string, action: string, objectType: string, objectId: string,
                   fn: (cap: ReturnType<typeof MigrationCapability.write>) => Promise<{ result: T; targetVersion?: string | null }>) {
    return governedWrite(this.pipeline, env, p, domainRoute(t, d, action, objectType, objectId), MigrationCapability.write, async (cap) => fn(cap));
  }

  /** The programmes of the tenant and their waves (TENANT) — or one domain's waves (DOMAIN). */
  async list(env: Envelope, p: AuthenticatedPrincipal, t: string, d: string | null) {
    const out = await this.read(env, p, t, d, 'migration_wave', null, async (cap) => ({
      programmes: d === null ? await cap.programmes() : [], waves: await cap.waves(d), read_at: await cap.now(),
    }));
    return { ...out.result, boundary: MG_BOUNDARY, receipt: receipt(out) };
  }

  /** One wave as the migration workspace shows it — status, mapping, readiness and cutover first, then the detail (UX-66-001). */
  async detail(env: Envelope, p: AuthenticatedPrincipal, t: string, d: string, waveId: string) {
    const out = await this.read(env, p, t, d, 'migration_wave', waveId, async (cap) => {
      const wave = await cap.wave(waveId);
      if (wave === null) return null;
      const [mappings, rehearsals, cutovers] = [await cap.mappings(waveId), await cap.rehearsals(waveId), await cap.cutovers(waveId)];
      const runs = rehearsals.filter((r) => r['kind'] === 'rehearsal');
      const staging: Record<string, Row[]> = {};
      for (const r of runs.slice(0, 2)) staging[String(r['rehearsal_id'])] = await cap.staging(String(r['rehearsal_id']));
      const current = cutovers.find((c) => !['rolled_back', 'superseded'].includes(String(c['state']))) ?? null;
      const cutoverDetail = current === null ? null : {
        blocking_now: current['state'] === 'requested' ? await cap.blocking(t, d, waveId, String(current['rehearsal_id'])) : [],
        post_observed: ['executed', 'verified', 'activated'].includes(String(current['state'])) ? await cap.postObserved(String(current['cutover_id'])) : null,
        executed: ['executed', 'verified', 'activated', 'rolled_back'].includes(String(current['state'])) ? await cap.executed(String(current['cutover_id'])) : [],
        rollback_plan: ['executed', 'verified', 'activated'].includes(String(current['state'])) ? await cap.rollbackPlan(String(current['cutover_id'])) : null,
        signatures: current['signature_id'] === null ? [] : await cap.signatures('cutover', String(current['cutover_id']), 1),
      };
      const approved = mappings.find((m) => m['state'] === 'approved') ?? null;
      const rollbacks = await cap.rollbacks(waveId); const acceptances = await cap.acceptances(waveId);
      const subjects = [waveId, ...rehearsals.map((r) => String(r['rehearsal_id'])), ...cutovers.map((c) => String(c['cutover_id'])), ...rollbacks.map((b) => String(b['rollback_id'])),
                        ...acceptances.map((a) => String(a['acceptance_id'])), d];
      const ledger = await cap.ledger(subjects, 1000);
      return {
        wave, mappings, approved_mapping: approved, rehearsals, staging, cutovers, current_cutover: current, cutover_detail: cutoverDetail, rollbacks, acceptances,
        owner: await cap.ownerResolution(t, d, 'data.migration'), domain: await cap.domainLifecycle(t, d),
        evidences: await cap.evidencesOfSource(String(wave['source_id'])),
        mapping_signatures: approved === null ? [] : await cap.signatures('mapping', waveId, Number(approved['version'])),
        items: await cap.items([waveId, ...cutovers.map((c) => String(c['cutover_id']))]),
        ledger, replay: replayWave(ledger), read_at: await cap.now(),
        viewer: viewerEligibility(p, {
          mapping: str(mappings.find((m) => m['state'] === 'proposed')?.['proposed_by']) || null,
          cutover: current === null ? null : str(current['requested_by']) || null,
          rollback: str(rollbacks.find((b) => b['kind'] === 'rehearsal')?.['recorded_by']) || null,
          executor: current === null ? null : (str(current['executed_by']) || str(wave['created_by']) || null),
        }),
        approval_rule: APPROVAL_RULE, boundary: MG_BOUNDARY,
      };
    });
    if (out.result === null) throw refuseDelivery('migration wave', 'unknown_wave', `${waveId} is not a migration wave of this domain`, env.correlation_id, 404);
    return { ...out.result, receipt: receipt(out) };
  }

  /** The ledger of a wave and its REPLAY (the history reconstructed from the events alone — UX-66-003 replayable). */
  async ledger(env: Envelope, p: AuthenticatedPrincipal, t: string, d: string, waveId: string) {
    const out = await this.read(env, p, t, d, 'migration_wave', waveId, async (cap) => {
      const wave = await cap.wave(waveId);
      if (wave === null) return null;
      const subjects = [waveId, ...(await cap.rehearsals(waveId)).map((r) => String(r['rehearsal_id'])), ...(await cap.cutovers(waveId)).map((c) => String(c['cutover_id'])),
                        ...(await cap.rollbacks(waveId)).map((b) => String(b['rollback_id'])), ...(await cap.acceptances(waveId)).map((a) => String(a['acceptance_id'])), d];
      const events = await cap.ledger(subjects, 5000);
      return { wave_state: wave['state'], events, replay: replayWave(events) };
    });
    if (out.result === null) throw refuseDelivery('migration wave', 'unknown_wave', `${waveId} is not a migration wave of this domain`, env.correlation_id, 404);
    return { ...out.result, receipt: receipt(out) };
  }

  /** The legacy file's bytes, read FIRST and verified against the manifest's digest (never inside a write). */
  private async bytesOf(noun: DeliveryNoun, t: string, d: string, ev: Row, cid: string): Promise<Buffer> {
    if (this.vault === null) throw refuseDelivery(noun, 'evidence', 'the evidence vault is not available in this application; nothing was read', cid);
    try {
      const vaultName = ev['vault'] === 'quarantine' ? 'quarantine' : 'evidence';
      const r = vaultName === 'evidence' ? await this.vault.readTiered('evidence', { tenantId: t, domainId: d }, str(ev['locator']), str(ev['bytes_digest']))
        : await this.vault.read('quarantine', { tenantId: t, domainId: d }, str(ev['locator']), str(ev['bytes_digest']));
      return r.bytes;
    } catch (e) {
      if (e instanceof VaultIntegrityError) throw refuseDelivery(noun, 'evidence', `the stored legacy evidence could not be read intact (${e.reason}); nothing was rehearsed or migrated`, cid);
      throw e;
    }
  }
  private parse(noun: DeliveryNoun, bytes: Buffer, spec: MappingSpec, mediaType: string | null, cid: string): ParsedLegacy {
    try { return parseLegacy(bytes, spec, mediaType); } catch (e) {
      if (e instanceof LegacyFormatError) throw refuseDelivery(noun, e.kind, e.message, cid);
      throw e;
    }
  }

  /** Automation's mapping SUGGESTIONS from an evidence's header (never preselected as approved; a human proposes). */
  async suggest(env: Envelope, p: AuthenticatedPrincipal, t: string, d: string, waveId: string, evidenceId: string) {
    const out = await this.read(env, p, t, d, 'migration_wave', waveId, async (cap) => {
      const wave = await cap.wave(waveId);
      if (wave === null) return null;
      return { wave, ev: await cap.evidence(t, d, str(wave['source_id']), evidenceId) };
    });
    if (out.result === null) throw refuseDelivery('migration mapping', 'unknown_wave', `${waveId} is not a migration wave of this domain`, env.correlation_id, 404);
    const bytes = await this.bytesOf('migration mapping', t, d, out.result.ev, env.correlation_id);
    let header: string[];
    try {
      const parsed = this.parse('migration mapping', bytes, { key_column: '', columns: [] }, str(out.result.ev['media_type']) || null, env.correlation_id);
      header = parsed.columns;
    } catch (e) { if (e instanceof HttpException) throw e; header = (parseCsv(bytes.toString('utf8'))[0]?.cells ?? []).map((h) => h.trim()); }
    return { suggestions: suggestMapping(header), columns: header, evidence_id: evidenceId,
             note: 'SUGGESTIONS of automation: each is suggested, none is approved — the implementation lead proposes a mapping (basis adopted_suggestions) and the onboarding authority approves it on its digest',
             receipt: receipt(out) };
  }

  // ───────────────────────── writes ─────────────────────────
  async open(env: Envelope, p: AuthenticatedPrincipal, t: string, d: string, b: { programmeId: string; key: string; title: string; sourceId: string; identifierSystem: string; identifierAuthority: string }) {
    const waveId = newId();
    const out = await this.write(env, p, t, d, 'onboarding.wave.open', 'migration_wave', waveId, async (cap) => ({
      result: await cap.openWave({ waveId, t, d, programmeId: b.programmeId, key: b.key, title: b.title, sourceId: b.sourceId, system: b.identifierSystem, authority: b.identifierAuthority,
                                   actor: p.principalId, correlationId: env.correlation_id }),
    }));
    return { wave: out.result, receipt: receipt(out) };
  }

  async withdraw(env: Envelope, p: AuthenticatedPrincipal, t: string, d: string, waveId: string, reason: string) {
    const out = await this.write(env, p, t, d, 'onboarding.wave.withdraw', 'migration_wave', waveId, async (cap) => ({
      result: await cap.withdrawWave({ waveId, t, d, reason, actor: p.principalId, correlationId: env.correlation_id }),
    }));
    return { wave: out.result, receipt: receipt(out) };
  }

  async proposeMapping(env: Envelope, p: AuthenticatedPrincipal, t: string, d: string, waveId: string, b: { spec: MappingSpec; basis: string; rationale: string; expectedVersion: number | null }) {
    const out = await this.write(env, p, t, d, 'onboarding.mapping.propose', 'migration_wave', waveId, async (cap) => {
      const m = await cap.proposeMapping({ waveId, t, d, spec: b.spec, basis: b.basis, rationale: b.rationale, expectedVersion: b.expectedVersion, actor: p.principalId, correlationId: env.correlation_id });
      return { result: m, targetVersion: String(m['version']) };
    });
    return { mapping: out.result, receipt: receipt(out) };
  }

  private async sign(cap: ReturnType<typeof MigrationCapability.write>, a: { t: string; d: string; action: string; kind: string; subjectId: string; version: number; digest: string; actor: string; cid: string }): Promise<string> {
    const s = await this.signer.sign(cap, { tenantId: a.t, domainId: a.d, action: a.action, kind: a.kind as SignatureSubjectKind, subjectId: a.subjectId, subjectVersion: a.version,
                                            subjectDigest: a.digest, actor: a.actor, correlationId: a.cid });
    return str(s['signature_id']);
  }

  /** The onboarding authority decides a PROPOSED mapping on its digest; an approval is signed (kind mapping). */
  async decideMapping(env: Envelope, p: AuthenticatedPrincipal, t: string, d: string, waveId: string, b: { version: number; digest: string; decision: 'approve' | 'reject'; reason: string }) {
    const action = 'onboarding.mapping.approve';
    const out = await this.write(env, p, t, d, action, 'migration_wave', waveId, async (cap) => {
      const signatureId = b.decision === 'approve' ? await this.sign(cap, { t, d, action, kind: 'mapping', subjectId: waveId, version: b.version, digest: b.digest, actor: p.principalId, cid: env.correlation_id }) : null;
      const m = await cap.decideMapping({ waveId, t, d, version: b.version, digest: b.digest, decision: b.decision, reason: b.reason, signatureId, actor: p.principalId, correlationId: env.correlation_id });
      return { result: m, targetVersion: String(b.version) };
    });
    return { mapping: out.result, receipt: receipt(out) };
  }

  /** A REHEARSAL: the evidence read and parsed FIRST, then recorded, classified and digested by the port (the reconciliation report). */
  async rehearse(env: Envelope, p: AuthenticatedPrincipal, t: string, d: string, waveId: string, b: { evidenceId: string; mappingVersion: number | null }) {
    const pre = await this.read(env, p, t, d, 'migration_wave', waveId, async (cap) => {
      const wave = await cap.wave(waveId);
      if (wave === null) return null;
      const mappings = await cap.mappings(waveId);
      const mapping = b.mappingVersion === null ? (mappings.find((m) => ['proposed', 'approved'].includes(String(m['state']))) ?? null) : (mappings.find((m) => Number(m['version']) === b.mappingVersion) ?? null);
      return { wave, mapping, ev: await cap.evidence(t, d, str(wave['source_id']), b.evidenceId) };
    });
    if (pre.result === null) throw refuseDelivery('migration rehearsal', 'unknown_wave', `${waveId} is not a migration wave of this domain`, env.correlation_id, 404);
    const { mapping, ev } = pre.result;
    if (mapping === null) throw refuseDelivery('migration rehearsal', 'unknown_mapping', b.mappingVersion === null ? 'the wave has no proposed or approved mapping to rehearse' : `the wave has no mapping v${b.mappingVersion}`, env.correlation_id, 404);
    const bytes = await this.bytesOf('migration rehearsal', t, d, ev, env.correlation_id);
    const parsed = this.parse('migration rehearsal', bytes, mapping['spec'] as MappingSpec, str(ev['media_type']) || null, env.correlation_id);
    const rehearsalId = newId();
    const out = await this.write(env, p, t, d, 'onboarding.rehearsal.run', 'migration_wave', waveId, async (cap) => {
      const r = await cap.recordRehearsal({ rehearsalId, waveId, t, d, evidenceId: b.evidenceId, bytesDigest: str(ev['bytes_digest']), mappingVersion: Number(mapping['version']),
                                            columns: parsed.columns, rows: parsed.rows, formulaCells: parsed.formulaCellsRecorded, actor: p.principalId, correlationId: env.correlation_id });
      return { result: r, targetVersion: String(r['seq']) };
    });
    return { rehearsal: out.result, receipt: receipt(out) };
  }

  async requestCutover(env: Envelope, p: AuthenticatedPrincipal, t: string, d: string, waveId: string, rehearsalId: string) {
    const cutoverId = newId();
    const out = await this.write(env, p, t, d, 'onboarding.cutover.request', 'cutover', cutoverId, async (cap) => ({
      result: await cap.requestCutover({ cutoverId, waveId, t, d, rehearsalId, actor: p.principalId, correlationId: env.correlation_id }),
    }));
    return { cutover: out.result, held: out.result['held'] === true, blocking: out.result['held_reasons'], receipt: receipt(out) };
  }

  async recheckCutover(env: Envelope, p: AuthenticatedPrincipal, t: string, d: string, cutoverId: string) {
    const out = await this.write(env, p, t, d, 'onboarding.cutover.recheck', 'cutover', cutoverId, async (cap) => ({
      result: await cap.recheckCutover({ cutoverId, t, d, actor: p.principalId, correlationId: env.correlation_id }),
    }));
    return { cutover: out.result, held: out.result['held'] === true, blocking: out.result['held_reasons'], receipt: receipt(out) };
  }

  /** The onboarding authority approves the cutover on the rehearsal's plan digest — HELD (409, the hold recorded first) while a blocking item stands. */
  async approveCutover(env: Envelope, p: AuthenticatedPrincipal, t: string, d: string, cutoverId: string, b: { digest: string; reason: string }) {
    const action = 'onboarding.cutover.approve';
    const out = await this.write(env, p, t, d, action, 'cutover', cutoverId, async (cap) => {
      const c = await cap.cutover(cutoverId);
      // sign only what can be approved: a held cutover records its hold without a signature
      const blocking = c === null ? [] : await cap.blocking(t, d, str(c['wave_id']), str(c['rehearsal_id']));
      const signatureId = c !== null && blocking.length === 0 && b.digest === str(c['plan_digest'])
        ? await this.sign(cap, { t, d, action, kind: 'cutover', subjectId: cutoverId, version: 1, digest: b.digest, actor: p.principalId, cid: env.correlation_id }) : null;
      return { result: await cap.approveCutover({ cutoverId, t, d, digest: b.digest, reason: b.reason, signatureId, actor: p.principalId, correlationId: env.correlation_id }) };
    });
    if (out.result['held'] === true) {
      const kinds = (Array.isArray(out.result['blocking']) ? out.result['blocking'] as Row[] : []).map((x) => `${str(x['kind'])}${x['reason'] === undefined ? '' : ` (${str(x['reason'])})`}`);
      throw refuseDelivery('migration cutover', 'held', `the cutover is held — ${kinds.join('; ')}; the hold is recorded and routed (receipt ${out.policyDecisionId})`, env.correlation_id, 409);
    }
    return { ...out.result, receipt: receipt(out) };
  }

  /** EXECUTION (the lead or an agent): the evidence re-read and re-parsed FIRST; then, in ONE governed write, the port re-verifies the approved
   *  plan (contract_changed / stale), and each APPROVED staging row runs under its own savepoint; a refused row is recorded `failed`. */
  async execute(env: Envelope, p: AuthenticatedPrincipal, t: string, d: string, cutoverId: string) {
    const pre = await this.read(env, p, t, d, 'cutover', cutoverId, async (cap) => {
      const c = await cap.cutover(cutoverId);
      if (c === null) return null;
      const r = await cap.rehearsal(str(c['rehearsal_id']));
      const wave = await cap.wave(str(c['wave_id']));
      const mapping = (await cap.mappings(str(c['wave_id']))).find((m) => Number(m['version']) === Number(c['mapping_version'])) ?? null;
      const input = (r?.['input'] ?? {}) as Row;
      return { c, mapping, ev: await cap.evidence(t, d, str(wave?.['source_id']), str(input['evidence_object_id'])) };
    });
    if (pre.result === null) throw refuseDelivery('migration cutover', 'unknown_cutover', `${cutoverId} is not a cutover of this domain`, env.correlation_id, 404);
    const { mapping, ev } = pre.result;
    if (mapping === null) throw refuseDelivery('migration cutover', 'contract_changed', 'the cutover\'s mapping version is no longer on record', env.correlation_id);
    const bytes = await this.bytesOf('migration cutover', t, d, ev, env.correlation_id);
    const parsed = this.parse('migration cutover', bytes, mapping['spec'] as MappingSpec, str(ev['media_type']) || null, env.correlation_id);
    return this.executeParsed(env, p, t, d, cutoverId, str(ev['bytes_digest']), parsed);
  }

  /** The governed half of the execution (exposed for the harness's fault exercise: rows that differ from the approved input are refused). */
  async executeParsed(env: Envelope, p: AuthenticatedPrincipal, t: string, d: string, cutoverId: string, bytesDigest: string, parsed: Pick<ParsedLegacy, 'columns' | 'rows'>, extraRowNos: number[] = []) {
    const out = await this.write(env, p, t, d, 'onboarding.cutover.execute', 'cutover', cutoverId, async (cap) => {
      const begun = await cap.beginExecution({ cutoverId, t, d, bytesDigest, columns: parsed.columns, rows: parsed.rows, actor: p.principalId, correlationId: env.correlation_id });
      const rowNos = [...(Array.isArray(begun['row_nos']) ? (begun['row_nos'] as number[]) : []), ...extraRowNos];
      const failures: Array<{ row_no: number; reason: string }> = [];
      for (const rowNo of rowNos) {
        const sp = `mg_row_${rowNo}`;
        await cap.savepoint(sp);
        try {
          await cap.executeRow({ cutoverId, t, d, rowNo, entityId: newId(), identifierId: newId(), actor: p.principalId, correlationId: env.correlation_id });
          await cap.releaseSavepoint(sp);
        } catch (e) {
          await cap.rollbackToSavepoint(sp);
          const reason = textOf(e);
          if (/\(contract_changed\)/.test(reason)) throw e;   // a row outside the approved plan refuses the WHOLE execution
          await cap.recordFailedRow({ cutoverId, t, d, rowNo, reason, actor: p.principalId, correlationId: env.correlation_id });
          failures.push({ row_no: rowNo, reason });
        }
      }
      const done = await cap.completeExecution({ cutoverId, t, d, actor: p.principalId, correlationId: env.correlation_id });
      return { result: { cutover: done, failures } };
    });
    return { ...out.result, receipt: receipt(out) };
  }

  async reconcile(env: Envelope, p: AuthenticatedPrincipal, t: string, d: string, cutoverId: string) {
    const rehearsalId = newId();
    const out = await this.write(env, p, t, d, 'onboarding.cutover.reconcile', 'cutover', cutoverId, async (cap) => ({
      result: await cap.reconcile({ rehearsalId, cutoverId, t, d, actor: p.principalId, correlationId: env.correlation_id }),
    }));
    return { reconciliation: out.result, held: out.result['held'] === true, receipt: receipt(out) };
  }

  /** DOMAIN ACTIVATION (TENANT route; tenancy.domain.activate — the tenant administrator), refused unless the cutover is verified (live). */
  async activate(env: Envelope, p: AuthenticatedPrincipal, t: string, domainId: string, cutoverId: string) {
    const out = await governedWrite(this.pipeline, env, p, tenantRoute(t, 'tenancy.domain.activate', 'domain', domainId), MigrationCapability.write, async (cap) => ({
      result: await cap.activate({ domainId, t, cutoverId, actor: p.principalId, correlationId: env.correlation_id }),
    }));
    return { activation: out.result, receipt: receipt(out) };
  }

  async rehearseRollback(env: Envelope, p: AuthenticatedPrincipal, t: string, d: string, cutoverId: string) {
    const rollbackId = newId();
    const out = await this.write(env, p, t, d, 'onboarding.rollback.rehearse', 'cutover', cutoverId, async (cap) => ({
      result: await cap.rehearseRollback({ rollbackId, cutoverId, t, d, actor: p.principalId, correlationId: env.correlation_id }),
    }));
    return { rollback: out.result, receipt: receipt(out) };
  }

  async executeRollback(env: Envelope, p: AuthenticatedPrincipal, t: string, d: string, cutoverId: string, b: { rehearsalId: string; digest: string; reason: string }) {
    const rollbackId = newId();
    const out = await this.write(env, p, t, d, 'onboarding.rollback.execute', 'cutover', cutoverId, async (cap) => ({
      result: await cap.executeRollback({ rollbackId, rehearsalId: b.rehearsalId, cutoverId, t, d, digest: b.digest, reason: b.reason, actor: p.principalId, correlationId: env.correlation_id }),
    }));
    return { rollback: out.result, receipt: receipt(out) };
  }

  /** The acceptance CANDIDATE (what would be bound, and its digest — the authority accepts or withholds on it). */
  async candidate(env: Envelope, p: AuthenticatedPrincipal, t: string, d: string, waveId: string, b: { journeys: string[]; roles: string[]; baselineDigest: string | null }) {
    const out = await this.read(env, p, t, d, 'migration_wave', waveId, async (cap) => {
      const wave = await cap.wave(waveId);
      if (wave === null) return null;
      return cap.acceptanceCandidate(t, d, waveId, b.journeys, b.roles, b.baselineDigest);
    });
    if (out.result === null) throw refuseDelivery('onboarding acceptance', 'unknown_wave', `${waveId} is not a migration wave of this domain`, env.correlation_id, 404);
    return { ...out.result, claim: 'demonstration', note: 'an acceptance by a SYNTHETIC persona demonstrates the software only; real customer acceptance (AT-67, PR-67-006, UX-66-006) is R2', receipt: receipt(out) };
  }

  async decideAcceptance(env: Envelope, p: AuthenticatedPrincipal, t: string, d: string, waveId: string,
                         b: { decision: 'accept' | 'withhold'; journeys: string[]; roles: string[]; baselineDigest: string | null; digest: string; reason: string }) {
    const action = 'onboarding.acceptance.decide';
    const acceptanceId = newId();
    const out = await this.write(env, p, t, d, action, 'migration_wave', waveId, async (cap) => {
      const signatureId = b.decision === 'accept' ? await this.sign(cap, { t, d, action, kind: 'acceptance', subjectId: acceptanceId, version: 1, digest: b.digest, actor: p.principalId, cid: env.correlation_id }) : null;
      return { result: await cap.decideAcceptance({ acceptanceId, waveId, t, d, decision: b.decision, journeys: b.journeys, roles: b.roles, baselineDigest: b.baselineDigest, digest: b.digest,
                                                     reason: b.reason, signatureId, actor: p.principalId, correlationId: env.correlation_id }) };
    });
    return { acceptance: out.result, receipt: receipt(out) };
  }
}
