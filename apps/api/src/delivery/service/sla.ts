/**
 * B94 §SV (0114_b94_x_sv) — THE SERVICE PORTAL'S PURE LOGIC: the live SLA status of a case (from the facts its ports recorded — never a stored
 * "met" flag), the case's acts by state (what the page offers, and why not), and the customer-success read model's assembly (health,
 * adoption, outcomes, value, licence, cases — each stated as the record says it; nothing healthy, recovered or valuable by inference).
 *
 * CONSTRUCTION only: these functions word records; the ports decide every rule.
 */
type Row = Record<string, unknown>;

export type Objective = 'response' | 'resolution';
export type ObjectiveState = 'met' | 'met_late' | 'breached' | 'running' | 'stopped';
export interface ObjectiveStatus { objective: Objective; due_at: string | null; met_at: string | null; state: ObjectiveState; minutes_left: number | null; note: string }

const iso = (v: unknown): string | null => (v === null || v === undefined ? null : v instanceof Date ? v.toISOString() : String(v));
const ms = (v: string | null): number | null => (v === null ? null : Date.parse(v));

/**
 * The live status of a case's two objectives at `now` (the database's instant). Response: met by the first response evidence (`responded_at`,
 * or a support grant requested — passed in as `firstGrantAt`). Resolution: met when the case reached resolved / cannot_reproduce (its
 * `resolved_at`); a degraded case is NOT resolved (its clock runs). A recorded breach is shown as breached even if met later (met_late).
 */
export function slaStatus(c: Row, now: string, firstGrantAt: string | null = null): ObjectiveStatus[] {
  const t = ms(now) ?? Date.now();
  const one = (objective: Objective, due: string | null, met: string | null, breachedAt: string | null, stopped: string | null): ObjectiveStatus => {
    const d = ms(due); const m = ms(met);
    if (d === null) return { objective, due_at: null, met_at: met, state: 'stopped', minutes_left: null, note: 'no objective recorded' };
    if (m !== null) {
      const late = m > d || breachedAt !== null;
      return { objective, due_at: due, met_at: met, state: late ? 'met_late' : 'met', minutes_left: null, note: late ? 'met after its due instant' : 'met within the objective' };
    }
    if (stopped !== null) return { objective, due_at: due, met_at: null, state: 'stopped', minutes_left: null, note: stopped };
    if (breachedAt !== null || t > d) return { objective, due_at: due, met_at: null, state: 'breached', minutes_left: Math.round((d - t) / 60_000), note: breachedAt !== null ? `breach recorded ${breachedAt}` : 'past due — the breach is recorded at the next tick' };
    return { objective, due_at: due, met_at: null, state: 'running', minutes_left: Math.round((d - t) / 60_000), note: 'running' };
  };
  const responded = [iso(c['responded_at']), firstGrantAt].filter((x): x is string => x !== null).sort()[0] ?? null;
  const state = String(c['state'] ?? '');
  const resolvedAt = ['resolved', 'cannot_reproduce', 'closed'].includes(state) ? iso(c['resolved_at']) : null;
  return [
    one('response', iso(c['response_due_at']), responded, iso(c['response_breached_at']), null),
    one('resolution', iso(c['resolution_due_at']), resolvedAt, iso(c['resolution_breached_at']), null),
  ];
}

export type CaseAct = 'triage' | 'progress' | 'workaround.propose' | 'workaround.execute' | 'known_error.reuse' | 'bundle' | 'close' | 'reopen' | 'note' | 'commitment' | 'drill';
/** The case states each act is reached from (the ports' rules, stated for the page's disabled reasons; the port decides). */
export const ACT_FROM: Record<CaseAct, readonly string[]> = {
  triage: ['open'],
  progress: ['open', 'triaged', 'awaiting_access', 'diagnosing', 'workaround_offered', 'degraded_guidance'],
  'workaround.propose': ['triaged', 'awaiting_access', 'diagnosing', 'degraded_guidance'],
  'workaround.execute': ['workaround_offered'],
  'known_error.reuse': ['open', 'triaged', 'awaiting_access', 'diagnosing', 'degraded_guidance'],
  bundle: ['open', 'triaged', 'awaiting_access', 'diagnosing', 'workaround_offered', 'resolved', 'cannot_reproduce', 'degraded_guidance'],
  close: ['resolved', 'cannot_reproduce'],
  reopen: ['resolved', 'cannot_reproduce', 'closed'],
  note: ['open', 'triaged', 'awaiting_access', 'diagnosing', 'workaround_offered', 'resolved', 'cannot_reproduce', 'degraded_guidance'],
  commitment: ['open', 'triaged', 'awaiting_access', 'diagnosing', 'workaround_offered', 'resolved', 'cannot_reproduce', 'degraded_guidance'],
  drill: ['open', 'triaged', 'awaiting_access', 'diagnosing', 'workaround_offered', 'resolved', 'cannot_reproduce', 'degraded_guidance'],
};
/** The progress targets and where each is reached from (service.progress_case). */
export const PROGRESS_FROM: Record<string, readonly string[]> = {
  awaiting_access: ['open', 'triaged', 'diagnosing'],
  diagnosing: ['triaged', 'awaiting_access', 'workaround_offered', 'degraded_guidance'],
  cannot_reproduce: ['triaged', 'awaiting_access', 'diagnosing'],
  degraded_guidance: ['triaged', 'awaiting_access', 'diagnosing', 'workaround_offered'],
  resolved: ['triaged', 'diagnosing', 'workaround_offered', 'degraded_guidance'],
};
export function actAvailable(act: CaseAct, state: string): { available: boolean; reason: string | null } {
  const from = ACT_FROM[act];
  return from.includes(state) ? { available: true, reason: null } : { available: false, reason: `the case is ${state}; ${act} is reached from ${from.join(', ')}` };
}

/** The customer-success read model (CAP-DL-10), assembled from what the route read. Value stays as MET-040 says (unsupported → B76). */
export interface SuccessInputs {
  health: Row[]; adoption: Row[]; outcomes: Row[]; value: Row; licence: Row | null; routing: Row | null; cases: Row[]; breaches: Row[]; commitments: Row[]; reviews: Row[]; read_at: string;
}
export function assembleSuccess(i: SuccessInputs) {
  const open = i.cases.filter((c) => c['state'] !== 'closed');
  const bySeverity: Record<string, number> = { S1: 0, S2: 0, S3: 0, S4: 0 };
  for (const c of open) bySeverity[String(c['severity'])] = (bySeverity[String(c['severity'])] ?? 0) + 1;
  const real = i.breaches.filter((b) => b['drill'] !== true);
  const lic = i.licence;
  const termEnd = lic === null ? null : iso((lic['licence'] as Row | null)?.['effective_to'] ?? null);
  const daysToTerm = termEnd === null ? null : Math.floor((Date.parse(termEnd) - Date.parse(i.read_at)) / 86_400_000);
  const healthState = i.health.length === 0 ? 'not computed' : i.health.every((h) => h['status'] === 'complete') ? 'computed' : 'partial or indeterminate';
  const adoptionDeterminate = i.adoption.filter((a) => a['state'] === 'determinate').length;
  return {
    health: { state: healthState, snapshots: i.health, note: i.health.length === 0 ? 'no strategic health score is computed for this domain — nothing is shown healthy by inference' : 'the latest current snapshot of each active definition, as computed' },
    adoption: { measures: i.adoption, determinate: adoptionDeterminate, indeterminate: i.adoption.length - adoptionDeterminate,
                note: i.adoption.length === 0 ? 'no adoption measure (ADP-*) is approved in this domain' : 'below k the result is indeterminate, shown honestly' },
    outcomes: { results: i.outcomes },
    value: { ...i.value, note: i.value['state'] === 'supported' ? 'MET-040 is supported' : `realized value stays unsupported (${String(i.value['carrier'] ?? 'B76')})` },
    licence: { standing: lic, term_end: termEnd, days_to_term_end: daysToTerm, routing: i.routing,
               note: lic === null ? 'the entitlement could not be read' : 'the licence state and term as the record says them — no renewal-risk score is inferred' },
    cases: { open: open.length, by_severity: bySeverity, breaches: real.length, drills: i.breaches.length - real.length,
             commitments_open: i.commitments.filter((m) => m['state'] === 'open').length, commitments_breached: i.commitments.filter((m) => m['state'] === 'breached').length },
    reviews: i.reviews,
    read_at: i.read_at,
    boundary: 'customer success shows records; joint value-review acceptance is R2 — an in-product acknowledgement by a synthetic persona demonstrates the software only',
  };
}
