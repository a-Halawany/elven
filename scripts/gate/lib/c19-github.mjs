/**
 * C19 — THE ONE GITHUB LAYER.
 *
 * Attempt resolution, artifact listing and run lookup existed in four places: two workflow YAML
 * files with their own `jq` filters, `c19-fixture.mjs`, and `c19-acquire.mjs`. They disagreed. The
 * YAML searched for "any successful ci run with this SHA" while the helper walked attempts, and the
 * harness therefore proved something different from what production did.
 *
 * Every GitHub read now goes through here, and every caller — controls, harness, publication,
 * recovery — uses the same functions. YAML supplies triggers, permissions and inputs; it does not
 * re-implement anything.
 *
 * ── FAIL CLOSED, INCLUDING ON PAGINATION ──
 *
 * A truncated page looks exactly like a short answer. `listAll` follows Link headers to exhaustion
 * and REFUSES if it cannot confirm it reached the end — a resolver that silently saw half the runs
 * would pick a "canonical earliest" that is neither.
 */

import { spawnSync } from 'node:child_process';

/** Every read is injectable, so controls drive real code paths without a network. */
export function createGitHub({
  repo,
  token = process.env.GITHUB_TOKEN,
  request = defaultRequest,
} = {}) {
  if (typeof repo !== 'string' || !/^[^/]+\/[^/]+$/.test(repo)) {
    throw new Error(`c19-github: repo ${JSON.stringify(repo)} is not owner/name`);
  }

  const api = (path, { raw = false } = {}) => request({ path, token, raw });

  /**
   * Follow pagination to exhaustion. A page that cannot be fetched, or a link chain that does not
   * terminate, is an error — never a short list.
   */
  const listAll = (path, collect) => {
    const out = [];
    let next = path;
    let guard = 0;
    while (next !== null) {
      if (guard > 100) throw new Error(`c19-github: pagination did not terminate for ${path}`);
      guard += 1;
      const res = api(next);
      if (res.ok !== true) {
        throw new Error(`c19-github: ${next} failed (${res.status ?? 'no status'}); refusing to `
          + 'treat an unreadable page as an empty one');
      }
      out.push(...collect(res.body));
      next = res.nextPage ?? null;
    }
    return out;
  };

  return {
    repo,

    /** Every workflow run for a head SHA, across all pages. */
    runsForSha(sha) {
      return listAll(`repos/${repo}/actions/runs?head_sha=${sha}&per_page=100`,
        (b) => b.workflow_runs ?? []);
    },

    /** One attempt of one run. `null` means GitHub has no such attempt. */
    runAttempt(runId, attempt) {
      const res = api(`repos/${repo}/actions/runs/${runId}/attempts/${attempt}`);
      if (res.status === 404) return null;
      if (res.ok !== true) {
        // An API error is NOT "the attempt does not exist". Conflating them lets a transient
        // failure silently promote a later attempt to canonical.
        throw new Error(`c19-github: attempt ${runId}/${attempt} could not be read `
          + `(${res.status ?? 'no status'}); an unavailable earlier attempt is fail-closed`);
      }
      return res.body;
    },

    /**
     * Artifacts of one run, across all pages.
     *
     * GitHub has no attempt-scoped artifacts endpoint — measured, not assumed:
     * `/runs/{id}/attempts/{n}/artifacts` returns 404, and the artifact object carries
     * `workflow_run.id` but no `run_attempt`. Attempt scoping therefore comes from this
     * repository's OWN artifact naming contract, which encodes it (`...-a<attempt>-`). That is
     * better than an API field would be: it is source-owned and already verified elsewhere.
     */
    artifacts(runId) {
      return listAll(`repos/${repo}/actions/runs/${runId}/artifacts?per_page=100`,
        (b) => b.artifacts ?? []);
    },

    /** One artifact's ZIP, as BYTES. Never decoded through a string. */
    artifactZip(artifactId) {
      const res = api(`repos/${repo}/actions/artifacts/${artifactId}/zip`, { raw: true });
      if (res.ok !== true) {
        throw new Error(`c19-github: artifact ${artifactId} could not be downloaded (${res.status})`);
      }
      return res.bytes;
    },

    /** The current tip of a branch. */
    branchTip(branch) {
      const res = api(`repos/${repo}/commits/${branch}`);
      if (res.ok !== true) throw new Error(`c19-github: branch ${branch} could not be read`);
      return res.body.sha;
    },
  };
}

/** The real transport. `gh` is used so the runner's own auth applies without handling a token here. */
function defaultRequest({ path, raw }) {
  const args = ['api', path];
  const r = raw
    ? spawnSync('gh', args, { maxBuffer: 512 * 1024 * 1024 })
    : spawnSync('gh', [...args, '--include'], { encoding: 'utf8', maxBuffer: 512 * 1024 * 1024 });

  if (raw) {
    if (r.status !== 0) return { ok: false, status: r.status };
    return { ok: true, bytes: r.stdout };
  }
  if (r.status !== 0) {
    const status = /HTTP\/[\d.]+ (\d+)/.exec(r.stdout ?? '')?.[1];
    return { ok: false, status: status === undefined ? r.status : Number(status) };
  }
  // `--include` gives headers then body; the Link header is how pagination is followed honestly.
  const split = (r.stdout ?? '').indexOf('\r\n\r\n');
  const headerText = split < 0 ? '' : r.stdout.slice(0, split);
  const bodyText = split < 0 ? (r.stdout ?? '') : r.stdout.slice(split + 4);
  let body;
  try { body = JSON.parse(bodyText); } catch { return { ok: false, status: 'unparseable body' }; }
  return { ok: true, status: 200, body, nextPage: parseNextLink(headerText) };
}

/** The `rel="next"` target of a Link header, as an API path. */
export function parseNextLink(headerText) {
  const line = String(headerText ?? '').split('\n').find((l) => /^link:/i.test(l.trim()));
  if (line === undefined) return null;
  for (const part of line.slice(line.indexOf(':') + 1).split(',')) {
    const m = /<([^>]+)>\s*;\s*rel="next"/.exec(part);
    if (m !== null) return m[1].replace(/^https:\/\/api\.github\.com\//, '');
  }
  return null;
}
