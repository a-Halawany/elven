/**
 * GATE-2.2 C9 — GOVERNED DEGRADED RECOVERY.
 *
 * Reconciling an availability incident is what permits a degraded deployment to be
 * presented as healthy again. Before this closure it was an ungoverned UPDATE
 * reachable with only the verifier role grant. These tests prove reconciliation
 * now requires a RECOVERY capability bound to the exact incident, writes its
 * evidence inseparably, refuses replay, and that the local degraded flag cannot be
 * cleared without governed proof.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { sql } from 'kysely';
import { uuidv7 } from 'uuidv7';
import { appDb, commitDb, verifierDb, superDb, type AnyDb } from './helpers.js';
import { degradedAudit } from '../../src/shared/degraded-store.js';

let app: AnyDb;
let commit: AnyDb;
let verifier: AnyDb;
let su: AnyDb;

/** Record a real availability incident through the production fail-closed port. */
async function openIncident(): Promise<string> {
  const id = uuidv7();
  await commit.transaction().execute(async (tx) => {
    await sql`select audit.record_availability_incident(
      ${id}::uuid, 'audit_unavailable', 'PLATFORM', ${uuidv7()}::uuid,
      ${JSON.stringify({ probe: 'c9' })}::jsonb)`.execute(tx);
  });
  return id;
}

beforeAll(async () => {
  app = appDb(); commit = commitDb(); verifier = verifierDb(); su = superDb();
});
afterAll(async () => {
  await Promise.all([app, commit, verifier, su].map((d) => d.destroy()));
});

describe('C9 — the ungoverned reconciliation port is gone', () => {
  it('audit.reconcile_availability_incident (v1, no capability check) no longer exists', async () => {
    const gone = await sql<{ n: string }>`
      select count(*) n from pg_proc p join pg_namespace n on n.oid = p.pronamespace
       where n.nspname = 'audit' and p.proname = 'reconcile_availability_incident'`.execute(su);
    expect(Number(gone.rows[0]!.n)).toBe(0);
  });

  it('no ordinary role may reconcile at all', async () => {
    const id = await openIncident();
    for (const [name, db] of [['app', app], ['commit', commit]] as const) {
      await expect(
        sql`select * from audit.reconcile_availability_incident_v2(${id}::uuid, 'x', 'y')`.execute(db),
        name,
      ).rejects.toThrow(/permission denied/);
    }
  });
});

describe('C9 — reconciliation requires a recovery capability bound to the incident', () => {
  it('the verifier cannot reconcile with NO capability', async () => {
    const id = await openIncident();
    await expect(
      verifier.transaction().execute(async (tx) =>
        sql`select * from audit.reconcile_availability_incident_v2(${id}::uuid, 'op', 'note')`.execute(tx)),
    ).rejects.toThrow(/a recovery capability is required/);
  });

  it('a capability for incident A cannot reconcile incident B', async () => {
    const a = await openIncident();
    const b = await openIncident();
    await expect(
      verifier.transaction().execute(async (tx) => {
        await sql`select ctx.issue_recovery(${a}::uuid)`.execute(tx);
        return sql`select * from audit.reconcile_availability_incident_v2(${b}::uuid, 'op', 'note')`.execute(tx);
      }),
    ).rejects.toThrow(/bound to incident/);
    // B is still unreconciled.
    const row = await sql<{ n: string }>`
      select count(*) n from audit.availability_incidents where id = ${b} and reconciled_at is null`.execute(su);
    expect(Number(row.rows[0]!.n)).toBe(1);
  });

  it('a VERIFY capability (not recovery) cannot reconcile', async () => {
    const id = await openIncident();
    await expect(
      verifier.transaction().execute(async (tx) => {
        await sql`select ctx.issue_verify('platform', false)`.execute(tx);
        return sql`select * from audit.reconcile_availability_incident_v2(${id}::uuid, 'op', 'note')`.execute(tx);
      }),
    ).rejects.toThrow(/a recovery capability is required/);
  });

  it('the correctly-bound capability reconciles AND writes inseparable evidence', async () => {
    const id = await openIncident();
    const before = (
      await sql<{ n: string }>`select count(*) n from audit.audit_events where partition_id = 'platform'`.execute(su)
    ).rows[0]!.n;

    const out = await verifier.transaction().execute(async (tx) => {
      await sql`select ctx.issue_recovery(${id}::uuid)`.execute(tx);
      return (
        await sql<{ reconciled: boolean; remaining_unreconciled: number }>`
          select * from audit.reconcile_availability_incident_v2(${id}::uuid, 'operator', 'governed test')`.execute(tx)
      ).rows[0];
    });
    expect(out!.reconciled).toBe(true);

    // The row is reconciled…
    const row = await sql<{ reconciled_by: string }>`
      select reconciled_by from audit.availability_incidents where id = ${id} and reconciled_at is not null`.execute(su);
    expect(row.rows[0]!.reconciled_by).toBe('operator');
    // …and its integrity evidence landed in the SAME transaction.
    const after = (
      await sql<{ n: string }>`select count(*) n from audit.audit_events where partition_id = 'platform'`.execute(su)
    ).rows[0]!.n;
    expect(Number(after)).toBeGreaterThan(Number(before));
    const ev = await sql<{ n: string }>`
      select count(*) n from audit.audit_events
       where correlation_id = ${id} and event->'metadata'->>'event' = 'availability.reconciled'`.execute(su);
    expect(Number(ev.rows[0]!.n)).toBe(1);
  });

  it('the same incident cannot be reconciled twice (replay refused)', async () => {
    const id = await openIncident();
    await verifier.transaction().execute(async (tx) => {
      await sql`select ctx.issue_recovery(${id}::uuid)`.execute(tx);
      await sql`select * from audit.reconcile_availability_incident_v2(${id}::uuid, 'operator', 'first')`.execute(tx);
    });
    await expect(
      verifier.transaction().execute(async (tx) => {
        await sql`select ctx.issue_recovery(${id}::uuid)`.execute(tx);
        return sql`select * from audit.reconcile_availability_incident_v2(${id}::uuid, 'operator', 'again')`.execute(tx);
      }),
    ).rejects.toThrow(/unknown or already reconciled/);
  });
});

describe('C9 — the local degraded flag cannot be cleared without governed proof', () => {
  it('markRecovered refuses an empty reconciliation proof', () => {
    expect(() =>
      degradedAudit.markRecovered({ reconciledIncidentIds: [], remainingUnreconciled: 0, detail: 'ungoverned' }),
    ).toThrow(/no governed reconciliation was presented/);
  });

  it('markRecovered refuses while the ledger still shows unreconciled incidents', () => {
    expect(() =>
      degradedAudit.markRecovered({
        reconciledIncidentIds: [uuidv7()], remainingUnreconciled: 3, detail: 'premature',
      }),
    ).toThrow(/still shows 3 unreconciled incident/);
  });
});
