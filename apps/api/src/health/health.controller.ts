/**
 * Health/readiness — explicitly classified `telemetry-only` (ADR-P0-08 §7.2):
 * no protected data, no state change, no scope resolution, no per-request
 * POL/AUD. This classification is documented in the endpoint catalog; it is
 * a declared behavior, not a bypass.
 *
 * Gate-2 §6: readiness also surfaces AUDIT DEGRADATION. When authoritative
 * audit persistence has failed, requests fail closed and this endpoint reports
 * `degraded` with the incident count — a degraded system is never presented as
 * healthy.
 */
import { Controller, Get, Inject } from '@nestjs/common';
import { sql } from 'kysely';
import { APP_DB } from '../shared/shared.module.js';
import type { Db } from '../shared/db.js';
import { degradedAudit } from '../shared/degraded-store.js';

interface Readiness {
  status: 'ok' | 'degraded';
  db: boolean;
  audit: 'ok' | 'degraded';
  auditIncidents: number;
  degradedSince: string | null;
  classification: 'telemetry-only';
}

@Controller()
export class HealthController {
  constructor(@Inject(APP_DB) private readonly db: Db) {}

  @Get('/healthz')
  live(): { status: 'ok'; classification: 'telemetry-only' } {
    return { status: 'ok', classification: 'telemetry-only' };
  }

  @Get('/readyz')
  async ready(): Promise<Readiness> {
    let db = false;
    try {
      await sql`select 1`.execute(this.db);
      db = true;
    } catch {
      db = false;
    }
    const audit = degradedAudit.state();
    // Degraded is visibly marked, never presented as healthy (ADR-0018).
    return {
      status: db && !audit.degraded ? 'ok' : 'degraded',
      db,
      audit: audit.degraded ? 'degraded' : 'ok',
      auditIncidents: audit.incidents,
      degradedSince: audit.since,
      classification: 'telemetry-only',
    };
  }
}
