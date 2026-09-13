#!/usr/bin/env node
// The Eye — read docker-compose.yml by SERVICE identity (delivery package R0/P7-D).
//
//   node compose-services.mjs <docker-compose.yml | ->  [compose-dir]
//
// Prints one JSON object:
//   { services: { <name>: { image, container_name, user, cap_drop, security_opt, bind_mounts: [host paths] } },
//     bind_mounts: [every bind-mount host path, absolute] }
//
// user / cap_drop / security_opt are the service's PROCESS PROTECTIONS (compose
// `user:`, `cap_drop:`, `security_opt:`), read so that backup.sh can record the
// deployment's declared configuration next to the pin and restore.sh can start
// its isolated containers with the same flags (`--user`, `--cap-drop`,
// `--security-opt`) compose would apply.
//
// The file is parsed as YAML (the repository's `yaml` package) and the `image:`
// of a service is read from services.<name>.image, whatever registry or path the
// reference carries (docker.io short names, ghcr.io/<owner>/<repo>/<name>@sha256:…).
// backup.sh and restore.sh use this instead of a textual `image: postgres@` match,
// which stops matching after the compose file is re-pinned to GHCR references.
// Reading `-` parses stdin, which is how restore.sh reads the compose file of the
// source revision recorded in a bundle (`git show <rev>:docker-compose.yml`).
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { homedir } from 'node:os';
import { dirname, isAbsolute, resolve } from 'node:path';

const [src, composeDirArg] = process.argv.slice(2);
if (!src) { console.error('usage: compose-services.mjs <docker-compose.yml | -> [compose-dir]'); process.exit(2); }
let YAML;
try { YAML = createRequire(import.meta.url)('yaml'); }
catch { console.error('compose-services: the yaml package is not installed in the repository (pnpm install --frozen-lockfile)'); process.exit(2); }

const text = readFileSync(src === '-' ? 0 : src, 'utf8');
const composeDir = composeDirArg ?? (src === '-' ? process.cwd() : dirname(resolve(src)));
const doc = YAML.parse(text) ?? {};
const services = doc.services && typeof doc.services === 'object' ? doc.services : {};

const hostPath = (p) => {
  if (typeof p !== 'string' || p.length === 0) return null;
  if (p.startsWith('~')) return resolve(homedir(), p.slice(1).replace(/^\//, ''));
  if (isAbsolute(p)) return p;
  if (p.startsWith('./') || p.startsWith('../') || p === '.' || p === '..') return resolve(composeDir, p);
  return null; // a named volume, not a host path
};
const bindOf = (entry) => {
  if (typeof entry === 'string') {
    const parts = entry.split(':');
    return parts.length >= 2 ? hostPath(parts[0]) : null;
  }
  if (entry && typeof entry === 'object' && entry.type === 'bind') return hostPath(entry.source);
  return null;
};

const stringList = (v) => {
  if (typeof v === 'string') return v.length > 0 ? [v] : [];
  if (Array.isArray(v)) return v.filter((x) => typeof x === 'string' || typeof x === 'number').map(String);
  return [];
};

const out = { services: {}, bind_mounts: [] };
for (const [name, svc] of Object.entries(services)) {
  const s = svc && typeof svc === 'object' ? svc : {};
  const binds = Array.isArray(s.volumes) ? s.volumes.map(bindOf).filter((p) => p !== null) : [];
  out.services[name] = {
    image: typeof s.image === 'string' ? s.image : null,
    container_name: typeof s.container_name === 'string' ? s.container_name : null,
    user: typeof s.user === 'string' || typeof s.user === 'number' ? String(s.user) : null,
    cap_drop: stringList(s.cap_drop),
    security_opt: stringList(s.security_opt),
    bind_mounts: binds,
  };
  out.bind_mounts.push(...binds);
}
// top-level volumes declared as local bind devices (driver_opts.type=none/bind, device=<host path>)
const volumes = doc.volumes && typeof doc.volumes === 'object' ? doc.volumes : {};
for (const v of Object.values(volumes)) {
  const dev = v && typeof v === 'object' && v.driver_opts && typeof v.driver_opts === 'object' ? v.driver_opts.device : null;
  const p = hostPath(dev);
  if (p !== null) out.bind_mounts.push(p);
}
out.bind_mounts = [...new Set(out.bind_mounts)];
console.log(JSON.stringify(out));
