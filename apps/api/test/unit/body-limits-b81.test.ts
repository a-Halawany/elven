/**
 * B81 integration — THE REQUEST BODY LIMITS (src/shared/body-limits.ts, wired in main.ts): the operator upload route admits a body its own
 * 64 MiB ceiling allows; every other route keeps Nest's default 100 KiB JSON limit (413 above it). A real Nest express application on an
 * ephemeral loopback port with two plain routes; no database.
 */
import 'reflect-metadata';
import { Module } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import type { AddressInfo } from 'node:net';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { UPLOAD_PATH, configureBodyParsers } from '../../src/shared/body-limits.js';

class EmptyModule {}
Module({})(EmptyModule);

let app: NestExpressApplication;
let base = '';
beforeAll(async () => {
  app = await NestFactory.create<NestExpressApplication>(EmptyModule, { logger: false, bodyParser: false });
  configureBodyParsers(app);
  const echo = (req: { body: unknown }, res: { json: (v: unknown) => void }) => res.json({ length: JSON.stringify(req.body ?? null).length });
  const http = app.getHttpAdapter();
  http.post('/v1/tenants/:t/domains/:d/observation/upload', echo);
  http.post('/v1/tenants/:t/domains/:d/observation/runs', echo);
  http.post('/v1/form', echo);
  await app.listen(0, '127.0.0.1');
  base = `http://127.0.0.1:${(app.getHttpServer().address() as AddressInfo).port}`;
});
afterAll(async () => { await app?.close(); });

const body = (kib: number) => JSON.stringify({ payload: { files: [{ filename: 'synthetic.csv', base64: 'A'.repeat(kib * 1024) }] } });
const post = (path: string, data: string, type = 'application/json') => fetch(`${base}${path}`, { method: 'POST', headers: { 'content-type': type }, body: data });

describe('the request body limits', () => {
  it('the upload route admits a body above the default limit (here 600 KiB)', async () => {
    const r = await post('/v1/tenants/t1/domains/d1/observation/upload', body(600));
    expect(r.status).toBe(200);
    expect(((await r.json()) as { length: number }).length).toBeGreaterThan(600 * 1024);
  });
  it('every other route keeps the default: 413 above 100 KiB, admitted below it', async () => {
    expect((await post('/v1/tenants/t1/domains/d1/observation/runs', body(600))).status).toBe(413);
    expect((await post('/v1/tenants/t1/domains/d1/observation/upload-other', body(600))).status).toBe(413);
    expect((await post('/v1/tenants/t1/domains/d1/observation/runs', body(10))).status).toBe(200);
  });
  it('urlencoded bodies keep the default parser', async () => {
    const r = await post('/v1/form', 'a=1&b=2', 'application/x-www-form-urlencoded');
    expect(r.status).toBe(200);
  });
  it('the path rule names exactly the upload intake', () => {
    expect(UPLOAD_PATH.test('/v1/tenants/a/domains/b/observation/upload')).toBe(true);
    expect(UPLOAD_PATH.test('/v1/tenants/a/domains/b/observation/upload?x=1')).toBe(true);
    for (const p of ['/v1/tenants/a/domains/b/observation/uploads', '/v1/tenants/a/domains/b/observation/upload/x', '/v1/tenants/a/b/observation/upload', '/x/v1/tenants/a/domains/b/observation/upload'])
      expect(UPLOAD_PATH.test(p)).toBe(false);
  });
});
