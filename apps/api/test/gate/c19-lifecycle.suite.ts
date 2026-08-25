/**
 * C19 — THE LIFECYCLE CONTAINMENT CONTROLS.
 *
 * These are the permanent controls for the three containment boundaries this pass closed. Each one
 * is a DIFFERENTIAL wherever a differential is meaningful: the frozen `a8d34c4` watchdog is run
 * against the same scenario as the corrected one, so every control proves the mutation is
 * non-vacuous rather than merely asserting that the current code passes.
 *
 * ── WHAT IS CLAIMED, AND WHAT IS NOT ──
 *
 * CLAIMED, for the governed and non-evasive gate workload this repository owns: SIGINT, SIGTERM
 * and SIGHUP delivered to the watchdog leave no owned process and no owned docker resource alive.
 * The only unhandleable signal is SIGKILL delivered directly to the watchdog itself.
 *
 * NOT CLAIMED: containment of arbitrary hostile code. A descendant that deliberately strips its
 * own ownership metadata, escapes its process group and exists only between census observations is
 * outside this boundary. That is not another ordinary lifecycle exception — it is a different
 * threat model. This is a cross-platform user-space lifecycle supervisor for a source-bound
 * workload, not a sandbox for an actively malicious child. The `DELIBERATE EVASION` control below
 * demonstrates that boundary explicitly rather than leaving it implied, and the source controls
 * prove the governed gate never removes or replaces the ownership markers.
 */
import { describe, expect, it } from 'vitest';
import { spawn, spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync, mkdtempSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = join(HERE, '..', '..', '..', '..');
const WATCHDOG = join(REPO, 'scripts', 'gate', 'c18-watchdog.mjs');
const FROZEN_SHA = 'a8d34c4';

/** The frozen predecessor, materialised from git so the differential cannot drift. */
function frozenWatchdog(): string {
  const dir = mkdtempSync(join(tmpdir(), 'c19-frozen-'));
  const r = spawnSync('git', ['show', `${FROZEN_SHA}:scripts/gate/c18-watchdog.mjs`],
    { cwd: REPO, encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 });
  if (r.status !== 0 || (r.stdout ?? '') === '') return '';
  const p = join(dir, 'frozen-watchdog.mjs');
  writeFileSync(p, r.stdout);
  return p;
}

const alive = (pid: number) => { try { process.kill(pid, 0); return true; } catch { return false; } };
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Run a watchdog over a child script, optionally signalling it once the child has announced. */
async function runWatchdog(wd: string, deadline: number, childSrc: string, opts: {
  signal?: NodeJS.Signals; waitFor?: RegExp;
} = {}): Promise<{ code: number | null; signal: string | null; out: string }> {
  const dir = mkdtempSync(join(tmpdir(), 'c19-child-'));
  const script = join(dir, 'child.mjs');
  writeFileSync(script, childSrc);
  return new Promise((resolve) => {
    let out = '';
    let signalled = false;
    const p = spawn(process.execPath, [wd, String(deadline), process.execPath, script],
      { cwd: REPO, stdio: ['ignore', 'pipe', 'pipe'] });
    const onData = (b: Buffer) => {
      out += b.toString();
      if (!signalled && opts.signal !== undefined && (opts.waitFor === undefined || opts.waitFor.test(out))) {
        signalled = true;
        try { process.kill(p.pid as number, opts.signal); } catch { /* already gone */ }
      }
    };
    p.stdout.on('data', onData);
    p.stderr.on('data', onData);
    p.on('close', (code, sig) => resolve({ code, signal: sig, out }));
  });
}

/** A child that leaves a grandchild in its OWN session, reparented to init when the child exits. */
const ESCAPEE_CHILD = `
import { spawn } from 'node:child_process';
const g = spawn(process.execPath, ['-e', 'process.on("SIGTERM",()=>{});setInterval(()=>{},1000)'],
  { detached: true, stdio: 'ignore' });
g.unref();
console.log('ESCAPEE:' + g.pid);
setInterval(() => {}, 1000);
`;

/** A child that ignores SIGTERM, so only a real escalation to SIGKILL can end it. */
const STUBBORN_CHILD = `
process.on('SIGTERM', () => {});
process.on('SIGINT', () => {});
process.on('SIGHUP', () => {});
console.log('STUBBORN:' + process.pid);
setInterval(() => {}, 1000);
`;

const pidFrom = (out: string, tag: string): number => Number(new RegExp(`${tag}:(\\d+)`).exec(out)?.[1] ?? 0);
const reap = (pid: number) => { try { if (pid > 0) process.kill(pid, 'SIGKILL'); } catch { /* gone */ } };

export function registerC19Lifecycle(): void {
  describe('C19 — external signals contain the whole owned tree', () => {
    const FROZEN = frozenWatchdog();

    it.each(['SIGINT', 'SIGTERM', 'SIGHUP'] as const)(
      'DIFFERENTIAL: %s — a8d34c4 leaks a reparented grandchild; the corrected watchdog contains it',
      async (sig) => {
        // LEG 1 — the frozen predecessor's behaviour, so the control cannot be vacuous.
        if (FROZEN !== '') {
          const old = await runWatchdog(FROZEN, 120, ESCAPEE_CHILD, { signal: sig, waitFor: /ESCAPEE:/ });
          const oldPid = pidFrom(old.out, 'ESCAPEE');
          await sleep(400);
          const leaked = alive(oldPid);
          reap(oldPid);
          expect(leaked, `a8d34c4 must leak the grandchild on ${sig}, or this control proves nothing`)
            .toBe(true);
        }
        // LEG 2 — the corrected watchdog contains it, and says so in its exit status.
        const now = await runWatchdog(WATCHDOG, 120, ESCAPEE_CHILD, { signal: sig, waitFor: /ESCAPEE:/ });
        const pid = pidFrom(now.out, 'ESCAPEE');
        await sleep(400);
        const survived = alive(pid);
        reap(pid);
        expect(survived, `the corrected watchdog must contain the grandchild on ${sig}`).toBe(false);
        expect(now.out).toMatch(/contained=true/);
      },
      120_000,
    );

    it.each([['SIGINT', 130], ['SIGTERM', 143], ['SIGHUP', 129]] as const)(
      'EXIT STATUS: %s reports 128+signum rather than a bare failure',
      async (sig, want) => {
        const r = await runWatchdog(WATCHDOG, 120, STUBBORN_CHILD,
          { signal: sig as NodeJS.Signals, waitFor: /STUBBORN:/ });
        const pid = pidFrom(r.out, 'STUBBORN');
        reap(pid);
        // a8d34c4 exited 1 here, which is indistinguishable from an ordinary child failure.
        expect(r.code).toBe(want);
      },
      120_000,
    );

    it('BOUNDED REAP: a child that ignores SIGTERM is escalated to SIGKILL and does not survive',
      async () => {
        const r = await runWatchdog(WATCHDOG, 120, STUBBORN_CHILD,
          { signal: 'SIGTERM', waitFor: /STUBBORN:/ });
        const pid = pidFrom(r.out, 'STUBBORN');
        await sleep(300);
        const survived = alive(pid);
        reap(pid);
        expect(survived).toBe(false);
        expect(r.out).toMatch(/contained=true/);
      }, 120_000);

    it('REPEATED SIGNALS: a second and third signal during shutdown change nothing', async () => {
      const dir = mkdtempSync(join(tmpdir(), 'c19-child-'));
      const script = join(dir, 'child.mjs');
      writeFileSync(script, STUBBORN_CHILD);
      const r = await new Promise<{ code: number | null; out: string }>((resolve) => {
        let out = '';
        let fired = false;
        const p = spawn(process.execPath, [WATCHDOG, '120', process.execPath, script],
          { cwd: REPO, stdio: ['ignore', 'pipe', 'pipe'] });
        const onData = (b: Buffer) => {
          out += b.toString();
          if (!fired && /STUBBORN:/.test(out)) {
            fired = true;
            for (const s of ['SIGTERM', 'SIGTERM', 'SIGINT'] as const) {
              try { process.kill(p.pid as number, s); } catch { /* gone */ }
            }
          }
        };
        p.stdout.on('data', onData);
        p.stderr.on('data', onData);
        p.on('close', (code) => resolve({ code, out }));
      });
      reap(pidFrom(r.out, 'STUBBORN'));
      expect(r.out).toMatch(/contained=true/);
      // The first signal decides the outcome; the rest must not produce a second shutdown.
      expect((r.out.match(/finished in/g) ?? []).length).toBe(1);
    }, 120_000);

    it('SHUTDOWN DURING SPAWNING: a signal racing the spawn never orphans anything', async () => {
      // Signals are handled from before the preflight, so the only unhandled window is this
      // module's own load — during which no child exists, and therefore nothing can be orphaned.
      // The control asserts that property directly rather than a particular exit code, because
      // the honest guarantee is "no survivor", not "always 143".
      for (const delay of [1, 5, 25, 80]) {
        const dir = mkdtempSync(join(tmpdir(), 'c19-child-'));
        const script = join(dir, 'child.mjs');
        writeFileSync(script, ESCAPEE_CHILD);
        const r = await new Promise<{ code: number | null; out: string }>((resolve) => {
          let out = '';
          const p = spawn(process.execPath, [WATCHDOG, '120', process.execPath, script],
            { cwd: REPO, stdio: ['ignore', 'pipe', 'pipe'] });
          setTimeout(() => { try { process.kill(p.pid as number, 'SIGTERM'); } catch { /* gone */ } }, delay);
          p.stdout.on('data', (b: Buffer) => { out += b.toString(); });
          p.stderr.on('data', (b: Buffer) => { out += b.toString(); });
          p.on('close', (code) => resolve({ code, out }));
        });
        await sleep(300);
        const pid = pidFrom(r.out, 'ESCAPEE');
        const survived = pid > 0 && alive(pid);
        reap(pid);
        expect(survived, `a signal at ${delay}ms must not leave an orphan behind`).toBe(false);
        // Whenever the child DID reach the point of announcing itself, the watchdog owned it and
        // must report the signal exit rather than a bare failure.
        if (pid > 0) expect(r.code).toBe(143);
      }
    }, 120_000);

    it('SECRET-SAFE OUTPUT: a credential in the environment never reaches the shutdown report',
      async () => {
        const canary = `c19canary${'9'.repeat(24)}`;
        const dir = mkdtempSync(join(tmpdir(), 'c19-child-'));
        const script = join(dir, 'child.mjs');
        writeFileSync(script, 'console.log("VALUE:" + process.env.EYE_DB_PASSWORD); setInterval(()=>{},1000);');
        const r = await new Promise<{ out: string }>((resolve) => {
          let out = '';
          const p = spawn(process.execPath, [WATCHDOG, '120', process.execPath, script], {
            cwd: REPO, stdio: ['ignore', 'pipe', 'pipe'],
            env: { ...process.env, EYE_DB_PASSWORD: canary },
          });
          const onData = (b: Buffer) => {
            out += b.toString();
            if (/VALUE:/.test(out)) { try { process.kill(p.pid as number, 'SIGTERM'); } catch { /* gone */ } }
          };
          p.stdout.on('data', onData);
          p.stderr.on('data', onData);
          p.on('close', () => resolve({ out }));
        });
        expect(r.out).not.toContain(canary);
        expect(r.out).toMatch(/REDACTED|VALUE:/);
      }, 120_000);
  });

  describe('C19 — nested watchdogs own their own subtree, in both directions', () => {
    it('an INNER watchdog does not own its parent, the outer runner, or its siblings', async () => {
      const src = `
import { spawn, spawnSync } from 'node:child_process';
const sibling = spawn(process.execPath, ['-e', 'setTimeout(()=>{},30000)'], { stdio: 'ignore' });
spawnSync(process.execPath, [${JSON.stringify(WATCHDOG)}, '30', process.execPath, '-e', '0'], { stdio: 'ignore' });
let live = false; try { process.kill(sibling.pid, 0); live = true; } catch {}
console.log('SIBLING_ALIVE:' + live);
console.log('SIBLING:' + sibling.pid);
sibling.kill('SIGKILL');
`;
      const r = await runWatchdog(WATCHDOG, 120, src);
      reap(pidFrom(r.out, 'SIBLING'));
      // The shared-marker design killed the entire outer run here — the test runner included.
      expect(r.out).toMatch(/SIBLING_ALIVE:true/);
    }, 120_000);

    it('an OUTER watchdog still contains a nested descendant that setsid\'d away', async () => {
      // The inner watchdog is SIGKILLed so it cannot clean up. Only chain ownership reaches the
      // grandchild it left behind.
      const src = `
import { spawn } from 'node:child_process';
const inner = spawn(process.execPath, [${JSON.stringify(WATCHDOG)}, '60', process.execPath, '-e',
  'const{spawn}=require("child_process");const g=spawn(process.execPath,["-e","setInterval(()=>{},1000)"],{detached:true,stdio:"ignore"});g.unref();console.log("ESCAPEE:"+g.pid);setInterval(()=>{},1000);'],
  { stdio: ['ignore', 'pipe', 'ignore'] });
let buf = '';
inner.stdout.on('data', (d) => {
  buf += d.toString();
  const m = /ESCAPEE:(\\d+)/.exec(buf);
  if (m !== null) {
    console.log('ESCAPEE:' + m[1]);
    process.kill(inner.pid, 'SIGKILL');
    setTimeout(() => process.exit(0), 300);
  }
});
`;
      const r = await runWatchdog(WATCHDOG, 120, src);
      const pid = pidFrom(r.out, 'ESCAPEE');
      await sleep(400);
      const survived = alive(pid);
      reap(pid);
      expect(survived, 'chain ownership must reach a nested orphan the inner watchdog could not clean up')
        .toBe(false);
    }, 120_000);
  });

  describe('C19 — the ownership contract is a source property, not a convention', () => {
    const watchdogSrc = readFileSync(WATCHDOG, 'utf8');

    it('ownership is CHAIN CONTAINMENT, which is what makes both nested directions correct', async () => {
      const wd = await import(/* @vite-ignore */ WATCHDOG);
      // An inner id does not appear in an outer-only chain, so the inner owns nothing above it…
      expect(wd.chainOwns('outer1', 'inner2')).toBe(false);
      // …and an outer id does appear in a nested chain, so the outer still owns what nests below.
      expect(wd.chainOwns('outer1,inner2', 'outer1')).toBe(true);
      expect(wd.chainOwns('outer1,inner2', 'inner2')).toBe(true);
      // An empty or malformed chain owns nothing, rather than owning everything.
      expect(wd.chainOwns('', 'outer1')).toBe(false);
      expect(wd.chainOwns('outer1', '')).toBe(false);
    });

    it('the ownership identifiers are named so the sanitiser cannot redact them', async () => {
      const wd = await import(/* @vite-ignore */ WATCHDOG);
      // A name containing TOKEN/SECRET/PASS/KEY would be classified as a credential, and its value
      // would then be redacted out of the containment diagnostics and the docker label itself.
      for (const name of [wd.RUN_ID_VAR, wd.RUN_CHAIN_VAR, wd.GATE_RESOURCE_VAR]) {
        expect(wd.isCredentialName(name), `${name} must not be classified as a credential`).toBe(false);
      }
    });

    it('the governed gate never removes or replaces the ownership markers', () => {
      // The declared spawn paths must PROPAGATE the environment, never reset it. A spawn that
      // replaced `env` wholesale would silently orphan everything it started.
      const gate = readFileSync(join(REPO, 'scripts', 'gate', 'c18-gate.mjs'), 'utf8');
      const producer = readFileSync(join(REPO, 'scripts', 'gate', 'c18-db-paths.mjs'), 'utf8');
      for (const [name, src] of [['c18-gate', gate], ['c18-db-paths', producer]] as const) {
        // Only real spawn call sites matter. An `env:` option handed to a helper is merged by
        // that helper; what must never happen is a spawn whose environment REPLACES the inherited
        // one, because everything it starts would then be unowned.
        for (const m of src.matchAll(/spawn(?:Sync)?\([\s\S]{0,400}?env:\s*\{([^}]*)\}/g)) {
          expect(m[1], `${name} spawns with an env that does not inherit; descendants would be unowned`)
            .toMatch(/\.\.\.process\.env/);
        }
        expect(src, `${name} must not delete an ownership marker`)
          .not.toMatch(/delete\s+\w*\.?env\[?['"`]?EYE_RUN_ID|delete\s+\w*\.?env\[?['"`]?EYE_GATE_RESOURCE_ID/);
      }
    });

    it('DELIBERATE EVASION is the stated boundary, demonstrated rather than implied', async () => {
      // A child that strips its own chain, escapes its group and never appears at a census sample
      // is NOT contained. This is the documented limit of a cross-platform user-space supervisor,
      // and it is a different threat model from the governed workload — not another lifecycle
      // exception. The control exists so the boundary is measured, not assumed.
      const src = `
import { spawn } from 'node:child_process';
const env = { ...process.env };
delete env.EYE_RUN_ID;
delete env.EYE_RUN_ID_CHAIN;
delete env.EYE_GATE_RESOURCE_ID;
const g = spawn(process.execPath, ['-e', 'setInterval(()=>{},1000)'],
  { detached: true, stdio: 'ignore', env });
g.unref();
console.log('EVADER:' + g.pid);
process.exit(0);
`;
      const r = await runWatchdog(WATCHDOG, 120, src);
      const pid = pidFrom(r.out, 'EVADER');
      await sleep(300);
      const survived = alive(pid);
      reap(pid);
      // Recorded as the boundary it is. If a future change DID contain this, the control fails and
      // the claim gets revisited deliberately rather than drifting upward by accident.
      expect(survived, 'deliberate evasion is outside the claimed boundary; if this now passes, '
        + 'the documented threat model must be re-examined and widened on purpose').toBe(true);
    }, 120_000);

    it('the source states the SIGKILL boundary and does not overclaim hostile containment', () => {
      expect(watchdogSrc).toMatch(/SIGKILL[^.]*(watchdog|this process)[^.]*unhandleable|unhandleable by any program/i);
      expect(watchdogSrc).toMatch(/deliberate evasion|scrubs the token|scrubs the marker|scrubs its chain/i);
    });
  });

  describe('C19 — docker resources are contained by exact ownership', () => {
    it('the sweep queries EXACT label ownership, never a name prefix or a global clean', async () => {
      const wd = await import(/* @vite-ignore */ WATCHDOG);
      const issued: string[] = [];
      const fake = (args: string[]) => { issued.push(args.join(' ')); return ''; };
      wd.dockerInventory('run-abc', fake);
      // Every query is label-scoped. A prefix match or a bare `docker ps -aq` would reach another
      // run's containers — on a shared runner, another job's.
      for (const q of issued) expect(q).toContain('--filter label=eye.gate.run=run-abc');
      expect(issued.some((q) => /--filter\s+name=/.test(q))).toBe(false);
      expect(issued.length).toBe(3);   // containers, networks, volumes
    });

    it('NON-VACUITY: a weakened cleanup leaves resources behind and is reported, not hidden', async () => {
      const wd = await import(/* @vite-ignore */ WATCHDOG);
      // A sweep whose remove commands do nothing — the shape of a cleanup that silently failed.
      const broken = (args: string[]) => (args[0] === 'ps' ? 'aaaaaa111111\n' : '');
      const bad = wd.sweepDockerResources('run-abc', broken);
      expect(bad.residue).toBeGreaterThan(0);
      expect(bad.removed).toBe(0);
      // A working sweep: the container disappears from the second inventory.
      let removed = false;
      const working = (args: string[]) => {
        if (args[0] === 'rm') { removed = true; return ''; }
        if (args[0] === 'ps') return removed ? '' : 'aaaaaa111111\n';
        return '';
      };
      const good = wd.sweepDockerResources('run-abc', working);
      expect(good.residue).toBe(0);
      expect(good.removed).toBe(1);
    });

    it('containment failure has its own exit code rather than being reported as success', async () => {
      const wd = await import(/* @vite-ignore */ WATCHDOG);
      expect(wd.CONTAINMENT_FAILURE_EXIT).toBe(125);
      expect(wd.CONTAINMENT_FAILURE_EXIT).not.toBe(0);
    });

    it('the producer stamps ownership AT CREATION, never adopting a resource afterwards', () => {
      const producer = readFileSync(join(REPO, 'scripts', 'gate', 'c18-db-paths.mjs'), 'utf8');
      // Every `docker run` the producer issues carries the label in the same argv that creates the
      // resource. Adopting afterwards would leave a window in which a crash strands it unowned.
      const runs = [...producer.matchAll(/'docker', 'run', '-d'[\s\S]{0,400}?\]/g)].map((m) => m[0]);
      expect(runs.length).toBeGreaterThan(0);
      for (const r of runs) expect(r).toMatch(/'--label', `\$\{DOCKER_RUN_LABEL\}=\$\{resourceId\}`/);
    });
  });

  describe('C19 — the anchor proves provenance, not the claims inside it', () => {
    const authorityPath = join(REPO, 'scripts', 'gate', 'lib', 'c19-authority.mjs');

    it('the ledger is self-consistent: nothing is closed without an independent authority', async () => {
      const a = await import(/* @vite-ignore */ authorityPath);
      expect(a.verifyAuthorityLedger()).toEqual([]);
    });

    it('NON-VACUITY: closing a claim without an independent authority is refused', async () => {
      const a = await import(/* @vite-ignore */ authorityPath);
      // The exact failure this file exists to prevent — a limit marked closed because the bytes
      // around it became signed.
      const forged = [{
        id: 'bootstrap-marking-instant', claim: 'the exact instant', authority: null,
        independent: false, proves: 'a bounded interval', closes: true,
      }];
      expect(a.verifyAuthorityLedger(forged).join('\n'))
        .toMatch(/marked closed without an independent authority/);
      // And a signature-bearing but self-asserted authority is equally refused.
      const selfSigned = [{
        id: 'x', claim: 'c', authority: 'local-dev', independent: false, proves: 'p', closes: true,
      }];
      expect(a.verifyAuthorityLedger(selfSigned).length).toBeGreaterThan(0);
    });

    it('every open limit says what would be required to close it', async () => {
      const a = await import(/* @vite-ignore */ authorityPath);
      expect(a.openLimits().length).toBeGreaterThan(0);
      for (const e of a.C19_CLAIM_AUTHORITY.filter((x: any) => !x.closes)) {
        expect(typeof e.wouldRequire, `${e.id} must say what would close it`).toBe('string');
        expect(e.wouldRequire.length).toBeGreaterThan(10);
      }
    });

    it('the database, identifier, secret, docker and clock claims all remain OPEN', async () => {
      const a = await import(/* @vite-ignore */ authorityPath);
      // These are exactly the claims a signature cannot testify to. If a future pass closes one,
      // it must do so by naming an authority, and this control is where that is noticed.
      expect(a.openLimits()).toEqual([
        'backend-assigned-identifiers', 'bootstrap-marking-instant', 'docker-resource-identity',
        'per-instance-generated-secrets', 'producer-local-clock',
      ]);
    });

    it('the anchor does not claim more than workflow identity, bytes, inclusion and a time window',
      async () => {
        const a = await import(/* @vite-ignore */ authorityPath);
        expect([...a.ANCHOR_PROVES].sort()).toEqual([
          'log-inclusion', 'publication-time-window', 'signed-bytes', 'workflow-identity',
        ]);
      });

    it('the C18 limits that C19 inherited are all still accounted for', async () => {
      const limits = await import(/* @vite-ignore */
        join(REPO, 'scripts', 'gate', 'lib', 'c18-observational-limits.mjs'));
      const a = await import(/* @vite-ignore */ authorityPath);
      const classified = new Set(a.C19_CLAIM_AUTHORITY.map((c: any) => c.id));
      // Every limit C18 declared must appear in the C19 classification — closed with a named
      // authority, or carried forward as still open. Silently dropping one is how a limit
      // disappears without ever being resolved.
      for (const id of limits.observationalLimitIds()) {
        expect(classified.has(id), `C18 limit '${id}' is not classified by C19`).toBe(true);
      }
    });
  });

  describe('C19 — credentials never enter a live command line', () => {
    it('the producer refuses to spawn a command carrying a credential in argv', async () => {
      const contract = await import(/* @vite-ignore */ join(REPO, 'scripts', 'gate', 'lib', 'c18-contract.mjs'));
      const secrets: Array<[string, string]> = [['a:EYE_DB_PASSWORD', 'sekret-value-000000000000']];
      // The value itself in argv.
      expect(() => contract.refuseCredentialArgv('probe',
        ['docker', 'exec', '-e', 'PGPASSWORD=sekret-value-000000000000'], secrets))
        .toThrow(/never argv/);
      // And a redaction placeholder, which PROVES a value stood there when it was recorded.
      expect(() => contract.refuseCredentialArgv('probe',
        ['redis-server', '--requirepass', '<REDACTED:a:EYE_REDIS_PASSWORD>'], secrets))
        .toThrow(/never argv/);
      // A clean command is not disturbed.
      expect(() => contract.refuseCredentialArgv('probe',
        ['docker', 'exec', '-i', 'c', 'sh', '-c', 'umask 077; cat > /run/secrets/pg'], secrets))
        .not.toThrow();
    });

    it('the handoff contract keeps the value out of argv, the container config and any disk', async () => {
      const c = await import(/* @vite-ignore */ join(REPO, 'scripts', 'gate', 'lib', 'c18-contract.mjs'));
      // tmpfs is memory-backed, so the secret is never part of the container's writable layer.
      expect(c.SECRET_TMPFS).toMatch(/^\/run\/secrets:/);
      expect(c.SECRET_TMPFS).toMatch(/mode=0700/);
      // The reader takes the secret from STDIN; its argv names only a path.
      expect(c.SECRET_SINK(c.PG_SECRET_PATH)).toMatch(/cat > \/run\/secrets\/pg$/);
      expect(c.SECRET_SINK(c.PG_SECRET_PATH)).not.toMatch(/REDACTED|password/i);
      // The entrypoints wait for the secret rather than receiving it as an argument.
      expect(c.PG_ENTRYPOINT).not.toMatch(/POSTGRES_PASSWORD=/);
      expect(c.REDIS_ENTRYPOINT).not.toMatch(/--requirepass\s+\S/);
      expect(c.REDIS_ENTRYPOINT).toMatch(/redis-server \/run\/secrets\/redis\.conf$/);
    });
  });
}
