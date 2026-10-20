/**
 * CP-6 B81 §0 (migration 0119 §0) — THE PRELUDE: governance.artifact_kinds carries 'terminology' and keeps every earlier kind (B80's 'theme'
 * included). Every row here is SYNTHETIC fixture data.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { sql } from 'kysely';
import { Phase4Harness } from './phase4-helpers.js';

let h: Phase4Harness;
beforeAll(async () => { h = await Phase4Harness.boot(); }, 300_000);
afterAll(async () => { await h?.close(); });

describe('§0.1 · the vocabulary', () => {
  it('artifact kinds: + terminology; B80\'s theme and every earlier kind kept', async () => {
    const v = (await sql<{ a: string[] }>`select governance.artifact_kinds() as a`.execute(h.su)).rows[0]!.a;
    expect(v).toEqual(expect.arrayContaining(['terminology', 'theme', 'design_asset', 'acceptance_record', 'requirement', 'role']));
    expect(v.length).toBe(32);
  });
});
