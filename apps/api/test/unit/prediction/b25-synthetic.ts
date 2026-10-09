/**
 * CP-6 B25 §MR — THE SYNTHETIC CORRIDOR SERIES the registry's unit tests and harness share. SYNTHETIC throughout (NORDWERK's data is the
 * demonstration's): a daily transit count around 60/day with a slow upward drift, a small weekly cycle, deterministic pseudo-normal noise
 * (sd 5), a six-day DISRUPTION EPISODE every 173 days (the count falls to ~55% — below 41 for five consecutive days, the corridor event),
 * and a +10/day level shift from 2023-06-01 (a synthetic "escort convoys begin" intervention the causal family can find).
 */
export const SYN_START = '2008-01-01';
export const SYN_END = '2024-01-01'; // exclusive
export const SYN_INTERVENTION = '2023-06-01';

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** A deterministic standard-normal draw for day index i (Box–Muller on two seeded uniforms). */
export function gauss(i: number): number {
  const r = mulberry32(0x9e3779b9 ^ (i * 2654435761));
  const u1 = Math.max(1e-12, r()); const u2 = r();
  return Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
}

export function synValue(date: string): number {
  const i = Math.round((Date.parse(`${date}T00:00:00Z`) - Date.parse(`${SYN_START}T00:00:00Z`)) / 86_400_000);
  const episode = i >= 100 && ((i - 100) % 173) < 6;
  const shift = date >= SYN_INTERVENTION ? 10 : 0;
  const base = 60 + 0.0015 * i + 3 * Math.sin((2 * Math.PI * i) / 7) + shift + 5 * gauss(i);
  return Number((episode ? base * 0.55 : base).toFixed(3));
}

export function synPoints(from = SYN_START, toExclusive = SYN_END): Array<{ date: string; value: number }> {
  const out: Array<{ date: string; value: number }> = [];
  for (let d = new Date(`${from}T00:00:00Z`); d.toISOString().slice(0, 10) < toExclusive; d.setUTCDate(d.getUTCDate() + 1)) {
    const date = d.toISOString().slice(0, 10);
    out.push({ date, value: synValue(date) });
  }
  return out;
}
