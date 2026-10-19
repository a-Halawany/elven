-- B50 §HD (ES-25-003): the PER-TENANT / PER-DOMAIN facts of one database — one JSON array, one element per (tenant_id, domain_id) that holds
-- any canonical object, audit event or blob manifest (the PLATFORM scope: both null). backup.sh records it in MANIFEST.json beside the
-- per-database counts (database_facts.<edge>[db].scopes); restore.sh recomputes it on the restored database and verifies every scope's
-- counts and audit heads against the capture window, scope by scope. A pure read (superuser; no lock beyond the snapshot). One SELECT
-- expression returning json, embedded as a subquery by both scripts and by the harness (phase6-header-b50 §ES-25-003).
(select coalesce(json_agg(json_build_object(
    'tenant_id', k.tenant_id, 'domain_id', k.domain_id,
    'canonical_objects', coalesce(c.n, 0), 'audit_events', coalesce(a.n, 0), 'blob_manifests', coalesce(m.n, 0),
    'audit_heads', coalesce(h.heads, '{}'::json))
  order by k.tenant_id nulls first, k.domain_id nulls first), '[]'::json)
from (select tenant_id, domain_id from objects.canonical_objects union select tenant_id, domain_id from audit.audit_events
      union select tenant_id, domain_id from observation.blob_manifests) k
left join (select tenant_id, domain_id, count(*) n from objects.canonical_objects group by 1, 2) c
  on c.tenant_id is not distinct from k.tenant_id and c.domain_id is not distinct from k.domain_id
left join (select tenant_id, domain_id, count(*) n from audit.audit_events group by 1, 2) a
  on a.tenant_id is not distinct from k.tenant_id and a.domain_id is not distinct from k.domain_id
left join (select tenant_id, domain_id, count(*) n from observation.blob_manifests group by 1, 2) m
  on m.tenant_id is not distinct from k.tenant_id and m.domain_id is not distinct from k.domain_id
left join (select tenant_id, domain_id, json_object_agg(partition_id, max_seq order by partition_id) heads
             from (select tenant_id, domain_id, partition_id, max(audit_seq) max_seq from audit.audit_events group by 1, 2, 3) x group by 1, 2) h
  on h.tenant_id is not distinct from k.tenant_id and h.domain_id is not distinct from k.domain_id)
