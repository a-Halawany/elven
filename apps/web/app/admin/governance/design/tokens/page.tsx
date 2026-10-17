'use client';
/**
 * DESIGN TOKENS — inspection (CP-6 B80 §TK; F-P7-E-03: UX-17-001…004, UX-18-001/-002, UX-20-001…003, REL-16, TYP-*, SPC-*, LAY-*). What a
 * token MEANS, its light and dark values, whether a customer theme may map it (the accent and the surface tints) or never (every semantic and
 * status token), the NON-COLOUR CUE that carries its meaning where colour cannot, its contrast on every surface and the surfaces it is
 * permitted on; the certified named themes and the core matrix in every mode; the type scale with its roles (tabular numerals for the numeric
 * tokens); the spacing, size, radius, elevation and motion scales; the symbol registry with its legend and glyph digests. Read-only: computed
 * in this browser from @eye/tokens (the same package the sheet is generated from) — the certification of a CUSTOMER theme is the server's.
 * Fonts are the fallback stacks (TYP-001/002: the vendored fonts are B81's, pending the owner's licence decision).
 */
import { COLOR_TOKENS, CONTRAST_RULES_VERSION, ELEVATION_TOKENS, FONT_FAMILIES, MOTION_TOKENS, NAMED_THEMES, RADIUS_TOKENS, SIZE_TOKENS, SPACE_TOKENS, SYMBOLS, SYMBOLS_VERSION, TYPE_TOKENS,
  certifyTheme, previewCss, typeClass } from '@eye/tokens';
import { Legend, Symbol } from '../../../../../components/symbols';
import { Digest, NumberValue, Statement } from '../../../../../components/text';
import { inspectColours } from '../../../../../lib/tokens-b80';

const swatch = (token: string) => `eye-tk-swatch eye-swatch-${token.replace(/\./g, '-')}`;

export default function DesignTokensPage() {
  const rows = inspectColours();
  const core = certifyTheme(null).matrix!;
  return (
    <div className="eye-tk-page">
      <h1 className="eye-type-heading-1">Design tokens</h1>
      <p className="eye-tk-muted">Semantic tokens only (UX-ADR-010): product code consumes these names; themes and brands map the accent and the surface tints and can never redefine meaning. <a href="/admin/governance/design/themes">Customer themes</a>.</p>
      <style>{previewCss(null, 'core-swatch')}</style>

      <section className="eye-tk-card" aria-labelledby="tk-themes">
        <h2 id="tk-themes" className="eye-type-heading-2">Certified themes (REL-16)</h2>
        <p>The core matrix ({CONTRAST_RULES_VERSION}): {core.pairs} pairs, {core.failing.length} failing — text 4.5:1, non-text 3:1, the accent distinct from every status (ΔE ≥ 25 and under colour-vision simulation).</p>
        <ul>{core.modes.map((m) => <li key={m.mode}>{m.mode}: {m.pairs} pairs, {m.failing} failing, lowest text contrast {m.minText.toFixed(2)}:1</li>)}</ul>
        <ul>{NAMED_THEMES.map((t) => <li key={t.key}><strong>{t.key}</strong> — {t.title}</li>)}</ul>
      </section>

      <section className="eye-tk-card" aria-labelledby="tk-colour">
        <h2 id="tk-colour" className="eye-type-heading-2">Colour, contrast and semantic status (UX-17)</h2>
        <div className="eye-tk-scroll" role="region" aria-label="Colour tokens" tabIndex={0}>
          <table className="eye-table">
            <caption>Every colour token: meaning, values, mapping, non-colour cue, and the surfaces it is permitted on (core theme)</caption>
            <thead><tr><th>Token</th><th>Meaning</th><th>Light</th><th>Dark</th><th>Customer theme</th><th>Non-colour cue</th><th>Permitted on</th></tr></thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.token}>
                  <td data-label="Token"><code>{r.token}</code> <span className="eye-tk-muted">{r.id}</span></td>
                  <td data-label="Meaning">{r.role}</td>
                  <td data-label="Light"><span data-eye-preview="core-swatch" data-eye-mode="light" className="eye-tk-swatch-pair"><span className={swatch(r.token)} aria-hidden="true" /></span> <code>{r.light}</code></td>
                  <td data-label="Dark"><span data-eye-preview="core-swatch" data-eye-mode="dark" className="eye-tk-swatch-pair"><span className={swatch(r.token)} aria-hidden="true" /></span> <code>{r.dark}</code></td>
                  <td data-label="Customer theme">{r.mappable ? 'mappable (brand expression)' : 'never mappable'}</td>
                  <td data-label="Non-colour cue">{r.cue ?? '—'}</td>
                  <td data-label="Permitted on">{r.contrast.length === 0 ? '—' : r.contrast.filter((c) => c.permitted).map((c) => `${c.mode} ${c.surface.replace('color.', '')} ${c.ratio.toFixed(2)}:1`).join(' · ')}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="eye-tk-card" aria-labelledby="tk-type">
        <h2 id="tk-type" className="eye-type-heading-2">Typography and numbers (UX-18)</h2>
        <p className="eye-tk-muted">Interface: {FONT_FAMILIES.ui} · mono: {FONT_FAMILIES.mono} — fallback stacks (no font file is loaded).</p>
        <ul>
          {TYPE_TOKENS.map((t) => (
            <li key={t.token}><span className={typeClass(t.token)}>{t.token} — {t.size}/{t.line} {t.weight}{'tabular' in t ? ' · tabular 0123456789' : ''}</span> <span className="eye-tk-muted">{t.id}</span></li>
          ))}
        </ul>
        <p>Number with its unit: <NumberValue value={1234567.891} unit="t" fractionDigits={1} /> · an infinite value: <NumberValue value={Infinity} /> · a digest: <Digest value={'0'.repeat(8) + 'b80tk'.repeat(10) + 'f'.repeat(6)} /></p>
        <Statement role="fact">A fact is set in the body role.</Statement>
        <Statement role="recommendation">A recommendation is advisory — never set as a fact or an approval.</Statement>
        <Statement role="decision" actor="a named authority (SYNTHETIC)">A decision names its actor.</Statement>
      </section>

      <section className="eye-tk-card" aria-labelledby="tk-scale">
        <h2 id="tk-scale" className="eye-type-heading-2">Space, size, radius, elevation, motion</h2>
        <ul>
          <li>Space: {SPACE_TOKENS.map((v) => `${v}px`).join(' · ')}</li>
          <li>Control size: {Object.entries(SIZE_TOKENS).map(([k, v]) => `${k} ${v}px`).join(' · ')} — a consequential control is control.lg</li>
          <li>Radius: {Object.entries(RADIUS_TOKENS).map(([k, v]) => `${k} ${v}px`).join(' · ')}</li>
          <li>Elevation: {Object.keys(ELEVATION_TOKENS).map((k) => `elevation.${k}`).join(' · ')} — raised surface, overlay, blocking dialog</li>
          <li>Motion: {Object.entries(MOTION_TOKENS).map(([k, v]) => `${k} ${v}ms`).join(' · ')} — instant for a consequential state change</li>
        </ul>
      </section>

      <section className="eye-tk-card" aria-labelledby="tk-symbols">
        <h2 id="tk-symbols" className="eye-type-heading-2">Symbols (UX-20) — registry {SYMBOLS_VERSION}</h2>
        <Legend items={SYMBOLS.map((s) => s.key)} title="Every certified symbol" />
        <div className="eye-tk-scroll" role="region" aria-label="Symbol registry" tabIndex={0}>
          <table className="eye-table">
            <caption>Each symbol: its id, glyph, label, meaning, token and glyph digest</caption>
            <thead><tr><th>Id</th><th>Glyph</th><th>Meaning</th><th>Token</th><th>Glyph digest</th></tr></thead>
            <tbody>
              {SYMBOLS.map((s) => (
                <tr key={s.id}>
                  <td data-label="Id">{s.id}</td>
                  <td data-label="Glyph"><Symbol id={s.key} text={s.label} showLabel /></td>
                  <td data-label="Meaning">{s.meaning}</td>
                  <td data-label="Token"><code>{s.token}</code></td>
                  <td data-label="Glyph digest"><Digest value={s.glyphDigest} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="eye-tk-muted">{COLOR_TOKENS.length} colour tokens · {TYPE_TOKENS.length} type tokens · {SYMBOLS.length} symbols.</p>
      </section>
    </div>
  );
}
