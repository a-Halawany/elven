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
**2184/2184** and the meta suite 9/9; the web typecheck, build and tests. THE CUSTOMER'S TOOLS: `scripts/retention/import-package.mjs`
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

## Order and the next implementation batch

B3, B1 and B2 are done in code, B4/B5 applied to the audit (the 2026-09-11 checkpoints), B6 done in
code (2026-09-12, on the recovery machinery corrected by 0062 after Codex's finding) and B7 done in code
(2026-09-12, after Codex's third finding), B8 (2026-09-12, after Codex's B7 findings), B9 (2026-09-13, after
Codex's B8 findings; the accepted stack merged on `main` in the recorded order meanwhile) and B10 (2026-09-13, after
Codex's B9 review: F1 closed on the fixed candidate, F2/F3 and G2 carried into this batch), B11 (2026-09-13; its closure of Codex's B11-F1/F2 on 2026-09-14, merged with #48 on 2026-09-15), B12 (2026-09-15, the register's next missing archive-lifecycle capability; merged with #49 on 2026-09-16 on Codex's bounded functional review) and B13 (2026-09-16, the schedule retirement and the customer export's delivery, on `main` after #49; merged with #50 on 2026-09-16 on Codex's bounded review) and B14 (2026-09-16, the https exchange proven, B13-F1 corrected, the trust anchor, the revocation notice, on `main` after #50; merged with #51 on 2026-09-16), B15 (2026-09-16, the relationship closure and the streamed archive; merged with #52 on 2026-09-16 after retargeting) and B16 (2026-09-16, the governed import and the NORDWERK round trip, B14-F1 and B15-F1 corrected, on `main` after #52). The
hosted run at `5118376` (836/836 on a fresh database) verified the B1/B2 units on the hosted chain —
one artefact, no deployment leg. Every leg of every unit stays unaccepted until a deployment profile
carries its own signed evidence (P7-D). The synthetic-company demonstration (`eye_demo`, NORDWERK) remains the deliverable
every batch is exercised on: B3's kinds become visible on the demonstration when a scenario with the
new kinds is declared there through the governed route (a scripted act, `scripts/phase4/`), which is
the next demonstration step after the hosted run is green.
