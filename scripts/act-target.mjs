/**
 * THE ACT TARGET — which deployment an act, a release-candidate act or a demonstration walk is about to touch,
 * decided from the CALLER's declaration and nothing else, BEFORE any login, session or other network effect.
 *
 * B80 integration pass (2026-10-19). The B82 act builder's probe logged two principals into the LIVE demonstration
 * (:3401) while it meant to rehearse on a restored copy: scripts/phase4/governed.mjs defaulted EYE_API to the live
 * address and act-b82.mjs authenticated before it looked at its target. Both are closed here:
 *   - governed.mjs has no default any more: no EYE_API, no request (it refuses before fetch);
 *   - the current entry points call resolveActTarget() first, which refuses a missing declaration, a missing target,
 *     and a target inconsistent with the declared environment.
 *
 * The declaration (all from the process environment — never from .eye-local/env, which is shared by every process):
 *   EYE_ACT_TARGET  'rehearsal' | 'live'   — required; an intentional live run says so.
 *   EYE_DB_NAME     the database the run reads — required; live is exactly eye_demo, a rehearsal is anything else.
 *   EYE_API         the API origin — required (needs 'api'); live is exactly the live API, a rehearsal never is.
 *   EYE_WEB_BASE    the web origin — required (needs 'web'); the same rule against the live web.
 *   EYE_LIVE_API / EYE_LIVE_WEB  where the live demonstration listens (defaults :3401 / :3000) — named so that
 *                   a rehearsal is checked against the real live addresses, and so the refusals can be proved.
 *
 * Purely local: this module performs no I/O at all.
 */

export const LIVE_DB = 'eye_demo';
const DEFAULT_LIVE_API = 'http://localhost:3401';
const DEFAULT_LIVE_WEB = 'http://localhost:3000';
const LOOPBACK = new Set(['localhost', '127.0.0.1', '[::1]', '::1']);

export class ActTargetRefused extends Error {
  constructor(message) { super(message); this.name = 'ActTargetRefused'; }
}

/** host:port with every loopback spelling folded together, so `127.0.0.1:3401` IS the live `localhost:3401`. */
function endpoint(name, value) {
  let u;
  try { u = new URL(value); } catch { throw new ActTargetRefused(`${name} is not a URL: ${JSON.stringify(value)}`); }
  if (u.protocol !== 'http:' && u.protocol !== 'https:') throw new ActTargetRefused(`${name} must be http(s): ${value}`);
  const port = u.port || (u.protocol === 'https:' ? '443' : '80');
  const host = LOOPBACK.has(u.hostname) ? 'loopback' : u.hostname.toLowerCase();
  return { origin: u.origin, key: `${host}:${port}` };
}

const required = (env, name, why) => {
  const v = env[name];
  if (v === undefined || String(v).trim() === '') throw new ActTargetRefused(`${name} is not set — ${why}`);
  return String(v).trim();
};

/**
 * Decide the target or throw ActTargetRefused. `needs` names the endpoints the caller will use.
 * Returns { mode, rehearsal, db, api, web } with the origins exactly as declared.
 */
export function resolveActTarget(env = process.env, { needs = ['api'] } = {}) {
  const mode = required(env, 'EYE_ACT_TARGET', "declare the environment: EYE_ACT_TARGET=rehearsal for a restored copy, EYE_ACT_TARGET=live for the demonstration");
  if (mode !== 'rehearsal' && mode !== 'live') throw new ActTargetRefused(`EYE_ACT_TARGET must be 'rehearsal' or 'live', not ${JSON.stringify(mode)}`);
  const rehearsal = mode === 'rehearsal';
  const db = required(env, 'EYE_DB_NAME', 'name the database this run reads (the rehearsal copy, or eye_demo for a live run)');
  if (rehearsal && db === LIVE_DB) throw new ActTargetRefused(`a rehearsal never reads ${LIVE_DB}; EYE_DB_NAME names the restored copy`);
  if (!rehearsal && db !== LIVE_DB) throw new ActTargetRefused(`a live run reads ${LIVE_DB}, not ${db}; a run on a copy declares EYE_ACT_TARGET=rehearsal`);

  const out = { mode, rehearsal, db, api: null, web: null };
  const check = (kind, name, liveName, liveDefault) => {
    const decl = endpoint(name, required(env, name, `name the ${kind} this run talks to explicitly (there is no default)`));
    const live = endpoint(liveName, env[liveName] ?? liveDefault);
    if (rehearsal && decl.key === live.key) {
      throw new ActTargetRefused(`${name} ${decl.origin} is the LIVE demonstration's ${kind} (${live.origin}); a rehearsal talks to its own rig`);
    }
    if (!rehearsal && decl.key !== live.key) {
      throw new ActTargetRefused(`a live run talks to the live ${kind} ${live.origin}, not ${decl.origin}`);
    }
    return decl.origin;
  };
  if (needs.includes('api')) out.api = check('API', 'EYE_API', 'EYE_LIVE_API', DEFAULT_LIVE_API);
  if (needs.includes('web')) out.web = check('web', 'EYE_WEB_BASE', 'EYE_LIVE_WEB', DEFAULT_LIVE_WEB);
  return out;
}

/** For a script's first statement: resolve, or print the refusal and exit 2 — before anything else happens. */
export function actTargetOrExit(env = process.env, opts = {}) {
  try {
    return resolveActTarget(env, opts);
  } catch (e) {
    if (!(e instanceof ActTargetRefused)) throw e;
    console.error(`REFUSED (act target): ${e.message}. Nothing was contacted.`);
    process.exit(2);
  }
}

/* B40 ap */
/**
 * CP-6 B40 §AP (DESIGN D10): a SYNTHETIC server an act, a candidate act, a walk or a harness starts (the loopback throttling publisher) must
 * listen on a port that is NONE of the demonstration's live addresses — the live API and web (EYE_LIVE_API / EYE_LIVE_WEB, defaults :3401 /
 * :3000), the demo's synthetic recipients and listeners (:3411, :2525, :3443–:3446), the database (:5432) and the demonstration's Redis
 * (:6379, :6392). Refused with ActTargetRefused otherwise; purely local (no I/O), so it is checked BEFORE the server binds. Port 0 (an
 * ephemeral port) is refused too: the caller binds, then asks again with the port it got, before any request is sent to it.
 */
export function assertSyntheticListener(port, env = process.env) {
  const n = Number(port);
  if (!Number.isInteger(n) || n < 1 || n > 65535) throw new ActTargetRefused(`a synthetic listener names its port (1–65535), not ${JSON.stringify(port)}`);
  const live = [endpoint('EYE_LIVE_API', env.EYE_LIVE_API ?? DEFAULT_LIVE_API), endpoint('EYE_LIVE_WEB', env.EYE_LIVE_WEB ?? DEFAULT_LIVE_WEB)]
    .map((e) => Number(e.key.split(':').pop()));
  const reserved = new Set([...live, 3401, 3000, 3411, 2525, 3443, 3444, 3445, 3446, 5432, 6379, 6392]);
  if (reserved.has(n)) throw new ActTargetRefused(`port ${n} is a live demonstration address (${[...reserved].sort((a, b) => a - b).join(', ')}); a synthetic server listens elsewhere`);
  return n;
}
/* end B40 ap */
