# B40 — the integration fold (wave 1 + the residuals)

You are the integrator for CP-6 stage B40. Read `DESIGN.md`, `PART-BRIEF.md` (its common rules bind you too) and `MAP.md` §3 "Integration" in
this directory first. Work in `/Users/halawany/work/personal/mohammed/new_project/.claude/worktrees/b40` (branch `phase6-b40`, the prelude
`658658df`). Commit there in small commits ending `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`; never push.

## Inputs (all from 658658df except b40/res, which is from main 219846f)
| branch | head | worktree | SQL part |
|---|---|---|---|
| b40/rg | 47146833 | .claude/worktrees/b40-rg | 0123_b40_x_rg.sql |
| b40/va | 06370e4f | .claude/worktrees/b40-va | 0123_b40_x_va.sql |
| b40/in | d4f9dabb | .claude/worktrees/b40-in | 0123_b40_x_in.sql |
| b40/ap | e7a14e1b | .claude/worktrees/b40-ap | 0123_b40_x_ap.sql |
| b40/cr | 59e1ae1f | .claude/worktrees/b40-cr | 0123_b40_x_cr.sql |
| b40/res | cb846bbc | .claude/worktrees/b40-res | none (R1 impact payload review, R2 evidenced-read 503, R4 retired verify keys + rotation evidence) |

## 1. Merge, one branch at a time
Merge in order rg, va, in, ap, cr, res. Shared files carry marked blocks (`/* B40 xx */`); when two parts' blocks meet at one anchor, rebuild
the region from both branch versions — never trust git's keep-both on code (sibling blocks INTERLEAVE; a known lesson). Run both typechecks
after each merge. `conformance/components.manifest.json` conflicts: take either, then REGENERATE with the generator at the end.

## 2. Fold the SQL into ONE 0123
`apps/api/migrations/0123_b40_source_platform.sql` = §0 (already there) then §RG §VA §IN §AP §CR, each part file appended under a section banner,
then delete the part files. A function re-declared by more than one part (check: `_lineage_usable`, `ev_evidence_state`, `px_strength_of`,
`close_quarantine_case`, `transition_contract`, `approve_source`, `set_rights_state`, `mark_source_impact`, `upsert_scheduler_entry`, the stubs)
must end as the LAST part's definition carrying every part's change — read each and merge by hand, marked. Prove the folded 0123 applies on a fresh
0001–0122 database.

## 3. The part reports' integrator items (each one, or say why not)
- **Error nouns, centrally** in `observation-errors.ts` (and the graph/objects/retention maps where the noun lives), each class to its house status
  (403 actor|authority|separation_of_duties|access · 404 unknown_* · 409 state|stale|duplicate|held|expired · 422 otherwise):
  §RG `source candidate`, `source evaluation`, `source approval`, `rights change`, `customer approval`, `stewardship`, `source incident`, `source
  registry`; §VA `publisher key`, `evidence authenticity`, `evidence attribute`, `transformation rule`, `obligations`, `retention register`;
  §IN `quarantine review`, `upload approval`, `inspection verdict`, `intake review`; §AP `acquisition policy (unknown_source|unknown_run|stale|origin)`,
  `acquisition authorization (duplicate|record)`; §CR `adapter package`, `egress receipt`, `connector suspension`, `requalification`, `credential
  rotation`, `connector cell`, and `transition rejected (held)` on the existing transition route (today a generic 409 hiding the server's words). Remove
  the parts' local mappings that duplicate the central one.
- **§AP's ingress check folded into `IntakeStages.inspect` AHEAD of §IN's engines** (`const ap = await this.ingressAp.evaluate(ctx, input.item); if
  (ap !== null) return { kind: 'quarantine', reasonClass: ap.reasonClass, reason: ap.reason, verdicts: [] };`) — completes V03-T-072 `record`
  residency_conflict and DP-10-005 response_anomaly; §CR's gateway reports a 429 through `reportAnswer(...)` (run-policy.ts).
- **§VA**: make the trust envelope reach INDETERMINATE for a claim on FAILED-authenticity evidence (the brief asked; `px_facet` does not read
  authenticity — add the authenticity reason to the facet the envelope derives from, re-declared whole, marked); keep the
  `x-publisher-signature` header through `http-client` so a live REST/RSS detached signature is checked, not read unsigned (narrow; proven by a
  harness case on loopback); releasing an unknown-signer quarantine case through §IN's close port must record an authenticity row (unavailable or
  failed — never silently none). Nav entry "Authenticity" and the catalogue sections for `components/authenticity.tsx`.
- **§IN**: a §0-style class `approval_required` for held uploads instead of reusing `policy_prohibited` (widen the CHECK in the folded 0123, keep
  history valid); `content-inspector.child.mjs` added to `apps/api/scripts/copy-assets.mjs`; mount `InspectionPanel` on the evidence page; catalogue
  + `RENDERED` entries for `intake.tsx`'s six components and `COMMAND_EFFECTS` for `observation.upload.approve`; replace §IN's local client-side
  payload key with `payloadReviewState` from b40/res's `lib/authority-b81.ts`. Move the clamd settings into `config.ts` if that is the house idiom.
- **§RG**: mount §AP's `CoverageGapPanel` and the link to `/acquisition` on the source page; register `components/source-registry.tsx`; §RG's two
  direct inserts (attention items; the retention deletion action without its "due" outbox event) — keep only if the owning schema has no port, and
  emit the retention "due" event through its existing path if one exists.
- **§CR**: Connectors and Egress nav entries; register `components/connector-cell.tsx`; KEEP the SDK reached by path (no workspace dependency — a
  declared one needs `scripts/gate/target-descriptor.json`, a frozen C15/C16-governed file: that is the owner's decision, recorded, not made here).
- **The harness helpers** of §VA, §IN, §AP and §CR approve v4 contracts without an evaluation — after §RG's evaluation gate they must record one
  first (one shared helper in `phase6-b40-fixtures.ts`).
- **The shell nav** (`shell-b80.ts` marked block): Discovery, Connectors, Egress, Authenticity (plus §RT's Rights terms already there);
  `WORKSPACE_NAV_NAMES` unchanged; the shell nav length test updated.
- **B107's inventory**: the new top-level component files registered (they arrive `proposed`); **regenerate** `conformance/components.manifest.json`.
- **Pins**: `scripts/phase1/verify-0022-upgrade.mjs` — migrations 102 (0123), schema registry and roles as the fold leaves them (roles unchanged).

## 4. Prove (one heavy job at a time: `EYE_HEAVY_SLOTS=1 scripts/dev/heavy-slot.sh b40-int -- …`; Redis 6394)
On ONE fresh database through the folded 0123: every B40 harness (`phase6-prelude-b40`, `-registry-b40`, `-authenticity-b40` (or its name),
`-intake-b40`, `-acquisition-policy-b40`, `-connector-cell-b40`, `phase6-b40-res-evidenced`, `phase6-clamav-engine-b40` (skips, stating why, without
EYE_CLAMD_ADDR)), plus phase1-acceptance / fault-injection / hostile-input, `phase6-evidence-b82`, `phase6-b82f-tr`, `-rt`, `-cc`, `-mt`,
`phase6-package-health-read-b33h`, `phase6-closure-b50`, `phase6-impact-b50`, and every harness the re-declared functions touch (the parts listed:
residual-corrections-2, retention-b11/-b13/-b16, packages-b33f, remediation-b28, attention-b22, acquire-stream-b23, scheduled-collection,
scheduled-corrections, source-credentials, gate22-authority-matrix, n01-definer-scope). Then: both typechecks; web tests; the API unit suite
(`pnpm test` — the C15 runner timeout is the known local one); `pnpm boundaries`; `node scripts/license-inventory.mjs`; the upgrade proof; the
pinned gitleaks on `219846f..HEAD` and on the worktree. Fix what fails (a test expectation that predates B40 is corrected; a product defect is
fixed and named). Drop every database you create.

## 5. Report (≤ 60 lines)
The integration head; per part what folded and any conflict rebuilt by hand; each integrator item done / not done (why); the proofs with counts;
every remaining defect or decision for the coordinator (including the owner's decisions: the ClamAV admission (a/b/c), the SDK descriptor, EXC-P1-001).
