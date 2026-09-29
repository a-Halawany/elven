/**
 * CP-6 B29 §C — THE HARNESS'S UNSTABLE ADAPTER (registered only in phase6-methods-b29.test.ts, never shipped): a method adapter whose
 * run misbehaves as its parameters ask — `mode` 'hang' (never returns: the containment's time bound kills it), 'crash' (the process
 * exits abnormally), 'oom' (allocates until the heap bound is exhausted), 'garbage' (answers an output that is not a MethodOutput) or
 * 'ok' (a small, pure, well-formed answer). Its PROBE input asks for 'ok'. Plain CommonJS so the out-of-process worker loads it as it
 * is; its digest is the sha256 of these bytes (the registry computes it, the worker recomputes it).
 */
'use strict';

const adapter = {
  modelRef: 'harness-unstable@1',
  family: 'system-dynamics',
  digest: 'computed-by-the-registry',
  requiredInputs: ['demand.daily'],
  validate(input) {
    const mode = input && input.params ? input.params.mode : undefined;
    return ['ok', 'hang', 'crash', 'oom', 'garbage'].includes(mode) ? [] : ['params.mode is ok, hang, crash, oom or garbage'];
  },
  run(input) {
    const mode = input.params.mode;
    if (mode === 'hang') { for (;;) { /* never returns */ } }
    if (mode === 'crash') { process.exit(70); }
    if (mode === 'oom') { const hoard = []; for (;;) hoard.push(new Array(1e6).fill(hoard.length)); }
    if (mode === 'garbage') return { series: 'not rows', summary: { note: 'garbage' } };
    const demand = Number((input.elements.find((e) => e.key === 'demand.daily') || { value: 0 }).value);
    const series = [];
    for (let d = 0; d < input.horizonDays; d++) series.push({ day: d + 1, demand: String(demand) });
    return { series, summary: { days: input.horizonDays, total_demand: String(demand * input.horizonDays) } };
  },
};

const probe = { modelRef: 'harness-unstable@1', params: { mode: 'ok' }, elements: [{ key: 'demand.daily', value: 10, unit: 'units' }], horizonDays: 2, seed: null };

module.exports = { adapter, probe };
