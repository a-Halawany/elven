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

await main();
