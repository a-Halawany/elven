/**
 * GOVERNED DEGRADED-RECOVERY ENTRYPOINT (Gate-2.2 C9).
 *
 * The production caller that takes a degraded deployment back to healthy. It is a
 * deliberate, conspicuous operational act — the same shape as the bootstrap
 * entrypoint — because clearing degradation is what allows the system to be
 * presented as healthy again.
 *
 * It performs NO local shortcut: every open availability incident is reconciled
 * through the governed port under a recovery capability bound to that exact
 * incident (which writes its integrity evidence in the same transaction), and the
 * local degraded flag is cleared only by presenting that governed proof back to
 * the durable journal. If the ledger still shows an unreconciled incident, the
 * flag stays set and this exits non-zero.
 *
 * Exit codes:
 *   0 — nothing to reconcile, or reconciliation complete and the ledger agrees
 *   1 — reconciliation incomplete (still degraded) or a real failure
 *
 * Run: node dist/audit/reconcile-degraded.js "operator-name" "reason"
 */
import { loadConfig } from '../config/config.js';
import { createAppDb, createIdentityDb, createVerifierDb } from '../shared/db.js';
import { AuditService } from './audit.service.js';
import { degradedAudit } from '../shared/degraded-store.js';

async function main(): Promise<void> {
  const reconciledBy = process.argv[2];
  const note = process.argv[3];
  if (reconciledBy === undefined || reconciledBy.length < 2 || note === undefined || note.length < 2) {
    console.error(
      'reconcile-degraded: an operator name and a reason are required\n' +
      '  usage: node dist/audit/reconcile-degraded.js "<operator>" "<reason>"',
    );
    process.exit(1);
  }

  const cfg = loadConfig();
  const appDb = createAppDb(cfg);
  const verifierDb = createVerifierDb(cfg);
  const identityDb = createIdentityDb(cfg);
  const audit = new AuditService(appDb, verifierDb, identityDb);

  try {
    // Restore any degradation this deployment durably recorded, so recovery is
    // evaluated against the real state rather than an empty in-memory flag.
    const restored = degradedAudit.reloadFromJournal();
    const out = await audit.reconcileDegraded(reconciledBy, note);

    console.log('==============================================================');
    console.log('  THE EYE — GOVERNED DEGRADED RECOVERY');
    console.log(`  journal state on entry:  ${restored.degraded ? `degraded (${restored.unreconciled} unreconciled)` : 'not degraded'}`);
    console.log(`  incidents reconciled:    ${out.reconciled.length === 0 ? 'none' : out.reconciled.join(', ')}`);
    console.log(`  remaining unreconciled:  ${out.remainingUnreconciled}`);
    console.log(`  readiness after:         ${degradedAudit.state().degraded ? 'DEGRADED' : 'healthy'}`);
    console.log('==============================================================');

    const stillDegraded = degradedAudit.state().degraded || out.remainingUnreconciled > 0;
    await Promise.all([appDb.destroy(), verifierDb.destroy(), identityDb.destroy()]);
    process.exit(stillDegraded ? 1 : 0);
  } catch (e) {
    console.error('reconcile-degraded: FAILED —', e instanceof Error ? e.message : String(e));
    await Promise.all([appDb.destroy(), verifierDb.destroy(), identityDb.destroy()]).catch(() => undefined);
    process.exit(1);
  }
}

void main();
