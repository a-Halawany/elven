/**
 * B94 §MG — THE REPLAY of a migration wave (UX-66-003: every act attributable, recoverable, replayable): the wave's, its mappings' and its
 * cutovers' states reconstructed from the append-only `onboarding.events` ledger ALONE (pure; the harness proves the reconstruction equals
 * the recorded state). Nothing here reads a table.
 */
type Row = Record<string, unknown>;

export interface WaveReplay {
  wave_state: string | null;
  wave_held: boolean;
  approved_mapping: number | null;
  mappings: Record<string, string>;
  rehearsals: Array<{ seq: number; reconciled: boolean; blocking: number; plan_digest: string | null }>;
  cutovers: Record<string, { state: string; held: boolean }>;
  domain_activated: boolean;
  acceptance: string | null;
  events: number;
}

const num = (v: unknown): number => (typeof v === 'number' ? v : Number(v ?? NaN));

export function replayWave(events: readonly Row[]): WaveReplay {
  const r: WaveReplay = { wave_state: null, wave_held: false, approved_mapping: null, mappings: {}, rehearsals: [], cutovers: {}, domain_activated: false, acceptance: null, events: events.length };
  let current: string | null = null; let reconHeld = false;
  const cut = (id: string) => (r.cutovers[id] ??= { state: 'requested', held: false });
  for (const e of events) {
    const ev = String(e['event']); const d = (e['details'] ?? {}) as Row; const subject = String(e['subject_id'] ?? '');
    switch (ev) {
      case 'wave.opened': r.wave_state = 'planned'; break;
      case 'wave.withdrawn': r.wave_state = 'withdrawn'; reconHeld = false; break;
      case 'mapping.proposed':
        for (const [v, s] of Object.entries(r.mappings)) if (s === 'proposed') r.mappings[v] = 'withdrawn';
        r.mappings[String(e['version'])] = 'proposed'; break;
      case 'mapping.approved':
        for (const [v, s] of Object.entries(r.mappings)) if (s === 'approved') r.mappings[v] = 'superseded';
        r.mappings[String(e['version'])] = 'approved'; r.approved_mapping = num(e['version']); break;
      case 'mapping.rejected': r.mappings[String(e['version'])] = 'rejected'; break;
      case 'rehearsal.reconciled': case 'reconciliation.failed': {
        const clean = ev === 'rehearsal.reconciled';
        r.rehearsals.push({ seq: num(d['seq']), reconciled: clean, blocking: clean ? 0 : num(d['blocking']), plan_digest: typeof d['plan_digest'] === 'string' ? d['plan_digest'] : null });
        r.wave_state = clean && d['mapping_state'] === 'approved' ? 'reconciled' : 'rehearsing'; reconHeld = !clean; break;
      }
      case 'cutover.superseded': cut(subject).state = 'superseded'; cut(subject).held = false; if (current === subject) current = null; break;
      case 'cutover.requested': current = subject; cut(subject).held = false; break;
      case 'cutover.held': current = subject; cut(subject).held = true; break;
      case 'cutover.released': case 'cutover.rechecked': cut(subject).held = false; break;
      case 'cutover.approved': cut(subject).state = 'approved'; cut(subject).held = false; r.wave_state = 'cutover_approved'; break;
      case 'cutover.executed': cut(subject).state = 'executed'; r.wave_state = 'executed'; break;
      case 'cutover.reconciled': cut(subject).state = 'verified'; cut(subject).held = false; r.wave_state = 'verified'; break;
      case 'domain.activated': r.domain_activated = true; r.wave_state = 'activated'; { const c = String(d['cutover_id'] ?? current ?? ''); if (c !== '') cut(c).state = 'activated'; } break;
      case 'rollback.executed': {
        const c = String(d['cutover_id'] ?? current ?? ''); if (c !== '') { cut(c).state = 'rolled_back'; cut(c).held = false; }
        if (d['domain_reverted'] === true) r.domain_activated = false;
        r.wave_state = 'rolled_back'; reconHeld = false; break;
      }
      case 'acceptance.recorded': r.acceptance = 'accepted'; r.wave_state = 'accepted'; break;
      case 'acceptance.withheld': r.acceptance = 'withheld'; break;
      default: break;
    }
  }
  r.wave_held = !['withdrawn', 'rolled_back'].includes(r.wave_state ?? '') && (reconHeld || (current !== null && r.cutovers[current]?.held === true));
  return r;
}
