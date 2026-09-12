/**
 * The scheduler's capability (migrations 0038/0039) — the scenario file for
 * `observation.issue_schedule_capability` and the two ports that assert it. It lives
 * in the observation schema, outside the Phase 0 governed schemas C14 discovers, so
 * the post-C18 upgrade check (which re-runs the Phase 0 suite at 0021) is untouched;
 * this file is a phase suite and is excluded from that run by name. Mode `schedule`, class
 * `scheduler`, one action; granted to eye_commit and nothing else. What is proven:
 *
 *   wrong role      — eye_app cannot mint it (grant boundary);
 *   no capability   — eye_commit without the context is refused by both ports;
 *   wrong mode      — a schedule context cannot drive an observation BUSINESS port
 *                     (assert_authority binds to observation.* actions, not to this one);
 *   wrong target    — the attempt record refuses a missing scope;
 *   right capability — listing and recording work, and the listed set is exactly
 *                     the eligible entries (active + live + confirmed + agent);
 *   stale           — the context is transaction-local: gone after COMMIT.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { sql } from 'kysely';
import { appDb, commitDb, superDb, type AnyDb } from './helpers.js';

let commit: AnyDb; let app: AnyDb; let su: AnyDb;
const code = (e: unknown): string => String((e as { code?: string }).code ?? '');

beforeAll(() => { commit = commitDb(); app = appDb(); su = superDb(); });
afterAll(async () => { await Promise.all([commit, app, su].map((d) => d.destroy())); });

describe('observation.issue_schedule_capability and the scheduler ports', () => {
  it('wrong role: eye_app cannot mint the schedule capability', async () => {
    await expect(sql`select observation.issue_schedule_capability('probe', 60)`.execute(app)).rejects.toSatisfy((e) => code(e) === '42501');
  });

  it('no capability: eye_commit without the context is refused by both ports', async () => {
    await expect(sql`select * from observation.schedules_to_reconcile()`.execute(commit)).rejects.toSatisfy((e) => code(e) === '42501');
    await expect(sql`select observation.record_scheduled_attempt(gen_random_uuid(), gen_random_uuid(), gen_random_uuid(), gen_random_uuid(), 1,
      'obs:x', 'job', now(), now(), 'refused', null, 'probe', 0, 0, 0)`.execute(commit)).rejects.toSatisfy((e) => code(e) === '42501');
  });

  it('a reason is required and the ttl is bounded', async () => {
    await expect(sql`select observation.issue_schedule_capability('', 60)`.execute(commit)).rejects.toSatisfy((e) => code(e) === '42501');
    await expect(sql`select observation.issue_schedule_capability('probe', 100000)`.execute(commit)).rejects.toSatisfy((e) => code(e) === '42501');
  });

  it('wrong mode: a schedule context cannot drive an observation business port', async () => {
    await expect(commit.transaction().execute(async (tx) => {
      await sql`select observation.issue_schedule_capability('probe', 60)`.execute(tx);
      await sql`select observation.upsert_scheduler_entry(gen_random_uuid(), gen_random_uuid(), gen_random_uuid(), 1,
        'obs:x', 'obs:x:collection', 60, 5, 'scheduled')`.execute(tx);
    })).rejects.toSatisfy((e) => code(e) === '42501');
  });

  it('wrong target: an attempt without a scope is refused', async () => {
    await expect(commit.transaction().execute(async (tx) => {
      await sql`select observation.issue_schedule_capability('probe', 60)`.execute(tx);
      await sql`select observation.record_scheduled_attempt(gen_random_uuid(), null, null, gen_random_uuid(), 1,
        'obs:x', 'job', now(), now(), 'refused', null, 'probe', 0, 0, 0)`.execute(tx);
    })).rejects.toSatisfy((e) => code(e) === '23514');
  });

  it('right capability: the listing returns only eligible entries, and an attempt is recorded', async () => {
    const listed = await commit.transaction().execute(async (tx) => {
      await sql`select observation.issue_schedule_capability('probe', 60)`.execute(tx);
      return (await sql<{ source_id: string; contract_version: number }>`select source_id, contract_version from observation.schedules_to_reconcile()`.execute(tx)).rows;
    });
    // every listed row is scheduled, on an ACTIVE, LIVE, CONFIRMED contract with an active agent — checked as the superuser
    for (const r of listed) {
      const ok = (await sql<{ ok: boolean }>`select exists(
        select 1 from observation.scheduler_entries e
          join observation.source_contracts_current c on c.source_id = e.source_id and c.contract_version = e.contract_version
          join observation.agents a on a.source_id = e.source_id and a.status = 'active'
         where e.source_id = ${r.source_id}::uuid and e.status = 'scheduled' and c.lifecycle_state = 'active'
           and c.acquisition_mode = 'live' and c.rights_state = 'confirmed') as ok`.execute(su)).rows[0]?.ok;
      expect(ok, `listed entry ${r.source_id} is not eligible`).toBe(true);
    }
    // and no eligible entry is missing
    const eligible = Number((await sql<{ n: string }>`select count(*)::text n from observation.scheduler_entries e
        join observation.source_contracts_current c on c.source_id = e.source_id and c.contract_version = e.contract_version
       where e.status = 'scheduled' and c.lifecycle_state = 'active' and c.acquisition_mode = 'live' and c.rights_state = 'confirmed'
         and exists (select 1 from observation.agents a where a.source_id = e.source_id and a.status = 'active' and a.connector = 'observation.' || c.connector_kind)`.execute(su)).rows[0]?.n);
    expect(listed.length).toBe(eligible);
    const id = (await sql<{ id: string }>`select gen_random_uuid()::text as id`.execute(su)).rows[0]?.id as string;
    await commit.transaction().execute(async (tx) => {
      await sql`select observation.issue_schedule_capability('probe', 60)`.execute(tx);
      await sql`select observation.record_scheduled_attempt(${id}::uuid, gen_random_uuid(), gen_random_uuid(), gen_random_uuid(), 1,
        'obs:x', 'job', now(), now(), 'refused', null, 'probe: no run opened', 0, 0, 0)`.execute(tx);
    });
    const row = (await sql<{ outcome: string; run_id: string | null }>`select outcome, run_id from observation.scheduled_attempts where attempt_id = ${id}::uuid`.execute(su)).rows[0];
    expect(row?.outcome).toBe('refused'); expect(row?.run_id).toBeNull();
    // the record's own invariant: a run id iff a run was opened
    await expect(commit.transaction().execute(async (tx) => {
      await sql`select observation.issue_schedule_capability('probe', 60)`.execute(tx);
      await sql`select observation.record_scheduled_attempt(gen_random_uuid(), gen_random_uuid(), gen_random_uuid(), gen_random_uuid(), 1,
        'obs:x', 'job', now(), now(), 'finished', null, null, 1, 0, 0)`.execute(tx);
    })).rejects.toSatisfy((e) => code(e) === '23514');
    await sql`delete from observation.scheduled_attempts where attempt_id = ${id}::uuid`.execute(su);
  });

  it('stale: the capability does not outlive its transaction', async () => {
    await commit.transaction().execute(async (tx) => { await sql`select observation.issue_schedule_capability('probe', 60)`.execute(tx); });
    await expect(sql`select * from observation.schedules_to_reconcile()`.execute(commit)).rejects.toSatisfy((e) => code(e) === '42501');
  });
});
