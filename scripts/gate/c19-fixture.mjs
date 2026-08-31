#!/usr/bin/env node
/**
 * C19 — CHOOSE A REAL PUBLICATION FOR THE NON-PUBLISHING HARNESS.
 *
 * This is a THIN CALLER of the shared GitHub and resolver layers. It previously carried its own
 * transport, its own attempt walker, its own run selector and its own artifact selector — with no
 * pagination and with API failures treated as absence. That is the exact duplication the redesign
 * removed everywhere else, and leaving it here meant the harness could still resolve differently
 * from production.
 */
import { realpathSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { createGitHub } from './lib/c19-github.mjs';
import { resolveCanonicalSource, resolveCanonicalFinalizer } from './lib/c19-resolve.mjs';

const invokedDirectly = (() => {
  const a = process.argv[1];
  if (typeof a !== 'string' || a === '') return false;
  try { return realpathSync(a) === realpathSync(fileURLToPath(import.meta.url)); } catch { return false; }
})();

/**
 * A publication whose WHOLE chain is intact.
 *
 * "Intact" is more than a canonical successful attempt. The C17 finalization verifier, which
 * acquisition runs, reads the source run's CURRENT state and refuses one that now reports failure —
 * so a run whose attempt 1 succeeded and which was later re-run to failure has intact history and
 * is still unusable downstream. Both questions are asked, because they are different questions.
 */
export function chooseFixture({ gh, limit = 40 }) {
  const seen = [];
  const mainRuns = gh.runsForBranch('main', limit);
  const finalizers = mainRuns.filter((r) => r.name === 'C17 finalize');
  for (const fin of finalizers) {
    const sha = fin.head_sha;
    if (seen.includes(sha)) continue;
    seen.push(sha);
    let source;
    let finalizer;
    try {
      source = resolveCanonicalSource({ gh, sha });
      finalizer = resolveCanonicalFinalizer({ gh, sha, sourceRunId: source.runId });
    } catch { continue; }                       // this commit is not usable; try the next
    // The C17 verifier reads current state, so the source run must currently be successful too.
    const sourceRun = gh.runsForSha(sha).find((r) => String(r.id) === String(source.runId));
    if (sourceRun?.conclusion !== 'success') continue;
    const arts = gh.artifacts(finalizer.runId)
      .filter((a) => a.expired === false
        && String(a.name).startsWith(`c17-evidence-finalized-a${finalizer.runAttempt}-`));
    if (arts.length !== 1) continue;
    return { found: true, sha, source, finalizer, artifact: arts[0] };
  }
  return { found: false };
}

if (invokedDirectly) {
  const arg = (f) => { const i = process.argv.indexOf(f); return i >= 0 ? process.argv[i + 1] : undefined; };
  const repo = arg('--repo');
  if (repo === undefined) { process.stderr.write('C19 fixture: --repo is required\n'); process.exit(1); }
  const gh = createGitHub({ repo });
  let r;
  try { r = chooseFixture({ gh }); } catch (e) {
    // An API failure is NOT "no fixture". Reporting it as absence would let the harness report a
    // green check for a chain it never exercised.
    process.stderr.write(`C19 fixture: resolution failed (${e.message})\n`);
    process.exit(1);
  }
  if (!r.found) {
    process.stdout.write('found=false\n');
    process.stderr.write('C19 fixture: no main commit has an intact chain with an unexpired '
      + 'artifact; the delivery chain is UNEXERCISED, not passing\n');
    process.exit(0);
  }
  for (const line of [
    'found=true',
    `sha=${r.sha}`,
    `source_run=${r.source.runId}`,
    `source_attempt=${r.source.runAttempt}`,
    `source_event=${r.source.event}`,
    `finalizer_run=${r.finalizer.runId}`,
    `finalizer_attempt=${r.finalizer.runAttempt}`,
    `finalizer_completed_at=${r.finalizer.completedAt ?? ''}`,
  ]) process.stdout.write(`${line}\n`);
  process.stderr.write(`C19 fixture: ${r.sha.slice(0, 8)} — ci ${r.source.runId}#${r.source.runAttempt}, `
    + `finalizer ${r.finalizer.runId}#${r.finalizer.runAttempt}\n`);
}
