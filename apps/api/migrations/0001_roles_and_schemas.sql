-- 0001: database roles and module schemas.
-- Exact privilege boundary (ADR-P0-09, ADR-P0-02):
--   eye_app             — application role: INSERT/SELECT on evidence & canonical tables,
--                         full DML only where a table is explicitly mutable.
--   eye_audit_allocator — audit chain-head allocator: UPDATE only on audit.audit_chain_heads.
-- Module schemas: one per owning module; no cross-module DB coupling (ES-04-003).

DO $$
BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'eye_app') THEN
    CREATE ROLE eye_app LOGIN PASSWORD 'eye_app_local_dev';
  END IF;
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'eye_audit_allocator') THEN
    CREATE ROLE eye_audit_allocator LOGIN PASSWORD 'eye_allocator_local_dev';
  END IF;
END $$;

CREATE SCHEMA IF NOT EXISTS identity;
CREATE SCHEMA IF NOT EXISTS tenancy;
CREATE SCHEMA IF NOT EXISTS policy;
CREATE SCHEMA IF NOT EXISTS audit;
CREATE SCHEMA IF NOT EXISTS objects;
CREATE SCHEMA IF NOT EXISTS config;

GRANT USAGE ON SCHEMA identity, tenancy, policy, audit, objects, config TO eye_app;
GRANT USAGE ON SCHEMA audit TO eye_audit_allocator;

-- Immutability guard trigger used by all append-only tables.
CREATE OR REPLACE FUNCTION public.raise_append_only() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'table %.% is append-only (ADR-P0-07): % prohibited',
    TG_TABLE_SCHEMA, TG_TABLE_NAME, TG_OP
    USING ERRCODE = 'raise_exception';
END $$ LANGUAGE plpgsql;
