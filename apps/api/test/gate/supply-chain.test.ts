/**
 * GATE-2.1 tests 20–22 — supply-chain gate controls, driven with CONTROLLED
 * NEGATIVE FIXTURES.
 *
 *  20  migration without EYE_DB_MIGRATE_PASSWORD fails before connecting
 *      (also asserted against a live database in test/int/gate21-adversarial)
 *  21  production AND development licence violations both block CI
 *  22  the CycloneDX schema gate and the BIDIRECTIONAL reconciliation gate both
 *      fail on known-bad inputs
 *
 * These tests import the REAL gate functions the CI scripts use
 * (scripts/lib/supply-chain.mjs) rather than reimplementing them, so weakening a
 * gate makes the known-bad fixture stop failing — and this suite go red.
 */
import { describe, expect, it } from 'vitest';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import Ajv from 'ajv';
import addFormats from 'ajv-formats';
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore — plain .mjs gate library shared with the CI scripts (no types)
import { checkLicenses, reconcile, validateCycloneDx, LICENSE_ALLOWLIST } from '../../../../scripts/lib/supply-chain.mjs';

const REPO = join(__dirname, '..', '..', '..', '..');

/** A minimal but VALID CycloneDX 1.6 document, used as the positive control. */
function validBom(): Record<string, unknown> {
  return {
    bomFormat: 'CycloneDX',
    specVersion: '1.6',
    serialNumber: 'urn:uuid:2b1c3d4e-5f60-7182-93a4-b5c6d7e8f901',
    version: 1,
    metadata: {
      timestamp: '2026-08-07T00:00:00.000Z',
      component: { type: 'application', name: 'the-eye', version: '0.0.1' },
      properties: [{ name: 'eye:source-candidate-sha', value: 'a'.repeat(40) }],
    },
    components: [
      {
        type: 'library', 'bom-ref': 'pkg:npm/kysely@0.29.4', name: 'kysely', version: '0.29.4',
        purl: 'pkg:npm/kysely@0.29.4', licenses: [{ license: { name: 'MIT' } }],
        properties: [{ name: 'eye:dependency-scope', value: 'production' }],
      },
      {
        type: 'library', 'bom-ref': 'pkg:npm/%40eye%2Fcontracts@0.0.1', name: '@eye/contracts',
        version: '0.0.1', purl: 'pkg:npm/%40eye%2Fcontracts@0.0.1',
        licenses: [{ license: { name: 'MIT' } }],
      },
    ],
  };
}

// ═════════════════════════════════════════════════════════════════════════════
describe('G21-21 — production AND development licence violations both block CI', () => {
  it('accepts a clean inventory in both scopes (positive control)', () => {
    const r = checkLicenses({
      production: [{ name: 'kysely', version: '0.29.4', license: 'MIT' }],
      development: [{ name: 'vitest', version: '4.1.10', license: 'MIT' }],
    }, LICENSE_ALLOWLIST);
    expect(r.ok).toBe(true);
    expect(r.checked).toBe(2);
    expect(r.violations).toEqual([]);
  });

  it('blocks a PRODUCTION violation', () => {
    const r = checkLicenses({
      production: [{ name: 'copyleft-lib', version: '1.0.0', license: 'GPL-3.0-only' }],
      development: [{ name: 'vitest', version: '4.1.10', license: 'MIT' }],
    }, LICENSE_ALLOWLIST);
    expect(r.ok).toBe(false);
    expect(r.violations).toEqual([
      { scope: 'production', name: 'copyleft-lib@1.0.0', license: 'GPL-3.0-only' },
    ]);
  });

  it('blocks a DEVELOPMENT-ONLY violation — the gap Gate-2.1 §9 identified', () => {
    const r = checkLicenses({
      production: [{ name: 'kysely', version: '0.29.4', license: 'MIT' }],
      development: [{ name: 'copyleft-tool', version: '2.0.0', license: 'AGPL-3.0-only' }],
    }, LICENSE_ALLOWLIST);
    expect(r.ok).toBe(false);
    expect(r.violations).toEqual([
      { scope: 'development', name: 'copyleft-tool@2.0.0', license: 'AGPL-3.0-only' },
    ]);
  });

  it('the shipped checker script gates BOTH scopes (not production alone)', () => {
    const src = readFileSync(join(REPO, 'scripts', 'license-inventory.mjs'), 'utf8');
    expect(src).toMatch(/checkLicenses\(\{\s*production:\s*prod,\s*development:\s*dev\s*\}/);
  });

  it('attributes violations per scope when both scopes are dirty', () => {
    const r = checkLicenses({
      production: [{ name: 'p', version: '1.0.0', license: 'GPL-2.0-only' }],
      development: [{ name: 'd', version: '1.0.0', license: 'SSPL-1.0' }],
    }, LICENSE_ALLOWLIST);
    expect(r.ok).toBe(false);
    expect(r.violations.map((v: { scope: string }) => v.scope).sort()).toEqual(['development', 'production']);
  });

});

// ═════════════════════════════════════════════════════════════════════════════
describe('G21-22a — the CycloneDX 1.6 schema gate fails on known-bad documents', () => {
  it('accepts a valid document (positive control)', () => {
    const r = validateCycloneDx(validBom(), Ajv, addFormats);
    expect(r.errors).toEqual([]);
    expect(r.ok).toBe(true);
  });

  const mutations: Array<[string, (b: Record<string, any>) => void, RegExp]> = [
    ['wrong bomFormat', (b) => { b['bomFormat'] = 'SPDX'; }, /bomFormat/],
    ['unsupported specVersion', (b) => { b['specVersion'] = '1.4'; }, /specVersion/],
    ['missing metadata', (b) => { delete b['metadata']; }, /metadata/],
    ['missing components', (b) => { delete b['components']; }, /components/],
    ['empty components', (b) => { b['components'] = []; }, /components/],
    ['component without a version', (b) => { delete b['components'][0].version; }, /version|purl/],
    ['component without licences', (b) => { delete b['components'][0].licenses; }, /licenses/],
    ['licence entry with neither id nor name', (b) => { b['components'][0].licenses = [{ license: {} }]; }, /licenses/],
    ['non-npm purl', (b) => { b['components'][0].purl = 'pkg:cargo/serde@1.0.0'; }, /purl/],
    ['purl not matching name@version', (b) => { b['components'][0].purl = 'pkg:npm/kysely@9.9.9'; }, /does not match/],
    ['duplicate bom-ref', (b) => { b['components'][1]['bom-ref'] = b['components'][0]['bom-ref']; }, /duplicate bom-ref/],
    ['malformed serialNumber', (b) => { b['serialNumber'] = 'not-a-urn'; }, /serialNumber/],
    ['version zero', (b) => { b['version'] = 0; }, /version/],
    ['timestamp not a date-time', (b) => { b['metadata'].timestamp = 'yesterday'; }, /timestamp/],
  ];

  it.each(mutations)('rejects: %s', (_label, mutate, matcher) => {
    const bom = validBom();
    mutate(bom as Record<string, any>);
    const r = validateCycloneDx(bom, Ajv, addFormats);
    expect(r.ok).toBe(false);
    expect(r.errors.join(' | ')).toMatch(matcher);
  });

});

// ═════════════════════════════════════════════════════════════════════════════
describe('G21-22b — BIDIRECTIONAL reconciliation fails in either direction', () => {
  const components = [
    { name: 'kysely', version: '0.29.4' },
    { name: 'pg', version: '8.22.0' },
  ];
  const closure = ['kysely@0.29.4', 'pg@8.22.0'];

  it('reconciles when both directions agree (positive control)', () => {
    const r = reconcile({ components, lockIdentities: closure });
    expect(r.failures).toEqual([]);
    expect(r.ok).toBe(true);
  });

  it('FORWARD failure: an SBOM component that is not in the dependency closure', () => {
    const r = reconcile({
      components: [...components, { name: 'ghost-package', version: '1.0.0' }],
      lockIdentities: closure,
    });
    expect(r.ok).toBe(false);
    expect(r.missingFromLock).toEqual(['ghost-package@1.0.0']);
    expect(r.failures.join(' ')).toMatch(/absent from the dependency closure/);
  });

  it('REVERSE failure: a closure dependency the SBOM silently omits', () => {
    // This is the direction the previous gate could not see at all.
    const r = reconcile({
      components,
      lockIdentities: [...closure, 'undeclared-transitive@3.1.4'],
    });
    expect(r.ok).toBe(false);
    expect(r.missingFromSbom).toEqual(['undeclared-transitive@3.1.4']);
    expect(r.failures.join(' ')).toMatch(/absent from the SBOM with no governed exclusion/);
  });

  it('a GOVERNED exclusion permits a legitimate platform-specific omission', () => {
    const r = reconcile({
      components,
      lockIdentities: [...closure, '@esbuild/linux-x64@0.27.2'],
      exclusions: [{
        identity: '@esbuild/linux-x64@0.27.2',
        kind: 'platform-specific-optional',
        reason: 'optional platform binary not installed on this build platform; recorded as a governed exclusion',
      }],
    });
    expect(r.failures).toEqual([]);
    expect(r.ok).toBe(true);
    expect(r.counts.excluded).toBe(1);
  });

  it('an exclusion without a substantive reason is itself a failure', () => {
    const r = reconcile({
      components,
      lockIdentities: [...closure, 'whatever@1.0.0'],
      exclusions: [{ identity: 'whatever@1.0.0', reason: 'meh' }],
    });
    expect(r.ok).toBe(false);
    expect(r.failures.join(' ')).toMatch(/lack an identity or a substantive reason/);
  });

  it('a STALE exclusion (no longer in the closure) fails the gate', () => {
    const r = reconcile({
      components,
      lockIdentities: closure,
      exclusions: [{
        identity: 'removed-long-ago@0.0.1',
        reason: 'this exclusion outlived the dependency it was written for',
      }],
    });
    expect(r.ok).toBe(false);
    expect(r.staleExclusions).toEqual(['removed-long-ago@0.0.1']);
    expect(r.failures.join(' ')).toMatch(/stale exclusion/);
  });

  it('the shipped generator wires BOTH directions and the schema gate', () => {
    // The generated REPORT is asserted in supply-chain-artifacts.test.ts, which
    // runs after the generators; here we prove the generator calls both gates.
    const src = readFileSync(join(REPO, 'scripts', 'generate-sbom.mjs'), 'utf8');
    expect(src).toContain('reconcile({ components, lockIdentities: closureIdentities, exclusions })');
    expect(src).toContain('validateCycloneDx(bom');
  });

  it('the governed exclusions file exists and is well formed', () => {
    const raw = JSON.parse(readFileSync(join(REPO, 'supply-chain-exclusions.json'), 'utf8')) as {
      exclusions: Array<{ identity: string; reason: string }>;
    };
    expect(Array.isArray(raw.exclusions)).toBe(true);
    for (const x of raw.exclusions) {
      expect(typeof x.identity).toBe('string');
      expect(x.reason.length).toBeGreaterThanOrEqual(10);
    }
  });
});

// ═════════════════════════════════════════════════════════════════════════════
describe('G21-20 — the migration runner has no executable credential default', () => {
  it('refuses to start without EYE_DB_MIGRATE_PASSWORD, before any connection', () => {
    const env = { ...process.env };
    delete env['EYE_DB_MIGRATE_PASSWORD'];
    env['EYE_DB_HOST'] = '203.0.113.1'; // unroutable: proves no connection was tried
    let status = 0;
    let stderr = '';
    try {
      execFileSync('node', [join(REPO, 'apps', 'api', 'scripts', 'migrate.mjs')], {
        env, encoding: 'utf8', timeout: 10_000, stdio: 'pipe',
      });
    } catch (e) {
      const err = e as { status?: number; stderr?: string };
      status = err.status ?? -1;
      stderr = err.stderr ?? '';
    }
    expect(status).toBe(1);
    expect(stderr).toMatch(/EYE_DB_MIGRATE_PASSWORD is required and has no default/);
  });

  it('the literal fallback is absent from the source', () => {
    const src = readFileSync(join(REPO, 'apps', 'api', 'scripts', 'migrate.mjs'), 'utf8');
    expect(src).not.toContain('eye_local_dev');
    expect(src).not.toMatch(/EYE_DB_MIGRATE_PASSWORD\s*\?\?/);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
describe('G21-§9 — the browser gate loads EVERY runtime authority', () => {
  it('the Playwright fallback key list matches the canonical loader exactly', () => {
    // Drift here is what silently left the browser gate without the
    // commit/identity/publisher/verifier credentials the API needs.
    const canonical = readFileSync(join(REPO, 'scripts', 'local-env.mjs'), 'utf8');
    const pw = readFileSync(join(REPO, 'playwright.config.ts'), 'utf8');
    const keysOf = (src: string): string[] => {
      const block = /const GENERATED_KEYS = \[([\s\S]*?)\];/.exec(src);
      expect(block, 'GENERATED_KEYS list').not.toBeNull();
      return [...block![1]!.matchAll(/'([A-Z0-9_]+)'/g)].map((m) => m[1]!).sort();
    };
    expect(keysOf(pw)).toEqual(keysOf(canonical));
  });

  it('every least-privilege authority credential is in the list', () => {
    const canonical = readFileSync(join(REPO, 'scripts', 'local-env.mjs'), 'utf8');
    for (const key of [
      'EYE_DB_APP_PASSWORD', 'EYE_DB_COMMIT_PASSWORD', 'EYE_DB_IDENTITY_PASSWORD',
      'EYE_DB_PUBLISHER_PASSWORD', 'EYE_DB_VERIFIER_PASSWORD', 'EYE_DB_RECOVERY_PASSWORD',
      'EYE_DB_ALLOCATOR_PASSWORD',
    ]) {
      expect(canonical, key).toContain(`'${key}'`);
    }
  });

  it('the Playwright config repairs permissions before reading, and prefers the canonical loader', () => {
    const pw = readFileSync(join(REPO, 'playwright.config.ts'), 'utf8');
    expect(pw).toContain('repairPermissions');
    expect(pw).toContain("chmodSync(dir, 0o700)");
    expect(pw).toContain("chmodSync(file, 0o600)");
    expect(pw).toContain("require('./scripts/local-env.cjs')");
    // And it refuses to start a browser run with a missing authority.
    expect(pw).toContain('was not provided by the secret loader');
  });

  it('the CJS bridge derives its key list FROM the canonical module (no second copy)', () => {
    const bridge = readFileSync(join(REPO, 'scripts', 'local-env.cjs'), 'utf8');
    expect(bridge).toContain("readFileSync(join(root, 'scripts', 'local-env.mjs')");
    expect(bridge).toContain('GENERATED_KEYS');
  });
});

// ═════════════════════════════════════════════════════════════════════════════
describe('G21-§9 — the secret handoff is COMPLETE and internally consistent', () => {
  /**
   * Two invariants, both learned from real gate failures:
   *   (a) the handoff file records every credential actually in use — persisting
   *       only the generated ones left later processes unable to find a value that
   *       a caller's environment had supplied;
   *   (b) EYE_DB_MIGRATE_PASSWORD is DERIVED from the superuser password and must
   *       never be preserved once that changes, or the migration runner fails with
   *       `password authentication failed for user "eye"`.
   */
  const loaderSource = (): string => readFileSync(join(REPO, 'scripts', 'local-env.mjs'), 'utf8');

  it('records every resolved credential, including caller-supplied ones', () => {
    const src = loaderSource();
    // The resolver writes whatever wins, rather than only what it generated.
    expect(src).toMatch(/const resolve = \(key, fallback\) =>/);
    expect(src).toContain('if (stored[key] !== value)');
    expect(src).not.toMatch(/if \(process\.env\[key\]\) continue;/); // the old, incomplete rule
  });

  it('treats the migrate credential as derived, never as preserved state', () => {
    const src = loaderSource();
    expect(src).toContain("const migrate = process.env['EYE_DB_MIGRATE_PASSWORD'] ?? process.env['EYE_DB_PASSWORD']");
    expect(src).toContain("if (stored['EYE_DB_MIGRATE_PASSWORD'] !== migrate)");
  });

  it('demo.sh delegates to the canonical loader instead of re-implementing it', () => {
    const demo = readFileSync(join(REPO, 'scripts', 'demo.sh'), 'utf8');
    expect(demo).toContain("import('./scripts/local-env.mjs')");
    // The old bash generator is gone.
    expect(demo).not.toContain('openssl rand -base64 24');
    // And it refuses to start with an incomplete handoff.
    expect(demo).toContain('missing from the secret handoff');
  });

  it('the virgin-run verifiers release pinned container names BEFORE tearing down', () => {
    // Otherwise `docker compose down -v` removes neither the containers nor the
    // volumes, and a "virgin" run silently reuses a stale database.
    // C18 replaced verify-db-paths.sh; its runner never touches the pinned compose
    // containers at all (fresh per-run containers with generated names), so only
    // verify-demo.sh still carries this hazard.
    for (const script of ['verify-demo.sh']) {
      // Executable lines only: both strings also appear in the comments that
      // explain why the order matters.
      const lines = readFileSync(join(REPO, 'scripts', script), 'utf8')
        .split('\n')
        .map((l) => l.trim())
        .filter((l) => !l.startsWith('#'));
      const rmAt = lines.findIndex((l) => l.includes('docker rm -f eye-postgres eye-redis'));
      const downAt = lines.findIndex((l) => l.includes('docker compose down -v'));
      expect(rmAt, `${script}: name release present`).toBeGreaterThan(-1);
      expect(downAt, `${script}: teardown present`).toBeGreaterThan(-1);
      expect(rmAt, `${script}: release must precede teardown`).toBeLessThan(downAt);
    }
  });

  it('the database-path verifier PROVES virginity structurally rather than assuming it', () => {
    // C18 replaced verify-db-paths.sh. Its runner cannot reuse a stale database BY
    // CONSTRUCTION: every path gets a freshly created container with per-run generated
    // names and credentials, and the migration-ledger contract requires the EXACT
    // expected row set, which any pre-used database fails.
    const src = readFileSync(join(REPO, 'scripts', 'gate', 'c18-db-paths.mjs'), 'utf8');
    expect(src).not.toContain('eye-postgres');
    expect(src).toContain('fresh container, fresh credentials, fresh names');
    expect(src).toContain("'docker', 'run', '-d', '--name'");
  });
});
