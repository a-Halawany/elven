/**
 * B94 §ON — THE REPLAY (PR-67-002 "persist, expose, version, reconcile"): the onboarding ledger reconstructs a programme's history. Every
 * programme act writes one `programme.*` event carrying the version it produced, its state, its digest, its target domain and its held
 * reasons; folding the events in order yields the version chain, which must equal the stored versions (the harness checks it; the page shows
 * the chain). Pure: no I/O.
 */
type Row = Record<string, unknown>;

export interface ReplayedVersion { version: number; event: string; state: string; digest: string; target_domain_id: string | null; at: string; actor: string }
export interface Replay { versions: ReplayedVersion[]; consistent: boolean; mismatches: string[] }

const str = (v: unknown): string => (v instanceof Date ? v.toISOString() : String(v ?? ''));

/** Fold the `programme.*` events (oldest first) into the version chain; compare with the stored versions when given. */
export function replayProgramme(events: readonly Row[], stored: readonly Row[] = []): Replay {
  const versions: ReplayedVersion[] = [];
  for (const e of events) {
    const ev = String(e['event'] ?? '');
    if (!ev.startsWith('programme.') || e['subject_kind'] !== 'onboarding_programme') continue;
    const d = (e['details'] ?? {}) as Row;
    versions.push({ version: Number(e['version']), event: ev, state: String(d['state'] ?? ''), digest: String(d['digest'] ?? ''),
                    target_domain_id: d['target_domain_id'] === undefined || d['target_domain_id'] === null ? null : String(d['target_domain_id']),
                    at: str(e['occurred_at']), actor: String(e['actor_principal_id'] ?? '') });
  }
  const mismatches: string[] = [];
  versions.forEach((v, i) => { if (v.version !== i + 1) mismatches.push(`event ${i + 1} (${v.event}) produced v${v.version}, expected v${i + 1}`); });
  if (stored.length > 0) {
    const byVersion = new Map(stored.map((s) => [Number(s['version']), s]));
    if (byVersion.size !== versions.length) mismatches.push(`${versions.length} version(s) replayed, ${byVersion.size} stored`);
    for (const v of versions) {
      const s = byVersion.get(v.version);
      if (s === undefined) { mismatches.push(`v${v.version} replayed but not stored`); continue; }
      if (String(s['state']) !== v.state) mismatches.push(`v${v.version}: state ${v.state} replayed, ${String(s['state'])} stored`);
      if (String(s['digest']) !== v.digest) mismatches.push(`v${v.version}: digest differs`);
    }
  }
  return { versions, consistent: mismatches.length === 0, mismatches };
}
