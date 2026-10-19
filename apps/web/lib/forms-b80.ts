/**
 * B80 §CL-F (F-P7-E-05: UX-21-001..005, CMP-033..040, CMP-070, PAT-03) — THE FORM CONTRACT as pure functions (the web has no DOM test
 * environment and B80 adds no dependency: components/forms.tsx renders exactly what these decide; the catalogue walk proves the rendering).
 *
 * A FIELD carries its value, its unit, its SOURCE (typed · default · autocomplete · imported · ai · draft), whether the responsible person has
 * CONFIRMED it, where an outside value came from (its provenance), the rules it is validated by and its error. Five rules shape the model:
 *
 *   1. NOTHING FROM OUTSIDE THE PERSON IS THEIRS UNTIL CONFIRMED (UX-21-004). A default, an autocompleted, an imported or an AI-suggested
 *      value is a PROPOSAL, shown as one, until the person confirms it — an imported, autocompleted or AI value field by field; a default
 *      by the deliberate act of continuing past the step that shows it (the review step lists every value again before the act).
 *   2. A SUBMIT IS HELD, NEVER GUESSED (UX-21-005): an invalid field, validation that could not run, an import CONFLICT with what the person
 *      typed, an outside value with no provenance, an unconfirmed proposal, an irreversible effect not acknowledged, or a body that changed
 *      since it was reviewed each HOLD the submit with its reason named in context and in the summary; the input is kept (the draft).
 *   3. THE REVIEW DIGEST IS THE ENVELOPE'S (UX-21-002/-003): the review step shows the JCS SHA-256 of the exact body the act will send — the
 *      same digest the API verifies as the envelope's payload_digest — and the submit refuses a body whose digest moved after the review.
 *   4. A DRAFT IS NEVER A SUBMISSION (PAT-03): its controls are labelled save / resume / discard — never approve, submit, publish, sign.
 *   5. DATES ARE WHAT THEY NAME: a calendar DATE renders as the day string it is (never through a local-midnight instant); an INSTANT is
 *      entered in an EXPLICIT zone and stored as UTC; the zone is always shown.
 */
import { contentDigest } from './jcs';

type Row = Record<string, unknown>;

/* ───────────────────────── fields, sources, provenance ───────────────────────── */

export type FieldSource = 'typed' | 'default' | 'autocomplete' | 'imported' | 'ai' | 'draft';
/** The sources whose values are PROPOSALS until the person confirms them. */
export const PROPOSING_SOURCES: readonly FieldSource[] = ['default', 'autocomplete', 'imported', 'ai'];
/** The sources that must be confirmed FIELD BY FIELD (a default is confirmed by continuing past its step). */
export const FIELD_CONFIRM_SOURCES: readonly FieldSource[] = ['autocomplete', 'imported', 'ai'];

export interface FieldValue {
  value: string;
  source: FieldSource;
  confirmed: boolean;
  /** where an outside value came from: the imported file's name, the suggesting model and version, the autocomplete list */
  origin?: string | null;
  unit?: string | null;
}

export type Rule =
  | { kind: 'required' }
  | { kind: 'minLength'; n: number }
  | { kind: 'maxLength'; n: number }
  | { kind: 'pattern'; re: RegExp; message: string }
  | { kind: 'integer'; min?: number; max?: number }
  | { kind: 'uuid' }
  | { kind: 'httpsList' }
  | { kind: 'custom'; test: (value: string, all: Readonly<Record<string, FieldValue>>) => string | null };

export interface FieldSpec { key: string; label: string; step?: number; rules?: Rule[]; help?: string }
export interface FieldError { key: string; label: string; step: number; message: string }

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
/** Characters, not UTF-16 units (a count the person can read). */
export const charLength = (s: string): number => [...s].length;

export const typed = (value: string): FieldValue => ({ value, source: 'typed', confirmed: true });
export const proposedDefault = (value: string): FieldValue => ({ value, source: 'default', confirmed: false });
export const isProposal = (f: FieldValue | undefined): boolean => f !== undefined && PROPOSING_SOURCES.includes(f.source) && !f.confirmed;

/** The words a proposal is shown with — the source and, for an outside value, its provenance. Never blank, never "verified". */
export function sourceText(f: FieldValue): string | null {
  if (!isProposal(f)) return null;
  switch (f.source) {
    case 'default': return 'PROPOSED — a default; continuing past this step keeps it';
    case 'autocomplete': return `PROPOSED — autocompleted${f.origin ? ` from ${f.origin}` : ''}; confirm it or change it`;
    case 'imported': return f.origin ? `PROPOSED — imported from ${f.origin}; confirm it or change it` : 'PROPOSED — imported with NO recorded origin; it cannot be confirmed until its provenance is known';
    case 'ai': return f.origin ? `PROPOSED — suggested by ${f.origin} (AI); a suggestion is never your answer until you confirm it` : 'PROPOSED — an AI suggestion with NO recorded model; it cannot be confirmed';
    default: return null;
  }
}

/** The person edits a field: the value becomes THEIRS (typed, confirmed) — any proposal it replaced is gone. */
export const edit = (value: string, unit?: string | null): FieldValue => ({ value, source: 'typed', confirmed: true, ...(unit === undefined ? {} : { unit }) });
/** The person confirms a proposal as it stands (an outside value without provenance cannot be confirmed). */
export function confirm(f: FieldValue): FieldValue {
  if (FIELD_CONFIRM_SOURCES.includes(f.source) && (f.origin === undefined || f.origin === null || f.origin === '')) return f;
  return { ...f, confirmed: true };
}
/** Continuing past a step confirms the DEFAULTS shown on it (and only those) — never an imported, autocompleted or AI value. */
export function confirmStepDefaults(specs: FieldSpec[], values: Record<string, FieldValue>, step: number): Record<string, FieldValue> {
  const out = { ...values };
  for (const s of specs) {
    const f = out[s.key];
    if ((s.step ?? 0) === step && f !== undefined && f.source === 'default' && !f.confirmed) out[s.key] = { ...f, confirmed: true };
  }
  return out;
}

/** One field's validation, in the product's words, naming the field. */
export function validateField(spec: FieldSpec, f: FieldValue | undefined, all: Readonly<Record<string, FieldValue>>): string | null {
  const v = (f?.value ?? '').trim();
  for (const r of spec.rules ?? []) {
    if (r.kind === 'required' && v === '') return `${spec.label} is required`;
    // a custom rule sees a blank value too (a field required only when another is set); the others judge a value that is there
    if (r.kind === 'custom') { const m = r.test(v, all); if (m !== null) return m; continue; }
    if (v === '') continue;
    if (r.kind === 'minLength' && charLength(v) < r.n) return `${spec.label} needs at least ${r.n} characters (it has ${charLength(v)})`;
    if (r.kind === 'maxLength' && charLength(v) > r.n) return `${spec.label} is at most ${r.n} characters (it has ${charLength(v)})`;
    if (r.kind === 'pattern' && !r.re.test(v)) return `${spec.label}: ${r.message}`;
    if (r.kind === 'integer') {
      if (!/^-?\d+$/.test(v)) return `${spec.label} is a whole number`;
      const n = Number(v);
      if (r.min !== undefined && n < r.min) return `${spec.label} is at least ${r.min}`;
      if (r.max !== undefined && n > r.max) return `${spec.label} is at most ${r.max}`;
    }
    if (r.kind === 'uuid' && !UUID.test(v)) return `${spec.label} is an identifier (a UUID)`;
    if (r.kind === 'httpsList') {
      const bad = v.split(',').map((x) => x.trim()).filter((x) => x !== '' && !/^https:\/\/[^\s/]+/.test(x));
      if (bad.length > 0) return `${spec.label}: every endpoint is an https:// address (${bad.length} is not)`;
    }
  }
  return null;
}

/** Every error of the form, in the FORM'S order (the order the person meets the fields — the Error Summary's order). */
export function validateForm(specs: FieldSpec[], values: Readonly<Record<string, FieldValue>>, step?: number): FieldError[] {
  const out: FieldError[] = [];
  for (const s of specs) {
    if (step !== undefined && (s.step ?? 0) !== step) continue;
    const m = validateField(s, values[s.key], values);
    if (m !== null) out.push({ key: s.key, label: s.label, step: s.step ?? 0, message: m });
  }
  return out;
}

/** A stable DOM id per form and field (ErrorSummary links to it; label/help/error are wired to it). */
export const fieldId = (formKey: string, key: string): string => `fld-${formKey.replace(/[^a-z0-9]+/gi, '-')}-${key.replace(/[^a-z0-9]+/gi, '-')}`.toLowerCase();
/** aria-describedby for a control: help, then the proposal note, then the error — only those present. */
export function describedBy(id: string, has: { help?: boolean; proposal?: boolean; error?: boolean; count?: boolean }): string | undefined {
  const ids = [has.help === true ? `${id}-help` : null, has.proposal === true ? `${id}-source` : null, has.count === true ? `${id}-count` : null, has.error === true ? `${id}-error` : null]
    .filter((x): x is string => x !== null);
  return ids.length > 0 ? ids.join(' ') : undefined;
}

/** The Error Summary's content (CMP-070): a heading that counts, and one entry per problem linking to its field. */
export function errorSummary(formKey: string, holds: Hold[]): { title: string; items: Array<{ href: string | null; text: string }> } | null {
  if (holds.length === 0) return null;
  return {
    title: holds.length === 1 ? 'There is 1 problem to resolve before this can be submitted' : `There are ${holds.length} problems to resolve before this can be submitted`,
    items: holds.map((h) => ({ href: h.field !== undefined ? `#${fieldId(formKey, h.field)}` : null, text: h.message })),
  };
}

/** The TextArea's count (CMP-034): characters used of the maximum, and whether it is over. */
export function charCount(value: string, max: number): { count: number; remaining: number; over: boolean; text: string } {
  const count = charLength(value);
  return { count, remaining: max - count, over: count > max, text: count > max ? `${count} of ${max} characters — ${count - max} over` : `${count} of ${max} characters` };
}

/* ───────────────────────── the submit hold (UX-21-005) ───────────────────────── */

export type HoldKind = 'invalid' | 'validation_unavailable' | 'conflict' | 'missing_provenance' | 'unconfirmed_proposal' | 'irreversible_unacknowledged' | 'changed_since_review' | 'not_reviewed';
export interface Hold { kind: HoldKind; field?: string; message: string }
export interface Conflict { key: string; label: string; current: string; imported: string; origin: string }

export function submitHolds(a: {
  specs: FieldSpec[]; values: Readonly<Record<string, FieldValue>>; errors?: FieldError[]; conflicts?: Conflict[];
  /** null when validation ran; the reason when it could not (a reference read failed, a validator is unavailable) */ validationUnavailable?: string | null;
  irreversible?: { statement: string; acknowledged: boolean } | null;
  reviewedDigest?: string | null; currentDigest?: string | null;
}): Hold[] {
  const holds: Hold[] = [];
  const label = (k: string) => a.specs.find((s) => s.key === k)?.label ?? k;
  for (const e of a.errors ?? validateForm(a.specs, a.values)) holds.push({ kind: 'invalid', field: e.key, message: e.message });
  if (a.validationUnavailable !== undefined && a.validationUnavailable !== null) holds.push({ kind: 'validation_unavailable', message: `Validation could not run: ${a.validationUnavailable}. Nothing is submitted until it can.` });
  for (const c of a.conflicts ?? []) holds.push({ kind: 'conflict', field: c.key, message: `${c.label}: you typed “${c.current}” and ${c.origin} says “${c.imported}” — choose one` });
  for (const s of a.specs) {
    const f = a.values[s.key];
    if (f === undefined || !isProposal(f)) continue;
    if (FIELD_CONFIRM_SOURCES.includes(f.source) && (f.origin === undefined || f.origin === null || f.origin === '')) {
      holds.push({ kind: 'missing_provenance', field: s.key, message: `${label(s.key)}: an ${f.source === 'ai' ? 'AI-suggested' : f.source} value with no recorded origin — replace it with your own` });
    } else if (FIELD_CONFIRM_SOURCES.includes(f.source)) {
      holds.push({ kind: 'unconfirmed_proposal', field: s.key, message: `${label(s.key)}: the ${f.source === 'ai' ? 'AI-suggested' : f.source} value is a proposal — confirm it or change it` });
    } else {
      holds.push({ kind: 'unconfirmed_proposal', field: s.key, message: `${label(s.key)}: the default has not been reviewed — continue past its step or change it` });
    }
  }
  if (a.irreversible !== undefined && a.irreversible !== null && !a.irreversible.acknowledged) holds.push({ kind: 'irreversible_unacknowledged', message: `This cannot be undone: ${a.irreversible.statement} — acknowledge it to continue` });
  if (a.reviewedDigest === null || a.reviewedDigest === undefined) {
    if (a.currentDigest !== undefined && a.currentDigest !== null) holds.push({ kind: 'not_reviewed', message: 'Review the exact submission before sending it' });
  } else if (a.currentDigest !== undefined && a.currentDigest !== null && a.currentDigest !== a.reviewedDigest) {
    holds.push({ kind: 'changed_since_review', message: 'The submission changed after you reviewed it — review it again' });
  }
  return holds;
}

/** The review digest (UX-21-002/-003): the JCS SHA-256 of the exact body the act sends — the API verifies the same digest as the envelope's payload_digest. */
export const reviewDigest = (body: unknown): Promise<string> => contentDigest(body);
export const shortDigest = (d: string | null | undefined): string => (d === null || d === undefined || d.length < 12 ? String(d ?? '—') : `${d.slice(0, 12)}…`);

/* ───────────────────────── import (UX-21-003; JSON or CSV into a form) ───────────────────────── */

export interface Parsed { ok: boolean; format: 'json' | 'csv' | null; values: Record<string, string>; error: string | null }
/** Flatten a JSON object into dotted keys (arrays joined by ', ' — the forms' list fields read comma-separated values). */
export function flatten(o: unknown, prefix = '', out: Record<string, string> = {}): Record<string, string> {
  if (o === null || o === undefined) return out;
  if (Array.isArray(o)) { if (o.every((x) => typeof x !== 'object' || x === null)) out[prefix] = o.map((x) => String(x ?? '')).join(', '); return out; }
  if (typeof o === 'object') { for (const [k, v] of Object.entries(o as Row)) flatten(v, prefix === '' ? k : `${prefix}.${k}`, out); return out; }
  out[prefix] = String(o);
  return out;
}
/** Parse an imported file: a JSON object, or a CSV of `field,value` rows (a header row `field,value` is skipped). Never throws. */
export function parseImport(text: string, filename: string): Parsed {
  const t = text.replace(/^﻿/, '').trim();
  if (t === '') return { ok: false, format: null, values: {}, error: `${filename} is empty` };
  if (/\.json$/i.test(filename) || t.startsWith('{')) {
    try {
      const o = JSON.parse(t) as unknown;
      if (o === null || typeof o !== 'object' || Array.isArray(o)) return { ok: false, format: 'json', values: {}, error: `${filename} is not a JSON object` };
      return { ok: true, format: 'json', values: flatten(o), error: null };
    } catch (e) { return { ok: false, format: 'json', values: {}, error: `${filename} is not valid JSON (${e instanceof Error ? e.message : 'parse error'})` }; }
  }
  const values: Record<string, string> = {};
  const lines = t.split(/\r?\n/).filter((l) => l.trim() !== '');
  for (const [i, line] of lines.entries()) {
    const cells = csvCells(line);
    if (cells.length < 2) return { ok: false, format: 'csv', values: {}, error: `${filename} line ${i + 1} is not a "field,value" row` };
    if (i === 0 && /^field$/i.test(cells[0]!.trim()) && /^value$/i.test(cells[1]!.trim())) continue;
    values[cells[0]!.trim()] = cells.slice(1).join(',').trim();
  }
  return { ok: true, format: 'csv', values, error: null };
}
function csvCells(line: string): string[] {
  const out: string[] = []; let cur = ''; let q = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i]!;
    if (q) { if (c === '"' && line[i + 1] === '"') { cur += '"'; i++; } else if (c === '"') q = false; else cur += c; }
    else if (c === '"') q = true; else if (c === ',') { out.push(cur); cur = ''; } else cur += c;
  }
  out.push(cur);
  return out;
}
/**
 * Apply imported values to the form (mapping import keys to field keys): an EMPTY field or a not-yet-confirmed proposal takes the imported
 * value as a PROPOSAL (origin recorded); a field the person TYPED and that differs is a CONFLICT — neither value wins until the person
 * chooses; an equal value is left as the person's. Unknown import keys are reported, never silently used.
 */
export function applyImport(specs: FieldSpec[], values: Record<string, FieldValue>, imported: Record<string, string>, origin: string,
                            mapping: Readonly<Record<string, string>> = {}): { values: Record<string, FieldValue>; conflicts: Conflict[]; applied: string[]; unknown: string[] } {
  const out = { ...values }; const conflicts: Conflict[] = []; const applied: string[] = []; const unknown: string[] = [];
  const byKey = new Map(specs.map((s) => [s.key, s]));
  for (const [k, v] of Object.entries(imported)) {
    const key = mapping[k] ?? k;
    const spec = byKey.get(key);
    if (spec === undefined) { unknown.push(k); continue; }
    const cur = out[key];
    const mine = cur !== undefined && cur.source === 'typed' && cur.value.trim() !== '';
    if (mine && cur.value.trim() === v.trim()) continue;
    if (mine) { conflicts.push({ key, label: spec.label, current: cur.value, imported: v, origin }); continue; }
    out[key] = { value: v, source: 'imported', confirmed: false, origin };
    applied.push(key);
  }
  return { values: out, conflicts, applied, unknown };
}
/** The person resolves a conflict: keep what they typed, or take the imported value AS THEIR OWN (choosing it is the confirmation). */
export function resolveConflict(values: Record<string, FieldValue>, conflicts: Conflict[], key: string, choose: 'current' | 'imported'): { values: Record<string, FieldValue>; conflicts: Conflict[] } {
  const c = conflicts.find((x) => x.key === key);
  if (c === undefined) return { values, conflicts };
  const out = { ...values };
  if (choose === 'imported') out[key] = { value: c.imported, source: 'imported', confirmed: true, origin: c.origin };
  return { values: out, conflicts: conflicts.filter((x) => x.key !== key) };
}

/* ───────────────────────── the stepper ───────────────────────── */

export type StepState = 'complete' | 'current' | 'upcoming' | 'invalid';
/** Each step's state: the current one, the visited ones (complete, or INVALID when a field on it fails), the rest upcoming. */
export function stepperState(titles: readonly string[], current: number, visited: ReadonlySet<number>, errors: FieldError[]): Array<{ index: number; title: string; state: StepState; label: string }> {
  return titles.map((title, index) => {
    const bad = errors.some((e) => e.step === index);
    const state: StepState = index === current ? 'current' : visited.has(index) ? (bad ? 'invalid' : 'complete') : 'upcoming';
    const word = state === 'current' ? 'current step' : state === 'invalid' ? 'has problems' : state === 'complete' ? 'visited' : 'not yet visited';
    return { index, title, state, label: `${index + 1}. ${title} (${word})` };
  });
}

/* ───────────────────────── the draft (PAT-03) ───────────────────────── */

export type DraftState = 'none' | 'live' | 'expired' | 'discarded' | 'unavailable';
export interface DraftView { state: DraftState; draftId: string | null; version: number | null; savedAt: string | null; expiresAt: string | null; digest: string | null; reason: string | null }
export const NO_DRAFT: DraftView = { state: 'none', draftId: null, version: null, savedAt: null, expiresAt: null, digest: null, reason: null };
/** The server's draft read, as the view the FormDraft control shows (the payload stays with the caller). */
export function draftViewOf(read: { state?: unknown; draft?: Row | null } | null | undefined, unavailable: string | null = null): DraftView {
  if (unavailable !== null) return { ...NO_DRAFT, state: 'unavailable', reason: unavailable };
  const d = (read?.draft ?? null) as Row | null;
  const state = (['none', 'live', 'expired', 'discarded'].includes(String(read?.state)) ? String(read?.state) : 'none') as DraftState;
  if (d === null) return { ...NO_DRAFT, state };
  return { state, draftId: String(d['draft_id']), version: Number(d['version']), savedAt: String(d['saved_at'] ?? ''), expiresAt: String(d['expires_at'] ?? ''), digest: (d['payload_digest'] as string | null) ?? null, reason: null };
}
/** What the draft control says — never "submitted", never "approved": a draft is the person's own unsent work. */
export function draftStatusText(v: DraftView, dirty: boolean): string {
  const at = (s: string | null) => (s === null || s === '' ? '' : ` ${instantText(s)}`);
  switch (v.state) {
    case 'none': return dirty ? 'Not saved — no draft of this form is kept yet' : 'No saved draft';
    case 'live': return `${dirty ? 'Unsaved changes since ' : ''}draft v${v.version} saved${at(v.savedAt)} — kept until${at(v.expiresAt)}; a draft is not sent to anyone`;
    case 'expired': return `Your draft v${v.version} expired${at(v.expiresAt)} — its content is no longer offered`;
    case 'discarded': return 'Your last draft was discarded';
    case 'unavailable': return `Drafts are unavailable: ${v.reason ?? 'the server did not answer'} — the form still works; your input is kept on this page only`;
  }
}
/** A draft control's label may never read as an act of authority (PAT-03 "never label as approval"). */
export const DRAFT_LABELS = { save: 'Save draft', resume: 'Resume draft', discard: 'Discard draft' } as const;
export const draftLabelOk = (label: string): boolean => /\bdraft\b/i.test(label) && !/\b(approv\w*|submit\w*|publish\w*|sign\w*|accept\w*|certif\w*|commit\w*)\b/i.test(label);

/* ───────────────────────── date and time (CMP-037; the DATE-rendering rule) ───────────────────────── */

/** A calendar DATE as the day it names — a 'YYYY-MM-DD…' string is cut, never parsed through a local midnight. */
export function dayText(v: unknown): string {
  if (v === null || v === undefined || v === '') return 'none recorded';
  const s = String(v);
  return /^\d{4}-\d{2}-\d{2}/.test(s) ? s.slice(0, 10) : s;
}
/** An instant in UTC, to the minute, with its zone named. */
export function instantText(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : `${d.toISOString().slice(0, 16).replace('T', ' ')} UTC`;
}
/** The offset of an IANA zone at an instant, in minutes east of UTC (Intl — no dependency). */
export function zoneOffsetMinutes(zone: string, at: Date): number {
  if (zone === 'UTC') return 0;
  const parts = new Intl.DateTimeFormat('en-US', { timeZone: zone, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' }).formatToParts(at);
  const n = (t: string) => Number(parts.find((p) => p.type === t)?.value ?? '0');
  const asUtc = Date.UTC(n('year'), n('month') - 1, n('day'), n('hour') % 24, n('minute'), n('second'));
  return Math.round((asUtc - Math.floor(at.getTime() / 1000) * 1000) / 60000);
}
export function isZone(zone: string): boolean {
  try { new Intl.DateTimeFormat('en-US', { timeZone: zone }); return true; } catch { return false; }
}
const pad = (n: number) => String(n).padStart(2, '0');
/** A wall-clock 'YYYY-MM-DDTHH:mm' IN `zone` → the UTC instant (ISO), or null when it is not a time in that zone (a skipped DST hour). */
export function localToInstant(local: string, zone: string): string | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?$/.exec(local);
  if (m === null || !isZone(zone)) return null;
  const wall = Date.UTC(+m[1]!, +m[2]! - 1, +m[3]!, +m[4]!, +m[5]!, +(m[6] ?? '0'));
  let guess = wall - zoneOffsetMinutes(zone, new Date(wall)) * 60000;
  guess = wall - zoneOffsetMinutes(zone, new Date(guess)) * 60000;
  return instantToLocal(new Date(guess).toISOString(), zone) === local.slice(0, 16) ? new Date(guess).toISOString() : null;
}
/** A UTC instant → the wall clock 'YYYY-MM-DDTHH:mm' in `zone` (the value a datetime-local control shows). */
export function instantToLocal(iso: string, zone: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const w = new Date(d.getTime() + zoneOffsetMinutes(zone, d) * 60000);
  return `${w.getUTCFullYear()}-${pad(w.getUTCMonth() + 1)}-${pad(w.getUTCDate())}T${pad(w.getUTCHours())}:${pad(w.getUTCMinutes())}`;
}
/** 'Europe/Berlin (UTC+01:00)' — the zone, always named with its offset at that instant. */
export function zoneText(zone: string, at: Date): string {
  const o = zoneOffsetMinutes(zone, at);
  const s = o < 0 ? '-' : '+'; const a = Math.abs(o);
  return `${zone} (UTC${s}${pad(Math.floor(a / 60))}:${pad(a % 60)})`;
}
/** The zones a DateTimeInput offers: UTC, the person's own (the browser's), and the event's when it differs. */
export function zoneChoices(userZone: string | null, eventZone: string | null): Array<{ zone: string; role: string }> {
  const out: Array<{ zone: string; role: string }> = [{ zone: 'UTC', role: 'UTC' }];
  if (userZone !== null && userZone !== 'UTC' && isZone(userZone)) out.push({ zone: userZone, role: 'your zone' });
  if (eventZone !== null && eventZone !== 'UTC' && eventZone !== userZone && isZone(eventZone)) out.push({ zone: eventZone, role: 'the event\'s zone' });
  return out;
}

/* ───────────────────────── units and ranges (CMP-038 / CMP-039) ───────────────────────── */

export const UNIT_DIMENSIONS = {
  duration: { canonical: 's', units: [{ unit: 's', label: 'seconds', factor: 1 }, { unit: 'min', label: 'minutes', factor: 60 }, { unit: 'h', label: 'hours', factor: 3600 }, { unit: 'd', label: 'days', factor: 86400 }] },
  bytes: { canonical: 'B', units: [{ unit: 'B', label: 'bytes', factor: 1 }, { unit: 'KiB', label: 'KiB', factor: 1024 }, { unit: 'MiB', label: 'MiB', factor: 1048576 }] },
  mass: { canonical: 't', units: [{ unit: 't', label: 'tonnes', factor: 1 }, { unit: 'kg', label: 'kilograms', factor: 0.001 }] },
  count: { canonical: 'items', units: [{ unit: 'items', label: 'items', factor: 1 }] },
} as const;
export type UnitDimension = keyof typeof UNIT_DIMENSIONS;
/** The ORIGINAL value and unit and the CANONICAL value (what is stored); `exact` is false when the conversion is not a whole number of the canonical unit. */
export function toCanonical(value: string, unit: string, dim: UnitDimension): { ok: boolean; original: string; unit: string; canonical: number | null; canonicalUnit: string; exact: boolean; error: string | null } {
  const d = UNIT_DIMENSIONS[dim];
  const u = (d.units as ReadonlyArray<{ unit: string; factor: number }>).find((x) => x.unit === unit);
  const n = Number(value.trim());
  if (u === undefined) return { ok: false, original: value, unit, canonical: null, canonicalUnit: d.canonical, exact: false, error: `${unit} is not a unit of ${dim}` };
  if (value.trim() === '' || !Number.isFinite(n)) return { ok: false, original: value, unit, canonical: null, canonicalUnit: d.canonical, exact: false, error: 'enter a number' };
  const c = n * u.factor;
  const exact = dim === 'duration' || dim === 'bytes' ? Number.isInteger(c) : true;
  return { ok: true, original: value, unit, canonical: c, canonicalUnit: d.canonical, exact, error: exact ? null : `${value} ${unit} is not a whole number of ${d.canonical}` };
}
/** A canonical value shown in the largest unit that divides it exactly (86400 s → 1 d) — the stored number is never rounded for display. */
export function fromCanonical(canonical: number, dim: UnitDimension): { value: string; unit: string } {
  const units = [...UNIT_DIMENSIONS[dim].units].sort((a, b) => b.factor - a.factor);
  for (const u of units) if (canonical !== 0 && Number.isInteger(canonical / u.factor) && u.factor >= 1) return { value: String(canonical / u.factor), unit: u.unit };
  return { value: String(canonical), unit: UNIT_DIMENSIONS[dim].canonical };
}
/** A range's validation (CMP-038): both bounds numbers in the same unit, lower ≤ upper, inside the allowed limits. */
export function validateRange(lower: string, upper: string, o: { label: string; unit?: string; min?: number; max?: number; openEnded?: boolean }): string | null {
  const lo = lower.trim(); const hi = upper.trim(); const u = o.unit === undefined ? '' : ` ${o.unit}`;
  if (lo === '' && hi === '') return null;
  if (lo === '' || (hi === '' && o.openEnded !== true)) return `${o.label}: give both the lower and the upper bound`;
  const a = Number(lo); const b = hi === '' ? Infinity : Number(hi);
  if (!Number.isFinite(a) || Number.isNaN(b)) return `${o.label}: both bounds are numbers`;
  if (a > b) return `${o.label}: the lower bound (${lo}${u}) is above the upper bound (${hi}${u})`;
  if (o.min !== undefined && a < o.min) return `${o.label}: the lower bound is at least ${o.min}${u}`;
  if (o.max !== undefined && b > o.max) return `${o.label}: the upper bound is at most ${o.max}${u}`;
  return null;
}

/* ───────────────────────── the combobox (CMP-036; ARIA 1.2 combobox with a listbox popup) ───────────────────────── */

export interface ComboOption { value: string; label: string; description?: string; disabled?: string | null }
export interface ComboState { open: boolean; active: number | null; query: string }
export const COMBO_CLOSED: ComboState = { open: false, active: null, query: '' };
/** The options matching the query (label, description or value; case-insensitive) — the order kept. */
export function filterOptions(options: readonly ComboOption[], query: string): ComboOption[] {
  const q = query.trim().toLowerCase();
  if (q === '') return [...options];
  return options.filter((o) => o.label.toLowerCase().includes(q) || o.value.toLowerCase().includes(q) || (o.description ?? '').toLowerCase().includes(q));
}
/**
 * The keyboard contract: ArrowDown opens (on the first option) or moves down (wrapping); ArrowUp opens (on the last) or moves up; Home/End
 * move to the first/last while open; Enter selects the ACTIVE option (a disabled one is never selected — its reason stays announced); Escape
 * closes when open, clears the query when closed; Tab closes without selecting (focus moves on). Typing reopens with no option active.
 */
export function comboKey(s: ComboState, key: string, shown: readonly ComboOption[]): { state: ComboState; select: ComboOption | null; prevent: boolean } {
  const n = shown.length;
  const move = (i: number) => (n === 0 ? null : ((i % n) + n) % n);
  switch (key) {
    case 'ArrowDown': return { state: { ...s, open: true, active: s.open && s.active !== null ? move(s.active + 1) : move(0) }, select: null, prevent: true };
    case 'ArrowUp': return { state: { ...s, open: true, active: s.open && s.active !== null ? move(s.active - 1) : move(n - 1) }, select: null, prevent: true };
    case 'Home': return s.open ? { state: { ...s, active: move(0) }, select: null, prevent: true } : { state: s, select: null, prevent: false };
    case 'End': return s.open ? { state: { ...s, active: move(n - 1) }, select: null, prevent: true } : { state: s, select: null, prevent: false };
    case 'Enter': {
      if (!s.open || s.active === null) return { state: s, select: null, prevent: s.open };
      const o = shown[s.active];
      if (o === undefined || (o.disabled ?? null) !== null) return { state: s, select: null, prevent: true };
      return { state: { open: false, active: null, query: o.label }, select: o, prevent: true };
    }
    case 'Escape': return s.open ? { state: { ...s, open: false, active: null }, select: null, prevent: true } : { state: { ...s, query: '' }, select: null, prevent: s.query !== '' };
    case 'Tab': return { state: { ...s, open: false, active: null }, select: null, prevent: false };
    default: return { state: s, select: null, prevent: false };
  }
}
/** The live announcement of the popup (role=status): how many options match — never silent about zero. */
export const comboAnnouncement = (s: ComboState, shown: readonly ComboOption[]): string =>
  !s.open ? '' : shown.length === 0 ? 'No option matches — the value typed is not one of the choices' : `${shown.length} option${shown.length === 1 ? '' : 's'} available`;

/* ───────────────────────── file intake (CMP-040; the operator-upload connector) ───────────────────────── */

/** The upload connector's own limits (apps/api/src/observation/sources/upload.controller.ts) — the intake checks them BEFORE sending. */
export const UPLOAD_LIMITS = {
  maxFiles: 25, maxBytes: 64 * 1024 * 1024,
  mediaTypes: { 'application/pdf': 'PDF', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'DOCX', 'text/csv': 'CSV' } as Readonly<Record<string, string>>,
  extensions: ['.pdf', '.docx', '.csv'],
} as const;
export interface IntakeFile { name: string; size: number; type: string }
export function intakeCheck(files: readonly IntakeFile[], limits: { maxFiles: number; maxBytes: number; extensions: readonly string[] } = UPLOAD_LIMITS):
  { accepted: IntakeFile[]; refused: Array<{ name: string; reason: string }>; totalBytes: number } {
  const accepted: IntakeFile[] = []; const refused: Array<{ name: string; reason: string }> = []; let total = 0;
  for (const f of files) {
    const ext = (/\.[a-z0-9]+$/i.exec(f.name)?.[0] ?? '').toLowerCase();
    if (!limits.extensions.includes(ext)) { refused.push({ name: f.name, reason: `${ext || 'no extension'} is not accepted here (${limits.extensions.join(', ')})` }); continue; }
    if (accepted.length >= limits.maxFiles) { refused.push({ name: f.name, reason: `at most ${limits.maxFiles} files per intake` }); continue; }
    if (total + f.size > limits.maxBytes) { refused.push({ name: f.name, reason: `the intake is at most ${Math.round(limits.maxBytes / 1048576)} MiB in all` }); continue; }
    total += f.size; accepted.push(f);
  }
  return { accepted, refused, totalBytes: total };
}
/** What the person is told BEFORE anything is sent (quarantine and rights — the same §5 path as a polled response). */
export const INTAKE_DISCLOSURE =
  'Files you add take the same admission path as collected data: each is digested, checked against this source’s contract and QUARANTINED if it does not conform — nothing is admitted because a person handed it over. Add only material whose reuse this source’s rights record allows.';
