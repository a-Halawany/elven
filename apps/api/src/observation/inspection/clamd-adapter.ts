/**
 * CP-6 B40 §IN — ENGINE 2, A REAL ClamAV ENGINE OVER clamd (DESIGN D2, the owner's word; L1-C07, V03-T-074, DAT-IN-11). The clamd protocol
 * over TCP — `zPING`, `zVERSION`, `zINSTREAM` (length-prefixed chunks, a zero-length terminator) — with no dependency (node:net).
 *
 * THE IDENTITY ON EVERY VERDICT: the engine version and the DAILY signature database's version and build time as clamd reports them
 * (`VERSION` → "ClamAV 1.5.4/28159/Tue Oct 20 06:24:12 2026"), the OCI image digest the deployment configures (EYE_CLAMAV_IMAGE_DIGEST; null
 * — and said so — when it names none), and the databases the deployment DECLARES (EYE_CLAMAV_DB_MANIFEST: sigtool's name / version / build
 * time / sha256 recorded at the last freshclam) — the daily digest kept only when its declared version is the one clamd reports (never
 * inferred). THE SIGNATURE-DATABASE SOURCE AND UPDATE POLICY are configured EXPLICITLY (EYE_CLAMAV_DB_SOURCE, EYE_CLAMAV_DB_UPDATE_POLICY) and
 * recorded on every verdict; a deployment that names neither has no usable engine — its verdicts are `unavailable`.
 *
 * OUTCOMES (D2 — an unavailable or incomplete scan is NEVER clean): `stream: OK` → clean; `stream: <signature> FOUND` → detected (the
 * signature name is the finding's code); the engine unreachable, refusing, or silent past the timeout → unavailable; an answer cut off before
 * its terminator, the engine's stream-size refusal, or an item over the configured stream limit (not sent) → incomplete; any other engine
 * error answer → failed.
 *
 * THE IMAGE IS NOT ADMITTED (DESIGN "D2 — the admission result"): no docker-compose service, no C15 pin — the deployment points this adapter at
 * an engine it runs; the local evaluation engine (the unadmitted Debian image on loopback :3310) produced the recorded evaluation evidence.
 * EXC-P1-001 stays OPEN. The in-harness stand-in (the unit test's protocol server) serves the adapter's unit tests only.
 */
import { createConnection, type Socket } from 'node:net';
import * as fault from '../fault-injection.js';
import type { EngineIdentity, InspectionOutcome } from '../acquisition/intake-stage-types.js';
import { unavailableVerdict, type InspectionEngine, type RecordedEngineVerdict } from './engine-port.js';

export const CLAMAV_ENGINE = 'clamav';

export interface DeclaredDatabase { name: string; version: string | null; buildTime: string | null; digest: string | null }
export interface ClamdConfig {
  host: string;
  port: number;
  /** sha256:… of the image the engine runs from, as the deployment declares it; null when it names none (recorded null, said so). */
  imageDigest: string | null;
  /** Where the signature databases come from (named explicitly; recorded on every verdict). */
  databaseSource: string;
  /** How and when they are updated (named explicitly; recorded on every verdict). */
  updatePolicy: string;
  /** The databases as declared at the last update (sigtool --info); the daily entry is matched against what clamd reports. */
  databases: DeclaredDatabase[];
  /** The deployment's statement of the image's admission (DESIGN D2: not admitted — the owner decides). */
  admission: string;
  connectTimeoutMs: number;
  scanTimeoutMs: number;
  /** An item over this many bytes is not sent (the engine would refuse it): the verdict is `incomplete`. */
  maxStreamBytes: number;
  chunkBytes: number;
}

export const CLAMD_DEFAULTS = Object.freeze({ connectTimeoutMs: 2_000, scanTimeoutMs: 30_000, maxStreamBytes: 25 * 1024 * 1024, chunkBytes: 64 * 1024 });

/** The adapter's configuration from the environment: the config, or why there is none (the engine then answers `unavailable`). */
export function clamdConfigFromEnv(env: Record<string, string | undefined> = process.env): { config: ClamdConfig | null; problem: string | null } {
  const addr = env['EYE_CLAMD_ADDR'];
  if (addr === undefined || addr.trim() === '') return { config: null, problem: 'no clamd engine is configured for this deployment (EYE_CLAMD_ADDR is not set)' };
  const m = /^\[?([A-Za-z0-9.:-]+?)\]?:(\d{1,5})$/.exec(addr.trim());
  const port = m === null ? NaN : Number(m[2]);
  if (m === null || !Number.isInteger(port) || port < 1 || port > 65535) return { config: null, problem: 'EYE_CLAMD_ADDR is host:port' };
  const source = env['EYE_CLAMAV_DB_SOURCE']?.trim() ?? '';
  const policy = env['EYE_CLAMAV_DB_UPDATE_POLICY']?.trim() ?? '';
  if (source.length < 4 || policy.length < 4) {
    return { config: null, problem: 'the signature-database source and update policy are not configured explicitly (EYE_CLAMAV_DB_SOURCE, EYE_CLAMAV_DB_UPDATE_POLICY)' };
  }
  const image = env['EYE_CLAMAV_IMAGE_DIGEST']?.trim() ?? '';
  if (image !== '' && !/^sha256:[0-9a-f]{64}$/.test(image)) return { config: null, problem: 'EYE_CLAMAV_IMAGE_DIGEST is sha256:<64 hex>' };
  let databases: DeclaredDatabase[] = [];
  const raw = env['EYE_CLAMAV_DB_MANIFEST'];
  if (raw !== undefined && raw.trim() !== '') {
    try {
      const j = JSON.parse(raw) as unknown;
      if (!Array.isArray(j)) throw new Error('not a list');
      databases = j.map((d: unknown) => {
        const r = d as Record<string, unknown>;
        if (typeof r['name'] !== 'string' || !/^[a-z][a-z0-9_-]{0,40}$/.test(r['name'])) throw new Error('a database names itself');
        const digest = typeof r['digest'] === 'string' ? r['digest'] : null;
        if (digest !== null && !/^[0-9a-f]{64}$/.test(digest)) throw new Error('a digest is sha256 hex');
        return { name: r['name'], version: r['version'] == null ? null : String(r['version']), buildTime: typeof r['buildTime'] === 'string' ? r['buildTime'] : null, digest };
      });
    } catch (e) {
      return { config: null, problem: `EYE_CLAMAV_DB_MANIFEST is a JSON list of { name, version, buildTime, digest } (${e instanceof Error ? e.message : 'unreadable'})` };
    }
  }
  const num = (k: string, d: number, min: number, max: number) => { const v = Number(env[k] ?? d); return Number.isInteger(v) && v >= min && v <= max ? v : d; };
  return {
    config: {
      host: m[1] as string, port, imageDigest: image === '' ? null : image, databaseSource: source, updatePolicy: policy, databases,
      admission: env['EYE_CLAMAV_ADMISSION']?.trim() || 'not admitted under C15 (DESIGN D2 — the admission result; the owner decides)',
      connectTimeoutMs: num('EYE_CLAMD_CONNECT_TIMEOUT_MS', CLAMD_DEFAULTS.connectTimeoutMs, 100, 60_000),
      scanTimeoutMs: num('EYE_CLAMD_TIMEOUT_MS', CLAMD_DEFAULTS.scanTimeoutMs, 500, 600_000),
      maxStreamBytes: num('EYE_CLAMD_MAX_STREAM_BYTES', CLAMD_DEFAULTS.maxStreamBytes, 1, 4 * 1024 * 1024 * 1024 - 1),
      chunkBytes: CLAMD_DEFAULTS.chunkBytes,
    },
    problem: null,
  };
}

/* ── the protocol, pure ──────────────────────────────────────────────────────────────────────────────────────────────────────────── */
const MONTHS: Record<string, string> = { Jan: '01', Feb: '02', Mar: '03', Apr: '04', May: '05', Jun: '06', Jul: '07', Aug: '08', Sep: '09', Oct: '10', Nov: '11', Dec: '12' };
/** "ClamAV 1.5.4/28159/Tue Oct 20 06:24:12 2026" → the engine version, the daily database version and its build time (ISO, as the engine's clock states it). */
export function parseClamdVersion(reply: string): { engineVersion: string; dailyVersion: string | null; dailyBuildTime: string | null } | null {
  const m = /^ClamAV ([0-9][0-9A-Za-z.+~-]{0,40})(?:\/(\d{1,9})\/(.+))?$/.exec(reply.replace(/\0+$/, '').trim());
  if (m === null) return null;
  let iso: string | null = null;
  const t = m[3] === undefined ? null : /^\w{3} (\w{3}) +(\d{1,2}) (\d{2}):(\d{2}):(\d{2}) (\d{4})$/.exec(m[3].trim());
  if (t !== null && MONTHS[t[1] as string] !== undefined) iso = `${t[6]}-${MONTHS[t[1] as string]}-${String(t[2]).padStart(2, '0')}T${t[3]}:${t[4]}:${t[5]}Z`;
  return { engineVersion: m[1] as string, dailyVersion: m[2] ?? null, dailyBuildTime: iso };
}

/** The answer to an INSTREAM: its outcome and findings (never content: a signature NAME is the code). `terminated`: the NUL arrived. */
export function parseClamdScanReply(raw: string, terminated: boolean): { outcome: InspectionOutcome; findings: Array<{ code: string; class: string; detail: string }>; detail: string | null } {
  const reply = raw.replace(/\0+$/, '').trim();
  if (reply === '') return { outcome: 'unavailable', findings: [], detail: 'the engine closed the connection without an answer' };
  if (!terminated) return { outcome: 'incomplete', findings: [], detail: 'the engine\'s answer was cut off before its terminator' };
  const found = /^stream: (.{1,200}) FOUND$/.exec(reply);
  if (found !== null) return { outcome: 'detected', findings: [{ code: `clamav:${found[1]}`, class: 'malware', detail: 'a signature of the engine matched' }], detail: null };
  if (reply === 'stream: OK') return { outcome: 'clean', findings: [], detail: null };
  if (/size limit exceeded/i.test(reply)) return { outcome: 'incomplete', findings: [], detail: `the engine refused the stream at its size limit (${reply.slice(0, 120)})` };
  return { outcome: 'failed', findings: [], detail: `the engine answered with an error (${reply.slice(0, 160)})` };
}

/** INSTREAM's frames: a 4-byte big-endian length before each chunk, a zero length to end. */
export function* instreamFrames(bytes: Uint8Array, chunkBytes: number): Generator<Buffer> {
  for (let i = 0; i < bytes.length; i += chunkBytes) {
    const chunk = Buffer.from(bytes.subarray(i, Math.min(bytes.length, i + chunkBytes)));
    const head = Buffer.alloc(4); head.writeUInt32BE(chunk.length, 0);
    yield Buffer.concat([head, chunk]);
  }
  yield Buffer.alloc(4);
}

export class ClamdUnavailable extends Error {
  constructor(readonly reason: 'refused' | 'timeout' | 'error' | 'injected', message: string) { super(message); }
}

/* ── the adapter ─────────────────────────────────────────────────────────────────────────────────────────────────────────────────── */
export class ClamdAdapter implements InspectionEngine {
  readonly name = CLAMAV_ENGINE;
  constructor(readonly cfg: ClamdConfig) {}

  /** The INSTREAM command (a seam: the protocol unit tests and the real-engine harness provoke an engine error answer through it). */
  instreamCommand(): Buffer { return Buffer.from('zINSTREAM\0', 'latin1'); }
  /** The frames sent for an item (a seam, as above: the harness declares an oversized chunk to provoke the engine's stream-limit refusal). */
  frames(bytes: Uint8Array): Iterable<Buffer> { return instreamFrames(bytes, this.cfg.chunkBytes); }

  /** One exchange: connect, send the command and the frames, read until the NUL terminator or the close. */
  async exchange(command: Buffer, frames: Iterable<Buffer> = [], timeoutMs = this.cfg.scanTimeoutMs): Promise<{ reply: string; terminated: boolean }> {
    return new Promise((resolve, reject) => {
      let settled = false; let connected = false; const got: Buffer[] = [];
      const sock: Socket = createConnection({ host: this.cfg.host, port: this.cfg.port });
      const done = (f: () => void) => { if (settled) return; settled = true; clearTimeout(connectTimer); clearTimeout(timer); sock.destroy(); f(); };
      const connectTimer = setTimeout(() => done(() => reject(new ClamdUnavailable('timeout', `no connection to the engine within ${this.cfg.connectTimeoutMs} ms`))), this.cfg.connectTimeoutMs);
      const timer = setTimeout(() => done(() => {
        const text = Buffer.concat(got).toString('utf8');
        if (text.length > 0) resolve({ reply: text, terminated: false });
        else reject(new ClamdUnavailable('timeout', `the engine did not answer within ${timeoutMs} ms`));
      }), timeoutMs);
      sock.on('connect', () => {
        connected = true; clearTimeout(connectTimer);
        sock.write(command);
        for (const f of frames) { if (sock.destroyed || !sock.writable) break; sock.write(f); }
      });
      sock.on('data', (c: Buffer) => {
        got.push(c);
        if (c.includes(0)) done(() => resolve({ reply: Buffer.concat(got).toString('utf8'), terminated: true }));
      });
      sock.on('error', (e: NodeJS.ErrnoException) => {
        // a write after the engine closed (it refused the stream and answered) is not the end: what it answered is read on close
        if (connected && (e.code === 'EPIPE' || e.code === 'ECONNRESET') && got.length > 0) return;
        done(() => (got.length > 0 ? resolve({ reply: Buffer.concat(got).toString('utf8'), terminated: Buffer.concat(got).includes(0) })
          : reject(new ClamdUnavailable(e.code === 'ECONNREFUSED' ? 'refused' : 'error', `the engine could not be reached (${e.code ?? 'error'})`))));
      });
      sock.on('close', () => done(() => {
        const all = Buffer.concat(got);
        if (all.length > 0) resolve({ reply: all.toString('utf8'), terminated: all.includes(0) });
        else reject(new ClamdUnavailable('error', 'the engine closed the connection without an answer'));
      }));
    });
  }

  async ping(): Promise<boolean> {
    try { return (await this.exchange(Buffer.from('zPING\0', 'latin1'), [], this.cfg.connectTimeoutMs)).reply.replace(/\0+$/, '').trim() === 'PONG'; } catch { return false; }
  }

  /** The engine's identity NOW (VERSION), the declared databases joined to it; null when the engine does not answer. */
  async identity(): Promise<{ identity: EngineIdentity; reported: string } | null> {
    let r: { reply: string };
    try { r = await this.exchange(Buffer.from('zVERSION\0', 'latin1'), [], this.cfg.connectTimeoutMs + 2_000); } catch { return null; }
    const v = parseClamdVersion(r.reply);
    if (v === null) return null;
    const declaredDaily = this.cfg.databases.find((d) => d.name === 'daily');
    const daily = v.dailyVersion === null ? [] : [{
      name: 'daily', version: v.dailyVersion, buildTime: v.dailyBuildTime,
      digest: declaredDaily !== undefined && declaredDaily.version === v.dailyVersion ? declaredDaily.digest : null,
    }];
    return {
      reported: r.reply.replace(/\0+$/, '').trim(),
      identity: {
        engine: CLAMAV_ENGINE, engineVersion: v.engineVersion, imageDigest: this.cfg.imageDigest, ruleSetDigest: null,
        signatureDatabases: [...daily, ...this.cfg.databases.filter((d) => d.name !== 'daily')],
      },
    };
  }

  private config(reported: string | null): Record<string, unknown> {
    return {
      address: `${this.cfg.host}:${this.cfg.port}`, database_source: this.cfg.databaseSource, update_policy: this.cfg.updatePolicy,
      image_digest_declared: this.cfg.imageDigest !== null, admission: this.cfg.admission, version_reported: reported,
      databases_basis: 'daily: as the engine reports it (VERSION), its digest only when the declared manifest names the same version; main / bytecode: the deployment\'s declared manifest (sigtool --info at the last update)',
      stream_limit_bytes: this.cfg.maxStreamBytes, scan_timeout_ms: this.cfg.scanTimeoutMs,
    };
  }

  /** Scan one item. Never throws: every way it can end is a verdict, and none but `stream: OK` is clean (D2). */
  async inspect(bytes: Uint8Array): Promise<RecordedEngineVerdict> {
    const startedAt = new Date().toISOString();
    try {
      fault.at('f49.clamd_unavailable');   // B40 in (F49): the engine is unavailable — answered below, fail closed
    } catch (e) {
      return unavailableVerdict(CLAMAV_ENGINE, `the clamd engine is unavailable (${e instanceof Error ? e.message : 'injected'})`, this.config(null));
    }
    const id = await this.identity();
    if (id === null) return { ...unavailableVerdict(CLAMAV_ENGINE, `the clamd engine at ${this.cfg.host}:${this.cfg.port} did not answer VERSION — unreachable or not a clamd`, this.config(null)), startedAt };
    const verdict = (outcome: InspectionOutcome, findings: RecordedEngineVerdict['findings'], detail: string | null): RecordedEngineVerdict => ({
      identity: id.identity, outcome, findings, startedAt, finishedAt: new Date().toISOString(), ...(detail === null ? {} : { detail }), engineConfig: this.config(id.reported),
    });
    if (bytes.byteLength > this.cfg.maxStreamBytes) {
      return verdict('incomplete', [{ code: 'clamav.limit.stream', offset: this.cfg.maxStreamBytes, length: bytes.byteLength - this.cfg.maxStreamBytes, detail: 'over the configured stream limit; not sent' }],
        `the item (${bytes.byteLength} bytes) exceeds the configured stream limit (${this.cfg.maxStreamBytes} bytes); it was not scanned`);
    }
    let r: { reply: string; terminated: boolean };
    try {
      r = await this.exchange(this.instreamCommand(), this.frames(bytes));
    } catch (e) {
      return verdict('unavailable', [], e instanceof Error ? e.message : 'the engine could not be reached');
    }
    const p = parseClamdScanReply(r.reply, r.terminated);
    return verdict(p.outcome, p.findings, p.detail);
  }
}
