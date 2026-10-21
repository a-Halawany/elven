/**
 * B50 §CI (migration 0120 §CI) — THE IMPACT CLASSES AND TRIGGERS, as pure functions (the component contract of AffectedClassBadge and
 * AffectedProductList in components/knowledge.tsx, and of the /graph/impact page's trigger form). The SERVER classes every product (graph.
 * record_impact under affected-class@1, from facts it reads); this file only puts the server's answer into words, orders and groups it, and
 * checks a trigger form before it is sent (the server re-checks everything and refuses in its own words, shown as it says it).
 *
 * Nothing here infers a class: a product the server did not class is shown as "not classed", and an unknown class word is shown as the
 * server's word, flagged — never mapped to the nearest known one. CONSTRUCTION; the walk demonstrates (SYNTHETIC personas).
 */
import type { AffectedClass, AffectedProduct } from './b50-seams';

/** The six classes in the order a reader acts on them (withdrawn first: it is out of use; current last: nothing to do). */
export const AFFECTED_CLASS_ORDER: readonly AffectedClass[] = ['withdrawn', 'challenged', 'recompute', 'human_review', 'stale', 'current'];

/** Each class in words — a glyph AND a word (never colour alone), what it means, and who does what next. */
export const AFFECTED_CLASS_WORDS: Readonly<Record<AffectedClass, { glyph: string; label: string; meaning: string; next: string }>> = {
  withdrawn: { glyph: '⊘', label: 'Withdrawn', meaning: 'The product is withdrawn; it is no longer in use.', next: 'Nothing is re-run; the withdrawal stands on its record.' },
  challenged: { glyph: '⚑', label: 'Challenged', meaning: 'It rests on an object under an open challenge.', next: 'Wait for the deciding person to close the challenge.' },
  recompute: { glyph: '↻', label: 'Recompute', meaning: 'It was derived from what changed.', next: 'Its owner re-runs it through its own governed route, or records a bounded exception.' },
  human_review: { glyph: '◎', label: 'Human review', meaning: 'A person\'s decision, commitment, record or package rests on what changed.', next: 'Its owner acknowledges it; nothing about it is rewritten.' },
  stale: { glyph: '◔', label: 'Stale', meaning: 'It cites or publishes what changed.', next: 'Read it with the change in mind; its owner refreshes it.' },
  current: { glyph: '✓', label: 'Current', meaning: 'It already reflects the change.', next: 'Nothing to do.' },
};

/** The walk's buckets in words (the server's bucket names). */
export const BUCKET_WORDS: Readonly<Record<string, string>> = {
  assumptions: 'Assumptions', objectives: 'Objectives', decisions: 'Decisions', commitments: 'Commitments', strategy_nodes: 'Strategy objects',
  forecasts: 'Forecasts', scenarios: 'Scenarios', warnings: 'Warnings', twins: 'Twins', simulations: 'Simulation runs', briefings: 'Briefings',
  memory_items: 'Memory records', graph_state: 'Graph state (claims, entities, edges)', decision_packages: 'Decision packages', publications: 'Publications',
  export_packages: 'Export packages', evaluation_datasets: 'Evaluation datasets', lessons: 'Lessons',
};
export const BUCKET_ORDER: readonly string[] = Object.keys(BUCKET_WORDS);

/** A class word as the server sent it: a known class, or the server's word flagged as not one of the six (never guessed). */
export function classWord(cls: string): { known: boolean; glyph: string; label: string; meaning: string; next: string } {
  const k = AFFECTED_CLASS_WORDS[cls as AffectedClass];
  if (k !== undefined) return { known: true, ...k };
  return { known: false, glyph: '?', label: `Not a known class (${cls})`, meaning: 'The server sent a class this page does not know.', next: 'Read the product on its own page; nothing is assumed.' };
}

export function bucketWord(bucket: string): string { return BUCKET_WORDS[bucket] ?? bucket.replace(/_/g, ' '); }

const str = (v: unknown): string | null => (typeof v === 'string' && v !== '' ? v : null);

/** The server's answer (…/impact/affected `products`) as AffectedProduct rows — a malformed row is DROPPED and counted, never repaired. */
export function parseAffected(rows: unknown): { products: Array<AffectedProduct & { title: string; reachedVia: string; hop: number }>; dropped: number } {
  const products: Array<AffectedProduct & { title: string; reachedVia: string; hop: number }> = [];
  let dropped = 0;
  for (const r of Array.isArray(rows) ? rows : []) {
    const o = (r ?? {}) as Record<string, unknown>;
    const inv = str(o['invalidationId']); const ref = str(o['ref']); const type = str(o['objectType']); const id = str(o['objectId']); const cls = str(o['class']); const bucket = str(o['bucket']); const rule = str(o['ruleVersion']);
    if (inv === null || ref === null || type === null || id === null || cls === null || bucket === null || rule === null) { dropped += 1; continue; }
    products.push({
      invalidationId: inv, ref, objectType: type, objectId: id, version: typeof o['version'] === 'number' ? o['version'] : null, bucket, class: cls as AffectedClass, ruleVersion: rule,
      owner: str(o['owner']), path: Array.isArray(o['path']) ? (o['path'] as unknown[]).map(String) : [],
      title: str(o['title']) ?? ref, reachedVia: str(o['reachedVia']) ?? 'reached by the walk', hop: typeof o['hop'] === 'number' ? o['hop'] : 0,
    });
  }
  return { products, dropped };
}

/** Counts per class, in AFFECTED_CLASS_ORDER (zero classes omitted), and the unknown words after them. */
export function classSummary(products: ReadonlyArray<{ class: string }>): Array<{ cls: string; n: number }> {
  const n = new Map<string, number>();
  for (const p of products) n.set(p.class, (n.get(p.class) ?? 0) + 1);
  const known = AFFECTED_CLASS_ORDER.filter((c) => (n.get(c) ?? 0) > 0).map((c) => ({ cls: c as string, n: n.get(c)! }));
  const other = [...n.keys()].filter((c) => !(AFFECTED_CLASS_ORDER as readonly string[]).includes(c)).sort().map((c) => ({ cls: c, n: n.get(c)! }));
  return [...known, ...other];
}

/** The products that still need someone (every class but current). */
export function material<T extends { class: string }>(products: readonly T[]): T[] { return products.filter((p) => p.class !== 'current'); }

/** One line for the summary: "3 products — 1 owner review, 2 recompute" or "nothing rested on it". */
export function summaryLine(products: ReadonlyArray<{ class: string }>): string {
  if (products.length === 0) return 'Nothing classed: no product rested on what changed.';
  const parts = classSummary(products).map(({ cls, n }) => `${n} ${classWord(cls).label.toLowerCase()}`);
  return `${products.length} product(s) — ${parts.join(', ')}.`;
}

/** Products grouped by bucket in BUCKET_ORDER, each group sorted by class order, then hop, then ref (deterministic). */
export function groupByBucket<T extends { bucket: string; class: string; ref: string; hop?: number }>(products: readonly T[]): Array<{ bucket: string; label: string; rows: T[] }> {
  const rank = (c: string) => { const i = (AFFECTED_CLASS_ORDER as readonly string[]).indexOf(c); return i < 0 ? AFFECTED_CLASS_ORDER.length : i; };
  const groups = new Map<string, T[]>();
  for (const p of products) { const g = groups.get(p.bucket) ?? []; g.push(p); groups.set(p.bucket, g); }
  const order = [...groups.keys()].sort((a, b) => {
    const ia = BUCKET_ORDER.indexOf(a); const ib = BUCKET_ORDER.indexOf(b);
    return (ia < 0 ? BUCKET_ORDER.length : ia) - (ib < 0 ? BUCKET_ORDER.length : ib) || a.localeCompare(b);
  });
  return order.map((b) => ({ bucket: b, label: bucketWord(b),
    rows: [...groups.get(b)!].sort((x, y) => rank(x.class) - rank(y.class) || (x.hop ?? 0) - (y.hop ?? 0) || x.ref.localeCompare(y.ref)) }));
}

/** A path in words: the refs joined by arrows, each id shortened (the full ref stays in the title attribute). */
export function pathText(path: readonly string[]): string {
  if (path.length === 0) return 'no path recorded';
  return path.map((ref) => { const [type, rest] = ref.split(':', 2); if (rest === undefined) return ref; const [id, v] = rest.split('@'); return `${type} ${(id ?? '').slice(0, 8)}…${v === undefined ? '' : ` v${v}`}`; }).join(' → ');
}

/* ───────────────────────── the seven triggers (V03-T-304, AI-29-005) ───────────────────────── */

export type TriggerKind = 'legal_request' | 'model_incident' | 'ontology_correction' | 'data_quality_finding' | 'rights_change' | 'integrity_failure' | 'human_challenge';
export interface TriggerSpec {
  label: string; steward: string; roles: readonly string[]; types: readonly string[];
  basis: ReadonlyArray<{ key: string; label: string; help: string; options?: readonly string[] }>;
}
/** The catalogue — the same kinds, roles, object types and basis fields as the server's (pdp.service.ts B50 ci, graph.seed_<kind>). */
export const TRIGGERS: Readonly<Record<TriggerKind, TriggerSpec>> = {
  legal_request: { label: 'Legal request', steward: 'the privacy officer or the record authority', roles: ['privacy_officer', 'record_authority'], types: ['EVD', 'CLM'],
    basis: [{ key: 'request_ref', label: 'Request reference', help: 'the reference the request carries' }, { key: 'legal_basis', label: 'Legal basis', help: 'the provision it is made under' }] },
  model_incident: { label: 'Model incident', steward: 'the method steward', roles: ['method_steward'], types: ['FCT', 'SIM'],
    basis: [{ key: 'method_ref', label: 'Method', help: 'the method that produced the object (it must be its own)' }, { key: 'incident', label: 'Incident', help: 'what went wrong in the method' }] },
  ontology_correction: { label: 'Ontology correction', steward: 'the ontology steward', roles: ['ontology_steward'], types: ['ENT', 'REL'],
    basis: [{ key: 'ontology_version_id', label: 'Ontology version', help: 'the id of the ontology version that corrects the typing' }] },
  data_quality_finding: { label: 'Data-quality finding', steward: 'the data steward', roles: ['data_steward'], types: ['EVD', 'CLM'],
    basis: [{ key: 'dimension', label: 'Quality dimension', help: 'the dimension found deficient', options: ['completeness', 'accuracy', 'timeliness', 'consistency', 'validity', 'uniqueness'] },
            { key: 'finding', label: 'Finding', help: 'what was found' }] },
  rights_change: { label: 'Rights change', steward: 'the data steward, the privacy officer, the record authority or the collection manager', roles: ['data_steward', 'privacy_officer', 'record_authority', 'collection_manager'], types: ['EVD'],
    basis: [{ key: 'source_id', label: 'Source', help: 'the id of the source the evidence was acquired from' }, { key: 'rights_state', label: 'Rights state now', help: 'the rights the source states now (record it on the source first)', options: ['pending', 'withdrawn'] }] },
  integrity_failure: { label: 'Integrity failure', steward: 'the record authority or the data steward', roles: ['record_authority', 'data_steward'], types: ['EVD'],
    basis: [{ key: 'manifest_id', label: 'Manifest', help: 'the id of the evidence\'s vault manifest that failed' }, { key: 'failure', label: 'Failure', help: 'what failed (a digest, a custody check)' }] },
  human_challenge: { label: 'Human challenge', steward: 'any named person of the domain', roles: ['domain_admin', 'domain_analyst', 'domain_specialist', 'knowledge_owner', 'forecast_owner', 'risk_owner', 'decision_owner', 'strategy_owner', 'data_steward',
    'method_steward', 'ontology_steward', 'executive', 'collection_manager', 'extraction_manager', 'resolution_manager', 'record_authority', 'privacy_officer'], types: ['CLM', 'ASM', 'WRN', 'FCT', 'ASU', 'EVT'],
    basis: [{ key: 'statement', label: 'Challenge', help: 'what is contested, in your words' }] },
};
export const TRIGGER_KINDS: readonly TriggerKind[] = Object.keys(TRIGGERS) as TriggerKind[];
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export interface TriggerForm { kind: string; objectType: string; objectId: string; reason: string; basis: Record<string, string> }
/** Every unmet condition of a trigger form, in words (each keeps the act disabled); the server re-checks them all. */
export function triggerFormProblems(f: TriggerForm): string[] {
  const spec = TRIGGERS[f.kind as TriggerKind];
  if (spec === undefined) return ['choose what happened (a trigger kind)'];
  const out: string[] = [];
  if (!spec.types.includes(f.objectType)) out.push(`a ${spec.label.toLowerCase()} names a ${spec.types.join(', ')}`);
  if (!UUID.test(f.objectId.trim())) out.push('give the id of the object the trigger names');
  if (f.reason.trim().length < 8) out.push('state the reason (at least 8 characters)');
  if (f.reason.length > 2000) out.push('the reason is at most 2000 characters');
  for (const b of spec.basis) {
    const v = (f.basis[b.key] ?? '').trim();
    if (v === '') out.push(`give the ${b.label.toLowerCase()}`);
    else if (b.options !== undefined && !b.options.includes(v)) out.push(`the ${b.label.toLowerCase()} is one of ${b.options.join(', ')}`);
  }
  return out;
}
/** The payload the record route takes — only the kind's own basis fields, trimmed. */
export function triggerPayload(f: TriggerForm): { objectType: string; objectId: string; reason: string; basis: Record<string, string> } {
  const spec = TRIGGERS[f.kind as TriggerKind];
  const basis: Record<string, string> = {};
  for (const b of spec?.basis ?? []) basis[b.key] = (f.basis[b.key] ?? '').trim();
  return { objectType: f.objectType, objectId: f.objectId.trim().toLowerCase(), reason: f.reason.trim(), basis };
}

/** The agent's walk of a trigger in words — the server's reason shown as it says it. */
export function walkOutcomeText(w: { state: string; invalidationId: string | null; reason: string | null } | null | undefined): string {
  if (w === null || w === undefined) return 'The walk was not reported.';
  if (w.state === 'walked') return `Walked by the domain's propagation agent: assessment ${(w.invalidationId ?? '').slice(0, 8)}…`;
  if (w.state === 'skipped') return 'Already walked: nothing was walked twice.';
  if (w.state === 'failed') return `Recorded; the agent's walk failed: ${w.reason ?? 'no reason recorded'}. It is walked again when the domain's agent serves it.`;
  return `Walk state: ${w.state}.`;
}

/** A trigger row's state in words (the ledger's states). */
export function triggerStateText(row: { state?: unknown; last_error?: unknown; closed_at?: unknown; trigger_kind?: unknown }): string {
  const s = String(row.state ?? 'unknown');
  const base = s === 'walked' ? 'walked by the agent' : s === 'failed' ? `walk failed: ${String(row.last_error ?? 'no reason recorded')}` : s === 'walking' ? 'being walked' : s === 'recorded' ? 'recorded, not yet walked' : s;
  if (row.trigger_kind === 'human_challenge') return `${base}; ${row.closed_at ? 'challenge closed' : 'challenge open'}`;
  return base;
}

/* B40 res (R1) */
/* ───────────────────────── the review binding of the two trigger commands (their ACTUAL server contracts) ───────────────────────── */

/**
 * Neither trigger command binds a version or a digest on the server: …/impact/triggers/:kind/record takes {objectType, objectId, reason,
 * basis} (the port resolves the object's LATEST version itself and records it), and …/impact/triggers/:triggerId/close takes {reason}
 * (the port checks the challenge is still open, the closer's role and that the closer did not open it). Neither carries an idempotency
 * key. Each control is therefore bound by a CLIENT-SIDE PAYLOAD REVIEW of exactly what it sends (lib/authority-b81 payloadReviewState) —
 * never a dummy digest, and never presented as a server-enforced version binding.
 */
export const TRIGGER_RECORD_CONTRACT = 'your role for this kind at the domain, that you are a named person, that the object is recorded in this domain (its latest version is recorded with the trigger) and the basis — no version you read is bound';
export const CHALLENGE_CLOSE_CONTRACT = 'that the challenge is still open, that you hold knowledge owner or domain administrator here and did not open it, and the reason — no version you read is bound';

/** What "Record the trigger" sends — the route (its kind) and the payload exactly as triggerPayload builds it. The review holds this. */
export function triggerReviewPayload(f: TriggerForm): { action: string; payload: ReturnType<typeof triggerPayload> } {
  return { action: `graph.impact.trigger.${f.kind}`, payload: triggerPayload(f) };
}
/** What "Close the challenge" sends — the route (the challenge) and its reason, trimmed as sent. The review holds this. */
export function closeReviewPayload(triggerId: string, reason: string): { action: string; triggerId: string; payload: { reason: string } } {
  return { action: 'graph.impact.trigger.close', triggerId, payload: { reason: reason.trim() } };
}
/* end B40 res */
