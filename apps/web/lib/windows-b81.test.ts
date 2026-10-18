/**
 * CP-6 B81 §LY-M — THE COMMAND ENVIRONMENT's CONTRACT (F-P7-E-04: UX-16-001…005, PAT-45, PAT-46, BP-05). Positive, refusal, recovery and
 * fault cases of the pure model components/command-environment.tsx renders — the control-surface rule (a presentation renders no control,
 * checked on the real source), the BroadcastChannel sync model (drift, sync failure, classification loss, control unavailable → freeze,
 * the last verified state kept, the divergence watermark), the window commands, the handoff and the room. Every fixture is SYNTHETIC.
 * CONSTRUCTION only.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  AUDIENCES, CLASSIFICATIONS, COMMAND_MIN_PX, EMPTY_MIRROR, FREEZE_WORDS, ROOM_DISPLAY, ROOM_ROUTE, SURFACE_WORDS, SYNC_TIMEOUT_MS, WINDOWS_CONTRACT, WINDOW_COMMANDS,
  assertNoControls, channelName, claimLines, claimable, commandFit, commandLine, detachHref, displayLines, divergenceOf, handoffLine, handoffParam, mayCommand,
  openSyncChannel, parseSyncMessage, presentationHref, presentationParams, presentationSourceProblems, publishIntake, reduceMirror, restoreHref, revocable,
  roomSections, roomWatermark, selectedOf, selectionFromLocation, snapshotOf, surfaceOf, tickMirror, toHandoffOffer, toPresentationState, verifyAgainstServer, windowId,
  type ClaimResult, type HandoffView, type MirrorState, type PresentationStateView, type RoomInput, type Snapshot, type SyncMessage, type WindowCommand,
} from './windows-b81';
import { LIBRARY_B81 } from './b81-seams';
import { commandLabelProblem } from './content-b81';

const WEB = join(__dirname, '..');
const read = (p: string) => readFileSync(join(WEB, p), 'utf8');
const SQL = readFileSync(join(WEB, '..', 'api', 'migrations', '0119_b81_x_lym.sql'), 'utf8');
const PDP = readFileSync(join(WEB, '..', 'api', 'src', 'policy', 'pdp.service.ts'), 'utf8');
const W = 'a0000000-0000-4000-8000-000000000001';   // SYNTHETIC ids
const X = 'a0000000-0000-4000-8000-000000000002';
const TW = 'a0000000-0000-4000-8000-000000000003';
const T = 'b0000000-0000-4000-8000-000000000001';
const D = 'b0000000-0000-4000-8000-000000000002';

const snap = (version: number, over: Partial<Snapshot> = {}): Snapshot => ({
  version, at: '2026-10-19T08:00:00Z', watermark: '2026-10-19T07:59:00Z', classification: 'internal',
  location: { route: ROOM_ROUTE, selection: [{ kind: 'warning', id: W }], title: 'Bab el-Mandeb corridor collapse (SYNTHETIC)' }, ...over,
});
const state = (from: string, seq: number, s: Snapshot, surface: 'control' | 'mirror' | 'presentation' = 'control'): SyncMessage => ({ kind: 'state', from, surface, seq, snapshot: s });
const server = (over: Partial<PresentationStateView> = {}): PresentationStateView => ({
  state_id: X, display: ROOM_DISPLAY, version: 3, supersedes: null, status: 'presenting', location: { route: ROOM_ROUTE, selection: [{ kind: 'exposure', id: X }], title: 'Corridor closure (SYNTHETIC)' },
  view_context: { classification: 'internal' }, watermark: '2026-10-19T07:58:00Z', classification: 'internal', audience: 'operations_centre', control_session_here: false,
  control_available: true, transfer: null, handoff_id: null, contract: WINDOWS_CONTRACT, digest: '0'.repeat(64), published_at: '2026-10-19T08:00:00Z', ...over,
});
const offer = (over: Partial<HandoffView> = {}): HandoffView => ({
  handoff_id: X, status: 'open', workspace: 'decisions', location: { route: `/decisions/packages/${X}`, object: { kind: 'decision_package', id: X, version: 2 }, selection: [{ kind: 'decision_package', id: X, version: 2 }], title: 'Corridor reroute (SYNTHETIC)' },
  view_context: {}, display: null, target_device: 'tablet', offered_at: '2026-10-19T08:00:00Z', expires_at: '2026-10-19T08:10:00Z', offered_here: false, digest: '0'.repeat(64), receipt: null, ...over,
});
const ROOM: RoomInput = {
  exposures: [{ exposure_id: X, title: 'Corridor closure — Regensburg line (SYNTHETIC)', state: 'accepted', current_version: 2, breach: true, polarity: 'risk' },
              { exposure_id: 'c0000000-0000-4000-8000-000000000009', title: 'An opportunity', state: 'accepted', current_version: 1, breach: null, polarity: 'opportunity' }],
  warnings: [{ warning_id: W, title: 'Bab el-Mandeb corridor collapse (SYNTHETIC)', state: 'raised', closes_at: '2026-10-20T00:00:00Z' },
             { warning_id: 'c0000000-0000-4000-8000-00000000000a', title: 'closed one', state: 'closed', closes_at: null }],
  twins: [{ twin_id: TW, title: 'Regensburg supply twin (SYNTHETIC)', validation: { status: 'fit' }, versions: [{ version: 1 }, { version: 3 }], synthetic_state: true }],
  selection: { kind: 'warning', id: W },
};

/* ═════════════════════════════════════════════════════════════════════════════════════════════════════════════ */
describe('UX-16-004 / PAT-46 — the control-surface rule: only the authenticated control surface commands; a presentation never does', () => {
  it('the surface of a window', () => {
    expect(surfaceOf({ presentationRoute: true, authenticated: true, display: null })).toBe('presentation');
    expect(surfaceOf({ presentationRoute: true, authenticated: true, display: { control_session_here: true, control_available: true, status: 'presenting' } })).toBe('presentation');
    expect(surfaceOf({ presentationRoute: false, authenticated: false, display: null })).toBe('mirror');
    expect(surfaceOf({ presentationRoute: false, mirrorWindow: true, authenticated: true, display: null })).toBe('mirror');
    expect(surfaceOf({ presentationRoute: false, authenticated: true, display: null })).toBe('control');
    expect(surfaceOf({ presentationRoute: false, authenticated: true, display: { control_session_here: false, control_available: true, status: 'presenting' } })).toBe('mirror');
    expect(surfaceOf({ presentationRoute: false, authenticated: true, display: { control_session_here: true, control_available: true, status: 'presenting' } })).toBe('control');
    expect(surfaceOf({ presentationRoute: false, authenticated: true, display: { control_session_here: false, control_available: false, status: 'ended' } })).toBe('control');
  });
  it('mayCommand: a presentation and a mirror never; a frozen control surface not until recovered; the person\'s own eligibility decides the rest', () => {
    expect(mayCommand({ surface: 'presentation', action: 'decision.approve', frozen: [] })).toEqual({ can: false, reason: 'a presentation is never a control surface — it renders no command' });
    expect(mayCommand({ surface: 'mirror', action: 'shell.presentation.publish', frozen: [] }).can).toBe(false);
    expect(mayCommand({ surface: 'control', action: 'shell.presentation.publish', frozen: ['sync_failure'] }).reason).toMatch(/frozen \(synchronisation lost\)/);
    expect(mayCommand({ surface: 'control', action: 'decision.approve', frozen: [], eligibility: { can: false, reason: 'separation of duties: you proposed it' } }))
      .toEqual({ can: false, reason: 'separation of duties: you proposed it' });
    expect(mayCommand({ surface: 'control', action: 'shell.presentation.publish', frozen: [] })).toEqual({ can: true, reason: null });
  });
  it('assertNoControls: a presentation or mirror rendering any control — above all a consequential one — throws; the control surface may', () => {
    expect(() => assertNoControls('presentation', [{ role: 'button', label: 'Approve the package', action: 'decision.approve' }])).toThrow(/consequential control: "Approve the package" \(decision\.approve\)/);
    expect(() => assertNoControls('mirror', [{ role: 'link', label: 'Open the warning' }])).toThrow(/a mirror renders a control: link/);
    expect(() => assertNoControls('presentation', [{ role: 'heading', label: 'Warning queue' }, { role: 'listitem', label: 'a row' }])).not.toThrow();
    expect(() => assertNoControls('control', [{ role: 'button', label: 'Publish to the display', action: 'shell.presentation.publish' }])).not.toThrow();
  });
  it('THE REAL SOURCE: PresentationView and the presentation-only page contain no control, no handler, no command component', () => {
    const cmp = read('components/command-environment.tsx');
    const start = cmp.indexOf('export function PresentationView');
    const end = cmp.indexOf('/* ───', start);
    expect(start).toBeGreaterThan(0); expect(end).toBeGreaterThan(start);
    expect(presentationSourceProblems(cmp.slice(start, end))).toEqual([]);
    expect(presentationSourceProblems(read('app/present/page.tsx'))).toEqual([]);
    // the check sees what it must refuse (the control surface's own component has controls)
    expect(presentationSourceProblems(cmp.slice(cmp.indexOf('export function CommandComposition'), start))).toEqual(expect.arrayContaining(['a <select>', 'a Button / GovernedButton']));
    expect(presentationSourceProblems(cmp.slice(0, start))).toEqual(expect.arrayContaining(['a <button>', 'an onClick handler']));
    expect(SURFACE_WORDS.presentation.label).toBe('PRESENTATION — not a control surface');
  });
  it('the presentation-only route lives OUTSIDE every workspace shell (no navigation, no sign-out control, no palette) and has one h1', () => {
    const page = read('app/present/page.tsx');
    expect(page).not.toMatch(/AppShell|DecisionsLayout|useShell\b/);
    expect(page.match(/<h1\b/g)).toHaveLength(1);
    expect(read('app/home/operations-room/page.tsx').match(/<h1\b/g)).toHaveLength(1);
  });
});

describe('UX-16-003 / -005 — the sync model: one control surface, in sequence, with its classification — or frozen on the last verified state', () => {
  const C = 'w-control'; const M = 'w-mirror';
  it('POSITIVE: a mirror follows the first control surface heard, in sequence', () => {
    let s = reduceMirror(EMPTY_MIRROR, state(C, 1, snap(1)), 1000);
    expect(s).toMatchObject({ control: C, lastSeq: 1, lastVerified: snap(1), frozen: [] });
    s = reduceMirror(s, state(C, 2, snap(2)), 2000);
    expect(s).toMatchObject({ lastSeq: 2, lastVerified: { version: 2 }, frozen: [], lastHeardAt: 2000 });
  });
  it('NO HIDDEN CONTROL PATH: a message from a mirror, a presentation or a second "control" window is ignored', () => {
    const s = reduceMirror(EMPTY_MIRROR, state(C, 1, snap(1)), 1000);
    expect(reduceMirror(s, state(M, 2, snap(9), 'mirror'), 1100)).toBe(s);
    expect(reduceMirror(s, state('w-presentation', 2, snap(9), 'presentation'), 1100)).toBe(s);
    expect(reduceMirror(s, state('w-other', 2, snap(9)), 1100)).toBe(s);
  });
  it('FAULT — drift: a sequence gap is NOT applied (the last verified state is kept) and freezes; the next in-sequence state recovers', () => {
    let s = reduceMirror(EMPTY_MIRROR, state(C, 1, snap(1)), 1000);
    s = reduceMirror(s, state(C, 3, snap(3)), 2000);
    expect(s).toMatchObject({ frozen: ['drift'], lastVerified: { version: 1 }, lastSeq: 3 });
    s = reduceMirror(s, state(C, 4, snap(4)), 3000);
    expect(s).toMatchObject({ frozen: [], lastVerified: { version: 4 } });
    // a duplicate / late state changes nothing
    expect(reduceMirror(s, state(C, 4, snap(99)), 3100).lastVerified!.version).toBe(4);
  });
  it('FAULT — a heartbeat naming a later state than the last one received is drift (a state was missed)', () => {
    let s = reduceMirror(EMPTY_MIRROR, state(C, 1, snap(1)), 1000);
    s = reduceMirror(s, { kind: 'heartbeat', from: C, surface: 'control', seq: 1, at: 'x' }, 2000);
    expect(s.frozen).toEqual([]);
    s = reduceMirror(s, { kind: 'heartbeat', from: C, surface: 'control', seq: 2, at: 'x' }, 3000);
    expect(s.frozen).toEqual(['drift']);
  });
  it('FAULT — sync failure: no message within the timeout freezes; a heartbeat recovers', () => {
    let s = reduceMirror(EMPTY_MIRROR, state(C, 1, snap(1)), 0);
    expect(tickMirror(s, SYNC_TIMEOUT_MS - 1).frozen).toEqual([]);
    s = tickMirror(s, SYNC_TIMEOUT_MS + 1);
    expect(s.frozen).toEqual(['sync_failure']);
    expect(s.lastVerified).toEqual(snap(1));
    s = reduceMirror(s, { kind: 'heartbeat', from: C, surface: 'control', seq: 1, at: 'x' }, SYNC_TIMEOUT_MS + 2);
    expect(s.frozen).toEqual([]);
    expect(tickMirror(EMPTY_MIRROR, 10 ** 9)).toBe(EMPTY_MIRROR);   // never heard: nothing to lose
  });
  it('FAULT — classification loss: a state without its classification is not applied and the content is withheld until a good one arrives', () => {
    let s = reduceMirror(EMPTY_MIRROR, state(C, 1, snap(1)), 0);
    s = reduceMirror(s, state(C, 2, snap(2, { classification: null })), 1);
    expect(s).toMatchObject({ frozen: ['classification_lost'], lastVerified: { version: 1 } });
    s = reduceMirror(s, state(C, 3, snap(3, { classification: 'secret' })), 2);
    expect(s.frozen).toEqual(['classification_lost']);
    s = reduceMirror(s, state(C, 4, snap(4)), 3);
    expect(s).toMatchObject({ frozen: [], lastVerified: { version: 4 } });
  });
  it('FAULT — control unavailable: the control surface closes, or the server says its session is signed out', () => {
    let s = reduceMirror(EMPTY_MIRROR, state(C, 1, snap(1)), 0);
    s = reduceMirror(s, { kind: 'close', from: C, surface: 'control', seq: 1 }, 1);
    expect(s.frozen).toEqual(['control_unavailable']);
    const v = verifyAgainstServer(reduceMirror(EMPTY_MIRROR, state(C, 1, snap(1)), 0), server({ version: 1, control_available: false }), 2);
    expect(v.frozen).toEqual(['control_unavailable']);
    expect(verifyAgainstServer(v, server({ version: 1, control_available: true }), 3).frozen).toEqual([]);
  });
  it('RECOVERY — the SERVER record: a newer published version re-verifies and ends a drift; the same version keeps the channel\'s fresher state; an ended display withholds', () => {
    let s: MirrorState = { ...reduceMirror(EMPTY_MIRROR, state(C, 1, snap(3)), 0), frozen: ['drift'] };
    s = verifyAgainstServer(s, server({ version: 3 }), 1);
    expect(s.lastVerified!.location!.selection![0]!.id).toBe(W);        // same version: the channel's selection is kept
    expect(s.frozen).toEqual(['drift']);
    s = verifyAgainstServer(s, server({ version: 4 }), 2);
    expect(s).toMatchObject({ frozen: [], lastVerified: { version: 4, location: { selection: [{ kind: 'exposure', id: X }] } } });
    const e = verifyAgainstServer(s, server({ version: 5, status: 'ended', location: null, watermark: null, classification: null, audience: null }), 3);
    expect(e).toMatchObject({ frozen: ['ended'], lastVerified: null });
    expect(verifyAgainstServer(s, null, 4)).toBe(s);
    for (const r of Object.keys(FREEZE_WORDS) as Array<keyof typeof FREEZE_WORDS>) expect(FREEZE_WORDS[r].recovery.length).toBeGreaterThan(20);
  });
  it('THE DIVERGENCE WATERMARK: in step, a version behind, the display\'s own data too far from the control surface\'s', () => {
    expect(divergenceOf(snap(3), snap(3))).toMatchObject({ diverged: false, text: 'In step with the control surface — version 3, data as of 2026-10-19T07:59:00Z.' });
    expect(divergenceOf(snap(2), snap(3)).text).toBe('DIVERGED — this view shows version 2; the control surface is at version 3. The last verified state is shown.');
    expect(divergenceOf(snap(3), snap(3), '2026-10-19T07:00:00Z').text).toMatch(/^DIVERGED — this display's own data is as of 2026-10-19T07:00:00Z; the control surface's is as of 2026-10-19T07:59:00Z/);
    expect(divergenceOf(snap(3), snap(3), '2026-10-19T07:58:30Z').diverged).toBe(false);
    expect(divergenceOf(null, null).diverged).toBe(false);
  });
  it('parseSyncMessage trusts nothing unvalidated: garbage, an unknown surface, an unsafe route', () => {
    expect(parseSyncMessage(null)).toBeNull();
    expect(parseSyncMessage({ kind: 'state', from: C, surface: 'admin', seq: 1, snapshot: snap(1) })).toBeNull();
    expect(parseSyncMessage({ kind: 'state', from: C, surface: 'control', seq: 1, snapshot: { ...snap(1), location: { route: 'https://evil.example/x' } } }))
      .toMatchObject({ snapshot: { location: null } });
    expect(parseSyncMessage(state(C, 1, snap(1)))).toEqual(state(C, 1, snap(1)));
    expect(parseSyncMessage({ kind: 'heartbeat', from: C, surface: 'control', seq: 1, at: 'x' })).toEqual({ kind: 'heartbeat', from: C, surface: 'control', seq: 1, at: 'x' });
    expect(windowId(() => 0.5)).toMatch(/^w-[0-9a-z]+$/);
  });
  it('the BroadcastChannel round trip (two windows of one browser): a validated state arrives on the other end', async () => {
    const got: SyncMessage[] = [];
    const a = openSyncChannel('test-wall', () => undefined);
    const b = openSyncChannel('test-wall', (m) => got.push(m));
    expect(a.available).toBe(true);
    a.post(state(C, 1, snap(1)));
    a.post({ junk: true } as unknown as SyncMessage);
    await new Promise((r) => setTimeout(r, 50));
    a.close(); b.close();
    expect(got).toEqual([state(C, 1, snap(1))]);
    expect(channelName(ROOM_DISPLAY)).toBe('eye.windows.operations-room');
  });
});

describe('UX-16-003 — the window commands: open, synchronize, detach, present, hand off, close — each naming the control surface and the watermark', () => {
  it('every command is navigation or presentation (never an institutional act) and is labelled verb + object', () => {
    expect(Object.keys(WINDOW_COMMANDS)).toEqual(['open', 'synchronize', 'detach', 'present', 'handoff', 'close']);
    for (const [k, c] of Object.entries(WINDOW_COMMANDS)) {
      expect(['navigation', 'presentation'], k).toContain(c.kind);
      expect(commandLabelProblem(c.label), k).toBeNull();
    }
  });
  it('the line names the authoritative control surface and the current data watermark', () => {
    for (const k of Object.keys(WINDOW_COMMANDS) as WindowCommand[]) {
      const here = commandLine(k, { surface: 'control', display: ROOM_DISPLAY, version: 4, watermark: '2026-10-19T07:59:00Z' });
      expect(here).toMatch(/Display operations-room at version 4; this window is the control surface; data as of 2026-10-19T07:59:00Z\.$/);
      expect(commandLine(k, { surface: 'mirror', display: ROOM_DISPLAY, version: 4, watermark: null, controlElsewhereSince: '2026-10-19T08:00:00Z' }))
        .toMatch(/the control surface is your other session \(since 2026-10-19T08:00:00Z\); data as of not stated\.$/);
    }
  });
});

describe('PAT-45 — the handoff: the same person\'s other session, the review restored, authority never inherited', () => {
  it('restoreHref: the route with the version and the selection; an unsafe route restores nothing', () => {
    expect(restoreHref(offer().location)).toBe(`/decisions/packages/${X}?version=2&select=decision_package%3A${X}%402`);
    expect(restoreHref({ route: '//evil.example' })).toBeNull();
    expect(restoreHref({ route: '/home/../admin' })).toBeNull();
    expect(restoreHref({ route: ROOM_ROUTE })).toBe(ROOM_ROUTE);
    expect(restoreHref(null)).toBeNull();
    expect(toHandoffOffer(offer())).toEqual({ handoffId: X, location: restoreHref(offer().location), offeredAt: '2026-10-19T08:00:00Z', expiresAt: '2026-10-19T08:10:00Z' });
  });
  it('the states in words; claimable only when open and offered from another session; revocable only when open', () => {
    const now = Date.parse('2026-10-19T08:01:00Z');
    expect(handoffLine(offer(), now)).toBe('OPEN — Corridor reroute (SYNTHETIC) for tablet, offered from another of your sessions; expires in 9 min (at 2026-10-19T08:10:00Z).');
    expect(handoffLine(offer({ status: 'claimed', receipt: { receipt_id: W, outcome: 'claimed', closed_at: '2026-10-19T08:02:00Z', claimed_here: true } }), now)).toMatch(/^CLAIMED — .* by this session at 2026-10-19T08:02:00Z; the claiming session acts with its own roles\.$/);
    expect(handoffLine(offer({ status: 'revoked', receipt: { receipt_id: W, outcome: 'revoked', closed_at: 'x', reason: 'wrong device' } }), now)).toMatch(/^REVOKED — .*\(wrong device\); it can no longer be claimed\.$/);
    expect(handoffLine(offer({ status: 'expired' }), now)).toMatch(/^EXPIRED — .* nothing moved\./);
    expect(claimable(offer())).toEqual({ can: true, reason: null });
    expect(claimable(offer({ offered_here: true })).reason).toMatch(/claim it from your other signed-in session/);
    expect(claimable(offer({ status: 'expired' })).can).toBe(false);
    expect(revocable(offer({ status: 'claimed' })).can).toBe(false);
    expect(revocable(offer({ offered_here: true }))).toEqual({ can: true, reason: null });
  });
  it('the claim\'s receipt says what moved and that NOTHING was inherited or executed', () => {
    const c: ClaimResult = { handoff_id: X, status: 'claimed', workspace: 'decisions', location: offer().location, view_context: {}, display: null,
      receipt: { receipt_id: W, outcome: 'claimed', closed_at: '2026-10-19T08:02:00Z', claimed_here: true },
      authority: { inherited: false, roles: ['decision_authority', 'decision_owner'], basis: 'b' }, presentation: null, previous_surface: 'p', claim: 'c' };
    expect(claimLines(c)).toEqual([
      `Claimed at 2026-10-19T08:02:00Z (receipt ${W}).`, 'The review context moved: Corridor reroute (SYNTHETIC) at version 2.',
      'Authority: not inherited — your own roles here, re-read at the claim: decision_authority, decision_owner.', 'No display moved with it.',
      'Nothing was executed; every act is evaluated again under this session.']);
    expect(claimLines({ ...c, presentation: server({ version: 7 }) })[3]).toBe('The display operations-room is now controlled by this session (version 7).');
  });
  it('handoffParam reads only an id', () => {
    expect(handoffParam(`?handoff=${X.toUpperCase()}`)).toBe(X);
    expect(handoffParam('?handoff=../../x')).toBeNull();
    expect(handoffParam('')).toBeNull();
  });
});

describe('PAT-46 / UX-16-002 — the display record: version, control surface, audience, classification, watermark', () => {
  it('displayLines state the control surface and how control came to it; an ended display shows nothing', () => {
    expect(displayLines(null)).toEqual(['Nothing is presented on this display yet.']);
    expect(displayLines(server({ control_session_here: true }))[0]).toBe('Version 3, published 2026-10-19T08:00:00Z; controlled by this session.');
    expect(displayLines(server({ transfer: 'handoff' }))[0]).toMatch(/another of your signed-in sessions \(moved by a handoff\)\.$/);
    expect(displayLines(server({ control_available: false, transfer: 'reauthentication' }))[0]).toMatch(/no longer signed in \(control is unavailable\) \(taken by a new sign-in\)\.$/);
    expect(displayLines(server())[1]).toBe('Audience: an operations centre; classification INTERNAL; data as of 2026-10-19T07:58:00Z.');
    expect(displayLines(server({ status: 'ended' }))).toEqual(['Version 3: the presentation ended at 2026-10-19T08:00:00Z; nothing is shown.']);
    expect(toPresentationState(server())).toEqual({ workspace: 'home', location: ROOM_ROUTE, version: 3, publishedAt: '2026-10-19T08:00:00Z' });
    expect(snapshotOf(server())).toMatchObject({ version: 3, classification: 'internal', location: { route: ROOM_ROUTE, selection: [{ kind: 'exposure', id: X }] } });
  });
  it('publishIntake names only what the server\'s location validator admits (route, view, selection, title) and the context', () => {
    const i = publishIntake({ expectedVersion: 2, selection: { kind: 'warning', id: W, version: null, label: 'w' }, watermark: '2026-10-19T07:59:00Z', classification: 'internal', audience: 'kiosk', context: { classification: 'internal' } });
    expect(i).toEqual({ display: ROOM_DISPLAY, expectedVersion: 2, status: 'presenting', audience: 'kiosk', classification: 'internal', watermark: '2026-10-19T07:59:00Z',
      location: { route: ROOM_ROUTE, view: 'command', selection: [{ kind: 'warning', id: W }], title: 'w' }, viewContext: { classification: 'internal' } });
    expect(Object.keys(i['location'] as object).every((k) => ['route', 'section', 'query', 'filters', 'view', 'selection', 'object', 'task', 'title'].includes(k))).toBe(true);
  });
  it('the presentation route names its display and scope; a malformed one is refused before any read', () => {
    const href = presentationHref({ tenantId: T, domainId: D });
    expect(href).toBe(`/present?display=operations-room&tenant=${T}&domain=${D}`);
    expect(presentationParams(href.slice(href.indexOf('?')))).toEqual({ display: ROOM_DISPLAY, scope: { tenantId: T, domainId: D } });
    expect(presentationParams(`?display=Operations Room&tenant=${T}&domain=${D}`)).toBeNull();
    expect(presentationParams('?display=operations-room')).toBeNull();
  });
  it('the vocabulary is the server\'s: the contract, the audiences, the classifications (0119_b81_x_lym)', () => {
    expect(SQL).toContain(`SELECT '${WINDOWS_CONTRACT}'`);
    expect(SQL).toContain(`SELECT ARRAY[${AUDIENCES.map((a) => `'${a}'`).join(', ')}]`);
    expect(SQL).toContain(`SELECT ARRAY[${CLASSIFICATIONS.map((a) => `'${a}'`).join(', ')}]`);
  });
});

describe('BP-05 — the room: one composition for every window (multi-window consistency); the corridor a structured alternative', () => {
  it('the same inputs give the same rows on the control surface and the presentation', () => {
    const a = roomSections(ROOM); const b = roomSections({ ...ROOM });
    expect(b).toEqual(a);
    expect(a.map((s) => [s.key, s.rows.length])).toEqual([['corridor', 1], ['warnings', 1], ['twins', 1]]);
    expect(a[0]!.note).toMatch(/the map canvas comes at B82/);
    expect(a[0]!.rows[0]).toMatchObject({ kind: 'exposure', detail: 'accepted · v2 · OUTSIDE APPETITE', selected: false });
    expect(a[1]!.rows[0]).toMatchObject({ kind: 'warning', id: W, selected: true, detail: 'RAISED · window closes 2026-10-20T00:00:00Z' });
    expect(a[2]!.rows[0]).toMatchObject({ kind: 'twin', version: 3, detail: 'v3 · validation fit · SYNTHETIC state' });
  });
  it('the synchronized selection: one selected row; read back from a published location; a detached inspector opens the object\'s own page', () => {
    expect(selectedOf(roomSections(ROOM))).toEqual({ kind: 'warning', id: W, version: null, label: 'Bab el-Mandeb corridor collapse (SYNTHETIC)' });
    expect(selectedOf(roomSections({ ...ROOM, selection: null }))).toBeNull();
    expect(selectionFromLocation(server().location)).toEqual({ kind: 'exposure', id: X });
    expect(selectionFromLocation({ route: ROOM_ROUTE, selection: [{ kind: 'decision_package', id: X }] })).toBeNull();
    expect(detachHref({ kind: 'warning', id: W, version: null, label: '' })).toBe(`/prediction/warnings/${W}`);
    expect(detachHref({ kind: 'twin', id: TW, version: 3, label: '' })).toBe(`/twins/${TW}/versions/3`);
    expect(detachHref({ kind: 'exposure', id: X, version: 2, label: '' })).toBeNull();
  });
  it('the command composition needs 1920 px; below, the room reflows and says so; the watermark is the oldest server instant', () => {
    expect(commandFit(COMMAND_MIN_PX)).toEqual({ fits: true, note: null });
    expect(commandFit(1440).note).toMatch(/needs 1920 px; this window is 1440 px, so the regions reflow — nothing is hidden/);
    expect(commandFit(null).fits).toBe(false);
    expect(roomWatermark({ homeAsOf: '2026-10-19T08:00:00Z', registerAt: '2026-10-19T07:59:00Z' }).watermark).toBe('2026-10-19T07:59:00Z');
    expect(roomWatermark({ homeAsOf: null, registerAt: null })).toEqual({ watermark: null, basis: 'no read stated its instant' });
  });
});

describe('the seams and the policy: LIBRARY_B81.windows exported; the six actions exact, the handoff\'s three human-gated', () => {
  it('every name LIBRARY_B81.windows assigns is an exported function of components/command-environment.tsx', () => {
    const src = read('components/command-environment.tsx');
    expect(LIBRARY_B81.windows.files).toEqual(['components/command-environment.tsx']);
    for (const n of LIBRARY_B81.windows.exports) expect(src, n).toMatch(new RegExp(`export function ${n}\\b`));
  });
  it('the PDP rules are EXACT; offer / claim / revoke carry the human gate; the reads are audited; publish is presentation', () => {
    const block = PDP.slice(PDP.indexOf('/* B81 lym */'), PDP.indexOf('/* end B81 lym */'));
    for (const a of ['shell.handoff.offer', 'shell.handoff.claim', 'shell.handoff.revoke']) expect(block).toMatch(new RegExp(`actionPrefix: '${a.replace(/\./g, '\\.')}', exact: true, requiredAnyRole: people, obligations: gate`));
    for (const a of ['shell.handoff.read', 'shell.presentation.read']) expect(block).toMatch(new RegExp(`actionPrefix: '${a.replace(/\./g, '\\.')}', exact: true, requiredAnyRole: people, obligations: \\[\\{ type: 'audit_access' \\}\\]`));
    expect(block).toMatch(/actionPrefix: 'shell\.presentation\.publish', exact: true, requiredAnyRole: people, requiresPurpose/);
    expect(block.match(/'[a-z_]*agent[a-z_]*'/g), 'no agent role reaches a handoff or a display').toBeNull();
  });
});
