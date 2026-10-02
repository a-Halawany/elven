-- 0093 — CP-6 B29-F (2026-09-29): THE OWNER'S BOUNDED B29 REVIEW, THE FORWARD CORRECTION OF B29-F1 (0092 is applied on the demonstration
-- and is untouched; the Phase 0 schemas gain nothing).
--
-- THE FINDING (B29-F1). A draft that a FAMILY's whole-version rule refuses at admission (a process line of zero capacity; more roles filled
-- than the headcount) had no recovery: its elements are append-only and unique per key (0032 tse_one_per_key, tse_append_only), so the
-- owner could not replace the value; the branch refuses a second draft while that one exists (twin.open_version); and the draft could
-- neither be admitted nor abandoned. The grounding preflight of 0092 checked each offered element against the kind's SCHEMA only, not the
-- family's rules over the accumulated version.
--
-- THE CORRECTION, in two halves:
--   * the GROUNDING PREFLIGHT now judges the family's version-level rules over the draft's accumulated elements together with the offered
--     ones (apps/api/src/twin/families/admission.ts, checkFamilyGround — no SQL: the rules are the families' TypeScript, read at grounding
--     as at admission), so a rule a person could violate through the ground route is refused BEFORE anything is written;
--   * THIS MIGRATION — the governed, history-preserving WITHDRAWAL of an open draft (twin.withdraw_version, the bound action
--     twin.version.withdraw): the draft's row moves draft → withdrawn ONCE, by the twin's owner (or the person who opened it), with a reason,
--     recorded as the event version.withdrawn; its elements STAY (append-only; nothing is deleted or rewritten), a withdrawn draft is
--     immutable, refuses grounding and admission (both ports read state = 'draft'), and the branch is free for a new draft
--     (twin.open_version counts open drafts only). The admission-time validator is unchanged: a version the family refuses is still
--     refused, and this is its recovery whatever path filled the draft (the ground route before this correction, a carry-forward, a coupling).
--
-- Forward only: nothing of 0032 / 0035 / 0081 / 0092 is edited. Re-declared here, each with its 0081/0092 body and ONE addition:
-- twin.versions_immutable (the withdrawn state), twin.upstream_owner_boundary (the new event in its list).
-- ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════

-- ============================================================
-- §F1.1 THE WITHDRAWN STATE of a version row: who, when, why — bound by CHECK, frozen by trigger.
-- ============================================================
ALTER TABLE twin.twin_versions DROP CONSTRAINT twin_versions_state_check;
ALTER TABLE twin.twin_versions ADD CONSTRAINT twin_versions_state_check CHECK (state IN ('draft', 'admitted', 'withdrawn'));
ALTER TABLE twin.twin_versions
  ADD COLUMN withdrawn_at      timestamptz,
  ADD COLUMN withdrawn_by      uuid,
  ADD COLUMN withdrawal_reason text CHECK (withdrawal_reason IS NULL OR length(btrim(withdrawal_reason)) BETWEEN 2 AND 1000);
ALTER TABLE twin.twin_versions ADD CONSTRAINT twv_withdrawn_bound CHECK (
  (state = 'withdrawn') = (withdrawn_at IS NOT NULL AND withdrawn_by IS NOT NULL AND withdrawal_reason IS NOT NULL));
-- A withdrawn row was never admitted: it binds no digests and no admission instant.
ALTER TABLE twin.twin_versions ADD CONSTRAINT twv_withdrawn_unadmitted CHECK (
  state <> 'withdrawn' OR (state_set_digest IS NULL AND header_digest IS NULL AND admitted_at IS NULL));

-- ============================================================
-- §F1.2 THE EVENT VOCABULARY gains version.withdrawn (0092 §0.2's list, plus one).
-- ============================================================
ALTER TABLE twin.twin_events DROP CONSTRAINT twin_events_event_check;
ALTER TABLE twin.twin_events ADD CONSTRAINT twin_events_event_check
  CHECK (event IN ('twin.declared', 'version.opened', 'element.grounded', 'version.admitted', 'version.unverified', 'version.reverified', 'version.validated',
                   'contract.published', 'contract.retired', 'link.declared', 'link.retired', 'coupling.proposed', 'coupling.applied', 'coupling.declined',
                   'kind.registered', 'method.bound', 'method.unbound', 'proposal.drafted', 'proposal.decided',
                   /* B29-F1 (0093) */ 'version.withdrawn'));

-- ============================================================
-- §F1.3 IMMUTABILITY: 0081's body (the admitted row frozen by NAMED columns), plus the withdrawn row frozen WHOLE, plus the one
--   transition draft → withdrawn, which must carry its who/when/why and change nothing else of the row. A draft never becomes admitted
--   and withdrawn at once, and an admitted row never becomes withdrawn (0081's first branch already refuses NEW.state <> 'admitted').
-- ============================================================
CREATE OR REPLACE FUNCTION twin.versions_immutable() RETURNS trigger
SET search_path = twin, pg_catalog, pg_temp AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'twin versions are append-only: DELETE prohibited' USING ERRCODE = '2F002';
  END IF;
  IF OLD.state = 'admitted' THEN
    IF NEW.state <> 'admitted' OR NEW.state_set_digest IS DISTINCT FROM OLD.state_set_digest
       OR NEW.header_digest IS DISTINCT FROM OLD.header_digest OR NEW.element_count <> OLD.element_count
       OR NEW.completeness <> OLD.completeness OR NEW.missing_keys <> OLD.missing_keys
       OR NEW.known_at <> OLD.known_at OR NEW.observed_through IS DISTINCT FROM OLD.observed_through
       OR NEW.branch_id <> OLD.branch_id OR NEW.forked_from_version IS DISTINCT FROM OLD.forked_from_version
       OR NEW.supersedes IS DISTINCT FROM OLD.supersedes OR NEW.synthetic_state <> OLD.synthetic_state
       OR NEW.controls <> OLD.controls OR NEW.admitted_at IS DISTINCT FROM OLD.admitted_at THEN
      RAISE EXCEPTION 'twin version % of % is admitted and immutable; only its verification and fitness state may change, by event', OLD.version, OLD.twin_id
        USING ERRCODE = '2F002';
    END IF;
  END IF;
  /* B29-F1 (0093) */
  IF OLD.state = 'withdrawn' THEN
    RAISE EXCEPTION 'twin version % of % is withdrawn and immutable', OLD.version, OLD.twin_id USING ERRCODE = '2F002';
  END IF;
  IF OLD.state = 'draft' AND NEW.state = 'withdrawn' THEN
    IF NEW.withdrawn_at IS NULL OR NEW.withdrawn_by IS NULL OR NEW.withdrawal_reason IS NULL
       OR (to_jsonb(NEW) - 'state' - 'withdrawn_at' - 'withdrawn_by' - 'withdrawal_reason') <> (to_jsonb(OLD) - 'state' - 'withdrawn_at' - 'withdrawn_by' - 'withdrawal_reason') THEN
      RAISE EXCEPTION 'twin version % of % is withdrawn by the withdrawal port alone: who, when and why, and nothing else of the row changes', OLD.version, OLD.twin_id
        USING ERRCODE = '2F002';
    END IF;
  END IF;
  RETURN NEW;
END $$ LANGUAGE plpgsql;

-- ============================================================
-- §F1.4 THE OWNERSHIP BOUNDARY (0092 §A.5's body, the event list plus one): the owner of an upstream twin withdraws nothing of a
--   downstream twin, as they open, ground and admit nothing of it.
-- ============================================================
CREATE OR REPLACE FUNCTION twin.upstream_owner_boundary() RETURNS trigger
SECURITY DEFINER SET search_path = twin, pg_catalog, pg_temp AS $$
DECLARE v_upstream uuid;
BEGIN
  IF NEW.event NOT IN ('version.opened', 'element.grounded', 'version.admitted', /* B29-F1 (0093) */ 'version.withdrawn') THEN RETURN NEW; END IF;
  SELECT l.upstream_twin_id INTO v_upstream
    FROM twin.twin_links l JOIN twin.twins_current u ON u.twin_id = l.upstream_twin_id JOIN twin.twins_current d ON d.twin_id = l.downstream_twin_id
   WHERE l.downstream_twin_id = NEW.twin_id AND l.state = 'live' AND u.owner_principal_id = NEW.actor_principal_id AND d.owner_principal_id <> NEW.actor_principal_id
   LIMIT 1;
  IF FOUND THEN
    RAISE EXCEPTION 'coupling rejected (ownership_boundary): the owner of upstream twin % does not write downstream twin % (% refused); its owner applies what the upstream proposes',
      v_upstream, NEW.twin_id, NEW.event USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END $$ LANGUAGE plpgsql;

-- ============================================================
-- §F1.5 THE PORT: twin.withdraw_version — the bound action twin.version.withdraw, the acting principal recorded, the twin's owner or the
--   draft's opener (a peer twin owner in the domain is refused: the draft is theirs to abandon, no one else's), an open draft in this
--   domain (an admitted version is immutable, a withdrawn one is already withdrawn), a reason of substance. The elements stay as they were
--   grounded: the withdrawal changes the ROW's state and writes the event; the refusal family is `draft withdrawal rejected (<class>): …`
--   (observation-errors.ts maps the class — ownership 403, unknown 404, state 409, the rest 422).
-- ============================================================
CREATE OR REPLACE FUNCTION twin.withdraw_version(
  p_twin_id uuid, p_tenant uuid, p_domain uuid, p_version int, p_reason text, p_actor uuid, p_event_id uuid, p_correlation uuid
) RETURNS jsonb
SECURITY DEFINER SET search_path = twin, observation, ctx, public, pg_catalog, pg_temp AS $$
DECLARE v twin.twin_versions%ROWTYPE; v_owner uuid; v_now timestamptz := clock_timestamp(); v_elements int;
BEGIN
  PERFORM observation.assert_authority(ARRAY['twin.version.withdraw']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  IF p_actor IS DISTINCT FROM public.eye_principal() THEN
    RAISE EXCEPTION 'draft withdrawal rejected (actor): recorded by the acting principal' USING ERRCODE = '42501';
  END IF;
  IF p_reason IS NULL OR length(btrim(p_reason)) < 2 OR length(btrim(p_reason)) > 1000 THEN
    RAISE EXCEPTION 'draft withdrawal rejected (reason): a withdrawal names its reason (2–1000 characters)' USING ERRCODE = '22023';
  END IF;
  SELECT owner_principal_id INTO v_owner FROM twin.twins_current t WHERE t.twin_id = p_twin_id AND t.tenant_id = p_tenant AND t.domain_id = p_domain;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'draft withdrawal rejected (unknown_twin): no such twin % in this domain', p_twin_id USING ERRCODE = '23503';
  END IF;
  SELECT * INTO v FROM twin.twin_versions x WHERE x.twin_id = p_twin_id AND x.version = p_version AND x.tenant_id = p_tenant AND x.domain_id = p_domain FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'draft withdrawal rejected (unknown_version): twin % has no version % in this domain', p_twin_id, p_version USING ERRCODE = '23503';
  END IF;
  IF v.state = 'admitted' THEN
    RAISE EXCEPTION 'draft withdrawal rejected (state): version % of twin % is admitted and immutable; a later version supersedes it', p_version, p_twin_id USING ERRCODE = '22023';
  END IF;
  IF v.state = 'withdrawn' THEN
    RAISE EXCEPTION 'draft withdrawal rejected (state): version % of twin % was withdrawn at % (%)', p_version, p_twin_id, v.withdrawn_at, v.withdrawal_reason USING ERRCODE = '22023';
  END IF;
  IF p_actor <> v_owner AND p_actor <> v.opened_by THEN
    RAISE EXCEPTION 'draft withdrawal rejected (ownership): draft version % of twin % is withdrawn by the twin''s owner or by the person who opened it', p_version, p_twin_id USING ERRCODE = '42501';
  END IF;
  SELECT count(*) INTO v_elements FROM twin.state_elements e WHERE e.twin_id = p_twin_id AND e.version = p_version;
  UPDATE twin.twin_versions SET state = 'withdrawn', withdrawn_at = v_now, withdrawn_by = p_actor, withdrawal_reason = btrim(p_reason)
   WHERE twin_id = p_twin_id AND version = p_version;
  INSERT INTO twin.twin_events (event_id, scope, tenant_id, domain_id, twin_id, event, actor_principal_id, details, correlation_id)
  VALUES (p_event_id, 'DOMAIN', p_tenant, p_domain, p_twin_id, 'version.withdrawn', p_actor,
          jsonb_build_object('version', p_version, 'branch_id', v.branch_id, 'reason', btrim(p_reason), 'element_count', v_elements,
                             'opened_by', v.opened_by, 'opened_at', v.opened_at, 'withdrawn_at', v_now), p_correlation);
  RETURN jsonb_build_object('twin_id', p_twin_id, 'version', p_version, 'branch_id', v.branch_id, 'state', 'withdrawn', 'element_count', v_elements,
                            'withdrawn_at', v_now, 'withdrawn_by', p_actor, 'reason', btrim(p_reason));
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION twin.withdraw_version(uuid,uuid,uuid,int,text,uuid,uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION twin.withdraw_version(uuid,uuid,uuid,int,text,uuid,uuid,uuid) TO eye_commit;
