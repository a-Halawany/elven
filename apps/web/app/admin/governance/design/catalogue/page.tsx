'use client';
/**
 * CP-6 B80 — THE COMPONENT CATALOGUE (F-P7-E-05; UX-ADR-011/-012; the catalogue walk's fixture surface): every component of the shared
 * library (apps/web/components/*.tsx — B107's design inventory reads exactly those files) rendered in its states from SYNTHETIC fixtures. The
 * page calls no server: nothing on it is a record, a receipt or an approval, and a fixture action says so in its own words. Each part of B80
 * contributes its section in its own marked block; a component whose part has not been folded in yet is listed by the LIBRARY contract
 * (lib/b80-seams.ts) as "not in this build" — never as present.
 *
 * THREE CLAIMS: this page and its walk are CONSTRUCTION evidence (the components render their contracts); the act on eye_demo is the
 * DEMONSTRATED OPERATION (SYNTHETIC personas); real design acceptance by named authorities is H3 through B111's recording path — not claimed.
 */
import { LIBRARY } from '../../../../../lib/b80-seams';
/* B80 cld */
import { CldCatalogue } from './cld-fixtures';
/* end B80 cld */

/** The library exports each folded part renders here (a part adds its names with its section). */
const RENDERED = new Set<string>([
  /* B80 cld */ ...LIBRARY.data.exports, ...LIBRARY.layers.exports, /* end B80 cld */
]);

export default function CataloguePage() {
  const all = Object.entries(LIBRARY).flatMap(([group, g]) => g.exports.map((name) => ({ group, part: g.part, file: g.files.join(', '), name })));
  const missing = all.filter((c) => !RENDERED.has(c.name));
  return (
    <>
      <h1 className="eye-src-h1">Component catalogue</h1>
      <p className="eye-cat-claim">
        Every component of the shared library in its states, from SYNTHETIC fixtures. Nothing here is a record, a receipt or an approval; this page
        calls no server. Rendering here is construction evidence — not demonstrated operation, not acceptance.
      </p>
      <p role="status" className="eye-dt-counts">{all.length - missing.length} of {all.length} library components rendered in this build</p>
      {missing.length > 0 && (
        <details className="eye-disclosure">
          <summary><span className="eye-disclosure-title">Not in this build ({missing.length})</span><span className="eye-disclosure-meta">listed by the library contract, never shown as present</span></summary>
          <ul className="eye-cld-reasons">{missing.map((c) => <li key={c.name}>{c.name} — {c.file} ({c.part})</li>)}</ul>
        </details>
      )}
      {/* B80 cld */}
      <CldCatalogue />
      {/* end B80 cld */}
    </>
  );
}
