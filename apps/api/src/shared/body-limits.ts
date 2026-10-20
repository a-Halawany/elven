/**
 * B81 integration (CMP-040 — FileIntake's upload mode placed on a real page): THE REQUEST BODY LIMITS. Nest's default JSON parser admits
 * 100 KiB, while the operator upload intake (`observation/sources/upload.controller.ts`) carries its files base64-encoded INSIDE the governed
 * envelope (so the payload digest covers the bytes) under its own 64 MiB / 25-file ceiling — a file over ~70 KiB was refused 413 by the
 * parser before the controller's ceiling or the pipeline ever saw it. The upload route alone gets a limit that fits its own ceiling
 * (64 MiB × 4/3 for base64, plus 1 MiB for the envelope); every other route keeps Nest's default parsers exactly (JSON 100 KiB; urlencoded
 * extended, 100 KiB). The first parser reads only the upload path's JSON; the second sees an already-read body and passes it through.
 */
import type { NestExpressApplication } from '@nestjs/platform-express';
import type { IncomingMessage } from 'node:http';

export const DEFAULT_BODY_LIMIT = '100kb';
export const UPLOAD_BODY_LIMIT = Math.ceil((64 * 1024 * 1024 * 4) / 3) + 1024 * 1024;
/** The operator upload intake's path (the controller's own route), query string allowed. */
export const UPLOAD_PATH = /^\/v1\/tenants\/[^/?#]+\/domains\/[^/?#]+\/observation\/upload\/?(?:\?.*)?$/;
const isJson = (req: IncomingMessage): boolean => /^application\/(?:[a-z0-9.+-]*\+)?json\b/i.test(String(req.headers['content-type'] ?? ''));

/** Register the body parsers (the app is created with `bodyParser: false`). */
export function configureBodyParsers(app: NestExpressApplication): void {
  app.useBodyParser('json', { limit: UPLOAD_BODY_LIMIT, type: (req: IncomingMessage) => isJson(req) && UPLOAD_PATH.test(req.url ?? '') });
  app.useBodyParser('json', { limit: DEFAULT_BODY_LIMIT });
  app.useBodyParser('urlencoded', { extended: true, limit: DEFAULT_BODY_LIMIT });
}
