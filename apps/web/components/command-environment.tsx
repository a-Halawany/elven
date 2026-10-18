'use client';
/**
 * CP-6 B81 §LY-M — THE COMMAND ENVIRONMENT of the shared library (F-P7-E-04: UX-16-001…005, PAT-45, PAT-46, BP-05). The decisions are
 * lib/windows-b81.ts's (pure, tested); the server (0119_b81_x_lym) is the authority on every handoff and display:
 *
 *   CommandComposition   the operations room at ≥ 1920 px (BP-05) through §LY-G's Composition and Regions: the context band (scope, the
 *                        classification, the data watermark), the status band (the display's record, the synchronisation, the divergence
 *                        watermark, a freeze in words), the AUTHORITY band (which window is the control surface; the person's open
 *                        handoffs from their other sessions, claimable here), the corridor (a STRUCTURED alternative — the map canvas is
 *                        B82's), the warning queue, the twin state with §OB's ObjectHeader for the synchronized selection, and the window
 *                        commands — each naming the authoritative control surface and the data watermark. Below 1920 px the regions reflow
 *                        (§LY-G) and the room says so. A mirror window (the display is controlled by another of the person's sessions) offers
 *                        no command: it follows.
 *   PresentationView     the presentation-only display: "PRESENTATION — not a control surface", what the control surface published (version,
 *                        audience, classification, watermark), the same rows as the room (one function composes both), a freeze and the
 *                        divergence in words, content WITHHELD when the presentation ended or its classification context was lost. It
 *                        renders NO control at all (windows-b81.test.ts checks this function's source).
 *   HandoffDialog        the offer of the review to another of the person's own signed-in sessions (PAT-45): the bounded expiry, the device
 *                        label, the display's control optionally with it; the offer's record and its revocation. It carries no authority.
 *
 * Nothing here executes an institutional act: selection, synchronisation, publication and handoff are navigation and presentation; every
 * consequential act stays behind its own page's Command Review. Tokens only, logical properties (RTL mirrors), the classes in globals.css
 * (the B81 lym block). CONSTRUCTION only — the walk is the demonstration (SYNTHETIC); nothing here is accepted.
 */
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import type { ShellScope } from '../lib/b80-seams';
import {
  AUDIENCES, AUDIENCE_WORDS, EMPTY_MIRROR, EXPIRY_CHOICES, FREEZE_WORDS, HEARTBEAT_MS, PRESENTATION_POLL_MS, ROOM_COMPOSITION, ROOM_DISPLAY, ROOM_ROUTE, SURFACE_WORDS,
  claimLines, claimable, commandFit, commandLine, detachHref, displayIn, displayLines, divergenceOf, handoffLine, openSyncChannel, presentationHref, publishIntake,
  reduceMirror, restoreHref, revocable, roomSections, selectedOf, selectionFromLocation, snapshotOf, surfaceOf, tickMirror, verifyAgainstServer, windowId, windows,
  type Audience, type ClaimResult, type Divergence, type FreezeReason, type HandoffLocation, type HandoffView, type MirrorState, type PresentationStateView,
  type RoomInput, type RoomRow, type RoomSection, type RoomSelection, type Snapshot, type SurfaceKind, type SyncChannel,
} from '../lib/windows-b81';
import type { ObjectHeaderInput } from '../lib/object-b81';
import { Composition } from './layout';
import { ObjectHeader } from './object';
import { GovernedButton, LiveStatus } from './observation';
import { ErrorNote, Receipt } from './ui';
import { Dialog } from './layers';

type Err = { code: string; message: string; correlationId: string } | null;
type Rcpt = { policyDecisionId: string; auditSeq: number } | null;
type Res<T> = { ok: boolean; status: number; data?: T; error?: { code: string; message: string; correlationId: string } };
const errOf = (r: Res<unknown>): Err => (r.error === undefined ? { code: `HTTP ${r.status}`, message: 'the server gave no answer — read the page again', correlationId: '' } : r.error);

/* ───────────────────────── the room's rows (read-only for every surface; selectable on the control surface) ───────────────────────── */

function RoomList({ section, onSelect }: { section: RoomSection; onSelect?: ((r: RoomRow) => void) | undefined }) {
  return (
    <div className="eye-cmdenv-section" data-room-section={section.key}>
      <h2 className="eye-cmdenv-title">{section.title}</h2>
      <p className="eye-help">{section.note}</p>
      {section.rows.length === 0 ? <p className="eye-help">Nothing to show in this section.</p> : (
        <ul className="eye-cmdenv-rows" aria-label={section.title}>
          {section.rows.map((r) => (
            <li key={`${r.kind}-${r.id}`} data-selected={r.selected ? 'true' : 'false'} aria-current={r.selected ? 'true' : undefined}>
              {onSelect === undefined
                ? <span className="eye-cmdenv-row">{r.selected ? 'SELECTED — ' : ''}{r.label}</span>
                : <button type="button" className="eye-cmdenv-row" aria-pressed={r.selected} onClick={() => onSelect(r)}>{`Select ${r.label}`}</button>}
              <span className="eye-help"> · {r.detail}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/** The synchronized selection's header (§OB's grammar) — only for the object types with a page today; the others are said. */
function selectionHeader(sel: RoomSelection | null, detail: string | null): ObjectHeaderInput | null {
  if (sel === null || (sel.kind !== 'warning' && sel.kind !== 'twin')) return null;
  return {
    type: sel.kind === 'warning' ? 'WRN' : 'TWN', id: sel.id, title: sel.label, version: sel.version, versionCount: null,
    owner: null, ownerRole: sel.kind === 'warning' ? 'the warning\'s routed recipient' : 'the twin owner',
    serverState: sel.kind === 'warning' ? (detail?.split(' · ')[0]?.toLowerCase() ?? null) : null,
    truth: null, synthetic: null, classification: null, time: [], trust: null,
    authority: 'This room states no approval: open the object\'s own page for its record and its acts.',
    relationships: [], provenance: [], receipt: null, effective: { support: 'live_only', asOf: null },
    eligible: { propose: { can: false, reason: 'acts are offered on the object\'s own page' }, review: { can: false, reason: 'acts are offered on the object\'s own page' }, correct: { can: false, reason: 'acts are offered on the object\'s own page' } },
  };
}

/* ───────────────────────── CommandComposition (BP-05, UX-16-001…005) ───────────────────────── */

export interface RoomData { input: Omit<RoomInput, 'selection'>; watermark: string | null; watermarkBasis: string; classification: string | null; context: Record<string, unknown>; scopeLine: string }

export function CommandComposition({ scope, data, authenticated, mirrorWindow, onReload }: {
  scope: ShellScope; data: RoomData; authenticated: boolean;
  /** this window was opened as a mirror of the room (it follows and commands nothing) */ mirrorWindow: boolean;
  /** re-read the room's data (the page's own reads) */ onReload: () => void;
}) {
  const router = useRouter();
  const me = useMemo(() => windowId(), []);
  const [width, setWidth] = useState<number | null>(null);
  const [display, setDisplay] = useState<PresentationStateView | null>(null);
  const [displayRead, setDisplayRead] = useState(false);
  const [offers, setOffers] = useState<HandoffView[]>([]);
  const [selection, setSelection] = useState<Pick<RoomSelection, 'kind' | 'id'> | null>(null);
  const [audience, setAudience] = useState<Audience>('operations_centre');
  const [error, setError] = useState<Err>(null);
  const [receipt, setReceipt] = useState<Rcpt>(null);
  const [claimed, setClaimed] = useState<ClaimResult | null>(null);
  const [handoffOpen, setHandoffOpen] = useState(false);
  const [mirror, setMirror] = useState<MirrorState>(EMPTY_MIRROR);
  const [channelUp, setChannelUp] = useState<boolean | null>(null);
  const seq = useRef(0);
  const channel = useRef<SyncChannel | null>(null);

  const readDisplay = useCallback(async () => {
    const r = await windows.presentations(scope, ROOM_DISPLAY, 5);
    if (!r.ok || r.data === undefined) { setError(errOf(r)); return; }
    const cur = displayIn(r.data.presentations, ROOM_DISPLAY);
    setDisplay(cur); setDisplayRead(true);
    setMirror((m) => verifyAgainstServer(m, cur, Date.now()));
    if (cur !== null && cur.status === 'presenting' && !cur.control_session_here) setSelection(selectionFromLocation(cur.location));
  }, [scope]);
  const readOffers = useCallback(async () => {
    const r = await windows.handoffs(scope, 20);
    if (!r.ok || r.data === undefined) { setError(errOf(r)); return; }
    setOffers(r.data.handoffs.handoffs);
  }, [scope]);

  useEffect(() => { void readDisplay(); void readOffers(); }, [readDisplay, readOffers]);
  useEffect(() => {
    const on = () => setWidth(window.innerWidth);
    on(); window.addEventListener('resize', on);
    return () => window.removeEventListener('resize', on);
  }, []);
  /* the server record across devices: re-read on a cadence */
  useEffect(() => {
    const t = window.setInterval(() => { void readDisplay(); void readOffers(); setMirror((m) => tickMirror(m, Date.now())); }, PRESENTATION_POLL_MS);
    return () => window.clearInterval(t);
  }, [readDisplay, readOffers]);

  const surface: SurfaceKind = surfaceOf({ presentationRoute: false, mirrorWindow, authenticated, display: displayRead ? display : { control_session_here: false, control_available: false, status: 'presenting' } });
  const sections = roomSections({ ...data.input, selection });
  const selected = selectedOf(sections);
  const snapshot: Snapshot = {
    version: display?.version ?? 0, at: new Date().toISOString(), watermark: data.watermark, classification: data.classification,
    location: { route: ROOM_ROUTE, ...(selected === null ? {} : { selection: [{ kind: selected.kind, id: selected.id, ...(selected.version === null ? {} : { version: selected.version }) }], title: selected.label }) },
  };
  const snapRef = useRef(snapshot); snapRef.current = snapshot;
  const surfaceRef = useRef(surface); surfaceRef.current = surface;

  /* the windows of this browser (BroadcastChannel): the control surface sends its state and a heartbeat; a mirror follows ONE control surface */
  useEffect(() => {
    const ch = openSyncChannel(ROOM_DISPLAY, (m) => {
      if (surfaceRef.current === 'control') return;
      setMirror((s) => reduceMirror(s, m, Date.now()));
    });
    channel.current = ch; setChannelUp(ch.available);
    const hb = window.setInterval(() => {
      if (surfaceRef.current === 'control') ch.post({ kind: 'heartbeat', from: me, surface: 'control', seq: seq.current, at: new Date().toISOString() });
    }, HEARTBEAT_MS);
    return () => { window.clearInterval(hb); ch.close(); channel.current = null; };
  }, [me]);
  const broadcast = useCallback(() => {
    if (surfaceRef.current !== 'control' || channel.current === null) return;
    seq.current += 1;
    channel.current.post({ kind: 'state', from: me, surface: 'control', seq: seq.current, snapshot: snapRef.current });
  }, [me]);
  useEffect(() => { broadcast(); }, [selected?.id, display?.version, broadcast]); // eslint-disable-line react-hooks/exhaustive-deps
  /* a mirror window follows the control surface's selection */
  useEffect(() => {
    if (surface !== 'control' && mirror.lastVerified !== null) setSelection(selectionFromLocation(mirror.lastVerified.location));
  }, [surface, mirror.lastVerified]);

  const frozen: FreezeReason[] = surface === 'control' ? [] : mirror.frozen;
  const controlSnap = display === null || display.status === 'ended' ? null : snapshotOf(display);
  const divergence: Divergence = divergenceOf(surface === 'control' ? controlSnap : mirror.lastVerified, controlSnap, data.watermark);
  const fit = commandFit(width);
  const cmdCtx = { surface, display: ROOM_DISPLAY, version: display?.version ?? 0, watermark: data.watermark,
                   controlElsewhereSince: display !== null && !display.control_session_here ? display.published_at : null };
  const isControl = surface === 'control';
  const incoming = offers.filter((o) => o.status === 'open' && !o.offered_here);
  const mine = offers.filter((o) => o.offered_here).slice(0, 5);
  const location: HandoffLocation = snapshot.location ?? { route: ROOM_ROUTE };

  const publish = async (status: 'presenting' | 'ended') => {
    if (data.watermark === null || data.classification === null) {
      setError({ code: 'not published', message: 'The room has no data watermark or classification yet — reload the room, then publish again.', correlationId: '' }); return;
    }
    const body = status === 'ended' ? { display: ROOM_DISPLAY, expectedVersion: display?.version ?? 0, status: 'ended' }
      : publishIntake({ expectedVersion: display?.version ?? 0, selection: selected, watermark: data.watermark, classification: data.classification, audience, context: data.context });
    const r = await windows.publish(scope, body);
    if (!r.ok || r.data === undefined) { setError(errOf(r)); void readDisplay(); return; }
    setError(null); setReceipt(r.data.receipt); setDisplay(r.data.presentation); setDisplayRead(true);
  };

  const regions: Partial<Record<'context' | 'status' | 'authority' | 'primary' | 'action' | 'evidence' | 'inspector', ReactNode>> = {
    context: (
      <div className="eye-cmdenv-band">
        <p><strong>{SURFACE_WORDS[surface].label}</strong> · display <bdi className="eye-mono">{ROOM_DISPLAY}</bdi> · {data.scopeLine}</p>
        <p className="eye-shell-meta">Classification {(data.classification ?? 'not stated').toUpperCase()} · data as of {data.watermark ?? 'not stated'} <span className="eye-help">({data.watermarkBasis})</span></p>
      </div>
    ),
    status: (
      <div className="eye-cmdenv-band">
        {displayLines(displayRead ? display : null).map((l) => <p key={l} className="eye-shell-meta">{l}</p>)}
        <p className="eye-shell-meta" data-diverged={divergence.diverged ? 'true' : 'false'}>{divergence.text}</p>
        <p className="eye-shell-meta">{channelUp === false ? 'This browser offers no window synchronisation: other windows follow through the server record only (every few seconds).'
          : 'The windows of this display in this browser synchronise over one channel; other devices follow the server record.'}</p>
        {frozen.map((f) => <p key={f} role="status" className="eye-cmdenv-frozen"><strong>FROZEN — {FREEZE_WORDS[f].headline}</strong> {FREEZE_WORDS[f].recovery}</p>)}
        {fit.note !== null && <p className="eye-help">{fit.note}</p>}
      </div>
    ),
    authority: (
      <div className="eye-cmdenv-band">
        <p>{SURFACE_WORDS[surface].statement}</p>
        {!isControl && display !== null && display.control_available && <p className="eye-help">Control of this display is held by another of your signed-in sessions. Offer a handoff there and claim it here to move it — nothing moves silently.</p>}
        {incoming.length > 0 && (
          <ul className="eye-cmdenv-rows" aria-label="Handoffs offered to this session">
            {incoming.map((o) => (
              <li key={o.handoff_id}>
                <span>{handoffLine(o, Date.now())}</span>{' '}
                <GovernedButton label="Claim the handoff" pendingLabel="Claiming the handoff" disabled={!claimable(o).can} onRun={async () => {
                  const r = await windows.claim(scope, o.handoff_id);
                  if (!r.ok || r.data === undefined) { setError(errOf(r)); void readOffers(); return; }
                  setError(null); setReceipt(r.data.receipt); setClaimed(r.data.handoff);
                  void readOffers(); void readDisplay();
                  const href = restoreHref(r.data.handoff.location);
                  if (href !== null && !href.startsWith(ROOM_ROUTE)) router.push(href);
                }} />
              </li>
            ))}
          </ul>
        )}
        {claimed !== null && <div role="status" className="eye-cmdenv-receipt">{claimLines(claimed).map((l) => <p key={l} className="eye-shell-meta">{l}</p>)}</div>}
      </div>
    ),
    primary: <RoomList section={sections[0]!} onSelect={isControl ? (r) => setSelection({ kind: r.kind, id: r.id }) : undefined} />,
    evidence: <RoomList section={sections[1]!} onSelect={isControl ? (r) => setSelection({ kind: r.kind, id: r.id }) : undefined} />,
    inspector: (
      <div>
        <RoomList section={sections[2]!} onSelect={isControl ? (r) => setSelection({ kind: r.kind, id: r.id }) : undefined} />
        {(() => {
          const row = sections.flatMap((s) => s.rows).find((r) => r.selected) ?? null;
          const header = selectionHeader(selected, row?.detail ?? null);
          if (selected === null) return <p className="eye-help">Nothing is selected. Select a row; every window of this display follows the selection.</p>;
          if (header === null) return <p className="eye-help">Selected: {selected.label} (an exposure — its object page is declared, carried by B83).</p>;
          return <ObjectHeader input={header} level={2} />;
        })()}
      </div>
    ),
    action: (
      <div className="eye-cmdenv-band">
        <ul className="eye-cmdenv-commands" aria-label="Window commands">
          <li>
            <GovernedButton variant="quiet" label="Open a mirror window" pendingLabel="Opening the mirror window" onRun={async () => { window.open(`${ROOM_ROUTE}?mirror=1`, '_blank'); }} />
            <span className="eye-help"> {commandLine('open', cmdCtx)}</span>
          </li>
          <li>
            <GovernedButton variant="quiet" label="Synchronize the windows" pendingLabel="Synchronizing the windows" disabled={!isControl} onRun={async () => { broadcast(); }} />
            <span className="eye-help"> {commandLine('synchronize', cmdCtx)}</span>
          </li>
          <li>
            <GovernedButton variant="quiet" label="Detach the inspector" pendingLabel="Opening the selected object" disabled={detachHref(selected) === null}
              onRun={async () => { const href = detachHref(selected); if (href !== null) window.open(href, '_blank'); }} />
            <span className="eye-help"> {commandLine('detach', cmdCtx)}</span>
          </li>
          <li>
            <label className="eye-shell-meta">Audience{' '}
              <select value={audience} disabled={!isControl} onChange={(e) => setAudience(e.target.value as Audience)}>
                {AUDIENCES.map((a) => <option key={a} value={a}>{AUDIENCE_WORDS[a]}</option>)}
              </select>
            </label>{' '}
            <GovernedButton label="Publish to the display" pendingLabel="Publishing to the display" disabled={!isControl || data.watermark === null} onRun={() => publish('presenting')} />
            <span className="eye-help"> {commandLine('present', cmdCtx)} The presentation window: <bdi className="eye-mono">{presentationHref(scope)}</bdi> (open it on the display, signed in as yourself).</span>
          </li>
          <li>
            <GovernedButton variant="quiet" label="End the presentation" pendingLabel="Ending the presentation" disabled={!isControl || display === null || display.status === 'ended'} onRun={() => publish('ended')} />
            <span className="eye-help"> The display then shows nothing; every published version stays recorded.</span>
          </li>
          <li>
            <GovernedButton variant="quiet" label="Offer a handoff" pendingLabel="Opening the handoff" disabled={!isControl} onRun={async () => { setHandoffOpen(true); }} />
            <span className="eye-help"> {commandLine('handoff', cmdCtx)}</span>
          </li>
          <li>
            <GovernedButton variant="quiet" label="Close the mirror windows" pendingLabel="Closing the mirror windows" disabled={!isControl}
              onRun={async () => { seq.current += 1; channel.current?.post({ kind: 'close', from: me, surface: 'control', seq: seq.current }); }} />
            <span className="eye-help"> {commandLine('close', cmdCtx)} The server record is kept.</span>
          </li>
          <li>
            <GovernedButton variant="quiet" label="Reload the room" pendingLabel="Reloading the room" onRun={async () => { onReload(); await readDisplay(); await readOffers(); }} />
          </li>
        </ul>
        {mine.length > 0 && (
          <ul className="eye-cmdenv-rows" aria-label="Handoffs offered from this session">
            {mine.map((o) => <li key={o.handoff_id} className="eye-shell-meta">{handoffLine(o, Date.now())}</li>)}
          </ul>
        )}
        <ErrorNote error={error} />
        <Receipt receipt={receipt} />
      </div>
    ),
  };

  return (
    <>
      <Composition regions={regions} label="Operations room" composition={ROOM_COMPOSITION} selection={selected === null ? null : { label: selected.label, version: selected.version }} />
      <HandoffDialog open={handoffOpen} onClose={() => { setHandoffOpen(false); void readOffers(); }} scope={scope} location={location}
        viewContext={data.context} display={isControl && display !== null && display.status === 'presenting' ? ROOM_DISPLAY : null} />
    </>
  );
}

/* ───────────────────────── PresentationView (PAT-46) — renders NO control ───────────────────────── */

export function PresentationView({ display, server, mirror, sections, ownDataAt, problem }: {
  display: string; server: PresentationStateView | null; mirror: MirrorState; sections: readonly RoomSection[] | null; ownDataAt: string | null; problem: string | null;
}) {
  const withheld = server === null || server.status === 'ended' || mirror.frozen.includes('classification_lost') || mirror.frozen.includes('ended') || server.classification === null;
  const verified = mirror.lastVerified ?? (server === null ? null : snapshotOf(server));
  const divergence = divergenceOf(verified, server === null || server.status === 'ended' ? null : snapshotOf(server), ownDataAt);
  return (
    <div className="eye-presentation" data-surface="presentation" data-withheld={withheld ? 'true' : 'false'}>
      <p className="eye-presentation-banner" role="note"><strong>{SURFACE_WORDS.presentation.label}</strong> — {SURFACE_WORDS.presentation.statement}</p>
      <p className="eye-shell-meta">Display <bdi className="eye-mono">{display}</bdi></p>
      {displayLines(server).map((l) => <p key={l} className="eye-shell-meta">{l}</p>)}
      <p className="eye-shell-meta" data-diverged={divergence.diverged ? 'true' : 'false'}>{divergence.text}</p>
      {mirror.frozen.map((f) => <p key={f} role="status" className="eye-cmdenv-frozen"><strong>FROZEN — {FREEZE_WORDS[f].headline}</strong> {FREEZE_WORDS[f].recovery}</p>)}
      {problem !== null && <p role="status" className="eye-cmdenv-frozen">{problem}</p>}
      {withheld || sections === null ? <p className="eye-presentation-withheld">Content withheld: nothing is shown until the control surface presents with a classification.</p> : (
        <div className="eye-presentation-grid">
          {sections.map((s) => (
            <section key={s.key} aria-label={s.title} className="eye-cmdenv-section">
              <h2 className="eye-cmdenv-title">{s.title}</h2>
              <p className="eye-help">{s.note}</p>
              <ul className="eye-cmdenv-rows">
                {s.rows.map((r) => (
                  <li key={`${r.kind}-${r.id}`} data-selected={r.selected ? 'true' : 'false'} aria-current={r.selected ? 'true' : undefined}>
                    <span className="eye-cmdenv-row">{r.selected ? 'SELECTED — ' : ''}{r.label}</span><span className="eye-help"> · {r.detail}</span>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}

/* ───────────────────────── HandoffDialog (PAT-45) ───────────────────────── */

export function HandoffDialog({ open, onClose, scope, location, viewContext, display }: {
  open: boolean; onClose: () => void; scope: ShellScope | null; location: HandoffLocation; viewContext?: Record<string, unknown>;
  /** the display whose control moves with the claim (only when this session controls it), or null */ display: string | null;
}) {
  const [seconds, setSeconds] = useState(600);
  const [device, setDevice] = useState('');
  const [withDisplay, setWithDisplay] = useState(true);
  const [offer, setOffer] = useState<HandoffView | null>(null);
  const [error, setError] = useState<Err>(null);
  const [receipt, setReceipt] = useState<Rcpt>(null);
  const workspace = location.route.split('/')[1] ?? 'home';
  return (
    <Dialog open={open} title="Session handoff" onClose={() => { setOffer(null); setError(null); onClose(); }}
      description="Move this review to another of your own signed-in sessions (a tablet, a second browser). It carries no authority: the session that claims it acts with its own roles, re-read by the server.">
      <p className="eye-shell-meta">The review: <bdi className="eye-mono">{location.title ?? location.route}</bdi> — the route, the version and the selection move with it.</p>
      <label className="eye-shell-meta">Expires after{' '}
        <select value={seconds} onChange={(e) => setSeconds(Number(e.target.value))}>
          {EXPIRY_CHOICES.map((c) => <option key={c.seconds} value={c.seconds}>{c.label}</option>)}
        </select>
      </label>
      <label className="eye-shell-meta">The device it is for (optional){' '}
        <input type="text" value={device} maxLength={40} onChange={(e) => setDevice(e.target.value)} />
      </label>
      {display !== null && (
        <label className="eye-shell-meta">
          <input type="checkbox" checked={withDisplay} onChange={(e) => setWithDisplay(e.target.checked)} /> Move the control of the display {display} with it
        </label>
      )}
      <GovernedButton label="Offer the handoff" pendingLabel="Offering the handoff" disabled={offer !== null && offer.status === 'open'} onRun={async () => {
        const r = await windows.offer(scope, { workspace, location, viewContext: viewContext ?? {}, display: display !== null && withDisplay ? display : null,
          targetDevice: device.trim() === '' ? null : device.trim(), expiresInSeconds: seconds });
        if (!r.ok || r.data === undefined) { setError(errOf(r)); return; }
        setError(null); setOffer(r.data.handoff); setReceipt(r.data.receipt);
      }} />
      {offer !== null && (
        <div role="status" className="eye-cmdenv-receipt">
          <p className="eye-shell-meta">{handoffLine(offer, Date.now())}</p>
          <p className="eye-shell-meta">On the other device: sign in as yourself and open <bdi className="eye-mono">{`${ROOM_ROUTE}?handoff=${offer.handoff_id}`}</bdi> — the offer is listed there to claim. Nobody else can claim it.</p>
          <GovernedButton variant="quiet" label="Revoke the handoff" pendingLabel="Revoking the handoff" disabled={!revocable(offer).can} onRun={async () => {
            const r = await windows.revoke(scope, offer.handoff_id, null);
            if (!r.ok || r.data === undefined) { setError(errOf(r)); return; }
            setError(null); setOffer(r.data.handoff); setReceipt(r.data.receipt);
          }} />
          <span className="eye-help"> Revoking stops a claim; the offer and its revocation are kept on record (nothing is undone).</span>
        </div>
      )}
      <ErrorNote error={error} />
      <Receipt receipt={receipt} />
      <LiveStatus>{offer === null ? '' : `Handoff ${offer.status}`}</LiveStatus>
    </Dialog>
  );
}
