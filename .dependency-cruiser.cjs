/**
 * Module boundary enforcement (ES-65-003, ADR-P0-02) — blocking CI check.
 * Rules:
 *  - web  → contracts/tokens only (never api internals)
 *  - api modules → shared/config/contracts only; never each other's internals
 *  - internal append ports (policy/internal, audit/internal) importable ONLY
 *    by the objects commit pipeline and their own module
 *  - no circular dependencies
 */
const API = 'apps/api/src';
const apiModules = ['identity', 'tenancy', 'policy', 'audit', 'objects', 'health', 'pipeline'];

/**
 * Contract-only integration matrix (ES-04-003). The request pipeline is the
 * edge orchestrator: it may import identity/policy/audit (incl. their bounded
 * internal append ports) — nothing else crosses module lines except modules
 * calling the pipeline itself.
 */
const allowedImports = {
  pipeline: ['identity', 'policy', 'audit'],
  identity: [],
  tenancy: ['pipeline'],
  policy: [],
  audit: [],
  objects: ['pipeline'],
  health: [],
};
const crossModuleRules = [];
for (const from of apiModules) {
  for (const to of apiModules) {
    if (from === to) continue;
    if ((allowedImports[from] ?? []).includes(to)) continue;
    crossModuleRules.push({
      name: `no-${from}-to-${to}`,
      severity: 'error',
      comment: `API module "${from}" may not reach into "${to}" (contract-only integration, ES-04-003)`,
      from: { path: `^${API}/${from}/` },
      to: { path: `^${API}/${to}/` },
    });
  }
}

module.exports = {
  forbidden: [
    {
      name: 'no-circular',
      severity: 'error',
      from: {},
      to: { circular: true },
    },
    {
      name: 'web-only-packages',
      severity: 'error',
      comment: 'web consumes packages/* only, never API internals',
      from: { path: '^apps/web/' },
      to: { path: '^apps/api/' },
    },
    {
      name: 'api-not-web',
      severity: 'error',
      from: { path: '^apps/api/' },
      to: { path: '^apps/web/' },
    },
    {
      name: 'packages-standalone',
      severity: 'error',
      comment: 'packages never depend on apps',
      from: { path: '^packages/' },
      to: { path: '^apps/' },
    },
    {
      name: 'internal-ports-bounded',
      severity: 'error',
      comment:
        'bounded internal append ports (ADR-P0-08): only the owning module and the objects commit pipeline may import policy/internal or audit/internal',
      from: {
        path: `^${API}/`,
        // bootstrap is the audited one-shot seed (ADR-P0-04) — it appends its own evidence.
        pathNot: `^${API}/(pipeline|policy|audit|bootstrap)/`,
      },
      to: { path: `^${API}/(policy|audit)/internal/` },
    },
    ...crossModuleRules,
  ],
  options: {
    doNotFollow: { path: 'node_modules' },
    exclude: { path: '\\.(test|spec)\\.ts$|/dist/|/\\.next/' },
    tsPreCompilationDeps: true,
    tsConfig: { fileName: 'tsconfig.base.json' },
  },
};
