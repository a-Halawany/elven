'use client';
/**
 * B80 §TK (F-P7-E-03: UX-68-001/-005, UX-17-005, UX-ADR-022, PAT-41, REL-16) — THEMESCOPE and THEMEPREVIEW of the shared library.
 *
 * THEMESCOPE applies the tenant's ACTIVATED, CERTIFIED customer theme to what it wraps — and nothing else: it renders the theme the server
 * says is IN FORCE (governance.theme_in_force, which re-validates the version and re-verifies its matrix), RECOMPUTES the matrix here with
 * packages/tokens (the same algorithm), and applies the theme only when both agree; otherwise it renders the certified CORE theme
 * (`data-eye-theme="fallback"`) and STATES why (UX-17-005, UX-68-005: a divergence across deployment is shown, never silently resolved).
 * The theme's CSS comes from packages/tokens' themeCss (validated keys, #RRGGBB values, a plain scope id — nothing unvalidated is
 * emitted); it applies on screen in light and dark only (print and forced colours keep the core palette). §SH's AppShell renders it in its
 * themeScope slot (b80-seams AppShellSlots); `useThemeInForce()` hands the wordmark and the state to the shell.
 *
 * THEMEPREVIEW renders a fixed SPECIMEN (a critical warning, a decision with its actor, a recommendation, a table row, a focusable control
 * and the wordmark) side by side in LIGHT, DARK and PRINT under a candidate mapping — the same items, labels, symbols and order in every
 * mode (semantic parity; only the palette changes) — with the matrix of this client marked as a PREVIEW (the certification is the server's).
 */
import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { certifyTheme, previewCss, themeCss, validateMapping, type ThemeMapping } from '@eye/tokens';
import { Symbol } from './symbols';
import { SPECIMEN_MODES, inForceText, scopeIdFor, specimen, themes, type InForce } from '../lib/themes-b80';

export interface ThemeState { state: 'reading' | 'core' | 'customer' | 'fallback'; note: string; wordmark: string | null; inForce: InForce | null }
const Ctx = createContext<ThemeState>({ state: 'core', note: 'the certified core theme', wordmark: null, inForce: null });
/** The theme state of the nearest ThemeScope (the shell reads the wordmark and the fallback note). */
export function useThemeInForce(): ThemeState { return useContext(Ctx); }

/** Decide what a scope applies from the server's answer (pure: the client recomputation must agree). */
function decide(f: InForce | null): { state: ThemeState; css: string | null; scopeId: string } {
  if (f === null) return { state: { state: 'reading', note: inForceText(null), wordmark: null, inForce: null }, css: null, scopeId: 'fallback' };
  if (f.theme !== 'customer' || f.version === undefined) {
    return { state: { state: f.fallback ? 'fallback' : 'core', note: inForceText(f), wordmark: null, inForce: f }, css: null, scopeId: 'fallback' };
  }
  const mapping = f.version.mapping;
  const problems = validateMapping(mapping);
  const local = problems.length === 0 ? certifyTheme(mapping) : null;
  if (local === null || local.outcome !== 'certifiable') {
    const why = problems.length > 0 ? problems.map((p) => p.message).join('; ') : `this client's contrast matrix fails ${local?.matrix?.failing.length ?? 0} pair(s)`;
    return { state: { state: 'fallback', note: `DIVERGENCE — the server reports ${f.version.title} v${f.version.version} in force, but ${why}; the certified core theme is applied here`, wordmark: null, inForce: f },
             css: null, scopeId: 'fallback' };
  }
  const scopeId = scopeIdFor(f.version.theme_id, f.version.version);
  const wm = (mapping['brand.wordmark'] as { text?: string } | undefined)?.text ?? null;
  return { state: { state: 'customer', note: inForceText(f), wordmark: wm, inForce: f }, css: themeCss(mapping, scopeId), scopeId };
}

export function ThemeScope({ tenantId, domainId, inForce, children, showNote }: { tenantId?: string | null; domainId?: string | null; inForce?: InForce | null; children: ReactNode; showNote?: boolean }) {
  const [answer, setAnswer] = useState<InForce | null>(inForce ?? null);
  const [readError, setReadError] = useState<string | null>(null);
  useEffect(() => {
    if (inForce !== undefined) { setAnswer(inForce); return; }
    if (tenantId === undefined || tenantId === null || tenantId === '') return;
    let live = true;
    void themes.inForce(tenantId, domainId ?? null).then((r) => {
      if (!live) return;
      if (r.ok && r.data !== undefined) { setAnswer(r.data.in_force); setReadError(null); }
      else setReadError(r.error?.message ?? 'the theme in force could not be read');
    });
    return () => { live = false; };
  }, [tenantId, domainId, inForce]);
  const d = useMemo(() => decide(readError !== null ? null : answer), [answer, readError]);
  const state: ThemeState = readError !== null ? { state: 'fallback', note: `the theme in force could not be read (${readError}) — the certified core theme is applied`, wordmark: null, inForce: null } : d.state;
  const noteShown = showNote !== false && (state.state === 'fallback');
  return (
    <Ctx.Provider value={state}>
      {d.css !== null && readError === null ? <style data-eye-theme-css={d.scopeId}>{d.css}</style> : null}
      <div data-eye-theme={readError === null ? d.scopeId : 'fallback'} data-eye-theme-state={state.state} className="eye-theme-scope">
        {noteShown ? <p role="status" className="eye-theme-note"><Symbol id="degraded" /> {state.note}</p> : null}
        {children}
      </div>
    </Ctx.Provider>
  );
}

/** THE SPECIMEN in light, dark and print under a candidate mapping (PAT-41). `mapping` null previews the core theme. */
export function ThemePreview({ mapping, title, scopeId }: { mapping: ThemeMapping | null; title: string; scopeId?: string }) {
  const id = scopeId ?? 'pv-candidate';
  const problems = mapping === null ? [] : validateMapping(mapping);
  const css = problems.length === 0 ? previewCss(mapping, id) : null;
  const local = problems.length === 0 ? certifyTheme(mapping) : null;
  const wm = mapping === null ? null : ((mapping['brand.wordmark'] as { text?: string } | undefined)?.text ?? null);
  const items = specimen(wm);
  return (
    <section className="eye-theme-preview" aria-label={`Theme preview: ${title}`}>
      <h3 className="eye-type-heading-3">{title}</h3>
      {problems.length > 0 ? (
        <div role="alert" className="eye-theme-note">
          <Symbol id="critical" /> This mapping is not a theme: {problems.map((p) => `(${p.cls}) ${p.message}`).join('; ')}. Nothing is previewed; the certified core theme stays.
        </div>
      ) : null}
      {css !== null ? <style data-eye-preview-css={id}>{css}</style> : null}
      {css !== null ? (
        <div className="eye-theme-preview-modes">
          {SPECIMEN_MODES.map((mode) => (
            <div key={mode} className="eye-theme-specimen" data-eye-preview={id} data-eye-mode={mode} aria-label={`${title} — ${mode}`} role="group">
              <div className="eye-text-label">{mode.toUpperCase()}</div>
              <ol className="eye-theme-specimen-items">
                {items.map((it) => (
                  <li key={it.kind} className={`eye-theme-specimen-item eye-theme-specimen-${it.kind}`}>
                    {it.symbol !== null ? <Symbol id={it.symbol} showLabel /> : <span className="eye-text-label">{it.label}</span>}
                    {it.kind === 'action' ? <button type="button" className="eye-theme-specimen-action">{it.text}</button>
                      : it.kind === 'recommendation' ? <span className="eye-text-recommendation">{it.text}</span>
                      : it.kind === 'decision' ? <span className="eye-text-decision">{it.text}</span>
                      : <span>{it.text}</span>}
                  </li>
                ))}
              </ol>
            </div>
          ))}
        </div>
      ) : null}
      {local?.matrix !== undefined && local.matrix !== null ? (
        <p className="eye-text-label" data-testid="preview-matrix">
          PREVIEW computed in this browser ({local.matrix.rulesVersion}): {local.matrix.pairs} pairs, {local.matrix.failing.length} failing — the certification recomputes it on the server and decides.
        </p>
      ) : null}
    </section>
  );
}
