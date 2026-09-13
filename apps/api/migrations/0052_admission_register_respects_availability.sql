-- ============================================================
-- 0052 · The admission register must not confirm against evidence that cannot be reused.
--
-- Migration 0051 §3 keys idempotency on (source, item key) and no-ops when the digest
-- offered equals the digest held. That is right when the held evidence IS held — and
-- wrong when it is not. Phase 1's rule, and the corrected behaviour of the residual
-- review, is that evidence whose latest version is WITHDRAWN, whose bytes were
-- governed-deleted, whose manifest is gone, or whose bytes no longer verify is NOT
-- something a later retrieval may be "confirmed" against: the incoming bytes are
-- admitted as NEW evidence, the run says what it could not reuse, and the withdrawal
-- or deletion stands untouched.
--
-- The lifecycle establishes that by READING (`availabilityOf`, before any comparison).
-- The register is told the answer, and follows it: when the caller states that what is
-- held for this key was found unavailable, the register is REPLACED by the admission
-- the lifecycle decided on, and says what it displaced. It never decides availability
-- itself — a register is an index of admissions, not an authority on whether bytes are
-- still there.
--
-- Forward only. The 0051 signature is dropped so there is exactly one port; nothing
-- calls it but the acquisition lifecycle, in the admitting transaction.
-- ============================================================

DROP FUNCTION IF EXISTS observation.claim_item_admission(uuid,uuid,uuid,text,text,uuid,uuid,int,int,uuid);

CREATE OR REPLACE FUNCTION observation.claim_item_admission(
  p_tenant uuid, p_domain uuid, p_source_id uuid, p_item_key text,
  p_content_digest text, p_evd_object_id uuid, p_obs_object_id uuid,
  p_object_version int, p_contract_version int, p_run_id uuid,
  /*
   * TRUE when the caller has ESTABLISHED, by reading, that the evidence held for this
   * item key cannot be reused (withdrawn, governed-deleted, no manifest, or bytes that
   * no longer verify). The register then follows the caller's governed decision instead
   * of confirming against something that is not there.
   */
  p_readmit_unavailable boolean DEFAULT false
) RETURNS jsonb
SECURITY DEFINER SET search_path = observation, ctx, public, pg_catalog, pg_temp AS $$
DECLARE v_held observation.admitted_items%ROWTYPE;
BEGIN
  PERFORM observation.assert_authority(ARRAY['observation.item.admit']);
  PERFORM observation.assert_scope(p_tenant, p_domain);

  SELECT * INTO v_held FROM observation.admitted_items
   WHERE source_id = p_source_id AND item_key = p_item_key FOR UPDATE;

  IF NOT FOUND THEN
    INSERT INTO observation.admitted_items (
      source_id, item_key, scope, tenant_id, domain_id, content_digest,
      evd_object_id, obs_object_id, object_version, contract_version, run_id
    ) VALUES (
      p_source_id, p_item_key, 'DOMAIN', p_tenant, p_domain, p_content_digest,
      p_evd_object_id, p_obs_object_id, p_object_version, p_contract_version, p_run_id);
    RETURN jsonb_build_object('outcome', 'admitted', 'evd_object_id', p_evd_object_id,
                              'object_version', p_object_version);
  END IF;

  -- WHAT IS HELD CANNOT BE REUSED. The caller read that and decided to admit anew; the
  -- register records the admission and names the evidence it no longer indexes. The
  -- displaced object is untouched — withdrawn stays withdrawn, deleted stays deleted.
  IF p_readmit_unavailable THEN
    UPDATE observation.admitted_items
       SET content_digest = p_content_digest, evd_object_id = p_evd_object_id,
           obs_object_id = p_obs_object_id, object_version = p_object_version,
           contract_version = p_contract_version, run_id = p_run_id,
           last_admitted_at = clock_timestamp()
     WHERE source_id = p_source_id AND item_key = p_item_key;
    RETURN jsonb_build_object('outcome', 'admitted', 'evd_object_id', p_evd_object_id,
                              'object_version', p_object_version,
                              'replaced_evd_object_id', v_held.evd_object_id,
                              'replaced_object_version', v_held.object_version);
  END IF;

  IF v_held.content_digest = p_content_digest THEN
    RETURN jsonb_build_object('outcome', 'noop', 'evd_object_id', v_held.evd_object_id,
                              'object_version', v_held.object_version,
                              'content_digest', v_held.content_digest,
                              'first_admitted_at', to_char(v_held.first_admitted_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
                              'run_id', v_held.run_id);
  END IF;

  IF v_held.evd_object_id = p_evd_object_id AND p_object_version = v_held.object_version + 1 THEN
    UPDATE observation.admitted_items
       SET content_digest = p_content_digest, obs_object_id = p_obs_object_id,
           object_version = p_object_version, contract_version = p_contract_version,
           run_id = p_run_id, last_admitted_at = clock_timestamp(), revisions = revisions + 1
     WHERE source_id = p_source_id AND item_key = p_item_key;
    RETURN jsonb_build_object('outcome', 'revised', 'evd_object_id', p_evd_object_id,
                              'object_version', p_object_version,
                              'prior_digest', v_held.content_digest);
  END IF;

  RETURN jsonb_build_object('outcome', 'conflict',
                            'held_evd_object_id', v_held.evd_object_id,
                            'held_object_version', v_held.object_version,
                            'held_digest', v_held.content_digest,
                            'held_run_id', v_held.run_id,
                            'claimed_evd_object_id', p_evd_object_id,
                            'claimed_object_version', p_object_version);
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION observation.claim_item_admission(uuid,uuid,uuid,text,text,uuid,uuid,int,int,uuid,boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION observation.claim_item_admission(uuid,uuid,uuid,text,text,uuid,uuid,int,int,uuid,boolean) TO eye_commit;
