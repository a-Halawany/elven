/**
 * CP-6 B29 §C (0092) — THE METHOD FABRIC: the registry of method adapters (types.ts) by model reference, their containment (out of
 * process, time and memory bounds, the fault count that quarantines an adapter, the governed reinstatement) and the per-twin method
 * bindings the generalised runtime dispatches on. supply-flow@1 is registered here UNCHANGED (its bytes and digest pinned).
 *
 * The registry answers WHICH IMPLEMENTATION a model reference names in this process: the product's methods (builtin.ts — the six
 * families and supply-flow@1) and, at run time, an adapter OUTSIDE the product's tree registered by module path (the harness's
 * unstable adapter). A module's digest is the sha256 of its file's bytes, computed here and again by the worker that loads it — the
 * registry row (twin.behaviour_models.implementation_digest) must pin the same bytes or the run is refused. A registered module
 * never replaces a product method. What a model reference is ALLOWED to do — the family, the pinned digest, the containment, the
 * binding to a twin, the quarantine — is the database's (0092 §C); the registry only holds the code.
 */
import { Injectable } from '@nestjs/common';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { isAbsolute, join } from 'node:path';
import { METHOD_FAMILIES, type MethodAdapter, type MethodInput } from './types.js';
import { BUILTIN_METHODS } from './builtin.js';
import { runContained, type Contained, type Containment } from './method-runner.js';

export interface MethodEntry {
  adapter: MethodAdapter;
  /** The fixed PROBE input the fabric runs after a fault (§C's reinstatement); null for a method that is never contained (supply-flow@1). */
  probe: MethodInput | null;
  /** An adapter outside the product's tree: the module the worker loads. Null for a product method. */
  module: string | null;
}

@Injectable()
export class MethodRegistry {
  private readonly entries = new Map<string, MethodEntry>(BUILTIN_METHODS.map((m) => [m.adapter.modelRef, { adapter: m.adapter, probe: m.probe, module: null }]));

  get(modelRef: string): MethodEntry | undefined { return this.entries.get(modelRef); }
  list(): MethodEntry[] { return [...this.entries.values()]; }

  /**
   * Register an adapter from a CommonJS module OUTSIDE the product's tree (exports `adapter` and `probe`) — the harness's route to
   * an adapter the product does not ship. Refused when it would shadow a product method or its family is not one of the seven.
   * Answers the entry, its digest the sha256 of the module's bytes.
   */
  registerModule(modulePath: string): MethodEntry {
    if (!isAbsolute(modulePath)) throw new Error('a registered method module is named by its absolute path');
    const bytes = readFileSync(modulePath);
    const loaded = createRequire(join(process.cwd(), 'method-registry.cjs'))(modulePath) as { adapter?: MethodAdapter; probe?: MethodInput | null };
    const a = loaded.adapter;
    if (a === undefined || typeof a.modelRef !== 'string' || typeof a.validate !== 'function' || typeof a.run !== 'function') throw new Error(`module ${modulePath} does not export a method adapter`);
    if (!(METHOD_FAMILIES as readonly string[]).includes(a.family)) throw new Error(`module ${modulePath}: family ${String(a.family)} is not a method family`);
    if (BUILTIN_METHODS.some((m) => m.adapter.modelRef === a.modelRef)) throw new Error(`${a.modelRef} is a product method; a registered module never replaces it`);
    const entry: MethodEntry = { adapter: { ...a, digest: createHash('sha256').update(bytes).digest('hex') }, probe: loaded.probe ?? null, module: modulePath };
    this.entries.set(a.modelRef, entry);
    return entry;
  }

  /** Remove a registered module's adapter (a product method stays). */
  unregister(modelRef: string): void {
    const e = this.entries.get(modelRef);
    if (e !== undefined && e.module !== null) this.entries.delete(modelRef);
  }

  /** Execute a registered method on one input under the containment its registry row declares. */
  async execute(entry: MethodEntry, input: MethodInput, containment: Containment): Promise<Contained> {
    return runContained(entry.adapter, entry.module, input, containment);
  }
}
