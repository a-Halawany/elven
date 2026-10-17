/**
 * CP-6 B80 §0 (migration 0118 §0) — THE PRELUDE of the shell and foundations: the schema `shell` and its append-only ledger (a principal reads
 * its OWN events only), the TENANT role `branding_authority`, the vocabularies widened (governance.artifact_kinds + 'theme';
 * governance.signature_kinds + 'theme_certification', B107's kept). Every row here is SYNTHETIC fixture data.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { sql } from 'kysely';
import { uuidv7 } from 'uuidv7';
import { Phase4Harness } from './phase4-helpers.js';

type Row = Record<string, unknown>;
let h: Phase4Harness;
const one = async (q: ReturnType<typeof sql>) => ((await q.execute(h.su)).rows[0] ?? {}) as Row;
const failure = async (q: ReturnType<typeof sql>): Promise<string> => q.execute(h.su).then(() => 'no error', (e: unknown) => (e instanceof Error ? e.message : String(e)));

beforeAll(async () => { h = await Phase4Harness.boot(); }, 300_000);
afterAll(async () => { await h?.close(); });

describe('§0.1–§0.3 · the schema, the role, the vocabularies', () => {
  it('the schema `shell` with USAGE for the application roles', async () => {
    const r = await one(sql`select has_schema_privilege('eye_app', 'shell', 'USAGE') as app, has_schema_privilege('eye_commit', 'shell', 'USAGE') as cmt`);
    expect(r).toEqual({ app: true, cmt: true });
  });
  it('the TENANT role branding_authority', async () => {
    expect(await one(sql`select scope from identity.roles where code = 'branding_authority'`)).toEqual({ scope: 'TENANT' });
  });
  it('the vocabularies carry B80\'s additions and keep every earlier value', async () => {
    const v = await one(sql`select governance.artifact_kinds() as a, governance.signature_kinds() as s`);
    expect(v['a']).toEqual(expect.arrayContaining(['theme', 'design_asset', 'acceptance_record', 'requirement', 'role']));
    expect(v['s']).toEqual(expect.arrayContaining(['theme_certification', 'design_acceptance', 'acceptance_attestation', 'baseline_decision']));
    expect((v['a'] as string[]).length).toBe(31);
    expect((v['s'] as string[]).length).toBe(12);
  });
});

describe('§0.4 · the shell ledger', () => {
  it('append-only: an event is never updated or deleted', async () => {
    const id = (await one(sql`select shell.ledger(null, null, ${uuidv7()}::uuid, 'navigation_state', ${uuidv7()}::uuid, 1, 'shell.navigation.saved', '{}'::jsonb, ${uuidv7()}::uuid) as id`))['id'] as string;
    expect(await failure(sql`update shell.events set event = 'shell.navigation.changed' where event_id = ${id}::uuid`)).toMatch(/append-only|not permitted|immutable/i);
    expect(await failure(sql`delete from shell.events where event_id = ${id}::uuid`)).toMatch(/append-only|not permitted|immutable/i);
  });
  it('FORCE RLS: the application roles read only the principal\'s own events; no write grant; the ledger function is eye_commit\'s alone', async () => {
    const r = await one(sql`select c.relrowsecurity as rls, c.relforcerowsecurity as force,
      has_table_privilege('eye_app', 'shell.events', 'INSERT') as app_ins, has_table_privilege('eye_commit', 'shell.events', 'UPDATE') as cmt_upd,
      has_function_privilege('eye_app', 'shell.ledger(uuid, uuid, uuid, text, uuid, int, text, jsonb, uuid)', 'EXECUTE') as app_ledger,
      has_function_privilege('eye_commit', 'shell.ledger(uuid, uuid, uuid, text, uuid, int, text, jsonb, uuid)', 'EXECUTE') as cmt_ledger
      from pg_class c join pg_namespace n on n.oid = c.relnamespace where n.nspname = 'shell' and c.relname = 'events'`);
    expect(r).toEqual({ rls: true, force: true, app_ins: false, cmt_upd: false, app_ledger: false, cmt_ledger: true });
    const pol = await one(sql`select qual from pg_policies where schemaname = 'shell' and tablename = 'events' and policyname = 'shev_own'`);
    expect(String(pol['qual'])).toMatch(/eye_principal\(\)/);
  });
});
