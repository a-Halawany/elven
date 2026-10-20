/**
 * @eye/connector-sdk — THE CELL RUNTIME (eye-cell/1). The entry point of one connector cell: the API's confined launcher starts it as a
 * child process (Node's permission model: fs READ of this SDK and of the one materialized package only; no fs write, no child process,
 * no worker, no addon; code generation from strings disallowed; the environment EMPTY — no credential, no database or Redis address).
 *
 *   stdin   ONE start frame: { protocol, sdk, run: { source_key, contract_version, purpose }, gateway: { url, token },
 *           package: { dir, entry, name, version }, checkpoint }
 *   stdout  JSON lines: hello, then item / log frames, then done (exit 0) or error (exit 1; 2 for a protocol fault)
 *
 * The adapter's module is imported from the package directory and its `acquire(ctx)` awaited. `ctx` is frozen: the protocol and SDK
 * versions, the cursor (the checkpoint the platform holds), the run's purpose, `gatewayFetch` (the egress gateway on loopback — the only
 * intended egress), `emit(item)` and `log(text)`. Items emitted before an error are not admitted: the API fails the run closed.
 */
import { pathToFileURL } from 'node:url';
import { resolve, sep } from 'node:path';
import { CELL_LIMITS, CELL_PROTOCOL, GatewayRefused, SDK_VERSION, createGatewayFetch, encodeFrame, sha256Hex } from './index.js';

const write = (frame) => new Promise((done) => { process.stdout.write(encodeFrame(frame), () => done()); });

async function readStart() {
  const chunks = [];
  for await (const c of process.stdin) chunks.push(c);
  return JSON.parse(Buffer.concat(chunks).toString('utf8'));
}

async function main() {
  let start;
  try { start = await readStart(); } catch { await write({ t: 'error', class: 'protocol', message: 'the start frame is not JSON' }); return 2; }
  if (start === null || typeof start !== 'object' || start.protocol !== CELL_PROTOCOL) {
    await write({ t: 'error', class: 'protocol', message: `the start frame does not speak ${CELL_PROTOCOL}` });
    return 2;
  }
  const dir = resolve(String(start.package?.dir ?? ''));
  const entry = resolve(dir, String(start.package?.entry ?? ''));
  if (!entry.startsWith(dir + sep) || !entry.endsWith('.mjs')) {
    await write({ t: 'error', class: 'protocol', message: 'the package entry is an .mjs file inside the package directory' });
    return 2;
  }
  let gatewayFetch;
  try { gatewayFetch = createGatewayFetch({ url: String(start.gateway?.url ?? ''), token: String(start.gateway?.token ?? '') }); }
  catch (e) { await write({ t: 'error', class: 'protocol', message: String(e?.message ?? e).slice(0, CELL_LIMITS.maxErrorChars) }); return 2; }
  await write({ t: 'hello', protocol: CELL_PROTOCOL, sdk: SDK_VERSION, package: { name: String(start.package?.name ?? ''), version: String(start.package?.version ?? '') } });

  const pending = [];
  let items = 0;
  let logs = 0;
  const ctx = Object.freeze({
    protocol: CELL_PROTOCOL,
    sdkVersion: SDK_VERSION,
    cursor: start.checkpoint ?? null,
    purpose: typeof start.run?.purpose === 'string' ? start.run.purpose : null,
    gatewayFetch,
    emit(item) {
      if (item === null || typeof item !== 'object') throw new TypeError('emit takes an item { itemKey, bytes, mediaType?, filename?, publisherTime? }');
      if (typeof item.itemKey !== 'string' || item.itemKey.length < 1 || item.itemKey.length > CELL_LIMITS.maxItemKeyChars) throw new TypeError('an item key is a non-empty string');
      if (!(item.bytes instanceof Uint8Array)) throw new TypeError('an item\'s bytes are a Uint8Array');
      if (item.bytes.byteLength > CELL_LIMITS.maxItemBytes) throw new RangeError(`an item is at most ${CELL_LIMITS.maxItemBytes} bytes`);
      items += 1;
      if (items > CELL_LIMITS.maxItems) throw new RangeError(`a run emits at most ${CELL_LIMITS.maxItems} items`);
      const b = Buffer.from(item.bytes);
      pending.push(write({ t: 'item', itemKey: item.itemKey, mediaType: typeof item.mediaType === 'string' ? item.mediaType : null,
        filename: typeof item.filename === 'string' ? item.filename : null, publisherTime: typeof item.publisherTime === 'string' ? item.publisherTime : null,
        bytes: b.toString('base64'), sha256: sha256Hex(b) }));
    },
    log(text) {
      logs += 1;
      if (logs <= CELL_LIMITS.maxLogLines) pending.push(write({ t: 'log', msg: String(text).slice(0, CELL_LIMITS.maxLogChars) }));
    },
  });

  try {
    const mod = await import(pathToFileURL(entry).href);
    if (typeof mod.acquire !== 'function') throw new TypeError('the adapter module exports no acquire(ctx)');
    const r = await mod.acquire(ctx);
    await Promise.all(pending);
    await write({ t: 'done', checkpoint: r !== null && typeof r === 'object' && r.checkpoint !== null && typeof r.checkpoint === 'object' ? r.checkpoint : null });
    return 0;
  } catch (e) {
    await Promise.allSettled(pending);
    await write({ t: 'error', class: e instanceof GatewayRefused ? 'gateway_refused' : 'adapter_error', refusalClass: e instanceof GatewayRefused ? e.refusalClass : null,
      message: String(e?.message ?? e).slice(0, CELL_LIMITS.maxErrorChars) });
    return 1;
  }
}

// The cell ends when its run ends: an adapter that left a timer or a socket open does not keep the process (and the run's lease) alive.
process.exit(await main());
