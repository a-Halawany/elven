/**
 * The scheduled-collection status of every LIVE source on the demonstration deployment,
 * read from the readiness register through the governed route as the collection
 * manager: the configured schedule entry, the runtime (scheduler flag, worker, Redis
 * scheduler and next fire), and the observed automatic attempts — kept apart, as the
 * register keeps them. Reads only; nothing here schedules, runs or changes anything.
 */
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadLocalEnv } from '../local-env.mjs';
import { call, login, adminSession, demoScope, as } from '../phase4/governed.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const env = loadLocalEnv(ROOT);
const admin = await adminSession(env);
const scope = await demoScope(admin);
const dvorak = await login('m.dvorak', env.EYE_TEST_ADMIN_PASSWORD);
if (dvorak === null) { console.error('operator authentication failed'); process.exit(1); }
const O = `/v1/tenants/${scope.tenantId}/domains/${scope.domainId}/observation`;
const r = await call(`${O}/sources/readiness`, as(dvorak, scope, { action: 'observation.read.sources', objectType: 'SRC', sideEffect: 'none' }), { limit: 100 }, dvorak.token);
const rows = (r.body.sources ?? []).filter((s) => s.lifecycle_state === 'active' && s.acquisition_mode === 'live');
const fmt = (t) => (t ? String(t).slice(0, 19) + 'Z' : '—');
console.log(`\n=== scheduled collection · ${new Date().toISOString()} · ${rows.length} live source(s) ===\n`);
for (const s of rows) {
  const a = s.readiness.automatic;
  console.log(`${s.source_key}@v${s.contract_version} — ${s.readiness.verdict.toUpperCase()}`);
  console.log(`  schedule entry : ${a.schedule_entry ? `${a.schedule_entry.status}, every ${a.schedule_entry.cadence_seconds} s` : 'none'}`);
  console.log(`  runtime        : scheduler ${a.runtime.scheduler_enabled ? 'ENABLED' : 'disabled'} · worker ${a.runtime.worker_running ? 'RUNNING here' : 'not running here'} · redis scheduler ${a.runtime.redis_scheduler.present ? `present, every ${a.runtime.redis_scheduler.every_seconds} s, next fire ${fmt(a.runtime.redis_scheduler.next_at)}` : 'absent'}`);
  console.log(`  automatic runs : ${a.attempts.finished} finished · ${a.attempts.failed} failed · ${a.attempts.cancelled} cancelled · ${a.attempts.budget_exceeded} budget · ${a.attempts.refused} refused`);
  console.log(`  last attempt   : ${a.last_attempt ? `${a.last_attempt.outcome.toUpperCase()} at ${fmt(a.last_attempt.finished_at)} · job ${a.last_attempt.job_id.replace(/[0-9a-f-]{36}/g, '<id>')} · run ${a.last_attempt.run_id ? a.last_attempt.run_id.slice(0, 8) + '…' : 'none'} · ${a.last_attempt.admitted} admitted · ${a.last_attempt.noop} unchanged${a.last_attempt.reason ? ` · ${a.last_attempt.reason}` : ''}` : 'none observed'}`);
  console.log(`  last governed  : ${s.readiness.last_run ? `${s.readiness.last_run.mode} ${s.readiness.last_run.state} at ${fmt(s.readiness.last_run.finished_at)} · ${s.readiness.last_run.admitted} admitted` : 'none'} · evidence ${s.readiness.evidence_objects}\n`);
}
