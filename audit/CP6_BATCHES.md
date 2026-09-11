# CP-6 — the implementation batches for the decided product choices, the eight scenario kinds and the `CorrectionApplied` consumer

Opened 2026-09-11 at the owner's direction ("define and implement concrete acceptance-unit batches").
Each batch names the acceptance units it closes (`audit/acceptance-units/*.csv`), the exact change,
the evidence class that verifies it, and the profiles it applies to. A batch is **done** only when its
units are `verified:<scope>` on the artefact and profiles they apply to (S7): a local demonstration
never verifies a `profiles = all` unit; hosted CI on a fresh database verifies the harness cases.

| Batch | Scope | Units | State (2026-09-11) |
|---|---|---|---|
| **B3 — scenario kinds** | the eight kinds of Volume 0 ch. 14 as a versioned vocabulary; divergence and per-branch assumptions | AU-PRD-0021 | **implemented** on `phase6-decisions` (migration 0058; harness case C-022 in `phase4-acceptance`, 16/16 locally); `verified:ci` once the hosted run at the implementing head is green |
| **B1 — `CorrectionApplied` consumer** | the automatic dependency walk on an applied correction | AU-MEM-0108–0111 (new; the consumer's own properties), AU-DP-0043 (partial-walk visibility, re-verified); AU-DP-0041 narrowed — see §B1 | **implemented** on `phase6-decisions` (migration 0060; harness `phase6-propagation-consumer`, 15/15 locally on real Redis and the real outbox); `verified:ci` once the hosted run at the implementing head is green; exercised on the demonstration (§B1) |
| **B2 — warning levels** | four levels by a versioned derivation; C0–C4 unchanged | AU-PRD-… (warning severity) — §B2 | defined; not implemented |
| **B4 — profile legs and SLO floors** | three acceptance legs per profile row; SLO floors with declared variance | register mechanics (audit rows), P7-D units — §B4 | defined; audit-side work |
| **B5 — CAP aliases** | versioned subject-based aliases, lossless | audit CP-6 mapping — §B5 | defined; audit-side work |

## B3 — the eight scenario kinds (done in code; verification pending the hosted run)

**Decision.** R-4 history: "the eight scenario kinds of Volume 0 ch. 14 are P4 full-product completion
work". C-022: "shall support baseline, upside, downside, disruption, stress, adversarial,
counterfactual, and user-defined scenarios"; AU-PRD-0021 adds "with explicit divergence logic and
per-branch assumptions".

**Change (migration `0058_scenario_kinds_v1.sql`, `scenarios.service.ts`, `prediction.capabilities.ts`,
`apps/web/lib/prediction.ts`).**
* `prediction.scenario_kind_versions` — the vocabulary as a VERSIONED record (v1 = the eight, with
  its source clause); a branch records `kind_vocabulary_version`. Readable in every scope (forced RLS,
  shared policy), writable by migrations alone.
* `branches_current.kind` CHECK widened to the eight; `kind_label` (required for, and only for,
  `user-defined`; 2–64 chars); `divergence` (prose, ≥ 8 chars; required for the five added kinds —
  upside and downside keep 0029's rule that a non-baseline branch names the indicator that flips it,
  and may add the prose; the constraint is `NOT VALID` so rows declared before 0058 keep their nulls);
  `assumptions` (`[{statement, basis?}]`, a list, each statement ≥ 2 chars).
* `prediction.add_branch` replaced with the three inputs, every rule enforced in the port; the
  `branch.added` event carries them.
* SCN canonical object schema **v2** (backward: v1 documents validate), `schema_ref: 'SCN@v2'`,
  the payload names `kind_vocabulary_version`.

**Acceptance unit AU-PRD-0021 — evidence.** `apps/api/test/int/phase4-acceptance.test.ts`, case
"C-022 · the eight scenario kinds (vocabulary v1)": a ninth kind refused (422), a nameless
user-defined kind refused, a disruption without divergence refused; a scenario with all eight kinds
declared, each with its assumptions, the user-defined one labelled "regional blockade" with two
assumptions; the vocabulary row read back; the canonical object at `SCN@v2` naming version 1; a stray
kind refused by the database; the user-defined disruption **flips on its indicator** and raises its
warning. Profiles: all; evidence class: harness → `verified:ci` at the first green hosted run.

**Not done by B3** (stays open on the same unit's neighbours): a branch's assumptions are declared, not
yet linked to Knowledge Graph assumption objects (AU-MEM); the simulation engine's method families
(AU-TWN-0028) are unrelated to this vocabulary.

## B1 — the `CorrectionApplied` consumer (implemented)

**Two findings that changed the batch as first defined (2026-09-11).**
1. **The acceptance-unit ids first reserved here, AU-MEM-0091–0094, were already taken** —
   `audit/acceptance-units/group-b-memory-prediction-twins.csv` lines 92–95 carry them with
   unrelated statements (the strategic-graph moat diligence claim, the model training cut-off,
   agent execution-memory isolation, the reusable-experience lesson lifecycle). Those rows and
   their histories are preserved untouched. The consumer's units are **AU-MEM-0108–0111**
   (the highest existing AU-MEM was 0107; ids are contiguous), mapped to the existing
   requirements they serve (V7 DP-24-001/-005, DP-29-001/-005, DP-43-003/-005, DAT-SM-08,
   DCN-09/-13; V8 PR-24-001/-003/-005, CAP-UM-12; V3 L1-I05, V03-T-271/-300/-302/-303;
   V0 V00-T-045; V2 V02-T-129; V5 AI-29-005, AG-014; V4 ES-30-002; V6 MS-01/-04/-06).
   The parent unit AU-DP-0041 stays open, narrowed to what B1 does not deliver (TT-04
   reassessment of inferred relationships; derivative coverage beyond graph, twins,
   forecasts, scenarios, simulations and warnings; escalation of a stalled consumer beyond the
   visible queue). Partial-walk visibility is AU-DP-0043's existing statement, re-verified
   with the automatic walk rather than duplicated.
2. **No event named `CorrectionApplied` was ever enqueued.** The apply path re-used the
   submission's event name, `CorrectionReceived` (`orchestrator.service.ts`), distinguishable
   from a submission only by a non-empty `propagation_scope.resolved`. A consumer filtered on
   the documented name would never have fired. From 0060 the apply path enqueues
   `CorrectionApplied` (with `applied_by`); the submission keeps `CorrectionReceived`. Rows
   applied before 0060 keep the old name and are walked only when an agent is registered with
   `backlog: 'walk'`.

**Change (migration `0060_propagation_consumer.sql`; `apps/api/src/graph/propagation/*`;
`outbox.publisher.ts`; `scheduler.service.ts`; `graph.controller.ts`; `pdp.service.ts`).**
1. A **propagation agent** — role `propagation_agent` (DOMAIN), a principal of kind `agent`
   created on the identity authority, a registration on the commit authority
   (`graph.propagation_agents`, one active per domain, owner a human, budgets
   `max_roots_per_event` 64 / `max_elapsed_ms` 600 000 / `backlog_policy`), registered by a
   tenant or platform administrator (`POST …/graph/impact/propagation/agents/register`),
   revocable (`…/agents/:id/revoke`, also the domain administrator's). The walker's identity
   (`PROPAGATION_WALKER`: version 1.0.0, a code digest of the walk's method) is the code's,
   never the request's. PDP: `propagation_agent` holds `graph.impact.propagate` and nothing
   else. Its session is opened by `graph.propagation_agent_session_open` under the
   identity-operation capability (registration active, version and digest as registered,
   principal an active agent) and extended only by walk progress
   (`graph.propagation_agent_session_extend`, one extension per committed root — 0057's rule).
2. **Routing, not a consumer on `domain-events`**: the publisher adds a `CorrectionApplied`
   row to the domain's own queue `graph:<tenant>:<domain>:propagation` (Redis name derived as
   every scoped queue is) before acknowledging the row, with the outbox row id as the job id
   on both queues. `domain-events` stays the global, unconsumed log. A per-domain worker
   (`SchedulerService.startPropagationWorker`, concurrency 1) refuses a job whose payload
   scope disagrees with the queue (unrecoverable, never retried).
3. **The attempt ledger** `graph.propagation_attempts`, keyed by the outbox row id, written
   OUTSIDE the agent's authority under the scheduler's bounded machine capability
   (`propagation_attempt_receive` / `_finish`) so a refused grant is still recorded; the
   **per-root checkpoint** (`propagation_root_begin` / `_done`) taken FOR UPDATE inside the
   walk's own transaction under the agent's authority and committed with 0034's
   `record_impact`, so a redelivery, a restart or a second worker never walks a root twice.
   Roots are the case's own `affected_resolved` (0027), never the payload's.
4. **Coverage is the database's** (0027 §2): after every root the attempt mirrors the case's
   `propagation_state` — `complete`, or `partial` when a walk was truncated or left a root
   uncovered; a partial attempt is terminal for its event and the case stays listed by
   `/impact/awaiting`, which now carries the latest automatic attempt under `automatic`
   (state, deliveries, attempts, reason, agent) and states it beside the case's own status.
5. **Failure is recorded, never fatal**: an infrastructure fault is recorded on the attempt
   and rethrown for BullMQ's bounded retry (5 attempts, exponential back-off from 2 s), the
   next delivery resuming from the checkpoint; a refused or absent grant, a revocation
   mid-walk and a budget refusal are governance answers — recorded with their reason, the
   job completes, nothing is retried, the operator route remains available. Startup and
   every registration reconcile: workers for every domain with an active agent, and every
   outstanding apply event with no attempt or a failed one re-driven.

**Acceptance units.** AU-MEM-0108 (automatic propagation within one publisher tick; the
impact names the agent instance), AU-MEM-0109 (redelivery, restart and crash-after-first-root
walk nothing twice), AU-MEM-0110 (fault recorded and retried; grant, revocation and budget
refusals recorded, not retried, visible; the process never exits), AU-MEM-0111 (the governed
path: registration by role, one active agent per domain, session refused for a drifted walker,
every new port refuses without its capability, unrelated events untouched, a misrouted job
fails closed, partial walk listed and re-walkable, the operator route unchanged); AU-DP-0043
re-verified with the automatic partial walk. Evidence:
`apps/api/test/int/phase6-propagation-consumer.test.ts` (15 cases; real Redis, real outbox
publisher, the process restarted mid-suite). Profiles: all; evidence class: harness →
`verified:ci` at the first green hosted run at the implementing head. Units whose wording
said "operator-initiated" or "consumer deferred" were re-pointed (AU-MEM-0029/-0030/-0039/
-0041, AU-TWN-0007, AU-OBS-0124/-0126, AU-DP-0041/-0043/-0071/-0144, AU-INF-0164/-0694/
-0783/-0811, AU-IDP-0365, AU-COM-0144, AU-GOV-0164); none was closed by the re-pointing.

**On the demonstration** (`scripts/phase6/register-propagation-agent.mjs`, then a fresh
correction applied through the governed route): see PHASE6_REPORT.md §18.

## B2 — warning levels (defined)

**Decision.** Four levels — low, normal, high, critical — derived by a VERSIONED rule from the
consequence class, stating impact and response urgency; confidence and the C0–C4 authority class
kept explicit and distinct (a label never changes decision authority).

**Change.** Migration: `prediction.warning_level_versions` (v1: the derivation table consequence →
level, urgency), `warnings_current.level`, `level_version`, `urgency`; the raise path derives them at
raise time and records the version; `WRN` schema v2 carries them; the authority class stays the
operation's, untouched by the level. The web warning card shows level + version.

**Acceptance units (new):** AU-PRD-0090 "every raised warning carries a level from the current
derivation version and the version it was derived under"; AU-PRD-0091 "a change of derivation is a new
version; existing warnings keep theirs"; AU-PRD-0092 "the level never changes the operation's
consequence class or the authority a response requires". Evidence: harness → `verified:ci`.

## B4 — profile legs and SLO floors (defined; audit-side)

**Decision.** Three acceptance legs per profile row (SaaS, private cloud, on-premises), with
disconnected and air-gapped evidence carried COMPLETELY per applicable capability on their own rows;
SLO baselines as floors for safety/durability/provenance semantics with declared, justified variance
where the controlling clauses permit, mapped for the entire catalogue.

**Change.** `audit/summarise-units.mjs` and the unit files: `profiles` becomes the leg vector
(`saas|private|onprem`, plus `disconnected`/`air-gapped` rows where a capability has offline
obligations); a unit is `verified:all` only when every leg is verified; the SLO catalogue
(`audit/SLO_CATALOGUE.md`, new) lists every SLO of Volume 4 with floor/variance and the clause that
permits variance. No product code.

**Acceptance units:** every `profiles = all` unit's legs made explicit (mechanical rewrite, one
commit, counts unchanged); AU-INF-… SLO rows re-pointed to the catalogue.

## B5 — CAP aliases (defined; audit-side)

**Decision.** Versioned, subject-based aliases (CAP-PD-11 → CAP-AU-08 + CAP-DL-12 among them),
lossless mapping of every obligation, historical ids resolvable, nothing deleted to preserve a count.

**Change.** `audit/CAP_ALIASES.md` (new): the alias table v1 with every Volume 9 CAP id, its Volume 8
definition or its subject-based alias, and the obligations mapped; the requirement CSVs gain a
`cap_alias` column populated from it; `audit/second-pass.mjs` resolves an alias when a row cites one.

**Acceptance units:** the 89 CAP bindings of Volume 9 each resolve to a defined capability or a
versioned alias (a check in `summarise-units.mjs` reports any that do not).

## Order and the next implementation batch

B3 and B1 are done in code (the 2026-09-11 checkpoints). Next: **B2** (warning levels), then
B4/B5 (audit mechanics, no product risk). The synthetic-company demonstration (`eye_demo`, NORDWERK) remains the deliverable
every batch is exercised on: B3's kinds become visible on the demonstration when a scenario with the
new kinds is declared there through the governed route (a scripted act, `scripts/phase4/`), which is
the next demonstration step after the hosted run is green.
