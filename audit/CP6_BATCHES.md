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

## B21 — fitness, coherence and challenge: the four foresight rows bound (36/14/0 → 40/10/0) — one fitness vocabulary set only by a recorded act whose measures the port computes, the operating envelope enforced, a versioned rule behind every automatic verdict, the coherence check that admits and gates, the challenge decided by someone else and the promotion; Codex's B20-F1 corrected first; the vault clause of AU-MEM-0067 delivered for the root-unreachable class and bounded at the per-object class; the rehearsal wedge found and fixed (implemented)

**Migration 0081** (`apps/api/migrations/0081_b21_fitness_coherence_challenge.sql`, sha256 `055b0571…`, 1,415 lines — the RECONCILED
file: the first implementer's digest `6be052…` is stale, the reconcile pass typed §5's four class appends `::text`), on `phase6-b21`
(cut from B20's records head `13ed40c`; the PR opens with base `main` — the stack #57/#56/#58 merged to `main` on 2026-09-23,
§B21.9; the candidate UNCOMMITTED while these records were written — the commit that carries them is the candidate). Three parts in
the B18 order (the correction first) and one defect found on the way: B21.1 Codex's B20-F1
(`audit/reviews/The_Eye_1f6d04c_B20_Review_C15_Unblock_and_B21_Delivery.md:86-103`, filed with this candidate) reproduced then
corrected — no SQL; B21.2 the vault clause of AU-MEM-0067 for the class the product can tell apart honestly (0081 §1.C; the owner's
2026-09-23 instruction: "Keep AU-MEM-0067 open until its missing vault behavior is delivered; do not reduce the agreed scope";
Codex's directive: "Do not seek an owner waiver merely to promote the unit"); B21.3 fitness, coherence and challenge (0081 §1–§10) —
the register rows L5-I05 ValidateTwin, L6-I03 ForecastFitnessChanged, L7-I04 ScenarioCoherenceFailed and L8-I04 ChallengeSimulation
bound, the nine open group-b units AU-TWN-0014/-0015/-0018/-0031 and AU-PRD-0012/-0014/-0026/-0029/-0030 exercised; B21.4 the
rehearsal wedge — a defect of phase 5's making that the first rehearsal found. Read by three readers (`read-b20-f1.md`,
`read-vault-degradation.md`, `read-fitness-coherence-challenge.md` — binding background; where a map and the code disagreed the code
won and the design said so), designed by three designers and two checkers (SIX blocking findings folded before a line was written —
C1 the five run gates of `open_run` carry a class in parentheses so the named generic `run rejected: ` row cannot catch them and
B9's ordered alternations answer with the port's sentence; C2 the register guard compares a SET, never a collation-ordered string
(`L10-I02` sorts before `L2-I02` under every collation); C3 the upheld decision's admission of the withdrawn SIM version registered
for `simulation.challenge.decide` in `observation.canonical_write_actions`; C4 the forecasts, scenarios and decisions consumers'
`METHOD_REF` literals re-worded so their digests change and the act's "re-registered" line is true; C5 the two appended harness
cases on their OWN temporary vault roots, never `.eye-local/vault`; C6 the rerun, withdraw and decide routes bound to the RUN in the
path and the port, since the pipeline binds the capability to `route.objectId` and the upheld write admits the run's withdrawn
version — and fifteen should-level corrections with the nits, C7–C21, C13 rejected on the file's lines), implemented by five
implementers on disjoint files and one compile/reconcile pass (twelve edits A–L, every one stated in §B21.5), the wedge mapped by a
debugger and confirmed by a refuter (§B21.4), run on fresh databases, rehearsed nine times on a restored copy and exercised on the
demonstration (§B21.7).

**B21.1 — Codex's B20-F1 reproduced then corrected (no SQL).** Codex's B20-F1 (`…:86-103`): while `memory_items_current` is
withdrawn a memory retrieval of a row the log has and the projection lacks issued its canonical lookup BEFORE the content-tier
boundary, and a cancelled statement there escaped raw — a 500 `EYE_INT_001` with a failure audit row `EYE-INT-001`, no declared
answer (Codex's probe: an independent query double throwing SQLSTATE 57014 at that lookup against `1f6d04c`'s `fallback.ts` — "raw
57014 escaped; zero savepoints entered"; a service-boundary reproduction, not a real cancellation or an HTTP measurement, said so in
the review). REPRODUCED at the same boundary with Codex's own idiom (`evidence/cp6/b21-refute-b20-f1.txt`, 2026-09-23T22:08Z):
`1f6d04c`'s `fallback.ts` — byte-identical to `13ed40c`'s, verified by diff — copied to a throw-away spec with its two type-only
imports re-pathed; the double answers ONE row from `memory.expected_items` that the projection lacks and throws 57014 at that row's
canonical lookup; the UNCORRECTED reader let the raw 57014 escape `memoryItemsFromLog` with `savepoints entered = []` (Codex's row),
and the CORRECTED reader under the same double raised `ContentTierUnavailable(canonical_versions)` after two savepoints
`mem_fallback_expected`, `mem_fallback_canonical` with the second rolled back — the transaction usable for the caller's 503 and its
audit row (2/2; the throw-away files deleted before the commit). THE HOLE IS WIDER than the row Codex measured: the withdrawn-mode
reader issues TWO canonical statements before any boundary — S1 the derivation `memory.expected_items`, whose policy columns join
the canonical table, on EVERY withdrawn read, and S2 the absent rows' versions when the log names a row the projection lacks — and
`/memory/list`, `/memory/:id/get` and the briefing composer share the reader. CORRECTED where the statements are: each runs under a
savepoint at the new fault point `b21.memory_fallback_content_unavailable` inside `memoryItemsFromLog`
(`apps/api/src/graph/projections/fallback.ts`), a failure an injected fault or `isContentTierFailure` classifies (the classification
moved to `graph/projections/content-tier.ts`, shared by the memory service and the fallback without a cycle — the boundaries gate
green at 538 modules; `memory.service.ts` re-exports it, the B20 unit test's import path holds) raising the typed
`ContentTierUnavailable` naming the statement, with the transaction usable; the projection read between them is the metadata tier
and stays outside. THE RULE: withdrawn AND the content tier does not answer → 503 `EYE-DEG-001` — for a present row as for a missing
one (a missing row's audience and classification exist only in the canonical version: nothing verified remains to gate a metadata
answer on), on `/memory/:id/retrieve`, `/memory/list` and `/memory/:id/get` alike, ONE sentence (B20's P6(d) prefix byte for byte,
the failed statement in a trailing parenthesis — additive; the memory page renders it verbatim), the pipeline's failure audit row
`EYE-DEG-001` (never `EYE-INT-001`), no ledger row and no access row, the point consumed (the next read served from the log-built
row with its access row — the recovery the B20 harness never exercised); a refused reader on a withdrawn partition with the tier
down receives the same 503 (the fallback precedes every gate; the partition's state is not secret, the item's content is) — the gate
ORDER is AUTHORITY (the PDP, before the handler) then the read, then AUDIENCE (`memory.service.ts`, after `current()`), so an
analyst who holds `memory.item.retrieve` reaches the fallback and its 503; no existence oracle is added — a 403 from the audience
gate confirms an id exactly as the 503 does (C12). THE BRIEFING composes WITHOUT its memory items as a DEGRADED SOURCE: `degraded`,
the omission declared in the stored content (`watermark.projection.memory_content 'unavailable'` on that composition only — every
other composition's content is byte for byte B20's, B10-F2 kept; "absent means served" is the reading rule) and in the answer's
`memorySource` block with the reason; an agent with `on_degraded` STOPS naming the reason (`stopped`, never `faulted` — B20's raw pg
message corrected to the declared reason), an agent without it finishes with `degraded true` and `memory_source 'unavailable'` in
its outputs. The fault registry gains an ordinal (`armNth`: the point fires on the nth arrival; `at()`'s contract for `arm()`ed
points unchanged) so the harness reaches the second statement exactly — Codex's row. The serving path is untouched (the fallback
never runs there — pinned: the armed point is never reached); the metadata-only 200 and its ledger row unchanged; the executive
capability gains `withSavepoint` (the graph capability's, byte for byte); the briefings page renders the answer's `memorySource`
line (`apps/web/lib/decisions.ts`, `decisions/briefings/page.tsx` — additive). HARNESS `phase6-graph-projections-b21` F1
(`apps/api/test/int/phase6-graph-projections-b21.test.ts`, 424 lines; a fresh database; no scheduler, no subscription — the
operator's withdrawal and a superuser delete give Codex's state; the reader does not know who withdrew; the vault roots the file's
own): Codex's four rows through HTTP at each statement (V the retrieval's versions read — B20's point; S1 armed once, S2 by `armNth
2`) — serving + the tier down → metadata-only (B20's case re-pinned); withdrawn + a present row → 503 at V and at S1, served past S2
(never issued for a present row); withdrawn + a missing row → served from the log when S2 answers (`projected false`), 503 at S2
(Codex's row) and at S1; the refused reader's 503 with the point consumed and no rows; `/memory/list` and `/memory/:id/get` 503 at
S1 and at S2; the audit rows `EYE-DEG-001` (failure, stage handler) and never `EYE-INT-001` on `memory.item.retrieve` or
`graph.read`; the recovery after the 503 (served from the log-built row with an access row); the briefing composed without its
memory items and declared (three compositions, the compose audit `success`), the `on_degraded` agent stopped with the reason, the
plain agent finished with `memory_source 'unavailable'`; the rebuild `inserted 1` and the row `projected` after — **1/1 on two fresh
databases** (`eye_verify_b21_h1a` 1,107 ms, `h1b` 1,210 ms; the `B21.1 EVIDENCE F1` line each — `evidence/cp6/b21-1-harness.txt`);
the unit test `apps/api/test/unit/graph/memory-fallback-content-tier.test.ts` (the query double, the ordinal — 13 cases) green;
`memory-content-tier`'s seven unchanged (the re-export); the B20 harness untouched but for its register pin (§B21.5), 9/9. STATED —
what Codex's probe did not cover is covered here or named: (1) the fault point stands in for a statement's failure — a real 57014
(`statement_timeout`, `pg_cancel_backend`) is not injected at S1 or S2: the API configures no `statement_timeout`, a cancellation
from outside cannot be aimed at one statement of a route's transaction, and `at()` throws BEFORE the statement; shown instead by the
57014 double (the classification and the savepoint sequence) and by the B9 savepoint precedent (the transaction's recovery after a
real statement failure under `withSavepoint` — `relationships.consumer.ts`, the B9 harnesses); (2) Codex's probe stopped at the
service boundary; the HTTP status, the body, the audit row and the three other callers are pinned by F1 on the CORRECTED tree — the
uncorrected tree cannot be exercised through HTTP (the point does not exist there); the refute step is the double; (3) the refused
reader's answer on a withdrawn partition with the tier down is the 503 — the alternative (gating on the log's state alone) does not
exist for a missing row; (4) the composer's own canonical read of the candidates' versions and its withdrawn-by-cutoff read stay
outside the boundary — a briefing composes the statements into its content and has no metadata-only form; a failure there fails the
composition as before; (5) the strategy fallback's absent-row canonical read has the same shape and no content-tier promise (the
strategy routes are metadata routes) — named, not corrected; (6) an agent's stop is recorded by the pipeline as the handler's
failure — an `EYE-INT-001` failure row on `briefing.compose` (B10's shape for `max_items`, `on_degraded` and the budget alike); the
run record carries the declared reason; out of B21.1 — a hardening item (a declared code for a stop); (7) a `ContentTierUnavailable`
reaching a caller that passed no `refusal` block propagates (a 500 as before); no such caller exists on this tree; (8) the harness
runs without the scheduler: the automatic withdrawal by a failed check (B20's P2/P4/P6) is not re-exercised; the reader's behaviour
does not depend on who withdrew; (9) no hosted walk: the stored degraded briefing's line is rendered from a fixture-free path, and a
walk would need a withdrawn partition AND an armed point on the gate's API, which the gate cannot arm.

**B21.2 — the vault clause of AU-MEM-0067: Class B delivered, Class A bounded (0081 §1.C).** THE READER'S FINDING
(`read-vault-degradation.md`, the code checked against it): every reader of the vault collapsed an unreachable root into `missing` —
`vault.service.ts`'s `read` folds every failure into `missing` and `readTiered` swallows the listing error — so an unmounted cold
tier produced a FALSE integrity incident (`custody.integrity_failed {failure: 'missing'}`) per retrieval per manifest, the lifecycle
poll could conclude "gone" and admit anew, the retention verifier could conclude "bytes gone"; B18's reachability marker
(`.eye-vault-root`, `rootReachable`) was consulted by one caller; and — the code against the map — the route's Class A custody row
was never durable: `appendCustody` ran on the handler's own transaction and `retrieve()` THREW the 409 inside
`consequentialReadEvidenced`'s transaction, so the custody row rolled back with it and only the POL/AUD rows survived (no test
anywhere asserted the row; the map's F9 saw no route test and not the rollback); `integrity: 'unavailable'` had been declared in
`evidence.service.ts` since phase 1 and never returned. THE MECHANISM: `EvidenceService.retrieve` reads the PRIMARY root's marker
(`rootReachable(readFrom)` for `readFrom ∈ {evidence, archive}`; the quarantine root has no marker and keeps today's shape) BEFORE
any per-object read; an UNREACHABLE root answers 200 METADATA-ONLY under the SAME gate (`observation.evidence.retrieve`) — `{
filename, contentDigest (the manifest's), byteLength (the manifest's), base64: null, integrity: 'unavailable', tier, availability:
'unreachable', degraded: { kind: 'tier_unreachable', code: 'EYE-DEG-001', root, label } }`, the label (`TIER_UNREACHABLE_LABEL`)
"the archive root of the vault could not be reached; this evidence's record — its manifest, digest, tier and custody — is served;
its bytes are not, and nothing about them was verified or refuted; retry when the tier is mounted (retention/tier/state names the
roots)"; the served shape byte for byte as before (no `degraded` key on it — the B11/B12/B16 `toMatchObject` pins hold); ONE custody
row `custody.retrieval_degraded` — the SIXTEENTH kind (0081 §1.C re-declares the CHECK with 0076's fifteen literals in order and the
sixteenth last, and adds the named CHECK `custody_retrieval_degraded_unverified`: the kind can never carry a verification —
`digest_verified NULL`, neither verified nor refuted; a `true` insert refused 23514 — the migration's own probe) with `details {
failure: 'root_unreachable', root, tier, disclosure: 'none' }`, written through the existing `appendCustody` (no port, no registry
row, no role, no PDP row); the route's audit row `success`/`EYE-DEG-001` with `integrity 'unavailable'` (B20's D9 shape). CLASS A —
a per-object failure under a REACHABLE root (missing, corrupt, scope, oversize) — UNCHANGED in shape: one 409 `EYE_INT_001`, one
`custody.integrity_failed` row, no disclosure (phase 1's A7; B20's D10) — and that row is now DURABLE: `retrieve()` returns a typed
REFUSED result instead of throwing, the route audits, the transaction commits, and the controller throws the same 409 body after the
pipeline returned; the audit outcome is `success`/`EYE-INT-001` with metadata `integrity 'failed', digest_verified false` — a
DEVIATION from the design's D2.6 ("committed with the route's FAILURE audit row"), reconciled: `observation.custody_events` is a
stamped business effect (0022 §13's trigger loop) and `ctx.assert_operation_closed` (0013, deferred to commit) admits a business
effect only beside EXACTLY ONE `success` audit row under the real decision — a failure outcome raised 23514 ("business effect
present without exactly one matching success audit event (found 0)") and rolled the custody row back with the write (Implementer 5's
V1 finding, reproduced), so a refused read audits `success` with the refusal's code, B20's D9 idiom, the 409 still thrown after the
pipeline returned, the custody row and the audit row durable under the real decision (C10) — a reviewer who asks why a refused
download audits `success` reads this sentence. THE MACHINE READERS see the flag, not `base64` (the result is a typed union —
`RetrievalServed | RetrievalDegraded | RetrievalRefused`; `tsc` found every `.base64` use): the extraction orchestrator skips a
degraded read with `EYE-DEG-001` and no receipt (`evidenceRead` unchanged) and its write's audit row carries the read's own code
through the additive `WriteEffect.evidence` (`pipeline.service.ts` — the batch's ONE pipeline touch; every other write reads
`success`/`OK` exactly as before); the series reader answers `refused: 'degraded (EYE-DEG-001): <label>'` with `complete false` and
the INCOMPLETE note — the tombstone idiom — and the twin reports the series' refused string verbatim (unchanged); the retention
verifier's `observeForVerification` reports `bytes_present NULL` (with `roots_unreachable`) for a root it could not read —
`retention.verify_action` (0075) already reads NULL as present for a deletion, as not archived, as not restored — so a deletion is
never verified gone from an unreachable root (`verified false`, the action stays `executed`, `infrastructure`/`retry`, the bytes
residual pending; the verify after the mount passes; no SQL); the lifecycle poll's `availabilityOf` answers `'unverifiable'` for a
held tier whose root is unreachable — a live 200 of identical bytes CONFIRMS the held record by the RECORD's digest (`item.noop`),
admits no duplicate, sets no `held_unavailable` and keeps the quarantine copy for the sweeper's orphan rule; `/retention/tier/state`
gains `vault.<root>.reachable` beside the inventory (`/readyz` unchanged); the evidence page renders the degraded block FROM THE
FLAG (`availability === 'unreachable'`) with the detail's `availability { tier, state }` beside the manifest and the served line
byte for byte (the phase-1 walk's `retrieved · integrity verified` pin holds); the retention page's inventory prints `reachable`.
D10 RESTATED as TWO CLASSES and ONE BOUNDARY: the content TIER is unavailable when its ROOT is (Class B) — the same condition for
every manifest it holds, decided BEFORE the read by the primary root's marker alone, touching no byte and no directory of the
object, oracle-free by construction (the decision depends on the tier, which B11's `tier` already discloses); an object missing or
corrupt while its tier answers (Class A) is not the tier's unavailability but an OBJECT's integrity incident in DP-28-005's own
words ("an object is missing, corrupt, …") and AU-OBS-0103's ("a blob is missing or corrupt … fails closed … never served"),
governed by A7 — one 409, one custody row, no disclosure; the metadata tier for evidence is the detail route (the manifest, the
tombstone, the tier ledger, the custody chain — never a byte). THE REJECTED VARIANT stays rejected — classifying AFTER a failed
attempt by asking `rootReachable` for the roots the tiered read touched: with the primary root reachable and the fallback root down,
a corrupt primary copy would answer 409 and a missing one 200 — missing-vs-corrupt distinguishable for the outage's window, the
oracle A7 forbids. Two consequences stated, not fixed: (a) an ARCHIVED manifest whose hot copy lingers (its removal pending) answers
metadata-only while the archive root is down although the fallback could serve it — a serveable read declared degraded, never a
leak; (b) a RESTORED manifest whose hot publish is pending, its only copy in an unmounted archive root, stays one 409 with a
`custody.integrity_failed {failure: 'missing'}` row (the narrow false incident; the restore's retry route resolves it). THE HARNESS
`apps/api/test/int/phase6-evidence-degradation-b21.test.ts` (427 lines; a fresh database; the vault roots the file's own; the
markers moved aside and restored in `finally`; each case logging the six V04-T-024/026 items — the marker as the fault trace,
`availability unreachable` / `complete false` / `bytes_present null` / `unverifiable` as the watermark, the readers, the verifier
and the poll as the consumers, the mount as the operator action, the served read after as the recovery, the custody chain as the
reconciliation): V7 the gate and the canonical refusals precede the root check (a denied caller's 403, a withdrawn object's 409 and
a tombstoned object's 409 the same with the root reachable and unreachable; no custody row on any of the three); V1 CLASS A through
the route — a missing and a corrupt blob under a reachable root answer ONE 409 shape (the bodies equal), each with its
`custody.integrity_failed` row COMMITTED beside the audit row `success`/`EYE-INT-001` under the real decision, the corrupt blob
restored from the kept bytes and served again, the missing one refused for good (nothing can re-create bytes the vault lost; a
governed recover-from-verified-copies act is not built — stated), the detail serving the metadata tier throughout; V2 CLASS B on the
archive root — the archived manifest 200 metadata-only with its `custody.retrieval_degraded` row (one per read: two reads, two rows)
and the audit row `success`/`EYE-DEG-001`, the hot manifest served beside it, the detail unaffected, `tier/state` naming the root,
the chain `[retrieved, retrieval_degraded ×2, retrieved]`, zero integrity incidents in the window; the marker restored → served
again, the digest equal; V3 CLASS B on the evidence root — the hot manifests metadata-only (`root evidence`, `tier hot`), the
archived one served from its own reachable root (the fallback never consulted), no integrity incident; V4(a) THE SERIES READER — an
archived window under an unreachable archive root disclosed as a tombstone is: unreadable with the degraded reason, `complete
false`, the INCOMPLETE note ("1 evidence version(s) could not be read by this reader and contributed no points" — 732 of the whole's
1,095 points), the forecast and the backtest refused, one custody row per read (`read_for prediction.series`), complete again after
the mount; V5 THE VERIFIER — a deletion executed, then verified under an unreachable evidence root → `bytes_present NULL`, the check
failed, `verified false`, the action `executed` with `infrastructure`/`retry`, no `DeletionVerified`; verified after the mount with
ONE `DeletionVerified`, `retention.verifications` keeping the failed check beside the passed one — **6/6 on two fresh databases**
(`eye_verify_b21_h2a` 3.99 s, `h2b` 3.79 s; the six `B21.2 EVIDENCE` lines each — `evidence/cp6/b21-2-harness.txt`); and the two
cases appended to the files whose worlds already exist, each on its own temporary roots (C5): V4(c) THE EXTRACTION under an
unreachable evidence root (`phase2-acceptance.test.ts`, last — every retrieval of the run answers metadata-only with a
`custody.retrieval_degraded` row naming the extraction, `evidenceRead 0`, `claimsAdmitted 0`, no receipt, the run `completed`; the
root restored → a new attempt read 22 evidence objects and admitted 44 claims as before) and V6 THE POLL under an unreachable
archive root (`phase6-retention-b11-archive-poll.test.ts`, last — a live 200 of identical bytes CONFIRMS the archived held evidence
by the record's digest: `item.noop`, `availability 'unverifiable'`, the quarantine copy kept, no duplicate admitted, no
`held_unavailable`; the marker restored → the next poll verifies again) — 24/24 and 5/5 in the neighbouring run `eye_verify_b21_n2`;
the unit test `apps/api/test/unit/evidence-retrieval-labels.test.ts` (3 cases: the label, the audit mapping) green. THE ACT's scene
5 and its safety rule are §B21.7 and the runbook §8. THE RECORDS moved by this part are §B21.8 (AU-MEM-0067, AU-OBS-0103's note,
V03-T-097, FEX-08 and FEX-09 — stale since B20, the map's F8 — ES-33-009, DP-28-005). AU-MEM-0067's CONDITIONS against the cases —
the table the binding commit decides the status under (the design assumed nothing; the owner's word keeps the unit open until the
vault behaviour is delivered, and the records say what is delivered and what is bounded):

| Clause of the row | Reading | Cases | Met by B21? |
|---|---|---|---|
| content / permissions / retention / version history / indexes diverge → restricted access, metadata-only or the last valid state with a warning | B20's | B20 P2, P4, P6(a) (unchanged) | as before (B20) |
| the content tier unavailable → metadata-only, says so — (i) the canonical payload | the memory case | B20 P6(b); B21.1 F1 (the withdrawn-mode fallback's two canonical statements under the boundary) | as before + B21.1 |
| the content tier unavailable → metadata-only, says so — (ii) the vault bytes, CLASS B: the tier's root unreachable | the tier is unavailable as a tier: the same condition for every manifest it holds | V2 (the archive root), V3 (the evidence root), V4(a) the series, V4(c) the extraction, V6 the poll's `unverifiable`, the act's scene 5 | **MET**: 200 metadata-only, `integrity 'unavailable'`, `availability 'unreachable'`, the `degraded` block with `EYE-DEG-001`, `custody.retrieval_degraded`, the audit row `success`/`EYE-DEG-001`; recovered by the mount; every consumer discloses (the series `complete false`, the extraction skips with the code, the poll confirms nothing) |
| the content tier unavailable → metadata-only, says so — (iii) the vault bytes, CLASS A: one object missing or corrupt under a reachable root | NOT the tier's unavailability: an OBJECT's integrity incident (DP-28-005, AU-OBS-0103), governed by A7 | V1 (the route-level pin: one 409, the two bodies equal, the custody row now DURABLE beside the audit row `success`/`EYE-INT-001`; the metadata tier on the detail route throughout) | **BOUNDED, stated**: no metadata-only 200 for Class A, ever — the metadata is served by the detail route; the content tier's refusal is the one shape. Not a reduction of scope: the confidentiality rule the row's neighbours require (D10 restated as Class A / Class B) |
| all profiles; labelled, never presented as current and complete | the label on every degraded answer; nothing degraded reads as complete | V2/V3 (`degraded`, the label; the hot manifest served beside); V4(a) (`complete false`, INCOMPLETE); V5 (`bytes_present null` → `verified false`); V6 (`availability 'unverifiable'`); the web block from the flag | met on the harness (one profile — the local/hosted `saas`-equivalent fixture; the P3 package's evidence class is `harness`; "all profiles" read as the phase-3 rows read it) |

The PROMOTION RULE the binding commit applies: `open → verified:ci` when the hosted run has exercised every row above (V1–V7, the
appended V4(c)/V6 and B21.1's F1 on the hosted job's fresh database) AND the records carry the Class A boundary as the reading of
clause (iii) — the unit's remaining work then being the hosted binding alone; if the owner reads clause (iii) as requiring a
metadata-only answer for a per-object failure, the unit stays `open` with the boundary named as the disagreement — never promoted by
a waiver (Codex's rule), never reduced (the owner's). The design recommends the first reading with one sentence: the condition's
words are "the content TIER is unavailable", and a tier is unavailable when its root is; an object that is missing or corrupt while
its tier answers is the integrity incident DP-28-005 describes, and its metadata-only answer is the route that never touches bytes.
In THIS commit the unit stays `open` (no unit is promoted by a local run): Class B met, Class A bounded, the hosted run not yet
bound, the owner's word not yet given on the reading.

**B21.3 — fitness, coherence and challenge (0081 §1–§10, condensed; the migration's header carries the mechanism in full, D1–D13).**
THE GAP after 0080: no fitness state existed on a twin version, a forecast or a run, and no act set one — the only fitness object
was the method's (0066 §6); the operating envelope was declared on the behaviour model (0032) and enforced nowhere —
`outside_envelope` (0033) a perturbation flag nobody read; a recorded outcome changed nothing (0030); "coherence" appeared nowhere
in the service — the shape refusals of the ports were all there was; nothing made a scenario non-decision-active (FEX-12); the
invalidation's trigger vocabulary was closed at `operator | reproduction` (0078); `corrects_run_id` was a bare pointer (0033); the
`challenge` disposition had no producer. ONE VOCABULARY (D1): `twin_versions.fitness_state` and `forecasts_current.fitness_state`
read `none | fit | unfit | indeterminate`; `runs_current.fitness_state` `none | fit | unfit` (a run is promoted fit by a reviewer or
made unfit by an invalidation — nothing measures it); `scenarios_current.coherence_state` `unchecked | passed | failed`; every
pre-0081 row reads its honest default (the demonstration's: twin versions `none` 5/5, forecasts `none` 3/3, scenarios `unchecked`
6/6, runs `envelope_state unrecorded` 8/8 — printed by the act). VALIDATE TWIN (§1–§2, D2): `twin.validate_version` — append-only
`twin.validations`, the version row's state and validation id, `twin_events` `version.validated`; the verdict the PERSON's, the
ENVELOPE CHECK the port's (`twin.envelope_check`, §3 — ONE rule shared with `open_run`), the CALIBRATION summary from
`twin.reconciliations` since the previous validation (the count, the keys, `since`), the limitations; the twin's OWNER refused 42501
→ 403 (expert review is a workflow, not an owner-declared status — the separation of duties); `fit` outside the envelope refused; a
draft refused; no GraphChanged — a validation changes no fact and no consumer selects by it (the ReviewRequested precedent, 0078) —
`ValidateTwin@v1` alone (the version, the verdict, the prior state, the envelope, the calibration, `dependency_impacts.runs` cut at
200, the cause). THE ENVELOPE ENFORCED (§3, §9, D3–D4): `simulation.open_run` (DROP + CREATE — 35 arguments, `p_envelope_ack jsonb`
and `p_challenge_id uuid` after `p_controls`; 0066 §8's body with five blocks) refuses an UNFIT version (`run rejected (unfit_twin):
…` 409); the run's OWN contract (`horizon_days` from the constraints, the other keys from the version's elements) is checked by the
same helper, and a run outside the envelope is admitted only under `envelope_ack {acknowledge true, reason 8+}` by a twin owner, the
domain administrator or the platform administrator (`twin.envelope_ack_holder` over `identity.role_bindings`; `run rejected
(envelope): …` 422 without one, `run rejected (envelope_ack): …` 403 for a simulation operator's) — recorded on the run
(`twin_fitness`, `envelope_state`, `envelope_check`, `envelope_ack`) and in `run.opened`, carried on `SimulationStarted`; the
envelope key rule: every key of `operating_envelope` whose value is a two-element array; a key matches the run parameter of the same
name, else the version's first NUMERIC element named K, K:<suffix>, shock.K or shock.K:<suffix> (exact equality first, then the
suffixed forms by prefix with `left()` — never LIKE, C9); no numeric value → `unchecked`; any outside → `outside`, else any inside →
`inside`, else `unchecked`; the acknowledgement read as TEXT, never cast (a non-boolean, `"yes"`, `1` or a missing key all read as
"not acknowledged" — C20); the perturbation flag `outside_envelope` stays what it is (a perturbation left the envelope). FORECAST
FITNESS (§4–§5, D5–D8): `prediction.assess_forecast_fitness` under the SQL constant `prediction.forecast_fitness_rule()` v1
(`min_outcomes 10`, `coverage_floor 0.75` = T1_LOW, `drift_factor 1.5`, the cadence days daily 1 / weekly 7 / monthly 30 / quarterly
91) over the FAMILY (series_key, horizon_code, method) — its last K `outcome_ledger` rows: `calibration_failure` (the q10–q90
coverage below the floor over ≥ K), `drift` (the mean pinball above the factor × the applicable backtest's — no backtest: unchecked,
said in the note), `data_shift` (`attention_state assumption_unverified`), `envelope_breach` (an ISSUED forecast past its refresh
cadence's expiry with no successor); any class → `unfit` naming the FIRST in that order; none and n ≥ K → `fit`; else
`indeterminate` with n said ("n of 10 outcomes in the family's window: the calibration and drift rules are not applied"); the ledger
row `prediction.forecast_fitness_assessments`, the forecast's three columns, `forecast_events` `forecast.fitness_assessed`;
`changed` says whether the state or the class moved (a second assessment is idempotent — no event); WHO ASSESSES (D6): the outcome
write (`prediction.outcome.record` — the scored forecast when it is `resolved` after scoring, the ISSUED forecasts of its family
bounded 200; a superseded or withdrawn forecast that is scored is NOT assessed — `fitness null`, `fitness_skipped <state>`,
`family_assessed n` on the answer; C19, a latent failure of the whole outcome write found while folding), the forecast consumer
beside its mark (`prediction.forecast.subscription.apply`), a person (`prediction.forecast.assess`, `POST
…/prediction/forecasts/:forecastId/assess` — the acting principal recorded); no scheduler exists for prediction; THE ANNOUNCEMENT
(D7) is the service's from the port's answer: `ForecastFitnessChanged@v1` on every change (`from {state, class}`, `to {state,
class}`, `classes`, `measures`, `rule_version`, `trigger`, the cause action per trigger), `GraphChanged/forecast.fitness_changed` (a
new `GRAPH_CHANGE_KINDS` entry with the typed `forecast_fitness` block; `objects.forecasts` the forecast) only on a transition to
`unfit` or a class change while unfit (a fit/indeterminate change marks nothing); `declare_scenario` refuses a forecast assessed
unfit beside the withdrawn one (`scenario rejected: forecast … was assessed unfit (<class>)` 409, D8); nothing is auto-withdrawn
(the owner's act, L6-I05); `/calibration/summary` gains `fitness[]` — the latest assessment PER FAMILY — and its second sentence;
`/forecasts/:id/get` the assessment joined. COHERENCE (§6, D9–D10): `prediction.check_scenario_coherence` under
`prediction.scenario_coherence_rule()` v1 — the FAIL rules `duplicate_branch` (two live branches of one kind on the same indicator),
`assumption_invalid` (a basis naming a claim version that is not this domain's, withdrawn/archived/deleted, rejected in review,
under an open contradiction, or superseded by a newer version — C8's vocabulary), `forecast_relationship` (the scenario's forecast
withdrawn, superseded or assessed unfit), `temporal_order` (a decision due before its indicator observes), `dependency_retired` (the
subject entity retired); `coverage` and an unchecked free-text basis (`basis_unchecked`) as NOTES; over the OPEN and FLIPPED
branches (a closed branch is history); append-only `prediction.scenario_coherence_checks`, the scenario's two columns,
`scenario_events` `scenario.coherence_checked`; called by the SERVICE at the end of the declaring write (the branches are added
after `declare_scenario` returns — the port cannot check inside it), by `review_scenario` on `continue` and `promote_to_simulation`
(a dissent checks nothing), by the scenario consumer and by a person (`prediction.scenario.check`, `POST
…/prediction/scenarios/:scenarioId/check-coherence`); a failed scenario is ADMITTED failed, never refused; `changed` = the state
moved or the failing set changed; `ScenarioCoherenceFailed@v1` on failed AND changed only, with `routed_to` the review roles
`platform_admin, domain_admin, strategy_owner, forecast_owner`; THE GATES (§6, §9): `open_run` refuses a branch of a failed scenario
(`run rejected (incoherent_scenario): scenario … failed its coherence check … (<rule>)` 409), `review_scenario` refuses the
promotion of one (`a failed coherence check prohibits promotion to simulation: …` 409; the transaction rolled back, no check row
survives), `raise_warning` marks a warning raised on a branch of one `input_unverified` (raised, never suppressed — the flip is a
fact); no branch suspension, no add-branch or close-branch command — the correction path is retire + a successor;
`declare_scenario`, `review_scenario` and `raise_warning` re-declared whole with ONE block each. THE CHALLENGE (§7–§9, D11):
`simulation.challenges` (`assumptions | model | constraints | interpretation`; `open | rerun_requested | upheld | dismissed |
withdrawn`; one live challenge per run per opener) with its append-only `challenge_events`; `open_challenge` (a completed valid
run), `request_rerun` (open → rerun_requested), `withdraw_challenge` (the opener, while live), `decide_challenge` (neither the
opener nor the run's operator; `upheld | dismissed`) — the three bound to the RUN in the path (`POST
…/twins/simulations/:runId/challenges/:challengeId/{rerun,withdraw,decide}`; `POST …/simulations/:runId/challenge` opens; `POST
…/simulations/challenges/list` lists, declared first) and in the port (`p_run_id` after `p_challenge_id`; a challenge that is not
the run's is `simulation challenge rejected: no such challenge … of run …` 404 — C6); the re-run bound at `open_run`
(`p_challenge_id`: the challenge `rerun_requested` for `p_corrects`; `rerun_run_id` set once; `run rejected (challenge): …` 404 /
409 / 422 by B9's order), compared on the common control by the compare route; an UPHELD decision changes the challenge and the
service then invalidates the run in the same write — the withdrawn SIM version admitted under `simulation.challenge.decide` (the
canonical-write action registered in 0081 — C3), then `invalidate_run` with the trigger `challenge` (its vocabulary widened, the
reference checked against the upheld challenge, the run's fitness `unfit`) — three outbox rows under one correlation id
(`ChallengeSimulation` upheld, `SimulationInvalidated` with `trigger 'challenge'`, ONE `GraphChanged/simulation.invalidated`) and
the six deliveries; `invalidation_withheld 'already_invalidated'` when the run was already invalidated; `runs_current` carries the
fitness, envelope and challenge columns, `runs_immutable`, `versions_immutable` and `invalidate_run` re-declared whole. THE
PROMOTION (§7–§8, D12; OBJ-29): `simulation.promote_result` — a reviewer other than the operator marks a completed, valid,
undisputed run fit for a stated use, ONCE (`promoted_for`, the limitations, the note); `simulation.promotions` restates the row's
validation and sensitivity, never re-computed; `run_events` `run.promoted`; NO outbox event (a work-object action outside the
fifty-interface catalogue — the state rides the get, the list and the page). THE REGISTER (§10, D13): L5-I05, L6-I03, L7-I04, L8-I04
bound → 40 bound / 10 partial / 0 unbound (the guard compares the ten that stay partial as a SET — `L1-I02, L1-I03, L1-I04, L2-I02,
L3-I02, L4-I02, L7-I02, L10-I02, L10-I03, L10-I05` — C2); L9-I05's package-cause clause re-homed from B20 to B22 in its `bound_to`
(0080 bound nothing of it); no registry row and no role (the upgrade proof moves `public.schema_migrations` 59 → 60 only). THE PDP:
eight exact rules, every one `requiresPurpose` — `twin.version.validate` (platform_admin@PLATFORM, domain_admin@DOMAIN,
twin_owner@DOMAIN; human-gated, C2 — the twin's OWN owner refused by the port, a peer twin owner admitted),
`prediction.forecast.assess` (the two administrators and forecast_owner; no human gate — a `forecast_agent` never assesses by hand:
exact, not the issue prefix), `prediction.scenario.check` (the two administrators, strategy_owner, forecast_owner),
`simulation.challenge.open|rerun|withdraw` (the two administrators, twin_owner, simulation_operator, strategy_owner, decision_owner
— the people who decide on what a run represents), `simulation.challenge.decide` and `simulation.result.promote` (the two
administrators, twin_owner, strategy_owner; human-gated — the port's SoD refuses the run's operator and the challenge's opener). THE
REFUSAL FAMILIES (`observation-errors.ts`; the header paragraph): `twin validation rejected`, `forecast assessment rejected`,
`coherence check rejected`, `simulation challenge rejected` and `run promotion rejected` answer the PORT's sentence through B9's
ordered alternations — the standing (42501 → 403: "recorded by the acting principal", the owner's SoD, the decider's SoD, the
reviewer, the envelope acknowledgement's holder), the absences (23503 → 404), the record's state (22023 → 409: a draft, withdrawn,
superseded, retired, not completed, invalidated, live, promoted already, a disputed result, the unfit forecast at declare, the
failed check at promotion) and the caller's request (22023 → 422); the five run gates carry a CLASS IN PARENTHESES — `run rejected
(unfit_twin)`, `(incoherent_scenario)`, `(envelope)`, `(envelope_ack)`, `(challenge)` — so the named generic `run rejected: ` row
cannot catch them: 409 / 409 / 422 / 403 / 404+409+422 by B9's order, always the port's sentence, nothing landing on the generic row
(C1; the class-in-parentheses form is the product's own precedent — `projection_withdrawn`, 0080); the service performs NO fitness,
coherence or challenge pre-check of its own (a duplicate check in TS would be a second source of the sentence; the intake's own 422s
— a malformed `envelope`, a `challengeId` without `correctsRunId` — stay the service's); the unit test
`apps/api/test/unit/phase6-refusals-b21.test.ts` (13 cases in five groups: the standing, the absences, the record's state placed
before the families' 422 fallback, the caller's request, and THE ORDER — a `(challenge)` "disputes run" text lands 422 not 404/409,
`(envelope_ack)` 403 not 422, the B9-era named `run rejected: scenario x was retired by review` row still answers its fixed
sentence, B9's `challenge rejected: claim x has no lineage` untouched by `^simulation challenge rejected`, `a failed coherence check
prohibits promotion …` 409 before the B9 422 row). THE EVENTS (pure builders, the 0066+ shape — ids never bodies,
`temporal.known_at`, `cause`, lists cut at 200 with `truncated`): `validateTwinEvent`, `forecastFitnessChangedEvent`,
`scenarioCoherenceFailedEvent` (`scenario-events.ts`, new), `challengeSimulationEvent`, `forecastFitnessChangedGraphEvent`
(`change-events.ts`, the trigger→action map duplicated as a literal so graph imports nothing from prediction — the boundaries gate),
`simulationInvalidatedEvent`'s trigger and action unions widened; the unit test
`apps/api/test/unit/phase6-fitness-events-b21.test.ts` (22 cases: the five builders key by key, the `GRAPH_CHANGE_KINDS` pin). THE
CONSUMERS' VERDICTS on `forecast.fitness_changed` (D3.6): the FORECASTS consumer selects nothing for its own kind (a fitness change
is not a basis change) and, on every mark it makes, ASSESSES the marked forecast beside the mark (`trigger 'subscription'`;
`ForecastFitnessChanged` on a changed verdict, `GraphChanged/forecast.fitness_changed` on a transition to unfit; an
already-attending forecast is not re-assessed — it was assessed when marked); the SCENARIOS consumer marks the scenarios resting on
the forecast `input_unverified` with the assessment's reason and RE-CHECKS them (`ScenarioCoherenceFailed` on a failed and changed
check; an already-attending scenario is not re-checked by the consumer — its review re-checks); the DECISIONS consumer notes the
packages citing the forecast with `material_change` exposed ("ASSESSED UNFIT (<class>) … — not withdrawn; the owner decides whether
the option stands"; `human_review`); the TWINS consumer marks the citing versions `unverified` with its generic reason (unchanged);
retrieval, memory-mappings and relationships verify / `[]` by construction; the three changed methods → three new digests
(`CONSUMER_VERSION` stays `1.0.0`; the digest carries the change) → the act revokes and re-registers `forecasts`, `scenarios` and
`decisions` on the demonstration, the harnesses register fresh; the seven digests of `13ed40c` pinned by T5 (`DIGESTS_13ED40C`,
recorded in `evidence/cp6/b21-3-harness.txt`'s header: the four unchanged equal, the three re-worded differ). THE PAGES: the twins
page renders the fitness FLAG on the version (`FIT` / `UNFIT — behaviours disabled` / `INDETERMINATE` / not validated) with the
envelope state and a "Validate this version" panel (the verdict, the reason, the limitations; the server refuses the owner); the
simulations page a "Fitness" column (`fit for <use>` / `UNFIT` / `—`, `envelope OUTSIDE (acknowledged by …)`), the run card's
"Challenges" (state, kind, statement, "Request re-run", "Decide", "Withdraw"), "Challenge this result" and "Promote as fit for"
forms, the run form's envelope acknowledgement and challenge-to-answer, the sensitivity line "a perturbation left the envelope"; the
forecasts page the fitness flag beside `attention_state`, a "Fitness" row and "Assess fitness under the rule" (the forecasts page
has NO withdraw control — B18 added none — so the assessment names the class and the withdrawal stays an API act, stated); the
calibration page "Live fitness by family"; the scenarios page `PASSED` / `FAILED` with the findings / `unchecked`, "Check coherence
now", the review panel's promotion option disabled with the reason while failed (the server refuses it too);
`apps/web/lib/fitness.ts` the pure label helpers with `fitness.test.ts` (8 cases); the demo walk `e2e/phase6-fitness.demo.spec.ts`
(164 lines; `playwright.demo.config.ts`'s `*.demo.spec.ts` match, ignored by the hosted config) walks what the act leaves — a demo
spec, not a gate case; NO hosted walk (seeding a twin version, a scored forecast family and a scenario through HTTP needs the
extraction fixture, a registered series with history and uploaded records — B20's D19 found the same for entities); the gate stays
51. THE HARNESS `apps/api/test/int/phase6-fitness-b21.test.ts` (948 lines; a fresh database with the scheduler on, ALL SEVEN
consumers registered fresh, the vault roots the file's own; the humans with sessions of their own — `dadmin`, `peerOwner`,
`runOwner`, `operator2`, `forecastOwner`, `strategyOwner`, `decider`, `analyst`; every case logging the six V04-T-024/026 items as a
`B21.3 EVIDENCE` line): T1 ValidateTwin — the SoD (a second twin owned by a peer, its owner refused 403; the analyst by the PDP; a
draft 409; the intake 422s), the envelope the port computed on the fixture twin (`horizon_days unchecked`, `corridor_delay_days`
inside `[0, 60]` from `shock.corridor_delay_days`, `consumption.weekly` from the observed element), the empty calibration history,
the four fixture runs named, `ValidateTwin@v1` without a GraphChanged, `fit` refused outside the envelope naming the key (a version
with 75 corridor days) and `indeterminate` admitted with `envelope outside`, the calibration's `since`, ENFORCEMENT (an unfit
version opens no run — 409; re-validated fit, the run opens), the ENVELOPE at open (422 without an acknowledgement; 403 for a
simulation operator's; a twin owner's admitted and recorded, the run completing with 75 and `sensitivity.outside_envelope`), the
honest defaults on the fixture's pre-B21 runs; T1.8 the wedge's regression (§B21.4); T2 ForecastFitnessChanged — eleven forecasts of
a second family issued and scored IN TURN over the fixture's disruption window: `indeterminate` at one outcome (`1 of 10`; the
event; no GraphChanged), the tenth judged against the ledger the harness reads back (the coverage recomputed from the last ten
`outcome_ledger` rows and pinned equal — C17; `fit at 0.8` on both recorded runs, the branch printed), the eleventh UNFIT
`calibration_failure` at coverage 0.7 (deterministic: three targets inside the ×0.45 window) with
`GraphChanged/forecast.fitness_changed` and its SIX deliveries applied — the scenario resting on it marked and re-checked
(`ScenarioCoherenceFailed` from the consumer with `forecast_relationship`), the draft package noted `material_change`, the citing
twin version `unverified`, forecasts `[]`, retrieval verified, memory-mappings `[]`; the owner's assessment of a live forecast
(idempotent on repeat; the analyst refused; the get and the calibration's family table); declare refused on an unfit forecast; the
withdrawal; the outcome write's skips (a withdrawn forecast scored → `fitness_skipped 'withdrawn'`, no assessment row; a superseded
one → `fitness_skipped 'superseded'`, its successor assessed; the superseded forecast's own assessment 409 "assess the successor" —
C19); the fixture's family `indeterminate (0 of 10)` (the demonstration's situation); DATA SHIFT through a real GraphChanged (an
assumption resting on a planted edge — its object a second planted entity, never the fixture's, and the assumption's own
`strategy.declared` applied before the forecast is issued — the reconcile's F/G; the edge retracted through the route; the forecast
consumer marks AND assesses `unfit data_shift`); the expiry arithmetic (`expires_at = issued_at + 1 day` for a daily cadence — the
positive `envelope_breach` class is the demonstration's); T3 ScenarioCoherenceFailed — the duplicate-branch scenario ADMITTED failed
with the findings and `routed_to` and the event (the check rows `[declare failed, review failed]`), the run gate and the promotion
prohibited (no check row surviving the rollback), the dissent checking nothing and the continuation re-checking (no second event),
the correction path (retire — the port checks nothing; a successor without the duplicate `passed` with the coverage note only, no
event), `temporal_order`, `assumption_invalid` on an unknown basis and on a planted claim withdrawn at version 2, the free-text
`basis_unchecked` note, the WARNING GATE (a warning raised on a failed scenario's branch RAISED and marked `input_unverified`, never
suppressed; a passing scenario's not marked), `dependency_retired` (the subject entity retired WITH its `entity.retired` event — the
honest fixture; the operator's re-check finds it), the operator route (a passing re-check `changed false`; the analyst 403; a
retired scenario 409; unknown 404); T4 ChallengeSimulation — open (one live per opener; the analyst refused), the SoD at decide (the
opener; the run's operator), the RE-RUN (requested; the nested path's binding — a challenge reached through another run's path 404,
C6; the intake's refusals; the governed re-run naming `correctsRunId` and `challengeId`, bound once — a second 409; compared on the
common control), DISMISSED (the run stays valid, the package unnoted), WITHDRAWN (the opener's act; a withdrawn challenge is not
decided), UPHELD (the run invalidated in the deciding write: three outbox rows under one correlation id, the six deliveries with the
package noted `material_change`, the withdrawn SIM version 2, the citation gate refusing the invalidated run), upheld on an
already-invalidated run (`invalidation_withheld`), the PROMOTION (fit for a stated use with the validation restated from the row —
`twin_fitness 'none'` since the fixture runs were opened before any validation, `envelope_state 'unrecorded'`; once; the operator, a
disputed result and the analyst refused; no outbox row), the get and the list (`challenges`, `promotion`, `live_challenges`); T5 the
register 40/10/0 through the route with the four rows `bound_in '0081'`, `schema_version 'v1'`, `bound_to` naming `<Event>@v1`,
L9-I05's `(L10-I05, B22)`, the SQL counts, the seven consumer digests against `13ed40c` (the three changed, the four unchanged), the
two rule constants at version 1, the pre-0081 scenario reading `unchecked` — **5/5 on two fresh databases** at the reconcile
(`eye_verify_b21_h3a` 35.16 s, `h3b` 36.19 s — the first h3a run 3/5: T2 and T3 stopped on the migration's `::text` defect and on
the harness's edge reaching the fixture forecast, both corrected before the recorded runs) then **6/6 three times** after the
wedge's fix with T1.8 (`fitfix3` 35.13 s, `fitfix4` 36.14 s, the refuter's `rh1`) — `evidence/cp6/b21-3-harness.txt`; the C15 case
appended to `phase5-corrections.test.ts` after its F6 reconciliation (a domain administrator validates the reconciled version fit →
`calibration.count 1` naming the key, `numeric.n 1`, `since null`; the owner is not the validator) 23/23 in the neighbouring run
`eye_verify_b21_n3`.

**B21.4 — the rehearsal wedge (found by the first rehearsal; a defect of phase 5's making, fixed in B21 where the act reached it;
the rest stated for the owner).** The first rehearsal on the restored copy (2026-09-23T23:27Z) WEDGED at the act's control run
(`POST …/twins/simulations/run`, scene 1): every login hung while GETs answered; `pg_stat_activity` showed the run's `eye_commit`
session idle-in-transaction after `SimulationCapability.citedObject` and a second `eye_commit` session's `ctx.issue_commit` waiting
on its transaction id, the publisher's lease, six schedule-capability issues and every identity op queued behind. ROOT CAUSE (the
debugger, confirmed by the refuter in code and on the copy — `$S/b21/report-hang-fix.md`): a governed write NESTED inside another —
`SimulationService.open → unavailableInputs → unavailable → series.retrieveBytes` (`series.service.ts`:
`pipeline.write('observation.evidence.retrieve')`) opened a second commit-pool transaction while the run's was open; `ctx.build`
(phase 1, 0038) begins every capability issuance — `issue_commit`, `issue_identity_op`, `issue_publish`,
`issue_schedule_capability`, the outbox lease — with `DELETE FROM ctx.issued WHERE expires_at < clock_timestamp() - interval '1
hour'`; the outer transaction had swept a row (an inherited publisher nonce crossing the hour line at that instant — `expires_at
22:29:18.099Z`, crossing at 23:29:18Z, found in the source dump) uncommitted, the nested write's sweep hit the same row and waited
on the outer xid while the outer handler awaited the nested promise — a wait cycle PostgreSQL cannot see (the outer session is
`ClientRead`, not a lock waiter); every later minter, logins included, queued on the tuple; the BullMQ "could not renew lock" lines
were downstream. It dates from phase 5 (1a05af8); B20's rehearsal did not hang because its act opened no run; the harnesses never
see it because a fresh database has no hour-old nonces; the copy inherits the demonstration publisher's nonces (about 61 rows a
minute crossing the sweep line for an hour after the dump) — the deadlock fires whenever a nested write's sweep lands while the
outer write's sweep holds a deleted row, a phase relation between the inherited row stream and the local publisher's tick.
REPRODUCED deterministically: the instance killed and restarted with its identical environment (captured in a mode-600 file, never
printed, deleted after), 30,000 expired nonces planted crossing the line one per millisecond, the same request fired — no answer
after 20 s, the root idle in transaction on the `citedObject` read, the nested `issue_commit` waiting on its xid holding the tuple
lock, the publisher behind it. THE FIX (`simulation.service.ts`, `twin.controller.ts`; the design's spirit — the work moves to where
it belongs; the precedent `prediction.controller.ts`, which assembles under a read before its write): the evidence retrievals of a
run and of a reproduction are done BEFORE the write under a `simulation.read` consequentialRead (`side_effect_class 'none'`), each
retrieval its own governed transaction as before (`retrieveEvidence`, `citationsForRun`, `citationsForReproduction`; the typed
`EvidenceAvailability`); `unavailable()` judges lifecycle under the write's snapshot and consults the pre-established answers (a
citation not reached → unavailable, `access`); the refusal texts unchanged; the audit trail of a run now reads `simulation.read →
observation.evidence.retrieve ×N → simulation.run → simulation.run.complete` in distinct transactions; `pipeline.service.ts`
untouched by the fix. HARNESS T1.8 added to `phase6-fitness-b21` (a planted stream of expired nonces crossing the sweep line every
millisecond — 8,000 on the final harness, the first recorded run 40,000; removed in `finally`; a watchdog on the wedge's signature —
a minter waiting on an idle-in-transaction holder — that terminates it and fails; the run must complete; the trail pinned — six rows
in six distinct `xmin`; `SimulationStarted` and `SimulationCompleted` delivered as ever): `planted_nonces 8000, wedge null` — 6/6 on
two fresh databases and once more by the refuter; `phase5-simulations`, `phase5-twins`, `phase5-corrections` and
`phase6-evidence-degradation-b21` 53/53; the four subscription harnesses (their worlds open runs through the changed route) 78/78;
the refuter's `phase6-graph-subscriptions` 13/13. PROVEN ON THE COPY by the ninth rehearsal (§B21.7) — the refuter's finding 1: the
debugger's own copy proof (the identical request under the identical planted stream answering 201 in 81 ms with the six-transaction
trail; the reproduce route 201 with a 24-retrieval trail) ran on an intermediate build, `twin.controller.ts` having been edited and
rebuilt after those requests, and no repro/proof console output is filed — the final build is proven by the rehearsal that held
whole and by T1.8, not by that proof. STATED — a recorded-behaviour change (the refuter's finding 2): the retrievals now precede the
run's own decision and gates (at HEAD they ran after the policy decision and the port gates and only for citations whose exact
object was visible and not withdrawn or retired), so a run refused 403/409/422 leaves the `simulation.read` and the
evidence-retrieval audit and custody rows behind, and a withdrawn evidence citation is now retrieved (a custody row) where it was
skipped — each retrieval under the principal's own `observation.evidence.retrieve` authority, nothing granted wider (the
`simulation.read` holders are a superset of the `simulation.run` holders); the ORDER moved; the citations are read twice (a
re-grounding between the read and the write yields an `access` refusal worded "not established before this write" — a misclassified
cause, benign); the audit counts of the run and reproduce routes grow by one `simulation.read` pair. STATED — RESIDUAL SITES of the
same class, pre-existing and UNCHANGED, not reached by act-b21 (its two `simulations/run` calls go through the fixed route; scene
2's `assess` takes no reader): `twin.service.ts` inside `twin.ground` (the retrieval and the series assembly),
`forecasting.service.ts` at the issue, the backtest (per origin inside the handler) and the outcome record — each nests
`series.assemble` (a consequentialRead) and retrievals inside a write (T1.8's first draft, a 40-second stream not cleaned, wedged
T2's forecast issue identically on the harness database — direct evidence the sites are live; `act-b18` called `ground` twice and
`forecasts/issue` on the demonstration without wedging — a probability, not a certainty); the same remedy (pre-flight assembly
before the write, as the scenario-evaluate route already does) per site, or the SYSTEMIC one: `ctx.build`'s sweep as `DELETE … WHERE
nonce IN (SELECT nonce … FOR UPDATE SKIP LOCKED)` in a later migration (0082) — it removes both the nested-write deadlock and the
liveness hazard that any long transaction which swept a row (a long import, an executor) blocks every capability issuance, logins
included, until it commits; it touches the ctx boundary (C18's watch) — THE OWNER'S CALL; recorded as a hardening item of the first
order, never waived. The wedged copy was discarded (`rehearsal.sh` restores afresh); the safe patterns the refuter verified (the
consumers act through the dispatcher's capability; the scheduled briefing, the collection worker and the extraction orchestrator
open their writes sequentially; the B21.2 diff adds no nested write; B21.1 uses savepoints on the same transaction only) are the
reason the batch's other paths are not exposed.

**B21.5 — what is stated.** (1) B21.1's nine limits are in §B21.1 (the fault point stands in for a statement's failure; Codex's
probe stopped at the service boundary and the corrected tree is what HTTP can exercise; the refused reader's 503; the composer's own
reads outside the boundary; the strategy fallback named, not corrected; an agent's stop recorded as the handler's failure; a
`ContentTierUnavailable` with no `refusal` block propagates; no scheduler in the harness; no hosted walk). (2) B21.2's fourteen
limits, as amended by C5 and the reconcile: a metadata-only answer for a PER-OBJECT missing or corrupt read is never given (A7; D10
as Class A) — one 409, one custody row, the detail route for the metadata; the class is decided BEFORE the read by the primary
root's marker alone, a fallback root's state never re-classifies (the two consequences of §B21.2); the quarantine root has no marker
(the import's and the admission's reads keep today's shape); reachability is the MARKER's readability (B18's definition) — an
unmounted volume, a permission fault and a moved marker read alike; the sweeper's poison line for a staged copy whose tier root is
unmounted (a report a person reads; no destructive act) and the executors' per-item `failure 'missing'` wording for an unmounted
root (an execution's refusal, retried; `tier/state` says why) stay as they are; "recover from verified copies" (DP-28-005) is not a
governed act — the sweeper retains the staged copy for a person; `/readyz` does not probe the vault roots; the poll's `unverifiable`
confirmation compares the RECORD's digest with the incoming bytes' digest and re-verifies nothing, the quarantine copy left as the
sweeper's orphan (F17's class); the verifier's NULL is per observation, not per root (an item whose bytes were SEEN in the reachable
root reads present — a deletion fails for that reason and says so; the residual stays pending until a verify after the mount); the
twin's disclosure is the series' `refused` string verbatim — stated, not exercised; the web renders the degraded block from the flag
and no hosted browser walk exercises it (optional later); the machine readers' audit rows carry the read's own code through
`WriteEffect.evidence` (additive), and the route's refused read commits its custody row and its audit row `success`/`EYE-INT-001`
under the REAL decision (C10; the reconcile's B) — a change of the audit's shape for a refused download; `retrieval_degraded` rows
are one per read — a reader polling a degraded manifest writes one row per attempt, no coalescing; the demonstration's scene reads
the cold record ONCE while the marker is aside, and the series/scheduler observations on the demonstration are expected empty
(PortWatch's evidence is hot) and printed as such; the two appended cases' files ran on the workspace default roots before B21 and
now carry their own (C5), the three new harness files likewise, and the twenty-one files under `apps/api/test/int/` that still
upload under the workspace default — C5's grep on this tree, `/usr/bin/grep -L EYE_VAULT` over the files that call `uploadSource` or
`upload(`: the nineteen harness files `phase5-corrections`, `phase5-propagation`, `phase5-simulations`, `phase5-source-readiness`,
`phase5-twins`, `phase6-graph-projections-b20`, `phase6-graph-subscriptions`, `-2`, `-3`, `-4`, `phase6-memory-derived`,
`phase6-monitoring`, `phase6-propagation-consumer`, `phase6-replay`, `phase6-repro-serving-lifecycle`, `phase6-residual-corrections`,
`-2`, `phase6-retention-b11`, `phase6-review-corrections` and the two helper modules `phase4-helpers.ts` and `phase6-fixtures.ts`
(whose callers set the roots) — are named HERE as a hardening item of C5's class, not edited by B21 (the reconcile pass and every run
after exported temporary roots for them). (3) B21.3's limits (the design's §6 verbatim in
substance; the act prints them): no forecast scheduler or re-issue exists — the assessment is event-driven, and an issued forecast
whose daily cadence lapsed reads `envelope_breach` honestly (the demonstration's read `data_shift`, the first class in the rule's
order, its attention mark from an earlier act); the fitness rules are versioned constants over the ledgers this product holds — not
bias tests, expert review or alternative assumptions; the series-length breach is not detected (a governed evidence read outside the
port); the twin's calibration history is the reconciliation ledger and "domain validation on representative data" is not a harness;
the envelope covers the keys the model declares (`horizon_days` checked at `open_run`; a model with no ranges validates
`unchecked`); coherence is structural over the fields the product holds — a free-text assumption is noted, never judged;
distinctiveness, relevance, bias and sensitivity are not computed; no branch suspension, no add-branch or close-branch command
(retire + a successor); the challenge re-run is a governed run, never an in-process re-execution; the frequency-to-probability
mapping object is out; a decision gate on UNPROMOTED runs is out (an option may cite an unpromoted valid run); the `challenge`
DISPOSITION on a delivery or a retention action is not produced by B21; no outbox event for a promotion (OBJ-29 is outside the
catalogue); the register's other ten rows are untouched; the demonstration's outside-envelope run and the upheld path are harness
and rehearsal cases; the walk is a demo spec, not a hosted gate case, and its run against the demonstration is not filed with this
candidate; a fitness or coherence failure reaches no briefing. (4) THE CLM-ONLY BASIS LOOKUP (the reconcile's open item 2):
`assumption_invalid` resolves a basis `CLM:<id>@<version>` against `object_type = 'CLM'` as designed, while the product's claim
types are ENT/EVT/CLM/REL/ASM — a REL basis reads "is not a claim of this domain"; a design decision, stated; a later batch widens
it. (5) THE RECONCILE PASS's twelve edits, each stated: A the migration's four class appends typed `::text` (a real defect — `text[]
|| 'literal'` parses the literal as an array, 22P02 — found by Implementer 5's T2, reproduced with a DO block; the file's digest
changed before `eye_demo` was migrated, so nothing recorded is invalidated); B the D2.6 deviation (§B21.2); C
`phase6-graph-projections-b20.test.ts` P9's register pin `[50, 36, 14, 0]` → `[50, 40, 10, 0]` (a pin 0081 §10 moved that
corrections-3 had called "untouched"; the title, the header and the evidence string say both states); D `phase4-acceptance.test.ts`
D8's FORCE-RLS count 16 → 18 (the two prediction tables of §4 and §6); E no edit — `act-b20.txt`'s 36/14 line stands as a past act;
F the harness's data-shift edge planted between two planted entities, never against the fixture's subject (an edge to the fixture
entity put the fixture forecast into the retraction's reach and T3's declare was refused by D8); G the assumption's own
`GraphChanged/strategy.declared` applied before the forecast is issued (a race seen once: applied after, the declaration's forecasts
delivery marked the forecast first and the retraction found it already attending); H `phase6-graph-subscriptions-3.test.ts` B8:
L8-I04 `partial` → `bound/v1/0081` ("a partial binding says so" kept on L7-I02); I `phase6-graph-subscriptions-4.test.ts` B9: the
scenario's events gain `scenario.coherence_checked` after the branches (trigger `declare`) and before the CONTINUE review's own row
(trigger `review`); J the same file's direct `simulation.open_run` probe passing the 35-argument form; K
`phase6-graph-subscriptions.test.ts` B6: the scenario consumer's re-check beside `scenario.attention`; L the evidence files as the
reconcile agent's outputs (Implementer 5's drafts replaced). (6) THE ORPHAN FIXTURE BLOBS (the reconcile's open item 3): the
implementers' runs before C5 (`phase5-corrections`, `phase6-interfaces-b18`, `phase2-acceptance` at 2026-09-23T22:42Z, before those
files had temporary roots) wrote 20 fixture blobs under `.eye-local/vault/evidence/` for two verify-run tenants — orphans under the
demonstration's root, C5's hardening class — moved aside to `.eye-local/backups/vault-orphans-20260924/` (two tenant directories, 20
files), not deleted; every run of the reconcile pass and after exported temporary roots or used the files' own; the demonstration
tenant's own directory is the demo API's scheduler's. (7) THE WEDGE's two stated changes and the residual sites are §B21.4. (8) The
web tests read 23 = 15 + 8 (`fitness.test.ts`); no evidence file carries them (the reconcile pass's run, as B20's "15 tests"
before). (9) The seven consumer digests are pinned as literals for the first time (`DIGESTS_13ED40C`); a later change to any
METHOD_REF moves the pin knowingly. (10) The hosted-runner timing flakes seen on `main`'s chains during the merges
(`phase1-acceptance:471`'s 3× ratio — a timing oracle; `phase6-retention-b14` H2's tenth attempt without an HTTP status, the second
time on this tree) are hardening items, never waived (§B21.9). (11) The records the designs also name for the same clauses —
V02-T-125, V03-T-117/-120/-354, V04-T-024, ES-35-008, ES-37-008/-009, AI-48-005/-49-004, FEX-11, L7-C08 — are NOT moved in this
records pass (the seventeen ids of §B21.8 — eighteen rows, OBJ-29 in v08 and v09; the register's four L-rows with L9-I05's clause,
the ten units and AU-OBS-0103's note were); they belong to the binding commit or a later records pass, as B20's §7.2 rows did. (12)
The earlier sections of `PHASE6_REPORT.md` that count "fourteen" interface contracts (§32.5, §33.5, §34.5) stand as written at their
checkpoints; §35 counts ten; §34.5's "(the next batch)" on the resolutions, mappings, impact and reassessment routes serving a
withdrawn partition unlabelled (§B20.3's stated limit) stands as written too — that batch is NOT B21: the item is re-homed to the
hardening pass (the design's records plan), said in §35.5. (13) `evidence/cp6/b21-1-harness.txt` is dated 2026-09-23T22:54Z and `b21-3-harness.txt`'s post-fix
runs 2026-09-24; the full suite's filed run is the post-fix one (`eye_verify_b21_all1`, 1086), the pre-fix run
(`eye_verify_b21_all0`, 1085 in 74 files) named in its header without a log. (14) The C15 return's live effect on the demonstration
host — the recreation of the running containers onto the official images the return pinned (CP-4a, `docs/images/ARM64_RISK_DECISION.md`)
— is not this batch's and awaits the owner (§B21.9).

**B21.6 — the harnesses, the gates.** LOCAL (the reconciled tree, 2026-09-23, and the wedge-fixed tree, 2026-09-24;
`evidence/cp6/b21-*.txt`): `phase6-graph-projections-b21` F1 **1/1 on two fresh databases** (`h1a`, `h1b`; the `B21.1 EVIDENCE F1`
line each — `b21-1-harness.txt`); `phase6-evidence-degradation-b21` V7, V1, V2, V3, V4(a), V5 **6/6 on two fresh databases** (`h2a`
3.99 s, `h2b` 3.79 s; the six `B21.2 EVIDENCE` lines each) with V4(c) 24/24 in `phase2-acceptance` and V6 5/5 in
`phase6-retention-b11-archive-poll` from the neighbouring run `n2` — `b21-2-harness.txt`; `phase6-fitness-b21` T1–T5 **5/5 on two
fresh databases** at the reconcile (`h3a` 35.16 s, `h3b` 36.19 s; the first h3a 3/5 on the migration's `::text` defect and the
harness's edge, corrected) then **6/6 three times** with T1.8 after the wedge's fix (`fitfix3` 35.13 s, `fitfix4` 36.14 s, the
refuter's `rh1`), the C15 case 23/23 in `phase5-corrections` from `n3` — `b21-3-harness.txt` (with the `DIGESTS_13ED40C` block); the
refute run 2/2 — `b21-refute-b20-f1.txt`; THE NEIGHBOURING SET **38 files in five groups on fresh databases** with the scheduler on
and the vault roots exported to a temporary directory (`b21-neighbouring-suites.txt`, the per-file counts inside): n1 7 files 53/53
(`phase6-agents` 9, `phase6-briefing-memory` 6, `phase6-briefings` 6, `phase6-executive-requests` 10, `phase6-graph-projections-b20`
9, `phase6-memory-derived` 6, `phase6-monitoring` 7); n2 16 files 239/239 (`phase1-acceptance` 46, `phase1-fault-injection` 43,
`phase2-acceptance` 24, `phase4-corrections` 14, `-2` 7, `-calendar` 6, `phase4-warning-levels` 6, the retention harnesses
`-b11-archive-poll` 5, `-b11-closure` 9, `-b11` 35, `-b12` 12, `-b13` 10, `-b14` 5, `-b16` 6, `-b17` 5, `-b18` 6); n3 10 files
166/170 on its first run — the four failures the four pins the design moved (H–K: `phase6-graph-subscriptions-3` 18/19, `-4` 30/32,
`phase6-graph-subscriptions` 12/13) — and the three files re-run green as n3b 64/64 (19, 32, 13) beside the seven green in n3
(`phase4-acceptance` 16 — its pin D already moved, `phase5-corrections` 23, `phase5-simulations` 9, `phase5-twins` 15,
`phase6-decisions` 15, `phase6-graph-subscriptions-2` 14, `phase6-interfaces-b18` 14); n4 5 files 117/117 (`phase3-acceptance` 43,
`phase3-corrections` 20, `phase6-residual-corrections-2` 10, `phase6-residual-corrections` 19, `phase6-review-corrections` 25) —
579/579 across the 38 files once the three re-ran; six pins moved in all (C, D, H, I, J, K), nothing else in 38 files; after the
wedge's fix the four subscription harnesses 78/78 and `phase5-simulations`/`-twins`/`-corrections` +
`phase6-evidence-degradation-b21` 53/53 again (§B21.4). THE FULL INTEGRATION SUITE **1085/1085 in 74 files** at the reconciled tree
(`eye_verify_b21_all0`, 2026-09-23 — before T1.8 existed; = 1070 + 12 new + 2 appended + 1 C15 case) then **1086/1086 in 74 files**
after the wedge's fix (`eye_verify_b21_all1`, 644.0 s; the three B21 harnesses beside every earlier file — `b21-int-all-1.txt`, the
per-file counts inside). THE UPGRADE PROOF with 0022–0081 (`b21-upgrade-proof.txt`; the vault roots exported to a temporary
directory): 60 migrations above the ceiling; `public.schema_migrations` +60, `objects.schema_registry` +36 (no row in B21),
`identity.roles` +31 (no role); 81 files; the schema digests equal `d9018019…`; the Phase 0 suite 297/297 before and after; 276/276
on the upgraded data — PASS. THE UNIT SUITE **2389/2389 in 59 files** (= 2338 + 51: `memory-fallback-content-tier` 13,
`evidence-retrieval-labels` 3, `phase6-refusals-b21` 13, `phase6-fitness-events-b21` 22; `twin/simulation-events` widened by the B21
keys; `memory-content-tier`'s seven unchanged; 263.5 s) and the meta suite **9/9** (216.7 s) at the reconciled tree, and again
2389/2389 + 9/9 after the wedge's fix — `b21-unit.txt`; `tsc` clean for `apps/api` and `apps/web` (twice — before and after the
reconcile's edits); `pnpm boundaries` green (538 modules, 2,339 dependencies; `content-tier.ts` in no cycle; `change-events.ts`
importing nothing from prediction); the web tests **23/23** (= 15 + 8) and `next build` green with the eight B21 pages (the twins,
simulations, forecasts, calibration and scenarios pages of B21.3, the briefings page of B21.1, the evidence and retention pages of
B21.2). THE BROWSER
GATE **51/51** on a fresh database `eye_browser_20260924` with isolated vault roots (44.6 s; the demonstration API and web stopped
for the run and restarted after — `b21-browser.txt`): the Phase 0 ten, the Phase 1 sixteen, the B18 twenty, the B19 two, the B20
three — 51 as B20 left it; B21 adds no hosted walk (the fitness walk is a demo spec ignored by the hosted config); the phase-1
evidence walk's served-line pin holds beside the degraded block the evidence page now renders from the flag; the step name in
`.github/workflows/ci.yml` unchanged.

**B21.7 — the demonstration.** `scripts/phase6/act-b21.mjs` (586 lines) → `evidence/cp6/act-b21.txt`; every object looked up at run
time by SQL against the database the act is pointed at, no id hard-coded; the casting BY ROLE (D14, C10 — the brief's names checked
against the seed): the administrator the platform-admin session; N. Eriksen `forecast_owner` (`scripts/phase4/seed-prediction.mjs`);
J. Weber `strategy_owner` (`scripts/phase3/seed-graph.mjs`); T. Nakamura `twin_owner` — the twin's owner and the runs' operator
(`scripts/phase5/seed-twins.mjs`); A. Hoffmann `domain_analyst` (the download); the brief's K. Vogel and S. Roth are MIRROR-domain
personas (`act-b17.mjs`) and R. Adler (`record_authority`) and L. Ferreira (`extraction_manager`) hold no foresight role — named in
the act's header as the correction; no persona created; every wait exceeds the dispatcher's 60-second reconcile tick. REHEARSED on a
restored copy (`eye_demo_b21` on :3411 with the vault COPIED — scene 5's marker moved aside on the COPY's archive root first — and
the rehearsal-only signing-key and station edits of B18–B20; `evidence/cp6/b21-rehearsal.txt`): the NINTH rehearsal held whole (57
✓, 143.0 s, 2026-09-24T08:46Z; the runner's planted-aside guard refused scene 5 once on a planted aside file, as designed); the
eight earlier runs, every one recorded in the file's header: (1) 2026-09-23T23:27Z the WEDGE (§B21.4 — a product defect, fixed); (2)
08:12Z the act carried twin versions without `observed_through` (the B18 rule: a version without a world-time cut-off is refused at
the run) and the runner executed the planted-aside guard BEFORE the real act on the same copy (the guard's scenes 0–4 mutated what
the real act then pinned — the runner now runs the real act first, the guard after); (3) 08:18Z the forecast assessment answered
`unfit/data_shift` where the act expected `envelope_breach` — the rule judges its classes in order and the demonstration's corridor
forecast carries a data-shift attention mark from an earlier act; the pin follows the port's class, the reason stated — and no
completed valid intervention run of the demonstration sits on a live scenario (act IV's and B18's Suez scenarios are retired by
review): the act now disputes a run OF ITS OWN; (4)–(8) 08:24–08:41Z that run refused by the product in turn, each refusal right and
now stated in the act: a scenario recorded after the version's `known_at` cannot give a shock its basis (the act carries a version
AFTER the successor scenario, `known_at` now, the current cut-off); a shock bound to an unflipped branch is a hypothetical and names
no scenario (the act's run names none); an invented reroute named a shipment the twin does not hold (the demonstration's own
intervention shape — shock, component, interventions, horizon — is copied verbatim); a control run must be comparable with the
intervention (the same shock, component and horizon). The demonstration itself was never touched by a rehearsal. THE ACT on
`eye_demo` (2026-09-24T08:51Z; ALL SCENES HELD — 54 ✓ in 22.2 s; exit 0): the backup FIRST to
`.eye-local/backups/eye_demo-pre-0081-20260924T085136Z.dump` (52,584,453 bytes — durable, the B20 rule), the demonstration API (pid
4535) stopped, `eye_demo` migrated with 0081 (`applying 0081_b21_fitness_coherence_challenge.sql ... ok`, digest `055b05718270f34c`;
the register `bound 40, partial 10`; the honest defaults `scenarios_unchecked 6, runs_unrecorded 8, retrieval_degraded 0`), the API
restarted on the B21 build by the runbook's script (pid 24682; `/readyz` ok); then (0) THE STATE — the register through the route
(J. Weber): 50 rows, 40 bound / 10 partial / 0 unbound, the four foresight rows `bound in 0081`, L9-I05's clause re-homed to B22;
the seven subscriptions of the origin checked against this process's consumer digests — the FORECASTS, SCENARIOS and DECISIONS
subscriptions (registered for the `13ed40c` consumers `cbcde853…`, `d2be51c5…`, `49416a32…`; this process's `e3932eb0…`,
`06a9711b…`, `6e283700…`) REVOKED at cursor 14497 and registered anew by the administrator with the same owner, each replacement
replaying ONE event from sequence 14496 — the revoked cursor's OWN event 14497 — `applied (no effect)`; the four unchanged kinds
(twins `13996dd0…`, retrieval `cff991a7…`, memory-mappings `2e0ad122…`, relationships `fe16ee21…`) "already active" and left —
exactly three re-registered, four left, as C4 promised; THE HONEST DEFAULTS before the act: twin versions fitness `none` 5/5,
forecasts `none` 3/3, scenarios coherence `unchecked` 6/6 (declared before any check existed), runs `envelope_state unrecorded` 8/8
(opened before 0081), `custody.retrieval_degraded` rows 0; (1) FITNESS (twin) — the twin "NORDWERK — Ningbo → Regensburg chain",
owner T. Nakamura, admitted version 5, fitness `none`: T. Nakamura (the owner) REFUSED 403 `EYE-AUT-001` "twin validation rejected:
the twin's owner does not validate their own twin; another twin owner or the domain administrator validates version 5 of …"; the
administrator validated version 5 FIT — the envelope `inside` of `supply-flow@1` computed by the port (`horizon_days: unchecked`;
`consumption.weekly: inside (9200 in [0, 100000] from consumption.weekly:SYN-PART-MAG)`; `corridor_delay_days: inside (14 in [0, 60]
from shock.corridor_delay_days)`), calibration since never (1 reconciliation), 2 runs resting on the version named and never
altered; `twin_versions.fitness_state fit` with its validation id (`twin.validations` 1 row); `ValidateTwin@v1` published (seq
14541: version 5, verdict fit, prior none, envelope inside, `dependency_impacts.runs 2`); NO GraphChanged from the validation; T.
Nakamura's control run completed with `twin_fitness fit`, `envelope inside` (the three keys inside), no acknowledgement needed —
SYNTHETIC; `SimulationStarted` (seq 14542) carries both; STATED: the outside-envelope run is not staged on the demonstration (the
demo's elements lie inside the model's envelope; nothing is regrounded for a show — the harness T1.6 carries the 422, the operator's
403 and the acknowledged run); (2) FITNESS (forecast) — the forecast `portwatch:chokepoint4:n_total 30d seasonal-naive` (replay
demonstration, issued 2026-09-09T06:58:16Z, cadence daily, fitness `none`; the family's outcome ledger 0 rows): N. Eriksen's
assessment under rule v1 → UNFIT (`data_shift`) — `outcomes 0 of 10` in the family's window ("the calibration and drift rules are
not applied; the verdict is indeterminate unless another class holds"), coverage not checked (floor 0.75), pinball vs backtest none,
`attention assumption_unverified` (the class named — the first in the rule's order), the expiry 2026-09-10T06:58:16Z LAPSED (an
issued forecast past its daily cadence is unfit by `envelope_breach` too; a scheduler would have re-issued it, none exists — said);
`forecasts_current.fitness_state unfit (data_shift)` with the assessment row (`trigger operator`); `ForecastFitnessChanged@v1`
published (seq 14544: from none to unfit (data_shift), rule v1); `GraphChanged/forecast.fitness_changed` (seq 14545) — SIX
deliveries: scenarios `applied` with 1 item (`scenario.attention` — 1 scenario marked `input_unverified` and re-checked), retrieval
`applied` with 1 item (`projections.verified`; the check `mismatched 0`), decisions / forecasts / memory-mappings / twins `applied`
with no items (0 packages cite it; forecasts answers nothing for its own kind) — a DELIVERED event and non-empty consumer work told
apart; a second assessment idempotent (`changed false`, the verdict unchanged, no second event); the calibration summary's live
fitness table names the family (`unfit (data_shift), outcomes 0, rule v1`); STATED: the act does NOT withdraw the forecast — the
withdrawal (L6-I05) stays N. Eriksen's own act; the assessment names the class; (3) COHERENCE — a scenario on the unfit forecast
REFUSED 409 `EYE-STA-002` "scenario rejected: forecast … was assessed unfit (data_shift)" (D8); J. Weber's scenario on the
`ecb-eurusd` forecast with a DUPLICATE downside branch on the demonstration's indicator ADMITTED failed, never refused —
`duplicate_branch [fail]`: branches "Corridor collapse" and "Corridor collapse (restated)" are both downside and share the same
indicator; `coverage [note]`: 2 live branches of 1 kind beside the baseline; `ScenarioCoherenceFailed@v1` published (seq 14547: 2
findings, rule v1, `routed_to platform_admin, domain_admin, strategy_owner, forecast_owner`); T. Nakamura carried version 5 into
version 6 (`known_at` now: the scenario is known to it — the run's shock basis); his run on the failed scenario's branch REFUSED 409
`EYE-STA-002` "run rejected (incoherent_scenario): scenario … failed its coherence check … (duplicate_branch); a branch of an
incoherent scenario is not simulated until a review resolves it"; the promotion-to-simulation refusal shown on the rehearsal copy
only ("a failed coherence check prohibits promotion to simulation: … resolve the findings and review again" — the harness T3.2
carries it); J. Weber RETIRED the scenario (no branch-close act exists — retire + a successor, D10); the successor PASSED (`coverage
[note]`; `coherence_state passed`); (4) CHALLENGE — T. Nakamura carried version 6 into version 7 (`known_at` now; observed through
2024-04-10); no completed valid intervention run of the demonstration sits on a live scenario, so the act disputes a run of its own:
T. Nakamura's comparable control and his intervention run copied from the demonstration's own shape (`draw_down` of SYN-PART-MAG
2024-01-11 → 2024-04-09 and `reroute` of SYN-SHIP-4472) as a HYPOTHETICAL shock naming no scenario (the live scenario's branch is
not flipped within the cut-offs; the product refuses a shock bound to an unflipped branch — said), `fitness none`, `envelope
inside`, `twin_fitness none` (opened under 0081 before any validation of version 7); J. Weber OPENED a challenge (`interpretation`)
— `ChallengeSimulation@v1` published (seq 14557: opened, interpretation, the run's validity valid); J. Weber may not decide his own
challenge (403 `EYE-AUT-001` "the decider is the challenge's opener; someone else decides …"); the administrator requested the
re-run; T. Nakamura's re-run completed BOUND to the challenge (`challenge_id` on the run; `rerun_run_id` on the challenge;
`challenge.rerun_opened` on its ledger) — SYNTHETIC; compared on the common control (`line_stop_days` 29 / 0 / 0); the administrator
DISMISSED it — the run stays `valid`, no invalidation, no GraphChanged; `ChallengeSimulation@v1` published (seq 14561: dismissed,
the re-run named); the administrator PROMOTED the control FIT for "the NORDWERK corridor routing decision (the demonstration)" — the
validation restated from the row (`twin_fitness none`, `envelope_state inside`, the validation status "unvalidated (synthetic
grounding); predicted inputs: context.fx_forecast rests on FCT:…@1 (unvalidated); the shock is HYPOTHETICAL …; outputs are
SYNTHETIC", `outside_envelope_perturbation false`), the sensitivity kept, the limitations ["calendar days", "synthetic grounding"],
`run.promoted` on its ledger; no outbox event for a promotion (D12); T. Nakamura (the operator) refused 403 `EYE-AUT-001` "run
promotion rejected: the reviewer operated run …; a result is promoted by someone else (OBJ-29)"; STATED: the UPHELD path (a second
challenge upheld → the run invalidated with `trigger challenge`, SIM version 2 withdrawn, fitness unfit; `SimulationInvalidated` and
`GraphChanged/simulation.invalidated` with six deliveries) on the rehearsal copy only, printed REHEARSAL ONLY there — the
demonstration's run is never invalidated by the act; (5) THE COLD TIER UNREACHABLE — the archive root as the act resolves it
(`.eye-local/vault/archive`; nothing under a root is ever printed); the cold NORDWERK record (manifest 3,934 bytes, recorded
2026-09-13) and a hot record; `custody.retrieval_degraded` rows in the domain before: 0; A. Hoffmann downloaded the cold record
VERIFIED from the archive tier (3,934 bytes, the digest equal; `custody.retrieved` tier archive, `served_from published`) —
SYNTHETIC — and the hot record verified (tier hot); the marker's sha256 before `371e16ce98051a3e…`, `tier/state` archive reachable
true (blobs 1), evidence reachable true; THE ACT ITSELF MOVED THE MARKER ASIDE (three refusals to start — the marker must read
`archive`, no aside file may exist from a run that stopped mid-scene, the API must report the root reachable now; restored in
`finally` and on `exit`/`SIGINT`/`SIGTERM`/`SIGHUP`): `tier/state` archive `reachable false`, evidence `reachable true` — the
inventory still lists blobs 1: the marker is the rule, an unmounted volume would read zeros; the cold record answered 200
METADATA-ONLY (`base64 null`, `integrity unavailable`, `availability unreachable`, `tier archive`, the manifest's digest and 3,934
bytes, `degraded { tier_unreachable, EYE-DEG-001, root archive }`, the label verbatim); the audit row `success`/`EYE-DEG-001` (seq
101511); the custody chain's newest row `custody.retrieval_degraded { failure root_unreachable, root archive, tier archive,
disclosure none }`, `digest_verified null`; NO `custody.integrity_failed` row for the cold record since the scene began — an
unreachable root is never an integrity incident; the detail route's metadata tier untouched (`availability { tier archive, state
archived }`, the custody chain carrying the degraded read); the hot record served verified in the same window (the evidence root
reachable); STATED: S. Okafor's briefing and L. Brandt's memory retrieval are not exercised — no memory path reads vault bytes
(`memory.service.ts` derives from the payload's digest); no registered series has an archived window on the demonstration
(PortWatch's evidence is hot) — the series and extraction disclosures are V4 on the harness; the scheduler, observed: no poll
confirmed by an unverifiable held record in the window (no scheduled source's held evidence is archived on the demonstration); the
marker restored byte-identical (sha256 `371e16ce98051a3e…`), `tier/state` archive reachable true again, the cold record verified
again with the digest equal; the chain of the scene `[custody.retrieved, custody.retrieval_degraded, custody.retrieved]`, the
domain's `retrieval_degraded` rows 0 → 1 (the act read the cold record ONCE while aside); the runner's independent proof after the
act: the marker in place (8 bytes, unchanged since 2026-09-17), aside files under `.eye-local/vault` 0; (6) THE STATE — the register
40/10/0 unchanged; the twin's versions `v1–v4 none, v5 fit, v6 none, v7 none`; the forecast `issued, fitness unfit (data_shift)`;
the two scenarios (`retired, failed` and the successor `active, passed`); the three runs (the control `valid, fitness fit` for the
routing decision; the disputed intervention and the re-run `valid, fitness none`); the challenge `dismissed`; the origin's
subscriptions at 14552 (relationships at 14254 — it receives no GraphChanged); WHAT THE ACT LEAVES: one validation (fit), one
assessment (unfit), two carried twin versions (6 and 7) admitted, two scenarios (one retired), one challenge on the disputed run
(dismissed), one re-run, one promotion, one `custody.retrieval_degraded` row with two `custody.retrieved` rows beside it, the three
re-registered subscriptions; no evidence retired, nothing withdrawn on the demonstration, no persona created, the archive root's
marker back in place. WHAT THE DEMONSTRATION SHOWED and WHAT THE HARNESS ALONE PROVES are the act's own two closing paragraphs (the
outside-envelope run refused, refused for a simulation operator's acknowledgement and admitted under a twin owner's; the
calibration-failure family across eleven scored forecasts with the six deliveries; data shift through a real GraphChanged; the
outcome write's skips; the coherence rules one by one and the warning gate; the upheld challenge invalidating its run in the same
write with the withdrawn SIM version and the citation gate; Class A pinned through the route beside Class B on both roots, the
series reader, the extraction, the verifier and the poll; Codex's B20-F1 rows through HTTP). These are the author's logs; the hosted
run is the only chain that verifies a harness unit.

**B21.8 — the hosted run and the units.** THE HOSTED RUN at `a2303ff` — ci 35982420268 at a2303ff, one attempt (build-test job 107577216792: unit 2389/2389 and the meta suite 9/9, acceptance 58/58, the integration suite 1086/1086 in 74 files on a fresh database with phase6-graph-projections-b21 1/1, phase6-evidence-degradation-b21 6/6 and phase6-fitness-b21 6/6, the upgrade proof +60 rows / 81 files, C18 623/623 + 44; supply-chain job 107577216542 green on the returned official pins with the recheck's return transition passing; browser-regression job 107577216741 51 passed; C19 35982420259 green) — bound in this records commit (`evidence/cp6/hosted-a2303ff-build-test-summary.txt`). No unit is promoted by it: the design's rule promotes `open → verified:ci` only when the hosted job exercised a unit's every condition, and the integrator does not promote on a partial exercise — the nine group-b units keep `open` with the hosted run named in their evidence; AU-MEM-0067 keeps `open` by the owner's word (Class B met, Class A bounded); the split stays 3,555 = 3,179 open + 339 local + 37 CI.9). UNITS AND ROWS in this commit:
AU-MEM-0067 gains the B21.1 and B21.2 evidence and STAYS `open` — the canonical-read clause met (B20 P6(b); B21.1 F1 for the
fallback's two statements), the vault clause DELIVERED for Class B and BOUNDED at Class A (§B21.2's table; the owner's word "until
its missing vault behavior is delivered" keeps it open; the C20 clause "promoted only with the owner's acceptance of D10" withdrawn
— superseded by delivered behaviour plus a stated limit), its `notes` recording the latent rollback of the route's custody row
corrected (D2.6 reconciled); the nine group-b units AU-TWN-0014 (the envelope declared, evaluated inside it, behaviours disabled,
results crossing it marked, the threshold raised by the acknowledgement, the envelope exposed on the get and on `SimulationStarted`
— remaining: the envelope on other behaviour models, approval thresholds beyond the acknowledgement), AU-TWN-0015 (the validation
record per version, the calibration history from the reconciliation ledger, the expert-review workflow by the SoD — "domain
validation on representative data" not a harness), AU-TWN-0018 (one indicator — model fitness — bound to decision-active status; the
rest of the indicator set open), AU-PRD-0012 (the event and the four classes; the scheduler/re-issue clause open), AU-PRD-0014
(model drift and calibration failure as declared failure states; the abstention product open), AU-PRD-0026 (the five rules, the
event, duplicates non-decision-active, routed to review; distinctiveness, relevance, coverage-as-measure, bias and sensitivity
open), AU-PRD-0029 (coherence bound to decision-active status; the rest open), AU-PRD-0030 ("branch incoherent" and "critical
assumption invalidated" handled; the rest open) and AU-TWN-0031 (the workflow, the reviewer's promotion, the compare UI; the
frequency-to-probability mapping open) gain their evidence and STAY `open` until the hosted run binds (the P4/P5 rule; every one
carries its remaining clauses in its own prose); AU-OBS-0103 (`verified:local`) gains the note that an unreachable tier root is not
this unit's failure; the requirement rows — V03-T-097 stays `partial` (the vault clause's Class B; the fallback's clause; the Class
A boundary); V03-T-143 partial → `implemented` (the gate), V03-T-334 partial → `implemented` (the five rules; said structural),
V03-T-349 stays `implemented` with the challenge step delivered, V03-T-322 / V03-T-328 (unverified → `passed:harness`) / V03-T-341
stay `partial` with the delivered clauses named; FEX-08 (missing → `partial`, stale since B20) and FEX-09 (missing → `partial`; the
declared row the catalogue lacks in its notes) corrected, FEX-12 missing → `implemented`; ES-33-009 missing → `partial`, ES-36-001
stays `partial`, ES-38-001 partial → `implemented` (the challenge and invalidation history); IR-17-003 stays `partial` (the
structured challenge workflow delivered; sensitivity stays a recorded field per run, not an analysis across parameters — the
design's "implemented" not followed for that clause); PR-33-005 stays `partial` (duplicates, inconsistent assumptions and lost
evidence links detected and gated; coverage a note the review judges, a collapse to one forecast not detected — the design's
"implemented" not followed for those clauses); DP-28-005 stays `partial` with the unreachable-root note and the incident preserved
on the route; OBJ-29 (v08 and v09) missing → `implemented`; the register's four rows L5-I05, L6-I03, L7-I04, L8-I04 partial →
`implemented`/`passed:harness` with `bound in 0081 (<Event>@v1)` in their notes and L9-I05's remaining clause re-homed `(L10-I05,
B22)`; every row whose evidence now rests on the candidate `release_status branch-only` with the note. THE SPLIT stays **3,555 =
3,179 open + 339 local + 37 CI** — no unit promoted by a local run (the summaries regenerated by `audit/summarise.mjs` then
`audit/summarise-units.mjs`; the delivery register's line unchanged).

**B21.9 — the merges and the chain state (2026-09-23; exact).** Under the owner's authorization on Codex's B20 review (filed
`audit/reviews/The_Eye_1f6d04c_B20_Review_C15_Unblock_and_B21_Delivery.md`): the six SCX re-issues approved (`approved_on
2026-09-23`; scope, classification and expiry 2026-11-05 unchanged) and #57 COMPLETED — the recheck's return transition (the
configured official pin passes, a newer compatible official build or an indeterminate check fails, the cadence unchanged; the
scanner and trace fixtures re-recorded with the pinned tooling; head `6a1494d`, all checks green) — and MERGED to `main` as
`870b212` (14:16Z). Its chain: C19 lifecycle 35873000726 green; ci 35873000911 attempt 1 FAILED on `phase1-acceptance:471` (a
timing-oracle pin, 1054/1055), attempt 2 (a `--failed` re-run) succeeded but a PARTIAL re-run packages no archive, so C17 finalize
35878185367 FAILED (no `c17-evidence-archive-a2-*`), attempt 3 (a FULL re-run) succeeded and C17 finalize 35918728349 green — but
the C19 anchor 35918837855's publish was REFUSED by its own causal rule ("resolution expected sourceRunAttempt=2 but the finalized
evidence authenticates 3; a same-SHA match is not a causal binding"); every attempt preserved; the lesson recorded in the runbook
§8: a flake on `main`'s ci is re-run in FULL. #56 (B19 at `3ea676d`) retargeted to `main` and MERGED as `6212c5b` (20:57Z); its
chain FULLY green — ci 35919379221 attempt 1, C17 finalize 35921411985, C19 anchor 35921521108 PUBLISHED; C19 lifecycle 35919379263
attempt 1's delivery-chain-dry FAILED against `870b212`'s inconsistent evidence (the fixture resolver takes the newest
finalization), attempt 2 green once its own finalization existed — this is the cumulative chain covering #55 and #57. #58 (B20 at
`13ed40c`) retargeted to `main`, closed and reopened (the head unchanged) to re-run its required checks against `main`: supply-chain
GREEN on the returned pin; its C19 lifecycle attempt 1 failed the same way and was re-run green; build-test attempt 1 failed on
`phase6-retention-b14` H2 (the tenth attempt's receipt without an HTTP status — the second time on this tree), attempt 2 on
`phase1-acceptance:471` (the timing oracle) — and THE MERGE (`main` `e180b18`, 21:40Z) WAS MADE WHILE ATTEMPT 2'S BUILD-TEST WAS
STILL PENDING: the integrator's armed merge checked for zero failing checks and let a timed-out wait through — an error, recorded as
such; the post-merge chain on `main` decided it: ci 35923830613 attempt 1 GREEN (the merged tree passed every hosted suite in one
attempt), C19 lifecycle 35923830611 green, C17 finalize 35926060309 green, C19 anchor 35926159815 PUBLISHED (22:07Z). `main` now
carries B18, the C15 return, B19 and B20; B21's PR opens with base `main`. Hardening items from the chains: the two hosted-runner
timing flakes (`phase1-acceptance:471`'s 3× ratio; `phase6-retention-b14` H2's tenth attempt) — never waived; the C19 causal rule
against partial re-runs (a process rule, in the runbook §8); the recreation of the live demonstration containers onto the official
images the return pinned (CP-4a, `docs/images/ARM64_RISK_DECISION.md`) — the owner's call.

## B22 — the capability-nonce sweep never waits (0082); the attention policy and the consumers (0083): L10-I05 bound, L1-I03 / L1-I04 / L2-I02 given their registered consumers, L9-I05's policy cause delivered (40/10/0 → 44/6/0); the demonstration's containers returned to the official image pins (implemented)

**Migrations 0082** (`apps/api/migrations/0082_b22_ctx_sweep_skip_locked.sql`, sha256 `1fff2363…`, 73 lines) **and 0083**
(`apps/api/migrations/0083_b22_attention_policy_and_consumers.sql`, sha256 `7e866529…`, 1,111 lines), on `phase6-b22` cut from `main`
`5165a97` (#59 merged under the owner's 2026-09-24 word on the bounded B21 review, `audit/reviews/The_Eye_a2303ff_B21_Review_and_B22_Delivery.md`,
filed with this candidate). The owner's scope: fix the shared nonce-sweep hang by an additive migration (no further owner decision), then the
planned consumers and the attention policy, L10-I05's package cause and the fitness/coherence-to-attention behaviour; return the demonstration
containers to the accepted official pins under the backup, restore-check and rollback conditions. Readers: a specification sweep
(`spec-attention.md` — the V00–V10 obligations of L10-I05, L10-C02, L10-I02, L1-I03/-I04, L2-I02, L9-I05, the NOT catalogue) and a code map
(`code-map.md` — the nine hard-codes that kept a subscription to GraphChanged/MemoryCorrected, the module direction, every pin); the harness
was written by one implementer and the moved pins by another on disjoint files, the web page by a third; the integrator wrote the migrations,
the API, the consumers and the act.

### B22.1 — the sweep never waits (0082)

**The defect** (the B21 rehearsal's wedge, the review's technical decision): `ctx.build` began every capability with an UNCONDITIONAL
`DELETE FROM ctx.issued WHERE expires_at < clock_timestamp() - interval '1 hour'`; the deleted rows stay row-locked by that transaction, so a
governed write that awaits another governed operation inside its own transaction made the inner operation's `ctx.build` wait on its own outer
transaction — a cycle across two connections PostgreSQL cannot see — and every login queued behind. **The remedy, the only change:** the
victims taken `FOR UPDATE SKIP LOCKED`, oldest first (`issued_expires_at_idx`, 0057), at most 500 per issuance; no function or table added;
the payload, signature, clock, TTL bounds, mode allowlist, transaction/backend binding, the liveness check and every grant unchanged.
**The proof** (`apps/api/test/int/phase6-nonce-sweep-b22.test.ts`, 6 cases; `evidence/cp6/b22-1-nonce-sweep.txt`): N1 two connections —
the pre-0082 statement on a second connection WAITS on an outer transaction's victims (55P03 after the 1.5 s lock_timeout), the 0082 minter
returns at once (22–100 ms) and sweeps a disjoint batch of 500, a login completes meanwhile, each later issuance takes exactly one batch
(100,000 nonces planted: the in-process publisher sweeps too); N2 the authority unchanged — an expired context, a context carried into another
transaction, an expired-but-unswept nonce row and a swept nonce refused exactly as before; N3.a–d the RESIDUAL NESTED PATHS (twin grounding,
forecast issue, backtest, outcome record) each under 9,000 nonces crossing the sweep line with an idle-in-transaction watchdog: all complete.
**The control** (a scratch database through 0082 with `ctx.build` put back to its 0038 body, `B22_CONTROL=1`): ALL FOUR residual paths
WEDGE (the inner `ctx.issue_commit` waiting on the transaction id of its outer write, the holder idle in transaction). T1.8 of
`phase6-fitness-b21` kept (the run route's pre-flight); the neighbouring set (phase6-fitness-b21 + gate21-adversarial) 58/58.

### B22.2 — the demonstration's containers on the official pins

`docs/ops/evidence/live-recreation-20260924T164303Z.md`. The runbook's `backup.sh` seals under the OPERATOR'S passphrase, which is not on this
host (not searched for): the backup is the acts' own form — `pg_dump` of `eye_demo`, `eye` and the globals into
`.eye-local/backups/containers-return-20260924T164303Z/` (unsealed, stated). The isolated restore check ran ON THE TARGET IMAGES
(`postgres@sha256:77f58511…` PG 18.6, `redis@sha256:ba6e394f…`, the compose protections observed in `/proc/1/status`): counts equal to the
live source (81 migrations with the same digest, 30,999 objects, 104,291 audit events), a second API over the copy: 21/21 logins, governed reads
201. Then `docker compose up -d --force-recreate --wait postgres redis` on the reused volume (7 s): the same counts on 18.6, the demonstration
API restarted and VERIFIED, 21/21 logins, the web shell started. Rollback: the derived images remain local; the volume untouched.

### B22.3 — the attention policy and the consumers (0083)

**§1 subscribable event types.** `graph.subscribable_event_types` (ten) and `graph.subscription_consumer_events` (the types each kind may
select; the registration refuses any other — 400 from the service, 22023 from the port); the two literal CHECKs re-declared over the ten;
`subscription_delivery_receive` and `subscription_event_row` read the vocabulary; `objects.outbox_lease` routes any row of a subscribed type
(its literal dropped — a body change of an existing objects port, no port added: C14); the failure class `invalid_event` — the interface
contracts' "quarantine invalid event": a payload that is not the contract is left UNRESOLVED (`event.quarantined`, human_review), never applied,
never dropped. TS: `SubscriptionConsumer<C, E>` gained the event type parameter so the graph `ChangeEvent` union and the seven consumers stay
untouched (their METHOD_REF literals and digests unchanged — pinned).
**§2 four consumer kinds** (one action, one role each; roles 31 → 35): `observations` (ObservationRecorded → `intelligence.select_transformation_plan`,
the active extraction methods that read the evidence's source or `no_plan` with the reason), `source-health` (SourceHealthChanged, both producers'
shapes → `observation.mark_source_impact` markers set on degraded | failed | suspended | unknown and cleared on healthy | active, and the COVERAGE
LOSS routed), `proposals` (ClaimsExtracted / IntelligenceObjectAdmitted → each claim held for review routed to the review queue; nothing promoted;
the hold's confidence 1, the claim's own beside it), `attention` (ForecastFitnessChanged to unfit, ScenarioCoherenceFailed, EarlyWarningRaised →
routed; AttentionPolicyChanged → every live item re-evaluated and the policy cause noted on every committed or monitored package; the overdue
escalated at every delivery). A signal that NO LONGER STANDS (a forecast withdrawn or no longer unfit, a scenario retired or passing, a warning
closed) is recorded, not routed. The consumers live in the executive module (it imports the graph module; observation and intelligence cannot
host them — no cycles).
**§3–§5 the policy, the engine, the queue.** `executive.attention_policies` — one row per VERSION, immutable but for its supersession, set by a named
human holding domain_admin, executive or platform_admin (`executive.attention.policy.publish`, human-gated; PR-44-003), the rules validated whole
(every key known, every role a human role of the product, every bound in range), the changed sections and classes computed; AttentionPolicyChanged@v1
from the write. `executive.evaluate_attention` — transparent dimensions (consequence, confidence, hours to the response window) against the class's
thresholds: material | below_threshold | ABSTAINED (no policy, no rule for the class — never fabricated), the reasons and the version named on
every item (ES-47-002). `executive.attention_items` + the append-only `attention_item_events`: routed to the subject's owner (an active human, else
nobody) and the class's roles with a deadline; below threshold or abstained → DEPRIORITIZED, visible; a material item nobody holds → UNROUTED and
escalated at once (ES-47 failure semantics). Acknowledge (receipt, not agreement — OBJ-20), suppress (reason, expiry within the class's maximum
under the item's OWN version; visible; lapsing), close, escalate-due (overdue → the escalation roles, bounded by `max_escalations`, the exhausted
chain recorded once), re-evaluate (a new version; an item already routed KEEPS its escalation count, running deadline and reached roles — a policy
change never re-pages an exhausted chain; the harness's question, decided by the integrator).
**§6–§8.** `observation.source_impact_markers` (the issued forecasts of the source's series, the open warnings on them, the packages whose current
version's options cite them); `intelligence.plan_selections`; `decision.note_policy_changed` (package_events `policy.changed`, the version in force
at the commitment and the new one, once per cause) and `decision.reopen_package` admitting `policy_changed` (after the commitment),
DecisionReopened@v1 carrying the policy context. **§9 the register:** L10-I05, L1-I03, L1-I04, L2-I02 bound in 0083; L9-I05's clause rewritten —
**44 / 6 / 0** (partial: L1-I02, L3-I02, L4-I02, L7-I02, L10-I02, L10-I03).
**API and pages:** `/executive/attention/policy/publish|get`, `/items/list`, `/items/:id/get|acknowledge|suppress|close`, `/escalate-due`; the PDP
block "B22 (0083)"; the refusal families `attention policy rejected` / `attention item rejected` / `plan selection rejected` / `source impact
rejected` (403 → 404 → 409 → 422) and `reopen rejected: no such policy note` (404); the web page `/decisions/attention` (the queue by state with
the reasons and the version, acknowledge / suppress / close, the policy and its history, publish), the nav in the six sections, the subscriptions
page's eleven kinds.

**Defects found on the way (all fixed before the records):** the publish port appended untyped literals to a `text[]`
(`malformed array literal` — every version ≥ 2 failed; typed `::text`, the harness's A1); the reopen's new absence text fell through to 422
(the 404 row widened, A11); a lifecycle SourceHealthChanged to `approved`/`draft` would have been quarantined (a valid event that is not a health
signal — applied as `not_a_health_signal`); a claim's own low confidence would have deprioritized its review (the hold is the signal).

**Harness** `apps/api/test/int/phase6-attention-b22.test.ts` (11 cases, fresh databases `eye_verify_b22_a5`, `_a6`, and `_a7` after the
escalation-history rule; `evidence/cp6/b22-2-harness.txt`): A1 the policy (11 refusals, v2's sections, the event, immutability 55000), A2 the
eleven kinds and their types, the register 44/6/0, A3 a real data_shift → forecast.unfit (owner, deadline, reasons; analyst 403, suppress 409,
acknowledge, close), A4 scenario.incoherent (suppression bounds), A5 the warning inside and beyond the window (material / deprioritized), A6 a real
suspension → 7 markers (2 forecasts, 4 warnings, 1 package) and the coverage loss; reactivation clears them, A7 three real uploads → no_plan
(no method), no_plan (not active), selected, A8 PLANTED claims and review cases → the held claim unrouted and escalated at once, then routed when a
knowledge owner exists; no_review_required; nothing promoted, A9 PLANTED invalid payloads → quarantined, A10 escalation (due_at moved into the
past by the superuser — stated), exhaustion recorded once, the lapsed suppression reopened, A11 v3 → the live items re-evaluated, the policy note
(from 2 to 3), idempotent, the owner's reopen on the policy cause with DecisionReopened carrying it. **The moved pins** (the other implementer):
the register 44/6/0 and the six partial ids in phase6-fitness-b21 / -interfaces-b18 / -graph-projections-b20; the L9-I05 phrase; the eleven
consumer kinds (the seven old digests pinned unchanged); `GRAPH_KINDS` = the kinds that select GraphChanged; two real behaviour changes in
phase6-interfaces-b18 (S2(a) the attention subscriber now routes the re-checked scenario; S3(d) `policy_changed` a known cause kind → 404);
the upgrade proof's roles 35 and migrations 62.

**The demonstration** (`scripts/phase6/act-b22.mjs` → `evidence/cp6/act-b22.txt`; five rehearsals on a restored copy with its own Redis and a
vault clone — the first two stopped on the act's own casting and timing: U. Fischer holds collection_manager in the mirror domain only; a
re-evaluated item keeps its running deadline, so version 1 carries the two-minute warning deadline; the third and fourth on the reactivation's
own tick taking the day's rows — the scene now counts from the reactivation and says which run admitted what; the fifth held whole): `eye_demo`
backed up (`.eye-local/backups/eye_demo-pre-0082-20260924T175523Z.dump`) and migrated with 0082–0083, the API restarted on the B22 build; the
register 44/6/0; the four consumers registered (attention and proposals REPLAYING the domain's history: 11 fitness/coherence/warning events —
10 routed, one no longer standing — and 23 extraction events: 20 claims held for review, 53 without review, 3 decided); with no policy the 30
replayed signals ABSTAINED and visible; A. Hoffmann refused by the PDP; an unknown role refused naming the key; M. Dvořák published version 1 →
AttentionPolicyChanged@v1 → 30 items re-evaluated and the policy cause noted on both packages (from none — no policy stood at their commitments);
A. Hoffmann refused on N. Eriksen's forecast item; N. Eriksen acknowledged it (receipt, not agreement); J. Weber suppressed a warning item until
tomorrow; an over-long suppression refused 422; L. Ferreira acknowledged a review item; M. Dvořák SUSPENDED the PortWatch chokepoints source →
markers on the unfit forecast and the warning resting on it, the coverage loss routed to the collection managers, acknowledged; REACTIVATED →
both markers cleared; the collection found nothing new (the reactivation's tick: 0 admitted, 1 unchanged — said, not staged); version 2 (the
scenario class from C3, the warning escalation widened) → 31 items re-evaluated (one material → below threshold), the policy note on the B18
package; J. Weber refused; L. Brandt REOPENED the B18 corridor package on the POLICY CAUSE (version 3 a draft), DecisionReopened@v1 with
recorded_cause policy_changed; the two-minute warning deadline waited out, M. Dvořák escalated 6 overdue items to the executive and domain
administrator — ALL SCENES HELD (128 s).

**Stated limits.** in_app delivery only (the Execution Gateway is not built); no timer host for escalation (the attention subscriber at every
delivery and a person's request); the briefing gains no attention section (BRF@v1 is closed — BRF@v2 is B23's, with MaterialChangeRaised); the
extraction run on a selected plan stays an agent's act; the markers are read beside the products and do not yet CONSTRAIN decision-active use;
packages are reached only where an option cites the forecast itself (the demonstration's cite runs and assumptions); the overload rule is
validated, not enforced; the remaining materiality dimensions (probability, reversibility, exposure, strategic relevance, information value) are
not policy dimensions yet; no approval step for a suppression; no new hosted browser walk (the page is covered by the web unit tests and the build).

**Hosted (bound once):** ci 36043290422 at `9f6a77e` (PR #60; one attempt) — unit 2390/2390 + 9/9, acceptance 58/58, the integration suite 1103/1103 in 76 files with both B22 harnesses, the upgrade proof through 0083, C18 623/623 + 44, browser 51, supply-chain and the recheck green; C19 lifecycle 36043290505 green. The earlier head `567e669`'s build-test failed at the audit accounting control (the summary committed without its unit section) — preserved, corrected by `9f6a77e`. No unit promoted. The merge of #60 awaits the owner's word.

## B23 — the six partial interfaces bound (0084): MaterialChangeRaised and ReviewConvened as events, the Acquire stream form, RetrieveContext, CommitGraphRevision, BranchScenario; the briefing's attention section (BRF@v2); the register 44/6/0 → 50/0/0 (implemented)

**Where it stands.** `phase6-b23`, cut from the planning branch (`planning/delivery-plan-2026-09`, PR #61, stacked on #60). The first stage of the finite delivery plan (`audit/DELIVERY_PLAN.md` §3.1). Its completion conditions are clause by clause in `audit/delivery/STAGES.csv` (B23). B23 completes no feature group: it advances F-P6-07, F-P6-14, F-P1-09, F-P3-16, F-P3-08, F-P4-08 and F-P6-12, whose other remaining clauses stay open.

**How it was built.** The current account (A1) ran it with five implementers, one per part, each in its own git worktree with its own disposable databases (`eye_verify_a1_b23_<part>_*`) and heavy runs through `scripts/dev/heavy-slot.sh`. The integrator combined the five sections into ONE migration, `0084_b23_interfaces_and_briefing_v2.sql`, before candidate verification (DELIVERY_PLAN.md §6.3 rule 6; `MIGRATION_LEDGER.csv`). No function is re-declared by two sections.

### B23.1 — §A: MaterialChangeRaised@v1 (L10-I02), ReviewConvened@v1 (L10-I03), BRF@v2

- **The producer.** The decisions subscriber publishes **MaterialChangeRaised@v1** in the same transaction as the package note, only when the note is new and of class `material_change`. It carries:
  - consequence (C3 if the decision was executed, else C2);
  - confidence (1 for a withdrawal, an invalidation or a measured material recomputation; 0.8 for an assessed-unfit forecast; 0.5 when not measurable);
  - hours to the decision's deadline;
  - the attention-policy version in force.
- **The consumer.** The attention subscriber routes the class `decision.material_change` to the package owner under the policy. Redelivery, replay and an upstream re-drive make no second item (the delivery ledger and the item key). A malformed event is quarantined (`invalid_event` → human_review). A publication lost from the queue is reconciled.
- **Governed reviews.**
  - Tables: `executive.reviews` and the append-only `review_events`.
  - Ports:
    - `executive.convene_review`: a human-gated exact rule. The subject is an objective, decision, scenario, commitment or outcome, which must exist in the domain at the named version. The chair and the reviewers are active humans. The convene key works under the key + digest idiom.
    - `executive.close_review`: the chair concludes; the convener or the chair withdraws.
  - Event: **ReviewConvened@v1**, routed as `review.convened` to the chair. A closed review no longer stands.
- **BRF@v2.** `executive.briefings` gains `schema_version` (default `v1`) and `attention`, bound by a CHECK. There is a `BRF@v2` schema row, and `compose_briefing` is re-declared from 0069 with two parameters. Every new edition carries the ATTENTION SECTION, built as of its `known_at` from the item event log and covered by the content digest: the routed items with confidence bands (≥0.8 high, ≥0.5 medium, else low or unknown), the counts by state, and the material changes since the prior edition. v1 editions still read as v1.
- **Consumer identities and vocabulary.** Two identities changed: the decisions and attention consumers' METHOD_REFs are new digests, so live subscriptions are re-registered. The subscribable vocabulary goes from 10 to 12 types. The attention signal classes are +2.

### B23.2 — §B: the Acquire STREAM form (L1-I02)

- **Tables:** `observation.acquisition_streams` (one live stream per source and partition key), `acquisition_stream_events` (append-only), `acquisition_segments` (content immutable), `acquisition_incomplete_ranges`.
- **Ports:**
  - open (idempotent: an existing live stream is resumed, and a stream left running by a dead run is recorded interrupted first);
  - append segment (the same digest is a redelivery; a different digest is refused, 23505 → 409);
  - backpressure, incomplete range, pause, close (`completed` only at the end of the range with no unresolved range, else `closed_incomplete`);
  - interrupt (the run, an operator, the sweeper).
- **The loop.** `AcquisitionLifecycle.runStream` pulls one segment at a time with credit. Evidence goes ONLY through the existing admission (purpose, rights, residency, custody, quarantine, de-duplication unchanged).
- **The command form is unchanged.** The stream never advances `connector_checkpoints`, and streams are not scheduled.
- **The demo fixture.** A synthetic, labelled paged replay fixture for the Red Sea corridor, with a planted publisher gap: `fixtures/phase1/replay/red-sea-corridor-stream`, contract in `STREAM_SOURCE_CONTRACTS`.

### B23.3 — §C: RetrieveContext (L3-I02)

- **The query:** `memory.retrieve_context`, STABLE and SECURITY INVOKER. It serves the version current at `as_of` whose own payload names the subject, filtered by the query's PURPOSE, with explanation links (dependency, derivation, supersedes, related).
- **Route:** `POST …/graph/memory/context` (an exact rule cloning `memory.item.retrieve`).
- **The read's order:**
  1. The projection state is read first.
  2. Clearance and audience roles are applied in TypeScript (the briefing's rule). Items withheld by policy are neither counted nor mentioned.
  3. One access row per served version is written, as the governance record of the read.
- **Product state:**
  - `partial`: something left out and named (a link resting on a withdrawn edges or entities partition; the content tier down while withdrawn — 200, not 503);
  - `stale`: lagging or unverified;
  - `complete`: otherwise.
  - The audit result code is `OK` or `EYE-DEG-001`.
- **No state change.** The harness PROVES it: the revision, the items hash, the MEM versions, the partitions, the dependencies and the outbox are all equal before and after; only POL, AUD and access rows grow.

### B23.4 — §D: CommitGraphRevision (L4-I02)

- **The domain's revision.** `graph.revision_heads` is advanced once per committed graph transaction by statement triggers on the six graph event tables. It starts at 0 in 0084, with no back-fill.
- **The port:** `graph.commit_revision`, an exact rule; knowledge_owner may commit. Its order:
  1. Lock the head.
  2. Look up the idempotency key. The same change set returns the first result even after the head moved; a different change set under the key → 409.
  3. The expected head → 409 on a conflict.
  4. The change set's ontology version must be the active one.
  5. Nodes need an ENT claim version admitted, with lineage, decided in review.
  6. Edges need a REL claim. Evidence, digest, method, run and confidence are taken FROM the lineage; a mismatch is refused. Edges of earlier claim versions are superseded.
- **All or nothing.** The event details are the ones the B20 derivations read. ONE GraphChanged `revision.committed` goes out per revision, built without reads; a repeat publishes nothing.
- **Stated limits:**
  - Graph writes in a domain queue behind the head lock.
  - A revision and a split on the same entity can deadlock. PostgreSQL aborts one side with 40P01, which is answered 500, not a mapped 409.
  - Strategy objects, retractions, splits and ontology amendments are not in a change set.

### B23.5 — §E: BranchScenario (L7-I02)

- **Schema:** `scenarios_current.current_version`, `branches_current.added_in_version`, and `prediction.scenario_branch_requests` (key + digest).
- **The port:** `prediction.branch_scenario`. It admits SCN v(n+1) (v(n) untouched) and adds an upside, downside, disruption or user-defined branch.
- **Idempotency and refusals:**
  - the same key and body → the recorded result;
  - a different body under the key → 409;
  - a stale version, a concurrent writer or a duplicate (name, label, or a `duplicate_branch` match) → 409;
  - baseline and the other kinds → 422.
- **Coherence** is re-run on the new version (trigger `branch`).
- **The run gate.** `simulation.open_run` refuses a branch added after the version the run binds. The two version-1 hardcodes (the warning source id and the check-coherence target) now read the current version.

### B23.6 — the register and the stale rows

- **The register.** The six rows are bound in 0084 with their `bound_to` texts, each stating what is NOT bound. 0084 §F asserts **50 / 0 / 0**.
- **The stale-status candidates.** The 49 rows of `audit/delivery/STALE_STATUS_CANDIDATES.csv` were each checked against the code by a read-only verifier, and the verdicts applied:
  - 16 moved to `implemented`;
  - 31 moved to or within `partial`, each with its remaining work rewritten, and release corrected where the code is on `main`;
  - 2 kept.
  Every moved row cites its evidence ("B23 stale-status check 2026-09-25").
- **Requirement rows.** L3-I02, L7-I02, L10-I02 and L10-I03 are `implemented`. L1-I02 and L4-I02 stay `partial`: residency and rate at acquisition; ontology amendments in a change set. L10-I05's BRF@v2 clause is delivered.
- **Rows by implementation status:** implemented 984 → 1003, missing 2532 → 2513.
- **Acceptance units.** Seven gain B23 evidence and stay open (no promotion): AU-OBS-0028, AU-MEM-0023, AU-MEM-0078, AU-PRD-0017, AU-EXO-0010, AU-EXO-0025, AU-EXO-0030. The split stays **3,555 = 3,179 + 339 + 37**.

### B23.7 — the evidence

- **Harnesses** (each on a fresh database):

| Harness | Result |
|---|---|
| `phase6-attention-events-b23` | 9/9 |
| `phase6-acquire-stream-b23` | 8/8 |
| `phase6-retrieve-context-b23` | 9/9 |
| `phase6-graph-revision-b23` | 11/11 |
| `phase6-branch-scenario-b23` | 11/11 |

- **Full integration suite on a fresh database:**
  - run 1: 1149/1151 in 81 files. The two failures, `phase6-executive-requests` FOLLOW-UP (the briefing's window cut-off) and `phase6-graph-subscriptions-2` B7 telemetry (a transient unresolved retrieval delivery), pass alone (24/24) — load-timing, recorded with the carried H1 items;
  - run 2: see §37.2 of PHASE6_REPORT.
- **Unit and the rest:**
  - unit 2441/2441 + the hermetic meta 9/9;
  - acceptance 58/58;
  - the upgrade proof PASS (migrations 63, schema registry 37, roles 35);
  - browser 51/51 on a fresh database (the demo API and web stopped for it; the rehearsal Redis, never the demo's).
- **The act on `eye_demo`:** `evidence/cp6/act-b23.txt` — ALL SCENES HELD, 49 checks, 28.5 s (two clean rehearsals on restored copies first). The backup before 0084 is `.eye-local/backups/eye_demo-pre-0084-20260924T232509Z.dump`.

**Stated (not done here).**
- Delivery beyond in_app, the timer host, the remaining materiality dimensions, suppression approval, delegation, queue evaluation and constraining markers are B24.
- Residency evaluated at acquisition and per-contract rate limits.
- Ontology amendments inside a revision.
- Scenario rooms.
- A timer for stream scheduling.
- The deadlock mapping noted in B23.4.

## Order and the next implementation batch

B3, B1 and B2 are done in code, B4/B5 applied to the audit (the 2026-09-11 checkpoints), B6 done in
code (2026-09-12, on the recovery machinery corrected by 0062 after Codex's finding) and B7 done in code
(2026-09-12, after Codex's third finding), B8 (2026-09-12, after Codex's B7 findings), B9 (2026-09-13, after
Codex's B8 findings; the accepted stack merged on `main` in the recorded order meanwhile) and B10 (2026-09-13, after
Codex's B9 review: F1 closed on the fixed candidate, F2/F3 and G2 carried into this batch), B11 (2026-09-13; its closure of Codex's B11-F1/F2 on 2026-09-14, merged with #48 on 2026-09-15), B12 (2026-09-15, the register's next missing archive-lifecycle capability; merged with #49 on 2026-09-16 on Codex's bounded functional review) and B13 (2026-09-16, the schedule retirement and the customer export's delivery, on `main` after #49; merged with #50 on 2026-09-16 on Codex's bounded review) and B14 (2026-09-16, the https exchange proven, B13-F1 corrected, the trust anchor, the revocation notice, on `main` after #50; merged with #51 on 2026-09-16), B15 (2026-09-16, the relationship closure and the streamed archive; merged with #52 on 2026-09-16 after retargeting) and B16 (2026-09-16, the governed import and the NORDWERK round trip, B14-F1 and B15-F1 corrected, on `main` after #52; PR #53) and B17 (2026-09-16, imported knowledge published to subscribers, the origin's revocation propagated into the importing domain, the signed notice, the review gate; stacked on #53; #53 and #54 merged on 2026-09-16 under the owner's word on Codex's bounded B16/B17 review) and B18 (2026-09-16/17, on `main` after #54: Codex's B17-F1 corrected first, the lifecycle announced — ten interface rows bound, 36/14/0 — with the withdrawal → invalidation → reopen chain, the working domain of a tenant-homed principal and the hosted browser walks; PR #55) and B19 (2026-09-17, the source-derived memory records — a record derived by a person from a claim version or a warning with its provenance, inherited controls, the review and lifecycle gates, the basis followed and the deletion pause; stacked on #55; #55 merged to `main` as `e70f90f` on 2026-09-22 under the owner's word on Codex's bounded B18/B19 review, its ci red on the C15 patched-image recheck step by design and its C17 finalize skipped, #56 held for the C15 return) and B20 (2026-09-22, the index tier — the six projection partitions with a derived watermark on every graph and memory read, the symmetric check that withdraws where the JOIN-only check passed poisoned and missing rows, the operator's withdrawal and the rebuild writer, the labelled last-valid reads and the constrained traversals, the memory content tier's metadata-only fallback, the deletion pause and the briefing's flag; cut from B19's records head `3ea676d`, stacked on #56; #57, #56 and #58 merged to `main` `e180b18` on 2026-09-23) and B21 (2026-09-24, fitness, coherence and challenge — the four foresight rows bound, the register 40/10/0; Codex's B20-F1 corrected first; the vault clause of AU-MEM-0067 delivered for Class B and bounded at Class A; the rehearsal wedge found and fixed; cut from B20's records head `13ed40c`, its PR with base `main`). The
hosted run at `5118376` (836/836 on a fresh database) verified the B1/B2 units on the hosted chain —
one artefact, no deployment leg. Every leg of every unit stays unaccepted until a deployment profile
carries its own signed evidence (P7-D). The synthetic-company demonstration (`eye_demo`, NORDWERK) remains the deliverable
every batch is exercised on: B3's kinds become visible on the demonstration when a scenario with the
new kinds is declared there through the governed route (a scripted act, `scripts/phase4/`), which is
the next demonstration step after the hosted run is green. B22 delivered the consumers and the attention policy (0083; the register 44/6/0) and the sweep's remedy (0082). Then B23 (the commands and the query — L1-I02, L3-I02, L4-I02, L7-I02, L10-I02/-I03). B23 bound them and the briefing's attention section (0084; the register 50/0/0). From here the order is the finite delivery plan's (`audit/DELIVERY_PLAN.md`, `audit/delivery/STAGES.csv`): B24 (attention completion) next on A1. The C15 return to the official images merged with #57 (`main` `870b212`); the live demonstration containers were recreated onto those images on 2026-09-24 under the owner's word (§B22.2). The `ctx.build` remedy was delivered as 0082 (§B22.1) — the owner's 2026-09-24 word made it a technical choice. AU-MEM-0067 stays OPEN without a waiver: the per-object class (a missing or corrupt object under a reachable root) keeps A7's one 409 and the specification obligation stands (§B21.2's table).
