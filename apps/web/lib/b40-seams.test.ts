/**
 * CP-6 B40 (integration) — the library contract: each wave-1 component file exports EXACTLY its LIBRARY_B40 entry (B107's inventory reads
 * these files; a component added or removed without the contract fails here), and carries no raw colour (dg-lint-1).
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { LIBRARY_B40 } from './b40-seams';

describe('LIBRARY_B40 — the source platform\'s library files', () => {
  for (const [group, g] of Object.entries(LIBRARY_B40)) {
    it(`${g.files[0]} (${g.part}, ${group}) exports exactly its ${g.exports.length} components`, () => {
      const src = readFileSync(join(__dirname, '..', g.files[0]!), 'utf8');
      expect([...src.matchAll(/^export function ([A-Z][A-Za-z0-9]*)/gm)].map((m) => m[1]).sort()).toEqual([...g.exports].sort());
      expect(src).not.toMatch(/#[0-9a-f]{3,8}\b|rgba?\(/i);
    });
  }
});
