/**
 * CP-6 B40 §AP (V03-T-073) — robots.txt, FETCHED THROUGH THE SAME VETTED CLIENT the connectors use (connectors/http-client.ts: the contract's
 * own host allowlist, resolve-and-vet with the pinned address, TLS verified, size and time caps) — or, for a replay contract, the replay set's
 * recorded answer for `<origin>/robots.txt` (the same responder, the digest verified) — CACHED PER CONTRACT VERSION and origin in
 * observation.acquisition_robots, and evaluated per path (policy-model.ts robotsVerdict). RFC 9309 §2.3.1: a 4xx answer means no robots
 * file (everything allowed — recorded as such); a 5xx answer or a transport failure means unreachable — the caller refuses `unavailable`
 * (fail closed; F52). No request ever leaves for a path the cached rules disallow.
 */
import { createHash } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import { EYE_CONFIG } from '../../config/config.module.js';
import type { EyeConfig } from '../../config/config.js';
import { egress as liveEgress, type EgressPolicy, type EgressResult } from '../connectors/http-client.js';
import { ReplayResponder } from '../connectors/replay.js';
import * as fault from '../fault-injection.js';
import { ROBOTS_MAX_BYTES, parseRobots, type RobotsGroup } from './policy-model.js';
import { AcquisitionPolicyStore, type RunRef } from './policy-store.js';

export type RobotsEgress = (a: { url: string; headers: Record<string, string>; policy: EgressPolicy }) => Promise<EgressResult>;
export type RobotsFetch =
  | { outcome: 'fetched' | 'no_robots_file'; groups: RobotsGroup[]; status: number | null; robotsId: string; via: 'replay' | 'live' }
  | { outcome: 'unavailable'; reason: string; status: number | null; robotsId: string | null; via: 'replay' | 'live' };

@Injectable()
export class RobotsService {
  private egressForTests: RobotsEgress | null = null;

  constructor(@Inject(EYE_CONFIG) private readonly cfg: EyeConfig, private readonly store: AcquisitionPolicyStore) {}

  /** TEST CONTROL ONLY: the transport (a synthetic double, or B14's loopback substitution) — never reachable outside the test runtime. */
  useEgressForTests(egress: RobotsEgress | null): void {
    if (this.cfg['eye.runtime.env'] !== 'test') throw new Error('useEgressForTests is available only in the test runtime');
    this.egressForTests = egress;
  }

  /** The policy robots.txt is fetched under: the contract's own hosts, https only, the deployment's caps (the connectors' policy), 512 KiB. */
  policyFor(endpoints: string[]): EgressPolicy {
    return {
      hostAllowlist: [...new Set(endpoints.map((e) => { try { return new URL(e).hostname.toLowerCase(); } catch { return ''; } }).filter((h) => h !== ''))],
      schemeAllowlist: ['https'], maxRedirects: this.cfg['eye.connector.max_redirects'], timeoutMs: this.cfg['eye.connector.request_timeout_ms'],
      maxResponseBytes: ROBOTS_MAX_BYTES, maxDecompressedBytes: ROBOTS_MAX_BYTES * 2,
    };
  }

  /** Fetch (between transactions — no I/O inside one) and record robots.txt for one origin of the run's contract version. */
  async fetch(run: RunRef, origin: string, a: { mode: 'replay' | 'live'; replaySet: string; endpoints: string[] }): Promise<RobotsFetch> {
    const url = `${origin}/robots.txt`;
    let status: number | null = null; let body: Buffer | null = null;
    try {
      fault.at('f52.robots_fetch_failure');
      if (a.mode === 'replay') {
        const got = await new ReplayResponder(this.cfg['eye.connector.replay_root']).fetch(a.replaySet, url);
        if (got === null) {
          const robotsId = await this.store.recordRobots(run, { origin, outcome: 'no_robots_file', status: null, digest: null, bytes: null, rules: [], via: 'replay',
            detail: `the replay set ${a.replaySet} records no robots.txt for ${origin}: no robots file (RFC 9309 §2.3.1.3) — every path allowed` });
          return { outcome: 'no_robots_file', groups: [], status: null, robotsId, via: 'replay' };
        }
        status = got.entry.status; body = got.body;
      } else {
        const res = await (this.egressForTests ?? liveEgress)({ url, headers: { accept: 'text/plain' }, policy: this.policyFor(a.endpoints) });
        status = res.status; body = res.body;
      }
    } catch (e) {
      const reason = `robots.txt for ${origin} could not be fetched (${(e as Error).message.slice(0, 200)}) — unreachable (RFC 9309 §2.3.1.4): refused, fail closed`;
      const robotsId = await this.store.recordRobots(run, { origin, outcome: 'unavailable', status: null, digest: null, bytes: null, rules: [], via: a.mode, detail: reason })
        .catch(() => null);
      return { outcome: 'unavailable', reason, status: null, robotsId, via: a.mode };
    }
    if (status !== null && status >= 200 && status < 300 && body !== null) {
      const groups = parseRobots(body.toString('utf8'));
      const robotsId = await this.store.recordRobots(run, { origin, outcome: 'fetched', status, digest: createHash('sha256').update(body).digest('hex'),
        bytes: body.byteLength, rules: groups, via: a.mode, detail: `robots.txt fetched (${body.byteLength} bytes, ${groups.length} group(s)) — cached for contract version ${run.contractVersion}` });
      return { outcome: 'fetched', groups, status, robotsId, via: a.mode };
    }
    if (status !== null && status >= 400 && status < 500) {
      const robotsId = await this.store.recordRobots(run, { origin, outcome: 'no_robots_file', status, digest: null, bytes: null, rules: [], via: a.mode,
        detail: `robots.txt answered ${status}: no robots file (RFC 9309 §2.3.1.3) — every path allowed` });
      return { outcome: 'no_robots_file', groups: [], status, robotsId, via: a.mode };
    }
    const reason = `robots.txt for ${origin} answered ${status ?? 'nothing'} — unreachable (RFC 9309 §2.3.1.4): refused, fail closed`;
    const robotsId = await this.store.recordRobots(run, { origin, outcome: 'unavailable', status, digest: null, bytes: null, rules: [], via: a.mode, detail: reason })
      .catch(() => null);
    return { outcome: 'unavailable', reason, status, robotsId, via: a.mode };
  }
}
