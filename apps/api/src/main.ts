import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module.js';
import { loadConfig } from './config/config.js';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { configureBodyParsers } from './shared/body-limits.js';

async function bootstrap(): Promise<void> {
  const config = loadConfig();
  const app = await NestFactory.create<NestExpressApplication>(AppModule, { logger: ['warn', 'error', 'log'], bodyParser: false });
  // B81: the upload intake's body limit fits its own ceiling; every other route keeps Nest's defaults (shared/body-limits.ts).
  configureBodyParsers(app);
  // Local-dev profile only (EXC-P0-004): the WS-19 shell origin.
  app.enableCors({ origin: ['http://localhost:3000'], allowedHeaders: ['content-type', 'authorization'] });
  app.enableShutdownHooks();
  await app.listen(config['eye.runtime.port']);
  // eslint-disable-next-line no-console
  console.log(`[eye-api] listening on :${config['eye.runtime.port']} (env=${config['eye.runtime.env']})`);
}

void bootstrap();
