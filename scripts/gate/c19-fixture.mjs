#!/usr/bin/env node
/**
 * C19 — RESOLVE A USABLE DELIVERY-CHAIN FIXTURE.
 *
 * The harness needs a real, already-completed publication to exercise against: a successful `ci`
 * push run, the `C17 finalize` run that finalized it, and the artifact that finalizer produced.
 *
 * ── WHY THIS READS ATTEMPTS, NOT THE RUN'S CURRENT CONCLUSION ──
 *
 * A GitHub re-run MUTATES the run in place. Attempt 1 may have succeeded and attempt 2 failed, and
 * the run then reports `failure` — the successful attempt still exists, but a `select(.conclusion
 * == "success")` filter can no longer see it.
 *
 * That is not hypothetical. Re-running main's CI to demonstrate an unrelated CVE turned a
 * `success` into a `failure` and made main's own tip unusable as a fixture, even though attempt 1
 * remained intact and retrievable. A resolver that reads only the current conclusion is therefore
 * fragile against ordinary maintenance, and worse, it silently reports "no fixture" when a
 * perfectly good one exists.
 *
 * So each candidate run is examined ATTEMPT BY ATTEMPT, and the earliest successful attempt is what
 * the fixture binds. History is what happened, not what the latest re-run says happened.
 */
import { spawnSync } from 'node:child_process';
import { realpathSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

/** Importable by controls: the resolver body runs only when this file IS the program. */
const invokedDirectly = (() => {
  const a = process.argv[1];
  if (typeof a !== 'string' || a === '') return false;
  try { return realpathSync(a) === realpathSync(fileURLToPath(import.meta.url)); } catch { return false; }
})();

const die = (m) => { process.stderr.write(`C19 fixture: ${m}\n`); process.exit(1); };
const arg = (f) => { const i = process.argv.indexOf(f); return i >= 0 ? process.argv[i + 1] : undefined; };
const repo = invokedDirectly ? (arg('--repo') ?? die('--repo is required')) : null;

const gh = (path) => {
  const r = spawnSync('gh', ['api', path], { encoding: 'utf8', maxBuffer: 128 * 1024 * 1024 });
  if (r.status !== 0) return null;
  try { return JSON.parse(r.stdout ?? ''); } catch { return null; }
};

/** The earliest attempt of `run` that concluded successfully, or null. */
export function successfulAttempt(run, fetchAttempt) {
  const total = Number(run.run_attempt ?? 1);
  for (let n = 1; n <= total; n += 1) {
    const a = fetchAttempt(run.id, n);
    if (a !== null && a.conclusion === 'success') return n;
  }
  return null;
}

if (!invokedDirectly) {
  // Imported by a control: expose `successfulAttempt` and run nothing.
} else {
const runs = gh(`repos/${repo}/actions/runs?branch=main&per_page=100`);
if (runs === null) die('the run listing could not be fetched');

// Newest first, so the fixture tracks main rather than drifting to ancient history.
const finalizers = (runs.workflow_runs ?? []).filter((r) => r.name === 'C17 finalize');
for (const fin of finalizers) {
  const finAttempt = successfulAttempt(fin, (id, n) => gh(`repos/${repo}/actions/runs/${id}/attempts/${n}`));
  if (finAttempt === null) continue;

  const sha = fin.head_sha;
  const forSha = gh(`repos/${repo}/actions/runs?head_sha=${sha}&per_page=100`);
  if (forSha === null) continue;
  const source = (forSha.workflow_runs ?? []).find((r) => r.name === 'ci' && r.event === 'push');
  if (source === undefined) continue;
  const srcAttempt = successfulAttempt(source, (id, n) => gh(`repos/${repo}/actions/runs/${id}/attempts/${n}`));
  if (srcAttempt === null) continue;

  // The finalizer must have artifacts left to acquire, or it is not a usable fixture.
  const arts = gh(`repos/${repo}/actions/runs/${fin.id}/artifacts`);
  const usable = (arts?.artifacts ?? []).filter((a) => a.expired === false
    && String(a.name).startsWith('c17-evidence-finalized-'));
  if (usable.length !== 1) continue;

  const finFull = gh(`repos/${repo}/actions/runs/${fin.id}/attempts/${finAttempt}`) ?? fin;
  for (const line of [
    'found=true',
    `sha=${sha}`,
    `finalizer_run=${fin.id}`,
    `finalizer_attempt=${finAttempt}`,
    `finalizer_completed_at=${finFull.updated_at ?? fin.updated_at}`,
    `source_run=${source.id}`,
    `source_attempt=${srcAttempt}`,
    `source_event=${source.event}`,
  ]) process.stdout.write(`${line}\n`);
  process.stderr.write(`C19 fixture: ${sha.slice(0, 8)} — ci run ${source.id} attempt ${srcAttempt}, `
    + `finalizer ${fin.id} attempt ${finAttempt}\n`);
  process.exit(0);
}

// No usable fixture is a REPORTED ABSENCE, never a pass. The harness must say the plumbing was
// unexercised rather than green.
process.stdout.write('found=false\n');
process.stderr.write('C19 fixture: no main commit has both a successful ci attempt and a successful '
  + 'finalizer attempt with an unexpired artifact; the delivery chain is UNEXERCISED, not passing\n');
}
