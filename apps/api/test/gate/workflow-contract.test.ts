/**
 * C16-R3.4.2 §5 — the workflow contract: only `supply-chain` may touch the network.
 *
 * The R3.4.1 comment claimed build-test installed no scanners while the step immediately above
 * it still ran `install-scanners.sh`, and the hosted run executed it. A comment is not a
 * control. This parses the workflow and fails if any job other than `supply-chain` can install
 * a scanner, execute one, acquire a database or resolve a remote image.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parse as parseYaml } from 'yaml';

const REPO = join(__dirname, '..', '..', '..', '..');
const WORKFLOW = join(REPO, '.github', 'workflows', 'ci.yml');

/** The only job permitted to reach a scanner mirror, registry or vulnerability database. */
const LIVE_SCAN_JOB = 'supply-chain';

/** Commands that constitute live scanning, database acquisition or scanner installation. */
const FORBIDDEN = [
  { pattern: /install-scanners\.sh/, why: 'installs scanner binaries' },
  { pattern: /\btrivy\s/, why: 'executes trivy' },
  { pattern: /\bgitleaks\s/, why: 'executes gitleaks' },
  { pattern: /--download-db-only/, why: 'acquires a vulnerability database' },
  { pattern: /--cache-dir/, why: 'drives a trivy cache' },
  { pattern: /\bskopeo\b|\bcrane\b/, why: 'resolves remote image references' },
];

type Job = { steps?: Array<{ name?: string; run?: string; uses?: string }> };

function jobs(): Record<string, Job> {
  return (parseYaml(readFileSync(WORKFLOW, 'utf8')) as { jobs: Record<string, Job> }).jobs;
}

describe('C16-R3.4.2 §5 — only supply-chain performs live scanning', () => {
  it('the workflow parses and declares the three expected jobs', () => {
    const j = jobs();
    expect(Object.keys(j).sort()).toEqual(['browser-regression', 'build-test', 'supply-chain']);
  });

  it.each(['build-test', 'browser-regression'])(
    '%s installs no scanner, runs no scanner, acquires no database and resolves no image',
    (jobName) => {
      const job = jobs()[jobName];
      expect(job, `${jobName} must exist`).toBeDefined();
      const offences: string[] = [];
      for (const step of job.steps ?? []) {
        const run = step.run ?? '';
        for (const { pattern, why } of FORBIDDEN) {
          if (pattern.test(run)) {
            offences.push(`${jobName} › ${step.name ?? '(unnamed)'} ${why}: ${pattern}`);
          }
        }
      }
      expect(offences, offences.join('\n')).toEqual([]);
    },
  );

  it('supply-chain IS allowed to install and run scanners — the contract is not vacuous', () => {
    const steps = jobs()[LIVE_SCAN_JOB].steps ?? [];
    const runs = steps.map((s) => s.run ?? '').join('\n');
    expect(runs, 'the authoritative job must still install the pinned scanners')
      .toMatch(/install-scanners\.sh/);
  });

  it('the authoritative live job carries a bounded workflow-level timeout', () => {
    const raw = readFileSync(WORKFLOW, 'utf8');
    const scJob = raw.slice(raw.indexOf('  supply-chain:'));
    expect(scJob).toMatch(/timeout-minutes:\s*\d+/);
  });

  it('a rerun needs no source change: workflow_dispatch is declared', () => {
    const raw = readFileSync(WORKFLOW, 'utf8');
    expect(raw).toMatch(/^\s*workflow_dispatch:/m);
  });
});
