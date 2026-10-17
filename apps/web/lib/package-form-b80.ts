/**
 * B80 §CL-F — THE DECISION-PACKAGE FORM'S CONTRACT (apps/web/app/decisions/packages/new/page.tsx, NEW): its fields and rules, and the
 * three requests it makes over the EXISTING governed routes, unchanged (apps/api/src/decision/decision.controller.ts):
 *
 *   1. POST /decisions/declare                         decision.package.declare  { decisionObjectId, title, statement, owner }
 *   2. POST /decisions/:id/versions/open               decision.package.version  { knownAt, observedThrough }
 *   3. POST /decisions/:id/versions/:v/options (each)  decision.package.option   { key, title, kind, consequences, unsimulatedReason?, risks, opportunities }
 *
 * The server's own validation is mirrored here so the person sees a problem BEFORE the act (validatePackageIntake / validateOptionIntake);
 * the server still decides. Each request is its own governed act with its own receipt: a failure part-way is shown as exactly what was
 * recorded and what was not — never as the whole package declared. The package's TERMS, CHOICE and PROPOSAL stay on the Decisions page.
 */
import type { FieldSpec, FieldValue } from './forms-b80';
import { call, type ApiResult } from './api';
import type { Scope } from './observation';
import { proposedDefault, typed } from './forms-b80';

export const FORM_KEY = 'decision.package.declare';
export const SCHEMA_VERSION = 'DPK-DECL@v1';
export const STEPS = ['The decision', 'The first version', 'Options', 'Review'] as const;
export const MAX_OPTIONS = 4;
export const CITATION_KINDS = ['run', 'forecast', 'claim', 'evidence', 'assumption', 'warning'] as const;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** The option slots' field keys: o<n>.key, o<n>.title, o<n>.kind, o<n>.citeKind, o<n>.citeId, o<n>.reason, o<n>.risks, o<n>.opportunities. */
export const optionKey = (n: number, f: string) => `o${n}.${f}`;
const used = (all: Readonly<Record<string, FieldValue>>, n: number) =>
  ['key', 'title', 'reason', 'citeId', 'risks', 'opportunities'].some((f) => (all[optionKey(n, f)]?.value ?? '').trim() !== '');

function optionSpecs(n: number): FieldSpec[] {
  const L = `Option ${n + 1}`;
  const when = (test: (v: string, all: Readonly<Record<string, FieldValue>>) => string | null) => ({ kind: 'custom' as const, test: (v: string, all: Readonly<Record<string, FieldValue>>) => (used(all, n) ? test(v, all) : null) });
  return [
    { key: optionKey(n, 'key'), label: `${L} key`, step: 2, help: 'like reroute-cape or status-quo',
      rules: [when((v) => (/^[a-z][a-z0-9_-]{0,40}$/.test(v) ? null : `${L} key must be like reroute-cape or status-quo`))] },
    { key: optionKey(n, 'title'), label: `${L} title`, step: 2, rules: [when((v) => (v.trim().length >= 2 && v.length <= 256 ? null : `${L} title is 2–256 characters`))] },
    { key: optionKey(n, 'kind'), label: `${L} kind`, step: 2, rules: [when((v) => (v === 'intervention' || v === 'status_quo' ? null : `${L} kind is an intervention or the status quo`))] },
    { key: optionKey(n, 'citeKind'), label: `${L} consequence kind`, step: 2 },
    { key: optionKey(n, 'citeId'), label: `${L} consequence id`, step: 2, help: 'a completed run, a forecast, a claim, evidence, an assumption or a warning this option rests on (optional)',
      rules: [when((v, all) => (v.trim() === '' ? null : !UUID.test(v.trim()) ? `${L} consequence id is a uuid` : (all[optionKey(n, 'citeKind')]?.value ?? '') === '' ? `${L}: say what kind of record the consequence is` : null))] },
    { key: optionKey(n, 'reason'), label: `${L} — why it was not simulated`, step: 2,
      rules: [when((v, all) => ((all[optionKey(n, 'citeId')]?.value ?? '').trim() === '' && v.trim().length < 8 ? `${L} cites no consequence: say, in at least eight characters, why it was not simulated` : v.trim() !== '' && v.trim().length < 8 ? `${L}: the reason is at least eight characters` : null))] },
    { key: optionKey(n, 'risks'), label: `${L} risks (comma separated)`, step: 2 },
    { key: optionKey(n, 'opportunities'), label: `${L} opportunities (comma separated)`, step: 2 },
  ];
}

export const SPECS: FieldSpec[] = [
  { key: 'decision', label: 'The decision (DEC)', step: 0, help: 'the DEC a strategy owner declared in the strategy graph; a package never declares the decision itself',
    rules: [{ kind: 'required' }, { kind: 'uuid' }] },
  { key: 'title', label: 'Package title', step: 0, rules: [{ kind: 'required' }, { kind: 'minLength', n: 2 }, { kind: 'maxLength', n: 256 }] },
  { key: 'statement', label: 'Statement', step: 0, help: 'what is being decided, in the owner\'s words', rules: [{ kind: 'required' }, { kind: 'minLength', n: 2 }, { kind: 'maxLength', n: 4096 }] },
  { key: 'owner', label: 'Owner (principal id)', step: 0, help: 'the accountable decision owner — you, unless you name another', rules: [{ kind: 'required' }, { kind: 'uuid' }] },
  { key: 'known_at', label: 'Known at', step: 1, help: 'the instant this version\'s knowledge is fixed at — entered in the zone you choose, stored as UTC', rules: [{ kind: 'required' }] },
  { key: 'observed_through', label: 'Observed through (date)', step: 1, help: 'the last DAY of observations this version rests on (optional) — a date, never an instant',
    rules: [{ kind: 'pattern', re: /^\d{4}-\d{2}-\d{2}$/, message: 'a day, YYYY-MM-DD' }] },
  ...Array.from({ length: MAX_OPTIONS }, (_, n) => optionSpecs(n)).flat(),
];

export function initialValues(me: string, nowIso: string): Record<string, FieldValue> {
  const v: Record<string, FieldValue> = {};
  for (const s of SPECS) v[s.key] = typed('');
  v['owner'] = { ...proposedDefault(me) };
  v['known_at'] = { ...proposedDefault(nowIso) };
  for (let n = 0; n < MAX_OPTIONS; n++) v[optionKey(n, 'kind')] = proposedDefault('intervention');
  return v;
}

const list = (s: string) => s.split(',').map((x) => x.trim()).filter((x) => x !== '');
export interface Requests {
  declare: { decisionObjectId: string; title: string; statement: string; owner: string };
  open: { knownAt: string; observedThrough: string | null };
  options: Array<{ key: string; title: string; kind: string; consequences: Array<{ kind: string; id: string }>; unsimulatedReason?: string; risks: string[]; opportunities: string[] }>;
}
/** The exact bodies of the three acts, from the form's values (the shapes the existing routes validate). */
export function requestsOf(values: Readonly<Record<string, FieldValue>>): Requests {
  const v = (k: string) => (values[k]?.value ?? '').trim();
  const options: Requests['options'] = [];
  for (let n = 0; n < MAX_OPTIONS; n++) {
    if (!used(values, n)) continue;
    const citeId = v(optionKey(n, 'citeId')); const reason = v(optionKey(n, 'reason'));
    options.push({
      key: v(optionKey(n, 'key')), title: v(optionKey(n, 'title')), kind: v(optionKey(n, 'kind')),
      consequences: citeId === '' ? [] : [{ kind: v(optionKey(n, 'citeKind')), id: citeId }],
      ...(reason === '' ? {} : { unsimulatedReason: reason }), risks: list(v(optionKey(n, 'risks'))), opportunities: list(v(optionKey(n, 'opportunities'))),
    });
  }
  return {
    declare: { decisionObjectId: v('decision'), title: v('title'), statement: v('statement'), owner: v('owner') },
    open: { knownAt: v('known_at'), observedThrough: v('observed_through') === '' ? null : v('observed_through') },
    options,
  };
}
/** Option keys are unique within the version (the server keys options by them). */
export function duplicateOptionKeys(r: Requests): string[] {
  const seen = new Set<string>(); const dup = new Set<string>();
  for (const o of r.options) { if (seen.has(o.key)) dup.add(o.key); seen.add(o.key); }
  return [...dup];
}

export type Step = 'declare' | 'open' | `option:${string}`;
export interface ActOutcome { step: Step; ok: boolean; receipt: { policyDecisionId: string; auditSeq: number } | null; error: { code: string; message: string; correlationId: string } | null; unknown: boolean }
/** The sequence's state in words: exactly what was recorded (with receipts) and what was not — never "declared" when only part was. */
export function sequenceText(outcomes: readonly ActOutcome[], total: number): { complete: boolean; title: string; lines: string[] } {
  const done = outcomes.filter((o) => o.ok);
  const failed = outcomes.find((o) => !o.ok);
  const lines = outcomes.map((o) => (o.ok ? `✓ ${o.step} — recorded (POL ${o.receipt?.policyDecisionId.slice(0, 13)}… · audit seq ${o.receipt?.auditSeq})`
    : o.unknown ? `◍ ${o.step} — outcome UNKNOWN (no answer); check the package on the Decisions page before trying again` : `✕ ${o.step} — refused: ${o.error?.message ?? 'no reason given'}`));
  if (failed === undefined && done.length === total) return { complete: true, title: `Declared — ${total} governed act${total === 1 ? '' : 's'} recorded, each with its receipt`, lines };
  return { complete: false, title: `NOT complete — ${done.length} of ${total} acts recorded; ${failed !== undefined ? 'the next was not' : 'the rest were not made'}`, lines };
}

/* ───────────────────────── the three governed calls (the existing routes; envelopes as lib/decisions.ts builds them) ───────────────────────── */
type Receipt = { policyDecisionId: string; auditSeq: number };
const base = (s: Scope) => `/v1/tenants/${s.tenantId}/domains/${s.domainId}/decisions`;
const env = (s: Scope, action: string, objectId: string | null) => ({
  scope: 'DOMAIN' as const, tenant_id: s.tenantId, domain_id: s.domainId, action, object_type: 'DPK', object_id: objectId,
  purpose_id: 'decision', side_effect_class: 'reversible' as const, consequence_class: 'C2' as const,
});
export const packageActs = {
  declare: (s: Scope, b: Requests['declare']): Promise<ApiResult<{ package: { packageId: string }; receipt: Receipt }>> =>
    call(`${base(s)}/declare`, env(s, 'decision.package.declare', null), b),
  open: (s: Scope, packageId: string, b: Requests['open']): Promise<ApiResult<{ version: { packageId: string; version: number }; receipt: Receipt }>> =>
    call(`${base(s)}/${packageId}/versions/open`, env(s, 'decision.package.version', packageId), b),
  option: (s: Scope, packageId: string, version: number, b: Requests['options'][number]): Promise<ApiResult<{ option: Record<string, unknown>; receipt: Receipt }>> =>
    call(`${base(s)}/${packageId}/versions/${version}/options`, env(s, 'decision.package.option', packageId), b),
};
