/**
 * THE WEAK-SIGNAL WORKBENCH — CP-6 B28 (0088 §S; F-P4-10: WS-08, UX-33-001..006, PR-25-001..006, CAP-FW-01/-02, OBJ-17/-18, JRN-06).
 *
 * The intakes (a shape check before the port — the port decides the rules and says so), and the reads the workbench renders:
 *   the queue         the weak signals with their maturity, disposition, independent sources, novelty and conditions — each above the
 *                     reader's clearance WITHHELD with the reason (the classification its evidence carries), never silently dropped;
 *                     the latest ranking with each place's explanation;
 *   a signal          its observation, baseline and novelty basis, the evidence pattern (source, publisher, origin, stance, the verdict
 *                     recorded when added), its events, the warning candidate an escalation submitted;
 *   the detections    the recent readings — fired, quiet, and HELD with the reason (a source gap, a drifting baseline, too few points);
 *   the detectors     the registry: available with the digest registered and the digest of the code as it stands (equal, or DRIFTED),
 *                     ABSENT with the reason; and the FALSE-POSITIVE CONTROLS — every series detector on the four SYNTHETIC fixtures
 *                     (seeded, null, drift, source gap) through the same SQL, the expected answer beside the one it gave;
 *   the indicators    the registry's governance: lineage, classification, expiry (expired read on the database clock), review cadence
 *                     (overdue on the database clock), state, the ledger — withheld above the reader's clearance.
 */
import { HttpException, Injectable } from '@nestjs/common';
import { sql } from 'kysely';
import { errorBody } from '@eye/contracts';
import type { AuthenticatedPrincipal } from '../../shared/auth-types.js';
import { clearanceOf, covers, type TargetContext } from '../../shared/clearance.js';
import type { SignalReads } from './signals.capabilities.js';
import { DETECTOR_FIXTURES, answerOf, type SeriesDetectorKey } from './detector-fixtures.js';

type Row = Record<string, unknown>;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DAY = /^\d{4}-\d{2}-\d{2}$/;
const isObj = (v: unknown): v is Row => v !== null && typeof v === 'object' && !Array.isArray(v);
const bad = (correlationId: string, message: string): never => { throw new HttpException(errorBody('EYE_REQ_001', correlationId, message), 422); };
const optInt = (v: unknown, what: string, c: string): number | null => {
  if (v === undefined || v === null) return null;
  if (!Number.isInteger(v)) bad(c, `${what} is a whole number`);
  return v as number;
};
const optInstant = (v: unknown, what: string, c: string): string | null => {
  if (v === undefined || v === null || v === '') return null;
  if (typeof v !== 'string' || Number.isNaN(new Date(v).getTime())) bad(c, `${what} is an instant (ISO 8601)`);
  return new Date(v as string).toISOString();
};

/* ───────────────────────── the intakes ───────────────────────── */

export interface ScanIntake { asOf: string | null; maxItems: number | null }
export function validateScan(p: Row, c: string): ScanIntake {
  if (p['asOf'] !== undefined && p['asOf'] !== null && (typeof p['asOf'] !== 'string' || !DAY.test(p['asOf']))) bad(c, 'asOf is an observation day (YYYY-MM-DD): the detectors read in event time');
  const maxItems = optInt(p['maxItems'], 'maxItems', c);
  if (maxItems !== null && (maxItems < 0 || maxItems > 1000)) bad(c, 'maxItems is 0..1000');
  return { asOf: typeof p['asOf'] === 'string' ? p['asOf'] : null, maxItems };
}

export interface NominateIntake { title: string; statement: string; subjectKind: 'indicator' | 'entity' | 'none'; subjectId: string | null; evidence: Array<{ object_id: string; version?: number | null; stance?: string }>;
                                  observation: Row; baseline: Row; noveltyBasis: Row; confidence: number | null }
export function validateNominate(p: Row, c: string): NominateIntake {
  if (typeof p['title'] !== 'string' || p['title'].trim().length < 3 || p['title'].length > 300) bad(c, 'title is 3..300 characters');
  if (typeof p['statement'] !== 'string' || p['statement'].trim().length < 8 || p['statement'].length > 4000) bad(c, 'statement is 8..4000 characters');
  const subjectKind = (p['subjectKind'] ?? 'none') as string;
  if (!['indicator', 'entity', 'none'].includes(subjectKind)) bad(c, 'subjectKind is indicator, entity or none');
  const subjectId = typeof p['subjectId'] === 'string' ? p['subjectId'] : null;
  if ((subjectKind === 'none') !== (subjectId === null) || (subjectId !== null && !UUID.test(subjectId))) bad(c, 'an indicator or entity subject names its id; none names none');
  const ev = p['evidence'];
  if (!Array.isArray(ev) || ev.length === 0 || ev.length > 50) bad(c, 'evidence is a list of 1..50 items {object_id, version?, stance?}');
  for (const e of ev as unknown[]) {
    if (!isObj(e) || typeof e['object_id'] !== 'string' || !UUID.test(e['object_id']) || (e['stance'] !== undefined && e['stance'] !== 'supporting' && e['stance'] !== 'contradicting')
        || (e['version'] !== undefined && e['version'] !== null && !Number.isInteger(e['version']))) bad(c, 'each evidence item is {object_id: uuid, version?: integer, stance?: supporting | contradicting}');
  }
  for (const k of ['observation', 'baseline', 'noveltyBasis']) if (!isObj(p[k])) bad(c, `${k} is an object`);
  const nb = p['noveltyBasis'] as Row;
  if (typeof nb['basis'] !== 'string' || nb['basis'].trim().length < 8) bad(c, 'noveltyBasis.basis says what is new against what (≥ 8 characters)');
  const confidence = p['confidence'] === undefined || p['confidence'] === null ? null : Number(p['confidence']);
  if (confidence !== null && !(confidence >= 0 && confidence <= 1)) bad(c, 'confidence is a number in [0, 1]');
  return { title: String(p['title']).trim(), statement: String(p['statement']).trim(), subjectKind: subjectKind as NominateIntake['subjectKind'], subjectId,
           evidence: ev as NominateIntake['evidence'], observation: p['observation'] as Row, baseline: p['baseline'] as Row, noveltyBasis: nb, confidence };
}

export interface EvidenceIntake { objectId: string; objectVersion: number | null; stance: 'supporting' | 'contradicting'; expectedVersion: number | null }
export function validateEvidence(p: Row, c: string): EvidenceIntake {
  if (typeof p['objectId'] !== 'string' || !UUID.test(p['objectId'])) bad(c, 'objectId is the evidence (EVD) or claim (CLM) object id');
  const stance = (p['stance'] ?? 'supporting') as string;
  if (stance !== 'supporting' && stance !== 'contradicting') bad(c, 'stance is supporting or contradicting');
  return { objectId: String(p['objectId']), objectVersion: optInt(p['objectVersion'], 'objectVersion', c), stance: stance as EvidenceIntake['stance'], expectedVersion: optInt(p['expectedVersion'], 'expectedVersion', c) };
}

const conditions = (v: unknown, what: string, c: string): unknown[] | null => {
  if (v === undefined || v === null) return null;
  if (!Array.isArray(v) || v.length > 20) bad(c, `${what} is a list of at most 20 conditions`);
  for (const x of v as unknown[]) {
    if (!isObj(x) || typeof x['text'] !== 'string' || x['text'].trim().length < 8 || x['text'].length > 500 || !['observation', 'indicator', 'source', 'deadline'].includes(String(x['kind']))) {
      bad(c, `each ${what} condition is {text: 8..500 characters, kind: observation | indicator | source | deadline, indicator_id?, by?}`);
    }
  }
  return v as unknown[];
};

export interface DispositionIntake { disposition: 'confirm' | 'monitor' | 'dismiss'; note: string; falsify: unknown[] | null; reviewBy: string | null; expectedVersion: number | null }
export function validateDisposition(p: Row, c: string): DispositionIntake {
  const d = p['disposition'];
  if (d === 'escalate') bad(c, 'an escalation is its own act (POST …/signals/:id/escalate): it submits a warning candidate');
  if (d !== 'confirm' && d !== 'monitor' && d !== 'dismiss') bad(c, 'disposition is confirm, monitor or dismiss');
  if (typeof p['note'] !== 'string' || p['note'].trim().length < 8 || p['note'].length > 2000) bad(c, 'a disposition states why in 8..2000 characters (note)');
  return { disposition: d as DispositionIntake['disposition'], note: String(p['note']).trim(), falsify: conditions(p['falsify'], 'falsify', c),
           reviewBy: optInstant(p['reviewBy'], 'reviewBy', c), expectedVersion: optInt(p['expectedVersion'], 'expectedVersion', c) };
}

export interface ConditionsIntake { strengthen: unknown[] | null; falsify: unknown[] | null; expectedVersion: number | null }
export function validateConditions(p: Row, c: string): ConditionsIntake {
  const strengthen = conditions(p['strengthen'], 'strengthen', c); const falsify = conditions(p['falsify'], 'falsify', c);
  if (strengthen === null && falsify === null) bad(c, 'name the strengthen conditions, the falsify conditions or both');
  return { strengthen, falsify, expectedVersion: optInt(p['expectedVersion'], 'expectedVersion', c) };
}

export interface EscalateIntake { note: string; consequence: 'C1' | 'C2' | 'C3' | 'C4'; confidence: number | null; windowHours: number | null; affected: Row | null; expectedVersion: number | null }
export function validateEscalate(p: Row, c: string): EscalateIntake {
  if (typeof p['note'] !== 'string' || p['note'].trim().length < 8 || p['note'].length > 2000) bad(c, 'an escalation states why in 8..2000 characters (note)');
  if (!['C1', 'C2', 'C3', 'C4'].includes(String(p['consequence']))) bad(c, 'consequence is the class C1..C4 the warning would carry');
  const confidence = p['confidence'] === undefined || p['confidence'] === null ? null : Number(p['confidence']);
  if (confidence !== null && !(confidence >= 0 && confidence <= 1)) bad(c, 'confidence is a number in [0, 1]');
  const windowHours = optInt(p['windowHours'], 'windowHours', c);
  if (windowHours !== null && (windowHours < 1 || windowHours > 8760)) bad(c, 'windowHours is 1..8760');
  if (p['affected'] !== undefined && p['affected'] !== null && !isObj(p['affected'])) bad(c, 'affected is {objectives?, assets?, actors?, geographies?, horizon?}');
  return { note: String(p['note']).trim(), consequence: p['consequence'] as EscalateIntake['consequence'], confidence, windowHours, affected: (p['affected'] as Row | undefined) ?? null,
           expectedVersion: optInt(p['expectedVersion'], 'expectedVersion', c) };
}

export interface GovernIntake { classification: string | null; expiresAt: string | null; reviewEveryDays: number | null; lineageNote: string | null }
export function validateGovern(p: Row, c: string): GovernIntake {
  const classification = p['classification'] === undefined || p['classification'] === null ? null : String(p['classification']);
  if (classification !== null && !['public', 'internal', 'confidential', 'restricted'].includes(classification)) bad(c, 'classification is public, internal, confidential or restricted');
  const reviewEveryDays = optInt(p['reviewEveryDays'], 'reviewEveryDays', c);
  const lineageNote = typeof p['lineageNote'] === 'string' && p['lineageNote'].trim() !== '' ? p['lineageNote'].trim() : null;
  const out = { classification, expiresAt: optInstant(p['expiresAt'], 'expiresAt', c), reviewEveryDays, lineageNote };
  if (out.classification === null && out.expiresAt === null && out.reviewEveryDays === null && out.lineageNote === null) bad(c, 'name a classification, an expiry, a review cadence or a lineage note');
  return out;
}
export function validateReason(p: Row, c: string, what: string): string {
  if (typeof p['reason'] !== 'string' || p['reason'].trim().length < 8 || p['reason'].length > 2000) bad(c, `${what} states why in 8..2000 characters (reason)`);
  return String(p['reason']).trim();
}
export function validateRenew(p: Row, c: string): { expiresAt: string; reason: string } {
  const expiresAt = optInstant(p['expiresAt'], 'expiresAt', c);
  if (expiresAt === null) bad(c, 'a renewal names the new expiry (expiresAt)');
  return { expiresAt: expiresAt as string, reason: validateReason(p, c, 'a renewal') };
}

/* ───────────────────────── the reads ───────────────────────── */

@Injectable()
export class SignalsService {
  /** Whether the reader's clearance in this context covers a signal's classification; what it does not cover is withheld with the reason. */
  private withheld(reader: AuthenticatedPrincipal, target: TargetContext, classification: string): string | null {
    const clearance = clearanceOf(reader, target);
    return covers(clearance, classification) ? null : `withheld: the signal is classified ${classification}; the reader's clearance in this domain is ${clearance}`;
  }

  /** The queue: the signals (newest change first), each withheld above the reader's clearance; the latest ranking; the recent detections. */
  async queue(cap: SignalReads, reader: AuthenticatedPrincipal, target: TargetContext): Promise<Row> {
    const rows = (await cap.readSignals().selectAll().orderBy('updated_at' as never, 'desc').limit(300).execute()) as Row[];
    const signals = rows.map((s) => {
      const why = this.withheld(reader, target, String(s['classification']));
      return why === null ? s : { signal_id: s['signal_id'], version: s['version'], classification: s['classification'], maturity: s['maturity'], withheld: why };
    });
    const ranking = ((await cap.readRankings().selectAll().orderBy('ranked_at' as never, 'desc').limit(1).execute()) as Row[])[0] ?? null;
    const visible = new Set(signals.filter((s) => s['withheld'] === undefined).map((s) => String(s['signal_id'])));
    const rankedOrder = ranking === null ? null : { ...ranking, ordering: (ranking['ordering'] as Row[]).map((p) => (visible.has(String(p['signal_id'])) ? p : { position: p['position'], signal_id: p['signal_id'], withheld: 'above the reader\'s clearance' })) };
    const detections = (await cap.readDetections().select(['detection_id', 'detector_key', 'detector_version', 'subject_kind', 'subject_id', 'as_of', 'measure', 'fired', 'held_reason', 'trigger', 'run_id', 'recorded_at',
      sql`reading -> 'held_detail'`.as('held_detail')] as never).orderBy('recorded_at' as never, 'desc').limit(100).execute()) as Row[];
    const counts = { total: rows.length, by_maturity: tally(rows, 'maturity'), by_disposition: tally(rows, (r) => String(r['disposition'] ?? 'none')), by_nominator: tally(rows, 'nominator_kind') };
    return { signals, ranking: rankedOrder, detections, held: detections.filter((d) => d['held_reason'] !== null), counts };
  }

  /** One signal: the object, its evidence pattern, its events, the candidate its escalation submitted (or withheld above the reader's clearance). */
  async get(cap: SignalReads, signalId: string, reader: AuthenticatedPrincipal, target: TargetContext, correlationId: string): Promise<Row> {
    const s = (await cap.readSignals().selectAll().where('signal_id' as never, '=', signalId as never).executeTakeFirst()) as Row | undefined;
    if (s === undefined) throw new HttpException(errorBody('EYE_STA_001', correlationId, 'no such signal in this domain'), 404);
    const why = this.withheld(reader, target, String(s['classification']));
    if (why !== null) return { signal_id: signalId, version: s['version'], classification: s['classification'], maturity: s['maturity'], withheld: why };
    const evidence = (await cap.readSignalEvidence().selectAll().where('signal_id' as never, '=', signalId as never).orderBy('added_at' as never).execute()) as Row[];
    const events = (await cap.readSignalEvents().selectAll().where('signal_id' as never, '=', signalId as never).orderBy('occurred_at' as never).execute()) as Row[];
    const candidate = s['candidate_id'] === null ? null
      : ((await cap.readCandidates().select(['candidate_id', 'state', 'warning_id', 'origin_key', 'submitted_at', 'outcome'] as never).where('candidate_id' as never, '=', s['candidate_id'] as never).executeTakeFirst()) as Row | undefined) ?? null;
    const detection = s['detection_id'] === null ? null
      : ((await cap.readDetections().selectAll().where('detection_id' as never, '=', s['detection_id'] as never).executeTakeFirst()) as Row | undefined) ?? null;
    return { ...s, evidence, events, candidate, detection,
             independence: { rule: 'independent: a different source, publisher and evidence digest, neither synthetic; dependent: a shared source, publisher, digest or declared upstream; unknown: not verifiable from the records — never counted',
                             counted_supporting: s['independent_sources'], counted_contradicting: s['contradicting_sources'], threshold: s['corroboration_threshold'],
                             unknown: evidence.filter((e) => e['independence'] === 'unknown').length, dependent: evidence.filter((e) => e['independence'] === 'dependent').length } };
  }

  /**
   * The detectors: the registry (the digest registered and the digest of the code as it stands — equal, or DRIFTED), the absent with their
   * reasons, and the false-positive controls on the SYNTHETIC fixtures (every series detector, the same SQL as the scan, nothing recorded).
   */
  async detectors(cap: SignalReads): Promise<Row> {
    const rows = (await cap.readDetectors().selectAll().orderBy('detector_key' as never).orderBy('detector_version' as never).execute()) as Row[];
    const FUNCS: Record<string, string[]> = {
      novelty: ['prediction.signal_series_prepare(jsonb,date,int,int,int,int)', 'prediction.signal_baseline_drift(numeric[],numeric)', 'prediction.signal_measure_novelty(jsonb,date,jsonb)'],
      acceleration: ['prediction.signal_series_prepare(jsonb,date,int,int,int,int)', 'prediction.signal_baseline_drift(numeric[],numeric)', 'prediction.signal_measure_acceleration(jsonb,date,jsonb)'],
      change_point: ['prediction.signal_series_prepare(jsonb,date,int,int,int,int)', 'prediction.signal_measure_change_point(jsonb,date,jsonb)'],
      relationship_change: ['prediction.signal_measure_relationship_change(uuid,uuid,uuid,date,jsonb)'],
      diffusion: ['prediction.signal_resolve_object(uuid,uuid,uuid,int)', 'prediction.signal_measure_diffusion(uuid,uuid,uuid,date,jsonb)'],
    };
    const registry: Row[] = [];
    for (const r of rows) {
      const fns = FUNCS[String(r['detector_key'])];
      const current = r['status'] === 'available' && fns !== undefined ? await cap.currentDigest(fns) : null;
      registry.push({ ...r, current_digest: current, code_state: r['status'] !== 'available' ? 'absent' : current === r['code_digest'] ? 'as registered' : 'DRIFTED — the code no longer matches the registered digest' });
    }
    const controls: Row[] = [];
    for (const f of DETECTOR_FIXTURES) {
      for (const key of ['novelty', 'acceleration', 'change_point'] as SeriesDetectorKey[]) {
        const det = rows.filter((r) => r['detector_key'] === key && r['status'] === 'available').at(-1);
        if (det === undefined) continue;
        const reading = await cap.measureSeries({ detectorKey: key, points: f.points, asOf: f.asOf, params: det['params'] as Row });
        const got = answerOf(reading);
        controls.push({ fixture: f.key, data_provenance: f.data_provenance, description: f.description, detector: key, detector_version: det['detector_version'], expected: f.expect[key], got,
                        passed: got === f.expect[key], measure: reading['measure'] ?? null, held_detail: reading['held_detail'] ?? null });
      }
    }
    return { detectors: registry, absent: registry.filter((r) => r['status'] === 'absent').map((r) => ({ detector: r['detector_key'], reason: r['absent_reason'] })), controls,
             model_class: 'weak_signal_anomaly — deterministic, transparent measures; no learned weights; a changed function is a new version' };
  }

  /** The indicator registry's governance: expiry and review read on the DATABASE clock; withheld above the reader's clearance. */
  async indicators(cap: SignalReads, reader: AuthenticatedPrincipal, target: TargetContext): Promise<Row> {
    const rows = (await cap.readIndicators().select(['indicator_id', 'series_key', 'description', 'comparator', 'threshold', 'consecutive_days', 'owner_principal_id', 'state', 'last_observation_at',
      'last_evaluated_at', 'breached', 'classification', 'expires_at', 'review_every_days', 'next_review_at', 'lineage', 'retired_at', 'retired_by', 'retire_reason', 'renewed_at', 'defined_at',
      sql`(expires_at is not null and expires_at <= clock_timestamp())`.as('expired'), sql`(next_review_at is not null and next_review_at <= clock_timestamp())`.as('review_overdue'),
      sql`clock_timestamp()`.as('as_of')] as never).orderBy('defined_at' as never).execute()) as Row[];
    const events = (await cap.readIndicatorEvents().selectAll().orderBy('occurred_at' as never, 'desc').limit(300).execute()) as Row[];
    const indicators = rows.map((i) => {
      const clearance = clearanceOf(reader, target);
      if (!covers(clearance, String(i['classification']))) return { indicator_id: i['indicator_id'], classification: i['classification'], state: i['state'], withheld: `withheld: the indicator is classified ${String(i['classification'])}; the reader's clearance in this domain is ${clearance}` };
      return { ...i, governance_state: i['state'] === 'retired' ? 'retired — not evaluated' : i['expired'] === true ? 'expired — not evaluated until renewed' : 'active',
               events: events.filter((e) => e['indicator_id'] === i['indicator_id']) };
    });
    return { indicators, as_of: rows[0]?.['as_of'] ?? null };
  }
}

function tally(rows: Row[], key: string | ((r: Row) => string)): Record<string, number> {
  const out: Record<string, number> = {};
  for (const r of rows) { const k = typeof key === 'string' ? String(r[key]) : key(r); out[k] = (out[k] ?? 0) + 1; }
  return out;
}
