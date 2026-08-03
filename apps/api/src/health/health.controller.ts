/**
 * Health/readiness — explicitly classified `telemetry-only` (ADR-P0-08 §7.2):
 * no protected data, no state change, no scope resolution, no per-request
 * POL/AUD. This classification is documented in the endpoint catalog; it is
 * a declared behavior, not a bypass.
 */
import { Controller, Get, Inject } from '@nestjs/common';
import { sql } from 'kysely';
import { APP_DB } from '../shared/shared.module.js';
import type { Db } from '../shared/db.js';

@Controller()
export class HealthController {
  constructor(@Inject(APP_DB) private readonly db: Db) {}

  @Get('/healthz')
  live(): { status: 'ok'; classification: 'telemetry-only' } {
    return { status: 'ok', classification: 'telemetry-only' };
  }

  @Get('/readyz')
  async ready(): Promise<{ status: 'ok' | 'degraded'; db: boolean; classification: 'telemetry-only' }> {
    let db = false;
    try {
      await sql`select 1`.execute(this.db);
      db = true;
    } catch {
      db = false;
    }
    // Degraded is visibly marked, never presented as healthy (ADR-0018).
    return { status: db ? 'ok' : 'degraded', db, classification: 'telemetry-only' };
  }
}
