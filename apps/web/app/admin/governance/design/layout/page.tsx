'use client';
/**
 * CP-6 B81 §LY-G — THE LAYOUT CATALOGUE (F-P7-E-04: BP-01…05, DEN-01…03, REG-01…08, CMP-005…008, UX-14/UX-19; the layout walk's surface,
 * e2e/phase6-b81-layout.demo.spec.ts). The layout primitives, a composition of the seven regions, the three densities and the compact
 * navigation, rendered from SYNTHETIC fixtures. ONE server call exists here: the density switch reads and saves the signed-in person's OWN
 * preference (shell.preferences.read / .save — PLATFORM scope); everything else is a fixture and says so. Nothing here is a record, a
 * receipt of a business act or an approval.
 *
 * THREE CLAIMS: this page and its walk are CONSTRUCTION evidence; the act on eye_demo is the DEMONSTRATED OPERATION (SYNTHETIC personas);
 * real acceptance (UX-14-006, UX-19-006) is H3 through B111's recording path — not claimed.
 */
import { useState } from 'react';
import { Cluster, Composition, Container, DensitySwitch, Grid, GridItem, PreferencesScope, RailToggle, Region, Stack, BottomNavigation, usePreferences } from '../../../../../components/layout';
import { BREAKPOINTS, DENSITIES, breakpointOf, densityOf } from '../../../../../lib/layout-b81';
import type { NavItem, WorkspaceSpec } from '../../../../../lib/b80-seams';

const SELECTION = { label: 'Bab el-Mandeb corridor reroute (SYNTHETIC)', version: 2 };
const SPECIMEN_NAV: NavItem[] = ['Overview', 'Sources', 'Evidence', 'Quarantine', 'Health', 'Replay', 'Exports', 'Settings']
  .map((label, i) => ({ href: `/admin/governance/design/layout/specimen-${i}`, label: `${label} (specimen)`, glyph: '◆' }));
const SPECIMEN_SPEC: WorkspaceSpec = { key: 'admin', title: 'Specimen', navName: 'Specimen places', homeHref: SPECIMEN_NAV[0]!.href, scope: 'PLATFORM', nav: SPECIMEN_NAV };

function InForce() {
  const p = usePreferences();
  const cls = p?.cls ?? null;
  return (
    <section aria-labelledby="lyg-in-force" className="eye-panel">
      <h2 id="lyg-in-force">In force for you</h2>
      <p role="status" className="eye-shell-meta">
        {cls === null ? 'measuring this window…' : `This window is ${breakpointOf(cls).name.toLowerCase()} (${cls}): ${breakpointOf(cls).clause}.`}
        {p !== null && ` Density in force: ${densityOf(p.density.density).name.toLowerCase()} (${p.density.note}).`}
      </p>
      <Cluster gap={16} align="baseline" label="Your layout preferences">
        <DensitySwitch />
        <RailToggle />
      </Cluster>
    </section>
  );
}

function SpecimenButton({ label, consequential }: { label: string; consequential?: boolean }) {
  const [said, setSaid] = useState(false);
  return (
    <span>
      <button type="button" className={consequential === true ? 'eye-button eye-button--lg' : 'eye-button eye-button--secondary'} onClick={() => setSaid(true)}>{label}</button>
      {said && <span className="eye-shell-meta"> specimen — nothing happens</span>}
    </span>
  );
}

function DensitySpecimen({ d }: { d: (typeof DENSITIES)[number] }) {
  return (
    <Container width="full" density={d.key} label={`${d.name} density specimen`}>
      <Stack gap={8}>
        <h3>{`${d.name} (${d.key}) — ${d.controlPx} px controls, ${d.rowPx[0]}–${d.rowPx[1]} px rows; ${d.contexts}`}</h3>
        <Cluster gap={8}>
          <SpecimenButton label={`Filter (${d.name.toLowerCase()})`} />
          <SpecimenButton label={`Approve specimen (consequential — 44 px at every density)`} consequential />
        </Cluster>
        <label className="eye-label" htmlFor={`lyg-input-${d.key}`}>Corridor (specimen)</label>
        <input id={`lyg-input-${d.key}`} className="eye-input" defaultValue="Red Sea (SYNTHETIC)" />
        <table className="eye-table">
          <caption>{`Specimen rows at ${d.name.toLowerCase()} density (SYNTHETIC)`}</caption>
          <thead><tr><th scope="col">Corridor</th><th scope="col">Transits</th><th scope="col">State</th></tr></thead>
          <tbody>
            {[['Bab el-Mandeb', '14', 'stale'], ['Suez', '41', 'current'], ['Cape of Good Hope', '27', 'current']].map(([c, n, s]) => (
              <tr key={c}><td data-label="Corridor">{`${c} (SYNTHETIC)`}</td><td data-label="Transits">{n}</td><td data-label="State">{s}</td></tr>
            ))}
          </tbody>
        </table>
      </Stack>
    </Container>
  );
}

export default function LayoutCataloguePage() {
  return (
    <PreferencesScope scope={null} roles={[]}>
      <h1 className="eye-src-h1">Layout, density and regions</h1>
      <p className="eye-cat-claim">
        The layout primitives, a composition of the seven regions, the three densities and the compact navigation, from SYNTHETIC fixtures.
        The density switch reads and saves your own preference (it changes how things are shown, never what they mean or who may act); every
        other control here is a specimen and says so. Construction evidence — not demonstrated operation, not acceptance.
      </p>
      <InForce />

      <section aria-labelledby="lyg-bp">
        <h2 id="lyg-bp">The breakpoints</h2>
        <table className="eye-table">
          <caption>BP-01…05: the layout classes (a composition lays out in its effective width — the viewport over the zoom)</caption>
          <thead><tr><th scope="col">Class</th><th scope="col">Width</th><th scope="col">Columns</th><th scope="col">Navigation</th><th scope="col">Clause</th></tr></thead>
          <tbody>
            {BREAKPOINTS.map((b) => (
              <tr key={b.key}>
                <td data-label="Class">{`${b.key} ${b.name}`}</td><td data-label="Width">{b.max === null ? `${b.min} px and wider` : `${b.min}–${b.max} px`}</td>
                <td data-label="Columns">{b.columns}</td><td data-label="Navigation">{b.navigation}</td><td data-label="Clause">{b.clause}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section aria-labelledby="lyg-comp">
        <h2 id="lyg-comp">A composition of the seven regions</h2>
        <Composition label="Specimen composition: the corridor reroute package (SYNTHETIC)" selection={SELECTION} consequentialGate composition="admin.design.layout"
          regions={{
            context: <p>Context (specimen): NORDWERK ANTRIEBSTECHNIK GmbH (SYNTHETIC) · Supply Corridor Intelligence · scenario “Bab el-Mandeb closure” · live</p>,
            status: <p>Status (specimen): Accepted by the server — in progress, not complete</p>,
            authority: <p>Authority (specimen): eligible approver S. Okafor (SYNTHETIC); one approver recused; nothing is approved on this page</p>,
            primary: (
              <Stack gap={8}>
                <h3>Primary task (specimen): review the corridor reroute</h3>
                <p>Reroute the Regensburg line&apos;s inbound shipments via the Cape of Good Hope while Bab el-Mandeb is closed (SYNTHETIC).</p>
              </Stack>
            ),
            action: <Cluster gap={8}><SpecimenButton label="Open the review (specimen)" consequential /><SpecimenButton label="Compare versions (specimen)" /></Cluster>,
            evidence: <p>Evidence (specimen): AIS positions, Red Sea — 14 transits in 5 days (SYNTHETIC); stale by the clock</p>,
            inspector: <p>{`Inspector (specimen): ${SELECTION.label} · version ${SELECTION.version} · proposed`}</p>,
          }} />
      </section>

      <section aria-labelledby="lyg-den">
        <h2 id="lyg-den">The densities</h2>
        <Stack gap={24}>{DENSITIES.map((d) => <DensitySpecimen key={d.key} d={d} />)}</Stack>
      </section>

      <section aria-labelledby="lyg-prim">
        <h2 id="lyg-prim">The primitives</h2>
        <Grid label="Specimen grid: 12 columns from 960 px, one below">
          <GridItem span={8}><Region region="primary" label="Specimen primary (span 8)"><p>Primary (span 8 of 12)</p></Region></GridItem>
          <GridItem span={4}><Region region="evidence" label="Specimen evidence (span 4)"><p>Evidence (span 4 of 12)</p></Region></GridItem>
          <GridItem span={12}><Cluster gap={8} label="Specimen cluster">{['Red Sea', 'Suez', 'Malacca', 'Panama', 'Bosporus'].map((c) => <span key={c} className="eye-shell-meta">{`${c} (SYNTHETIC)`}</span>)}</Cluster></GridItem>
        </Grid>
      </section>

      <section aria-labelledby="lyg-nav">
        <h2 id="lyg-nav">The compact navigation (below 640 px)</h2>
        <p className="eye-shell-meta">A specimen in the page: the current place is always visible; the rest is under More. In the shell it replaces the rail on compact screens.</p>
        <BottomNavigation specimen spec={SPECIMEN_SPEC} nav={SPECIMEN_NAV} pathname={SPECIMEN_NAV[6]!.href} />
      </section>
    </PreferencesScope>
  );
}
