/**
 * B81 §LY-M (0119_b81_x_lym) — THE WINDOWS CAPABILITIES: one narrow shape per port group.
 *
 *   read    shell.handoffs_of (the principal's OWN handoffs with their state at the clock) · shell.presentation_of (the principal's OWN displays)
 *   write   shell.offer_handoff · shell.claim_handoff · shell.revoke_handoff (`shell.handoff.{offer,claim,revoke}`) and
 *           shell.publish_presentation (`shell.presentation.publish`)
 *
 * The capability decides nothing: the ports do (the human, the current session, the same person, single use, expiry, the one control
 * surface, the stale check). THREE CLAIMS: construction (this code and phase6-handoffs-b81), demonstrated operation (the act, SYNTHETIC),
 * real acceptance (H3) — never claimed.
 */
import { sql } from 'kysely';
import type { Tx } from '../../shared/db.js';

type Row = Record<string, unknown>;

export interface WindowReads {
  readonly action: string;
  handoffsOf(a: { principalId: string; tenantId: string | null; domainId: string | null; limit: number }): Promise<Row>;
  presentationOf(a: { principalId: string; tenantId: string | null; domainId: string | null; display: string | null; history: number }): Promise<Row>;
}
export interface WindowWrites extends WindowReads {
  offer(a: { handoffId: string; tenantId: string | null; domainId: string | null; workspace: string; location: Row; viewContext: Row; display: string | null;
             targetDevice: string | null; expiresIn: number | null; actor: string; correlationId: string }): Promise<Row>;
  claim(a: { handoffId: string; receiptId: string; actor: string; correlationId: string }): Promise<Row>;
  revoke(a: { handoffId: string; receiptId: string; reason: string | null; actor: string; correlationId: string }): Promise<Row>;
  publish(a: { stateId: string; tenantId: string | null; domainId: string | null; display: string; expectedVersion: number; status: string; location: Row | null;
               viewContext: Row; watermark: string | null; classification: string | null; audience: string | null; actor: string; correlationId: string }): Promise<Row>;
}

class WindowCapabilityImpl implements WindowWrites {
  readonly #tx: Tx;
  readonly action: string;
  constructor(tx: Tx, action: string) { this.#tx = tx; this.action = action; }
  private async one(q: ReturnType<typeof sql>, what: string): Promise<Row> {
    const r = await q.execute(this.#tx);
    const row = (r.rows as Array<{ r: Row | null }>)[0]?.r;
    if (row === undefined || row === null) throw new Error(`${what} returned no row`);
    return row;
  }
  handoffsOf(a: Parameters<WindowReads['handoffsOf']>[0]) {
    return this.one(sql`select shell.handoffs_of(${a.principalId}::uuid, ${a.tenantId}::uuid, ${a.domainId}::uuid, ${a.limit}::int) as r`, 'handoffs_of');
  }
  presentationOf(a: Parameters<WindowReads['presentationOf']>[0]) {
    return this.one(sql`select shell.presentation_of(${a.principalId}::uuid, ${a.tenantId}::uuid, ${a.domainId}::uuid, ${a.display}, ${a.history}::int) as r`, 'presentation_of');
  }
  offer(a: Parameters<WindowWrites['offer']>[0]) {
    return this.one(sql`select shell.offer_handoff(${a.handoffId}::uuid, ${a.tenantId}::uuid, ${a.domainId}::uuid, ${a.workspace}, ${JSON.stringify(a.location)}::jsonb,
      ${JSON.stringify(a.viewContext)}::jsonb, ${a.display}, ${a.targetDevice}, ${a.expiresIn}::int, ${a.actor}::uuid, ${a.correlationId}::uuid) as r`, 'offer_handoff');
  }
  claim(a: Parameters<WindowWrites['claim']>[0]) {
    return this.one(sql`select shell.claim_handoff(${a.handoffId}::uuid, ${a.receiptId}::uuid, ${a.actor}::uuid, ${a.correlationId}::uuid) as r`, 'claim_handoff');
  }
  revoke(a: Parameters<WindowWrites['revoke']>[0]) {
    return this.one(sql`select shell.revoke_handoff(${a.handoffId}::uuid, ${a.receiptId}::uuid, ${a.reason}, ${a.actor}::uuid, ${a.correlationId}::uuid) as r`, 'revoke_handoff');
  }
  publish(a: Parameters<WindowWrites['publish']>[0]) {
    return this.one(sql`select shell.publish_presentation(${a.stateId}::uuid, ${a.tenantId}::uuid, ${a.domainId}::uuid, ${a.display}, ${a.expectedVersion}::int, ${a.status},
      ${a.location === null ? null : JSON.stringify(a.location)}::jsonb, ${JSON.stringify(a.viewContext)}::jsonb, ${a.watermark}::timestamptz, ${a.classification}, ${a.audience},
      ${a.actor}::uuid, ${a.correlationId}::uuid) as r`, 'publish_presentation');
  }
}

export const WindowCapability = {
  read(tx: Tx, action: string): WindowReads { return new WindowCapabilityImpl(tx, action); },
  write(tx: Tx, action: string): WindowWrites { return new WindowCapabilityImpl(tx, action); },
};
