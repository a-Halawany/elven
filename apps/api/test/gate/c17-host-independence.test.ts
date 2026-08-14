/**
 * C17.1 E — the licence inventory describes the TARGET, not the machine.
 *
 * C17 read the host-materialized `node_modules` and therefore failed closed on Darwin for the
 * six platform-gated `linux-x64-gnu` packages the declared targets contain. Failing closed was
 * correct behaviour for an incomplete inventory, but the inventory should not have been
 * incomplete: the targets are `linux-x64-glibc` and a machine's own architecture has nothing to
 * do with them.
 *
 * `pnpm-workspace.yaml` now declares `supportedArchitectures` covering linux/x64/glibc alongside
 * `current`, so a frozen install materializes the target's optional packages on every host. The
 * inventory becomes a function of the lockfile and the target descriptor, and the controls here
 * prove the host contributes nothing to it.
 */
import { describe, expect, it, beforeAll } from 'vitest';
import { readFileSync, mkdtempSync, rmSync, existsSync, readdirSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { parse as parseYaml } from 'yaml';

import { deriveC16Expectation } from '../../../../scripts/gate/generate-closures.mjs';
import { buildTargetInventory } from '../../../../scripts/gate/lib/license-closure.mjs';

const REPO = join(__dirname, '..', '..', '..', '..');
const GATE = join(REPO, 'scripts', 'gate', 'licence-obligations.mjs');
const RUN_DATE = '2026-08-15';
const TIMEOUT = 300_000;
const TARGETS = ['production', 'development'] as const;

/** The linux-x64 optional packages the declared targets contain. */
const TARGET_NATIVE = [
  '@img/sharp-libvips-linux-x64', '@img/sharp-linux-x64',
  '@msgpackr-extract/msgpackr-extract-linux-x64', '@next/swc-linux-x64-gnu',
  '@rolldown/binding-linux-x64-gnu', 'lightningcss-linux-x64-gnu',
];

describe('C17.1 E — host-independent target materialization', () => {
  let inventories: Record<string, any>;

  beforeAll(() => {
    const derived = deriveC16Expectation({ root: REPO, asOfDate: RUN_DATE });
    inventories = Object.fromEntries(TARGETS.map((t) => [
      t, buildTargetInventory({ root: REPO, target: t, closure: derived.closures[t] }),
    ]));
  }, TIMEOUT);

  it('the supported architectures are DECLARED in tracked source, covering the targets', () => {
    const ws = parseYaml(readFileSync(join(REPO, 'pnpm-workspace.yaml'), 'utf8')) as any;
    const sa = ws.supportedArchitectures;
    expect(sa, 'pnpm-workspace.yaml must declare supportedArchitectures').toBeDefined();
    expect(sa.os).toContain('linux');
    expect(sa.cpu).toContain('x64');
    expect(sa.libc).toContain('glibc');
    // `current` is retained so a developer's own platform still runs the app.
    expect(sa.os).toContain('current');
  });

  it('every linux-x64 target package is MATERIALIZED on this host', () => {
    const store = join(REPO, 'node_modules', '.pnpm');
    const entries = readdirSync(store);
    for (const name of TARGET_NATIVE) {
      const encoded = name.replace(/\//g, '+');
      const found = entries.some((e) => e.startsWith(`${encoded}@`));
      expect(found, `${name} is not materialized; the inventory cannot describe the target`).toBe(true);
    }
  });

  it('both inventories are COMPLETE: zero unresolved on this host, whatever it is', () => {
    for (const t of TARGETS) {
      expect(inventories[t].unresolved, `${t} unresolved on ${process.platform}/${process.arch}`)
        .toEqual([]);
      expect(inventories[t].components.length).toBeGreaterThan(150);
    }
  });

  it('no host os/arch/libc value becomes closure truth', () => {
    // The closure's platform constraints come from the tracked descriptor, never from the
    // machine. Asserted by DERIVING with a descriptor read from source and checking the
    // recorded target platform is the declared one, not this process's.
    const descriptor = JSON.parse(readFileSync(join(REPO, 'scripts/gate/target-descriptor.json'), 'utf8'));
    const targets = Object.values(descriptor.targets) as Array<Record<string, string>>;
    expect(targets.length).toBeGreaterThan(0);
    for (const t of targets) {
      expect(t.os).toBe('linux');
      expect(t.arch).toBe('x64');
      expect(t.libc).toBe('glibc');
    }
    // And no inventory record carries a host-derived platform string.
    const serialized = JSON.stringify(inventories);
    expect(serialized).not.toContain(process.platform === 'darwin' ? '"darwin"' : '"__never__"');
    expect(serialized).not.toContain(process.arch === 'arm64' ? '"arm64"' : '"__never__"');
  });

  /** Run the gate and ASSERT ITS EXIT CODE before any byte comparison. */
  const runGate = (outDir: string, env: Record<string, string> = {}) => {
    const r = spawnSync(process.execPath, [GATE, '--out', outDir, '--as-of', RUN_DATE], {
      cwd: REPO, encoding: 'utf8', timeout: TIMEOUT, maxBuffer: 64 * 1024 * 1024,
      env: { ...process.env, ...env },
    });
    expect(r.status, `the gate must succeed before its bytes mean anything:\n${(r.stdout ?? '').slice(-1500)}${(r.stderr ?? '').slice(-800)}`).toBe(0);
    return r;
  };

  it('artifacts are byte-identical across directories, runs and a hostile environment — exit codes asserted first', () => {
    const dirs = [
      mkdtempSync(join(tmpdir(), 'eye-c17e-a-')),
      mkdtempSync(join(tmpdir(), 'eye-c17e-b-')),
      mkdtempSync(join(tmpdir(), 'eye-c17e-c-')),
    ];
    try {
      runGate(dirs[0]);
      runGate(dirs[1], { TZ: 'Pacific/Kiritimati', LANG: 'tr_TR.UTF-8', LC_ALL: 'tr_TR.UTF-8' });
      // Hostile claimed platform: these must not reach the artifacts at all.
      runGate(dirs[2], { npm_config_arch: 'ppc64', npm_config_platform: 'aix', TZ: 'UTC' });
      const artifacts = [
        'license-inventory.json', 'license-obligations.json',
        'license-reconciliation.json', 'THIRD_PARTY_NOTICES.md',
      ];
      for (const a of artifacts) {
        const first = readFileSync(join(dirs[0], a));
        for (const d of dirs.slice(1)) {
          const other = readFileSync(join(d, a));
          expect(other.byteLength, `${a} length differs`).toBe(first.byteLength);
          expect(other.equals(first), `${a} is not byte-identical across runs`).toBe(true);
        }
      }
      expect(readFileSync(join(dirs[0], 'license-inventory.json')).byteLength).toBeGreaterThan(10_000);
      for (const d of dirs) expect(existsSync(join(d, 'RESULT-PASS.txt'))).toBe(true);
    } finally {
      for (const d of dirs) rmSync(d, { recursive: true, force: true });
    }
  }, TIMEOUT);
});
