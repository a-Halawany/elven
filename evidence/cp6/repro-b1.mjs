// Finding 1 reproduced on the ACTUAL function graph.propagations_to_reconcile(): an attempt stranded in
// 'received' or 'walking' (what a process interruption leaves behind once Redis is lost) is not reconciled.
// One superuser transaction, rolled back: nothing is left behind. Usage: node repro-b1.mjs <db>
import { createRequire } from 'node:module';
const pg = createRequire('/Users/halawany/work/personal/mohammed/new_project/apps/api/package.json')('pg');
const { loadLocalEnv } = await import('/Users/halawany/work/personal/mohammed/new_project/scripts/local-env.mjs');
loadLocalEnv('/Users/halawany/work/personal/mohammed/new_project');
const c = new pg.Client({ host: process.env.EYE_DB_HOST ?? 'localhost', port: Number(process.env.EYE_DB_PORT ?? 5432), database: process.argv[2], user: 'eye', password: process.env.EYE_DB_MIGRATE_PASSWORD });
await c.connect();
const q = async (t) => (await c.query(t)).rows;
try {
  await q('begin');
  await q("select observation.issue_schedule_capability('codex finding 1 reproduction', 60)");
  const fx = await q(`with a as (select * from graph.propagation_agents where status='active' limit 1),
    c as (select c.* from observation.correction_current c join a using (tenant_id, domain_id) where c.state='applied' and c.propagation_state<>'complete' order by c.received_at limit 1),
    o as (select x.id from objects.object_outbox x join c on x.tenant_id=c.tenant_id and x.domain_id=c.domain_id and (x.payload->>'case_id')=c.case_id::text and x.event_type='CorrectionApplied' order by x.created_at desc limit 1)
    select a.agent_id, a.principal_id, c.case_id, c.tenant_id, c.domain_id, o.id as event_id from a, c, o`);
  if (fx.length === 0) throw new Error('no outstanding applied case with a CorrectionApplied event in a served domain');
  const f = fx[0];
  const n = async (label) => { const r = await q(`select count(*)::int n from graph.propagations_to_reconcile() where event_id = '${f.event_id}'`); console.log(`${label}: reconciled=${r[0].n}`); return r[0].n; };
  // The existing attempt for this event (a failed one on this database) is set aside within the transaction by
  // pointing it at a throw-away event id; the ledger's append-only events are not touched.
  await q(`alter table graph.propagation_attempt_events drop constraint propagation_attempt_events_outbox_event_id_fkey`);
  await q(`update graph.propagation_attempts set event_id = gen_random_uuid() where event_id = '${f.event_id}'`);
  await n('no attempt (never delivered)');
  await q(`insert into graph.propagation_attempts (event_id, scope, tenant_id, domain_id, case_id, state, deliveries, attempts, agent_id, principal_id, roots, correlation_id)
    values ('${f.event_id}', 'DOMAIN', '${f.tenant_id}', '${f.domain_id}', '${f.case_id}', 'received', 1, 0, '${f.agent_id}', '${f.principal_id}', '[]'::jsonb, gen_random_uuid())`);
  await n("stranded in 'received' (interrupted after receipt)");
  await q(`update graph.propagation_attempts set state='walking', attempts=1 where event_id='${f.event_id}'`);
  await n("stranded in 'walking' (interrupted after a committed root)");
  await q(`update graph.propagation_attempts set state='failed', finished_at=clock_timestamp() where event_id='${f.event_id}'`);
  await n("'failed'");
} finally { await q('rollback').catch(() => undefined); await c.end(); }
