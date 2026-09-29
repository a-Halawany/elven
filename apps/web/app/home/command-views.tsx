'use client';
/**
 * THE COMMAND VIEWS (CP-6 B36, 0094 §H6; CAP-EO-02/-04) — role × moment: executive/morning, executive/board-day,
 * executive_operator/cadence-prep, decision_owner/review. The server lists the views of the roles the person holds and composes a view
 * from the SAME read as the home (its sections, its safe actions); a view of a role not held is refused by the port and shown as stated.
 */
import { useEffect, useState } from 'react';
import { useShell } from '../decisions/layout';
import { home as api, actionLabel, contextLine, viewsByRole, type CommandView, type CommandViewRead } from '../../lib/home';
import { Empty, LiveStatus } from '../../components/observation';
import { buttonStyle } from '../../components/ui';
import { HomeSections } from './sections';

const small = { fontSize: 'var(--eye-type-label-sm)' } as const;
const critical = { color: 'var(--eye-color-critical)' } as const;
const refusal = (r: { status: number; error?: { code: string; message: string } }, fallback: string) => `HTTP ${r.status}${r.error?.code ? ` ${r.error.code}` : ''} — ${r.error?.message ?? fallback}`;

export function CommandViews({ contextDigest }: { contextDigest: string | null }) {
  const { scope } = useShell();
  const [views, setViews] = useState<CommandView[] | null>(null);
  const [open, setOpen] = useState<CommandViewRead | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  useEffect(() => {
    void (async () => {
      const r = await api.views(scope);
      if (!r.ok || r.data === undefined) { setProblem(refusal(r, 'the views could not be listed')); return; }
      setViews(r.data.views);
    })();
  }, [scope]);
  useEffect(() => {
    if (open === null) return;
    void (async () => { const r = await api.view(scope, open.view_key); if (r.ok && r.data !== undefined) setOpen(r.data.view); })();
    // the view re-reads under the new context (its sections name the digest)
  }, [contextDigest]); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <section aria-labelledby="command-views" data-testid="command-views" style={{ border: '1px solid var(--eye-color-border-default)', borderRadius: 'var(--eye-radius-md)', padding: 'var(--eye-space-16)', marginBlockEnd: 'var(--eye-space-16)', background: 'var(--eye-color-surface-primary)' }}>
      <h2 id="command-views" style={{ fontSize: 'var(--eye-type-heading-3)', marginBlockStart: 0 }}>Command views</h2>
      <p style={{ ...small, color: 'var(--eye-color-ink-muted)' }}>Role × moment: which sections and which safe actions each shows. You see the views of the roles you hold; a view offers, the server authorises each act.</p>
      {problem !== null && <p role="alert" style={critical}>{problem}</p>}
      {views === null ? <LiveStatus>reading the views…</LiveStatus> : views.length === 0 ? <Empty>No command view is defined for the roles you hold.</Empty> : (
        <ul aria-label="command views" style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexWrap: 'wrap', gap: 'var(--eye-space-8)' }}>
          {viewsByRole(views).flatMap((g) => g.views.map((v) => (
            <li key={v.view_key}>
              <button type="button" style={{ ...buttonStyle, fontWeight: open?.view_key === v.view_key ? 650 : 400 }} aria-pressed={open?.view_key === v.view_key} onClick={() => void (async () => {
                const r = await api.view(scope, v.view_key);
                if (!r.ok || r.data === undefined) { setProblem(`${v.title} refused — ${refusal(r, 'no answer')}`); return; }
                setProblem(null); setOpen(r.data.view);
              })()}>{v.title} <span style={small}>({g.role} / {v.moment})</span></button>
            </li>
          )))}
        </ul>
      )}
      {open !== null ? (
        <div data-testid="command-view-open" style={{ marginBlockStart: 'var(--eye-space-16)' }}>
          <h3 style={{ fontSize: 'var(--eye-type-heading-3)' }}>{open.title} <span style={small}>({open.role_code} / {open.moment})</span></h3>
          <p style={small}>{open.description}</p>
          <p style={small} aria-label="the view's context"><strong>Read under:</strong> {contextLine(open.context, open.ceiling)} · as of {open.as_of}</p>
          <p style={small}><strong>Safe actions offered:</strong> {open.actions.length === 0 ? 'none' : open.actions.map(actionLabel).join(' · ')}</p>
          <HomeSections h={open} order={open.sections_order} />
        </div>
      ) : null}
    </section>
  );
}
