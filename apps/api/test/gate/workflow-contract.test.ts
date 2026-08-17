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

import {
  FINALIZER_JOB, FINALIZER_RUNNER_LABEL, FINALIZER_WORKFLOW_NAME,
  REQUIRED_FINALIZER_STEPS,
} from '../../../../scripts/gate/c17-cross-host-finalization.mjs';
import {
  FINALIZED_ARTIFACT_PREFIX, REQUIRED_ARTIFACT_PREFIX,
} from '../../../../scripts/gate/lib/hosted-run.mjs';

const REPO = join(__dirname, '..', '..', '..', '..');
const WORKFLOW = join(REPO, '.github', 'workflows', 'ci.yml');
const FINALIZER_WORKFLOW = join(REPO, '.github', 'workflows', 'c17-finalize.yml');
const API_PACKAGE = join(REPO, 'apps', 'api', 'package.json');
const HERMETIC_META = 'test/gate/hermetic-suite-meta.test.ts';

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

type Step = { name?: string; run?: string; uses?: string; with?: Record<string, unknown> };
type Job = { steps?: Step[] };

function jobs(): Record<string, Job> {
  return (parseYaml(readFileSync(WORKFLOW, 'utf8')) as { jobs: Record<string, Job> }).jobs;
}

describe('C16-R3.4.2 §5 — only supply-chain performs live scanning', () => {
  it('runs the nested hermetic meta-suite in a separate, non-parallel Vitest phase', () => {
    const pkg = JSON.parse(readFileSync(API_PACKAGE, 'utf8')) as {
      scripts?: Record<string, string>;
    };
    const test = pkg.scripts?.test ?? '';
    const phases = test.split(/\s*&&\s*/);
    expect(phases, 'the API test command must have exactly two ordered phases').toHaveLength(2);
    expect(phases[0]).toBe(`vitest run --exclude ${HERMETIC_META}`);
    expect(phases[1]).toBe(`vitest run ${HERMETIC_META} --no-file-parallelism`);
  });

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

  it('the workflow_run finalizer exactly matches the verifier-owned job and step names', () => {
    const doc = parseYaml(readFileSync(FINALIZER_WORKFLOW, 'utf8')) as {
      name: string;
      on: { workflow_run: { workflows: string[]; types: string[] } };
      jobs: Record<string, Job & { 'runs-on'?: string; 'timeout-minutes'?: number }>;
    };
    expect(doc.name).toBe(FINALIZER_WORKFLOW_NAME);
    expect(doc.on.workflow_run).toEqual({ workflows: ['ci'], types: ['completed'] });
    expect(Object.keys(doc.jobs)).toEqual([FINALIZER_JOB]);
    const job = doc.jobs[FINALIZER_JOB];
    expect(job['runs-on']).toBe(FINALIZER_RUNNER_LABEL);
    expect(job['timeout-minutes']).toBe(45);
    const names = (job.steps ?? []).map((step) => step.name).filter((name): name is string => name !== undefined);
    expect(names).toEqual([...REQUIRED_FINALIZER_STEPS]);
  });

  it('the finalizer has exactly five immutable actions and uploads the verifier-owned artifact', () => {
    const doc = parseYaml(readFileSync(FINALIZER_WORKFLOW, 'utf8')) as {
      jobs: Record<string, Job>;
    };
    const steps = doc.jobs[FINALIZER_JOB].steps ?? [];
    const actions = steps.filter((step) => step.uses !== undefined);
    expect(actions, 'checkout, pnpm, node, source download and finalized upload').toHaveLength(5);
    for (const step of actions) {
      expect(step.uses, `${step.uses} must be commit-pinned`).toMatch(/^[^@]+@[0-9a-f]{40}$/);
    }
    const pnpm = actions.find((step) => step.uses?.startsWith('pnpm/action-setup@'));
    expect(pnpm?.with).toEqual({ version: '11.9.0' });
    const node = actions.find((step) => step.uses?.startsWith('actions/setup-node@'));
    expect(node?.with).toEqual({ 'node-version': '24.11.1', cache: 'pnpm' });
    const upload = steps.find((step) => step.name === 'Upload the FINALIZED cross-host evidence');
    // The finalizer's OWN attempt scopes its upload; the SOURCE run's attempt scopes the download.
    expect(upload?.with?.name).toBe(
      `${FINALIZED_ARTIFACT_PREFIX}a${'${{ github.run_attempt }}'}-${'${{ env.C17_FINALIZED_SHA256 }}'}`,
    );
    const download = steps.find((step) => step.name === 'Download the archive the SOURCE run produced');
    expect(download?.with?.pattern).toBe(
      `${REQUIRED_ARTIFACT_PREFIX}a${'${{ github.event.workflow_run.run_attempt }}'}-*`,
    );
    expect(download?.with?.['merge-multiple']).toBe(true);
    const runs = steps.map((step) => step.run ?? '').join('\n');
    expect(runs).toContain('c17-cross-host-finalization.mjs receipt');
    expect(runs).toContain('c17-cross-host-finalization.mjs create');
    expect(runs).toContain('c17-cross-host-finalization.mjs verify');
    expect(runs).toContain('--root "$PWD"');
  });

  it('the source workflow publishes an API-visible artifact name bound to the inner ZIP digest', () => {
    const steps = jobs()['supply-chain'].steps ?? [];
    const upload = steps.find((step) => step.name === 'Upload the C17 evidence archive');
    expect(upload?.with?.name).toBe(
      `${REQUIRED_ARTIFACT_PREFIX}a${'${{ github.run_attempt }}'}-${'${{ env.C17_ZIP_SHA256 }}'}`,
    );
  });
});
