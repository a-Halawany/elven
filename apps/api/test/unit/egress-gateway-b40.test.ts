/**
 * CP-6 B40 §CR — THE EGRESS GATEWAY, THE PUBLISHED SDK AND THE CELL, without a database (unit): every decision the gateway takes and its
 * receipt; the live transport's resolve-vet-pin path against a LOOPBACK TLS server made here (its certificate generated at run time with
 * openssl and removed — never a committed key; the loopback resolver is B14's one transport substitution, handed to the transport
 * directly); and REAL cells — the SDK runtime under the §0 launcher running the fixture packages against the replay set, and an adversarial
 * adapter written at run time probing what the cell may do. D3 is stated, not claimed: the last case shows a cell CAN open a direct socket
 * (the permission model has no network switch; network-level denial is B103 / B109).
 * Everything here is SYNTHETIC.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync, copyFileSync } from 'node:fs';
import { createServer as createTlsServer, type Server as TlsServer } from 'node:https';
import { createServer as createNetServer, type Server as NetServer, type AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  EgressGateway, LiveTransport, ReplayTransport, resolveAllVetted, spkiPinOf, TransportRefusal, type GatewayPolicy, type Transport, type TransportAnswer, type TransportRequest,
} from '../../src/observation/connector-cell/egress-gateway.js';
import { loadSdk, locateSdk } from '../../src/observation/connector-cell/sdk-runtime.js';
import { ReplayResponder } from '../../src/observation/connectors/replay.js';
import { confinedSpawn } from '../../src/observation/sandbox/spawn-confined.js';

const REPO = join(__dirname, '..', '..', '..', '..');
const B40 = join(REPO, 'fixtures', 'phase7', 'b40');
const PARTNER = 'consignments.partner-logistics.synthetic.example';
const PAGE1 = `https://${PARTNER}/v1/consignments?page=1`;
const sha = (b: Uint8Array | string) => createHash('sha256').update(b).digest('hex');
type Sdk = Awaited<ReturnType<typeof loadSdk>>;
let sdk: Sdk;

const policy = (over: Partial<GatewayPolicy> = {}): GatewayPolicy => ({
  contractHosts: [PARTNER], packageHosts: [PARTNER], purposes: ['corridor monitoring', 'supply assurance'], dataClasses: ['consignment status (internal)'],
  schemes: ['https'], maxResponseBytes: 1024 * 1024, timeoutMs: 10_000, package: { id: '00000000-0000-4000-8000-000000000001', digest: 'a'.repeat(64) }, credential: null, ...over,
});
class FakeTransport implements Transport {
  readonly mode: 'live' | 'replay' = 'live';
  readonly seen: TransportRequest[] = [];
  constructor(private readonly body = '{"ok":true}') {}
  async fetch(req: TransportRequest): Promise<TransportAnswer> {
    this.seen.push(req);
    return { status: 200, headers: { 'content-type': 'application/json' }, body: Buffer.from(this.body), destination: { mode: 'live', addresses: ['203.0.113.7'], pinned_address: '203.0.113.7', tls_spki_sha256: 'A'.repeat(43) + '=', pin_state: 'first_use' } };
  }
}
/** Ask a gateway as a cell would (the SDK's own client), with an optional wrong token. */
async function ask(g: EgressGateway, at: { url: string; token: string }, url: string, init: Record<string, unknown> = {}, token?: string) {
  const fetch = sdk.createGatewayFetch({ url: at.url, token: token ?? at.token });
  try { return { ok: true as const, answer: await fetch(url, init) }; }
  catch (e) { return { ok: false as const, cls: (e as { refusalClass?: string }).refusalClass ?? 'unknown', message: (e as Error).message }; }
}

beforeAll(async () => { sdk = await loadSdk(); });

describe('B40 §CR · the published SDK (packages/connector-sdk)', () => {
  it('is located by path, versioned by semver, and its digest covers the files that run', () => {
    const at = locateSdk();
    expect(at).not.toBeNull();
    expect(at!.version).toMatch(/^\d+\.\d+\.\d+$/);
    expect(at!.files.map((f) => f.file)).toEqual(['cell-runtime.js', 'index.js', 'package.json']);
    for (const f of at!.files) expect(f.sha256).toBe(sha(readFileSync(join(at!.dir, f.file))));
    const pkg = JSON.parse(readFileSync(join(at!.dir, 'package.json'), 'utf8')) as Record<string, unknown>;
    expect(pkg).toMatchObject({ name: '@eye/connector-sdk', private: true, type: 'module' });
    expect(pkg['dependencies']).toBeUndefined();   // dependency-free (D18)
    expect(pkg['devDependencies']).toBeUndefined();
    expect(sdk.CELL_PROTOCOL).toBe('eye-cell/1');
    expect(sdk.FIRST_PARTY_CONNECTOR_KINDS).toEqual(['upload', 'rss', 'rest']);
  });
  it('the package digest of each fixture package is the SDK\'s (sorted by name) and the manifests speak eye-cell/1', () => {
    for (const v of ['1.0.0', '1.0.1']) {
      const dir = join(B40, 'adapter', `nordwerk-logistics-consignments-${v}`);
      const m = JSON.parse(readFileSync(join(dir, 'MANIFEST.json'), 'utf8')) as { files: Array<{ file: string; sha256: string }>; package_digest: string };
      expect(sdk.packageDigest([...m.files].reverse())).toBe(m.package_digest);   // order-independent: sorted by name
      const manifest = JSON.parse(readFileSync(join(dir, 'adapter.json'), 'utf8')) as unknown;
      expect(sdk.validateAdapterManifest(manifest, m.files.map((f) => f.file))).toEqual({ ok: true, problems: [] });
    }
    expect(sdk.validateAdapterManifest({ name: 'x', version: '1', entry: 'a.js', declared_destinations: ['https://h'], purposes: [], data_classes: [], author: '', protocol: 'other' }).problems.length).toBeGreaterThanOrEqual(7);
  });
  it('a frame whose bytes do not digest to its sha256, an unknown frame and a broken line are protocol problems', () => {
    const good = sdk.encodeFrame({ t: 'item', itemKey: 'k', bytes: Buffer.from('x').toString('base64'), sha256: sha('x') });
    const bad = sdk.encodeFrame({ t: 'item', itemKey: 'k', bytes: Buffer.from('x').toString('base64'), sha256: sha('y') });
    const r = sdk.parseFrames(`${good}${bad}${sdk.encodeFrame({ t: 'shell' })}not json\n`);
    expect(r.frames).toHaveLength(1);
    expect(r.problems).toEqual(['line 2: item k: the bytes do not digest to the sha256 the frame states', 'line 3: unknown frame type "shell" (eye-cell/1 frames: hello, item, log, done, error)', 'line 4 is not JSON']);
  });
});

describe('B40 §CR · the egress gateway — every decision leaves a receipt', () => {
  it('a caller without the run\'s token is refused (401) and recorded; the transport is never asked', async () => {
    const t = new FakeTransport(); const g = new EgressGateway(policy(), t); const at = await g.start();
    try {
      const r = await ask(g, at, PAGE1, {}, 'not-the-token-of-this-run-xxxxxxxxxxxxxxxxxx');
      expect(r).toMatchObject({ ok: false, cls: 'cell_token' });
      expect(g.receipts).toMatchObject([{ decision: 'refused', refusal_class: 'cell_token', host: '-', response_digest: null }]);
      expect(t.seen).toHaveLength(0);
    } finally { await g.stop(); }
  });
  it('an UNREGISTERED destination is BLOCKED before any transport — and a host the package does not declare is too', async () => {
    const t = new FakeTransport();
    const g = new EgressGateway(policy({ contractHosts: [PARTNER, 'other.synthetic.example'] }), t); const at = await g.start();
    try {
      expect(await ask(g, at, 'https://track.unregistered-carrier.synthetic.example/NWL-7703')).toMatchObject({ ok: false, cls: 'unregistered_destination' });
      expect(await ask(g, at, 'https://other.synthetic.example/x')).toMatchObject({ ok: false, cls: 'unregistered_destination' });
      expect(t.seen).toHaveLength(0);
      expect(g.receipts.map((r) => [r.decision, r.refusal_class, r.host])).toEqual([
        ['blocked', 'unregistered_destination', 'track.unregistered-carrier.synthetic.example'], ['blocked', 'unregistered_destination', 'other.synthetic.example']]);
      expect(g.receipts[0]!.reason).toMatch(/is not a destination the contract registers/);
      expect(g.receipts[1]!.reason).toMatch(/is not a destination the package declares/);
      expect(g.blocking).toMatchObject({ refusalClass: 'unregistered_destination', receiptId: g.receipts[0]!.receipt_id });
    } finally { await g.stop(); }
  });
  it('only GET, only https, only a purpose both name and a data class the package declares', async () => {
    const t = new FakeTransport(); const g = new EgressGateway(policy({ purposes: ['corridor monitoring'] }), t); const at = await g.start();
    try {
      expect(await ask(g, at, PAGE1, { method: 'POST' })).toMatchObject({ ok: false, cls: 'method' });
      expect(await ask(g, at, `http://${PARTNER}/v1`)).toMatchObject({ ok: false, cls: 'scheme' });
      expect(await ask(g, at, PAGE1, { purpose: 'supply assurance' })).toMatchObject({ ok: false, cls: 'purpose' });
      expect(await ask(g, at, PAGE1, { dataClass: 'personal data' })).toMatchObject({ ok: false, cls: 'data_class' });
      expect(t.seen).toHaveLength(0);
      expect(g.blocking).toBeNull();   // none of these is the connector's misbehaviour toward a destination
      expect(g.receipts.map((r) => r.refusal_class)).toEqual(['method', 'scheme', 'purpose', 'data_class']);
    } finally { await g.stop(); }
  });
  it('the throttle stage (§AP\'s, through the lifecycle\'s hook) is asked before EVERY request; its refusal is recorded and kept as the run\'s', async () => {
    const asked: string[] = []; let refuse = false;
    const t = new FakeTransport();
    const g = new EgressGateway(policy(), t, { throttle: async (r) => { asked.push(r.endpoint); if (refuse) throw Object.assign(new Error('probe: the bucket is empty'), { reasonClass: 'rate_limited' }); } });
    const at = await g.start();
    try {
      expect((await ask(g, at, PAGE1)).ok).toBe(true);
      refuse = true;
      expect(await ask(g, at, `https://${PARTNER}/v1/consignments?page=2`)).toMatchObject({ ok: false, cls: 'throttle' });
      expect(asked).toEqual([PAGE1, `https://${PARTNER}/v1/consignments?page=2`]);
      expect(t.seen).toHaveLength(1);
      expect((g.runError as Error).message).toBe('probe: the bucket is empty');
    } finally { await g.stop(); }
  });
  it('B40 integration: a publisher\'s 429 is REPORTED to the throttle stage (reportAnswer: the status and the raw Retry-After); its refusal is the run\'s, the exchange receipted', async () => {
    const reports: Array<Record<string, unknown>> = [];
    class Throttled extends FakeTransport {
      override async fetch(req: TransportRequest): Promise<TransportAnswer> {
        const a = await super.fetch(req);
        return { ...a, status: 429, headers: { ...a.headers, 'retry-after': '7' } };
      }
    }
    const t = new Throttled();
    const g = new EgressGateway(policy(), t, { throttle: async (r) => {
      reports.push({ ...r });
      if ((r as { answered?: unknown }).answered !== undefined) throw Object.assign(new Error('throttle refused (rate_limited): the publisher answered 429 (SYNTHETIC)'), { reasonClass: 'rate_limited' });
    } });
    const at = await g.start();
    try {
      expect(await ask(g, at, PAGE1)).toMatchObject({ ok: false });
      expect(reports).toEqual([{ endpoint: PAGE1 }, { endpoint: PAGE1, answered: { status: 429, retryAfter: '7' } }]);
      expect(t.seen).toHaveLength(1);
      expect((g.runError as Error).message).toMatch(/^throttle refused \(rate_limited\)/);
      expect(g.receipts.map((r) => [r.decision, r.response_status])).toEqual([['allowed', 429]]);
    } finally { await g.stop(); }
  });
  it('the run budget is spent per request and per byte; a breach refuses the request and is the run\'s error', async () => {
    let n = 0;
    const g = new EgressGateway(policy(), new FakeTransport(), { spendRequest: () => { n += 1; if (n > 1) throw new Error('run exceeded its 1-request budget'); } });
    const at = await g.start();
    try {
      expect((await ask(g, at, PAGE1)).ok).toBe(true);
      expect(await ask(g, at, PAGE1)).toMatchObject({ ok: false, cls: 'budget' });
      expect((g.runError as Error).message).toMatch(/1-request budget/);
    } finally { await g.stop(); }
  });
  it('an allowed request: the receipt carries digests and byte counts (never bytes) and the credential by REFERENCE; the cell never sees it', async () => {
    const t = new FakeTransport('{"consignments":[]}');
    const g = new EgressGateway(policy({ credential: { ref: 'EYE_SRC_PARTNER_TOKEN', header: 'x-partner-key', value: 'synthetic-credential-value-not-a-secret' } }), t);
    const at = await g.start();
    try {
      const r = await ask(g, at, PAGE1);
      expect(r.ok).toBe(true);
      if (r.ok) expect(Buffer.from(r.answer.body).toString()).toBe('{"consignments":[]}');
      expect(t.seen[0]!.credential).toEqual({ header: 'x-partner-key', value: 'synthetic-credential-value-not-a-secret' });
      const rc = g.receipts[0]!;
      expect(rc).toMatchObject({ decision: 'allowed', refusal_class: null, response_status: 200, response_bytes: 19, response_digest: sha('{"consignments":[]}'),
        credential_injected: true, credential_ref: 'EYE_SRC_PARTNER_TOKEN', purpose: 'corridor monitoring', data_class: 'consignment status (internal)' });
      expect(rc.request_digest).toMatch(/^[0-9a-f]{64}$/);
      expect(JSON.stringify(g.receipts)).not.toContain('synthetic-credential-value-not-a-secret');
      expect(JSON.stringify(r)).not.toContain('synthetic-credential-value-not-a-secret');
      expect(g.requestsMade).toBe(1); expect(g.bytesTransferred).toBe(19);
    } finally { await g.stop(); }
  });
  it('replay: the frozen set answers through the same gateway (the replay responder verifies the fixture\'s digest)', async () => {
    const g = new EgressGateway(policy(), new ReplayTransport(new ReplayResponder(join(B40, 'replay')), 'nordwerk-logistics-partner'));
    const at = await g.start();
    try {
      const r = await ask(g, at, PAGE1);
      expect(r.ok).toBe(true);
      expect(await ask(g, at, `https://${PARTNER}/v1/consignments?page=9`)).toMatchObject({ ok: false, cls: 'replay_missing' });
      expect(g.receipts[0]).toMatchObject({ decision: 'allowed', destination: { mode: 'replay', replay_set: 'nordwerk-logistics-partner' } });
      expect(g.receipts[0]!.destination.replay_entry_sha256).toMatch(/^[0-9a-f]{64}$/);
    } finally { await g.stop(); }
  });
});

describe('B40 §CR · the live transport — resolve, vet, pin; identity checked BEFORE a request byte is written', () => {
  let dir = ''; let pemA = ''; let pemB = ''; let keyA = ''; let keyB = '';
  const servers: TlsServer[] = [];
  const hits: Array<{ path: string; key: string | undefined }> = [];
  const serve = async (key: string, cert: string): Promise<number> => {
    const s = createTlsServer({ key, cert }, (req, res) => { hits.push({ path: req.url ?? '', key: req.headers['x-partner-key'] as string | undefined }); res.writeHead(200, { 'content-type': 'application/json' }); res.end('{"page":1}'); });
    servers.push(s);
    await new Promise<void>((ok) => s.listen(0, '127.0.0.1', () => ok()));
    return (s.address() as AddressInfo).port;
  };
  const make = (name: string) => {
    execFileSync('openssl', ['req', '-x509', '-newkey', 'ec', '-pkeyopt', 'ec_paramgen_curve:prime256v1', '-nodes', '-keyout', join(dir, `${name}.key`), '-out', join(dir, `${name}.pem`),
      '-days', '1', '-subj', `/CN=${PARTNER}`, '-addext', `subjectAltName=DNS:${PARTNER}`], { stdio: ['ignore', 'ignore', 'ignore'] });
    return { key: readFileSync(join(dir, `${name}.key`), 'utf8'), pem: readFileSync(join(dir, `${name}.pem`), 'utf8') };
  };
  beforeAll(() => {
    dir = realpathSync(mkdtempSync(join(tmpdir(), 'b40-cr-tls-')));
    ({ key: keyA, pem: pemA } = make('a')); ({ key: keyB, pem: pemB } = make('b'));
    rmSync(dir, { recursive: true, force: true });   // the generated keys live only in memory from here
  });
  afterAll(async () => { for (const s of servers) { s.closeAllConnections(); await new Promise<void>((ok) => s.close(() => ok())); } });

  it('the vetting resolver refuses a loopback, private or link-local destination (B13/B14\'s rule) — the substitution below exists only for the harness', async () => {
    await expect(resolveAllVetted('127.0.0.1')).rejects.toMatchObject({ refusalClass: 'address_not_public' });
    await expect(resolveAllVetted('169.254.169.254')).rejects.toMatchObject({ refusalClass: 'address_not_public' });
    await expect(resolveAllVetted('10.0.0.8')).rejects.toMatchObject({ refusalClass: 'address_not_public' });
  });
  it('first use pins the SPKI; the same identity matches; a CHANGED identity is blocked before the request — the server never sees it', async () => {
    const portA = await serve(keyA, pemA);
    const pinA = spkiPinOf(Buffer.from(pemA.replace(/-----[^-]+-----/g, '').replace(/\s+/g, ''), 'base64'));
    const loopback = async () => ['127.0.0.1'];
    const url = new URL(`https://${PARTNER}:${portA}/v1/consignments?page=1`);
    const req = { url, accept: null, credential: { header: 'x-partner-key', value: 'synthetic-credential' }, maxResponseBytes: 65_536, timeoutMs: 10_000 };
    const first = await new LiveTransport({ declared: [], recorded: new Map() }, { resolve: loopback, trustAnchorPem: `${pemA}${pemB}` }).fetch(req);
    expect(first.destination).toMatchObject({ mode: 'live', addresses: ['127.0.0.1'], pinned_address: '127.0.0.1', tls_spki_sha256: pinA, pin_state: 'first_use' });
    expect(hits).toEqual([{ path: '/v1/consignments?page=1', key: 'synthetic-credential' }]);
    const pins = { declared: [], recorded: new Map([[PARTNER, { spki: pinA, addresses: ['127.0.0.1'] }]]) };
    const again = await new LiveTransport(pins, { resolve: loopback, trustAnchorPem: `${pemA}${pemB}` }).fetch(req);
    expect(again.destination).toMatchObject({ pin_state: 'matched', address_drift: false });
    // the same host now answered by ANOTHER key (a different certificate, also trusted): the identity changed
    const portB = await serve(keyB, pemB);
    const before = hits.length;
    const changed = await new LiveTransport(pins, { resolve: loopback, trustAnchorPem: `${pemA}${pemB}` })
      .fetch({ ...req, url: new URL(`https://${PARTNER}:${portB}/v1/consignments?page=1`) }).then(() => null, (e: unknown) => e);
    expect(changed).toBeInstanceOf(TransportRefusal);
    expect(changed).toMatchObject({ refusalClass: 'destination_identity_changed', destination: { pin_state: 'changed', expected_spki_sha256: [pinA] } });
    expect(hits.length).toBe(before);   // not one request byte reached the changed destination
    // a contract-DECLARED pin set is the only identity accepted, whatever was recorded
    const declared = await new LiveTransport({ declared: [pinA], recorded: new Map() }, { resolve: loopback, trustAnchorPem: `${pemA}${pemB}` })
      .fetch({ ...req, url: new URL(`https://${PARTNER}:${portB}/x`) }).then(() => null, (e: unknown) => e);
    expect(declared).toMatchObject({ refusalClass: 'destination_identity_changed' });
  });
  it('a certificate the trust anchor does not cover is a TLS failure, never a pin', async () => {
    const portA = await serve(keyA, pemA);
    const r = await new LiveTransport({ declared: [], recorded: new Map() }, { resolve: async () => ['127.0.0.1'], trustAnchorPem: pemB })
      .fetch({ url: new URL(`https://${PARTNER}:${portA}/`), accept: null, credential: null, maxResponseBytes: 1024, timeoutMs: 10_000 }).then(() => null, (e: unknown) => e);
    expect(r).toMatchObject({ refusalClass: 'tls_failure' });
  });
});

describe('B40 §CR · the cell — the SDK runtime under the §0 launcher', () => {
  let work = '';
  const at = () => locateSdk()!;
  const pkgDir = (v: string): string => {   // a materialized copy, as the service makes it
    const d = realpathSync(mkdtempSync(join(work, `pkg-${v}-`)));
    for (const f of ['adapter.json', 'index.mjs']) copyFileSync(join(B40, 'adapter', `nordwerk-logistics-consignments-${v}`, f), join(d, f));
    return d;
  };
  const runCell = async (dir: string, gw: { url: string; token: string }, entry = 'index.mjs') => confinedSpawn({
    script: at().runtime, readPaths: [at().dir, dir], timeoutMs: 20_000, maxHeapMb: 128, maxOutputBytes: 8 * 1024 * 1024,
    stdin: JSON.stringify({ protocol: 'eye-cell/1', sdk: at().version, run: { source_key: 'b40-unit', contract_version: 1, purpose: 'corridor monitoring' }, gateway: gw,
      package: { dir, entry, name: 'probe', version: '1.0.0' }, checkpoint: null }),
  });
  beforeAll(() => { work = realpathSync(mkdtempSync(join(tmpdir(), 'b40-cr-cell-'))); });
  afterAll(() => { if (work !== '') rmSync(work, { recursive: true, force: true }); });

  it('1.0.1 (requalified): every request on the registered destination, three consignments framed, the off-registry link logged and NOT followed', async () => {
    const g = new EgressGateway(policy(), new ReplayTransport(new ReplayResponder(join(B40, 'replay')), 'nordwerk-logistics-partner'));
    const gw = await g.start();
    let out;
    try { out = await runCell(pkgDir('1.0.1'), gw); } finally { await g.stop(); }
    expect(out.status, out.stderr).toBe('ok');
    const { frames, problems } = sdk.parseFrames(out.stdout.toString());
    expect(problems).toEqual([]);
    expect(frames.map((f) => f.t)).toEqual(['hello', 'item', 'item', 'item', 'log', 'done']);
    expect(frames.filter((f) => f.t === 'item').map((f) => (f as { itemKey: string }).itemKey)).toEqual(['consignment:NWL-7701', 'consignment:NWL-7702', 'consignment:NWL-7703']);
    expect((frames[4] as { msg: string }).msg).toBe('tracking link on an undeclared host not followed: track.unregistered-carrier.synthetic.example');
    // the URL on a receipt is REDACTED (a query may carry a credential); the request digest tells the two pages apart
    expect(g.receipts.map((r) => [r.decision, r.url_redacted])).toEqual([['allowed', `https://${PARTNER}/v1/consignments?[redacted]`], ['allowed', `https://${PARTNER}/v1/consignments?[redacted]`]]);
    expect(new Set(g.receipts.map((r) => r.request_digest)).size).toBe(2);
    expect(g.blocking).toBeNull();
  });
  it('1.0.0 (DEF-B40-05): the off-registry link is BLOCKED by the gateway; the adapter fails with the gateway\'s class; no request reached the host', async () => {
    const g = new EgressGateway(policy(), new ReplayTransport(new ReplayResponder(join(B40, 'replay')), 'nordwerk-logistics-partner'));
    const gw = await g.start();
    let out;
    try { out = await runCell(pkgDir('1.0.0'), gw); } finally { await g.stop(); }
    expect(out.status).toBe('failed');
    expect(out.exitCode).toBe(1);
    const { frames } = sdk.parseFrames(out.stdout.toString());
    expect(frames[frames.length - 1]).toMatchObject({ t: 'error', class: 'gateway_refused', refusalClass: 'unregistered_destination' });
    expect(g.receipts.map((r) => [r.decision, r.refusal_class, r.host])).toEqual([
      ['allowed', null, PARTNER], ['allowed', null, PARTNER], ['blocked', 'unregistered_destination', 'track.unregistered-carrier.synthetic.example']]);
    expect(g.blocking?.refusalClass).toBe('unregistered_destination');
  });
  it('the cell holds no credential and no environment, cannot write, spawn or read outside its package — and (D3, stated) CAN open a direct socket', async () => {
    const listener: NetServer = createNetServer((s) => { s.end('reached'); });
    await new Promise<void>((ok) => listener.listen(0, '127.0.0.1', () => ok()));
    const port = (listener.address() as AddressInfo).port;
    const d = realpathSync(mkdtempSync(join(work, 'probe-')));
    writeFileSync(join(d, 'adapter.json'), '{}');
    writeFileSync(join(d, 'index.mjs'), `import { readFileSync, writeFileSync } from 'node:fs';
      import { connect } from 'node:net';
      export async function acquire(ctx) {
        const o = { env: Object.keys(process.env).filter((k) => k !== '__CF_USER_TEXT_ENCODING') };
        try { readFileSync('/etc/hosts'); o.read = 'allowed'; } catch (e) { o.read = e.code; }
        try { readFileSync(${JSON.stringify(join(work, 'outside.txt'))}); o.readOutside = 'allowed'; } catch (e) { o.readOutside = e.code; }
        try { writeFileSync(${JSON.stringify(join(d, 'x.txt'))}, 'w'); o.write = 'allowed'; } catch (e) { o.write = e.code; }
        try { (await import('node:child_process')).execFileSync('/bin/echo', ['x']); o.spawn = 'allowed'; } catch (e) { o.spawn = e.code; }
        try { eval('1'); o.eval = 'allowed'; } catch (e) { o.eval = e.name; }
        o.socket = await new Promise((r) => { const s = connect(${port}, '127.0.0.1'); s.on('data', (b) => { r(String(b)); s.destroy(); }); s.on('error', (e) => r('error:' + e.code)); });
        ctx.log(JSON.stringify(o));
      }`);
    writeFileSync(join(work, 'outside.txt'), 'outside the package');
    const g = new EgressGateway(policy(), new FakeTransport());
    const gw = await g.start();
    let out;
    try { out = await runCell(d, gw); } finally { await g.stop(); await new Promise<void>((ok) => listener.close(() => ok())); }
    expect(out.status, out.stderr).toBe('ok');
    const log = sdk.parseFrames(out.stdout.toString()).frames.find((f) => f.t === 'log') as { msg: string };
    expect(JSON.parse(log.msg)).toEqual({ env: [], read: 'ERR_ACCESS_DENIED', readOutside: 'ERR_ACCESS_DENIED', write: 'ERR_ACCESS_DENIED', spawn: 'ERR_ACCESS_DENIED', eval: 'EvalError',
      socket: 'reached' });   // D3: NOT claimed — the permission model has no network switch; network-level denial is B103 / B109, then R1
    expect(g.receipts).toEqual([]);   // the direct socket left no receipt: the gateway records what goes THROUGH it
  });
  it('a cell that does not speak eye-cell/1 is refused at its start; a package entry outside its directory never loads', async () => {
    const d = pkgDir('1.0.1');
    const out = await confinedSpawn({ script: at().runtime, readPaths: [at().dir, d], timeoutMs: 10_000, maxHeapMb: 64, maxOutputBytes: 65_536, stdin: '{"protocol":"other"}' });
    expect(out.exitCode).toBe(2);
    expect(sdk.parseFrames(out.stdout.toString()).frames).toEqual([{ t: 'error', class: 'protocol', refusalClass: null, message: 'the start frame does not speak eye-cell/1' }]);
    const g = new EgressGateway(policy(), new FakeTransport()); const gw = await g.start();
    try {
      const esc = await runCell(d, gw, '../index.mjs');
      expect(esc.exitCode).toBe(2);
      expect(sdk.parseFrames(esc.stdout.toString()).frames[0]).toMatchObject({ t: 'error', class: 'protocol' });
    } finally { await g.stop(); }
  });
});
