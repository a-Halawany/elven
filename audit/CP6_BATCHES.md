# CP-6 — the implementation batches for the decided product choices, the eight scenario kinds and the `CorrectionApplied` consumer

Opened 2026-09-11 at the owner's direction ("define and implement concrete acceptance-unit batches").
Each batch names the acceptance units it closes (`audit/acceptance-units/*.csv`), the exact change,
the evidence class that verifies it, and the profiles it applies to. A batch is **done** only when its
units are `verified:<scope>` on the artefact and profiles they apply to (S7): a local demonstration
never verifies a `profiles = all` unit; hosted CI on a fresh database verifies the harness cases.

| Batch | Scope | Units | State (2026-09-11) |
|---|---|---|---|
| **B3 — scenario kinds** | the eight kinds of Volume 0 ch. 14 as a versioned vocabulary; divergence and per-branch assumptions | AU-PRD-0021 | **implemented** on `phase6-decisions` (migration 0058; harness case C-022 in `phase4-acceptance`, 16/16 locally); **`verified:ci`** at `5118376` (ci run 34647461349, 836/836 on a fresh database) |
| **B1 — `CorrectionApplied` consumer** | the automatic dependency walk on an applied correction | AU-MEM-0108–0111 (new; the consumer's own properties), AU-DP-0043 (partial-walk visibility, re-verified); AU-DP-0041 narrowed — see §B1 | **implemented** on `phase6-decisions` (migration 0060; harness `phase6-propagation-consumer`, 15/15 locally on real Redis and the real outbox); **`verified:ci`** at `5118376` (ci run 34647461329/34647461349, 836/836 on a fresh database); exercised on the demonstration (§B1) |
| **B2 — warning levels** | four levels by a versioned derivation; C0–C4 unchanged | AU-PRD-0061–0063 (new); AU-PRD-0034/-0037/-0039, AU-DP-0164 re-pointed — §B2 | **implemented** on `phase6-decisions` (migration 0061; harness `phase4-warning-levels`, 6/6 locally); `verified:ci` once the hosted run at the implementing head is green |
| **B6 — GraphChanged / MemoryCorrected subscriptions** | the events with affected identities, relationships, temporal scopes and subscriptions; a durable subscription registry and delivery ledger; six consumers (twins, forecasts, scenarios, decisions, retrieval, memory mappings) | AU-MEM-0112–0117 (new); AU-MEM-0030 (the parent, its full statement retained) — §B6 | **implemented** on `phase6-decisions` (migration 0063; harness `phase6-graph-subscriptions`, 13 cases on real Redis and the real outbox, the process restarted three times mid-suite); **`verified:ci`** at `fcbdefc` (ci run 34663012651, 852/852 in 49 files on a fresh database; C19 34663012694); exercised on the demonstration (§B6) |
| **B7 — unresolved work, the declared partition, failure classes, telemetry, legal holds** | Codex finding 3 corrected (a mismatched retrieval check stays unresolved); `claim.corrected` through the review route and the edge mapping under MemoryCorrected; backlog served once; the outbox's declared partition and sequence as the cursor; failure classes and dispositions; execution-state telemetry; legal holds on evidence | AU-MEM-0118, AU-MEM-0119 (new); AU-MEM-0114 (its remaining clause), AU-MEM-0029 (reconciled to `verified:ci`), AU-MEM-0039, AU-MEM-0041, AU-DP-0071 (concrete checkpoints, remaining clauses stated) — §B7 | **implemented** on `phase6-decisions` (migration 0064; harness `phase6-graph-subscriptions-2`, 14 cases, and the reproduction file; two consecutive passes locally); **`verified:ci`** at `a852c65` (ci run 34693808238, 867/867 in 51 files on a fresh database; C19 34693808173); exercised on the demonstration (`evidence/cp6/act-b7.txt`) |
| **B4 — profile legs and SLO floors** | three acceptance legs per profile row; SLO floors with declared variance | register mechanics (audit rows), P7-D units — §B4 | **applied** (2026-09-11): leg vector + `legs_verified` on every unit; `audit/SLO_CATALOGUE.md` v1; no leg accepted |
| **B5 — CAP aliases** | versioned subject-based aliases, lossless | audit CP-6 mapping — §B5 | **applied** (2026-09-11): `audit/CAP_ALIASES.md` v1; `cap_alias` on the requirement CSVs; 89 = 71 + 18, unresolved 0 |

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

**Codex finding (2026-09-12), corrected by migration 0062.** `graph.propagations_to_reconcile()`
re-drove only events with no attempt or a failed one; an attempt stranded in `received` or `walking`
by a process interruption — which records nothing, that being the point — with Redis lost was never
resumed. Reproduced on the actual function (received → 0 reconciled, walking → 0); after 0062 every
non-terminal attempt is re-driven, a job still held by a live worker is left alone (job-id dedupe;
the reconciliation report distinguishes `reDriven` from `inFlight`), and the walk stays serialised
per event by the attempt row's lock. Three harness cases added: a real interruption after receipt
and after the first committed root — the worker abandoned without acknowledgement, the queue lost,
the process restarted — resumed with no duplicate impact or twin event; and a reconciliation run
against a live worker. AU-MEM-0109 was set back to `open` at the finding and returns to
`verified:ci` at the first green hosted run at the correcting head.

## B2 — warning levels (implemented)

**Decision.** Four levels — low, normal, high, critical — derived by a VERSIONED rule from the
consequence class, stating impact and response urgency; confidence and the C0–C4 authority class
kept explicit and distinct (a label never changes decision authority).

**Two findings on the way.** The ids first pencilled here (AU-PRD-0090–0092) were free but not
contiguous; the units are **AU-PRD-0061–0063** (the highest existing AU-PRD was 0060). And the
registered WRN v1 schema was stale — it forbade the `timing` and `controls` the payload has carried
since 0030/0031, and nothing on this path had ever validated a warning against its schema; WRN v2
registers the real payload and the harness validates the canonical object against it.

**Change (migration `0061_warning_levels_v1.sql`; `scenarios.service.ts`; `prediction.controller.ts`;
`prediction.capabilities.ts`; `apps/web/lib/warning-level.ts`; `apps/web/app/prediction/warnings/page.tsx`).**
* `branches_current.consequence_class` (C0–C4, Volume 5 ch. 58), declared by the declarer, or null —
  a warning from such a branch is classed by the derivation's **absent-class rule** (C2 assumed:
  Volume 5 p. 132 "apply the more restrictive plausible class"; DP-63-005; a warning advises and
  executes nothing, so C2 is the more restrictive plausible class and C3/C4 are never assumed) and
  records `consequence_class_source = assumed`. `add_branch` replaced; SCN v3.
* `prediction.warning_level_versions` / `warning_level_derivations` — v1 = consequence class →
  level, urgency, response, impact, with its source clauses (Volume 9 App. M NOT-01..32 priority
  and response columns; NOT-07 high or critical; Volume 4 ch. 47 and SLO-016; Volume 8 ch. 26):
  C0 low/routine, C1 low/routine, C2 normal/prompt, C3 high/urgent/acknowledge-and-act,
  C4 critical/immediate/act. Reference data under forced RLS, append-only, writable by migrations
  alone; `derive_warning_level(class, version?)` is the ONE derivation (the service builds the
  canonical object from it; the port derives again and refuses a disagreement — no copy in code).
* `warnings_current.level, level_version, urgency, consequence_class, consequence_class_source,
  op_class` — bound for every row raised from now on (`NOT VALID` check: earlier rows keep NULL and
  the screen says "raised before derivation v1"); the six columns are immutable (trigger); the
  `op_class` is read from the authority context (`public.eye_op_class()`, the 0042/0043 precedent)
  and never from the label. The PDP gains no input; no prediction route sets a consequence class;
  acknowledgement stays a person's act by role. WRN v2 carries `level{value, version, urgency,
  response, impact}` and `authority{op_class}`; the `EarlyWarningRaised` event and the briefing's
  warning item carry the level; the warnings screen shows the level as glyph + text + colour with
  its derivation version, the class it came from, and the class of the operation that raised it.
* Found while exercising the corrected scenario on the demonstration: an evaluation assembled its
  series INSIDE the write, and a long record (8,645 PortWatch evidence versions, one governed
  retrieval each) outran the write capability's 60-second wall clock; the first port call was
  refused. The assembly now runs before the write (its own governed reads), and the write holds
  the port calls only.

**Acceptance units.** AU-PRD-0061 (every raised warning levelled under the current derivation;
all five classes; absent-class rule), AU-PRD-0062 (a change of derivation is a new version;
existing warnings keep theirs; immutable), AU-PRD-0063 (the label changes no authority: op_class
from the context, acknowledgement by role alike for low and critical, a forged label refused by
the port and the flip left visibly owed). Evidence: `apps/api/test/int/phase4-warning-levels.test.ts`
(6 cases) and the D5/D6 case of `phase4-acceptance` (the pre-0061 fixture: C2 assumed, normal,
op_class C2, WRN@v2). Profiles: all; evidence class: harness → `verified:ci` at the first green
hosted run at the implementing head. AU-PRD-0034/-0037/-0039 and AU-DP-0164 re-pointed; none
closed by the re-pointing.

## B4 — profile legs and SLO floors (applied)

**Done (2026-09-11).** `audit/migrate-units-legs.mjs` (one-shot, kept as the record) rewrote the four
unit files: `profiles` is the LEG VECTOR — `saas|private|onprem` for every unit that applied to all
profiles, `saas|private|onprem|disconnected|air-gapped` for the 80 units whose statement or condition
carries an offline obligation (83 regex candidates, three excluded by hand: AU-EXO-0001 "disconnected
feature island", AU-LRN-0006 "evaluate offline", AU-UX-0189 "disconnected screens"), `n/a` unchanged;
a `legs_verified` column after `status` holds, per accepted leg, `<leg>=<pointer to the signed per-leg
result>` — empty everywhere at this head. Every count by mandatory, status and package was asserted
identical before and after. A hand pass then gave the 23 units that name one profile a one-leg vector
(6 saas, 5 private, 12 onprem; AU-INF-0301 and AU-GOV-0296 stay three legs). `audit/summarise-units.mjs`
validates the vocabulary and the rules (verified:all ⇔ every leg accepted; no accepted leg on an open
or n/a unit; legs in canonical order; a pointer on every accepted leg) and reports the Leg table: saas
0 of 3525, private 0 of 3524, onprem 0 of 3531, disconnected 0 of 80, air-gapped 0 of 80.
**Codex finding (2026-09-12), corrected:** the summariser printed its problems, exited 0 and overwrote
the summary with counts that already believed the inconsistent input (a unit marked `verified:all`
with no leg evidence left the unfinished total; `saas=;private=;onprem=` counted as three accepted
legs). Now each accepted leg's evidence reference is VALIDATED — a non-empty pointer to a file in the
repository on a path that names the leg — completion is derived from validated evidence alone (a
claimed `verified:all` without it is counted unfinished as `inconsistent`), and any problem exits 1
and leaves the previous valid summary untouched. `audit/summarise-units.controls.mjs` runs the
negative controls (no evidence; empty pointers; a pointer that resolves nowhere or names another
leg), the positive control (validated evidence on every leg → finished, three legs accepted, `--check`
agrees) and the tracked audit's own `--check`; CI runs it as a blocking step.
`audit/SLO_CATALOGUE.md` v1 maps the 22 objectives of Volume 4 Appendix F: 12 floors (F), 5 value-
variance (V), 5 population targets (P), each with the clause that makes it a floor or permits the
variance, the declared-variance record a V or P leg must carry, and the leg acceptance rule; the 22
units AU-INF-0448..0469 cite their class in their condition. Nothing changed in product code.

**As defined.**

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

## B5 — CAP aliases (applied)

**Done (2026-09-11).** `audit/CAP_ALIASES.md` v1: the 89 Volume 9 capability ids, 71 defined in Volume 8
Appendix A and 18 resolved by subject-based alias (CAP-PD-01..06 → DL-01..06; PD-09 → DL-11; PD-10 → DL-12;
PD-11 → AU-08 + DL-12; PD-12 → DL-12; TG-01 → TR-01; TG-02 → TR-02; TG-03 → TR-04; TG-04 → TR-06; TG-05 →
TR-07; TG-06 → TR-08; TG-08 → TR-11; TG-11 → TR-09), each with its basis and the rejected reading; five
rules (historical ids never renamed; a change is a new table version; an alias moves no obligation).
`audit/second-pass.mjs` gained the `cap_alias` column and step 7 (the row's id or a V9 clause's CAP id
resolved against Appendix A and the table; an alias noted on the row; an unresolved id reported), and
was re-run: 197 rows carry `cap_alias` (108 Volume 8 definitions, 71 Volume 9 bindings `defined`, 18
`alias-v1:…`), 0 unresolved; the same run moved 21 rows to `branch-only` because their evidence globs
now include files that exist only on this branch (`apps/api/src/graph/**` gained `propagation/*`).
`audit/summarise-units.mjs` checks every V9 CAP row and every unit's `V9:CAP-…` binding against the
table: 89 = 71 defined + 18 alias, unresolved 0.

**As defined.**

**Decision.** Versioned, subject-based aliases (CAP-PD-11 → CAP-AU-08 + CAP-DL-12 among them),
lossless mapping of every obligation, historical ids resolvable, nothing deleted to preserve a count.

**Change.** `audit/CAP_ALIASES.md` (new): the alias table v1 with every Volume 9 CAP id, its Volume 8
definition or its subject-based alias, and the obligations mapped; the requirement CSVs gain a
`cap_alias` column populated from it; `audit/second-pass.mjs` resolves an alias when a row cites one.

**Acceptance units:** the 89 CAP bindings of Volume 9 each resolve to a defined capability or a
versioned alias (a check in `summarise-units.mjs` reports any that do not).

## B6 — GraphChanged / MemoryCorrected subscriptions and their consumers (implemented)

**The obligation, in full (AU-MEM-0030).** "Graph and memory changes publish a
GraphChanged/MemoryCorrected event with affected identities, relationships, temporal scopes and
subscriptions; durable subscriptions and consumers for twins, forecasts, scenarios, decisions,
retrieval and memory mappings." The remaining-work prose carried before this batch named four
consumers; the statement names six. All six are delivered here.

**Change (migration `0063_graph_subscriptions.sql`; `apps/api/src/graph/subscriptions/*`; the
emitters in `graph.controller.ts`, `graph.orchestrator.ts`, `propagation-consumer.service.ts`,
`observation/acquisition/orchestrator.service.ts`, `intelligence.controller.ts`; the consumers in
`twin/twins/`, `prediction/subscriptions/`, `decision/subscriptions/`, `graph/subscriptions/consumers/`;
`outbox.publisher.ts`; `scheduler.service.ts`; `pipeline.service.ts` (`outboxEvents[]`); `pdp.service.ts`).**
1. **The events.** `GraphChanged@v1` is written as a second outbox row of the SAME transaction as
   the change it announces — an accepted resolution (`entity.resolved`, operator or automatic), a
   created entity, a split, an asserted or retracted edge, a declared strategy object, an assessed
   invalidation (operator or the B1 walker). It carries `identities` (entity id, role, canonical
   name, lifecycle, split lineage — enriched under RLS in the write), `relationships` (edges with
   `valid_from`/`valid_to`/`asserted_at`/`retracted_at` and their claim, resolutions, dependencies —
   the rows changed plus the one-hop rows that rest on what changed), `objects` (the reach of the
   dependency walk — `ImpactService.walk`, the invalidation's own walker, never a second one;
   `truncated` carried as the walker reports it; `walked: false` only on the resolver's bulk path when
   no subscription is live, and every consumer selects by its own reads then), `temporal`
   (`known_at`; the world interval when the change has one), `subscriptions` (what
   `graph.subscriptions_matching` answered at publication — evidence, never authority: the dispatcher
   re-resolves at delivery) and `cause`. `MemoryCorrected@v1` is written per apply batch beside
   `CorrectionApplied` (which keeps its own path) with the superseded objects and their versions, the
   claims derived from them (claim lineage), and by the review route for a corrected claim.
2. **Six subscriber roles** (`twin_subscriber`, `forecast_subscriber`, `scenario_subscriber`,
   `decision_subscriber`, `retrieval_subscriber`, `mapping_subscriber`), each holding EXACTLY one
   action at the policy boundary (`exact` rules: `twin.subscription.apply`,
   `prediction.forecast.subscription.apply`, `prediction.scenario.subscription.apply`,
   `decision.subscription.apply`, `graph.retrieval.subscription.apply`,
   `graph.mapping.subscription.apply`) and at the ports, which assert the same action — so a
   subscriber of one kind cannot drive another kind's effect even inside its own governed write.
   Registration (`POST …/graph/subscriptions/register`, tenant or platform administrator) creates the
   principal on the identity authority and the subscription on the commit authority
   (`graph.subscriptions`: kind, event types, change-kind filter, consumer version and code digest,
   owner, budgets, status, checkpoint, replay sequence; one live per domain and kind); pause, resume,
   revoke (`…/:id/pause|resume|revoke`, also the domain administrator's) and replay
   (`…/:id/replay`) are governed writes. The subscriber's session is opened by
   `graph.subscription_session_open` under the identity-operation capability and extended only by
   delivery progress (one extension per applied item), each extension re-verifying the grant.
3. **Routing**: the publisher adds a `GraphChanged`/`MemoryCorrected` row to the domain's own queue
   `graph:<tenant>:<domain>:subscriptions` when this process serves the domain (a domain with an
   active subscription), before acknowledging the row; `domain-events` stays the global, unconsumed
   log; the propagation queue never sees a subscription event and the subscription queue never sees
   `CorrectionApplied`. One job per event; the worker (concurrency 1) refuses a misrouted payload.
4. **The delivery ledger** `graph.subscription_deliveries`, keyed (event, subscription), states
   `received | applied | failed | refused`, written OUTSIDE the subscriber's authority under the
   scheduler's bounded capability (`subscription_delivery_receive` fans an event out to every active
   subscription it matches — or the one a replay names — and never reopens an applied delivery;
   `subscription_delivery_finish` decides the outcome and advances the subscription's checkpoint over
   the contiguous applied prefix); the consumer's item list set once under its own action
   (`subscription_delivery_items`, the applying principal checked against the delivery's); the
   **per-item checkpoint** (`subscription_item_begin` / `_done`) taken FOR UPDATE inside the effect's
   own transaction and committed with it. A refused or absent grant, a budget refusal, a missing
   consumer and a revocation mid-delivery are governance answers (`refused`, not retried); an
   infrastructure fault is `failed` and rethrown for the queue's bounded retry; a retrieval mismatch is
   `failed` visibly (operator work). Startup, every registration/resume and a 60 s tick reconcile —
   the 0062 lesson from the start: every `received` (never applied, or interrupted mid-apply) and
   `failed` delivery is re-driven, `refused` ones on a registration/resume/replay, a row published out
   of order behind the checkpoint is found by a 24 h look-back, a job a live worker holds is left alone.
5. **The consumers**, each registered into the graph's dispatcher by its own module at init (the
   graph imports none of them): **twins** — an admitted, verified version whose elements cite what
   changed or whose boundary names an affected entity goes unverified once per cause
   (`twin.apply_subscription_mark`); **forecasts** — an issued forecast whose subject, assumption,
   dependency or evidence basis changed is marked for attention once, never re-issued
   (`prediction.mark_forecast_attention`); **scenarios** — an active scenario whose subject or forecast
   changed is marked for attention (`prediction.mark_scenario_attention`; `scenarios_current` gains
   `attention_state`); **decisions** — an invalidated input (the reached DEC object, a cited run,
   forecast, claim, evidence, assumption or warning) is recorded on the package once per cause
   (`decision.note_input_invalidated`; state, approvals and commitment untouched, C-004); **retrieval**
   — the projections retrieval reads are re-verified from their event logs
   (`graph.rebuild_projections`, now accepting the retrieval subscriber's action) and the check recorded
   with what the change touched (`graph.retrieval_checks`); **memory mappings** — an identifier, edge
   or resolution whose basis moved (a split, a resolution accepted elsewhere, a corrected claim or
   evidence) is PROPOSED for reconciliation once per subject and cause (`graph.mapping_reconciliations`),
   decided by a person under `graph.resolution.decide` (`…/graph/mappings/list`, `…/:id/decide`) —
   resolver rule 7 kept: nothing is moved automatically.

**Acceptance units.** AU-MEM-0112 (registration by role, one live per kind, the session the
registry's), AU-MEM-0113 (GraphChanged with identities, relationships, reach, temporal scope and
subscriptions; all six consumers update with no operator act), AU-MEM-0114 (MemoryCorrected in the
apply transaction beside CorrectionApplied; the mapping proposal decided by a person; unrelated
delivery preserved), AU-MEM-0115 (redelivery, restart with an empty Redis, a real interruption after
receipt and after the first committed item, a live worker left alone), AU-MEM-0116 (replay, pause,
resume, revoke, backlog replay at registration), AU-MEM-0117 (the governed path: every port refuses
without its action, a kind cannot drive another kind's port, forced RLS, a misrouted job fails
closed). AU-MEM-0030's remaining work now names what is left (the hosted run, a dedicated
`claim.corrected` harness case, the demonstration act, the web view, P7-D). Evidence:
`apps/api/test/int/phase6-graph-subscriptions.test.ts` (13 cases; real Redis, real outbox publisher,
the process restarted three times mid-suite). Profiles: all; evidence class: harness →
`verified:ci` at `fcbdefc` (ci run 34663012651, 852/852 in 49 files on a fresh database; C19 34663012694).

**Known limits, recorded.** The publisher routes a change to a domain's subscription queue only when the
dispatcher in the SAME process serves the domain (a process-local set); in a deployment where the publisher and
the dispatcher run in different processes an event is delivered by the dispatcher's reconciliation from the outbox
(within its 60 s tick, or at once at a registration/resume), not by the publisher's routing — delivery is preserved,
its latency is the tick's. A registration with `backlog: 'replay'` re-drives the backlog twice
(the replay jobs and the reconciliation's own jobs; the second delivery of an applied delivery is a
durable no-op — noisy, not wrong). The `claim.corrected` leg is emitted and consumed by the same
code but has no dedicated harness case yet. The resolver's bulk path publishes unwalked events when
no subscription is live; a later subscription registered with a backlog replay receives them unwalked
and every consumer then selects by its own reads (the retrieval check and the mapping consumer need no
reach; the twin, forecast, scenario and decision consumers read citations, subjects, assumptions and
dependencies themselves).

## B7 — unresolved work stays unresolved; the declared partition; failure classes; telemetry; legal holds (implemented)

**Codex finding 3 (2026-09-12), reproduced at the database/queue boundary and corrected by migration 0064.**
Codex reproduced with the actual consumer and dispatcher on doubles that a projection mismatch produced `failed`
and a retry produced `applied` with no second check: the mismatched check had been checkpointed as an APPLIED item
inside the effect's transaction, so the re-drive skipped it and the failure was cleared. The author reproduced it on
real Redis, the real publisher and the real database (`apps/api/test/int/phase6-repro-retrieval-retry.test.ts`;
`evidence/cp6/repro-retrieval-before.txt`): healthy `applied` with its check; drift → `failed` with the item in
`items_applied` as `projections.mismatched`; the reconciliation's re-drive → `applied`, `deliveries 2`, one check,
the projection still drifted. After 0064 (`evidence/cp6/repro-retrieval-after.txt`): drift → `unresolved`
(`unresolved_dependency` → `human_review`), the item in `items_unresolved` with `checks 1`, `items_applied []`; the
re-drive → `unresolved` again with a SECOND check (`checks 2`). The correction: an effect that finds operator work
returns `unresolved`; the dispatcher records it through `graph.subscription_item_unresolved` inside the same
transaction as the check (the check is evidence and commits; the item is never added to `items_applied`), finishes
the delivery `unresolved`, and every re-drive begins the item again; `subscription_item_done` resolves it when a
check passes (`resolved_after_checks` on the ledger); the checkpoint never advances over it. The periodic tick
re-checks an unresolved delivery only after `10 minutes`; a start, a registration, a resume and a replay re-check at
once. Ordinary items keep their idempotency (applied once, skipped after) and the operator's repair stays the
operator's (a subscriber never repairs a projection).

**Change (migration `0064_subscription_resolution_and_partition_order.sql`; the dispatcher, the retrieval,
memory-mappings and decision consumers; the correction apply; the publisher; the subscriptions service; the PDP).**
1. **`claim.corrected` through the review route and the edge mapping under MemoryCorrected** (AU-MEM-0114's
   remaining clause): a claim corrected by review publishes `MemoryCorrected` beside `ClaimReviewed` (same
   transaction, same correlation); the memory-mappings consumer now proposes, under MemoryCorrected, the EDGE a
   corrected claim asserted (or an edge resting on corrected evidence) beside the resolution of its mention and the
   identifier sourced from it — the three mappings on both branches. Demonstrated through the actual review route
   (`intelligence.review.decide`, decision `correct`) and the actual correction route.
2. **Backlog served once** (AU-MEM-0119): `graph.subscriptions.served_from` — the registration instant for
   `backlog: 'leave'`, the beginning for `'replay'`; the reconciliation re-drives only rows at or after it, so a
   replayed backlog is delivered ONCE (0063 re-drove it twice: the replay's own jobs beside the reconciliation's).
3. **The declared partition and sequence** (AU-DP-0071): `objects.object_outbox.partition_key` is the audit
   chain's partition (`platform` | `tenant:<id>`) and `partition_seq` its ordinal, assigned at enqueue under the
   partition row's lock — after the AUD row under the same partition's chain-head lock, both held to commit — so
   the sequence IS the commit order (demonstrated under six concurrent writers against the audit chain's own
   order); every row carries its `schema_version` (the seventeen legacy event payloads are stamped `v1`); the
   publisher leases in sequence order (0015's `created_at` was the transaction's start, which put a later-started,
   earlier-committed write behind: the domain queue received rows out of order); the subscription CURSOR is the
   sequence (`checkpoint_seq`; the reconciliation and the contiguous-prefix advance compare sequences, never
   timestamps; the served point is a sequence too), and a replay names a sequence (`fromSeq`). The immutability
   trigger covers the new columns; the lease is round-robin across partitions and ordered within each.
4. **Failure classes** (AU-MEM-0039): every non-applied delivery carries `failure_class` and `disposition` —
   `authority_disputed` → `human_review` (a grant refused, or paused/revoked mid-delivery — the pause lands at the
   next item, the first applied, the second not, a resume re-drives), `consumer_unavailable` → `retry` (no consumer
   in the process; a registration re-drives), `budget` → `human_review`, `infrastructure` → `retry`,
   `unresolved_dependency` → `human_review`. The decision consumer EXPOSES an input invalidated on an executed
   (committed, monitoring) package as `executed_action` → `compensation` on the package note and the item — the
   package untouched (C-004). A **legal hold** conflicting with a deletion: `observation.legal_holds`, an
   append-only ledger placed and lifted only by administrators (`observation.legal_hold.place|lift`, exact PDP
   rules; routes `…/observation/evidence/:evdId/legal-hold`, `…/legal-holds/:id/lift`), read beside the manifest's
   admission-time flag; a withdrawal against a held object FAILS the case before any object is touched
   (`legal_hold` → `challenge`, `CorrectionFailed` published, the held objects named, partial work: none).
5. **Telemetry** (AU-MEM-0041): `graph.subscription_delivery_telemetry` and `graph.propagation_attempt_telemetry`
   — security-invoker views over the ledgers (a tenant reads its own; the first cut ran as the owner and would have
   read every tenant's — caught by the harness's isolation check) — with queue wait, apply/walk time, end-to-end age,
   retries, items, unresolved dependencies, failure class; the status route carries `telemetry.deliveries` and
   `telemetry.open_failure_states`. One operating measurement captured on the local profile
   (`evidence/cp6/b7-telemetry-measurement.txt`).

**Acceptance units.** AU-MEM-0118 (unresolved work: the reproduction before/after, the re-drive and restart
re-checks, the tick's interval, the positive control, twin idempotency intact), AU-MEM-0119 (backlog once; replay
from a sequence), AU-MEM-0114 (the claim.corrected and edge-mapping clause), AU-MEM-0029 (reconciled to
`verified:ci` at `fcbdefc`: every named case runs on the hosted chain), AU-MEM-0039 (four of six conditions with a
fault case each; the remaining two stated), AU-MEM-0041 (the subscription and propagation flows' telemetry; the
other flows and the per-profile captures stated), AU-DP-0071 (schema version, declared partition/sequence, replay;
the cross-process guarantee and the interface register stated). Evidence: `apps/api/test/int/phase6-graph-subscriptions-2.test.ts`
(14 cases) and `phase6-repro-retrieval-retry.test.ts`; two consecutive passes locally (`evidence/cp6/b7-run9.txt`,
`b7-run10.txt`); the affected suites and the full integration suite on a database created and migrated from the final
file (`b7-regress-b1.txt`, `b7-int-all-4.txt`); the upgrade proof (`upgrade-0064.txt`). Profiles: all; evidence class:
harness → `verified:ci` at `a852c65` (ci run 34693808238; C19 34693808173).

**The second pass (an adversarial review of the batch before its commit — fifteen skeptics over five claims, forty
findings verified independently; `evidence/cp6/README.md`).** Confirmed and corrected before the commit: the receive
port fanned every re-driven event out to every active subscription, so a subscription registered to leave its backlog
received past events by someone else's re-drive and one subscription's re-check reopened another's refused or
unresolved delivery — a re-drive now NAMES the subscriptions it is for (`only`) and the receive port touches no other,
while a live job reaches only subscriptions served from at or before the row's sequence; the served point was an
instant compared with the transaction's start — it is now a SEQUENCE (`served_from_seq`, the partition's next at
registration) and a delivery that exists is reconciled by its state wherever its row lies; a replay's point beyond
the cursor moved it forward over open work — the cursor now only moves back; a replay's own `<id>.r<seq>` jobs raced
the reconciliation's plain jobs — a replay now reopens the rows and the reconciliation re-drives them, scoped, one
job kind; dead-lettered rows were invisible (`subscription_outbox_failures` looked for `failed`, the publisher writes
`dead_letter`); a worker that won the race with the publisher's acknowledgement refused the job as "not published" —
the event row is readable once leased; the publisher's ticks could overlap and a failed row let a later sequence
overtake it — one tick at a time, a failed row halts its partition for the tick; a partition with a sustained backlog
starved the others under a sequence-first lease — the lease is now round-robin across partitions, ordered within; an
infrastructure fault at the session extension left a delivery `received` with no finish — classified now; refused
deliveries were never re-driven automatically — a start re-drives them; the open failure states were a window over
the hundred most recent deliveries — their own query now; the telemetry views ran as their owner and would have read
every tenant's rows — security-invoker, with the harness asserting the isolation; the legal-hold check was a pre-read
outside the applying transaction keyed on an unordered version — inside the transaction now, on the latest version's
manifest, per batch, the earlier batches' supersessions recorded as the partial work they are.

**Known limits, recorded.** The ordering guarantee is per publisher process (two publisher processes could interleave a
partition's rows) — the cross-process routing gap of B6 widened by one clause, assigned forward with it; the
audit-then-enqueue lock order is the pipeline's convention, not a database invariant (a seed script that enqueues
first is not serialised by it). The `provenance_incomplete` and `material_change` conditions of AU-MEM-0039 have no
fault case yet. The retrieval check reports what 0024's rebuild measures (rows present in both with a differing
state); a missing or extra projection row passes it. A hold binds to the manifest of the version current when it is
placed; a later revision with a new manifest is not held by it. A revoked subscription's unresolved deliveries are
not re-checked by its replacement unless the replacement is registered to replay its backlog. A budget refusal of a
one-item twins subscription recurs at every later event with two verified versions (visible as open failure states;
the owner raises the budget or the versions are re-verified) — the harness shows two such refusals, by design. The
`max_elapsed_ms` budget ends `failed`/`budget → retry` (the next delivery resumes from the checkpoint), unlike the
`max_items_per_event` budget, which is `refused`/`budget → human_review`.

## B8 — ordered publication across ticks and processes; replay reaches skipped history; one server per domain; the remaining failure conditions; the flows' telemetry; the interface register and the retention contract; inferred relationships reassessed; warnings and briefings in the impact set (implemented)

**Codex's two B7 findings (2026-09-12), reproduced at the database/queue boundary and corrected by migration 0065.**
Codex executed the actual publisher and the unmodified 0064 SQL on doubles and found (B7-F1) that with 51 rows in
partition A and one in B and a single transient queue fault on A:1 the first tick leased A:1–49 and B:1, A:1 failed,
B:1 published, and the NEXT tick leased the never-leased A:50 and A:51 and published them while A:1 was still pending
under its live lease — the successful order B:1, A:50, A:51 — within one publisher process (a single elected
publisher would not have repaired it); and (B7-F2) that a subscription registered to LEAVE its backlog
(`served_from_seq` = the partition's next sequence at registration), later replayed from the beginning, had the whole
history returned and its cursor rewound, but the reconciliation — bounded by the served point for rows never
received — re-drove only what the subscription had already received: events 1–2 stayed excluded. The author
reproduced both on real Redis, the real publisher, the real dispatcher and the real database
(`apps/api/test/int/phase6-repro-event-delivery.test.ts`; `evidence/cp6/repro-event-delivery-before.txt`, code at the
reproduction head `6fc52c9` = `a852c65` + a test-runtime publish-fault hook and a configurable lease, database at 0064):
F1 — `later rows of A were published while A:1 was still pending: ['A:50', 'A:51']`, `rows of A published before A:1:
['A:50', 'A:51']`, and a further symptom Codex did not name — every halted row had consumed an attempt it was never
tried on (`A:2×2 … A:49×2`: ten such ticks would have dead-lettered rows never tried); F2 — `the replay re-drove … :
expected 1 to be 3`, `the served point must move back … : expected 3 to be 0`, the skipped history never delivered in
30 s. After 0065 (`evidence/cp6/repro-event-delivery-after.txt`): B:1 proceeds, nothing of A is published while A:1 is
pending, after the lease lapses A publishes in sequence with A:1's two attempts and every other row's one, A's jobs
sit in sequence order on the queue; the replay re-drives the three, the served point reads 0, the two skipped
events are delivered once each with `replay_seq 1`, the tick afterwards re-drives nothing.

**Change (migration `0065_ordered_publication_and_replay_reach.sql`; the publisher, the dispatcher, the scheduler,
the subscriptions service, the memory-mappings and decision consumers, the forecast issue, the method transition, the
walk, the briefing read; the web view).**
1. **The lease is partition-ordered across time and processes** (B7-F1, AU-DP-0175): `objects.outbox_lease` takes
   an advisory transaction lock (one lease at a time across every publisher process, so the rule below is decided on
   one consistent view), computes per partition — ordered by sequence — whether any earlier pending row (itself
   included) is held by a LIVE lease, and leases only the unblocked prefix, round-robin across partitions as before;
   the claim is `FOR UPDATE` without `SKIP LOCKED` (a row an acknowledgement is committing is waited for, never
   skipped — skipping a head would lease the row behind it). The publisher halts a partition on a failed add AND on a
   refused acknowledgement (the lease is no longer this tick's), and at the end of the tick gives the halted tail back
   through the new port `objects.outbox_release_untried` with the attempt REFUNDED — the attempt budget (0015: ten,
   then dead letter) counts real attempts only; the failed row keeps its lease as its retry backoff
   (`eye.outbox.lease_seconds`, default 60 as before). A dead-lettered head still releases its partition — the gap is
   reported by the reconciliation (0064), never silently passed — the policy B7 recorded, kept. The routing decision
   (`subscribed`) is computed IN THE LEASE from `graph.subscriptions`, so whichever process publishes routes the same
   way; the process-local set of served domains is gone. `objects.outbox_partition_telemetry` (security-invoker,
   the invoker's partition) shows the head, whether the partition is waiting behind it, dead letters, the oldest
   pending age and the retention contract; the status route and the web view carry it.
2. **A replay moves the served point** (B7-F2, AU-MEM-0120): `graph.subscription_replay` lowers `served_from_seq` to
   the replayed point (`v_from_seq + 1`, or 0 from the beginning) and never raises it, records
   `served_from_seq_before/after` and how many rows were never received; the reconciliation's scoped re-drive then
   delivers the rows the subscription never received; a restart after the replay is recorded (the queue lost) still
   delivers them — the served point is the durable record. Ordinary operation is untouched: a `leave` registration
   serves from its registration; other subscriptions are not reopened.
3. **One server per domain** (AU-DP-0175, the cross-process routing/ordering gap of B6/B7):
   `graph.subscription_domain_serving` and `subscription_domain_claim/release` — a bounded claim (150 s) renewed on
   every reconciliation (the 60 s tick), released at shutdown after the workers close (so the next holder never
   consumes the queue beside the last), taken over once lapsed, every hand-over on `subscription_serving_events`; a
   process that does not hold the claim runs no worker for the domain and still enqueues re-drives (the scheduler's
   enqueue no longer starts a worker). The harness runs a SECOND application context on the same database and Redis
   as the second process.
4. **The remaining AU-MEM-0039 conditions**: *provenance path incomplete* — the memory-mappings consumer checks, for
   every edge a memory change reaches, that the claim version the edge names has its lineage on the corrected
   evidence (a lineage row exists; under `evidence.corrected` it names the corrected evidence; it names the edge's
   own evidence); an edge whose path cannot be established stays UNRESOLVED with the class `provenance_incomplete`
   (human review), re-checked at every re-drive, the sibling edge with a complete path proposed (partial work
   preserved); the operator's recorded lineage resolves it (`resolved_after_checks`). The dispatcher now carries a
   consumer-named class and route on an unresolved item to the delivery. *Recomputation changing a recommendation
   materially* — a forecast re-issued for the same question supersedes the previous one and the issue publishes
   `GraphChanged/forecast.superseded` beside `ForecastIssued`; the decisions consumer MEASURES the change of the
   central estimate against the subscription's declared rule (`budgets.materiality`: `relative_q50`, default 0.10;
   the q10–q90 band) — measured against the forecast the option CITES, found by following the supersession chain
   back from the one just superseded, so every recomputation after the citation reaches the package — and exposes
   `material_change` → `human_review` (`compensation` when the decision was executed) with the measure on the package
   note — the choice, the options and the state never rewritten; an immaterial re-issue is noted with its measure and
   no failure state; an unmeasurable one is routed as material and says so. The two consumers' methods changed, so their identities
   changed: an existing decisions or memory-mappings subscription is a different consumer's and is revoked and
   registered anew (the demonstration act does so); the other four kinds' identities are unchanged.
5. **The flows' telemetry** (AU-MEM-0041): `prediction.forecast_telemetry`, `prediction.warning_telemetry`,
   `twin.reconciliation_telemetry`, `simulation.run_telemetry` — security-invoker views with execution state (step
   durations, end-to-end age, retries, completion, unresolved dependency), product state (freshness as age and
   cut-offs, coverage, uncertainty, invalidation, affected consumers, decision-active) and recovery state (last
   durable transition, causation, accountable owner); `POST …/graph/telemetry/flows` returns the recent rows and every
   row in a failure state per flow; one measurement per flow captured on the local profile
   (`evidence/cp6/b8-flow-telemetry-measurement.txt`).
6. **The interface register and the retention contract** (AU-DP-0071): `objects.interface_register` — the fifty
   canonical interfaces of Volume 3 App C / Volume 4 App C under their identities L1-I01..L10-I05 (ten layers of
   five; the requirement rows write the range as L1-I01 … L9-I05), each with its contract, transport profile,
   reliability and failure semantics, and what this product binds to it today — 19 bound, 25 partial, 6 unbound, the
   audit's own judgement, never more than the requirement rows claim (an event interface is bound only where the
   event is published); `POST …/graph/interfaces`. The log's retention
   is DECLARED where its sequence is declared: `objects.outbox_partitions.retained_from_seq` (1) and
   `retention_policy` (`lifetime`: nothing purges the log, no role holds DELETE, the rows are immutable by trigger;
   the partition table itself is granted to no runtime role — the telemetry is a security-definer function scoped to
   the invoker's tenant);
   a replay from before a partition's floor is REFUSED with the discontinuity named (the point, the floor, the range
   not retained), a replay from the floor on accepted, a replay from the beginning replayed from the floor (the
   beginning of what is retained), a replay registration served from the floor.
7. **Inferred relationships reassessed on evidence or model change** (AU-DP-0041, V7 TT-04): an edge carries
   `reassessment_state` (none | pending | reassessed) with its trigger (evidence | claim | model), reason, cause and
   outcome; the memory-mappings consumer opens the reassessment when it proposes the edge's reconciliation under a
   memory change; `intelligence.transition_method` (suspend, retire) opens it on every asserted edge whose claim
   version's lineage names the method and the transition publishes `GraphChanged/edge.reassessment_opened` — the
   forecast resting on the edge is marked for attention through its subscription, no operator walk; the
   reassessment closes when the relationship is re-derived (superseded by the builder's next assertion, 0026),
   retracted, or decided by a person — on its mapping proposal, or on the relationship itself
   (`POST …/edges/:id/reassessment/keep`: it stands, decided:kept — the route a model-change reassessment closes
   by); a second cause while one is pending accumulates on the edge and is published like the first. The
   projections' rebuild (the retrieval check) ignores the two non-state events.
8. **The impact set reaches warnings and briefings** (AU-MEM-0031): a raised warning rests on its forecast and on
   the evidence that flipped its branch (dependency rows at the raise); a composed briefing rests on what it cites
   (dependency rows from its recorded sources, in the composing transaction — evidence, claims, runs, the warnings
   themselves and their forecasts); the walk reaches both and continues from a warning to what cites it; the assessment
   marks the warning for attention (`warning.attention`; the rows stay immutable) and RE-FLAGS the briefing by event
   (`briefing.re_flagged`; the snapshot keeps its digest and its known-at), lists both on the invalidation, and the
   briefing read reports the cited versions corrected after its composition. Commitments and simulation runs were
   reached before (0035/0042).

**Acceptance units.** AU-DP-0175 (ordered publication across ticks, lease recovery and processes; one server per
domain) and AU-MEM-0120 (a replay reaches the retained history; the retention floor) allocated, `verified:local`
at the B8 head `661c2fb` and **`verified:ci`** at its hosted run (ci 34705325289: 890/890 in 53 files on a fresh
database, phase6-graph-subscriptions-3 19/19, phase6-repro-event-delivery 4/4, the upgrade proof with 0065; C19
34705325299 — `evidence/cp6/hosted-661c2fb-build-test-summary.txt`); AU-MEM-0039 to `verified:ci` by the same run
(all six conditions with a fault case each); AU-MEM-0041, AU-DP-0071, AU-DP-0041, AU-MEM-0031 stay `open` with their
delivered clauses bound to that run and their remaining clauses stated in their own prose. Evidence:
`apps/api/test/int/phase6-graph-subscriptions-3.test.ts` (19 cases) and `phase6-repro-event-delivery.test.ts` (4:
the two reproductions with their controls); the affected suites and the full integration suite on databases created
and migrated from the final file; the upgrade proof (`evidence/cp6/upgrade-0065.txt`). Profiles: all; evidence
class: harness — one artefact verification, no deployment leg (S7).

**The demonstration.** `evidence/cp6/act-b8.txt`: the act at `661c2fb` on the NORDWERK demonstration — the two
changed consumers' subscriptions revoked and registered anew, served from the row after the revoked cursor (the
replay re-drove nothing: the rows between were ObservationRecorded, not a subscribed type); both events delivered to
all six within the tick; NON-EMPTY work by retrieval only, nothing of theirs for the other five (stated per event);
holder, partition and failure states from the status route. The demonstration database had been migrated through a
development iteration of 0064 (recorded digest `9da00200…`) before the file's committed form; the migrator refused
0065. `scripts/phase6/demo-reconcile-0064.sql` (guarded, one transaction, the exact difference copied verbatim from
the committed file, rehearsed on a restored copy against a fresh 0065 schema, a full dump taken first) reconciled it
and set the recorded digest to the committed file's; 0065 then applied through the migrator. An operator act on the
demonstration database only; no verification database was ever on the iteration.

**The second pass (an adversarial review of the batch before its commit — fifteen skeptics over five claims, 103
distinct findings verified independently, 68 confirmed; `evidence/cp6/b8-adversarial-review.txt` lists each with its
disposition).** Confirmed and corrected before the commit: the serving claim was advisory — a holder whose renewals
failed kept consuming after a take-over — a LOCAL FENCE now: a job is served only while the process believes its
claim live (checked per job; the worker stops and leaves the job to the holder); a same-host holder whose process is
gone is taken over at once (recorded), a scheduler-disabled process claims nothing, the first claim of a domain no
longer races, a stand-down or shutdown that begins during a reconciliation gives back what it claimed, the release
locks in the claim port's order; `objects.outbox_partitions` was granted to the runtime roles without row-level
security (every tenant's key and counter readable) — the grant is gone and the partition telemetry is a
security-definer function scoped to the invoker's tenant, computed over the WHOLE partition (a domain reader of a
multi-domain tenant saw its own visible head, not the partition's); `intelligence.transition_method` (re-emitted)
looked the method up by id alone — a cross-tenant write — now by tenant and domain; the flows' telemetry route read
prediction, twin and simulation state under `graph.read` — each flow reads under its own action now; the decisions
consumer measured a recomputation between consecutive forecasts and reached a package only on the first re-issue
after its citation — it now follows the supersession chain back to the forecast the option CITES and measures
against it, and an unmeasurable change says so; the replay-by-sequence form applied the floor to two different points
(off by one; a domain's first retained rows unreachable) — one replay core takes the sequence point itself, the
(created_at, id) form resolves to it, from the beginning means from the floor; a replay moved a NULL cursor forward
to its point — a NULL cursor stays NULL; never-received rows inside a replayed range were stranded once the cursor
passed them (the 24-hour look-back) — never-received rows at or after the served point are always reconciled; a
replay of one subscription re-drove every tenant's refused deliveries — scoped to its domain now; the status route
reported every tenant's domains, holders and re-drives — this domain's part only; a second reassessment cause on a
pending edge was dropped — accumulated and published now; the model-change event carried no dependency rows — it
carries them, so a decision package resting on the edge is noted; a model-change reassessment had no route for a
person to decide — `POST …/edges/:id/reassessment/keep` (decided:kept); a briefing citing a warning was not reached
when the warning's flip evidence was corrected — a briefing rests on the warning it cites and the walk continues from
a warning; a briefing composed on the corrected version was re-flagged by the correction it already saw — re-flagged
only when the object has a version recorded after the briefing's known-at; the register called three interfaces
'bound' whose events are not published and named six routes as they do not exist — corrected; the forecast
telemetry's publish latency scanned the outbox per row — indexed; the demonstration act's re-registration stranded
the events between the deploy and the act — the replacement replays from the revoked subscription's cursor; the
reviewed diff's version bump (1.1.0) would have refused all six kinds — the version stays, the two changed methods'
digests change. Recorded as limits (below): the attempt refund on a crash mid-tick, the dead-letter gap, the
routing decision between a lease and its add, the deferred closing event's correlation, the lock-order windows,
a long drain at shutdown, the cross-host lapse.

**Known limits, recorded.** A process that dies holding a lease leaves its partition waiting for the lease's
lapse (≤ 60 s) — order before throughput, by design; the harness suites that share one database saw it as a
longer wait for a quiet outbox. A dead-lettered head releases its partition (the gap reported). A model change is a
method suspension or retirement; a new method under a new key is a new extraction, not a change to the old edges'
record. The automatic RE-DERIVATION of a pending edge (the builder's run without an operator) remains: the
reassessment is opened automatically and closed by the builder's next run, a retraction or a decision. The retention
floor is declared, not moved by a governed act (ES-29-004 remains). Memory items and evaluation datasets are not in
the impact set (their tables do not exist: AU-MEM-0065). The flows' telemetry carries method and digest lineage, not
the policy decision per instance; per-profile measurements are the comprehensive campaign's. The interface register
records six interfaces as unbound and twenty-five as partial. A crash mid-tick charges the leased batch one attempt
that is not refunded (bounded by the budget of ten). A registration that lands between a row's lease and its add
leaves that one row to the reconciliation, delivered after its successors. The closing `edge.reassessed` event written
at commit carries the edge row's correlation, not the closing write's. Lock-order windows exist between a replay and a
finishing delivery, and between a release and another process's lease when a tick outlives its TTL — Postgres aborts
one side and the tick or the replay retries. A long drain at shutdown lets claims lapse before the release; a holder
on ANOTHER host that dies without a release keeps its domain unserved for the claim's lapse (150 s). The measure of a
recomputation compares the cited and the superseding central estimates as issued (their targets may differ by the
re-issue's cut-off). One superseded forecast is announced per issue. A rejected mapping proposal closes the edge's
reassessment as decided:rejected (the relationship stands).

## B9 — ownership across in-flight writes (Codex B8-F1/F2); automatic re-derivation; memory items; governed retention; contradictions; method evaluation; ontology; scenario review; executive requests; the register's six (implemented)

**Migration 0066** (`apps/api/migrations/0066_serving_ownership_and_reach.sql`), one file, eleven sections; **0067** (`0067_b9_review_corrections.sql`) carries the adversarial review's corrections (PHASE6_REPORT §22.7).

**§1 the serving generation and the fence (B8-F1, B8-F2).** `graph.subscription_domain_serving.generation` and
`graph.subscription_domain_generations` (a counter per domain: monotonic across releases, so a re-claim after a
release is a new generation); `subscription_domain_claim` returns the generation (renewal `FOR NO KEY UPDATE`; a
take-over re-locks `FOR UPDATE`); `graph.subscription_serving_fence(tenant, domain, holder, generation)` — in
schedule mode `ctx.assert_capability`, otherwise `observation.assert_scope`; `FOR KEY SHARE` on the claim row;
`P0S01 serving lost` when the holder or the generation is not the claim's; the holder and generation set on the
transaction so the delivery-events trigger writes `served_by`/`serving_generation`. The dispatcher (TypeScript)
keeps `{holder, generation}` per domain, fences the receipt, each item's effect (the capability factory's `fence()`
is the first statement of every effect transaction) and the finish; `ServingLostError` at the handler's entry calls
`lostServing()` — the belief dropped, the worker closed DETACHED (`scheduler.stopSubscriptionWorkerDetached`, tracked
in a `closing` set awaited at shutdown) — and the job is returned; a serving-lost handler never finishes. Test hooks:
`pauseRenewalsForTests`, `expireServingForTests`, `armFaultForTests` (`slow_before_item` with the item index,
`slow_before_finish`). `eye.subscriptions.serving_seconds` (5–3600, default 150).

**§2 the relationships consumer.** `graph.subscription_consumer_actions` (seven rows: the action, role and method
reference per kind; a platform vocabulary under FORCE RLS with a shared SELECT policy), `relationship_subscriber`;
`subscription_delivery_items/item_begin/item_unresolved` read the table; `graph.assert_edge` accepts
`graph.relationship.subscription.apply`; `open_edge_reassessment` widened. `derive.ts`: `entitiesByName`,
`deriveEdgeFromClaim` (the run's rules, `validFrom` from the claim's `recorded_at` when the claim gives none) —
`runEdgeBuild` refactored onto it. The consumer resolves the asserted edges of corrected REL claims with a lower
version; per item: `openEdgeReassessment(trigger 'claim')` → read the corrected version → derive → `assertEdge`
(method and run from the lineage) → `GraphChanged/edge.asserted` through `outboxEvents`; effects `edge.re_derived`,
`derivation.blocked` (`unresolved_dependency` → `human_review`), `basis.unchanged`.

**§3 memory items.** Roles `knowledge_owner`, `record_authority`; schema `memory` (`items_current`, `item_events`,
`item_access`; RLS `memory_isolation`); `memory.record_item` (v1 under `memory.item.record`, n+1 under
`memory.item.supersede`; the cites written to `graph.dependencies` as `MEM` rows, retired rows removed),
`memory.withdraw_item`, `memory.record_access`; `objects.schema_registry` MEM@v1; `dependency_dependent_exists` MEM
branch; `invalidations_current.affected_memory_items`; `graph.record_impact` (19 arguments) marks
`memory.attention` once per cause. TypeScript: `memory.service.ts` (the canonical header: `CP-MEM-01`, `MEM@v1`,
`supersedes MEM:<id>@<n-1>`; retrieval under an audience purpose with `assertClearance`, as-of by `recorded_at`
millisecond-exact), the routes, the impact bucket and statement phrase, `touchedIds.memoryItems`.

**§4 governed retention.** Roles `retention_steward` (domain), `retention_authority` (tenant); schema `retention`
(`schedules`, `actions_current`, `action_events`, `scope_items`, `approvals`, `executions`, `residual_inventory`,
`verifications`); ports `declare_schedule`, `open_action`, `evaluate_schedules`, `resolve_scope` (evidence: the
manifests whose LATEST version is corrected/superseded/withdrawn — the current excluded; a hold by manifest or
through the EVD object → `held`; residuals `claim_lineage`/`dependency`/`canonical_version`; `log_partition`: the
partition's unpublished rows and every subscription cursor below `to_seq` → `paused`; the scope digest sha256),
`record_approval` (the digest must match; opener ≠ approver; actor = `eye_principal()`), `begin_execution`
(a live approval; approver ≠ executor), `record_execution`, `finish_execution`, `verify_action` (each item checked
against the observed bytes; `verified` | `verified_with_residuals`; the `DeletionVerified` payload),
`withdraw_action`; `objects.outbox_declare_floor(partition, to_seq, action_id)` (asserts
`retention.action.execute`; the tenant's own partition; the executing `log_floor` action must name the move;
monotone, ≤ `next_seq`); `observation.tombstone_blob` re-declared with the hold refusal (`P0R01`). The module
`apps/api/src/retention/` (service: execution under savepoints per item, bytes removed after commit, verification
observations; the controller's routes).

**§5 contradictions.** `intelligence.contradictions` (adjudicate-only trigger), `review_current.queued_reason` +
`contradiction`/`challenged`; `record_contradiction`, `adjudicate_contradiction`, `request_review` (the challenge →
`review_events 'case.queued'`). `contradiction.service.ts`: `valuesConflict`, `findConflicts` (same claim kind,
subject and predicate; a different value; the latest active/corrected version; not rejected); the extraction detects
BEFORE admission (queued with reason `contradiction`; header `contradiction_refs`); the review's correction detects
too; both publish `ContradictionDetected`.

**§6 method evaluation.** `intelligence.method_evaluations`, `methods_current.fitness_state/fitness_evaluation_id`,
`method_events` + `method.evaluated`; `evaluate_method` (the measures from `gateway_calls`, `runs_current`,
`review_current`, `claim_lineage`, `contradictions`); `lock_active_method` refuses an unfit version;
`transition_method` refuses activating one; `rebuild_projections` excludes `method.evaluated`.

**§7 ontology.** Role `ontology_steward`; `graph.ontology_versions`, `ontology_events`; `propose_ontology_version`
(the diff against the active version; the analysis: removed/narrowed predicates × asserted edges, the strategy
resting on them, entity counts; additive/breaking; the four reviews; a version number never reused),
`decide_ontology_proposal` (separation of duties; a breaking change refused while impacted edges stand and until the
compatibility and migration reviews passed; approval activates and supersedes); `graph.assert_edge` (final body)
checks the active version's predicates.

**§8 scenario review.** `scenarios_current.state` + `retired`, `last_reviewed_at`, `next_review_due_at`, `reviews`,
`retired_at`, `retirement_reason`; `branches_current.simulation_candidate_at`; `scenario_events` +
`scenario.reviewed`, `scenario.retired`; `prediction.review_scenario` (continue / dissent / retire / promote_to_simulation;
retirement closes OPEN branches only — a flipped branch keeps its flip so the projection rebuild's `branches_current(flipped)`
check stays consistent; the links: forecast, decision objects, dependents, simulation runs); `simulation.open_run`
re-declared from 0037 refusing a retired scenario; the service refuses it too.

**§9 executive requests.** `executive.requests` (UNIQUE on requester + `request_key`; `request_digest` sha256 over
the canonical request), `request_events`, `delegations`, `follow_ups`, `prediction.warning_suppressions`;
`agent_runs.trigger_kind` + `request`; `executive.open_request` (the request row first, then the effect; a repeat with
the same digest returns the row and publishes nothing; a different digest refused; stale version, committed package,
non-member delegator, closed warning refused), `fulfil_request` (the owner's act — the scenario declaration names
`requestId` and fulfils in the same write), `withdraw_request` (reverses an in-write effect; an act done stands),
`complete_follow_up`; `executive.is_member` honours a live delegation; the briefing lists suppressed warnings,
follow-ups and delegations as windows; the warnings list marks `suppressed_until`; `/workflow/:packageId` returns the
follow-ups.

**§10 the register.** `bound_at`, `bound_in`; seven rows bound — the six unbound and L3-I05 (partial) — with `bound_to` naming the
publishing surface; a check that the register reads 26/24/0 (the migration's own §10 header says "six"; 0067 §6 re-comments the column).

**§11 a pre-0061 warning stays updatable.** `wrn_level_derived` (0061, NOT VALID) dropped; the trigger
`wrn_level_required_on_raise` refuses an INSERT without a level. Found on the demonstration's rehearsal: the 0065 §8
walk could not mark the record's one legacy warning and the propagation of correction `01a0968b` failed on every
restart.

**The HTTP refusals of the new ports** (`observation-errors.ts` `B9_REFUSALS`): the port's reason answered with 422 /
404 / 403 / 409 by the kind of refusal, `P0R01` admitted; the executive agent-run refusals (0046) and the
retired-scenario run refusal (§8) as named rules ahead of the twin run's generic one.

**Harness.** `phase6-repro-serving-lifecycle.test.ts` (5), `phase6-graph-subscriptions-4.test.ts` (25),
`phase6-executive-requests.test.ts` (9); hosted at `36ce748` (ci 34726253751: 929/929 in 56 files on a fresh database; C19 34726253762); the B6 harness kept to its six kinds; `codex-corrections` unit double with
the contradiction service; the upgrade proof at 45 migrations, 31 roles, 28 registry rows; gate22
`LATER_SCENARIO_COVERAGE` for `objects.outbox_declare_floor`.

**Demonstration.** `scripts/phase6/demo-b9-capabilities.mjs` (seven scenes with the personas K. Müller, R. Adler,
P. Novák, H. Bergmann, O. Steiner added; the relationships kind registered by the act, selecting
`MemoryCorrected/claim.corrected`; `register-subscriptions.mjs` reconciles seven kinds) — `evidence/cp6/act-b9.txt`,
every scene with its effect (PHASE6_REPORT §22.5).

## B10 — the memory workspace and the agent's retrieval; Codex's B9-F2 and B9-F3 and the recorded G2 gap carried into implementation (implemented)

**Migration 0068** (`apps/api/migrations/0068_b10_review_case_and_review_verification.sql`), one file, six sections,
on `phase6-b10` (PR #47, base `phase6-decisions` so the diff is B10 alone; the merge candidate `48f7bdc` for #46 is
untouched). Rehearsed on a restored copy of `eye_demo` before the demonstration act (§B10.7).

**§1 G2 — the review CASE decides what is graphed.** `graph.assert_edge` re-declared: it reads
`intelligence.review_current` for the claim version (`v_case`) and takes the person's decision from there — `approved`
admitted though the claim's own payload still says `queued` (the extraction wrote that; nothing rewrites it),
`rejected`/`queued` refused as before, and a version the case marks `corrected` refused in favour of the corrected
version (`edge rejected: claim %@% was corrected in review to a later version`, 22023). The builder's rules do the
same: `derive.ts` gains `effectiveReviewState(claim, caseState)` and `deriveEdgeFromClaim(claim, byName, caseState)`;
`runEdgeBuild` reads the review cases of the REL rows it holds (`GraphReads.readReviewCases`) and hands each claim
version its latest case state, so the operator's run graphs an approved claim and skips a corrected version with the
reason — the run stays idempotent per claim version. The relationships consumer passes the corrected version's case
state the same way. The distinction that matters: a payload whose own `review.state` reads `corrected` (the correction
itself) is not a case-superseded version; only the CASE saying `corrected` supersedes.

**§2 and §6 B9-F3 — a REVIEW action's contract is preservation.** `retention.verify_action` (§2) gains a review
branch: per executable manifest the check `reviewed — untouched, its bytes present` passes when no tombstone names the
manifest, the vault observed `bytes_present = true` and a `done` execution of the item is recorded — expected
`{tombstone:false, bytes_present:true, reviewed:true}`; the action verifies; the deletion and floor checks are
unchanged. The controller publishes `DeletionVerified` only for a verified action that is not a review. **§6** was
found on the demonstration rehearsal: a review of CURRENT evidence resolved to an `excluded` item ("a deletion retires
corrected, superseded or withdrawn evidence only") and PAUSED — deletion criteria applied to a review's scope.
`retention.resolve_scope` re-declared with the review branches: the source selector covers the source's evidence
whatever its state; every manifest named is reviewed in place (`execute`, its evidence state and any hold in the
details — a hold is honoured by keeping the item, which is what the review does; the hold id on the item); no residual
inventory (a review retires nothing); the paused reason names what a review looks for. Deletion, archive and
customer-export scoping is unchanged (the harness control: a deletion of the same current evidence stays excluded).

**§3 the floor's re-check aligned.** `objects.outbox_declare_floor` re-checks the served points with the scope
resolution's rule (`s.status <> 'revoked' AND (served_from_seq < to_seq OR checkpoint_seq < to_seq - 1)`); 0067's raw
`coalesce(checkpoint_seq, 0) < to_seq` refused moves the resolution had admitted.

**§4 the withdrawal is its own act.** `memory.withdraw_item` asserts `memory.item.withdraw` (the supersession's action
too); the PDP rule `memory.item.withdraw` (the record authority; human-gated like the supersession); the route and the
workspace send it. `MemoryService.retrieve`: a withdrawn item's CURRENT retrieval is refused **409 EYE-STA-003**
(`was withdrawn and is out of circulation; its versions stay replayable as of an instant (payload.asOf)`); the as-of
read serves the version current at the instant with `availability.state = withdrawn`.

**§5 the agent's retrieval.** `memory.record_access` accepts `briefing.compose`. `BriefingService.compose` gains a
step: the active memory items recorded at or before `knownAt` whose `audience_purposes` include the composition's
purpose, whose classification the reader's clearance covers (`composerClearance` — a person's own; an agent's is
`null`, so R4a stays a human's — or the clearance derived from the composer's role bindings) and whose audience roles
are empty or held (administrators exempt) are read, each read recorded on the item's ledger (`read_as_of = knownAt`,
the composer as reader, the purpose) inside the composition's transaction, and pushed as a briefing item of kind
`memory` (`details`: record class, statement, source, classification, validity, retention, `access_id`, `read_under`)
and into the control inputs. `ExecutiveReads.readMemoryItems`, `BriefingWrites.recordMemoryAccess`. The executive
controller passes the human composer's role codes; `AgentsService.brief` passes the agent's.

**B9-F2 — the refusal contained.** `GraphCore.withSavepoint(name, run)` (savepoint / release / rollback) and
`GraphReads.withSavepoint`; the relationships consumer asserts the re-derived edge inside `withSavepoint('rel_assert')`
and catches the port's 22023 refusals (an undeclared predicate, an undecided claim, a case-superseded version) as
`derivation.blocked` unresolved — the transaction is intact, so the unresolved checkpoint commits with the reason
(`unresolved_dependency → human_review`), the reassessment stays pending on its cause, no successor exists, and a
re-drive adds no second cause and no second `edge.reassessment_opened`. The person's repair — the vocabulary extended
by an additive proposal the steward approves — lets the next re-drive re-derive the edge.

**The Enterprise Memory workspace.** `apps/web/app/graph/memory/page.tsx` (the `Memory` entry in the graph
navigation): the listing shows records without content (state, version, classification, audience, validity,
retention, attention); a retrieval under a DECLARED purpose (`memory`, `briefing`, `graph`, …; optional as-of instant)
shows the served version's content with the availability object; record / supersede (with reason and effective time)
/ withdraw forms; every refusal shown verbatim as the server returned it; `apps/web/lib/graph.ts`: `gUnder(...)` (the
same call under a declared purpose), `listMemory/getMemory/retrieveMemory/recordMemory/supersedeMemory/withdrawMemory`.
`next build` lists `/graph/memory`; `tsc` clean. The browser walk of the page (a signed-in session) is not part of
this batch's evidence — the author does not authenticate in the browser; the routes the page calls are exercised
end-to-end by the act (§B10.7 scene 1), and the walk is the owner's (`/graph/memory` as K. Müller).

**B10.6 the harness and the units.** `phase6-graph-subscriptions-4.test.ts` (32 cases): `B10 · WITHDRAW` (the knowledge
owner refused 403; the record authority withdraws under `memory.item.withdraw`; the current retrieval 409; the as-of read
serves v1); `B9-F2 closure · REFUSED, RECORDED, REPAIRED` (a correction moving the predicate to `depends_on`, outside
ontology v3 → the delivery `unresolved/unresolved_dependency/human_review`, `deliveries 1`, the item
`derivation.blocked` with the port's reason, `last_error` null, the edge asserted/pending/no successor; a re-drive →
`deliveries 2`, checks 2, causes unchanged, no second opened-event; the analyst's additive proposal approved by the
steward → re-drive → `applied`, `edge.re_derived`, the successor under v2 with predicate `depends_on`, the prior
superseded); `G2 closure (B10)` (two queued claims decided approved/rejected on their cases, payloads still `queued`;
the builder's run asserts the approved one and skips the rejected with `/rejected in review/`; the port refuses the
rejected claim's edge); the retention correction case extended with the review action's verification (§2) and `B10 ·
a REVIEW of CURRENT evidence …` (§6: current → `execute`, no residuals, executes as a record, verifies; held →
`execute` with the hold id and reason, verifies; the deletion control excluded). `phase6-executive-requests.test.ts`
(10): `B10 · the AGENT's retrieval` — two items (`['memory','briefing']` internal; `['memory']` restricted); the
briefing agent's run yields a briefing whose only memory item is the first, with its statement and `read_under:
'briefing'`; `memory.item_access` holds one row for it (version 1, purpose `briefing`, reader = the agent's principal),
none for the hidden item; the executive's own composition adds a second access row. Unit: `codex-corrections.test.ts`
gains three G2 cases on the builder's double (approved-in-case graphed; rejected-in-case refused; a case-corrected
version superseded, the successor graphed). Units: AU-DP-0176 (F2 closed; G2), AU-MEM-0059/-0061 (F3 closed, §2 and
§6), AU-MEM-0065 (the agent's retrieval; the workspace page; the withdrawal) — statuses unchanged: AU-DP-0176 and
AU-MEM-0065 `verified:ci` from B9, AU-MEM-0059 and AU-MEM-0061 `open` (their executors and the unprovable-scope pause
still owed); the B10 clauses bound to the hosted run at the B10 head (PHASE6_REPORT §23.4).

**B10.7 the demonstration** — `scripts/phase6/act-b10.mjs` → `evidence/cp6/act-b10.txt` (PHASE6_REPORT §23.3): the
workspace's routes, the briefing agent's retrieval, the F2 scene on the live `stocks` edge (a correction to `procures`
refused → unresolved → re-driven without a duplicate cause → the vocabulary extended → re-derived; the builder's run
afterwards asserting nothing twice), the F3 scene (a review of the current `eu-sanctions-rss` evidence verified
against its preservation contract, no DeletionVerified).

**B10.8 the closure (Codex's bounded review at `0cee439`/`c04f6b1`; migration 0069; PR #47's corrected candidate
`1fa3b08`).** B9-F2, B9-F3 and G2 closed on the inspected implementation. B10-F1 (a stored briefing disclosed a memory
version outside its audience roles), B10-F2 (the access id in the content digest) and B10-F3 (a later supersession
removed an item from an earlier cutoff) reproduced at the governed boundary and closed — `BriefingService.get` withholds
a memory item outside the cited version's audience for THIS reader (roles in the target, administrators admitted,
classification against clearance; a narrative citing a withheld item withheld with it); the accesses on the briefing row
(`executive.briefings.memory_accesses`, 0069 §1) outside the content; the candidates from history at the cutoff
(DISTINCT ON the item; withdrawals by the cutoff excluded before the 200-item bound); present availability apart. **B10-F4
(author-found)**: `objects.read` serves the header of an audience-governed object (MEM, BRF) and withholds the content;
the claim and evidence routes serve their own types; `observation.canonical_write_exclusions` (0069 §2) keeps the generic
write off MEM and BRF at `objects.admit_version`. Harness `phase6-briefing-memory.test.ts` (6; the unfixed code red first,
`b10-closure-repro-before.txt`); the adversarial review of the candidate (38 agents, 13 confirmed findings corrected); the
demonstration through the HTTP path (`closure-b10.mjs` → `closure-b10.txt`); hosted at `1fa3b08` green. PHASE6_REPORT §23.6.

## B11 — the governed credential path and the UN Comtrade act; the archive tier, the customer export package and the safe referential scope of a deletion; five workspace pages (implemented)

**Migration 0070** (`apps/api/migrations/0070_b11_credential_path_retention_executors_and_safe_scope.sql`), one file, on
`phase6-b11` (PR base `phase6-b10`, so the diff is B11 alone). The retention part was designed by a workflow agent from
the units' remaining clauses and the requirement rows (D1–D11 below), implemented by another, reviewed adversarially
(§B11.8) and exercised on the demonstration (§B11.9).

**§1 the governed credential path (SOURCE_INTEGRATION_STATUS §6 item 3, §11).** SRC@v3 adds
`security_and_operations.credential_header`; `credential_ref` is validated as the deployment's variable name
`EYE_SRC_<NAME>` (a pasted secret, a path or any other shape refused at registration; a header without a reference
refused). `SourceBinding.credential {ref, header}` — the reference only; `AcquisitionLifecycle` resolves the value
through `SourceCredentialStore` (the process environment at egress time) and hands it to the connector APART from the
binding (`AcquisitionContext.credential`); the HTTP client carries it as a credential, dropped on a redirect off the
origin like `authorization`; an unbound reference cancels the run BEFORE any request (`run.cancelled`, the reference on
the record); the readiness register reads `blocked-credential` for an unbound reference and live for a bound one. The
REST connector's code digest covers the new transport behaviour (`rest-credential-carriage@1.0.0`), so the agents
registered against the previous digest stop matching and are re-provisioned through the governed route
(`scripts/integrations/reprovision-rest-agents.mjs`). Harness `phase6-source-credentials.test.ts` (3): unbound —
blocked, cancelled before egress, the reference and never a value; bound — the value in the contract's header on every
request, the items admitted, the value nowhere on the run, the audit, the evidence or the register; the contract's
refusals. The UN Comtrade act (`scripts/integrations/activate-comtrade.mjs`): the policy read in full and quoted as the
rights evidence; `un-comtrade` v1 (rest, live; HS 8505, Germany with the world, annual; the upload contract's weekly
cadence and budgets carried verbatim; internal analysis only, attribution "Source: UN Comtrade.") registered by
a.hoffmann, approved by m.dvorak, rights recorded; the act STOPS before activation because this deployment binds no
`EYE_SRC_COMTRADE_KEY` (the key is the owner's to bind; a re-run activates and triggers one run).

**§2 the archive tier (L3-C08, DZ-18, DAT-ST-06).** D1 — the manifest row stays immutable (append-only since 0022);
its tier is a companion ledger `observation.blob_tier_records` (one row per move; a manifest's tier is its latest
record, `hot` when none — `observation.manifest_tier(uuid)`); the evidence detail and the scope items serve the tier,
never an UPDATE of the manifest. D2 — the archive tier is a second namespace of the vault under the SAME locator
(`eye.vault.archive_root`, env `EYE_VAULT_ARCHIVE_ROOT`); every containment check applies unchanged. D3 — copy first,
record, commit, then remove the hot copy: the executor copies the bytes into the archive root (temp file, fsync, rename,
re-read, digest compared), calls `observation.archive_blob` (only while an executing ARCHIVE action of the domain names
the manifest as an executable item; not a tombstoned manifest; under the manifest's own digest; a hold is no refusal —
an archive preserves; idempotent), and after the commit removes the hot copy (a copy the vault refuses to remove is the
pending `bytes_present` residual of 0067 §1, closed when verification observes the hot bytes gone); a copy failure rolls
the execution back whole and pauses the action with failure class `infrastructure`, disposition `retry`, the copies
THIS execution made removed. Retrieval of archived evidence reads the archive tier (`RetrievalResult.tier/availability`
= `archived`); the acquisition lifecycle's revalidation and every other reader of a manifest's bytes read the manifest's
CURRENT tier. The scope: the review's preservation scope (0068 §6) — current and superseded evidence alike, a hold
recorded on the item. Verification: no tombstone; `manifest_tier = archive`; the hot copy absent; the archive copy
present under the digest; the move recorded. No DeletionVerified (D10).

**§3 the customer export package (V03-T-047, DPD-19, LR-23).** The `export` namespace of the vault
(`eye.vault.export_root`): `<tenant>/<domain>/<action_id>/manifest.json` and `<manifest_id>.bin` per exported object,
nothing else (D5). The gates of V03-T-047: approval (the live approval on the resolved scope digest, re-checked at
`begin_execution`); redaction (the action's declared `classification_ceiling` — objects above it excluded with the
reason); format (JSON manifest + raw bytes); destination (`export`, the only one this release binds); data rights (the
source contract's `rights_state` must be confirmed — withdrawn rights exclude; re-checked at execution:
`authority_disputed` pauses the action); audit (`retention.action_events` `export.built`/`export.revoked`,
`retention.executions`, `observation.custody_events` `custody.exported` per object); revocation
(`retention.revoke_export`, the retention authority's human-gated act: the package row revoked once, the bytes removed,
the read route refusing, verification failing). D4 — "signed" is a DIGEST CHAIN, not a cryptographic signature (there is
no signing facility in the runtime; the only asymmetric signing in the repository is the C19 CI tooling):
`signature { scheme: 'eye-digest-chain/1', objects_digest = sha256(JCS(objects)), package_digest = sha256(JCS({format,
package, authorization, gates, objects_digest, excluded, bound_to})), bound_to {action_id, scope_digest, approval_id} }`,
the same digests recorded by the port in the append-only `retention.export_packages` and in the execution evidence — a
customer verifies integrity, completeness and re-import offline with `scripts/retention/verify-export.mjs` (no
dependencies, no network, no database: bytes against their digests, every canonical header+payload recomputing to its
recorded canonical digest, every file listed and every listed file present, the chain) and authenticity by presenting
the package digest to the product's export read route; a key-based scheme is `eye-customer-export/2`, recorded as
remaining. D6 — the EVD payload is exported as stored (its locator is an opaque id of the customer's own tenant). D7 —
`manifestIds` (1–200) is the selector of an archive or an export; a deletion or a review keeps `manifestId | sourceId`.

**§4 the safe referential scope of a deletion (V03-T-100, AU-MEM-0061).** D9 — the version set of a manifest M is
V(M): every version of the evidence object whose payload names M (a correction admits n+1 with the same payload and
manifest; a revision admits n+1 under a NEW manifest). A reference makes M load-bearing when it is version-aware and
names a version in V(M) — a briefing citing `evidence:<id>@<v>` in its sources, a live decision package's citation — or
digest-bearing and names M's digest — a claim whose lineage carries it with an asserted edge or a live review case; an
object-level reference (a dependency row) rests on the object's servable bytes and makes M load-bearing only while no
later version carries different, admitted, non-tombstoned bytes. `retention.load_bearing_references` computes them;
`resolve_scope` marks such an item `blocking` with the dependents named in `details.dependents`, the action PAUSED
(`unresolved_dependency` → `human_review`) with the failure reason listing them; the residual inventory unchanged for
the non-blocking references (lineage, dependencies, canonical versions — retained by policy); the person's route:
decide the case, retract the edge, close or supersede the package, then resolve again (the digest changes). D8 —
precedence `excluded` (current evidence) → `held` (a legal hold) → `blocking` → `execute`. The check is re-run at
`begin_execution`: a reference created inside the approval window pauses the execution.

**§5 execution and verification.** D11 — a refusal at execution is a `RetentionExecutionRolledBack` (the failure class
`legal_hold` | `authority_disputed` | `infrastructure`; disposition `retry` for infrastructure, `human_review` otherwise;
the approvals revoked in every case; the copies or the package this execution wrote removed on rollback). D10 —
`DeletionVerified` for `deletion` and `log_floor` only. Schedules carry their selector keys into the actions they open;
an archive schedule skips archived manifests; a customer-export schedule needs a classification ceiling.

**§6 the withdrawal is its own act (0070 §9).** The retention workspace found the withdraw route bound to the
opener's action; `retention.action.withdraw` is its own PDP rule (the same holders), the route's action and the port's
assertion (the opener's action still admitted).

**B11.6 the harness and the units.** `phase6-source-credentials.test.ts` (3); `phase6-retention-b11.test.ts` (35: A
the archive executor A1–A10 — the move, the tier ledger and the custody row, the hot copy removed after the commit, the
verification, retrieval from the archive tier, a deletion of archived bytes, the rollback cleanup with a copy actually
made and with an existing identical copy not this execution's, a hold recorded and kept, an archive schedule skipping
archived manifests; B the export executor B1–B11 — the package and its files, the redaction gate on the record's
classification, the data-rights gate, the verifier's checks and its tamper controls (a flipped byte, an unlisted file
including a dot-file, an edited header, a wrong expected digest), the revocation and the read after it, the rights
re-check at execution under a share lock, a leftover directory not wedging the next execution, a tombstoned manifest
refused, a schedule's ceiling carried; C the safe scope C1–C10 — a briefing citing the version, a live review case, an
asserted edge, a live package citation with an upper-cased id, a de-duplicated dependent, the release on withdrawal,
the re-check at execution, unknown manifest ids excluded with a reason; D the withdrawal as its own act);
`phase6-retention-b11-archive-poll.test.ts` (4: archived current evidence revalidates as held on the next live poll —
the 304 and the 200 paths — instead of admitting a duplicate); the `-4` retention describes re-run unchanged with the
archive block rewritten (executed as a move). Unit: `phase5-refusals` gains the B11 refusal mappings and the P0R02
class. Units: AU-MEM-0059 (every kind the statement names executes) and AU-MEM-0061 (the pause on an unprovable
referential scope) `open` → `verified:ci` (the harness at the B11 head; the hosted run at `1e3e4be`); AU-MEM-0060 a note
(a hold under archive/export recorded and honoured by keeping).

**B11.7 the adversarial review before the commit** (`evidence/cp6/b11-adversarial-review.txt`; PHASE6_REPORT §24.4):
six dimensions, two refuters per finding — 29 confirmed of 31, every one corrected in the same unapplied migration and
tree before the demonstration (two HIGH: the rollback cleanup tombstoning an archive copy another action had committed
— now only the copies THIS execution created; the acquisition lifecycle reading a manifest's immutable vault instead of
its tier, so archived current evidence would have admitted a duplicate on the next poll — now every reader of a
manifest's bytes reads its current tier, restore.sh's verification included), then re-judged by two judges per finding.

**B11.8 the demonstration** — `scripts/phase6/act-b11.mjs` with `reprovision-rest-agents.mjs` and
`activate-comtrade.mjs` → `evidence/cp6/act-b11.txt` (PHASE6_REPORT §24.3).

**B11.9 the closure of Codex's B11-F1 and B11-F2 (migration 0071; 2026-09-14; PHASE6_REPORT §25).** *The finding:* two
approved archive actions overlapping on a manifest — the first's copy adopted by the second (`copy_created: false`), the
second committed, the first failing later and its rollback cleanup removing the copy the second's committed record now
served: the bytes gone from both tiers. *Reproduced* through the governed path on a fresh database with an isolated vault
by `phase6-retention-b11-closure.test.ts`, using a HOLD (a fault-module primitive that makes the shipped code wait at a
boundary instead of crashing there; test profile only) — RED on the unfixed executor (`b11-closure-repro-before.txt`).
*The mechanism, 0071 §1:* `retention.lock_key_manifest`, `retention.lock_key_domain`, `retention.holds_advisory`,
`retention.holds_manifest_lock(tenant, domain, manifest)`; `begin_execution` re-declared — after the approval checks and
before the kind-specific re-checks, the domain's MOVERS advisory lock shared, then each executable manifest's advisory lock
in one canonical order (by ref): exclusive for an archive or a deletion, shared for a customer export; more than 256
executable manifests → the movers lock exclusively and no manifest lock (the lock table is finite: max_locks_per_transaction
× the connections); every execution takes the domain lock first, so no wait cycle. *§2:* `archive_blob` records a move only
under the manifest's lock (55P03 otherwise). *The executor:* a copy is STAGED under the creating execution ATTEMPT's own name
(`<locator>.staging-<attempt_id>` in the archive root, `VaultService.copyBlob` with the owner; every execution of an action
is its own attempt) and PUBLISHED under the locator by the controller only after the commit that recorded the move
(`publishArchiveCopy`: a rename in the same directory, the digest re-read; idempotent; the other staged copies of the
locator retired) — so a copy whose record did not commit is adoptable by no other execution, and a rollback removes only the
file bearing its own attempt's name (`removeStaged`; a second attempt of the same action, admitted after the first's backend
was lost, owns its own), whatever became of the transaction's locks, backend or connection meanwhile (the author's first closure proved the lock before each removal and read "current transaction is
aborted" as held — wrong: PostgreSQL releases a transaction's locks at the abort itself; the review's judges reproduced the
loss on a cancelled statement and named the check-then-act window on a lost backend); the execution runs in a subtransaction
(a savepoint after the locks) so a cancelled or timed-out statement aborts only that (the cleanup on a transaction still
open), and the item branches roll back to the item savepoint only while it exists; an execution finding the manifest
archived under the lock reads the committed copy (`readArchived`: the locator, else any staged copy under the manifest's
digest, else the locator again, else the kept hot copy — the source recorded on the download's custody row), publishes a
still-staged one there and then, schedules the hot removal only once a published copy stands, and records the move as
already made; the retry route works from the executed items (not residual rows alone), leaves a tombstoned manifest to its
deletion and reports what it could not publish; a transaction failing after the executor returned has its attempt's staged
copies removed by the controller; an execution naming more than 256 manifests, whatever its kind, takes the movers lock
exclusively; a failed publish keeps the hot copy and records a pending
residual retried by the execute route (`retryBytes` publishes any staged copy under the manifest's digest first, and copies
the kept hot copy again when none publishes); a deletion retires staged copies with the bytes (`removeAllStaged`, retried
too) and its verification counts a staged copy as bytes present; `scripts/ops/restore.sh`'s blob verification and its
after-boundary listing look where the product's readers look (a pending publish counted apart, never absent); every reader of the archive tier — the evidence download, the acquisition lifecycle's availability,
the export builder — reads through `readArchived`. *The controller:* the executor's verdict survives a failed
ROLLBACK (stashed beside the transaction; the pause on a fresh connection); a lock not granted at the start (40P01,
55P03) pauses the action `infrastructure` for a retry. *The pools* (`shared/db.ts`): an `error` listener on every client,
idle or checked out — a terminated backend is a logged failing query, not an event that ends the process. *B11-F2:* the
verifier's verdict rule (complete validation, `ok`/`complete`/`failed`, text = JSON = exit; an expected digest never
silently skipped; `excluded` as listed; an unreadable listed file a failed check). *The harness:* nine cases — Codex's
interleaving, the hold inside the cleanup, the serial control, the overlap that succeeds (serial and concurrent), the lock's
end with the backend (pg_terminate_backend on the holder), a statement cancelled mid-record (a sleeping trigger and
pg_cancel_backend), a second attempt of the same action after the first's backend was lost, and the verifier's refusals
and controls. *Records:* the four
requirement rows (DZ-18, DAT-ST-06, L3-C08, V03-T-047) carry the clauses; no unit changes status. *The runbook:*
`docs/ops/DEMONSTRATION_RUNBOOK.md` and `scripts/ops/demo-restart.sh` (the target verified before success is reported),
carrying the 2026-09-13 incident. *The demonstration:* `scripts/phase6/closure-b11.mjs` → `evidence/cp6/closure-b11.txt`.

## B12 — the governed restore-to-hot port and the cold-tier manager; the sweeper's walk of the archive root (implemented)

**Migration 0072** (`apps/api/migrations/0072_b12_restore_and_cold_tier_manager.sql`, sha256 `ef56c5be…`), one file, on
`phase6-b12` (PR base `main` at `41d4a26`, #48 merged). The batch takes the register's next missing archive-lifecycle
capability — L3-C08 "coordinates archive and cold-tier lifecycle, admission, ordering, retries, budgets, escalation, completion,
and observable state" (its remaining clause after B11: "no restore-to-hot port; no budgets, ordering, retries or escalation of a
cold-tier manager; the sweeper does not walk the archive root") — with DZ-18, DAT-ST-06, DP-28-002/-006, DP-54-006 and the units
AU-MEM-0062, AU-INF-0791. Designed from those rows (the design checked by two independent readers against the code before a line
was written — 21 findings, four blocking, folded into the design as binding corrections), implemented by six agents on disjoint
files, run on a fresh database, rehearsed on a restored copy and exercised on the demonstration (§B12.7).

**D1 — a restore is a MOVE BACK, recorded in the same ledger.** `observation.blob_tier_records` admitted `archive → hot` since
0070 ("'hot' as a target is a later restore port"); a manifest's tier stays `observation.manifest_tier(uuid)` — its latest
record; no manifest row is updated (B11's D1).

**D2 — the restore executor is the archive executor MIRRORED** (0070 D3, 0071's per-attempt ownership): the archive copy is
copied into the HOT root STAGED under the execution attempt's own name (`<evidence_root>/<locator>.staging-<attempt_id>`),
the move recorded through `observation.restore_blob` under the manifest's lock (the archive port's checks mirrored: an executing
RESTORE action naming the manifest, not tombstoned, the manifest's digest, `retention.holds_manifest_lock`; false when already
hot), the transaction committed, the staged copy PUBLISHED under the locator in the hot root (a rename), then the ARCHIVE copy
removed with any staged copies of the archive root. A publish that fails keeps the archive copy and records a pending
`bytes_present` residual retried by the execute route (which publishes first, copies the kept archive copy again when nothing
publishes, and removes the archive copy only once a published hot copy verifies — the same route as an archive's, C4: the
post-commit removal spares the SOURCE copy of an unpublished locator in either direction). A rollback removes only this
attempt's staged file in the hot root (C6: the controller's post-handler cleanup names the root too). Every reader of a hot
manifest reads through `VaultService.readTiered('evidence', …)` — the locator, else a staged copy under the digest, else the
locator again, else the kept ARCHIVE copy (falling through on `missing` only, C16): the evidence download (`served_from`
published | staged | fallback on the custody row), the acquisition lifecycle's availability (C12: a restore whose publish is
pending is not read as unavailable — it would admit a duplicate), the export builder (C13); `scripts/ops/restore.sh`'s blob
verification looks in the same places for a hot manifest (C14, `present_pending_publish`). The staging discipline applies to
both blob roots: `stagedCopiesIn`, `publishCopy`, `removeStagedIn`, `removeAllStagedIn`, `readTiered`, `domainInventory`,
`listDomain`, `removeTempFile` take the root; the archive-named forms of B11 keep their contracts and delegate. A temp file of a
staged copy is `<uuid>.staging-<attempt>.tmp-<uuid>` (C17): a staged copy's name is matched EXACTLY, a temp is never a staged copy.

**D3 — one tier holds the served bytes.** The restore's verification contract (0072 §5): no tombstone; `manifest_tier = 'hot'`;
the hot copy present and verifying under the manifest's digest; the archive copy ABSENT; no staged copy in either root (a
listing that fails counts as present — fail closed); the move recorded by this action. The residual closure is kind-aware (C5):
a restore's pending residual is the archive copy's removal and closes when `archive_present` is observed false.

**D4 — the cold-tier manager is a per-domain POLICY and the rules that read it** (`retention.tier_policies`, one row per version,
append-only; `retention.current_tier_policy` — the latest version or the defaults, `declared: false`; declared by the domain's
administrator through `retention.tier.declare`, object type `RTP`, the route `/retention/tier/declare`; C10: the declaration
takes a per-domain advisory lock so two declarations never collide on a version):
- **admission / budgets** — `budget_bytes_per_day` (NULL = unbounded): `begin_execution` of an ARCHIVE or a RESTORE refuses
  BEFORE the state moves and before any manifest lock, when the bytes the domain moved in the rolling 24-hour window plus this
  execution's bytes exceed the budget — `retention execution rejected (budget_exhausted): …` naming the instant the window
  frees; the controller pauses the action `infrastructure` / `retry` (no attempt counted: the state never moved); under a
  budget the domain's byte movers are serialised by a `retention.budget:` advisory lock so the check is exact (C11).
- **ordering** — the evaluation opens actions OLDEST-DUE FIRST, at most `max_opens_per_evaluation` (1–200, default 200) per
  schedule per evaluation, the rest DEFERRED to the next evaluation and counted on the schedule
  (`retention.schedules.last_evaluation = {at, opened, deferred}`; the count taken over the whole due set before the limit — C7)
  and returned by the route (`evaluation.deferred`).
- **retries** — `retention.actions_current.attempts` counts the executions that BEGAN: incremented with the state move for the
  committing path, and — because that increment is rolled back with a failed execution — by the pause that records the
  failure (the 8-argument `retention.pause_action` with `p_attempted`, C2; the controller passes `attempted: true` when the
  state had moved, false for a refusal before it moved); bounded by `max_attempts` (1–10, default 3): `begin_execution`
  refuses `attempts_exhausted` and the controller ESCALATES the action (`retention.escalate_action`: paused / human_review,
  the failure class kept, `escalated_at`, the approvals revoked, event `action.escalated`). A person's RE-RESOLUTION of an
  escalated action resets `attempts` to 0 and `escalated_at` to NULL — "a human review restarts the retry budget" —
  `attempts_reset: true` in the resolution's summary and event (C8).
- **escalation by age** — `retention.evaluate_tier` (the `/schedules/evaluate` route runs it after the schedules, in the same
  act; `evaluation.escalated` names them) escalates every action paused for retry, not yet escalated, whose latest
  `action.paused` is older than `escalate_after` (default 7 days).
- **completion** — the verification contracts (the archive's, 0070 §6; the restore's, D3).
- **observable state** — `retention.tier_state(tenant, domain)` (`/retention/tier/state`, `retention.read`): the policy in
  force or the defaults, manifests and bytes per tier, the moves of the last 24 h, the budget (per day, used, remaining, the
  instant the window resets), the actions by state (executing, paused for retry, paused for human review, escalated, with
  pending bytes residuals), the restored manifests awaiting re-archive, the schedules with their last evaluation — and, added
  by the controller, the vault's inventory of both roots (blobs / staged / temp; a root that cannot be listed is reported as
  such, never as empty).
- **the restore window** — `restore_hot_for` (default 30 days): an ARCHIVE schedule treats a manifest whose latest tier record is
  a RESTORE as due at `moved_at + restore_hot_for`, so a restored record returns to the cold tier by the existing schedule after
  its window — the lifecycle closes without a new route. A RESTORE is on demand: `declare_schedule` refuses `action_kind =
  'restore'`; `retention.open_action` admits the kind (C1) with the chosen-object-set selector (`manifestIds`, D5: the B11
  refusal wording kept, C3); the resolution takes the preservation scope — a manifest already hot is excluded ("a restore moves
  archived bytes only"), a hold recorded and honoured by keeping; `evaluate_schedules`' dedupe for an ARCHIVE schedule also
  reads a chosen object set, so a manifest under an open archive by `manifestIds` is neither opened nor deferred (an export
  schedule keeps 0070's predicate — B8 of the B11 harness pins it).

**D6 — the sweeper walks BOTH roots and knows the staged names** (the B11 round-2 follow-up: "the disposal of a staged copy
orphaned by a process lost between its copy and its cleanup"). One snapshot of stored state (the manifests by locator; the tier
of every manifest a staged or archive-root name points at), then per name: `.tmp-` FIRST (a temp, whatever precedes it; older
than a minute → removed, `tempFilesRemoved`); `.staging-<attempt>` with no manifest → an orphan candidate (recorded, kept); with
a manifest, in the TIER's root and a verified copy under the locator → REDUNDANT → removed (`stagedCopiesRemoved`); in the other
root → removed only once older than the run timeout and the tier's copy verifies, kept while young (`stagedCopiesKept`); a
staged copy that may be the only verified copy → kept and RECORDED (`staged_copy_kept`) unless young and in the tier's root (the
ordinary instant between a commit and its publish, C18); a plain name in the ARCHIVE root with no manifest → an orphan candidate
(`archiveOrphanCandidates`; recorded with its root named, kept); with a manifest the ledger says is HOT → a stale archive copy (a
restore whose archive removal failed — the execute route's pending residual; `stale_archive_copy`, recorded, kept). Nothing with
bytes the product may still need is removed; a root that cannot be listed is recorded and left alone. The evidence root's plain
names keep the B9 rule; the `.staging-` names are no longer reported as plain orphans there. `SweepReport` gains the four counts.

**D7 — no new interface is bound.** L3-I04's `bound_to` gains the B12 clause; the register stays 26 bound / 24 partial / 0
unbound (asserted by the migration as 0070 did).

**B12.6 the harness and the units.** `phase6-retention-b12.test.ts` (12 cases on an isolated vault: R0 the B11 archive path as
the setup; R1 the restore's resolution — execute 2 with a hold honoured, excluded 1 already hot, a restore of a hot manifest
alone pausing "nothing to restore", a deletion by `manifestIds` still refused, a restore schedule refused; R2 the execution —
the hot copies present and verifying, the archive copies absent, no staged file in either root, the ledger's archive→hot rows,
`custody.restored`, the execution rows, `attempts 1`; R3 the restore contract, no DeletionVerified; R4 the retrieval from the
hot tier with `served_from published`, the detail's availability hot; R5 two restores of one archived manifest executed
concurrently — one mover, one finder, one tier record; R6 the restore window and the ordering — no policy: the restored records
not due, the never-moved one due; `restoreHotFor 0 seconds`, `maxOpensPerEvaluation 1`: one action per evaluation, oldest due
first, `deferred` returned and recorded; R7 the budget — `budgetBytesPerDay 1`: refused at admission, paused retry, `attempts
0`, the approvals revoked, no execution row; lifted: executed; R8 retries and escalation — `maxAttempts 1`: a copy that fails
pauses with `attempts 1`, the next execution refused `attempts_exhausted` and the action escalated, `tier/state` counting it, the
re-resolution resetting the count, then executed; escalation by AGE under `escalateAfter 0 seconds` by the evaluation; R9 the
observable state — the policy in force, the tiers, the moves, the budget used, the escalated count, the restored awaiting
re-archive, the vault inventory; the steward and the analyst may read it, the steward's declaration refused 403, an invalid
interval 422; R10 the sweeper's walk — seven planted names classified exactly (removed 3, kept 2, temp removed 1, one archive
orphan recorded with its root named), the published copies untouched, a second sweep changing nothing; R11 the retry route of a
restore whose hot publish failed after the commit (`b12.restore_publish_fail`) — the archive copy kept, the hot copy staged, a
pending residual, the evidence served from the staged copy (`served_from staged`), the verification refusing while the archive
copy stands, the execute route publishing and removing, the verification passing and the residual closing; a retry of a VERIFIED
action refused by the port). The first run on a fresh database was 10/12: two harness expectations corrected (the archive root's
orphan is recorded with its root named; a verified action's retry is the port's refusal), the second run 12/12. The suites the
changes touch — `phase6-retention-b11` (35), `-archive-poll` (4), `-closure` (9; four case titles retitled to the per-attempt
ownership design, Codex's stale-wording note), `phase1-fault-injection` (the sweeper), `phase1-acceptance` (the vault),
`phase6-graph-subscriptions-4` — green on a fresh database; the full integration suite 1006/1006 in 62 files on a fresh
database (`evidence/cp6/b12-int-all-1.txt`); the upgrade proof with 0022–0072 (51 migrations, `b12-upgrade-proof.txt`); the web
typecheck, build and tests. Units: AU-MEM-0062 and AU-INF-0791 `open` → `verified:local`, then `verified:ci` at `97576c3` (ci 35004457633,
1006/1006 in 62 files on a fresh database; 3,555 = 3,186 open + 338 local + 31 CI); the requirement rows L3-C08, DZ-18 and DAT-ST-06 `partial` → `implemented` (passed:harness, branch-only — every function
the rows name exists on the local profile; the two structural residuals named for the hardening campaign), DP-28-002/-006 and
DP-54-006 carry the clauses (DP-54-006 `missing` → `partial`).

**B12.7 the demonstration** — `scripts/phase6/act-b12.mjs` → `evidence/cp6/act-b12.txt` (rehearsed first on a restored copy,
`evidence/cp6/b12-rehearsal.txt`): `eye_demo` backed up and migrated with 0072, the API restarted by the runbook's script on the
B12 build; the two NORDWERK records the B11 closure archived RESTORED by P. Novák under H. Bergmann's approval — the host's hot
paths present and archive paths absent, no staged file, the ledger's archive→hot rows, `custody.restored`, the restore contract
2/2, A. Hoffmann's download from the hot tier (`served_from published`); the platform administrator's tier policy at
demonstration settings (one byte per day, one open per evaluation, one attempt, escalate after zero seconds, a zero restore
window); an archive of P REFUSED AT ADMISSION by the budget (409 `budget_exhausted`, paused for retry, `attempts 0`, the approvals
revoked), the budget lifted, the action re-resolved, re-approved and executed (`attempts 1`) and verified; an archive of Q paused
by the budget again and ESCALATED BY AGE at the next evaluation (`action.escalated`, disposition human_review), then withdrawn;
the archive schedule declared and evaluated under one open per evaluation — three evaluations opening one action each, oldest
due first, `deferred` 2, 1, 0, the third the RESTORED record due at its restore instant, executed and verified: the full cycle in
one ledger (hot → archive, archive → hot, hot → archive); the sweeper removing a planted redundant staged copy and a stale temp
file from the demonstration's archive root with the published copy untouched; the policy re-declared at sane values (the
defaults' equivalent, version 5). The demonstration corrupts nothing: `attempts_exhausted` after a FAILED attempt, the concurrent
restores and the retry route are the harness's (R8, R5, R11), stated in the act's output. Found on the demonstration: the
runbook's restart script left a bash subshell holding the caller's pipe for the API's lifetime when its output was piped (the
API came up and verified; the capture hung) — corrected in this tree (the forked subshell EXECs the API), the restart repeated
by the corrected script inside the act. Left on the demonstration: the archive schedule of profile "24 months" for
nordwerk-internal (active; it acts only on an evaluation, and the sane policy's restore window keeps restored records hot for
30 days; no route retires a schedule — recorded as a follow-up).

## B13 — the governed schedule retirement; the customer export's delivery — the package download, the destination and its receipt, the key-based signature (implemented)

**Migration 0073** (`apps/api/migrations/0073_b13_schedule_retirement_and_export_delivery.sql`, sha256 `35826c53…`), one file, on
`phase6-b13` (PR base `main` at `2d760e4`, #49 merged). The owner's 2026-09-16 directive and Codex's B12 review named the batch: a
governed schedule-retirement route and page control, used to retire the demonstration-created archive schedule with its history kept;
the customer export's delivery capabilities from the specification — package download, destination delivery, key-based signing —
demonstrated whole in NORDWERK with an isolated synthetic destination and a demonstration key where production bindings are
unavailable, that demonstration distinguished from production activation. The specification rows: V03-T-047 (the export gate's
destination and revocation), DP-47-001/-002/-003/-005/-006 (Data Exchange, Export and Portability — the controlled state "exchange
identity, requester, purpose, scope, contract versions, … policy, encryption, destination, receipt, and expiry"; the continuity rule
"deny or quarantine the exchange, preserve the request and evidence … and require recipient acknowledgement before closure"), DZ-17
(the exchange staging tier: scope, rights, destination, expiry), DPD-19 and LR-23 (the signed open package), DP-54-006 (external
processor receipts), ES-53-003/-004 (egress obligations; signed packages with receipt checks for disconnected modes), NZ-20 (approved
transfer stations), SC-24, CMP-102 (the delivery receipt on the page), DAT-SV-08; the units AU-IDP-0179/0180, AU-COM-0056/0058/0060,
AU-IDP-0227, AU-INF-0854, AU-DP-0097. Designed, checked by two independent readers against the code before a line was written (27
findings — the tenant-scoped key table under the domain route, the mapper prefixes, the two built_at instants, the expiry floor, the
station files' cleanup after a failed commit, the receipt bound to its delivery, the signing gate at delivery, the section references,
the pair check, the base64 shape, the archive ceiling, the realpath containment, the unbound key before the state moves, the .invalid
host, the colon in a key id, the POST form of the egress — each folded as a binding correction), implemented by six agents on disjoint
files, run on a fresh database, rehearsed on a restored copy and exercised on the demonstration (§B13.7).

**D1 — a schedule is retired by its own governed act, its history kept.** `retention.schedules` gains `retired_at`, `retired_by`,
`retire_reason` (a pair check among the three; no trigger — the harnesses that retire by a raw UPDATE of `state` keep working);
`retention.retire_schedule` moves `state` active → retired once (a second retirement refused "is retired"; an unknown id "is not a
schedule of this domain"); the row, its `last_evaluation`, the actions it opened and their events stay untouched, and a retired schedule
opens nothing (the evaluation reads `state = 'active'`). A new append-only ledger `retention.schedule_events` (`schedule.declared` —
`declare_schedule` re-declared to write it — and `schedule.retired`, each with the actor and the details). Action
`retention.schedule.retire` (the declare rule's holders), route `POST …/retention/schedules/:id/retire { reason }`; the list and
`tier_state` serve the columns; the page's Retire control per active schedule.

**D2 — the package's ARCHIVE is one deterministic ustar tar, its digest recorded at the build.** `export-archive.ts` builds the tar
in process (no dependency): `manifest.json` first, then the object files the MANIFEST lists sorted by name; mode 0600, uid/gid 0,
mtime = the manifest's own `package.built_at` (seconds) for every entry, two zero blocks — a pure function of the manifest and the
files, so its sha256 (the **archive digest**) is recorded once in `retention.export_packages.archive_digest` at the build and re-verified
on every download and delivery (the tar rebuilt from the files on disk and compared; a listed file absent, a name outside the package's
rule or a differing digest is an integrity refusal — nothing served). The tar is never written into the package directory and adds no
execution row (B11's B4/B5 pin the directory's three files and the three rows); a 256 MiB archive ceiling refuses the download and the
delivery from the row's byte total before any file is read (a streaming writer for larger packages is recorded as remaining). The
verifier reads a tar directly (`--tar`: the 512-byte headers, the magic, the sizes; a malformed archive a failed "archive readable"
check).

**D3 — key-based signing is the scheme `eye-customer-export/2`; the private key is a credential BY REFERENCE; the public key is
recorded.** `retention.export_signing_keys` — TENANT rows under the domain route (their own scope check and RLS by tenant; primary key
(tenant, key id)): `key_id` `ed25519:<first 16 hex of sha256(SPKI DER)>`, the public key PEM, `credential_ref`
(`EYE_EXPORT_SIGNING_KEY_<NAME>`), `purpose` ('demonstration' | 'production'), declared/retired. The tenant's (or the platform's)
administrator declares a key by its reference (`retention.signing_key.declare`, `/signing-keys/declare`): the server resolves the
reference from the process environment (`ExportSigningKeyStore`, the source credential store's discipline — never logged, never
recorded), derives the public key (Ed25519 only; an unbound reference or a value that is not an Ed25519 private key refused 422) and
records it; a key already declared refused; retirement keeps the row (a package signed by a retired key still verifies; the read route
says the key is retired). The active key = the latest non-retired. The export build signs the ASCII hex of the package digest
(`crypto.sign(null, …)`), `signature = { scheme /2, objects_digest, package_digest, bound_to, statement, key_id, algorithm 'Ed25519',
signature base64 }`; `record_export_package` (re-declared, 14 arguments) admits /2 only with the tenant's active key and a
64-byte signature, and REFUSES /1 while a key is active — a package is never silently downgraded; with an active key whose reference is
NOT bound in this process the execution is refused BEFORE the state moves (`retention execution rejected (signing_key_unbound)`, paused
`infrastructure`, no attempt counted). The verifier verifies /2 with `--public-key` (a note, never a failure, without it); the export read
route serves the public key, its purpose and state. **Demonstration vs production:** the demonstration key is generated by
`scripts/retention/generate-demo-signing-key.mjs` (one env line to stdout for the operator's local handoff; the public PEM to a file),
declared with purpose `demonstration`; production activation = a production key under the owner's key custody declared with purpose
`production` and the demonstration key retired — a named remaining step (a KMS/HSM binding is a later scheme).

**D4 — expiry.** `expires_at` = the build's instant + the action's `expires_after` (a customer export's selector key, an interval spelled
as a due-after between 1 hour and 1 year, validated in the port and in the intake; the default 30 days); an expired package's download
and delivery are refused; revocation still records; the read route says `expires_at` and `expired`.

**D5 — a DESTINATION is a declared exchange party, two kinds.** `retention.export_destinations` (`destination_key` unique among the
domain's active destinations; `kind` `transfer_station` | `https`; `endpoint`; `credential_ref` `EYE_DST_<NAME>` for https only;
`recipient`; `purpose`; declared/retired) — the domain's administrator declares (`retention.destination.declare`), lists (with the
readiness `blocked-credential` for an unbound https reference — the source register's discipline), retires. A **transfer station**
(ES-53-004, NZ-20 — the disconnected/air-gap path; the demonstration's isolated synthetic destination) is an absolute directory
outside the four vault roots (realpath-checked at declaration and before every write and read; a symlink into a vault root refused)
into which the product writes `<tenant>/<domain>/<action>/package.tar` and `package.sig` (content-addressed: an identical file accepted, a
differing one an integrity failure) and `delivery.json` (the exchange identity per attempt: delivery id, attempt, action, destination,
recipient, purpose, the digests, the signature scheme and key with its current state, delivered_at, expires_at, the verification
statement), and from which it READS the recipient's `receipt.json`. An **https** destination is delivered by `deliver()` in the
egress client — the same vetting as every collection (https only, the host as the allowlist, resolve-then-connect to the pinned
address, TLS, size and time caps), a POST with the tar and the digests in headers, the credential as a bearer on the first hop only, a
3xx refused (`redirect_not_followed`), the response JSON the receipt.

**D6 — a DELIVERY is a governed, human-gated act on a VERIFIED, unrevoked, unexpired package, re-checking the rights, recorded with what
the destination answered.** `retention.export_deliveries` (delivery id, action, destination, attempt — serialised by the action row's
lock and a per-action advisory lock; unique per action/destination/attempt — state `delivered` | `acknowledged` | `failed` |
`mismatched`, the digests, the key, the receipt as received and its digest, the failure class `destination_retired` |
`credential_unbound` | `egress_refused` | `transport` | `receipt_invalid` | `write_failed`, delivered/acknowledged instants). The
delivery act (`retention.export.deliver`, the retention authority's or the administrators', human-gated; `/actions/:id/export/deliver
{ destinationKey }`): ONE governed write runs `begin_export_delivery` (the gates: the action `verified` — an executed one "verify the
package first"; not revoked; not expired; the destination active; every exported source's rights still confirmed — `(rights_changed)`;
a package without a key-based signature while a key is now active refused; a package signed by a key retired since IS deliverable), the
executor (the archive rebuilt and compared; the station files written or the POST made), and `record_export_delivery` — a FAILED
delivery is a recorded fact with its class, never a rolled-back one (the request and evidence preserved); the controller removes the
station files this attempt CREATED when the transaction fails after the handler returned (a pre-existing identical tar never). The
recipient's ACKNOWLEDGEMENT closes the exchange: the collect act (`retention.export.acknowledge`, `/…/deliveries/:id/collect-receipt`)
reads `receipt.json` from the station (containment re-checked, 64 KiB, a JSON object) and `acknowledge_export_delivery` moves a delivered
row to `acknowledged` when the receipt names THIS delivery, both digests and `verified: true`, to `mismatched` when it names other
digests or `verified: false` (the exchange denied), and refuses a receipt naming another delivery (a stale receipt of an earlier
attempt); the acknowledge act (`/…/deliveries/:id/acknowledge { receipt }`) takes a receipt presented out-of-band. `custody.delivered`
per exported manifest; the events `export.delivered` | `export.delivery_failed` | `export.acknowledged` | `export.mismatched` |
`export.downloaded`. Stated: an https delivery that left the process before a commit that then failed is a network side effect the
ledger did not record — visible by the next attempt's number and by a receipt naming a delivery the ledger never recorded (the honest
residual, as B11's archive publish). A revocation sends no notice to a destination (remaining).

**D7 — the download is a governed, audited read of the tar** (`retention.export.download` — the steward's, the authority's, the
administrators' and the auditor's; `audit_access`): the tar rebuilt and compared, answered as base64 with its digests, the signature
block, the public key and the expiry (the evidence download's idiom); refused when revoked or expired; the event `export.downloaded` on
the action with the reader. The page turns the bytes into a file the person saves.

**D10 — no new interface bound**; the register stays 26/24/0 (asserted). Object codes `RSK`, `RDS`, `RDL`.

**B13.6 the harness and the units.** `phase6-retention-b13.test.ts` (10 cases on an isolated vault AND an isolated transfer station,
two generated Ed25519 pairs bound by reference before boot, the demonstration recipient and the customer's verifier spawned as
processes): S0 the setup; S1 the schedule retirement (the ledger's declared and retired events, the row and its last evaluation kept,
the opened action untouched, a second retirement refused, the evaluation opening nothing, the steward refused 403, a short reason 422,
`tier/state`); K1 the signing key (declared from the bound reference — the key id, the public PEM, the list without the value; a second
key; an unbound reference and a non-key value refused; retirement; the steward refused); E1 the signed export (the record's key,
archive digest and expiry; the /2 block; the verifier with and without the key; a flipped signature failing; `expiresAfter` bounds;
the unbound key refused before the state moves); A1 the archive (deterministic; the download's tar = the recorded digest, its entries
the package files; the event; a tampered file refused; a revoked and an expired package refused — the expiry proven through the owner
connection moving `expires_at` back); D1 the destinations (a station on the root; inside a vault root, a vault root, the directory
above, a symlink into a vault root, a relative path, a missing directory refused; a duplicate key, a credential on a station, a plain
http URL, a malformed key refused; the unbound https reference's readiness; retirement; the steward refused); T1 the transfer-station
delivery (the files, `delivery.json`, the ledger, `custody.delivered`, the recipient's receipt collected → acknowledged, a second
delivery attempt 2 with the tar unchanged, a mismatched receipt → mismatched, a non-object receipt refused, the acknowledge route);
T2 the gates (unsigned while a key is active; an unverified export; a revoked package with its earlier delivery kept; an expired
package; a retired and an unknown destination; rights withdrawn since; the steward; the key retired → the package signed by it still
deliverable and an unsigned one too; no receipt yet; a receipt naming another delivery); H1 the https delivery (credential unbound →
failed before egress; bound → the `.invalid` host → failed transport; the loopback endpoint → failed egress_refused; nothing of the
credential's value anywhere); P1 the reads and the PDP. The first run 6/10 on one harness fixture defect (the symlink case's cleanup);
the second 10/10. The suites the changes touch 134/134 in five files; the full integration suite **1016/1016 in 63 files** on a fresh
database; the upgrade proof with 0022–0073 (52 migrations); the web typecheck, build and tests. Units: AU-IDP-0179, AU-IDP-0180 and
AU-COM-0060 `open` → `verified:local`, then `verified:ci` at `3a5a181` (ci 35032929806, 1016/1016 in 63 files on a fresh database; 3,555 = 3,183 open + 338 local + 34 CI); AU-COM-0056/0058, AU-IDP-0227, AU-INF-0854 and
AU-DP-0097 carry clauses; the requirement rows V03-T-047 (the gate whole; `partial` on the EXECUTION half of the boundary row),
DP-47-001/-002/-003/-005/-006, DZ-17, SC-24, NZ-20, DAT-SV-08 `missing` → `partial`, DPD-19 and LR-23 `partial` → `implemented`,
CMP-102 `partial`, DP-54-006, ES-53-003/-004 carry the clauses.

**B13.7 the demonstration** — `scripts/phase6/act-b13.mjs` → `evidence/cp6/act-b13.txt` (rehearsed first on a restored copy with its
own vault copy, its own rehearsal key and station, `evidence/cp6/b13-rehearsal.txt`): the preparation by the operator (the
demonstration key generated, its private half bound by reference in the local secret handoff — never printed — and its public half on
file; the transfer station directory), `eye_demo` backed up and migrated with 0073, the API restarted by the runbook's script; then
(1) the platform administrator RETIRES the archive schedule the B12 act declared, with a reason — the row, its last evaluation and its
three actions untouched, `schedule.retired` on the ledger, an evaluation opening nothing from it; (2) the DEMONSTRATION KEY declared
from `EYE_EXPORT_SIGNING_KEY_DEMO` with purpose `demonstration` — the recorded public key the one on file, the list without the value;
(3) the transfer station `nordwerk-transfer-station` (the isolated synthetic destination) and the https destination `nordwerk-exports`
(the production kind; its credential reference unbound on this host → `blocked-credential`) declared; (4) P. Novák's customer export of
the two hot NORDWERK internal records (expiry 7 days), approved by H. Bergmann, executed with the active key — scheme /2, the archive
digest, `expires_at`, verified by the product; (5) the DOWNLOAD as one tar (13,312 bytes; the digest the record's; the event on the
action), the customer's verifier on it with the public key: PACKAGE OK, signature verified; a byte flipped inside a `.bin` entry:
FAILED; the analyst's download refused 403; (6) the DELIVERY to the transfer station by H. Bergmann — `package.tar`, `package.sig`,
`delivery.json` on the host, `custody.delivered` per record, the DEMONSTRATION RECIPIENT (the script, not the product) verifying on
its side and writing `receipt.json`, H. Bergmann collecting it → ACKNOWLEDGED (the exchange closed with the recipient's
acknowledgement); (7) the PRODUCTION PATH'S GATE — a delivery to `nordwerk-exports` recorded FAILED `credential_unbound` before any
egress; (8) the REVOCATION — the download, a further delivery and the read refused; the deliveries stay recorded; no notice reaches the
destination; (9) the state. Left on the demonstration: the demonstration key (active, purpose demonstration), the two destinations,
the station's files and receipt, the retired schedule.

## B14 — the HTTPS exchange proven, the receipt bound to its delivery (Codex B13-F1), the destination's trust anchor, the revocation notice (implemented)

**Migration 0074** (`apps/api/migrations/0074_b14_https_exchange_receipt_binding_revocation_notice.sql`, sha256 `d52c8761…`, 434
lines), one file, on `phase6-b14` (PR base `main` at `be72aa8`, #50 merged). The owner's 2026-09-16 directive and Codex's B13 review
named the batch: prove a successful HTTPS delivery and recipient acknowledgement; correct B13-F1 (an initial https receipt naming
another delivery acknowledged the new one when its digests matched — enforce the existing receipt-id binding consistently, preserve the
received evidence, add normal/stale controls through the delivery and recording path); implement the revocation notice to a
destination; use an authorized isolated synthetic recipient and the demonstration key with TLS and the egress policy retained;
distinguish demonstration from production activation. The specification rows: ES-29-005 ("exports SHALL carry enforceable recipient
obligations, provenance, classification, expiry, and revocation context"), ES-29-002 (recipient revocation), ES-08-004 (a revocable
export with explicit recipient obligations), DP-47-005 (recipient acknowledgement before closure; the request and evidence preserved),
DP-47-002 (the controlled state's receipt), ES-53-004 (network trust for the on-premise and disconnected modes — the declared anchor),
V03-T-047 ("revocation where supported"); the units AU-COM-0060, AU-IDP-0180 (their evidence extended), AU-INF-0356 and AU-DP-0097
(clauses carried). Designed and implemented in one pass on the B13 mechanism (no new agents, no design-check round: the batch extends
B13's ports and executors by their own rules), run on a fresh database, rehearsed on a restored copy and exercised on the demonstration
(§B14.7).

**D1 — the receipt is bound to its delivery at the initial record, as it already was at the acknowledgement.** Codex reproduced
B13-F1 against the candidate: `receiptState` looked at the two digests and `verified` alone, so an endpoint that answered attempt 2
with attempt 1's receipt acknowledged attempt 2, and `record_export_delivery` did not refuse the contradiction. Now a receipt that
names a `delivery_id` other than the delivery it answers is NOT that delivery's receipt: it neither acknowledges nor denies the
exchange. The classifier answers `delivered` for it; the record port (re-declared, every other line as 0073 left it) refuses the
states `acknowledged` and `mismatched` for such a receipt with the acknowledge port's own message ("the receipt names delivery %, not
%"), admits `delivered` WITH the receipt kept on the row (rxd_receipt allows a delivered row to carry one) and writes the answer into
the event `export.delivered` under `received` with `receipt_binding: names_other_delivery` and `receipt_names_delivery` — the
evidence preserved in the ledger even after a later acknowledgement replaces the row's receipt. The exchange stays open for the
recipient's proper receipt through the existing acknowledge route. A delivered row that carries an answer without a delivery id keeps
it likewise (`receipt_binding: unverified`). A receipt without a `delivery_id` is classified by its digests and `verified` as before
(the out-of-band case); no new identity or authentication contract is invented.

**D2 — the destination's TRUST ANCHOR.** `retention.export_destinations.trust_anchor_pem` (nullable; https only — the port and the
table's check refuse one on a station; at most 64 KiB; every block parsed by node's `X509Certificate` at the declaration, stored
normalised, shown in every answer by subject, sha-256 fingerprint and validity — never the PEM twice). `declare_export_destination`
dropped in its 11-argument form and declared with `p_trust_anchor_pem`; the retire-only trigger re-declared with the column among
those that never change. The egress policy gains `trustAnchorPem`; the client passes it as `ca` to the one https request —
`rejectUnauthorized` never disabled, the hostname checked through SNI as before: the anchor NARROWS trust to the declared party (a
customer endpoint on its own PKI — the on-premise and disconnected modes of ES-53-004) and never widens it; a destination without an
anchor is verified against the deployment's store as before. The page's declare form and the destinations table carry it.

**D3 — the egress split, and the one substitution a harness may make.** `deliver(req)` = the scheme and host allowlist, then
`resolveAndVet` (every private, loopback, link-local and reserved address refused, as always), then `deliverPinned(req, address)` —
the transport once the address is settled (the TLS handshake against the store or the anchor with the hostname's identity, the POST,
the headers, the credential on the one hop, the redirect refused, the answer's limits), now exported. `ExportDeliveryService` takes the
transport from a provider `DeliveryEgress` (production: `deliver`). A recipient on this host is unreachable through `deliver` by
design; the harness substitutes the provider's transport with the client's OWN `deliverPinned` on `127.0.0.1` — nothing else — so the
exchange runs on a real socket with the product's code and the address vetting is the one step not exercised on the positive path
(exercised on its own: the same recipient by its `.invalid` name → `dns_failure`, by its loopback literal → `address_not_public`,
nothing reaching it). The delivery request gains `contentType` (`application/x-tar` for a package, `application/json` for a notice).

**D4 — the SYNTHETIC HTTPS RECIPIENT** (`scripts/retention/https-recipient.mjs`; a demonstration stand-in like the station's, not the
product, not a production recipient): a real TLS server (`--self-signed <host>` generates an EC P-256 key and a 2-day certificate
with openssl and prints its path — the anchor the administrator declares; `--cert/--key` for a held certificate; `--plain` behind a
TLS-terminating edge only), bound to `127.0.0.1` unless told otherwise, requiring the bearer named by `--bearer-env` (compared in
constant time, never logged), keeping what it received in memory and under a private store. On a delivery it computes the sha256 of
the body, runs the customer's verifier (`verify-export.mjs --tar` with `--public-key` and `--expect-package-digest`) and answers the
receipt naming THIS delivery, both digests and `verified`; on a notice (`x-eye-notice: revocation`) it destroys the copies of the named
package and answers the receipt with `copies_destroyed`. `POST /_control { mode }` (the same bearer) makes it answer as a wrong
endpoint would — `stale` (the previous delivery's or notice's receipt: B13-F1's control), `wrong-digest`, `deny`, `unverified`,
`refuse`, `not-json`, `error` (500), `redirect` (302), `unauthorized` (401); `GET /_received` lists what it holds and what it destroyed.

**D5 — the REVOCATION NOTICE.** A new append-only ledger `retention.export_revocation_notices` (one row per attempt to tell a
destination that RECEIVED the package — a delivery in state delivered or acknowledged — that it is revoked; the delivery the recipient
holds; the notice as sent and its digest; the receipt and its digest; the state `notified` | `acknowledged` | `mismatched` | `failed`
with the delivery's failure classes; the attempt unique per action and destination; acknowledged once by trigger; RLS as the
deliveries). The ports mirror the delivery's: `begin_revocation_notice` (authority `retention.export.revoke` or the new
`retention.export.notify`; the package REVOKED — an unrevoked one refused "is not revoked"; the destination one that received it — else
"never received the package — nothing to notify"; a retired destination still notified, it holds the package; the action row locked
and the action's delivery lock taken before the attempt is computed), `record_revocation_notice` (under the lock; the binding of D1
on `notice_id`; the events `export.revocation_notified` | `export.revocation_notice_failed` | `export.revocation_acknowledged` |
`export.revocation_mismatched`; `custody.revocation_notified` per exported manifest when the notice reached the destination),
`acknowledge_revocation_notice` (a notified row moves once: acknowledged when the receipt names the package digest with
`copies_destroyed: true`, mismatched otherwise — both sides on the event; a receipt naming another notice refused, the row untouched).
`retention.export_recipients(action)` answers the distinct destinations that received a package with the latest delivery each holds;
`revoke_export` re-declared to return them (the row and the event unchanged). THE NOTICE ITSELF (`ExportDeliveryService.noticeOf`):
the exchange identity of the notice and the delivery it concerns, the package's digests and key, the revocation's instant and reason,
the OBLIGATION ("destroy every copy … and confirm") and the statement of how to answer. THE EXECUTORS: a transfer station receives
`revocation.json` in the action's directory (replaced per attempt, as `delivery.json`; counted as created for the C6 cleanup) and is
read for `revocation-receipt.json`; the product's OWN `package.tar` and `package.sig` there are removed AFTER the commit
(`removeStationPackage`: what was removed, absent, failed — the recipient's copies are the recipient's obligation; `delivery.json`,
`revocation.json` and the receipts stay as the record); an https destination receives ONE JSON POST under the delivery's egress,
credential and anchor rules (the headers `x-eye-notice: revocation`, the notice and delivery ids, the digests), its answer the receipt.
THE ACTS: the revoke act sends the first notice to every recipient destination INSIDE its governed write after the revocation is
recorded (every outcome a row; a failed notice is a fact, the revocation stands; the station paths this write created removed when
the commit fails after them), then removes the vault's bytes and the stations' package files — its answer lists `notices` and
`stations`; `POST …/actions/:id/export/revocation-notices { destinationKey }` (`retention.export.notify` — the deliver rule's
holders, human-gated) sends a further notice (the retry of a failed one, a second attempt after a refusal); `…/revocation-notices/list`;
`…/revocation-notices/:noticeId/collect-receipt` (the station's `revocation-receipt.json`, naming its notice) and `…/acknowledge`
(out of band) under `retention.export.acknowledge`; the export read gains `revocation_notices`. The demonstration station recipient
gains `--revocation [--refuse]`: it reads `revocation.json`, destroys its copies (or keeps them with `--refuse`) and writes
`revocation-receipt.json`. The mapper: `retention notice rejected: …` (403 / 404 / 409 / 422 as the delivery's family). The page:
the notices table with the collect control, a further notice, the out-of-band acknowledgement; the revoke act's answer names the
notices and the stations' removals. Object code `RXN`. The interface register stays 26/24/0 (asserted); L3-I04's binding text gains
the clause.

**B14.6 the harness and the units.** `phase6-retention-b14.test.ts` (5 cases on a fresh database, an isolated vault and station, the
synthetic https recipient spawned with a self-signed certificate for `recipient.b14.invalid` and the bearer bound as `EYE_DST_B14`;
the DeliveryEgress transport substituted as D3 states): S0 the setup (the https destination declared with the recipient's certificate
as its anchor — shown by fingerprint, the credential's value nowhere; a garbage anchor and an anchor on a station refused; a second
destination on the same endpoint without an anchor); H1 THE POSITIVE EXCHANGE — delivered over TLS → ACKNOWLEDGED in one act (the
recipient received the tar with the recorded archive digest, verified it with the public key, answered a receipt naming THIS delivery
and both digests with verified true; the row, `export.acknowledged`, `custody.delivered` per manifest; the egress recorded: 200, TLS
verified, the pinned address, the credential carried on the one hop); H2 THE BINDING AND THE CONTROLS through the route and the record
port — `stale` → DELIVERED not acknowledged, the answer kept on the row and in the event with `receipt_binding
names_other_delivery`, then the proper receipt out of band → acknowledged; `wrong-digest` → mismatched with both sides; `deny` →
mismatched; `unverified` → delivered (`receipt_binding unverified`); `not-json` → failed receipt_invalid; `error` → failed transport
(500); `redirect` → failed egress_refused (redirect_not_followed); `unauthorized` → failed transport (401); the attempts 1..10, every
outcome a row, the credential's value nowhere; H3 THE TRUST AND THE VETTING — the destination without the anchor on the same endpoint
→ failed transport, `tls_failure` named (the self-signed certificate is trusted only where declared); the PRODUCTION egress restored:
by the `.invalid` name → failed transport `dns_failure`, by the loopback literal → failed egress_refused `address_not_public`, nothing
reaching the recipient either way; R1 THE REVOCATION NOTICE — a second export delivered to the station (acknowledged through the
station recipient) and to the https recipient (acknowledged), revoked → the https notice ACKNOWLEDGED in the revoke act (the recipient
destroyed its copy), the station NOTIFIED (`revocation.json` beside `delivery.json`), the product's `package.tar`/`package.sig`
removed from the station after the commit with the record kept, the events and `custody.revocation_notified`; the station recipient
`--revocation` → collected → ACKNOWLEDGED; a further notice attempt 2 → a stale receipt refused by the collect act (it names another
notice) → `--refuse` → MISMATCHED with both sides on the event; the https recipient in mode `error` → failed transport, `stale` →
notified with `receipt_binding names_other_notice` then acknowledged out of band, `normal` → acknowledged; a receipt naming another
notice refused; an unrevoked package refused; a revoked package nobody received → no notices and the notify act refused; the steward
refused by the PDP; an unknown destination 404; the list and the read (a revoked package's read still refused as B11 left it). The
first run 3/5 and the second 4/5 on harness expectations (an `.invalid` name yields `dns_failure`, not the address refusal — both now
asserted; port refusals seen raw in process; the read of a revoked package), the third **5/5**. The suites the changes touch
**71/71 in five files** (B11, B11-closure, B12, B13, B14) on a fresh database; the full integration suite **1021/1021 in 64 files** on a fresh database; the upgrade
proof with 0022–0074 (53 migrations); the unit suite 2156/2156 and the meta suite 9/9; the web typecheck, build and tests. Units: none
moves — B14 completes no whole unit; AU-COM-0060 and AU-IDP-0180 (verified:ci at `3a5a181`) carry the B14 evidence in their prose;
the requirement rows ES-29-005 `missing` → `partial` (the revocation context and the recipient's obligation carried to the recipient
and acknowledged; the hosted run at `3b7c44c` — ci 35070312503, 1021/1021 in 64 files on a fresh database with `phase6-retention-b14`
5/5, C19 35070312431 — bound in the records commit; "enforceable" beyond the notice and the acknowledgement remains — the recipient's copies are outside the product's
custody), ES-29-002 (recipient revocation delivered; the other dimensions stay), ES-53-004 (the declared anchor; the receipt binding),
DP-47-005 and DP-47-002 (the binding; the notice), V03-T-047 (revocation reaching the destination), ES-08-004 (the export half's
recipient obligations; the cross-domain reference stays missing) carry the clauses. The split stays **3,555 = 3,183 open + 338
local + 34 CI**.

**B14.7 the demonstration** — `scripts/phase6/act-b14.mjs` → `evidence/cp6/act-b14.txt` (rehearsed first on a restored copy with its
own vault copy, key, station, recipient and Redis, `evidence/cp6/b14-rehearsal.txt`): the preparation by the operator (the
recipient's bearer generated and bound by reference `EYE_DST_NORDWERK_DEMO` in the local secret handoff — never printed; the
DEMONSTRATION HTTPS RECIPIENT started on this host's loopback interface at `https://127.0.0.1:3443` with a certificate kept under
`.eye-local/https-recipient-demo` and the demonstration public key), `eye_demo` backed up and migrated with 0074, the API restarted by
the runbook's script; then (1) the platform administrator declares `nordwerk-exports-demo` (https; the recipient's hostname and port;
the credential reference bound; the recipient's certificate as the anchor) → readiness `active`, the anchor as recorded the
certificate file's own fingerprint; the B13 production destination stays `blocked-credential`; (2) P. Novák's customer export of the
two hot NORDWERK internal records, approved by H. Bergmann, executed with the demonstration key and verified; (3) THE HTTPS PATH
THROUGH THE PRODUCTION EGRESS — H. Bergmann delivers to `nordwerk-exports-demo` → recorded FAILED transport `dns_failure`: the
credential gate PASSED (B13's `credential_unbound` did not fire), the egress resolved the `.invalid` name and found no address; nothing
left the process (the recipient's inspection route counts nothing) — STATED: the recipient listens on a loopback address, which the
production vetting refuses by design, so the positive exchange with this same recipient is the harness's proof (H1–H3) and a delivery
through the production egress needs a recipient on a public address, the activation step; (4) THE STATION EXCHANGE — delivered,
the demonstration recipient's receipt collected → ACKNOWLEDGED; (5) THE REVOCATION NOTICE — H. Bergmann revokes → the station NOTIFIED
in the same act (`revocation.json`: the notice, the delivery it concerns, the reason, the instant, the obligation), the https-demo
destination never received the package and is not notified, the product's `package.tar` and `package.sig` removed from the station
after the commit with `delivery.json`, `receipt.json` and `revocation.json` kept, `export.revoked`, `export.revocation_notified`,
`custody.revocation_notified` per record; the demonstration recipient in `--revocation` mode answers (the copies already gone) →
collected → ACKNOWLEDGED (`export.revocation_acknowledged`); a further notice by the notify act → attempt 2 → the recipient with
`--refuse` → MISMATCHED with both sides on the event; a notice to the destination that never received the package 409; the download
and a further delivery refused; (6) the state. ALL SCENES HELD. Left on the demonstration: the demonstration https recipient running
on :3443 (its certificate and store under `.eye-local/https-recipient-demo`), the destination `nordwerk-exports-demo`, the station's
record files for the revoked action (its package files gone), the notice ledger rows.

## B15 — the relationship closure in the customer export (graph links) and the streamed archive for larger packages (implemented)

**Migration 0075** (`apps/api/migrations/0075_b15_relationship_closure_and_streamed_archive.sql`, sha256 `b6e0b64a…`, 154
lines — the one rule the database asserts: `verify_action`'s package check re-declared to count the closure's file), on `phase6-b15` (cut
from `phase6-b14` at the B14 records head; PR base `phase6-b14`, retargeted to `main` when #51 merges). The owner's 2026-09-16 directive
named the register's next items — import/graph-link coverage and larger-package support; the import direction (DP-47-001/-005's
re-import, DZ-17's import half, ES-53-004's import packages, DP-47-006's round-trip fixture) is B16, since it reads back what B15
writes. The specification rows: DP-47-003 ("exports preserve identity, temporal truth, provenance, corrections, policy labels, GRAPH
LINKS, and manifest integrity"), DP-47-002 ("object and RELATIONSHIP CLOSURE"), DP-47-006 ("LARGE-SCALE export, relationship closure,
checksum and signature verification"); the units AU-COM-0058 (graph links — its one open clause), AU-DP-0097 (knowledge structures in
bulk). Implemented in one pass on the B11–B14 mechanism; the B11/B13 harness pins of the package's shape updated to the closure's file
and row (stated in each); run on a fresh database, rehearsed on a restored copy and exercised on the demonstration (§B15.7).

**D1 — the relationship closure (graph links).** At the build, after the records' files and before the manifest, the product writes
`links.json` — the knowledge derived from the exported records: THE CLAIMS whose `intelligence.claim_lineage` names an exported EVD
object (the latest canonical version of each — header, payload, content digest — with its lineage rows: the evidence object and digest,
the byte range, the run, the method, the mode), THE EDGES of `graph.edges_current` asserted on those records (every state as recorded —
asserted, superseded, retracted: temporal truth — with the predicate, the validity, the assertion and retraction instants, the claim and
evidence they name, the confidence), THE ENTITIES those edges connect (`graph.entities_current` with their `graph.entity_identifiers`),
and what was EXCLUDED with its gate: a claim whose header classification lies above the export's ceiling (the same redaction gate as the
records), the edges that name it, an entity or a claim version not recorded. The manifest's `package.links` names the file (`file`,
`links_digest` = the file's sha256, `byte_length`, `format eye-customer-export-links/1`, the counts) — INSIDE the package digest chain,
since `package` is covered by `packageDigestOf` (no change to the chain's formula; a /1 package without a links block verifies as
before). The execution ledger records the closure (`retention.export_links`, before the record's row). The archive lists `links.json`
among the manifest's listed files (sorted). The read route lists it; the page shows the counts. THE VERIFIER (`verify-export.mjs`)
gains three checks — the file's sha256 and size are the manifest's, the file is the closure the manifest counts (format, counts, the
same action), and the closure is consistent (every claim's lineage names an exported record; every edge names an included claim,
included entities and an exported record) — and the completeness rule admits the file. The product's verification (`verify_action`,
re-declared in 0075) counts the file: `files_present` = the objects + 1 + 1 when the manifest names a closure, which must be present and
digest to what the manifest names (the observer reports `links_named`, `links_present`, `links_digest_ok`).

**D2 — the streamed archive (larger packages).** `export-archive.ts` gains `ustarStream(entries, mtime)` — the same bytes `buildUstar`
produces (held equal by the harness), assembled one entry at a time from sources opened as the stream reaches them, the sha256
accumulated as the blocks pass, the size known ahead (`archiveSizeOf`), the digest when the stream ends — and `EXPORT_STREAM_MAX_BYTES`
(64 GiB; the in-memory JSON download keeps its 256 MiB). THE BUILD takes the archive digest by streaming over the files as written (no
in-memory file set: the build's memory high-water mark is one object). THE STREAM ROUTE `POST …/actions/:id/export/stream`
(`retention.export.download`, the same event `export.downloaded`): the archive verified by a DISK PASS before the write commits (a digest
other than the recorded one is the integrity refusal before any byte), then served raw as `application/x-tar` with its length, the
digests, the signature and the receipt in headers; a source that changes under the stream ends it with the socket destroyed. THE STATION
WRITE streams `package.tar` to its temp name (content-addressed by streamed digest: an existing file hashed by streaming). THE HTTPS
DELIVERY streams the body with its length (`deliverPinned` takes a stream of known length; `once` pipes it). The vault gains
`openPackageFile` (a size and a reader). THE CUSTOMER'S TOOLS: `verify-export.mjs --tar` SCANS a tar block by block from its file (every
entry hashed as it passes; only the manifest and the links file kept — constant memory); `fetch-export.mjs` (new) streams the archive
from the stream route to a file, compares the streamed sha256 with the announced digest and runs the verifier. The demonstration https
recipient streams a delivery to its store (its ceiling lifted). The JSON download route is unchanged (the browser's Blob is memory-bound;
the page says which route serves a larger package).

**B15.6 the harness and the units.** `phase6-retention-b15.test.ts` (3 cases on a fresh database with the synthetic https recipient
spawned; the B14 substitution stated): L1 THE CLOSURE — on A a REL claim, an ENT claim, a RESTRICTED claim and an edge on the REL claim
between two entities (one with an identifier); the export of A and B → `links.json` named by `package.links` (the digest, the size, the
counts 2/1/2/1), the `retention.export_links` row, the closure's content (the two claims with their lineage rows, the restricted one
excluded with the redaction gate, the edge with its provenance, both entities with the identifier), the product's verification
(`files_present` 4, `links_present`, `links_digest_ok`), the verifier on the directory and on the tar passing the three links checks,
`links.json` tampered on disk → the stream route's integrity refusal and the verifier's digest failure, restored → served and verified;
an export of B alone → an empty closure, listed and verified; S1 THE STREAMED ARCHIVE — the stream route's raw tar with its headers
byte-equal to the in-memory build, `ustarStream` byte-equal to `buildUstar`, `export.downloaded`, a tampered object file → 409 before any
byte, the station delivery's `package.tar` streamed = the digest, the https delivery streamed → acknowledged; S2 A PACKAGE ABOVE THE
IN-MEMORY CEILING — seventeen uploads of 16,000,000 bytes (272 MB) exported by streaming, the JSON download refused with the ceiling
named, the stream route serving the 272 MB tar (hashed as it arrives = the archive digest; the announced length), the verifier scanning
it in constant memory (19 entries), the station delivery streaming it (the file's sha256 the digest; the recipient's receipt collected →
acknowledged), the https delivery streaming it to the recipient (its store holding the tar; acknowledged), the heapUsed delta
between a reading before S2 and one after (an optional GC) under 256 MiB — a DELTA, not a peak (the B15 wording called it the heap's
growth; corrected in B16, which replaces the measurement by a sampled (50 ms) high-water mark of heapUsed + external above the
baseline — external counts the ArrayBuffer backing stores, arrayBuffers reported beside it — asserted under 256 MiB: still a sampled
measurement on the event loop, not peak RSS, synchronous peaks between samples unobserved; the B15 run's result stands as recorded). The first runs on harness fixtures (a column name; the upload contract's 16 MiB per object; a verified action is not verified again;
the response double's auto-destroy), then **3/3**. The six retention harnesses (B11, B11-closure, B12, B13, B14, B15) **74/74** on a fresh
database; the full integration suite **1024/1024 in 65 files** on a fresh database; the upgrade proof with 0022–0075 (54 migrations); the unit suite; the web typecheck,
build and tests. The hosted run at `33882a3` — ci 35074350184 (1024/1024 in 65 files on a fresh
database with `phase6-retention-b15` 3/3), C19 35074350249 — bound in the records commit, no unit promoted by it (Codex's B15-F1,
below, qualifies the closure until B16). Units: AU-COM-0058 `open` → `verified:local` (its one open clause — graph links — delivered: the closure packaged, inside
the chain, verified offline — QUALIFIED by Codex's B15-F1: the closure carries each claim's latest version only, an edge may reference an
earlier one; corrected and re-bound in B16); AU-DP-0097 carries the clause (knowledge structures — the derived claims, edges and entities — retrieved
with the records; decisions, audit material and configuration remain); the requirement rows DP-47-003 `partial` → `implemented`
(graph links and manifest integrity with the closure inside the chain; passed:harness, branch-only), DP-47-002 and DP-47-006 carry the
clauses (the relationship closure and large-scale export delivered; encryption, the round-trip fixture — the import — and customer
acceptance remain).

**B15.7 the demonstration** — `scripts/phase6/act-b15.mjs` → `evidence/cp6/act-b15.txt` (rehearsed first on a restored copy with its
own vault copy, key and station, `evidence/cp6/b15-rehearsal.txt`): `eye_demo` backed up and migrated with 0075, the API restarted by
the runbook's script; then (1) P. Novák's export of the NORDWERK internal records that carry derived knowledge, approved by H. Bergmann,
executed and verified — `links.json` on the host named by the manifest's `package.links` inside the chain, the closure read (the claims
by type with their lineage rows, the edges by predicate, the entities with their identifiers, the exclusions), its consistency, the
`retention.export_links` row, the product's verification counting it, the read route listing it; (2) the customer's verifier on the
directory passing the links checks, the customer's fetch tool streaming the archive from the STREAM route through the real HTTP path
(the announced length and digest, the streamed sha256 the recorded one, the verifier on the tar), `export.downloaded`, the JSON download
still serving the small package; (3) the streamed delivery to the transfer station, the demonstration recipient's receipt collected →
ACKNOWLEDGED; (4) the state. STATED: a package above the in-memory ceiling is the harness's proof — no synthetic bulk is added to
NORDWERK.

## B16 — the governed import and the NORDWERK export → import → re-export round trip; the versioned closure (Codex B15-F1); held recipients (Codex B14-F1) (implemented)

**Migration 0076** (`apps/api/migrations/0076_b16_governed_import_versioned_closure_and_held_recipients.sql`, sha256 `a830305d…`,
1,236 lines), on `phase6-b16` (cut from `main` at `88057d2`, after #51 and #52 merged; PR base `main`). The owner's 2026-09-16 directive:
"implement governed import and demonstrate actual NORDWERK export → import → re-export effects under the existing specifications",
with two fixes in the same batch — B14-F1 (a revocation must reach recipients known to hold the package even when their receipt is
mismatched) and B15-F1 (export and validate the exact claim versions referenced by graph edges, preserving those references through
import) — the affected register claims and the memory-measurement wording corrected here, prior evidence preserved. The specification
rows: DP-47-001 (import and exchange paths), DP-47-002 (the closure reconciled on both sides), DP-47-003 (the boundary, versioned),
DP-47-005 (deny or quarantine with the request and evidence preserved), DP-47-006 (round-trip fixtures), DZ-17 (the exchange staging
tier's import half), DPD-19 (re-import), ES-53-004 (signed import packages with policy, provenance, malware, integrity and receipt
checks), ES-08-004 (cross-domain sharing with recipient obligations); the units AU-COM-0056/-0058/-0060/-0062/-0007, AU-DP-0097,
AU-IDP-0227. Designed by seven readers, one designer and two checkers (ten blocking findings folded into the design before a line was
written: the write action's rationale, `authority_and_rights` inside the contract, the settle-once constraints, station symlinks, a
stuck `admitting`, the unsigned expiry, the quarantine residue's lifecycle, the demonstration's scene order); implemented by six
implementers on disjoint files and one compile pass; integrated, run on a fresh database, rehearsed on a restored copy and exercised on
the demonstration (§B16.7).

**D1 — the exchange partner (0076 §3).** `retention.exchange_partners`: a partner IS a public key — `partner_key` (the destination
key's spelling), `party`, `purpose`, the Ed25519 SPKI PEM and the `key_id` the product derives from it (`ed25519:` + the first 16 hex
of sha256(SPKI DER) — the same derivation as the signing key's declaration), and the INTAKE SOURCE CONTRACT the imported manifests are
recorded under (an upload contract of the importing domain, active, rights confirmed; its ceiling is the import's policy gate).
Declared and retired through the ports `declare_exchange_partner` / `retire_exchange_partner` (the administrators; one active row per
key and per partner key in a domain; append-only, retirement the one change), the routes `POST …/retention/partners/declare`, `…/list`,
`…/:id/retire` under `retention.partner.declare` / `.retire`. A package whose signing key no active partner of the domain holds is
QUARANTINED with the words to act on ("declare the partner and open the import again").

**D2 — the import ledger and the intake (0076 §4; `import.service.ts`, `import-package.ts`).** `retention.imports` (the states
`quarantined → verified → approved → admitting → admitted | withdrawn`, transitions-only; one LIVE import per package digest and domain),
`retention.import_items` (one row per record, claim version, entity, identifier system, identifier, edge and origin exclusion — the origin
reference, what was staged, what is planned, the disposition `admitted | reused | refused | excluded` with its gate, settled once) and
`retention.import_events` (append-only: opened, quarantined, verified, approved, admission_started, batch_admitted, admitted, finalized,
withdrawn, evidence_tombstoned, quarantine_swept). THE INTAKE reads the archive exactly as the customer's verifier reads a tar —
`scanUstarStream` in `export-archive.ts`, the stream scanner by the verifier's rules (512-byte headers, the magic, the checksum
unsigned or signed, the size in octal, the prefix, the typeflag; a malformed archive is one refusal at the block where the rule broke,
the whole source digested in a second pass so the row names the bytes that arrived) — from an INLINE archive (base64 inside the
governed payload; bounded over the real listener by the JSON body limit, stated) or from a TRANSFER STATION the importing domain has
declared (the file opened with `lstat`/`realpath`/`O_NOFOLLOW` — a symlink or a non-regular file refused; `delivery.json` beside it is
the sender's UNSIGNED exchange statement, `revocation.json` the origin's notice, both recorded, never trusted). `manifest.json` must
come first and is ALWAYS stored (it is the request); the manifest's own checks decide whether anything further is stored (C5: nothing
of a package no partner signed — the rest DRAINED, every entry's digest and size recorded); each record read whole under the vault's
blob ceiling, stored in the QUARANTINE tier (content-addressed), released before the next; the closure kept under 64 MiB; a record above
the ceiling hashed and not stored (refused at admission, gate `oversize`). THE SIXTEEN ORDERED CHECKS (`verifyStaged`; a name is stable;
`ok: null` is a note): archive; manifest; origin (not this domain); integrity (every listed file present with the sha256 and size the
manifest names); re-import (every payload binds its bytes and its 43-field header and payload recompute to its canonical digest);
completeness; chain (sha256(JCS(objects)) = objects_digest, the package digest recomputes, bound_to restates the authorization);
signature scheme (key-signed packages only — a /1 chain-only package is refused); PARTNER; signature (Ed25519 over the recomputed digest
against the partner's key); links file (present, the digest and size, the closure the manifest counts); links PAIRS (below, D3); policy
(the intake contract active with confirmed rights; its ceiling admits the records and the claim versions — one above it is excluded at
admission, gate `ceiling`, with the edges that name it refused `dependency`); duplicate (no live import of the package in the domain);
revocation (decided on the origin's own export ledger when the origin is THIS installation — `import_origin_state`, known only when the
presented digest is the recorded one; for a foreign origin a NOTE on the unsigned statement, never a pass on unsigned data); origin
exclusions (recorded, not admitted). Every imported record passes `inspectContent` (the malware and content controls of the intake path)
before admission. THE APPROVAL (`approve_import`): on the package digest restated, with a rationale, by a principal OTHER than the
opener (the port refuses the opener; the PDP refuses the plain steward) — `retention.import.approve`. THE ADMISSION (`admitImport`;
`retention.import.admit`, a canonical write action of the pipeline): `begin_import_admission` fences the import (`admitting`; a
failed batch leaves it `admitting` with its staged items and a later admit call resumes it from them, the batch's candidates removed by name first), then in dependency order — records (`record_imported_manifest`: a manifest of the
importing domain under the intake contract, the bytes moved from quarantine to the evidence tier, `custody.imported`), claim versions
(`objects.admit_version` under the write action with the SAME version numbers, never renumbered, `record_imported_lineage` for each
version's rows), entities and identifier systems and identifiers (`record_imported_entity/_identifier_system/_identifier`; an entity
already known in the domain by an authoritative identifier REUSED, its identifiers extended), edges (`record_imported_edge` on the
mapped claim PAIR — the version equal — and the mapped ends; a superseded edge whose successor is not carried refused `dependency`) —
each item marked (`mark_import_item`), each batch an event, `finish_import_admission` with the counts, the admitted records' quarantine
copies tombstoned. EVERY imported object gets a NEW id (`remapUuids`: one new UUIDv7 per origin id, the map recorded on the items) with
the origin identity in `payload.imported_from` (`eye-import-provenance/1`: the import, the partner, the origin package — action, digest,
key — the origin object id and version, its canonical digest, the original 43-field header and payload): identity is RECOVERABLE
through `imported_from` and the item map (DP-47-003), and the importing domain never shares mutable state with the origin. THE
WITHDRAWAL (`withdraw_import`; `retention.import.withdraw`): a quarantined or verified import withdrawn with a reason, the ledger kept,
the quarantine copies tombstoned (`import.evidence_tombstoned`); a quarantined import not withdrawn is swept by the sweeper after the
quarantine TTL (`import_quarantine_expired` / `mark_import_quarantine_swept`). THE RECEIPT: the import's own receipt (`receiptOf`) — the
importer's record of the exchange (verified, the package digest, the recipient `import:<tenant>/<domain>`, the verifier "the product
(retention.import; the eye-customer-export/2 checks in process)"). The routes `POST …/retention/imports/open`, `…/:id/approve`,
`…/:id/admit`, `…/:id/withdraw`, `…/:id/get`, `…/list`; the mapper's families `retention import rejected` and `exchange partner rejected`;
the page's "Exchange partners" and "Imports" cards (open from a file or the station; the checks, items and events; approve with the
digest restated; admit; withdraw). STATED: imported knowledge is not published to the domain's subscribers (no ObservationRecorded /
GraphChanged for imported objects — the next batch); imported claims are not reviewable through the review path and imported evidence
is not re-extracted (the lineage keeps the origin's run and method ids); the origin's revocation of an ADMITTED package is not
propagated into the importing domain.

**D3 — the versioned closure (Codex B15-F1; `linksOf` → `eye-customer-export-links/2`).** The closure now lists each EXACT claim
version an edge or a lineage row names — a claim keyed by `(object_id, object_version)` with the header, payload and lineage rows OF
THAT VERSION — so an edge asserted on C@3 travels with C@3 even after C@4 exists, and C@4 travels beside it when its lineage names an
exported record; a required version above the ceiling is EXCLUDED with its gate and the edges that name it are excluded `dependency`
(never rebased onto another version). The manifest's `package.links` names the format `/2` with the counts; the chain's formula is
unchanged. THE PAIR CHECK — the same rule in the customer's verifier (`verify-export.mjs`, format-aware: a `/1` closure passes by id and
says its versions are unvalidated) and in the product's import (check 12): every claim version's lineage names an exported record by
(object_id, bytes digest); every edge names an included claim by (object_id, object_version), included entities and an exported record —
an edge naming a version the closure does not carry FAILS, "never rebased"; a closure rebased by hand fails the chain and the signature.
Through import the pair is preserved: the edge lands on `(C', 3)` under the new id with version 3.

**D4 — held recipients (Codex B14-F1; 0076 §1).** `retention.export_delivery_held(state, failure_class, receipt)` classifies each
delivery: `confirmed` (acknowledged, or MISMATCHED — a receipt naming the delivery proves the package reached the recipient whatever
it says), `possible` (delivered without a receipt; a transport failure AFTER the body was sent — `request_sent` recorded by the egress,
including a redirect refused after the body), NULL (nothing is known to have reached it: a credential unbound, the egress refused before
connecting, the name unresolved, the TLS handshake failed). `export_recipients` re-declared on it, so `revoke_export` NOTIFIES every
destination whose delivery is `confirmed` or `possible` — a mismatched station or https recipient included — and the notify route
refuses a destination nothing reached ("nothing is known to have reached it"). The page's notices table shows `held`.

**D5 — the signing-key binding.** The build refuses `signing_key_mismatch` (before the state moves; paused for retry, no attempt
counted, nothing built) when the reference bound in the process derives a key other than the tenant's declared active key — a package
signed by a key the declaration does not record would verify against neither the recorded public key nor a partner's declaration of it
(found by the rehearsal, which binds its own key on a copy whose row is the demonstration's; the rehearsal now swaps the copy's row by
SQL). A closure DRAINED after the manifest checks failed is reported "not checked … drained", not "does not parse" (the same rehearsal).

**B16.6 the harness, the tools and the units.** `phase6-retention-b16.test.ts` (6 cases on a fresh database — a mirror domain D2 created
through the tenancy route with its own steward, administrator, registrar and manager, the intake source contract, the station and the
synthetic https recipient; KEY1 the tenant's key bound by reference, KEY2 a key no partner holds; the B14 substitution stated): V1 THE
VERSIONED CLOSURE (C@1 with an edge, then C@2 → `links.json` /2 carries both, the edge on {C,1}; the verifier's pair check passes; the
B15-F1 counterexample — C@1 removed, the edge still on version 1, re-signed — FAILS "never rebased"; the file altered in place → the
stream route's links-digest refusal; a restricted CR@1 with its edge and an internal CR@2 → CR@1 excluded with the edge excluded
`dependency`, CR@2 included; a hand-built /1 closure passes by id and says versions are unvalidated); P1 THE PARTNER (declared with the
harness key's PEM → the key id the signing derives; the same key again, the same partner key under another key, an inactive / not-upload
/ rights-withdrawn / absent intake contract, a malformed PEM — each refused with the port's words; retired → listed retired, its key no
longer resolves a package; declared again → it does; the steward may not declare; THE BINDING re-bound to KEY2's private half → the build
refused `signing_key_mismatch` naming both key ids, paused infrastructure/retry with 0 attempts and nothing built, bound back → the same
action re-resolves and builds); I1 THE ROUND TRIP (E1 of A and B — the versioned closure, an ENT claim with an authoritative identifier,
the edge — streamed through the real route, opened inline in D2 with the exchange → VERIFIED; the opener's approval refused by the port
and the plain steward's by the PDP; a wrong digest refused; approved; the approver's admission refused; admitted → NEW ids with the
versions preserved, `imported_from` complete, the manifests under the intake contract, `custody.imported`, the bytes downloadable in D2
with `custody.retrieved` naming the intake, the lineage rows, the edge on (C',1), the entities, the identifier system and the identifier,
no projection drift, the quarantine copies tombstoned, the receipt; D2's re-export E2 → `compare-round-trip.mjs` ROUND TRIP OK); I2 THE
REFUSALS WITH THE EVIDENCE PRESERVED (a key no partner holds → quarantined, the manifest kept, the records drained, the closure reported
drained, then the partner declared → verified; a flipped .bin; `links.json` tampered; a /1 package; a confidential record under the
internal intake → excluded `ceiling` at admission; NEVER REBASED at verification and at admission; the same package again → duplicate;
the origin package revoked, and an origin unknown here → a note; the station intake with `delivery.json`, a `revocation.json` at the
station, a symlinked `package.tar`, a header the port refuses; the withdrawal — the ledger kept, the copies tombstoned — and admit/approve
refused on withdrawn and quarantined imports); I3 A LARGE PACKAGE BY THE STATION (seventeen uploads of 16,000,000 bytes exported above
the in-memory ceiling, delivered to the station, imported from the station entry by entry, approved and admitted; the memory SAMPLED
every 50 ms across the open and the admission: 182.1 MiB above an 89.8 MiB baseline at the peak — heapUsed 86.7, external 185.2 with
arrayBuffers 69.5 beside it, 49 samples over 2.4 s; an earlier run 172.5 MiB — GC-timing-dependent, under 256 MiB in each, a sampled high-water mark of heapUsed + external, not RSS); R1 HELD
RECIPIENTS (one package to five https destinations on the recipient: wrong-digest → MISMATCHED held confirmed; an unbound credential →
nothing left; a 500 after the body → held possible; a redirect refused after the body → `request_sent`, held possible; the production
egress → dns_failure, nothing sent; the revoke act notifies the three held, acknowledged, the mismatched delivery's copy destroyed and its
receipt kept, the unbound and the unresolved absent and the notify route refusing them; a second package mismatched and revoked while the
recipient answers 500 → the notice failed transport, then the notify route → acknowledged). The unit suite gains
`test/unit/retention/import-package.test.ts` (28: the checks, the plan, the remap, the imported header and payload). The first runs on
harness fixtures (the refusal text after rights withdrawn, the origin block's shape, the foreign fixture's closure naming its action, the
sampler's sum — arrayBuffers had been added twice — the actions view's name), then **6/6**. The seven retention harnesses (B11,
B11-closure, B12, B13, B14, B15, B16) **80/80** on a fresh database (the B15 L1 pins moved to the /2 closure with `object_version`; the
B15 S2 measurement replaced by the sampled high-water mark); the full integration suite **1030/1030 in 66 files** on a fresh database
(twice: before and after the D5 corrections); the upgrade proof with 0022–0076 (55 migrations; 35 registry rows); the unit suite
**2184/2184** and the meta suite 9/9; the web typecheck, build and tests. The hosted run at `f4b2345` — ci 35097020135 (1030/1030 in 66
files on a fresh database with `phase6-retention-b16` 6/6; the upgrade proof +55 rows, 76 files; C18 612/612 + 44), C19 35097020209 —
bound in the records commit, no unit promoted by it (the merge of PR #53 awaits the owner's word). THE CUSTOMER'S TOOLS: `scripts/retention/import-package.mjs`
(the customer's import tool over the real route: inline under the body limit, or by the station); `compare-round-trip.mjs` (the origin
package, the re-export and the import's record: every record carried under its mapped id with the same version and bytes, the header
preserved field by field, `imported_from` recovering each origin identity, every claim version with the SAME version and its lineage,
every edge on its mapped pair, every entity with its identifiers — or accounted for by the import — ROUND TRIP OK). Units and rows:
AU-COM-0058 stays `verified:local` with the B15-F1 qualification LIFTED (re-bound to V1 and I1); DP-47-003 stays `implemented`, the same
clause; DP-47-005, DP-47-006 and DZ-17 `partial` → `implemented` (passed:harness, branch-only); ES-08-004 `missing` → `partial` (the
export half with held recipients and the governed import between two domains; the cross-domain reference and the propagation of a
revocation into the importing domain remain); DP-47-001, DP-47-002, ES-53-004, DPD-19, AU-COM-0056, AU-COM-0060 (stays `verified:ci`),
AU-COM-0007, AU-COM-0062, AU-DP-0097, AU-IDP-0227 carry the B16 clause; DP-20-006, DQM-039, DAT-SV-08, AU-COM-0005, AU-COM-0182 and
AU-INF-0213 are left as they stand (their remaining_work predates the exchange; the hardening pass refreshes them — no broad refresh
here). The unit split stays **3,555 = 3,182 open + 339 local + 34 CI** (no unit promoted by a local run). The interface register's
L3-I04 binding gains the B16 clause; the (26, 24, 0) assertion re-run after 0076.

**B16.7 the demonstration** — `scripts/phase6/act-b16.mjs` → `evidence/cp6/act-b16.txt` (rehearsed first on a restored copy with its
own vault copy, key, station and Redis, `evidence/cp6/b16-rehearsal.txt`): `eye_demo` backed up and migrated with 0076, the API
restarted by the runbook's script; then (1) THE VERSIONED RELATIONSHIP — the REL claim "NORDWERK ANTRIEBSTECHNIK GmbH procures
SYN-PART-BRG" with an asserted edge on C@3 challenged and corrected to C@4 by the administrator (its own lineage row; on the
demonstration the B6 relationships consumer asserted a successor edge on C@4 and superseded the edge on C@3 — an edge is never
reinterpreted); (2) THE EXPORT E1 by P. Novák of the four NORDWERK internal records that carry the knowledge, approved by H. Bergmann,
executed and verified — `links.json` /2 with 17 claim versions of 14 claims, 8 edges and 7 entities, C listed as the EXACT versions
C@1..C@4 with the edges on the versions they rest on; the verifier's pair check PASSES; the counterexample (C@4 alone while the edge
names C@3) FAILS the pair check; the rebase FAILS the chain and the signature; delivered to the station and acknowledged through the
demonstration recipient's receipt; (3) THE DESTINATION DOMAIN — the mirror domain created, M. Keller (retention_steward) and U. Fischer
(collection_manager) with sessions of their own, the intake source contract `nordwerk-exchange-intake@1`, the station declared in the
mirror, the import opened BEFORE any partner → QUARANTINED with the request kept and the words to act on, the partner `nordwerk-origin`
declared with the origin's public key; (4) THE EXCHANGE — M. Keller opens the import from the station (`delivery.json` the exchange) →
VERIFIED, the sixteen checks printed; the opener's approval refused; H. Bergmann approves on the digest; the approver's admission
refused; M. Keller admits → ADMITTED: 4 records, 17 claim versions, 7 entities and 8 edges under NEW ids with C@1..C@4 → C'@1..C'@4 under
ONE new id, the events, the receipt, `custody.imported`, the imported record downloaded through the mirror's evidence route with the
origin's bytes digest, the mirror's graph showing the edges on C' at their versions, the seven entities; (5) THE RE-EXPORT E2 from the
mirror by M. Keller, approved by H. Bergmann — the customer's round-trip tool: ROUND TRIP OK, 4 records, 17 claim versions, 8 edges, 7
entities, identities recoverable; E2's closure carrying C'@1..C'@4 with the edges on the same versions; `payload.imported_from` on E2's
records recovering the origin identities; (6) HELD RECIPIENTS — E3 delivered to the station, the recipient answering with a WRONG
DIGEST → MISMATCHED (the receipt kept), a delivery to the production destination `nordwerk-exports` → `credential_unbound` before any
egress, the revocation notifying the station (held: confirmed) and not the production destination (absent: nothing reached it; the notify
route → 409), the station's answer collected → ACKNOWLEDGED, the mismatched receipt still on its delivery row; (7) the state and the
stated limits: the inline intake over the real listener is bounded by the JSON body limit (the act imported from the station); the
positive https exchange remains the harness's; the round trip is within one installation — a foreign installation is the activation
step. ALL SCENES HELD (40 checks).

## B17 — imported knowledge published to the importing domain's subscribers; the origin's revocation propagated into the importing domain; imported claims not reviewable (implemented)

**Migration 0077** (`apps/api/migrations/0077_b17_import_publication_and_revocation_propagation.sql`, sha256 `0e8dd7f5…`, 893 lines),
on `phase6-b17` (cut from the B16 records head `1d6eea3`; PR base `phase6-b16`, retargeted to `main` when #53 merges). The register's
next item after B16 — the two omissions B16 stated (`import.service.ts` header: "no ObservationRecorded / GraphChanged is published for
imported knowledge (subscribers do not learn of it)"; "the origin's later revocation of an admitted package is the partner's notice,
not a propagation") — and one gate the readers found (an imported claim version could be challenged through the review path, which
would have let the relationships consumer re-derive a native edge over the origin's temporal truth). The specification rows: ES-08-004
(cross-domain sharing revocable with recipient obligations), ES-29-005 (enforceable recipient obligations), DP-47-005 (revocation on
the inbound side), ES-53-004 (signed packages — and now notices), AU-MEM-0030 (graph changes publish), ES-19-001 (the event in the
change's transaction), AU-MEM-0060 (a hold takes precedence), L1-I03 (ObservationRecorded), L3-I04 (the retention contract). Designed
by five readers, one designer and two checkers (fifteen corrections folded before a line was written — among them: the reuse lookup
blind to revocations, the act's scenes unreachable on a demonstration whose mirror already held the knowledge, the event built from an
attempt's memory rather than the ledger, the notice signed by a rotated key the importer would not hold, the twin citing a REL claim,
the upgrade proof's count); implemented by six implementers on disjoint files and one compile pass (which changed nothing); integrated,
run on a fresh database, rehearsed on a restored copy and exercised on the demonstration (§B17.7).

**D1 — imported knowledge published.** The import's every governed write (`write()` → `writerOf`) now returns the handler's
`outboxEvents` through the pipeline (the outbox stays pipeline-private). Each RECORD batch publishes one `ObservationRecorded` per
admitted record — the lifecycle's shape with `obs_object_id: null`, `run_id: null`, `acquisition_mode: 'import'`, the intake contract's
`source_id`/`contract_version`/`authority_class` (`begin_import_admission` re-declared to return it), the bytes digest and
`imported: { import_id, partner_key, origin }` — L1-I03's announcement of an immutable evidence reference (published, not consumed;
L1-I03 stays partial). The GRAPH write — the transaction that moves the import to `admitted` — publishes ONE `GraphChanged` of the new
kind `import.admitted` (`importAdmittedEvent`, a pure builder): the entities the import CREATED (`role: created`) and REUSED (`role:
reached`, their current lifecycle state — a retired holder of an authoritative identifier is reused as it is), the imported edges as
recorded, the admitted claim ids and record ids, `objects.walked = false` (nothing of the domain rests on ids minted a moment ago),
`cause.action = 'retention.import.admit'`, and an `import` block (`import_id`, `partner_key`, `origin`, `counts` with `reused`); every
list cut at `IMPORT_EVENT_LIST_MAX` (200) with `objects.truncated` said (the item map is the full record; reused ids are counted, not
announced). `GRAPH_CHANGE_KINDS` gains `import.admitted` and `import.revoked`; `GraphChangedPayload.import?`; `RetentionReads` gains
`subscriptionsMatching` and the walker's reads (`WalkReads`/`ChangeReads` are structural picks of `GraphReads`, so the retention
capability carries the SAME walk and builder — never a second walker). What the seven consumers do with `import.admitted`: twins,
forecasts, scenarios and decisions select by id — empty at admission (applied, no items); retrieval runs ONE projection rebuild check
on the imported rows; memory-mappings and relationships ignore the kind. `CHANGED_ROLES` gains `retired` (D2 below).

**D2 — the origin's revocation propagated into the importing domain (0077 §1, §5–§7).** THE IMPORTING DOMAIN IS A RECIPIENT. When
the origin revokes a package that a domain of the SAME TENANT on this installation has ADMITTED, the revoke act (a) finds the admitted
imports of the package across the tenant's domains (`retention.imports_of_package`, a definer read under `retention.export.revoke`;
`revoke_export` answers `importers`), (b) records ONE importer notice per import on the origin's ledger — `retention.export_revocation_notices`
gains `importer jsonb {tenant_id, domain_id, import_id}` with `destination_id` and `delivery_id` nullable under `rxn_recipient`
(exactly one of destination / importer); the notice JSON is the same SIGNED notice with `recipient: import:<tenant>/<domain>/<import_id>`
and `delivery: { import_id, state, held: 'confirmed' }` (an admitted copy is proven); the origin's `export.revocation_notified` and
`custody.revocation_notified` rows as for a destination, and — the one cross-domain write of the batch — the importing ledger's own
`import.revocation_notified` (the notice IS the importer's fact) — and (c) AFTER the origin's commit, the SAME acting principal executes
`retention.import.revoke` in each importing domain with a DOMAIN envelope of that domain (a TENANT binding of the tenant permits any
DOMAIN route of the tenant — the B16 approve-in-D2 idiom; a `domain_admin` of the origin domain alone is refused there: the answer says
`pending` with the reason and the importing domain's steward completes it by the route). THE REVOCATION (`ImportService.revokeImport`,
`retention.import.revoke` — the tenant's retention authority and administrator, the importing domain's steward and administrator, the
platform administrator; human-gated, C2; a canonical write action for the withdrawn versions): W0 begins (`begin_import_revocation`:
the source verified and recorded — `origin` (this installation's own record of the origin package, revoked under the import's digest) or
`station` (the origin's SIGNED notice, verified before the call); the state `admitted → revoking` with the attempt counted; a `revoked`
import answers `retried`), W1 ONE graph write in reversed dependency order — the edges this import CREATED retracted (`graph.edges_current`
→ `retracted`, `edge_events` `edge.retracted` with `details.imported` and `details.revoked`: the vocabulary the rebuild derives from), the
entities it CREATED retired (`entity.retired`; their identifiers STAY as facts of a retired entity), a reused edge/entity/identifier/system
`left` — W2… claim batches of ≤ 32 object ids: ONE withdrawn version per imported object id (the corrections path's field rules:
`lifecycle_state`/`truth_state` `withdrawn`, `correction_of`/`supersedes` the prior, `withdrawal_reason` naming the origin's revocation,
`method_ref retention.import.revoke@1.0.0`, `evidence_refs` += `revocation-notice:<id>`, the payload — `imported_from` included — verbatim)
through `objects.admit_version`, with the lineage rows COPIED onto the withdrawn version (`record_import_withdrawal_lineage`: the pair rule
holds for it) — W3… record batches: the withdrawn version, `observation.tombstone_blob` (its authority list gains `retention.import.revoke`)
and `custody.tombstoned`; a LEGAL HOLD (`P0R01`) refuses the WHOLE record step (rolled back to the item's savepoint — the hold keeps the
record whole), outcome `refused` with the hold named — Wf the finish (`finish_import_revocation`: every item settled; no refusal → `revoked`
with the counts; a refusal → the state stays `revoking` and `import.revocation_held` names the held items — the steward retries when the
hold is lifted) and, in the same transaction, ONE `GraphChanged/import.revoked` built from the ITEM MAP (every item destroyed since the last
finish event — a resumed attempt announces what a crashed one destroyed): the retired entities (`role: retired` — a CHANGED identity, so a
twin bounded by one re-verifies), the retracted edges, the withdrawn claims and records, and THE WALK (the same `ImpactService.walk`,
seeded per tombstoned record by `evidence_correction` and per withdrawn claim not reached that way by `claim_withdrawal`, the first 32 seeds
walked, the rest listed unwalked with `truncated`) — so the twins citing them go unverified, forecasts and scenarios are marked, decisions
note the invalidated input, memory-mappings (a new branch for the kind: the identifiers of the retired entities and the domain's own
asserted edges with a retired end are proposed to a person; its `METHOD_REF` changed → a new consumer digest → the live subscription is
revoked and registered anew by the register idiom) and retrieval verifies the projections — then after the commit the bytes
(`removeBytes`, both roots, the staged copies) and, for a station source, `revocation-receipt.json` beside the notice — and Wr the RECEIPT
write (`import.copies_destroyed` / `import.copies_refused`; `answer_import_notice` acknowledges the origin's notice, or records it
`mismatched` with `copies_destroyed: false` and the refused manifests or the `held_by` imports named; a notice already answered is answered
by a NEW attempt row). A COPY ANOTHER LIVE IMPORT HOLDS (a reused item of an admitted import) is `left` with `held_by` — the honest receipt
says `copies_destroyed: false`; it falls with that import's revocation. A DESTROYED COPY IS NEVER REUSED: the reuse lookup excludes revoked
items (two additive live indexes); a later package carrying the same objects admits them afresh under new ids; the same package (its
digest) stays refused as a duplicate. Every revocation port takes a per-import advisory lock (concurrent attempts serialise; an item
another attempt settled is `skipped`). The RETRY of a `revoked` import removes any bytes still present and answers an outstanding notice.
The routes `POST …/retention/imports/:id/revoke { source }`, `…/export/revoke` answering `importers[]` (the destination notices stay under
`notices[]`), `…/export/revocation-notices { importer }`, the export read's `importers`; the mapper's families extended; the page's
"Importers" table, the import detail's "Revocation" block and "Revoke" action.

**D3 — the signed notice (`eye-revocation-notice/1`).** From B17 on every revocation notice carries `signature: { scheme, key_id,
algorithm: 'Ed25519', signature }` — Ed25519 over the ASCII hex of `sha256(JCS(notice without signature/unsigned))` — by the PACKAGE's
signing key (retired since or not: the key the recipient holds) when its reference is bound here AND derives that key (a binding that holds
another private key counts as unbound — the build's `signing_key_mismatch` rule); else by the tenant's ACTIVE key with `signed_with:
'active_key'` and `package_key_id` INSIDE the signed bytes; else `signature: null` with `unsigned: <why>`. The importer verifies a station
notice against the import's PARTNER first and, on a key mismatch, against another partner of the domain with the SAME `party` (the same
origin organisation under a rotated key, declared by the importing domain's administrators; recorded as `rotated_from`); a notice signed
by another party's key, unsigned, malformed or naming another package is REFUSED with nothing destroyed (`import.revocation_refused`
recorded; 409). The demonstration recipient (`transfer-station-recipient.mjs --revocation --public-key`) VERIFIES the signature before
it obeys (an unverifiable notice: the copies kept, `copies_destroyed: false`, the reason in the receipt). Check 14 at the open says
whether a station `revocation.json` was signed by the partner (verified), unsigned (the digest match alone) or not verifiable.

**D4 — the review gate (feature 3).** `intelligence.request_review` refuses a claim whose latest version's payload carries
`imported_from` — "an imported claim version is corrected at its origin and re-imported; it is not reviewed here" (409). The statement B16
made is now a gate (a correction here would have let the relationships consumer supersede the imported edge with a native derivation
carrying the origin's run and method).

**B17.6 the harness, the tools and the units.** `phase6-retention-b17.test.ts` (5 cases on a fresh database with `EYE_SCHEDULER_ENABLED`
so the outbox publisher and the mirror's subscription worker run in process; a mirror domain D2 with its principals, intake contract,
station and THREE partners — the origin's key and a foreign party's key with its rotated successor; the seven subscriptions registered in
D2; no https egress, no substitution): S1 IMPORT.ADMITTED — E1 (A, B; the REL claim C@1 with its edge; the entities and the identifier)
imported inline → exactly ONE `import.admitted` from the graph write's transaction (the same correlation as `import.admitted`), the payload
pinned key by key (created identities, the edge, the claims and records, the `import` block, `walked: false`, the six live subscriptions),
the two `ObservationRecorded` rows (`acquisition_mode: import`, `run_id: null`, the intake contract's class) published BEFORE it in the
tenant partition, the six deliveries applied (the four selectors empty with 0 attempts, retrieval `projections.verified` on the imported
rows, memory-mappings empty), the review request on the imported claim refused (a native claim still challengeable), and 300 entities /
150 edges → `identities` 200, `edges` 150, `truncated: true`, six deliveries applied, the rebuild without drift; S2 IMPORT.REVOKED — the
mirror builds on the import (a twin bounded by the imported entity citing the imported record; an assumption, a decision, a forecast, a
scenario and a package resting on it), the origin's authority REVOKES E1 → the answer names the importer (held confirmed) with its SIGNED
notice (verified against KEY1's PEM), the destruction executed by the same act: the edge retracted, both entities retired (the identifier
kept), the claim and both records withdrawn (version 2 each, the lineage rows equal for versions 1 and 2, `imported_from` kept), the
tombstones and `custody.tombstoned`, the bytes gone, the import `revoked` with the counts, the receipt `acknowledged` on the origin's
ledger (`kind: importer`), ONE `import.revoked` with the walk (assumptions, decisions, forecasts, scenarios reached; the dependencies) and
the six deliveries: the twin `version.unverified`, the forecast `assumption_unverified`, the scenario `input_unverified`, the package
`input.invalidated`, the identifier PROPOSED (from the retired entity to null), retrieval verified; the six subscription actions in the
audit; the retry a no-op (no new batch, the notice count unchanged); the origin's second revoke refused; S3 THE HOLD AND THE REST — a hold
on the mirror's copy of C → the origin's revoke answers `held` (D destroyed, C refused with the hold id, the receipt `copies_destroyed:
false`, the origin's notice `mismatched`, the import `revoking`, one `import.revoked` for D), the steward's retry held again (a second
notice attempt, no second event), the hold lifted → `revoked` at attempt 3, acknowledged, a second event for C alone; the PENDING path (the
origin's domain administrator revokes → `pending`, the notice `notified`, the mirror untouched; the steward completes it by the route),
the FAULT after the graph write (the import `revoking` with `import.revocation_failed`; the second attempt finishes with ONE event naming
both attempts' items); a revoked copy never reused (A admitted afresh under a new id; E2 reused retired, `reached`); a copy another import
holds (`left` with `held_by`, the receipt false, the notice mismatched) destroyed by that import's revocation; S4 THE FOREIGN ORIGIN — a
package of a foreign tenant and domain signed by the foreign partner, imported from its station path; `source: origin` refused ("not a
domain of this tenant"); an unsigned notice, another party's key, another package → refused, nothing destroyed, `import.revocation_refused`;
the partner's signed notice → `revoked` from the station, `revocation-receipt.json` written beside it, the origin not answered here
(`answered: false`), `import.revoked` with `notice.source: station`; check 14's three wordings; the same party's rotated key verified with
`rotated_from`; S5 THE RECIPIENT AND THE ORIGIN'S ACTS — the demonstration recipient verifies a signed station notice and answers
(collected → acknowledged), keeps its copies on an unsigned one (collected → mismatched); the acknowledge route on an answered importer
notice refused; the notify route for an import that holds no copy refused. The first runs on harness pins (a twin's claim citation resolves
CLM objects; a SQL quote; a record's lifecycle is `admitted`; the error body's dashed code), then **5/5**. The eight retention harnesses and
the four subscription harnesses **163/163** on a fresh database (the memory-mappings digest changed: they register fresh); the full
integration suite **1035/1035 in 67 files** on a fresh database; the upgrade proof with 0022–0077 (56 migrations; 35 registry rows); the
unit suite **2210/2210** (with `import-package` 31, `revocation-notice` 13, `change-events-import` 10 — the sign/verify round trip, the
withdrawal header, the truncation arithmetic, the walk seeds) and the meta suite 9/9; the web typecheck, build and tests. The hosted run
at `2d92385` — ci 35115226285 (1035/1035 in 67 files on a fresh database with `phase6-retention-b17` 5/5; the upgrade proof +56 rows,
77 files; C18 612/612 + 44), C19 35115226352 — bound in the records commit, no unit promoted by it (the merge of PR #54 awaits #53's and
the owner's word). STATED: the
propagation reaches the tenant's OWN domains on this installation — another tenant's domain and a foreign installation are the STATION
path; a legal hold holds the revocation (answered `mismatched` until lifted); a copy another live import holds is left (`held_by`); a
notice signed by a later key is verifiable only where the importer declared that key as a partner of the same party; the memory-mappings
method changed (the origin's live subscription re-registered by the act); up to 32 walks in the finish write, each reading the nine reach
tables (bounded; a `walkMany` is a later note); reused ids are counted, not announced; the finish's ledger counts are the item map's
(`retracted`, `retired`, `withdrawn`, `tombstoned`, `left`, `held_by_other`), the attempt's in the answer and the events; a pre-B17
station recipient ignores the signature. Units and rows: ES-08-004 and ES-29-005 stay `partial` with the B17 clause (the cross-domain
REFERENCE and obligations on derived use remain); DP-47-005 stays `implemented` with the clause; AU-COM-0060, AU-COM-0062 and AU-DP-0097
carry it; the register rows L1-I03 and L3-I04 gain the B17 text; the (26, 24, 0) assertion re-run after 0077; the split stays **3,555 =
3,182 open + 339 local + 34 CI** (no unit promoted by a local run).

**B17.7 the demonstration** — `scripts/phase6/act-b17.mjs` → `evidence/cp6/act-b17.txt` (rehearsed first on a restored copy with its
own vault copy, key, station and Redis, `evidence/cp6/b17-rehearsal.txt` — the first rehearsal stopped on a persona name the demonstration
already held; the second held whole): `eye_demo` backed up and migrated with 0077, the API restarted by the runbook's script; then (1) THE
SUBSCRIBERS — the origin's memory-mappings subscription revoked and registered anew (its method changed; the replacement replayed from the
revoked cursor), the mirror's seven registered by the administrator (M. Keller the owner; `relationships` with the demonstration's
selection), the status route and the mirror's worker; (2) THE STANDING IMPORT — B16's admitted import of the NORDWERK knowledge (4
records, 17 claim versions of 14 claims, 7 entities, 8 edges); S. Roth's assumption resting on an imported REL claim (its
`strategy.declared` deliveries — the twins consumer selects nothing: `rests_on` is not a change); K. Vogel's twin bounded by the imported
"NORDWERK ANTRIEBSTECHNIK GmbH" with one estimated element citing the imported record, admitted → verified; (3) THE ORIGIN REVOKES —
H. Bergmann revokes B16's E1: the export read before it names the importer; the station notified with the SIGNED notice (by the package's
key `ed25519:fcd9d6bf…` — the demonstration key), the demonstration recipient VERIFIES the signature before obeying, answers, collected →
ACKNOWLEDGED; the mirror's import notified and its copies DESTROYED by the same act (records 4, claims 14, entities 7, edges 1; 7 left as
the origin recorded; bytes removed 4): the edge retracted with the reason, the seven entities retired, the fourteen claims withdrawn by a
version each (`correction_of`, `method retention.import.revoke@1.0.0`, `imported_from` kept; the lineage carried), the four records
withdrawn with `custody.tombstoned` and the bytes gone from both roots, the import `revoked` with the counts, the origin's importer notice
`acknowledged` with the mirror's receipt; the export read after it a 409 (the B11 rule); the `import.revoked` event (7 retired, the walk
reaching S. Roth's assumption and the twin) and its six deliveries — the twin UNVERIFIED (`version.unverified`), retrieval
`projections.verified` with 0 mismatched rows; (4) E4 → THE MIRROR — a new export of the same records delivered, verified and acknowledged
at the station, imported into the mirror: VERIFIED (16 checks), approved by H. Bergmann, admitted by M. Keller AFRESH under new ids (0 in
common with the revoked import), exactly ONE `import.admitted` in the admission's own transaction (7 created identities, 8 edges, 14
claims, 4 records; `walked: false`), its six deliveries (the four selectors empty; retrieval verified), the four `ObservationRecorded`
rows before it in the tenant partition; (5) THE STATE — one live copy of the NORDWERK knowledge in the mirror (E4's, left for the next
run); the stated limits (the tenant's own domains vs the station path; the hold; the method change; no forecast through the route in the
mirror; a twin's claim citation is a CLM). Each run revokes the import the previous run (or B16) left admitted and leaves its own. ALL
SCENES HELD (52 checks).

## B18 — Codex B17-F1 corrected; the lifecycle announced (ten interface rows bound: 36/14/0) and the withdrawal → invalidation → reopen chain; the working domain of a tenant-homed principal and the hosted browser walks of the retention and memory workspaces (implemented)

**Migration 0078** (`apps/api/migrations/0078_b18_lifecycle_announced_and_withdrawal_chain.sql`, sha256 `0433b70a…`, 1,109 lines), on
`phase6-b18` (cut from `main` at `28e18b5` — #53 and #54 merged under the owner's 2026-09-16 authorization on Codex's bounded B16/B17
review, filed under `audit/reviews/The_Eye_f4b2345_2d92385_B16_B17_Review_and_Next_Delivery.md`). The batch the owner's directive named:
"Include B17-F1 as the first correction in the next feature batch … Then continue the register's next functional batch: remaining interface
semantics … Finish the functional UI flows and available signed-in walks as part of delivery." Three parts: B18.1 the correction (committed
first as `002f8d4`, no migration); B18.2 the interface register's next capabilities — the ten partial contracts whose transitions the product
already performed or could perform with three ports, bound to the events it now publishes in the transaction that makes each transition, and
the chain a withdrawn forecast starts; B18.3 the browser — the six domain shells offering a TENANT-homed principal a working domain (so the
acts the policy reserves to tenant roles are reachable in the browser, which the reader found provably unreachable before), and two hosted
Playwright walks. Source-derived memory (AU-MEM-0065's last clause) and index-tier degradation (AU-MEM-0067/-0068/-0070/-0083) were read
and mapped for this batch and are B19 and B20 — stated, not folded. Designed by six readers, two designers and three checkers (four
blocking findings folded before a line was written: `decision.commitments` carried `UNIQUE (package_id)` so a re-commit after a reopen was
impossible; the automatic invalidation would have fired on a changed implementation digest or a restricted reader's reproduction and refused
every session-less operator; the replay service refused any version but the last committed one; the B8 harness pinned L9-I04 as partial —
and sixteen should/nit corrections, `corrections.md`); implemented by seven implementers on disjoint files and one compile pass (which changed
nothing: every boundary agreed); integrated, run on fresh databases, rehearsed on a restored copy and exercised on the demonstration (§B18.7).

**B18.1 Codex B17-F1 corrected — a revocation resumed after a crash between a record batch and the cleanup (no migration; 0076/0077
untouched; committed as `002f8d4` before the batch's features).** THE DEFECT, independently reproduced by Codex at `2d92385`: a record batch
of `revokeImport` commits its tombstones, withdrawn versions and item outcomes before the finish write and the filesystem removal; a
process that stops there leaves the import `revoking` with the record already `tombstoned`; on the resumed request the fresh tally's
locators were empty, the settled item was skipped, the finish completed from the item map, the removal used the empty tally, and the
response and the recorded receipt said `copies_destroyed: true` while the earlier record's bytes remained — only a THIRD request (the
retry branch) would have removed them. THE CORRECTION (`import.service.ts`): `durableRevocationOf(items)` — the revocation as the ITEM MAP
records it (the counts by outcome, the refused items, the left count, the holders named `held_by`, every tombstoned record's locator) —
read inside the finish write (`revokedFactsOf` returns the items it read) and reduced the same way at the retry; `removeRevokedBytes(scope,
owed, own)` removes every owed locator in BOTH roots (the staged copies too) — an earlier attempt's present bytes named `residual` — and
then VERIFIES: a locator with any bytes left in either root is `remaining` (⊆ `failed`) and is never reported destroyed; the receipt's
counts, refused items and `held_by` are the item map's, `destroyed.bytes` the tombstoned records verified gone, `bytes_residual` /
`bytes_remaining` named (each list cut at 200 with `bytes_truncated` said — the station receipt travels under a 64 KiB ceiling; the ledger
event `import.copies_destroyed` / `copies_refused` keeps the whole lists in `details.bytes`), the statement by count; `copies_destroyed` =
complete ∧ nothing failed ∧ nothing remaining ∧ nothing held; the route's answer keeps `destroyed` (this attempt's — the B17 pins) and
adds `cumulative`; `RevocationFault` gains `after_record_batch` (the injected fault right after the first record batch committed — the
state Codex reproduced). THREE ADVERSARIAL REVIEWS of the correction (the resumed path against the reproduction; the failed-removal path
and redelivery; the regressions on B17's pins) found four gaps beside the closed reproduction, closed with it: (1) HOLDER LIVENESS — the
finish had taken the retry's narrower liveness (`admitted` only) and would have dropped a `revoking` holder into a "destroyed": now
`liveHoldersOf` at the finish AND the retry keeps `admitted` and `revoking` holders (a copy is released only by `revoked`) and carries a
non-UUID holder id; and the copy decision is COMPLETED (C9): a revoking source import holds the copy only while its own item is still
pending — a source that settled its item `left` (it found this import admitted at the time) has HANDED the copy off and this import
destroys it (`importStillOwes`, the same rule in `liveOwnerOf`), the decision taken under a per-object advisory transaction lock
(`RetentionWrites.lockRevocationCopy`: `pg_advisory_xact_lock(hashtext('retention.import.copy:' || object_id))`) with the batches processed
in object-id order, so two revocations never both leave the one copy to each other; (2) STAGED-ONLY RESIDUES — presence and the verification
use `VaultService.anyBytesIn` (the published copy OR a staged `<id>.staging-<attempt>` beside it; a directory that cannot be listed counts
as bytes PRESENT — the deletion verifier's own rule); (3) AN UNREACHABLE ROOT — `ensureRoots` writes a marker `.eye-vault-root` (the tier
name) at the top of the evidence and archive roots, `rootReachable` reads it, and a cleanup that cannot read a root's marker (an unmounted
cold tier is an empty mount point) removes NOTHING in any root that attempt (a half-removal would leave no list exact), names the root in
`roots_unreachable`, marks every owed locator `remaining` and says so in the statement — the next revoke, every root reachable, removes and
verifies; (4) THE LEDGER'S LAST WORD — the retry branch reads the latest receipt event's kind and, when it was `copies_refused` and nothing
is owed any more (nothing failed, remaining, refused or held), records ONE `copies_destroyed` receipt (`retried`) answering the origin's
mismatched notice by a new acknowledged attempt; the redelivery after it stays silent. THE HARNESS `phase6-retention-b18.test.ts` (6 cases
on a fresh database; the mirror domain, its steward, the intake contract and the partner on the tenant's key; no station, no
subscriptions — the outbox rows are the ledger): F1 (a) the crash after the record batch — `revoking`, both records `tombstoned` with their
locators, the bytes present, no `import.revoked` row, no receipt; (b) the FIRST resumed request removes them (`residual` = both, `removed`
= both, `remaining` []), the receipt `copies_destroyed: true` with `bytes_residual`, `destroyed.records 2`, the origin's notice
`acknowledged`, ONE `import.revoked`, `copies_destroyed` ONCE; (c) a redelivery adds no event; (d) the removal FAILING on the resumed
request (the vault's `f27` hook) — `revoked` by the item map BUT `remaining` = [C], the receipt `copies_refused` with the statement, the
notice `mismatched`, the bytes present; the third request (the retry) removes them, records `copies_destroyed` (`retried`) and answers the
origin by a new attempt row ([[1, mismatched], [2, acknowledged]]); a fourth adds nothing; F2 THE HAND-OFF — P3 revoked while P2 is
`revoking` (a hold on P2's other record) with the shared item settled `left` → P3 destroys the copy (receipt true, acknowledged); the hold
lifted → P2 `revoked`, no orphan in either root; F3 THE CRASH ORDERING — P5 leaves the copy `held_by` the revoking P4 whose item is still
pending (receipt false, mismatched); P4 resumed destroys it; P5's retry records ONE `copies_destroyed` by the last-word rule; a further
revoke silent; F4 a STAGED-ONLY residue found present, removed and verified gone; F5 THE ARCHIVE ROOT's marker aside → nothing removed,
`roots_unreachable ['archive']`, `remaining` [A7], `copies_refused` with the statement, `mismatched`; the marker restored → the retry
removes and verifies (`removed` [A7], `residual` [A7]), `copies_destroyed` (`retried`), acknowledged at attempt 2 — **6/6**; B17's
harness **5/5** on the correction; the unit suite **2210/2210** + 9/9; the page's revoke answer shows the bytes line (removed, the
residual of an earlier attempt, failed, still present after the removal) and the cumulative counts. STATED: the crash is injected
in-process (a killed PostgreSQL-backed process is not exercised); the staged copy and the missing marker are placed by the harness, not by
an interrupted archive or an unmounted volume; the lock's serialisation is proven by ordering, not by two concurrent processes; the
unlistable-directory rule is not pinned; the finish port's statement "accounted for by another live import" is 0077's wording and is
kept (a re-declaration for wording alone is not a correction). Codex's B16/B17 review filed under `audit/reviews/`.

**B18.2 — the lifecycle announced (family A, seven rows) and the chain (family B, three rows).** THE EVENTS. Each is a pure builder
(`forecast-events.ts`, `simulation-events.ts`, `twin-events.ts`, `decision-events.ts`, `review-events.ts`; the 0066 convention: `schema`,
`schema_version`, stable ids and versions never bodies, `temporal.known_at`, `cause {action, actor, target_type, target_id}`, every list cut
at `LIFECYCLE_EVENT_LIST_MAX` 200 with `truncated` said) published as the write's `outboxEvent` from the transaction that makes the
transition — `objects.schema_registry` is the OBJECT-TYPE catalogue (thirty-five three-letter rows; no event was ever registered there) and
an event type is declared by its payload's `schema`/`schema_version`, the outbox row's `schema_version` column and the register row, stated
so the reviewer looks for no registry row. (1) L5-I04 `TwinStateChanged@v1` from `twin.version.admit` (`change: version.admitted`; the
changed variables against the SUPERSEDED version as added/removed/changed, the confidence, the freshness — known-at, observed-through as
the day it names, completeness, missing keys — and the dependency impacts: the runs of the superseded version by `(twin_id, twin_version)`)
and from the twins subscriber's own mark (`change: version.unverified`, riding the item's transaction as its `outboxEvents`); beside the
admit, `GraphChanged/twin.state_changed` (`objects.twins` the twin, `objects.simulations` the superseded version's runs, `walked: false`,
a typed `twin` block) — the twins consumer returns nothing for it (a twin's own admission never unverifies the version just admitted or its
predecessor, a valid snapshot as of its own cut-off), the decisions consumer NOTES a package citing those runs WITHOUT exposure ("twin … has
a newer admitted version …; the cited runs rest on version … and stand; the owner judges whether to re-simulate"), the rest select nothing;
`version.reverified` is vocabulary no port writes (stated); the walk's own unverification stays announced by `invalidation.assessed`.
(2) L8-I02 `SimulationStarted@v1` from the run's opening write and (3) L8-I03 `SimulationCompleted@v1` from the completing write — ONE
name with two states, `completed` and `failed` — with the resolved artefacts, the execution identity (the operator and their verification
state), the environment beyond the digest (node, platform, arch), the seed, the run state, the outputs digest, the impacts against the
control, the sensitivity, the validation and the RESOURCE EVIDENCE measured around the execution (`elapsed_ms`, `samples_run`, the process,
`memory_rss_bytes`) — kept on the row too (`runs_current.resource`; `complete_run` re-declared with `p_resource`; `runs_immutable`
re-declared to admit it in the completing UPDATE and nothing after). (4) L9-I02 `DecisionPackageReady@v1` from `decision.package.propose`
(the version's digest and header, the options with their uncertainty and cited runs, the choice, the dissent, the provenance, the approver
policy, the monitoring conditions, the baseline; `reopened_from` after a reopen) and (5) L9-I04 `DecisionCommitted@v1` from
`decision.commit_package` (the commitment, the approvals, the CMT and what it rests on, the handoff statement, the replay snapshot's digest;
`reopened_from` naming the earlier commitment on a re-commit). (6) L2-I04 `ReviewRequested@v1` from the three sites that queue a review case
— the extraction's abstention, its below-threshold/contradiction case and the challenge route — one row per queued case, `routed_to` the
roles the policy names for `intelligence.review.decide` with the producing agent excluded, the claim's type read from the case's lineage.
(7) L6-I02 `ForecastProduced` bound to the EXISTING `ForecastIssued` completed as `@v2` — no rename (the L7-I03 → EarlyWarningRaised
precedent; the telemetry index reads `forecast_id`, which v2 keeps): the six v1 keys plus `schema`, `cause`, `temporal.known_at`, the
computed `expiry` (from the issue instant and the cadence), the validation, the distribution, the lineage, the calibration, the drivers,
the horizon in days. THE CHAIN. (8) L6-I05 `ForecastWithdrawn@v1`: `prediction.withdraw_forecast` under the new human-gated action
`prediction.forecast.withdraw` (the forecast owner, the domain administrator, the platform administrator; C2; `requiresPurpose`) — the
row `withdrawn` with `withdrawal {reason, unfit_class, dependants}` (the scenarios, warnings, twin versions, runs and packages resting on it,
enumerated in the port), the ledger row `forecast.withdrawn`, AND a withdrawn FCT version (object version 2, lifecycle and truth state
`withdrawn`, `correction_of`/`supersedes` the prior, `withdrawal_reason`; the B17 withdrawal header rules factored into
`shared/withdrawn-version.ts`) admitted by `objects.admit_version` under the canonical-write action — without the OBJECT's state the
reproduction's availability check would never yield `unreproducible` and the chain's automatic step would never fire; the warnings resting
on the forecast are marked by the port itself (no warnings consumer); `prediction.declare_scenario` refuses a withdrawn forecast ("scenario
rejected: forecast … was withdrawn as unfit"); refusals: already withdrawn, superseded (the successor is the live one), unknown, a short
reason, the wrong principal. Beside it `GraphChanged/forecast.withdrawn` walked exactly as `forecast.superseded`: the scenarios marked
`input_unverified`, the packages noted `input.invalidated` with a CATEGORICAL exposure (`material_change`; `compensation` for an executed
decision, `human_review` otherwise — a lost input cannot be shown immaterial), the twin versions unverified (each announcing its own
`TwinStateChanged/version.unverified`), retrieval verified. (9) L8-I05 `SimulationInvalidated@v1`: `simulation.invalidate_run` under
`simulation.run.invalidate` (the twin owner, the simulation operator, the domain and platform administrators; C2) — `runs_current.validity`
`valid → invalidated` (a COLUMN, not a state: `runs_immutable` admits the four validity columns once on a completed run and nothing else;
the rebuild derives `state` from `run.opened/completed/failed` as before), the ledger row `run.invalidated`, the dependants (the packages
citing the run and their commitments), a withdrawn SIM version 2 — AND automatically inside the reproduce write under `simulation.reproduce`
when a reproduction's verdict is `unreproducible` BECAUSE a cited object was withdrawn or retired (`unavailable()` now returns a structured
cause — `lifecycle | access | bytes` — and the reproduction invalidates only on `lifecycle`; a changed implementation digest, a reader's
narrower access, missing bytes or a child-process failure WITHHOLD it and the answer says which: `invalidation_withheld`); the actor check
binds the person's act only (a reproduction by a session-less operator is not refused); the invalidation is recorded once (a second
unreproducible verdict records the verdict alone); `decision.derive_option` — the citation gate at `set_option`, at the proposal and at the
carry — refuses a run whose `validity` is `invalidated`, a forecast citation whose row is `withdrawn`, AND a valid run whose snapshot cites a
withdrawn forecast ("rests on a forecast withdrawn as unfit; a consequence cannot rest on it until the run is re-issued on a live
forecast"); a version-less citation of either is refused earlier by the service (the latest version is the withdrawn one). Beside it
`GraphChanged/simulation.invalidated` (`objects.simulations` the run, a typed block): the decisions consumer notes every citing package with
the same categorical exposure. (10) L9-I05 `DecisionReopened@v1`: `decision.reopen_package` under `decision.package.reopen` (the decision
owner alone — the port refuses a non-owner; C2) on a committed or monitoring package with a RECORDED cause — an `input.invalidated` note of
this package after the commitment, or a condition breach of the committed version — → state `reopened`, the standing commitment, the
approvals and the committed version UNTOUCHED, a NEW DRAFT version carried from the committed one with a TOLERANT per-option carry (an
option whose run is invalidated or rests on a withdrawn forecast is DROPPED and named in `options_dropped`; "expose stale or withdrawn
inputs"), the two ledger rows `version.opened` and `package.reopened`, `reopened_from_version`/`reopen_cause`/`reopens` on the row;
`dpk_committed_bound` relaxed for it; `decision.commitments` carries `UNIQUE (package_id, version)` from here — ONE COMMITMENT PER
COMMITTED VERSION — and `commit_package` admits a second commitment only off a reopened package (over a standing one: "package is already
committed at version N and the commitment stands; a committed decision is reopened, never re-committed over"); `withdraw_package` refuses a
package whose commitment stands (reopened, or proposed after a reopen); the three one-commitment readers (`decision.record_outcome`,
the monitoring service, the package `get` — which now answers `commitments[]` ordered by instant beside the STANDING `commitment`) select
by the committed version; THE REPLAY's "decided" instant is the COMMITMENT's, not the package row's (`replay_layers` and `record_replay`
re-declared; the replay service admits any version with its own commitment row) — a re-commit would otherwise have rewritten the first
decision's replay boundary (observed history, V03-T-232); the executive room of a reopened package reads OPEN (a re-decision, not a
closure); the decisions consumer treats `reopened` as open and executed (the standing commitment is executed until re-committed; the draft
hears of its inputs); refusals: no cause, another package's note, a note recorded before the commitment, a draft package, a second reopen
while the draft is open, the wrong principals. The register after 0078: **36 bound / 14 partial / 0 unbound** (the ten promoted; the
fourteen that stay partial: L1-I02, L1-I03, L1-I04, L2-I02, L3-I02, L4-I02, L5-I05, L6-I03, L7-I02, L7-I04, L8-I04, L10-I02, L10-I03,
L10-I05); the assertion in 0078; the upgrade proof's migration count 56 → 57 (the roles and registry counts unchanged). Three exact PDP
rules placed before the prefix rules that would catch them; three refusal families (`forecast withdrawal rejected`, `run invalidation
rejected`, `reopen rejected`) plus the two 409 rows (`withdrawal rejected: package … was committed at version`, `scenario rejected: forecast
… was withdrawn`) mapped in the established order — the executive's `withdrawal rejected` family probed unshadowed. The twins and decisions
consumers' methods changed → their digests changed → every live subscription of the two kinds re-registered (the act does it in both
domains; the harnesses register fresh); the B6 harness's `admitTwin` now waits for an admission's `twin.state_changed` deliveries to settle
(an admission announces itself since 0078; a global one-shot fault armed right after an admit was consumed by them). A pre-existing defect
the harness exposed and this batch closes: `package.service.ts` rendered a DATE column with `toISOString().slice(0, 10)` — a local-midnight
instant printed in UTC, so on a UTC+ host a version opened with `observedThrough 2024-01-17` read `2024-01-16` in the DPK payload, the
header, the `get`/`list` answers and now the event — replaced by the local-getter idiom the twin and simulation services use (P5-M3;
byte-identical on UTC hosts; DPK headers proposed on non-UTC hosts from now on name the right day; nothing recomputes a stored digest from
the column).

**B18.3 — the working domain of a TENANT-homed principal, and the hosted walks.** The six domain shells (`apps/web/app/{graph, observation,
intelligence, decisions, prediction, twins}/layout.tsx`) refused every principal without a home domain — and a principal created at TENANT
scope has exactly one binding, so every act the policy reserves to a tenant role (`retention.action.approve`, `retention.import.approve`,
`retention.signing_key.declare`, `retention.export.revoke`'s tenant form) was UNREACHABLE from the browser by construction; the
demonstration's H. Bergmann is such a principal. From B18 a TENANT-homed principal is offered a WORKING DOMAIN: a `tenant_admin` picks from
the tenant's domains (`tenancy.domain.list` — the administration page's own call), any other tenant-scope role pastes a domain id (no new
PDP row); the choice is the tab's and the principal's (`sessionStorage['eye.working_domain']` `{principalId, tenantId, domainId, mode,
chosenAt}`, valid only for the same principal and home tenant, read after `/v1/me` answers, cleared by "change" and by Sign out), injected by
the layout into the `scope` every page already reads from `useShell()` — so every envelope of every page names it as the DOMAIN scope and
the SERVER decides what the principal may do there (a TENANT binding on a DOMAIN envelope of its own tenant, the B16 approve-in-D2 idiom);
the header shows `tenant … · domain … · working domain` with the change control exactly as it shows a home domain; a PLATFORM principal is
refused as before, byte for byte. STATED: a pasted domain id of another tenant is not refused at scope resolution — the reads answer empty
under RLS and the writes are refused by the domain keys; a domain-membership check in `resolveScope` is a hardening item. `apps/web/lib/
working-domain.ts` (pure, five vitest cases), `components/working-domain.tsx` (`WorkingDomainChooser`, `WorkingDomainMark`). THE WALKS
(`e2e/phase6-retention.spec.ts`, 13; `e2e/phase6-memory.spec.ts`, 7 — picked up by the hosted `browser-regression` job automatically;
`playwright.config.ts` generates the run's Ed25519 signing key once at config load, hands it to the API through `webServer[0].env` and
derives the public PEM for the spec; no scheduler: no delivery is asserted; the credential is typed by Playwright from the run's environment,
never by the author). The retention walk, in the Phase 1 idiom (the rotation-aware admin, its own tenant with two domains and eight
principals with per-run passwords, the upload contract and two records in D1, the intake contract in D2, the key declared by the tenant
administrator with `credentialRef EYE_EXPORT_SIGNING_KEY_E2E`, the ids resolved through the list routes before each test): the steward opens
a customer export and resolves it; the TENANT ADMINISTRATOR chooses the origin domain FROM THE LIST and approves on the digest (the header
asserted; the choice survives a reload; "change" re-scopes to the empty mirror); the steward executes and verifies (the signed package); the
origin's administrator declares a transfer station and delivers (`package.tar` on disk); the mirror's administrator declares the partner on
the run's public key and a station of D2; the mirror's steward opens the import from the station — `verified · 0 check(s) failed` with the
checks table; the RETENTION AUTHORITY PASTES the mirror as its working domain and approves the import; the steward admits it — the origin's
record lists the importer; the origin's administrator revokes the package — "revocation pending — the acting principal holds no authority in
the importing domain"; the mirror's steward executes the revocation from the origin's record — `bytes: removed 2 · failed 0`, `copies
destroyed yes · the origin answered: acknowledged (notice attempt 1)`; a second revoke `retried`, `bytes: removed 0`, the importer notice
`acknowledged`; the refusals in the page's own words (a steward approving → the 403 status line with its code; a seven-character reason keeps
Withdraw closed; no alert inside `<main>` — the shell's route announcer outside it is Next.js's own); fail closed — a platform principal
still has no domain to open, a tenant principal without a choice sees the chooser, and the choice is the principal's. The memory walk:
the knowledge owner records, retrieves under `memory` (the access recorded), is refused under `prediction` (403 in the page's words); a
reader under `graph`; the record authority supersedes from the served version; an as-of retrieval serves version 1 replayed (the
supersession held 2.5 s after the recording and the instant the first whole second after it — the field carries seconds at best); the
owner's withdrawal refused 403; the authority withdraws — the current retrieval 409 `EYE-STA-003`; landmarks, focus and names. The gate's
first run at this tree was 40 passed / 2 failed (the as-of instant landed after a supersession two seconds later; the route announcer
counted as an alert) — both spec-side, corrected; then **46/46** (the Phase 0 ten, the Phase 1 sixteen, the B18 twenty) on a fresh
database with the demonstration API stopped for the run (the gate's own API takes :3401; the act restarted it). CAP-UM-07 and CMP-102's
"browser walk owed" clauses are replaced by the hosted walk; AU-MEM-0065 likewise (its status `verified:ci` unchanged); the owner's own
walk of the demonstration stays the owner's.

**B18.6 the harnesses, the gates and the units.** `phase6-interfaces-b18.test.ts` (14 cases on a fresh database with the scheduler on;
`bootDecisionWorld` + `decisionCalls` with session-bound actors — a twin at version 2 carrying a predicted element citing the fixture forecast,
a scenario on it, two runs on version 2, a package P citing them; the seven consumers registered): S1 the seven announced events, each read
from the outbox in its transition's own transaction with the pinned payload — the twin admission (the changed variables against version 1,
the superseded version's runs, the `twin.state_changed` deliveries: the twins consumer empty, the decisions consumer's note WITHOUT exposure on
a draft declared before the admit, retrieval verified), the two runs (started/completed with the resolved artefacts, execution identity,
environment, seed, state, outputs, impacts, uncertainty, sensitivity, validation and resource evidence — on the row too), the proposal and the
commitment (the approvals, the CMT, the handoff, the replay snapshot), the queued review case (`routed_to`), ForecastIssued@v2 (the outbox
row's `schema_version` column `v2`, the expiry from the event's instant); S2 the chain end to end — (a) the withdrawal: the row, the
dependants, the withdrawn FCT version, the ledger, ForecastWithdrawn then `forecast.withdrawn`, the six deliveries (the scenario marked, the
package noted `material_change/compensation`, the twin version unverified with its own TwinStateChanged bound to the delivery by
`caused_by` and the write's correlation, retrieval verified, the rest empty); (b) the automatic invalidation — the NEGATIVE first (the pinned
implementation digest flipped: `unreproducible`, `invalidation_withheld: implementation`, the run valid, no event), then the reroute's
reproduction unreproducible on the withdrawn forecast → invalidated in the same write (`cause: lifecycle`, the structured entry, the
withdrawn SIM version, `dependants.decisions` the package, SimulationInvalidated and `simulation.invalidated`, the package noted again; a
second reproduction records the verdict alone); (c) the operator's invalidation of a run nothing cites and its empty reach; (d) the reopen on
the recorded note — state, the commitment/approval/committed version untouched, BOTH options dropped and named, the two ledger rows as a
set, DecisionReopened, the second cycle (the status quo on the version-1 control, an unsimulated wait) to a SECOND commitment (two rows; the
first byte for byte), the replay of version 1 at the first commitment's instant and of version 2 at the second; S3 the refusals by family and
status — the withdrawal (twice, superseded, unknown, a short reason, the wrong principal, a scenario on a withdrawn forecast), the invalidation
(opened/failed/twice/unknown/the wrong principal), the citation gate at `set_option` by the port (the exact version) and by the service (the
version-less citation), the valid run resting on a withdrawn forecast, the committed version's rows seeded outside the port refused at the
proposal (the port names the first in key order), the reopen (no cause, another package's note, an earlier note, the wrong principals, a
second reopen), a reopened package still hearing of its inputs, the withdrawal of a package whose commitment stands (reopened; proposed
after a reopen), the second commit over a standing commitment; S4 the register through the route: 50 rows, 36/14/0, the ten `bound_in
0078`. The first run 7/14 (seven pins met the implementations — four cascades of ONE real defect, the DATE rendering above, and two harness
fixtures that stopped at the services' own gates before the ports'); then **14/14** twice. `phase6-retention-b18.test.ts` **6/6** (B18.1).
The B8 harness's one pin on a promoted row (L9-I04 `partial`) moved to L8-I04. The neighbouring set — the eight retention harnesses
B11–B18, the four subscription harnesses B6–B9 (the twins and decisions digests changed: they register fresh; B6's admits settled),
`phase6-interfaces-b18`, `phase5-simulations`, `phase5-corrections`, `phase6-replay` (their reproductions now invalidate under
`simulation.reproduce` where a cited document was withdrawn — a lifecycle cause, by the C2 rule), `phase6-decisions`, `phase6-approvals`,
`phase5-twins`, `phase6-residual-corrections` — **283/283 in 22 files** on a fresh database; the full integration suite **1055/1055 in 69
files** on a fresh database; the upgrade proof with 0022–0078 (57 migrations above the ceiling; 78 files; the schema digests equal; the
Phase 1/2 suites 275/275 on the upgraded data); the unit suite **2272/2272** (= 2210 + the 62 B18 cases: the withdrawn header, the six
builders key by key with the 200 ceilings, the three PDP rules' precedence, the mapper order) and the meta suite 9/9; the web typecheck, build
and tests (11); the browser gate **46/46**. The hosted run at `4cea858` — ci 35163213469 (build-test job 105018424523: unit 2272/2272 and the meta suite 9/9,
acceptance 58/58, the integration suite 1055/1055 in 69 files on a fresh database with `phase6-retention-b18` 6/6 and
`phase6-interfaces-b18` 14/14, the upgrade proof +57 rows / 78 files, C18 612/612 + 44; supply-chain green; browser-regression 46 passed —
the B18 twenty on the hosted gate), C19 35163213457 — bound in the records commit (`evidence/cp6/hosted-4cea858-build-test-summary.txt`).
Units and rows: the seven v03 rows L5-I04, L6-I02, L6-I05, L8-I02, L8-I03, L8-I05, L9-I05
`partial` → `implemented` (`passed:harness`, `branch-only`) with the case each names; L2-I04, L9-I02, L9-I04 stay `implemented` with the
B18 note (the published event the register lacked); V04-T-005 stays `partial` (the catalogue obligation: 36 of 50 bound after 0078; 14
partial, listed); **AU-TWN-0033 `open` → `verified:local`** (every condition exercised by S1(2)(3) — the B15 precedent: a unit whose every
clause the author's harness exercises) in the batch commit and **→ `verified:ci`** in the binding commit (the hosted run above) — the
split reads **3,555 = 3,181 open + 339 local + 35 CI**; AU-TWN-0012 (the warning candidate on
a twin change remains), AU-TWN-0032 (the diagnostic-only state for a failed validity remains), AU-DEC-0062 (the cited scenario tree's
re-versioning remains), AU-PRD-0017 (the briefings' consumption remains), AU-DP-0071 stay `open` with the B18 clause; AU-DEC-0020,
AU-DEC-0034, AU-INT-0033 carry it; AU-COM-0060/-0062 and AU-DP-0097 carry the B18.1 clause; CAP-UM-07 stays `partial` with the walk on the
gate; CMP-102 `unverified` → `passed:browser`; AU-MEM-0065 keeps `verified:ci` with the walk. STATED: the FAILED state of
SimulationCompleted is unit-tested only (every run of the harness and the act completes); the operator's invalidation is the harness's
(nothing of the demonstration is invalidated by hand); no consumer of ReviewRequested, SimulationStarted/Completed, DecisionPackageReady/
Committed/Reopened (the accountable humans read the ledgers; the register's `bound_to` says so); a policy change has no recorded cause on a
package (L10-I05, B20); a closed decision is not reopened; the reopen leaves the standing commitment monitored until the re-commit; the
extraction's ReviewRequested sites are exercised by the unit test and the demonstration's own extraction (none ran after 0078 on the demo —
the challenge site did); `changedVariablesOf` compares against the superseded version only (a forked branch's first version adds every
element); the twin's `dependencyImpacts` and every event list are cut at 200; the register's binding is a binding, not semantic acceptance.

**B18.7 the demonstration** — `scripts/phase6/act-b18.mjs` → `evidence/cp6/act-b18.txt` (rehearsed first on a restored copy with its own
vault copy, key, station and Redis, `evidence/cp6/b18-rehearsal.txt` — the FIRST rehearsal stopped in scene 3: the act had opened the twin
version with the seed's world cut-off 2024-01-17 and the product refused the shocked run because the corridor branch's flip rests on an
observation of 2024-01-27 outside it — the act now carries the current version's cut-off; the second rehearsal held whole): `eye_demo` backed
up and migrated with 0078 (the demonstration API had been stopped for the browser gate — the act's first line says so — and was restarted
by the runbook's script on the B18 build, verified); then (0) THE SUBSCRIBERS — in BOTH domains the twins and decisions subscriptions revoked
and registered anew (the methods changed; the replacements replayed from the revoked cursors), the other five left; (1) B18.1 ON THE
DEMONSTRATION — M. Keller revokes the mirror's standing REVOKED import again → `retried`, every byte list empty, nothing to remove, said so;
no receipt, no new event; the mirror's ONE live import (E4's, 36 items) read and NOT touched (K. Vogel's twin cites its record); (2) K.
VOGEL'S TWIN VERSION in the mirror — version 2 on branch actual with one estimated element citing the imported record, admitted →
`TwinStateChanged/version.admitted` (version 2 supersedes 1; changed variables added/removed; no dependency impacts: the mirror runs
nothing) beside `GraphChanged/twin.state_changed` and its six deliveries (every selector empty; retrieval verified; the predecessor left as it
was); (3) THE ORIGIN — N. Eriksen issues `ecb-eurusd` at 90 days (weekly cadence, live) → `ForecastIssued@v2` (the outbox row's
`schema_version` column `v2`; the expiry from the cadence; the distribution, the validation) and declares a scenario on it (the downside
flipped by the corridor transit indicator); T. Nakamura versions the demo twin — the PRECONDITION checked: two of the twenty-four cited
records were in the ARCHIVE tier (B12 re-archived them) and are RESTORED first through the governed restore (P. Novák opened and executed,
H. Bergmann approved on the scope digest, verified) — version 5 carried from 4 with the current cut-off and a predicted element citing the
forecast, admitted → `TwinStateChanged` (the changed variables, the superseded version's 0 runs), the `twin.state_changed` deliveries printed
honestly (the decisions consumer noted NO package: act VI's simulated version carries no run), then a shocked control and a reroute on the
flipped branch → `SimulationStarted`/`SimulationCompleted` ×2 with the resource evidence on the row; L. Brandt declares a package on the demo
DEC, opens its room, cards the status quo and the reroute (the intervention + the forecast), sets the terms and the choice, proposes →
`DecisionPackageReady`; S. Okafor approves; L. Brandt commits at C3 → `DecisionCommitted`; (4) THE CHAIN — N. Eriksen WITHDRAWS the forecast
as unfit (`data_shift`) → `ForecastWithdrawn` with the dependants named (the scenario, the twin version, the two runs "named, never
altered", the package) and the `forecast.withdrawn` deliveries: the scenario MARKED, the package NOTED `material_change/compensation`
(executed), the twin version UNVERIFIED announcing its own `TwinStateChanged/version.unverified`, retrieval verified; T. Nakamura reproduces
the reroute → `unreproducible` on the withdrawn forecast → INVALIDATED in the same write (`cause lifecycle`, the withdrawn SIM version 2) →
`SimulationInvalidated` (trigger `reproduction`) and the `simulation.invalidated` deliveries (the package noted again); L. Brandt REOPENS the
package on the first note after the commitment → `DecisionReopened` (state `reopened`, the commitment stands, a new draft version 2, both
options dropped and NAMED — the reroute invalidated, the status quo resting on the withdrawn forecast), the room OPEN again; the second cycle
— the status quo on act V's valid control, an unsimulated wait, the choice, the proposal (`DecisionPackageReady` with `reopened_from`),
S. Okafor's approval, the SECOND commitment (`DecisionCommitted` naming the first; two commitment rows, the first byte for byte as before);
S. Okafor replays version 1 → its decided layer closes at the FIRST commitment's instant, version 2 at the second; (5) A. HOFFMANN'S
CHALLENGE — L. Ferreira decides the standing queued case, A. Hoffmann challenges the claim again → `ReviewRequested` (queued_reason
`challenged`, routed to the reviewer roles); (6) THE STATE — the sixteen B18 event rows of the run from the outbox with their partition,
sequence, schema version and status; the register through the route by J. Weber (36/14/0, the ten bound in 0078); what the act leaves (the
90-day forecast withdrawn; the scenario marked; the origin twin at version 5 unverified; the two runs — the reroute invalidated, the control
valid; the package committed at version 2 with two commitments and its room; the challenge case queued; the mirror's live import untouched
and K. Vogel's twin at version 2). Each run re-issues the 90-day forecast (no supersession: the previous run's is withdrawn), versions both
twins once more, declares a new package with its room, decides the previous run's challenge and challenges again; the January package and
acts I–V are never rewritten. ALL SCENES HELD (60 checks). The demonstration web is rebuilt with the chooser and the bytes line; the owner's
walk of it as H. Bergmann (a TENANT-homed persona: the chooser, then the approvals in the browser) is the owner's.

## B19 — the source-derived memory records: a memory record DERIVED by a person from a claim version or a warning, with its provenance, its inherited controls, the review and lifecycle gates, the basis followed, and the deletion of the evidence it copies from paused (implemented)

**Migration 0079** (`apps/api/migrations/0079_b19_source_derived_memory_records.sql`, sha256 `f8cd2b93…`, 653 lines), on `phase6-b19`
(cut from B18's records head `4a7f43a`; PR base `phase6-b18`, retargeted to `main` when #55 merges). The register item every checkpoint
since B10 listed as Missing — "the source-derived memory records": AU-MEM-0065's last clause, "an Enterprise Memory workspace that also
holds communications and telemetry-derived records" (the memory item's source kinds `document | communication | telemetry` existed as words a
person chose beside a free-text `source.ref`; every record ever written was `human`). Read by one reader in B18 (the specification's record
kinds and the lifecycle a derived object owes; the code map; the exact gap: no derivation, the kind unenforced, no provenance block, no
inheritance, no review gate, the basis followed only as far as attention on some paths, no surface, no case), designed by one designer and
two checkers (two blocking findings folded before a line was written — the derive act would have been an ORACLE over confidential claims for
a deriver whose clearance did not cover the record; a withdrawn EVIDENCE version passed the gate — and eight should/nit corrections,
`corrections.md`), implemented by five implementers on disjoint files and one compile pass (which changed nothing but the two B9-F1
closure pins the retrieval's widened shape needed), run on fresh databases, rehearsed on a restored copy and exercised on the demonstration
(§B19.7).

**B19.1 — the derivation act.** `memory.item.derive` — a knowledge owner's (the `memory.item.record` holders: the platform administrator,
the domain administrator, the knowledge owner, the strategy owner) HUMAN-GATED act (C2; `requiresPurpose`): the person names the BASIS — a
claim version (ENT/EVT/CLM/REL/ASM, the exact version or the latest) or a warning — and the kind, the title, the record class, the
audience, the validity, the retention and the related objects; the SERVER computes the content and the provenance. `MemoryService.derive`
(`graph/memory/derive.ts` pure; `memory.service.ts`): the basis row; the gates in order — the basis's lifecycle (withdrawn → 409
`EYE-STA-003`), the object's latest version withdrawn, an imported claim (`payload.imported_from` → 409 "an imported claim is derived at
its origin and re-imported; it is not derived here" — the honest boundary while the cross-domain REFERENCE remains missing; B17's
"copies destroyed" stays true), the review CASE (the G2 `effectiveReviewState` idiom: a queued or rejected case → 409; a version the case
corrected → 409 naming the successor), the EVIDENCE gate (every resolved evidence version — the claim's lineage, a warning's breaching
evidence — whose picked version or whose object's latest version is withdrawn → 409: "rests on withdrawn evidence and grounds no memory
record"), and the CLEARANCE line — the deriver's clearance in the domain must cover the record's APPLIED classification, refused 403
`EYE-AUT-001` with the classification and the clearance named (a person derives only what they could read back; no row, no object, no event
on a refusal); then the lineage → `evidence[]` (object id, the version current at derivation — the highest EVD version carrying the
lineage's digest — the bytes digest, the byte span), the evidence → its source contract → `source {source_id, source_key,
contract_version, connector_kind, media_type (the declared type), authority_class, data_origin}`; THE STATEMENT by the method
`memory-derive@1.0.0` — a fixed template (a claim: subject, predicate, object value, the qualifiers, `as of` the event time when the basis
carries one; a warning: title, consequence, the observation and the rule) — and `statement_digest` = sha256 of its UTF-8, RE-VERIFIED by the
port (`memory.assert_derivation`: a derived statement is checkable from the record itself); the write through `memory.record_item`
(re-declared with `p_derivation`; the port validates the block's shape with every operand coalesced, refuses `derivation NULL ⇎ source_kind =
'human'`, adds the basis and evidence dependency rows itself so the walk reaches the record through the claim AND the evidence, and never
lets a supersession cross the kind class); ONE `GraphChanged/memory_item.recorded` with `cause.action memory.item.derive` (retrieval verifies;
the rest select nothing). A RE-DERIVATION on a newer basis version is `memory.item.supersede` with `payload.basis` (the record authority's,
human-gated) through the same service and gates — the statement recomputed, the derivation block replaced, the prior version replayable as
of an instant, the record's PRIOR validity kept when nothing is declared and the basis carries no event time. `/record` refuses a non-human
kind (422: "a document, communication or telemetry record is derived from its source (memory.item.derive); a person's own record is source
kind human"). `POST …/graph/memory/derive`; the PDP rule; the 409 family row.

**B19.2 — the kind rule and the inheritance.** The kind is the person's DECLARATION with ONE verifiable rule: `telemetry` ⇒ the basis's
evidence rests on a source with a REGISTERED SERIES (`prediction.series_registry` by the contract's `source_key`; the keys carried in the
block; else 422 "telemetry names a source with a registered series; <key> has none"); a WARNING basis is telemetry only (a warning rests on a
series). A telemetry record is EXTRACTED (a claim) or INFERRED (a warning) — never `observed`: the observed series-window basis is the
stated residual (graph → prediction would be the module cycle the boundary rule forbids); the enum's word names the SOURCE class, the truth
state the READ. A contract-level `source_class` is a SRC schema change (stated, not built). INHERITANCE (ES-29-002 is a floor, not a veto):
`classification` = the MOST restrictive of the declared audience's, the basis row's and every cited evidence version's (the clearance
order), lifted silently and SAID in the answer as `{declared, inherited, applied}`; `synthetic_state` = the basis's OR any evidence
version's (true wins); `rights_profile` and `residency_profile` the basis's; `retention_profile` declared, else the basis's, else the
evidence's (`retention_from` said — an extracted claim carries its evidence's profile, so it reads `basis`); `truth_state` the basis's;
`event_time` the basis's with its `source_clock_quality`; `valid_from` declared or the basis's event time (`valid_from_source` said);
`provenance_ref` `CLM:<id>@<v>` / `WRN:<id>@<v>`; `method_ref memory-derive@1.0.0`; `human_refs [principal:<owner>]`; `evidence_refs`
VERSIONED; `schema_ref MEM@v2` (a backward registry row: every v1 payload validates; human records stay MEM@v1, byte for byte).

**B19.3 — the basis followed; the deletion pause.** `attention_state` gains `basis_withdrawn` beside `basis_corrected`; the retrieval SERVES a
derived record whose basis was corrected or withdrawn WITH the declaration (`availability.basis_state current | corrected | withdrawn`,
`null` for a human record), never refused — the record's own withdrawal stays the record authority's act; the briefing composer carries the
same `basis_state` and the record's `synthetic_state` from its row (no longer a literal false). The marks: `graph.record_impact` re-declared —
the memory-item loop marks `basis_withdrawn` on a `claim_withdrawal` walk ONLY when the trigger object's latest version IS withdrawn (else
`basis_corrected`; a live claim propagated as a withdrawal marks nothing false) and NEVER downgrades a withdrawn mark; `memory.mark_basis_
withdrawn` — a direct mark for the two paths that withdraw a basis without a walk, asserting the caller's bound action is `retention.import.
revoke` (the B17 revocation's claim batch, one call per withdrawn claim inside the batch's transaction — unreachable while an imported basis is
refused, exercised as the port's unit) or `observation.correction.apply` (an evidence withdrawal through the corrections path, matching
`derivation.evidence[]` too); a human record is untouched by the port (the walk marks a human record's attention as before; the page shows
`basis_state` for derived records only). THE DELETION PAUSE (DP-37-005): `retention.load_bearing_references` gains branch (f), VERSION-AWARE and
for DERIVED records only — an active item whose `derivation.evidence[]` names the evidence object at a version in the deletion's scope, or
whose basis claim's lineage names the object's bytes digest — with the route "withdraw the memory record (memory.item.withdraw) or supersede
it on other evidence (memory.item.supersede); then resolve again"; the B11 deletion PAUSES naming `memory_item:<id>` (a human record citing
the same evidence stays a `dependency` residual: the person's words, not a copy). STATED: a warning-based record is not marked when its
warning's forecast is withdrawn as unfit (the warning stands, `input_unverified`; its record reads `basis_state current`); the listing
exposes a derived record's basis ids and digests (no content) to every lister; no consumer derives (proposals: a later batch); memory
retention is declared, not executed; `objects.admit_version` does not validate a payload against the registry (the harness's Ajv check does).

**B19.4 — the page and the walk.** `apps/web/app/graph/memory/page.tsx`: a "Derive from a source" section (`#derive-*`: the basis kind and
id with an optional version, the source kind, the class, the title, the audience, the validity, the retention, the related) with the answer
VERBATIM — the classification `declared / inherited / applied`, the derived statement and its digest, the source, the evidence versions,
the receipt — and the sentence "a derivation whose inherited classification your clearance in this domain does not cover is refused (you
could not read the record)"; the record form and the human supersede form list `human` only; the listing's Source column (`document ←
EVT:…@1`); the retrieval's ` · basis <state>`, ` · synthetic <bool>` and the served Derivation row; the supersede form re-derives a derived
record (prefilled from the served derivation). `apps/web/lib/graph.ts` `deriveMemory`. THE WALK: `e2e/phase6-memory.spec.ts` gains tests
8–9 — a claim IS reachable by API on the gate's own database: an upload contract, an agent and one CSV (the retention walk's idiom), a
method registered by a reader and a recorded-fixture response approved, activated, recorded and extracted by one `extraction_manager`; the
knowledge owner derives it through the form — the lift said, `retention … (basis)`, the ISO statement, the listing's `document ← EVT:…@1`,
the served Derivation block; then the queued claim 409, the telemetry 422 (no registered series on the walk's source), the reader's 403, the
human-only record form.

**B19.6 the harness, the gates and the units.** `phase6-memory-derived.test.ts` (6 cases on a fresh database, no scheduler — the outbox
rows asserted by presence and payload, the walks by the manual route; four confidential uploads A, B, X and the internal C and H): M1 DERIVED
(document) — the lift is REAL and ENFORCED ON THE DERIVER: the knowledge owner (clearance internal) refused 403 for a claim on the
confidential upload A with the canonical count unchanged, the DOMAIN ADMINISTRATOR admitted (`{declared internal, inherited confidential,
applied confidential}`), the owner's read-back refused, the versioned evidence refs, the derivation block served, the dependency rows, the
GraphChanged row with `cause memory.item.derive`, the port's own refusals (the digest mismatch, a human record with a derivation, a
derivation under `memory.item.record`, telemetry without series keys), `/record` with a non-human kind 422, the analyst's derive 403;
M2 THE GATES — queued, rejected, corrected (the successor named), withdrawn, imported → 409 each; M3 TELEMETRY on the REST fixture — the
series rule (422 before the registration, admitted with the keys after), a WARNING basis (inferred; the indicator and the breaching evidence
version in the block), the states `expired`/`closed` refused; M4 THE RECORD FOLLOWS THE BASIS — the evidence corrected → `basis_corrected`
with the invalidation named; the administrator re-derives on the new version → v2 with the recomputed statement, v1 replayable as of;
withdrawn by the THREE paths (a live claim propagated as `claim_withdrawal` → `basis_corrected`, the negative first; the claim withdrawn →
`basis_withdrawn`; an evidence withdrawal through `observation.correction.apply` → the direct mark; the revocation path as the port's unit)
→ the retrieval SERVES with `basis_state withdrawn`; a derivation from the withdrawn evidence → 409; the re-derivation of a `basis_withdrawn`
record on the same ground → 409, the mark intact; the authority withdraws the record; M5 THE DELETION PAUSE — the deletion of A's manifest
resolves `paused` naming `[M1, M4b, M4c]` at their record versions with the route; the three withdrawn → `scope_resolved`; the HUMAN control on
its own evidence H → `scope_resolved` with a `dependency` residual; B's deletion a second paused case naming the queued review case and the
derived records as the code answers; M6 THE BRIEFING carries the derived record with the basis's truth and synthetic state and
`basis_state current`, then `withdrawn` after C's withdrawal in a second composition — **6/6** on the first run and again after the
re-derivation's validity default. The neighbouring set — `phase6-memory-derived`, the four subscription harnesses (the two B9-F1 closure
pins widened to the retrieval's shape), `phase6-briefing-memory`, the eight retention harnesses B11–B18, `phase4-corrections`,
`phase5-corrections`, `phase6-executive-requests`, `phase6-interfaces-b18` — **245/245 in 20 files** on a fresh database; the full
integration suite **1061/1061 in 70 files** on a fresh database (twice: before and after the validity default); the upgrade proof with
0022–0079 (58 migrations above the ceiling; 79 files; the registry's 36 rows with MEM@v2; the digests equal; 275/275 on the upgraded data);
the unit suite **2295/2295** (= 2272 + 23: `memory-derive` 19 — the template, the digest, the fold, every gate — and the PDP describe 4) and
the meta suite 9/9; the web typecheck, build and 11 tests; the browser gate **48/48** (the B19 two on the hosted gate's own extraction).
The hosted run at `087736e` — ci 35174994149 (build-test job 105054615717: unit 2295/2295 and the meta suite 9/9, acceptance 58/58, the integration suite 1061/1061 in 70 files on a fresh database with `phase6-memory-derived` 6/6, the upgrade proof +58 rows / 79 files, C18 612/612 + 44; supply-chain green; browser-regression 48 passed — the B18 twenty and the B19 two on the hosted gate), C19 35174994150 — bound in the records commit (`evidence/cp6/hosted-087736e-build-test-summary.txt`).
Units and rows: AU-MEM-0065 keeps `verified:ci` with its last clause closed on the harness and the walk and bound to that hosted run (no promotion); V02-T-118,
V00-T-039, DP-37-001, DP-37-002, DP-37-005, CAP-UM-07 stay `partial` with the B19 clause (the ingestion connectors, the analyses object, the
index state and semantic retrieval remain; the observed series-window basis; the 'connect'/'retire' verbs); ES-29-002 carries the inheritance
clause; L3-I01 `bound_to` gains the derivation clause (the register 36/14/0 re-asserted; L3-I02 stays partial — the purpose-bound context
query is a later batch's); the split stays **3,555 = 3,181 open + 339 local + 35 CI** (no unit promoted by a local run). STATED: the
communication kind is exercised on the harness (the demonstration's communication-class sources carry no extracted claim); the source kinds
beyond the telemetry rule are the owner's declaration; a pasted basis id of another domain answers 404 (RLS); a re-derivation of a
CONFIDENTIAL record is a confidential-clearance supersede holder's (the domain administrator's on the harness).

**B19.7 the demonstration** — `scripts/phase6/act-b19.mjs` → `evidence/cp6/act-b19.txt` (rehearsed on a restored copy, `evidence/cp6/
b19-rehearsal.txt` — the fourth rehearsal held whole; the first three stopped on the act's own pins (the demonstration's REL basis is
ASSERTED since B16's review correction; a briefing composed from the whole history folds RESTRICTED because act IV's corridor scenario rests
on no forecast — the composer's rule, so the act continues the domain's newest briefing in its own room; the walk answers memory items under
`strategy_object_id`) and on one service default (a re-derivation of a record whose basis carries no event time now keeps the record's prior
validity)): `eye_demo` backed up and migrated with 0079 (the API, stopped for the browser gate, restarted on the B19 build); every basis LOOKED
UP AT RUN TIME (no id hard-coded; a refused candidate skipped with the reason); then (0) THE STATE — the register 36/14/0 with L3-I01's clause,
the memory items by source kind before the run, the seven subscriptions listed and LEFT (no consumer method changed); (1) TELEMETRY — K.
Müller derives the corridor's transit count from the newest PortWatch EVT claim `daily_transit_count` ("Suez Canal daily_transit_count 51 on
2024-01-16 — as of 2024-01-16"; extracted, never observed; the source `imf-portwatch-chokepoints@1` with its three registered series; the
evidence version, bytes digest and span; the classification declared/inherited/applied internal; the retention from the declared, the validity
from the basis), L. Brandt retrieves it under `memory` (`basis_state current`, the served derivation block), the `memory_item.recorded` row
with `cause memory.item.derive` and its deliveries (retrieval verified; the rest empty); the queued CLM `transit_change_vs_prior_day` REFUSED
at the review gate (409, the words printed); the corridor WARNING derived as an inferred telemetry record (the indicator and the breaching
evidence in the block); (2) DOCUMENT — the NORDWERK REL claim ("NORDWERK ANTRIEBSTECHNIK GmbH procures SYN-PART-BRG", asserted since B16's
correction, on the synthetic nordwerk-internal upload; validity declared — the basis carries no event time, said) derived by K. Müller →
DOC with `synthetic true` inherited, the internal ceiling, the retention from the basis; S. Okafor's briefing (continuing the domain's newest
briefing in its room) carries DOC with the basis's truth state, `synthetic_state true` and the derivation's basis — the six human records in
it keep `synthetic false` and no derivation; (3) COMMUNICATION — stated (option b) and one line on the kind's rule: the same REL derived as a
communication record (the source line still says upload), withdrawn by R. Adler in the same act; (4) THE LIFECYCLE — A. Hoffmann challenges
REL@4, L. Ferreira CORRECTS it in review → REL@5 (the `MemoryCorrected` row and the relationships subscriber's delivery printed, not
asserted), J. Weber propagates `claim_correction` → DOC marked `basis_corrected` with the invalidation named, L. Brandt's retrieval says so,
R. Adler RE-DERIVES DOC on REL@5 → version 2 with the restated value (the digest changed), attention none, L. Brandt replays version 1 as of
the instant before the correction; THE MIRROR — S. Roth (a holder) deriving from the IMPORTED REL → 409 in the words, K. Vogel (not a holder)
→ 403; (5) THE DELETION PAUSE — M. Dvorak corrects the evidence DOC copies from (EVD 1 → 2, the manifest and its digest kept — deletable),
the propagation AGENT's walk marks DOC `basis_corrected` (registered since B1; nobody called the route), P. Novák's deletion of the manifest
resolves PAUSED, 1 blocking, naming `memory_item:DOC` at record version 2 on REL@5 with its route (beside the edge on the same evidence), the
residual inventory printed, the action WITHDRAWN — nothing retired; (6) THE STATE — the listing's Source column for the run's four records,
DOC's events (recorded → retrieved (briefing) → attention → retrieved → superseded → retrieved → attention), the register after, what the act
leaves (the telemetry and warning records; DOC at version 2 `basis_corrected`; the communication record withdrawn; REL at version 5 and its
evidence at version 2 — a review correction and an evidence correction per run; the deletion withdrawn). ALL SCENES HELD (32 checks).

## B20 — the index tier: the six projection partitions with a derived watermark on every graph and memory read, the symmetric check that withdraws, the operator's withdrawal and the rebuild writer, the labelled last-valid reads and the constrained traversals, the memory content tier's metadata-only fallback, the deletion pause and the briefing's flag (implemented)

**Migration 0080** (`apps/api/migrations/0080_b20_index_tier_degradation.sql`, sha256 `663def51…`, 1,239 lines), on `phase6-b20`
(cut from B19's records head `3ea676d`; the PR base `phase6-b19`, stacked on #56 and retargeted to `main` when the stack merges; the
candidate was UNCOMMITTED while these records were written — the commit that carries them is the candidate). The register items every
checkpoint since B10 listed as Missing under "index-tier degradation behaviours": AU-MEM-0067 (content, permissions, retention, version
history or indexes diverge → restricted access, metadata-only or the last valid state with a warning; the content tier unavailable →
metadata-only, said), AU-MEM-0068 (a stale index or projection never appears current: a revision/projection watermark and a staleness
marker on reads, exploration degraded to a canonical or last-verified read with a label, affected traversals constrained and the revision
exposed), AU-MEM-0070 (projections derivable from their logs and rebuildable from the canonical records — `verified:local` since Phase 3 on
a JOIN-only case) and AU-MEM-0083 (a stale, incomplete, policy-inconsistent, poisoned or unapproved-representation index withdrawn,
retrieval falling back only to policy-equivalent methods, the rebuild from verified sources, the degradation exposed). Read by one reader in
B18 (`read-index-tier.md`: the one-paragraph answer, the four units, the specification text, the code map with its findings, what already
helped, the proposal, the touch points), designed by one designer and two checkers (FIVE blocking findings folded before a line was written
— C1 a live retrieval subscription that has applied no check reads `unverified`, never `current`; C2 the verified sequence is the live
contiguous applied prefix of the subscription's deliveries, the stored cursor answered beside it; C3 the retrieval check holds the six
partition locks shared; C4 a rebuilt event reaches six subscriptions, not seven; C5 the content read precedes the gates and a refused reader
consumes the armed fault point — and eighteen should-level corrections with the nits, `corrections.md` C1–C23), implemented by five
implementers on disjoint files and one compile/reconcile pass (six edits E1–E6, every one stated in §B20.3), run on fresh databases,
rehearsed on a restored copy and exercised on the demonstration (§B20.5).

**B20.1 — the reader's finding.** There is NO lexical or vector index in this repository: the index tier IS the set of derived `*_current`
projection tables every graph read serves from — `graph.entities_current`, `resolutions_current`, `edges_current`, `strategy_current`,
`invalidations_current` — and `memory.items_current`; "shard availability", "embedding compatibility", "analyzer version" and "recall
quality" have no referent here and the records say so; the REPRESENTATION VERSION of this index tier is the derivation rule (the
expected-state derivations, the state vocabularies, the resolver's normalisation). The check that existed (`graph.rebuild_projections()`,
0065) was JOIN-ONLY: it compared the state of the rows the projection and the log BOTH held, so a POISONED row (in the projection, absent
from the log) and a MISSING row (in the log, absent from the projection) passed it as `mismatched 0`; no rebuild writer existed (the
"repair" in the B7 harness's drift case is a superuser UPDATE); nothing recorded a partition's serving state; no read carried a watermark;
the memory projection's `index_state` was a per-row column (0066) that a per-row writer could never make say what the partition says. And
the fixtures were part of the finding: TWENTY-TWO integration files plant projection rows by superuser INSERT without the log events that
derive them — rows the symmetric check calls poisoned. The ✔ set — the files under which a retrieval subscription runs, so the corrected
check would have failed them — is corrected in B20 (the honest fixture: the event beside the row under one correlation id, the event's actor
the row's `created_by`): `phase6-fixtures.ts` (`bootDecisionWorld`'s entity, used by `phase6-interfaces-b18` and twelve other suites),
`phase6-graph-subscriptions.test.ts`, `phase6-graph-subscriptions-2.test.ts`, `phase6-repro-serving-lifecycle.test.ts` and
`phase6-retention-b17.test.ts` (the mirror's rows); `phase6-repro-retrieval-retry.test.ts` already carried its event. The ○ set — the files
that plant rows and register no retrieval subscription, so no check runs there and nothing fails: `phase6-graph-subscriptions-3` (C22: it
registers scenarios, memory-mappings, decisions and forecasts only), `-4`, `phase6-propagation-consumer`, `phase6-repro-event-delivery`,
`phase6-retention-b11`, `-b15`, `-b16`, `phase3-acceptance`, `phase3-corrections`, `phase4-acceptance`, `phase4-corrections`,
`phase4-corrections-calendar`, `phase5-corrections`, `phase5-propagation`, `phase5-simulations`, `phase5-twins` — sixteen files by a grep
for direct inserts into the six tables at the records head — is NOT corrected in B20 and is recorded here as the remaining honest-fixture
work: corrected when the hardening pass reaches the fixtures (the integrator's decision).

**B20.2 — the mechanism.** THE PARTITIONS AND THE LEDGER (0080 §1): `graph.projection_partitions` — one row per (tenant, domain,
projection), the six names, `state serving | withdrawn`, the withdrawal's instant, actor, reason and check (`withdrawn_by_check` names a
check row without a foreign key: the check is written first in the same transaction and the ledger is append-only), `representation_version`,
the last rebuild — seeded at 0080 for every row of `tenancy.domains` (six per domain; the demonstration's two domains) and created lazily by
the two ports for a domain created later; the append-only ledger `graph.projection_events` (`projection.withdrawn | projection.rebuilt |
projection.restored | projection.rebuild_refused`); both FORCE RLS under `graph_isolation`. THE REPRESENTATION CONSTANT
`graph.projection_representation_version()` = `'1'` — the version of the derivation rule; a change to the rule bumps it by migration (B20
bumps nothing). THE ONE DERIVATION (§2): six SET-RETURNING SQL functions, `LANGUAGE sql STABLE`, run as the CALLER under the event tables'
forced RLS — `graph.expected_entities(p_tenant, p_domain)`, `expected_resolutions`, `expected_edges`, `expected_strategy`,
`expected_invalidations`, `memory.expected_items` — the expected state of each projection from its log: ONE rule for the check, the rebuild
and the fallback reads. Functions and not the brief's `security_invoker` views, stated with the reason: a view cannot carry the
tenant/domain filter inside its `DISTINCT ON`, so a domain read would scan every tenant's log before discarding; the parameterised function
keeps 0065's plan. `memory.expected_items` carries the POLICY columns of the version the log names — the canonical header's classification,
the payload's audience roles and purposes in payload order, the accountable owner (C6, AU-MEM-0083's "policy-inconsistent") — and
`row_derivable` false where the canonical version is absent (the content tier's absence, not a policy drift). THE SYMMETRIC CHECK (§4):
`graph.rebuild_projections()` re-issued under the SAME name (DROP + CREATE — the signature changed), still a COMPARISON: per projection
`live_rows`, `rebuilt_rows`, `mismatched` (the joined rows whose state differs — for memory: state, version and the three policy columns),
`missing` (expected − live), `unexpected` (live − expected: the poisoned rows), `representation_ok` — SIX rows, `memory_items_current` the
sixth. `graph.record_retrieval_check` (§6) re-issued: it takes the six partition locks SHARED in the fixed order — the same keys
`graph.rebuild_projection` takes exclusively, `hashtextextended('graph.projection.rebuild:<domain>:<projection>', 0)` — so a check waits for
a rebuild in flight and its comparison snapshots after that commit, and a rebuild waits for a check's withdrawals (C3: without it a check
computed before a rebuild would, under READ COMMITTED, re-withdraw the restored partition from a stale comparison and only a second
human-gated rebuild could bring it back; two checks share, a rebuild takes one key, no cycle); it sums `mismatched + missing + unexpected +
(NOT representation_ok)` into the recorded `mismatched` (the column kept), stores the extended per-projection JSON with `failed`, and
WITHDRAWS every failed partition in the same transaction through `graph.withdraw_projection` under the subscriber's own action
(`graph.retrieval.subscription.apply`, the check id required) — the consumer's effect stays `projections.mismatched` unresolved (the B7 rule;
the unresolved text C10's: "retrieval check …: N projection row(s) differ from their event logs (or a partition's representation is outdated)
after …; partition(s) … withdrawn — rebuild them under graph.projection.rebuild; operator repair required"); every failed re-check (the
dispatcher's ten-minute tick, every later event's check) appends another `projection.withdrawn {changed: false}` row per failed partition
until the rebuild — the append-only ledger IS the evidence of a standing failure (C11). `METHOD_REF.retrieval` changed → the retrieval
consumer's digest changed → every live retrieval subscription is re-registered (the harnesses register fresh; the act revokes and registers
anew in both domains). THE OPERATOR'S WITHDRAWAL (§5): `POST …/graph/projections/:projection/withdraw {reason}` under
`graph.projection.withdraw` — exact, human-gated, C2, `requiresPurpose`; the platform administrator at PLATFORM, the tenant administrator
at TENANT, the domain administrator at DOMAIN — through `pipeline.write` with `GraphCapability.projections`, the withdrawal's own event id
the write's target (`PRJ`); idempotent — a second withdrawal records a second ledger row with `second_reason`, keeps the first reason and
changes no state; no outbox event (a withdrawal is not a graph change); a reason under eight characters 422, a name outside the six 404 at
the controller, another domain 403 `EYE-TEN-001` (no binding there — C13). THE REBUILD WRITER (§7) — the ONLY way back to `serving`:
`POST …/graph/projections/:projection/rebuild {reason}` under `graph.projection.rebuild` (the same holders, human-gated, C2) →
`graph.rebuild_projection` SECURITY DEFINER under the partition's EXCLUSIVE advisory lock and its row `FOR UPDATE`, the partition
REQUIRED `withdrawn` ("projection rebuild rejected: the <p> partition of this domain is serving; withdraw it first
(graph.projection.withdraw) or let the retrieval check withdraw it" → 409 `EYE-STA-002`); FIRST the held-poison pre-check (C8): a poisoned
ENTITY held by an edge, a resolution or an identifier — each holder CLASSIFIED `derived` (the log derives it; a person decides) or `poisoned`
(itself an unexpected row of ITS partition — rebuild that partition first, which removes it) — and a poisoned STRATEGY object cited by a
decision package are REFUSED before anything is written, the holders named in `referenced` with `held_by_derived`/`held_by_poisoned`; the
references no constraint holds (`graph.dependencies`; the prediction rows' `subject_entity_id`) are NAMED in `dangling` and left in place;
then, inside ONE plpgsql exception block: UPDATE the drifted rows' state and companion columns from the expected row; INSERT the missing rows
from what carries them — an entity from `entity.created`, a memory item from the canonical MEM version the log names (the policy columns from
the §2 derivation), a strategy object from its canonical object, an edge from `edge.asserted` PLUS the claim's `intelligence.claim_lineage`
row for the five provenance columns the edge log lacks — or NAME the row UNREBUILDABLE ("no claim lineage row for claim …@1: the
provenance columns …"; a resolution always — its log carries no row; an assessed invalidation; an edge with reassessment events; a memory
item whose named version has no canonical record — N4), never fabricate; DELETE the unexpected rows; set the representation version to the
constant; run the check for this projection — any count above zero, any unrebuildable row or a constraint violation ROLLS BACK the block and
the port records `projection.rebuild_refused` with the report and answers `outcome 'refused'` (200: a refusal is an outcome on the ledger —
the B18.1 idiom); on success `state 'serving'`, the withdrawal columns cleared (the ledger keeps them), `projection.rebuilt` (rows written)
or `projection.restored` (updated + inserted + removed = 0 — the demonstration's case) with the report cut at 200 (the ledger event keeps
the whole `dangling` list). THE DERIVED WATERMARK (§3): `graph.projection_state()` — SECURITY DEFINER, context-scoped; the callers
`graph.read`, `observation.read`, `memory.item.retrieve`, `briefing.compose` — answers the six rows in a fixed order with the watermark
NEVER STORED: `revision_seq` (the domain's latest GraphChanged/MemoryCorrected `partition_seq`); `verified_seq` — THE LIVE CONTIGUOUS
APPLIED PREFIX of the retrieval subscription's deliveries over that sequence (C2: the stored cursor is the dispatcher's, advanced only inside
the finish of the delivery being applied, so a later event verified while an earlier one stands unresolved is never re-covered when the
earlier one applies on its re-drive — the prefix is; the cursor is answered beside it as `checkpoint_seq`); `verified_at` and
`verified_check_id` (the passing check of the event that closes the prefix); `lag_events`; `unresolved_deliveries`; the subscription and its
status; the withdrawal columns; `representation_version`, `representation_current`, `representation_ok`; the last rebuild; the last check's
row — and the condition: `withdrawn` (the row says so) > `unverified` (no live retrieval subscription, OR one that has applied no check yet
— C1: a subscription with no applied delivery has no watermark) > `lagging` (`lag_events > 0`) > `current`. Lag is VERIFICATION lag: the
ports write a projection and its log in one transaction, so the label never calls the rows stale. THE TWELVE READS AND THE LABELS:
`projectionStateOf(cap, partitions)` is the FIRST await of every read's transaction — so the rows read after it are never OLDER than the
stated revision (newer under READ COMMITTED, said) — on `/search`, `/entities/list`, `/entities/:id/get`, `/edges/list`, `/neighbourhood`,
`/path`, `/strategy/list`, `/strategy/:id/get`, `/overview`, `/memory/list`, `/memory/:id/get` and `/memory/:id/retrieve`; every answer
carries the block `projection: { revision, verified_seq, verified_at, verified_check_id, checkpoint_seq, lag_events, unresolved_deliveries,
subscription, partitions[…], condition, degraded, code, label, withdrawn, domain_withdrawn }` — the ROUTE's partitions decide its condition
(`ROUTE_PARTITIONS`: the search reads `entities_current` alone, so it stays `current` while `edges_current` is withdrawn, the domain's
withdrawal named in `domain_withdrawn`); `degraded` iff `withdrawn`; `code 'EYE-DEG-001'` iff degraded — the catalogue's
`capability_degraded`, DECLARED on a served-but-constrained 200 answer and as the evidenced retrieval's audit `result_code`, RAISED as 503 in
the one case below (a client mapping codes to statuses reads the status, not the code); the label is the wording and the flag the fact — the
pages render from the flag: `current` → none; `lagging` in two forms — plain ("verified through revision N (at T); K change(s) since are not
yet verified by the retrieval subscriber — the ports write a projection and its log in one transaction, so this is verification lag, not
data lag") and HELD ("verified through revision N (at T); the retrieval subscriber's checkpoint is held there by K unresolved delivery(ies)
(a failed check: partition(s) … withdrawn until rebuilt | a failed check whose partition(s) have since been rebuilt; the delivery clears at
its re-drive); M change(s) since are checked as they arrive but not checkpointed — …"); `unverified` in two forms told apart by the
subscription ("no live retrieval subscription verifies this domain's projections; the projection watermark is unknown" | "a retrieval
subscription is registered and has verified nothing yet (no check applied); the projection watermark is unknown until its first check
applies"); `withdrawn` per withdrawn partition of the route ("the <p> projection of this domain is withdrawn since <at> (<reason>); this
answer is derived from the event log — the last valid state — and is labelled; it resumes from the projection when it is rebuilt (POST
…/graph/projections/<p>/rebuild (graph.projection.rebuild))") with the domain's lagging or unverified sentence appended — the eight forms
pinned byte for byte by the unit test and the harness. THE WITHDRAWN-MODE READERS (`graph/projections/fallback.ts`): while a partition is
withdrawn the LISTING and GET routes serve the LAST VALID STATE — the expected function joined to the projection row: the state the log's,
the attributes the log does not carry from the projection row flagged `from: 'projection'`; a row the log has and the projection lacks
METADATA-ONLY (`projected: false` — an entity as its id, state, name and type from `entity.created`, an edge with its provenance columns
null, a memory item built from the canonical version the log names without its statement, `index_state 'stale'`); a row the projection has
and the log lacks (poisoned) NEVER served (`/entities/:id/get` of one answers 404 as an absent entity; the search's log leg cannot match
it); every drifted row `drift: {projected, log}`. `/search`'s entity leg runs over `expected_entities` while `entities_current` is withdrawn
(each hit's `extra.from 'log'`) and the search gains, always, `complete: {entities, objects}`, `bounds: {entities: 1000, objects: 2000}` and
the note when a bound is hit ("the entity scan is bounded at 1,000 rows and the object scan at the 2,000 newest; a match beyond a bound is
not returned") — the silent bounds said. The TRAVERSALS (`/neighbourhood`, `/path`) with `edges_current` OR `entities_current` withdrawn
walk the log-derived edge state CONSTRAINED to depth 2 with `bound.projection true`, `depthClamped` when more was asked and the label first
in the notes — the walk, not a refusal (IA-34-005 "constrain affected traversals, expose revision"); `/edges/list` from the log (`from
'log'`, `visibleAt` over the log's own instants); the strategy routes the log-join; `/overview` per section `from: 'log' | 'projection'`
with `projection.withdrawn`. Every fallback reads the SAME forced-RLS tables under the SAME capability and action: nothing new is granted —
policy equivalence, the analyst reads what the analyst may read. `/projections/verify` keeps its route and action, answers the seven columns
and the note that it verifies and withdraws nothing (C10). THE MEMORY CONTENT TIER (D9): the CONTENT tier = the canonical version payloads
(memory items, claims) and the evidence bytes in the vault; the METADATA tier = the six projections and the canonical header. In
`MemoryService.retrieve` the canonical read runs under a savepoint at the fault point `b20.memory_content_unavailable` (armable in the test
profile only); an injected fault or a STATEMENT-level failure that leaves the connection alive (SQLSTATE classes 53, 58, XX; `57014`,
`55P03` — `isContentTierFailure`) answers 200 METADATA-ONLY: `content 'unavailable'`, `version null`, `versions null`, `accessId null`,
`degraded {kind 'content_unavailable', code 'EYE-DEG-001', label "the content tier did not answer; this is the item's metadata (its state,
versions and audience) — the statement is not served; retry or contact the operator", detail}`, NO access row (the access ledger requires a
served version) and ONE `memory.item_events` row `memory.retrieval_degraded` through the new port `memory.record_retrieval_degraded` (§8),
the request's audit row `result_code 'EYE-DEG-001'` with `content 'unavailable'`. The content read precedes the gates (the served-version
gates need the canonical rows — B9-F1), so a refused reader consumes the armed point and learns nothing (C5); while the tier is down the
PURPOSE gate is the item's audience LIST alone — narrower than the serving gate, never wider — because the admitted purpose is the canonical
version's and cannot be checked (C7: "a memory item is read under a purpose its audience declares (…); the admitted purpose cannot be
checked while the content tier does not answer; this read states <purpose>" → 403); the clearance and the roles gates as before. THE ONE
REFUSAL B20 adds to a read: `memory_items_current` withdrawn AND the content tier down → 503 `EYE-DEG-001` ("the memory_items_current
projection of this domain is withdrawn (since …: …) and the content tier did not answer; nothing verified remains to gate a metadata answer
on — retry when the content tier answers, or after the rebuild (graph.projection.rebuild)") — the first 503 a SERVICE raises and the first
use of `EYE_DEG_001` in `apps/api/src`, beside the pipeline's `EYE_INT_001` audit-unavailable 503s. A connection-class failure (08xxx,
57P01–57P03) kills the transaction and the request fails as before (the audit row cannot be committed on a dead connection) — a deviation
from the brief's "57P01/08xxx", stated. The EVIDENCE-bytes case is OUT (D10, the A7 doctrine): `observation.evidence.retrieve` keeps
`EYE_INT_001` 409 for every vault failure — a metadata-only 200 for a missing read beside a 409 for a corrupt one would let a caller learn
which manifests still hold bytes, an oracle the vault's contract forbids; the evidence tier's degradation is declared without one (`tier`,
`availability` — B11 — and the custody row). The retrieval's `index_state` is COMPUTED (`stale` while the partition is withdrawn,
`projected` otherwise); `memory.items_current.index_state` is retired in place by a comment (D22). THE DELETION PAUSE (§9, D11):
`retention.begin_execution` re-declared (0072's body copied whole; the block after the approver check and BEFORE the manager's checks and
the lock — no attempt counted, nothing locked) refuses a DELETION while `edges_current` or `memory_items_current` of the domain is
withdrawn — "retention execution rejected (projection_withdrawn): the safe referential scope reads a projection that is withdrawn — <p>
(since <at>: <reason>); the scope cannot be proven until it is rebuilt (graph.projection.rebuild); the action pauses for human review" —
and the controller's `ADMISSION_REFUSAL` with the service's `failureClassOf` map it `projection_withdrawn → unresolved_dependency →
human_review` (the approvals revoked, `attempts 0`); the rebuild, a re-resolution and a new approval execute it. The resolve step is not
gated (the execution re-proves the references over the rebuilt projection); only the two projections `retention.load_bearing_references`
reads are gated — the review, decision and briefing current tables it also reads are outside the partition model. THE BRIEFING (D12; E4):
the composer reads `projection_state()` under the memory step's reservation; while `memory_items_current` is withdrawn the memory
availability comes from `memory.expected_items` (the shared fallback, by the candidates' ids — C15), `degraded` is true, the agent's
`on_degraded` stop names the reason ("stop condition on_degraded: the memory projection of this domain is withdrawn (the memory items are
served from their log, labelled)"), the compose answer carries the full `projection` block, and the content's WATERMARK carries `projection:
{memory: 'serving' | 'withdrawn'}` — the STATE only, never the watermark's numbers, so the same inputs compose to the same digest (B10-F2).
On the watermark and NOT at the content's top level — a deviation from the design's D12, stated with the reason: BRF@v1's registered schema
declares `additionalProperties: false` on the payload, and a top-level `projection` made every stored briefing invalid against its own
schema (the B10-F4 replay pin failed with "payload schema violation: / must NOT have additional properties"); the watermark's sub-schema
admits the key, the registry stays 36 rows (no BRF@v2 in B20), the harness's P6(a) and the act read `payload -> 'watermark' -> 'projection'`.
THE REBUILT EVENT AND THE CONSUMERS (D8; C4): the rebuild's handler publishes ONE `GraphChanged/projection.rebuilt` — `identities []`,
`relationships` empty, `objects {…EMPTY_REACH, walked: false}`, the typed block `projection {projection, outcome, rebuild_id, updated,
inserted, removed, restored[≤200] with restored_truncated, check, representation_version, withdrawn_since, withdrawn_reason,
withdrawn_by_check}`, `cause {action 'graph.projection.rebuild', actor, target_type 'PRJ', target_id}` — the changed rows in the typed
block and NOT as identities or edges (a deviation from the brief, stated: `touchedIds` would have fed the restored ids to the forecast and
scenario consumers' dependency selection and marked forecasts and scenarios for attention on a rebuild that changed no fact of the world);
with empty identities, edges and objects the six other consumers resolve NOTHING by construction (`touchedIds` empty, pinned by the unit) —
the retrieval consumer re-verifies (one item, `projections.verified`) and its earlier unresolved delivery clears at its re-drive. The event
reaches SIX subscriptions: the relationships subscriber is registered on `MemoryCorrected/claim.corrected` and receives no GraphChanged — a
fact of the registry, pinned by its absence (C4). A DELIVERED event and NON-EMPTY consumer work are told apart throughout: on the
demonstration the retrieval delivery carried one item and the five others were applied with nothing. THE PDP, THE MAPPER, THE REGISTER: two
exact human-gated administrator rules after `graph.subscription.replay` (no prefix rule catches `graph.projection.*`; five near-names pinned
indeterminate); the refusal families in the mapper's order — standing 403 ("recorded by the acting principal"), absence 404 ("is not a
projection of this domain"), the record's state 409 (the serving partition; the deletion pause), the caller's request 422 (the reason's
length; the subscriber's missing check id) — the 409 texts probed unshadowed by the 422 family; L3-I02 RetrieveContext's `bound_to` gains
the clause (every graph and memory read declares its product state — the projection block — and serves partial or stale only labelled),
the row STAYS `partial` (the purpose-bound context query is owed), the register re-asserted 36/14/0; no registry row and no role (the
upgrade proof moves `public.schema_migrations` 58 → 59 only). THE PAGES AND THE WALKS (D16; D19): `/graph/subscriptions` gains
"Projections (the index tier)" — the six rows (the condition from the FLAG, the state, revision / verified through / lag, withdrawn since
and the reason, the representation, the last rebuild, the last check's mismatched / missing / unexpected), the domain's watermark line,
`#preason` and two governed buttons per row (Withdraw — critical; Rebuild), the answers verbatim, a refused rebuild's `unrebuildable` /
`referenced` / `dangling` lists, the projection events, and Missing · Unexpected · Representation · Withdrawn on the retrieval-checks
table; `/graph/explore` and `/graph/search` render the label beside the as-of line from the flag with the code, the constrained walk's own
note, the bounded search's note and the `log-only` / `drifted` marks; `/graph/memory` renders the metadata-only answer ("Content
unavailable." with the label and the code; no version served, no access recorded) and ` · projection <condition> · index <index_state>`;
`/graph` (the overview) a Projections row of six conditions and each section's "(from the event log — the projection is withdrawn)";
`apps/web/lib/graph.ts` the types, the two clients and the two pure helpers `projectionNote`/`searchBoundNote` (four vitest cases). THE
WALKS: `e2e/phase6-memory.spec.ts` test 2 asserts the retrieval's ` · projection unverified · index projected` line with C1's first form
byte for byte — the gate has no scheduler and no subscription, so `unverified` is the honest condition there; `e2e/phase6-projections.spec.ts`
(three tests): the Projections table with six `unverified` rows under representation 1; the domain administrator withdraws `entities_current`
with a reason → the SEARCH page (a query on the empty domain) renders "Projection withdrawn." with the label and `EYE-DEG-001` → the
rebuild `restored — updated 0, inserted 0, removed 0` and the label gone; the refusals in the page's words (a rebuild of the serving
`edges_current` 409 `EYE-STA-002`; the analyst's withdraw 403 `EYE-AUT-001` with the Withdraw button disabled until `#preason` is filled —
C23) and the landmarks. The explore page is NOT walked on the gate (an empty domain answers "No entities have been resolved yet"; seeding
entities there needs the extraction fixture and a resolution run — outside the walk's budget): the explore label is pinned by the harness's
`/neighbourhood` and printed by the act.

**B20.3 — what is stated.** (1) There is no lexical/vector index: shard availability, embedding compatibility, analyzer version and recall
quality have no referent and are said so; the representation version is the derivation rule (the `expected_*` functions, the state
vocabularies, `RESOLVER_RULE_VERSION`/`normalizeName` — a change to any bumps the constant by migration). (2) Lag is VERIFICATION lag: the
ports write projection and log in one transaction; the label says so and never calls the rows stale. (3) The edge log lacks the provenance
columns: a missing edge is rebuilt from `edge.asserted` + the claim's lineage row or reported unrebuildable naming the claim version — never
fabricated; a resolution's log carries no row — a missing resolution row keeps its partition withdrawn until a person restores the row
outside governance from its record or a later act re-creates it; no exit exists in B20 (the state's derivability is the log's, the row is
the proposer's — C14); an assessed invalidation's lists are counts in its log (unrebuildable; an open one derivable); an edge with
reassessment events is unrebuildable (the reassessment record is a person's decision path outside the state derivation). (4) A poisoned
entity held by a derived edge, resolution or identifier is refused by the rebuild and left to a person — the partition stays withdrawn, the
reads labelled, no forced-removal act (the harness's DX is left so); one held only by poisoned holders names the partition to rebuild first;
a poisoned strategy object cited by a decision package is refused likewise; the references no constraint holds (`graph.dependencies`, the
prediction rows' `subject_entity_id`) are NAMED in the report as `dangling` and left in place; a twin's boundary list is not consulted. (5)
A withdrawal blocks no WRITE ("queue writes when validation is unavailable" stays ES-34-009's remaining work); a write during a withdrawal
lands in both log and projection and the rebuild re-verifies it. (6) Under READ COMMITTED the rows a read serves can be NEWER than the
block's revision, never older. (7) The content-tier fault answers metadata-only for an injected fault or a statement-level failure that
leaves the connection alive (classes 53/58 include conditions after which the backend may not survive the statement — then the request
fails as before); a connection-class failure (08xxx, 57P01–57P03) kills the transaction and fails 5xx as before. (8) The evidence bytes'
unavailability stays `EYE_INT_001` 409 (A7; D10). (9) The deletion's resolve step is not gated; the review, decision and briefing current
tables `retention.load_bearing_references` also reads are outside the partition model. (10) The intelligence/prediction/twin/simulation/
decision projections keep their read-only diagnostics; `graph.dependencies` and `graph.entity_identifiers` are not partitions; the partition
model extends to them later. (11) The demonstration cannot exhibit a real drift, a poisoned or a missing row without corrupting the copy —
the harness carries P2–P5; the demonstration's rebuild is a restoration (`updated 0, inserted 0, removed 0`), said; the fault point is
armable in the test profile only. (12) The rebuilt event names the changed rows in a typed block, never as identities: a consumer that
wants to react to a rebuild reads the block — none does in B20. (13) `memory.items_current.index_state` is retired in place; the
retrieval's `index_state` is computed. (14) The twenty-two fixtures: the ✔ set corrected; the ○ set (sixteen files) recorded as follow-up
honest-fixture work (§B20.1). (15) The gate's memory walk asserts `unverified`; the explore label is pinned by the harness and printed by
the act. (16) `withdrawn_by_check` names a check row without a foreign key. (17) A retrieval check waits for a rebuild in flight on any partition of its domain and a rebuild waits for
a check in flight; a statement timeout on the dispatcher side fails the delivery `infrastructure` and it is re-driven (the shared locks are
held only for the comparison and the withdrawals); the lock's serialisation is proven by the keys — the migration's probe held fourteen
advisory locks inside one transaction and none after — not by two concurrent processes. (18) The degraded memory read's purpose gate is the
audience list (narrower than the serving gate, which also admits the purpose the item was admitted under); a memory retrieval while its
partition is withdrawn AND the content tier does not answer is refused 503 — nothing verified remains to gate a metadata answer on. (19) A
migration that bumps `graph.projection_representation_version()` withdraws every partition of every domain at its next check and each
returns to service only by a human-gated rebuild — six per domain, in the order entities → resolutions → edges → strategy → invalidations →
memory (the runbook §8 names it); meanwhile every read is served from the log under the NEW rule, labelled; the bump migration decides
whether it rebuilds in place (a migration-side path the writer's context-scoped port does not offer today — deferred to the migration that
first bumps the constant) or accepts the operator's rebuilds; B20 bumps nothing. (20) Verification is event-driven: a row tampered after
the last check is served as `current` until the domain's next GraphChanged/MemoryCorrected event (the check runs in the retrieval consumer
only); the operator's verify route reports and withdraws nothing. (21) The projection block is attached to the twelve exploration and memory
routes; `/resolutions/queue`, `/resolutions/:id/get`, `/mappings/list`, `/impact/preview|propagate|awaiting|list` and
`/edges/:id/reassessment/keep` read the same projections and serve a withdrawn partition UNLABELLED — operator and agent surfaces, not
exploration; the next batch — so "no read appears current" is scoped: no EXPLORATION or MEMORY read (the twelve) appears current. (22) The
memory check compares state, version and the three policy columns; a drifted CONTENT column (title, statement, source, validity, retention,
related) with a correct version is NOT detected — the rebuild's UPDATE re-projects them only for a row the check found drifted; the content
a retrieval serves is the canonical version's (B9-F1), so a content drift misleads listings only. (23) `EYE-DEG-001` is DECLARED on a
served-but-constrained 200 answer and the evidenced retrieval's audit `result_code`, and RAISED as 503 in the one case of (18); a client
mapping codes to statuses reads the status, not the code. (24) THE RECONCILE PASS: the boundaries gate (`pnpm boundaries` — `no-circular`
with type-only imports counted) was RED on the tree as the five implementers left it — two type-only cycles, `graph.capabilities.ts →
projections/projection-state.ts → graph.capabilities.ts` and `edges/edges.service.ts → projections/fallback.ts → edges/edges.service.ts` —
and GREEN after E1 (`projectionStateOf` typed on a structural `ProjectionStateReads`, the `GraphReads` import gone) and E2 (the edge row's
shape declared locally as `EdgeRowShape`, the `EdgeRow` import gone): the rule — `projection-state.ts` imports nothing from
`graph.capabilities.ts` (which imports `ProjectionName` from it) and `fallback.ts` imports nothing from `edges/edges.service.ts` (which
imports `edgesFromLog` from it); E3 widened the B9-F1 closure's whole-object `availability` pin (`phase6-graph-subscriptions-4:449`) by the
three partition-level fields `index_state/projected/drift` the design's §8.3 sweep had missed; E4 the briefing's watermark (§B20.2); E5
typed `recordRetrievalCheck`'s `withdrawn` answer on the capability; E6 the consumer's read of it. (25) THE IMPLEMENTERS' OWN DEVIATIONS,
each stated in its report and carried here: the migration's memory and strategy writers take the policy and owner columns from the §2
derivation (one derivation for the check and the writer; a malformed `accountable_owner` yields NULL instead of a refusal), the success
ledger event keeps the whole `dangling` list where the answer keeps the cut one, four indexes (C2's `gsd_subscription_applied_seq` beside
the three), no `schema_migrations` INSERT in the file (the runner's), the derivation bodies said to be single SELECTs the planner MAY inline
(the design's "inlined by the planner" not asserted) and a FILTER count parenthesised; the API's `resolutionsKnownAt` (the known-at
predicate over log-joined rows — a new export), `overviewFromLog` computing all five sections in one path (a metadata-only resolution from
the log counts toward the state counts alone — `automatic`/`modelAssisted` need the projection row's `decided_by`/`method`),
`status.projections` rows carrying the port's columns AND the block's partition shape, the label first in the notes only when the walk is
constrained, the `/neighbourhood` answer carrying `bound.projection` and `depthClamped` at the top level AND inside `neighbourhood` (the
harness and the pages read them where they ride; `/path`'s `bound` pinned exactly) and the overview's block inside `overview`,
`/entities/:id/get` handing `claimsFor` only the mentions that carry a `claim_object_id` (a log-only resolution has none; byte-identical for
projection rows), a memory item the log names at a version the content tier does not hold served from the log as metadata alone with
`content_tier 'absent'` and `projected false` rather than dropped (the rebuild names it unrebuildable), the log-derived edge rows carrying
`null` in the provenance columns the projection types as strings (`LogEdgeRow`, a stated cast) with `asserted_by`/`retracted_by`/
`superseded_by` beside them, a search hit from a log row without `updated_at` answering `recorded_at null`, the retrieval route recording
the access from `versionServed` on the served branch alone (the metadata-only answer returns before it), the PDP pin holding the tenant
administrator at a TENANT binding and a `tenant_admin` bound at the DOMAIN scope DENIED (the rule's scope), eight label forms pinned where
the corrections list eight under "seven", the metadata-only `availability` with `versions null` and `served_is_current null`, the
retrieval's answer a discriminated union (the served answer byte-identical to before), the rebuilt event's `restored_truncated` the
builder's cut OR the port's own flag (the port cuts at 200 first), the projection state read under the memory step's existing reservation
(the agents' read-budget counts unchanged); the executive
capability gaining four plain reads beside `projectionState`/`expected` (the shared fallback's structural pick); the web's
`ProjectionStateRow`, `bound.projection` read wherever it rides, the explore page's own "constrained" note (a constrained walk that
completes within two hops would otherwise have said nothing), ` · code EYE-DEG-001` rendered beside every degraded label on the four pages
(the design's search snippet applied to all), the retrieval-checks table's fourth column, `apps/web/lib/graph.test.ts` (the web tests read
15, not eleven), the memory walk's assertion after the served line, the projections walk's disabled-button pin and its "no unnamed
control" assertion, the `ci.yml` comment above the step extended (the B19 two, the B20 three; a record, not a gate condition), no
`getStrategy` client to widen (the strategy page reads `listStrategy`, which gained the block); the
harness's P3 order (c) BEFORE (b) — C8's "held only by rows the log does not know either" text is unreachable while a derived holder stands
in the domain, so the poisoned-only shape is exercised first and (b)'s withdrawal answers `changed false` — `bootDecisionWorld` before the
subscriptions (its many writes kept out of the six subscriptions' deliveries), the upload H uploaded and withdrawn inside P7 (a briefing
composed in P6 cites every corrected evidence version of the domain and blocks its own deletion at resolution — B10's rule), a control
agent run before P6's drift, P7's last event `execution.finished` (the vocabulary has no `action.executed`), the C11 pin at `-2:283`
reformulated — this event's three `projection.withdrawn` rows selected by check id and their count 3, the state withdrawn, and `changed`
pinned over the WHOLE ledger (exactly its first row true, every later one false: the ledger carries more rows of the same shape, because
that case's B18 `GraphChanged/twin.state_changed` deliveries fail on the same drift and are re-driven beside this event's — six rows on a
fresh database in the reconcile pass), `triggerChange`'s fresh edges carrying their events but no lineage row (a retracted edge is never
missing), the act registering the retrieval kind only where a live subscription stood, L. Brandt's item the newest active INTERNAL one whose
audience admits `memory`, the act's deletion `open` passing the candidate's `retentionProfile` beside the selector and testing a hold by
`observation.legal_holds … lifted_at is null` (the act-b19 idioms), the `::text` casts inside `jsonb_build_object` (pg cannot infer a
variadic parameter's type). (26) The web tests
read 15 = 11 + 4 (a new test file in the web's own scope); no evidence file carries them (the reconcile pass and the integrator's run, as
B19's "11 tests" before). (27) B20's PR was not yet open when these records were written (the candidate uncommitted); it opens with base
`phase6-b19` once the candidate is pushed.

**B20.4 — the harness.** `apps/api/test/int/phase6-graph-projections-b20.test.ts` (1,029 lines): nine cases in the order P1, P2, P3, P4,
P5, P6, P7, P9, P8 on a fresh database with the scheduler on, ALL SEVEN consumers registered in the main domain D (the B18 `register(kind)`
idiom; every GraphChanged wait counts the SIX graph kinds and pins the relationships subscriber absent), a second domain DX for the
held-poison refusal so D's `entities_current` is never left withdrawn, the world planted WITH its events (E1 `Bab el-Mandeb Strait`, E2
`NORDWERK Magnet GmbH`, E3 `E3 Holding AG`; the edge X1 with its `edge.asserted` event and a `claim_lineage` row; the memory item M1 recorded
through the route), and every case ending in a `B20 EVIDENCE` line naming the SIX items V04-T-024/026 demand — the fault trace, the
affected-product watermark, the consumer behaviour, the operator action, the recovery, the reconciliation (17 lines; the run's log IS the
record — `evidence/cp6/b20-harness.txt`):
**P1 · the watermark on every read** (AU-MEM-0068; V03-T-108; FEX-08; PR-19-001/-002; DP-33-005) — one applied change → all twelve routes
`current` with `revision === verified_seq === checkpoint_seq` (23 on the first run), `verified_check_id` the check's, `lag_events 0`, the
route's partitions named, every partition `serving` under representation `1`; the retrieval subscription PAUSED → the next change (24) →
the five other deliveries terminal, no retrieval delivery → every read `lagging`, `lag_events 1`, the plain label byte for byte; RESUMED →
the re-drive applies it → `current`; REVOKED → `unverified` in the first form, `verified_seq null`, `subscription_id null`; registered anew
(`backlog 'leave'`) → BEFORE the next change every read `unverified` in the SECOND form (C1: the new id, `status 'active'`, nothing
verified), THEN the next change → `current` at 25. SIX: the pause/revoke/register ids; the revision and the verified sequence per state;
the twelve answers' condition; pause, resume, revoke, register; the applied re-drive and the fresh subscription's first check;
`verified_seq == revision == 25`.
**P2 · drift → the automatic withdrawal → the labelled last-valid reads and the constrained walk → the rebuild → the passing check and
the re-driven delivery** (AU-MEM-0068/-0070/-0083 "stale"; IA-34-005; V03-T-098/-112) — superuser `update graph.entities_current set
lifecycle_state = 'retired'` on E1; the next change's retrieval delivery `unresolved` (`unresolved_dependency`, `human_review`,
`projections.mismatched`, `last_error` with C10's text naming `entities_current`); the check `mismatched 1` (the sum) with the row
`{mismatched 1, missing 0, unexpected 0, representation_ok true, failed true}`; the partition `withdrawn` BY the check (`withdrawn_by` the
subscription principal, `withdrawn_by_check` the check id, the reason "retrieval check … mismatched 1, missing 0, unexpected 0,
representation ok (current 1)"), one `projection.withdrawn {by retrieval_check, changed true}` row (no re-drive and no other change before
the rebuild — the tick's re-check is ten minutes away); THE READS by the analyst — `/entities/:E1/get` `lifecycle_state 'active'` (the
log's) with `drift {projected 'retired', log 'active'}` and `from 'log'`, `condition withdrawn`, `degraded true`, `code EYE-DEG-001`, the
label = the withdrawn text + the HELD lagging form ("… held there by 1 unresolved delivery(ies) (a failed check: partition(s)
entities_current withdrawn until rebuilt); 1 change(s) since are checked as they arrive but not checkpointed …"); `/entities/list` E1
active with `drift`; `/search Bab` the hit `extra.from 'log'`, `complete {entities true, objects true}`; `/neighbourhood` E2 depth 4 →
`searchedDepth 2`, `depthClamped true`, `bound.projection true`, the note starting with the label; `/path` E2 → E1 `bound {scan false,
depth false, projection true}`; `/edges/list` — NOT this route's partition — `partitions [edges_current serving]`, `withdrawn []`,
`domain_withdrawn ['entities_current']`, `condition lagging` with the held form (the block names ONLY the route's partitions — pinned);
`/overview` `entities.from 'log'`, `projection.withdrawn ['entities_current']`; a rebuild by the analyst 403; THE REBUILD by the domain
administrator → `rebuilt`, `updated 1`, `restored [{E1, updated, to active}]`, `check.mismatched 0`, `serving`, the ledger `[withdrawn,
rebuilt]`, the row active; THE EVENT: one `GraphChanged/projection.rebuilt` with `identities []`, `relationships.edges []`,
`objects.walked false`, `cause graph.projection.rebuild` on `PRJ` → its SIX deliveries terminal — retrieval `applied` with
`projections.verified`, twins / forecasts / scenarios / decisions / memory-mappings `applied` with `items []`, the relationships subscriber
absent; BETWEEN the rebuilt event's application and the re-drive (pinned once): `/edges/list` `lagging`, `lag_events 2`,
`unresolved_deliveries 1`, the held form "(a failed check whose partition(s) have since been rebuilt; the delivery clears at its
re-drive)"; THE RECONCILIATION: `dispatcher.reconcile(…)` → the drift event's delivery `applied` (`resolved_after_checks 1`), the checks
`[1, 0]`, `checkpoint_seq === the drift event's sequence` (the dispatcher's cursor — 26) and `verified_seq === the rebuilt event's ===
revision` (27), `lag 0`, `unresolved 0`, every read `current` with no `drift` and no `from` — the same end rule in every drift case (C2).
SIX as the evidence line records.
**P3 · the poisoned partition** (AU-MEM-0083 "poisoned"; DP-38-005) — (a) in D a superuser INSERT of a row with no event → the check
`entities_current {mismatched 0, missing 0, unexpected 1, failed true}` and the recorded `mismatched 1` — pinned beside the OLD sum: under
0065's JOIN-only check the row was invisible (`old_join_only_sum 0`); withdrawn; the row absent from `/entities/list`, from `/search`
(`complete.entities true`) and from `/entities/:P/get` (404 "no authorized entity matches"); the rebuild `removed 1`, `dangling []`, the
row gone, the six deliveries, the re-drive → `current` at 29; (c) in DX a poisoned entity held ONLY by a poisoned edge (no event either) →
the operator's withdrawal (`changed true`) → the rebuild REFUSED "held only by rows the log does not know either" with `held_by_derived 0,
held_by_poisoned 1` → `edges_current` withdrawn and rebuilt → `removed 1` (the holder gone, `dangling []`); (b) a poisoned entity held by a
DERIVED edge (its event and lineage present, on the poisoned object) → the withdrawal `changed false` (the partition was withdrawn by (c);
the second reason recorded) → the rebuild REFUSED "held by rows the log derives (an edge, a resolution or an identifier) and cannot be
removed — a person decides them; nothing was written" with `referenced [{id, canonical_name, referenced_by [{edge, asserted, derived
true}], held_by_derived 1, held_by_poisoned 0}]` and no "some holders" suffix — the two poison shapes told apart; the DX listing labelled,
the poisoned rows never served; the DX ledger `[withdrawn operator true, rebuild_refused, withdrawn operator false, rebuild_refused]` on
entities and `[withdrawn, rebuilt]` on edges; DX LEFT WITHDRAWN on `entities_current` (stated: a person decides). SIX for (a) and for
(b)(c).
**P4 · the missing row** (AU-MEM-0070; V03-T-101/-112) — the entity: superuser DELETE of E3 → `missing 1` → withdrawn → `/entities/list`
carries E3 METADATA-ONLY (`projected false`; the name and type from `entity.created`), `/entities/:E3/get` `projected false`, `from
'log'` → the rebuild `inserted 1` with `entity_type/canonical_name/normalized_name/created_by/correlation_id` equal to the seed (C19); the
edge: X1 deleted → `/edges/list` X1 `projected false` with `evidence_object_id null`, `/neighbourhood` E2 carries it under
`bound.projection true` → the rebuild `inserted 1` with the provenance columns equal to the lineage row's; the unrebuildable edge: X2
seeded WITHOUT a lineage row and deleted → the rebuild `refused` naming `unrebuildable [{X2, "no claim lineage row for claim …@1: the
provenance columns …"}]`, `projection.rebuild_refused` on the ledger → the operator supplies the lineage row (the refusal named exactly
what) → the rebuild `inserted 1` → serving; the memory item: M1 deleted → `/memory/list` M1 `projected false`, `index_state 'stale'` →
the rebuild `inserted 1` from the canonical MEM version 1 (the row's title, statement, classification, audience, derivation, `recorded_by`
and `object_version` equal to it). SIX per variant (four evidence lines).
**P5 · the unapproved representation version** (AU-MEM-0083 "unapproved representation") — superuser `representation_version = '0'` on
`edges_current` → `{mismatched 0, missing 0, unexpected 0, representation_ok false, failed true}`, the recorded `mismatched 1`, withdrawn
with the reason naming "representation outdated (current 1)"; the reads' partition `representation_version '0'`,
`representation_current '1'`, `representation_ok false`; the unresolved text with "(or a partition's representation is outdated)"; the
rebuild `restored` (nothing to write), `representation_version '1'`, the ledger's `projection.restored`, the event's `outcome
'restored'`; the re-drive. The case says in its name that the flip stands in for a derivation-rule change, which arrives with a migration
that bumps the constant. SIX.
**P6 · the memory workspace** (AU-MEM-0067; FEX-09; DP-37-005) — (a) superuser `object_version = 7` on M1 → `memory_items_current
{mismatched 1}` → withdrawn; the reader's retrieval 200 with `availability.index_state 'stale'`, `current_version 1` (the LOG's), `drift
{projected 'active@7', log 'active@1'}`, `versionServed 1`, the statement served, `condition withdrawn`, the access row on version 1; a
briefing composed by the executive → `degraded true`, the answer's partition `withdrawn`, the content's WATERMARK `projection {memory
'withdrawn'}` read back from the stored payload; a briefing agent registered with `on_degraded` (a CONTROL run before the drift finished
undegraded, so the stop is provably the projection's) → `stopped` with "on_degraded: the memory projection of this domain is withdrawn
(the memory items are served from their log, labelled)"; the rebuild `updated 1` (`to active@1`) → the agent `finished`, `degraded
false`; (a2) the POLICY columns (C6): `audience_purposes` widened by `decision` → `mismatched 1` → withdrawn; the retrieval stale with no
state/version `drift` (the policy drift is the check's, said); the analyst under `decision` STILL refused 403 (the served version's
audience decides — B9-F1; the widened projection column gates nothing while the content tier answers); the rebuild `updated 1`, the
purposes back to `[memory, briefing]`; (b) THE CONTENT TIER (C5): the point armed; the analyst (a retrieve holder) under `decision` → 403
with C7's list-only text, NO `memory.retrieval_degraded` row, NO access row, `isArmed false` (the refused read consumed the point — the
fault trace); re-armed; the reader under `memory` → 200 METADATA-ONLY — `content 'unavailable'`, `version null`, `versionServed null`,
`versions null`, `accessId null`, the degraded block with `detail 'injected fault at b20.memory_content_unavailable'`, `item.state
'active'`, `item.current_version 1` — the access rows UNCHANGED, ONE `memory.retrieval_degraded` row `{purpose memory, cause
content_unavailable, access_recorded false, code EYE-DEG-001}` at `object_version 1`, the request's audit row `result_code 'EYE-DEG-001'`
with `content 'unavailable'`; the next retrieval served with an access row — the recovery; (b2) the NARROWER gate (C7): M2 recorded under
`memory` with `audience.purposes ['briefing']` (the admitted purpose not in the list) — served with the tier up, REFUSED 403 with the tier
down ("… its audience declares (briefing); … this read states memory"), no ledger row, no access row, the point consumed; (c) the
operator's withdrawal of `memory_items_current` ("no drift: a planned review") → the retrieval stale without drift; (d) withdrawn AND the
tier down → 503 `EYE-DEG-001` with C7's text, `isArmed false`, no `retrieval_degraded` row, no access row; disarmed → the labelled
retrieval → the rebuild `restored`, `index_state 'projected'` after, the ledger `[withdrawn operator, restored]`. SIX for (a), (a2), (b),
(b2) and (c)(d).
**P7 · the deletion paused** (DP-37-005; ES-33-009) — the upload H corrected once (the version-1 manifest deletable — the B19 M5 idiom), a
deletion opened by the steward, resolved `scope_resolved` (1 to execute), approved by the authority on the digest; `edges_current`
withdrawn by the domain administrator; the execution → 409 `EYE-STA-002` "the execution was rolled back and the action paused: retention
execution rejected (projection_withdrawn): the safe referential scope reads a projection that is withdrawn — edges_current (since …: …);
the scope cannot be proven until it is rebuilt (graph.projection.rebuild); the action pauses for human review" — the action `paused`,
`unresolved_dependency`, `human_review`, `attempts 0`, the approvals revoked, `action.paused` on the ledger; the rebuild `restored`;
resolved again, approved again, executed → `executed`, the manifest tombstoned; the action's events `[action.opened, scope.resolved,
approval.recorded, action.paused, scope.resolved, approval.recorded, execution.started, execution.item, execution.finished]`. SIX.
**P9 · the operator's acts** — `strategy_current` withdrawn (`changed true`) and again (`changed false`, the first reason kept,
`second_reason`, the same `withdrawn_since`; two ledger rows); `/strategy/list` from the log-join (`from 'projection'` on the content
columns); the rebuild `restored`; a second rebuild of the serving partition 409 `EYE-STA-002`; the analyst's withdraw 403 `EYE-AUT-001`;
`vector_index` 404 `EYE-STA-001` ("vector_index is not a projection of this domain (one of entities_current, …)"); a short reason 422
`EYE-REQ-001`; the domain administrator in DX 403 `EYE-TEN-001` (no binding there — C13; the brief's "404" does not arise);
`checkpoint_seq`/`verified_seq` unchanged by the acts (55 — no outbox event but the rebuild's); the register through the route 36/14/0 with
L3-I02's clause. SIX.
**P8 · the search's completeness** (V03-T-098) — LAST: 1,001 entities WITH their events in one statement → `/search Bulk` →
`complete.entities false`, `bounds.entities 1000`, the note, 50 hits (`MAX_RESULTS`), `complete.objects true`; the next change → `current`
at 56 (nothing unexpected: the rows have their events). SIX (the fault trace the bound itself; the recovery none — the bound is declared,
not lifted).
The pins widened: `phase3-acceptance.test.ts:1176` — the six rows in the port's order, `missing`/`unexpected` 0, `representation_ok` true,
with the JOIN-only note; `phase6-retention-b16:759` and `-b17:494` (`noDrift`) the same; `phase6-graph-subscriptions-2:283` — after the B7 drift
case's three failed re-checks, this event's three `projection.withdrawn` rows by `retrieval_check` (selected by check id; the count 3) and
the partition STAYING withdrawn (the superuser repair is not a rebuild; no graph route is read later in that file), `changed` pinned over
the whole ledger — exactly its first row true, every later one false (the ledger carries more rows of the same shape: the case's B18
`twin.state_changed` deliveries fail on the same drift and are re-driven beside this event's) — and the count and the state again after the
positive control; `phase6-graph-subscriptions-4:449` (the B9-F1 closure's whole-object `availability` pin) widened by
`index_state/projected/drift`; `phase6-briefings:90` (the whole-object watermark pin) by `projection {memory serving}`; every harness that
registers `retrieval` registers fresh (the digest changed); `codex-corrections.test.ts:131`'s stub needed nothing. THE RUNS: the reconcile
pass (2026-09-17, on the tree as reconciled) — the harness 9/9 four times (h1 and h2 before E3–E6; h3 and h4 on the final tree, 30.0 s /
29.8 s) and the wider neighbouring set 562/562 in 38 files with the two reconciliations E3 and E4 (one failure each in its group on the first
run, neither a flake; none on the re-run); the integrator's runs (2026-09-22, the same tree, `evidence/cp6/`) — the harness **9/9 on two
fresh databases** (`eye_verify_b20_h1` 29.63 s, `h2` 29.76 s; the 17 evidence lines each — `b20-harness.txt`) and the neighbouring set
**344/344 in 24 files** on a fresh database (298.6 s; the per-file counts in `b20-neighbouring-suites.txt`: the four subscription
harnesses 13/14/19/32, the two repro suites 1/5, `phase6-interfaces-b18` 14, the retention harnesses B11 35, B16 6, B17 5, B18 6,
`phase6-memory-derived` 6, the briefing/agent/corrections/executive/monitoring suites 6/6/9/19/10/25/10/7, `phase3-acceptance` 43,
`phase3-corrections` 20, `phase6-decisions` 15, `phase6-propagation-consumer` 18).

**B20.5 — the demonstration.** `scripts/phase6/act-b20.mjs` (482 lines) → `evidence/cp6/act-b20.txt`; rehearsed on a restored copy
(`eye_demo_b20` on :3411 with its own vault copy and Redis — B17's rehearsal-only edits; `evidence/cp6/b20-rehearsal.txt`): the THIRD
rehearsal held whole (39 checks, 129.8 s); the FIRST stopped on the act's own briefing pin — the demonstration's briefing is `degraded`
because of its SOURCES (B10: five scheduled collections failed by `known_at`), which the pin had attributed to the projection; corrected to
"not degraded BY THE PROJECTION", the sources' degradation named beside it; the SECOND on the act's own scene-1 wait — the replacement's
replayed delivery is applied by the dispatcher's 60-second reconcile tick and the act waited 30 s, and its delivery and check lookups by
event id found the REVOKED subscription's earlier rows; corrected: the lookups filter by the replacement's subscription id, the wait is
150 s — both act-side; nothing on `eye_demo` touched by the rehearsals. THE ACT on `eye_demo` (2026-09-22T19:33Z; ALL SCENES HELD — 39
checks in 11.3 s): the backup FIRST to `.eye-local/backups/eye_demo-pre-0080-20260922T193304Z.dump` (51,890,423 bytes — DURABLE: the
scratchpad backups of B18 and B19 were swept by the host's temporary-directory cleaner over the five-day gap, so from B20 the demonstration
backups live under `.eye-local/backups/`, the runbook §8), the demonstration API (pid 69749) stopped, `eye_demo` migrated with 0080
(`applying 0080_b20_index_tier_degradation.sql ... ok`; the partitions seeded — six per domain, both domains, representation `1`), the API
restarted on the B20 build by the runbook's script (pid 64469; `/readyz` ok); then (0) THE STATE — the register through the route: 50 rows,
36 bound / 14 partial / 0 unbound, L3-I02 `partial` with its `bound_to` naming `B20 (0080)`; the strict check through `/projections/verify`
on all six partitions of BOTH domains, seven columns per row — the origin `entities_current 10/10, resolutions_current 30/30, edges_current
8/8, strategy_current 9/9, invalidations_current 20/20, memory_items_current 17/17`, the mirror `14/14, 0/0, 16/16, 1/1, 0/0, 0/0` — every
row `mismatched 0 missing 0 unexpected 0 representation ok` (the act stops before any withdrawal otherwise — C6's guard; the design-time
probe compared state and version only, the rehearsal was the guard); the six partitions of each domain `serving/current` under
representation 1; (1) THE WATERMARK — the six other kinds LEFT in both domains (no method changed); the RETRIEVAL subscription of the origin
(`01a09302…`, cursor 14359) and of the mirror (`01a0aacd…`, cursor 14318), both registered for consumer `a95b9b42…`, REVOKED (this
process's is `cff991a7…` — a changed method is a new consumer) and registered anew by the administrator with the revoked subscription's
accountable human as the owner; each replacement replayed ONE event from the revoked cursor's OWN event (from sequence 14358 and 14317 —
C1: a replay re-drives rows strictly after the point, and a caught-up domain would otherwise have left the replacement `unverified`); the
replayed deliveries `applied` with `projections.verified`, each check `mismatched 0` with every row `m0 mi0 u0 rok`; A. Hoffmann's `/search
NORDWERK` (1 entity hit, 1 claim; `complete {entities true, objects false}`, `bounds {1000, 2000}`, the note) and `/neighbourhood` of the
NORDWERK entity ("NORDWERK ANTRIEBSTECHNIK GmbH"; 1 edge, 2 entities at depth 2, `bound.projection false`) print `condition current`,
`revision 14359 = verified_seq 14359 = checkpoint_seq 14359`, `lag 0`, the check and its instant; the administrator's `/entities/list` in
the mirror `current` at 14318 (14 entities); the strait entity NOT found by name — the path's far end is the walk's own neighbour
("SYN-PART-BRG"), said; (2) THE OPERATOR WITHDRAWS — the administrator (the platform-admin session acting in the origin: the demonstration
has no domain_admin persona and no persona is new) WITHDREW `edges_current` with the reason "representation review before the ontology
proposal" (`changed true`, event `01a0ca9b-c290…`, `withdrawn_since 2026-09-22T19:33:20.658Z`); the partitions: `edges_current withdrawn`,
the five others serving; `/search NORDWERK` stays CURRENT — the block names only the route's partitions (`entities_current`), the
withdrawal named in `domain_withdrawn`; `/neighbourhood` depth 4 → `condition withdrawn`, `degraded`, `code EYE-DEG-001`, the label,
`bound.projection true`, `searchedDepth 2` (4 asked; `depthClamped true`), 1 edge from the log; `/edges/list` from the LOG — 1 edge of 1
eligible, every one `from 'log'` and `projected true`, no drift and no metadata-only row (nothing drifted on the demonstration — said);
`/path` `bound {scan false, depth false, projection true}`, a path of 1 hop with the label; `/overview` edges from the log (8 total, 1
asserted), `projection.withdrawn ['edges_current']`, the five other sections from the projection; a SECOND withdrawal → `changed false`, the
earlier reason kept, `second_reason "a second reason on the same partition (idempotent)"` — a second ledger row, no state change. THE
DELETION: 8 candidate manifests looked up at run time (the object's latest version corrected, withdrawn or superseded; hot; not tombstoned;
not held); P. Novák opens and resolves each — the first (EVD …@2 corrected) resolved `paused` (blocking 1) and was withdrawn, the second
(EVD …@5 corrected) `scope_resolved`, 1 to execute — TAKEN; H. Bergmann approved on the scope digest `eb2f1df8…`; P. Novák's execution
REFUSED 409 `EYE-STA-002` — "the execution was rolled back and the action paused: retention execution rejected (projection_withdrawn): the
safe referential scope reads a projection that is withdrawn — edges_current (since 2026-09-22 19:33:20.658671+00: representation review
before the ontology proposal); the scope cannot be proven until it is rebuilt (graph.projection.rebuild); the action pauses for human
review" — the action `paused`, `unresolved_dependency → human_review`, `attempts 0` (refused before the state moved), the approvals revoked
(1 revoked, 0 live), nothing retired. THE BRIEFING: S. Okafor continued the domain's newest briefing (`01a0ad2e…`) in its room → the new
briefing `01a0ca9b…` (145 items, 9 of kind memory): NOT degraded BY THE PROJECTION — `memory_items_current` serving, the answer's partition
`{memory_items_current, current, serving}`, the content's watermark `projection {memory: 'serving'}` — while `degraded true` is the
SOURCES' (B10: five source states degraded — "the latest scheduled attempt by known_at failed"), said. L. Brandt's retrieval of "NORDWERK
supply relationship (B19 act, 2026-09-17; re-derived)" under `memory` → version 2 served, `index_state projected`, `projection current` —
the memory reads unaffected by an edges withdrawal, said; (3) THE REBUILD — the administrator REBUILT `edges_current` → `outcome
'restored'`, `updated 0, inserted 0, removed 0` (honest: nothing drifted), the re-check `{live 8, rebuilt 8, mismatched 0, missing 0,
unexpected 0, representation_ok true}`, `representation_version '1'`, the withdrawal it closed echoed, `dangling []`; the partition
`serving` with `last_rebuild_id 01a0ca9b-c961…`, `rebuilt_at 2026-09-22T19:33:22.403Z`; the ledger since the withdrawal
`projection.withdrawn (operator) → projection.withdrawn (operator, changed false) → projection.restored`; `GraphChanged/projection.rebuilt`
(partition `tenant:01a084f5…`, sequence 14497): `identities []`, `relationships.edges []`, `objects.walked false`, the typed block
`{edges_current, restored, 0/0/0, representation 1}`, `cause graph.projection.rebuild` on `PRJ`; its deliveries — 6 of 6 live broad
subscriptions: retrieval `applied` (1 item: `projections.verified`), decisions / forecasts / memory-mappings / scenarios / twins `applied`
(no items) — a rebuild changes no fact of the world; the relationships subscriber selected on MemoryCorrected/claim.corrected and receiving
no GraphChanged; the retrieval check `mismatched 0` on all six rows; P. Novák resolved the paused deletion again → `scope_resolved`, 1 to
execute, 0 blocking (the scope proven over the rebuilt projection; a new approval would be needed to execute — none is given) and WITHDREW
it: the manifest, its bytes and every record stand as they were; A. Hoffmann's `/neighbourhood` depth 2, `/edges/list` and `/path` →
`current` at `revision 14497 = verified_seq = checkpoint_seq` (the rebuilt event's sequence; the check at 19:33:23.221Z), `lag 0`, the bound
lifted (`bound.projection false`, `searchedDepth 2` as asked, `depthClamped false`), the edges from the projection again (no `from`, no
drift); (4) THE STATE — both domains' six partitions `serving/current` under representation 1 (`edges_current` of the origin with its rebuild
named); the register 36/14/0 unchanged; WHAT THE ACT LEAVES: the origin's retrieval subscriptions `revoked@14359, active@14497`, the
mirror's `revoked@14318, active@14318`, three `edges_current` ledger rows of the run, the deletion action withdrawn, the briefing; nothing
retired; no persona created. STATED by the act: the demonstration cannot exhibit a real drift, a poisoned or a missing row without
corrupting the copy — the harness carries them (P2–P5) and the demonstration's rebuild is a RESTORATION; a real representation change
arrives with a migration that bumps the constant; the memory content-tier fault is the harness's (a fault point is armable in the test
profile only); the search's bound cannot be exceeded on the demonstration's entities (P8); only the RETRIEVAL consumer's method changed —
its subscriptions re-registered where outdated, the six other kinds listed and left.

**B20.6 — the harness, the gates and the units.** LOCAL (all at the reconciled tree, 2026-09-22; `evidence/cp6/b20-*.txt`): the harness
**9/9** on two fresh databases (29.63 s / 29.76 s; the 17 evidence lines each; the reconcile pass's four earlier runs 9/9); the neighbouring
set **344/344 in 24 files** on a fresh database (298.6 s; the reconcile pass's wider set 562/562 in 38 files); the full integration suite
**1070/1070 in 71 files** on a fresh database (625 s; = 1061 + 9 — the B20 harness beside every earlier file); the upgrade proof with
0022–0080 (59 migrations above the ceiling; 80 files; the registry's 36 rows — no row in B20; the roles 31; the schema digests equal,
`599b0236…`; the Phase 0 suite 297/297 before and after; 275/275 on the upgraded data); the unit suite **2338/2338 in 55 files** (= 2295 +
43: `projection-state` 19 — the eight label forms byte for byte, `worstOf`, `blockOf` with `checkpoint_seq` and `domain_withdrawn`,
`ROUTE_PARTITIONS`; `change-events-projection` 8 — the kind, the builder with no identities and no edges, the cut at 200 honouring the
port's flag, the seven consumer digests distinct with retrieval's changed, `touchedIds` empty; `memory-content-tier` 7 —
`isContentTierFailure` over the classes and the two exact codes, the label; the PDP describe; the refusals describe with the 409-not-422
probe) and the meta suite 9/9; `pnpm boundaries` green (535 modules; red before E1/E2); `tsc` clean for `apps/api`, `apps/web` and the two
walks; the web tests **15/15** (= 11 + 4) and `next build` green with the five B20 pages; the browser gate **51/51** on a fresh database
`eye_browser_20260922` (58.3 s; = 48 + 3: the Phase 0 ten, the Phase 1 sixteen, the B18 twenty, the B19 two — with the memory walk's new
line — and the B20 three), the step name in `.github/workflows/ci.yml:272` reading "Browser regression gate (Phase 0 ten + Phase 1 A12
sixteen + B18 twenty + B19 two + B20 three — the retention, memory and projections walks, blocking)" (a record, not a gate condition — the
job runs every `e2e/*.spec.ts`). THE HOSTED RUN at `1f6d04c` — ci 35779940271 attempt 2 at 1f6d04c (build-test job 106930091028: unit 2338/2338 and the meta suite 9/9, acceptance 58/58, the integration suite 1070/1070 in 71 files on a fresh database with phase6-graph-projections-b20 9/9, the upgrade proof +59 rows / 80 files, C18 612/612 + 44; browser-regression job 106930093569 51 passed — the B20 three and the memory walk's unverified line on the hosted gate; the supply-chain job 106930091021 red on the C15 patched-image recheck step alone, the C15 gate itself green; attempt 1's build-test failed on one unrelated B14 https-recipient case — preserved; C19 35779940295 green) — bound in this records commit (`evidence/cp6/hosted-1f6d04c-build-test-summary.txt`); the supply-chain job's red is the recheck's, not the candidate's (§B20.7). UNITS AND ROWS: AU-MEM-0067,
AU-MEM-0068 and AU-MEM-0083 gain their evidence and STAY `open` (the P3 rule: `open → verified:ci` in the binding commit when the hosted run
exercised every condition — the design's §7.3 maps each condition to its case; AU-MEM-0067's second condition is met PARTLY — the canonical
read (P6(b)), not the vault read (D10) — and the unit is promoted only with the owner's acceptance of D10 as the content tier's evidence
boundary, C20); AU-MEM-0070 STAYS `verified:local` with its evidence CORRECTED (the JOIN-only note; the symmetric check; the writer;
`gate22-degraded-recovery` — the AUDIT degraded flag — removed from the row); V03-T-098 partial → implemented, V03-T-108 missing →
implemented and V03-T-245 unverified → `passed:harness` (the projection block; the search's log leg); DP-38-005 missing → implemented and
IA-35-005 missing → partial (freshness = verification lag; shard, embedding and recall not applicable — said) — each `passed:harness`;
V03-T-097 STAYS partial (C20: the memory content tier is the canonical read; the evidence bytes stay 409 by A7); V03-T-101 and V03-T-112
keep their statuses with the evidence corrected (the writer; the JOIN-only note); IA-34-005 (ontology compatibility checks owed), DP-33-005
(the queued-revision mode owed) and DP-37-005 (the pause on projection withdrawal beside the B11/B19 clause; metadata-only serving
delivered for the canonical read) stay partial — every one of the eleven rows prefixed with the clause "no lexical/vector index exists; the
index tier is the projection set; the representation version is the derivation rule" and, where its evidence now rests on the candidate,
`release_status merged → branch-only`; the register 36/14/0 (L3-I02 `bound_to`); the split stays **3,555 = 3,179 open + 339 local + 37 CI (AU-MEM-0068 and AU-MEM-0083 open → verified:ci by the binding commit; AU-MEM-0067 stays open on its second condition (C20); AU-MEM-0070 stays verified:local until the P7-D cases)**
(no unit promoted by a local run; the summaries regenerated). STATED: the design's §7.2 also names DAT-KN-05, FEX-08, FEX-09,
PR-19-001/-002, ES-33-009/V04-T-024 and ES-34-009/V04-T-026 for the same clause — not moved in this records pass (the eleven above and the
four units were; the rest belong to the binding commit or a later records pass).

**B20.7 — the merges and the chain state (2026-09-22).** #55 (B18 at `4a7f43a`; `phase6-b18` → `main`) MERGED as `e70f90f` at 19:07Z
under the owner's word (Codex's B18/B19 review: B17-F1 closed, no new blocking finding). Its chain, PRESERVED as it ran and not re-run: C19
lifecycle 35771687139 green; ci 35771687190 FAILED — build-test and browser-regression green, the supply-chain job red on its step "C15
patched-image recheck (blocking; fails when a compatible fixed official image exists)" while the C15 gate itself passed ("findings 44
across linux/amd64 + linux/arm64, governed 6 record(s), unmatched 0, unused 0"): the recheck fails BY DESIGN since 2026-09-22 because
compatible fixed OFFICIAL images now exist (`postgres:18-alpine` `sha256:77f58511…`, `redis:8-alpine` `sha256:ba6e394f…` — openssl,
util-linux and c-ares patched on both architectures), so every ci run's supply-chain job is red on that step until the governed return to
the official images lands; C17 finalize 35773974178 SKIPPED (it requires ci success); C19 anchor 35773990447 green. #56 (B19 at `3ea676d`;
its base still `phase6-b18`) NOT merged: its base chain cannot complete while `main`'s ci is red on the recheck; the retarget to `main` and
the merge await the C15 return and the owner's word. The C15 return is in preparation on `maintenance/c15-return-to-official-2026-09` (the
re-pin to the official images, the provenance and compatibility evidence, the SCX re-issue DRAFTS whose `approved_on` is the owner's; open
as the DRAFT PR #57 to `main` since 19:51Z — its merge the owner's word) — the parallel maintenance line, not this batch's. B20's PR opens with base `phase6-b19` (stacked on #56) once the candidate is committed and
pushed; its hosted run will show the same supply-chain red on the recheck step — expected, and not the candidate's.

## Order and the next implementation batch

B3, B1 and B2 are done in code, B4/B5 applied to the audit (the 2026-09-11 checkpoints), B6 done in
code (2026-09-12, on the recovery machinery corrected by 0062 after Codex's finding) and B7 done in code
(2026-09-12, after Codex's third finding), B8 (2026-09-12, after Codex's B7 findings), B9 (2026-09-13, after
Codex's B8 findings; the accepted stack merged on `main` in the recorded order meanwhile) and B10 (2026-09-13, after
Codex's B9 review: F1 closed on the fixed candidate, F2/F3 and G2 carried into this batch), B11 (2026-09-13; its closure of Codex's B11-F1/F2 on 2026-09-14, merged with #48 on 2026-09-15), B12 (2026-09-15, the register's next missing archive-lifecycle capability; merged with #49 on 2026-09-16 on Codex's bounded functional review) and B13 (2026-09-16, the schedule retirement and the customer export's delivery, on `main` after #49; merged with #50 on 2026-09-16 on Codex's bounded review) and B14 (2026-09-16, the https exchange proven, B13-F1 corrected, the trust anchor, the revocation notice, on `main` after #50; merged with #51 on 2026-09-16), B15 (2026-09-16, the relationship closure and the streamed archive; merged with #52 on 2026-09-16 after retargeting) and B16 (2026-09-16, the governed import and the NORDWERK round trip, B14-F1 and B15-F1 corrected, on `main` after #52; PR #53) and B17 (2026-09-16, imported knowledge published to subscribers, the origin's revocation propagated into the importing domain, the signed notice, the review gate; stacked on #53; #53 and #54 merged on 2026-09-16 under the owner's word on Codex's bounded B16/B17 review) and B18 (2026-09-16/17, on `main` after #54: Codex's B17-F1 corrected first, the lifecycle announced — ten interface rows bound, 36/14/0 — with the withdrawal → invalidation → reopen chain, the working domain of a tenant-homed principal and the hosted browser walks; PR #55) and B19 (2026-09-17, the source-derived memory records — a record derived by a person from a claim version or a warning with its provenance, inherited controls, the review and lifecycle gates, the basis followed and the deletion pause; stacked on #55; #55 merged to `main` as `e70f90f` on 2026-09-22 under the owner's word on Codex's bounded B18/B19 review, its ci red on the C15 patched-image recheck step by design and its C17 finalize skipped, #56 held for the C15 return) and B20 (2026-09-22, the index tier — the six projection partitions with a derived watermark on every graph and memory read, the symmetric check that withdraws where the JOIN-only check passed poisoned and missing rows, the operator's withdrawal and the rebuild writer, the labelled last-valid reads and the constrained traversals, the memory content tier's metadata-only fallback, the deletion pause and the briefing's flag; cut from B19's records head `3ea676d`, stacked on #56). The
hosted run at `5118376` (836/836 on a fresh database) verified the B1/B2 units on the hosted chain —
one artefact, no deployment leg. Every leg of every unit stays unaccepted until a deployment profile
carries its own signed evidence (P7-D). The synthetic-company demonstration (`eye_demo`, NORDWERK) remains the deliverable
every batch is exercised on: B3's kinds become visible on the demonstration when a scenario with the
new kinds is declared there through the governed route (a scripted act, `scripts/phase4/`), which is
the next demonstration step after the hosted run is green. Next from the register: B21 — fitness, coherence and challenge; the C15 return to the official images (`maintenance/c15-return-to-official-2026-09`, the draft PR #57 to `main`: the re-pin, the provenance and compatibility evidence, the SCX re-issues whose `approved_on` is the owner's) is the parallel maintenance line, not a batch.
