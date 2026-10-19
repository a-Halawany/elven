/**
 * B82 §TS (0121_b82_x_ts) — THE DISPLAY-TRUTH INTAKE AND REFUSALS (pure): the request's refs shaped (types only — the port decides every
 * rule), the refusal noun `display truth` in the CLASS form, mapped here meanwhile and centrally by the integrator at the fold
 * (observation-errors.ts): 403 actor|authority|separation_of_duties|access · 404 unknown_* · 409 state|stale|duplicate|held|expired · 422
 * otherwise. THREE CLAIMS: construction only.
 */
import { HttpException } from '@nestjs/common';
import { errorBody } from '@eye/contracts';

type Row = Record<string, unknown>;
export const DISPLAY_TRUTH_ACTION = 'objects.display_truth.read' as const;
export const DISPLAY_TRUTH_NOUNS = ['display truth'] as const;
export const DISPLAY_TRUTH_MAX_REFS = 200;
export interface TruthRef { type: string; id: string; version: number }

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const TYPE = /^[A-Z]{3}$/;
const NOUN_RE = new RegExp(`^(${DISPLAY_TRUTH_NOUNS.join('|')}) rejected \\(([a-z_]+)\\)`);

export function statusOfClass(cls: string): number {
  if (cls === 'actor' || cls === 'authority' || cls === 'separation_of_duties' || cls === 'access') return 403;
  if (cls.startsWith('unknown_')) return 404;
  if (['state', 'stale', 'duplicate', 'held', 'expired'].includes(cls)) return 409;
  return 422;
}
const CODE = (s: number) => (s === 403 ? 'EYE_AUT_001' : s === 404 ? 'EYE_STA_001' : s === 409 ? 'EYE_STA_002' : 'EYE_REQ_001') as 'EYE_AUT_001' | 'EYE_STA_001' | 'EYE_STA_002' | 'EYE_REQ_001';

/** A port's raised `display truth rejected (<class>): …` → its HTTP answer in the PORT's words; anything else untouched. */
export function asDisplayTruthRefusal(e: unknown, correlationId: string): unknown {
  if (e instanceof HttpException || !(e instanceof Error)) return e;
  const m = NOUN_RE.exec(e.message);
  if (m === null) return e;
  const status = statusOfClass(m[2]!);
  return new HttpException(errorBody(CODE(status), correlationId, e.message), status);
}
export function refuseDisplayTruth(cls: string, message: string, correlationId: string): HttpException {
  const status = statusOfClass(cls);
  return new HttpException(errorBody(CODE(status), correlationId, `display truth rejected (${cls}): ${message}`), status);
}

/** The refs of a display-truth read: 1–200 `{ type, id, version }`, or the refusal naming the first problem (nothing is guessed). */
export function refsIntake(body: Row, correlationId: string): TruthRef[] {
  const refs = body['refs'];
  if (!Array.isArray(refs) || refs.length === 0 || refs.length > DISPLAY_TRUTH_MAX_REFS) {
    throw refuseDisplayTruth('refs', `refs names 1 to ${DISPLAY_TRUTH_MAX_REFS} recorded products as [{ type, id, version }]`, correlationId);
  }
  return refs.map((r: unknown, i: number) => {
    const x = (r ?? {}) as Row;
    const type = x['type']; const id = x['id']; const version = x['version'];
    if (typeof type !== 'string' || !TYPE.test(type) || typeof id !== 'string' || !UUID.test(id) || typeof version !== 'number' || !Number.isInteger(version) || version < 1) {
      throw refuseDisplayTruth('refs', `ref ${i + 1} names no recorded product as { type (three capitals), id (a uuid), version (1 or more) }`, correlationId);
    }
    return { type, id: id.toLowerCase(), version };
  });
}
