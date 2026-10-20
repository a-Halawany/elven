/**
 * CP-6 B40 §AP (F-P1-04) — THE ACQUISITION-TIME POLICY, as pure functions: the collection window, robots.txt (RFC 9309), the licence of the
 * rights terms in force, the residency verdict, Retry-After, the contract's backoff, and a response's identity / shape (the anomaly check).
 * No I/O here: the stages (acquisition/stages/authorize-ap.ts, throttle-ap.ts), the scheduler hook and the ingress check call these with the
 * facts they read from current database state, so every verdict is reproducible from its inputs (unit-tested in
 * test/unit/acquisition-policy-b40.test.ts). CONSTRUCTION only.
 */
import { createHash } from 'node:crypto';
import type { SrcV4AcquisitionPolicy, Weekday } from '../sources/source-contract.js';

/** The longest the contract's backoff may hold a source (the bound of SRC@v4 `schedule_seconds`): one day. */
export const MAX_HOLD_SECONDS = 86_400;
/** The longest a request waits in-run for a token of the contract's own bucket before the run is refused `rate_limited`. */
export const MAX_IN_RUN_WAIT_MS = 30_000;
/** The product's robots user agent (the vetted client's user-agent token). */
export const ROBOTS_AGENT = 'the-eye-observation';
/** robots.txt beyond this many bytes is read only up to it (RFC 9309 §2.5: at least 500 KiB must be parsed). */
export const ROBOTS_MAX_BYTES = 512 * 1024;

const DAYS: readonly Weekday[] = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];

/* ── the collection window (SRC@v4 acquisition_policy.window, UTC) ──────────────────────────────────────────────────────────────────── */
export interface WindowVerdict { open: boolean; reason: string; at: string; blackout: { from: string; to: string; reason: string } | null }
export function windowVerdict(w: SrcV4AcquisitionPolicy['window'], at: Date): WindowVerdict {
  const iso = at.toISOString();
  const day = DAYS[at.getUTCDay()] as Weekday;
  const hour = at.getUTCHours();
  for (const b of w.blackout) {
    const from = Date.parse(b.from); const to = Date.parse(b.to);
    if (Number.isFinite(from) && Number.isFinite(to) && at.getTime() >= from && at.getTime() < to) {
      return { open: false, at: iso, blackout: b, reason: `inside the declared blackout ${b.from} – ${b.to} (${b.reason})` };
    }
  }
  if (!w.days.includes(day)) {
    return { open: false, at: iso, blackout: null, reason: `${day} (UTC) is not a collection day of this contract (${w.days.join(', ')})` };
  }
  if (hour < w.hours_utc.from || hour >= w.hours_utc.to) {
    return { open: false, at: iso, blackout: null, reason: `${String(hour).padStart(2, '0')}:00 UTC is outside the collection hours ${w.hours_utc.from}:00–${w.hours_utc.to}:00 UTC` };
  }
  return { open: true, at: iso, blackout: null, reason: `inside the collection window (${w.days.join(', ')}, ${w.hours_utc.from}:00–${w.hours_utc.to}:00 UTC)` };
}

/* ── robots.txt (RFC 9309) ─────────────────────────────────────────────────────────────────────────────────────────────────────────── */
export interface RobotsGroup { agents: string[]; rules: Array<{ allow: boolean; path: string }> }
/** Parse robots.txt into its groups: user-agent lines open a group (consecutive ones share it), allow / disallow lines are its rules; every
 *  other line (sitemap, crawl-delay, comments) is ignored. Bounded to ROBOTS_MAX_BYTES. */
export function parseRobots(text: string): RobotsGroup[] {
  const groups: RobotsGroup[] = [];
  let current: RobotsGroup | null = null;
  let lastWasAgent = false;
  for (const raw of text.slice(0, ROBOTS_MAX_BYTES).split(/\r\n|\r|\n/)) {
    const line = raw.replace(/#.*$/, '').trim();
    const m = /^([A-Za-z-]+)\s*:\s*(.*)$/.exec(line);
    if (m === null) continue;
    const key = (m[1] as string).toLowerCase();
    const value = (m[2] as string).trim();
    if (key === 'user-agent') {
      if (current === null || !lastWasAgent) { current = { agents: [], rules: [] }; groups.push(current); }
      current.agents.push(value.toLowerCase());
      lastWasAgent = true;
    } else if ((key === 'allow' || key === 'disallow') && current !== null) {
      lastWasAgent = false;
      // an empty disallow allows everything (it is no rule); an empty allow is no rule either
      if (value !== '') current.rules.push({ allow: key === 'allow', path: value });
    } else {
      lastWasAgent = false;
    }
  }
  return groups;
}
const escapeRe = (s: string) => s.replace(/[.+?^${}()|[\]\\]/g, '\\$&');
function ruleMatches(rulePath: string, path: string): boolean {
  const anchored = rulePath.endsWith('$');
  const body = anchored ? rulePath.slice(0, -1) : rulePath;
  const re = new RegExp(`^${body.split('*').map(escapeRe).join('.*')}${anchored ? '$' : ''}`);
  return re.test(path);
}
export interface RobotsVerdict { allowed: boolean; path: string; group: string; matched: string | null }
/** The verdict for a URL: the group naming the agent (else `*`), the LONGEST matching rule wins, allow wins a tie, no match allows. */
export function robotsVerdict(groups: RobotsGroup[], url: string, agent = ROBOTS_AGENT): RobotsVerdict {
  const u = new URL(url);
  const path = `${u.pathname}${u.search}`;
  const named = groups.filter((g) => g.agents.some((a) => a !== '*' && agent.toLowerCase().startsWith(a)));
  const chosen = named.length > 0 ? named : groups.filter((g) => g.agents.includes('*'));
  const rules = chosen.flatMap((g) => g.rules);
  let best: { allow: boolean; path: string } | null = null;
  for (const r of rules) {
    if (!ruleMatches(r.path, path)) continue;
    if (best === null || r.path.length > best.path.length || (r.path.length === best.path.length && r.allow && !best.allow)) best = r;
  }
  return { allowed: best === null || best.allow, path, group: named.length > 0 ? agent : chosen.length > 0 ? '*' : 'none', matched: best === null ? null : `${best.allow ? 'Allow' : 'Disallow'}: ${best.path}` };
}
export const originOf = (url: string): string => new URL(url).origin;

/* ── the licence of the rights terms in force ──────────────────────────────────────────────────────────────────────────────────────── */
export interface TermsView { terms_id: string; version: number; state: 'in_force' | 'expired' | 'withdrawn' | string; expires_at: string | null; purposes: string[]; prohibited_uses: string[] }
export interface LicenceVerdict { ok: boolean; class: 'rights' | 'licence' | null; reason: string; usePurposes: string[]; terms: { id: string; version: number; state: string } | null }
/**
 * What the contract collects FOR (its purposes other than the acquisition purpose itself — the run's own purpose, `observation`) must be
 * permitted by the rights terms in force: every use purpose ∈ the terms' purposes, none ∈ the prohibited uses, the terms neither expired
 * (licence) nor withdrawn (rights). No terms declared: the contract's own rights stand alone (the authorization says so).
 */
export function licenceVerdict(contractPurposes: string[], acquisitionPurpose: string, terms: TermsView | null): LicenceVerdict {
  const usePurposes = contractPurposes.filter((p) => p !== acquisitionPurpose);
  if (terms === null) return { ok: true, class: null, usePurposes, terms: null, reason: 'no rights terms declared for this contract version — the contract\'s own rights stand alone' };
  const t = { id: terms.terms_id, version: terms.version, state: terms.state };
  if (terms.state === 'withdrawn') return { ok: false, class: 'rights', usePurposes, terms: t, reason: `the rights terms v${terms.version} are withdrawn` };
  if (terms.state === 'expired') return { ok: false, class: 'licence', usePurposes, terms: t, reason: `the rights terms v${terms.version} expired at ${terms.expires_at ?? '—'}` };
  const norm = (s: string) => s.trim().toLowerCase();
  const permitted = new Set(terms.purposes.map(norm));
  const prohibited = new Set(terms.prohibited_uses.map(norm));
  const banned = usePurposes.filter((p) => prohibited.has(norm(p)));
  if (banned.length > 0) return { ok: false, class: 'licence', usePurposes, terms: t, reason: `the contract collects for ${banned.join(', ')}, which the rights terms v${terms.version} prohibit` };
  const outside = usePurposes.filter((p) => !permitted.has(norm(p)));
  if (outside.length > 0) return { ok: false, class: 'licence', usePurposes, terms: t, reason: `the rights terms v${terms.version} do not permit ${outside.join(', ')} (permitted: ${terms.purposes.join(', ') || 'none'})` };
  return { ok: true, class: null, usePurposes, terms: t, reason: `the rights terms v${terms.version} are in force and permit ${usePurposes.join(', ') || 'collection'}${terms.expires_at === null ? ' (no expiry declared)' : ` until ${terms.expires_at}`}` };
}

/* ── residency at ingress ─────────────────────────────────────────────────────────────────────────────────────────────────────────── */
export interface ResidencyVerdict { verdict: 'match' | 'conflict' | 'undeclared_profile'; refuse: boolean; mode: 'enforce' | 'record'; contract: string; profile: string | null; regions: string[] | null; reason: string }
export function residencyVerdict(contractResidency: string, profile: string | null, regions: string[] | null, mode: 'enforce' | 'record'): ResidencyVerdict {
  const base = { mode, contract: contractResidency, profile, regions };
  if (regions === null || regions.length === 0) {
    return { ...base, verdict: 'undeclared_profile', refuse: mode === 'enforce',
      reason: `the residency profile ${profile ?? '(none)'} declares no admitted region, so ${contractResidency} cannot be shown to be admitted${mode === 'record' ? ' — recorded only (residency_check: record)' : ''}` };
  }
  if (regions.map((r) => r.toUpperCase()).includes(contractResidency.toUpperCase())) {
    return { ...base, verdict: 'match', refuse: false, reason: `the contract's residency ${contractResidency} is admitted by the ${profile} profile (${regions.join(', ')})` };
  }
  return { ...base, verdict: 'conflict', refuse: mode === 'enforce',
    reason: `the contract declares residency ${contractResidency}; the ${profile} profile admits ${regions.join(', ')} only${mode === 'record' ? ' — recorded only (residency_check: record)' : ''}` };
}

/* ── Retry-After and the contract's backoff ───────────────────────────────────────────────────────────────────────────────────────── */
export interface RetryAfter { state: 'absent' | 'parsed' | 'unparsed'; seconds: number | null; raw: string | null }
/** RFC 9110 §10.2.3: delta-seconds or an HTTP-date. Anything else is `unparsed` — the contract's schedule then applies (never sooner). */
export function parseRetryAfter(raw: string | null | undefined, now: Date): RetryAfter {
  if (raw === undefined || raw === null || raw.trim() === '') return { state: 'absent', seconds: null, raw: null };
  const v = raw.trim();
  const keep = v.slice(0, 64);
  if (/^\d{1,10}$/.test(v)) return { state: 'parsed', seconds: Number(v), raw: keep };
  if (/^[A-Za-z]{3}, \d{2} [A-Za-z]{3} \d{4} \d{2}:\d{2}:\d{2} GMT$/.test(v)) {
    const at = Date.parse(v);
    if (Number.isFinite(at)) return { state: 'parsed', seconds: Math.max(0, Math.ceil((at - now.getTime()) / 1000)), raw: keep };
  }
  return { state: 'unparsed', seconds: null, raw: keep };
}
export interface Backoff {
  attempt: number; maxAttempts: number; scheduleDelaySeconds: number; appliedDelaySeconds: number; exhausted: boolean; retryPlanned: boolean;
  retryAfterState: 'honoured' | 'absent' | 'unparsed' | 'not_honoured' | 'own_bucket'; capped: boolean; reason: string;
}
/**
 * The contract's backoff for the attempt-th consecutive rate-limited (or unavailable) attempt: the schedule's delay (its last entry
 * repeats), lengthened to the publisher's Retry-After when the contract honours it — NEVER sooner than either — and bounded by
 * MAX_HOLD_SECONDS. At max_attempts the retries are exhausted: no automatic retry is planned (the hold still applies; the cadence resumes
 * after it). A Retry-After beyond the bound plans no automatic retry either (the hold is capped; the publisher's ask is not undercut by a retry).
 */
export function contractBackoff(b: SrcV4AcquisitionPolicy['backoff'], attempt: number, retryAfter: RetryAfter | null, ownBucketWaitSeconds: number | null = null): Backoff {
  const schedule = b.schedule_seconds.length > 0 ? b.schedule_seconds : [60];
  const scheduleDelay = Math.min(MAX_HOLD_SECONDS, Math.max(1, schedule[Math.min(attempt, schedule.length) - 1] as number));
  let state: Backoff['retryAfterState'] = 'absent';
  let asked: number | null = null;
  if (ownBucketWaitSeconds !== null) { state = 'own_bucket'; asked = ownBucketWaitSeconds; }
  else if (retryAfter !== null && retryAfter.state === 'unparsed') state = 'unparsed';
  else if (retryAfter !== null && retryAfter.state === 'parsed') { state = b.honour_retry_after ? 'honoured' : 'not_honoured'; asked = b.honour_retry_after ? retryAfter.seconds : null; }
  const wanted = Math.max(scheduleDelay, asked ?? 0);
  const capped = wanted > MAX_HOLD_SECONDS;
  const applied = Math.min(MAX_HOLD_SECONDS, Math.max(1, wanted));
  const exhausted = attempt >= b.max_attempts;
  const retryPlanned = !exhausted && !capped;
  const why = state === 'honoured' ? `Retry-After ${asked} s honoured against the schedule's ${scheduleDelay} s`
    : state === 'not_honoured' ? `Retry-After ${retryAfter?.seconds} s given; the contract does not honour Retry-After — the schedule's ${scheduleDelay} s apply`
    : state === 'unparsed' ? `Retry-After "${retryAfter?.raw ?? ''}" could not be read — the schedule's ${scheduleDelay} s apply (never sooner)`
    : state === 'own_bucket' ? `the contract's own rate frees a token in ${asked} s; the schedule's ${scheduleDelay} s at least`
    : `no Retry-After — the schedule's ${scheduleDelay} s`;
  return {
    attempt, maxAttempts: b.max_attempts, scheduleDelaySeconds: scheduleDelay, appliedDelaySeconds: applied, exhausted, retryPlanned,
    retryAfterState: state, capped,
    reason: `attempt ${attempt} of ${b.max_attempts}: ${why}; held ${applied} s${capped ? ` (capped at the contract's bound of ${MAX_HOLD_SECONDS} s — no automatic retry before the publisher's time)` : ''}${exhausted ? ' — retries exhausted: no automatic retry, collection resumes on the cadence after the hold' : retryPlanned ? ' — a retry is planned at the end of the hold' : ''}`,
  };
}

/* ── a response's identity and shape (DP-10-005: manipulation / duplicate detection) ──────────────────────────────────────────────── */
export interface Fingerprint { mediaType: string | null; rootType: 'json-object' | 'json-array' | 'json-scalar' | 'xml' | 'text' | 'binary'; keysDigest: string | null; keyCount: number | null; byteLength: number; contentDigest: string }
const sha = (b: Uint8Array | string) => createHash('sha256').update(b).digest('hex');
export function responseFingerprint(bytes: Buffer, mediaType: string | null): Fingerprint {
  const mt = mediaType === null ? null : mediaType.split(';')[0]!.trim().toLowerCase();
  const base = { mediaType: mt, byteLength: bytes.byteLength, contentDigest: sha(bytes) };
  const text = bytes.subarray(0, 4 * 1024 * 1024).toString('utf8');
  const head = text.trimStart().slice(0, 1);
  if (head === '{' || head === '[' || (mt !== null && mt.includes('json'))) {
    try {
      const v = JSON.parse(bytes.toString('utf8')) as unknown;
      if (Array.isArray(v)) {
        const first = v.find((x) => x !== null && typeof x === 'object' && !Array.isArray(x)) as Record<string, unknown> | undefined;
        const keys = first === undefined ? [] : Object.keys(first).sort();
        return { ...base, rootType: 'json-array', keysDigest: sha(keys.join('\u0000')), keyCount: keys.length };
      }
      if (v !== null && typeof v === 'object') {
        const keys = Object.keys(v as Record<string, unknown>).sort();
        return { ...base, rootType: 'json-object', keysDigest: sha(keys.join('\u0000')), keyCount: keys.length };
      }
      return { ...base, rootType: 'json-scalar', keysDigest: null, keyCount: null };
    } catch { /* not JSON after all: falls through */ }
  }
  if (head === '<') return { ...base, rootType: 'xml', keysDigest: null, keyCount: null };
  // eslint-disable-next-line no-control-regex
  const printable = text.length === 0 || /^[\x09\x0a\x0d\x20-\x7e -￿]*$/.test(text.slice(0, 2048));
  return { ...base, rootType: printable ? 'text' : 'binary', keysDigest: null, keyCount: null };
}
export interface Anomaly { code: 'media_type_changed' | 'root_type_changed' | 'keys_changed' | 'size_collapsed' | 'size_exploded'; detail: string }
/** The anomalies of a response against the last consistent one of the same poll key (none for the first — the baseline). */
export function responseAnomalies(prev: Fingerprint | null, cur: Fingerprint): Anomaly[] {
  if (prev === null) return [];
  const out: Anomaly[] = [];
  const family = (m: string | null) => (m === null ? null : m.includes('json') ? 'json' : m.includes('xml') ? 'xml' : m.split('/')[0] ?? m);
  if (family(prev.mediaType) !== family(cur.mediaType)) out.push({ code: 'media_type_changed', detail: `${prev.mediaType ?? 'none'} → ${cur.mediaType ?? 'none'}` });
  if (prev.rootType !== cur.rootType) out.push({ code: 'root_type_changed', detail: `${prev.rootType} → ${cur.rootType}` });
  else if (prev.keysDigest !== null && cur.keysDigest !== null && prev.keysDigest !== cur.keysDigest) {
    out.push({ code: 'keys_changed', detail: `the top-level fields changed (${prev.keyCount ?? 0} → ${cur.keyCount ?? 0} fields)` });
  }
  if (prev.byteLength >= 256 && cur.byteLength * 10 < prev.byteLength) out.push({ code: 'size_collapsed', detail: `${prev.byteLength} → ${cur.byteLength} bytes` });
  if (cur.byteLength >= 256 && cur.byteLength > prev.byteLength * 10 && prev.byteLength > 0) out.push({ code: 'size_exploded', detail: `${prev.byteLength} → ${cur.byteLength} bytes` });
  return out;
}

/** A URL as it may be recorded: the existing redaction (no userinfo, the query replaced) — connectors/redaction.ts. */
export { redactUrl as redactEndpoint } from '../connectors/redaction.js';
