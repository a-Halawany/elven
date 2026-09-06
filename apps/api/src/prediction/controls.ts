/**
 * INHERITED CONTROLS (ES-29-002, as Phase 3's extraction applies it).
 *
 * A forecast is derived from evidence; a scenario from a forecast; a warning
 * from a scenario and the evidence that breached its indicator. None of them
 * may be LESS restricted than what it rests on, and none may be presented as
 * real when anything under it is synthetic. The fold is fail-closed: an input
 * that does not state its classification is treated as restricted, and one
 * that does not state its synthetic state as synthetic.
 */

export interface Controls {
  synthetic_state: boolean;
  classification: string;
  rights_profile: string | null;
  residency_profile: string | null;
  retention_profile: string | null;
  access_policy_ref: string | null;
  /** How many inputs the fold saw, so a reader can tell an empty fold from a real one. */
  inputs: number;
}

export interface ControlInput {
  synthetic_state?: unknown;
  classification?: unknown;
  rights_profile?: unknown;
  residency_profile?: unknown;
  retention_profile?: unknown;
  access_policy_ref?: unknown;
}

const RANK: Readonly<Record<string, number>> = Object.freeze({ public: 0, internal: 1, confidential: 2, restricted: 3 });

function mostRestrictive(values: string[]): string {
  let best = 'public'; let rank = -1;
  for (const v of values) {
    const r = RANK[v] ?? 3; // an unknown level is treated as restricted
    if (r > rank) { rank = r; best = RANK[v] === undefined ? 'restricted' : v; }
  }
  return rank < 0 ? 'restricted' : best;
}

function joined(values: Array<string | null>): string | null {
  const distinct = [...new Set(values.filter((v): v is string => typeof v === 'string' && v.length > 0))].sort();
  if (distinct.length === 0) return null;
  return distinct.length === 1 ? (distinct[0] as string) : distinct.join('; ');
}

/** Fold the controls of every input into the controls a derived object must carry. */
export function foldControls(inputs: ControlInput[]): Controls {
  if (inputs.length === 0) {
    return { synthetic_state: true, classification: 'restricted', rights_profile: null, residency_profile: null,
             retention_profile: null, access_policy_ref: null, inputs: 0 };
  }
  const str = (v: unknown): string | null => (typeof v === 'string' ? v : null);
  return {
    synthetic_state: inputs.some((i) => i.synthetic_state !== false),
    classification: mostRestrictive(inputs.map((i) => (typeof i.classification === 'string' ? i.classification : 'restricted'))),
    rights_profile: joined(inputs.map((i) => str(i.rights_profile))),
    residency_profile: joined(inputs.map((i) => str(i.residency_profile))),
    retention_profile: joined(inputs.map((i) => str(i.retention_profile))),
    access_policy_ref: joined(inputs.map((i) => str(i.access_policy_ref))),
    inputs: inputs.length,
  };
}

/** Controls as stored on a projection row (jsonb), read back defensively. */
export function controlsOf(v: unknown): ControlInput | null {
  if (v === null || typeof v !== 'object') return null;
  const c = v as Record<string, unknown>;
  if (c['classification'] === undefined && c['synthetic_state'] === undefined) return null;
  return c as ControlInput;
}
