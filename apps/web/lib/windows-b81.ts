/**
 * CP-6 B81 §LY-M — THE COMMAND ENVIRONMENT's CONTRACT as pure functions (F-P7-E-04: UX-16-001…005, PAT-45 session handoff, PAT-46
 * large-display control, BP-05 the ≥ 1920 composition). components/command-environment.tsx renders what this file decides; the server
 * (0119_b81_x_lym) is the authority on every handoff and display.
 *
 *  - THE CONTROL-SURFACE RULE (UX-16-004, PAT-46): a window is a CONTROL surface, a MIRROR or a PRESENTATION. Only an authenticated control
 *    surface, not frozen, with the person's own eligibility, may offer a command; a mirror and a presentation NEVER render a consequential
 *    control (assertNoControls — the presentation's own component and page are checked by source in windows-b81.test.ts).
 *  - THE SYNC MODEL (UX-16-003/005): the windows of ONE browser speak over a BroadcastChannel (`eye.windows.<display>`): the control surface
 *    broadcasts its state (version, selection, watermark, classification) and a heartbeat; a mirror applies a state only from the control
 *    surface, in sequence, with its classification — otherwise it FREEZES (drift, sync failure, classification loss, control unavailable),
 *    keeps the LAST VERIFIED state, and shows the DIVERGENCE WATERMARK. The server's presentation state (shell.presentation_of) is the
 *    record across devices; the channel is only the fast path.
 *  - THE WINDOW COMMANDS (UX-16-003): open, synchronize, detach, present, hand off, close — each naming the authoritative control surface and
 *    the current data watermark; each is navigation or presentation (none is an institutional act).
 *  - THE HANDOFF (PAT-45, DESIGN D10): an offer of the review context to the SAME person's other signed-in session; the claim restores the
 *    route, the version and the selection, and the claiming session acts with its OWN roles (re-read by the server) — never inherited.
 *  - THE ROOM (BP-05): the ≥ 1920 composition's regions — the corridor (B82 gm: a MapCanvas with this STRUCTURED list as its table alternative), the warning
 *    queue, the twin state — built by ONE function for the control surface and the presentation (multi-window consistency).
 *
 * CONSTRUCTION only; the walk is the demonstration (SYNTHETIC); nothing here is accepted.
 */
import { call, type ApiResult } from './api';
import type { HandoffOffer, PresentationState } from './b81-seams';
import type { ShellScope } from './b80-seams';
import { safeLocation } from './shell-b80';
import { actionClassOf, isConsequential } from './authority-b81';

type Row = Record<string, unknown>;
type Receipt = { policyDecisionId: string; auditSeq: number };

/** The windows contract (shell.windows_contract_version() — the same string). */
export const WINDOWS_CONTRACT = 'b81-lym-windows-1';
/** The operations room's display key and composition key (§LY-G's shell.preferences composition). */
export const ROOM_DISPLAY = 'operations-room';
export const ROOM_COMPOSITION = 'home.operations-room';
export const ROOM_ROUTE = '/home/operations-room';
export const PRESENT_ROUTE = '/present';
/** BP-05: the command composition needs this many CSS pixels; below it the room reflows (§LY-G's classes) and says so. */
export const COMMAND_MIN_PX = 1920;
/** A mirror that has not heard its control surface for this long is in SYNC FAILURE (the heartbeat is every HEARTBEAT_MS). */
export const HEARTBEAT_MS = 5_000;
export const SYNC_TIMEOUT_MS = 15_000;
/** A display whose own data is further than this from the control surface's watermark is DIVERGED. */
export const DIVERGENCE_TOLERANCE_MS = 120_000;
/** The server re-read cadence of a presentation (the record across devices). */
export const PRESENTATION_POLL_MS = 10_000;
export const AUDIENCES = ['private', 'briefing_room', 'operations_centre', 'kiosk'] as const;
export type Audience = (typeof AUDIENCES)[number];
export const AUDIENCE_WORDS: Readonly<Record<Audience, string>> = {
  private: 'you alone', briefing_room: 'a briefing room', operations_centre: 'an operations centre', kiosk: 'a secure kiosk',
};
export const CLASSIFICATIONS = ['public', 'internal', 'confidential', 'restricted'] as const;
/** The handoff's lifetime choices (seconds) — the server bounds 60–1800. */
export const EXPIRY_CHOICES: ReadonlyArray<{ seconds: number; label: string }> = [
  { seconds: 300, label: '5 minutes' }, { seconds: 600, label: '10 minutes' }, { seconds: 1800, label: '30 minutes' },
];

/* ═════════════════════════════ 1 · THE CONTROL-SURFACE RULE (UX-16-004, PAT-46) ═════════════════════════════ */

export type SurfaceKind = 'control' | 'mirror' | 'presentation';
export const SURFACE_WORDS: Readonly<Record<SurfaceKind, { label: string; statement: string }>> = {
  control: { label: 'CONTROL SURFACE', statement: 'This window is the authenticated control surface: commands are offered here, each behind its own review and the server\'s check.' },
  mirror: { label: 'MIRROR — not a control surface', statement: 'This window mirrors the control surface. It commands nothing; open the control surface to act.' },
  presentation: { label: 'PRESENTATION — not a control surface', statement: 'This display presents what its control surface published. It carries no control and commands nothing.' },
};

export interface SurfaceFacts {
  /** the route renders the presentation-only view */ presentationRoute: boolean;
  /** the window was opened as a mirror of the room (`?mirror=1` — a window opened from the control surface shares its session) */ mirrorWindow?: boolean;
  /** a session is signed in in this window (the server said who this is) */ authenticated: boolean;
  /** the display's current state, as the server read it (null: nothing is presented — this window is free to be the control surface) */
  display: Pick<PresentationStateView, 'control_session_here' | 'control_available' | 'status'> | null;
}
/** Which surface is this window? A presentation route is ALWAYS a presentation; a window that does not hold the display's control is a mirror. */
export function surfaceOf(f: SurfaceFacts): SurfaceKind {
  if (f.presentationRoute) return 'presentation';
  if (f.mirrorWindow === true || !f.authenticated) return 'mirror';
  if (f.display === null || f.display.status === 'ended') return 'control';
  return f.display.control_session_here ? 'control' : 'mirror';
}

/** May THIS window offer THIS command now? The first failing rule is the reason; the server re-checks every act. */
export function mayCommand(a: { surface: SurfaceKind; action: string; frozen: readonly FreezeReason[]; eligibility?: { can: boolean; reason: string | null } }): { can: boolean; reason: string | null } {
  if (a.surface === 'presentation') return { can: false, reason: 'a presentation is never a control surface — it renders no command' };
  if (a.surface === 'mirror') return { can: false, reason: 'this window mirrors the control surface — act from the control surface (or claim a handoff there)' };
  if (a.frozen.length > 0) return { can: false, reason: `the view is frozen (${a.frozen.map((r) => FREEZE_WORDS[r].short).join(', ')}) — recover it before acting` };
  if (a.eligibility !== undefined && !a.eligibility.can) return { can: false, reason: a.eligibility.reason ?? 'you are not eligible for this act' };
  return { can: true, reason: null };
}

/** An element a surface renders (its role, and the governed action it would trigger, if any). */
export interface RenderedControl { role: string; label: string; action?: string | null }
const INTERACTIVE_ROLES = new Set(['button', 'link', 'textbox', 'combobox', 'checkbox', 'radio', 'menuitem', 'switch', 'slider', 'form', 'listbox', 'option', 'tab']);
/**
 * THE PRESENTATION BOUNDARY: a presentation or mirror renders NO interactive control, and above all no consequential one (approval,
 * publication, effect). Throws, naming the first offender. The control surface may render controls (each behind its own review).
 */
export function assertNoControls(surface: SurfaceKind, rendered: readonly RenderedControl[]): void {
  if (surface === 'control') return;
  for (const c of rendered) {
    const consequential = c.action !== undefined && c.action !== null && isConsequential(actionClassOf(c.action));
    if (consequential) throw new Error(`a ${surface} renders a consequential control: "${c.label}" (${c.action}) — only the authenticated control surface commands`);
    if (INTERACTIVE_ROLES.has(c.role)) throw new Error(`a ${surface} renders a control: ${c.role} "${c.label}" — a ${surface} carries no control`);
  }
}
/** The source-level form of the boundary: the markup and handlers a presentation's source must never contain. */
export const PRESENTATION_FORBIDDEN: ReadonlyArray<{ re: RegExp; what: string }> = [
  { re: /<button\b/, what: 'a <button>' }, { re: /<a\s/, what: 'an <a> link' }, { re: /<Link\b/, what: 'a Next <Link>' }, { re: /<input\b/, what: 'an <input>' },
  { re: /<select\b/, what: 'a <select>' }, { re: /<textarea\b/, what: 'a <textarea>' }, { re: /<form\b/, what: 'a <form>' },
  { re: /<(?:Governed)?Button\b/, what: 'a Button / GovernedButton' }, { re: /\bonClick\s*=/, what: 'an onClick handler' }, { re: /\bonSubmit\s*=/, what: 'an onSubmit handler' },
  { re: /\btabIndex\s*=\s*\{?\s*0/, what: 'a focusable element' }, { re: /\bCommandReview\b|\bTypedConfirmation\b|\bHandoffDialog\b/, what: 'a command component' },
];
export function presentationSourceProblems(source: string): string[] {
  const code = source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
  return PRESENTATION_FORBIDDEN.filter((f) => f.re.test(code)).map((f) => f.what);
}

/* ═════════════════════════════ 2 · THE SYNC MODEL (UX-16-003 / -005) ═════════════════════════════ */

export interface Snapshot {
  /** the presentation version this snapshot is of (0 = not published yet) */ version: number;
  location: { route: string; selection?: Array<{ kind: string; id: string; version?: number }>; title?: string } | null;
  /** the instant the shown data is as of (the server's) */ watermark: string | null;
  classification: string | null;
  at: string;
}
export type SyncMessage =
  | { kind: 'state'; from: string; surface: SurfaceKind; seq: number; snapshot: Snapshot }
  | { kind: 'heartbeat'; from: string; surface: SurfaceKind; seq: number; at: string }
  | { kind: 'close'; from: string; surface: SurfaceKind; seq: number };
export type FreezeReason = 'drift' | 'sync_failure' | 'classification_lost' | 'control_unavailable' | 'ended';
export const FREEZE_WORDS: Readonly<Record<FreezeReason, { short: string; headline: string; recovery: string }>> = {
  drift: { short: 'views drifted', headline: 'The views drifted: this window missed an update of the control surface.',
    recovery: 'The last verified state is kept. Re-read the display from the server (it happens on its own every few seconds), or reopen this window from the control surface.' },
  sync_failure: { short: 'synchronisation lost', headline: 'Synchronisation with the control surface is lost.',
    recovery: 'The last verified state is kept and updates are frozen until the control surface is heard again; check that its window is still open.' },
  classification_lost: { short: 'classification context lost', headline: 'This display lost its classification context.',
    recovery: 'The content is withheld until the control surface publishes the display again with its classification.' },
  control_unavailable: { short: 'control surface unavailable', headline: 'The control surface is no longer signed in.',
    recovery: 'Nothing is commanded from here. Sign in on the device that will control the display; publishing from it takes control (re-authentication).' },
  ended: { short: 'presentation ended', headline: 'The presentation ended.', recovery: 'Nothing is shown. The control surface may present again.' },
};

export interface MirrorState {
  /** the control surface's window id this mirror follows (the first one heard; null until heard) */ control: string | null;
  lastSeq: number; lastVerified: Snapshot | null; lastHeardAt: number | null; frozen: FreezeReason[];
}
export const EMPTY_MIRROR: MirrorState = { control: null, lastSeq: 0, lastVerified: null, lastHeardAt: null, frozen: [] };
const withFreeze = (s: MirrorState, r: FreezeReason): MirrorState => (s.frozen.includes(r) ? s : { ...s, frozen: [...s.frozen, r] });
const without = (s: MirrorState, ...rs: FreezeReason[]): MirrorState => ({ ...s, frozen: s.frozen.filter((x) => !rs.includes(x)) });

/**
 * A mirror receives a channel message. It follows ONE control surface; a message from any other surface (another mirror, a presentation)
 * is ignored — a hidden control path is never followed. A sequence gap is DRIFT (the snapshot is NOT applied: the last verified state is
 * kept until the server read verifies the new one); a state without its classification FREEZES the content.
 */
export function reduceMirror(s: MirrorState, m: SyncMessage, now: number): MirrorState {
  if (m.surface !== 'control') return s;
  if (s.control !== null && m.from !== s.control) return s;
  const first = s.control === null;
  const heard: MirrorState = { ...s, control: m.from, lastHeardAt: now };
  if (m.kind === 'close') return withFreeze({ ...heard, lastSeq: Math.max(s.lastSeq, m.seq) }, 'control_unavailable');
  /* a heartbeat carries the sequence of the LAST state the control surface sent: a higher one means this mirror missed a state (drift) */
  if (m.kind === 'heartbeat') {
    if (first) return without({ ...heard, lastSeq: m.seq }, 'sync_failure');
    return m.seq > s.lastSeq ? withFreeze(without(heard, 'sync_failure'), 'drift') : without(heard, 'sync_failure');
  }
  if (!first && m.seq <= s.lastSeq) return heard;                                          // a duplicate or a late state: nothing to apply
  if (!first && m.seq !== s.lastSeq + 1) return withFreeze({ ...heard, lastSeq: m.seq }, 'drift');   // a gap: NOT applied
  if (m.snapshot.classification === null || !(CLASSIFICATIONS as readonly string[]).includes(m.snapshot.classification)) {
    return withFreeze({ ...heard, lastSeq: m.seq }, 'classification_lost');
  }
  return without({ ...heard, lastSeq: m.seq, lastVerified: m.snapshot }, 'drift', 'sync_failure', 'classification_lost', 'control_unavailable');
}

/** The SERVER's record verifies (or contradicts) what the mirror shows: a newer version re-verifies; an ended display withholds; a signed-out control is unavailable. */
export function verifyAgainstServer(s: MirrorState, server: PresentationStateView | null, now: number): MirrorState {
  if (server === null) return s;
  if (server.status === 'ended') return withFreeze({ ...s, lastVerified: null }, 'ended');
  let out = without(s, 'ended');
  out = server.control_available ? without(out, 'control_unavailable') : withFreeze(out, 'control_unavailable');
  if (server.classification === null) return withFreeze(out, 'classification_lost');
  /* a NEWER published version re-verifies (and ends a drift); the same version keeps the channel's fresher state of that version */
  if (out.lastVerified === null || server.version > out.lastVerified.version) {
    out = without({ ...out, lastVerified: snapshotOf(server) }, 'drift', 'classification_lost');
  }
  void now;
  return out;
}
/** Time passes: a mirror that has not heard its control surface within SYNC_TIMEOUT_MS is in sync failure (only when it ever heard one). */
export function tickMirror(s: MirrorState, now: number, timeoutMs = SYNC_TIMEOUT_MS): MirrorState {
  if (s.lastHeardAt === null) return s;
  return now - s.lastHeardAt > timeoutMs ? withFreeze(s, 'sync_failure') : s;
}

export interface Divergence { diverged: boolean; text: string; shown: { version: number; watermark: string | null }; control: { version: number; watermark: string | null } | null }
/** THE DIVERGENCE WATERMARK: what this view shows against what the control surface published — said in words, never styled as current. */
export function divergenceOf(shown: Snapshot | null, control: Snapshot | null, ownDataAt: string | null = null, toleranceMs = DIVERGENCE_TOLERANCE_MS): Divergence {
  const sv = { version: shown?.version ?? 0, watermark: shown?.watermark ?? null };
  const cv = control === null ? null : { version: control.version, watermark: control.watermark };
  const reasons: string[] = [];
  if (cv !== null && sv.version < cv.version) reasons.push(`this view shows version ${sv.version}; the control surface is at version ${cv.version}`);
  if (ownDataAt !== null && cv?.watermark !== null && cv?.watermark !== undefined) {
    const d = Math.abs(Date.parse(ownDataAt) - Date.parse(cv.watermark));
    if (Number.isFinite(d) && d > toleranceMs) reasons.push(`this display's own data is as of ${ownDataAt}; the control surface's is as of ${cv.watermark}`);
  }
  if (reasons.length === 0) {
    return { diverged: false, text: `In step with the control surface — version ${sv.version}, data as of ${sv.watermark ?? 'not stated'}.`, shown: sv, control: cv };
  }
  return { diverged: true, text: `DIVERGED — ${reasons.join('; ')}. The last verified state is shown.`, shown: sv, control: cv };
}

/** The channel of one display (the windows of ONE browser; another device reads the server). */
export const channelName = (display: string): string => `eye.windows.${display}`;
export interface SyncChannel { available: boolean; post(m: SyncMessage): void; close(): void }
/** Open the display's channel (feature-detected: a browser without BroadcastChannel synchronises through the server only — said, not hidden). */
export function openSyncChannel(display: string, onMessage: (m: SyncMessage) => void): SyncChannel {
  const BC = (globalThis as { BroadcastChannel?: typeof BroadcastChannel }).BroadcastChannel;
  if (BC === undefined) return { available: false, post: () => undefined, close: () => undefined };
  const ch = new BC(channelName(display));
  ch.onmessage = (e: MessageEvent) => { const m = parseSyncMessage(e.data); if (m !== null) onMessage(m); };
  return { available: true, post: (m) => ch.postMessage(m), close: () => ch.close() };
}
/** A channel message, validated (anything else is ignored — never trusted as state). */
export function parseSyncMessage(v: unknown): SyncMessage | null {
  if (v === null || typeof v !== 'object') return null;
  const m = v as Row;
  if (typeof m['from'] !== 'string' || typeof m['seq'] !== 'number' || !['control', 'mirror', 'presentation'].includes(String(m['surface']))) return null;
  const base = { from: m['from'], surface: m['surface'] as SurfaceKind, seq: m['seq'] };
  if (m['kind'] === 'heartbeat' && typeof m['at'] === 'string') return { kind: 'heartbeat', ...base, at: m['at'] };
  if (m['kind'] === 'close') return { kind: 'close', ...base };
  if (m['kind'] === 'state' && m['snapshot'] !== null && typeof m['snapshot'] === 'object') {
    const s = m['snapshot'] as Row;
    if (typeof s['version'] !== 'number' || typeof s['at'] !== 'string') return null;
    const loc = s['location'];
    const route = loc !== null && typeof loc === 'object' ? safeLocation((loc as Row)['route']) : null;
    return { kind: 'state', ...base, snapshot: {
      version: s['version'], at: s['at'],
      location: route === null ? null : { route, ...(Array.isArray((loc as Row)['selection']) ? { selection: (loc as Row)['selection'] as Array<{ kind: string; id: string; version?: number }> } : {}),
                                          ...(typeof (loc as Row)['title'] === 'string' ? { title: (loc as Row)['title'] as string } : {}) },
      watermark: typeof s['watermark'] === 'string' ? s['watermark'] : null, classification: typeof s['classification'] === 'string' ? s['classification'] : null,
    } };
  }
  return null;
}
/** A window's own id (one per window; never a session or a principal). */
export function windowId(rand: () => number = Math.random): string { return `w-${Math.floor(rand() * 2 ** 48).toString(36)}`; }

/* ═════════════════════════════ 3 · THE WINDOW COMMANDS (UX-16-003) ═════════════════════════════ */

export type WindowCommand = 'open' | 'synchronize' | 'detach' | 'present' | 'handoff' | 'close';
export const WINDOW_COMMANDS: Readonly<Record<WindowCommand, { label: string; kind: 'navigation' | 'presentation'; needsControl: boolean; what: string }>> = {
  open: { label: 'Open a mirror window', kind: 'navigation', needsControl: false, what: 'opens a second window of this room that follows the control surface and commands nothing' },
  synchronize: { label: 'Synchronize the windows', kind: 'navigation', needsControl: true, what: 'sends this window\'s state to every window of this display in this browser' },
  detach: { label: 'Detach the inspector', kind: 'navigation', needsControl: false, what: 'opens the selected object\'s own page in a separate window (its acts stay behind its own review)' },
  present: { label: 'Publish to the display', kind: 'presentation', needsControl: true, what: 'records what the display shows: the location, the selection, the data watermark, the classification and the audience' },
  handoff: { label: 'Offer a handoff', kind: 'navigation', needsControl: true, what: 'offers this review to another of your own signed-in sessions; it carries no authority' },
  close: { label: 'Close the mirror windows', kind: 'navigation', needsControl: false, what: 'tells this display\'s mirror windows in this browser to stop following (the server record is kept)' },
};
/** The line every window command carries: who the authoritative control surface is, and the current data watermark (UX-16-003). */
export function commandLine(cmd: WindowCommand, a: { surface: SurfaceKind; display: string; version: number; watermark: string | null; controlElsewhereSince?: string | null }): string {
  const c = WINDOW_COMMANDS[cmd];
  const authority = a.surface === 'control' ? 'this window is the control surface'
    : a.controlElsewhereSince ? `the control surface is your other session (since ${a.controlElsewhereSince})` : 'this window is not the control surface';
  return `${c.label}: ${c.what}. Display ${a.display} at version ${a.version}; ${authority}; data as of ${a.watermark ?? 'not stated'}.`;
}

/* ═════════════════════════════ 4 · THE HANDOFF (PAT-45) ═════════════════════════════ */

export type HandoffStatus = 'open' | 'claimed' | 'revoked' | 'expired';
export interface HandoffLocation { route: string; section?: string; query?: string; view?: string; selection?: Array<{ kind: string; id: string; version?: number }>;
  object?: { kind: string; id: string; version?: number } | null; title?: string }
export interface HandoffView {
  handoff_id: string; status: HandoffStatus; workspace: string; location: HandoffLocation; view_context: Row; display: string | null; target_device: string | null;
  offered_at: string; expires_at: string; offered_here: boolean; digest: string;
  receipt: { receipt_id: string; outcome: 'claimed' | 'revoked'; closed_at: string; claimed_here?: boolean; roles_at_claim?: string[] | null; reason?: string | null } | null;
}
export interface ClaimResult {
  handoff_id: string; status: 'claimed'; workspace: string; location: HandoffLocation; view_context: Row; display: string | null;
  receipt: { receipt_id: string; outcome: 'claimed'; closed_at: string; claimed_here: true };
  authority: { inherited: false; roles: string[]; basis: string }; presentation: PresentationStateView | null; previous_surface: string; claim: string;
}
/** The seam's HandoffOffer (lib/b81-seams.ts). */
export function toHandoffOffer(h: HandoffView): HandoffOffer {
  return { handoffId: h.handoff_id, location: restoreHref(h.location) ?? h.location.route, offeredAt: h.offered_at, expiresAt: h.expires_at };
}
/** Where the claim restores the review: the route, its query, the version and selection carried in the location (an unsafe route restores nothing). */
export function restoreHref(l: HandoffLocation | null | undefined): string | null {
  if (l === null || l === undefined) return null;
  const route = safeLocation(l.route);
  if (route === null || route.includes('?')) return null;
  const q = new URLSearchParams(l.query ?? '');
  if (l.object?.version !== undefined && !q.has('version')) q.set('version', String(l.object.version));
  if (l.view !== undefined && !q.has('view')) q.set('view', l.view);
  if (l.selection !== undefined && l.selection.length > 0 && !q.has('select')) q.set('select', l.selection.map((s) => `${s.kind}:${s.id}${s.version !== undefined ? `@${s.version}` : ''}`).join(','));
  const s = q.toString();
  return safeLocation(s === '' ? route : `${route}?${s}`) ?? route;
}
const fmtLeft = (ms: number): string => (ms <= 0 ? 'now' : ms < 60_000 ? `${Math.ceil(ms / 1000)} s` : `${Math.ceil(ms / 60_000)} min`);
/** One handoff in words: its state, where it was offered, when it expires or what closed it. */
export function handoffLine(h: HandoffView, now: number): string {
  const where = h.offered_here ? 'offered from this session' : 'offered from another of your sessions';
  const target = h.target_device === null ? '' : ` for ${h.target_device}`;
  const what = h.location.title ?? h.location.route;
  switch (h.status) {
    case 'open': return `OPEN — ${what}${target}, ${where}; expires in ${fmtLeft(Date.parse(h.expires_at) - now)} (at ${h.expires_at}).`;
    case 'claimed': return `CLAIMED — ${what}, ${h.receipt?.claimed_here === true ? 'by this session' : 'by another of your sessions'} at ${h.receipt?.closed_at ?? 'an unrecorded time'}; the claiming session acts with its own roles.`;
    case 'revoked': return `REVOKED — ${what} at ${h.receipt?.closed_at ?? 'an unrecorded time'}${h.receipt?.reason ? ` (${h.receipt.reason})` : ''}; it can no longer be claimed.`;
    case 'expired': return `EXPIRED — ${what} at ${h.expires_at}; nothing moved. Offer a new one from the session that holds the review.`;
  }
}
/** May THIS session claim it? Only an open offer, from another session of the same person (the server re-checks every rule). */
export function claimable(h: HandoffView): { can: boolean; reason: string | null } {
  if (h.status !== 'open') return { can: false, reason: `the handoff is ${h.status}` };
  if (h.offered_here) return { can: false, reason: 'this session offered it — claim it from your other signed-in session' };
  return { can: true, reason: null };
}
/** May THIS session revoke it? An open offer (any of the person's sessions). */
export function revocable(h: HandoffView): { can: boolean; reason: string | null } {
  return h.status === 'open' ? { can: true, reason: null } : { can: false, reason: `the handoff is ${h.status} — there is nothing to revoke` };
}
/** The claim's receipt in words: what moved, under whose authority (the claiming session's own — never inherited). */
export function claimLines(c: ClaimResult): string[] {
  return [
    `Claimed at ${c.receipt.closed_at} (receipt ${c.receipt.receipt_id}).`,
    `The review context moved: ${c.location.title ?? c.location.route}${c.location.object?.version !== undefined ? ` at version ${c.location.object.version}` : ''}.`,
    `Authority: not inherited — your own roles here, re-read at the claim: ${c.authority.roles.length === 0 ? 'none' : c.authority.roles.join(', ')}.`,
    c.presentation === null ? 'No display moved with it.' : `The display ${c.presentation.display} is now controlled by this session (version ${c.presentation.version}).`,
    'Nothing was executed; every act is evaluated again under this session.',
  ];
}
/** A `?handoff=<id>` parameter (the claim link shown on the offering device), or null. */
export function handoffParam(search: string): string | null {
  const v = new URLSearchParams(search.startsWith('?') ? search.slice(1) : search).get('handoff');
  return v !== null && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v) ? v.toLowerCase() : null;
}

/* ═════════════════════════════ 5 · THE DISPLAY (PAT-46, UX-16-002) ═════════════════════════════ */

export interface PresentationStateView {
  state_id: string; display: string; version: number; supersedes: string | null; status: 'presenting' | 'ended';
  location: HandoffLocation | null; view_context: Row; watermark: string | null; classification: string | null; audience: Audience | null;
  control_session_here: boolean; control_available: boolean; transfer: 'handoff' | 'reauthentication' | null; handoff_id: string | null;
  contract: string; digest: string; published_at: string; unchanged?: boolean;
}
/** The seam's PresentationState (lib/b81-seams.ts). */
export function toPresentationState(p: PresentationStateView): PresentationState {
  return { workspace: p.location === null ? 'home' : (p.location.route.split('/')[1] ?? 'home'), location: p.location?.route ?? '', version: p.version, publishedAt: p.published_at };
}
export function snapshotOf(p: PresentationStateView): Snapshot {
  return { version: p.version, location: p.location === null ? null : { route: p.location.route, ...(p.location.selection ? { selection: p.location.selection } : {}), ...(p.location.title ? { title: p.location.title } : {}) },
           watermark: p.watermark, classification: p.classification, at: p.published_at };
}
/** The display's record in words (version, control surface, how control came to it, audience, classification, watermark). */
export function displayLines(p: PresentationStateView | null): string[] {
  if (p === null) return ['Nothing is presented on this display yet.'];
  if (p.status === 'ended') return [`Version ${p.version}: the presentation ended at ${p.published_at}; nothing is shown.`];
  const control = p.control_session_here ? 'this session' : p.control_available ? 'another of your signed-in sessions' : 'a session that is no longer signed in (control is unavailable)';
  return [
    `Version ${p.version}, published ${p.published_at}; controlled by ${control}${p.transfer === 'handoff' ? ' (moved by a handoff)' : p.transfer === 'reauthentication' ? ' (taken by a new sign-in)' : ''}.`,
    `Audience: ${p.audience === null ? 'not stated' : AUDIENCE_WORDS[p.audience]}; classification ${(p.classification ?? 'NONE').toUpperCase()}; data as of ${p.watermark ?? 'not stated'}.`,
  ];
}
/** The publication intake for the room (the server validates every key). */
export function publishIntake(a: { expectedVersion: number; selection: RoomSelection | null; watermark: string; classification: string; audience: Audience; context: Row }): Row {
  const sel = a.selection === null ? [] : [{ kind: a.selection.kind, id: a.selection.id, ...(a.selection.version !== null ? { version: a.selection.version } : {}) }];
  return { display: ROOM_DISPLAY, expectedVersion: a.expectedVersion, status: 'presenting', audience: a.audience, classification: a.classification, watermark: a.watermark,
    location: { route: ROOM_ROUTE, view: 'command', ...(sel.length > 0 ? { selection: sel } : {}), title: a.selection?.label ?? 'Operations room' }, viewContext: a.context };
}
/** The presentation route of a display (its scope named; the page re-reads under the viewer's own session — the server refuses another scope). */
export function presentationHref(scope: ShellScope, display = ROOM_DISPLAY): string {
  return `${PRESENT_ROUTE}?display=${encodeURIComponent(display)}&tenant=${scope.tenantId}&domain=${scope.domainId}`;
}
export function presentationParams(search: string): { display: string; scope: ShellScope } | null {
  const q = new URLSearchParams(search.startsWith('?') ? search.slice(1) : search);
  const display = q.get('display') ?? ROOM_DISPLAY; const t = q.get('tenant'); const d = q.get('domain');
  const U = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (!/^[a-z][a-z0-9_.-]{1,60}$/.test(display) || t === null || d === null || !U.test(t) || !U.test(d)) return null;
  return { display, scope: { tenantId: t.toLowerCase(), domainId: d.toLowerCase() } };
}

/* ═════════════════════════════ 6 · THE ROOM (BP-05) ═════════════════════════════ */

export interface RoomSelection { kind: 'warning' | 'exposure' | 'twin'; id: string; version: number | null; label: string }
export interface RoomRow { kind: RoomSelection['kind']; id: string; version: number | null; label: string; detail: string; selected: boolean }
export interface RoomSection { key: 'corridor' | 'warnings' | 'twins'; title: string; note: string; rows: RoomRow[] }
export interface RoomInput {
  exposures: ReadonlyArray<{ exposure_id: string; title: string | null; state: string; current_version: number; breach: boolean | null; polarity?: string }>;
  warnings: ReadonlyArray<Row>;
  twins: ReadonlyArray<{ twin_id: string; title: string; validation: { status: string }; versions: ReadonlyArray<{ version: number }>; synthetic_state: boolean }>;
  selection: Pick<RoomSelection, 'kind' | 'id'> | null;
}
/* B82 gm */
/** The corridor region's note (BP-05 + CMP-064): the map draws the DECLARED references; the exposures list below it is its table alternative. */
export const CORRIDOR_NOTE = 'The corridor map draws the declared geographic references (EPSG:4326, no basemap); this structured list of the corridor exposures is its table alternative.';
/** The keys of the corridor's geographic references the room's map asks for: every chokepoint, port, site and route of the domain. */
export const CORRIDOR_KINDS = ['chokepoint', 'port', 'site', 'route'] as const;
/* end B82 gm */
/** ONE function composes the room for every window (the control surface, a mirror, the presentation): the same inputs give the same rows. */
export function roomSections(i: RoomInput): RoomSection[] {
  const sel = (k: RoomSelection['kind'], id: string) => i.selection !== null && i.selection.kind === k && i.selection.id === id;
  const corridor: RoomRow[] = i.exposures.filter((e) => e.polarity === undefined || e.polarity === 'risk').map((e) => ({
    kind: 'exposure', id: e.exposure_id, version: e.current_version, label: e.title ?? `exposure ${e.exposure_id.slice(0, 8)}`,
    detail: `${e.state.replace(/_/g, ' ')} · v${e.current_version}${e.breach === true ? ' · OUTSIDE APPETITE' : e.breach === false ? ' · within appetite' : ' · appetite not assessed'}`,
    selected: sel('exposure', e.exposure_id),
  }));
  const warnings: RoomRow[] = i.warnings.filter((w) => w['state'] === 'raised' || w['state'] === 'acknowledged').map((w) => ({
    kind: 'warning', id: String(w['warning_id']), version: null, label: String(w['title'] ?? 'warning'),
    detail: `${String(w['state']).toUpperCase()} · window closes ${String(w['closes_at'] ?? 'not stated')}`, selected: sel('warning', String(w['warning_id'])),
  }));
  const twins: RoomRow[] = i.twins.map((t) => {
    const latest = t.versions.reduce((m, v) => Math.max(m, v.version), 0);
    return { kind: 'twin', id: t.twin_id, version: latest === 0 ? null : latest, label: t.title,
      detail: `${latest === 0 ? 'no version' : `v${latest}`} · validation ${t.validation.status}${t.synthetic_state ? ' · SYNTHETIC state' : ''}`, selected: sel('twin', t.twin_id) };
  });
  return [
    /* B82 gm: the corridor region is a MapCanvas (components/canvas.tsx, the declared references of graph.geo_layer); this list is its table alternative */
    { key: 'corridor', title: 'Corridor', note: CORRIDOR_NOTE, rows: corridor },
    /* end B82 gm */
    { key: 'warnings', title: 'Warning queue', note: 'Open warnings (raised or acknowledged), as the home read lists them.', rows: warnings },
    { key: 'twins', title: 'Twin state', note: 'Each twin\'s latest version and its validation, as the twin register states it.', rows: twins },
  ];
}
/** The selected row (synchronized selection), or null. */
export function selectedOf(sections: readonly RoomSection[]): RoomSelection | null {
  for (const s of sections) for (const r of s.rows) if (r.selected) return { kind: r.kind, id: r.id, version: r.version, label: r.label };
  return null;
}
/** The selection a published location names (the first selected object of a kind the room shows). */
export function selectionFromLocation(l: Snapshot['location'] | HandoffLocation | null | undefined): Pick<RoomSelection, 'kind' | 'id'> | null {
  const s = l?.selection?.[0];
  return s !== undefined && (s.kind === 'warning' || s.kind === 'exposure' || s.kind === 'twin') ? { kind: s.kind, id: s.id } : null;
}
/** The object page a detached inspector opens (only types with a page today). */
export function detachHref(s: RoomSelection | null): string | null {
  if (s === null) return null;
  if (s.kind === 'warning') return `/prediction/warnings/${s.id}`;
  if (s.kind === 'twin') return s.version === null ? `/twins/${s.id}/versions/latest` : `/twins/${s.id}/versions/${s.version}`;
  return null;
}
/** Is this window wide enough for the command composition (BP-05)? Said in words when it is not. */
export function commandFit(widthPx: number | null): { fits: boolean; note: string | null } {
  if (widthPx === null) return { fits: false, note: 'The window size is not measured yet.' };
  return widthPx >= COMMAND_MIN_PX ? { fits: true, note: null }
    : { fits: false, note: `The command composition needs ${COMMAND_MIN_PX} px; this window is ${Math.round(widthPx)} px, so the regions reflow — nothing is hidden, the supporting regions stack.` };
}
/** The data watermark of the room: the SERVER instant of its home read (the oldest of its reads is stated by its basis). */
export function roomWatermark(a: { homeAsOf: string | null; registerAt: string | null }): { watermark: string | null; basis: string } {
  const xs = [a.homeAsOf, a.registerAt].filter((x): x is string => x !== null && !Number.isNaN(Date.parse(x)));
  if (xs.length === 0) return { watermark: null, basis: 'no read stated its instant' };
  const oldest = xs.reduce((m, x) => (Date.parse(x) < Date.parse(m) ? x : m));
  return { watermark: oldest, basis: 'the oldest server instant among the room\'s reads (the home read, the exposure register)' };
}

/* ═════════════════════════════ 7 · THE CLIENT (0119_b81_x_lym) ═════════════════════════════ */

const base = (s: ShellScope | null) => (s === null ? '/v1/shell' : `/v1/tenants/${s.tenantId}/domains/${s.domainId}/shell`);
const envOf = (s: ShellScope | null, action: string, objectType: 'HND' | 'PRS') => ({
  scope: (s === null ? 'PLATFORM' : 'DOMAIN') as 'PLATFORM' | 'DOMAIN', tenant_id: s?.tenantId ?? null, domain_id: s?.domainId ?? null, action, object_type: objectType, object_id: null,
  side_effect_class: (action.endsWith('.read') ? 'none' : 'reversible') as 'none' | 'reversible', consequence_class: 'C1' as const, purpose_id: 'navigation',
});
export interface HandoffsRead { principal_id: string; scope: string; read_at: string; contract: string; handoffs: HandoffView[]; claim: string }
export interface PresentationsRead { principal_id: string; scope: string; read_at: string; contract: string; claim: string;
  displays: Array<{ display: string; current: PresentationStateView; versions: number; history: Array<{ state_id: string; version: number; status: string; route: string | null; watermark: string | null; transfer: string | null; published_at: string }> }> }
export const windows = {
  handoffs: (s: ShellScope | null, limit = 20): Promise<ApiResult<{ handoffs: HandoffsRead; receipt: Receipt }>> =>
    call(`${base(s)}/handoffs/read`, envOf(s, 'shell.handoff.read', 'HND'), { limit }),
  offer: (s: ShellScope | null, intake: { workspace: string; location: HandoffLocation; viewContext?: Row; display?: string | null; targetDevice?: string | null; expiresInSeconds?: number }):
    Promise<ApiResult<{ handoff: HandoffView; receipt: Receipt }>> => call(`${base(s)}/handoffs/offer`, envOf(s, 'shell.handoff.offer', 'HND'), intake),
  claim: (s: ShellScope | null, handoffId: string): Promise<ApiResult<{ handoff: ClaimResult; receipt: Receipt }>> =>
    call(`${base(s)}/handoffs/claim`, envOf(s, 'shell.handoff.claim', 'HND'), { handoffId }),
  revoke: (s: ShellScope | null, handoffId: string, reason: string | null): Promise<ApiResult<{ handoff: HandoffView; receipt: Receipt }>> =>
    call(`${base(s)}/handoffs/revoke`, envOf(s, 'shell.handoff.revoke', 'HND'), { handoffId, reason }),
  presentations: (s: ShellScope, display: string | null = null, history = 5): Promise<ApiResult<{ presentations: PresentationsRead; receipt: Receipt }>> =>
    call(`${base(s)}/presentations/read`, envOf(s, 'shell.presentation.read', 'PRS'), { display, history }),
  publish: (s: ShellScope, intake: Row): Promise<ApiResult<{ presentation: PresentationStateView; receipt: Receipt }>> =>
    call(`${base(s)}/presentations/publish`, envOf(s, 'shell.presentation.publish', 'PRS'), intake),
};
/** The current state of one display in a read (null when nothing was ever presented on it). */
export function displayIn(r: PresentationsRead | null, display: string): PresentationStateView | null {
  return r?.displays.find((d) => d.display === display)?.current ?? null;
}
