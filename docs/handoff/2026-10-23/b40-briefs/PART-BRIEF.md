# B40 — the part builder's brief (common to §RG, §VA, §IN, §AP, §CR — wave 1 — and §AC — wave 2)

You build ONE part of CP-6 stage **B40 — the source platform** of The Eye (pnpm monorepo: NestJS API `apps/api`, Next.js 16 / React 19 web
`apps/web`; PostgreSQL 18 in docker `eye-postgres`), in parallel with other builders: F-P1-01 registry / rights, F-P1-02 vault / authenticity,
F-P1-03 intake / quarantine, F-P1-04 acquisition policy, F-P1-12 connector runtime — 80 rows. It builds on everything through 0122 (B80's
library and shell, B81's patterns, B50's knowledge hooks, B82's trust / evidence / rights terms). The scratchpad `$S` =
`/private/tmp/claude-501/-Users-halawany-work-personal-mohammed-new-project/410dc92c-9357-4f51-bd03-84dce11e3661/scratchpad`.

## Read first, in order
1. `$S/b40/DESIGN.md` — BINDING (D1–D20; **D2 and D4 are the owner's word of 2026-10-21**), and `audit/CP6_BATCHES.md` §B11, §B13/§B14,
   §B16/§B17, §B22–§B28, §B50, §B82 in your worktree (what the stages under you built).
2. `$S/b40/MAP.md` §3 — YOUR part's row of the parts table completely, the §0 prelude and the waves; and your section below.
3. `$S/b40/MAP.md` — §4 (frozen gates and artefacts), §5 (inputs: what the code does today at each scene point, what eye_demo holds), §6
   (boundaries), §7 (the acceptance rows), §8 (the demonstration), §9 (the open questions — DESIGN.md decides them), §10 — EVERY row whose
   `part` column is yours (`$S/b40/rows.json` has them).
4. The prelude at `658658df`: `apps/api/migrations/0123_b40_source_platform.sql` (§0 only), `apps/api/src/observation/sources/source-contract.ts`
   (SRC@v4: `SrcV4*`, `isSourceContractV4`, `schemaRefOf`), `apps/api/src/observation/acquisition/intake-stage-types.ts` + `intake-stages.ts`
   (the seam) + `stages/*.ts` (your stub), `apps/api/src/observation/sandbox/spawn-confined.ts` (the launcher), `apps/api/test/int/phase6-prelude-b40.test.ts`,
   `apps/api/test/int/phase6-b40-fixtures.ts`, `fixtures/phase7/b40/**` (+ `scripts/phase6/build-b40-fixtures.mjs`).
5. House style: the API — `apps/api/src/observation/*` (and `evidence-b82/` for a part's own controller), `apps/api/migrations/0121_*.sql` /
   `0122_*.sql`; the web — B80/B81/B50/B82's library (`components/{data,layers,object,recovery,authority,help,layout,knowledge,truth,evidence,chart,canvas,trust}.tsx`,
   `lib/*-b8x.ts`, `lib/*-b50.ts` with their tests).

## Your worktree and branch
`/Users/halawany/work/personal/mohammed/new_project/.claude/worktrees/b40-<part>` on branch `b40/<part>` — CREATE it yourself first:
`git -C /Users/halawany/work/personal/mohammed/new_project/.claude/worktrees/b40 worktree add -b b40/<part> ../b40-<part> 658658df`. Then at its root
`pnpm install --frozen-lockfile --offline` and `pnpm --filter @eye/contracts build` (and `pnpm --filter @eye/tokens build` if your code needs the built
tokens). Work ONLY there. Never run `next build` or a full `pnpm build`; typecheck with `tsc --noEmit`.

## Build — every row of YOUR part
- **SQL** only in `apps/api/migrations/0123_b40_x_<part>.sql` (applies ALONE on 0001–0122 + 0123 §0 on a fresh database). A function you re-declare
  is copied WHOLE from its LAST definition (grep every migration — 0123 §0 included), the change marked `-- B40 <part>`. Never edit an applied or
  committed migration, nor 0123 §0 (a change §0 needs is the integrator's — report it).
- **Ports:** SECURITY DEFINER, `SET search_path = …, pg_catalog, pg_temp`; `observation.assert_authority(ARRAY['<your action>'])`, the scope assert,
  the acting principal `= public.eye_principal()`, the human / role / separation-of-duties checks RE-CHECKED IN THE PORT (approver ≠ registrar /
  proposer / uploader / requester; never an agent — `governance.assert_approver` where it fits). REVOKE ALL FROM PUBLIC; GRANT EXECUTE TO eye_commit
  (writes) / eye_app, eye_commit (reads guarded by `observation.assert_read_scope`). Tables: FORCE RLS (the 0121 / 0122 idiom); SELECT to
  eye_app / eye_commit; no write grants; append-only where the rows say so (`public.raise_append_only`). Refusals in the CLASS form
  `<noun> rejected (<class>): …` (403 actor|authority|separation_of_duties|access · 404 unknown_* · 409 state|stale|duplicate|held|expired · 422
  otherwise) — if your noun is not mapped centrally yet, report it (do not edit the error rows).
- **No new role** (D14). **No new dependency** (runtime or dev), no new image, no font or image file. **Every new action is an EXACT PDP rule** in your
  reserved block `/* B40 <part> */ … /* end B40 <part> */` of `apps/api/src/policy/pdp.service.ts` (placed before the `observation.` prefix rule —
  D15); human-gated acts carry `obligations: [{ type: 'human_gate' }]`. D9: no evidence-content permission is widened.
- **TS:** your own directories and files (MAP §3 names them; a part's controller is its own file inside the existing `api.observation` unit — no new
  unit) and your marked blocks only (`/* B40 <part> */ … /* end B40 <part> */`) in shared files (`pdp.service.ts`, `observation.capabilities.ts` —
  the record-port blocks reserved for va / in / ap / cr —, `observation.module.ts`). The intake seam: replace ONLY your stage file's body; the
  interface, the call sites in `lifecycle.service.ts` and the composition are the prelude's (a change is the integrator's — report it).
- **The v1–v3 rule (D7 / D8):** a stage acts on an SRC@v4 contract (`ctx.v4`); a v1–v3 contract keeps EXACTLY its recorded behaviour (the hosted
  `e2e/phase1-observation.spec.ts` #1–#15 stay green: #7's "content authenticity unknown" wording, #8's same-manager collect-and-discard, #1–#3's
  registrar ≠ approver on a v3 contract, #14's no sideways scroll). No back-fill: earlier versions read "not recorded before B40".
- **Web:** the LIBRARY files of your part (top-level `apps/web/components/<file>.tsx`; they arrive `proposed`, the DSA approves each in the act),
  your pure models `apps/web/lib/<name>-b40.ts` + `*.test.ts` (vitest, node environment), your pages. Keep: the hosted selectors (navigation names,
  banner, "Sign out", native `<select>`, labels), B107's raw-colour / optimistic-path / surface-name lint at zero (no "dashboard" / "report"
  surface name — "Egress receipts"), accessible names / roles / states on every control, keyboard paths, forced-colors and 200% zoom considered,
  logical properties; one `<h1` literal per new page; the B81 content lint (verb + object labels, a destructive command states what is kept);
  consequential acts through B81's CommandReview / TypedConfirmation; a refusal shown in the server's words; a DATE renders as the day it names;
  nothing optimistic; numbers through B82's number components (no raw `toFixed`); any chart through ChartFrame.
- **The principles:** connectivity is not authority; a scan that is not `clean` never admits; a failed signature is admitted MARKED, never
  silently trusted; revoked rights refuse decision-active use while a read stays possible; side ledgers, never a header field (D11, D22).
  CONSTRUCTION, DEMONSTRATED OPERATION and REAL ACCEPTANCE are three claims (say which in comments and your report); everything a harness writes is
  SYNTHETIC. A substitute (synthetic feed, loopback server, protocol fake) demonstrates software but never closes a clause that needs the real
  external integration.
- **Acceptance rows (B+X):** build the harness evidence; the row stays partial naming "the shared non-demonstration recording path at B111, then
  H3/R2" — never claim it implemented, never move it to another feature.
- **Fault injection (D17):** your points F47–F56 in `apps/api/src/observation/fault-injection.ts` (test-only arming, the A4 idiom), each with its
  fail-closed assertion in your harness. Coordinate the numbers: §VA F47 (authenticity check), §IN F48–F49 (inspector crash / timeout; clamd
  unavailable), §AP F50–F53 (rate bucket unavailable, Retry-After parse, robots fetch failure, residency lookup), §CR F54–F56 (gateway down,
  receipt write, requalification write).

## Prove
- **Database-heavy runs one at a time, HOST-WIDE:** wrap every fresh-database migrate and every harness run in
  `EYE_HEAVY_SLOTS=1 scripts/dev/heavy-slot.sh b40-<part> -- <command…>`. Fresh databases `eye_verify_a1_b40_<part>_<n>`:
  `docker exec eye-postgres dropdb -U eye --if-exists <db>; docker exec eye-postgres createdb -U eye <db>`, then `cd apps/api && EYE_DB_NAME=<db> pnpm
  db:migrate` with `/Users/halawany/work/personal/mohammed/new_project/.eye-local/env` sourced (`set -a; . <file>; set +a` — READ ONLY). Harness:
  `EYE_DB_NAME=<db> EYE_REDIS_PORT=<your port> npx vitest run --config vitest.int.config.ts <file>` (from `apps/api`). Drop every database you create.
- **Your Redis port** (the assignment below). Never 6379, 6392 or another part's port. Every harness / API / script you run sets `EYE_REDIS_PORT`.
- **Finish with:** your harness green on a fresh database; `phase6-prelude-b40` green on the same database (if your part replaces a stub, update
  ONLY the prelude case that asserts that stub's inertness, and say so); `phase1-acceptance` and the phase1 observation int harnesses
  (`phase1-fault-injection`, `phase1-hostile-input`) green; both typechecks (`apps/api`: `npx tsc -p tsconfig.json --noEmit`; `apps/web`:
  `npx tsc --noEmit`); the web tests (`cd apps/web && pnpm test`); the B107 design lint (`cd apps/api && npx vitest run test/unit/governance-design-b107.test.ts`);
  your unit tests; `pnpm boundaries` at the root (a stage file imports the seam's TYPES from `intake-stage-types.ts`, never `intake-stages.ts` —
  that is a cycle); and the pinned gitleaks on your own commits — `$S/bin/gitleaks detect --source . --log-opts "658658df..HEAD"` — and on the
  worktree (`$S/bin/gitleaks detect --no-git --source <file>` per changed file) BEFORE you report (D19). A key-shaped literal is split before it
  is committed.

## Rules
- **Never touch:** eye_demo (read-only SELECTs allowed: `BEGIN TRANSACTION READ ONLY … ROLLBACK`), the demo ports :3401 / :3000 / :3411 / :2525 /
  :3443–:3446, Redis :6379 / :6392 / another part's port, `.github/workflows/*`, `scripts/gate/*`, the C15–C19 controls and manifests,
  `docker-compose.yml`, `pnpm-workspace.yaml` overrides, `.dependency-cruiser.cjs`, the conformance manifests, the licence lists, EXCEPTIONS.md
  (EXC-P1-001 stays OPEN — the owner closes it, D2), `audit/*` (the integrator does the bookkeeping), another part's files or blocks, the prelude
  files (0123 §0, the seam's interface and composition, the launcher, the prelude harness and fixtures — report a change you need), the main checkout.
- **Keys and samples (D18 / D19):** every key in a fixture is generated at run time (`phase6-b40-fixtures.ts`: `publisherKeyPair`,
  `signedBulletin`, `tamperedCopy`, `signJws`); the EICAR test string only through `eicarTestBytes()` (assembled at run time, written to a
  temporary file or a request body, removed after use) — never a committed file; no live malware.
- **The act-target rule:** any act, candidate act or walk you write calls `scripts/act-target.mjs`'s `resolveActTarget()` BEFORE any login; a
  synthetic server you start listens on a port distinct from :3401 / :3000 / :3443 and is refused against the live addresses by the same module.
- Commit on your branch in small commits (message ending with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`); quoted heredocs; never push.
- The disk floor is 30 GB: check `df -g /` before heavy work; delete what you create.

## Report (your final message, ≤ 60 lines)
Your branch head; your SQL file and its objects; your PDP rules; files changed outside your own directories (and why); per ROW of your part:
implemented / partial (why, naming the carrier or the external act) / missing — a compact table keyed by row id; the harness and test results
with counts; the gitleaks result on your commits; anything a sibling or the integrator must do (seams you needed, nouns to map, selectors you
touched, prelude cases you updated).

## The assignment
| Part | key | Redis | wave | harness |
|---|---|---|---|---|
| §RG registry, stewardship, rights lifecycle, revocation impact (F-P1-01) | `rg` | 6394 | 1 | `phase6-registry-b40.test.ts` |
| §VA vault authenticity, evidence attributes, obligation inheritance (F-P1-02) | `va` | 6395 | 1 | `phase6-authenticity-b40.test.ts` |
| §IN inspection sandbox, quarantine, intake review queue (F-P1-03) | `in` | 6396 | 1 | `phase6-intake-b40.test.ts` (+ unit `content-inspector-b40.test.ts`) |
| §AP acquisition-time policy (F-P1-04) | `ap` | 6397 | 1 | `phase6-acquisition-policy-b40.test.ts` |
| §CR connector cell, adapter SDK, egress gateway (F-P1-12) | `cr` | 6398 | 1 | `phase6-connector-cell-b40.test.ts` (+ unit `egress-gateway-b40.test.ts`) |
| §AC acceptance, exercises, the walk | `ac` | 6399 | 2 | `phase6-acceptance-b40.test.ts` |

## The prelude's rules (`658658df`)
- **0123 §0** widened, once: `connector_kind` + adapter; seven contract events (`contract.rights_changed`, `.evaluated`, `.stewardship_changed`,
  `.customer_approved`, `.requalification_required`, `.requalified`, `.credential_rotated`); incomplete-range classes + `rate_limited`,
  `window_closed`, `robots_disallowed`, `residency_refused` (`observation.stream_incomplete` re-declared — its only writer); the quarantine reason
  classes (historic + `active_content`, `macro`, `embedded_file`, `hidden_instruction`, `malware_verdict`, `inspection_unavailable`,
  `inspection_failed`, `inspection_incomplete`, `duplicate`, `quality`, `rights`, `policy_prohibited`, `residency_conflict`,
  `destination_identity_changed`, `unknown_signer`, `response_anomaly`); `custody.inspected`, `custody.authenticity_recorded`;
  `source_impact_markers.cause` (`health` default | `rights`); the DOMAIN `observation.inspection_outcome` (clean | detected | unavailable |
  failed | incomplete). A class or event you need beyond these: report it — do not widen a CHECK in your file.
- **SRC@v4** (`source-contract.ts` + the registry row): `acquisition_policy`, `authenticity`, `content_policy` (incl. `scan_engines`
  content-inspector | clamav, `auto_admit`), `economics`, `stewardship`, `evidence_attributes`, `adapter` (kind adapter only). A contract is v4
  when it carries any v4 block (all then required) or the adapter kind. Registration admits it as `SRC@v4` (`schemaRefOf`).
- **The seam** (`intake-stage-types.ts`): `authorize(ctx)` at the pre-egress revalidation (command + stream; `refuse` cancels before any
  request); `throttle(ctx, {endpoint})` before every request (the rest / rss connectors call `AcquisitionContext.throttle`; §CR's gateway calls
  the same stage; `refuse` → `IntakeStageRefused` → the run fails with `throttle refused (<class>)`); `inspect(ctx, {item, stored, heuristic})`
  after fetch (never weakens the heuristic verdict; `quarantine` uses its own class); `authenticate(ctx, {item, stored})` after inspection
  passes, before admission (`admit` sets the EVD@v1 payload's `content_authenticity` via `payloadContentAuthenticity` — verified | unknown |
  not_applicable; `quarantine` = `unknown_signer`); `record(cap, ctx, at, decision)` of inspect and authenticate runs inside the admission
  (`at.kind = 'admitted'`, the EVD id / version / manifest) or the quarantine transaction (`'quarantined'`, the case id / manifest).
- **The launcher** `confinedSpawn({ script, args, readPaths, stdin, timeoutMs, maxHeapMb, maxOutputBytes, env })` → `ok | failed | timeout |
  output_limit | spawn_failed`; everything but `ok` is the caller's `unavailable` (fail closed). Network denial is NOT a launcher property (D3).
- **The use-refusal hooks:** `objects._lineage_usable` (0123 §0, whole) calls `observation._b40_use_refusal(tenant, domain, evd, version,
  state)` per evidence version — §0's dispatcher, never re-declared — which calls `_rg_use_refusal(…, p_source, p_contract_version,
  p_contract_rights_state, p_terms_rights_state)` then `_va_use_refusal(tenant, domain, evd, version)`. Each answers NULL or
  `{ "class", "detail" }`; the classes are exactly `rights_withdrawn` (§RG) and `authenticity_failed` (§VA), mapped 409 (EYE-STA-002); any
  other class is refused by the dispatcher. Replace YOUR stub WHOLE (same signature, STABLE, invoker, search path, REVOKE ALL FROM PUBLIC).
- **Fixtures:** `fixtures/phase7/b40/{replay/red-sea-shipping-notices, replay/djibouti-port-vessel-calls, replay/nordwerk-logistics-partner,
  customs, uploads, adapter/nordwerk-logistics-consignments-1.0.0, -1.0.1}` with MANIFESTs and DEF-B40-xx planted defects; a harness reaches a
  replay set with `EYE_CONNECTOR_REPLAY_ROOT=B40_REPLAY_ROOT`, the demo (default root) with `replay_set: replaySetFromPhase1Root(<set>)`.
  Rebuild with `node scripts/phase6/build-b40-fixtures.mjs` (deterministic) — only the part that owns a set changes it, and says so.

---

## §RG — source registry, stewardship, rights lifecycle and revocation impact (F-P1-01) · `rg` · Redis 6394 · wave 1
Rows: the 20 `part = RG` rows of rows.json (§10 rows 1–23 minus V01-T-032 (INT) and PR-09-006 / AT-09 (§AC)).
- **Discovery** (JRN-02): `observation.source_candidates` + events — how found, publisher, terms URL, proposed purposes, assessment; proposed by an
  analyst; promoted to a DRAFT SRC@v4 contract prefilled. **Evaluation** before approval: `observation.source_evaluations` (authority, rights
  evidence, coverage fit, cost, risks, recommendation); the approval port refuses an UNEVALUATED v4 contract (v1–v3 keep their path — e2e #1–#3);
  evaluator / approver ≠ registrar (D5). **Economics** (SRC@v4) compared by the run meter; **stewardship** (`contract.stewardship_changed`).
- **Rights / purpose lifecycle** — a new port `observation.change_rights` (narrow purposes, withdraw, restore; reason + evidence; `contract.rights_changed`).
  **DESIGN D4 (the owner's word):** a withdrawal (a) unschedules the source's collection, (b) emits `SourceHealthChanged(suspended)` with cause
  `rights` so B22's consumer sets markers through 0088's `mark_source_impact` (`source_impact_markers.cause = 'rights'`; no new interface-register
  row), (c) lists the affected products for the steward, (d) REFUSES decision-active use of evidence acquired under revoked rights.
  **Fill `observation._rg_use_refusal` (replace the stub WHOLE)** — it receives BOTH rights sources and must count both, from CURRENT state:
  `p_contract_rights_state` — the rights_state of the SOURCE CONTRACT version the evidence was admitted under (`graph.ev_evidence_state`'s
  `contract_rights_state`), and `p_terms_rights_state` — the rights-TERMS records' state (0121's terms-derived `rights_state`, which
  `_lineage_usable` already refuses as `rights_expired` when expired / withdrawn). An in-force terms record must NOT bypass a separately revoked
  applicable contract, and vice versa; class `rights_withdrawn`. **The owner's proof requirements (D4)**, each a harness case on the real option,
  publication, export and gate paths: the affected use REFUSED with NO business effect (nothing written by the refused act); unaffected scope
  still usable (another source's evidence, the same source's evidence under rights that still stand); recovery ONLY after the applicable rights are
  legitimately restored through governed versions (restoring the terms alone does not lift a contract withdrawal, and vice versa); history intact
  (no record rewritten); reading stays as it was (D9 — historical readability grants nobody new evidence-content access); enforced from current
  database state, never waiting for a reconciliation tick.
- **The impact read** `observation.rights_revocation_impact(tenant, domain, source)` = B28's `source_derived_products` + claims through
  `intelligence.claim_lineage` + B50's forward impact, each with its owner (attention items to each owner); **the change preview**
  `observation.source_change_impact` before a new version or a rights change (CAP-OB-02). **Deletion on withdrawal:** a declared deletion
  obligation opens a B9 retention action (approved by the retention authority, executed by the steward — never automatically). **Customer
  approval** (D13: the TENANT's customer sponsor or tenant admin, never the registrar or approver; a record the admission cites, not a gate).
  **Source incidents** owned by the collection manager (PER-11's part). The old `set_rights_state` route stays for v1–v3, re-pointed to the port.
- Web: `components/source-registry.tsx`, `lib/sources-b40.ts`; pages `observation/sources/page.tsx`, `sources/new/page.tsx`, `sources/[sourceId]/page.tsx`
  (the withdraw / restore control through CommandReview), new `sources/discovery/page.tsx`, new `sources/[sourceId]/impact/page.tsx`.
- Harness `phase6-registry-b40.test.ts`: positive / refusal / recovery per row; the D4 proofs above; registrar ≠ approver ≠ evaluator; cross-tenant.

## §VA — vault authenticity, evidence attributes, obligation inheritance (F-P1-02) · `va` · Redis 6395 · wave 1
Rows: the 11 `part = VA` rows (§10 rows 24–36 minus V00-T-002, V02-T-039 (INT)).
- **Publisher key anchors** `observation.publisher_keys` + events (per source; Ed25519 or JWS public key, TLS SPKI pin; validity; declared and
  retired by a data steward or collection manager, human-gated; never an agent; the B16 partner-key pattern, 0076, `rotated_from`).
- **Verification at intake — fill `stages/authenticate-va.ts`** (node:crypto Ed25519, the existing `jose` for JWS — no new dependency): against the
  anchors in force → VERIFIED / FAILED / UNSIGNED / UNAVAILABLE recorded per EVD version in `observation.evidence_authenticity` by your
  `record` (+ `custody.authenticity_recorded`). **D6:** a FAILED signature is ADMITTED marked `authenticity_failed`; an UNKNOWN signer (no anchor in
  force) → `quarantine` / `unknown_signer`. The EVD@v1 payload keeps its enum (`payloadContentAuthenticity` = verified only for verified); an unsigned
  / v1–v3 source keeps "content authenticity unknown" with e2e #7's wording. Authenticity as a measured coverage dimension.
- **Fill `observation._va_use_refusal`** (replace the stub WHOLE): an evidence version recorded FAILED → class `authenticity_failed` (D6 overrides
  MAP's "refuses nothing": it is refused at decision-active use, stays admitted and readable, shown weak).
- **B82's trust layer:** `graph.ev_evidence_state` and `graph.provenance_strength` re-declared WHOLE from 0121 (only §VA) adding the authenticity
  reason (a claim on failed evidence reads WEAK / INDETERMINATE "authenticity failed"). Keep `contract_rights_state` and `rights_state` in the
  output unchanged — §RG's refusal reads them.
- **Evidence attributes** side ledger `observation.evidence_attributes` (from SRC@v4 `evidence_attributes` at intake; a steward override with a reason;
  no header widening, no back-fill — "not recorded before B40"). **Most-restrictive inheritance** `objects.inherited_obligations(ref)` and the
  transformation-rule register (proposed by a data steward, approved by the privacy officer — never the proposer; D22's NULL kept, bases in
  `version_operations.basis`). **The per-tenant retention register** read beside `/graph/retention`.
- Web: `components/authenticity.tsx`, `lib/authenticity-b40.ts`; pages `observation/evidence/[evdId]/page.tsx` (keeps e2e #7), new
  `observation/authenticity/page.tsx`, `graph/retention/page.tsx` (the tenant register section only).
- Harness `phase6-authenticity-b40.test.ts` (scene 2 with `signedBulletin()` / `tamperedCopy()`; keys at run time); fault F47.

## §IN — inspection sandbox, quarantine, intake review queue (F-P1-03) · `in` · Redis 6396 · wave 1
Rows: the 22 `part = IN` rows (§10 rows 37–61 minus DP-16-006, PR-16-006, AT-16 (§AC)).
- **The inspection engine port — fill `stages/inspect-in.ts`:** versioned engines; EVERY verdict recorded as evidence in
  `observation.inspection_verdicts` (outcome typed `observation.inspection_outcome`) WITH the engine identity (`EngineIdentity`: engine, engine
  version, image digest, rule-set digest, and the SIGNATURE-DATABASE identity — each database's version, build time and digest) and the
  findings (codes, byte offsets — never content, D9), by your `record` (+ `custody.inspected`).
- **Engine 1 — the content inspector** in the §0 launcher (no network, fs read of the one item, 128 MiB, 5 s): PDF active content
  (`/JavaScript /JS /OpenAction /Launch /AA /EmbeddedFile`), Office macros (`vbaProject.bin`, OLE streams in OOXML), embedded executables /
  polyglots, decompression bombs, hidden instructions (instruction phrases in invisible / white / zero-size text, zero-width characters, post-EOF
  text, metadata — deterministic patterns, no model). A crash / timeout = `unavailable`.
- **Engine 2 — a REAL ClamAV engine over clamd (DESIGN D2, the owner's word):** the clamd INSTREAM adapter; the engine identity from clamd
  (`VERSION` → engine version and the daily DB version / build time) and the configured image digest; the signature-database source and update
  policy configured EXPLICITLY (named in config, recorded on every verdict). **Outcomes: `clean`, `detected`, `unavailable`, `failed`,
  `incomplete` — ONLY `clean` admits; every other → quarantine (`QUARANTINE_CLASS_OF_OUTCOME`: malware_verdict, inspection_unavailable,
  inspection_failed, inspection_incomplete); an unavailable or incomplete scan is NEVER clean.** Proven end to end on the REAL engine: intake → scan
  → admission with a CLEAN input (`uploads/regensburg-bearings-delivery-note.pdf`), → quarantine with the HARMLESS detection fixture (the EICAR
  string from `eicarTestBytes()`, generated at run time, never committed) and with an UNAVAILABLE scan (the engine stopped / unreachable) and a
  FAILED one (an engine error answer). **The in-harness clamd stand-in serves the adapter's UNIT tests only** (protocol framing, size limits,
  error answers) — it does not complete the real-engine integration. **You do NOT add the image, a docker-compose service or any C15 manifest /
  pin change.** THE ADMISSION RESULT (DESIGN.md "D2 — the admission result"; `$S/b40/clamav/`): the image is NOT admitted — the official Alpine
  image has no linux/arm64 child, the two-platform Debian image carries 1 CRITICAL + 53 HIGH per platform with no fix; the owner decides. So the
  REAL-ENGINE integration harness (`phase6-clamav-engine-b40.test.ts`) runs only when `EYE_CLAMD_ADDR` (host:port) names a reachable clamd and
  otherwise SKIPS WITH A STATED REASON (never green by omission). Run it yourself against the LOCAL EVALUATION engine — the unadmitted Debian image
  already pulled (`clamav/clamav:1.5.4_base-debian` by digest; see `$S/b40/clamav/engine/` and `$S/b40/clamav/tools/clamd_probe.py` for how it was
  started: loopback 127.0.0.1:3310, the named volume `eye-clamav-db` holding the database, freshclam already run, `CLAMAV_NO_FRESHCLAMD=true`) —
  `docker run -d --name eye-clamav-eval -p 127.0.0.1:3310:3310 -v eye-clamav-db:/var/lib/clamav -e CLAMAV_NO_FRESHCLAMD=true <the arm64 child
  digest>`; stop and remove the container when done (keep the image and volume). Record its output as EVALUATION evidence of an UNADMITTED image in
  `evidence/cp6/b40-clamav-evaluation.txt` (clean admitted, EICAR quarantined with the engine + DB identity on the verdict, the engine stopped →
  unavailable → quarantined, an engine error answer → failed → quarantined). The rows needing an ADMITTED engine in the local/dev profile stay
  partial naming the owner's decision. EXC-P1-001 stays OPEN (the owner
  closes it): report the exit evidence (the integrated engine, the verdict evidence, the engine integration tests, the corpus results).
- **The content policy** (SRC@v4 `content_policy`: `scan_engines` must all answer clean; active content / macros / embedded files / hidden
  instructions → quarantine unless `admit_opaque` with a reason; v1–v3 keep their recorded rule — the DEF-03 PDF stays admitted, D8).
- **The intake review queue:** reasons rights / duplicate / quality / safety / authenticity / policy; duplicate state (same digest, or same item
  key with another digest); a quality score; **reviewer ≠ uploader for MANUAL uploads only (D9b)** — `observation.close_quarantine_case`
  re-declared WHOLE (e2e #8's same-manager collect-and-discard stays green); the upload approval workflow `observation.approve_upload` (SP-22: outside
  the contract's auto-admit rule an upload waits for a second person ≠ requester); a consumer notice when a case opens on a source products rest
  on; the case page "why" (the excerpt only to a role that already holds `observation.evidence.retrieve`, D9). The two stale eye_demo cases
  stay visible and untouched (D16).
- Web: `components/intake.tsx`, `lib/intake-b40.ts`; pages `observation/quarantine/page.tsx` (keeps e2e #8), new `observation/quarantine/[caseId]/page.tsx`,
  `observation/upload-b81.tsx`.
- Harness `phase6-intake-b40.test.ts` + unit `content-inspector-b40.test.ts` (the fixtures' supplier PDF, `.docm`, clean PDF); faults F48–F49.

## §AP — acquisition-time policy (F-P1-04) · `ap` · Redis 6397 · wave 1
Rows: the 7 `part = AP` rows (§10 rows 62–68).
- **Fill `stages/authorize-ap.ts`:** `observation.acquisition_authorizations` per run (contract version, purpose, rights + terms in force, credential
  reference, rate, residency verdict, window, robots verdict) — the record the run cites; refuse before egress with `rights | licence |
  residency_refused | window_closed | robots_disallowed | policy | unavailable`; rights re-checked per request (ES-31-007).
- **Fill `stages/throttle-ap.ts`:** the per-source Redis token bucket (SRC@v4 `rate`) shared by the command and stream forms and §CR's gateway; an
  unreachable bucket refuses (`unavailable`, fail closed). **429 / Retry-After honoured** (`retryAfterSeconds` is parsed and read by nothing today —
  `http-client.ts`; a 429 is `transport_failure` in `rest.connector.ts`) → the CONTRACT's backoff (SRC@v4 `backoff`, bounded; replacing BullMQ's
  generic `attempts: 3` for a v4 contract — `scheduler.service.ts`) and an incomplete range `rate_limited` with the interval, so the coverage
  view shows the gap (the coverage service reads incomplete ranges for it). The replay set `djibouti-port-vessel-calls` orders its answers to
  one URL by `attempt` — extend the replay responder to serve them in order (a set without `attempt` reads exactly as before).
- **Robots** fetched through the same vetted client, cached per contract version, evaluated per path ("not applicable" only with the contract's
  reason). **Licence:** purpose ∈ purposes, prohibited uses, expiry. **Residency** at ingress (contract vs the tenant / domain profile → refuse
  before egress or quarantine `residency_conflict`, per `residency_check`). **Window** (SRC@v4 `window`). **Manipulation / duplicate detection**
  on responses (`response_anomaly`).
- **D10:** the throttling demonstration replays the synthetic set; the harness also runs against a LOOPBACK throttling server through B14's one
  transport substitution, on a port the act-target module refuses for the live addresses.
- Web: `components/acquisition-policy.tsx`, `lib/acquisition-b40.ts`; new `observation/sources/[sourceId]/acquisition/page.tsx`; the coverage panel the
  source page mounts at the fold.
- Harness `phase6-acquisition-policy-b40.test.ts`; faults F50–F53.

## §CR — connector cell, published adapter SDK, egress gateway (F-P1-12) · `cr` · Redis 6398 · wave 1
Rows: the 12 `part = CR` rows (§10 rows 69–80).
- **`packages/connector-sdk`** — private, versioned (semver), dependency-free: the `Connector` contract, the cell protocol, `gatewayFetch`;
  first-party connectors re-exported, behaviour unchanged. It changes the lockfile's importers: run the C15 licence inventory on it and report.
- **The adapter package register** `observation.adapter_packages` + events (manifest — name, semver, entry, declared destinations, purposes, data
  classes — and the package digest; registered by a collection manager, approved by a SECOND person — a domain admin or another collection
  manager, never the registrant, never an agent, never an external collaborator (D12); bytes in the vault's own root, digest re-verified on
  load). The contract kind `adapter` (§0) binds the approved package (SRC@v4 `adapter`); `orchestrator.service.ts`'s `connectorFor` gains it.
- **The connector cell:** one child process per run under the run lease (0051), the §0 launcher (fs read of its package only, no credential, env
  stripped, caps; its only intended egress the gateway's loopback socket — D3, never claimed as network isolation); a JSON-lines protocol; framed
  items back to the existing lifecycle (admission, inspection, custody unchanged — IA-47-003).
- **The egress gateway** (loopback): per request — the contract's registered destinations, purpose, data class, §AP's THROTTLE STAGE (call
  `IntakeStages.throttle`, never a second bucket), resolve-and-vet + pin through B13/B14's client, the credential injected here, never in the cell;
  **transfer receipts** `observation.egress_receipts` (request / response digests, bytes, destination identity = resolved addresses + TLS SPKI).
  Destination identity change → block + quarantine `destination_identity_changed`. An unregistered host → the run fails closed, the contract
  SUSPENDED with cursor and custody intact, requalification required (`observation.connector_requalifications`: new digest, contract tests, a
  second person's approval) before reactivation — `observation.transition_contract` re-declared WHOLE; credential rotation (a new `credential_ref`
  binding version, the old revoked, requalification).
- The fixture packages `adapter/nordwerk-logistics-consignments-1.0.0` / `-1.0.1` speak a PROVISIONAL protocol (`acquire(ctx)` with
  `ctx.gatewayFetch`, `ctx.emit`, `ctx.log`); settle the real protocol and rebuild them through `build-b40-fixtures.mjs` (say so).
- Web: `components/connector-cell.tsx`, `lib/connectors-b40.ts`; new `observation/connectors/page.tsx`, new `observation/egress/page.tsx` ("Egress receipts").
- Harness `phase6-connector-cell-b40.test.ts` + unit `egress-gateway-b40.test.ts`; faults F54–F56.

## §AC — acceptance, exercises and the walk · `ac` · Redis 6399 · wave 2 (after every wave-1 part is integrated)
Rows: PR-09-006, AT-09 (ch9) and DP-16-006, PR-16-006, AT-16 (ch16) — B+X; plus the exercises of the four B rows MAP names.
- **The chapter-9 journey harness** (registration, rights and purpose evidence, approval and revocation, coverage validation, downstream impact;
  positive / negative / stale / unauthorized-role / cross-tenant / correction / replay; the fault exercise "rights revoked while queued", A9 —
  with D4's proofs re-run end to end) and **the chapter-16 journey harness** (positive and adversarial intake fixtures, the quarantine-escape test,
  reviewer separation, custody verification, downstream non-use; the inspector-unavailable fault → fail closed; the REAL ClamAV engine's clean /
  EICAR / unavailable / failed cases, D2).
- **The exercises** recorded as evidence: the synthetic active-content corpus (DF-03, DP-16-006: the fixtures' PDFs and `.docm`, polyglots and
  bombs generated at run time, EICAR via `eicarTestBytes()` — no live malware), the quarantine-escape exercise (the sandbox cannot write, spawn or
  connect where the launcher denies it; a released item re-inspected), the evidence-restore exercise (a vault blob restored from a backup copy
  on the rehearsal database, digest and custody re-verified), the revocation drill.
- **B107 design acceptance records** ch9 and ch16 (`claim = demonstration`); the rows stay partial → B111's shared path, then H3/R2.
- **The walk** `e2e/phase6-b40.demo.spec.ts` (scenes 1–5, MAP §8), calling `resolveActTarget()` before any login. The catalogue sections for the
  wave-1 components (marked blocks, the `RENDERED` set).
- Harness `phase6-acceptance-b40.test.ts`. No SQL.
