/**
 * CLIENT INSTRUMENTATION — CP-6 B92 §UX (0113_b92_x_ux; UX-70-002/-003/-005; DESIGN D12).
 *
 * The client records an experience event ONLY when the server's own answer says it may: the event key is an APPROVED, NOT HELD definition of
 * the domain's instrumentation catalogue, AND this person has CURRENTLY consented to its purpose (both from `analytics.consent.read`, read
 * once per page). Otherwise nothing is sent and NOTHING IS QUEUED — no buffer waits for a consent that may never come. What is sent is the
 * step's outcome, its DURATION and the definition's whitelisted fields (a field the whitelist does not name is dropped here, and the server
 * refuses it anyway) — never content, never text, never an identifier: the server stores a per-purpose, per-day pseudonym and never the
 * person. The arm of an experiment is the SERVER's (the assignment read; the control without consent).
 *
 * Instrumented journeys (their definitions are declared and privacy-reviewed through the governed ports — the act's step):
 *   operating-review: open → drill_down → done   (§OR's page; the integrator wires `useJourney(scope, OPERATING_REVIEW)` into it)
 *   experience-page:  open → act                 (this part's page)
 */
import { useEffect, useRef } from 'react';
import { experience, type SelfState } from './analytics-ux-b92';
import type { Scope } from './observation';

type Row = Record<string, unknown>;
export interface JourneySpec { key: string; steps: readonly string[] }
export const OPERATING_REVIEW: JourneySpec = { key: 'operating-review', steps: ['open', 'drill_down', 'done'] };
export const EXPERIENCE_PAGE: JourneySpec = { key: 'experience-page', steps: ['open', 'act'] };
export const OUTCOMES = ['started', 'success', 'failure', 'error', 'recovered', 'abandoned', 'cancelled'] as const;
export type Outcome = (typeof OUTCOMES)[number];
export type TrackResult = 'sent' | 'not_loaded' | 'not_defined' | 'not_consented' | 'refused' | 'failed';

/** The catalogue a decision is made from: the server's self read (null until it answered). */
export type Catalogue = Pick<SelfState, 'purposes' | 'definitions' | 'experiments'> | null;

/**
 * May this event be sent? — only for an approved, open definition of the catalogue whose purpose this person consented to NOW. Pure.
 * Returns the definition, or the reason it may not be sent.
 */
export function admissible(cat: Catalogue, eventKey: string): { ok: true; definition: SelfState['definitions'][number] } | { ok: false; reason: 'not_loaded' | 'not_defined' | 'not_consented' } {
  if (cat === null) return { ok: false, reason: 'not_loaded' };
  const d = cat.definitions.find((x) => x.event_key === eventKey);
  if (d === undefined) return { ok: false, reason: 'not_defined' };
  const p = cat.purposes.find((x) => x.purpose_key === d.purpose_key);
  if (p === undefined || !p.consented) return { ok: false, reason: 'not_consented' };
  return { ok: true, definition: d };
}

/** The fields the definition whitelists, with admissible values only (anything else is DROPPED here — minimisation on the client too). Pure. */
export function whitelisted(spec: Record<string, Row>, fields: Record<string, unknown> | undefined): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(fields ?? {})) {
    const s = spec[k];
    if (s === undefined) continue;
    const t = s['type'];
    if (t === 'enum' && typeof v === 'string' && Array.isArray(s['values']) && (s['values'] as string[]).includes(v)) out[k] = v;
    else if ((t === 'int' || t === 'duration_ms') && typeof v === 'number' && Number.isInteger(v) && v >= Number(s['min']) && v <= Number(s['max'])) out[k] = v;
    else if (t === 'bool' && typeof v === 'boolean') out[k] = v;
  }
  return out;
}

/** The coarse device class (a viewport width, never a user agent) and the two-letter language (never the region). Pure. */
export function deviceClassOf(width: number): 'desktop' | 'tablet' | 'mobile' { return width >= 1024 ? 'desktop' : width >= 600 ? 'tablet' : 'mobile'; }
export function languageOf(tag: string | undefined | null): string | null { const m = /^([a-zA-Z]{2})(?:[-_]|$)/.exec(tag ?? ''); return m === null ? null : (m[1] as string).toLowerCase(); }

/** A whole-millisecond duration between two instants, bounded as the server bounds it (0 – 24 h). Pure. */
export function durationMs(from: number, to: number): number { return Math.max(0, Math.min(86_400_000, Math.round(to - from))); }

export interface Sender { (payload: { eventKey: string; outcome: Outcome; durationMs?: number; fields?: Record<string, unknown>; deviceClass?: string | null; locale?: string | null; experimentId?: string | null }): Promise<{ ok: boolean; collected?: boolean }> }

/**
 * The tracker: decides from the catalogue, sends at once or not at all (no queue). The clock and the sender are injected (pure to test).
 */
export class Tracker {
  private catalogue: Catalogue = null;
  private readonly started = new Map<string, number>();
  constructor(private readonly send: Sender, private readonly now: () => number = () => Date.now(), private readonly context: { deviceClass: string | null; locale: string | null } = { deviceClass: null, locale: null }) {}
  load(cat: Catalogue): void { this.catalogue = cat; }
  get loaded(): boolean { return this.catalogue !== null; }
  /** Mark a step's start (for its duration); sends `started` when the definition admits it. */
  async start(journey: JourneySpec, step: string, fields?: Record<string, unknown>): Promise<TrackResult> {
    this.started.set(`${journey.key}.${step}`, this.now());
    return this.track(`${journey.key}.${step}`, 'started', { fields });
  }
  /** A step's end with its outcome and the duration since its start (or since the journey's first step when the step was not started). */
  async end(journey: JourneySpec, step: string, outcome: Outcome, fields?: Record<string, unknown>): Promise<TrackResult> {
    const key = `${journey.key}.${step}`;
    const t0 = this.started.get(key) ?? this.started.get(`${journey.key}.${journey.steps[0] ?? ''}`);
    return this.track(key, outcome, { fields, durationMs: t0 === undefined ? undefined : durationMs(t0, this.now()) });
  }
  async track(eventKey: string, outcome: Outcome, o: { fields?: Record<string, unknown>; durationMs?: number; experimentId?: string | null } = {}): Promise<TrackResult> {
    const a = admissible(this.catalogue, eventKey);
    if (!a.ok) return a.reason;
    try {
      const r = await this.send({ eventKey, outcome, durationMs: o.durationMs, fields: whitelisted(a.definition.fields, o.fields), deviceClass: this.context.deviceClass, locale: this.context.locale,
                                  experimentId: o.experimentId ?? null });
      if (!r.ok) return 'refused';
      return r.collected === false ? 'not_consented' : 'sent';
    } catch { return 'failed'; }
  }
}

/** The server-backed sender (the governed route; its answer is the server's — a refusal is not retried, nothing is kept). */
export function serverSender(scope: Scope): Sender {
  return async (payload) => {
    const r = await experience.record(scope, payload);
    return { ok: r.ok, collected: r.data?.telemetry['collected'] === true ? true : r.ok ? false : undefined };
  };
}

/**
 * The React binding: one tracker per page and scope, its catalogue read once from the server; `journey` marks the steps. The page passes
 * durations and outcomes — never content.
 */
export function useJourney(scope: Scope | null, journey: JourneySpec): { start: (step: string, fields?: Record<string, unknown>) => void; end: (step: string, outcome: Outcome, fields?: Record<string, unknown>) => void } {
  const tracker = useRef<Tracker | null>(null);
  const opened = useRef(false);
  useEffect(() => {
    if (scope === null) return;
    const ctx = { deviceClass: typeof window === 'undefined' ? null : deviceClassOf(window.innerWidth), locale: typeof navigator === 'undefined' ? null : languageOf(navigator.language) };
    const t = new Tracker(serverSender(scope), () => Date.now(), ctx);
    tracker.current = t; opened.current = false;
    let live = true;
    void experience.self(scope).then((r) => {
      if (!live) return;
      t.load(r.ok && r.data !== undefined ? r.data : null);
      if (!opened.current) { opened.current = true; void t.start(journey, journey.steps[0] ?? 'open'); }
    });
    return () => { live = false; };
  }, [scope?.tenantId, scope?.domainId, journey.key]);
  return {
    start: (step, fields) => { void tracker.current?.start(journey, step, fields); },
    end: (step, outcome, fields) => { void tracker.current?.end(journey, step, outcome, fields); },
  };
}
