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

## Order and the next implementation batch

B3, B1 and B2 are done in code, B4/B5 applied to the audit (the 2026-09-11 checkpoints) and B6 done in
code (2026-09-12, on the recovery machinery corrected by 0062 after Codex's finding). The
hosted run at `5118376` (836/836 on a fresh database) verified the B1/B2 units on the hosted chain —
one artefact, no deployment leg. Every leg of every unit stays unaccepted until a deployment profile
carries its own signed evidence (P7-D). The synthetic-company demonstration (`eye_demo`, NORDWERK) remains the deliverable
every batch is exercised on: B3's kinds become visible on the demonstration when a scenario with the
new kinds is declared there through the governed route (a scripted act, `scripts/phase4/`), which is
the next demonstration step after the hosted run is green.
