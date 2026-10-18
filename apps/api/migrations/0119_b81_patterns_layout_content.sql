-- ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
-- 0119 — CP-6 B81: SEARCH AND INTENT (F-P7-E-02), RESPONSIVE LAYOUT, DENSITY AND MULTI-WINDOW COMPOSITION (F-P7-E-04), OBJECT-CENTRED PAGES
-- (F-P7-E-06), CONTENT DESIGN AND TERMINOLOGY (F-P7-E-18), THE DEGRADED-STATE AND RECOVERY EXPERIENCE (F-P7-E-19), THE HUMAN-AUTHORITY
-- PATTERNS (F-P7-E-20), and B80's residues. 0001–0118 are applied or committed and untouched.
--
-- §0 PRELUDE (the integrator): the shared vocabulary widened by copying the list WHOLE (governance.artifact_kinds + 'terminology' — §CT's
-- terms register on B107's artifact core). The parts' tables and ports follow in their sections, folded in the order §0, §DG, §CT, §SI, §LY,
-- §HA (the defer intake), §RE.
--
-- THE PRINCIPLES (binding on every part): the interface never decides — a palette, an intent interpretation, a saved search, a recovery path
-- or a handoff executes NOTHING; every consequential act stays behind its page's Command Review and its own governed, human-gated port; a
-- degraded dependency is declared with what still works and what does not, by a named owner; words are governed (one canonical term per
-- concept); nothing is shown current, approved or available by inference. THREE CLAIMS: construction; demonstrated operation (the act —
-- SYNTHETIC personas, `claim = 'demonstration'`); real acceptance (H3) — never claimed (the shared non-demonstration recording path is
-- construction at B111).
-- ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════

-- §0.1 THE VOCABULARY (copied whole from 0118 §0.3, B81's addition marked) ─────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION governance.artifact_kinds() RETURNS text[] LANGUAGE sql IMMUTABLE AS $$ SELECT ARRAY[
  'requirement', 'capability', 'journey', 'component', 'deployable_unit', 'interface', 'schema', 'policy_bundle', 'test', 'fixture', 'evidence',
  'release_candidate', 'decision_record', 'standard', 'design_asset', 'design_component', 'pattern', 'principle', 'exception', 'acceptance_record',
  'data_product', 'data_authority', 'domain', 'change_proposal', 'conflict', 'baseline', 'stewardship_case', 'manifest', 'feature', 'role',
  -- B80 (0118 §0.3)
  'theme',
  -- B81 (0119 §0.1)
  'terminology'] $$;
GRANT EXECUTE ON FUNCTION governance.artifact_kinds() TO eye_app, eye_commit;
