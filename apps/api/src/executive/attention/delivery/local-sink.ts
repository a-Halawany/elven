/**
 * B34 (0090) — THE LOCAL SINKS of the SYNTHETIC email / SMS / Teams adapters. A real provider is owner decision D6: these adapters speak
 * the providers' shapes (SMTP; an SMS gateway's and a Teams incoming webhook's JSON POST) to a sink on THIS machine's loopback only —
 * scripts/attention/local-sinks.mjs for the demonstration, a harness's own sink in the tests. The configuration refuses any host that is
 * not loopback (at startup and again at every attempt), and every receipt says `synthetic: true` and that it closes no real-provider clause.
 */
import { isIP } from 'node:net';

export const SYNTHETIC_SINK_NOTE = 'SYNTHETIC — delivered to a LOCAL sink on the loopback interface; no email, SMS or Teams message left this machine; this closes no real-provider clause (owner decision D6)';

/** 127.0.0.0/8, ::1 and `localhost` — nothing else. */
export function isLoopbackHost(host: string): boolean {
  const h = host.replace(/^\[|\]$/g, '').toLowerCase();
  if (h === 'localhost') return true;
  if (isIP(h) === 4) return h.split('.')[0] === '127';
  if (isIP(h) === 6) return h === '::1' || h === '0:0:0:0:0:0:0:1';
  return false;
}

/** A webhook sink URL: http(s) to a loopback host, or the reason it is refused. */
export function loopbackUrlProblem(url: string): string | null {
  let u: URL;
  try { u = new URL(url); } catch { return `not a URL: ${url.slice(0, 80)}`; }
  if (u.protocol !== 'http:' && u.protocol !== 'https:') return `the scheme ${u.protocol} is not http(s)`;
  if (u.username !== '' || u.password !== '') return 'a sink URL carries no credential';
  if (!isLoopbackHost(u.hostname)) return `the host ${u.hostname} is not loopback (a real provider is owner decision D6)`;
  return null;
}

/** The sinks as configured (eye.attention.*): an unset sink is a channel this runtime cannot serve (a failed attempt, with that reason). */
export interface SinkConfig { host: string; smtpPort: number; smsUrl: string; teamsUrl: string }
