'use client';
/**
 * CUSTOMER THEMES — CP-6 B80 §TK (0118_b80_x_tk; F-P7-E-03: UX-68-001…005, UX-ADR-022, PAT-41, REL-16, UX-17-005). One view, two seats:
 *   · the TENANT seat (/brand/themes — the customer's brand owner, branding_authority): the theme IN FORCE first (and its rollback), every
 *     version with its state in words and its certification (the failing pairs named), the PROPOSAL form (the allowed keys only — the
 *     accent, the surface tints, the wordmark, the logo — with a live preview in light, dark and print), then activate / retire;
 *   · the PLATFORM seat (/admin/governance/design/themes — the Design System Authority): every tenant's proposals awaiting certification,
 *     a version's preview (the matrix from the STORED mapping, the server's and this client's agreeing or the divergence named), and the
 *     SIGNED certification — whose outcome is the server's recomputation: CERTIFIED, or REFUSED with the failing pairs in the server's words.
 * Everything renders from the server's answer; a refusal is shown in the server's words; each act shows its eligibility, the exact digest and
 * its consequence and needs a deliberate confirmation; nothing is optimistic; a proposal is never styled like a certified theme. On a
 * demonstration every brand, persona and record is SYNTHETIC; a real customer's brand acceptance is H3 / R2.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ALLOWED_COLOUR_KEYS, validateMapping } from '@eye/tokens';
import { ErrorNote, Receipt } from '../../../../../components/ui';
import { GovernedButton } from '../../../../../components/observation';
import { Symbol } from '../../../../../components/symbols';
import { ThemePreview } from '../../../../../components/theme';
import { Digest, Identifier, Timestamp } from '../../../../../components/text';
import { latestOnly } from '../../../../../lib/governance-dg-b107';
import { emptyForm, expectedVersionFor, inForceText, mappingFrom, matrixParity, previewMatrix, scopeIdFor, themeStateText, themes,
  type Preview, type ProposalForm, type Queue, type Receipt as Rcpt, type TenantRead, type ThemeRow } from '../../../../../lib/themes-b80';

type Err = { code: string; message: string; correlationId: string } | null;
type Picked = { tenantId: string; themeId: string; version: number } | null;
const KEY = /^[a-z][a-z0-9-]{2,60}$/;

function ActBox({ title, eligibility, consequence, digest, onRun, label, critical }: { title: string; eligibility: string[]; consequence: string[]; digest: string | null; onRun: (reason: string) => Promise<void>;
  label: string; critical?: boolean }) {
  const [reason, setReason] = useState('');
  const [confirmed, setConfirmed] = useState(false);
  const id = `act-${label.replace(/[^a-z]/gi, '').toLowerCase()}`;
  const blocked = eligibility.length > 0;
  return (
    <div className="eye-tk-card eye-tk-in-force" data-testid={id}>
      <strong>{title}</strong>
      {digest !== null ? <div>Exact digest: <Digest value={digest} max={28} /></div> : null}
      <ul>{consequence.map((c) => <li key={c}>{c}</li>)}</ul>
      {blocked ? <div role="status" className="eye-tk-gap">You cannot take this act: {eligibility.join('; ')}</div> : null}
      <div className="eye-tk-field">
        <label htmlFor={`${id}-reason`}>Reason (8+ characters)</label>
        <input id={`${id}-reason`} className="eye-tk-input" value={reason} onChange={(e) => setReason(e.target.value)} />
      </div>
      <label><input type="checkbox" checked={confirmed} onChange={(e) => setConfirmed(e.target.checked)} /> I have read the digest and the consequence; this is my act</label>
      <div className="eye-tk-actions">
        <GovernedButton label={label} pendingLabel={label} variant={critical === true ? 'critical' : 'primary'} disabled={blocked || reason.trim().length < 8 || !confirmed}
          onRun={async () => { await onRun(reason.trim()); setReason(''); setConfirmed(false); }} />
      </div>
    </div>
  );
}

export function ThemesView({ seat, tenantId }: { seat: 'tenant' | 'platform'; tenantId: string | null }) {
  const [read, setRead] = useState<TenantRead | null>(null);
  const [queue, setQueue] = useState<Queue | null>(null);
  const [error, setError] = useState<Err>(null);
  const [receipt, setReceipt] = useState<Rcpt | null>(null);
  const [pick, setPick] = useState<Picked>(null);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [form, setForm] = useState<ProposalForm>(emptyForm());
  const [key, setKey] = useState('');
  const [title, setTitle] = useState('');
  const guard = useRef(latestOnly());

  const load = useCallback(async () => {
    if (seat === 'platform') { const q = await themes.queue(); if (q.ok && q.data !== undefined) setQueue(q.data); else setError(q.error ?? null); }
    if (tenantId !== null) { const r = await themes.read(tenantId); if (r.ok && r.data !== undefined) setRead(r.data); else setError(r.error ?? null); }
  }, [seat, tenantId]);
  useEffect(() => { void load(); }, [load]);

  // the preview of the picked version — only the newest answer is applied (a stale response never shows another version's digest)
  useEffect(() => {
    setPreview(null);
    if (pick === null) return;
    const n = guard.current.next();
    void themes.preview(pick.tenantId, pick.themeId, pick.version).then((r) => {
      if (!guard.current.isLatest(n)) return;
      if (r.ok && r.data !== undefined) setPreview(r.data.preview); else setError(r.error ?? null);
    });
  }, [pick]);

  const after = async (r: { ok: boolean; data?: { receipt: Rcpt }; error?: { code: string; message: string; correlationId: string } }) => {
    if (r.ok && r.data !== undefined) { setReceipt(r.data.receipt); setError(null); await load(); if (pick !== null) setPick({ ...pick }); return; }
    setError(r.error ?? null); await load(); if (pick !== null) setPick({ ...pick });
    throw new Error(r.error?.message ?? 'refused');
  };

  const candidate = useMemo(() => mappingFrom(form), [form]);
  const problems = useMemo(() => validateMapping(candidate), [candidate]);
  const expected = expectedVersionFor(read?.themes ?? [], key.trim());
  const inForce = read?.in_force ?? null;
  const activation = (inForce?.activation ?? null) as { activation_id?: string } | null;
  const parity = useMemo(() => preview === null ? null : matrixParity(preview.matrix, previewMatrix(preview.mapping).matrix), [preview]);
  const rowsByKey = useMemo(() => {
    const m = new Map<string, ThemeRow[]>();
    for (const r of read?.themes ?? []) m.set(r.theme_key, [...(m.get(r.theme_key) ?? []), r]);
    return [...m.entries()];
  }, [read]);
  const setColour = (k: string, patch: Partial<{ on: boolean; light: string; dark: string }>) =>
    setForm((f) => ({ ...f, colours: { ...f.colours, [k]: { ...(f.colours[k] ?? { on: false, light: '', dark: '' }), ...patch } } }));

  return (
    <div className="eye-tk-page">
      <ErrorNote error={error} />
      <Receipt receipt={receipt} />

      {seat === 'platform' ? (
        <section className="eye-tk-card" aria-labelledby="tk-queue">
          <h2 id="tk-queue" className="eye-type-heading-2">Awaiting certification — every tenant</h2>
          <p className="eye-tk-muted">The Design System Authority certifies; never the proposer, never an agent. The outcome is the server&apos;s recomputation of the contrast matrix from the stored mapping.</p>
          {(queue?.awaiting ?? []).length === 0 ? <p>No theme awaits certification.</p> : (
            <div className="eye-tk-scroll" role="region" aria-label="Themes awaiting certification" tabIndex={0}>
              <table className="eye-table">
                <thead><tr><th>Tenant</th><th>Theme</th><th>Version</th><th>Proposed by</th><th>State</th><th>Open</th></tr></thead>
                <tbody>
                  {(queue?.awaiting ?? []).map((r) => (
                    <tr key={`${r.theme_id}-${r.version}`}>
                      <td data-label="Tenant"><Identifier value={r.tenant_id} max={14} copy={false} /></td>
                      <td data-label="Theme">{r.title} <span className="eye-tk-muted">({r.theme_key})</span></td>
                      <td data-label="Version">v{r.version}</td>
                      <td data-label="Proposed by">{r.proposed_by_name ?? 'a principal of the tenant'} · <Timestamp value={r.proposed_at} /></td>
                      <td data-label="State">{themeStateText(r, null)}</td>
                      <td data-label="Open"><button type="button" className="eye-copy" onClick={() => setPick({ tenantId: r.tenant_id, themeId: r.theme_id, version: r.version })}>Preview v{r.version}</button></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {(queue?.recent ?? []).length > 0 ? (
            <>
              <h3 className="eye-type-heading-3">Recent certifications</h3>
              <ul>
                {(queue?.recent ?? []).map((r) => (
                  <li key={`${r.theme_id}-${r.version}`}>
                    {r.title} v{r.version}: <strong>{String(r.certification?.outcome ?? '').toUpperCase()}</strong> by {r.certification?.certifier_name ?? 'the Design System Authority'}
                    {(r.certification?.failing ?? []).length > 0 ? ` — ${(r.certification?.failing ?? []).length} failing pair(s)` : ''}
                  </li>
                ))}
              </ul>
            </>
          ) : null}
        </section>
      ) : null}

      {tenantId !== null ? (
        <section className={`eye-tk-card ${inForce?.theme === 'customer' ? 'eye-tk-in-force' : ''}`} aria-labelledby="tk-in-force">
          <h2 id="tk-in-force" className="eye-type-heading-2">The theme in force</h2>
          <p data-testid="in-force">{inForce?.fallback === true ? <Symbol id="degraded" /> : null} {inForceText(inForce)}</p>
          {seat === 'tenant' && inForce?.theme === 'customer' && activation?.activation_id !== undefined ? (
            <ActBox title="Roll back the theme in force" eligibility={[]} digest={null} label="Roll back" critical
              consequence={['the tenant returns to the theme before this one — or to the certified core theme when there is none', 'the rollback is recorded; nothing is deleted']}
              onRun={async (reason) => after(await themes.rollback(tenantId, { expectedActivation: String(activation.activation_id), reason }))} />
          ) : null}
        </section>
      ) : null}

      {tenantId !== null ? (
        <section className="eye-tk-card" aria-labelledby="tk-versions">
          <h2 id="tk-versions" className="eye-type-heading-2">Theme versions</h2>
          {rowsByKey.length === 0 ? <p>No customer theme has been proposed for this tenant; the certified core theme applies.</p> : rowsByKey.map(([k, vs]) => (
            <div key={k}>
              <h3 className="eye-type-heading-3">{vs[0]?.title} <span className="eye-tk-muted">({k})</span></h3>
              <ul>
                {vs.map((v) => (
                  <li key={v.version} className={v.state === 'proposed' ? 'eye-tk-proposal eye-tk-card' : 'eye-tk-card'}>
                    <strong>v{v.version}</strong> — {themeStateText(v, inForce)} · proposed by {v.proposed_by_name ?? 'a principal'} · <Timestamp value={v.proposed_at} />
                    {v.certification !== null ? (
                      <div>
                        Certification: <strong>{String(v.certification.outcome).toUpperCase()}</strong> by {v.certification.certifier_name ?? 'the Design System Authority'} · <Timestamp value={v.certification.certified_at} /> (claim: {String(v.certification['claim'] ?? 'demonstration')})
                        {(v.certification.failing ?? []).length > 0 ? <ul>{(v.certification.failing ?? []).map((f, i) => (
                          <li key={i}><Symbol id="critical" /> {String(f['mode'])}: {String(f['fg'])} on {String(f['bg'])} {Number(f['shown']).toFixed(2)}{f['kind'] === 'distinct' || f['kind'] === 'distinct_cvd' ? ' ΔE' : ':1'} &lt; {String(f['required'])}</li>
                        ))}</ul> : null}
                      </div>
                    ) : null}
                    <div className="eye-tk-actions"><button type="button" className="eye-copy" onClick={() => setPick({ tenantId, themeId: v.theme_id, version: v.version })}>Preview v{v.version}</button></div>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </section>
      ) : null}

      {preview !== null && pick !== null ? (
        <section className="eye-tk-card" aria-labelledby="tk-preview">
          <h2 id="tk-preview" className="eye-type-heading-2">Preview — {preview.title} v{preview.version}</h2>
          <p>{themeStateText({ ...preview, certification: null }, inForce)}</p>
          <p>Server matrix ({preview.matrix.rules_version}): <strong>{preview.matrix.outcome === 'pass' ? 'every pair passes' : `${preview.matrix.failing.length} failing pair(s)`}</strong> of {preview.matrix.pairs}.</p>
          {preview.failing_text.length > 0 ? <ul>{preview.failing_text.map((t) => <li key={t}><Symbol id="critical" /> {t}</li>)}</ul> : null}
          <p data-testid="parity">{parity?.agree === true ? 'This browser recomputed the same matrix, pair by pair.' : `DIVERGENCE between the server and this browser: ${(parity?.differing ?? []).slice(0, 6).join('; ')}`}</p>
          <ThemePreview mapping={preview.mapping} title={`${preview.title} v${preview.version}`} scopeId={scopeIdFor(preview.theme_id, preview.version)} />
          {seat === 'platform' ? (
            <ActBox title={`Certify ${preview.title} v${preview.version}`} eligibility={preview.eligibility.certify} digest={preview.certification_digest} label="Certify (signed)"
              consequence={preview.consequence.certify}
              onRun={async (reason) => after(await themes.certify(pick.tenantId, pick.themeId, { version: preview.version, digest: preview.certification_digest, reason }))} />
          ) : (
            <>
              <ActBox title={`Activate ${preview.title} v${preview.version}`} eligibility={preview.eligibility.activate} digest={preview.digest} label="Activate" consequence={preview.consequence.activate}
                onRun={async (reason) => after(await themes.activate(pick.tenantId, pick.themeId, { version: preview.version, digest: preview.digest, reason }))} />
              <ActBox title={`Retire ${preview.title} v${preview.version}`} eligibility={preview.eligibility.retire} digest={null} label="Retire" critical
                consequence={['the version is kept for the record and never put in force again']}
                onRun={async (reason) => after(await themes.retire(pick.tenantId, pick.themeId, { version: preview.version, reason }))} />
            </>
          )}
        </section>
      ) : null}

      {seat === 'tenant' && tenantId !== null ? (
        <section className="eye-tk-card eye-tk-proposal" aria-labelledby="tk-propose">
          <h2 id="tk-propose" className="eye-type-heading-2">Propose a theme version</h2>
          <p className="eye-tk-muted">A theme maps brand expression only: the accent, the surface tints, the wordmark and the logo. Semantic and status colours are never mappable. A proposal is not in force until the Design System Authority certifies it and a brand owner activates it.</p>
          <div className="eye-tk-field"><label htmlFor="tk-key">Theme key (lower-case letters, digits, hyphens)</label>
            <input id="tk-key" className="eye-tk-input" value={key} onChange={(e) => setKey(e.target.value)} aria-describedby="tk-key-version" />
            <span id="tk-key-version" className="eye-tk-muted">{KEY.test(key.trim()) ? `This proposes version ${expected + 1} (the latest is ${expected}).` : 'Name the key to see the version this proposes.'}</span></div>
          <div className="eye-tk-field"><label htmlFor="tk-title">Title</label><input id="tk-title" className="eye-tk-input" value={title} onChange={(e) => setTitle(e.target.value)} /></div>
          <fieldset className="eye-tk-colours">
            <legend>Allowed colour keys</legend>
            {ALLOWED_COLOUR_KEYS.map((k) => {
              const c = form.colours[k]!; const cid = k.replace(/\./g, '-');
              return (
                <div key={k} className="eye-tk-colour">
                  <input id={`tk-${cid}-on`} type="checkbox" checked={c.on} onChange={(e) => setColour(k, { on: e.target.checked })} />
                  <label htmlFor={`tk-${cid}-on`}>Map {k}</label>
                  <label htmlFor={`tk-${cid}-light`}>Light</label>
                  <input id={`tk-${cid}-light`} type="color" value={c.light.toLowerCase()} disabled={!c.on} onChange={(e) => setColour(k, { light: e.target.value })} />
                  <label htmlFor={`tk-${cid}-dark`}>Dark</label>
                  <input id={`tk-${cid}-dark`} type="color" value={c.dark.toLowerCase()} disabled={!c.on} onChange={(e) => setColour(k, { dark: e.target.value })} />
                </div>
              );
            })}
          </fieldset>
          <div className="eye-tk-field"><label htmlFor="tk-wordmark">Wordmark (2–40 characters)</label><input id="tk-wordmark" className="eye-tk-input" value={form.wordmark} onChange={(e) => setForm({ ...form, wordmark: e.target.value })} /></div>
          <div className="eye-tk-field"><label htmlFor="tk-logo-src">Logo (same-origin path /brand/name.svg, optional)</label><input id="tk-logo-src" className="eye-tk-input" value={form.logoSrc} onChange={(e) => setForm({ ...form, logoSrc: e.target.value })} /></div>
          <div className="eye-tk-field"><label htmlFor="tk-logo-alt">Logo text alternative</label><input id="tk-logo-alt" className="eye-tk-input" value={form.logoAlt} onChange={(e) => setForm({ ...form, logoAlt: e.target.value })} /></div>
          {problems.length > 0 && Object.keys(candidate).length > 0 ? <div role="alert" className="eye-tk-gap">{problems.map((p) => `(${p.cls}) ${p.message}`).join('; ')}</div> : null}
          {Object.keys(candidate).length > 0 && problems.length === 0 ? <ThemePreview mapping={candidate} title="Your proposal (not certified, not in force)" scopeId="pv-proposal" /> : null}
          <div className="eye-tk-actions">
            <GovernedButton label="Propose (not in force until certified and activated)" pendingLabel="Proposing" disabled={!KEY.test(key.trim()) || title.trim().length < 3 || Object.keys(candidate).length === 0 || problems.length > 0}
              onRun={async () => after(await themes.propose(tenantId, { key: key.trim(), expectedVersion: expected, title: title.trim(), mapping: candidate }))} />
          </div>
        </section>
      ) : null}

      <p className="eye-tk-muted">{read?.boundary ?? queue?.boundary ?? ''}</p>
    </div>
  );
}
