/**
 * TWINS — Phase 5 (L5), stage P5-M1, corrected against the Codex review of f66a958d.
 *
 * A twin is DECLARED by a person: identity and scope (a boundary of graph
 * entities), interfaces, a pinned behaviour model, its validation status and
 * limitations. Its state lives in VERSIONS: a draft accumulates elements, and
 * admission binds the complete state set — its digest — into the canonical TWN
 * version atomically. Every element has a KIND (observed / estimated / assumed /
 * predicted / simulated) and typed citations binding exact object ids, versions
 * and digests; an entity names a subject and substantiates no value; a derived
 * claim keeps its truth state; synthetic state folds upward. Materiality is
 * decided by the registries, in the port — never by the caller.
 *
 * Two cut-offs, never one: `known_at` is RECORD time, `observed_through` is
 * WORLD time. Nothing recorded after `known_at` and nothing observed after
 * `observed_through` reaches a version — on the series path AND on the explicit
 * path. An OBSERVED value is ESTABLISHED from the record that states it (the
 * cited uploaded record, or an observed claim), never taken from the caller. A
 * PREDICTED element carries its forecast's validation state, exactly.
 */
import { HttpException, Injectable } from '@nestjs/common';
import { createHash } from 'node:crypto';
import { canonicalHeaderDigest, errorBody, validateHeader, type CanonicalHeader } from '@eye/contracts';
import { newId } from '../../shared/ids.js';
import type { ScopeContext } from '../../shared/scope.js';
import { SeriesService, type Reader } from '../../prediction/series/series.service.js';
import { foldControls, type Controls, type ControlInput } from '../../prediction/controls.js';
import type { AdmitWrites, Citation, CitationKind, CitedObjectRow, DeclareWrites, GroundWrites, TwinReads, VersionWrites } from '../twin.capabilities.js';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const KINDS = ['observed', 'estimated', 'assumed', 'predicted', 'simulated'] as const;
export type ElementKind = typeof KINDS[number];
const OBJECT_TYPE_OF: Readonly<Record<Exclude<CitationKind, 'entity'>, string>> = Object.freeze({
  evidence: 'EVD', claim: 'CLM', forecast: 'FCT', assumption: 'ASU', run: 'SIM',
});
const DEPENDS_ON_KIND: Readonly<Record<CitationKind, string>> = Object.freeze({
  evidence: 'evidence', claim: 'claim', entity: 'entity', forecast: 'forecast', assumption: 'strategy', run: 'run',
});
const VALIDATION_STATES = ['validated', 'validated_retrospective', 'unvalidated', 'validation_impossible'] as const;
/** The dependency walk's bound, applied to the pending-closure read as well. */
const MAX_HOPS = 8;

export interface TwinIntake {
  kind: string; title: string; statement: string; boundary: string[]; owner: string; intendedDecisions: string[];
  interfaces: Record<string, unknown>; behaviourModelRef: string;
  validation: { status: string; envelope?: Record<string, unknown>; limitations: string[] };
}

/**
 * Where an OBSERVED value is read from: the row of the cited record (its id column
 * — the first column whose name ends in `_id`, or the first column) and the field
 * that states the value, or a mapping of the element's object keys to columns.
 */
export interface RecordLocator { locator: string; field: string | null; fields: Record<string, string> | null }

export interface ElementIntake {
  key: string; kind: ElementKind; value: unknown; unit?: string | null;
  citations: Array<{ kind: CitationKind; id: string; version?: number | null }>;
  validFrom?: string | null; validTo?: string | null; confidence?: number | null;
  record?: RecordLocator | null;
}

export function validateTwinIntake(m: Partial<TwinIntake>, correlationId: string): TwinIntake {
  const bad = (msg: string): never => { throw new HttpException(errorBody('EYE_REQ_001', correlationId, msg), 422); };
  if (typeof m.kind !== 'string' || !/^[a-z][a-z0-9-]{1,40}$/.test(m.kind)) bad('kind must name a registered twin kind');
  if (typeof m.title !== 'string' || m.title.trim().length < 2 || m.title.length > 256) bad('title must be between 2 and 256 characters');
  if (typeof m.statement !== 'string' || m.statement.trim().length < 2 || m.statement.length > 4096) bad('statement must be between 2 and 4096 characters');
  if (!Array.isArray(m.boundary) || m.boundary.length === 0 || !m.boundary.every((b) => typeof b === 'string' && UUID.test(b))) {
    bad('boundary must list at least one entity id — an entity names the subject of the twin');
  }
  if (typeof m.owner !== 'string' || !UUID.test(m.owner)) bad('owner must be a principal id');
  if (typeof m.behaviourModelRef !== 'string' || !/^[a-z0-9-]+@[0-9]+$/.test(m.behaviourModelRef)) bad('behaviourModelRef must name a registered behaviour model');
  const v = m.validation;
  if (v === undefined || typeof v.status !== 'string' || v.status.trim().length < 4 || !Array.isArray(v.limitations)) {
    bad('validation must carry a status and a list of known limitations');
  }
  return {
    kind: m.kind as string, title: m.title as string, statement: m.statement as string, boundary: m.boundary as string[],
    owner: m.owner as string, intendedDecisions: Array.isArray(m.intendedDecisions) ? m.intendedDecisions.filter((x) => typeof x === 'string') : [],
    interfaces: typeof m.interfaces === 'object' && m.interfaces !== null ? m.interfaces : {},
    behaviourModelRef: m.behaviourModelRef as string,
    validation: { status: (v as TwinIntake['validation']).status, envelope: (v as TwinIntake['validation']).envelope ?? {},
                  limitations: (v as TwinIntake['validation']).limitations.filter((x) => typeof x === 'string') },
  };
}

export function validateElementIntake(m: Partial<ElementIntake>, correlationId: string): ElementIntake {
  const bad = (msg: string): never => { throw new HttpException(errorBody('EYE_REQ_001', correlationId, msg), 422); };
  if (typeof m.key !== 'string' || !/^[a-z][a-z0-9_.-]*(:[A-Za-z0-9_.-]+)?$/.test(m.key)) bad('key must be like inventory.on_hand:SYN-PART-MAG');
  if (!KINDS.includes(m.kind as ElementKind)) bad(`kind must be one of ${KINDS.join(', ')}`);
  if (m.value === undefined) bad('value is required');
  if (!Array.isArray(m.citations)) bad('citations must be an array of { kind, id, version? }');
  for (const c of m.citations as unknown[]) {
    const x = c as Record<string, unknown>;
    if (typeof x !== 'object' || x === null || !(x['kind'] as string in DEPENDS_ON_KIND) || typeof x['id'] !== 'string' || !UUID.test(x['id'] as string)
      || (x['version'] != null && (!Number.isInteger(x['version']) || (x['version'] as number) < 1))) {
      bad('every citation needs a kind (evidence, claim, entity, forecast, assumption, run), an object id and optionally an integer version');
    }
  }
  let record: RecordLocator | null = null;
  if (m.record !== undefined && m.record !== null) {
    const r = m.record as unknown as Record<string, unknown>;
    if (typeof r !== 'object' || typeof r['locator'] !== 'string' || (r['locator'] as string).trim().length === 0 || (r['locator'] as string).length > 200) {
      bad('record must name the locator of the row that states the value (its id column)');
    }
    const field = typeof r['field'] === 'string' && (r['field'] as string).length > 0 ? (r['field'] as string) : null;
    const fields = typeof r['fields'] === 'object' && r['fields'] !== null && !Array.isArray(r['fields'])
      && Object.values(r['fields'] as Record<string, unknown>).every((v) => typeof v === 'string' && v.length > 0)
      ? (r['fields'] as Record<string, string>) : null;
    if (field === null && (fields === null || Object.keys(fields).length === 0)) bad('record must name the field that states the value, or a mapping of the value\'s keys to the record\'s columns');
    record = { locator: (r['locator'] as string).trim(), field, fields };
  }
  const day = (v: unknown): string | null => (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : null);
  return {
    key: m.key as string, kind: m.kind as ElementKind, value: m.value, unit: typeof m.unit === 'string' ? m.unit : null,
    citations: (m.citations as ElementIntake['citations']).map((c) => ({ kind: c.kind, id: c.id, version: c.version ?? null })),
    validFrom: day(m.validFrom), validTo: day(m.validTo),
    confidence: typeof m.confidence === 'number' && m.confidence >= 0 && m.confidence <= 1 ? m.confidence : null,
    record,
  };
}

/** A stable digest for an entity citation: entities carry no content digest, so the row's identity is digested. */
export function entityDigest(e: { entity_id: string; entity_type: string; canonical_name: string; lifecycle_state: string }): string {
  return createHash('sha256').update(JSON.stringify([e.entity_id, e.entity_type, e.canonical_name, e.lifecycle_state])).digest('hex');
}

interface ResolvedCitation {
  citation: Citation; controls: ControlInput | null; truthState: string | null; lifecycle: string; synthetic: boolean;
  recordedAt: string | null; eventTime: string | null; validation: string | null; payload: Record<string, unknown> | null;
}

/* ───────────────────────── establishing a value from its record ───────────────────────── */

/** Parse uploaded bytes as rows: CSV with a header line, or a JSON array of objects. Anything else is not a record set. */
export function rowsOf(bytes: Buffer): Array<Record<string, string>> | null {
  const text = bytes.toString('utf8');
  const trimmed = text.replace(/^﻿/, '').trim();
  if (trimmed.startsWith('[') || trimmed.startsWith('{')) {
    try {
      const parsed = JSON.parse(trimmed) as unknown;
      if (Array.isArray(parsed) && parsed.every((r) => typeof r === 'object' && r !== null && !Array.isArray(r))) {
        return (parsed as Array<Record<string, unknown>>).map((r) => Object.fromEntries(Object.entries(r).map(([k, v]) => [k, v === null || v === undefined ? '' : (typeof v === 'object' ? JSON.stringify(v) : String(v))])));
      }
    } catch { /* not JSON rows */ }
    return null;
  }
  const lines = trimmed.split(/\r?\n/).filter((l) => l.length > 0);
  if (lines.length < 2) return null;
  const header = splitCsv(lines[0] as string);
  if (header.length < 2 || !header.some((h) => /^[A-Za-z_][A-Za-z0-9_ .-]*$/.test(h))) return null;
  const out: Array<Record<string, string>> = [];
  for (const line of lines.slice(1)) {
    const cells = splitCsv(line);
    const row: Record<string, string> = {};
    header.forEach((h, i) => { row[h] = cells[i] ?? ''; });
    out.push(row);
  }
  return out;
}

function splitCsv(line: string): string[] {
  const out: string[] = []; let cur = ''; let quoted = false;
  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i] as string;
    if (quoted) {
      if (ch === '"') { if (line[i + 1] === '"') { cur += '"'; i += 1; } else quoted = false; }
      else cur += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ',') { out.push(cur.trim()); cur = ''; }
    else cur += ch;
  }
  out.push(cur.trim());
  return out;
}

/** The row a locator names: by the record's id column (the first column ending in `_id`), or its first column. */
function rowFor(rows: Array<Record<string, string>>, locator: string): Record<string, string> | undefined {
  const columns = Object.keys(rows[0] ?? {});
  const idColumn = columns.find((c) => /_id$/i.test(c)) ?? columns[0];
  if (idColumn === undefined) return undefined;
  return rows.find((r) => r[idColumn] === locator);
}

/** A cell as the value it states: a number when it reads as one, else the text. */
function cellValue(s: string): number | string {
  const t = s.trim();
  return /^-?\d+(\.\d+)?$/.test(t) ? Number(t) : t;
}

function sameValue(established: unknown, given: unknown): boolean {
  if (typeof established === 'number') {
    const g = typeof given === 'number' ? given : (typeof given === 'string' ? Number(given) : NaN);
    return Number.isFinite(g) && Math.abs(g - established) <= 1e-9 * Math.max(1, Math.abs(established));
  }
  return String(established) === String(given ?? '').trim();
}

/**
 * ESTABLISH the value from the record: refuse when the row is absent, when the field is
 * absent, or when the caller's value is not what the record says. Returns the value as
 * the record states it — that is what is stored.
 */
function establishFromRows(rows: Array<Record<string, string>>, record: RecordLocator, given: unknown, key: string, bad: (m: string) => never): unknown {
  const row = rowFor(rows, record.locator);
  if (row === undefined) bad(`${key}: record ${record.locator} is not in the cited document`);
  const r = row as Record<string, string>;
  if (record.field !== null) {
    if (!(record.field in r)) bad(`${key}: record ${record.locator} has no field ${record.field}`);
    const established = cellValue(r[record.field] as string);
    if (!sameValue(established, given)) bad(`${key}: the value offered (${JSON.stringify(given)}) is not what record ${record.locator} field ${record.field} says (${JSON.stringify(established)}); an observed value is established from its record, not from the caller`);
    return established;
  }
  const fields = record.fields as Record<string, string>;
  if (typeof given !== 'object' || given === null || Array.isArray(given)) bad(`${key}: a record mapping establishes an object value`);
  const g = given as Record<string, unknown>;
  for (const k of Object.keys(g)) if (!(k in fields)) bad(`${key}: value key ${k} is mapped to no column of record ${record.locator}`);
  const established: Record<string, unknown> = {};
  for (const [k, column] of Object.entries(fields)) {
    if (!(column in r)) bad(`${key}: record ${record.locator} has no column ${column}`);
    const v = cellValue(r[column] as string);
    if (k in g && !sameValue(v, g[k])) bad(`${key}: the value offered for ${k} (${JSON.stringify(g[k])}) is not what record ${record.locator} column ${column} says (${JSON.stringify(v)})`);
    established[k] = v;
  }
  return established;
}

@Injectable()
export class TwinService {
  constructor(private readonly series: SeriesService) {}

  async declare(cap: DeclareWrites, ctx: ScopeContext, intake: TwinIntake, actor: string, correlationId: string, twinId: string = newId()): Promise<{ twinId: string }> {
    const kind = await cap.readKindSchemas().selectAll().where('kind' as never, '=', intake.kind as never).executeTakeFirst();
    if (kind === undefined) throw new HttpException(errorBody('EYE_REQ_001', correlationId, `twin kind ${intake.kind} is not registered`), 422);
    const model = await cap.readBehaviourModels().selectAll().where('method_ref' as never, '=', intake.behaviourModelRef as never).executeTakeFirst();
    if (model === undefined) throw new HttpException(errorBody('EYE_REQ_001', correlationId, `behaviour model ${intake.behaviourModelRef} is not registered`), 422);
    await cap.declareTwin({
      twinId, tenantId: ctx.tenantId as string, domainId: ctx.domainId as string, kind: intake.kind, title: intake.title,
      statement: intake.statement, boundary: intake.boundary, owner: intake.owner, intendedDecisions: intake.intendedDecisions,
      interfaces: intake.interfaces, behaviourModelRef: intake.behaviourModelRef, validation: intake.validation,
      actor, eventId: newId(), correlationId,
    });
    return { twinId };
  }

  async openVersion(
    cap: VersionWrites, ctx: ScopeContext, twinId: string,
    a: { branchId: string; forkedFromVersion: number | null; knownAt: string; observedThrough: string | null; carryFrom: number | null; except: string[] },
    actor: string, correlationId: string,
  ): Promise<{ version: number }> {
    if (!/^[a-z][a-z0-9-]{0,40}$/.test(a.branchId)) throw new HttpException(errorBody('EYE_REQ_001', correlationId, 'branchId must be a short lower-case name'), 422);
    if (!a.except.every((k) => /^[a-z][a-z0-9_.-]*(:[A-Za-z0-9_.-]+)?$/.test(k))) throw new HttpException(errorBody('EYE_REQ_001', correlationId, 'except must list element keys'), 422);
    const version = await cap.openVersion({
      twinId, tenantId: ctx.tenantId as string, domainId: ctx.domainId as string, branchId: a.branchId,
      forkedFromVersion: a.forkedFromVersion, knownAt: a.knownAt, observedThrough: a.observedThrough, carryFrom: a.carryFrom, except: a.except,
      actor, eventId: newId(), correlationId,
    });
    return { version };
  }

  /**
   * Resolve every citation to the exact object it names — id, version, digest —
   * and carry back the truth state, lifecycle, record time, observation time,
   * validation state and controls that decide what the element may be.
   */
  private async resolve(cap: TwinReads, c: { kind: CitationKind; id: string; version: number | null }, correlationId: string): Promise<ResolvedCitation> {
    if (c.kind === 'entity') {
      const e = await cap.entity(c.id);
      if (e === undefined) throw new HttpException(errorBody('EYE_STA_001', correlationId, `entity ${c.id} is not a resolved entity in this domain`), 422);
      return { citation: { kind: 'entity', id: e.entity_id, version: 1, digest: entityDigest(e) }, controls: null, truthState: null,
               lifecycle: e.lifecycle_state, synthetic: false, recordedAt: null, eventTime: null, validation: null, payload: null };
    }
    const row: CitedObjectRow | undefined = await cap.citedObject({ objectType: OBJECT_TYPE_OF[c.kind], id: c.id, version: c.version });
    if (row === undefined) {
      throw new HttpException(errorBody('EYE_STA_001', correlationId,
        `${c.kind} ${c.id}${c.version === null ? '' : `@${c.version}`} is not an authorized ${OBJECT_TYPE_OF[c.kind]} object in this domain`), 422);
    }
    const q = row.quality_state;
    const validation = c.kind === 'forecast' && q !== null && typeof q === 'object' && typeof q['validation'] === 'string' ? q['validation'] : null;
    return {
      citation: { kind: c.kind, id: row.object_id, version: row.object_version, digest: row.content_digest },
      controls: { synthetic_state: row.synthetic_state, classification: row.classification, rights_profile: row.rights_profile,
                  residency_profile: row.residency_profile, retention_profile: row.retention_profile, access_policy_ref: row.access_policy_ref },
      truthState: row.truth_state, lifecycle: row.lifecycle_state, synthetic: row.synthetic_state,
      recordedAt: row.recorded_at ?? null, eventTime: row.event_time ?? null, validation, payload: row.payload ?? null,
    };
  }

  /**
   * Ground explicit elements into a draft version, under the version's two cut-offs.
   *
   *   record time   — every cited object must have been recorded at or before `known_at`;
   *   world time    — an observed or estimated element must not be valid from, or read
   *                   from a record dated, after `observed_through`;
   *   observed      — a value is ESTABLISHED from the cited uploaded record (row and
   *                   field) or from an OBSERVED claim, never taken from the caller;
   *                   a series window is read through ground-series, not here;
   *   predicted     — cites exactly one forecast version and carries its validation state.
   */
  async ground(
    cap: GroundWrites, ctx: ScopeContext, reader: Reader, twinId: string, version: number, elements: ElementIntake[], actor: string, correlationId: string,
  ): Promise<Array<{ key: string; material: boolean; health: string; syntheticState: boolean; inheritedValidation: string | null }>> {
    const bad = (msg: string): never => { throw new HttpException(errorBody('EYE_REQ_001', correlationId, msg), 422); };
    const v = (await cap.readVersions().selectAll()
      .where('twin_id' as never, '=', twinId as never).where('version' as never, '=', version as never).executeTakeFirst()) as Record<string, unknown> | undefined;
    if (v === undefined) throw new HttpException(errorBody('EYE_STA_001', correlationId, 'no authorized twin version matches'), 404);
    if (v['state'] !== 'draft') {
      throw new HttpException(errorBody('EYE_STA_001', correlationId,
        `version ${version} is admitted and immutable; open a new version to change the state`), 409);
    }
    const knownAt = instantOf(v['known_at']);
    const observedThrough = v['observed_through'] === null || v['observed_through'] === undefined ? null : dayOf(v['observed_through']);
    const out: Array<{ key: string; material: boolean; health: string; syntheticState: boolean; inheritedValidation: string | null }> = [];
    for (const e of elements) {
      const resolved: ResolvedCitation[] = [];
      for (const c of e.citations) resolved.push(await this.resolve(cap, { kind: c.kind, id: c.id, version: c.version ?? null }, correlationId));
      const substantive = resolved.filter((r) => r.citation.kind !== 'entity');
      // RECORD TIME: nothing recorded after known_at reaches this version.
      for (const r of substantive) {
        if (r.recordedAt !== null && new Date(r.recordedAt).getTime() > new Date(knownAt).getTime()) {
          bad(`${e.key}: ${r.citation.kind} ${r.citation.id}@${r.citation.version} was recorded at ${r.recordedAt}, after this version's known_at ${knownAt} — it was not known at record time`);
        }
      }
      const claims = resolved.filter((r) => r.citation.kind === 'claim');
      // A derived claim keeps its truth state and cannot become observed.
      let basis: string | null = null;
      if (claims.length > 0) {
        basis = claims[0]?.truthState ?? null;
        if (basis === null) bad(`${e.key}: the cited claim carries no truth state`);
        if (e.kind === 'observed' && basis !== 'observed') {
          bad(`${e.key}: a claim with truth state ${String(basis)} cannot ground an OBSERVED element; ground it as estimated (it keeps that truth state)`);
        }
        if (e.kind === 'estimated' && basis !== null && !['extracted', 'inferred', 'assessed'].includes(basis)) {
          bad(`${e.key}: an estimated element derived from a claim must cite an extracted, inferred or assessed claim`);
        }
      }
      // WORLD TIME: an observed or estimated element is a reading of the world at or before observed_through.
      if ((e.kind === 'observed' || e.kind === 'estimated') && observedThrough !== null) {
        if (e.validFrom !== null && e.validFrom !== undefined && e.validFrom > observedThrough) {
          bad(`${e.key}: valid from ${e.validFrom}, after this version's world cut-off ${observedThrough} — a value observed after observed_through does not reach this version`);
        }
        // A record's OWN date is its event time (an upload's stated document time); the acquisition instant is not the world.
        for (const r of substantive) {
          const day = r.eventTime === null ? null : r.eventTime.slice(0, 10);
          if (day !== null && day > observedThrough) {
            bad(`${e.key}: ${r.citation.kind} ${r.citation.id}@${r.citation.version} is dated ${day}, after this version's world cut-off ${observedThrough} — a record observed after observed_through does not reach this version`);
          }
        }
      }
      // OBSERVED: the value is established from the record that states it.
      let value: unknown = e.value;
      if (e.kind === 'observed') {
        const evidence = resolved.filter((r) => r.citation.kind === 'evidence');
        const observedClaims = claims.filter((r) => r.truthState === 'observed');
        if (evidence.length === 0 && observedClaims.length === 0) {
          bad(`${e.key}: an OBSERVED element must cite a directly observed evidence point or an observed claim`);
        }
        if (evidence.length > 0) {
          if (evidence.length > 1) bad(`${e.key}: an OBSERVED value is established from ONE record; cite the record that states it`);
          const ev = evidence[0] as ResolvedCitation;
          if (e.record === null || e.record === undefined) {
            bad(`${e.key}: an OBSERVED element citing evidence must name the record and field that establish its value (record: { locator, field } or { locator, fields }); a series observation is grounded through ground-series`);
          }
          const got = await this.series.retrieveBytes(reader, ev.citation.id, ev.citation.version, { read_for: 'twin.ground', twin_id: twinId, version: String(version), key: e.key });
          if ('refused' in got) {
            if (got.status === 403) throw got.error;
            bad(`${e.key}: the cited evidence could not be read to establish the value — ${got.refused}`);
          }
          const rows = rowsOf((got as { bytes: Buffer }).bytes);
          if (rows === null) bad(`${e.key}: the cited evidence is not a record set (rows with named columns); a series window is grounded through ground-series, which reads it under the two cut-offs`);
          value = establishFromRows(rows as Array<Record<string, string>>, e.record as RecordLocator, e.value, e.key, bad);
        } else {
          const claim = observedClaims[0] as ResolvedCitation;
          const stated = claim.payload?.['object_value'] ?? claim.payload?.['value'];
          if (stated === undefined || stated === null) bad(`${e.key}: the observed claim states no value that could establish this element`);
          const established = typeof stated === 'string' ? cellValue(stated) : stated;
          if (!sameValue(established, e.value)) bad(`${e.key}: the value offered (${JSON.stringify(e.value)}) is not what the observed claim states (${JSON.stringify(established)})`);
          value = established;
        }
      }
      // PREDICTED: exactly one forecast version, whose validation state is carried exactly.
      let inheritedValidation: string | null = null;
      if (e.kind === 'predicted') {
        const forecasts = resolved.filter((r) => r.citation.kind === 'forecast');
        if (forecasts.length !== 1) bad(`${e.key}: a PREDICTED element cites exactly one forecast version`);
        const f = forecasts[0] as ResolvedCitation;
        if (f.validation === null || !(VALIDATION_STATES as readonly string[]).includes(f.validation)) {
          bad(`${e.key}: forecast ${f.citation.id}@${f.citation.version} carries no validation state; it cannot ground a predicted element`);
        }
        inheritedValidation = f.validation;
      }
      let health: 'complete' | 'incomplete' | 'unreadable' | 'stale' = 'complete';
      if (resolved.some((r) => r.lifecycle === 'withdrawn' || r.lifecycle === 'retired')) health = 'unreadable';
      else if (e.validTo !== null && e.validTo !== undefined && observedThrough !== null && e.validTo < observedThrough) health = 'stale';
      else if (substantive.length === 0) health = 'incomplete';
      const syntheticState = substantive.some((r) => r.synthetic) || e.kind === 'simulated';
      const controls: Controls = foldControls(substantive.map((r) => r.controls).filter((c): c is ControlInput => c !== null));
      const material = await cap.groundElement({
        elementId: newId(), tenantId: ctx.tenantId as string, domainId: ctx.domainId as string, twinId, version, key: e.key, kind: e.kind,
        basisTruthState: basis, value, unit: e.unit ?? null, citations: resolved.map((r) => r.citation), health,
        validFrom: e.validFrom ?? null, validTo: e.validTo ?? null, confidence: e.confidence ?? null, syntheticState,
        controls: substantive.length === 0 ? {} : controls, inheritedValidation, actor, eventId: newId(), correlationId,
      });
      out.push({ key: e.key, material, health, syntheticState, inheritedValidation });
    }
    return out;
  }

  /**
   * Ground an OBSERVED element from a Phase 4 series, under the draft version's
   * two cut-offs: the series is assembled as known at `known_at` (record time)
   * with observations through `observed_through` (world time). Every evidence
   * version that contributed a point is cited exactly.
   */
  async groundFromSeries(
    cap: GroundWrites, ctx: ScopeContext, reader: Reader, twinId: string, version: number, seriesKey: string, key: string,
    actor: string, correlationId: string,
  ): Promise<{ key: string; material: boolean; health: string; points: number; knownAt: string; observedThrough: string | null; syntheticState: boolean }> {
    const v = (await cap.readVersions().selectAll()
      .where('twin_id' as never, '=', twinId as never).where('version' as never, '=', version as never).executeTakeFirst()) as Record<string, unknown> | undefined;
    if (v === undefined) throw new HttpException(errorBody('EYE_STA_001', correlationId, 'no authorized twin version matches'), 404);
    if (v['state'] !== 'draft') throw new HttpException(errorBody('EYE_STA_001', correlationId, `version ${version} is admitted and immutable`), 409);
    const knownAt = instantOf(v['known_at']);
    const observedThrough = v['observed_through'] === null || v['observed_through'] === undefined ? null : dayOf(v['observed_through']);
    const assembled = await this.series.assemble(reader, seriesKey, knownAt, observedThrough);
    const last = assembled.points[assembled.points.length - 1];
    const health: 'complete' | 'incomplete' = assembled.complete && last !== undefined ? 'complete' : 'incomplete';
    const citations: Citation[] = assembled.evidence.map((ev) => ({ kind: 'evidence' as const, id: ev.evidence_object_id, version: ev.evidence_version, digest: ev.evidence_digest }));
    const value = last === undefined
      ? { series_key: seriesKey, points: 0, latest: null, note: 'no observation is known under these cut-offs' }
      : { series_key: seriesKey, points: assembled.points.length, latest: { date: last.date, value: last.value },
          first: assembled.points[0]?.date ?? null, unreadable: assembled.unreadable.length };
    const material = await cap.groundElement({
      elementId: newId(), tenantId: ctx.tenantId as string, domainId: ctx.domainId as string, twinId, version, key, kind: 'observed',
      basisTruthState: null, value, unit: assembled.series.unit, citations, health,
      validFrom: assembled.points[0]?.date ?? null, validTo: last?.date ?? null, confidence: null,
      syntheticState: assembled.controls.synthetic_state && assembled.points.length > 0,
      controls: assembled.points.length > 0 ? assembled.controls : {}, inheritedValidation: null, actor, eventId: newId(), correlationId,
    });
    return { key, material, health, points: assembled.points.length, knownAt, observedThrough, syntheticState: assembled.controls.synthetic_state && assembled.points.length > 0 };
  }

  /**
   * ADMIT a draft: the canonical TWN version and the bound state set in one
   * transaction. The header inherits the fold of every cited object's controls
   * and the synthetic state of the world the twin describes.
   */
  async admit(
    cap: AdmitWrites, ctx: ScopeContext, twinId: string, version: number, allowIncomplete: boolean, purposeId: string, actor: string, correlationId: string,
  ): Promise<{ twinId: string; version: number; stateSetDigest: string; completeness: string; missingKeys: string[]; syntheticState: boolean }> {
    const twin = (await cap.readTwins().selectAll().where('twin_id' as never, '=', twinId as never).executeTakeFirst()) as Record<string, unknown> | undefined;
    const v = (await cap.readVersions().selectAll()
      .where('twin_id' as never, '=', twinId as never).where('version' as never, '=', version as never).executeTakeFirst()) as Record<string, unknown> | undefined;
    if (twin === undefined || v === undefined) throw new HttpException(errorBody('EYE_STA_001', correlationId, 'no authorized twin version matches'), 404);
    if (v['state'] !== 'draft') throw new HttpException(errorBody('EYE_STA_001', correlationId, `version ${version} is already admitted`), 409);
    const elements = (await cap.readElements().selectAll()
      .where('twin_id' as never, '=', twinId as never).where('version' as never, '=', version as never)
      .orderBy('key' as never).execute()) as Array<Record<string, unknown>>;
    const expected = await cap.stateSetDigest({ twinId, version });
    const missing = await cap.missingRequiredKeys({ twinId, version });
    const completeness = missing.length === 0 ? 'complete' : 'incomplete';
    if (completeness === 'incomplete' && !allowIncomplete) {
      throw new HttpException(errorBody('EYE_STA_001', correlationId,
        `required inputs are missing, unreadable or stale: ${missing.join(', ')}; ground them, or admit explicitly as incomplete (no run may use it)`), 409);
    }
    const controlInputs = elements.filter((e) => e['controls'] && Object.keys(e['controls'] as object).length > 0).map((e) => e['controls'] as ControlInput);
    const controls: Controls = controlInputs.length === 0
      ? foldControls([{ synthetic_state: false, classification: 'internal' }])
      : foldControls(controlInputs);
    const syntheticState = elements.some((e) => e['synthetic_state'] === true);
    const citations: Citation[] = elements.flatMap((e) => (e['citations'] as Citation[]));
    const dependencies = new Map<string, { kind: string; id: string; key: string }>();
    for (const e of elements) for (const c of e['citations'] as Citation[]) {
      const k = `${DEPENDS_ON_KIND[c.kind]}|${c.id}`;
      if (!dependencies.has(k)) dependencies.set(k, { kind: DEPENDS_ON_KIND[c.kind], id: c.id, key: String(e['key']) });
    }
    const now = new Date().toISOString();
    const knownAt = instantOf(v['known_at']);
    const observedThrough = v['observed_through'] === null || v['observed_through'] === undefined ? null : dayOf(v['observed_through']);
    const supersedes = v['supersedes'] === null || v['supersedes'] === undefined ? null : Number(v['supersedes']);
    const forkedFrom = v['forked_from_version'] === null || v['forked_from_version'] === undefined ? null : Number(v['forked_from_version']);
    const payload = {
      kind: twin['kind'], title: twin['title'], statement: twin['statement'], boundary: twin['boundary'], owner: `principal:${String(twin['owner_principal_id'])}`,
      intended_decisions: twin['intended_decisions'], interfaces: twin['interfaces'],
      behaviour_model: { ref: twin['behaviour_model_ref'], implementation_digest: null }, validation: twin['validation'],
      branch: { branch_id: v['branch_id'], forked_from_version: forkedFrom, supersedes }, version, known_at: knownAt, observed_through: observedThrough,
      state_set_digest: expected,
      elements: elements.map((e) => ({
        key: e['key'], kind: e['kind'], basis_truth_state: e['basis_truth_state'] ?? null, value: e['value'], unit: e['unit'] ?? null,
        material: e['material'], citations: e['citations'], health: e['health'], valid_from: dayOf(e['valid_from']), valid_to: dayOf(e['valid_to']),
        confidence: e['confidence'] === null || e['confidence'] === undefined ? null : Number(e['confidence']), synthetic_state: e['synthetic_state'] === true,
        inherited_validation: e['inherited_validation'] ?? null })),
      completeness, missing_keys: missing, synthetic_world: syntheticState,
    };
    const header: CanonicalHeader = {
      object_id: twinId, object_type: 'TWN', tenant_id: ctx.tenantId, domain_id: ctx.domainId, scope: 'DOMAIN',
      object_version: String(version), lifecycle_state: 'active', owning_component: 'CP-TWN-01',
      accountable_owner: `principal:${String(twin['owner_principal_id'])}`,
      source_object_ids: [...new Set(citations.filter((c) => c.kind !== 'entity').map((c) => `${OBJECT_TYPE_OF[c.kind as Exclude<CitationKind, 'entity'>]}:${c.id}@${c.version}`))],
      event_time: null, observation_time: observedThrough === null ? null : `${observedThrough}T00:00:00.000Z`,
      valid_from: null, valid_to: null, recorded_at: now, time_precision: observedThrough === null ? 'exact' : 'day',
      source_clock_quality: 'trusted', truth_state: 'asserted', synthetic_state: syntheticState, confidence: null, uncertainty: null,
      evidence_refs: [...new Set(citations.filter((c) => c.kind === 'evidence').map((c) => `EVD:${c.id}@${c.version}`))],
      provenance_ref: `principal:${String(twin['owner_principal_id'])}`, method_ref: `${String(twin['behaviour_model_ref'])}/twin-declaration@1.0.0`,
      contradiction_refs: [], corroboration_refs: [], human_refs: [`principal:${String(twin['owner_principal_id'])}`],
      classification: controls.classification, purpose_scope: purposeId, rights_profile: controls.rights_profile,
      residency_profile: controls.residency_profile, retention_profile: controls.retention_profile, access_policy_ref: controls.access_policy_ref,
      quality_profile: null, quality_state: { completeness, verification: 'verified' }, freshness_state: null, schema_ref: 'TWN@v1', ontology_ref: null,
      correction_of: null, supersedes: supersedes === null ? null : `TWN:${twinId}@${supersedes}`, withdrawal_reason: null,
      audit_correlation_id: correlationId, content_ref: null,
    };
    const check = validateHeader(header);
    if (!check.ok) throw new HttpException(errorBody('EYE_REQ_001', correlationId, `twin header invalid: ${(check.errors ?? []).join('; ')}`), 422);
    const headerDigest = canonicalHeaderDigest(header, payload);
    await cap.admitObject(header, payload, headerDigest);
    const r = await cap.admitVersion({
      twinId, tenantId: ctx.tenantId as string, domainId: ctx.domainId as string, version, expectedDigest: expected, headerDigest,
      allowIncomplete, syntheticState, controls, dependencies: [...dependencies.values()], actor, eventId: newId(), correlationId,
    });
    return { twinId, version, stateSetDigest: r.state_set_digest, completeness: r.completeness, missingKeys: r.missing_keys, syntheticState };
  }

  async list(cap: TwinReads): Promise<Array<Record<string, unknown>>> {
    const twins = (await cap.readTwins().selectAll().orderBy('declared_at' as never, 'desc').execute()) as Array<Record<string, unknown>>;
    const versions = (await cap.readVersions().selectAll().orderBy('version' as never).execute()) as Array<Record<string, unknown>>;
    return twins.map((t) => ({ ...t, versions: versions.filter((v) => String(v['twin_id']) === String(t['twin_id'])).map(withDays) }));
  }

  async get(cap: TwinReads, twinId: string): Promise<Record<string, unknown> | undefined> {
    const t = (await cap.readTwins().selectAll().where('twin_id' as never, '=', twinId as never).executeTakeFirst()) as Record<string, unknown> | undefined;
    if (t === undefined) return undefined;
    const versions = (await cap.readVersions().selectAll().where('twin_id' as never, '=', twinId as never).orderBy('version' as never).execute()) as Array<Record<string, unknown>>;
    const elements = (await cap.readElements().selectAll().where('twin_id' as never, '=', twinId as never).orderBy('version' as never).orderBy('key' as never).execute()) as Array<Record<string, unknown>>;
    const events = (await cap.readEvents().selectAll().where('twin_id' as never, '=', twinId as never).orderBy('occurred_at' as never).execute()) as Array<Record<string, unknown>>;
    const reconciliations = (await cap.readReconciliations().selectAll().where('twin_id' as never, '=', twinId as never).orderBy('recorded_at' as never).execute()) as Array<Record<string, unknown>>;
    /*
     * PROPAGATION PENDING. A correction case whose affected evidence REACHES this twin —
     * cited directly, or through a claim derived from it, a forecast that read it, or a
     * run built on it — and whose propagation walk has not completed, is shown as
     * pending. The reach is the same dependency reachability the walk uses (the same
     * table, the same bound), read here without writing anything: the walk is a
     * person's act (the CorrectionApplied consumer stays deferred), and until it runs
     * the twin's verification state says nothing about that case.
     */
    const cases = (await cap.readCorrections().selectAll().where('state' as never, 'in', ['applied', 'awaiting', 'validated'] as never).execute()) as Array<Record<string, unknown>>;
    const open = cases.filter((c) => c['propagation_state'] !== 'complete');
    const pending: Array<Record<string, unknown>> = [];
    if (open.length > 0) {
      const cited = new Set(elements.flatMap((e) => (e['citations'] as Citation[]).map((c) => c.id)));
      const deps = (await cap.readDependencies().selectAll().where('state' as never, '=', 'active' as never).execute()) as Array<Record<string, unknown>>;
      for (const c of open) {
        const affected = Array.isArray(c['affected_resolved']) ? (c['affected_resolved'] as unknown[]) : [];
        const roots = affected.map((x) => (typeof x === 'string' ? x : String((x as Record<string, unknown>)['evd_object_id'] ?? (x as Record<string, unknown>)['object_id'] ?? ''))).filter((x) => x.length > 0);
        if (roots.length === 0) continue;
        const via = roots.some((id) => cited.has(id)) ? 'cites the corrected evidence directly' : await this.reachedVia(cap, twinId, roots, cited, deps);
        if (via === null) continue;
        pending.push({ case_id: c['case_id'], kind: c['kind'], state: c['state'], propagation_state: c['propagation_state'] ?? 'pending', reached_via: via,
                       propagation: 'pending — an authorised operator has not yet run the dependency walk' });
      }
    }
    return { ...t, versions: versions.map((v) => ({ ...withDays(v), elements: elements.filter((e) => Number(e['version']) === Number(v['version'])).map(withDays) })), events, reconciliations, propagation_pending: pending };
  }

  /**
   * Does a set of corrected evidence roots REACH this twin through the dependency
   * table — a claim derived from the evidence, a forecast that read it, a run built on
   * a version that did? The same seeds and the same bound as the walk; nothing written.
   */
  private async reachedVia(cap: TwinReads, twinId: string, roots: string[], cited: Set<string>, deps: Array<Record<string, unknown>>): Promise<string | null> {
    const lineage = (await cap.readClaimLineage().selectAll().where('evidence_object_id' as never, 'in', roots as never).execute()) as Array<Record<string, unknown>>;
    const claims = [...new Set(lineage.map((l) => String(l['claim_object_id'])))];
    if (claims.some((id) => cited.has(id))) return 'cites a claim derived from the corrected evidence';
    const KIND_OF: Record<string, string> = { FCT: 'forecast', SCN: 'strategy', WRN: 'strategy', TWN: 'twin', SIM: 'run', OBJ: 'strategy', ASU: 'strategy', DEC: 'strategy', CMT: 'strategy', OUT: 'strategy' };
    let frontier: Array<{ kind: string; id: string; via: string }> = [
      ...roots.map((id) => ({ kind: 'evidence', id, via: 'the corrected evidence' })),
      ...claims.map((id) => ({ kind: 'claim', id, via: 'a claim derived from the corrected evidence' })),
    ];
    const seen = new Set<string>();
    for (let hop = 1; hop <= MAX_HOPS && frontier.length > 0; hop += 1) {
      const next: Array<{ kind: string; id: string; via: string }> = [];
      for (const seed of frontier) {
        for (const d of deps) {
          if (String(d['depends_on_kind']) !== seed.kind || String(d['depends_on_id']) !== seed.id) continue;
          const dependent = String(d['dependent_object_id']);
          const type = String(d['dependent_type']);
          if (dependent === twinId && type === 'TWN') return `cites ${seed.kind === 'forecast' ? 'a forecast' : seed.kind === 'run' ? 'a run' : seed.kind === 'claim' ? 'a claim' : 'an object'} that rests on ${seed.via}`;
          if (seen.has(dependent)) continue;
          seen.add(dependent);
          const kind = KIND_OF[type];
          if (kind !== undefined) next.push({ kind, id: dependent, via: `${type} that rests on ${seed.via}` });
        }
      }
      frontier = next;
    }
    return null;
  }

  /** Reconcile a simulated or predicted element against a later observation of the same key; the difference is recorded, nothing changes. */
  async reconcile(cap: GroundWrites, ctx: ScopeContext, twinId: string, a: { key: string; fromVersion: number; againstVersion: number; note: string }, actor: string, correlationId: string): Promise<unknown> {
    if (a.note.trim().length < 4) throw new HttpException(errorBody('EYE_REQ_001', correlationId, 'a reconciliation needs a note'), 422);
    return cap.recordReconciliation({ reconciliationId: newId(), tenantId: ctx.tenantId as string, domainId: ctx.domainId as string, twinId, key: a.key,
      fromVersion: a.fromVersion, againstVersion: a.againstVersion, note: a.note, actor, eventId: newId(), correlationId });
  }

  /**
   * The twin AS OF an instant: the latest version on the branch admitted at or
   * before it, with its verification state RECONSTRUCTED from the events at or
   * before that instant — a version invalidated later was verified then, and the
   * reader asked about then. What it is NOW is stated beside it, separately.
   */
  async asOf(cap: TwinReads, twinId: string, branchId: string, instant: string): Promise<Record<string, unknown> | undefined> {
    const versions = (await cap.readVersions().selectAll()
      .where('twin_id' as never, '=', twinId as never).where('branch_id' as never, '=', branchId as never)
      .where('state' as never, '=', 'admitted' as never).orderBy('version' as never, 'desc').execute()) as Array<Record<string, unknown>>;
    const at = new Date(instant).getTime();
    const v = versions.find((x) => new Date(instantOf(x['admitted_at'])).getTime() <= at);
    if (v === undefined) return undefined;
    const version = Number(v['version']);
    const elements = (await cap.readElements().selectAll()
      .where('twin_id' as never, '=', twinId as never).where('version' as never, '=', version as never).orderBy('key' as never).execute()) as Array<Record<string, unknown>>;
    const events = (await cap.readEvents().selectAll()
      .where('twin_id' as never, '=', twinId as never)
      .where('event' as never, 'in', ['version.admitted', 'version.unverified', 'version.reverified'] as never)
      .orderBy('occurred_at' as never).execute()) as Array<Record<string, unknown>>;
    let asOfState = 'verified';
    const later: Array<Record<string, unknown>> = [];
    for (const e of events) {
      if (Number((e['details'] as Record<string, unknown>)['version']) !== version) continue;
      const when = new Date(instantOf(e['occurred_at'])).getTime();
      const state = e['event'] === 'version.unverified' ? 'unverified' : 'verified';
      if (when <= at) asOfState = state;
      else later.push({ event: e['event'], occurred_at: instantOf(e['occurred_at']), details: e['details'] });
    }
    return {
      ...withDays(v), elements: elements.map(withDays), as_of: new Date(at).toISOString(),
      verification_state: asOfState, verification_state_as_of: asOfState, verification_state_now: v['verification_state'],
      events_after_instant: later,
    };
  }

  /** Compare two admitted versions (of any branches) element by element, on every material semantic; neither changes. */
  async compare(cap: TwinReads, twinId: string, a: number, b: number): Promise<Record<string, unknown>> {
    const read = async (version: number) => {
      const v = (await cap.readVersions().selectAll().where('twin_id' as never, '=', twinId as never).where('version' as never, '=', version as never).executeTakeFirst()) as Record<string, unknown> | undefined;
      const els = (await cap.readElements().selectAll().where('twin_id' as never, '=', twinId as never).where('version' as never, '=', version as never).execute()) as Array<Record<string, unknown>>;
      return { v, els: new Map(els.map((e) => [String(e['key']), e])) };
    };
    const A = await read(a); const B = await read(b);
    if (A.v === undefined || B.v === undefined) throw new Error('no authorized twin version matches');
    const keys = [...new Set([...A.els.keys(), ...B.els.keys()])].sort();
    const onlyA: string[] = []; const onlyB: string[] = []; const differing: Array<Record<string, unknown>> = []; let same = 0;
    // What an element IS: its kind and basis, its value AND unit, its validity, its citations, its health, its inherited validation, its controls.
    const semantics = (e: Record<string, unknown>) => ({
      kind: e['kind'], basis_truth_state: e['basis_truth_state'] ?? null, value: e['value'], unit: e['unit'] ?? null,
      valid_from: dayOf(e['valid_from']), valid_to: dayOf(e['valid_to']), citations: e['citations'], health: e['health'],
      confidence: e['confidence'] === null || e['confidence'] === undefined ? null : Number(e['confidence']),
      synthetic_state: e['synthetic_state'] === true, inherited_validation: e['inherited_validation'] ?? null, controls: e['controls'] ?? {},
    });
    for (const k of keys) {
      const ea = A.els.get(k); const eb = B.els.get(k);
      if (ea === undefined) { onlyB.push(k); continue; }
      if (eb === undefined) { onlyA.push(k); continue; }
      const sa = semantics(ea); const sb = semantics(eb);
      if (JSON.stringify(sa) === JSON.stringify(sb)) { same += 1; continue; }
      const changed = (Object.keys(sa) as Array<keyof typeof sa>).filter((f) => JSON.stringify(sa[f]) !== JSON.stringify(sb[f]));
      differing.push({ key: k, changed, a: sa, b: sb });
    }
    return {
      a: { version: a, branch_id: A.v['branch_id'], state_set_digest: A.v['state_set_digest'], forked_from_version: A.v['forked_from_version'], known_at: instantOf(A.v['known_at']), observed_through: dayOf(A.v['observed_through']) },
      b: { version: b, branch_id: B.v['branch_id'], state_set_digest: B.v['state_set_digest'], forked_from_version: B.v['forked_from_version'], known_at: instantOf(B.v['known_at']), observed_through: dayOf(B.v['observed_through']) },
      same, only_in_a: onlyA, only_in_b: onlyB, differing,
    };
  }
}

/** A timestamptz as the driver returns it (a Date) keeps its milliseconds; a string is parsed. */
function instantOf(v: unknown): string {
  if (v instanceof Date) return v.toISOString();
  return new Date(String(v)).toISOString();
}

/*
 * A DATE column names a day, not an instant. The driver hands it back as a Date at
 * LOCAL midnight, which JSON would then print in UTC — a day west of Greenwich —
 * so every day-valued column is rendered as the day it names before it leaves.
 */
const DAY_COLUMNS = ['observed_through', 'valid_from', 'valid_to'] as const;
function withDays<T extends Record<string, unknown>>(row: T): T {
  const out: Record<string, unknown> = { ...row };
  for (const c of DAY_COLUMNS) if (c in out) out[c] = dayOf(out[c]);
  return out as T;
}

function dayOf(v: unknown): string | null {
  if (v === null || v === undefined) return null;
  if (v instanceof Date) return `${v.getFullYear()}-${String(v.getMonth() + 1).padStart(2, '0')}-${String(v.getDate()).padStart(2, '0')}`;
  const s = String(v);
  return /^\d{4}-\d{2}-\d{2}/.test(s) ? s.slice(0, 10) : null;
}
