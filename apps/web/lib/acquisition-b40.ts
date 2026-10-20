/**
 * CP-6 B40 §AP (F-P1-04) — THE ACQUISITION POLICY, as the page and the coverage panel show it: pure functions over the read
 * (observation.acquisition_policy_read). Every statement is the server's record put into words; nothing is inferred, nothing optimistic:
 *   * the DECLARATION of an SRC@v4 contract version (rate, the contract's backoff, robots, the window, residency) — or, for an earlier version,
 *     "not declared before SRC@v4" (D8: no back-fill);
 *   * the AUTHORIZATIONS each run cited (proceed / refused with its class) and their verdicts;
 *   * the COVERAGE GAPS — the rate-limited / unavailable intervals with the contract's backoff (holding, open, resolved by a later run) and the
 *     stream form's explicit incomplete ranges — so a throttled interval is a stated gap, never a silent one (DP-10-005).
 * Durations are whole seconds put into words (no rounding); instants are shown as the server recorded them (UTC).
 * Tested in acquisition-b40.test.ts (node environment). CONSTRUCTION only.
 */

type Row = Record<string, unknown>;
const s = (v: unknown): string => (v === null || v === undefined || v === '' ? '—' : String(v));
const n = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : typeof v === 'string' && v.trim() !== '' && Number.isFinite(Number(v)) ? Number(v) : null);
const arr = (v: unknown): Row[] => (Array.isArray(v) ? (v as Row[]) : []);
const obj = (v: unknown): Row | null => (v !== null && typeof v === 'object' && !Array.isArray(v) ? (v as Row) : null);
const strs = (v: unknown): string[] => (Array.isArray(v) ? (v as unknown[]).map(String) : []);

/** Whole seconds in words: "45 s", "5 min", "1 h 2 min", "1 d 3 h" — exact, never rounded up into a shorter wait. */
export function durationText(seconds: number | null | undefined): string {
  if (seconds === null || seconds === undefined || !Number.isFinite(seconds) || seconds < 0) return 'not stated';
  const t = Math.floor(seconds);
  if (t < 60) return `${t} s`;
  const d = Math.floor(t / 86_400); const h = Math.floor((t % 86_400) / 3_600); const m = Math.floor((t % 3_600) / 60); const r = t % 60;
  const parts = [d > 0 ? `${d} d` : '', h > 0 ? `${h} h` : '', m > 0 ? `${m} min` : '', r > 0 && d === 0 ? `${r} s` : ''].filter((x) => x !== '');
  return parts.join(' ');
}

/* ── the declaration ─────────────────────────────────────────────────────────────────────────────────────────────────────────────── */
export interface DeclarationLine { term: string; value: string }
export interface VersionView {
  contractVersion: number; schema: string; lifecycle: string; rights: string; mode: string; residency: string; statement: string;
  declared: boolean; lines: DeclarationLine[]; credentialRef: string | null;
}
export function declarationLines(policy: Row | null): DeclarationLine[] {
  if (policy === null) return [];
  const rate = obj(policy['rate']); const backoff = obj(policy['backoff']); const robots = obj(policy['robots']); const w = obj(policy['window']);
  const schedule = (backoff === null ? [] : arr(backoff['schedule_seconds'])).map((x) => durationText(n(x)));
  const hours = obj(w?.['hours_utc']);
  const blackout = arr(w?.['blackout']);
  return [
    { term: 'Rate', value: rate === null ? 'not stated' : `${s(rate['requests'])} request(s) per ${durationText(n(rate['per_seconds']))}, at most ${s(rate['burst'])} at once — one bucket for the source, shared by every form` },
    { term: 'Backoff', value: backoff === null ? 'not stated' : `${schedule.join(' → ')}${schedule.length > 0 ? ' (the last repeats)' : ''}; at most ${s(backoff['max_attempts'])} attempt(s); Retry-After ${backoff['honour_retry_after'] === true ? 'honoured — never retried sooner than the publisher asks' : 'not honoured — the schedule applies'}` },
    { term: 'Robots', value: robots === null ? 'not stated' : robots['mode'] === 'evaluate' ? 'robots.txt fetched through the vetted client, cached per contract version, evaluated for every request path' : `not applicable — ${s(robots['reason'])}` },
    { term: 'Collection window (UTC)', value: w === null ? 'not stated' : `${strs(w['days']).join(', ')}, ${s(hours?.['from'])}:00–${s(hours?.['to'])}:00${blackout.length === 0 ? '; no blackout declared' : `; blackout: ${blackout.map((b) => `${s(b['from'])} – ${s(b['to'])} (${s(b['reason'])})`).join('; ')}`}` },
    { term: 'Residency at ingress', value: policy['residency_check'] === 'enforce' ? 'enforced — a conflict with the domain\'s profile refuses the run before any request' : policy['residency_check'] === 'record' ? 'recorded — a conflict is recorded and what was fetched is held for a person to decide' : 'not stated' },
  ];
}
export function versionView(r: Row): VersionView {
  const policy = obj(r['acquisition_policy']);
  return {
    contractVersion: n(r['contract_version']) ?? 0, schema: s(r['schema']), lifecycle: s(r['lifecycle_state']), rights: s(r['rights_state']), mode: s(r['acquisition_mode']),
    residency: s(r['residency']), statement: s(r['statement']), declared: policy !== null, lines: declarationLines(policy),
    credentialRef: typeof r['credential_ref'] === 'string' ? r['credential_ref'] : null,
  };
}

/* ── the authorizations ──────────────────────────────────────────────────────────────────────────────────────────────────────────── */
export const REFUSAL_WORDS: Readonly<Record<string, string>> = Object.freeze({
  rights: 'rights not in force', licence: 'licence does not permit it', residency_refused: 'residency conflict', window_closed: 'outside the collection window',
  robots_disallowed: 'robots.txt disallows it', policy: 'held by policy', unavailable: 'a check could not be made (fail closed)',
});
export interface AuthorizationView {
  id: string; runId: string; contractVersion: number; decidedAt: string; form: string; decision: 'proceed' | 'refuse'; decisionWords: string; reason: string;
  verdicts: Array<{ facet: string; words: string }>;
}
export function authorizationView(r: Row): AuthorizationView {
  const decision = r['decision'] === 'refuse' ? 'refuse' : 'proceed';
  const cls = typeof r['refusal_class'] === 'string' ? r['refusal_class'] : null;
  const rights = obj(r['rights']); const licence = obj(r['licence']); const residency = obj(r['residency']); const w = obj(r['window']); const robots = obj(r['robots']);
  const rate = obj(r['rate']); const backoff = obj(r['backoff']); const terms = obj(rights?.['terms']); const hold = obj(backoff?.['hold']);
  return {
    id: s(r['authorization_id']), runId: s(r['run_id']), contractVersion: n(r['contract_version']) ?? 0, decidedAt: s(r['decided_at']), form: s(r['form']), decision,
    decisionWords: decision === 'proceed' ? 'Authorized' : `Refused — ${cls === null ? 'unstated' : REFUSAL_WORDS[cls] ?? cls}`,
    reason: s(r['reason']),
    verdicts: [
      { facet: 'Rights', words: rights === null ? 'not recorded' : `contract ${s(rights['contract_rights_state'])}${terms === null ? '; no rights terms declared' : `; terms v${s(terms['version'])} ${s(terms['state']).replace('_', ' ')}`}` },
      { facet: 'Licence', words: licence === null ? 'not recorded' : s(licence['reason']) },
      { facet: 'Credential', words: typeof r['credential_ref'] === 'string' ? `by reference: ${r['credential_ref']}` : 'none named' },
      { facet: 'Rate', words: rate === null ? 'not recorded' : `${s(rate['requests'])} per ${durationText(n(rate['per_seconds']))}, bucket ${s(rate['bucket'])}` },
      { facet: 'Residency', words: residency === null ? 'not recorded' : residency['verdict'] === 'unavailable' ? 'could not be resolved' : s(residency['reason']) },
      { facet: 'Window', words: w === null ? 'not recorded' : s(w['reason']) },
      { facet: 'Robots', words: robots === null ? 'not recorded' : robots['verdict'] === 'not_applicable' ? s(robots['reason']) : robots['verdict'] === 'not_evaluated' ? 'not fetched — the run was refused first' : `${s(robots['verdict'])}` },
      { facet: 'Backoff', words: hold === null ? 'no hold in force' : `held until ${s(hold['until'])} (attempt ${s(hold['attempt'])})` },
    ],
  };
}

/* ── the coverage gaps ───────────────────────────────────────────────────────────────────────────────────────────────────────────── */
export const ORIGIN_WORDS: Readonly<Record<string, string>> = Object.freeze({
  publisher_429: 'the publisher answered 429 Too Many Requests', contract_rate: 'the contract\'s own rate could not serve the run', unavailable: 'the source was unavailable',
});
export interface GapView {
  id: string; kind: 'rate_limited' | 'incomplete_range'; from: string; to: string; state: 'holding' | 'open' | 'resolved'; stateWords: string; cause: string;
  backoff: string | null; detail: string;
}
export function rateLimitedGap(r: Row): GapView {
  const state = r['state'] === 'holding' ? 'holding' : r['state'] === 'resolved' ? 'resolved' : 'open';
  const ra = r['retry_after_state'];
  const asked = ra === 'honoured' ? `Retry-After ${durationText(n(r['retry_after_seconds']))} honoured`
    : ra === 'not_honoured' ? `Retry-After ${durationText(n(r['retry_after_seconds']))} given, not honoured by the contract`
    : ra === 'unparsed' ? `Retry-After "${s(r['retry_after_raw'])}" could not be read — the schedule applied`
    : ra === 'own_bucket' ? 'the contract\'s own bucket' : 'no Retry-After';
  return {
    id: s(r['rate_limit_id']), kind: 'rate_limited', from: s(r['interval_from']), to: s(r['interval_to']), state,
    stateWords: state === 'holding' ? `holding — no request before ${s(r['interval_to'])}` : state === 'resolved' ? `resolved by run ${s(r['resolved_by_run'])} at ${s(r['resolved_at'])}` : 'open — not yet re-collected',
    cause: `${ORIGIN_WORDS[s(r['origin'])] ?? s(r['origin'])}${typeof r['http_status'] === 'number' ? ` (HTTP ${r['http_status']})` : ''}; ${asked}`,
    backoff: `attempt ${s(r['attempt'])} of ${s(r['max_attempts'])} · schedule ${durationText(n(r['schedule_delay_seconds']))} · held ${durationText(n(r['applied_delay_seconds']))}${r['exhausted'] === true ? ' · retries exhausted — collection resumes on the cadence after the hold' : r['retry_planned'] === true ? ' · a retry planned at the end of the hold' : ''}`,
    detail: s(r['detail']),
  };
}
export function incompleteGap(r: Row): GapView {
  const resolved = r['state'] === 'resolved';
  return {
    id: s(r['range_id']), kind: 'incomplete_range', from: s(r['range_from']), to: s(r['range_to']), state: resolved ? 'resolved' : 'open',
    stateWords: resolved ? `resolved at ${s(r['resolved_at'])}` : 'open — the range stays incomplete until a stream re-walks it',
    cause: `stream range ${s(r['reason_class']).replace('_', ' ')}`, backoff: null, detail: s(r['detail']),
  };
}
export interface CoverageGaps { gaps: GapView[]; counts: { holding: number; open: number; resolved: number }; statement: string }
/** Every gap of the source, newest first: the rate-limited intervals, then the stream ranges — stated, never silent. */
export function coverageGaps(read: Row | null): CoverageGaps {
  const gaps = [...arr(read?.['rate_limited']).map(rateLimitedGap), ...arr(read?.['incomplete_ranges']).map(incompleteGap)];
  const counts = { holding: gaps.filter((g) => g.state === 'holding').length, open: gaps.filter((g) => g.state === 'open').length, resolved: gaps.filter((g) => g.state === 'resolved').length };
  const statement = gaps.length === 0 ? 'No rate-limited interval or incomplete range is recorded for this source.'
    : `${gaps.length} recorded gap(s): ${counts.holding} holding, ${counts.open} open, ${counts.resolved} resolved. Each is an explicit interval, never a silent gap.`;
  return { gaps, counts, statement };
}

/* ── the read ────────────────────────────────────────────────────────────────────────────────────────────────────────────────────── */
export interface AcquisitionView {
  sourceId: string; sourceKey: string; sourceName: string; asOf: string; versions: VersionView[]; authorizations: AuthorizationView[]; gaps: CoverageGaps;
  robots: Array<{ contractVersion: number; origin: string; outcome: string; groups: number; via: string; fetchedAt: string; detail: string }>;
  hold: { until: string; attempt: string } | null;
}
export function toAcquisition(raw: unknown): AcquisitionView {
  const r = obj(raw) ?? {};
  const hold = obj(r['hold']);
  return {
    sourceId: s(r['source_id']), sourceKey: s(r['source_key']), sourceName: s(r['source_name']), asOf: s(r['as_of']),
    versions: arr(r['versions']).map(versionView), authorizations: arr(r['authorizations']).map(authorizationView), gaps: coverageGaps(r),
    robots: arr(r['robots']).map((x) => ({ contractVersion: n(x['contract_version']) ?? 0, origin: s(x['origin']), outcome: s(x['outcome']).replace(/_/g, ' '),
      groups: n(x['groups']) ?? 0, via: s(x['via']), fetchedAt: s(x['fetched_at']), detail: s(x['detail']) })),
    hold: hold === null ? null : { until: s(hold['until']), attempt: s(hold['attempt']) },
  };
}
