# Phase 6 — Decision Intelligence & Executive OS: implementation record

Branch `phase6-decisions`, from PR #44 at `c5460465aa3c9a551d15ee5f565c8986dd509a55`; plan
`PHASE6_BUILD_PLAN.md` (PR #45), approved 2026-09-08 with the five corrections incorporated before
the first implementation commit. Forward migrations `0041`–`0047`. One consolidated implementation
PR, unmerged behind C15 and FINAL C16/C17 in the recorded merge order. Evidence classes are kept
apart throughout: **harness** (the real PostgreSQL, pipeline and controllers), **browser**, the
**demonstration** (replay / live / synthetic, on a fresh deployment), **CI** at the candidate.

## 0. Freeze record

F1–F8 and §6a rules 1–11 as frozen in the plan at `4f88381`; the owner decisions of §10 (object codes
DPK/APR/BRF/RPL; `decision_authority` distinct from `decision_approver`; named humans and role-at-scope
with a quorum of distinct eligible humans; only the exact `decision.commit` at C3, C4 denied; branch
base; two synthetic personas and the weekly cadence). Nothing preserved by the plan was reopened:
the closed Phase 4, Phase 5, #43 and #44 reviews, the source decisions, cadences and budgets, the
forecast and twin limitations, the deferred automatic `CorrectionApplied` consumer.

## 1. P6-M1 — decision packages (`0041_decision_packages`)

Schema `decision`; seven roles; `DPK@v1` bound to `decision.package.propose`; packages bind to a
`DEC` a strategy owner declared through Phase 3's own port (a package never declares one);
versions are drafts until proposed and immutable after (trigger); options carry typed
consequence citations `{kind, id, version, digest}` resolved by the service under the caller's own
read authority (a run must be completed; an option without a run says why it is unsimulated);
**uncertainty is derived** from the cited objects' own records and never taken from the caller;
one common control baseline is required at proposal; the **choice** (option, the human's rationale,
deadline, accepted trade-offs, a named action owner, measurable outcome criteria with what they are
observed on) is inside the version digest; a new version carries terms and options, never the
choice; dissent is a named human's own append-only act. Dependencies from the `DEC` to the cited
runs and evidence go into `graph.dependencies`, so Phase 3's walk reaches the package.

**Harness** `test/int/phase6-decisions.test.ts` — 15/15: declare boundaries (OBJ refused, unknown
refused, non-human owner refused, approver/authority/executive/agent refused), C3 refused before any
port on every `decision.package.*` action, citations bound by version and digest with the derived
uncertainty, the decision agent's one write and the other roles' refusals, terms/choice/proposal
refusals (author cannot be the only approver), DPK admission and immutability (no direct
UPDATE/DELETE/INSERT after proposal), one common baseline, dissent append-only, version lineage.

## 2. P6-M2 — approvals and the exact C3 commit (`0042_decision_approvals_and_commitment`)

Approvals sign the digest that was read; eligibility is a named principal or a role at scope;
self-approval (author, proposer, owner, action owner) refused; expiry from the policy; revocation is
the approver's own act and moves an approved version back under review when quorum is lost; a live
quorum is recounted at commit. `decision.commit` is the **one** rule above C2 in the bundle: it
matches **exactly**, admits only `decision_authority` at the domain, carries the `human_gate`
obligation (the PEP refuses agents, workloads and non-session assurance with `EYE-WFL-002` before
any capability is minted), and C4 is denied. The commit route **pins** `consequenceClass: 'C3'`
whatever the envelope claims; the port verifies `eye_op_class() = 'C3'` and the bound action in the
authority context, the acting principal, the role at scope, locks the package, refuses a committer
who is an approver, and writes the bounded `CMT` into Phase 3's tables with its dependencies. `APR@v1`.

**Harness** `test/int/phase6-approvals.test.ts` — 11/11 (incl. two authorities committing
concurrently: exactly one succeeds; the human gate at the PEP with denials recorded; expiry ends an
approval and the commit recounts). **Unit** `test/unit/pdp-phase6-authority.test.ts` — 6/6 (exact
match, C2/C4 denied, every other role denied, the PEP is where humanity is decided).

## 3. P6-M3 — Decision Replay (`0043_decision_replay`, `0047_replay_prior_dissent`)

`decision.replay_layers` reconstructs five layers in the database: **known** (evidence the options
and the runs' twin versions cite, `recorded_at ≤ known_at`, event time `≤ observed_through` —
world time applies to `event_time`, never to the collection instant), **believed** (claims,
forecasts, assumptions at their cited versions with the verification they had at `known_at`,
branch states under both clocks, the twin's declared validation), **tested** (the runs' immutable
digests with `completed_at ≤ decided_at`, the twin versions they ran on with their verification as
of `decided_at`, reproduction verdicts `≤ decided_at`), **decided** (version and digest, dissent —
on this version and, from `0047`, on the earlier versions before the decision — approvals,
commitment, the commit's policy decision and audit record), **observed** (strictly after
`decided_at` and at or before the bound `as_of`). History and availability are kept apart: a
corrected cited version stays in its layer; withdrawal, governed deletion and unreadable objects
are reported in `unavailable` beside the content with the reason; the content digest covers the
cut-offs and contents only; the invocation (reader, instant, availability then) is stored beside
it in the `RPL@v1` record. One instant stamps `decided_at`, `committed_at` and the committed event.

**Harness** `test/int/phase6-replay.test.ts` — 5/5: equal content digests for three readers under
the same cut-offs and `as_of`; a correction keeps the cited version, a withdrawal becomes
unavailable; a later reproduction, revocation and walk land under observed; an earlier `as_of`
reproduces the first digest; no earlier-layer item is recorded after the decision.

## 4. P6-M4 — rooms and briefings (`0044_executive_rooms_and_briefings`)

Schema `executive`: rooms (the package owner's; members are named humans; cadence; a review is a
member's act recorded on the room and the package; review overdue is a fact of the clock, said in
words), briefings (`BRF@v1`, append-only) composed deterministically from stored records under the
reader's `known_at` since a **bound** prior: what changed (evidence, claims, runs, branch flips,
warnings, package events, dissent) with truth state, freshness and source state (live / replayed /
degraded / blocked / operator-upload / internal, from the readiness inputs), why it matters through
`graph.dependencies`, who owns it, which window is closing (warning responses, the next review,
approval expiries, the decision deadline) ordered by time left; the content digest over watermark,
items, windows, source states and source records; a narrative is optional, labelled, cites only
included items and sits outside the digest; retrieval enforces room membership at read time.

**Harness** `test/int/phase6-briefings.test.ts` — 6/6.

## 5. P6-M5 — monitoring, outcomes, closure (`0045_decision_monitoring_and_outcomes`)

Breaches: warnings raised after the decision on the version's indicators and branches, recorded
once per condition and warning, routed to the condition's owner with the window, on the package and
the room; review overdue recorded once per due date. The `OUT` is the second and last bounded write
into the strategy graph (`decision.outcome`): by the owner or the action owner, for one criterion of
the approved choice, citing an admitted **observed** twin element of the criterion's unit; the chosen
option being simulated, Phase 5's reconciliation of the chosen run's simulated element against it is
required and cited; nothing overwritten. Closure records the lessons as text on at least one outcome.

**Harness** `test/int/phase6-monitoring.test.ts` — 7/7 (incl. the walk reaching the package's DEC).

## 6. P6-M6 — the three bounded agents (`0046_executive_agents_and_runs`)

Registration is the tenant or platform administrator's: the principal of kind `agent` with the
agent's role is created on the identity authority first, then the registry row with owner,
escalation target, budgets and stop conditions. A run is opened and closed by the agent under its
**own session** (`executive.decision_agent_session_open` — Phase 1's shape; placed in the
`executive` schema so the Phase 0 authority matrix frozen at 0021 stays untouched; `eye_identity`
reaches this one port), with its trigger recorded (operator or scheduler). The decision agent drafts
option cards into a draft; its attempt to propose is refused at the PDP and recorded on the run and
in the audit; approve, dissent and commit are refused at the PDP **and** at the port by principal
kind with the API bypassed. The briefing agent evaluates the room's conditions and composes within
a read budget — a budget hit stops before anything is admitted and escalates to the named human on
the room. The reporting agent renders with SYNTHETIC marks, truth states and attribution and refuses
beyond its clearance. The planner binds a room's cadence to the existing scheduler on its own job
kind and queue (`exec:<t>:<d>:briefing`), reconciled at startup. The workflow contract is read
from the governed events (`executive.workflow_of`).

**Harness** `test/int/phase6-agents.test.ts` — 9/9 (real Redis for the promoted tick).

## 7. P6-M7 — workspaces, Act VI, browser

**Decisions** and **Briefings** workspaces (`apps/web/app/decisions`, client `apps/web/lib/decisions.ts`),
linked from every shell; states in words, `SYNTHETIC` on every simulated consequence, uncertainty in
words, the choice, dissent across every version, approvals with their standing, the C3 commitment,
breaches and outcomes, Replay with the five layers, cut-offs and unavailable artefacts; rooms with
members, cadence and review overdue in words; briefings with source states, windows ordered by time
left, agent-produced marked, narrative labelled. Receipts only from authoritative responses.

### 7.1 The demonstration — a FRESH deployment (2026-09-09)

Acts I–V were replayed on a **new** `eye_demo` after the repository's own virgin procedure
(`scripts/demo.sh`: fresh containers, regenerated local secret handoff, migrations, audited bootstrap,
acceptance **58/58**), then `scripts/phase6/seed-decisions.mjs` — Act VI, **0 problems** (transcript
in the run log): two synthetic personas created by the platform administrator (L. Brandt, decision
owner; S. Okafor, executive approver); the DEC *January corridor collapse — response* declared by
J. Weber through Phase 3's route; act V's control and four interventions on it; the three agents
registered; the decision agent drafted five option cards and its proposal was refused (`EYE-AUT-001`,
recorded on its run); the owner carded *wait* (unsimulated), set the terms and the choice and
proposed; M. Dvořák dissented; the owner's own approval was refused (403, audited); S. Okafor
approved version 1; the choice changed to *draw-down + reroute* → version 2, fresh approval;
L. Brandt committed under `decision.commit` at **C3** (the envelope claimed C2; the route pinned C3);
a second commit refused naming the first; the room with weekly cadence; the briefing agent composed
the room's briefing (272 items since no prior; sources: EU sanctions live, World Bank live, GDELT
replayed, PortWatch blocked, ECB degraded, NORDWERK/Comtrade/advisories operator-upload); after the
commitment the separately identified synthetic upload `outcomes-2024Q1.csv` (document time
2024-04-10, recorded now), the chosen run's exact output (0 line-stop days) as a simulated element,
the plant's actual 3 days as an observed element established from the record, Phase 5's
reconciliation, the `OUT` (target ≤ 0: **not met**); the replay by S. Okafor and by M. Dvořák: same
content digest, different invocation records; the reporting agent's render.

Disclosed deviations in the seed: (a) Phase 0 has no governed route that binds a **second** role to
an existing human and Phase 0 is frozen, so the owner's `decision_authority`, the approver's
`executive` and the observer's `executive` are bound by the administrator through the database
controller (as the harness fixtures bind roles) — the seed prints it; (b) a commit through an agent
session and a C4 envelope are refused in the harness, not attempted through the API (no agent token
exists outside the product); (c) the ECB live backfill hit the publisher's egress timeout on every
attempt today (`data-api.ecb.europa.eu` answered nothing in 40 s from this machine) — the ECB source
is active at contract v2 with **no live evidence** in this fresh run, which is why its source state
reads *degraded* and why one pre-existing Phase 4 browser check fails (§7.2).

### 7.2 Browser

`npx playwright test -c playwright.demo.config.ts` (installed Chrome, against the fresh
demonstration): Phase 6 spec **3/3** (`evidence/phase6-browser/13-decisions.png`, `14-replay.png`,
`15-briefings.png`); the Phase 4/5 spec **11/12** — the one failure is *overview counts validated
forecasts by both modes*, which expects the ECB forecast's retrospective validation and therefore the
ECB backfill that could not be collected today (external; not a Phase 6 change). Two Phase 6 defects
were found by the browser and fixed: the room object code `ROOM` did not fit the envelope contract's
three-letter code (now `DRM`), and the seven Phase 6 roles were missing from `identity.self.read`
(the shell resolves scope from the server's answer about who you are; the same class of defect
Phase 3's Graph shell had found).

## 8. Regression at the candidate (local)

| Check | Result |
|---|---|
| Unit (`apps/api` `pnpm test`) | 39 files, 2136 passed; hermetic meta 9 passed |
| Integration `test:int:all` (phases 1–6) | 41 files, **739 passed** |
| Phase 0 acceptance (fresh stack, in `demo.sh`) | 58/58 |
| Post-C18 upgrade check (`verify-0022-upgrade.mjs`) | PASS — virgin database migrated from empty (47 files), schema digests match, Phase 1–2 suites on upgraded data 274/274 |
| Module boundaries (`pnpm boundaries`) | no violations (475 modules) |
| gitleaks over the branch's commits | no leaks |
| Web typecheck and build | clean; `/decisions`, `/decisions/briefings` |

**CI at the candidate `f702c532`** (reported apart from the local checks above): run
34323205261 — `build-test` **success**, `browser-regression` **success**, `supply-chain` **failure at
C15** (the tracked pinned-runner gate; independent of this branch, red since the util-linux CVEs of
#39) with the FINAL C16/C17 steps **skipped** behind it (patched-image recheck, target-resolved
closure, manifests, licence inventory, CycloneDX validation, evidence archive); run 34323205274 —
`C19 lifecycle` **success** (lifecycle on ubuntu and macOS, foreign-checkout pinning, delivery-chain
dry run). The runnable checks are green; the FINAL steps are not run, not passed.

## 9. An incident during M7, recorded plainly

The first Phase 6 commit had picked up a `.eye-local` **symlink** from a worktree (the ignore
pattern `.eye-local/` covers the directory, not a symlink of that name). Checking the branch out in
the main tree then replaced the real local credential and vault directory with that symlink, and the
ignored contents — the generated secret handoff and the evidence vault of the previous
demonstration — were gone (no local snapshot held them). Consequences: the branch history was
rewritten before push so no commit tracks the path, `.gitignore` now also ignores a symlink of that
name, and the demonstration deployment was rebuilt **virgin** through the repository's own procedure
(regenerated handoff, fresh databases, acts I–VI replayed). The observed state of the previous
demonstration (including the live scheduled-collection ticks recorded in `SCHEDULED_COLLECTION.md`)
stands as recorded at its commits; it no longer exists on this machine.

## 10. Deviations from the plan's letter, each bounded

- `identity.decision_agent_session_open` is `executive.decision_agent_session_open` (same shape;
  the Phase 0 schemas are frozen by the C14 matrix at 0021).
- The plan's `packages` impact bucket is realised through the existing `decisions` bucket: a package
  is reached through its `DEC`, which rests on the cited runs and evidence.
- The Model Gateway is not called for a narrative; the narrative contract (labelled, cites only
  included items, outside the content digest) is in place and takes text from a human or an agent.
- "Series points" in the known layer are covered by the evidence versions the series were assembled
  from; point-level replay is not separately enumerated.
- A refused commit rolls its transaction back, so the refusal is the PDP denial and audit record,
  not a package event.
- Room object code `DRM` (envelope codes are three letters).

## 11. The review of PR #46 at `09abd095` — reproduced at the harness, then corrected (NOT recorded as closed)

Codex's review executed the services and the PDP with doubles and inspected the SQL without executing
it: fifteen correctness expectations failed, seven controls passed. This pass reproduced every
database consequence through the existing database, controller, identity and Redis harness BEFORE
changing anything (`test/int/phase6-review-corrections.test.ts`, 25 cases, one per consequence with
its positive control), then corrected them with one forward migration, `0048_phase6_review_corrections`
(0041–0047 untouched), and the services. The suite is kept as the regression. Evidence classes stay
apart: §11.1 is the harness before and after, §11.2 the refutations found at the boundary, §11.3
the other checks, §11.4 CI at the exact head, §11.5 what remains.

### 11.1 Reproduction before, correction after

Against the reviewed head (migrations through 0047, services at `09abd095`) the suite ran twice:
first 7 of 7 cases of items 1–2 failed as expected and the fixtures of items 3–7 needed two
corrections of their own (recorded in §11.2); then **25 of 25 failed**, each on the assertion that
names the consequence. Against the corrected head **25 of 25 pass**.

| # | Consequence reproduced (the failing assertion before) | Correction (0048 + services) |
|---|---|---|
| 1 | `decision.live_approvals` counted a role-based approval after the approver's `decision_approver` binding was revoked (`'1'` where `'0'` was expected); `holds_role` said `true` for a revoked `decision_authority` binding; the package's displayed standing said `live` | `approver_eligibility` and `holds_role` read only bindings with `revoked_at IS NULL`; the package view marks `live` from the port's own recount, never a local re-derivation; the web says "the approver is no longer eligible" |
| 2 | `set_option` accepted an EVD recorded after the version's `known_at`, an EVD whose event fell after `observed_through`, a foreign digest, a citation naming a record of another type, a run on a twin version opened after `known_at`; it stored the caller's `{"made_up": true}` uncertainty and `public` controls | `set_option` is dropped and recreated (returns jsonb): each citation must be a recorded object of its kind at the version and digest recorded, by `known_at` and `observed_through`; a cited run must be completed and rest on inputs (its twin version's `known_at`/`observed_through`) that obey the cut-offs — it may complete after `known_at`; uncertainty (method `derived-at-port@2`, the run's `sensitivity.factors` and relative, `outside_envelope`, `validation_status`, `inherited_validation`, the twin's validation), controls (`decision.fold_controls`) and synthetic state are derived by the port; the service returns what the port derived |
| 3 | APR and CMT headers carried `internal`/null over a version folded to `confidential` with a licence; RPL carried null rights; a briefing over a warning-only interval folded to `internal`/`false` | APR and CMT inherit the version's fold; RPL folds the version and the known layer; OUT folds the observed element and the version; BRF folds every item — EVD/CLM, the SIM record of each run, the WRN record of each warning, the scenario's FCT for a flip, the package's fold for its events — and the room's package |
| 4 | a domain analyst member read a room briefing under purpose `research`; read a briefing folded to `confidential`; listed it; read the confidential package; a non-member analyst replayed a package with a room | `decision/clearance.ts`: clearance from role bindings (administrators/auditor restricted; executive, owner, authority, domain admin confidential; others internal); briefing get/list, replay and package get require membership where a room exists, the purpose the record was admitted for (its header's `purpose_scope`) and a covering clearance; briefing get returns `availability.unavailable` (withdrawn, deleted, not accessible, above clearance) beside the unchanged content; agent run outputs are withheld from readers whose clearance does not cover the run's package |
| 5 | a warning raised after a briefing's `known_at` was one of its windows; a later acknowledgement, health verdict and review changed the earlier digest; the next briefing used the prior's `composed_at` and skipped a review recorded after the prior's `known_at`; the replay's observed warning changed state after an acknowledgement | warnings, their state (from `prediction.warning_events`), the room's next review (from `room_events`), the approvals that stood and the version open to approval (from `package_events`), source health and attempts are all read AS OF `known_at`; the interval is `(prior.known_at, known_at]` with `prior_known_at` in the watermark and checked by `compose_briefing`; `replay_layers` reads warning state and OUT status as of `as_of` (`decision.warning_state_as_of`, `decision.strategy_status_as_of`), the OUT's title from its immutable canonical record |
| 6 | `record_outcome` accepted a same-unit travel-days element for the line-stop criterion, an element on another twin, a period ending after the criterion's date, an observation known before the decision | `set_choice` requires `observed_on = twin:<element key>`; `record_outcome` binds the element to the criterion's `observed_on`, the twin to the twins the version's options ran on, the period (`valid_to` ≤ `by`), and the chronology (the twin version's `known_at` and the cited evidence's `recorded_at` after `decided_at`); a legitimate reconciliation of a different same-unit output records that other criterion and no other |
| 7 | no scheduler-triggered run closed on a cold process (`systemReaderCache` empty → 409); the startup reconciliation scheduled nothing; a reporting agent with `max_reads=0` finished with a full report and `reads=0`; the decision agent read before checking; the monitor task evaluated beyond its budget; elapsed exhaustion was checked after the work; a stop condition `when_the_moon_is_full` was accepted | `executive.decision_agent_run_open` reads the registration itself under the identity-operation capability and returns it (no reader is borrowed; `setSystemReader` is gone); `executive.briefings_to_reconcile()` asserts the schedule capability the worker already holds, because under it every RLS table hid the rooms; a `Meter` checks reads and elapsed time BEFORE each unit of work on every task; `max_items` and `on_degraded` are the supported stop conditions, validated at registration (service and port), evaluated before admission, recorded and escalated |

### 11.2 Refutations and fixture findings at the boundary

- **Item 1, partial refutation.** Phase 0's boundary bumps a principal's revocation epoch on any
  change to their role bindings, so the revoked person's own sessions are refused at once
  (`authority epoch changed`): a revoked authority cannot commit even before 0048 (the harness
  shows 403 at the pipeline; the port's `holds_role` is exercised directly and now says `false`).
  What the boundary did NOT prevent — and 0048 corrects — is the revoked approver's earlier approval
  still counting when another authority commits.
- **Item 3, OUT synthetic flag**: as Codex noted, it worked; no defect was invented. The OUT now also
  folds the element's and the version's rights, residency, retention and access policy.
- **Fixture findings, recorded plainly**: the first reproduction run stalled after item 1 because the
  fixture revoked and restored a shared approver's binding, and the epoch bump invalidated that
  approver's session for the rest of the file — the probes now use principals of their own; the
  item 6 fixture named a record locator absent from its CSV. Both are fixture corrections, not
  product ones.
- **A defect the review did not name**: the planner's startup reconciliation could never schedule a
  room. It read `executive.rooms_current` under the schedule capability, which carries no tenant, so
  FORCE-RLS hid every row; the 9/9 of `phase6-agents` had scheduled through a human's `/schedule` call.
  `executive.briefings_to_reconcile()` (0048) is the port the worker reads through now; COLD START and
  RESTART in the suite prove a scheduler-triggered run finishing with no human trigger in the process.

### 11.3 The other checks (separate evidence classes)

| Check (class) | Result at the corrected head |
|---|---|
| **Harness** — `phase6-review-corrections` (database, controller, identity path, real Redis) | reviewed head: 25/25 fail on the naming assertion (`evidence` of the two runs kept beside this report's git history); corrected head: **25/25 pass** |
| **Harness** — Phase 6 suites in one invocation (`phase6-review-corrections`, `decisions`, `approvals`, `replay`, `briefings`, `monitoring`, `agents`) | 7 files, 78 cases: 75 passed and 3 in `phase6-agents` that named the OLD session shape (the port now returns the registration; the composer's method is `briefing-composer@1.1.0`) — adapted and re-run: **`phase6-agents` 9/9** |
| **Harness** — `test:int:all`, phases 0–6 (the final regression, one invocation) | **42 files, 764 passed** |
| **Unit** (`pnpm test`, no database) | 39 files: 2135 passed and 1 failed in `test/gate/source-anchored-reconstruction.test.ts` — the C16 frozen-verifier probe computes the checkout's source digest and the working tree was dirty at that instant ("C15 scanned a DIFFERENT candidate … 943 files / 115319773B vs 115320778B"); re-run on the committed tree `8f05497`: **75/75 passed**. Hermetic meta unchanged. |
| **Web** typecheck and `next build` | clean (`/decisions`, `/decisions/briefings`) |
| Module boundaries (`pnpm boundaries`) | no violations (476 modules) |
| gitleaks over the working tree | no leaks |
| Post-C18 upgrade check (`verify-0022-upgrade.mjs`, virgin database migrated from empty through 0048) | **PASS** — virgin database migrated from empty (48 files), schema digests match exactly, Phase 0 suite 297/297 before and after, Phase 1–2 suites on upgraded data 274/274; the ledger gains the 27th declared line |
| **Browser** — Phase 6 spec on the rebuilt deployment after 0048 and a restart (`evidence/phase6-browser`, refreshed) | 3/3 (decisions, replay with its five layers, briefings) |
| **Browser** — Phase 4/5 spec, preserved | 11/12: the ECB retrospective-validation case still fails — the ECB publisher has answered nothing from this machine today (§7.2); not verified, not waived |
| **Deployment** (`eye_demo`, historical records kept; the API restarted from the corrected build) | the fresh process reconciled **1/1** room briefing cadence at startup and a **scheduler-triggered** run finished at 10:43:00 UTC with no human trigger (before 0048 the startup reconciliation saw no room); a replay of the Act VI package: M. Dvořák (member, purpose `decision`) 201; J. Weber (reader role, not a member) 403 "read by the room's members"; T. Nakamura (member, purpose `research`) 403 "read under the purpose it was admitted for (decision)" |

The demonstration's records are historical: the Act VI package, its APR/CMT/RPL/OUT/BRF records
and its agent registrations were admitted under 0041–0047 and keep their digests; new records on
the same deployment are admitted under 0048. The seed now registers agents with the supported stop
condition `{ kind: 'on_degraded' }` (its earlier free-text conditions were never evaluated).

### 11.4 CI at the exact head

At the code head `8f05497` (this section and the PR body were committed after it — the head CI
is reported in the PR body for the exact final SHA): run 34342116138 — `build-test` **success**
(unit + `test:int:all` on the tracked runner), `browser-regression` **success**, `supply-chain`
**failure at C15** (the tracked pinned-runner gate, red since the util-linux CVEs of #39,
independent of this branch) with the FINAL C16/C17 steps **skipped** behind it (patched-image
recheck, target-resolved closure, manifests, licence inventory, CycloneDX validation, evidence
archive); run 34342116203 — `C19 lifecycle` **success** (ubuntu and macOS, foreign-checkout
pinning, delivery-chain dry run). The runnable checks are green; the FINAL steps are not run, not
passed; no waiver, no bypass.

### 11.5 What remains (not closed)

- The approver-expiry windows of a HISTORICAL briefing count approvals as they stood at `known_at`
  by decision, revocation, expiry and digest; the approver's ELIGIBILITY at that past instant is not
  reconstructed (role bindings carry no history beyond `revoked_at`), so a binding revoked after
  `known_at` still shows the approval standing then — correct — while one revoked before `known_at`
  is judged by the port's current recount only at composition under a current `known_at`.
- Source states in a historical briefing use the contracts active NOW with the health verdicts and
  attempts recorded by `known_at`; a contract superseded since is not reconstructed.
- A stored briefing's `availability.unavailable` covers evidence and claims it cites (withdrawn,
  deleted, not readable, above the reader's clearance); runs and warnings are not availability-checked.
- Clearance is derived from role bindings (administrators and the auditor restricted; executives,
  owners, authorities and domain administrators confidential; every other reader internal); the
  plan names no finer model, and none was invented.
- Stop conditions are `max_items` and `on_degraded`; `on_refusal` is not implemented (the decision
  agent's refused proposal is its contract, not a stop).
- This review is **not** recorded as closed; C15 and FINAL C16/C17 stay blocking; the ECB-dependent
  browser case stays failed until verified.

## 12. The residual review at `9aaf0311` — six paths reproduced at the harness, then corrected (review still OPEN)

The independent correction review of 9 September 2026 kept the functional review open with six
residual requirement groups (R2–R7 of the original review). Codex's evidence was 28 service/PDP
probes with explicit doubles (13 expectations failing, 15 controls passing) and SQL inspection;
none of it executed PostgreSQL, Redis, HTTP or a browser. This pass reproduced each residual through
the real database, controller, identity and Redis harness BEFORE changing product code
(`test/int/phase6-residual-corrections.test.ts`, 19 cases with positive controls), corrected them
with one forward migration, `0049_phase6_residual_corrections` (0041–0048 untouched), and the
services, and kept the suite as the regression. Evidence classes stay apart (§12.3).

### 12.1 Reproduction before, correction after

Against the reviewed head (services at `9aaf0311`, migrations through 0048) **19 of 19 cases failed
on the assertion naming the consequence** — 18 in one run, and the elapsed-deadline case in a second
run once its budget let the composition start (§12.2). Against the corrected head **19 of 19 pass**;
the earlier corrections suite (25 cases) and the whole Phase 6 set pass with it.

| Path | Consequence reproduced (the failing assertion before) | Correction (0049 + services) |
|---|---|---|
| R2 carried options | a carry into a version with an earlier `observed_through` or `known_at` copied a 16 January citation unexamined (open succeeded); an option row placed in a draft outside the port was proposed | `decision.derive_option` is the ONE derivation (identity, digest, both cut-offs, the run's own cut-offs, uncertainty, controls, synthetic state); `set_option` calls it; `open_version` re-derives every carried option under the RECEIVING version's cut-offs and refuses the carry that cannot enter them; `propose_version` revalidates every option before the digest |
| R3 inherited restrictions | an older warning whose window was still open was shown without being a source or contributing its controls; the replay named no contributors and its RPL ignored the observed layer | a window's warning is a cited source and its WRN controls enter the fold whatever its age; `decision.replay_contributors` names every contributor of every layer (known EVD, believed CLM/FCT/ASU/WRN, tested SIM, the decided DPK, observed later versions, OUT and WRN) with the controls its canonical record carries; the RPL folds them all; an unresolved contributor fails closed |
| R4 read authorization | a tenant-scoped analyst who owned decisions in another domain read a confidential briefing here; the package list returned a package the detail view refused; a report rendered under the wrong purpose and for a non-member; a same-domain executive outside a room read a stored agent output; planner metadata and runs were process-wide; availability ignored governed deletion and run/warning sources | `clearanceOf(principal, target)` counts only bindings that reach the target context (the PDP's own rule); the package list is filtered by clearance and admitted purpose; `renderReport` checks the admitted purpose and (for a human) the room's membership; stored outputs are withheld from non-members; the planner's reconciliation and recent runs are scoped by tenant and domain; availability reports governed-deleted blobs (`observation.blob_tombstones`), unreadable runs and warnings, with counts of what was checked |
| R5 historical truth | a later contract version and a later-completed attempt changed an earlier briefing's digest; a binding revoked after the cut-off removed an approval that stood then | source states use the contract versions ACTIVE AT `known_at` from `observation.source_contract_events`, and attempts by the instant their outcome became known (`finished_at`); `decision.approver_eligibility_as_of` / `live_approvals_as_of` reconstruct eligibility at the cut-off (binding created by then, not revoked by then) |
| R6 outcome binding | a choice accepted criteria without a twin or an interval; an all-unsimulated decision recorded an outcome from an unrelated twin; a one-day aggregate satisfied a horizon criterion | `set_choice` requires `twin_id` (a twin of the domain) and `period {from, to}` (ending by `by`) on every criterion — both inside the signed choice; `record_outcome` binds the twin to the criterion's, and the observation's period must cover the criterion's interval; choices admitted before 0049 keep the 0048 rules |
| R7 agent limits | composition fetched evidence before comparing its source count to the allowance; an 80 ms budget admitted a BRF and only then marked the run stopped; a decision agent with `max_items` wrote both cards; a reporting agent accepted `max_items` | the meter is propagated INTO composition: a read unit is reserved before every query family and the deadline checked with it and again before admission; the decision draft applies `max_items` before writing; registration accepts a condition only for the kinds whose task enforces it (`max_items`: decision, briefing; `on_degraded`: briefing) — service and port |

### 12.2 Refutations and guards found at the boundary

- **R4b, partial.** Phase 0's binding trigger refuses a DOMAIN principal any binding outside its
  home domain, so the review's construction (a domain analyst holding `decision_owner` elsewhere)
  cannot exist for a domain principal. It CAN for a tenant-scoped person holding domain bindings in
  several domains — that path was reproduced and is what `clearanceOf(principal, target)` corrects.
- **R7b, partial.** With a 3 ms budget the outer meter refuses the composition before it starts (no
  briefing admitted) — a guard the review's probe bypassed. The consequence begins inside the
  composition: with 80 ms the reviewed head admitted the BRF and marked the run stopped afterwards
  (reproduced); the deadline is now checked inside composition and before admission on either path.
- **R6b, one sub-case.** An aggregate whose window ended two months before the version's world
  cut-off is refused by the twin's own health rule (`stale`) before the period check runs — a guard,
  recorded; the one-day and late-start windows reach the period check and are refused by it.
- **R7 elapsed, deterministic form.** The harness has no controlled clock; the case names the budget
  (80 ms here) that lets the room read and the evaluation pass and the composition overrun. The
  corrected expectation — no briefing admitted, the run stopped — holds on either path.

### 12.3 The other checks (separate evidence classes)

| Check (class) | Result at the corrected head |
|---|---|
| **Harness** — `phase6-residual-corrections` (database, controller, identity path, real Redis; a second domain of the tenant through the tenancy route) | reviewed head: **19/19 fail** on the naming assertion (18 in one run; the elapsed case in a second run with an 80 ms budget); corrected head: **19/19 pass** |
| **Harness** — `phase6-review-corrections` (the 25 cases of §11) | 25/25 pass (its authorization fixture now acknowledges the open windows before the prior is composed, because an open window's warning contributes its controls — the corrected behaviour) |
| **Harness** — the eight Phase 6 suites in one invocation | 97 cases, 93 passed and 4 skipped behind that fixture; after the fixture correction the suite runs 25/25 |
| **Harness** — `test:int:all`, phases 0–6 (the final regression, one invocation) | **43 files, 783 passed** |
| **Unit** (`pnpm test`, no database) | 39 files, **2136 passed**; hermetic meta 9 passed |
| **Web** typecheck and `next build` | clean (the Decisions page shows a criterion's bound twin and interval) |
| Module boundaries (`pnpm boundaries`) | no violations (476 modules) |
| gitleaks over the working tree | no leaks |
| Post-C18 upgrade check (`verify-0022-upgrade.mjs`, virgin database migrated from empty through 0049) | **PASS** — virgin database migrated from empty (49 files), schema digests match exactly, Phase 0 suite 297/297 before and after, Phase 1–2 suites on upgraded data 274/274; the ledger gains the 28th declared line |
| **Browser** — Phase 6 spec on the rebuilt deployment after 0049 and a restart from the corrected build | 3/3 |
| **Browser** — Phase 4/5 spec, preserved | 11/12: the ECB retrospective-validation case still fails (publisher unreachable from this machine today); not verified, not waived |
| **Deployment** (`eye_demo`, historical records kept) | 0049 applied; the API restarted from the corrected build and reconciled 1/1 room briefing cadence at startup; the replay probe after 0049: M. Dvořák (member, purpose `decision`) 201; J. Weber (reader role, not a member) 403 "read by the room's members"; T. Nakamura (member, purpose `research`) 403 "read under the purpose it was admitted for (decision)"; the seed now binds `twin_id` and `period` in its criterion and registers agents with `{ kind: 'on_degraded' }` |

The demonstration's Act VI records were admitted under 0041–0047/0048 and keep their digests and
their choice (no `twin_id`/`period`): `record_outcome` keeps the 0048 rules for such choices. New
records on the same deployment are admitted under 0049.

### 12.3a The maintenance commit after the correction pass (dependencies and the C17 inventory)

The residual review asked that every current C15 finding be addressed, not only the images. On the
corrected head the dependency findings were remediated as their own commit (`FULL_PRODUCT_DELIVERY_REGISTER.md`
§4.1): `next` 16.3.3, `sharp` 0.35.4 and `multer` 2.3.0 as exact reviewed overrides, `vitest` 4.1.11,
and — because the sharp fix ships libvips 8.18.6 — the C17 bundled native stack moved from
`@img/sharp-libvips-linux-x64` 1.3.2 to 1.3.3 with its contract, legal-file table, manifest, vendored
texts and source-offer record (thirteen re-versioned libraries; only libffi's licence text changed
upstream). One product change rides with it: a run that completes its last unit inside the deadline
is `finished`; a stopped label was never written after a committed admission again (the CI runner
reached the elapsed case's admission inside 80 ms, which the harness now accepts on either path).

| Check (class) at the maintenance head | Result |
|---|---|
| `pnpm audit --audit-level high` on the remediated closure | no known vulnerabilities (the two moderate vitest advisories were remediated too) |
| `trivy fs` (HIGH,CRITICAL, no ignore file) | 0 findings in `pnpm-lock.yaml` |
| C17 licence gate, local (`licence-obligations.mjs`) | PASS — 203 production / 320 development classified, 0 unresolved; bundled stack 29 components, 9 source offers |
| C17 gate unit files (`c17-bundled-stack`, `c17-host-independence`, `c17-licence-governance`, `c17-evidence-package`) | 4 files, 147 passed |
| **Harness** — `phase6-residual-corrections` | 19/19 |
| **Harness** — `test:int:all` | 43 files, 783 passed |
| **Unit** (`pnpm test`) | 39 files, 2136 passed; hermetic meta 9 passed |
| Post-C18 upgrade check | PASS — virgin database through 0049 (49 files), digests match, 297/297 and 274/274 |
| Web build; boundaries; gitleaks | clean; no violations (476 modules); no leaks |
| **Browser** — Phase 6 spec on the deployment restarted from this build | 3/3; the Phase 4/5 spec stays 11/12 (ECB) |
| Base images | today's registry digests of `postgres:18-alpine` and `redis:8-alpine` still carry util-linux 2.42.1-r0 / 2.41.4-r0 (trivy 0.73.0, local); resource request R-3 in the register |

### 12.4 CI at the exact head

Three heads carry this pass; each is reported for itself.

- **`c93d190`** (the residual corrections and the register): run 34387275430 — `browser-regression`
  **success**; `build-test` **failure** at the integration step on one case only,
  `phase6-residual-corrections > R7 elapsed`: the runner reached the composition's admission inside
  the 80 ms budget and the reviewed code then marked the run stopped after the committed write — the
  R7b consequence in its other form, corrected in the next head (a finished last unit stays
  `finished`; the case accepts either path); `supply-chain` **failure at C15** with the FINAL C16/C17
  steps skipped; run 34387275344 — `C19 lifecycle`: the macOS job failed once on its "deliberate
  evasion is outside the claimed boundary" probe (nothing in this branch touches C19; the probe
  asserts a documented boundary) and **succeeded on re-run** with every job green.
- **`038fa9f`** (the C15 dependency remediation, the C17 inventory move, the run-outcome correction):
  run 34389478503 — `browser-regression` **success**; `build-test`: unit, acceptance and the whole
  integration suite **passed**, then the C18 dual-path gate refused to start on a dirty worktree —
  `apps/web/next-env.d.ts`, which next 16.3.3 regenerates with one more type import during the web
  build; the regenerated file is committed in the head that follows; `supply-chain` **failure at
  C15 on the image findings alone** — `pnpm-audit-human`, `pnpm-audit-json`, `trivy-fs`,
  `trivy-fs-json`, both gitleaks steps and both image scans report `[ok]`, and the thirteen
  UNGOVERNED rows are the util-linux CVEs in the pinned postgres and redis images (register §4,
  R-3); run 34389478506 — `C19 lifecycle` **success**.
- The docs head that carries this section and the regenerated type file is reported in the PR
  body with its own run ids.

No waiver, no bypass: C15 and FINAL C16/C17 stay blocking.

### 12.5 What remains (not closed)

- The atomic requirements audit and the security maintenance track are recorded in
  `FULL_PRODUCT_DELIVERY_REGISTER.md` (§4, §5, §8): the util-linux findings are not remediable by
  re-pinning today (the registry's current `postgres:18-alpine` and `redis:8-alpine` carry the same
  package versions — scanned locally with trivy 0.73.0); the dependency findings (next, sharp,
  multer) are remediable now and are handled as their own commit after this one.
- Historical briefings reconstruct contract activity, attempt completion, warning state, review
  cadence, approvals and eligibility from durable events; a principal's `status` history (active
  then disabled) is not recorded, so eligibility-as-of assumes the principal's kind and tenant only.
- Availability now checks evidence, claims, runs and warnings a snapshot cites; branch and package
  contributors are not availability-checked (they carry no lifecycle of their own).
- Decision-completeness items from the broader review (conditional approvals, case-bound
  decision-agent simulation selection) are open in the register, not resolved here.
- This review is **not** recorded as closed; C15 and FINAL C16/C17 stay blocking; the ECB-dependent
  browser case stays failed until verified.

## 13. The review at `07edd9dc` — five residual paths reproduced at the harness, then corrected (review still OPEN)

The independent review of PR #46 at `07edd9dc` (`audit/reviews/The_Eye_PR46_Review_07edd9dc_and_Next_Steps.txt`)
preserved the corrections of §11 and §12 (21 passing preservation checks in its own service/PDP
harness with doubles, and R2's carried-option correction accepted by SQL inspection) and named five
residual paths. Its evidence is service-with-doubles and SQL inspection; every consequence below was
established here at the real database/controller/identity/Redis harness before any change, in
`apps/api/test/int/phase6-residual-corrections-2.test.ts` (10 cases, each with its positive control),
and the same cases are the regression afterwards. One forward migration,
`0050_phase6_residual_corrections_2.sql` (0041–0049 untouched), and the services correct them.

### 13.1 Reproduction before, correction after

Against the reviewed tree (services at `07edd9dc`, migrations through 0049) **8 of 10 cases failed on
the assertion naming the consequence**; the two that passed before any change are recorded in §13.2.
Against the corrected tree **10 of 10 pass**.

| Path | Consequence reproduced at the harness (the failing assertion before) | Correction (0050 + services) |
|---|---|---|
| R7c the reporting agent's nested renderer | with a 1 ms elapsed budget the outer reservation passed and the renderer then ran its seven query families after the deadline: the run closed `finished`, `over_budget: 1`, with the full report in its outputs | the agent's meter goes INTO `renderReport`: a read is reserved before every query family (the package, its admitted purpose, the membership, the version, the options, the dissent, the approvals, the decision), so nothing starts after the deadline; the run stops, records the family it stopped before, escalates, and carries no report; a read budget short of the render stops at the family it cannot afford |
| R6b a superset aggregate period | an all-unsimulated choice bound to March (2024-03-11..04-10, cost ≤ 100); a complete, admitted observation over the quarter (01-11..04-10, cost 150) ending at the twin's cut-off and the criterion's `by` passed every upstream guard and was recorded as March's outcome (`met: false`) | `record_outcome` requires the observation's period to BE the criterion's interval (`valid_from = from AND valid_to = to`); a shorter or a longer period is refused with both periods named; no derivation from a superset is attempted; choices admitted before 0049 keep the 0048 rules |
| R4a the composition response | a member executive (confidential) composed a room briefing whose fold was restricted (restricted evidence in the window): the BRF was admitted and its full content returned to the executive, while the stored BRF refused that same reader | `BriefingService.compose` receives the human composer's clearance in the target context and refuses BEFORE admission when it does not cover the fold, returning the classification alone; the stored snapshot is governed by the same rule; an agent's composition is not a human response (its outward paths are R4b/R4c) |
| R4b stored agent outputs under purpose | a reporting agent's stored report was listed in full to a room member under the purpose `research` | every run output carries `provenance` (`purpose`, `package_id`, `room_id`, `classification`, `contributors`); the list applies ONE content-read decision per run (`AgentsService.redactRun`): clearance in the target context, the purpose the output was produced for, current room membership — withheld outputs carry the reason and the provenance, nothing else; runs closed before provenance existed are judged from the package they name |
| R4c the operator's trigger response | an executive (confidential) refused the restricted package's direct report could trigger a reporting agent cleared for restricted work and received the full report in the run response; a non-member owner received a room's report the same way | the controller records the operator's governed read of the run (`agent.read` on the RUN) and returns the run's metadata with the outputs `redactRun` admits for THAT operator; the agent's own work, its stored output and the scheduled path are unchanged |
| R3c reconciliation contributors | a reconciliation of the chosen run against a later RESTRICTED observation appeared in the observed layer of a replay read by an internal analyst and by a confidential executive; the RPL folded below restricted; neither side of the reconciliation was a contributor | `decision.replay_contributors` names, for every reconciliation the observed layer shows, both twin versions (exact `from_version`/`against_version`), the run the simulated side cites and the evidence/claims the observed side cites, each with the controls its canonical record carries; a reconciliation whose record cannot be found is an unresolved contributor (fails closed); the reader's clearance is asserted against the complete fold before anything is admitted |
| R5c historical rights | a rights withdrawal recorded AFTER a briefing's cut-off turned that briefing's source from `live` to `blocked` and changed its content digest on recomposition | source states as of `known_at` reconstruct the reuse rights from the recorded rights events (the registration and every rights update by then); `unknown` when the record cannot establish them (blocked); a contract active at the prior's cut-off and suspended by `known_at` is listed blocked with the withdrawal named, so a withdrawal inside the interval is represented there; the withdrawal is enforced NOW on the stored snapshot's availability (`kind: 'source'`, rights withdrawn) apart from the unchanged content; a later confirmation rewrites nothing |

### 13.2 Passing before any change, and fixture findings

- **R3, the as-of control.** A replay with `as_of` just before the reconciliation was recorded shows no
  reconciliation and folds no restriction from it — true on the reviewed head too (a positive control,
  not a reproduction). Note: `decided_at` serialised to the millisecond is BEFORE the decision's own
  microsecond instant, so an as-of "at the decision" is refused by the port; the control uses the instant
  before the reconciliation.
- **R5, the interval case in its first form** passed vacuously on the reviewed head: a contract suspended
  by the withdrawal was simply absent from the source states at the later cut-off. The corrected form
  composes since the prior and requires the source to be listed and blocked; that form fails on the
  reviewed head for the same reason as R5c and passes on the corrected tree.
- **The tenant administrator cannot compose.** `briefing.compose` is the executive's, the owner's or the
  briefing agent's; the covering composer of the positive controls is the tenant administrator holding
  the domain's `executive` role as an extra DOMAIN binding (the borrowing path §12.2 records).
- **Restricted evidence** enters the harness through a second upload source registered under a
  `restricted` classification ceiling (`Phase4Harness.upload(files, 'restricted')`, a helper extension);
  the TWN admitted from it folds to restricted, which is what the R3 and R4 paths need.
- **The 1 ms report budget** is deterministic in effect: the meter's first reservation is made at its
  first instant; every later query family lies beyond the deadline. When the millisecond turns before the
  first reservation the outer guard refuses (the path already in place); the case repeats the run in
  that event and asserts the corrected outcome on the run that reached the renderer.
- **The pass-1 control of §11 (a report is one metered read)** now expects seven metered families
  and adds a short-budget stop; that is the corrected behaviour, recorded as a change to a control of
  this branch's own suite, not to a frozen criterion.
- **Fixtures whose purpose now matters.** `runAgent` in `phase6-fixtures.ts` states `briefing` for a
  briefing task and `decision` otherwise; `listAgents` takes the purpose; the demo seed triggers the
  briefing agent under `briefing`. The web client does not trigger agent runs.

### 13.3 The other checks (separate evidence classes)

| Check (class) | Result at the corrected tree |
|---|---|
| **Harness** — `phase6-residual-corrections-2` (database, controller, identity path, real Redis; a second upload source under a restricted ceiling) | reviewed tree: **8/10 fail** on the naming assertion (`residual2-before-2`); with 0050 applied and the SERVICES still at `07edd9dc`: the two SQL-side paths (R6, R3) pass and the four service-side paths (R7, R4a/b/c, R5 both forms) still fail (`residual2-before-3-services-at-07edd9dc`); corrected tree: **10/10 pass** (`residual2-after-3`) |
| **Harness** — `phase6-review-corrections` (§11) and `phase6-agents` | 34/34 (the §11 read-budget control adjusted to the metered render, §13.2) |
| **Harness** — the Phase 6 suites in one invocation | 12 files, 138 cases: 137 passed, 1 failed on the §11 control BEFORE its adjustment; the adjusted control passes |
| **Harness** — `test:int:all`, phases 0–6 (the final regression, one invocation) | **44 files, 793 passed** |
| **Unit** (`pnpm test`, no database) | on the dirty working tree two gate probes fail as before (§11: `hermetic-isolation`, `receipt-contract` read the tree's own digests); UNIT_3 |
| **Web** typecheck and `next build` | clean |
| Module boundaries (`pnpm boundaries`) | no violations (476 modules) |
| gitleaks over the working tree | no leaks (77.6 MB scanned) |
| Post-C18 upgrade check (`verify-0022-upgrade.mjs`, virgin database migrated from empty through 0050) | **PASS** — 50 files, schema digests match exactly (`b842b795f3502102…`), Phase 1–2 suites on upgraded data 274/274; the ledger gains its 29th declared line |
| **Deployment** (`eye_demo`, historical records kept) | 0050 applied; the API restarted from the corrected build reconciled 4/4 persisted schedules and 1/1 room briefing cadence at startup; the replay probe after 0050: M. Dvořák (member, purpose `decision`) 201; H. Weber (reader role, not a member) 403; T. Nakamura (member, purpose `research`) 403; the demo seed (act VI) re-ran with the briefing agent triggered under `briefing`: 0 problems, the outcome, the reconciliation and the replay unchanged in digest |
| **Browser** — Phase 6 spec on the restarted deployment after 0050 (web served from the rebuilt bundle) | **3/3** (decisions, replay, briefings) |
| **Browser** — Phase 4/5 spec, preserved | **1 failed, 12 not run**: the spec's first case counts the ECB retrospective validation on the overview (`1 validated retrospective`), which this deployment cannot produce while the publisher is unreachable; the describe is serial, so the other twelve cases do not run behind it. This is what every run of this session shows (`browser-phase4`, `-2`, `-3`, and this one); §11/§12 and the PR body reported the case as one failure among twelve passes, which the recorded outputs do not support — corrected here. Not verified, not waived. |

### 13.4 CI at the exact head

CI_RESULT_3

### 13.5 What remains (not closed)

- The full-product audit and the security maintenance track are recorded in
  `FULL_PRODUCT_DELIVERY_REGISTER.md` (§4–§6, §8) and `audit/`.
- An interval aggregate is established by an observation over exactly that interval; deriving one from
  finer-grained cited observations under a declared aggregation rule is not implemented (register §6).
- An agent's composition folds under the agent's own registration; the agent's clearance is applied to
  its report (§11) and to what leaves the run (R4b/R4c), not to the briefing it composes for the room's
  members (which the stored-read rule governs).
- This review is **not** recorded as closed; C15 and FINAL C16/C17 stay blocking; the ECB-dependent
  browser case stays failed until verified.
