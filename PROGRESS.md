# THE EYE — Progress Log

| Phase | Layers | Status | Notes |
|---|---|---|---|
| Phase 0 — Foundation & Governance Spine | Cross-cutting | **COMPLETE + GATE-2.1 CLOSURE SUBMITTED 2026-08-07** | Report: [PHASE0_REPORT.md](PHASE0_REPORT.md). Plan: [PHASE0_PLAN.md](PHASE0_PLAN.md) (Rev 3). Remediation: [PHASE0_INVARIANT_REMEDIATION_PLAN.md](PHASE0_INVARIANT_REMEDIATION_PLAN.md) (R1–R10) then [PHASE0_GATE2_CLOSURE_PLAN.md](PHASE0_GATE2_CLOSURE_PLAN.md) (G1–G10), then [GATE2_1_PLAN.md](GATE2_1_PLAN.md) (C1–C11). Evidence: [PHASE0_EVIDENCE.md](PHASE0_EVIDENCE.md). ADRs: [DECISIONS.md](DECISIONS.md). Exceptions: [EXCEPTIONS.md](EXCEPTIONS.md) (5 open P0 in-date; 2 P1 proposed). |

## Gate-2.2 — final consolidated Phase 0 closure (IN PROGRESS, started 2026-08-08)

Gate-2.1 (`1e6b29b` source / `2ee3a26` evidence) was **rejected**; Gate-2.2 is the
final consolidated correction pass (C1–C19). Controlled record:
[GATE2_2_FINAL_CLOSURE_PLAN.md](GATE2_2_FINAL_CLOSURE_PLAN.md). Governed forward
migrations from **0013**; 0001–0012 byte-identical (no rebaseline/rehash).

**Measured baseline of the rejected candidate** (rebuilt virgin before any change):
integration 147/147, unit+contracts+tokens 198/198, acceptance 41/42 (the one
failure was a *leftover degraded journal* from earlier stale-DB runs, not a code
regression — confirmed by a clean run at 42/42). So Gate-2.2 corrects architecture,
not a broken build.

**Status discipline:** C1–C7 are **CLOSED BY INTERNAL VERIFICATION** — that is
implementation progress, *not* independent approval. C9 is **IN PROGRESS**: its
execution-environment isolation is complete, but the substantive fail-closed and
governed-recovery requirements remain open. Migrations **0001–0019 are IMMUTABLE**
from this point; further database corrections use forward migrations **0020+**.

**Resumption ledger (safe to resume across sessions):**

| Area | Migration / files | State |
|---|---|---|
| C1 operation closure | `0013_operation_closure.sql`, `test/int/gate22-operation-closure.test.ts` | ✅ CLOSED (internal verification), committed `bf9f039` |
| C2 evidence de-authorization | `0014_evidence_deauthorization.sql`, `test/int/gate22-evidence-deauthorization.test.ts` | ✅ CLOSED (internal verification) (RLS visibility gated on read-capable mode; `issue_evidence` PLATFORM-elevation bug fixed with authority-parity binding check) |
| C3 single-use bootstrap | `0016_bootstrap_claim_binding.sql`, `test/int/gate22-bootstrap.test.ts` | ✅ CLOSED (internal verification) — claim bound to bootstrap capability + correlation nonce; only the winning capability completes it; consumed-claim reuse refused (9 tests + real AC-1 flow) |
| C4 identity mutators | `0017_identity_mutator_governance.sql`, `test/int/gate22-identity-mutators.test.ts` | ✅ CLOSED (internal verification) — subject/action-bound capability on external mutators; victim-takeover blocked (rotate cap for A cannot rotate B); 6 tests + real auth flow |
| C5 verifier/seal/availability | `0018_verifier_seal_governance.sql`, `test/int/gate22-verifier-seal.test.ts` | ✅ CLOSED (internal verification) — partition-bound verify/seal capabilities on all four seal/integrity ports (9 tests). `reconcile_availability_incident` governance folded into C9. |
| C6 capability binding | `0019_capability_binding_enforcement.sql`, `test/int/gate22-capability-binding.test.ts` | ✅ CLOSED (internal verification) — exact target binding at every business port, server-derived lifecycle actor (actor param removed), header↔operation correlation binding, causation bound + checked at closure (9 tests) |
| C7 outbox hardening | `0015_outbox_hardening.sql`, `test/int/gate22-outbox-hardening.test.ts` | ✅ CLOSED (internal verification) — lease TTL clamped [1,300]s, retry budget 10 → governed dead_letter, lease-bound terminal ack, `outbox_release` |
| C9 fail-closed + governed recovery | `0020_governed_degraded_recovery.sql`, `src/audit/reconcile-degraded.ts`, `src/audit/audit.service.ts`, `src/shared/degraded-store.ts`, `test/int/gate22-degraded-recovery.test.ts` | ✅ CLOSED (internal verification) — isolation: each isolated gate run gets its OWN controlled degraded-journal dir (`EYE_DEGRADED_DIR`, mkdtemp), initial state asserted empty, restart persistence still exercised explicitly (AC-11), recorded teardown that removes only this run's dir and never a real unreconciled journal. Acceptance now **44/44** with no manual cleanup. Substantive C9 now closed: PDP denial whose evidence cannot persist fails through the SAME governed path (503 + fsynced journal + availability incident, never raw 500) with zero business effect; the ungoverned `reconcile_availability_incident` port is **dropped**; reconciliation requires a recovery capability bound to the exact incident and writes inseparable integrity evidence in the same transaction; replay refused; `markRecovered` refuses without governed proof (empty proof or non-zero remaining); production caller `dist/audit/reconcile-degraded.js`. Full cycle proven in acceptance: degrade → restart → still degraded → governed reconciliation → healthy → restart → **still healthy**. |
| C8 action-specific capabilities | `shared/capabilities.ts` + all services/controllers | ✅ CLOSED (internal verification) — per-action capabilities; relation is not a parameter (compile-time restriction); outbox pipeline-private; no raw tx/SQL escape |
| Deterministic suite isolation | `test/acceptance/acceptance.test.ts` | ✅ CLOSED — acceptance owns a per-run database (`eye_accept_<pid>`, created fresh, dropped at teardown) + pristine-state precondition proof + per-run journal dir. **Proven order-independent both ways** (integration→acceptance and acceptance→integration, no reset) with no leftover databases. Removes the manually-consumed-bootstrap and stale-journal classes of failure. |
| C10 audit.verify completeness | `src/audit/audit.service.ts`, `src/pipeline/pipeline.service.ts`, `test/int/gate22-audit-verify.test.ts` | ✅ CLOSED (internal verification) — **byte-for-byte `event_jcs` vs canonical JCS** (the row hash was recomputed from the GENERATED `event` column, so a byte rewrite that preserved the parsed JSON passed verification); **orphan-row detection above the head** (rows > head were excluded from verification entirely); every result now RETAINS its exact authorizing policy decision (C10 supersedes the Gate-2.1 null-on-failure rule; outcome/decision-class agreement still enforced by `audit.commit_event`); the integrity mutation writes its OWN inseparable `integrity.incident_opened` evidence in the verifier transaction. 5 dedicated tests + acceptance. |
| C11 strict RFC 8785 / I-JSON | `packages/contracts/src/jcs.ts`, `packages/contracts/test/rfc8785-rejection.test.ts`, `apps/api/test/int/rfc8785-crosslang.test.ts` | ✅ CLOSED (internal verification) — three real defects fixed: **`undefined` array elements were coerced to `null`** (so `[undefined]` and `[null]` shared bytes), **sparse arrays emitted syntactically INVALID JSON** (`[1,,3]`) with no error, and **lone UTF-16 surrogates were accepted** in keys and values. Non-plain objects (Date/Map/Set/RegExp) also rejected — a `Date` previously enumerated to `{}`. 22 rejection cases + SQL parity: Postgres rejects the `\ud800` escape form at the jsonb boundary, and a raw lone surrogate cannot survive UTF-8 transmission (arrives as U+FFFD) — measured and recorded, which is exactly why the TS boundary must refuse it first. |
| C12 correlation traceability | `src/shared/correlation.ts`, auth/tenancy/objects/admin controllers, `principals.service.ts`, acceptance C12 block | ✅ CLOSED (internal verification) — swept every authenticated failure path. Removed the `?? 'unknown'` **placeholder** correlations (a placeholder satisfies the response shape and locates nothing); replaced with `requireCorrelation(req)`, which returns the request's own envelope correlation and raises a wiring defect rather than inventing one. No downstream service mints a replacement. Proven by 14 acceptance assertions over 7 failure paths (unknown user, wrong password, garbage refresh token, short-password rotation, workload-with-password principal validation, tenant-name validation, malformed verify): the returned `correlationId` **equals the envelope correlation**, is never a placeholder or fresh uuid, and **locates the durable POL/AUD evidence** (which always records a refusal, never a success). |
| C13 catalog authority gate | `apps/api/scripts/authority-inventory.mjs`, `0021_authority_surface_closure.sql` | ✅ CLOSED (internal verification) — inventory **generated from live pg catalogs, no handwritten port list**; fails on any unclassified/new/renamed port, any PUBLIC EXECUTE, unintended direct DML, RLS gap, or retired role that can log in. Current run: **89 functions, 81 SECURITY DEFINER, 63 runtime-granted ports all classified, 0 PUBLIC EXECUTE, 0 RLS gaps (28 relations), direct DML allocator-only** → exit 0. **The gate found real surface a handwritten list had kept passing:** `identity.auth_principal` / `auth_bindings` / `session_get_active` still existed and were still granted to `eye_identity` (unbounded lookup by arbitrary UUID) → **dropped** in 0021; retired `eye_system` could still log in and `eye_audit_allocator` had a live login it never needs → both **NOLOGIN**. |
| C14 full state-integrity inertness | `test/int/gate22-inertness-integrity.test.ts` | ✅ CLOSED — row-count-only inertness **replaced** by a deterministic state digest over every dynamically-discovered governed relation: column identity, ordered PK, **logical** row-value digest, **physical (xmin)** digest so a delete+reinsert of identical values is still caught, row counts reported separately, plus all sequence last_values, the migration registry and a catalog digest (function bodies+ACLs, policies, RLS flags, role attributes). **4 negative controls prove non-vacuity** — in-place UPDATE (count blind, physical detects), delete+reinsert with identical values (logical AND count blind, only physical detects), sequence advance, and a write to an unexpected new relation (detected as `relation APPEARED` + catalog change) — **each isolated in a transaction and rolled back**, with a follow-up test proving the database is left exactly as found. The 8 statically-uncertain guards are then proven inert against this full digest. 9 tests. |
| C14 closure audit (reconciled) | `apps/api/scripts/gate/authority-matrix-report.mjs`, `evidence/authority-matrix.json` | ✅ CLOSED — **exact reconciled arithmetic**: 63 discovered runtime-granted ports = **43 mutators + 20 non-mutators**; mutators = **7 minters + 1 break-glass + 2 guarded no-ops + 33 capability-required**; both reconcile `true`. **7-vs-10 RESOLVED**: 10 classified no-capability entrypoints = 7 expected-success + **3 null-arg refusers** (`issue_commit` needs a ≥20-char context key, `issue_evidence` needs action+correlation, `issue_verify` needs a partition) — no port changed behaviour, the earlier report just didn't publish the split. Classification strengthened beyond keywords: write DML (**fixed a real regex bug — `update\s+\w\b` can never match `UPDATE identity`, which had hidden `bump_epoch`/`sessions_revoke_all_v2`/`outbox_ack_leased` as non-mutators**), TRUNCATE, DDL, dynamic EXECUTE, writable CTE, `set_config`, row locks, plus **transitive mutation to a fixpoint (2 rounds)**; overloads no longer collapsed (keyed by full signature). **8 statically-uncertain guards now carry an EXECUTABLE inertness proof** (zero row-count delta across all 28 governed tables); `uncertain_classification: 0`, fail-closed otherwise. |
| C14 catalog-driven adversarial matrix | `test/int/gate22-authority-matrix.test.ts` | ✅ CLOSED (internal verification) — **discovers the surface from the catalogs, no handwritten list as source of truth**. Every discovered runtime-granted port is either machine-classified a NON-MUTATOR (body inspected via `prosrc` for write statements — not a trusted label) or a MUTATOR with (a) a generic executable probe proving it refuses with NO capability on each granted role, (b) a generic cross-role probe proving non-grantees cannot reach it, and (c) a named scenario file (existence-checked; **stale entries fail**). The 10 legitimate no-capability entrypoints (7 minters, break-glass rebuild, 2 guarded no-ops) are classified with reasons and **proven INERT executably** (open_operation returns NULL and records nothing; mark_obligations changes nothing; a minted publish capability still cannot enqueue; break-glass unreachable by every app role). Allocator confirmed **NOLOGIN, DML confined to the audit ledger, zero business/identity/policy/objects EXECUTE**; retired `eye_system` NOLOGIN with zero governed EXECUTE. **Negative control run: deleting one coverage entry fails the gate** with the port name and its write evidence. 15 tests. |
| **C15 supply-chain runner** | `scripts/gate/supply-chain.mjs`, `.gitleaks.toml`, `pnpm-workspace.yaml` | ✅ CLOSED (internal verification) — pinned runner (pnpm 11.9.0, node v24.11.1, gitleaks 8.30.1, trivy 0.73.0) that **verifies every pin BEFORE scanning and fails closed on mismatch**. 8 steps, 6 blocking: pnpm audit (human+JSON), gitleaks **worktree AND full history** (`--all --full-history`), trivy fs (vuln+secret+misconfig) table+JSON, and trivy against **both digest-pinned images read from docker-compose.yml**. Every step records argv, tool+version, source SHA, start/finish, exit code, and the **SHA-256 of raw stdout/stderr** written to disk. **REAL FINDINGS FIXED: `nanoid <3.3.17` (CVE-2026-67213, HIGH) flagged independently by BOTH pnpm audit and trivy → overridden in `pnpm-workspace.yaml` (pnpm 11 no longer reads `package.json` overrides). **SUPERSEDED BY C16:** that first remediation used the RANGE `>=3.3.17`, which floated to 6.0.1 — a semver-major above the only consumer's declared range. **The governed version is exactly `3.3.18`**, pinned as an exact value; both closures resolve only 3.3.18 and the residual check is part of the gate. Governed exclusions only: `.eye-local/` and `apps/web/.next/` (each **proven untracked AND ignored by the gate every run**), plus one narrow `condition=AND` match-exclusion for `context_key_hash` — a **SQL column name** in migration SELECT lists, not a credential. **Non-vacuity proven twice**: a planted RSA private key fails the gate, and a mis-pinned scanner fails it before any scan runs. |
| **C16 target-resolved closures** | `scripts/gate/target-descriptor.json`, `scripts/gate/generate-closures.mjs`, `scripts/gate/lib/{lock-closure,sbom,reconcile}.mjs`, `scripts/gate/closure-exclusions.json` | ✅ CLOSED (internal verification) — **REMEDIATED after independent source review of `e3a0b1f`**, which found that the counts reproduced but the gate could still certify semantically incorrect SBOMs. 12 defects corrected; see `GATE2_2_FINAL_CLOSURE_PLAN.md` §6 for the full record. **Canonical PURLs** now come from exact-pinned `packageurl-js@2.0.1` — the old `pkg:npm/%40scope%2Fname` form parses as a *namespace-less* package and was therefore a different identity, not a spelling variant. **Real first-party identities** read from each `package.json` and bound to its SHA-256 (`@eye/contracts@0.0.1`, not `contracts@0.0.0`), with a control proving a manifest can change identity but never membership. **Exact-pinned `yaml@2.9.0`** replaces the bespoke partial reader. **Traversal rewritten in two phases**: cycle-safe discovery that **fails closed on every unresolved reference, required OR optional** (the old code `continue`d past optional ones, so an incomplete closure could certify itself complete); `link:` resolved with `posix.normalize` **relative to the importer** instead of fuzzy `endsWith`; a linked workspace expanded **recursively even when not a declared root** (its transitive runtime deps were previously absent while genuinely required); and scope membership propagated to a **fixed point** — this moved **61 of 289** dev components' provenance and raised genuinely-shared components from 11 to 23 — with one narrowing rule so a workspace's `devDependencies` never inherit an inbound runtime scope (otherwise typescript/vitest became production deps of `@eye/api`). **Mixed positive/negative** os/cpu/libc constraints now apply both rules. **Subject connectivity**: the metadata subject previously had NO dependency entry, so a consumer walking from the declared subject reached zero components; it now names every importer root and the reconciler *requires* those edges — roots are not exempt from the orphan check, because exempting them is what hid the disconnected graph. **Full-field multiset reconciliation** replaces the Map/Set comparison that collapsed duplicates and checked only 4 fields: duplicate components / dependency entries / `dependsOn` values / properties are all rejected, and name, type, canonical PURL parts, integrity hashes, patch hash, peer context, target, scope, os/cpu/libc, workspace manifest digest, subject identity and every provenance binding are compared in both directions. Production **195 components / 290 + 4 subject edges**; development **294 / 446 + 5**; clean over all **16** failure dimensions, counts agreeing on both sides. Byte-identical across separate dirs at different times (prod `94651e12…`, dev `718b6665…`). **Provenance binding**: each SBOM binds source SHA, lockfile, descriptor and generator digests plus the pinned implementation versions. |
| **C16 exclusions are OPERATIONAL** | `scripts/gate/closure-exclusions.json` (schema v2.0.0), `scripts/gate/lib/reconcile.mjs` | ✅ CLOSED — the previous validator checked entries and then **never applied them**, so a "valid" exclusion had no effect and could never be observed to work. One documented semantic now: a valid exclusion **removes** the exact node and every incident edge and records it in a separate `excluded` set; reconciliation runs against the reduced closure, which must itself reconcile clean. 11 required fields including `approver` (must differ from `owner` — an exclusion cannot approve itself), `evidence_sha256`, `approved_on`, `expires_on`. 9 rejection rules enforced: wildcard/name-only, stale, unused, version-changed, wrong-target, wrong-parent, **expired**, **unapproved**, and compatible-mandatory. **Zero exclusions declared.** A positive fixture proves a fully valid entry is accepted and applied exactly once. |
| **C16 clean-checkout CI** | `.github/workflows/ci.yml`, `apps/api/test/gate/supply-chain-artifacts.test.ts` | ✅ CLOSED — the review found CI still ran the legacy Gate-2.1 SBOM generator while tests read a **gitignored** C16 path, so a local run could pass on leftover preliminary files while a clean checkout failed. Now: node pinned to exactly **24.11.1** in all three jobs (was floating `'24'`); the legacy self-reconciling generator **removed from the active gate** and recorded as superseded (with a test asserting its absence); gitleaks **8.30.1** and trivy **0.73.0** installed and version-verified before scanning; both tracked runners **blocking**, writing to explicit per-run temp dirs; and the C16 artifact gate **invokes the runner itself** into a fresh temp dir so it depends on no ignored state. **Proven end to end**: a pristine export (no `.git`, no `node_modules`, no preliminary outputs) ran install → licence inventory → C16 gate → `pnpm test` with C16 **PASS** and **400/400** tests. |
| **C16-R2 hosted-CI truth** | `.github/workflows/ci.yml`, `scripts/gate/lib/trivy-cache.mjs`, `scripts/gate/scanner-pins.json`, `scripts/gate/scanner-exclusions.json`, `scripts/gate/lib/scanner-exclusions.mjs` | ✅ CLOSED (internal verification) — **REMEDIATED a second time after hosted-CI review of `e120b21`.** The finding that mattered: **no hosted run in this repository had ever been green** (4 runs, all red, back to Gate-2.1), so every prior "CI enforces…" claim rested on local execution only. Diagnosed from the logs: (1) `supply-chain` failed with *"trivy misconfiguration check bundle reports no digest"* because CI prefetched only the vulnerability DB while my own enforcement required a checks-bundle digest — trivy 0.73 has **no `--download-check-only`** and fetches the bundle lazily on the first misconfig scan; it passed locally only because an earlier misconfig scan had warmed the **default** cache, which the probe read instead of the scans' cache. (2) `browser-regression` failed with `password authentication failed for user "eye_publisher"` because the job **never ran `pnpm db:migrate`** — pre-existing since the original monorepo scaffold, unrelated to C16. (3) The evidence upload found nothing because the runner exited before writing. Corrections: an isolated trivy cache that acquires **both** artifacts, captures provenance (binary path+SHA-256, version, DB metadata + byte digests, checks-bundle **OCI digest**, timestamps, computed freshness, target platform) from **that same cache**, enforces fail-closed on every missing/malformed/stale condition, runs all authoritative scans with `--skip-db-update --skip-check-update`, and proves the cache **fingerprint unchanged**; scanner downloads authenticated against tracked upstream checksums; every action pinned to an **immutable commit SHA**; node pinned to exactly 24.11.1; `db:migrate` added to `browser-regression`; and a failure manifest + raw diagnostic **always** written, including a top-level handler for unexpected crashes. |
| **C16-R2 governed scan dispositions** | `scripts/gate/scanner-exclusions.json`, `.trivyignore` (deleted) | ✅ CLOSED — the bare global `.trivyignore` is **gone**. It listed 16 CVE ids with prose governance, and a bare id suppresses that advisory in **every** image and package, so a new occurrence elsewhere would be silently hidden while expiry sat unenforced in a comment. The gate now scans with **no suppression** and reconciles the complete finding set against target-specific machine-governed records (exact image digest, scan platform, package, PURL prefix, owner, approver ≠ owner, reason, evidence, approval/expiry, compensating controls). An **unmatched** finding fails; an **unused** record fails as stale. Measured: **16 findings on the linux/amd64 postgres child (1 c-ares + 15 golang stdlib in gosu), all governed by 2 records (SUPERSEDED by C16-R3.1: **3 records**, the lone CRITICAL split out), 0 unmatched, 0 unused.** Coverage normalised: the JSON filesystem capture previously omitted `--severity` and so added LOW/MEDIUM coverage nothing enforced; both fs steps now share one argument list and the runner **compares coverage descriptors** of any pair claiming equivalence. **12 behavioural controls SPAWN the real runner** against a planted secret, a bad tool pin, an expired disposition, a widened disposition, fake evidence, self-approval, a removed disposition, an unused disposition, a resurrected `.trivyignore`, and both final-source violations. |
| **C16-R2 exactness + traversal** | `scripts/gate/lib/{reconcile,lock-closure,sbom}.mjs`, `scripts/gate/closure-exclusions.json` (v3.0.0) | ✅ CLOSED — exclusion policy is **code-owned** (`EXCLUSION_REQUIRED_FIELDS`/`EXCLUSION_SCHEMA_VERSIONS` in code; the document's own list is cross-checked and rejected on disagreement, so data cannot weaken its own validation), with unique ids, duplicate-entry rejection, date chronology, **evidence digest verified against actual bytes**, `parent_edge` required to terminate at the excluded component, a scope the node actually holds, exact cardinality agreement, and **deterministic descendant cascade** (unreachable-from-roots descendants removed and individually recorded; no orphans or dangling refs). Reconciliation is now literal: **exact property set** (missing/unknown/duplicate/altered all fail), **exact integrity multiset**, subject reconciled field-by-field, all 16 metadata bindings required with unknown ones rejected, and a dependency entry for an unknown ref rejected even with empty `dependsOn`. **Governed first-party types** (apps→application, packages→library; unmapped is an error). Traversal: **optional ancestry propagates** (production went from a flat `dependencies: 191` to `dependencies+optionalDependencies: 146, dependencies: 49`); **a bug in my own C16 fix** where `expandImporter` seeded non-link children unconditionally is fixed, so a dev-only linked workspace keeps its runtime deps in dev scope; **patch_hash separated from peer context**; integrity required and validated for registry packages; `lockfileVersion` validated exactly. Also removed **two literal NUL bytes** from `sbom.mjs`. Suites: 84 + 49 + 12 + 34 + 10 + 39 gate tests. |
| **C16-R3 final fail-closed closure** | `scripts/gate/supply-chain.mjs`, `scripts/gate/lib/{trivy-cache,scanner-exclusions,lock-closure,sbom,reconcile}.mjs`, `scripts/gate/{scanner-pins,scanner-exclusions}.json`, `scripts/gate/{install-scanners.sh,assert-final-manifests.mjs}`, `.github/workflows/ci.yml` | ✅ CLOSED (internal verification) — hosted run `31544091029` (3/3 green) retained as valid preliminary evidence; independent adversarial testing then found remaining **false-PASS and false-FAIL** paths, all corrected. **(1) Final mode could never succeed**: `safeGit()` returned `git rev-parse HEAD` WITH its trailing newline, so the correct SHA compared unequal to itself. Normalised at the single entry point; CI now runs both runners with `--final --expected-sha $GITHUB_SHA` and a tracked script asserts the manifests state final mode and the exact head SHA. **(2) A nonzero scanner exit now always blocks**: the unconditional `rec.failed = false` discarded every image-scan failure, and since the image command omits `--exit-code`, findings return zero — so *every* nonzero status was a scanner failure being thrown away. Findings from a failed run are no longer ingested; raw stdout/stderr/exit are preserved. Proven with a fake trivy that reports the right version, emits valid JSON and exits 3. **(3) Checks-bundle byte integrity**: the fingerprint hashed only file COUNT and TOTAL BYTES, so an equal-length rego edit was invisible; replaced with a deterministic recursive manifest (path+size+SHA-256 per file, **641 files** on the real cache), with controls for equal-length edit, file swap and DB edit. Acquisition failure is now fatal even when an older cache exists, and complete stdout/stderr are captured and digested rather than a 4-line tail. **(4) Exact dispositions**: a record must match advisory id, image digest, resolved platform, package, exact canonical PURL, installed version, severity and result target; `package_purl_prefix` is rejected (a prefix matches other versions); `HIGH_AND_CRITICAL` replaced by explicit `severities` arrays with the lone CRITICAL split into its own record. 16 findings governed by 3 records, 0 unmatched, 0 unused. **(5) Always-written failure evidence**: the R2 top-level handler **never existed** (its string anchor silently failed to match, leaving a bare `main();`), so `--trivy-cache` with no value produced NOTHING; now validated arg parsing plus an outermost boundary that always writes a manifest and RESULT-FAIL.txt with exception, arguments, SHA and timestamp. **(6) Executed-binary authentication**: pins carry archive AND extracted-executable digests, the installer verifies both, and the runner digests the executable it resolves on PATH — the Homebrew builds report correct versions with different bytes and are correctly rejected. Raw OCI index digest verified against the configured reference before trusting any child. **(7) Metadata multiset**: `Object.fromEntries` collapsed duplicate bindings; properties are now a multiset rejecting identical and conflicting duplicates (before or after the legitimate value), plus full document identity (bomFormat, specVersion, version, serialNumber, subject fields). **(8) Governed types enforced** against a code-owned allowed set, before serialization. |
| **C16-R3 optional-scope correction** | `scripts/gate/lib/lock-closure.mjs` | ✅ CLOSED — the old control asserted `toContain('optionalDependencies')`, which passes even when a component ALSO wrongly claims `dependencies`. Scope is now a **channel** (production/development) plus an **optionality bit**, propagated to a fixed point: production+optional yields `optionalDependencies` ONLY, development+optional yields `devDependencies`+`optionalDependencies`, and a genuine mandatory path still unions correctly. Optionality comes from an `optionalDependencies` edge **or** the child snapshot's own `optional: true` — **79 snapshots carry that flag and it was ignored entirely**. All assertions are now exact set equality, with fixtures for optional-only child+grandchild, mandatory+optional dual path, development-only linked workspace, snapshot-flagged optional, and an optional native subtree. **Truthfully changed counts**: production went from `{dependencies+optionalDependencies: 146, dependencies: 49}` to `{dependencies+optionalDependencies: 131, dependencies: 49, optionalDependencies: 15}` — 15 production components had been mislabelled mandatory; development gained 9 optional-only. Component/edge totals unchanged (195/290+4, 294/446+5). |
| **C16-R3.1 fail-closed corrections** | `scripts/gate/lib/{reconcile,lock-closure,scanner-exclusions}.mjs`, `scripts/gate/{supply-chain,generate-closures,assert-final-manifests}.mjs`, `scripts/gate/scanner-exclusions.json`, `docs/SCANNER_DISPOSITIONS.md` | ✅ CLOSED (internal verification) — eight remaining bypasses found by independent adversarial testing, all corrected; see `GATE2_2_FINAL_CLOSURE_PLAN.md` §9 for the finding-by-finding map. **(1) Prototype pollution**: `name in bindings` consults the PROTOTYPE CHAIN, so `toString`, `constructor` and `__proto__` all passed as governed metadata; now a null-prototype governed map with `Object.hasOwn()`, for component properties too (6 mutation controls). **(2) Direct snapshot optionality**: a direct importer dependency whose snapshot carries `optional: true` was seeded MANDATORY and, if platform-incompatible, failed as required instead of being a governed optional exclusion; optionality is now resolved BEFORE seeding and platform handling and records whether the edge or the flag applied (4 fixtures). **(3) Final-manifest assertion** accepted any status merely *beginning* with `FINAL`, an EMPTY C16 target set and an EMPTY authenticated-tool set — all vacuous passes; now exact code-owned constants with the target set derived from the descriptor and the tool set from the pins, plus every required report/artifact/reconciliation by name (13 controls). **(4) Dispositions** had no byte-level evidence binding and a TYPE-GATED matcher, so a string `severities` or numeric `result_target` skipped matching entirely; now mandatory `evidence_sha256` recomputed from tracked bytes, a code-owned type contract for all 17 fields where a wrong type is FATAL, and unconditional matching that FAILS CLOSED — note `'HIGH'.includes('HIGH')` is true for a string, so removing the array guard alone was not enough. **(5) Closure-exclusion digest**: `evidence_sha256: 123` skipped both format validation and the recompute; now strict string + lowercase-hex + unconditional recompute (6 controls incl. a one-byte change). **(6) C16 failure evidence**: gitless final mode left the output directory EMPTY; now validated argument parsing and an outermost boundary that always writes a structured manifest and `RESULT-FAIL.txt` with source/expected SHA, mode, phase, error category, timestamp and bound artifacts. **(7) Authenticate before execute**: the runner probed `--version` and warmed the cache — both of which EXECUTE the binary — before digesting it; scanners are now resolved, digested, compared and STAGED into a private per-run directory, every invocation uses that absolute path, the staged bytes are re-verified after scanning, and worktree cleanliness is re-checked as a delta. Proven by a same-version wrong binary whose execution marker never appears and with `steps: []`. **(8) Evidence binding order**: bindings were computed BEFORE the result receipt was written, so `RESULT-PASS/FAIL.txt` was never bound; receipt is now written first on the success, governed-failure and crash paths, with only `supply-chain-manifest.json` unbound by documented necessity. |
| **C16-R3.1 disposition evidence** | `docs/SCANNER_DISPOSITIONS.md`, `scripts/gate/scanner-exclusions.json` | ✅ CLOSED — the generic `PHASE0_EVIDENCE.md` citations are replaced by a dedicated, non-self-referential document that identifies every governed finding with its configured reference, index kind and child count, resolved platform, scanned child digest, index-integrity check, scanner and vulnerability-database identity with freshness ceiling, checks-bundle OCI digest, scan mode, and per-record advisory ids, package, PURL, installed version, severity, result target, reason, compensating controls, owner, approver, approval and expiry — plus an explicit prohibited-exposure section. Records are now **3**: `SCX-0001` (c-ares HIGH), `SCX-0002` (14 Go stdlib HIGH), `SCX-0003` (the single Go stdlib CRITICAL, held separately so a HIGH approval cannot absorb a CRITICAL). Every record binds the document by SHA-256 and the gate recomputes it from the tracked bytes each run. |
| **C16 CLOSED** | `scripts/gate/assert-final-manifests.mjs`, `scripts/gate/lib/*`, `docs/SCANNER_DISPOSITIONS.md`, `docs/evidence/govulncheck-gosu-b6a16ed0.{json,txt}` | ✅ **CLOSED by bounded independent review** at `d63318e099a152cef18682e97d84ea7e1a70abd9` after five remediation rounds (R3.1–R3.4.5). Hosted run `31806239862`, all three jobs green; evidence archive sha256 `27ba79b0681b855e710c8b82e0d95c39ff971dc7770bee601d08fe7858027e04`. Measured at closure: gate **587**, API unit + gate **601** (= 587 + 14), integration **297**, acceptance **58**, contracts **203**, tokens **3**, Playwright **10** on a virgin database. Container findings reconcile at **18** across **4** governed records (SCX-0001/2/3 `RISK_ACCEPTED`, SCX-0004 `NOT_AFFECTED` on symbol-aware govulncheck evidence). |
| C17 CycloneDX + obligations | *(superseded row removed at C17.1)* | ➡️ See the **C17.1** row below. The original C17 row claimed this area was NEXT and was never updated when C17 landed, so the ledger carried a stale entry alongside a completed one. |
| **C17 + C17.1 CycloneDX, licences and obligations** | `vendor/{cyclonedx/1.6.2,spdx-licenses/v3.28.0}/**`, `scripts/gate/lib/{cyclonedx-schema,license-closure,licence-texts,legal-dispositions}.mjs`, `scripts/gate/{licence-obligations,package-c17-evidence}.mjs`, `scripts/gate/{legal-dispositions,source-offers}.json`, `apps/api/test/gate/c17-*.test.ts`, `pnpm-workspace.yaml`, `.github/workflows/ci.yml` | ✅ **COMPLETE (internal verification)** — evidence-bearing SHA `084ce19f4edef71825b0d34dfe230c4915a1b3fb`, hosted run `31893384717` (build-test, supply-chain, browser-regression all success). Archive `c17-evidence-084ce19f4edef71825b0d34dfe230c4915a1b3fb.zip`, **576771 bytes**, sha256 `e0a24dd12ddb4ca4f5b34bca87f075056ad8245e16c46a100206f376e6b62d6c`, built by the tracked packager inside the run: **19 payload files + 1 checksum manifest = 20 regular files across 25 ZIP entries**, **19 checksum lines**, manifest excludes itself. Verified from a genuinely foreign clean clone with `--online`: both SBOMs re-derived and schema-valid, licence reconciliation rerun, and the run receipt checked against GitHub's public API (id, head_sha, conclusion=success). SBOM digests production `c65ea1250232438fbf642920e2beb07f5497be7fe7942d847b166f8fd21de2cb` (195 components) and development `804ca78c0d63524032555571cd08f7b6802bbb5a313cb82247813623a18fbc2a` (296 components), both **0 schema errors** against the official CycloneDX 1.6.2 schema (tag `1.6.2`, commit `e833d732337dd33aceb45ff1991f896796f1e5e7`) compiled offline with Ajv **8.18.0** / ajv-formats **3.0.1** / ajv-formats-draft2019 **1.6.1**. Licence inventory: production **195** classified, development **312**, **0 unresolved**, **0 reconciliation problems** in both directions. Notices carry **475** shipped-text blocks and **25** canonical-SPDX-text blocks, every copyright line, named CC-BY attribution and **3** source-offer records; **0** legal dispositions, deliberately. **Cross-host determinism proven**: all 8 target artifacts byte-identical between a darwin/arm64 clean clone and hosted ubuntu Linux. C15, C16 and C17 all PASS in `--final` from a Darwin clean clone. Measured suites: gate **721**, API unit + gate **735** (721 + 14), integration **297**, acceptance **58**, contracts **203**, tokens **3**, Playwright **10** on a virgin database. Migrations 0001–0021 byte-identical; content digest `43e15e642efaecca1be224af0936e223f14cf17ffc846b79f40896d717f65588`, Git-tree digest `47a651c95228429a5f10c497dfbd5b4a3588bce7256af65f0c90554bf3b5baca`. |
| **C18 → C18.1.3 dual-path database history proof** | `scripts/gate/c18-db-paths.mjs`, `scripts/gate/lib/{c18-contract,c18-query-plan,c18-seed-0012}.mjs`, `apps/api/test/gate/c18-*.{test.ts,ctl.ts}`, `apps/api/test/gate/fixtures/c18-legacy-{d5061b8,8a23526,567a70f,15e8239}/**`, `apps/api/vitest.c18.config.ts`, `.github/workflows/ci.yml` | ✅ **COMPLETE (internal verification)** — evidence-bearing SHA `83d158cca00d3a85ae78c3a4e9019c483426c5a7`; see the C18.1.3 provenance section below and `GATE2_2_FINAL_CLOSURE_PLAN.md` §18. Interim deliveries `d5061b8` (verifier false-passed synthetic archives; secret exposure), `8a23526` (leaked the database ctx.context_secret in raw receipts), `567a70f` (verifier accepted ten fully-rebound false packages) and `15e8239` (evidence authentic and LEAK-FREE, but its verifier did not authenticate exact SQL, secret classes, several seed relationships, suite-stream ownership, seeding or cleanup) are SUPERSEDED. |
| C19 docs + NOLOGIN roles | — | ⏳ (`eye_system` + legacy roles still LOGIN) |
| **Evidence sequencing (applied)** | `.gitignore` | ✅ `evidence/authority-matrix.json`, the `evidence/supply-chain/` runner outputs, `evidence/supply-chain/c16/` and `evidence/db-paths/` are **untracked**: generated gate OUTPUTS are regenerated from the FROZEN source during the isolated run and committed only in the evidence-only attestation child commit. The GENERATORS (`scripts/authority-inventory.mjs`, `scripts/gate/authority-matrix-report.mjs`, `scripts/gate/supply-chain.mjs`, `scripts/gate/generate-closures.mjs`) remain in source. The matrix generated at `caac521` and the C16 closures generated during this pass are **preliminary** and are not final evidence — the C16 report carries a `status` field saying so, so a stray copy cannot be mistaken for final. |
| Freeze + external-review handoff + ZIP | — | ⏳ |

**Environment notes for resumption:** virgin rebuild via
`scratchpad/virgin.sh` (force-removes `eye-redis`/`eye-postgres`, `down -v`, `up`,
`pnpm db:migrate`). Integration suite: `cd apps/api && node_modules/.bin/vitest run
--config vitest.int.config.ts`. Full integration currently **297/297**, acceptance **58/58** (per-run journal isolation closed; no manual cleanup); api gate+unit **508/508** (gate suites alone **494**, all hermetic — zero live network), contracts **203/203**, tokens **3/3**, typecheck **0**, build **0**, boundaries clean (107 modules, 298 dependencies). Gate runners: `pnpm gate:supply-chain` (8 steps, 6 blocking, PASS) and `pnpm gate:closures` (both targets reconcile clean over all 16 dimensions, PASS); each also accepts `--final`, which refuses a dirty worktree. Migrations 0001-0021 are byte-identical to `e3a0b1f`. Migrations now **0001–0021** (0001–0020 immutable; 0021 = C13 surface closure). **Both DB paths proven at 0019**: forward upgrade from a real 0001–0012 database seeded through the historical bootstrap port (19 migrations, zero data loss, pre-existing rows/hashes/chain/digests byte-identical, chain verifies with no rehash, full suite 251/251 on the upgraded DB) and virgin install 0001–0019 (251/251 + acceptance 44/44). **External independent
review is pending against the final frozen source and evidence package** — Claude's
own in-place testing is verification, not independent review, and Phase 0 remains
unapproved until that external final review. The 52 MB `evidence/the-eye-source.bundle`
is now **untracked** (kept on disk) and `evidence/*.bundle` + `*.zip` are gitignored
per the approved packaging decision.

## Gate-2.1 closure — final authority-boundary closure (2026-08-07)

Source candidate reviewed: `2deded44904e5a4ec264938085c2aaa93d9636b6` (evidence attestation
`09ab1144d04ada7dcd3a159c3ba03a7f94751c18`, archive SHA-256 `b45025ad…1e81d`). An independent review
identified ten executable attack paths that the green 70-test suite did not exercise. The bounded
correction C1–C11 was authorized and executed as **governed forward migrations 0011 + 0012**
(0001–0010 untouched, every previously applied digest still valid — **no rebaseline**). Migration
range is now **0001–0012**.

Delivered:

* **No direct authoritative privilege anywhere.** Direct INSERT/UPDATE/DELETE on every governed
  table is revoked from every runtime role; the chain-head allocator pair is callable by no request
  authority; PUBLIC holds EXECUTE on nothing in the governed schemas. RLS is `ENABLE`d **and**
  `FORCE`d on every table in those schemas (`FORCE` alone was inert where RLS had never been enabled),
  with policies that state the boundary explicitly for allocator-owned and reference tables.
* **The universal system context is gone.** `ctx.issue_system(reason)` — unrestricted PLATFORM
  authority on the strength of free text — is dropped, replaced by six **operation-specific
  capability minters** (`issue_commit`, `issue_evidence`, `issue_publish`, `issue_verify`,
  `issue_identity_op`, `issue_bootstrap`). A capability binds action, target, correlation id,
  policy-decision id, bundle version, operation class, session, principal, scope, purpose and
  consequence class, and the **mintable action set is bound to the minting role** (identity.* to the
  identity authority, everything else to the commit authority).
* **Business handlers never receive a transaction.** They receive a `BoundedCapability` whose surface
  is the ports their route declared; the Kysely transaction is a private field that is never exposed.
* **Evidence mode cannot fabricate an allow or a success.** A decision records how it was written
  (`evidence_only`), and a success may never reference such a decision — in that transaction or any
  later one. Every request AUD is linked to its POL on principal, action, scope, tenant, domain,
  correlation and bundle, and outcome class must agree with decision class.
* **Expiry and revocation are wall-clock and re-checked at every port.** `clock_timestamp()` replaces
  `now()`, so a capability lapses inside a long transaction; session, expiry, principal, epoch,
  binding and rotation are revalidated at each authoritative boundary — a capability minted in one
  transaction stops working the moment another revokes the authority behind it.
* **Identity and metadata leakage closed.** `auth_principal`/`auth_bindings`/`session_get_active` are
  withdrawn from the application role and replaced by caller-bound lookups requiring proof of
  possession of that session; `audit.my_partition_status` (tenant-global head state for DOMAIN
  callers) is dropped in favour of a domain-scoped projection; a PDP-denied identity operation now
  returns the governed 403 with matching durable POL/AUD instead of failing 503.
* **Outbox transitions are lease-tied compare-and-set only.** `outbox_ack`/`outbox_claim` are gone;
  publication requires a live lease, the permitted transition and the expected current state.
* **Complete request audit coverage.** Every authenticated controller edge routes through the
  centralized durable rejection path; `audit.verify` records requested partition, verified head,
  expected vs calculated head, ok/headMatches, broken sequence and incident — an unknown or damaged
  partition is evidenced as a failure, never as a generic success; the degraded journal is reloaded on
  startup and `/readyz` stays degraded across a restart until governed reconciliation records recovery.
* **Real RFC 8785.** The in-database canonicalizer now implements ECMAScript `Number::toString`
  (fractions, exponent forms, negative zero), UTF-16 code-unit key ordering, Unicode keys,
  multilingual values, control-character escaping and IEEE-754/I-JSON validity. One conformance
  corpus runs against both TypeScript and the database. Canonical admission enforces full header
  **semantics** — enums, temporal constraints, structured confidence/quality, schema-reference shape
  and authoritative `recorded_at` — not merely key presence and digest.
* **Gate controls corrected.** No executable credential default in the migration runner; the licence
  allowlist covers production **and** development closures; CycloneDX 1.6 schema validation;
  bidirectional SBOM↔closure reconciliation with governed exclusions; the browser gate loads every
  runtime authority through the canonical loader with permission repair.

Suites at the Gate-2.1 candidate: contracts **181**, tokens **3**, api unit **14**, api gate
**43** (supply-chain negative fixtures, shipped-artifact gates, loader/handoff invariants), integration **199** (Gate-2.1 adversarial
matrix 52 + RFC 8785 cross-language 74 + domain isolation 16 + audit chain 8 + Gate-2 adversarial 49),
acceptance **42** (15 criteria + §7.2 + R4/R10 + Gate-2.1 tests 14–17), Playwright **10** — **492
tests**. All 22 mandated Gate-2.1 adversarial tests are present and green. Both database paths are
proven: forward upgrade of an existing 0001–0010 database carrying real pre-upgrade data through
0011/0012 with byte-identical audit hashes and no rebaseline, and a virgin install of 0001–0012 — the
complete suites pass on **both**. Supply chain: CycloneDX 1.6 SBOM (280 components, schema-valid),
bidirectional reconciliation with 0 unmatched identities, licence gate green over both scopes.

Five real defects were found *by* this work and fixed: an RLS sweep that deny-alled the allocator's
own tables and the schema-registry reference data; a live-authority check that demanded a session from
the deliberately session-less identity capability (which silently disabled all intake evidence); an
authority refusal misreported as a 503 availability incident instead of a 403 denial; an evidence-mode
rule that erased the true decision of an allowed-then-failed request; and a role-binding check written
against `current_user`, which is the owner inside a `SECURITY DEFINER` function and therefore vacuous.

## Gate-2 closure (2026-08-06)

Source candidate reviewed: `562fffaf3d848dd730e7287771e3344b2e5b05b2` (archive SHA-256 `505fed9e…9447a`). Source inspection found remaining constitutional gaps; the bounded closure G1–G10 was authorized and executed as **governed forward migrations 0009 + 0010** (0001–0008 untouched, all previously applied digests still valid — no rebaseline). Migration range is now **0001–0010**.

Delivered: six least-privilege runtime roles (app / commit / identity / publisher / verifier / recovery, the last never loaded by any application pool); a bound, single-use, transaction-and-connection-bound context requiring proof of possession of the session context key, invalidated by revocation, binding removal, credential rotation, expiry and replay; exact-match DOMAIN isolation with no tenant-wide fallback plus an authorized tenant read model and a binding-authority trigger; unforgeable POL/AUD built inside the trusted boundary with an **in-database RFC 8785 implementation** (stored `event_jcs` is exactly the hashed bytes — verified byte-for-byte against the TypeScript reference); canonical admission as the only object write path with server-side digest recomputation; immutable outbox events with a compare-and-set publish acknowledgement; complete audited request coverage with fail-closed 503 + an independent fsynced degraded journal + degraded `/readyz`; restart-durable suppression accounting; `audit.verify` as its own governed action; an append-only refresh-token family ledger detecting replay of any older generation; database-enforced single-use bootstrap with structural local/test eligibility; and a clean-source typecheck gate wired into CI.

Suites at the closure candidate: contracts **118**, tokens **3**, api unit **14**, acceptance **34**, integration **70** (adversarial matrix + domain isolation + audit chain), Playwright **10**. Boundaries clean (86 modules, 222 dependencies). Three real defects were found *by* the new adversarial tests and fixed: same-connection context replay, a residual canonical INSERT grant, and bootstrap guard ordering.

## Invariant-remediation gate (2026-08-05)

Candidate reviewed: `ce1ee0d`. Source inspection found invariant violations the green suite did not detect; the bounded remediation R1–R10 was authorized and executed. Final candidate: **`75522e3`** (`75522e3` — the R1–R10 remediation commit; submitted for review as `562fffaf3d848dd730e7287771e3344b2e5b05b2` after the bundle-only metadata correction). See `evidence/git-metadata.txt` in that gate's package. Migration range extended to **0001–0008** (0008 = signed request context + DOMAIN-aware FORCE-RLS matrix, PUBLIC-EXECUTE revocation + bounded append/seal/recovery ports, refresh-token rotation with reuse detection, identity integrity, temporal constraint). Suites at the final SHA: contracts **118**, tokens **3**, api unit **14**, integration **38** (domain-isolation, privileges, audit-chain incl. concurrent append-vs-verify/seal, refresh), acceptance **34** (15 criteria + §7.2 + R4/R10 #6/#7/#8), Playwright **10**. Supply chain: non-empty CycloneDX SBOM (280 components) + prod/dev license reconciliation; `pnpm audit` **0**; exact-image Trivy scans of the pinned postgres:18-alpine / redis:8-alpine digests **clean at HIGH/CRITICAL** under dated `.trivyignore` dispositions. No Phase 1/L1 application code written.

## Milestone log

| M | Status | Evidence |
|---|---|---|
| M1 Scaffold | **DONE 2026-08-03** (commit `dbb2e31`) | contracts 24 tests + tokens 3 tests green; golden audit-hash fixture frozen; boundaries clean (42 modules); API boots, `/healthz` + `/readyz` (db:true, telemetry-only classified); web builds; Compose (postgres:18+redis:8) healthy; migration 0001 applied (roles + schemas + append-only guard); CI with SBOM/audit/gitleaks/Trivy/license inventory. Deviation: API default port 3401 (3001 occupied locally). Risks: none new. Next: M2. |
| M2 Identity+tenancy | **DONE 2026-08-04** (commits `c619776`, `bc70bd6`) | Migrations 0002 (principals/credentials/sessions/roles/bindings/break-glass, tenants/domains/lifecycle-events, RLS fail-closed, SECURITY DEFINER auth lookups); login/refresh/verify with continuous session re-check; audited one-shot bootstrap on PLATFORM partition; governed tenant/domain creation; scope resolution from authenticated principal + trusted routing only. Tests: scope unit suite; RLS isolation integration suite (5 tests incl. cross-tenant INSERT rejection). |
| M3 Policy engine | **DONE 2026-08-04** (commit `bc70bd6`) | Envelope guard (validate before payload + digest check); EYE-XXX-NNN catalog wired; PDP 4-value decisions + enforced obligations (mask executed as sanitized projection); indeterminate→deny; C3+ fail-closed (no human-gate runtime); POL records with exception/expiry/revocation + input digest; PEP + RLS dual enforcement. Tests: 8 PDP decision-table cases. |
| M4 Audit ledger | **DONE 2026-08-04** (commit `bc70bd6`) | Partitioned chains; audit_chain_heads allocator (dedicated role, advance/commit SECURITY DEFINER pair, rebuild-from-ledger incl. RLS-context fix migration 0005); domain-separated SHA-256(JCS) + frozen golden fixtures; generated typed columns from canonical bytes; pre-incident seals; tamper→freeze+incident+no-reseal; sanitized rate-bounded security intake. Tests: 7 integration (privilege boundary incl. superuser-trigger block, 16-writer gap-free concurrency, rollback no-gap, allocator rebuild, tamper freeze). Smoke: end-to-end login→tenant→domain→principal→audit query (obligations applied)→denials→verify ok. Risks: EXC-P0-001 unchanged (shared failure domain, honest statement stands). Next: M5. |
| M5 Canonical objects | **DONE 2026-08-04** (commit `78d696b`) | Migration 0006 (typed 40-field header, four-axis temporal, DB CHECKs incl. minimum provenance, append-only, RLS, outbox, schema registry); create/correct/known-at/history; outbox → BullMQ post-commit. Tests: +2 integration (DB-level immutability, provenance CHECK). |
| M6 WS-19 shell | **DONE 2026-08-04** (commit `bf3a62f`) | Token-driven UI (light+dark, logical CSS/RTL-safe, 3-channel truth badges); login/tenants/principals/objects/audit pages; review-step creation; receipts from authoritative responses only; browser-verified end-to-end (chain verify: intact, head matches). |
| M7 Acceptance | **DONE 2026-08-04** | 21-test acceptance suite green (15 criteria + §7.2 request paths); wired into CI; demo script `scripts/demo.sh`; Phase Report published. Deviations documented in [PHASE0_REPORT.md](PHASE0_REPORT.md) §5. |
| Phase 1 — World Observation Layer | L1 | **PLAN Rev 5 (cumulative) — awaiting final approval; no P1 application code written** | Plan: [PHASE1_PLAN.md](PHASE1_PLAN.md) (Rev 5). Evidence: [PHASE0_EVIDENCE.md](PHASE0_EVIDENCE.md). Coverage: [L1_CONNECTOR_COVERAGE.md](L1_CONNECTOR_COVERAGE.md). P1 exceptions EXC-P1-001/002 remain `proposed` (not opened). |
| Phase 2 — Intelligence Layer | L2 | Not started | Model Gateway live; Cleaning/Classification/NER/Relationship agents |
| Phase 3 — Enterprise Memory & Knowledge Graph | L3–L4 | Not started | Graph/Memory/Reasoning agents; stewardship workflows |
| Phase 4 — Digital Twins & Prediction Engine | L5–L6 | Not started | Twin Reconciliation/Prediction agents |
| Phase 5 — Scenario Intelligence & Simulation Engine | L7–L8 | Not started | Scenario/Simulation agents |
| Phase 6 — Decision Intelligence & Executive OS | L9–L10 | Not started | Decision/Briefing/Reporting agents; Planner/Supervisor/Workflow completed |
| Phase 7 — System-wide agent governance, continuous learning, marketplaces, production hardening | Cross-cutting | Not started | Deepens existing controls; does not introduce them (C-006, C-035) |

Agents are introduced progressively with the layers they serve; the agent/workload principal model exists from Phase 0.

## Document authority model

Volume 0 (Constitution, highest) → Volume 3 (canonical system architecture) → Volume 4 (engineering contracts) → Volumes 5–7 (AI / infrastructure / data domains) → Volume 8 (product requirements) → Volume 9 (UI/UX requirements). Volumes 1–2 are explanatory/executive presentation layers and do not override normative architecture or engineering specifications. Volume 10 is investor/diligence material, not an engineering authority.

## Document review log

| Volume | Read | Notes |
|---|---|---|
| Volume 0 — Product Constitution v1.0 | 2026-08-02, full | 52 invariants C-001…C-052; frozen baseline |
| Volume 1 — Executive Vision Book v1.0 | 2026-08-02 | Explanatory narrative; inherits V0 |
| Volume 2 — Technical Presentation v1.1 | 2026-08-02, full (50 slides) | Explanatory presentation layer; no normative override |
| **Volume 3 — Technical Architecture v1.0** | **2026-08-03, full (122 pp.)** | Canonical architecture: ten layers, 94 components (Lx-Cyy), 50 interfaces, 24 canonical object codes, ADR-0001…0020, control planes, contract envelope, four-axis temporal model |
| Volume 4 — Engineering Specification v1.0 | 2026-08-02, full (195 pp.) | ~380 ES requirements; envelope field dictionary; EYE-XXX-NNN error catalog; SLOs; test suites |
| Volume 5 — AI Architecture v1.0 | 2026-08-02, full (199 pp.) | 360 AI requirements; model gateway; agent contracts; 24 AI-ADRs |
| Volume 6 — Infrastructure Architecture v1.0 | 2026-08-02, full (193 pp.) | 432 IA requirements; 24 IADRs; manifests; no technology mandates |
| Volume 7 — Data Platform v1.0 | 2026-08-02, full (195 pp.) | 432 DP requirements; 40-field canonical header (App. E); 24 DADRs |
| Volume 8 — PRD v1.0 | 2026-08-02, full (209 pp.) | 432 PR requirements; 24 personas; 108 capabilities; no internal release phasing |
| Volume 9 — UI/UX Design System v1.0 | 2026-08-02, full (195 pp.) | 432 UX requirements; token registry; 112 components; WCAG 2.2 AA release-blocking |
| Volume 10 — Investor Package v1.0 | 2026-08-03, full (164 pp.) | Investor/diligence material (at ~/Downloads); no dates, no stack, no delivery constraints; defers to Volumes 0–9; Appendix J defines six technical proof tracks |
| Master Build Prompt | 2026-08-02 | Build protocol; phase roadmap superseded by the corrected roadmap above where they differ (P4/P5 layer grouping, progressive agents) |

Key findings: **no volume mandates a specific technology** (verified by exhaustive search across Vols 2–7, 9, 10); constraints are semantic — four-axis temporal truth, append-only versioning, non-destructive correction, audit-on-commit-path, fail-closed ABAC with obligations, explicit tenant propagation, deployment semantic parity. Volume 3 explicitly names the governed outbox pattern and prohibits deferring cross-cutting controls to a later phase.

## C17.1 evidence provenance (no SHA cycle)

The evidence-bearing candidate is **`084ce19f4edef71825b0d34dfe230c4915a1b3fb`**. Hosted run **`31893384717`** ran at exactly that SHA,
and the archive `c17-evidence-084ce19f4edef71825b0d34dfe230c4915a1b3fb.zip` (sha256 `e0a24dd12ddb4ca4f5b34bca87f075056ad8245e16c46a100206f376e6b62d6c`) was
built by tracked code *inside* that run and carries a receipt naming it.

This document, and the ledger row above, are written in a **docs-only child commit** that records
those values. The child is deliberately NOT the evidence source: it cannot be, because a commit
cannot contain the digest of an archive produced from itself. Verification must therefore be
performed against `084ce19f4edef71825b0d34dfe230c4915a1b3fb`:

```
git clone https://github.com/a-Halawany/elven && cd elven
git checkout 084ce19f4edef71825b0d34dfe230c4915a1b3fb
pnpm install --frozen-lockfile
node scripts/gate/package-c17-evidence.mjs verify --zip <archive> --root "$PWD" --online
```

The child changes no executable file, so the gates' verdicts at `084ce19f4edef71825b0d34dfe230c4915a1b3fb` are unaffected by it.

## C17.2 evidence provenance (no SHA cycle)

The evidence-bearing source is **`cb9022a4f2684431c9531aded212377cb8c1c855`**.

* Source run **`32124967274`** (push, `main`, attempt 1) ran at exactly that SHA; all three jobs
  (`build-test`, `browser-regression`, `supply-chain`) succeeded in the same attempt, and the
  blocking C17 packager built and self-verified the archive inside the run. The uploaded artifact
  **`c17-evidence-archive-a1-a2485e44700b54203eb044a45c7ef630bf0e53f4a9a4cdf0b1b768931bb1f468`**
  carries the inner ZIP `c17-evidence-cb9022a4f2684431c9531aded212377cb8c1c855.zip`
  (1,206,092 bytes, sha256 `a2485e44700b54203eb044a45c7ef630bf0e53f4a9a4cdf0b1b768931bb1f468`).
* The automatic macOS finalizer, run **`32125285602`** (workflow_run, `macos-14`, attempt 1),
  bound that exact source run and SHA, regenerated C16 + C17 on Darwin/ARM64, compared the
  code-owned nine-artifact set byte-for-byte, and uploaded
  **`c17-evidence-finalized-a1-89417bfeeb35a42e76931537f9c2da345a81b7d5b9036db9529f41f320f920d1`**
  containing `c17-cross-host-finalized-cb9022a4f2684431c9531aded212377cb8c1c855.zip`
  (9,470,293 bytes, sha256 `89417bfeeb35a42e76931537f9c2da345a81b7d5b9036db9529f41f320f920d1`).

**Superseded predecessor, recorded honestly.** `c757e0fb6a019ac6da37fbbcb23b9335e01790e6` carried
the same verifier and gate logic and its own push/main CI run `32116234678` was fully green — but
its first real finalizer run `32116543012` failed deterministically, because that commit's
immutable finalizer workflow downloaded the source artifact into a repository-relative
`incoming/` directory whose non-gitignored contents dirtied the checkout that final-mode
regeneration requires to be clean. `c757e0f` was superseded **solely** because of that
repository-relative download defect; `cb9022a` changes exactly the download destination
(`${{ runner.temp }}/incoming`) plus one parsed-YAML regression control.

Verification must be performed against `cb9022a4f2684431c9531aded212377cb8c1c855`:

```
git clone https://github.com/a-Halawany/elven && cd elven
git checkout cb9022a4f2684431c9531aded212377cb8c1c855
pnpm install --frozen-lockfile
node scripts/gate/package-c17-evidence.mjs verify --zip <source archive> --root "$PWD" \
  --profile delivery --online --require-hosted
node scripts/gate/c17-cross-host-finalization.mjs verify --zip <finalized archive> --root "$PWD" --online
```

This document is written in a **docs-only child commit** recording those values; the child cannot
be the evidence source, because a commit cannot contain the digest of an archive produced from
itself. The child changes no executable file, so the gates' verdicts at
`cb9022a4f2684431c9531aded212377cb8c1c855` are unaffected by it.

## C18 evidence provenance (no SHA cycle) — SUPERSEDED by C18.1 below

**SUPERSEDED at C18.1**: the d5061b8 verifier false-passed wholesale-forged archives and its
evidence artifacts exposed ephemeral secrets (the raw ctx signing secret in snapshots and
generated PostgreSQL/Redis passwords in the command ledger). The record below stays as honest
history; verification and review target the C18.1 section.

The C18 evidence-bearing source was **`d5061b8add0f9d138110816ff504e0dfd4967aee`**. Source run
**`32150089911`** (push, `main`, attempt 1) ran at exactly that SHA with the BLOCKING C18
dual-path gate green inside `build-test`; the finalizer run **`32150603136`** (`macos-14`,
attempt 1) completed green. The uploaded evidence:

* `c18-db-paths-evidence-a1` → `c18-db-paths-evidence-d5061b8….zip`
  (sha256 `2233af31fc71433500a9c3995f3f58b122434a1e5bccc44f7e02aca274ef6278`);
* `c17-evidence-archive-a1-535e44c80b00f92a6c7a66798c4a2970ee7e26048420e0dcff26caf6328ab457`;
* `c17-evidence-finalized-a1-65a49b5bcbef4d9174081f3f0a1a96999dc33a5bde03ef4255d8e63d1a257e4a`.

Full details, the two superseded predecessors (`8d22235`, `695fb84`) with their honestly
recorded hosted failures, and the complete claim inventory live in
[GATE2_2_FINAL_CLOSURE_PLAN.md](GATE2_2_FINAL_CLOSURE_PLAN.md) §14. Verification runs against
`d5061b8add0f9d138110816ff504e0dfd4967aee`:

```
git clone https://github.com/a-Halawany/elven && cd elven
git checkout d5061b8add0f9d138110816ff504e0dfd4967aee
pnpm install --frozen-lockfile
node scripts/gate/c18-db-paths.mjs verify --zip <c18 evidence zip> --root "$PWD"
node scripts/gate/package-c17-evidence.mjs verify --zip <source archive> --root "$PWD" \
  --profile delivery --online --require-hosted
node scripts/gate/c17-cross-host-finalization.mjs verify --zip <finalized archive> --root "$PWD" --online
```

This section is written in a docs-only child commit; the child changes no executable file, so
the gates' verdicts at `d5061b8add0f9d138110816ff504e0dfd4967aee` are unaffected by it.

## C18.1 evidence provenance (no SHA cycle) — SUPERSEDED by C18.1.1 below

**SUPERSEDED at C18.1.1**: the 8a23526 archive leaked the raw database-generated
`ctx.context_secret.secret` in four `raw/*ctx_context_secret.stdout.txt` receipts (snapshot
digest-substitution ran after the raw psql output was already written), and its verifier accepted
rebound false evidence (deletion/alteration of processed snapshots while contradictory raw query
output stayed intact). The record below stays as honest history; verification targets C18.1.1.

The C18 evidence-bearing source is **`8a235263d55545bd708b5b5af200670c467a457a`**. Source run
**`32192797516`** (push, `main`, attempt 1) ran at exactly that SHA with the BLOCKING C18.1
dual-path gate green inside `build-test` — producer, offline self-verification AND the 38-test
mutation/differential control suite against the freshly produced archive — and the finalizer
run **`32193194227`** (`macos-14`, attempt 1) completed green. The delivery artifact:

* **`c18-db-paths-evidence-a1-35854e8b7146e9f1fda3de4f3945450627b934d4c0c9b828fb8956ce5665e549`**
  — exactly the archive `c18-db-paths-evidence-8a23526….zip` (outer sha256
  `35854e8b7146e9f1fda3de4f3945450627b934d4c0c9b828fb8956ce5665e549`, equal to the
  artifact-name digest) plus its verified sidecar, nothing else. Verified from a fresh foreign
  checkout at exactly `8a23526` with **`--online --require-hosted`**: hosted push/main run,
  attempt, successful build-test, successful blocking C18 step and the exact digest-bound
  artifact all authenticated (`standing=delivery-online`).

Why `d5061b8` was superseded: its verifier accepted synthetic archives (fake SHA, arbitrary
suite text, empty audit worlds, vacuously equal postures — each now a frozen-fixture
DIFFERENTIAL control that the exact old verifier still passes and C18.1 rejects), and its
evidence exposed ephemeral secrets (raw `ctx.context_secret` in snapshots; generated
PostgreSQL/Redis passwords in `commands.json`). The contaminated hosted artifacts are
enumerated in §15 of the closure plan with a targeted-deletion recommendation; they have NOT
been deleted (owner authorization required).

Verification runs against `8a235263d55545bd708b5b5af200670c467a457a`:

```
git clone https://github.com/a-Halawany/elven && cd elven
git checkout 8a235263d55545bd708b5b5af200670c467a457a
pnpm install --frozen-lockfile && pnpm --filter @eye/contracts build
node scripts/gate/c18-db-paths.mjs verify --zip <c18 evidence zip> --root "$PWD" --online --require-hosted
```

This section is written in a docs-only child commit; the child changes no executable file, so
the gates' verdicts at `8a235263d55545bd708b5b5af200670c467a457a` are unaffected by it.

## C18.1.1 evidence provenance (no SHA cycle) — SUPERSEDED by C18.1.2 below

**SUPERSEDED at C18.1.2**: the 567a70f evidence itself is authentic and LEAK-FREE — it is NOT
secret-contaminated — but its verifier still ACCEPTED ten fully-rebound false packages
(duplicated/deleted/exit-forged ledger commands, a tampered port receipt, forged seed
principals and summaries, a forged post-upgrade eventId, identical attacker posture on both
paths over genuine raw receipts, and an evidence-only or attacker-principal closure decision).
Each was reproduced against the frozen verbatim 567a70f verifier and is rejected by C18.1.2
for its semantic reason. The record below stays as honest history; verification targets the
C18.1.2 section.

The C18 evidence-bearing source was **`567a70f4f823a83b069460cce9e103cd80044467`**. Source run
**`32231834550` attempt 2** (push, `main`; attempt 1's `browser-regression` was cancelled by a
transient GitHub "Install Chrome" infrastructure failure, so the ENTIRE workflow was re-run per
the recovery contract; all three jobs green in attempt 2 with the blocking C18.1.1 gate — the
leak-fixed producer, offline self-verification and the 57-test in-gate mutation/differential
suite). Finalizer run **`32234840732`** (`macos-14`, green). Delivery artifact:

* **`c18-db-paths-evidence-a2-a93dc04547fa0652eeb769c5067356ad017eda92e6514b630d631b4084b93f6f`**
  — exactly the archive `c18-db-paths-evidence-567a70f4….zip` (outer sha256
  `a93dc04547fa0652eeb769c5067356ad017eda92e6514b630d631b4084b93f6f`, equal to the artifact-name
  digest) plus its verified sidecar, nothing else. Its bytes are LEAK-FREE (no raw
  ctx.context_secret, no env/argv password, no private key). Verified from a fresh foreign
  checkout at exactly `567a70f` both offline and with **`--online --require-hosted`**: workflow
  ci, push/main, exact SHA + attempt, all three jobs successful, the blocking C18 step successful,
  and the unique unexpired digest-bound artifact authenticated (`standing=delivery-online`).

Why `8a23526` was superseded: its evidence leaked the raw `ctx.context_secret.secret`, and its
verifier accepted rebound false evidence. Both are proven by the frozen-verbatim 8a23526 verifier
fixture (`apps/api/test/gate/fixtures/c18-legacy-8a23526/`): differential controls show it
accepts a raw-secret receipt and an altered-processed/intact-raw archive that C18.1.1 rejects.
The contaminated C18.1 hosted artifacts are recorded in §16 with a targeted-deletion
recommendation; none have been deleted (owner authorization required).

Verification runs against `567a70f4f823a83b069460cce9e103cd80044467`:

```
git clone https://github.com/a-Halawany/elven && cd elven
git checkout 567a70f4f823a83b069460cce9e103cd80044467
pnpm install --frozen-lockfile && pnpm --filter @eye/contracts build
node scripts/gate/c18-db-paths.mjs verify --zip <c18 evidence zip> --root "$PWD" --online --require-hosted
```

This section is written in a docs-only child commit; the child changes no executable file, so the
gates' verdicts at `567a70f4f823a83b069460cce9e103cd80044467` are unaffected by it.

## C18.1.2 evidence provenance (no SHA cycle) — SUPERSEDED by C18.1.3 below

**SUPERSEDED at C18.1.3**: the 15e8239 evidence is authentic and LEAK-FREE — it is NOT
secret-contaminated — but its verifier did not authenticate exact SQL (its command graph accepted
ANY text in the final `psql -c` position), the migration executable and subject (only the argv
suffix was checked), exact secret classes (any string beginning `<REDACTED:` passed), several
seed relationships (session families, canonical-object correlations, the correlation set in the
unused direction, additional role bindings), suite-stream ownership, or the governed seeding and
cleanup phases. The record below stays as honest history; verification targets C18.1.3.

The C18 evidence-bearing source is **`15e8239007f0b25a9d62ea52bfc9c2101cfcdca6`**. Candidate CI
ran green as pull-request run **`32260721217`**; source run **`32261313938` attempt 1** (push,
`main`) ran at exactly that SHA with all three jobs green in ONE attempt, including the blocking
C18 gate — the corrected producer, offline self-verification and the **79-test** in-gate
mutation/differential suite (all ten 567a70f-accepts/C18.1.2-rejects differentials, the d5061b8
and 8a23526 differential families, command-graph/binding/projection rejections, the real-CLI
hidden-untracked-file refusal and the real SIGTERM cleanup control). Finalizer run
**`32261859846`** (`macos-14`, green). Delivery artifact:

* **`c18-db-paths-evidence-a1-ed6a58718575b9d3793f5de1c0df5b6dc74f8e00bf6f1659f9ba8942fadbf5b4`**
  (290,893 B wrapper) — exactly the archive
  `c18-db-paths-evidence-15e8239….zip` (434,057 B, outer sha256
  `ed6a58718575b9d3793f5de1c0df5b6dc74f8e00bf6f1659f9ba8942fadbf5b4`, equal to the
  artifact-name digest) plus its verified sidecar, nothing else. Arithmetic: 264 commands,
  792 raw stream files, 9 fixed top-level regular files, 801 regular files, + the `raw/`
  directory entry = 802 ZIP entries. Verified from a fresh foreign checkout at exactly
  `15e8239` both offline and with **`--online --require-hosted`**: workflow ci, push/main,
  exact SHA + attempt, all three jobs successful, the blocking C18 step successful, and the
  unique unexpired digest-bound artifact authenticated (`standing=delivery-online`).

Why `567a70f` was superseded (stated honestly): its evidence is authentic and LEAK-FREE — it is
NOT secret-contaminated — but its verifier accepted ten fully-rebound false packages. The exact
567a70f verifier is frozen BYTE-VERBATIM at `apps/api/test/gate/fixtures/c18-legacy-567a70f/`
(per-file SHA-256 pinned and cross-checked against `git show 567a70f:…` where history is
available; its ROOT compose lookup is satisfied by a tracked symlink, never by editing the
frozen file), and the in-gate differentials prove it ACCEPTS each of the ten rebound false
packages that C18.1.2 rejects for its semantic reason. See `GATE2_2_FINAL_CLOSURE_PLAN.md` §17
for the full A–E correction record.

Verification runs against `15e8239007f0b25a9d62ea52bfc9c2101cfcdca6`:

```
git clone https://github.com/a-Halawany/elven && cd elven
git checkout 15e8239007f0b25a9d62ea52bfc9c2101cfcdca6
pnpm install --frozen-lockfile && pnpm --filter @eye/contracts build
node scripts/gate/c18-db-paths.mjs verify --zip <c18 evidence zip> --root "$PWD" --online --require-hosted
```

This section is written in a docs-only child commit; the child changes no executable file, so the
gates' verdicts at `15e8239007f0b25a9d62ea52bfc9c2101cfcdca6` are unaffected by it.

## C18.1.3 evidence provenance (no SHA cycle)

The C18 evidence-bearing source is **`83d158cca00d3a85ae78c3a4e9019c483426c5a7`**. Candidate CI
ran green as pull-request run **`32351402879`**; source run **`32351964148` attempt 1** (push,
`main`) ran at exactly that SHA with all three jobs green in ONE attempt, including the blocking
C18 gate — the corrected producer, offline self-verification and the **107-test** in-gate
mutation/differential suite. Finalizer run **`32352446987`** (`macos-14`, green). Delivery
artifact:

* **`c18-db-paths-evidence-a1-372ffb5f73a45a26df98c4ffcb35e0c4fbeea1feb2afb0b6d8a2ca904ebf924c`**
  (294,514 B wrapper) — exactly the archive `c18-db-paths-evidence-83d158cc….zip` (441,336 B,
  outer sha256 `372ffb5f73a45a26df98c4ffcb35e0c4fbeea1feb2afb0b6d8a2ca904ebf924c`, equal to the
  artifact-name digest) plus its verified sidecar, nothing else. Arithmetic: 272 commands,
  816 raw stream files, 9 fixed top-level regular files, 825 regular files, + the `raw/`
  directory entry = 826 ZIP entries. Verified from a fresh foreign checkout at exactly
  `83d158c` both offline and with **`--online --require-hosted`** (`standing=delivery-online`).
  A standalone scan of every member and the final ZIP finds ZERO generated credentials: the
  evidence carries 24 distinct exact `<REDACTED:<path>:<CLASS>>` placeholders (12 classes × 2
  paths) and no 48-hex credential token anywhere.

Why `15e8239` was superseded (stated honestly): its evidence is authentic and LEAK-FREE — it is
NOT secret-contaminated — but its verifier did not authenticate exact SQL, the migration
executable and subject, exact secret classes, several seed relationships, suite-stream ownership,
governed seeding or cleanup execution. The exact 15e8239 verifier is frozen BYTE-VERBATIM at
`apps/api/test/gate/fixtures/c18-legacy-15e8239/`, and twelve of the thirteen mandated classes
were first REPRODUCED as accepted false passes against it; the thirteenth (cleanup and seeding)
was accepted because that evidence did not exist at all. See `GATE2_2_FINAL_CLOSURE_PLAN.md` §18
for the full A–F correction record.

Verification runs against `83d158cca00d3a85ae78c3a4e9019c483426c5a7`:

```
git clone https://github.com/a-Halawany/elven && cd elven
git checkout 83d158cca00d3a85ae78c3a4e9019c483426c5a7
pnpm install --frozen-lockfile && pnpm --filter @eye/contracts build
node scripts/gate/c18-db-paths.mjs verify --zip <c18 evidence zip> --root "$PWD" --online --require-hosted
```

This section is written in a docs-only child commit; the child changes no executable file, so the
gates' verdicts at `83d158cca00d3a85ae78c3a4e9019c483426c5a7` are unaffected by it.
