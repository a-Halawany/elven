#!/usr/bin/env node
/**
 * THE LOCAL SINKS of the SYNTHETIC attention adapters (CP-6 B34; migration 0090 §0.5; F-P6-07). A real e-mail / SMS / Teams provider is
 * owner decision D6: the product's email, sms and teams adapters speak the providers' shapes to THIS process on the loopback interface,
 * and it keeps what it received in memory (the subject, the recipient, the body's digest — never the body on disk) and forgets it at exit.
 *
 *   node scripts/attention/local-sinks.mjs [--host 127.0.0.1] [--smtp-port 2525] [--http-port 3499]
 *
 * It prints `smtp <port>`, `http <port>` and `ready`, then the product is configured with (environment of the API):
 *   EYE_ATTENTION_SINK_HOST=127.0.0.1  EYE_ATTENTION_SMTP_PORT=<smtp port>
 *   EYE_ATTENTION_SMS_WEBHOOK_URL=http://127.0.0.1:<http port>/sms  EYE_ATTENTION_TEAMS_WEBHOOK_URL=http://127.0.0.1:<http port>/teams
 *
 *   SMTP (RFC 5321 subset): 220 greeting, EHLO/HELO, MAIL FROM, RCPT TO, DATA (dot-unstuffed), RSET, NOOP, QUIT; a message is answered
 *        `250 2.0.0 OK queued as <id>`.
 *   HTTP POST /sms  {to, text, delivery_id}   and   POST /teams {"@type": "MessageCard", title, text, delivery_id}  → 202 {message_id}
 *   HTTP POST /_control {channel: email|sms|teams, mode: ok|fail}  — a harness's control: `fail` answers 451 (SMTP, at RCPT) or 503 (HTTP).
 *   HTTP GET  /_received  — what was received (newest last): {channel, message_id, to, subject, body_digest, delivery_id, received_at}.
 * It binds to loopback ONLY (a non-loopback --host is refused). SYNTHETIC: nothing is forwarded anywhere; no credential is used.
 * Node 18 or later; no dependency.
 */
import { createServer as createNetServer } from 'node:net';
import { createServer as createHttpServer } from 'node:http';
import { createHash, randomUUID } from 'node:crypto';

const args = process.argv.slice(2);
const opt = (name, dflt) => { const i = args.indexOf(`--${name}`); return i >= 0 && args[i + 1] !== undefined ? args[i + 1] : dflt; };
const host = opt('host', '127.0.0.1');
const loopback = (h) => h === 'localhost' || /^127\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(h) || h === '::1';
if (!loopback(host)) { console.error(`refused: ${host} is not a loopback host (the sinks bind to loopback only)`); process.exit(2); }

const received = [];
const mode = { email: 'ok', sms: 'ok', teams: 'ok' };
const digest = (s) => createHash('sha256').update(s, 'utf8').digest('hex');
const note = (r) => console.log(`received ${r.channel} ${r.message_id} to=${r.to} digest=${r.body_digest.slice(0, 12)} delivery=${r.delivery_id ?? '-'} (SYNTHETIC)`);

/* ───────────── SMTP ───────────── */
const smtp = createNetServer((socket) => {
  socket.setEncoding('utf8');
  let buf = ''; let inData = false; let lines = []; let from = null; let to = [];
  const say = (s) => socket.write(`${s}\r\n`);
  say('220 eye-local-sink ESMTP SYNTHETIC (B34 local sink — nothing is forwarded)');
  socket.on('data', (chunk) => {
    buf += chunk;
    let i;
    while ((i = buf.indexOf('\r\n')) >= 0) {
      const line = buf.slice(0, i); buf = buf.slice(i + 2);
      if (inData) {
        if (line === '.') {
          inData = false;
          const raw = lines.join('\r\n'); const [head, ...bodyParts] = raw.split('\r\n\r\n');
          const subject = /^Subject: (.*)$/im.exec(head ?? '')?.[1] ?? '';
          const delivery = /^X-Eye-Delivery: (.*)$/im.exec(head ?? '')?.[1] ?? null;
          const r = { channel: 'email', message_id: randomUUID(), to: to.join(','), from, subject, body_digest: digest(bodyParts.join('\r\n\r\n')), delivery_id: delivery, received_at: new Date().toISOString() };
          received.push(r); note(r);
          say(`250 2.0.0 OK queued as ${r.message_id}`);
          lines = []; from = null; to = [];
        } else lines.push(line.startsWith('..') ? line.slice(1) : line);
        continue;
      }
      const cmd = line.slice(0, 4).toUpperCase();
      if (cmd === 'EHLO' || cmd === 'HELO') say('250 eye-local-sink');
      else if (cmd === 'MAIL') { from = /<([^>]*)>/.exec(line)?.[1] ?? ''; say('250 2.1.0 OK'); }
      else if (cmd === 'RCPT') {
        if (mode.email === 'fail') say('451 4.3.0 the SYNTHETIC sink is set to fail (harness control)');
        else { to.push(/<([^>]*)>/.exec(line)?.[1] ?? ''); say('250 2.1.5 OK'); }
      } else if (cmd === 'DATA') { if (to.length === 0) say('503 5.5.1 RCPT first'); else { inData = true; say('354 end with <CRLF>.<CRLF>'); } }
      else if (cmd === 'RSET') { from = null; to = []; say('250 OK'); }
      else if (cmd === 'NOOP') say('250 OK');
      else if (cmd === 'QUIT') { say('221 bye'); socket.end(); }
      else say('502 5.5.2 not implemented');
    }
  });
  socket.on('error', () => { /* a client that went away */ });
});

/* ───────────── HTTP (the SMS and Teams webhooks, the controls) ───────────── */
const http = createHttpServer((req, res) => {
  const json = (status, body) => { res.writeHead(status, { 'content-type': 'application/json' }); res.end(JSON.stringify(body)); };
  if (req.method === 'GET' && req.url === '/_received') return json(200, { synthetic: true, received });
  if (req.method !== 'POST') return json(405, { error: 'POST only' });
  let body = '';
  req.setEncoding('utf8');
  req.on('data', (c) => { body += c; if (body.length > 1_000_000) req.destroy(); });
  req.on('end', () => {
    let p = {};
    try { p = JSON.parse(body); } catch { return json(400, { error: 'not JSON' }); }
    if (req.url === '/_control') {
      if (!['email', 'sms', 'teams'].includes(p.channel) || !['ok', 'fail'].includes(p.mode)) return json(422, { error: 'channel email|sms|teams, mode ok|fail' });
      mode[p.channel] = p.mode; return json(200, { mode });
    }
    const channel = req.url === '/sms' ? 'sms' : req.url === '/teams' ? 'teams' : null;
    if (channel === null) return json(404, { error: 'POST /sms or /teams' });
    if (mode[channel] === 'fail') return json(503, { error: `the SYNTHETIC ${channel} sink is set to fail (harness control)` });
    const text = channel === 'sms' ? String(p.text ?? '') : String(p.text ?? '');
    const r = { channel, message_id: randomUUID(), to: String(p.to ?? p.recipient ?? ''), subject: channel === 'teams' ? String(p.title ?? '') : '', body_digest: digest(text),
                delivery_id: p.delivery_id ?? req.headers['x-eye-delivery'] ?? null, received_at: new Date().toISOString() };
    received.push(r); note(r);
    return json(202, { message_id: r.message_id, synthetic: true });
  });
});

const listen = (server, port) => new Promise((resolve, reject) => { server.once('error', reject); server.listen(Number(port), host, () => resolve(server.address().port)); });
const smtpPort = await listen(smtp, opt('smtp-port', '0'));
const httpPort = await listen(http, opt('http-port', '0'));
console.log(`smtp ${smtpPort}`);
console.log(`http ${httpPort}`);
console.log('ready');
const stop = () => { smtp.close(); http.close(); process.exit(0); };
process.on('SIGTERM', stop); process.on('SIGINT', stop);
