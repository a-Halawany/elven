'use client';
/**
 * CP-6 B81 §RE — the catalogue's fixtures for B80's residues: EVERY STATE OF THE OPERATING CONTEXT BAR (CMP-010 — its fixture prop,
 * components/context-bar.tsx), the governed control HELD by a frozen region (PR-05-005 / UX-09-005), TruthBadge on the symbol set
 * (UX-20-001), the Button's enforcement (UX-20-004 / LAY-003), the elevation uses (LAY-009…011), the Field's control slot (UX-ADR-011) and
 * FileIntake in upload mode (CMP-040). Every value is a SYNTHETIC fixture; nothing here calls a server (the bar reads its fixture; the
 * switch trigger is not offered — `may_set` is false in every fixture, the live switch is B80's walk); a fixture action says so. The walk
 * e2e/phase6-b81-re.demo.spec.ts reads these through the accessibility tree. Construction evidence only.
 */
import { useState } from 'react';
import { GlobalContextBar } from '../../../../../components/context-bar';
import { FreezeScope } from '../../../../../components/shell';
import { GovernedButton } from '../../../../../components/observation';
import { TruthBadge } from '../../../../../components/ui';
import { Button } from '../../../../../components/actions';
import { Field, FileIntake } from '../../../../../components/forms';
import { Panel, Surface } from '../../../../../components/layers';
import { BAR_STATES, FIXTURE_DOMAIN as D, FIXTURE_ME as ME, FIXTURE_TENANT as T } from '../../../../../lib/catalogue-re-b81';

function BarStates() {
  return (
    <Panel title="Operating context bar — every state (CMP-010)">
      <p className="eye-dt-counts">Each bar reads a SYNTHETIC fixture (no server). Its state is the bar&apos;s own words, symbol and data-state — never colour alone.</p>
      {BAR_STATES.map((s) => (
        <section key={s.key} aria-label={`Context bar fixture: ${s.key}`} data-expect={s.expect} className="eye-re-bar-fixture">
          <h3 className="eye-text-label">{s.title}</h3>
          <GlobalContextBar workspace={s.workspace} me={ME} scope={s.workspace === 'admin' ? null : { tenantId: T, domainId: D }} fixture={s.fixture}
            {...(s.effectiveTime === undefined ? {} : { effectiveTime: s.effectiveTime })} />
        </section>
      ))}
    </Panel>
  );
}

function ControlFixtures() {
  const [last, setLast] = useState('none');
  const [note, setNote] = useState('');
  const [kind, setKind] = useState('pdf');
  const [intake, setIntake] = useState<string | null>(null);
  return (
    <Panel title="Governed controls, truth glyphs, the Button's enforcement, elevation (B80's residues)">
      <section aria-label="Held by a frozen region">
        <FreezeScope statement="this fixture region is frozen (SYNTHETIC) — the shell could not verify the session">
          <GovernedButton label="Approve the fixture package" pendingLabel="Approving" onRun={async () => { setLast('ran (must never happen while held)'); }} />
        </FreezeScope>
        <p className="eye-help">Last fixture activation: {last}</p>
      </section>
      <section aria-label="Truth states on the symbol set">
        {['observed', 'asserted', 'extracted', 'inferred', 'assessed', 'synthetic', 'decided', 'disputed', 'withdrawn', 'rumoured'].map((s) => <TruthBadge key={s} state={s} />)}
      </section>
      <section aria-label="The Button's enforcement">
        <Button label="✕" consequence="C1" onClick={() => setLast('C1 icon-only control ran (admitted)')} />{' '}
        <Button label="✕" consequence="C3" onClick={() => setLast('C3 icon-only control ran (must never happen)')} />{' '}
        <Button label="Withdraw the fixture warning" consequence="C3" variant="critical" onClick={() => setLast('C3 labelled control ran (SYNTHETIC — no server called)')} />
      </section>
      <section aria-label="Elevation uses" className="eye-bulk-grid">
        <Surface level="base" label="Elevation none (base)"><strong>base</strong> · no shadow</Surface>
        <Surface level="raised" label="Elevation raised (LAY-009)"><strong>raised</strong> · elevation.1</Surface>
        <Surface level="overlay" label="Elevation overlay (LAY-010)"><strong>overlay</strong> · elevation.2</Surface>
      </section>
      <section aria-label="Field: input and control slot">
        <Field id="re-fx-note" label="Fixture note" value={note} onChange={setNote} help="the library's own input" />
        <Field id="re-fx-kind" label="Fixture kind" help="a page's own native select in the library's frame (the control slot)">
          {(id, aria) => <select id={id} className="eye-input" value={kind} onChange={(e) => setKind(e.target.value)} {...aria}><option value="pdf">PDF</option><option value="csv">CSV</option></select>}
        </Field>
      </section>
      <section aria-label="File intake in upload mode">
        <FileIntake id="re-fx-upload" label="Fixture evidence files" mode="upload" onFiles={(a, r) => setIntake(`${a.length} accepted · ${r.length} refused — nothing was sent (SYNTHETIC)`)} />
        {intake !== null && <p role="status" className="eye-dt-counts">{intake}</p>}
      </section>
    </Panel>
  );
}

/** The library names this section renders (added to the catalogue's RENDERED set). */
export const RE_RENDERED = ['GlobalContextBar', 'Button', 'Field', 'FileIntake'] as const;

/** §RE's section of the catalogue. */
export function ReCatalogue() {
  return (
    <section aria-labelledby="catalogue-re" className="eye-cat-root">
      <h2 id="catalogue-re" className="eye-panel-title">The context bar&apos;s states and B80&apos;s residues (B81 §RE)</h2>
      <BarStates />
      <ControlFixtures />
    </section>
  );
}
