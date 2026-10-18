'use client';
/**
 * THE OPERATIONS ROOM — CP-6 B81 §LY-M (F-P7-E-04: BP-05, UX-16-001…005, PAT-45, PAT-46), beside B36's command views on /home. The
 * ≥ 1920 command composition of ONE person's room: the corridor (a structured alternative — the map canvas is B82's), the warning queue
 * and the twin state, each read through its own governed route under the person's context; the display it publishes, its mirror windows,
 * the presentation-only route, and the handoff of the review to another of the person's own signed-in sessions. Opened as `?mirror=1`
 * (from the control surface's "Open a mirror window") the page FOLLOWS and commands nothing. Every refusal is shown in the server's words;
 * every figure of the demonstration is SYNTHETIC. CONSTRUCTION only.
 */
import { useCallback, useEffect, useState } from 'react';
import { useShell } from '../../decisions/layout';
import { home, type HomeRead } from '../../../lib/home';
import { exposures, type ExposureRow } from '../../../lib/exposures';
import { twins, type Twin } from '../../../lib/twins';
import { roomWatermark } from '../../../lib/windows-b81';
import { CommandComposition, type RoomData } from '../../../components/command-environment';
import { LiveStatus } from '../../../components/observation';
import { DegradedDependencies } from './degraded-b81';

type Res = { ok: boolean; status: number; error?: { code: string; message: string } };
const refusal = (what: string, r: Res) => `${what}: HTTP ${r.status}${r.error?.code ? ` ${r.error.code}` : ''} — ${r.error?.message ?? 'no answer'}`;
const HEX64 = /^[0-9a-f]{64}$/;

/** The context-bar dimensions the room was read under (UX-16-002) — only the values the server stated. */
function viewContextOf(h: HomeRead | null): Record<string, string> {
  if (h === null) return {};
  const c = h.context; const out: Record<string, string> = {};
  if (c.digest !== null && HEX64.test(c.digest)) out['digest'] = c.digest;
  if (c.objective_id !== null) out['objective_id'] = c.objective_id;
  if (c.scenario_id !== null) out['scenario_id'] = c.scenario_id;
  if (/^[0-9]{1,3}[dmy]$/.test(c.horizon)) out['horizon'] = c.horizon;
  if (['public', 'internal', 'confidential', 'restricted'].includes(c.classification)) out['classification'] = c.classification;
  if (c.effective_at !== null) out['effective_at'] = c.effective_at;
  return out;
}

export default function OperationsRoomPage() {
  const { scope } = useShell();
  const [data, setData] = useState<RoomData | null>(null);
  const [problems, setProblems] = useState<string[]>([]);
  const [mirrorWindow, setMirrorWindow] = useState(false);
  useEffect(() => { setMirrorWindow(new URLSearchParams(window.location.search).get('mirror') === '1'); }, []);
  const load = useCallback(async () => {
    const [h, x, t] = await Promise.all([home.read(scope, 20), exposures.list(scope), twins.list(scope)]);
    const notes: string[] = [];
    if (!h.ok || h.data === undefined) notes.push(refusal('The warning queue and the context could not be read', h));
    if (!x.ok || x.data === undefined) notes.push(refusal('The corridor exposures could not be read', x));
    if (!t.ok || t.data === undefined) notes.push(refusal('The twin register could not be read', t));
    const hr = h.data?.home ?? null;
    const risks: ExposureRow[] = x.data?.risks ?? [];
    const tw: Twin[] = t.data?.twins ?? [];
    const w = roomWatermark({ homeAsOf: hr?.as_of ?? null, registerAt: x.data?.at ?? null });
    setProblems(notes);
    setData({
      input: { exposures: risks.map((e) => ({ exposure_id: e.exposure_id, title: e.title, state: e.state, current_version: e.current_version, breach: e.breach, polarity: e.polarity })),
               warnings: hr?.sections.warnings.items ?? [], twins: tw },
      watermark: w.watermark, watermarkBasis: w.basis, classification: hr?.context.classification ?? null, context: viewContextOf(hr),
      scopeLine: `domain ${scope.domainId.slice(0, 8)}… of tenant ${scope.tenantId.slice(0, 8)}…`,
    });
  }, [scope]);
  useEffect(() => { void load(); }, [load]);
  return (
    <>
      <h1 className="eye-cmdenv-h1">Operations room</h1>
      <p className="eye-help">The command composition (BP-05, 1920 px and wider): the corridor, the warning queue and the twin state with one synchronized selection,
        one display and its ONE control surface. Presenting and handing off move where you are looking — they never act; every act stays on its own page behind its review.</p>
      {problems.map((p) => <p key={p} role="alert" className="eye-cmdenv-frozen">{p}</p>)}
      {data === null ? <LiveStatus>reading the room…</LiveStatus>
        : <CommandComposition scope={scope} data={data} authenticated mirrorWindow={mirrorWindow} onReload={() => { void load(); }} />}
      {/* B81 act (§DG): the degraded dependencies under the composition — the room's own Status region stays first on the 1920 surface */}
      <DegradedDependencies scope={scope} purpose="navigation" />
    </>
  );
}
