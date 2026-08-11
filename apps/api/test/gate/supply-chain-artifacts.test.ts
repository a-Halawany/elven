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

  it('the legacy reconciliation report shows both of its directions clean', () => {
    // SUPERSEDED BY C16. Gate-2.2 found this report to be SELF-reconciliation: both
    // "directions" were derived from the same generated SBOM, so the check could not
    // fail. It is still asserted here because the artifact still ships, but it is no
    // longer the evidence of closure correctness — that is the C16 report below,
    // which compares the lockfile-derived graph against an SBOM re-read from disk.
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

// ═════════════════════════════════════════════════════════════════════════════
describe('C16 artifacts — the target-resolved closures and their real reconciliation', () => {
  const C16 = 'node scripts/gate/generate-closures.mjs';

  const report = (): {
    targets: Record<string, {
      target: { id: string; os: string; arch: string; libc: string; importer_roots: string[]; dependency_scopes: string[] };
      counts: { nodes: number; edges: number; platform_excluded: number; peer_variant_nodes: number };
      reconciliation: Record<string, unknown> & { clean: boolean };
      sbom_sha256: string;
      sbom_file: string;
    }>;
    determinism_contract: Record<string, unknown>;
    governed_exclusions: { problems: string[] };
    vulnerable_residuals: string[];
    override_residual_proof: Array<{ package: string; pinned_exact: string; resolved_per_target: Record<string, string[]> }>;
  } => JSON.parse(required('evidence/supply-chain/c16/closure-reconciliation.json', C16));

  it('both targets reconcile with zero missing AND zero extra, reported separately', () => {
    const r = report();
    expect(Object.keys(r.targets).sort()).toEqual(['development', 'production']);
    for (const [name, t] of Object.entries(r.targets)) {
      for (const key of ['missing_nodes', 'extra_nodes', 'missing_edges', 'extra_edges',
        'identity_mismatches', 'dangling_references', 'components_without_dependency_entry',
        'orphan_components']) {
        expect(t.reconciliation[key], `${name}.${key}`).toEqual([]);
      }
      // Counts must agree on both sides, not merely have an empty difference.
      expect(t.reconciliation['lock_nodes'], `${name} node counts`).toBe(t.reconciliation['sbom_nodes']);
      expect(t.reconciliation['lock_edges'], `${name} edge counts`).toBe(t.reconciliation['sbom_edges']);
      expect(t.reconciliation.clean, `${name} clean`).toBe(true);
      expect(t.counts.nodes).toBeGreaterThan(0);
      expect(t.counts.edges).toBeGreaterThan(0);
    }
  });

  it('the two targets are resolved for linux/x64/glibc and are genuinely distinct', () => {
    const r = report();
    for (const t of Object.values(r.targets)) {
      expect(t.target.os).toBe('linux');
      expect(t.target.arch).toBe('x64');
      expect(t.target.libc).toBe('glibc');
      expect(t.counts.platform_excluded).toBeGreaterThan(0);
      expect(t.counts.peer_variant_nodes).toBeGreaterThan(0);
    }
    const prod = r.targets['production']!;
    const dev = r.targets['development']!;
    expect(prod.target.dependency_scopes).not.toContain('devDependencies');
    expect(dev.target.dependency_scopes).toContain('devDependencies');
    expect(dev.counts.nodes).toBeGreaterThan(prod.counts.nodes);
    expect(dev.counts.edges).toBeGreaterThan(prod.counts.edges);
    expect(dev.sbom_sha256).not.toBe(prod.sbom_sha256);
  });

  it('the recorded determinism contract matches what the artifacts must satisfy', () => {
    const r = report();
    expect(r.determinism_contract['metadata_timestamp']).toBe('deliberately omitted');
    expect(r.determinism_contract['node_modules_read']).toBe(false);
    expect(r.determinism_contract['host_platform_read']).toBe(false);
    expect(r.determinism_contract['reconciliation_reads_sbom_from_disk']).toBe(true);
  });

  it('the shipped SBOMs carry no timestamp, so they are byte-comparable across runs', () => {
    const r = report();
    for (const t of Object.values(r.targets)) {
      const doc = JSON.parse(required(`evidence/supply-chain/c16/${t.sbom_file}`, C16)) as {
        metadata: Record<string, unknown>; specVersion: string; serialNumber: string;
        components: unknown[]; dependencies: unknown[];
      };
      expect(doc.metadata['timestamp']).toBeUndefined();
      expect(doc.specVersion).toBe('1.6');
      expect(doc.serialNumber).toMatch(/^urn:uuid:/);
      // Every component has a dependency entry, leaves included.
      expect(doc.dependencies.length).toBe(doc.components.length);
    }
  });

  it('no exclusion is suppressing anything, and the exact override left no residual', () => {
    const r = report();
    expect(r.governed_exclusions.problems).toEqual([]);
    expect(r.vulnerable_residuals).toEqual([]);
    const nanoid = r.override_residual_proof.find((p) => p.package === 'nanoid');
    expect(nanoid, 'the nanoid override must be proven, not assumed').toBeDefined();
    expect(nanoid!.pinned_exact).toBe('3.3.18');
    for (const [target, versions] of Object.entries(nanoid!.resolved_per_target)) {
      expect(versions, `${target} nanoid versions`).toEqual(['3.3.18']);
    }
  });
});
