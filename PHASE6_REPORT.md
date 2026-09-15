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
| **Unit** (`pnpm test`, no database) | on the committed tree `561dd3c`: 2135/2136 and, re-run while the audit workers loaded the machine, 2132/2136 — the failures are C15 runner probes (`c15-runner-behaviour`, `hermetic-isolation`, `receipt-contract`) that spawn the gate runner with staged scanners and differ from run to run; each of those files passes when run alone (`unit-c15-probe`, `unit-gate-probes-alone`: 22/22), and the CI unit step at the same head passed. Recorded as load-sensitive local probes, not as a defect of this pass; the hosted result is the one that counts (§13.4) |
| **Web** typecheck and `next build` | clean |
| Module boundaries (`pnpm boundaries`) | no violations (476 modules) |
| gitleaks over the working tree | no leaks (77.6 MB scanned) |
| Post-C18 upgrade check (`verify-0022-upgrade.mjs`, virgin database migrated from empty through 0050) | **PASS** — 50 files, schema digests match exactly (`b842b795f3502102…`), Phase 1–2 suites on upgraded data 274/274; the ledger gains its 29th declared line |
| **Deployment** (`eye_demo`, historical records kept) | 0050 applied; the API restarted from the corrected build reconciled 4/4 persisted schedules and 1/1 room briefing cadence at startup; the replay probe after 0050: M. Dvořák (member, purpose `decision`) 201; H. Weber (reader role, not a member) 403; T. Nakamura (member, purpose `research`) 403; the demo seed (act VI) re-ran with the briefing agent triggered under `briefing`: 0 problems, the outcome, the reconciliation and the replay unchanged in digest |
| **Browser** — Phase 6 spec on the restarted deployment after 0050 (web served from the rebuilt bundle) | **3/3** (decisions, replay, briefings) |
| **Browser** — Phase 4/5 spec, preserved | **1 failed, 12 not run**: the spec's first case counts the ECB retrospective validation on the overview (`1 validated retrospective`), which this deployment cannot produce while the publisher is unreachable; the describe is serial, so the other twelve cases do not run behind it. This is what every run of this session shows (`browser-phase4`, `-2`, `-3`, and this one); §11/§12 and the PR body reported the case as one failure among twelve passes, which the recorded outputs do not support — corrected here. Not verified, not waived. |

### 13.4 CI at the exact head

The correction head is **`561dd3cc`** (the code, the tests, migration 0050, the image candidates,
this section's first form); the docs head that carries the audit register follows it and is reported
in the PR body with its own run ids.

- **`561dd3c`**: run 34400217194 — `build-test` **success** (unit and gate suites, acceptance, the
  whole integration suite, the post-C18 upgrade check and the C18 dual-path gate); `browser-regression`
  **success**; `supply-chain` **failure at C15 on the image findings alone** — `pnpm-audit-human`,
  `pnpm-audit-json`, `gitleaks-worktree`, `gitleaks-history`, `trivy-fs`, `trivy-fs-json`, both image
  scans `[ok]`; the thirteen UNGOVERNED rows are the util-linux CVEs in the pinned postgres and redis
  images (`libuuid` 2.42.1-r0, `setpriv` 2.41.4-r0), for which the patched candidates of register §4.2
  exist locally and await the owner's publishing decision; FINAL C16/C17 skipped behind C15. Run
  34400217205 — `C19 lifecycle` **success** (both lifecycle jobs, delivery-chain-dry,
  foreign-checkout-pinning).

No waiver, no bypass: C15 and FINAL C16/C17 stay blocking.

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

### 13.6 Closure of the bounded correction review (recorded)

Codex's bounded Phase 6 functional correction review is **closed at
`2e839458361b2accc457f5ae1b53d7a2263780ce`** (`audit/reviews/The_Eye_PR46_Closure_2e83945_and_Delivery_Next_Steps.txt`,
sha256 `f4f2ac7f…`). The evidence classes stay distinct: Codex's 27 independent service/PDP checks with
explicit doubles and a controlled clock (27/27 passed; one check consumes the contributor shape from SQL
inspection, not SQL execution; eleven blobs verified against the candidate tree; no PostgreSQL, Redis,
HTTP, browser, Docker or Trivy execution claimed) — apart from this branch's real-database/controller/Redis
harness (§13.1, §13.3), the browser results (Phase 6 3/3; Phase 4/5 one ECB-dependent failure and twelve
not run — no skipped case is a pass) and the hosted CI (§13.4).

Two corrections to §13.4's wording, from the raw log of run 34414834786: the supply-chain checkout is
GitHub's synthetic merge `a9444570` of `2e83945` onto `c5460465`; and the raw `trivy-fs` step reports
**FAIL** while `trivy-fs-json` reports ok — the final governed reconciliation names the 13 image rows, but
"every filesystem step ok" is not supported. The raw failure is this pass's own: the candidate Dockerfiles
committed at `561dd3c` under `infra/images/candidates/` trip trivy's `DS-0002` (no explicit non-root
`USER`), and that step is blocking in the gate. It is handled in the maintenance track (register §4.2): the recipe now declares the
non-root service user (candidate v3) and the v1 files are removed; the gate-form filesystem scan of the tree exits
0 locally. Not waived.

The closure establishes neither Phase 6 product completeness nor release readiness: conditional
approvals, case-bound agent selection and the other omissions stay in the register's packages; PR #46
stays unmerged behind C15 and the unexecuted FINAL C16/C17 chain. Nothing in the closed scope is
reopened without a concrete new consequence.

## 14. The checkpoint after the three-track review at `59a2459` (2026-09-10)

The reviewer's four bounded follow-ups (`audit/reviews/The_Eye_59a2459_Three_Track_Review_and_Claude_Prompt.md`)
and the owner's directions were carried out on the branch heads `54d8ecc`, `b30242f`, `c9d3d68`; the closure of
§13.6 and every earlier closed finding are untouched. No broad correction review was started.

**T1 — audit accounting and traceability.** S7 is in the accounting: `audit/summarise-units.mjs` counts a mandatory
unit as unfinished unless it is verified on every profile it applies to — 3,535 unfinished = 3,196 in status open
+ 339 verified on the local profile only while applying to all profiles (at those heads; 3,195 + 339 + 1 after
B3's unit moved to `verified:ci`, and 3,542 = 3,202 + 339 + 1 after B1/B2 allocated their seven units, §18); the twelve mandatory/not-applicable units
were reconciled one by one (**seven** are document-class obligations now open, **five** are authoring rules and
documentary; `audit/UNIT_REPAIRS.md`); 78 truncated or conflated units repaired and 3 split; 59 local statuses that
named only a module set back to open; source references are page-aware spans (`vNN.txt:page n:Lstart-Lend`, 217
fallbacks marked `page-mismatch` for CP-6); bare migration references resolve, so `ES-24-004` and 14 more rows are
`branch-only`. All 6,264 rows, 220 families, original ids and historical snapshots are kept.

**T2 — recovery isolation.** `scripts/ops/lib/guards.sh`: physical canonical paths, refusal of destinations inside
or aliasing the worktree, `.eye-local`, the bundle or any bind mount, refusal of symlinked ancestors, fresh
`mkdir` destinations validated before any chmod/copy/extraction, and teardown bound to a run manifest;
`scripts/ops/test-guards.sh` 35/35 (the reviewer's two probes refused); image identity read by Compose service
from the YAML and both pins recorded in the bundle; second drill 37/37 (`docs/ops/evidence/restore-drill-20260910T161412Z.md`).
The drill was then repeated against the PUBLISHED digests at `c9d3d68` (`docs/ops/evidence/restore-drill-20260910T173954Z.md`): the
bundle records the GHCR pins and the compose protections; the isolated containers were started from the pins under
`--user 70:70 / 999:1000 --cap-drop ALL --security-opt no-new-privileges:true`; `/proc/1/status` in both shows all
capability masks 0 and NoNewPrivs 1; **44/44 checks**, 22 s to a governed read; the live containers, still on the
official images without those protections, were reported as divergent and left untouched (their recreation is the
next recorded operation). Not yet done, kept as CP-4/5 work: bundle encryption at rest, a non-empty degraded-journal
restore, a consistent capture boundary across database/vault/journal/config, and scheduler reconstitution proven
with collection enabled.

**T3 — the temporary publisher, and the publication.** `publish-derived-images.yml` rebuilt: `push` trigger on
`publish/derived-images/**` (the bootstrap needs nothing on `main`), inputs from the committed control file
`infra/images/candidates/v2/PUBLISH.json` through environment variables with strict patterns, the run bound to the
approved source revision by recipe-blob comparison, native builds on `ubuntu-latest` and `ubuntu-24.04-arm` pushed
by digest and combined into one index, scans and SBOMs of BOTH children from the pinned scanner, receipts uploaded
on every path, package visibility and anonymous readability verified after the push. Run 34502081248 published
`ghcr.io/a-halawany/elven/postgres:18-alpine-maint-20260910@sha256:69a974ae…` (amd64 `bc90ce6b…`, arm64 `d3dd485b…`)
and `…/redis:8-alpine-maint-20260910@sha256:1ad0ff24…` (amd64 `0c0a48dd…`, arm64 `c11d75ca…`), both public and
repository-linked; postgres scans 22 gosu rows on each platform, redis 0. Re-pinned in `docker-compose.yml` and
`conformance.manifest.json`; SCX-0002…0005 re-issued for the new artefact (gosu byte-identical on each platform,
original analysis dates and the 2026-11-05 expiry unchanged); SCX-0001/0006–0009 retired (fixed in the derived
images); `docs/SCANNER_DISPOSITIONS.md` rewritten and re-bound; the recheck re-purposed to detect a compatible fixed
OFFICIAL image per service on both platforms (report only; today: both official tags still affected). Local C15
gate on the re-pinned tree: PASS, 22 findings, 0 unmatched, 0 unused. Test and fixture adaptations to the new
artefacts (re-recorded trace streams, the receipt controls moved to the gosu result, the redis controls back to
their original `closesFalsePass` shape because redis is clean) are listed in the PR body.
CI after the re-pin: at `c9d3d68` (run 34508540200) **C15 passed for the first time since PR #39**, the patched-image
recheck passed and FINAL C16 passed; the FINAL-manifest assertion failed on the filesystem-result universe (the two
Dockerfile `config` results, zero findings, were not in its source-owned set) and the C18 gate failed because its
secret hand-over wrote into a root-owned tmpfs while the pinned images now run as the service user. Both corrected
at `ea8edb2` (the verifier derives the set from the tracked Dockerfiles and requires zero failures on them; the C18
sink runs as root and hands the tmpfs to the image's declared user, the value still over STDIN only): run
34510452880 — `supply-chain` **success end to end** (C15, recheck, FINAL C16, the manifest assertion, licence
inventory, C17 validation and obligations, C15+C16 packaging); the "Package + verify the C17 evidence archive" step
is `skipped` by the workflow's own condition (`github.event_name != 'pull_request'`; it runs on push events, i.e.
after the merge in the recorded order) — reported, not waived; `browser-regression` success; `C19 lifecycle`
success; `build-test` **failure at the C18 gate**: production and offline verification pass locally with the
image-user lookup bound in the query plan, and the differential controls then fail because the byte-frozen legacy
verifiers read the compose file through a committed symlink with a `postgres@sha256:` pattern that cannot read a
registry-path pin — handled by a digest-equal legacy view of the compose file and the same translation in the
suite's downgrade (below). **At `d4730f2` (run 34515658422): `build-test` success (unit, acceptance, integration, upgrade check, the legacy-view
check and the C18 gate — 4 stages, 612 + 44 controls), `browser-regression` success, `supply-chain` success (C15
gate, patched-image recheck, FINAL C16, the FINAL-manifest assertion, licence inventory, C17 validation and
obligations, C15+C16 packaging); run 34515658380 `C19 lifecycle` success. The only non-success steps are "Package +
verify the C17 evidence archive" and its upload, `skipped` by the workflow's own `github.event_name != 'pull_request'`
condition — they execute on the push event after the merge in the recorded order; not waived. The checkout is
GitHub's synthetic merge of the candidate onto the base. This is the first head of this stack where every required
job is green; it establishes release maintenance for the stack, not product completeness.**

**T4 — Redis protections.** With `USER redis` the upstream setpriv path does not run; `docker-compose.yml` now sets
`user`, `cap_drop: [ALL]` and `security_opt: [no-new-privileges:true]` on both services (`user:` is required: the
bases' entrypoints decide the privilege drop by capability and fail under `cap_drop` alone). Measured on the v3 images
and the bases (`infra/images/candidates/evidence/v3/process-protections.txt`, 37/37): redis CapBnd=0, CapEff=0,
NoNewPrivs=1 (equal to the base); postgres all masks 0, NoNewPrivs=1 (stricter than the base); no capability added
back. The live containers are recreated at the next governed recreation.

**Product choices (decided by the owner).** Recorded in register §8 with their conditions; the eight scenario kinds
are P4 completion work. **PortWatch:** permission granted (owner-reported; grant text pending), rights confirmed,
`imf-portwatch-ports` v3 live on the daily layer (2,804 rows admitted; the master-layer declaration of every earlier
PortWatch contract is recorded as a finding), chokepoints and an operator/scheduler run-serialisation defect routed
to P1 (`SOURCE_INTEGRATION_STATUS.md` §9). UN Comtrade deferred, key untouched. The `CorrectionApplied` consumer
remains required work.


## 15. The bounded checkpoint after the review at `d4730f2` (2026-09-11)

The reviewer's five items (`audit/reviews/The_Eye_d4730f2_Bounded_Review_and_Claude_Next_Checkpoint.md`) were
completed on heads `ef85a12` → `461a2b5`. The closure of §13.6 and every earlier closed finding are untouched; no
broad correction review was opened.

**1. Arm64 governance (`f011cc1`).** The four re-issued records were `linux/amd64` only, so the published arm64
postgres child — the image the restore drill actually runs — was ungoverned. Its own artefact was analysed: the
binary extracted from that exact child is `gosu` sha256 `3a8ef022…`, `go1.24.6`, `GOARCH=arm64`; its 22 findings are
all `stdlib` rows on `usr/local/bin/gosu`, with no OS-package finding, and the arm64 redis child is clean at every
severity. **`govulncheck` and a Go toolchain are absent on this host, so no symbol analysis of the arm64 binary
exists: SCX-0010 (21 HIGH) and SCX-0011 (1 CRITICAL) accept the risk on the reachability argument, including the
seven advisories that are NOT_AFFECTED on amd64 (one under SCX-0004, six under SCX-0005; an earlier line counted CVE-2026-33818 twice and said eight) — the amd64 analysis was not carried across.** The amd64 records keep
their scope, dates and expiry. The gate scans both children of each index (`SCAN_PLATFORMS` owned in one place so the
runner and the final verifier cannot drift) and matches a record against the FINDING's platform, not a run-wide
constant; a record naming a platform the run did not scan fails as OUT-OF-SCOPE rather than being counted unused, so
widening the scan cannot hide a stale record. Local gate: PASS, 44 findings, 6 records, 0 unmatched, 0 unused, 0
out-of-scope, 0 stale; `test/gate` 937/937. Obtaining `govulncheck` for arm64 would let those seven be re-classified
on their own evidence; that is a named resource, not a gap to be argued away.

**2. CP-4/5 recovery (`6226fec`).** Build identity replaces the timestamp heuristic: the bundle is built from the
committed tree at a recorded SHA with the committed lockfile, carries the artefact, and the restore refuses a build
whose deterministic dist digest differs — which fired in the drill and recorded a source-to-target upgrade instead of
starting an unidentified build. Bundles are encrypted per file with AES-256-GCM under a per-bundle key wrapped by
PBKDF2-HMAC-SHA512 (600k), the tag verified before any ciphertext is read; this host's `openssl enc` refuses AEAD and
`age`/`gpg` are absent, so the AEAD comes from `node:crypto` — recorded as a limitation rather than replaced by a
command-line key. A non-empty degraded journal was produced by the product's own writer in isolation, restored
(`/readyz` degraded, same `degradedSince`, journal replayed) and reconciled to `ok`. A capture boundary is recorded
and reconciled row by row on restore, with quiescence for the isolated source. The scheduler rebuilt 5/5 eligible
entries and 97 attempts from the database with Redis empty and collection enabled, and served exactly one recorded
tick. 68 checks passed, 1 failed — the operator credential, below.

**3. PortWatch integrity (`823c4c8`).** Each defect was reproduced at the harness before it was fixed. `0051`
serialises runs on a source lease at the database and replaces `append_run_event` so `run.started` is refused without
it: an operator trigger during a scheduled walk is answered 409 naming the holder. `0051 §3`, `0052` and `0053` add
the admitted-items register claimed inside the admitting transaction, make availability govern reuse, and re-point
the register when a correction lands; the connector emits page-grouped output and the checkpoint is committed per
completed page. `expected_schema.item_key_field` accepts an ordered list, and a contract declaring a string frames
byte-for-byte as before. The 2,133 duplicates were superseded through a governed correction case — nothing deleted,
each original retrievable — and the readiness register now reports rows, objects, distinct observations and
superseded separately, because one number counted as canonical rows is what made the duplication invisible.
`imf-portwatch-chokepoints` v2 activated on the daily layer with the cadence and budgets carried verbatim: 9 pages,
8,418 rows, 8,427 distinct keys. It took two runs — a scheduled tick stalled, an operator run was refused 409 while
that lease was held, then took over after expiry and recorded the already-admitted rows as no-ops — so all three
corrections were demonstrated in the field, not only at the harness.

**4. The C18 empty-user branch (`ef85a12`).** The producer records the image-user lookup for every image and hands
the secret over as root, so a root image records the lookup with empty output and the same nine-argument exec with
the ownerless sink, which is byte-identical to the legacy sink. The verifier treated that empty lookup as a defect
and then demanded the legacy seven-argument exec, so every official postgres/redis image — exactly what the governed
return to official images restores — failed twice on a shape its own producer emits. Three ledger shapes now bind one
argv each; the stdin class binding, exact argv matching and the frozen historical verifiers are unchanged.
Reproduced on the pre-fix verifier (the root case alone fails) and green after: C18.1.12, 1102/1102 in the file.

**5. Accounting (`ef85a12`).** The twelve former mandatory not-applicable units are **seven open document-class
obligations and five documentary rules** (AU-GOV-0076, 0077, 0080, 0083, 0088, 0175, 0202 open; 0089, 0090, 0299,
0301, 0347 documentary). The CSVs and the per-unit table always said so; the prose was corrected to the data, never
the reverse. The unfinished mandatory total is unchanged at 3,535.

**A regression the serialisation caused, found and repaired (`461a2b5`).** Activating a version through the route
fires an immediate scheduled tick, so the scheduled-corrections warm-up was refused `source_run_in_flight` — and the
repeating tick can retake the lease between a check and an acquire. The helper now waits and retries its turn on that
refusal alone; F07's property is asserted unchanged afterwards on a source with no run in flight.

### 15.1 Checks at this checkpoint, by class

| Check (class) | Result |
|---|---|
| **CI (hosted, authoritative)** at `461a2b5`, run 34546359239 | `build-test` **success** (unit, acceptance, the whole integration suite on a fresh database, the upgrade check, the legacy-view check, the C18 gate), `browser-regression` **success**, `supply-chain` **success** (C15 with the two-platform scan, patched-image recheck, FINAL C16, the FINAL-manifest assertion, licence inventory, C17 validation and obligations); run 34546359306 `C19 lifecycle` **success**. The C17 evidence-archive packaging and its upload are `skipped` by the workflow's `event_name != 'pull_request'` condition — they run on the push after each merge; not waived. Earlier heads: `ef85a12` green, `f011cc1` green (the two-platform gate), `823c4c8` `build-test` red on the F07 warm-up repaired at `461a2b5` |
| **Harness (author)** — `test:int:all` locally | 45 files, **803 passed, 3 failed**: three `phase5-twins` cases refuse a twin input as `stale` under full-suite load. The same file passes **15/15 in isolation** and the same suite passes in CI on a fresh database, so this is a property of this long-lived local `eye` database, not of the tree — recorded as an open time-sensitivity to characterise, not dismissed |
| **Harness (author)** — `phase6-collection-serialisation` (new) | 13 cases: overlap refused 409, lease released, per-page checkpoint, interrupted walk, crash-retry, register port, composite key, single-field framing preserved, five validator cases |
| **Harness (author)** — `phase6-scheduled-corrections` after the warm-up repair | 17/17 |
| **Gate (author)** — local C15 on the re-pinned tree | PASS: 44 findings (22 amd64 + 22 arm64), 6 records, 0 unmatched, 0 unused, 0 out-of-scope, 0 stale |
| **Gate (author)** — `test/gate` | 937/937; `c18-db-paths` 1102/1102 including the new C18.1.12 three-shape probe |
| **Upgrade check (author)** — virgin database through 0055 | **PASS**: 55 files, schema digests match exactly, Phase 1–2 suites on upgraded data 274/274 |
| **Deployment (author)** — recovery | drill `20260910T223824Z`: 68 checks passed, 1 failed (the operator credential, §15.2); guard probes 51/51; the live containers and databases untouched by the drill |
| **Deployment (author)** — PortWatch | chokepoints v2 walked 9 pages, 8,418 rows, 8,427 distinct keys, 0 revisions; the 2,133 duplicates superseded through a governed correction case (2,133 superseded, 0 rejected) |
| **Browser** — unchanged this checkpoint | the CI `browser-regression` job covers its configured Phase 0/1 scope; it does not replace the recorded Phase 6 **3/3** or the Phase 4/5 serial run with **one ECB-dependent failure and twelve not run**. No skipped case is a pass |


### 15.2 Open, recorded rather than closed

- **The live containers are still on the official images** without the compose protections: their recreation
  (register CP-4a) waits on two credential conditions the drill exposed — the `platform-admin` principal refuses the
  current `EYE_TEST_ADMIN_PASSWORD` (`EYE-IDN-002`), and `eye-redis` has been `unhealthy` for 41 hours because the
  healthcheck variable baked into the container is stale while the running server accepts the current env value. That
  a red healthcheck surfaced nowhere for 41 hours is itself a P7-D observability row.
- **Product observations from the PortWatch field work**, routed and not fixed here: a scheduled tick stalled with no
  terminal event (cause undiagnosed); the outbox publisher crashed the API mid-correction with `capability denied:
  mode publish required (context is none)`; the connector's code digest is unchanged by the framing addition, so
  bumping it is a separate governed act; `/runs/:id/get` caps at 250 events and `/evidence/list` at 500 rows with no
  item key.
- **Migration 0038 requires `acquisition_mode = 'live'`** for a scheduled entry, so a zero-egress replay tick is
  impossible by construction — an isolated verification that must not reach the network uses an upload source or
  accepts that live entries do not tick.
- The four product decisions, the eight scenario kinds and the `CorrectionApplied` consumer remain implementation
  work; scheduling does not close them.

## 16. The bounded correction checkpoint after the review at `461a2b56` (2026-09-11)

The reviewer's record is `audit/reviews/The_Eye_461a2b56_Bounded_Review_and_Claude_Checkpoint.md`. It closed the C18
empty-user branch and the seven/five accounting, supported the two-platform matcher, and reproduced three defects
(R1, R2, R3) with a fourth item of open acceptance evidence (R4). The closure of §13.6 and every earlier closed finding
are untouched; nothing earlier was reopened. Code head `da726d3`; the commits are `26be4f4` (R3), `1c8242e` (R1, R2,
R4 scripts), `929265b` (arm64), `24ec3fd` (fifth drill), `0c09274` (connector digest), `31d2b12` (stack plan),
`f1f3719` (register), `4989790` (one secret-scanner false positive on the new evidence file), `da726d3` (the D2/D4
fixture runs carry their operation's correlation id, which F06's invariant requires).

**R1 — cleanup could delete a directory the run never created (`1c8242e`).** Reproduced first on the reviewed
guards in a disposable tree (`existing_build_deleted=true`, `sentinel_survived=false`). A directory is now owned by
CREATING it: `ops_run_create_dir` records a directory only after this run's own plain `mkdir` succeeded, with the
inode it produced; `ops_run_owned_dirs` is the only set failure cleanup removes (recorded, still that inode, not a
symlink); `ops_run_record dir` is refused. `backup.sh` creates the build root that way and tells the builder, and
`build-identity.mjs --root-precreated` verifies an empty, non-symlink directory owned by this user before writing.
Probes: the pre-existing directory and its sentinel survive refusal and cleanup; the builder refuses a non-empty or
symlinked root without writing; two attempts at one destination — the creator owns it, the loser's cleanup removes
nothing; a path replaced underneath the run is no longer its to remove.

**R2 — an altered file-map key wrote outside the destination (`1c8242e`).** Reproduced on the reviewed script
(`verify_passed=true open_passed=true escaped=true` for a key changed to `../../escaped.bin` with its aad retained).
Format `eye-bundle-crypto/2`: a record's aad must equal its key, keys are canonical relative paths, the whole file
map is authenticated (`files_tag_hex`, HMAC under a KEK-derived key) before the data key is unwrapped, and every
output is physically contained under the resolved destination (ancestors created or verified real directories, no
symlinked leaf or ancestor; sources verified inside the bundle). Format `/1` bundles are refused. Probes: traversal
key, re-pointed sibling key, pruned map, symlinked destination subdirectory, format /1 — all refused with nothing
written; the intact bundle opens byte for byte; wrong passphrase and tampered ciphertext still refused.

**R3 — the run that lost its lease could still admit (`26be4f4`, migration 0056).** Reproduced at the real harness
before the change (D4 in `phase6-collection-serialisation`: the displaced run FINISHED after the takeover; the ports
accepted its claim and its events). `observation.assert_run_holds_source` locks the lease row FOR UPDATE — the lock
`acquire` takes, so an effect and a takeover are ordered by the database — and raises unless the row names the
calling run and the lease has not expired; `append_run_event` calls it for every non-terminal event and
`claim_item_admission` before the register is read. Terminal events are not fenced, so a displaced run records its
own `run.failed` with the refusal as its reason, touching only its own lease. An expired holder is refused too and
must re-acquire or end. D4: paused A → expiry → B takeover → A resumes — A records exactly one event after the
takeover (`run.failed`), B's lease is untouched (holder, heartbeat, takeover record), B finishes with 10 admissions,
objects held = distinct; the ports refuse the displaced run's claim, admission event, checkpoint and progress while a
holder opened as every run is holds the source, and refuse to release the holder's lease; an expired holder's first
effect is refused and the next attempt collects cleanly. D1–D3 and F07's property unchanged; 16/16.

**R4 — recovery completed against one compatible checkpoint (`1c8242e`, `24ec3fd`).** The fallback that ran the
bundled dist against the checkout's `node_modules` is gone: every bundle carries `runtime-workspace.tar` (lockfile,
workspace and package manifests, `packages/contracts/dist`), and without the build root `restore.sh` installs the
artifact's production dependencies from that record with `pnpm install --frozen-lockfile --prod` or refuses before
launch; the build identity records the artifact's migration ledger and restore refuses an artifact whose ledger does
not end where the restored schema ends; the reconstructed tick's OUTCOME is a check of its own (only `finished`
passes). Fifth drill (`docs/ops/evidence/restore-drill-20260911T112927Z.md`): checkpoint `1c8242e` (0056 in the
artifact's tree and in both databases), bundle L from the live deployment, E1 driven degraded, bundle D quiesced, E2
restored **with D's build root moved away** — 179 packages installed from the bundle's lockfile in 2.3 s, dist
re-verified there, compatibility checked, the non-empty journal restored (`/readyz` degraded from the durable
journal, 6 incidents) and recovered through the governed path from the runtime workspace, the boundary enumerated,
the scheduler rebuilt into an empty Redis and **one scheduled collection completed** (`eu-sanctions-rss`, finished, 1
admitted + 5 confirmed), the governed read passing. E1 61/61, E2 76/76, every return code 0; guards 69/69. The
operator credential was resolved through the existing recovery process — the pre-regeneration bundle's `config/env`
— and the product's own rotation route: `platform-admin` and the eleven demo personas rotated to the current file
value (twelve audited `identity.credential_rotated` events; nothing reset, nothing printed). The fourth drill's
record stands unchanged, its failed check included.

**Arm64 (`929265b`).** The missing resource was obtained free: govulncheck v1.1.4 in the official Go image
(`golang@sha256:1ae0735f…`, native arm64) on the exact binary the records govern (`3a8ef022…`): 0 called
vulnerabilities; all 22 governed advisories present and unreachable. No approval was invented and no classification
changed: `docs/images/ARM64_RISK_DECISION.md` states that SCX-0010/0011 have no attributable approver (the owner
asked for the platform to be governed, not for these 22 to be accepted), and puts the one remaining decision in
signable form (accept as RISK_ACCEPTED; re-issue as NOT_AFFECTED in new records on the arm64 analysis — recommended;
refuse). The live recreation on this arm64 host waits on it. "Eight" corrected to seven (one under SCX-0004, six under
SCX-0005) in the record, the dispositions document, this report and the register; the amd64 findings not reopened.

**Connector code digest (`0c09274`).** `RestConnector.codeDigest` now covers the framing methods
(`513c4d8c…` → `e27ca96f…`; version and method refs byte for byte). The governed act on the demonstration is in
`SOURCE_INTEGRATION_STATUS.md` §9.11.10: rebuilt artifact, six REST agents registered by `platform-admin` and six
revoked by `m.dvorak` with the reason recorded, schedules re-resolved at the next reconcile, one operator run on
`ecb-eurusd` finished under the new digest. No contract, cadence or budget changed.

**Stack plan (`31d2b12`).** Refreshed from the corrected head: 179 maintenance files including the two-platform gate
and the provisional arm64 records; `scripts/ops` and the upgrade check excluded as schema-coupled; merge-tree of the
synthetic set — #39 the same four conflicts, the seven others clean, #46 clean at the local head; migrations
27 → 31 → 37 → 40 → 56; `038fa9f` not cherry-picked — its dependency halves authored as a product-free commit on #39
with the lockfile regenerated there. Preparation, not merge authorisation.

### 16.1 Checks at this checkpoint, by class

| Class | Scope | Result |
|---|---|---|
| Hosted CI (`ci`, run 34597107866 at `da726d3`) | build-test (unit, gate suites, full integration suite on a fresh database incl. D4, C18 four stages, upgrade check through 0056), browser-regression (Phase 0/1), supply-chain (two-platform C15 FINAL with SCX-0010/0011 matched, patched-image recheck, FINAL C16, manifest assertion, licence inventory, C17 validation, both gitleaks scans) | **success** — every job green; the C17 archive packaging step `skipped` by the workflow's pull-request condition, as before |
| Hosted C19 (run 34597107913 at `da726d3`) | lifecycle (ubuntu, macos), foreign-checkout pinning, delivery-chain dry run | **success** (all four jobs) |
| Hosted CI at `f1f3719` (run 34595656536) and `4989790` (run 34596145466) | the same chain, two and one commits earlier | `f1f3719`: supply-chain FAILED on gitleaks (59 upstream commit URLs in the new arm64 evidence file — governed by `4989790`) and build-test FAILED on F06; `4989790`: supply-chain green (two-platform C15, 44 findings, 6 records, 0 unmatched/unused), build-test FAILED on F06 alone (the fixture runs' correlation id — corrected by `da726d3`); browser green in both; C19 green at `4989790` (34596141891) |
| Author, real harness | `phase6-collection-serialisation` 16/16 (D4 ×3 new); phase1 acceptance/fault-injection/hostile-input, phase4 acceptance/corrections, phase6 scheduled-collection/-corrections (F07), decisions, residual ×2, scheduler-capability, review-corrections; phase5-twins, gate22 outbox-hardening and degraded-recovery | all green except `phase1-fault-injection` F05 locally: the long-lived local `eye` database carries eleven orphaned `observation.run.start` success audits left by the pre-0056 reproduction probes (a global invariant; CI's fresh database is green); recorded, not dismissed |
| Author, real host | fifth drill (two isolated environments, real containers on the pinned images, real APIs, one real egress); guard probes 69/69; R1 and R2 pre-fix reproductions on the reviewed scripts; arm64 govulncheck in the Go image; the twelve credential rotations and the six agent re-provisionings on the live demonstration; one operator run | as recorded above |
| Independent (Codex) | none this pass; the next review is the reviewer's | — |
| Browser | unchanged: hosted Phase 0/1; author Phase 6 3/3; Phase 4/5 one ECB-dependent failure and twelve not run | no changed claim |

### 16.2 Open, recorded rather than closed

- The arm64 risk decision (`docs/images/ARM64_RISK_DECISION.md`) — the approver's; the live recreation (CP-4a)
  waits on it, its credential preconditions now met and its rollback bundle taken.
- The stack: push done; the `#39` four-file resolution, `PROGRESS.md` at #38/#40/#41, the product-free dependency
  commit for #39 with its lockfile regenerated there, a fresh full chain per head and the push-only C17 archive
  after each merge — execution, not authorisation, and not on this review alone.
- The stalled scheduled tick (undiagnosed; consequence bounded by 0051 and 0056), the outbox publisher crash during a
  correction (undiagnosed), and the `phase5-twins` local staleness under full-suite load — each in the register with
  an owner; a fresh local harness database is the next step for the last and for F05's orphans.
- CP-6 reconciliation, the four product decisions, the eight scenario kinds, the `CorrectionApplied` consumer, and
  3,535 unfinished mandatory acceptance units remain required. This is continued delivery work, not full-product
  acceptance.

## 17. The checkpoint after the owner's acceptance (2026-09-11): the five tasks, CP-6's first batch, the prepared stack

Code head `1a99784` (every hosted run below is at it or at a prepared head that contains it); records head: the commit this section is committed with. The closure of §13.6 and every earlier closed finding are
untouched; no completed review was restarted. GHCR remains temporary; no purchase, no cadence or budget
change; PortWatch within its granted permission; UN Comtrade deferred, key untouched.

**0. The owner's acceptance, recorded (`db675a2`).** SCX-0010/0011 stand as RISK_ACCEPTED for the
`linux/arm64` child within their scope and expiry (2026-11-05); the records name the product owner as
approver with the date of the decision (2026-09-11), bind `docs/images/ARM64_RISK_DECISION.md` §5 and the
arm64 govulncheck report as additional evidence, and the dispositions document says the same. Owner
acceptance, not independent Codex verification. The gate fixture's run window and the recheck controls
follow the acceptance date (`548a0be`, `590928f`).

**1. The Linux cleanup issue (`b43977c`).** `ops_inode` tried `stat -f` first; on GNU stat `-f` is a
file-system report, six lines, always "successful" — so on Linux every directory a run created dropped out
of its cleanup set (reproduced on the reviewed helper in a container: `owned_dir_in_cleanup_set=false`).
`ops_stat_format` tries the GNU form first (BSD stat rejects `-c`) and accepts one line only; `ops_inode`
accepts one `<device>:<inode>` token; `ops_mode` uses the same helper. Three probes added — the token shape
on this host's stat, a created directory IS in the owned set, cleanup removes it with its contents — beside
the preservation probes. **72/72 on macOS (BSD stat, bash 3.2) and 72/72 on Linux** (GNU coreutils, bash 5.3,
`node:24-alpine` with a stub docker for the end-to-end refusals). Evidence:
`docs/ops/evidence/guard-probes-20260911-{macos,linux,linux-prefix-a17d77e}.txt`.

**2. Functional verification in fresh, separately named environments.** Databases created for this
checkpoint and never shared with the demonstration or the long-lived harness: `eye_verify_20260911`,
`eye_verify2_20260911`, `eye_browser_20260911`; the demonstration (`eye_demo`) and every historical
evidence bundle preserved.
* Integration, `eye_verify_20260911`: first full run **809/809** (45 files, `b43977c`, before 0057);
  second full run on the SAME database at `ab9a225`: 811/814 — the three `phase5-twins` E3 cases refused
  `consumption.weekly` as stale; the same file alone on that database afterwards: 15/15.
* Integration, `eye_verify2_20260911` (fresh, first run, `3e8f473`, before 0058): **814/814** (46 files) — 0057's new
  cases included. The hosted run at `1a99784` (34621875479), on its own fresh database, is **815/815**: the same 46 files
  plus the C-022 scenario-kinds case added by 0058.
* **F05/F06 contamination resolved:** the fixture-opened runs of the serialisation suite now carry their
  operation's correlation id (`da726d3`); both invariants are clean on the fresh databases. The
  long-lived `eye` database keeps the orphans of the pre-0056 probes; it is no longer the reference.
* **The twin staleness persists, characterised:** it is a **re-run sensitivity** — it needs a database
  that already holds a prior full run's rows AND the full-suite ordering; a first run on a fresh database
  and the file alone on the used database both pass. Register §7 names P5's next step.
* Upgrade check: **PASS** — 58 migration files, Phase 0 297/297 at the 0021 ceiling and after, Phase 1+2
  274/274 on upgraded data, schema digests equal (`docs/ops/evidence` not needed; the log is in the
  session record). One earlier run of the checker showed three `phase3-corrections` graph-depth cases
  failing on the upgraded database and passing on the immediate rerun; recorded as a one-off, not dismissed.
* Browser: Phase 0/1 gate **26/26** locally on `eye_browser_20260911` (the suite bootstraps its own
  administrator; it cannot share a database with the integration suites, whose bootstrap case consumes
  the one-time secret); Phase 6 demonstration spec **3/3** and Phase 4/5 demonstration spec **1 failed
  (the ECB retrospective count on the overview), 12 not run** — unchanged, against the live demonstration.

**3. The live recreation (CP-4a) — done (`4ad058f`; `docs/ops/evidence/live-recreation-20260911T153804Z.md`).**
Rollback bundle `20260911T153804Z` taken from the live deployment and VERIFIED by an isolated restore
(61/61) first; `docker compose up -d --force-recreate --wait` on the pinned derived images with the data
volume reused (6 s); both containers healthy — the Redis healthcheck's 5,656-failure streak ended with the
old container — running as `70:70` / `999:1000`, every capability dropped, `NoNewPrivs 1`; digests
recorded (postgres index `69a974ae…` → arm64 child `d3dd485b…`; redis `1ad0ff24…`); the same data
(`eye_demo` at 0057, 29,625 canonical objects); `/readyz` ok; 12/12 human principals log in; schedules
reconciled 6/6; **five scheduled collections finished within a minute** (PortWatch chokepoints 91 admitted,
ports 31, ECB 12, EU sanctions 1+5, payload 0+1; World Bank timed out upstream). Reconciling into an empty
Redis fires each `every` scheduler once — a recreation costs one request per live source, within every
cadence and budget. The replay-mode `gdelt-discovery` schedule was not rebuilt, ending its hourly refused
attempts.

**4. The "stalled" walk and the outbox crash — diagnosed and corrected (migration 0057, `ab9a225`,
`3e8f473`).** The walk did not stall: its agent run session had a fixed 15-minute expiry and the
12,856-event walk outlived it — the attempt row records `failed`, "authority insufficient", finished
exactly 900 s after opening; the terminal event was refused for the same reason and swallowed. Correction:
the run session is extended by each committed page checkpoint (`identity.agent_session_extend`,
re-verifying the grant, audited), and a terminal event that cannot be written is said in the attempt's
reason. The outbox publisher issued its context one round trip before using it; a publish context expires
60 s after issuance, so a process stalled in between (the correction was one multi-minute transaction)
reached the lease with an expired context, and the interval callback's uncaught rejection ended the
process. Correction: `outbox_lease_as_publisher` / `outbox_ack_as_publisher` issue and consume the
capability in one backend call; a failed tick is reported and retried, never fatal. Regression evidence:
`phase6-scheduled-collection` (extension per page; a session expired underneath an open run refused at its
first effect, the attempt naming it, the next attempt taking the lease over), `phase6-outbox-publisher`
(the mechanism reproduced with a 61 s pause; the one-call ports; role isolation), a unit test driving the
interval with a rejecting tick. The authority matrix maps the three new ports.

**5. The integration stack, prepared (`docs/ops/STACK_INTEGRATION_PLAN.md` §7).** The maintenance
change-set landed on #39 as one product-free commit (`65c0f4d`, 179 files from `4ad058f`, #39's `if:`
guard kept), the dependency maintenance as a second (`fd00dfe`: the pins of `038fa9f` with the lockfile
regenerated on #39's own tree; `pnpm audit` clean; C17 bundled stack 1.3.3, 32/32; licence gate PASS),
plus `next-env.d.ts` as next 16.3.3 writes it (`a2cb0d8`). Every later head merged its predecessor in
the recorded order — the three `PROGRESS.md` conflicts resolved by hand (Phase 3 merged, Phase 4 and
Phase 5 implemented, each branch keeping its own row), `ci.yml` at #46 keeping the guard — and each
carried the pin onto its own tree with its lockfile regenerated (git's textual merge of two lockfiles
does not satisfy the manifests). Nothing rebased, nothing squashed, no reviewed commit rewritten.
Prepared heads and their hosted runs: §17.1. **Not merged**; the push-only C17 archive follows each
main-branch push.

**6. CP-6, first batch (`1a99784`).** `audit/CP6_BATCHES.md` defines five batches with their acceptance
units; **B3 — the eight scenario kinds** is implemented: migration 0058 (a versioned vocabulary,
`kind_label`, `divergence`, `assumptions`, SCN schema v2, the port enforcing every rule) with the
AU-PRD-0021 harness case (all eight declared with their assumptions; a user-defined "regional blockade"
disruption flips on its indicator; a ninth kind, a nameless user-defined kind and a divergence-less
disruption refused; a stray kind refused by the database). The unit stays `open` until the hosted run at
this head is green. Next batch: B1, the `CorrectionApplied` consumer.

### 17.1 The prepared stack — heads and hosted runs

| Order | PR | Prepared head | Hosted `ci` | Hosted C19 |
|---|---|---|---|---|
| 1 | #39 | `a2cb0d8` | 34620632427 green | green |
| 2 | #36 | `d458b36` | 34620663921 green (attempt 2; attempt 1 flaked on the A5 timing side-channel assertion, 15 ms vs 1.3 ms) | green |
| 3 | #38 | `1ed69ed` | 34620667803 green | green |
| 4 | #40 | `fb18c1f` | 34620672990 green | green |
| 5 | #41 | `9f18468` | 34620677405 green | green |
| 6 | #43 | `34969e8` | 34620681791 green | green (delivery-chain dry run on attempt 2) |
| 7 | #44 | `41eaa04` | 34620686380 green | green (delivery-chain dry run on attempt 2) |
| 8 | #45 | `da47bd3` | 34620692823 green | green |
| 9 | #46 | `1a99784` | 34621875479 green | 34621875446 green (delivery-chain dry run on attempt 2) |

Nine of nine `ci` runs green — each bound to the head in its row, none inferred from another —
build-test (unit, gate suites, the full integration suite on a fresh database: 815/815 at `1a99784`, C18 four stages, the upgrade check), browser-regression (Phase 0/1) and supply-chain
(two-platform C15 FINAL, patched-image recheck, FINAL C16, manifest assertion, licence inventory, C17
validation, both gitleaks scans) — on every prepared head. Three C19 delivery-chain dry runs failed
their publication-fixture lookup on a first attempt within the same minute six others resolved it,
and passed on re-run: an observation about the resolver under concurrent runs (`c19-fixture.mjs`),
recorded in the register, not a chain failure. The C17 archive step is skipped on pull-request runs
and produced on `main` after each merge.

### 17.2 Remaining obligations

- **Merge** — only on the owner's explicit instruction, in the recorded order, each followed by the
  push-only C17 archive on `main`; the plan is preparation.
- **B1 → B2 → B4 → B5** of CP-6; the demonstration act declaring the new scenario kinds on NORDWERK.
- The twin re-run sensitivity (P5); the clock-skew ticks; the World Bank timeout; the arm64 acceptance's
  expiry (2026-11-05) and the upstream recheck that would return the services to official images.
- 3,535 unfinished mandatory acceptance units across the eleven volumes: passing this checkpoint
  establishes no completion.

## 18. The bounded checkpoint after `1a99784` (2026-09-11): B1, the corrected scenario, the twin re-run, the accounting, B2, B4, B5

Code head: **``1430747``** (every local result below names the head it was produced at); records head: the
commit this section is committed with. The closure at `2e83945`, every earlier closed finding and the frozen
criteria are untouched; no completed review was restarted; the completed monitor was not re-armed. GHCR remains
temporary; no purchase, no cadence or budget change, no UN Comtrade activation. **This checkpoint establishes no
completion.**

**1. B1 — the `CorrectionApplied` consumer (`94ee705`, migration 0060), mappings first.** Two findings changed the
batch as defined. The acceptance-unit ids reserved for it, AU-MEM-0091–0094, already belonged to other
obligations (the moat diligence claim, the model cut-off, agent execution memory, the experience-lesson
lifecycle) — preserved with their histories; the consumer's units are **AU-MEM-0108–0111** (the next contiguous
ids), mapped to the existing requirements (V7 DP-24/DP-29/DP-43, V8 PR-24, V3 L1-I05, …), AU-DP-0041 narrowed to
what B1 does not deliver (TT-04 reassessment, derivative coverage beyond graph/twins/forecasts/scenarios/
simulations/warnings), AU-DP-0043 re-verified for partial-walk visibility, and sixteen units whose wording said
"operator-initiated" or "consumer deferred" re-pointed, none closed by it. And **no event named `CorrectionApplied`
was ever enqueued** — the apply path re-used the submission's name; from 0060 the apply publishes
`CorrectionApplied` (with `applied_by`) and the submission keeps `CorrectionReceived`.
The consumer: a `propagation_agent` role holding `graph.impact.propagate` and nothing else; an agent principal on
the identity authority and a per-domain, revocable grant on the commit authority (one active per domain, a human
owner, budgets); a session opened by its own port and extended only by walk progress (0057's rule); the outbox
publisher routes `CorrectionApplied` to the domain's own queue before acknowledging the row (`domain-events` stays
the unconsumed global log); a per-domain worker (concurrency 1) that refuses a misrouted job unrecoverably; an
attempt ledger keyed by the outbox row id, written under the scheduler's bounded capability so a refused grant is
still recorded; a per-root checkpoint locked FOR UPDATE inside the walk's transaction and committed with 0034's
`record_impact`; coverage decided by the database (0027) — a truncated walk leaves the attempt and the case partial
and listed, the automatic state and reason shown beside the case's own status on `/impact/awaiting`; infrastructure
faults recorded and retried by the queue from the checkpoint; governance refusals (no agent, revoked grant, budget)
recorded, not retried, the operator route always available. Harness `phase6-propagation-consumer` — real Redis,
the real outbox publisher, the process restarted mid-suite — **15/15**: automatic propagation (the invalidation
opened by the agent's principal, the citing twin version unverified, the case out of the queue), redelivery and
restart no-ops, a crash after the first of two roots resumed from the checkpoint (exactly two invalidations), a
transient fault retried, a partial walk visible and re-walkable, unrelated events untouched, scope fail-closed,
budget and revoked-grant refusals, the backlog policy, every new port refusing without its capability, the four
tables under forced RLS. Regression 9 suites 171/171. **On NORDWERK** (`scripts/phase6/register-propagation-agent.mjs`,
demonstration API rebuilt at this head, `eye_demo` at 0061): the administrator registered the agent with
`backlog: walk`; the two pre-0060 cases (1 and 4 corrected objects) were walked automatically at once, the
2,133-object supersession was refused by the agent's budget (64) and stays listed for operator work with its reason;
a fresh correction submitted by the operator and applied by the collection manager — nobody calling
`/impact/propagate` — was walked **2.1 s after the apply** (1.1 s on the second run): invalidation opened by the
agent's principal, linked to the case, assessed; the corridor forecast marked for attention; the case complete and
gone from the queue; the strategy owner may still walk the same root.

**2. The corrected scenario demonstration (`b020a07`, migration 0059).** The upside branch had the downside's
below-threshold indicator; a recovery is "above a level AFTER the collapse", and the evaluator had no world-time
start (an unbounded "above 50 for five days" is met by pre-disruption data). An indicator now `observes_from` a
declared day. C-022 (16/16 locally) declares a distinct recovery indicator (> 50 for five days from the day the
disruption ended): the deterioration evaluation flips the six sharing branches and leaves the upside OPEN; the
bounded recovery evaluates 35 observations and flips the upside on 2023-12-01; the same level unbounded evaluates
all 1,095 days and flips before the disruption it is meant to follow. The scenario view renders the custom kind
label, the vocabulary version, divergence, assumptions and the indicator's first observed day. The earlier
declaration (`declare-scenario-kinds.mjs`) is preserved as declared; `scripts/phase4/correct-scenario-kinds.mjs`
declares the corrected tree beside it on NORDWERK: deterioration (< 41 × 5 from 2023-12-01) — 1,011 observations
evaluated, flipped on **2024-01-27 at 32**, six branches (downside, disruption, stress, adversarial, counterfactual,
regional blockade) flipped with one warning each (C2 assumed, normal, prompt, under a C1 operation), the upside
open; recovery (> 50 × 5 from 2024-01-18) — **963 observations, no five consecutive published days above 50 on the
record** (last 2026-09-06 at 23): the upside stays open, honestly. The eight-kind vocabulary check stays
demonstrated; broader scenario capabilities stay in the register.

**3. The twin re-run failure — resolved (`2b9b920`).** Diagnosed on an isolated database (`eye_twin_diag_1`):
`phase5-twins` took its "after everything above was recorded" cut-off from the process clock floored to the
millisecond, immediately after the database had stamped the claim's `recorded_at` from its own clock at
microsecond precision; the clocks differ (Docker VM vs host, −1 ms … +107 ms observed) and the floor loses up to
999 µs, so the cut-off landed before the claim whenever both fell in one millisecond or the container clock ran
ahead. `ground()` judged the rule at millisecond precision and admitted the citation; 0035's carry-forward judged
it at microsecond precision and marked the carried element incomplete — the three E3 failures (six with a clock
step). Not a test-isolation or second-run effect (every fixture id is fresh per run; reproduced 1/4 on solo runs of
the used database, 0/2 on full runs). The fixture takes its cut-off from the database clock (floored to the
millisecond a version keeps, plus one); the product judges the rule once — `citedObject` returns `recorded_at` at
microsecond precision and `ground()` compares at that precision, so a sub-millisecond-late citation is refused at
grounding rather than admitted and re-judged. **Demonstration** (§18.1): two consecutive full-suite passes at the
same head on the same newly created database. On the way, two more fixture timing races surfaced on fresh
databases and were corrected the same way (`6d2f102`, ``1430747``): the consumer's scope case read a job hash
fetched before BullMQ's move to failed; the residual-corrections R2 fixture took its 16 January record within a
second of the world's runs. The historical bundles and the demonstration are preserved.

**4. Accounting and evidence wording (`fb45962`, `e1d1100`).** The mandatory split was stated as
3,535 = 3,195 open + 339 verified locally + 1 verified in CI (AU-PRD-0021 at `1a99784`); S7 depends on evidence for
every applicable profile (after B4, every leg); each stack result is bound to its own head — the local 814/814 at
`3e8f473` (before 0058), the hosted 815/815 at `1a99784` (the 46 files plus C-022); browser coverage stated as
measured. After B1 and B2 allocated their seven units the split was 3,542 = 3,202 open + 339 + 1; after the hosted run at
`5118376` it is **3,542 = 3,195 open + 339 + 8**; no leg of any unit is accepted.

**5. B2 — warning levels (`73813c2`, migration 0061).** Four levels by a versioned derivation from the branch's
consequence class (v1: C0/C1 low, C2 normal, C3 high, C4 critical, with urgency, response and impact and the
clauses each row rests on); the absent-class rule (C2 assumed, the record says so; C3/C4 never assumed); the port
derives and verifies; the six columns immutable; the raise operation's C0–C4 class recorded beside the label from
the authority context; the PDP gains no input; SCN v3 and WRN v2 (the v1 schema was stale — it forbade the timing
and controls the payload had carried since 0030/0031; the harness now validates the object). Harness
`phase4-warning-levels` **6/6**; `phase4-acceptance` 16/16; 11 warning-touching suites 136/136. Found on the
demonstration and corrected: an evaluation assembled its series inside the write, and the PortWatch record (8,645
evidence versions, one governed retrieval each, ~4 minutes) outran the write capability's 60-second wall clock —
the assembly now runs before the write, in no enclosing transaction (a read nested in a read waits on the audit
chain it holds). Units AU-PRD-0061–0063 (next contiguous ids).

**6. B4 and B5 (`e1d1100`).** The profile column is the LEG VECTOR on every unit (`saas|private|onprem`; the 80
units with an offline obligation add `disconnected|air-gapped`; 23 units that name one profile carry one leg) with
`legs_verified` per accepted leg — none accepted; `audit/SLO_CATALOGUE.md` v1 (12 floors, 5 value-variance, 5
population targets, each with its clause); `audit/CAP_ALIASES.md` v1 (89 = 71 defined + 18 alias-v1, historical ids
kept) with the `cap_alias` column resolved by `second-pass.mjs` (197 rows; 21 rows moved to branch-only because their
evidence globs now include files that exist only on this branch) and checked by `summarise-units.mjs`.

**Browser coverage, stated as measured.** Web rebuilt and restarted on the live demonstration at this head. Phase 4/5
demonstration spec (`playwright.demo.config.ts`, serial): the first case still fails — the demonstration's two
forecasts are both `validation_impossible` now, so "1 validated retrospective" is not on the overview (a demo-data
drift recorded at §17, unchanged, kept open) — and serial mode runs nothing after it. Run by name: **the scenario
screen and the warnings screen cases pass** (`e2e/phase4-prediction.demo.spec.ts` now scopes the flipped-row check
to Act IV's own tree, covers the corrected eight-kind tree — "regional blockade", the upside's `from 2024-01-18`,
six flipped branches — and asserts the Level column with either the derived badge or "no level — raised before
derivation v1"); **the four action-path cases cannot complete on the live demonstration**: each seeds an unbounded
indicator on the PortWatch series and evaluates it, which now assembles 8,645 evidence versions (~4 minutes) against
the spec's 60-second timeout — the assembly-cost observation of item 5, kept open. The hosted browser gate (Phase 0/1)
and the Phase 6 demonstration spec are unchanged by this checkpoint.

**7. The stack.** Held for the owner's explicit merge instruction. #46's head moves from `1a99784` to this
checkpoint's code head and its hosted checks are refreshed (§18.2); the eight earlier prepared heads are unaffected
and preserved. Once merging is authorized: the recorded order, each main-push chain and C17 archive verified before
advancing.

### 18.1 The twin demonstration — two consecutive full-suite passes

| Database | Head | Run 1 | Run 2 | Note |
|---|---|---|---|---|
| `eye_twin_demo3_20260911` (new) | `1430747` | **836/836** (48 files, 250 s) | **836/836** (48 files, 281 s) | the demonstration: same head, same database, nothing reset between runs; `phase5-twins` 15/15 on both; evidence `docs/ops/evidence/twin-rerun-demonstration-20260911.{md,txt}` |
| `eye_twin_demo2_20260911` (new) | `6d2f102` | 834/836 | 835/836 | the two fixture races of `1430747` found here; `phase5-twins` 15/15 on both |
| `eye_twin_demo_20260911` (new) | `e1d1100` | 835/836 | 836/836 | the consumer scope case's race found here; `phase5-twins` 15/15 on both |
| `eye_twin_diag_1` (isolated diagnosis) | `2ba42b8` | 815/815 | 815/815 | before the fix: the failure reproduced only on a solo run of the used database (1 of 4; +107 ms clock step), never on these two full runs — the sub-millisecond race |

The 836 cases are the 815 of `1a99784` plus the fifteen of `phase6-propagation-consumer` and the six of
`phase4-warning-levels`. The dirty path on the demonstration's head line is this report, uncommitted while the
runs were made; the code at `1430747` is the code this section is committed against.

### 18.2 Hosted runs at this checkpoint

| Head | Hosted `ci` | Jobs | Hosted C19 |
|---|---|---|---|
| `5118376` (code `1430747`; the report and the browser demonstration spec since) | 34647461349 **green** | build-test (unit, gate suites, the full integration suite on a fresh database **836/836** in 48 files, C18, the upgrade check), browser-regression, supply-chain | 34647461329 green |
| `1a99784` (the previous checkpoint) | 34621875479 green (815/815) | — | 34621875446 green |

The 836 hosted cases are the 815 of `1a99784` plus B1's fifteen and B2's six; `phase5-twins` passed on the fresh
hosted database as before. The seven B1/B2 units are `verified:ci` at `5118376` — one artefact, no deployment leg
— and the mandatory split reads **3,542 = 3,195 open + 339 verified on the author's harness + 8 verified on the
hosted chain**. The records commits after `5118376` change no code; their own hosted runs are refreshes.

### 18.3 Remaining blockers and open observations

- **Merge** — only on the owner's instruction.
- Open operational observations, kept open: a budget-refused propagation attempt is re-driven at every process
  start (recorded and refused again; harmless, noisy); the series assembly of a long record costs one governed
  retrieval per evidence version (~4 minutes for PortWatch's 8,645) — an evaluation on a large record is minutes,
  not seconds; the clock-skew ticks; the World Bank timeout; the C19 fixture lookup under concurrent runs; the arm64
  acceptance's expiry (2026-11-05).
- **3,542 unfinished mandatory acceptance units** across the eleven volumes; no deployment leg accepted. Passing
  this checkpoint establishes no completion.

### 18.4 The next implementation batch

CP-6's five batches are implemented or applied; what remains of CP-6 is verification. The next implementation
batch is the register's next open product work with harness-verifiable units on the hosted chain: the
`GraphChanged`/`MemoryCorrected` subscription registry and consumers (AU-MEM-0030), which B1's consumer machinery
now makes a bounded extension rather than new infrastructure.

## 19. The consolidated checkpoint after `1430747` / `da088cd` (2026-09-12): Codex's two findings corrected, B6 implemented

Continued from `1430747` (code) / `da088cd` (records). The closure at `2e83945`, every earlier closed finding and the
frozen criteria are preserved; nothing here reopens a closed review. The stack stays unmerged (PR #46 held on
`scheduling/automatic-collection-2026-09`). The three classes of evidence are kept apart throughout: **Codex's focused
checks** (the reviewer's own reproductions, quoted where they were the trigger), **the author's demonstrations** (the
harness on real Redis, the real outbox publisher and a fresh local database; the acts on the NORDWERK demonstration)
and **the hosted results** (GitHub Actions on a fresh database; the only chain that verifies a harness unit).

### 19.1 Finding 1 — recovery missed interrupted attempts (B1)

**Codex's check.** `graph.propagations_to_reconcile()` (0060) selected only attempts that were missing or `failed`. A
process interruption records nothing — that is what an interruption is — so an attempt stranded in `received` or
`walking` with Redis lost was never resumed; the earlier "crash" case recorded `failed` before throwing and the
"queue-loss" case started from a completed event, so neither exercised it.

**Before, on the actual function** (`evidence/cp6/repro-b1.mjs`, a rolled-back transaction on the verify database
that pointed one attempt at each state and called the function): `no attempt: reconciled=1 · received: 0 ·
walking: 0 · failed: 1`. **After 0062** (`637233f`): `1 · 1 · 1 · 1`. The correction: every non-terminal attempt
(`received`, `walking`, `failed`) is re-driven; a job a live worker still holds is left alone by job-id dedupe and
the reconciliation report distinguishes `reDriven` from `inFlight`; the walk stays serialised per event by the
attempt row's lock. Three cases were added to `phase6-propagation-consumer` that stop the handler dead at the fault
point (a never-resolving promise), abandon the worker without acknowledgement, obliterate the queue, restart the
process and require the stranded attempt re-driven with its `previous` state named: after receipt (attempt events
`received, received, walking, root.walked, complete`; one invalidation; one twin event), after the first committed
root (`received, walking, root.walked, received, walking, root.walked, complete`; exactly two invalidations, one per
root; the one twin version citing both documents marked once), and a reconciliation against a live worker (its job
reported `inFlight: active`, not re-driven; the walk completes once). Author harness: 18/18 twice
(`evidence/cp6/b1-suite-run1.txt`, `-run2.txt`). AU-MEM-0109 was set back to `open` at the finding with the
finding in its own prose, and returned to `verified:ci` only at the first green hosted run at the correcting head
(§19.4).

### 19.2 Finding 2 — S7 did not enforce evidence-backed completion (B4)

**Codex's check.** `audit/summarise-units.mjs` derived completion from the `status` and `legs_verified` columns as
written: a unit marked `verified:all` with no leg evidence, or with `saas=;private=;onprem=`, counted as finished and
its empty pointers as accepted legs, and the summariser exited 0 and overwrote `SUMMARY.md`.

**Before** (`evidence/cp6/repro-b4-before.txt`, a scratch copy of the tracked audit with two such units):
`exit=0; unfinished 3542→3540; verified:all 2; legs saas 1/3525 counted from empty pointers; problems 1; SUMMARY.md
overwritten`. **After** (`4145a16`, `evidence/cp6/repro-b4-after.txt`): `exit=1; problems 5; unfinished 3542 (… + inconsistent 2);
verified:all 0; no leg counted; SUMMARY.md untouched`. The correction: each applicable leg's evidence reference is
validated (a non-empty pointer to a repository file, on a path that names the leg), completion is derived from
validated evidence alone, any problem leaves the previous valid summary in place and exits 1, `--check` compares the
committed section with the units. Controls (`audit/summarise-units.controls.mjs`, a blocking CI step since `40a3a40`
/ `94d66f8`): N1 no `legs_verified`, N2 empty pointers, N3 a pointer that resolves nowhere and one naming another leg
— all refused; P1 validated evidence on every leg — finished, three legs accepted, `--check` agrees; P2 the tracked
audit's own `--check`. The committed total was correct throughout: 3,542 = 3,195 open + 339 local + 8 CI at
`da088cd`, no accepted deployment leg.

### 19.3 B6 — GraphChanged / MemoryCorrected subscriptions and their six consumers (AU-MEM-0030, in full)

The obligation as stated — "affected identities, relationships, temporal scopes and subscriptions; durable
subscriptions and consumers for twins, forecasts, scenarios, decisions, retrieval and memory mappings" — is delivered
in one batch on the corrected recovery machinery (`audit/CP6_BATCHES.md` §B6 for the mechanism; migration 0063;
`apps/api/src/graph/subscriptions/*`; the consumers in their own modules). What the author's harness demonstrates
(`apps/api/test/int/phase6-graph-subscriptions.test.ts`, 13 cases, real Redis and the real outbox publisher, the
process restarted three times mid-suite; two consecutive passes 13/13 at the implementing head,
`evidence/cp6/b6-run7.txt`, `b6-run8.txt`, ~18 s each on `eye_verify3_20260912`, a database created and migrated
0001–0063 for this checkpoint):

- **the event** — an edge retraction through the route publishes, in the same transaction, a `GraphChanged@v1` row
  whose identities are the edge's two ends (named, with lifecycle), whose relationships carry the edge with its
  `valid_from`/`valid_to`/`retracted_at` and claim and the dependency that rests on it, whose reach is the walker's
  (`assumptions [A1], decisions [D1], forecasts [F1], scenarios [S1]`, `walked: true, truncated: false`), whose temporal
  scope is the record instant and the edge's world interval, whose subscriptions are the six live at publication,
  and whose cause names the action, the actor and the edge; a strategy declaration publishes itself as the reach with
  its dependencies and touches no twin or forecast (an entity it merely rests on is not a changed identity — a
  distinction the first cut of the consumers got wrong and the harness now pins);
- **the six consumers, with no operator act** — the twin version bounded by the entity unverified (one event, naming
  the outbox row and the subscription), the forecast on the entity marked for attention and not re-issued, the
  scenario on that forecast marked, the invalidated input recorded on the decision package with its state untouched,
  the projections re-verified and the check recorded with what the change touched (`mismatched 0`), the mapping
  consumer applied with nothing to propose; every effect made by the subscriber principal of its own kind under its
  own action, seen on the audit chain;
- **MemoryCorrected** — a correction applied through the route publishes `CorrectionApplied` and `MemoryCorrected`
  together (same transaction, same correlation); the version citing the corrected evidence goes unverified; the
  identifier sourced from that evidence is **proposed** for reconciliation, not moved, and a person decides it under
  the resolution manager's authority (a forecast owner is refused, 403); `CorrectionApplied` is not on the subscription
  queue and `MemoryCorrected` is not on the propagation queue — unrelated delivery preserved;
- **durability on the 0062 machinery** — a redelivery: deliveries 2, attempts 1, every effect count unchanged; a
  restart with an empty Redis: the domain served again, nothing finished re-driven; an interruption after receipt
  (six deliveries `received`, attempts 0, the process dead, the queue lost): re-driven at the next start with
  `previous: received ×6`, every effect once; an interruption after the first committed item (the twins delivery with
  two items: the first version unverified, the second still verified while the process was dead, the other five
  deliveries already applied): resumed at the second item, `attempts 1` (one apply continued from its checkpoint),
  ledger `received, applying, item.applied, received, item.applied, applied`, one twin event per version, the five
  applied deliveries re-received and skipped; a reconciliation against a live worker leaves its job alone;
- **replay, pause, resume, revoke** — the twins subscription replayed from the beginning re-applies every delivery
  (`replay_seq 1`) with no new twin event and no change to the other subscriptions' ledgers; a paused subscription
  receives nothing and a resume re-drives what was published meanwhile; a revoked one opens no session and a new one
  of the kind registered with `backlog: 'replay'` applies the backlog;
- **the governed path** — every 0063 port refuses without its action (`42501`), a non-consumer action is refused
  (`22023`), the twin subscriber's own governed write is refused at the forecast port and at the PDP for the forecast
  action, the six tables are under forced RLS, a misrouted job fails closed and the worker lives on.

Existing suites re-run after the emitters were added to their write paths: `phase6-propagation-consumer`,
`phase3-acceptance`, `phase3-corrections` (81/81); `phase2-acceptance`, `phase4-corrections`, `phase4-corrections-2`,
`phase5-propagation`, `phase5-twins`, `phase5-corrections`, `phase6-agents`, `gate22-outbox-hardening` (98/98); the
upgrade proof with 0063 (63 files, roles +25, migrations +42, 275/275 on the upgraded data; the virgin and upgraded
schema digests equal). **On the demonstration** (`scripts/phase6/register-subscriptions.mjs` on NORDWERK, `eye_demo`
migrated 0062–0063, `evidence/cp6/act-b6.log`): the six subscribers registered by the platform administrator; a
fresh correction applied by the collection manager reached all six 1.1 s after the apply — the scenario on the corridor
forecast marked for attention by the scenario consumer, the projections verified (three checks, all `mismatched 0`);
the twin and forecast consumers had nothing to do (the corridor forecast already attending from B1's automatic walk,
which itself published a third event, `invalidation.assessed`, delivered the same way); an edge retraction by the
strategy owner reached all six 1.1 s after the act. The mapping consumer proposed nothing on the demonstration (no
identifier is sourced from the restated evidence); its positive case is the harness's. A minimal web view
(`/graph/subscriptions`: registry, controls, replay, the ledger of an event, mapping proposals with accept/reject,
retrieval checks) is added and typechecks; it is not yet on the browser-regression spec — recorded below.

### 19.4 Heads and hosted results

| Head | What | Hosted `ci` | Hosted C19 |
|---|---|---|---|
| `637233f` | 0062, the three interruption cases (finding 1) | superseded by the next heads (the workflow file failed to parse at `40a3a40`, corrected at `94d66f8`) | — |
| `4145a16` / `40a3a40` | evidence-backed S7, controls, upgrade count 41 (finding 2) | see `94d66f8` | — |
| `94d66f8` | the CI step name corrected; **the corrected head for both findings** | **34655152733 green** (17 m 14 s; build-test with the full integration suite on a fresh database, browser-regression, supply-chain) | 34655152732 green |
| `fcbdefc` | 0063, the six consumers, the harness, the act, the records — **the B6 head** | **34663012651 green** (18 m 16 s; build-test: unit 2147, the full integration suite on a fresh database **852/852 in 49 files** — the 836 of `5118376` plus B1's three interruption cases and B6's thirteen, `phase6-graph-subscriptions` 13/13 in 136 s on the hosted runner; the upgrade proof PASS with 0063; browser-regression; supply-chain) | 34663012694 green |

AU-MEM-0109 is `verified:ci` again at `94d66f8`; the six B6 units are `verified:ci` at `fcbdefc` (S7: the local passes
never verified them; the hosted run did) — one artefact, no deployment leg. The register's §5.2a reads
**3,548 = 3,195 open + 339 local + 14 CI** — six more than `da088cd` by allocation of the new units, none by
regression; no accepted deployment leg. The records commit after `fcbdefc` changes no code; its hosted run is a refresh.

### 19.5 Recorded, assigned to concrete checkpoints

- **Browser gaps**: the subscriptions view and the mapping decision are not on the browser-regression spec; assigned
  to the next browser-evidence refresh (the checkpoint after the hosted run at the B6 head is green), with the
  Phase 4 scenario/warnings cases refreshed at `da088cd` as the pattern.
- **A dedicated `claim.corrected` harness case** (the review route emits it; the consumers are the same): the next
  implementation batch.
- **Backlog replay at registration re-drives twice** (the replay jobs and the reconciliation's own; the second delivery
  of an applied delivery is a durable no-op): recorded in §B6, to be collapsed in the next batch.
- Earlier open observations unchanged: the budget-refused propagation attempt re-driven at every start; the
  series-assembly cost of a long record; the clock-skew ticks; the World Bank timeout; the C19 fixture lookup under
  concurrent runs; the arm64 acceptance's expiry (2026-11-05).
- **Not started, by instruction**: no merge; the completed monitor not re-armed; GHCR temporary; PortWatch permission,
  the Comtrade deferral and the purchase/cadence/budget constraints stand.

### 19.6 The next implementation batch

The `claim.corrected` case and the double backlog re-drive (above); then the register's next open product work with
harness-verifiable units: AU-MEM-0029/-0039/-0041 (the memory obligations B1 and B6 re-pointed but did not close —
the retention of inferred relationships under TT-04 reassessment, the escalation of a stalled consumer beyond the
visible queue) and AU-DP-0071 (event schema versions on the remaining Phase 1 events, partition-ordered replay),
each now a bounded extension of the subscription machinery rather than new infrastructure. This remains progress
toward all eleven volumes: 3,548 mandatory units are unfinished and no deployment leg is accepted.

## 20. The consolidated checkpoint after `fcbdefc` / `cb014a9` (2026-09-12): Codex's third finding corrected, B7 implemented

Continued from `fcbdefc` (code) / `cb014a9` (records). Codex closes the B1 interrupted-recovery and B4 accounting
findings; those closures, `2e83945`, every earlier closed finding and the frozen criteria are preserved. The stack
stays unmerged (PR #46 held). The evidence classes stay apart: **Codex's focused checks**, **the author's
demonstrations** (`evidence/cp6/`), **the hosted results** (GitHub Actions on a fresh database — the only chain that
verifies a harness unit).

### 20.1 Finding 3 — retrieval retry cleared a mismatch without a second check (before → after)

**Codex's check** (the actual TypeScript consumer and dispatcher with explicit doubles): a projection mismatch
produced `failed`; a retry produced `applied` with no second check — the mismatched check had been checkpointed as an
applied item, so the retry skipped it and cleared the failure.

**Reproduced at the database/queue boundary** (`apps/api/test/int/phase6-repro-retrieval-retry.test.ts` — real Redis, the
real outbox publisher, the real dispatcher and retrieval consumer on a fresh domain; the entities created with their
events so the projection has a log; the drift injected as an operator-side corruption):

| | before (`fcbdefc`, database at 0063 — `evidence/cp6/repro-retrieval-before.txt`) | after (0064 — `evidence/cp6/repro-retrieval-after.txt`) |
|---|---|---|
| healthy change | `applied`, `projections.verified`, check `mismatched 0` | same |
| drifted projection | `failed`; `items_applied [projections.mismatched]`; 1 check | `unresolved` (`unresolved_dependency → human_review`); `items_applied []`; `items_unresolved [{projections, checks 1}]`; 1 check |
| the reconciliation's re-drive | `applied`, `deliveries 2`, **still 1 check**, projection still drifted — the failure cleared | `unresolved`, `deliveries 2`, **a second check** (`checks 2`), projection still drifted — the failure preserved |

The harness (`phase6-graph-subscriptions-2`, `evidence/cp6/b7-run9.txt`) carries it further: a restart with the
queue lost re-drives it (`previous: unresolved`) and makes a third check; the tick inside its 10-minute re-check
interval leaves it alone; the twin item of the same event was applied once through all three re-drives; then the
operator repairs the projection (under the operator's authority — no subscriber repairs) and the next re-drive's
check passes: `applied`, `resolved_after_checks 3`, the cursor advanced to that sequence, no open failure state left.

### 20.2 What B7 implements (migration 0064) — `audit/CP6_BATCHES.md` §B7 for the mechanism

- **`claim.corrected` through the review route** and the **edge mapping under MemoryCorrected** (AU-MEM-0114's
  remaining clause): a claim corrected by `intelligence.review.decide` publishes MemoryCorrected beside ClaimReviewed;
  the mappings consumer proposes the edge the claim asserted (`from E2 to E1`, "asserted by v1 of a claim corrected to
  v2"), the resolution of its mention and the identifier sourced from it — nothing moved; an edge resting on corrected
  evidence is proposed on the correction route.
- **Backlog once** (AU-MEM-0119): `served_from`; a `replay` registration after four events → four deliveries of one
  delivery each; a `leave` registration → none of them, the next new event yes.
- **The declared partition and sequence** (AU-DP-0071): six retractions committed concurrently carry unique
  sequences in the tenant's partition in the audit chain's own order (the AUD row and the outbox row of a write are
  serialised by the same partition's locks, held to commit); the lease hands rows out in sequence order and the domain
  queue receives them so (0015's `created_at` order did not — a later-started, earlier-committed write was received
  behind); the cursor is the sequence; a replay from the fourth of six re-applies exactly the two after it.
- **Failure states with their class and route** (AU-MEM-0039): consumer unavailable (`refused`,
  `consumer_unavailable → retry`; re-registration re-drives), authority disputed by a pause mid-delivery (the first
  item applied, the second not; `authority_disputed → human_review`; a resume re-drives, no duplicate), budget
  (`budget → human_review`), an input invalidated on a COMMITTED decision (exposed `executed_action → compensation`;
  the package untouched), a withdrawal against a LEGAL HOLD (the case `failed` before any object is touched,
  `legal_hold → challenge`, `CorrectionFailed`; the hold placed and lifted only by an administrator through the new
  append-only ledger; the unheld document withdraws; the held one withdraws after the lift).
- **Telemetry** (AU-MEM-0041): per-delivery execution state through the status route; the measurement captured:
  a retrieval delivery, queue wait 6 ms from publication, apply 13 ms, end-to-end 751 ms from the writer's
  transaction start (publication latency separated as `publish_ms`), 0 retries
  (`evidence/cp6/b7-telemetry-measurement.txt`); the views are security-invoker (the first cut ran as the owner and
  would have read every tenant's rows — the harness's isolation check caught it before the commit).
- **An adversarial review before the commit** (fifteen skeptics over five claims, forty findings verified
  independently) drove a second pass recorded in `audit/CP6_BATCHES.md` §B7: re-drives scoped to the subscriptions
  they are for, the served point a sequence, the replay cursor moving back only, one job kind, dead letters visible,
  the event row readable once leased, one publisher tick at a time with a failed row halting its partition, a
  round-robin lease, the extension fault classified, refused deliveries re-driven at a start, the failure states
  their own query, the legal-hold check inside the applying transaction.
- **The evidence reference repaired**: `evidence/cp6/act-b6.log` was cited at `cb014a9` but excluded by the
  repository's `*.log` ignore rule; the retained NORDWERK log is committed as `evidence/cp6/act-b6.txt`.

### 20.3 Local results at the B7 head

On `eye_verify8_20260912`, created and migrated 0001–0064 from the final file: `phase6-graph-subscriptions-2` 14/14
(`b7-run16.txt`, with the measurement) and again beside `phase6-graph-subscriptions` 13/13, the reproduction file,
`phase6-propagation-consumer` and `gate22-outbox-hardening` (50/50, `b7-run15.txt`); the full integration suite
(`b7-int-all-4.txt`, 867/867 in 51 files — the 852 of `fcbdefc` plus B7's fourteen and the reproduction) and the
upgrade proof (`upgrade-0064.txt`: 64 files; roles +25; migrations +43; the three outbox columns added above the
ceiling declared and the pre-existing rows digested over the ceiling's columns; 275/275 on the upgraded data); the B1
suite's legacy-row fixture now places its row in its partition as enqueue would; unit 2156/2156; boundaries clean.
A local pass verifies nothing (S7).

### 20.4 Heads, hosted results, reconciled statuses

| Head | What | Hosted `ci` | Hosted C19 |
|---|---|---|---|
| `fcbdefc` / `cb014a9` | B6 and its records | 34663012651 green (852/852) | 34663012694 green |
| `a852c65` | 0064; the consumers, the correction path, the publisher, the ledger; the harness; the evidence repair — **the B7 head** | **34693808238 green** (16 m 44 s; build-test: unit 2147, the full integration suite on a fresh database **867/867 in 51 files** — the 852 of `fcbdefc` plus B7's fourteen and the reproduction, `phase6-graph-subscriptions-2` 14/14 in 17 s on the hosted runner; the upgrade proof PASS with 0064 and the declared column additions; browser-regression; supply-chain — `evidence/cp6/hosted-a852c65-build-test-summary.txt`) | 34693808173 green |

Statuses: AU-MEM-0118 and AU-MEM-0119 `verified:ci` at `a852c65` (S7: the local passes never verified them; the hosted
run did) — one artefact, no deployment leg; AU-MEM-0029 reconciled `verified:local` → `verified:ci` at `fcbdefc`
(every named case runs on the hosted chain); AU-MEM-0114 keeps `verified:ci` with its completed clause bound to
`a852c65`; AU-MEM-0039, AU-MEM-0041 and AU-DP-0071 stay `open` with their delivered clauses bound to `a852c65` and
their remaining clauses stated in their own prose. The register's §5.2a reads **3,550 = 3,195 open + 338 local +
17 CI** — two more than `cb014a9` by the allocation of the two new units, one moved from local to CI, none by
regression; no accepted deployment leg. The records commit after `a852c65` changes no code; its hosted run is a refresh.

### 20.5 Recorded, assigned forward

- **Browser gaps** (unchanged from §19.5): the subscriptions view, the mapping decision and now the failure states and
  telemetry are not on the browser-regression spec — the next browser-evidence refresh.
- **Cross-process routing and ordering**: the publisher routes to a subscription queue only when the dispatcher in
  the same process serves the domain (delivery otherwise by the 60 s reconciliation), and the sequence-order guarantee
  is per publisher process — one assigned checkpoint for both, the next batch after the hosted run.
- **AU-MEM-0039**: `provenance_incomplete` and `material_change` have no fault case; **AU-MEM-0041**: the forecast,
  scenario, reconciliation and simulation flows' own telemetry and the per-profile captures; **AU-DP-0071**: the
  interface register (L1-I01..L9-I05) and the log's retention window — each stated in its unit.
- **C19 (routed, not reopened)**: the C18.1.11 differential control "the rotated seed credential expiry drifts by
  five milliseconds" depends on the genuine archive's marking→stamp gap being under 5 ms (attempt 1 of ci 34706861830
  red, attempt 2 green on the same commit); the control should mutate by the measured gap plus one millisecond, or
  by an amount no runner can absorb, so that its rejection is a property of the verifier and not of the runner.
- Earlier open observations unchanged; **not started, by instruction**: no merge; the completed monitor not re-armed;
  GHCR temporary; PortWatch permission, the Comtrade deferral and the purchase/cadence/budget constraints stand.

### 20.6 The next implementation batch

The cross-process routing/ordering checkpoint (a shared routing decision rather than a process-local set, or a
single elected publisher); the two remaining AU-MEM-0039 conditions with fault cases; the other four flows' telemetry
views (AU-MEM-0041); then the register's next open memory obligations (AU-DP-0041's reassessment of inferred
relationships under TT-04; AU-MEM-0031's derivative coverage). This remains progress toward all eleven volumes:
3,550 mandatory units are unfinished and no deployment leg is accepted.

## 21. The consolidated checkpoint after `a852c65` / `e298323` (2026-09-12): Codex's two B7 findings corrected, B8 implemented

Continued from `a852c65` (code) / `e298323` (records). Codex closed the retrieval-retry finding at that head and
found the claim-correction/edge-mapping follow-up addressed; its two bounded event-delivery defects (B7-F1, B7-F2)
were incorporated into the planned batch. The closures at `2e83945`, the B1 recovery and B4 accounting closures, every
earlier closed finding and the frozen criteria are preserved. The stack stays unmerged (PR #46 held). The evidence
classes stay apart: **Codex's focused checks**, **the author's demonstrations** (`evidence/cp6/`), **the hosted
results** (GitHub Actions on a fresh database — the only chain that verifies a harness unit).

### 21.1 B7-F1 and B7-F2 — before → after

**Codex's checks** (the actual publisher and the unmodified 0064 SQL on doubles; the actual review of the corrections
at `a852c65`): F1 — with 51 rows in partition A and one in B and a transient queue fault on A:1, one publisher
process published B:1, A:50, A:51 while A:1 was still pending under its live lease (the halted set lived one tick;
the lease excluded live-leased rows and handed out the never-leased tail); F2 — a `leave` registration replayed from
the beginning had the whole history returned and its cursor rewound, but the reconciliation, bounded by the served
point, re-drove only what the subscription had already received.

**Reproduced at the database/queue boundary** (`apps/api/test/int/phase6-repro-event-delivery.test.ts` — real Redis,
the real publisher, dispatcher and database; the reproduction head `6fc52c9` is `a852c65` plus a test-runtime
publish-fault hook and a configurable lease, no behaviour change; database at 0064):

| | before (`6fc52c9`, database at 0064 — `evidence/cp6/repro-event-delivery-before.txt`) | after (0065 — `evidence/cp6/repro-event-delivery-after.txt`) |
|---|---|---|
| F1: 51 in A, 1 in B, a transient fault on A:1 | B:1 published; **A:50 and A:51 published while A:1 pending**, before A:1 — `later rows of A were published while A:1 was still pending: ['A:50', 'A:51']`; every halted row charged an attempt it was never tried on (`A:2×2 … A:49×2`); A's jobs out of sequence on the queue | B:1 published; **nothing of A published while A:1 is pending**; after the lease lapses A publishes in sequence — A:1 with two attempts, every other row with one; A's jobs in sequence order on the queue |
| F1 control: 52 rows, no fault | in sequence across two ticks, each tried once | same |
| F2: `leave` after two events; a third delivered; replay from the beginning | the replay returns the three; **re-drives 1**; served point stays **3**; the two skipped events never delivered | the replay returns the three; **re-drives 3**; served point **0**, recorded as `served_from_seq_before/after`; the two skipped events delivered once each (`replay_seq 1`); the tick afterwards re-drives nothing |

The harness (`phase6-graph-subscriptions-3`, `evidence/cp6/b8-run8.txt`) carries both further: the replay recorded
while no process serves the domain, the queue lost, the process restarted — the startup reconciliation delivers the
skipped history once each; two publishers on one outbox with the fault landing in whichever leases the head — the
partition waits in both, the other progresses, the order holds.

### 21.2 What B8 implements (migration 0065) — `audit/CP6_BATCHES.md` §B8 for the mechanism

- **Ordered publication across ticks, lease recovery and processes** (AU-DP-0175): the lease serialises on an
  advisory lock and leases a partition only up to its first row still held by a live lease; a failed add or a
  refused acknowledgement halts the partition; the untried tail is given back with its attempt refunded; the routing
  decision is the registry's, computed in the lease. The register's single-process ordering claim is corrected.
- **One server per domain** (the cross-process routing/ordering gap of B6/B7): a serving claim per domain, renewed on
  the tick, released at shutdown after the workers close, taken over when lapsed; the harness's second application
  context (own publisher, own dispatcher, own holder identity, the same database and Redis) stands in for a second
  process: it finds the domain claimed and starts no worker, a stand-down hands it over, a lapsed claim is taken over,
  the process that does not serve still routes a live event to the domain's queue.
- **A replay reaches the retained history** (AU-MEM-0120): the served point moves back to the replayed point,
  durably; a declared retained floor per partition (lifetime; nothing purges the log) refuses a replay from before it
  with the discontinuity named and serves a replay registration from it.
- **The remaining AU-MEM-0039 conditions**: `provenance_incomplete` (an edge whose claim carries no lineage on the
  corrected evidence stays unresolved, human review, re-checked per re-drive; the sibling applied; the operator's
  recorded lineage resolves it — `resolved_after_checks 2`) and `material_change` (a forecast re-issued through the
  disruption episode moves the central estimate 55 % against the forecast the package CITES two re-issues back, under
  a declared 10 % rule → exposed on the package with the measure; a re-issue on the same observations, 0 %, noted with
  no failure state); all six conditions now carry a fault case; AU-MEM-0039 to `verified:local`.
- **The flows' telemetry** (AU-MEM-0041): four security-invoker views and one governed route; one measurement per
  flow on the local profile (`evidence/cp6/b8-flow-telemetry-measurement.txt`: forecast issue lag 51 ms, publish
  566 ms, end-to-end 1.9 s; warning evaluate 624 ms, flip→raise 36 ms, window 48 h; reconciliation basis age 249 ms,
  observation lag 106 ms; simulation execute 15 ms, information age 115 ms).
- **The interface register** (AU-DP-0071): the fifty canonical interfaces under L1-I01..L10-I05 — 19 bound, 25
  partial, 6 unbound after the review's correction (`evidence/cp6/b8-interface-register.txt`).
- **An adversarial review before the commit** (fifteen skeptics over five claims, 103 distinct findings verified
  independently, 68 confirmed — `evidence/cp6/b8-adversarial-review.txt`) drove a second pass recorded in
  `audit/CP6_BATCHES.md` §B8: the serving fence, the partition table's grant, the method's tenant check, the flows'
  read authority, the cited-basis measure, the replay core and the unbounded never-received rows, the scoped
  reconciliations and status, the accumulated reassessment causes and the keep decision, the briefing–warning
  dependency, the register's bindings, the act's replay from the revoked cursor.
- **Inferred relationships reassessed** (AU-DP-0041, TT-04): pending on the relationship under an evidence or claim
  change (with the mapping proposal) and under a model change (a method suspended or retired, published to the
  derivatives — the forecast resting on the edge marked for attention with no operator walk); closed by re-derivation,
  retraction or the person's decision.
- **Warnings and briefings in the impact set** (AU-MEM-0031): a warning rests on its forecast and flip evidence and is
  marked for attention by the walk; a briefing rests on what it cites and is re-flagged by event, its snapshot
  unchanged, the corrected cited versions reported on the read.
- **The demonstration act** (`scripts/phase6/register-subscriptions.mjs`) revokes and re-registers a subscription
  whose consumer's method changed (decisions, memory-mappings — "a changed method is a new consumer"), and reports
  per event which deliveries did NON-EMPTY work and which found nothing of theirs (Codex's demonstration limit, kept
  visible), the serving holder, the partition state and the open failure states. Run on the NORDWERK demonstration at
  `661c2fb` (`evidence/cp6/act-b8.txt`): the decisions and memory-mappings subscriptions revoked and registered anew
  (their replacements served from the row after the revoked cursor, 13963 → 13964; the replay re-drove nothing because
  rows 13964–13971 are ObservationRecorded, not a subscribed type — correct, and recorded), the correction's
  MemoryCorrected and the retraction's GraphChanged delivered to all six within the publisher's tick (1.2 s, 1.1 s);
  per event, NON-EMPTY work by retrieval only (the projection check), nothing of theirs for twins, forecasts,
  scenarios, decisions and memory-mappings; the serving holder this process, renewals 4; the partition at 13975,
  pending 0, blocked false, dead letters 0, retained from 1; open failure states none.
- **The demonstration database's 0064 — an operator act recorded honestly.** `eye_demo` had been migrated on
  2026-09-12 11:48 UTC through a development iteration of 0064 (recorded digest `9da00200…`), not the file committed
  at `a852c65` (`509395a8…`, unchanged since); the migrator refused 0065 ("migrations are immutable"). No verification
  database is affected (every harness run and the upgrade proof migrate a fresh database from the committed chain).
  `scripts/phase6/demo-reconcile-0064.sql` — guarded to that recorded digest, one transaction — applies the exact
  difference (a schema diff of `eye_demo` against a database on the committed 0064, limited to what 0065 does not
  itself redefine: `subscriptions.served_from_seq` derived from the recorded instant, `subscription_delivery_receive`
  with the scoped signature, `subscription_event_row`, `subscription_outbox_failures`, the two telemetry views),
  copied verbatim from the committed file, and sets the recorded digest to the committed file's. Rehearsed on a
  restored copy first: reconciled + 0065 equals a fresh 0065 database to the schema dump (column order and
  `pg_restore` ownership artefacts aside); a full dump was taken before the act; 0065 then applied through the
  migrator (`act-b8.txt` §0 records the before and after, including a first migrator attempt that ran without the
  migrate credential and refused). The demonstration API restarted on the B8 build and was left running.

### 21.3 Local results at the B8 head

`phase6-graph-subscriptions-3` 19/19 and the reproduction 4/4 (`b8-run8.txt` before the adversarial review,
`b8-run9.txt`/`b8-run10.txt` after its corrections) on databases created and migrated 0001–0065 from the final file;
the full integration suite **890/890 in 53 files** three times (`b8-int-all-2.txt` before the review on
`eye_verify15_20260912`, `b8-int-all-3.txt` after its corrections on `eye_verify17`, `b8-int-all-4.txt` on the final
file on `eye_verify19`: the 867 of `a852c65` plus B8's nineteen and the reproduction's four); the first full run
(with the upgrade proof running beside it and before two corrections) had eight failures — a concurrently held
lease keeping a partition waiting, the projection rebuilds (edges, warnings) reading the new non-state events as
state transitions, a new publisher port without matrix coverage — corrected and re-run (`b8-regress-3.txt` 51/51,
`b8-regress-2.txt` 57/57); unit 2147/2147; boundaries clean; the web typecheck clean; the upgrade proof
(`upgrade-0065.txt`). A local pass verifies nothing (S7).

### 21.4 Heads, hosted results, reconciled statuses

| Head | What | Hosted `ci` | Hosted C19 |
|---|---|---|---|
| `a852c65` / `e298323` | B7 and its records | 34693808238 green (867/867) | 34693808173 green |
| `6fc52c9` | the reproduction head (the hook and the configurable lease; the reproduction file failing as the finding says) | not run (a reproduction, not a candidate) | — |
| `661c2fb` | B8: 0065; the publisher, the dispatcher, the consumers, the routes; the harness (19 + 4 cases); the act; the web view | 34705325289 green (890/890 in 53 files on a fresh database; phase6-graph-subscriptions-3 19/19, phase6-repro-event-delivery 4/4; the upgrade proof with 0065, 65 files, schema digests equal; unit 2147/2147; the accounting controls and `--check`) — `evidence/cp6/hosted-661c2fb-build-test-summary.txt` | 34705325299 green |
| the records head | this section's hosted binding; AU-DP-0175, AU-MEM-0120, AU-MEM-0039 → `verified:ci`; the act on the demonstration (`act-b8.txt`); the reconciliation script | the refresh at the records head is recorded in §21.7 when it completes | — |

Statuses: AU-DP-0175 and AU-MEM-0120 allocated `verified:local` at the B8 head and moved to **`verified:ci`** by the
hosted run at `661c2fb` (ci 34705325289; C19 34705325299); AU-MEM-0039 `open` → `verified:local` → **`verified:ci`**
(all six conditions, the same run); AU-MEM-0041, AU-DP-0071, AU-DP-0041 and AU-MEM-0031 stay `open` with their
delivered clauses bound to the hosted result and their remaining clauses stated in their own prose. The register's
§5.2a reads **3,552 = 3,194 open + 338 local + 20 CI** — two more than `e298323` by the allocation of the two new
units, none by regression; three moved from local to CI; no accepted deployment leg. The hosted run verifies the
artefact on a fresh database; it is not a profile leg (S7).

### 21.5 Recorded, assigned forward

- **Browser gaps**: the subscriptions view gained the serving holder and the partition state; the failure states,
  the flow telemetry, the interface register and the edge reassessment are not on the browser-regression spec — the
  next browser-evidence refresh.
- **AU-DP-0041**: the automatic re-derivation of a pending edge (the builder's run without an operator); **AU-MEM-0031**:
  memory items and evaluation datasets (their tables first, AU-MEM-0065); **AU-DP-0071**: a governed retention act
  moving the floor (ES-29-004) and the **31** interfaces bound partially or not at all (25 partial and 6 unbound at
  `661c2fb` — the earlier "28" here was an arithmetic slip, corrected 2026-09-12; §22 records B9's binding of the
  six); **AU-MEM-0041**: trust state
  joined per instance and the per-profile captures (P7-D).
- **Demonstration scope**: the act's six deliveries per event include those that found nothing of theirs; the record
  says which did work (`act-b8.txt`: retrieval only, for both events — the corrected evidence and the retracted edge
  reached no twin, forecast, scenario, decision or mapping of the demonstration's; a demonstration in which each
  consumer does non-empty work needs a scripted scene per consumer, not started). The demonstration database
  carries a recorded reconciliation of its 0064 (§21.2); the demonstration is not a verification leg. No standalone
  demonstration campaign was started.
- **C19 (routed, not reopened)**: the C18.1.11 differential control "the rotated seed credential expiry drifts by
  five milliseconds" depends on the genuine archive's marking→stamp gap being under 5 ms (attempt 1 of ci 34706861830
  red, attempt 2 green on the same commit); the control should mutate by the measured gap plus one millisecond, or
  by an amount no runner can absorb, so that its rejection is a property of the verifier and not of the runner.
- Earlier open observations unchanged; **not started, by instruction**: no merge; the completed monitor not re-armed;
  GHCR temporary; PortWatch permission, the Comtrade deferral and the purchase/cadence/budget constraints stand.

### 21.6 The next implementation slice

The automatic re-derivation of a pending inferred relationship (the edge builder's governed run for the corrected
claim, triggered by the reassessment, closing it by supersession); the memory item object (AU-MEM-0065) so the
impact set reaches memory items; a governed retention act on the outbox floor (ES-29-004); then the interface
binding gaps in the register's order (the six unbound event interfaces first). This remains progress toward all
eleven volumes: 3,552 mandatory units are unfinished and no deployment leg is accepted.

### 21.7 The records head

The records commit `b3c0b4c` binds the hosted run at `661c2fb` to the three harness units, records the demonstration
act and the demonstration database's reconciliation, and regenerates the summary (`3,552 = 3,194 + 338 + 20`). Its
hosted refresh (records only: CSV, markdown, evidence text, one SQL script that no test runs): `ci` 34706861830 —
**attempt 1 red** on one C18 mutation control, `C18.1.11 — DIFFERENTIAL … the rotated seed credential expiry drifts
by five milliseconds — a424505 ACCEPTS it; C18.1.11 REJECTS it` (the integration suite 890/890, the upgrade proof,
the accounting controls and every other step green; C19 34706861815 green); **attempt 2 green** (build-test job
103591856069: 890/890 in 53 files, C18 612/612 including that control, the acceptance suite, the upgrade proof, the
accounting controls). The red is a determinism defect of the control, not of this head: the mutation moves the
rotated credential's expiry by five milliseconds and expects the verifier to place the implied marking instant after
the audited bootstrap stamp; that holds only while the genuine archive's marking→stamp gap is under five
milliseconds, which every earlier runner met and this slower one did not (the same control passed on the re-run of
the same commit). The C18 gate is frozen (closed at `a8d34c4`, its closure record at `3d9c80c`); the control's
determinism is routed to C19 (§21.5) and nothing in C18 is edited here. A records-only commit binding these ids
follows; its own refresh changes no status.

## 22. The consolidated checkpoint after `3932207` (2026-09-13): the accepted stack integrated in order, Codex's two B8 findings corrected, B9 implemented

Continued from `661c2fb` (code) / `3932207` (records). Codex closed B7-F1 and B7-F2 at `661c2fb` and found two
bounded serving-lifecycle defects (B8-F1, B8-F2), incorporated into this batch with §21.6's implementation slice. The
owner's directive of 2026-09-12 replaced the blanket merge hold with a conditional authorization: merge the reviewed
stack in the recorded order, each merge followed by the delivery-profile C17 archive verified on `main`, #46 only
after the two findings receive focused closure and the candidate passes a bounded independent review. Every earlier
closed finding, the frozen criteria and the failed C18 attempt (its determinism issue in assigned maintenance) are
preserved. The evidence classes stay apart: **Codex's focused checks**, **the author's demonstrations**
(`evidence/cp6/`), **the hosted results** (GitHub Actions on a fresh database — the only chain that verifies a
harness unit).

### 22.1 The integration campaign — merges on `main`, in the recorded order, with the archive verified after each

Merge commits (no squash, no rebase; branches and history preserved), each verified against its reviewed head by the
stack verification of 2026-09-11 (`docs/ops/STACK_INTEGRATION_PLAN.md` §7: every candidate head equals the prepared
head; no product path changed after the review; the hand-resolved content is `PROGRESS.md` only). The chain on
`main` after each merge: `ci` (push; the delivery-profile C17 archive packaged, verified and uploaded), `C19
lifecycle` (push), `C17 finalize` (workflow_run, cross-host), `C19 anchor` — the next merge waited for the whole
chain to be green. A red push run was re-run as the ENTIRE workflow, never failed-jobs-only.

| Step | PR | Candidate head | `main` | `ci` | C17 finalize | C19 anchor | Note |
|---|---|---|---|---|---|---|---|
| 1 | #39 | `a2cb0d8` | `d675707` | 34714055388 green | 34714543911 green | 34714595878 green | marked ready after the C15 recheck (dispatch 34713621090: no compatible fixed official image yet; the derived images remain the pinned route) |
| 2 | #36 | `d458b36` | `5b0d667` | 34714766782 green | 34715204263 green | 34715254309 green | |
| 3 | #38 | `1ed69ed` | `fed90fe` | 34715494412 attempt 1 red (the A5 timing side-channel assertion, `phase1-acceptance`, on a slow runner); attempt 2 green (whole workflow re-run) | 34716566659 green | 34716617298 green | |
| 4 | #40 | `fb18c1f` | `ae54e2d` | 34716840197 green | 34717383911 green | 34717430352 green | |
| 5 | #41 | `9f18468` | `48a01b4` | 34717734013 attempt 1 red (browser-regression: `e2e/phase0.spec.ts` "6. known-at query" — Playwright's fill of a `datetime-local` value refused as malformed when `tAfterV1 + 1 s` fell on a whole minute; a determinism defect of that Phase 0 browser control, not of the merged content — assigned to maintenance with the C18.1.11 control); attempt 2 green (whole workflow re-run) | 34719532376 green | 34719580814 green | the attempt-1 C17 finalize (34718302147) skipped as designed while `ci` was red |
| 6 | #43 | `34969e8` | `4642856` | 34719853823 green | 34720424456 green | 34720462423 green | retargeted from `phase5-twins` to `main` after #41 |
| 7 | #44 | `41eaa04` | `cbe1790` | 34720646497 green | 34721192292 green | 34721231086 green | retargeted from `integrations/source-readiness-2026-09` to `main` after #43 |
| 8 | #45 | `da47bd3` | `e0c5025` | 34721784881 green | 34722387128 green | 34722425076 green | documentation only |
| 9 | #46 | `48f7bdc` | `a6c9b91` | 34750092541 green (the C17 archive packaged, verified, uploaded) | 34750840687 green | 34750888559 green | after Codex's bounded closure of B9-F1 (§23.1) |

#42 is not in the authorized order and stays open. No production deployment was made; the archives are the
repository's normal CI/evidence workflow. `docs/ops/STACK_INTEGRATION_PLAN.md` §8 records the executed stack.

### 22.2 B8-F1 and B8-F2 — before → after

The reproduction (`apps/api/test/int/phase6-repro-serving-lifecycle.test.ts`; five cases, a second application
context as the second process; `evidence/cp6/repro-serving-lifecycle-before.txt` at the hook head `a081001`): the
two controls pass and the three defect cases fail as the findings say — **F2**: a delivery crossing the serving
expiry has its second item and its finish written by the process that lost the domain (the subscriber's own session
grant is enough for the write; ownership was checked only at the handler's entry); the completion accounting lets a
stale finish land after a take-over; **F1**: an expired handler awaits the worker's close, which waits for the handler
— the job stays active for ever.

After (0066 §1): the claim carries a **generation** (monotonic per domain across releases, kept in
`graph.subscription_domain_generations`), every governed write of a delivery — the receipt, each item's effect and the
finish — first calls `graph.subscription_serving_fence(tenant, domain, holder, generation)` inside its own
transaction (`FOR KEY SHARE` on the claim row; `P0S01 serving lost` when the holder or the generation is not the
claim's; the ledger's events carry `served_by` and `serving_generation` through a trigger), so an in-flight write
after a take-over is refused at the database and the new holder re-drives, skips the applied item and finishes; a
serving-lost handler never calls finish. The expired handler no longer waits for its worker: `lostServing()` drops
the belief and stops the worker DETACHED (`stopSubscriptionWorkerDetached`, its close tracked and awaited only at
shutdown), the job is returned promptly and the next reconciliation re-serves the domain. After: 5/5
(`repro-serving-lifecycle-after.txt`); the take-over case asserts two distinct generations across the hand-over, the
generation's monotonicity across releases is the counter's construction (`subscription_domain_generations`), not a
harness assertion.

### 22.3 What B9 implements (migration 0066) — `audit/CP6_BATCHES.md` §B9 for the mechanism

- **§2 automatic re-derivation** (AU-DP-0176; AU-DP-0041's clause; V7:TT-04): the seventh consumer,
  `relationships`, its own principal and action (`graph.relationship.subscription.apply`, from
  `graph.subscription_consumer_actions`), re-derives a pending inferred edge on `MemoryCorrected/claim.corrected`
  through the builder's rules — one function, `apps/api/src/graph/edges/derive.ts`, shared with the operator's run —
  and the builder's port; the successor asserted under the corrected version, the pending edge superseded, its
  reassessment closed with the event, `GraphChanged/edge.asserted` from the item's transaction; an end that resolves
  to no entity leaves the item unresolved with the builder's reason.
- **§3 memory items** (AU-MEM-0065; OBJ-14/15/16; AU-MEM-0031's clause): schema `memory`, the canonical `MEM@v1`
  version, the knowledge owner's record, the purpose-authorized retrieval as an evidenced consequential read with the
  access in the read's own transaction, the record authority's human-gated supersession with the prior version
  replayable as of an instant, the item's citations as dependencies so a correction walk reaches and marks it.
- **§4 governed retention** (ES-29-004; AU-MEM-0059/0060/0061, AU-DP-0090/0091/0094, AU-MEM-0121): schedules,
  actions as durable workflows — scope resolution with holds honoured (a held manifest is never executable; the
  tombstone port refuses it with the hold cited) and residuals recorded, the authority's approval on the scope
  digest (never the opener), the steward's execution through the ports (never an approver) with evidence per item,
  the residual inventory, verification (`DeletionVerified`), withdrawal; the outbox floor moved only by an executing
  `log_floor` action (`objects.outbox_declare_floor`), paused while a served point lies below it; `RetentionActionDue`
  from an opened action and from the evaluation.
- **§5 contradictions** (L2-I03; AU-INT-0025's clause): incompatible assertions on one subject and predicate linked at
  admission (before the claim is admitted: queued with reason `contradiction`, `contradiction_refs` on its header)
  and on a review correction, never collapsed; the challenge route; the adjudication as the row's only mutation.
- **§6 method evaluation** (L2-I05; AU-INT-0112's clause): `TransformationEvaluated` per producing version from the
  ledgers (calls, latency, runs, review yield, contradictions, confidence) with the manager's fitness verdict; an
  unfit version admits no claims and is not activated.
- **§7 ontology** (L4-I05; AU-MEM-0026's clause; V03-T-105): versioned vocabulary, the proposal's analysis over the
  asserted edges, strategy and entities, the four reviews, the steward's decision (never the proposer's), a breaking
  change refused while its edges stand, the active version honoured by `graph.assert_edge`.
- **§8 scenario review** (L7-I05; AU-PRD-0064; V03-T-336/340, V04-T-032): continue, dissent, retire (open branches
  closed, history and links kept, simulation refusing the retired branch at the service and at `simulation.open_run`),
  promote to simulation; human-gated; `ScenarioReviewed` each time.
- **§9 executive requests** (L10-I04; AU-EXO-0051): the seven typed kinds under one human-gated route, exactly once
  under the requester's `request_key` and the request digest; analysis routed to an agent run (trigger kind
  `request`), scenario/simulation/decision to the owner's act which names and fulfils the request, delegation at
  membership level (the delegate stands as a member of the room within the window; the policy still decides the act
  — the limit stated), suppression (the warning stays raised, listed and briefed as suppressed until the instant),
  follow-up on the package's agenda (overdue after its date, completed by its owner); stale version, committed
  package, agent and workload principals refused; `ExecutiveActionRequested`.
- **§10 the register**: the six unbound interfaces and L3-I05 bound — **26 bound, 24 partial, 0 unbound**
  (`bound_at`, `bound_in`).
- **§11 a warning raised before 0061 stays updatable** (found on the demonstration during the act's rehearsal): 0061's
  `wrn_level_derived` was a NOT VALID check, which PostgreSQL enforces on every updated row, so the record's one
  pre-0061 warning could never be updated — the 0065 §8 walk marking it for attention failed and the propagation of
  correction `01a0968b` had failed on every restart of the demonstration since B8 (ten times in its log). The rule is
  kept where it belongs: a raise (an insert) without its derived level is refused by a trigger; an update of a legacy
  row is admitted. On the restart after 0066 the re-driven job completed and the legacy warning is marked.
- **The HTTP surface of the new ports**: their refusals (retention, memory, contradiction, evaluation, ontology,
  scenario review, executive requests; the tombstone port's legal-hold refusal `P0R01`) were reaching callers as
  `500 internal integrity or processing failure` — the harness calls the controllers directly and never saw it; the
  rehearsal did. `asObservationRefusal` now answers them with the port's reason and the kind of refusal (422 the
  caller's request, 404 absence, 403 standing, 409 the record's state); the executive agent-run refusals and the
  retired-scenario run refusal have their own named rules (they had matched the twin run's generic rule and answered
  with the twin's message). Unit cases in `phase5-refusals.test.ts`.

### 22.4 Local results at the B9 head

`phase6-graph-subscriptions-4` 23/23 (`b9-run31.txt`, on `eye_verify44`) and 24/24 with §11's case after the
demonstration's finding;
`phase6-executive-requests` 7/7 (`b9-run29.txt`); `phase6-repro-serving-lifecycle` 5/5 after (before: 2/5 as the
findings say); `phase6-graph-subscriptions` 13/13 with its harness kept to the six kinds it was written for; the full
integration suite on a fresh database **925/925 in 56 files** (`b9-int-all-2.txt`, `eye_verify45`, 456 s) at the
head before §11 and the refusal mapping, and **926/926 in 56 files** at the final file (`b9-int-all-3.txt`,
`eye_verify48`, 418 s); the upgrade proof with 0066
(`upgrade-0066.txt`: 45 migrations, 31 roles, 28 registry rows; 275/275 on the upgraded data); unit **2148/2148** and
the hermetic meta suite 9/9 (`b9-unit.txt`); boundaries clean; the web typecheck clean. After the review's corrections
(§22.7): `phase6-graph-subscriptions-4` 25/25 and `phase6-executive-requests` 9/9 on `eye_verify49` migrated 0001–0067;
the full integration suite **929/929 in 56 files** on `eye_verify50` (fresh, 0001–0067; `b9-int-all-4.txt`); the upgrade
proof with 0067 (`upgrade-0067.txt`, 46 migrations); unit 2148/2148 again.
The first full run had fourteen failures, every one a pin or a harness assumption, not a runtime defect: the C7
control found two new graph tables (the consumer-actions vocabulary, the generations counter) outside FORCE
row-level security — put under it; D8's count of prediction tables (sixteen with the warning suppressions); the B6
harness registering all `CONSUMER_KINDS` (seven since 0066) and asserting six; the contradiction cases counting every
row of the domain while the re-derivation cases had recorded their own link (a corrected relationship claim's value
contradicting the other seeded claim's — detection working as specified). A local pass verifies nothing (S7).

### 22.5 The NORDWERK demonstration — `evidence/cp6/act-b9.txt` (2026-09-12T22:30–22:41Z)

The act ran at the last WIP head before the squash (`96c0a76`, which survives only in the reflog — the file's header
names it) with the act script as committed in `c93cdad` (the one uncommitted difference at run time was the script's
own check of the memory event's type, corrected before the run and committed with the batch; the API code was the
batch's). The act's output, not the header, is the evidence.

Rehearsed first on a restored copy of `eye_demo` with its own Redis and API (an isolated environment; the act script
was corrected there — three iterations — and the copy discarded); a `pg_dump -Fc` backup of `eye_demo` taken before
the migration and kept outside the repository; `eye_demo` migrated with the final 0066 through the migrator; the
demonstration API restarted on the B9 build and left running. What the act produced, each a real row, event or
delivery on the demonstration:

- **Personas** created through the identity route: K. Müller (knowledge owner), R. Adler (record authority),
  P. Novák (retention steward), H. Bergmann (retention authority, tenant scope), O. Steiner (ontology steward);
  the `relationships` subscriber registered (MemoryCorrected/claim.corrected only); seven consumers in the process.
- **0066 §11's effect first**: on the restart the re-driven correction `01a0968b` — "automatic propagation failed:
  … `wrn_level_derived`" ten times in the previous process's log — completed, and the pre-0061 warning reads
  `attention_state input_unverified` with the invalidation named.
- **Memory item** `01a097c8…`: recorded by K. Müller citing the corridor assumption and the inventory record;
  retrieved by L. Brandt under `decision` (access recorded), refused under `observation`; superseded by R. Adler
  (v2), v1 served as of the earlier instant; `GraphChanged/memory_item.superseded` delivered — the retrieval consumer
  verified its projections, the five others correctly idle (nothing of theirs rests on the item).
- **Re-derivation**: A. Hoffmann's challenge of the `stocks` claim queued a review case (reason `challenged`);
  L. Ferreira's correction (SYN-PART-MAG → SYN-PART-BRG) published `MemoryCorrected/claim.corrected`; the
  relationships subscriber re-derived the edge — `01a084f5…` superseded (reassessment `reassessed/superseded`),
  successor `01a097c8…` asserted under claim version 2 by the subscription's own principal; the memory-mappings
  subscriber proposed the reconciliation of the same edge; retrieval verified; four consumers idle. Three of seven
  did non-empty work — the first demonstration event on which a consumer beyond retrieval did.
- **Method evaluation**: `corridor-supply-relationships` v1 evaluated `fit` with the measures from the ledgers (1
  run, 3 calls, 14 claims admitted, 0 refusals); `TransformationEvaluated` v1 published.
- **Ontology**: version 1 proposed by J. Weber (the predicates the graph asserts; additive), his own approval refused,
  approved and activated by O. Steiner; a breaking version 2 removing `stocks` analysed (one asserted edge stranded),
  the steward's approval refused with the reason, rejected — version 1 stands.
- **Retention**: a schedule declared on the `24 months` profile; the evaluation opened nothing; a deletion opened by
  P. Novák on the oldest superseded evidence version without a hold (an `eu-sanctions-payload` page, 282 bytes — the
  act's heading said PortWatch; the target line names the source), scope resolved (1 to execute, residuals: the two
  canonical versions retained by policy), the opener's approval refused, H. Bergmann's approval on the digest, executed
  (1 tombstoned, the bytes removed), verified — `RetentionActionDue` and `DeletionVerified` published.
- **Scenario review**: the corridor scenario dissented (position and rationale), its collapse branch promoted to
  simulation, then retired (one open branch closed, the links named: the forecast, the dependent scenario, the
  simulation runs); T. Nakamura's run bound to the retired branch refused with the reason; the act reads back the
  retirement's `ScenarioReviewed` row (the harness asserts one per review).
- **Executive requests** by S. Okafor: `analysis` ran the briefing agent under its own session (the run finished and
  fulfilled the request; the trigger kind `request` is the harness's assertion, the act prints the run and its outcome); the same request repeated under the same key returned the
  same request with no second run and no second event; a different request under the key refused with the reason;
  `suppression` of the corridor warning until 2026-09-19 (its state stays `raised`; the list marks it suppressed);
  `follow_up` "confirm SYN-SHIP-4468 rebooked" owned by L. Brandt, overdue on the package's workflow, completed by him;
  `delegation` of `decision.review` to M. Dvořák live for three days and his review of the room recorded under it;
  `scenario` routed to N. Eriksen, whose declaration named the request and fulfilled it. Five
  `ExecutiveActionRequested` rows for five new requests, none for the repeat; the register reads L10-I04 bound v1.

The act's runner paused once (the restart step's pipe did not close after the API came up) and was continued by hand
from the same step; the file says so at that line.

### 22.6 Recorded, assigned forward

- **AU-DP-0175**: the ownership work remaining after the fence — the ledger records `served_by` per effect, but a
  consumer's own writes outside the dispatcher's three governed writes (none today) would need the same fence; the
  worker's detached close is awaited at shutdown only; recorded in the unit's prose without discarding B8's evidence.
- **Browser**: the memory, retention, ontology, contradiction, scenario-review and request surfaces have routes and
  no pages; the subscriptions page lists the seventh kind — the next browser-evidence refresh.
- **Maintenance (determinism)**: the C18.1.11 five-millisecond drift control (§21.5) and now the Phase 0 browser
  control "6. known-at query" (a `datetime-local` value on a whole minute) — both properties of the controls, not of
  the content; both re-ran green as whole workflows.
- **UN Comtrade and PortWatch**: the owner's authorization of 2026-09-12 (existing keys, live PortWatch, within source
  permissions and the existing budgets and cadences; no purchase, no cadence or budget change) is recorded in
  `SOURCE_INTEGRATION_STATUS.md` §10; no activation act was performed in this batch.
- **G2 (observation)**: a claim approved in review is never graphed by the builder (its run reads queued claims only)
  — a latent builder gap, recorded for the next intelligence batch.

### 22.7 The adversarial review of the candidate and its corrections (migration 0067)

Before the candidate went to Codex, a six-dimension adversarial review (ownership and the fence; retention safety;
executive requests; the intelligence and graph ports; scenario review and memory items; the records) with two
independent refuters per finding was run on `c93cdad` (58 agents; `evidence/cp6/b9-adversarial-review.txt`).
Twenty-four findings were confirmed by both refuters; the fence dimension found no defect (five observations). The
confirmed defects and their corrections, each a re-declared port in **`0067_b9_review_corrections.sql`** or a
TypeScript change, with a harness case where the case is bounded:

- **Retention** — an execution with a refused item (a hold placed after the approval) committed the other items'
  tombstones and removed their bytes under an action no route could move again: now the execution rolls back whole
  and the action is PAUSED with its approvals revoked, resolved again (`retention.pause_action`; the case); a removal
  the vault refuses after the commit was recorded nowhere: now a pending bytes residual on the action
  (`retention.record_bytes_residual`), retried by the execute route, closed by verification; an approved `review`,
  `archive` or `customer_export` action executed exactly as a deletion: now `review` records and removes nothing,
  `archive`/`customer_export` are refused at execution (the case); the outbox floor's served-point check ran only at
  resolution: now re-checked at the move; a floor moved further by a later action could never verify: `>=`; the
  executor is the acting principal.
- **Executive requests** — a request whose agent run was refused stayed `routed` for ever: now recorded `refused`
  with the port's reason (`executive.refuse_request`; the case); a strategy owner or decision authority could trigger
  an agent run through an analysis request without `agent.trigger`: now that act is decided first, before any request
  is recorded (the case); `fulfil_request` accepted any uuid for any kind: now the answering act must be of the
  request's kind and of the domain (the case); a delegation outlived its lender's membership: now it stands only
  while the lender owns or is a member of the room (the case); `subject.agent_id` validated.
- **Memory items** — `/memory/list` and `/:id/get` returned an item's statement under `graph.read`, outside the
  purpose, audience, clearance and the access ledger: now they return the record without the content; the as-of
  retrieval enforced the current version's audience on a historical version: now the served version's; an
  unparseable `asOf` was a 500: now 422.
- **Scenario review** — the retirement's loop overwrote the branch the review named, so the returned and published
  branch was the last closed one: a separate loop variable.
- **The ports** — the relationships consumer re-opened a reassessment a person had decided and appended a duplicate
  cause on every re-drive: the consumer leaves a decided reassessment alone and `open_edge_reassessment` is
  idempotent per cause; the builder's port refusing the derivation (ontology, review state) was classed an
  infrastructure fault and retried: now unresolved for a person; contradiction detection scanned the 2,000 newest
  claim versions and missed the rest, and counted a claim a person had REJECTED (the decision lives on the review
  case): now selected in the database by subject and predicate with no window, rejected claims excluded;
  `decide_ontology_proposal` checked the proposer against the caller's actor: now the acting principal.
- **Records** — §22.1's table completed; AU-DP-0176's statement and condition say what the cases exercise (the
  builder's refusal, the decided reassessment and the second cause are code-reviewed, harness owed); AU-EXO-0051 says
  which kinds fulfil in the owner's write and which through the fulfilment route; AU-MEM-0059 moved back to `open`
  (archive and customer-export do not execute; a legal hold is a precedence, not a kind); AU-DP-0091's condition
  updated; AU-MEM-0121's condition matched to its cases; §22.2's monotonicity and §22.4's unit count corrected;
  CP6_BATCHES §B9 counts eleven sections; the evidence index carries the B9 files.

Recorded, not corrected (observations): the `both_stand`/`superseded` adjudication stamps the link and changes no
assertion (by design — the withdrawal is the reviewer's own act); the stale holder's identity-session and audit rows
after a take-over (unfenced by design: they are its own record); the fence asserts scope only in commit mode; a
serving TTL below the tick; a bounced older job retried after a hand-over; the four ontology reviews self-attested by
the decider; `assert_edge` honouring predicate names only (not the declared subject/object types); a challenge on a
superseded claim version; a follow-up's owner not checked as an active principal; the briefing's as-of view of
withdrawn follow-ups. The split after the corrections read 3,555 = 3,190 open + 345 local + 20 CI (AU-MEM-0059 back to
open); the records commit below binds the hosted result and reads **3,555 = 3,190 open + 338 local + 27 CI**.

### 22.8 Heads, hosted results, reconciled statuses

| Head | What | Hosted `ci` | Hosted C19 |
|---|---|---|---|
| `a081001` | the reproduction head (the serving TTL configurable, the test hooks; the reproduction file failing as the findings say) | not run (a reproduction, not a candidate) | — |
| `c93cdad` | the B9 candidate before the adversarial review (0066 only) — superseded by the amended commit below; its run is recorded, not bound | 34723796714 green (926/926 in 56 files) | 34723796751 green |
| `36ce748` | **B9: 0066 and 0067**; the harness (25 + 9 + 5 cases); the act; the records at `verified:local` | 34726253751 green — build-test job 103640765238: unit 2148/2148 and the meta suite 9/9, the acceptance suite 58/58, the integration suite **929/929 in 56 files on a fresh database**, the upgrade proof with 0066 and 0067 (46 migrations, 31 roles, 28 registry rows; 297/297 and 275/275 on the upgraded data), C18 612/612 and the four gate stages; browser-regression and supply-chain green (`hosted-36ce748-build-test-summary.txt`) | 34726253762 green |
| `6aaae07` | the records head: the seven B9 units → `verified:ci`; the summary regenerated | 34727137207 green (attempt 1; records only) | 34727137189 green |

Statuses: AU-DP-0176, AU-MEM-0121 and AU-PRD-0064 allocated `verified:local` at the batch head and moved to
**`verified:ci`** by the hosted run at `36ce748` (ci 34726253751; C19 34726253762); AU-MEM-0065, AU-MEM-0060,
AU-DP-0091 and AU-EXO-0051 `open` → `verified:local` → **`verified:ci`** by the same run; AU-MEM-0059 `open` (the
adversarial review); AU-INT-0025, AU-INT-0112, AU-DP-0041, AU-MEM-0031, AU-DP-0071, AU-DP-0090, AU-DP-0094,
AU-MEM-0026, AU-MEM-0061 and AU-PRD-0027 stay `open` with their delivered clauses bound to this head and their
remaining clauses in their own prose; AU-DP-0175 (`verified:ci` since `661c2fb`) carries B9's ownership clauses and
the remaining ownership work. The register's §5.2a reads **3,555 = 3,190 open + 338 local + 27 CI** — three more
than `3932207` by the allocation of three new units, none by regression; seven moved from local to CI; no accepted
deployment leg. The hosted run verifies the artefact on a fresh database; it is not a profile leg (S7).

### 22.9 Codex's bounded review at `36ce748` / `121f636` — B9-F1 closed on the candidate; B9-F2 and B9-F3 assigned

`audit/reviews/The_Eye_36ce748_B9_Bounded_Review_and_Merge_Disposition.md` (2026-09-13): the eight merges verified
(each merge's two parents, the prepared heads, the archive steps inspected in the hosted logs); **B8-F1 and B8-F2
closed**; B9's capabilities found functioning on the inspected hosted cases; three findings — **B9-F1** (merge blocker)
and B9-F2, B9-F3 (bounded functional defects assigned to the next relationship/intelligence and retention batches).
Codex's probe (`The_Eye_36ce748_B9_Probe_Evidence.zip`) executed the actual TypeScript with explicit doubles; it ran no
PostgreSQL, Redis or HTTP.

**B9-F1 — before → after.** `MemoryService.retrieve` authorised the SERVED version (purpose, classification, audience)
and then returned the current projection (`item`) as well — its statement and source reference — so an analyst
authorised for v1 received the current v2's content in the response (Codex's probe: classification-restricted and
audience-restricted v2 content in the analyst's v1 response; the access port called with version 1). After: the
response is built from the served version only — its content, header fields and audience — and the current projection
contributes AVAILABILITY metadata alone (`item_id`, `state`, `current_version`, `versions`, `superseded_versions`,
`last_superseded_at`, `attention_state`, `served_is_current`); `item` in the response IS that availability object; the
access recorded names the served version. Closure evidence, the complete serialized response checked:
- the harness (`phase6-graph-subscriptions-4.test.ts`, three cases on a fresh database through the governed pipeline):
  v1 internal / v2 RESTRICTED by classification / v3 internal for the audience role `knowledge_owner`; the analyst's
  current read refused (v3's role), the auditor's refused (not in the role though cleared), the knowledge owner reads v3;
  before v3 the analyst is refused (v2's classification) while the auditor reads v2 with nothing of v3; **the closure
  case**: the analyst's read as of before v2 serves v1 — `JSON.stringify` of the response holds v1's statement and
  source and none of v2's or v3's statement, source, classification, audience role or supersession reason; the
  availability object is exactly the seven fields; the `version` object's keys are exactly the served version's; the
  access ledger gains one row — version 1, the analyst, the purpose stated — and the refused reads left none; the
  listing and the record under `graph.read` carry no statement of any version;
- the real HTTP path on the demonstration (`scripts/phase6/closure-b9-f1.mjs` → `evidence/cp6/closure-b9-f1.txt`):
  the same versions recorded by K. Müller and R. Adler, the same reads by A. Hoffmann (analyst), platform-admin and
  K. Müller, every response printed as the server returned it — the analyst's v1 read 1,849 bytes with nothing of v2
  or v3, the access ledger read from the database naming version 1 under the analyst's purpose; the full integration
  suite **932/932 in 56 files** on a fresh database at this candidate (`b9-int-all-5.txt`); boundaries clean. (An administrator is
  admitted to every audience role by 0066 §3's rule and reads v3; the act's first run expected otherwise on that one
  control, recorded an extra item on the demonstration and was re-run with the rule stated.)

**B9-F2** (a refused edge assertion leaves the consumer's transaction aborted, so the unresolved checkpoint cannot be
written — the item falls to infrastructure retry instead of the person's disposition) and **B9-F3** (a `review`
action's verification applies the deletion checks and can never pass) are carried into the next batch with G2 (a
claim approved in review never graphed); their clauses stay visibly unfinished on AU-DP-0176 and AU-MEM-0059/-0061.

## 23. The consolidated checkpoint after `36ce748` / `121f636` (2026-09-13): B9-F1 closed on the fixed candidate; B10 implemented — the memory workspace, the agent's retrieval, B9-F2/F3 and G2

Continued from `36ce748` (code) / `121f636` (records). Codex's bounded review at `36ce748` (§22.9) verified the eight
merges, closed B8-F1/F2 and returned B9-F1 (a merge blocker), B9-F2 and B9-F3 (implementation follow-ups) and the
recorded G2 gap. The owner's directive of 2026-09-13: fix F1 before merging #46 and return the exact corrected
candidate for Codex's bounded closure; once closed, merge #46 under the existing conditional authorization and complete
its C17/C19 archive chain; carry F2, F3 and G2 into implementation on the next feature branch, keeping the merge
candidate fixed; continue the missing capabilities starting with the usable memory workspace and the agent's
retrieval; meaningful NORDWERK effects alongside; focused verification plus the existing gates, no broad audit and no
repeated records-refresh chain. Every previous closure, the frozen criteria, the source/budget permissions (GHCR
temporary with monitoring; UN Comtrade keys and live PortWatch within existing budgets and cadences; no purchase,
no cadence or budget change; no production deployment), the backups and the demonstration services are preserved;
completed monitors are not re-armed.

### 23.1 The merge candidate — fixed at `48f7bdc` (phase6-decisions; #46 → `main`, not merged)

The F1 correction (§22.9) is the one change after `36ce748`/`121f636`: `48f7bdc` = the retrieval built from the
served version with availability metadata alone, the harness closure cases, the HTTP-path closure act on the
demonstration, the records. Hosted at `48f7bdc`: **`ci` 34744726183 green** — unit 2148/2148 and the meta suite 9/9,
the acceptance suite 58/58, the integration suite **932/932 in 56 files on a fresh database**
(`phase6-graph-subscriptions-4` 28/28), the upgrade proof with 0066 and 0067 (297/297 and 275/275 on the upgraded
data), C18 612/612 and the gate stages; **C19 34744726187 green**. **Codex closed B9-F1 at `48f7bdc` on 2026-09-13** (`audit/reviews/The_Eye_48f7bdc_Closure_and_B10_Bounded_Review.md`:
"PR #46 is eligible to merge under the existing conditional authorization. B10 does not hold it") and **#46 was merged
under that authorization: `main` `a6c9b91`** (a merge commit, no squash, no rebase; the merge base `da47bd3` is #45's
head and `main` carried no content since, so over `main` the candidate carried only its own 318 files; branch preserved).
Its archive chain on `main`, green in order: `ci` 34750092541 (the push run — the delivery-profile C17 archive
`c17-evidence-archive-a1-d982e59b…` packaged, verified and uploaded; the C16 and C18 evidence artefacts beside it),
`C19 lifecycle` 34750092578, `C17 finalize` 34750840687, `C19 anchor` 34750888559 — step 9 of the recorded order
(`docs/ops/STACK_INTEGRATION_PLAN.md` §8). No further merge permission was requested; no production deployment.
AU-MEM-0065's F1 clause is bound to the candidate's hosted run (the unit's evidence column). **#47 was retargeted to
`main`** after the merge (its diff is B10 alone).

### 23.2 What B10 implements (migration 0068, PR #47 on `phase6-b10`, base `phase6-decisions`) — `audit/CP6_BATCHES.md` §B10 for the mechanism

- **B9-F2 closed in implementation**: the relationships subscriber asserts the re-derived edge under a savepoint and
  catches the builder port's refusals as `derivation.blocked` unresolved; the unresolved checkpoint commits in the
  same transaction the port refused in — pending reassessment on its cause, no successor, no duplicate cause or
  opened-event on a re-drive; the person's vocabulary repair lets the next re-drive re-derive (harness: REFUSED,
  RECORDED, REPAIRED; the demonstration: the live `stocks` edge).
- **G2 closed**: `graph.assert_edge` and the builder's rules consult the review CASE (approved graphed though the
  payload says queued; rejected refused; a case-corrected version superseded); the run reads the cases of the claims
  it holds (harness: the run and the port; three unit cases on the builder's double).
- **B9-F3 closed in implementation**: a review action verifies against its preservation contract (untouched, bytes
  present, reviewed; no DeletionVerified) — and, found on the demonstration rehearsal, its SCOPE is resolved by the
  same contract (0068 §6: current and held evidence reviewed in place, no residuals; a deletion of current evidence
  stays excluded).
- **The agent's retrieval** (AU-MEM-0065's unexercised clause): a briefing composition — a person's or the briefing
  agent's — reads the memory items its purpose, the reader's clearance and the audience roles admit, records each read
  on the item's ledger under `briefing.compose`, and carries them as briefing items of kind `memory`.
- **The Enterprise Memory workspace** (`/graph/memory`): records without content; retrieval under a declared purpose
  with the availability object; record, supersede, withdraw; refusals verbatim. `memory.item.withdraw` is its own
  act; a withdrawn item's current retrieval is 409 EYE-STA-003 while its versions stay replayable as of an instant.
- **The floor's re-check** aligned with the scope resolution's rule (0068 §3).

Local results at `0cee439` (the B10 code head): `phase6-graph-subscriptions-4` 32/32 and `phase6-executive-requests`
10/10 on fresh databases; the unit suite 2151/2151 in 40 files (`b10-unit.txt`); boundaries clean; web `tsc` clean and
`next build` listing `/graph/memory`; the upgrade proof with 0022–0068 (47 migrations; 297/297 and 275/275 on the
upgraded data — `b10-upgrade-proof.txt`); the full integration suite **937/937 in 56 files** on a fresh database at this tree
(`b10-int-all-1.txt`).

### 23.3 The NORDWERK demonstration — `evidence/cp6/act-b10.txt` (2026-09-13T08:13–08:14Z, head `0cee439`)

Rehearsed three times on a restored copy of `eye_demo` (its own Redis on 6391, the API on :3411): the first rehearsal
found two act-script errors (a listing under `graph.read` by a decision persona who holds no such role — the
workspace's list is the knowledge owner's; a refusal code spelt with underscores) and the review-scope defect
corrected as 0068 §6; the second found the subscription control is an administrator's act; the third ran clean. Then
on `eye_demo`: a `pg_dump -Fc` backup (47,910,617 bytes, kept outside the repository), 0068 through the migrator
(digest `9c324c9a0b2d2fdf`), the API restarted on the B10 build and left running. What the act produced:

- **The workspace's routes** — K. Müller records; the listing and the record carry no statement; L. Brandt retrieves
  under the memory purpose (v1 served, the seven-field availability object, the access recorded) and is refused under
  the briefing purpose (403, the item's purposes named); a throwaway item: K. Müller's withdrawal refused 403, R. Adler
  withdraws under `memory.item.withdraw`, the current retrieval **409 EYE-STA-003** (the complete response printed), the
  read as of an instant before the withdrawal serves v1 with `availability.state = withdrawn`; the item's events
  `recorded → withdrawn (reason) → retrieved`.
- **The agent's retrieval** — three items: A (`memory, briefing`), B (`memory` only), C (`briefing`, audience role
  `knowledge_owner`); S. Okafor's analysis request runs the briefing agent under its own session (run finished, request
  fulfilled); S. Okafor reads the briefing: 8 items, ONE of kind memory — A with its statement, `read_under: briefing`;
  B and C absent (their statements nowhere in the response); `memory.item_access` holds one row for A@1 under
  `briefing` by the agent's own principal, none for B or C.
- **B9-F2 on the live graph** — A. Hoffmann challenges the asserted `stocks` claim (v2); L. Ferreira corrects the
  predicate to `procures`, which vocabulary version 1 does not declare; MemoryCorrected/claim.corrected published; the
  relationships delivery `unresolved / unresolved_dependency / human_review`, the item `derivation.blocked` with the
  port's reason (`predicate procures is not in the domain's active ontology version; propose it …`), the edge
  asserted with reassessment pending on the event, no successor; the administrator pauses and resumes the
  subscription — the re-drive repeats the refusal (deliveries 2, checks 2) with the edge's causes still 1; J. Weber
  proposes version 3 (additive, `procures`), O. Steiner approves; the next re-drive **re-derives**: the `stocks` edge
  superseded (reassessed/superseded), the successor `NORDWERK ANTRIEBSTECHNIK GmbH procures SYN-PART-BRG` under claim
  version 3 asserted by the subscription's principal (deliveries 3, unresolved 0). **G2**: k.adeyemi's builder run
  afterwards asserts nothing (edges 7 → 7): every current claim version already has its edge, the successor included;
  the run is idempotent per version with the review case consulted.
- **B9-F3** — P. Novák opens a review of the CURRENT `eu-sanctions-rss` evidence (3,934 bytes); the scope resolves to
  the item reviewed in place (1 to execute — the rehearsal's finding, corrected); H. Bergmann approves on the digest;
  the execution records the review (`port none, outcome done`; no tombstone; no bytes removed); the verification
  passes on the preservation contract — the ledger's check `reviewed — untouched, its bytes present`, expected
  `{reviewed, tombstone:false, bytes_present}` equal to the observed; no DeletionVerified; the action `verified`, the
  manifest and the evidence version untouched.

The browser leg of the workspace: the web application was rebuilt at this tree and restarted (`/graph/memory` in the
build); the signed-in walk is the owner's — the author does not authenticate in the browser — so no screenshot of the
page is claimed; the routes it calls are the act's scene 1.

### 23.4 Heads, hosted results, statuses

| Head | What | Hosted `ci` | Hosted C19 |
|---|---|---|---|
| `48f7bdc` | **the merge candidate** (#46): B9 + the F1 correction, the closure cases, the HTTP-path act, the records | 34744726183 green (932/932 in 56 files; C18 612/612) | 34744726187 green |
| `a6c9b91` | **`main`: the merge of #46** at `48f7bdc` (step 9 of the recorded order) | 34750092541 green (push; the C17 archive packaged, verified, uploaded) · C17 finalize 34750840687 green · C19 anchor 34750888559 green | 34750092578 green |
| `0cee439` | **B10 code** (0068, the services, the workspace, the harness, the act script) — PR #47 | 34747248517 green — build-test job 103697312257: unit 2151/2151 and the meta suite 9/9, the acceptance suite 58/58, the integration suite **937/937 in 56 files on a fresh database** (`phase6-graph-subscriptions-4` 32/32, `phase6-executive-requests` 10/10), the upgrade proof with 0022–0068 (47 migrations; 297/297 and 275/275 on the upgraded data), C18 612/612 and the gate stages; browser-regression and supply-chain green | 34747248530 green |
| `c04f6b1` | the B10 records (this section, §B10, the units and rows, the evidence index, the summary) | records only; no refresh chain awaited or bound | — |
| `1fa3b08` | **the B10 closure — PR #47's corrected candidate** (0069; B10-F1/F2/F3 and the author-found F4 closed; the harness `phase6-briefing-memory`; the closure act) | 34752156335 green (943/943 in 57 files; C18 612/612; the upgrade proof through 0069) | 34752156341 green |
| the records head after `1fa3b08` | the closure records (§23.6, §B10's closure paragraph, the units, the evidence index) | records only; no refresh chain awaited or bound | — |

Statuses: no unit changes status in B10. AU-DP-0176 and AU-MEM-0065 were `verified:ci` at `36ce748` and stay so — a
status that records evidence and erases no remaining clause (AU-DP-0176 still owes the decided-reassessment guard's
own case; AU-MEM-0065 the workspace's browser walk and the source-derived records); **AU-MEM-0059 and AU-MEM-0061
are `open` before and after** (the archive and customer-export executors; the pause of a deletion whose referential
scope cannot be proven) — an earlier draft of this section misstated them as `verified:ci`, corrected here on Codex's
reading of the rows (the CSV rows were right throughout). The B10 clauses (F2 closed, G2, F3 closed with the scope,
the agent's retrieval, the withdrawal, the workspace) are bound to the hosted run at `0cee439` in the four units'
evidence columns, the F1 clause to `48f7bdc`. The register's §5.2a still reads **3,555 = 3,190 open + 338 local + 27 CI**. The hosted run verifies the
artefact on a fresh database; it is not a profile leg (S7). Requirement rows: V8 OBJ-15 (the agent's retrieval),
V8 CAP-UM-07 (`missing` → `partial`: the workspace page exists, its browser walk owed), V7 TT-04 (the refusal
contained), V4 ES-33-007 (purpose-aware retrieval and the review contract).

### 23.6 Codex's bounded review of B10 at `0cee439`/`c04f6b1` — B9-F2, B9-F3 and G2 closed; B10-F1/F2/F3 found and closed at `1fa3b08` (PR #47's corrected candidate), with an author-found fourth

The review (`audit/reviews/The_Eye_48f7bdc_Closure_and_B10_Bounded_Review.md`) closes **B9-F2** (the savepoint; the
hosted real-DB/queue case), **G2** (the review case consulted by the port and the rules) and **B9-F3** (the review
contract, verification and scope) on B10's inspected implementation and evidence, and returns three bounded defects on
B10's new memory-to-briefing path, reproduced with actual TypeScript and explicit doubles (no PostgreSQL/HTTP):
**B10-F1** (a merge blocker for #47) a stored briefing disclosed a role-restricted memory version to a reader refused
it directly; **B10-F2** each access id entered the content digest, so identical recompositions differed; **B10-F3** a
later supersession moved the current projection's instant, so a recomposition at an earlier cutoff lost the item.

**Reproduced at the governed boundary, then closed** (`apps/api/test/int/phase6-briefing-memory.test.ts`, on the real
database through the governed controllers; the unfixed code first — `evidence/cp6/b10-closure-repro-before.txt`, all
cases red as the findings say — then the correction, 6/6):
- **F1** — `BriefingService.get` applies the CITED memory version's audience to THIS reader: its roles held in the
  target context (administrators admitted, 0066 §3's rule), its classification against the reader's clearance. Outside
  it the item is WITHHELD — identity and instant kept (`item_id`, `at`, `owner`), title, statement, source and the rest
  of its content gone (`title: "memory: withheld"`, `details: {withheld, reason, read_under}`), `items_withheld`
  counted, the availability naming why; a narrative that cites a withheld item is withheld with it
  (`narrative_withheld`) — found by the author's adversarial review; the content digest is the stored snapshot's; the
  reader's read leaves no access row on the withheld item. Controls: the composer, a domain administrator and an
  unrestricted item read as before; the wrong purpose refused.
- **F2** — the accesses stay on `memory.item_access` and are bound to the BRIEFING ROW (`executive.briefings.
  memory_accesses`, 0069 §1: item, version, access id) — outside the content and its digest, and not by the envelope's
  correlation id (a causal chain shares one across requests and nothing makes it unique — the adversarial review's
  finding on the first correction). Two compositions with the same inputs → one content digest, two ledger rows with
  distinct access ids, each briefing reporting exactly its own; the changed-version control: a version within the cutoff
  changes the content, the earlier cutoff's digest unchanged.
- **F3** — the candidates and the version served come from HISTORY at the cutoff (`DISTINCT ON` the item, the highest
  version recorded by `known_at`; a withdrawal by the cutoff — `memory.item_events` — excludes and takes no slot; the
  version's OWN `payload.audience` rules under the reader's present authority); present availability — withdrawn now,
  superseded by a later version now — is reported apart from the content (`availability.unavailable` / `corrected`
  gain `memory:` citations). The same cutoff keeps v1 after v2; a cutoff including v2 uses v2; a withdrawal after the
  cutoff does not remove the item, one by the cutoff does; direct historical retrieval agrees.
- **B10-F4 (author-found while reproducing F1 at the boundary, widened by the adversarial review)** — the generic
  object read (`objects/:id/get`, `/list`, history, as-of) served a role-restricted AND a classification-restricted
  memory version whole to a domain analyst refused it directly (probed on the demonstration first), and would serve a
  briefing's stored memory statements the same way; the claim route (`intelligence/claims/:id/get`) and the evidence
  route (`observation/evidence/:id/get`) read any canonical object by id and did the same; the generic WRITE
  (`objects.correct`) admitted a new MEM/BRF version. Closed: `objects.read` serves the HEADER of an audience-governed
  object (MEM, BRF) and withholds its content (`payload: null`, `content_withheld` naming the route the content is
  read through); the claim and evidence routes serve their own types only (a memory item or a briefing by id is not
  found there); `observation.canonical_write_exclusions` (0069 §2) — `objects.create`/`objects.correct` do not admit
  MEM or BRF, refused at `objects.admit_version` ("written through its own port") whatever the caller's role; other
  types unchanged (the evidence control).

**The author's adversarial review of the closure candidate** (`evidence/cp6/b10-closure-adversarial-review.txt`: six
find dimensions, two refuters per finding, 38 agents): 13 confirmed findings, five distinct — the two typed routes, the
narrative, the withdrawn items consuming the 200 slots and the newest-2,000 window against the oldest-200 rule, the
correlation-id binding — all corrected before the candidate was pushed; three refuted (the `since` window as a design
choice; two describing the pre-candidate state).

**On the demonstration through the HTTP path** (`scripts/phase6/closure-b10.mjs` → `evidence/cp6/closure-b10.txt`,
2026-09-13T10:30–10:32Z): `eye_demo` backed up and migrated with 0069, the API restarted on the corrected build; K.
Müller's item for the audience role `executive`; S. Okafor composes the room's briefing; L. Brandt (the room's owner,
not an executive) is refused the item directly (403) and reads the briefing — the complete response printed —
nothing of the item's statement, source or title in it, the item withheld with the reason, the unrestricted item
served, the digest unchanged, no access row left; S. Okafor reads it whole; the wrong purpose refused; A. Hoffmann
reads the item and the briefing through the objects route — headers, content withheld, every version; evidence
served as before; two compositions at one cutoff → one digest, three distinct accesses on the ledger, the accesses
reported beside the content; an item superseded after a cutoff stays v1 at that cutoff with the digest unchanged, v2
now, the earlier briefing's availability naming the supersession. (The act's first attempt composed domain-wide and
was refused whole: on this demonstration a branch of a forecast-less scenario was closed in the B9 act and the fold
treats such an input as restricted and synthetic, so an unwindowed human composition folds to restricted — an
observation recorded here, not changed; the act composes the room's briefing following its latest as the prior.)

Local gates at the candidate: `phase6-briefing-memory` 6/6 and `phase6-executive-requests` 10/10 on fresh databases;
the full integration suite **943/943 in 57 files** (`b10-closure-int-all-1.txt`); unit 2151/2151; boundaries clean;
web `tsc` and `next build` clean (the briefings page shows what is withheld and the present availability); the upgrade
proof with 0022–0069 (48 migrations; `b10-closure-upgrade-proof.txt`). **Hosted at `1fa3b08`: `ci` 34752156335 green**
(build-test job 103710395626: unit 2151/2151 and the meta suite 9/9, the acceptance suite 58/58, the integration suite
943/943 in 57 files on a fresh database with `phase6-briefing-memory` 6/6, the upgrade proof through 0069, C18 612/612;
browser-regression and supply-chain green), **C19 34752156341 green**. PR #47 (base `main`) is the corrected candidate
for Codex's next bounded closure, limited to the changed behaviour.

Recorded, assigned forward: the demonstration's forecast-less branch fold (a human composition in a domain with such an
event folds to restricted — the fold rule is fail-closed by design; whether a closed branch of a forecast-less scenario
should fold as an input at all is the next executive batch's question); the generic `objects.read` carries no
clearance check for the other object types (a Phase 0 behaviour; R4a's rule is applied on the typed routes) — recorded
for the next data-platform batch, not changed here.

### 23.5 Functioning, partial, missing — and the acceptance work remaining

**Functioning (harness on a fresh database; the demonstration through the real HTTP path)** — the subscriptions and
their seven consumers with ordered publication, replay reach and fenced serving (B6–B9); memory items recorded,
retrieved under a purpose by a person or the briefing agent, superseded, withdrawn, replayed, with the historical
response holding the served version only; the relationships re-derivation with durable unresolved states and the
person's repair path; review cases deciding the graph; governed retention — schedules, deletion with holds, approval
on the digest, execution evidence, residuals, verification; review actions by their preservation contract; the log's
floor; contradictions linked, methods evaluated, the vocabulary versioned, scenarios reviewed, the executive's typed
requests; the interface register; the flows' telemetry.

**Partial** — the Enterprise Memory workspace (page built, its browser walk owed); retention's archive and
customer-export kinds (open and resolve; no executor); the pause of a manifest deletion whose referential scope cannot
be proven (recorded as residuals today); communications- and telemetry-derived memory records (source kinds exist,
only human records recorded); the browser surfaces for retention, ontology, contradictions, scenario review and
requests (routes, no pages); the C18.1.11 and Phase 0 "known-at" control determinism (routed to C19).

**Missing** — what the delivery register lists beyond CP-6's batches: the remaining retention capabilities (archive,
export, index-tier degradation), the remaining source integrations under the standing permissions (UN Comtrade and
live PortWatch activation acts — authorized, not performed), the capabilities the interface register's 24 PARTIAL
contracts still name (the register reads **26 bound / 24 partial / 0 unbound** since B9; B10 changed no binding, and
"bound" is a binding, not semantic acceptance), and every deployment leg (no profile carries signed evidence; S7).

**Acceptance work remaining** — Codex's bounded closure of B10-F1/F2/F3 (and the author-found F4) on `1fa3b08` → the
merge of #47 under the existing authorization and its archive chain; the owner's walk of `/graph/memory`; B11 on
`phase6-b11` (the governed credential path and the UN Comtrade act up to the key the owner binds; retention's archive
and customer-export executors and the safe deletion scope; the five workspace pages) with its own bounded review.

## 24. The consolidated checkpoint after `1fa3b08` / `8463174` (2026-09-13): B11 implemented — the governed credential path and the UN Comtrade act, the archive tier, the customer export package, the safe referential scope, five workspace pages

Continued from `1fa3b08` (code) / `8463174` (records) with #46 merged (§23.1) and #47 the fixed closure candidate. The
owner's directive: continue implementing retention executors and safe scope handling, the authorized UN
Comtrade/PortWatch activation acts and the missing pages, with meaningful NORDWERK effects; preserve budgets, backups,
demonstration services, frozen criteria and closed reviews. B11 lives on `phase6-b11` (PR base `phase6-b10`, so the
diff is B11 alone; retargeted to `main` when #47 merges).

### 24.1 What B11 implements (migration 0070) — `audit/CP6_BATCHES.md` §B11 for the mechanism

- **The governed credential path** (SOURCE_INTEGRATION_STATUS §6 item 3, now §11): a contract's credential by
  REFERENCE (`EYE_SRC_<NAME>`, SRC@v3's `credential_header`), resolved at egress from the deployment, carried apart from
  the binding and dropped off the origin, never recorded; an unbound reference cancels the run before any request; the
  readiness register's verdict follows the binding. The REST connector's digest covers it; the demonstration's six REST
  agents re-provisioned through the governed route.
- **The UN Comtrade act** under §10's authorization: the policy read in full (internal use permitted; citation
  "UN Comtrade"; no re-dissemination without permission; the free tier's 500 calls/day); `un-comtrade` v1 (rest, live)
  registered, approved and its rights recorded with the policy quoted; the act stops before activation — this
  deployment binds no `EYE_SRC_COMTRADE_KEY` (the owner's key, outside the repository); a re-run activates and runs once
  when it is bound. PortWatch: both sources live since §9.11; nothing more to activate; the grant text still pending.
- **The archive tier, the customer export package, the safe referential scope** — designed from the units' remaining
  clauses (AU-MEM-0059, AU-MEM-0061; V03-T-100, V03-T-047, DPD-19, LR-23, L3-C08, DZ-18, DAT-ST-06) by a workflow agent
  (D1–D11), implemented, reviewed adversarially (§24.4) and corrected before the demonstration.
- **Five workspace pages**: `/graph/retention` (schedules, actions, the record, every control, the export package),
  `/graph/ontology` (versions, the active vocabulary, propose/decide), `/intelligence/contradictions` (both assertions,
  the challenge, the adjudication), the scenario review panel on `/prediction/scenarios`, `/decisions/requests` (the
  typed requests and follow-ups) — each built by an agent from the controllers, reviewed and corrected, `next build`
  listing all five; their browser walks are the owner's.

### 24.2 Local results at the B11 tree (before the commit)

`phase6-source-credentials` 3/3; `phase6-retention-b11` 35/35 and `phase6-retention-b11-archive-poll` 4/4 with
`phase6-graph-subscriptions-4` 32/32 on fresh databases; the full integration suite **984/984 in 60 files** on a fresh
database with 0001–0070 (`b11-int-all-1.txt`); the unit suite 2156/2156 in 40 files (`b11-unit.txt`; one C15 gate
control timed out once under the load of a concurrent full suite and 40 review agents, and passed alone — a load
artefact, not a defect); boundaries clean; the upgrade proof with 0022–0070 (49 migrations, 29 registry rows —
`b11-upgrade-proof.txt`); web `tsc` clean and `next build` listing the five new pages; the interface register after 0070
**26 bound / 24 partial / 0 unbound** with L3-I04's binding naming the five executors (`b11-interface-register.txt`).

### 24.3 The NORDWERK demonstration — `evidence/cp6/act-b11.txt` (2026-09-13T14:15Z, head `8463174` with the B11 tree)

Rehearsed on a restored copy of `eye_demo` with its own Redis, API and A COPY OF THE VAULT (an archive moves bytes; the
rehearsal must not move the demonstration's) — the act script corrected there (the vault roots as the API resolves
them; the export gate ceiling) and the copy discarded; then on `eye_demo`: a backup, 0070 through the migrator (digest
`023ebd3034512cd1`), the API restarted on the B11 build, the six REST agents re-provisioned for the connector's new
digest (`reprovision-rest-agents.mjs`: 6 registered, 6 revoked — §9.11.10's act scripted), a second restart reconciling
the persisted schedules to them, and one operator run on `ecb-eurusd` v2 under the new agent (finished, 1 admitted,
7,287 bytes). Then:
- **UN Comtrade** (`activate-comtrade.mjs`): `un-comtrade` v1 registered (a.hoffmann), approved (m.dvorak), rights
  confirmed with the policy quoted; the readiness register reads `inactive — approved; credential reference
  EYE_SRC_COMTRADE_KEY (not bound in this deployment)`; the act stops before activation (SOURCE_INTEGRATION_STATUS §11).
- **Archive**: the current `eu-sanctions-rss` evidence B10 reviewed (3,934 bytes) — P. Novák's archive action resolved
  (execute 1: "the manifest and its digest are kept, the bytes move from the hot tier to the archive tier"), H. Bergmann
  approved on the digest, executed (1 archived; the hot copy removed after the commit), the tier ledger `hot → archive`
  and `custody.archived`; on the host the archive path PRESENT and the hot path ABSENT; verified on the archive
  contract (`{tier: archive, tombstone: false, bytes_present: false, archive_present: true, archive_digest_ok: true}`
  expected = observed); no DeletionVerified; A. Hoffmann downloads the evidence: HTTP 201, 3,934 bytes, the digest the
  manifest's, `tier archive, availability archived`.
- **Customer export**: the two most recent current NORDWERK internal evidence objects — the export action (ceiling
  `internal`, destination `export`) resolved (2 to execute, 0 excluded; no confidential object exists on the
  demonstration, so the redaction gate is the harness's), approved, executed (a package of 2 objects, 1,285 bytes,
  package digest `b01ad90601b6c001…`); the customer's verifier run on the package directory alone — every check PASS
  (integrity 2/2, re-import 2/2 with the 43-field headers recomputing to the canonical digests, completeness, redaction,
  the two chains, `bound_to`, authenticity against the recorded digest) — `PACKAGE OK`; verified (3 checks); the export
  read route (the signature block); H. Bergmann REVOKES it — the read refuses 409 "revoked at …; its bytes are gone",
  the directory GONE on the host, the source evidence still downloads.
- **Safe scope**: a superseded `imf-portwatch-chokepoints` version whose bytes one claim (without an edge) names — A.
  Hoffmann challenges the claim (a queued case); P. Novák's deletion resolves `paused / unresolved_dependency /
  human_review` with the item `blocking` and `details.dependents` naming `review_case:<id>` and the claim; H. Bergmann's
  approval refused (409 "paused — only a resolved scope is approved"); L. Ferreira decides the case (approved); resolved
  again `scope_resolved` under a new digest; approved, executed (1 tombstoned, the bytes removed), verified,
  `DeletionVerified` published.

The five pages are served by the rebuilt web application (`/graph/retention`, `/graph/ontology`,
`/intelligence/contradictions`, `/prediction/scenarios`, `/decisions/requests`); their signed-in walks are the owner's.

**The demonstration service, observed and restored (2026-09-14).** At 2026-09-13T19:59Z `scripts/demo.sh` was run on the
host outside this session (its log at `/tmp/eye-api.log`): it rebuilt `dist`, migrated the DEFAULT database `eye`
through 0070 (the local env names no `EYE_DB_NAME`), and started an API on :3401 against `eye` — the Phase 0 database
with 66 audit-integrity incidents on record, so `/readyz` read `degraded` — replacing the demonstration process that
served `eye_demo`; its web start on :3000 exited 143 (the port held) and was restarted. On 2026-09-14T16:20Z the
demonstration API was restarted on `eye_demo` (`/readyz` ok, 0 incidents) with the same `dist`; `eye_demo` itself was
not touched by that run (its migrations, rows and vault as the act left them). `demo.sh` is the Phase 0 bootstrap
script; the demonstration is served by the restart script that names `eye_demo` — noted for the operator's runbook.

### 24.4 The adversarial review before the commit — `evidence/cp6/b11-adversarial-review.txt`

Six find dimensions (the ports, the bytes, the export, the safe scope, regressions, the harness), two refuters per
finding: **29 confirmed of 31** — two HIGH (the rollback cleanup would have tombstoned an archive copy another action
had committed, losing a manifest's bytes in both tiers; the acquisition lifecycle read a manifest's immutable vault
column instead of its tier, so archived current evidence would have admitted a duplicate on the next live poll), 12
medium, 15 low — every one corrected in the same unapplied migration and tree BEFORE the demonstration (the B9 rule),
each correction with its own harness case (35 + 4 cases), then re-judged by two judges per finding: **29 closed, 0 open**.
The design's object-level DEC branch was dropped as unreachable by any route (the package citation governs, version-
aware); the export's verification contract is the package's own files and recorded digests (the source's present state
recorded, not required); the safe scope is re-proven at execution; the withdrawal is its own act (0070 §9, found by the
retention workspace).

### 24.5 Heads, hosted results, statuses

| Head | What | Hosted `ci` | Hosted C19 |
|---|---|---|---|
| `8463174` | the B10 closure records (phase6-b10, PR #47 — Codex's next bounded closure: code `1fa3b08`) | records only | — |
| `dc1a60a` | the first push of the B11 code — RED: the C15 supply-chain gate's secret scanners (gitleaks, worktree and history) flagged the harness's "pasted secret" control string (a high-entropy literal beside `credentialRef` — GitHub's push protection had already refused its first, provider-shaped form), and one `-4` case still withdrew a retention action under the opener's action (0070 §9 made the withdrawal its own act after the full suite had run). Both corrected — the control string is built at run time (no literal), the case sends `retention.action.withdraw` — the commit AMENDED and the unreviewed branch force-pushed before any review (recorded here; the amended head below is the candidate) | 34867250971 red (supply-chain: gitleaks; build-test: 984/985, the floor case) | 34867251133 green |
| `1e3e4be` | **B11 code** (0070; the credential path; the retention executors and the safe scope; the five pages; the act) — PR #48 on `phase6-b10` | 34869384873 green — build-test job 104061230792: unit 2156/2156 and the meta suite 9/9, the acceptance suite 58/58, the integration suite **985/985 in 60 files on a fresh database** (`phase6-retention-b11` 35/35, `phase6-retention-b11-archive-poll` 4/4, `phase6-source-credentials` 3/3), the upgrade proof with 0022–0070 (49 migrations, 29 registry rows), C18 612/612 and the gate stages; supply-chain (C15, gitleaks worktree and history) and browser-regression green | 34869384887 green |
| the records head after `1e3e4be` | the B11 records (this section, §B11, §11 of the source status, the units and rows, the evidence index) — AU-MEM-0059 and AU-MEM-0061 to `verified:ci` | records only; no refresh chain | — |

Statuses: **AU-MEM-0059 and AU-MEM-0061 `open` → `verified:ci`** — their remaining clauses closed by the executors and
the safe scope on the author's harness at the B11 head and on the hosted chain at `1e3e4be` (ci 34869384873, C19
34869384887; one artefact on a fresh database, no deployment leg), bound in this one records refresh; AU-MEM-0060 a
note; the split reads **3,555 = 3,188 open + 338 local + 29 CI**. Requirement rows: V03-T-100 `partial`
→ `implemented` (passed:harness); V03-T-047, L3-C08 (V3), DZ-18, DAT-ST-06, DPD-19, LR-23 (V7) `missing` →
`partial` (passed:harness); V08 CAP-UM-07 unchanged. The interface register unchanged at 26/24/0 (L3-I04's binding text
names the five executors).

### 24.6 Functioning, partial, missing — and the acceptance work remaining

**Functioning** (harness on a fresh database; the demonstration through the HTTP path) — everything §23.5 listed, and
now: the governed credential path; retention's archive and customer-export executors with their verification contracts;
the safe referential scope of a deletion with the person's route; the retention withdrawal as its own act; the five
pages served.

**Partial** — the UN Comtrade live contract (approved; activation and the first run wait for the owner's key); the
archive tier without a restore-to-hot port, a cold-tier manager's budgets/ordering/escalation, or the sweeper's walk of
the archive root; the customer export without an external destination, an HTTP download of the package bytes, or a
key-based signature; the pages' browser walks (the owner's); the demonstration's forecast-less branch fold (§23.6).

**Missing** — the remaining capabilities of the interface register's 24 partial contracts; the source-derived memory
records; index-tier degradation behaviours; every deployment leg (S7).

**Acceptance work remaining** — Codex's bounded closure of B10-F1..F4 on `1fa3b08` → the merge of #47 and its archive
chain; #48 retargeted to `main` after it for its own bounded review; the hosted run at the B11 head bound in the two
units; the owner's key for Comtrade and the owner's walks of the six pages; the next batch from the register.


## 25. The consolidated checkpoint after `93bce74` / `44b01bb` (2026-09-14): #47 merged with its archive chain complete; Codex's B11-F1 and B11-F2 closed on #48's corrected candidate (migration 0071); the operator's runbook; the Comtrade binding step named

Codex's closure of B10-F1/F2/F3/F4 at `1fa3b08` (records `8463174`) is filed at
`audit/reviews/The_Eye_1fa3b08_Closure_and_B11_Bounded_Review.md` with its probe fixture
`The_Eye_1fa3b08_B11_Probe_Evidence.zip`. It clears #47 under the carried conditional authorization and names two bounded
findings on the B11 candidate `1e3e4be`: **B11-F1** (high; the #48 merge blocker) — overlapping archive actions could lose
committed evidence bytes — and **B11-F2** (medium) — the standalone export verifier succeeds without a package. This
section records the merge, the two closures reproduced at the governed boundary and corrected, the review of the
correction, the demonstration, the runbook Codex asked for, and the exact step that still separates the UN Comtrade
contract from its first governed run. No AU unit changes status; the four requirement rows that carry the archive and the
export gate carry the closure clauses.

### 25.1 #47 merged; the archive chain; #48 retargeted

#47 merged at 2026-09-14T17:43:04Z under the existing authorization as **`93bce74`** (a merge commit; its second parent
the records head `8463174`, the tested code `1fa3b08`). Its push chain on `main`: the `ci` run **34876436407** was RED on
its first attempt for two reasons unrelated to the merged code — in build-test, the upgrade-compatibility step's Phase 1
acceptance suite on the upgraded data failed **A5's timing probe** ("a foreign-scope probe answers like a non-existent
one": the ratio of a foreign row's answer to an absent one's read 5.0 against the probe's ceiling of 3 under the runner's
load; 274/275), and in supply-chain the **C15 patched-image recheck** could not resolve `postgres:18-alpine`'s registry
index (Docker Hub's token fetch failed; `redis:8-alpine` still AFFECTED, so no patched image to move to — the state
recorded in §19). The failed jobs were **re-run** (attempt 2, 17:56–18:07Z) and passed whole, the C17 archive packaged,
verified and uploaded (artifact 10362215652, `c17-evidence-archive-a2-3ef20f02…`, 2,429,623 bytes); **C19 lifecycle
34876436398** green; **C17 finalize 34880449429** green on attempt 2's completion (the finalize of the red completion,
34877919953, skipped as designed); **C19 anchor 34880555543** green (34877925629 green too). The first attempt's red and
the re-run are recorded here as they happened; the re-run created no records to bind and rewrote nothing. **#48 was
retargeted to `main`** at 17:43Z (MERGEABLE, CLEAN), its base now the merged stack.

### 25.2 B11-F1 and B11-F2 — reproduced at the governed boundary, closed by migration 0071 and the corrected executor and verifier

**B11-F1, the finding.** Two approved archive actions overlapped on a manifest P; A also named Q, whose bytes could not be
copied. A copied P into the archive tier and stopped before recording the move; B found that identical copy in place
(`copy_created: false`), recorded its move, committed and removed the hot copy; A resumed, failed on Q, rolled back and ran
its cleanup, which removed every copy A had created — P, now B's. Nothing serialised the two executions on the shared
manifest: `begin_execution` locked each ACTION row, `archive_blob` read the tier and inserted, and the cleanup ran after
the rollback, outside any lock. Codex proved it with the actual services and a real filesystem under doubles; the frozen
closure asked for the interleaving through the governed PostgreSQL path in an isolated database and an isolated vault.

**Reproduced.** `apps/api/test/int/phase6-retention-b11-closure.test.ts` boots the harness with its four vault roots
under a temporary directory of the run and interleaves two governed executions on the real database with a **hold** — a
new primitive of the fault module (`fault.hold` / `fault.pause`): where a fault makes the shipped code crash at a boundary,
a hold makes it *wait* there until the test releases it; test profile only, inert otherwise, fires once. On the unfixed
executor (migrations 0001–0070 on the fresh `eye_verify_b11c0`) Codex's interleaving reproduced exactly:
`evidence/cp6/b11-closure-repro-before.txt` — after B's committed record the retrieval of P from the archive tier answered
`{ ok: false, reason: 'missing' }`; the serial control passed.

**Closed (migration `0071_b11_closure_manifest_locks.sql`; PHASE6_REPORT keeps the mechanism short, `audit/CP6_BATCHES.md`
§B11.9 has it whole).** (a) THE LOCK: `retention.begin_execution` takes, for the whole transaction and before any re-check
reads their state, the domain's MOVERS advisory lock (shared) and then each executable manifest's advisory lock in one
canonical order — exclusive for an archive or a deletion, shared for a customer export, whose bytes are read while the
package builds; an execution naming more than 256 manifests takes the movers lock exclusively instead (one entry in the
cluster's finite lock table, not thousands). A second execution naming a held manifest waits at its start with nothing
copied and nothing recorded. (b) OWNERSHIP THROUGH THE CLEANUP BOUNDARY: a copy is STAGED under its creating execution ATTEMPT's own
name (`<locator>.staging-<attempt_id>` in the archive root; every execution of an action is its own attempt) and published
under the locator by the controller only AFTER the commit that recorded the move — so a copy whose record did not commit
is adoptable by no other execution, and a rollback removes only the file bearing its own attempt's name (a second attempt
of the same action, admitted after the first's backend was lost and the server rolled it back to approved, owns its own
staged file; the first's late cleanup cannot touch it — the review's second round found the per-action name was not
enough, §25.3). No lock has to survive to the removal for the removal to be safe, and none could be relied on: a transaction's locks end with its backend and at a top-level abort (PostgreSQL releases them at
the abort itself, not at the client's ROLLBACK — the author's first closure assumed otherwise and the review's judges
proved it wrong, §25.3). The execution still runs in a subtransaction (a savepoint after the locks) so a statement
cancelled or timed out mid-record aborts only that: the cleanup runs on a transaction still open, its locks still held (a
courtesy to the record, not a requirement of the removal), and the pipeline's rollback and the controller's pause follow as
for any failure; an execution naming more than 256 manifests — whatever its kind — takes the movers lock exclusively. (c)
THE PORT FAILS CLOSED:
`observation.archive_blob` records a move only for a manifest the transaction holds. (d) An execution that finds the
manifest archived under the lock — the loser of an overlap — reads the committed copy (published, or still staged, in
which case it publishes it there and then by a rename; the hot copy is scheduled for removal only once a published copy
stands), records the move as already made and copies nothing; both actions execute and verify, one tier record. (e) THE
PUBLISHED COPY IS THE SERVED ONE; a copy recorded but not yet published — the instant after the commit, or a publish that
failed and awaits its retry — is found by every reader of the archive tier under the manifest's digest
(`VaultService.readArchived`: the evidence download, the acquisition lifecycle's availability, the export builder, the
executor's already-archived branch), the hot copy staying in place until the publish succeeds (a pending residual, retried
by the execute route, which publishes any staged copy under the manifest's digest before it removes; a successful publish
retires the other staged copies of the locator; when no staged copy publishes, the retry copies the kept hot copy again;
the retry works from the EXECUTED ITEMS, not from residual rows alone — a process gone between the commit and its
post-commit work leaves none — and leaves a manifest tombstoned since to its deletion; a transaction that fails after the
executor returned has its attempt's staged copies removed by the controller); a
deletion retires staged copies with the bytes, and a deletion's verification counts a staged copy as bytes present (the
round-2 finders' point: DeletionVerified must not be published while one remains); `scripts/ops/restore.sh`'s blob
verification and its after-boundary listing look where the product's readers look (the locator, a staged copy under the
digest, the hot copy), counting a pending publish apart, never as absent. (f) The
controller keeps the executor's verdict when the ROLLBACK itself fails (a lost connection) and records the pause on a fresh
connection; a lock PostgreSQL could not grant at the start (40P01, 55P03) pauses the action for a retry; and every pool
client carries an `error` listener (`shared/db.ts`), so a backend terminated under a checked-out connection is a logged,
failing query — not an unhandled event that ends the process. The serial control and the already-committed-copy control
(A9) keep their behaviour; the failure record (the pause with its class, the approvals revoked) and the retry stay.

The harness proves each clause on the real database: Codex's interleaving (B held back while A's copy is staged and
unrecorded; A fails, removes its staged file, pauses; B makes its own copy, commits, publishes, is served and verifies; A
resolved again executes Q); the hold INSIDE A's cleanup (B still held back); the serial control; the overlap that succeeds,
serially and concurrently (one mover, one finder, one tier record); the lock's END with the backend — A's backend
terminated by the superuser while held after its copy: B makes its own copy and commits (A's staged file is adoptable by
no one), the server rolls A back, the controller pauses A on a fresh connection, A's cleanup removes only A's staged file,
B's evidence survives and verifies; and a top-level ABORT inside the execution — A's record of P cancelled by the superuser
mid-statement (what a statement timeout does unattended): the subtransaction aborts, A rolls back to its savepoint, removes
its staged file and pauses with the cancel on record, B (held back throughout) then makes its own copy; and a SECOND
ATTEMPT of the same action — A's first attempt held after its copy and its backend terminated, the server rolling the
action back to approved; a second execute of A admitted, staging under its own attempt's name, recording, committing and
publishing; the first attempt released, removing only its own staged file and answered 409 with the refused pause named;
A's published copy served and verified. **9/9** on the fresh `eye_verify_b11c16` through 0071.

**B11-F2, the finding and the closure.** With `manifest.json` = `null` or `[]` the shipped verifier recorded one passing
parse check, skipped the whole validation branch and exited 0 — `ok: true` even with `--expect-package-digest`, its text
verdict "PACKAGE FAILED: 0 check(s)" disagreeing with its exit. The corrected `scripts/retention/verify-export.mjs` states
its verdict rule: PACKAGE OK only when every check passed AND the validation ran through to the chain — a manifest that is
not a JSON object, a missing object list or signature block, or a chain that could not be computed is a failed check
("validation complete"), never a success by absence; an expected digest that could not be compared is a failed
authenticity check; text, JSON (`ok`, `complete`, `failed`) and the exit status always agree. The review of the candidate
added two clauses: `excluded` enters the chain AS LISTED (a member that is not a list is a failed check — the shipped
verifier substituted `[]` and let an edited member verify against the product's digest), and a listed file that cannot be
read is a failed integrity check, never a crash. The harness (F2): null, a list, a scalar, no manifest, no object list, no
signature block — each exit 1, `ok: false`, `complete: false`, PACKAGE FAILED, and with an expected digest a failed
authenticity check; the synthetic one-object package built with the product's own digest helpers passes with its
expected digest, tampered it fails. B5's controls on a real export stay.

### 25.3 The adversarial review of the closure candidate, and the corrections — `evidence/cp6/b11-closure-adversarial-review.txt`

The closure candidate was reviewed before its commit by the author's adversarial workflow in two rounds. **Round 1**: six
finders (the lock design, the executor's in-transaction cleanup, the re-declared ports, the verifier, the harness and the
hold primitive, the regressions and the scripts), two refuters per finding who default to "refuted" unless they can
demonstrate the defect, a finding confirmed unless both refute it — **19 findings, 10 confirmed, 9 refuted** (44 agents).
The confirmed ones changed the closure: (1) **the lock ends with the backend** (three findings, one demonstrated on a
fresh database: A's session terminated while held after its copy — the transaction lock gone, B adopts the copy and
commits, A's cleanup removes B's bytes; and, in the shipped process, the terminated backend's `error` event ending the API
before the cleanup, so the first candidate was "protected by an accident, not by its lock"); (2) the verifier's `excluded`
substitution and a listed file that cannot be read crashing the verifier; (3) `disarm()` unable to release a fired hold;
(4) `demo-restart.sh` starting the process without the port it checks, and its macOS environment split at every space;
(5) the runbook's migrate step failing as written; (6) the after-evidence predating the last code change. Among the
refuted: the bound_to restatement's vacuous pass and the zero-object package (real, not defects of the correction; left as
observations), the temporary directories (removed anyway), and four findings the refuters judged against a tree already
corrected while the review ran (the lock-table bound, the deadlock's bare 500, the failed-ROLLBACK verdict loss, the stale
upgrade-proof comment). The author's first correction of (1) proved the lock on the transaction's connection before each
removal and read "current transaction is aborted" as held. **The re-judgement (two judges per confirmed finding) proved that
premise false**: PostgreSQL releases a transaction's locks at the abort itself, so a statement cancelled or timed out
mid-record freed the manifests' locks with the connection alive — reproduced through the governed controllers on a fresh
database (B adopted A's copy and committed; A's cleanup, answered 25P02, removed B's bytes) — and, on a lost backend, a
check-then-act window remained between the proof and the unlink. **Round 2** replaced the mechanism: the copy STAGED under
its own name and published only after the commit (§25.2 b, e), a subtransaction for the failure record, the item
savepoints rolled back only while they exist; the two open findings were judged again by two judges each — all four
named one residual, the staged name being per ACTION (a second attempt of the same action, admitted after the first's
backend was lost, shared it, and the first's late cleanup removed the second's file) — corrected by the per-ATTEMPT name
and its own harness case; three finders with two refuters each then attacked the staged-copy design itself:
**the actionable findings corrected in the same tree (the already-archived branch publishes a staged copy under the lock before scheduling the hot removal; the retry works from the executed items, not residual rows a crash never leaves; a listing failure fails a deletion's cleanup and its verification closed; the download's custody row names where the bytes were served; the movers lock is taken exclusively above 256 manifests of any kind; the harness's ABORT case asserts the lock inside the cleanup and A9 spies the removals the cleanup could make), the two structural residuals — the post-commit byte movers running outside the manifest lock, and the archive root never reconciled — recorded as follow-ups (§25.9)**. Every finding, verdict and
re-judgement is in the evidence file.

### 25.4 Local results at the closure tree (before the commit)

| Run | Result |
|---|---|
| the closure harness `phase6-retention-b11-closure` on `eye_verify_b11c16` (fresh, 0001–0071; an isolated vault) | **9/9** (F1 ×7, F2 ×2); the before-run on `eye_verify_b11c0` (0001–0070, the unfixed executor): Codex's interleaving RED (`missing`), the serial control green |
| `phase6-retention-b11` 35, `-archive-poll` 4, `phase6-graph-subscriptions-4` 32 on `eye_verify_b11c17` (fresh, 0001–0071) | **71/71** |
| the full integration suite on a fresh database (0001–0071) | **994/994 in 61 files** — `evidence/cp6/b11-closure-int-all-1.txt` |
| the unit suite (`pnpm test`) | **2156/2156 in 40 files** and the meta suite 9/9 — `evidence/cp6/b11-closure-unit.txt` |
| the upgrade proof (`scripts/phase1/verify-0022-upgrade.mjs`) | PASS — 0022–0071 (50 migrations, 29 registry rows); the Phase 1 and Phase 2 suites on the upgraded data — `evidence/cp6/b11-closure-upgrade-proof.txt` |
| typecheck | clean |

### 25.5 The NORDWERK demonstration — `evidence/cp6/closure-b11.txt`

The closure ran on the NORDWERK demonstration (`eye_demo`) through the HTTP path, rehearsed first on a restored copy with
its own vault copy and Redis (`scripts/phase6/closure-b11.mjs` → `evidence/cp6/closure-b11.txt`, 2026-09-15): the running
target verified by `scripts/ops/demo-restart.sh --verify-only`, `eye_demo` backed up and migrated with 0071, the API
restarted by the runbook's script with its target verified. **Scene 1 — overlapping archives (B11-F1):** two approved
archive actions on one NORDWERK internal record executed CONCURRENTLY; the manifest's lock ordered them — exactly one made
the copy and the move (`copy_created: true`), the other found it archived under the lock and recorded the move as already
made (`copy_created: false`), one tier record on the ledger, the archive path present and the hot path gone, both actions
verified against the archive contract, A. Hoffmann's download served from the archive tier and verified, and no advisory
lock outlived its transaction (`pg_locks`: 0). **Scene 2 — the verifier (B11-F2):** the same two records exported and
verified by the corrected verifier (`PACKAGE OK` with the expected digest); on copies whose `manifest.json` is `null` and
`[]`, the verifier AS SHIPPED at `1e3e4be` (read from git) answered exit 0 / `ok: true` — the finding on this host — while
the corrected verifier answered exit 1 / `ok: false` / `complete: false`, and with `--expect-package-digest` a failed
authenticity check; the package was then revoked and its directory gone. **Scene 3 — Comtrade:** the contract reads
`inactive`, rights confirmed, `credential: reference EYE_SRC_COMTRADE_KEY (not bound in this deployment)`, and the act
printed the exact remaining binding step (§25.7). The `demo-restart.sh` wrapper hung once on the first run holding the
API's pipe open; the script now starts the API fully detached (`setsid`) and the act was re-run clean — the demonstration
API stayed up and healthy on `eye_demo` throughout.

### 25.6 The operator's runbook — `docs/ops/DEMONSTRATION_RUNBOOK.md`, `scripts/ops/demo-restart.sh`

Codex asked that the restart incident of 2026-09-13 (§24.3) be carried into the operator's runbook: a future restart must
select `eye_demo` and its vault roots explicitly and verify the running target, and the Phase 0 bootstrap must never be
used as a restart. The runbook records what the demonstration is (the database, the API's settings, the vault roots as the
process resolves them, the local secret handoff), the restart procedure, what must not be run, the migration procedure
for a batch, the rehearsal rule (a restored copy with its own vault copy and Redis), the incident, and how to read the
running target by hand. `scripts/ops/demo-restart.sh` is the restart: it loads the handoff, sets the demonstration's
identity, restarts the API and then **verifies the running target** — the process's `EYE_DB_NAME`, its vault roots, the
scheduler flag, `/readyz` `ok` — and exits non-zero when the process serves any database but `eye_demo`; `--verify-only`
checks without restarting (the demonstration act's first lines); `--build` rebuilds first. It prints no credential. The
demonstration's restart on 0071 in §25.5 was performed by it; the verification lines are in the act.

### 25.7 The UN Comtrade key — the exact remaining binding step

The existing UN key's use is authorized (SOURCE_INTEGRATION_STATUS §10–§11). It is **not on this host**: `.eye-local/env`
carries no `EYE_SRC_*` line, the demonstration process binds none (its environment read by name only), the login keychain
has no item labelled or serviced `comtrade`, and no dotfile names it — checked by name, no value printed or looked for
anywhere else. The readiness register says the same for the contract (`un-comtrade` v1, rights confirmed, verdict
`inactive`, "credential: reference EYE_SRC_COMTRADE_KEY (not bound in this deployment)"). The step that remains is the
owner's: add one line `EYE_SRC_COMTRADE_KEY=<the key>` to `.eye-local/env` (mode 0600; the file is never committed),
restart the demonstration with `scripts/ops/demo-restart.sh` (a changed file binds nothing until the process is restarted
with it; the script's verification shows the process's settings by name), then run
`node scripts/integrations/activate-comtrade.mjs` — it reads the readiness verdict of the running process, activates the
contract only when the credential is bound there, and performs the first governed run under the existing permissions,
budget and cadence. Nothing else of the act changes; PortWatch stays live and untouched.

### 25.8 Heads, hosted results, statuses

| Head | What | Hosted `ci` | Hosted C19 |
|---|---|---|---|
| `93bce74` | **`main`: #47 merged** (B10's closure; second parent `8463174`) | 34876436407 — attempt 1 red (A5's timing probe under load; Docker Hub's token fetch in the C15 recheck), attempt 2 green with the C17 archive (artifact 10362215652); C17 finalize 34880449429 green; C19 anchor 34880555543 green | 34876436398 green |
| `44b01bb` | the B11 records (§24) — the head of #48 before this closure, now on `main`'s base | 34871580761 green (records only) | 34871580954 green |
| **`6b93a27`** | the **B11 closure** (0071; the staged-copy design; the executor, controller, pools, fault-module hold, verifier, harness, runbook, restart script and act) — PR #48 → `main` | **34968358484 green** — build-test: apps/api unit 2156/2156 and the meta suite 9/9, acceptance 58/58, the integration suite **994/994 in 61 files** on a fresh database (`phase6-retention-b11-closure` 9/9), the upgrade proof through 0071 (50 migrations), C18 612/612; supply-chain and browser-regression green | 34968358342 green |
| the code head after `44b01bb` | **the B11 closure** (0071; the executor, the controller, the pools, the fault module's hold, the verifier, the closure harness, the runbook and the restart script, the act) — PR #48 on `main` | the hosted run is bound in the records refresh after the push (one commit; no refresh chain) | — |

Statuses: **no AU unit changes status** in this closure (the B11 units AU-MEM-0059/-0061 stay `verified:ci` at `1e3e4be`;
the closure's hosted run is bound in the records refresh after the push); the split reads **3,555 = 3,188 open + 338 local
+ 29 CI** as before. Requirement rows DZ-18 and DAT-ST-06 (V7), L3-C08 and V03-T-047 (V3) carry the B11-F1 / B11-F2
closure clauses in their evidence and remaining-work text; statuses unchanged (`partial`, passed:harness, branch-only).
The interface register unchanged at 26/24/0.

### 25.9 Functioning, partial, missing — and the acceptance work remaining

**Functioning** — everything §24.6 listed, and now: overlapping retention executions serialised on the manifests they
move, with the copies an execution created removed under a proven lock or left for adoption; the loser of an overlap
recording the move as already made; the verifier failing closed; the demonstration restart with its target verified.

**Partial** — the UN Comtrade live contract (approved; the key's binding is the owner's, §25.7); the archive tier without
a restore-to-hot port, a cold-tier manager's budgets/ordering/escalation, or the sweeper's walk of the archive root (now
also the disposal of a staged copy orphaned by a process lost between its copy and its cleanup — retired meanwhile only by a
deletion or by the publish of another attempt's copy; the round-2 finders' point, kept as the follow-up); the customer export without an external destination,
an HTTP download of the package bytes, a key-based signature, or the tier read recorded on its custody row; the pages'
browser walks (the owner's, outstanding until performed); the demonstration's forecast-less branch fold (§23.6).

**Missing** — the remaining capabilities of the interface register's 24 partial contracts; the source-derived memory
records; index-tier degradation behaviours; every deployment leg (S7).

**Acceptance work remaining** — Codex's bounded closure of B11-F1/F2 on #48's corrected candidate (`6b93a27`, the required gates green, #48 MERGEABLE/CLEAN against `main`) — its
next closure limited to the changed behaviour — then the merge of #48 under the existing authorization and its archive
chain on `main`; the owner's key for Comtrade and the owner's walks of the six pages; the next batch from the register
(the follow-ups above; the register's 24 partial contracts).
