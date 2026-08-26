/**
 * C19 — MAKING "OFFLINE" A CHECKABLE PROPERTY.
 *
 * Claiming that verification works offline is easy; the claim is usually tested by unplugging the
 * network and observing that nothing broke. That test is weak in the direction that matters — it
 * passes for a verifier that fetches something, fails to get it, and silently proceeds on a cached
 * or default value.
 *
 * So the network is not removed, it is TRAPPED. Every primitive a Node program could reach it
 * through is replaced for the duration of the region, each replacement records the attempt and
 * throws, and the caller receives the list. A verifier that touched the network fails loudly and
 * says which primitive it reached for; a verifier that genuinely did not returns an empty list.
 *
 * The CJS view of these modules is used deliberately: an ESM namespace object is frozen, so
 * patching an import would throw, and a guard that cannot be installed proves nothing at all.
 */
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);

/** Every primitive that could reach the network, and the name an attempt is reported under. */
const TRAPS = Object.freeze([
  ['node:dns', 'lookup', 'a DNS lookup'],
  ['node:dns', 'resolve', 'a DNS resolve'],
  ['node:dns/promises', 'lookup', 'a DNS lookup'],
  ['node:net', 'connect', 'a TCP connect'],
  ['node:net', 'createConnection', 'a TCP connect'],
  ['node:tls', 'connect', 'a TLS connect'],
  ['node:https', 'request', 'an HTTPS request'],
  ['node:https', 'get', 'an HTTPS request'],
  ['node:http', 'request', 'an HTTP request'],
  ['node:http', 'get', 'an HTTP request'],
]);

/**
 * Run `fn` with the network denied. Returns the result and every attempt observed, so a caller can
 * assert on BOTH — a verifier that produced the right answer while reaching out is still wrong.
 */
export async function withNetworkDenied(fn) {
  const attempts = [];
  const restore = [];
  const deny = (what) => () => {
    attempts.push(what);
    throw new Error(`c19 offline: ${what} was attempted; offline verification must not touch the network`);
  };
  for (const [mod, key, what] of TRAPS) {
    let target;
    try { target = require(mod); } catch { continue; }
    if (typeof target?.[key] !== 'function') continue;
    restore.push([target, key, target[key]]);
    target[key] = deny(what);
  }
  // Socket.prototype.connect catches anything that constructs a socket directly.
  const net = require('node:net');
  if (typeof net.Socket?.prototype?.connect === 'function') {
    restore.push([net.Socket.prototype, 'connect', net.Socket.prototype.connect]);
    net.Socket.prototype.connect = deny('a TCP connect');
  }
  const savedFetch = globalThis.fetch;
  globalThis.fetch = deny('a fetch');

  try {
    return { result: await fn(), attempts };
  } finally {
    for (const [obj, key, original] of restore) obj[key] = original;
    globalThis.fetch = savedFetch;
  }
}

/** The primitives this guard covers, so a control can assert the list has not quietly shrunk. */
export const TRAPPED_PRIMITIVES = Object.freeze(
  [...new Set(TRAPS.map(([m, k]) => `${m}.${k}`)), 'node:net.Socket.prototype.connect', 'globalThis.fetch'],
);
