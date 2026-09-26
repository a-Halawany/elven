/**
 * Build the SYNTHETIC corridor STREAM replay set — CP-6 B23 (0084), L1-I02's stream form.
 *
 * WHAT THIS IS. The demonstration deployment cannot inject an egress double and refuses loopback, and a replay contract
 * walks no live traversal, so the stream form of Acquire needs a replay set that declares PAGES. This script writes one:
 * `fixtures/phase1/replay/red-sea-corridor-stream/`, a Bab el-Mandeb (chokepoint4) daily-transit series for January 2024
 * in six five-day pages, with a `stream.partitions` block in its MANIFEST.json (the minimal extension the REST connector's
 * stream form reads — `ReplayManifest.stream` in apps/api/src/observation/connectors/replay.ts).
 *
 * WHAT IT IS HONEST ABOUT. EVERY ROW IS SYNTHETIC — `synthetic: true` and `data_provenance: 'synthetic-stream-fixture'` at
 * row level, `data_origin: 'synthetic'` on the contract (scripts/phase1/source-contracts.mjs, STREAM_SOURCE_CONTRACTS). The
 * values are a smooth deterministic curve near the depressed January-2024 level; they are NOT the IMF PortWatch figures and
 * must never be read as them. The endpoint host is `corridor-stream.synthetic.example` — a reserved name that resolves
 * nowhere: nothing here was, or can be, captured from a publisher.
 *
 * THE ONE PLANTED DEFECT, labelled: DEF-S1 — the third page (2024-01-11 … 2024-01-16) is declared a PUBLISHER GAP: the
 * publisher served no page for that window. A stream must report it as an explicit incomplete range and close
 * `closed_incomplete`, never `completed`.
 *
 * The WHOLE-MONTH snapshot (the contract's identity endpoint) is recorded too, so the COMMAND form (collect now) on the same
 * contract reads what it always read — one response framed into rows — and the gap days are simply absent from it.
 *
 * Deterministic: re-running writes byte-identical files and digests. Run: `node scripts/phase1/build-stream-fixtures.mjs`.
 *
 * CP-6 B28 (0088 §S, F-P4-11) adds a SECOND set, `red-sea-corridor-stream-late/` — the same corridor, February–March 2024, SYNTHETIC
 * and labelled the same way, whose pages ARRIVE LATE AND OUT OF ORDER so the event-time stream processor has something honest to be
 * judged on. Its planted defects, each labelled in the MANIFEST (`planted` on the page) and at row level (`planted` on the attributes):
 *   DEF-L1  OUT OF ORDER: the page 2024-02-11..16 arrives before 2024-02-06..11 (event time jumps ahead of arrival order);
 *   DEF-L2  LATE PAGE: 2024-02-06..11 arrives after its window fired — the window is revised and labelled late, never hidden;
 *   DEF-L3  PUBLISHER GAP: 2024-02-16..21 was not served — an explicit incomplete range; its window fires PARTIAL;
 *   DEF-L4  DUPLICATE ROW: the page 2024-02-26..03-01 carries 2024-02-13 again with the same value (a duplicate, no second output);
 *   DEF-L5  REVISED VALUE: the page 2024-03-01..06 carries 2024-02-23 with a different value (a late revision of a fired window);
 *   DEF-L6  BEYOND THE ALLOWANCE: the same page carries 2024-02-02, 26 days behind the watermark (stored, labelled, excluded — its window closed);
 *   DEF-L7  REDELIVERED PAGE: the first page is served again after its window fired (at-least-once: nothing admitted twice);
 *   and a last page (2024-03-06..11) the harness streams separately to show an offsets divergence.
 * The values are a CORRIDOR COLLAPSE the rule can see (transits below 30 a day in 2024-02-11..16 and 2024-02-26..03-01) — invented,
 * NOT PortWatch figures.
 */
import { createHash } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const SET = 'red-sea-corridor-stream';
const DIR = join(ROOT, 'fixtures', 'phase1', 'replay', SET);
export const STREAM_BASE = 'https://corridor-stream.synthetic.example/red-sea/chokepoint4';
const RETRIEVED_AT = '2026-09-25T00:00:00Z';

const addDays = (day, n) => { const d = new Date(`${day}T00:00:00Z`); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };

/** A smooth deterministic transit count near the depressed January-2024 level. Synthetic. */
function row(date, i) {
  const total = Math.round(38 + 4 * Math.sin((2 * Math.PI * i) / 7) + ((i * 7919) % 5) - 2);
  return {
    attributes: {
      portid: 'chokepoint4', portname: 'Bab el-Mandeb Strait', date,
      n_total: total, n_container: Math.round(total * 0.3), n_tanker: Math.round(total * 0.25),
      capacity: total * 38_000, synthetic: true, data_provenance: 'synthetic-stream-fixture',
    },
  };
}

const RANGE = { from: '2024-01-01', to: '2024-01-31' };
const PAGE_DAYS = 5;
const GAP_PAGE = 2; // DEF-S1

const body = (features) => Buffer.from(`${JSON.stringify({ features, exceededTransferLimit: false }, null, 2)}\n`, 'utf8');
const sha256 = (b) => createHash('sha256').update(b).digest('hex');

async function main() {
  await mkdir(DIR, { recursive: true });
  const entries = [];
  const pages = [];
  const all = [];
  let day = RANGE.from; let index = 0; let dayIndex = 0;
  while (day < RANGE.to) {
    const to = addDays(day, PAGE_DAYS) < RANGE.to ? addDays(day, PAGE_DAYS) : RANGE.to;
    const features = [];
    for (let d = day; d < to; d = addDays(d, 1)) { features.push(row(d, dayIndex)); dayIndex += 1; }
    if (index === GAP_PAGE) {
      pages.push({ from: day, to, gap: 'DEF-S1 (planted): the publisher served no page for this window — the stream must report an explicit incomplete range (publisher_gap)' });
    } else {
      all.push(...features);
      const file = `page-${day}_${to}.json`;
      const bytes = body(features);
      await writeFile(join(DIR, file), bytes);
      const url = `${STREAM_BASE}?from=${day}&to=${to}`;
      entries.push({ url, retrieved_at: RETRIEVED_AT, status: 200, retained_headers: { 'content-type': 'application/json; charset=utf-8' },
                     file, sha256: sha256(bytes), byte_length: bytes.byteLength, acquisition_mode: 'replay' });
      pages.push({ from: day, to, url });
    }
    day = to; index += 1;
  }
  // The whole-month snapshot the COMMAND form reads at the contract's identity endpoint (the gap days absent).
  const snapshot = body(all);
  await writeFile(join(DIR, 'snapshot.json'), snapshot);
  entries.unshift({ url: STREAM_BASE, retrieved_at: RETRIEVED_AT, status: 200, retained_headers: { 'content-type': 'application/json; charset=utf-8' },
                    file: 'snapshot.json', sha256: sha256(snapshot), byte_length: snapshot.byteLength, acquisition_mode: 'replay',
                    planted_defect: 'DEF-S1: the days of the gap page (2024-01-11 … 2024-01-15) are absent from the snapshot as they are from the stream' });
  const manifest = {
    set: SET,
    source_key: SET,
    captured_by: 'scripts/phase1/build-stream-fixtures.mjs',
    manifest_version: 'v1',
    note: 'SYNTHETIC replay set for the stream form of Acquire (CP-6 B23, L1-I02). Every row is synthetic (synthetic=true, data_provenance=synthetic-stream-fixture); the values are NOT IMF PortWatch figures. The host corridor-stream.synthetic.example resolves nowhere: nothing here was captured from a publisher. One planted defect: DEF-S1, a publisher gap on the third page.',
    entries,
    stream: {
      partitions: {
        chokepoint4: {
          label: 'Bab el-Mandeb Strait (chokepoint4) — daily transits, January 2024, SYNTHETIC, five-day pages',
          range: RANGE,
          pages,
        },
      },
    },
  };
  await writeFile(join(DIR, 'MANIFEST.json'), `${JSON.stringify(manifest, null, 2)}\n`);
  process.stdout.write(`wrote ${SET}: ${entries.length} entries, ${pages.length} pages (1 planted gap)\n`);
}

/* B28 (0088) streams: THE LATE / OUT-OF-ORDER SET (F-P4-11). */
const LATE_SET = 'red-sea-corridor-stream-late';
const LATE_DIR = join(ROOT, 'fixtures', 'phase1', 'replay', LATE_SET);
export const LATE_STREAM_BASE = 'https://corridor-stream-late.synthetic.example/red-sea/chokepoint4';
const LATE_RANGE = { from: '2024-02-01', to: '2024-03-11' };
/** A row with an explicit value (the collapse is written out, never computed from a curve). Synthetic, labelled. */
function lateRow(date, total, planted = null) {
  return {
    attributes: {
      portid: 'chokepoint4', portname: 'Bab el-Mandeb Strait', date,
      n_total: total, n_container: Math.round(total * 0.3), n_tanker: Math.round(total * 0.25),
      capacity: total * 38_000, synthetic: true, data_provenance: 'synthetic-stream-fixture',
      ...(planted === null ? {} : { planted }),
    },
  };
}
const daysFrom = (from, values) => values.map((v, i) => [addDays(from, i), v]);
/** The pages in ARRIVAL order (the manifest's order is the order the stream pulls them in). */
const LATE_PAGES = [
  { from: '2024-02-01', to: '2024-02-06', rows: daysFrom('2024-02-01', [38, 41, 39, 37, 40]) },
  { from: '2024-02-11', to: '2024-02-16', rows: daysFrom('2024-02-11', [24, 22, 26, 21, 25]),
    planted: 'DEF-L1 (planted): out of order — this page arrives before 2024-02-06..11' },
  { from: '2024-02-06', to: '2024-02-11', rows: daysFrom('2024-02-06', [31, 28, 27, 29, 33]),
    planted: 'DEF-L2 (planted): a late page — it arrives after the window 2024-02-06..11 fired' },
  { from: '2024-02-16', to: '2024-02-21', gap: 'DEF-L3 (planted): the publisher served no page for this window — the stream must report an explicit incomplete range (publisher_gap)' },
  { from: '2024-02-21', to: '2024-02-26', rows: daysFrom('2024-02-21', [36, 38, 35, 39, 37]) },
  { from: '2024-02-26', to: '2024-03-01', rows: [...daysFrom('2024-02-26', [25, 23, 27, 22]), ['2024-02-13', 26, 'DEF-L4 (planted): a duplicate of 2024-02-13 with the same value']],
    planted: 'DEF-L4 (planted): carries a duplicate row of 2024-02-13' },
  { from: '2024-03-01', to: '2024-03-06', rows: [...daysFrom('2024-03-01', [24, 34, 36, 38, 35]),
                                              ['2024-02-23', 28, 'DEF-L5 (planted): a revised value for 2024-02-23 (35 before)'],
                                              ['2024-02-02', 19, 'DEF-L6 (planted): 2024-02-02 arriving 26 days behind the watermark, beyond the allowance']],
    planted: 'DEF-L5 and DEF-L6 (planted): a revised value of a fired window and a row beyond the allowed lateness' },
  { from: '2024-02-01', to: '2024-02-06', rows: daysFrom('2024-02-01', [38, 41, 39, 37, 40]), redelivered: true,
    planted: 'DEF-L7 (planted): the first page served again after its window fired (at-least-once)' },
  { from: '2024-03-06', to: '2024-03-11', rows: daysFrom('2024-03-06', [37, 39, 36, 40, 38]),
    planted: 'the last page, streamed separately by the harness to show an offsets divergence' },
];

async function buildLate() {
  await mkdir(LATE_DIR, { recursive: true });
  const entries = [];
  const pages = [];
  for (const p of LATE_PAGES) {
    if (p.gap !== undefined) { pages.push({ from: p.from, to: p.to, gap: p.gap }); continue; }
    const url = `${LATE_STREAM_BASE}?from=${p.from}&to=${p.to}`;
    if (p.redelivered !== true) {
      const bytes = body(p.rows.map(([d, v, planted]) => lateRow(d, v, planted ?? null)));
      const file = `page-${p.from}_${p.to}.json`;
      await writeFile(join(LATE_DIR, file), bytes);
      entries.push({ url, retrieved_at: RETRIEVED_AT, status: 200, retained_headers: { 'content-type': 'application/json; charset=utf-8' },
                     file, sha256: sha256(bytes), byte_length: bytes.byteLength, acquisition_mode: 'replay', ...(p.planted === undefined ? {} : { planted_defect: p.planted }) });
    }
    pages.push({ from: p.from, to: p.to, url, ...(p.planted === undefined ? {} : { planted: p.planted }) });
  }
  // The contract's identity endpoint (the COMMAND form): every row the stream serves on time, once (the late rows are the stream's to show).
  const snapshot = body(LATE_PAGES.filter((p) => p.rows !== undefined && p.redelivered !== true)
    .flatMap((p) => p.rows.filter(([, , planted]) => planted === undefined)).sort(([a], [b]) => a.localeCompare(b)).map(([d, v]) => lateRow(d, v)));
  await writeFile(join(LATE_DIR, 'snapshot.json'), snapshot);
  entries.unshift({ url: LATE_STREAM_BASE, retrieved_at: RETRIEVED_AT, status: 200, retained_headers: { 'content-type': 'application/json; charset=utf-8' },
                    file: 'snapshot.json', sha256: sha256(snapshot), byte_length: snapshot.byteLength, acquisition_mode: 'replay',
                    planted_defect: 'DEF-L3: the days of the gap page (2024-02-16 … 2024-02-20) are absent from the snapshot as they are from the stream' });
  const manifest = {
    set: LATE_SET,
    source_key: LATE_SET,
    captured_by: 'scripts/phase1/build-stream-fixtures.mjs',
    manifest_version: 'v1',
    data_provenance: 'synthetic-stream-fixture',
    note: 'SYNTHETIC replay set for the event-time stream processor (CP-6 B28, F-P4-11): the Red Sea corridor feed whose pages arrive LATE and OUT OF ORDER. Every row is synthetic (synthetic=true, data_provenance=synthetic-stream-fixture); the values are NOT IMF PortWatch figures. The host corridor-stream-late.synthetic.example resolves nowhere: nothing here was captured from a publisher. Planted defects DEF-L1..DEF-L7, each labelled on its page and row.',
    entries,
    stream: {
      partitions: {
        chokepoint4: {
          label: 'Bab el-Mandeb Strait (chokepoint4) — daily transits, February–March 2024, SYNTHETIC, five-day pages arriving late and out of order',
          range: LATE_RANGE,
          pages,
        },
      },
    },
  };
  await writeFile(join(LATE_DIR, 'MANIFEST.json'), `${JSON.stringify(manifest, null, 2)}\n`);
  process.stdout.write(`wrote ${LATE_SET}: ${entries.length} entries, ${pages.length} pages (1 planted gap, 1 redelivery)\n`);
}
/* end B28 streams */

await main();
/* B28 (0088) streams */ await buildLate(); /* end B28 streams */
