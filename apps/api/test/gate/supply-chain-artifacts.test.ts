/**
 * GATE-2.1 §9 — the supply-chain ARTIFACTS the gate actually shipped.
 *
 * Separate from supply-chain.test.ts because these assertions have a stated
 * precondition: the generators must have run. That ordering is real (a clean
 * checkout has no SBOM yet), so it is declared here and encoded in CI rather than
 * hidden behind a skip — a gate that quietly skips is not a gate.
 *
 *   1. node scripts/license-inventory.mjs   → sbom/license-inventory.json
 *   2. node scripts/generate-sbom.mjs       → evidence/supply-chain/*
 *   3. pnpm --filter @eye/api test          → this file
 */
import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import Ajv from 'ajv';
import addFormats from 'ajv-formats';
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore — plain .mjs gate library shared with the CI scripts (no types)
import { validateCycloneDx } from '../../../../scripts/lib/supply-chain.mjs';

const REPO = join(__dirname, '..', '..', '..', '..');

/** Fail with the exact command to run, rather than skipping silently. */
function required(relative: string, producer: string): string {
  const path = join(REPO, relative);
  if (!existsSync(path)) {
    throw new Error(
      `${relative} is missing — run \`${producer}\` first. ` +
      'This gate asserts the ARTIFACT that was shipped; it is not skippable.',
    );
  }
  return readFileSync(path, 'utf8');
}

describe('G21-22 artifacts — the shipped SBOM, inventories and reconciliation report', () => {
  it('the licence inventory records BOTH closures, and neither is empty', () => {
    const inventory = JSON.parse(
      required('sbom/license-inventory.json', 'node scripts/license-inventory.mjs'),
    ) as { production: unknown[]; development: unknown[] };
    expect(Array.isArray(inventory.production)).toBe(true);
    expect(Array.isArray(inventory.development)).toBe(true);
    expect(inventory.production.length).toBeGreaterThan(0);
    expect(inventory.development.length).toBeGreaterThan(0);
  });

  it('the shipped SBOM passes the same CycloneDX 1.6 gate as the negative fixtures', () => {
    const bom = JSON.parse(
      required('evidence/supply-chain/sbom.cdx.json', 'node scripts/generate-sbom.mjs'),
    ) as Record<string, unknown>;
    const r = validateCycloneDx(bom, Ajv, addFormats);
    expect(r.errors.slice(0, 5)).toEqual([]);
    expect(r.ok).toBe(true);
    expect((bom['components'] as unknown[]).length).toBeGreaterThan(0);
  });

  it('the reconciliation report shows BOTH directions clean and the schema valid', () => {
    const report = required('evidence/supply-chain/reconciliation.txt', 'node scripts/generate-sbom.mjs');
    expect(report).toMatch(/forward\s+\(sbom -> closure\):\s+\d+\/\d+ matched, 0 unmatched/);
    expect(report).toMatch(/reverse\s+\(closure -> sbom\):\s+\d+\/\d+ matched, 0 unmatched/);
    expect(report).toContain('cyclonedx 1.6 schema:          VALID');
    expect(report).toContain('result:                        RECONCILED');
    expect(report).toMatch(/stale exclusions:\s+0/);
  });

  it('the production and development inventories agree with the SBOM component scopes', () => {
    const prod = JSON.parse(
      required('evidence/supply-chain/licenses-prod.json', 'node scripts/generate-sbom.mjs'),
    ) as unknown[];
    const dev = JSON.parse(
      required('evidence/supply-chain/licenses-dev.json', 'node scripts/generate-sbom.mjs'),
    ) as unknown[];
    const bom = JSON.parse(
      required('evidence/supply-chain/sbom.cdx.json', 'node scripts/generate-sbom.mjs'),
    ) as { components: Array<{ properties?: Array<{ name: string; value: string }> }> };
    const scopeOf = (c: { properties?: Array<{ name: string; value: string }> }): string =>
      c.properties?.find((x) => x.name === 'eye:dependency-scope')?.value ?? 'unknown';
    const counted = bom.components.reduce<Record<string, number>>((acc, c) => {
      const s = scopeOf(c);
      acc[s] = (acc[s] ?? 0) + 1;
      return acc;
    }, {});
    expect(counted['production']).toBe(prod.length);
    expect(counted['development']).toBe(dev.length);
    expect(bom.components.length).toBe(prod.length + dev.length);
  });
});
