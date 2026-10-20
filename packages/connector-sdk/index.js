/**
 * @eye/connector-sdk 1.0.0 — THE PUBLISHED CONNECTOR SDK (CP-6 B40 §CR, F-P1-12: L1-C02, V03-T-440, DP-14-003, DAT-IN-02).
 *
 * What a connector — first-party or customer-written — is held to, in one versioned, dependency-free package (node built-ins only; no
 * build step: the files published are the files that run, so the cell's code is exactly what its digest names):
 *
 *   THE CONNECTOR CONTRACT (index.d.ts): a connector performs transport framing and safety validation only and returns FRAMED ITEMS
 *     (an item key, the bytes, the declared media type, the publisher's own time when it publishes one); admission, inspection, custody
 *     and the canonical objects are the platform's lifecycle, never the connector's (IA-47-003). The first-party connectors (upload, rss,
 *     rest) implement this contract inside the API; a customer-written ADAPTER implements `acquire(ctx)` below and runs in a CELL.
 *   THE CELL PROTOCOL `eye-cell/1`: one child process per run (the API's confined launcher — Node's permission model, the environment
 *     stripped, no credential), the start frame on stdin, JSON-lines frames on stdout (hello · item · log · done · error). An adapter is an
 *     ES module exporting `async function acquire(ctx)`; `ctx.gatewayFetch(url, init)` is its ONLY intended egress — the API's loopback
 *     EGRESS GATEWAY, which checks the destination against the contract, the purpose and data class, the rate, injects the credential and
 *     writes a transfer receipt; `ctx.emit(item)` frames an item; `ctx.log(text)` leaves a line for the run's record.
 *   THE PACKAGE DIGEST: sha256 over "<file>\0<sha256>\n" for the package's files sorted by name (byte order) — what the adapter package
 *     register records and the cell re-verifies before every run.
 *
 * NOT CLAIMED (DESIGN D3): Node's permission model has no network switch; the gateway is the intended egress, and a direct socket from a
 * cell is not prevented by the OS here — network-level denial is B103 / B109, then R1.
 */
import { createHash } from 'node:crypto';
import { request as httpRequest } from 'node:http';

export const SDK_NAME = '@eye/connector-sdk';
export const SDK_VERSION = '1.0.0';
export const CELL_PROTOCOL = 'eye-cell/1';
/** Every connector kind a source contract may name; the first-party ones run in the API, `adapter` runs in a cell. */
export const CONNECTOR_KINDS = Object.freeze(['upload', 'rss', 'rest', 'adapter']);
export const FIRST_PARTY_CONNECTOR_KINDS = Object.freeze(['upload', 'rss', 'rest']);
/** The cell's bounds, enforced on both sides (the runtime refuses to emit past them; the API refuses a frame past them). */
export const CELL_LIMITS = Object.freeze({
  maxItems: 1000,
  maxItemBytes: 4 * 1024 * 1024,
  maxItemKeyChars: 512,
  maxLogLines: 200,
  maxLogChars: 500,
  maxErrorChars: 500,
});
/** The gateway's request path and the header carrying the run's cell token (a per-run random value; it authorizes nothing outside the run). */
export const GATEWAY_PATH = '/v1/fetch';
export const GATEWAY_TOKEN_HEADER = 'x-eye-cell-token';
/** The frame types of eye-cell/1, in the order a run may produce them (hello first; done or error last). */
export const FRAME_TYPES = Object.freeze(['hello', 'item', 'log', 'done', 'error']);

const HOST_RE = /^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?(\.[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?)+$/;
const SEMVER_RE = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(-[0-9A-Za-z.-]+)?$/;
const FILE_RE = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/;
const HEX64_RE = /^[0-9a-f]{64}$/;

/** A refusal by the egress gateway (or the gateway unreachable): the adapter sees the class, never a credential or another run's data. */
export class GatewayRefused extends Error {
  constructor(refusalClass, message) {
    super(message);
    this.name = 'GatewayRefused';
    this.refusalClass = refusalClass;
  }
}

export function sha256Hex(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}

/** The package digest: sha256 over "<file>\0<sha256>\n" for the files sorted by name in byte order. */
export function packageDigest(files) {
  const sorted = [...files].sort((a, b) => Buffer.compare(Buffer.from(a.file, 'utf8'), Buffer.from(b.file, 'utf8')));
  return sha256Hex(sorted.map((f) => `${f.file}\0${f.sha256}\n`).join(''));
}

const statements = (v, what, problems) => {
  if (!Array.isArray(v) || v.length < 1 || v.length > 20 || v.some((x) => typeof x !== 'string' || x.trim().length < 2 || x.length > 200)) {
    problems.push(`${what} names 1 to 20 statements of 2 to 200 characters`);
  }
};

/**
 * The manifest (adapter.json) a package carries: name, semver version, an .mjs entry among its files, the destination HOSTS it may ask
 * the gateway for, its purposes and data classes, its author, the cell protocol. Answers `{ ok, problems }`.
 */
export function validateAdapterManifest(m, fileNames = null) {
  const problems = [];
  if (m === null || typeof m !== 'object' || Array.isArray(m)) return { ok: false, problems: ['the manifest is an object'] };
  if (typeof m.name !== 'string' || !/^[a-z0-9][a-z0-9-]{1,63}$/.test(m.name)) problems.push('name is 2 to 64 lower-case letters, digits and hyphens');
  if (typeof m.version !== 'string' || !SEMVER_RE.test(m.version)) problems.push('version is a semantic version (major.minor.patch)');
  if (typeof m.entry !== 'string' || !FILE_RE.test(m.entry) || !m.entry.endsWith('.mjs')) problems.push('entry names an .mjs file of the package');
  else if (fileNames !== null && !fileNames.includes(m.entry)) problems.push(`entry ${m.entry} is not a file of the package`);
  if (!Array.isArray(m.declared_destinations) || m.declared_destinations.length < 1 || m.declared_destinations.length > 32
      || m.declared_destinations.some((d) => typeof d !== 'string' || !HOST_RE.test(d))) {
    problems.push('declared_destinations names 1 to 32 host names (lower case, no scheme, no port)');
  }
  statements(m.purposes, 'purposes', problems);
  statements(m.data_classes, 'data_classes', problems);
  if (typeof m.author !== 'string' || m.author.trim().length < 2 || m.author.length > 256) problems.push('author names who wrote the package (2 to 256 characters)');
  if (m.protocol !== CELL_PROTOCOL) problems.push(`protocol is ${CELL_PROTOCOL} (the cell protocol this SDK speaks); the manifest says ${JSON.stringify(m.protocol ?? null)}`);
  return { ok: problems.length === 0, problems };
}

/** A package file name the register accepts (no directory, no traversal). */
export function isPackageFileName(name) {
  return typeof name === 'string' && FILE_RE.test(name) && name !== '.' && name !== '..';
}

export function encodeFrame(frame) {
  return `${JSON.stringify(frame)}\n`;
}

/** One frame checked against eye-cell/1: the frame, or the problem in words. An item's bytes must digest to the sha256 it states. */
export function validateFrame(x) {
  if (x === null || typeof x !== 'object' || Array.isArray(x)) return { problem: 'a frame is a JSON object' };
  switch (x.t) {
    case 'hello':
      if (x.protocol !== CELL_PROTOCOL) return { problem: `hello names protocol ${JSON.stringify(x.protocol ?? null)}, not ${CELL_PROTOCOL}` };
      return { frame: { t: 'hello', protocol: x.protocol, sdk: typeof x.sdk === 'string' ? x.sdk : null,
        package: { name: String(x.package?.name ?? ''), version: String(x.package?.version ?? '') } } };
    case 'item': {
      if (typeof x.itemKey !== 'string' || x.itemKey.length < 1 || x.itemKey.length > CELL_LIMITS.maxItemKeyChars) return { problem: `an item key is 1 to ${CELL_LIMITS.maxItemKeyChars} characters` };
      if (typeof x.bytes !== 'string' || !/^[A-Za-z0-9+/]*={0,2}$/.test(x.bytes)) return { problem: `item ${x.itemKey}: bytes are base64` };
      const bytes = Buffer.from(x.bytes, 'base64');
      if (bytes.byteLength > CELL_LIMITS.maxItemBytes) return { problem: `item ${x.itemKey}: ${bytes.byteLength} bytes exceed the cell's ${CELL_LIMITS.maxItemBytes}` };
      if (typeof x.sha256 !== 'string' || !HEX64_RE.test(x.sha256) || sha256Hex(bytes) !== x.sha256) return { problem: `item ${x.itemKey}: the bytes do not digest to the sha256 the frame states` };
      if (x.mediaType !== null && x.mediaType !== undefined && (typeof x.mediaType !== 'string' || x.mediaType.length > 200)) return { problem: `item ${x.itemKey}: mediaType is text or null` };
      if (x.publisherTime !== null && x.publisherTime !== undefined && (typeof x.publisherTime !== 'string' || !Number.isFinite(Date.parse(x.publisherTime)))) {
        return { problem: `item ${x.itemKey}: publisherTime is an ISO instant or null` };
      }
      if (x.filename !== null && x.filename !== undefined && (typeof x.filename !== 'string' || x.filename.length > 255)) return { problem: `item ${x.itemKey}: filename is text or null` };
      return { frame: { t: 'item', itemKey: x.itemKey, bytes, sha256: x.sha256, mediaType: x.mediaType ?? null, publisherTime: x.publisherTime ?? null, filename: x.filename ?? null } };
    }
    case 'log':
      return { frame: { t: 'log', msg: String(x.msg ?? '').slice(0, CELL_LIMITS.maxLogChars) } };
    case 'done':
      if (x.checkpoint !== null && x.checkpoint !== undefined && (typeof x.checkpoint !== 'object' || Array.isArray(x.checkpoint))) return { problem: 'done carries a checkpoint object or null' };
      return { frame: { t: 'done', checkpoint: x.checkpoint ?? null } };
    case 'error':
      return { frame: { t: 'error', class: String(x.class ?? 'adapter_error').slice(0, 80), refusalClass: typeof x.refusalClass === 'string' ? x.refusalClass.slice(0, 80) : null,
        message: String(x.message ?? '').slice(0, CELL_LIMITS.maxErrorChars) } };
    default:
      return { problem: `unknown frame type ${JSON.stringify(x.t ?? null)} (eye-cell/1 frames: ${FRAME_TYPES.join(', ')})` };
  }
}

/** Every line of a cell's stdout as frames; a line that is not a valid frame is a PROBLEM (the API fails such a run closed). */
export function parseFrames(text) {
  const frames = [];
  const problems = [];
  const lines = text.split('\n');
  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];
    if (line === '' && i === lines.length - 1) continue;
    let parsed;
    try { parsed = JSON.parse(line); } catch { problems.push(`line ${i + 1} is not JSON`); continue; }
    const v = validateFrame(parsed);
    if (v.problem !== undefined) problems.push(`line ${i + 1}: ${v.problem}`);
    else frames.push(v.frame);
  }
  return { frames, problems };
}

/**
 * The adapter's ONLY intended egress: a request to the run's egress gateway on loopback. `init` may name the purpose and the data class
 * of the request (defaults: the package's first) and an `accept` header; nothing else of a request is the adapter's to set — no other
 * header (the credential is the gateway's), no body (a cell acquires; it does not send data out). Answers `{ status, headers, body }`
 * (`body` a Uint8Array); a refusal throws GatewayRefused with its class.
 */
export function createGatewayFetch(gateway) {
  const base = new URL(gateway.url);
  if (base.protocol !== 'http:' || !['127.0.0.1', '[::1]', 'localhost'].includes(base.hostname)) {
    throw new GatewayRefused('gateway_unavailable', 'the gateway is reached on loopback only');
  }
  const timeoutMs = Number.isInteger(gateway.timeoutMs) ? gateway.timeoutMs : 120_000;
  return async function gatewayFetch(target, init = {}) {
    const body = Buffer.from(JSON.stringify({
      url: String(target), method: typeof init.method === 'string' ? init.method.toUpperCase() : 'GET',
      accept: typeof init.headers?.accept === 'string' ? init.headers.accept.slice(0, 200) : null,
      purpose: typeof init.purpose === 'string' ? init.purpose : null,
      data_class: typeof init.dataClass === 'string' ? init.dataClass : null,
    }), 'utf8');
    const answer = await new Promise((resolve, reject) => {
      const req = httpRequest({
        host: base.hostname.replace(/^\[|\]$/g, ''), port: Number(base.port), path: GATEWAY_PATH, method: 'POST', agent: false,
        headers: { 'content-type': 'application/json', 'content-length': String(body.byteLength), [GATEWAY_TOKEN_HEADER]: gateway.token },
        timeout: timeoutMs,
      }, (res) => {
        const chunks = [];
        res.on('data', (c) => chunks.push(c));
        res.on('end', () => resolve({ status: res.statusCode ?? 0, text: Buffer.concat(chunks).toString('utf8') }));
        res.on('error', () => reject(new GatewayRefused('gateway_unavailable', 'the gateway answer was cut off')));
      });
      req.on('timeout', () => { req.destroy(); reject(new GatewayRefused('gateway_unavailable', 'the gateway did not answer in time')); });
      req.on('error', () => reject(new GatewayRefused('gateway_unavailable', 'the egress gateway is not reachable')));
      req.end(body);
    });
    let parsed;
    try { parsed = JSON.parse(answer.text); } catch { throw new GatewayRefused('gateway_unavailable', `the gateway answered ${answer.status} without a readable body`); }
    if (parsed.ok !== true) throw new GatewayRefused(String(parsed.class ?? 'refused'), String(parsed.reason ?? 'the gateway refused the request'));
    return { status: parsed.status, headers: parsed.headers ?? {}, body: new Uint8Array(Buffer.from(String(parsed.body_b64 ?? ''), 'base64')) };
  };
}
