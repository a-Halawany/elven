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
const apiModules = ['identity', 'tenancy', 'policy', 'audit', 'objects', 'health'];

/** Forbid module A importing module B internals, for all distinct pairs. */
const crossModuleRules = [];
for (const from of apiModules) {
  for (const to of apiModules) {
    if (from === to) continue;
    // The commit pipeline (objects) may use the bounded internal append ports.
    const allowedViaPort =
      from === 'objects' && (to === 'policy' || to === 'audit');
    crossModuleRules.push({
      name: `no-${from}-to-${to}`,
      severity: 'error',
      comment: `API module "${from}" may not reach into "${to}" (contract-only integration, ES-04-003)`,
      from: { path: `^${API}/${from}/` },
      to: {
        path: `^${API}/${to}/`,
        ...(allowedViaPort ? { pathNot: `^${API}/${to}/internal/` } : {}),
      },
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
        pathNot: `^${API}/(objects|policy|audit)/`,
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
