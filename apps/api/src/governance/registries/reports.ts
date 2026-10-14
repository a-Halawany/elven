/**
 * B107 §RG (0115_b107_x_rg) — THE VERIFICATION RECORD's normalisers (V04-T-012): a vitest JSON report, a playwright JSON report or a gate
 * receipt → one record with its IDENTITY (runner, files, schema / head / run identity, the build identity added by the service), EXECUTION
 * (times, success as reported, the runner environment) and VALIDITY (the population, what was skipped, what is NOT measured — coverage and
 * tolerances are stated as not measured, never invented) dimensions, and one CASE per test with its status and the requirement ids its
 * titles CITE (exact tokens; the port resolves them against the registry — never prose similarity). Pure; the port computes the result from
 * the cases, never from the report's own summary.
 */
import { requirementTokens, sha256 } from './importers.js';

type Row = Record<string, unknown>;
export type CaseStatus = 'passed' | 'failed' | 'skipped' | 'todo' | 'flaky' | 'unstated';
export interface VerificationCase { key: string; title: string; file: string; full_name: string; status: CaseStatus; duration_ms: number | null; cited: string[]; fixtures: string[] }
export interface VerificationReport {
  source_kind: 'vitest' | 'playwright' | 'gate_receipt'; source_name: string; source_digest: string; identity: Row; execution: Row; validity: Row;
  declared_result: string | null; cases: VerificationCase[];
}
export class ReportError extends Error {}

const str = (v: unknown): string => (typeof v === 'string' ? v : v === undefined || v === null ? '' : String(v));
/** A test's stable identity within the registry: `test:<repo-relative file>#<full name>`, hashed when longer than the key limit. */
export function testKey(file: string, fullName: string): string {
  const k = `test:${file}#${fullName}`;
  return k.length <= 200 ? k : `${k.slice(0, 135)}…#${sha256(k).slice(0, 63)}`;
}
/** A repository-relative path (the report's absolute paths are machine-specific; the identity must not be). */
export function relativeFile(p: string): string {
  const s = p.replace(/\\/g, '/');
  const m = /(?:^|\/)((?:apps|packages|scripts|e2e|audit)\/.*)$/.exec(s);
  return m !== null ? m[1]! : s.replace(/^.*\//, '');
}
const cite = (texts: string[], extra: string[]): string[] => [...new Set([...texts.flatMap((t) => requirementTokens(t)), ...extra])].slice(0, 50);

/** vitest --reporter=json */
export function fromVitest(name: string, raw: string, extraCite: string[] = [], fixtures: string[] = []): VerificationReport {
  let j: Row;
  try { j = JSON.parse(raw) as Row; } catch { throw new ReportError('the vitest report is not JSON'); }
  const results = j['testResults'];
  if (!Array.isArray(results)) throw new ReportError('a vitest JSON report has testResults');
  const cases: VerificationCase[] = []; const files: string[] = [];
  for (const f of results as Row[]) {
    const file = relativeFile(str(f['name'])); files.push(file);
    for (const a of (Array.isArray(f['assertionResults']) ? f['assertionResults'] : []) as Row[]) {
      const ancestors = (Array.isArray(a['ancestorTitles']) ? a['ancestorTitles'] : []).map(str);
      const full = str(a['fullName']) || [...ancestors, str(a['title'])].join(' ');
      const st = str(a['status']);
      const status: CaseStatus = st === 'passed' ? 'passed' : st === 'failed' ? 'failed' : st === 'skipped' || st === 'pending' ? 'skipped' : st === 'todo' ? 'todo' : 'unstated';
      cases.push({ key: testKey(file, full), title: full.slice(0, 500) || '(untitled)', file, full_name: full, status, duration_ms: typeof a['duration'] === 'number' ? a['duration'] : null,
                   cited: cite([...ancestors, str(a['title'])], extraCite), fixtures });
    }
  }
  const start = typeof j['startTime'] === 'number' ? new Date(j['startTime']).toISOString() : null;
  const ends = (results as Row[]).map((f) => (typeof f['endTime'] === 'number' ? f['endTime'] : 0));
  return {
    source_kind: 'vitest', source_name: name, source_digest: sha256(raw),
    identity: { runner: 'vitest', files: [...new Set(files)].sort(), test_count: cases.length },
    execution: { started_at: start, finished_at: ends.length > 0 && Math.max(...ends) > 0 ? new Date(Math.max(...ends)).toISOString() : null, reported_success: j['success'] ?? null,
                 seed: null, commands: 'vitest run --reporter=json (as produced by the runner; the command line is not carried by the report)' },
    validity: { population: cases.length, skipped: cases.filter((c) => c.status === 'skipped' || c.status === 'todo').length, coverage: 'not measured by this record',
                tolerances: 'none declared', limitations: 'a case verifies only the requirements its titles cite by exact id; a case citing none verifies nothing named' },
    declared_result: j['success'] === true ? 'passed' : j['success'] === false ? 'failed' : null, cases,
  };
}

/** playwright --reporter=json */
export function fromPlaywright(name: string, raw: string, extraCite: string[] = [], fixtures: string[] = []): VerificationReport {
  let j: Row;
  try { j = JSON.parse(raw) as Row; } catch { throw new ReportError('the playwright report is not JSON'); }
  if (!Array.isArray(j['suites'])) throw new ReportError('a playwright JSON report has suites');
  const cases: VerificationCase[] = []; const files = new Set<string>();
  const walk = (suite: Row, path: string[], fileOf: string) => {
    const file = relativeFile(str(suite['file']) || fileOf);
    const here = str(suite['title']) !== '' && str(suite['title']) !== str(suite['file']) ? [...path, str(suite['title'])] : path;
    for (const spec of (Array.isArray(suite['specs']) ? suite['specs'] : []) as Row[]) {
      for (const t of (Array.isArray(spec['tests']) ? spec['tests'] : []) as Row[]) {
        const st = str(t['status']);
        const status: CaseStatus = st === 'expected' ? 'passed' : st === 'unexpected' ? 'failed' : st === 'flaky' ? 'flaky' : st === 'skipped' ? 'skipped' : 'unstated';
        const project = str(t['projectName']);
        const full = [...here, str(spec['title'])].join(' › ') + (project !== '' ? ` [${project}]` : '');
        const results = (Array.isArray(t['results']) ? t['results'] : []) as Row[];
        files.add(file);
        cases.push({ key: testKey(file, full), title: full.slice(0, 500), file, full_name: full, status,
                     duration_ms: results.reduce((s, r) => s + (typeof r['duration'] === 'number' ? r['duration'] : 0), 0), cited: cite([...here, str(spec['title'])], extraCite), fixtures });
      }
    }
    for (const s of (Array.isArray(suite['suites']) ? suite['suites'] : []) as Row[]) walk(s, here, file);
  };
  for (const s of j['suites'] as Row[]) walk(s, [], str(s['file']));
  const stats = (j['stats'] ?? {}) as Row;
  return {
    source_kind: 'playwright', source_name: name, source_digest: sha256(raw),
    identity: { runner: 'playwright', files: [...files].sort(), test_count: cases.length, projects: [...new Set(cases.map((c) => /\[(.*)\]$/.exec(c.full_name)?.[1] ?? ''))].filter((x) => x !== '') },
    execution: { started_at: str(stats['startTime']) || null, duration_ms: typeof stats['duration'] === 'number' ? stats['duration'] : null, seed: null },
    validity: { population: cases.length, skipped: cases.filter((c) => c.status === 'skipped').length, flaky: cases.filter((c) => c.status === 'flaky').length, coverage: 'not measured by this record',
                tolerances: 'none declared', limitations: 'a case verifies only the requirements its titles cite by exact id' },
    declared_result: typeof stats['unexpected'] === 'number' ? (stats['unexpected'] === 0 ? 'passed' : 'failed') : null, cases,
  };
}

/** A gate receipt (a JSON object a gate wrote): ONE case — passed or failed only when the receipt DECLARES it (conclusion / result / status /
 *  ok); otherwise `unstated` (never inferred from the receipt's presence). */
export function fromGateReceipt(name: string, raw: string, extraCite: string[] = [], fixtures: string[] = []): VerificationReport {
  let j: Row;
  try { j = JSON.parse(raw) as Row; } catch { throw new ReportError('the gate receipt is not JSON'); }
  if (j === null || typeof j !== 'object' || Array.isArray(j)) throw new ReportError('a gate receipt is a JSON object');
  const declared = [j['conclusion'], j['source_conclusion'], j['result'], j['status'], j['ok']].find((v) => v !== undefined && v !== '');
  const d = declared === true || declared === 'success' || declared === 'passed' || declared === 'pass' ? 'passed'
          : declared === false || declared === 'failure' || declared === 'failed' || declared === 'fail' ? 'failed' : null;
  const gate = str(j['gate']) || str(j['control']) || str(j['workflow']) || str(j['schema_version']) || name;
  const full = `${gate} ${str(j['job']) || 'receipt'}`.trim();
  return {
    source_kind: 'gate_receipt', source_name: name, source_digest: sha256(raw),
    identity: { schema_version: j['schema_version'] ?? null, head_sha: j['head_sha'] ?? j['source_sha'] ?? null, repository: j['repository'] ?? null, workflow: j['workflow'] ?? null,
                job: j['job'] ?? null, run_id: j['run_id'] ?? null, run_attempt: j['run_attempt'] ?? null },
    execution: { as_of: j['as_of'] ?? null, hosted: j['hosted'] ?? null, runner_os: j['runner_os'] ?? null, runner_arch: j['runner_arch'] ?? null, event: j['event'] ?? null },
    validity: { population: 1, coverage: 'not measured by this record', limitations: 'a receipt is evidence of the gate run it names; its result is the one it declares' },
    declared_result: d,
    cases: [{ key: testKey(`gate:${gate}`, full), title: full.slice(0, 500), file: `gate:${gate}`, full_name: full, status: d ?? 'unstated', duration_ms: null,
              cited: cite([full], extraCite), fixtures }],
  };
}
