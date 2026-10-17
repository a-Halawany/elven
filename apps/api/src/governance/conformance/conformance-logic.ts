/**
 * B107 §CM — THE PURE LOGIC of conformance (no database, no Nest; unit-tested in test/unit/governance-conformance-b107.test.ts):
 *   * monitorFindings — what the local conformance monitor observes (V03-T-479, IA-01-002, DP-65-002): manifest drift / unregistered /
 *     unreadable, policy-bundle drift, migration-head drift, head drift, evidence expiry, an expired exception holding a candidate, an exception
 *     artifact past its expiry — each with a stable FINGERPRINT (the port opens a new one, resolves one no longer observed) and whether it HOLDS
 *     its subject candidate;
 *   * componentStates — the conformance service's state per component (DAT-GV-09), NEVER inferred: no deploying unit → not_deployed; no
 *     candidate binding the current manifest → unverified; a held / refused / drifted candidate says so; `conformant_local` only on a
 *     conformant or attested candidate of the current manifest with no open hold (build-level evidence — per-component suites are H2);
 *   * closureGaps — the closure statement (V04-T-018, V07-T-004): which closure dimensions each component declares and which are CARRIED
 *     (B63 runbooks, B64 SLO computation, B106 parity) — a gap report, never a closure;
 *   * refusalOf — the check's outcome as the route's refusal (held > stale > evidence > unverifiable > foreign_version).
 * THREE CLAIMS: construction only; nothing here states a production fact (R1) or an acceptance (R2).
 */
type Row = Record<string, unknown>;

export const LIVE_CANDIDATE_STATES = ['assembled', 'conformant', 'refused', 'held', 'attested'] as const;
export const DRIFT_KINDS = ['manifest_drift', 'policy_drift', 'migration_drift', 'head_drift'] as const;

export interface MonitorObservation {
  identity: { head_sha: string; policy_bundle: { version: string; digest: string }; manifest: { readable: boolean; file_digest: string | null; reason: string | null; path: string } };
  migration_head: string | null;
  registered: { manifest_id: string; version: number; file_digest: string } | null;
  candidates: Array<{ candidate_id: string; version: number; label: string; state: string; head_sha: string; migration_head: string; policy_bundle: { version?: string; digest?: string };
                      manifest_digest: string; evidence: Array<{ item: number; ref: string; family: string; valid_until: string }> }>;
  /** open holds on candidates from other parts (an expired exception, a conflict) */
  holds: Array<{ hold_id: string; subject_artifact: string; reason_kind: string; reason: string }>;
  /** exception artifacts (§PG) whose attributes carry expires_at */
  exceptions: Array<{ artifact_id: string; external_key: string; title: string; expires_at: string }>;
  now: string;
}
export interface Finding { kind: string; fingerprint: string; subject_artifact: string | null; summary: string; observed: Row; expected: Row; hold: boolean; hold_kind?: 'conformance_drift' | 'evidence_stale' }

const short = (s: string | null | undefined, n = 12): string => (s === null || s === undefined ? '∅' : s.slice(0, n));

/** What the monitor observes, as findings (deterministic: the same observation → the same findings, sorted by fingerprint). */
export function monitorFindings(o: MonitorObservation): Finding[] {
  const out: Finding[] = [];
  const m = o.identity.manifest;
  if (!m.readable) {
    out.push({ kind: 'manifest_unreadable', fingerprint: 'manifest_unreadable', subject_artifact: o.registered?.manifest_id ?? null,
               summary: `the committed component manifest cannot be read (${m.reason ?? 'unknown reason'}) — nothing is inferred conformant`, observed: { path: m.path, reason: m.reason }, expected: { readable: true }, hold: false });
  } else if (o.registered === null) {
    out.push({ kind: 'manifest_unregistered', fingerprint: `manifest_unregistered:${m.file_digest}`, subject_artifact: null,
               summary: `the committed component manifest (${short(m.file_digest)}) is not registered — the conformance steward registers it`, observed: { file_digest: m.file_digest }, expected: { registered: true }, hold: false });
  } else if (o.registered.file_digest !== m.file_digest) {
    out.push({ kind: 'manifest_drift', fingerprint: `manifest_drift:${o.registered.file_digest}:${m.file_digest}`, subject_artifact: o.registered.manifest_id,
               summary: `the committed component manifest (${short(m.file_digest)}) differs from the registered v${o.registered.version} (${short(o.registered.file_digest)})`,
               observed: { file_digest: m.file_digest }, expected: { file_digest: o.registered.file_digest, version: o.registered.version }, hold: false });
  }
  const live = o.candidates.filter((c) => (LIVE_CANDIDATE_STATES as readonly string[]).includes(c.state));
  for (const c of live) {
    const at = `${c.label} v${c.version}`;
    if (m.readable && m.file_digest !== null && c.manifest_digest !== m.file_digest) {
      out.push({ kind: 'manifest_drift', fingerprint: `manifest_drift:${c.candidate_id}:${m.file_digest}`, subject_artifact: c.candidate_id, hold: true, hold_kind: 'conformance_drift',
                 summary: `${at} binds manifest ${short(c.manifest_digest)}; the code now carries ${short(m.file_digest)}`, observed: { file_digest: m.file_digest }, expected: { file_digest: c.manifest_digest } });
    }
    const pd = c.policy_bundle.digest ?? '';
    if (pd !== o.identity.policy_bundle.digest) {
      out.push({ kind: 'policy_drift', fingerprint: `policy_drift:${c.candidate_id}:${o.identity.policy_bundle.digest}`, subject_artifact: c.candidate_id, hold: true, hold_kind: 'conformance_drift',
                 summary: `${at} binds policy bundle ${c.policy_bundle.version ?? '?'} (${short(pd)}); this runtime enforces ${o.identity.policy_bundle.version} (${short(o.identity.policy_bundle.digest)})`,
                 observed: o.identity.policy_bundle, expected: c.policy_bundle });
    }
    if (o.migration_head !== null && c.migration_head !== o.migration_head) {
      out.push({ kind: 'migration_drift', fingerprint: `migration_drift:${c.candidate_id}:${o.migration_head}`, subject_artifact: c.candidate_id, hold: true, hold_kind: 'conformance_drift',
                 summary: `${at} binds migration head ${c.migration_head}; the database runs ${o.migration_head}`, observed: { migration_head: o.migration_head }, expected: { migration_head: c.migration_head } });
    }
    if (o.identity.head_sha !== 'unknown' && c.head_sha !== o.identity.head_sha) {
      out.push({ kind: 'head_drift', fingerprint: `head_drift:${c.candidate_id}:${o.identity.head_sha}`, subject_artifact: c.candidate_id, hold: true, hold_kind: 'conformance_drift',
                 summary: `${at} was assembled at ${short(c.head_sha)}; this runtime is ${short(o.identity.head_sha)}`, observed: { head_sha: o.identity.head_sha }, expected: { head_sha: c.head_sha } });
    }
    for (const e of c.evidence) {
      if (Date.parse(e.valid_until) <= Date.parse(o.now)) {
        out.push({ kind: 'evidence_expired', fingerprint: `evidence_expired:${c.candidate_id}:v${c.version}:${e.item}`, subject_artifact: c.candidate_id, hold: true, hold_kind: 'evidence_stale',
                   summary: `${at}: the ${e.family.replace('_', ' ')} evidence ${e.ref} expired at ${e.valid_until}`, observed: { now: o.now }, expected: { valid_until: e.valid_until } });
      }
    }
  }
  const liveIds = new Set(live.map((c) => c.candidate_id));
  for (const h of o.holds) {
    if (h.reason_kind !== 'exception_expired' || !liveIds.has(h.subject_artifact)) continue;
    out.push({ kind: 'exception_expired', fingerprint: `exception_expired:${h.hold_id}`, subject_artifact: h.subject_artifact, hold: false,
               summary: `an expired exception holds the candidate: ${h.reason} (its renewal is the governance workspace's)`, observed: { hold_id: h.hold_id }, expected: { renewed: true } });
  }
  for (const x of o.exceptions) {
    if (Date.parse(x.expires_at) > Date.parse(o.now)) continue;
    out.push({ kind: 'exception_expiry_reported', fingerprint: `exception_expiry:${x.artifact_id}:${x.expires_at}`, subject_artifact: x.artifact_id, hold: false,
               summary: `the exception ${x.external_key} (${x.title}) expired at ${x.expires_at} — reported; its renewal or closure is the governance workspace's`, observed: { now: o.now }, expected: { expires_at: x.expires_at } });
  }
  return out.sort((a, b) => a.fingerprint.localeCompare(b.fingerprint));
}

// ─────────────────────────────── the conformance service: a state per component, never inferred ───────────────────────────────
export interface ComponentState { component_id: string; kind: string; layer: string | null; deployed_by: string[]; state: 'not_deployed' | 'unverified' | 'nonconformant' | 'held' | 'drifted' | 'conformant_local'; basis: string }

export function componentStates(a: {
  components: Row[]; registered: { version: number; file_digest: string } | null;
  candidates: Array<{ candidate_id: string; version: number; label: string; state: string; manifest_digest: string; proposed_at: string; head_sha: string }>;
  openHoldsBySubject: Record<string, number>; openDriftFindings: number;
}): ComponentState[] {
  const bound = a.registered === null ? [] : a.candidates.filter((c) => c.manifest_digest === a.registered?.file_digest && (LIVE_CANDIDATE_STATES as readonly string[]).includes(c.state))
    .sort((x, y) => y.proposed_at.localeCompare(x.proposed_at));
  const latest = bound[0] ?? null;
  return a.components.map((c) => {
    const id = String(c['component_id']); const deployed = ((c['deployed_by'] ?? []) as string[]).map(String);
    const base = { component_id: id, kind: String(c['kind'] ?? ''), layer: (c['layer'] as string | undefined) ?? null, deployed_by: deployed };
    if (deployed.length === 0) return { ...base, state: 'not_deployed' as const, basis: 'catalogued: no deployable unit of this repository deploys it' };
    if (a.registered === null) return { ...base, state: 'unverified' as const, basis: 'no component manifest is registered' };
    if (latest === null) return { ...base, state: 'unverified' as const, basis: `no release candidate binds manifest v${a.registered.version}` };
    const at = `candidate ${latest.label} v${latest.version}`;
    if (a.openDriftFindings > 0) return { ...base, state: 'drifted' as const, basis: `${a.openDriftFindings} open drift finding(s): what runs is not what ${at} checked` };
    if ((a.openHoldsBySubject[latest.candidate_id] ?? 0) > 0 || latest.state === 'held') return { ...base, state: 'held' as const, basis: `${at} is held` };
    if (latest.state === 'refused') return { ...base, state: 'nonconformant' as const, basis: `${at} was refused by its evidence check` };
    if (latest.state === 'conformant' || latest.state === 'attested') {
      return { ...base, state: 'conformant_local' as const, basis: `${at} is ${latest.state} at ${latest.head_sha.slice(0, 12)} — build-level evidence (per-component suites are H2; production is R1)` };
    }
    return { ...base, state: 'unverified' as const, basis: `${at} has not been checked` };
  });
}

// ─────────────────────────────── the closure statement (a gap report — never a closure) ───────────────────────────────
export const CLOSURE_DIMENSIONS = [
  { dimension: 'controlling invariant / control', declared: (c: Row) => ((c['controls'] ?? []) as unknown[]).length > 0, carrier: null },
  { dimension: 'layer and component identity', declared: (c: Row) => typeof c['component_id'] === 'string' && typeof c['layer'] === 'string', carrier: null },
  { dimension: 'canonical object and interface', declared: (c: Row) => (((c['contracts'] as Row | undefined)?.['interfaces'] ?? []) as unknown[]).length > 0, carrier: null },
  { dimension: 'state owner', declared: (c: Row) => (((c['dependencies'] as Row | undefined)?.['deployed_by'] ?? []) as unknown[]).length > 0, carrier: 'a deploying unit (UNIT_MAP)' },
  { dimension: 'quality contract (computed SLO)', declared: (c: Row) => (c['slo'] as Row | undefined)?.['computed'] === true, carrier: 'B64' },
  { dimension: 'failure and recovery semantics', declared: (c: Row) => typeof (c['recovery'] as Row | undefined)?.['affected_product_semantics'] === 'string', carrier: null },
  { dimension: 'runbook', declared: () => false, carrier: 'B63' },
  { dimension: 'deployment-parity fixture', declared: () => false, carrier: 'B106' },
] as const;

export function closureGaps(manifest: Row): { dimensions: string[]; totals: Row; components: Array<{ component_id: string; layer: string; gaps: Array<{ dimension: string; carrier: string | null }> }>; data: Row; statement: string } {
  const lcs = (manifest['logical_components'] ?? []) as Row[];
  const components = lcs.map((c) => ({ component_id: String(c['component_id']), layer: String(c['layer']),
    gaps: CLOSURE_DIMENSIONS.filter((d) => !d.declared(c)).map((d) => ({ dimension: d.dimension, carrier: d.carrier })) }));
  const totals: Row = Object.fromEntries(CLOSURE_DIMENSIONS.map((d) => [d.dimension, components.filter((c) => c.gaps.some((g) => g.dimension === d.dimension)).length]));
  const dat = (manifest['data_components'] ?? []) as Row[];
  const undeployed = dat.filter((d) => ((d['deployed_by'] ?? []) as unknown[]).length === 0).map((d) => String(d['component_id']));
  return {
    dimensions: CLOSURE_DIMENSIONS.map((d) => d.dimension), totals, components,
    data: { data_components: dat.length, without_deployable_realization: undeployed.length, ids: undeployed },
    statement: `Volume 4 / Volume 7 baseline closure is NOT reached: ${components.filter((c) => c.gaps.length > 0).length} of ${components.length} logical components carry an open closure dimension (computed SLOs B64, runbooks B63, deployment parity B106); ${undeployed.length} of ${dat.length} data components have no deployable realization here. This is a gap report, never a closure.`,
  };
}

// ─────────────────────────────── the check's outcome as a refusal ───────────────────────────────
const ORDER: Array<{ cls: string; status: number }> = [{ cls: 'held', status: 409 }, { cls: 'stale', status: 409 }, { cls: 'evidence', status: 422 }, { cls: 'unverifiable', status: 422 }, { cls: 'foreign_version', status: 422 }];
export function refusalOf(result: Row): { status: number; cls: string; message: string } | null {
  const outcome = String(result['outcome'] ?? '');
  if (outcome === 'conformant') return null;
  const reasons = (result['reasons'] ?? []) as Row[]; const holds = (result['holds'] ?? []) as Row[];
  const classes = new Set<string>([...(holds.length > 0 ? ['held'] : []), ...reasons.map((r) => String(r['class']))]);
  const top = ORDER.find((o) => classes.has(o.cls)) ?? { cls: 'evidence', status: 422 };
  const parts = [
    ...holds.map((h) => `held (${String(h['reason_kind'])}): ${String(h['reason'])}`),
    ...reasons.map((r) => `${String(r['class'])}: ${String(r['detail'])}`),
  ];
  return { status: top.status, cls: top.cls, message: `the candidate is ${outcome} — ${parts.join('; ')}` };
}

/** The attestation's eligibility in words (the PORT decides; this explains — never the reverse). */
export function attestEligibility(a: { principalKind: string; principalId: string; holdsAssurance: boolean; candidate: Row; openHolds: number }): { can_attest: boolean; reasons: string[] } {
  const reasons: string[] = [];
  if (a.principalKind !== 'human') reasons.push('a named human attests; an agent never does');
  if (!a.holdsAssurance) reasons.push('you do not hold independent_assurance');
  if (a.candidate['proposed_by'] === a.principalId) reasons.push('you assembled this candidate (never its proposer)');
  if (((a.candidate['builders'] ?? []) as string[]).includes(a.principalId)) reasons.push('you are a declared builder of this candidate (independence)');
  if (a.candidate['state'] !== 'conformant') reasons.push(`the candidate is ${String(a.candidate['state'])}; only a conformant check is attested`);
  if (a.openHolds > 0) reasons.push(`${a.openHolds} open hold(s) on the candidate`);
  return { can_attest: reasons.length === 0, reasons };
}
