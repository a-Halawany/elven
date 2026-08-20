/**
 * C18.1.3 — THE SOURCE-OWNED QUERY PLAN.
 *
 * Every authoritative psql command the producer runs gets its SQL from HERE, and the verifier
 * re-derives the SAME string and demands EXACT argv equality. The 15e8239 verifier accepted any
 * SQL in the final `psql -c` position (its graph used an unrestricted predicate there), so an
 * attacker could substitute the query behind a genuine-looking receipt — for a table's rows, for
 * a posture category, for anything. That hole is closed by construction: the SQL is not
 * attacker-supplied data, it is a pure function of the source contract plus the authenticated
 * metadata receipts.
 *
 * Nothing here may interpolate a secret, a credential or any value not derived from the source
 * contract and the (separately authenticated) catalog metadata.
 */
import {
  POSTURE_CATEGORIES, SNAPSHOT_SCHEMAS, SNAPSHOT_SECRET_COLUMNS, SUITE_MATRIX,
  TABLE_UNIVERSE_HISTORICAL, TABLE_UNIVERSE_LATEST, checkPlaceholder, expectedInstanceEnv,
  placeholder,
} from './c18-contract.mjs';

const schemasIn = () => SNAPSHOT_SCHEMAS.map((s) => `'${s}'`).join(',');

/** The readiness confirmation query — an AUTHENTICATED round trip, not a socket probe. */
export const READINESS_CONFIRM_SQL = 'select 1';

export const tablesMetaSql = () => `
    select coalesce(json_agg(json_build_object(
      'table', t.table_schema || '.' || t.table_name,
      'columns', (select json_agg(c.column_name order by c.ordinal_position)
                    from information_schema.columns c
                   where c.table_schema = t.table_schema and c.table_name = t.table_name),
      'pk', (select coalesce(json_agg(a.attname order by k.ord), '[]'::json)
               from pg_index i
               join pg_class cl on cl.oid = i.indrelid
               join pg_namespace n on n.oid = cl.relnamespace
               cross join lateral unnest(i.indkey) with ordinality as k(attnum, ord)
               join pg_attribute a on a.attrelid = cl.oid and a.attnum = k.attnum
              where i.indisprimary and n.nspname = t.table_schema and cl.relname = t.table_name)
    ) order by t.table_schema, t.table_name), '[]'::json)
    from information_schema.tables t
    where t.table_schema in (${schemasIn()}) and t.table_type = 'BASE TABLE'`;

/**
 * One table's rows, ordered by its primary key, with every secret-valued column replaced IN THE
 * SQL PROJECTION by the same domain-separated digest `secretDigest()` produces — so the raw psql
 * receipt never carries the secret (the C18.1.1 fix, preserved verbatim).
 */
export function tableRowsSql(table, pk, columns) {
  const key = Array.isArray(pk) && pk.length > 0 ? pk : columns;
  const order = key.map((c) => `t."${c}"`).join(',');
  let projection = 'to_jsonb(t)';
  for (const col of SNAPSHOT_SECRET_COLUMNS[table] ?? []) {
    const domain = `c18-secret-v1:${table}.${col}:`;
    projection = `jsonb_set(${projection}, '{${col}}', to_jsonb(`
      + `case when t."${col}" is null then null else `
      + `encode(sha256(convert_to('${domain}' || t."${col}"::text, 'UTF8')), 'hex') end))`;
  }
  return `select coalesce(json_agg(${projection} order by ${order}), '[]'::json) from ${table} t`;
}

export const fkMetaSql = () => `
    select coalesce(json_agg(json_build_object(
      'constraint', n.nspname || '.' || cl.relname || '.' || c.conname,
      'from', n.nspname || '.' || cl.relname,
      'to', fn.nspname || '.' || fcl.relname,
      'definition', pg_get_constraintdef(c.oid),
      'validated', c.convalidated, 'deferrable', c.condeferrable,
      'cols', (select json_agg(a.attname order by k.ord)
                 from unnest(c.conkey) with ordinality k(attnum, ord)
                 join pg_attribute a on a.attrelid = c.conrelid and a.attnum = k.attnum)
    ) order by n.nspname, cl.relname, c.conname), '[]'::json)
    from pg_constraint c
    join pg_class cl on cl.oid = c.conrelid
    join pg_namespace n on n.oid = cl.relnamespace
    join pg_class fcl on fcl.oid = c.confrelid
    join pg_namespace fn on fn.oid = fcl.relnamespace
    where c.contype = 'f' and n.nspname in (${schemasIn()})`;

export function fkPairsSql(from, cols) {
  const projected = cols.map((c) => `t."${c}"::text`).join(` || '|' || `);
  const notNull = cols.map((c) => `t."${c}" is not null`).join(' and ');
  return `select coalesce(json_agg(x order by x), '[]'::json)
         from (select ${projected} as x from ${from} t where ${notNull}) s`;
}

/** The FIFTEEN posture queries, one per code-owned category. */
export function postureSql(category) {
  const S = schemasIn();
  switch (category) {
    case 'roles': return `
      select coalesce(json_agg(json_build_object('role', rolname, 'login', rolcanlogin,
        'super', rolsuper, 'createrole', rolcreaterole, 'createdb', rolcreatedb,
        'bypassrls', rolbypassrls, 'inherit', rolinherit, 'connlimit', rolconnlimit)
        order by rolname), '[]'::json)
      from pg_roles where rolname like 'eye%'`;
    case 'memberships': return `
      select coalesce(json_agg(r.rolname || '->' || m.rolname order by r.rolname, m.rolname), '[]'::json)
      from pg_auth_members am
      join pg_roles r on r.oid = am.member join pg_roles m on m.oid = am.roleid
      where r.rolname like 'eye%' or m.rolname like 'eye%'`;
    case 'database_privileges': return `
      select coalesce(json_agg(coalesce(datacl::text, '(default)')), '[]'::json)
      from pg_database where datname = current_database()`;
    case 'schema_privileges': return `
      select coalesce(json_agg(nspname || '|' || nspowner::regrole::text || '|' || coalesce(nspacl::text, '(default)')
        order by nspname), '[]'::json)
      from pg_namespace where nspname in (${S}, 'canon', 'public')`;
    case 'table_grants': return `
      select coalesce(json_agg(grantee || '|' || table_schema || '.' || table_name || '|' || privilege_type
        order by grantee, table_schema, table_name, privilege_type), '[]'::json)
      from information_schema.role_table_grants
      where table_schema in (${S}) and grantee like 'eye%'`;
    case 'sequence_privileges': return `
      select coalesce(json_agg(n.nspname || '.' || c.relname || '|' || coalesce(c.relacl::text, '(default)')
        order by n.nspname, c.relname), '[]'::json)
      from pg_class c join pg_namespace n on n.oid = c.relnamespace
      where c.relkind = 'S' and n.nspname in (${S})`;
    case 'default_privileges': return `
      select coalesce(json_agg(d.defaclrole::regrole::text || '|' || coalesce(n.nspname, '(all)') || '|' ||
        d.defaclobjtype::text || '|' || d.defaclacl::text order by 1), '[]'::json)
      from pg_default_acl d left join pg_namespace n on n.oid = d.defaclnamespace`;
    case 'owners': return `
      select coalesce(json_agg(n.nspname || '.' || c.relname || '|' || c.relowner::regrole::text
        order by n.nspname, c.relname), '[]'::json)
      from pg_class c join pg_namespace n on n.oid = c.relnamespace
      where c.relkind in ('r', 'S', 'v') and n.nspname in (${S})`;
    case 'routines': return `
      select coalesce(json_agg(json_build_object(
        'fn', n.nspname || '.' || p.proname || '(' || pg_get_function_identity_arguments(p.oid) || ')',
        'secdef', p.prosecdef, 'owner', p.proowner::regrole::text,
        'language', l.lanname, 'volatility', p.provolatile,
        'config', coalesce(p.proconfig::text, ''),
        'body_sha256', encode(sha256(convert_to(pg_get_functiondef(p.oid), 'UTF8')), 'hex'),
        'acl', coalesce(p.proacl::text, ''))
        order by n.nspname, p.proname, pg_get_function_identity_arguments(p.oid)), '[]'::json)
      from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
      join pg_language l on l.oid = p.prolang
      where n.nspname in (${S}, 'canon')`;
    case 'rls': return `
      select coalesce(json_agg(json_build_object(
        'table', n.nspname || '.' || c.relname,
        'enabled', c.relrowsecurity, 'forced', c.relforcerowsecurity)
        order by n.nspname, c.relname), '[]'::json)
      from pg_class c join pg_namespace n on n.oid = c.relnamespace
      where n.nspname in (${S}) and c.relkind = 'r'`;
    case 'policies': return `
      select coalesce(json_agg(json_build_object(
        'table', schemaname || '.' || tablename, 'name', policyname, 'cmd', cmd,
        'roles', roles::text, 'qual', coalesce(qual, ''), 'check', coalesce(with_check, ''))
        order by schemaname, tablename, policyname), '[]'::json)
      from pg_policies where schemaname in (${S})`;
    case 'triggers': return `
      select coalesce(json_agg(n.nspname || '.' || c.relname || '|' || t.tgname || '|' ||
        pg_get_triggerdef(t.oid) order by n.nspname, c.relname, t.tgname), '[]'::json)
      from pg_trigger t
      join pg_class c on c.oid = t.tgrelid
      join pg_namespace n on n.oid = c.relnamespace
      where not t.tgisinternal and n.nspname in (${S})`;
    case 'columns': return `
      select coalesce(json_agg(table_schema || '.' || table_name || '|' || column_name || '|' ||
        data_type || '|' || is_nullable || '|' || coalesce(column_default, '')
        order by table_schema, table_name, column_name), '[]'::json)
      from information_schema.columns where table_schema in (${S})`;
    case 'constraints': return `
      select coalesce(json_agg(n.nspname || '.' || cl.relname || '|' || c.conname || '|' ||
        pg_get_constraintdef(c.oid) || '|' || c.convalidated || '|' || c.condeferrable
        order by n.nspname, cl.relname, c.conname), '[]'::json)
      from pg_constraint c join pg_class cl on cl.oid = c.conrelid
      join pg_namespace n on n.oid = cl.relnamespace where n.nspname in (${S})`;
    case 'indexes': return `
      select coalesce(json_agg(schemaname || '.' || tablename || '|' || indexname || '|' || indexdef
        order by schemaname, tablename, indexname), '[]'::json)
      from pg_indexes where schemaname in (${S})`;
    default: throw new Error(`no source-owned posture query for category '${category}'`);
  }
}

export const ledgerSql = () => `
    select coalesce(json_agg(json_build_object('filename', filename, 'digest', digest,
      'applied_at', applied_at::text) order by filename), '[]'::json)
    from public.schema_migrations`;

export const auditEventsSql = () => `
      select coalesce(json_agg(json_build_object('partition_id', partition_id, 'audit_seq', audit_seq,
        'event_jcs', event_jcs, 'previous_hash', previous_hash, 'row_hash', row_hash,
        'hash_alg_version', hash_alg_version, 'correlation_id', correlation_id,
        'policy_decision_id', (event_jcs::jsonb)->>'policy_decision_id')
        order by partition_id, audit_seq), '[]'::json)
      from audit.audit_events`;

export const auditHeadsSql = () => `
      select coalesce(json_agg(json_build_object('partition_id', partition_id, 'next_seq', next_seq,
        'head_hash', head_hash, 'frozen', frozen) order by partition_id), '[]'::json)
      from audit.audit_chain_heads`;

/** The label suffix each posture category's command carries. */
export const POSTURE_LABEL = Object.freeze({
  roles: 'roles', memberships: 'memberships', database_privileges: 'db-priv',
  schema_privileges: 'schema-priv', table_grants: 'table-grants',
  sequence_privileges: 'seq-priv', default_privileges: 'default-priv', owners: 'owners',
  routines: 'routines', rls: 'rls', policies: 'policies', triggers: 'triggers',
  columns: 'columns', constraints: 'constraints', indexes: 'indexes',
});

/**
 * The COMPLETE ordered snapshot plan for one snapshot: every label paired with the exact SQL the
 * command must have carried. `tablesMeta` and `fkMeta` are the authenticated metadata receipts
 * (their own membership is judged against the source-owned table universe elsewhere), so the plan
 * is a pure function of source + authenticated metadata — never of attacker-chosen text.
 */
export function snapshotQueryPlan({ prefix, tablesMeta, fkMeta }) {
  const steps = [{ label: `${prefix}-tables-meta`, sql: tablesMetaSql() }];
  for (const m of tablesMeta) {
    steps.push({
      label: `${prefix}-rows-${m.table.replace('.', '_')}`,
      sql: tableRowsSql(m.table, m.pk, m.columns),
    });
  }
  steps.push({ label: `${prefix}-fk-meta`, sql: fkMetaSql() });
  for (const f of fkMeta) {
    steps.push({
      label: `${prefix}-fk-${f.constraint.replace(/\./g, '_')}`,
      sql: fkPairsSql(f.from, f.cols),
    });
  }
  for (const cat of POSTURE_CATEGORIES) {
    steps.push({ label: `${prefix}-${POSTURE_LABEL[cat]}`, sql: postureSql(cat) });
  }
  steps.push({ label: `${prefix}-ledger`, sql: ledgerSql() });
  steps.push({ label: `${prefix}-audit-events`, sql: auditEventsSql() });
  steps.push({ label: `${prefix}-audit-heads`, sql: auditHeadsSql() });
  return steps;
}

// ── THE SOURCE-OWNED COMMAND GRAPH ────────────────────────────────────────────
/**
 * The producer's whole execution is a deterministic state machine over provisioning, readiness,
 * migration, snapshots, suites and checked cleanup. This walk re-derives that machine from the
 * SOURCE contract (table universes, posture categories, suite matrix, pinned images, the query
 * plan above, the isolation receipts) and requires the ledger to be EXACTLY one run of it.
 *
 * C18.1.3 strengthens three things the 15e8239 walk left loose:
 *   * every psql command's SQL must EQUAL the source-owned query-plan string (no predicate, no
 *     suffix match, no attacker-chosen text anywhere in argv);
 *   * every credential placeholder must be the exact `<REDACTED:path:CLASS>` for that path and a
 *     class the isolation receipt actually carries;
 *   * migration commands run the governed workspace runner, bound to a typed execution receipt.
 */
export function verifyCommandGraph({
  commands, receiptA, receiptB, images, rawText, migrationExecutions = null, cleanup = null,
}) {
  const problems = [];
  if (!Array.isArray(commands)) return ['command graph: commands.json is not an array'];
  for (const [tag, r] of [['path-a', receiptA], ['path-b', receiptB]]) {
    if (r === null || typeof r !== 'object') return [`command graph cannot bind: the ${tag} isolation receipt is missing`];
  }
  let pos = 0;
  let dead = false;
  const structural = (msg) => { problems.push(msg); dead = true; };
  const next = (label) => {
    if (dead) return null;
    const c = commands[pos];
    if (c === undefined || typeof c !== 'object' || c === null) {
      structural(`command graph: expected '${label}' at position ${pos + 1} but the ledger ended`);
      return null;
    }
    if (c.label !== label) {
      structural(`command graph: expected '${label}' at position ${pos + 1}, found '${c.label}'`);
      return null;
    }
    pos += 1;
    return c;
  };
  const mustSucceed = (c) => {
    if (c !== null && (c.exit !== 0 || c.signal !== null)) {
      problems.push(`command '${c.label}' recorded exit ${c.exit} signal ${c.signal}; the graph requires success`);
    }
  };
  const emptyEnv = (c) => {
    if (c !== null && Object.keys(c.env ?? {}).length !== 0) {
      problems.push(`command '${c.label}' carries environment bindings the graph does not authorize`);
    }
  };
  /** EXACT argv: every position is a literal string, or a checker that is itself exact. */
  const matchArgv = (c, pattern) => {
    if (c === null) return;
    const a = Array.isArray(c.argv) ? c.argv : [];
    if (a.length !== pattern.length) {
      problems.push(`command '${c.label}' argv arity ${a.length} is not the graph's ${pattern.length}`);
      return;
    }
    pattern.forEach((p, i) => {
      if (typeof p === 'string') {
        if (a[i] !== p) problems.push(`command '${c.label}' argv[${i}] ${JSON.stringify(a[i])} is not the source-owned ${JSON.stringify(p.length > 60 ? `${p.slice(0, 60)}…` : p)}`);
        return;
      }
      for (const problem of p(a[i], c)) problems.push(problem);
    });
  };
  const stdoutOf = (c) => (c === null ? null : rawText(c, 'stdout'));
  const jsonOf = (c) => {
    const text = stdoutOf(c);
    if (text === null) return undefined;
    try { return text.trim() === '' ? null : JSON.parse(text); } catch { return undefined; }
  };
  /**
   * C18.1.4 — a credential position must carry the LITERAL placeholder for its own class. The
   * 83d158c graph accepted any class that merely had a credential digest for that path, so
   * `PGPASSWORD=<REDACTED:a:EYE_DB_APP_PASSWORD>` — a different, valid class — passed in every
   * PostgreSQL and readiness position. `ph` still checks path and class registration; `exactPh`
   * additionally pins WHICH class belongs in this position.
   */
  const ph = (letter, r, prefix = '') => (v, c) => {
    const raw = String(v ?? '');
    if (!raw.startsWith(prefix)) return [`command '${c.label}' argv ${JSON.stringify(raw)} is not the ${prefix}<REDACTED:…> form`];
    return checkPlaceholder(raw.slice(prefix.length), letter, r, `command '${c.label}' argv ${JSON.stringify(raw)}`);
  };
  const exactPh = (letter, r, cls, prefix = '') => (v, c) => {
    const problems = ph(letter, r, prefix)(v, c);
    if (problems.length > 0) return problems;
    const want = `${prefix}${placeholder(letter, cls)}`;
    if (String(v) !== want) {
      return [`command '${c.label}' credential position carries ${JSON.stringify(String(v))}; this position requires the path-${letter} ${cls} class (${JSON.stringify(want)})`];
    }
    return [];
  };
  /** Exact instance environment, with per-class placeholders — no prefix matching. */
  const connEnv = (c, letter, r, extra = {}) => {
    if (c === null) return;
    const want = expectedInstanceEnv(letter, r, extra);
    const got = c.env ?? {};
    for (const [k, v] of Object.entries(want)) {
      if (got[k] !== v) {
        problems.push(`command '${c.label}' env ${k} is ${JSON.stringify(got[k])}; the ${r.path} binding requires ${JSON.stringify(v)}`);
      }
    }
    for (const k of Object.keys(got)) {
      if (!(k in want)) problems.push(`command '${c.label}' carries unauthorized environment key '${k}'`);
    }
  };
  const psqlArgv = (letter, r, sql) => ['docker', 'exec', '-e', exactPh(letter, r, 'EYE_DB_PASSWORD', 'PGPASSWORD='), '-i',
    r.container_name, 'psql', '-X', '-v', 'ON_ERROR_STOP=1', '-At', '-U', 'eye', '-d', r.database, '-c', sql];
  const planned = (letter, r) => (step) => {
    const c = next(step.label);
    mustSucceed(c); emptyEnv(c); matchArgv(c, psqlArgv(letter, r, step.sql));
    return c;
  };

  const walkInstance = (letter, r) => {
    const pg = next(`${letter}-pg-run`);
    mustSucceed(pg); emptyEnv(pg);
    matchArgv(pg, ['docker', 'run', '-d', '--name', r.container_name, '-e', 'POSTGRES_USER=eye', '-e',
      exactPh(letter, r, 'EYE_DB_PASSWORD', 'POSTGRES_PASSWORD='), '-e', `POSTGRES_DB=${r.database}`, '-p', '127.0.0.1:0:5432', images.postgres]);
    if (pg !== null && Array.isArray(pg.argv) && pg.argv[8] !== `POSTGRES_PASSWORD=${placeholder(letter, 'EYE_DB_PASSWORD')}`) {
      problems.push(`command '${pg.label}' container password is not the path-${letter} EYE_DB_PASSWORD class`);
    }
    const pgOut = stdoutOf(pg);
    if (pg !== null && pgOut !== null && pgOut.trim() !== r.container_id) {
      problems.push(`'${pg.label}' raw container id does not match the ${r.path} isolation receipt`);
    }
    const rd = next(`${letter}-redis-run`);
    mustSucceed(rd); emptyEnv(rd);
    matchArgv(rd, ['docker', 'run', '-d', '--name', r.redis_container, '-p', '127.0.0.1:0:6379', images.redis,
      'redis-server', '--requirepass', exactPh(letter, r, 'EYE_REDIS_PASSWORD')]);
    if (rd !== null && Array.isArray(rd.argv) && rd.argv[rd.argv.length - 1] !== placeholder(letter, 'EYE_REDIS_PASSWORD')) {
      problems.push(`command '${rd.label}' requirepass is not the path-${letter} EYE_REDIS_PASSWORD class`);
    }
    const rdOut = stdoutOf(rd);
    if (rd !== null && rdOut !== null && rdOut.trim() !== r.redis_container_id) {
      problems.push(`'${rd.label}' raw container id does not match the ${r.path} isolation receipt`);
    }
    for (const [inner, container, portField] of [['5432', r.container_name, 'port'], ['6379', r.redis_container, 'redis_port']]) {
      const pc = next(`${letter}-port-${inner}`);
      mustSucceed(pc); emptyEnv(pc);
      matchArgv(pc, ['docker', 'port', container, inner]);
      const out = stdoutOf(pc);
      if (pc !== null && out !== null) {
        const m = /:(\d+)\s*$/m.exec(out.trim());
        if (m === null || Number(m[1]) !== r[portField]) {
          problems.push(`'${pc.label}' port-discovery output does not equal the recorded ${r.path} ${portField} ${r[portField]}`);
        }
      }
    }
    let confirmed = false;
    for (let i = 0; i < 90 && !confirmed && !dead; i += 1) {
      const w = next(`${letter}-pg-wait-${i}`);
      if (w === null) break;
      emptyEnv(w);
      matchArgv(w, ['docker', 'exec', r.container_name, 'pg_isready', '-h', '127.0.0.1', '-p', '5432', '-U', 'eye', '-d', r.database]);
      if (w.exit === 0 && w.signal === null) {
        const conf = next(`${letter}-pg-confirm-${i}`);
        if (conf === null) break;
        emptyEnv(conf);
        matchArgv(conf, ['docker', 'exec', '-e', exactPh(letter, r, 'EYE_DB_PASSWORD', 'PGPASSWORD='), r.container_name,
          'psql', '-h', '127.0.0.1', '-X', '-At', '-U', 'eye', '-d', r.database, '-c', READINESS_CONFIRM_SQL]);
        if (conf.exit === 0 && conf.signal === null && (stdoutOf(conf) ?? '').trim() === '1') confirmed = true;
      }
    }
    if (!confirmed && !dead) structural(`command graph: path ${letter} records no successful authenticated readiness confirmation`);
  };

  /** A migration command is bound to its typed execution receipt: governed workspace runner,
   * exact argv, exact instance environment. The receipt itself (runner bytes, workspace
   * grammar, migration set, ceiling) is judged by verifyMigrationExecutions. */
  const walkMigrate = (label, letter, r) => {
    const exec = Array.isArray(migrationExecutions) ? migrationExecutions.find((e) => e.label === label) : undefined;
    // C18.1.4 — the ATTESTATION runs first, in the ledger, against the same governed workspace:
    // the runner's and every workspace migration's bytes are MEASURED, never asserted.
    const attest = next(`${label}-attest`);
    mustSucceed(attest); emptyEnv(attest);
    if (exec === undefined) {
      problems.push(`command '${label}' has no governed migration-execution receipt`);
    } else {
      matchArgv(attest, ['shasum', '-a', '256', `${exec.workspace}/scripts/migrate.mjs`,
        ...(Array.isArray(exec.migrations) ? exec.migrations : []).map((m) => `${exec.workspace}/migrations/${m.filename}`)]);
      if (attest !== null && exec.attest_command_id !== attest.id) {
        problems.push(`migration execution '${label}' attestation is bound to a different command than the one in the ledger`);
      }
    }
    const c = next(label);
    mustSucceed(c);
    if (exec === undefined) {
      matchArgv(c, ['node', (v, cc) => [`command '${cc.label}' runner ${JSON.stringify(v)} is unauthenticated`]]);
    } else {
      matchArgv(c, ['node', exec.runner_path]);
      if (c !== null && exec.command_id !== c.id) {
        problems.push(`migration execution '${label}' is bound to a different command than the one in the ledger`);
      }
    }
    connEnv(c, letter, r);
  };

  const walkSnapshot = (letter, snapLabel, r, universe) => {
    const pfx = `${letter}-${snapLabel}`;
    const wantTables = [...universe].sort();
    const meta = planned(letter, r)({ label: `${pfx}-tables-meta`, sql: tablesMetaSql() });
    const tablesMeta = jsonOf(meta);
    if (meta !== null) {
      if (!Array.isArray(tablesMeta)) { problems.push(`${pfx}: tables-meta raw output is not JSON`); return; }
      if (JSON.stringify(tablesMeta.map((m) => m.table)) !== JSON.stringify(wantTables)) {
        problems.push(`${pfx}: raw tables-meta output is not the source-owned ${universe.length}-table universe in canonical order`);
      }
    } else return;
    const fkStepsAt = [];
    for (const m of tablesMeta) {
      planned(letter, r)({ label: `${pfx}-rows-${m.table.replace('.', '_')}`, sql: tableRowsSql(m.table, m.pk, m.columns) });
    }
    const fkMetaCmd = planned(letter, r)({ label: `${pfx}-fk-meta`, sql: fkMetaSql() });
    const fkMeta = jsonOf(fkMetaCmd);
    if (!Array.isArray(fkMeta)) problems.push(`${pfx}: fk-meta raw output is not JSON`);
    else {
      const names = fkMeta.map((f) => f.constraint);
      if (JSON.stringify(names) !== JSON.stringify([...names].sort())) {
        problems.push(`${pfx}: raw fk-meta is not in canonical order`);
      }
      for (const f of fkMeta) {
        fkStepsAt.push(planned(letter, r)({
          label: `${pfx}-fk-${f.constraint.replace(/\./g, '_')}`, sql: fkPairsSql(f.from, f.cols),
        }));
      }
    }
    for (const cat of POSTURE_CATEGORIES) {
      planned(letter, r)({ label: `${pfx}-${POSTURE_LABEL[cat]}`, sql: postureSql(cat) });
    }
    planned(letter, r)({ label: `${pfx}-ledger`, sql: ledgerSql() });
    planned(letter, r)({ label: `${pfx}-audit-events`, sql: auditEventsSql() });
    planned(letter, r)({ label: `${pfx}-audit-heads`, sql: auditHeadsSql() });
  };

  walkInstance('a', receiptA);
  walkMigrate('a-migrate-historical', 'a', receiptA);
  walkSnapshot('a', 'a-before', receiptA, TABLE_UNIVERSE_HISTORICAL);
  walkMigrate('a-migrate-upgrade', 'a', receiptA);
  walkSnapshot('a', 'a-after', receiptA, TABLE_UNIVERSE_LATEST);
  walkSnapshot('a', 'a-final', receiptA, TABLE_UNIVERSE_LATEST);
  walkInstance('b', receiptB);
  walkMigrate('b-migrate-latest', 'b', receiptB);
  walkSnapshot('b', 'b-virgin', receiptB, TABLE_UNIVERSE_LATEST);
  for (const [letter, r] of [['a', receiptA], ['b', receiptB]]) {
    for (const suite of ['integration', 'acceptance']) {
      const c = next(`${letter}-suite-${suite}`);
      mustSucceed(c);
      matchArgv(c, [...SUITE_MATRIX[suite].command]);
      connEnv(c, letter, r, { NO_COLOR: '1', FORCE_COLOR: '0' });
    }
  }
  // CHECKED CLEANUP, EXECUTED: four removals, then four post-removal absence proofs.
  const containers = [receiptA.container_name, receiptA.redis_container, receiptB.container_name, receiptB.redis_container];
  for (const name of containers) {
    const c = next(`cleanup-rm-${name}`);
    mustSucceed(c); emptyEnv(c);
    matchArgv(c, ['docker', 'rm', '-fv', name]);
  }
  for (const name of containers) {
    const c = next(`cleanup-absent-${name}`);
    emptyEnv(c);
    matchArgv(c, ['docker', 'ps', '-aq', '--filter', `name=^${name}$`]);
    if (c !== null && (c.exit !== 0 || c.signal !== null)) {
      // A failed probe proves NOTHING about the container: it proves the probe failed.
      problems.push(`absence probe for '${name}' exited ${c.exit} (signal ${c.signal}); absence must be a SUCCESSFUL empty query`);
    }
    if (c !== null && c.exit === 0 && c.stdout_bytes !== 0) {
      problems.push(`absence probe for '${name}' returned output — the container still exists`);
    }
  }
  if (cleanup !== null && Array.isArray(cleanup.removals) && !dead) {
    for (const row of cleanup.removals) {
      const cmd = commands.find((c) => c.id === row?.command_id);
      if (cmd !== undefined && cmd.label !== `cleanup-rm-${row.container}`) {
        problems.push(`cleanup removal receipt for '${row.container}' points at command '${cmd.label}'`);
      }
    }
  }
  if (!dead && pos !== commands.length) {
    problems.push(`command graph: ${commands.length - pos} unauthorized trailing command(s) beginning with '${commands[pos]?.label}'`);
  }
  return problems;
}
