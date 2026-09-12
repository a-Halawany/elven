-- ============================================================
-- 0059 · An indicator may declare the FIRST observation day it watches.
--
-- THE FINDING (demonstration, 2026-09-11; CP-6 batch B3's scenario tree): "Upside assumes
-- recovering transits but shares Downside's below-threshold indicator". A recovery is
-- "transits back above a level AFTER the collapse" — and an indicator evaluated from the
-- first unseen observation has no notion of AFTER: any level inside the pre-collapse range
-- is satisfied by pre-collapse data (on the daily layer, by 2019), so a recovery indicator
-- would flip before the collapse it is meant to follow. A branch that says "recovery" cannot
-- be given a condition that means it with the vocabulary 0029 provides.
--
-- THE CHANGE. `observes_from` (a date, null = the series' beginning): the evaluator walks only
-- observations dated on or after it. The streak, the breach and the flip are unchanged; what
-- changes is where the watch begins. It is declared once, at definition, and recorded on the
-- indicator, so a reader of a flip can see which observations were in scope. Nothing here
-- re-evaluates an existing indicator; the 0029 signature of define_indicator is replaced by
-- one that takes the bound (null keeps 0029's behaviour exactly).
--
-- Forward only.
-- ============================================================
ALTER TABLE prediction.indicators_current ADD COLUMN observes_from date;
COMMENT ON COLUMN prediction.indicators_current.observes_from IS
  'the first observation day this indicator watches (null: the series'' beginning); an observation before it is never evaluated';

DROP FUNCTION IF EXISTS prediction.define_indicator(uuid,uuid,uuid,text,text,text,numeric,int,uuid,uuid,uuid);
CREATE OR REPLACE FUNCTION prediction.define_indicator(
  p_indicator_id uuid, p_tenant uuid, p_domain uuid, p_series_key text, p_description text,
  p_comparator text, p_threshold numeric, p_consecutive int, p_owner uuid, p_observes_from date,
  p_actor uuid, p_correlation uuid
) RETURNS void
SECURITY DEFINER SET search_path = prediction, observation, ctx, public, pg_catalog, pg_temp AS $$
BEGIN
  PERFORM observation.assert_authority(ARRAY['prediction.indicator.define']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  IF NOT EXISTS (SELECT 1 FROM prediction.series_registry s
                  WHERE s.tenant_id = p_tenant AND s.domain_id = p_domain AND s.series_key = p_series_key) THEN
    RAISE EXCEPTION 'indicator rejected: series % is not registered in this domain', p_series_key USING ERRCODE = '23503';
  END IF;
  INSERT INTO prediction.indicators_current (
    indicator_id, scope, tenant_id, domain_id, series_key, description, comparator, threshold,
    consecutive_days, owner_principal_id, state, correlation_id, observes_from
  ) VALUES (
    p_indicator_id, 'DOMAIN', p_tenant, p_domain, p_series_key, p_description, p_comparator, p_threshold,
    p_consecutive, p_owner, 'active', p_correlation, p_observes_from);
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION prediction.define_indicator(uuid,uuid,uuid,text,text,text,numeric,int,uuid,date,uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION prediction.define_indicator(uuid,uuid,uuid,text,text,text,numeric,int,uuid,date,uuid,uuid) TO eye_commit;
