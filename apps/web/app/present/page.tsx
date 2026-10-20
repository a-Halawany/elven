'use client';
/**
 * THE PRESENTATION-ONLY DISPLAY — CP-6 B81 §LY-M (F-P7-E-04: PAT-46, UX-16-004/-005; DESIGN D10). A large display, a briefing wall or a
 * secure kiosk shows what its control surface PUBLISHED (shell.presentation_of), under the viewer's OWN signed-in session (the same person;
 * the server refuses any other principal and any other scope). It lives outside every workspace shell: it carries NO control of any kind —
 * no navigation, no command, no form (windows-b81.test.ts checks this file's source). It follows the control surface over the browser's
 * channel and re-reads the server record every few seconds; drift, a lost synchronisation, a lost classification context or an unavailable
 * control surface FREEZE it on the last verified state with the divergence watermark; an ended presentation withholds everything.
 * CONSTRUCTION only; every figure of the demonstration is SYNTHETIC.
 */
import { useEffect, useRef, useState } from 'react';
import { getSession } from '../../lib/api';
import { home } from '../../lib/home';
import { exposures } from '../../lib/exposures';
import { twins } from '../../lib/twins';
import {
  EMPTY_MIRROR, PRESENTATION_POLL_MS, displayIn, openSyncChannel, presentationParams, reduceMirror, roomSections, roomWatermark, selectionFromLocation, tickMirror,
  verifyAgainstServer, windows, type MirrorState, type PresentationStateView, type RoomInput, type RoomSection,
} from '../../lib/windows-b81';
import type { ShellScope } from '../../lib/b80-seams';
import { PresentationView } from '../../components/command-environment';

type Res = { ok: boolean; status: number; error?: { code: string; message: string } };
const refusal = (what: string, r: Res) => `${what}: HTTP ${r.status}${r.error?.code ? ` ${r.error.code}` : ''} — ${r.error?.message ?? 'no answer'}`;

export default function PresentationPage() {
  const [target, setTarget] = useState<{ display: string; scope: ShellScope } | null | 'invalid'>(null);
  const [signedIn, setSignedIn] = useState<boolean | null>(null);
  const [server, setServer] = useState<PresentationStateView | null>(null);
  const [mirror, setMirror] = useState<MirrorState>(EMPTY_MIRROR);
  const [room, setRoom] = useState<Omit<RoomInput, 'selection'> | null>(null);
  const [ownDataAt, setOwnDataAt] = useState<string | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const live = useRef(true);

  useEffect(() => {
    setTarget(presentationParams(window.location.search) ?? 'invalid');
    setSignedIn(getSession() !== null);
    return () => { live.current = false; };
  }, []);
  useEffect(() => {
    if (target === null || target === 'invalid' || signedIn !== true) return;
    const { scope, display } = target;
    const read = async () => {
      const [p, h, x, t] = await Promise.all([windows.presentations(scope, display, 1), home.read(scope, 20), exposures.list(scope), twins.list(scope)]);
      if (!live.current) return;
      if (!p.ok || p.data === undefined) { setProblem(refusal('The display could not be read', p)); setMirror((m) => ({ ...m, frozen: m.frozen.includes('sync_failure') ? m.frozen : [...m.frozen, 'sync_failure'] })); return; }
      const cur = displayIn(p.data.presentations, display);
      setServer(cur); setProblem(null);
      setMirror((m) => verifyAgainstServer(tickMirror(m, Date.now()), cur, Date.now()));
      if (h.ok && h.data !== undefined && x.ok && x.data !== undefined && t.ok && t.data !== undefined) {
        setRoom({ exposures: x.data.risks.map((e) => ({ exposure_id: e.exposure_id, title: e.title, state: e.state, current_version: e.current_version, breach: e.breach, polarity: e.polarity })),
                  warnings: h.data.home.sections.warnings.items, twins: t.data.twins });
        setOwnDataAt(roomWatermark({ homeAsOf: h.data.home.as_of, registerAt: x.data.at }).watermark);
      }
    };
    void read();
    const poll = window.setInterval(() => { void read(); }, PRESENTATION_POLL_MS);
    const ch = openSyncChannel(display, (m) => setMirror((s) => reduceMirror(s, m, Date.now())));
    return () => { window.clearInterval(poll); ch.close(); };
  }, [target, signedIn]);

  const display = target !== null && target !== 'invalid' ? target.display : 'unnamed';
  const followed = mirror.lastVerified?.location ?? server?.location ?? null;
  const sections: RoomSection[] | null = room === null ? null : roomSections({ ...room, selection: selectionFromLocation(followed) });
  return (
    <main className="eye-presentation-page">
      <h1 className="eye-cmdenv-h1">Presentation display</h1>
      {target === 'invalid' ? <p className="eye-presentation-withheld">This address names no display and no domain. Open the presentation address shown on the control surface.</p>
        : signedIn === false ? <p className="eye-presentation-withheld">This display is not signed in. Sign in as yourself on this device (the sign-in page, then this address again) — a display shows only its own person&apos;s presentation.</p>
          : <PresentationView display={display} server={server} mirror={mirror} sections={sections} ownDataAt={ownDataAt} problem={problem} />}
    </main>
  );
}
