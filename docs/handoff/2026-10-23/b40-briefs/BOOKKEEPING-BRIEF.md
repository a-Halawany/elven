# B40 — the bookkeeping and the records (before the live run)

Work in `/Users/halawany/work/personal/mohammed/new_project/.claude/worktrees/b40` (branch `phase6-b40`, head 7dea5adb). Commit there; never push.
Read `DESIGN.md` (binding), `MAP.md` (§1, §2, §10 — every row and its class), `rows.json` in this directory, and how the last stage did it:
`git -C /Users/halawany/work/personal/mohammed/new_project show --stat 235a80a2` (B82's bookkeeping commit: v09.csv etc., FEATURE_TRACKER, STAGES,
the controls, DELIVERY_PLAN, SUMMARY) and `13528290` (the integration pass's bookkeeping: STAGES own effort moved, then
`python3 audit/delivery/schedule-model.py --write`, `node audit/delivery/feature-tracker.mjs --write`, `node audit/delivery/feature-tracker.controls.mjs`,
`node audit/summarise.mjs` AND THEN `node audit/summarise-units.mjs` (summarise.mjs drops the units section; the units script appends it back),
`python3 audit/delivery/schedule-model.py --check`). Every row's `evidence` gains a B40 segment in the house form
(`| B40 (0123) 2026-10-21, local (fresh-database harnesses …): <what> `) and `impl_status` / `remaining_work` set exactly as below.

## Row outcomes (from the part reports; construction = local evidence; nothing here is real acceptance)
- **§RG (F-P1-01)** implemented: L1-C01, CAP-OB-02, JRN-02, FEX-02, R-09. Re-verified (V; status unchanged): SRC, V03-T-043, AI-39-001, DP-09-001,
  DP-09-002, PR-09-003, PR-09-005. Partial: V00-T-032 (response-change detection now §AP's — implemented there; schema understanding → B46),
  V01-T-009 (representativeness → B41–B44), ES-31-001 (blind spots → B41), PR-09-001 and CAP-OB-01 (source families → B42/B43/B44), PR-09-002 and
  PER-11 (coverage targets and plans → B41), DP-09-006 (the revocation drill built by §AC; signed acceptance → the shared non-demonstration
  recording path at B111, then H3/R2).
- **§VA (F-P1-02)** implemented: V00-T-033, V02-T-038. Partial: L1-C06 (keys, Ed25519 + JWS, four outcomes, measured coverage built; TLS pins
  CHECKED by §CR's gateway (IA-28-005) — set L1-C06 implemented if the pins are both declared and checked, else partial naming what is missing),
  ES-29-002 (inheritance read and rule register built; writes do not consult them; location/model/agent/side-effect dimensions → B62).
  Re-verified: V00-T-120, V00-T-122, AI-39-003, EVD. L1-C05 (the evidence-restore drill — §AC built it; set by its evidence), L1-I05, ES-29-004
  (re-verify by the full integration run).
- **§IN (F-P1-03)** implemented: IC-19, SP-22, DF-03, PR-16-001, PR-16-002, CAP-OB-11; V03-T-042, V03-T-268, ES-31-005 (§IN + §VA folded),
  DP-16-001, DAT-IN-12 (§IN + §AP's residency folded). Re-verified: DP-16-005, PR-16-003, PR-16-005. Partial: **L1-C07, V03-T-074, DAT-IN-11 — a
  real engine is proven only on an UNADMITTED evaluation image; the ClamAV admission is the owner's decision (DESIGN "D2 — the admission
  result": (a) dispositions, (b) a derived image, (c) wait)**; V03-T-276 (faults F47–F56 now all present — set implemented if the integration's
  fault suite proves every one, else partial naming the missing); V00-T-035 and V03-T-413 (→ B48); AR-011 (→ B74 after §AP/§AC — set by
  evidence); CAP-OB-12 (§AC's escape exercise done — set implemented if its evidence covers the row's clause).
- **§AP (F-P1-04)** implemented: L1-I02, V03-T-073, V03-T-266, V03-T-072 (record + enforce after the integration fold), DP-10-005 (after the fold),
  ES-31-007, V04-T-019 — F-P1-04 COMPLETES at B40 if all seven are implemented (verify stage per the tracker).
- **§CR (F-P1-12)** implemented: V03-T-440, IA-28-005, IA-47-005, DP-14-003. Re-verified: IA-47-003, RU-11. Partial: L1-C02 (families →
  B42/B43/B44), IA-28-001 (the API process's own OS network → B103), IA-28-003 (network-level denial NOT claimed → B103/B109, then R1),
  IA-47-001, INF-PF-12, DAT-IN-02 (first-party connectors still in the API process — carrier: name B103 for porting them onto the SDK unless
  MAP/STAGES name a better one; say which you chose).
- **§AC** (all PARTIAL, the signed acceptance → the shared path at B111 then H3/R2): PR-09-006, AT-09, DP-16-006, PR-16-006, AT-16.
- Any other row of `rows.json` not named above: set it from its part's evidence or leave it as it was, and LIST it in your report.

## Stages and carriers
- B40's own effort: keep the delivered units as own effort in the house form (B82's note), the features' completion stages set by the tracker
  (`--write`); B40 depends on nothing; its dependents take `F-P1-0x@B40` slices (DESIGN D1) — add the P1 lines to
  `audit/delivery/feature-tracker.controls.mjs` the way B82 added its slice controls, and run the controls.
- **B63** (the owner's word): own effort **+0.25–0.5 U** with the note in DESIGN.md's "Bookkeeping notes" (the audit-lock contention, the measurable
  completion evidence) — and the B82-era "Open for the owner" wording in the records replaced by this carrier.
- **The ClamAV admission, the SDK workspace descriptor and EXC-P1-001's closing** are the owner's decisions — no effort moved for them; named on the
  partial rows. The fonts' 0.15–0.3 U stays at B111; the local C15 timeout stays UNRESOLVED.

## The records (house form; CP6_BATCHES.md, PHASE6_REPORT.md, the runbook, INTEGRATION_SEQUENCE, MIGRATION_LEDGER)
- **CP6 §B40.0** — the B80–B82 integration pass closed: #94 merged `219846f` (PR ci 39415835378, C19 39415835298; main's chain ci 39423986224 →
  C19 lifecycle 39423986194 → C17 finalize 39433958629 → C19 anchor 39434131636, each attempt 1); the owner's acceptance of the checkpoint (2026-10-21);
  **the correction**: FOUR demonstration-only values were exposed, not three (§B82.8 said three) — two signing keys, two delivery bearers.
- **§B40.1–.N**: the map, the design (D1–D20 and the owner's 2026-10-21 decisions), what was built per part (the integration report's lists),
  the integration (the fold, the 26 error nouns, §AC's two findings fixed — the human-gated quarantine review, the closing custody event — and the
  two reported: release without re-inspection, the ZIP-bomb class), the gates (local at 043485b1: build, unit 4064/4066 — the C15 timeout and
  the content-lint finding fixed at 5ec23709, web 1199, boundaries, **integration 3511/3512 → the one failure the same content-lint finding**,
  acceptance 58, upgrade PASS), **the ClamAV admission result and the evaluation evidence** (`evidence/cp6/b40-clamav-evaluation.txt`), **EXC-P1-001's
  exit evidence and a proposed disposition** (the integrated engine port, the verdict ledger with engine + DB identity, the three harnesses, the
  corpus results — close it ONLY once an engine is admitted; until then OPEN, the owner's act), the residuals R1/R2 (reproduced; R1 a client-side
  payload review, R2 a reproduced route defect), R3 the B63 carrier, R4 the rotation plan prepared and rehearsed (NOT executed) with the
  retired-verify-keys software, the D4 proof, the act's rehearsal (`evidence/cp6/act-b40-rehearsal.txt`), and a placeholder section for the live run.
- `audit/delivery/MIGRATION_LEDGER.csv`: the B40 row (0123_b40_source_platform.sql, final, 2026-10-21).
- The runbook: a section "B40 on the demonstration" (the act, the candidate, the walk — every command with EYE_ACT_TARGET; the customs key file
  under `.eye-local/b40/`; the replay counter reset by the API restart) and a short section "The demo credential rotation (prepared, not
  executed)" pointing to `evidence/cp6/b40-credential-rotation-plan.md`.

## Prove and report
The tracker check PASS, the controls all pass, `schedule-model.py --check` clean, the summaries regenerated in order; the pinned gitleaks on your
commits (`/private/tmp/claude-501/-Users-halawany-work-personal-mohammed-new-project/410dc92c-9357-4f51-bd03-84dce11e3661/scratchpad/bin/gitleaks detect
--source . --config .gitleaks.toml --log-opts "7dea5adb..HEAD"`) — records prose never quotes a key-shaped literal. Report (≤ 40 lines): rows per
feature (implemented / partial / missing) before and after, which features complete where, the effort changes, the forecasts, files changed.
