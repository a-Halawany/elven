/**
 * A SAMPLED high-water mark of the process's memory over a stretch of work (CP-6 B16; the B15 S2 measurement re-stated to what it
 * measures). What is measured, exactly:
 *
 *   `process.memoryUsage()` is read on the event loop every `intervalMs` (50 ms by default) while the work runs; each reading is
 *   heapUsed + external — the V8 heap and the C++ memory bound to it, which INCLUDES the ArrayBuffer backing stores (node reports
 *   `arrayBuffers` as the part of `external` that is backing stores; it is reported beside the sum and never added again); the
 *   baseline is the same sum read once before the first tick; the peak is the highest sample; `above` is peak − baseline (never negative).
 *
 *   What it is NOT: a peak of RSS (the resident set; what the kernel gave the process, which the allocator does not hand back on a
 *   tick), and not a continuous measurement — a sample is taken only when the event loop turns, so a synchronous stretch between two
 *   samples (a large Buffer decoded, a JSON body parsed) is not observed at its own peak; a stretch shorter than the interval can pass
 *   between two samples entirely. The measurement therefore bounds what the product HELD across event-loop turns — the archive never
 *   whole in memory while the stream route, the station write, the https delivery and the import read and copy it one record at a
 *   time — and is reported as such: "sampled on the event loop every 50 ms; synchronous peaks between samples are not observed;
 *   heapUsed + external (external counts the ArrayBuffer backing stores) above the baseline, not RSS".
 */
export interface MemorySample { at: number; heapUsed: number; external: number; arrayBuffers: number; total: number }

export interface SampledPeak {
  /** heapUsed + external before the work started (after the optional GC). */
  baseline: number;
  /** The highest sampled total during the work. */
  peak: number;
  /** peak − baseline, floored at 0: what the work HELD above the baseline as far as the samples saw. */
  above: number;
  /** The sample at the peak (the three components, and the instant relative to the start in ms). */
  peakSample: MemorySample;
  samples: number;
  intervalMs: number;
  elapsedMs: number;
  /** The honest statement of what was measured — printed beside the number wherever it is reported. */
  statement: string;
}

export const SAMPLER_STATEMENT = 'sampled on the event loop every 50 ms; synchronous peaks between samples are not observed; heapUsed + external (external counts the ArrayBuffer backing stores; arrayBuffers reported beside it, not added again) above the baseline, not RSS';

const totalOf = (): MemorySample => {
  const m = process.memoryUsage();
  return { at: 0, heapUsed: m.heapUsed, external: m.external, arrayBuffers: m.arrayBuffers, total: m.heapUsed + m.external };
};

/**
 * Run `work` while sampling; resolve with its result and the measurement. A GC before the baseline (when the process exposes one,
 * `--expose-gc`) makes the baseline the live set rather than whatever the previous case left unreclaimed; without it the baseline is
 * simply higher and `above` smaller — never larger — which is why the statement names the baseline, not an absolute.
 */
export async function sampledPeak<T>(work: () => Promise<T>, intervalMs = 50): Promise<{ result: T; measured: SampledPeak }> {
  if (typeof global.gc === 'function') global.gc();
  const started = Date.now();
  const first = totalOf();
  let peak: MemorySample = first; let samples = 1;
  const tick = () => {
    const s = totalOf(); s.at = Date.now() - started; samples += 1;
    if (s.total > peak.total) peak = s;
  };
  const timer = setInterval(tick, intervalMs);
  try {
    const result = await work();
    tick();
    const statement = intervalMs === 50 ? SAMPLER_STATEMENT : SAMPLER_STATEMENT.replace('every 50 ms', `every ${intervalMs} ms`);
    return { result, measured: { baseline: first.total, peak: peak.total, above: Math.max(0, peak.total - first.total), peakSample: peak, samples, intervalMs, elapsedMs: Date.now() - started, statement } };
  } finally {
    clearInterval(timer);
  }
}

/** The measurement as one line for a log or an assertion message. */
export function describeSampledPeak(m: SampledPeak, label = 'memory'): string {
  const mib = (n: number) => (n / (1024 * 1024)).toFixed(1);
  return `${label}: ${mib(m.above)} MiB above a ${mib(m.baseline)} MiB baseline (peak ${mib(m.peak)} MiB at +${m.peakSample.at} ms: heapUsed ${mib(m.peakSample.heapUsed)}, external ${mib(m.peakSample.external)}, arrayBuffers ${mib(m.peakSample.arrayBuffers)}; ${m.samples} samples over ${m.elapsedMs} ms) — ${m.statement}`;
}
