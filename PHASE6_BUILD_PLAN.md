# THE EYE — Phase 6 Product Build Plan: Decision Intelligence + Executive OS (L9–L10)

> Scope comes strictly from the frozen roadmap (`docs/the-eye-master-build-prompt.md`, Phase 6),
> the corrected roadmap (`PHASE0_PLAN.md` §3 and `PROGRESS.md`: *Decision, Executive Briefing,
> Reporting agents; Planner/Supervisor/Workflow orchestration completed*), the constitution's
> decision and executive chapters (Volume 0 §16–§17; invariants C-004, C-005, C-010, C-011,
> C-015, C-017, C-024, C-025, C-027, C-028, C-033, C-036, C-047, C-050) and the boundary the
> demonstration already promises (`docs/phase1/DEMO_STORYBOARD.md` §2 row 6;
> `docs/phase1/CAPABILITY_PRESERVATION_MAP.md` rows "Decision intelligence" and "Executive
> briefings"). It does not touch Phase 7 beyond the three agents the corrected roadmap assigns
> here.
>
> **Status: APPROVED 2026-09-08 with the owner's five corrections (§13) incorporated.** The six
> owner decisions are recorded in §10. **F1–F8 (§6) and the decision rules (§6a) are FROZEN** as
> of the first implementation commit on `phase6-decisions` (base PR #44 at
> `c5460465aa3c9a551d15ee5f565c8986dd509a55`); they are not broadened after implementation begins
> unless new evidence shows a specific constitutional violation. The plan preserves, without change:
> the four source decisions of 2026-09-05 and the two of 2026-09-07 (§4), the forecast
> limitations (T1–T4, D1–D8), the twin's `unvalidated (synthetic grounding)` status, the frozen
> E1–E8 and grounding rules of Phase 5, the deferred automatic `CorrectionApplied` consumer, the
> closed functional reviews of Phases 4 and 5 and of PRs #43 and #44, and the recorded merge order.

---

## 1. Product objective

**Decide with what was known, and be able to prove it later.**

Phases 1–5 make the corridor observable, interpretable, connected, forecast, warned, modelled and
simulated. None of them decides. Phase 6 turns that foresight into an accountable human decision:
a **decision package** that puts explicit objectives against viable options whose consequences are
the simulation runs already held, with the uncertainty and the dissent on the record, the named
people who must approve, and the conditions under which the decision will be watched; an
**approval and commitment workflow** in which nothing becomes committed without a valid, named
human approval; an **executive surface** — briefings, decision rooms, ownership, review cadence —
that organises attention around what changed, why it matters, who owns it and which window is
closing; and **Decision Replay**, which reconstructs *known → believed → tested → decided →
observed* from the evidence and versions that existed at each moment, with hindsight excluded by
construction.

> The decision owner opens the room for *the January corridor collapse*. The package puts five
> options — reroute, air bridge, draw-down, draw-down + reroute, do nothing — against the
> objective of keeping the Regensburg line running through the quarter; each consequence is one
> of Act V's runs, marked synthetic, with the assumption that carries the result and the twin's
> validation status beside it. The collection manager records a dissent. An executive who is not
> the author approves; the owner commits; the commitment appears in the strategy graph. Weeks
> later, after the publisher's restatement, anyone replays the decision and sees exactly what was
> known, believed and tested when it was taken — and, separately, what was observed after.

The roadmap's acceptance sentence is the product test: *no decision reaches "committed" without a
human approval record; a completed decision can be replayed showing exactly what was known at the
time.* The constitution adds the discipline: a named human authority makes every final decision
and no agent may approve its own output or convert a recommendation into authority (C-004,
C-028); every recommendation is explainable (C-005); options are compared against explicit
objectives, constraints, risks, opportunities, trade-offs, second-order effects, reversibility and
information value (C-024); the state of knowledge at decision time is preserved and replayable
against later evidence without rewriting history (C-025, C-011); the executive surface organises
attention, decisions, scenarios, evidence, objectives, commitments and outcomes (C-027); approvals
and decisions produce tamper-evident, attributable audit records (C-036); uncertainty, provenance,
decision state and consequence are exposed at the point of use (C-047); and The Eye never
autonomously executes a decision that materially determines rights (C-050).

Phase 6 does **not** learn from outcomes automatically, ship prompt or threshold changes, or run
autonomous agents beyond the three bounded contracts the corrected roadmap assigns (Phase 7).

## 2. Dependency baseline, and what is reused

**Baseline: Phase 5 at PR #44's head** — `scheduling/automatic-collection-2026-09`, whose
functional correction review is closed at `e0d69060` (SCHEDULED_COLLECTION.md §6), stacked on
PR #43 (closed at `91263061`) and PR #41 (closed at `48f43bed`). All are unmerged behind the red
C15 gate; Phase 6 is built on that stack (§9) and its merge is sequenced after it.

**Three clocks, never collapsed.** Phase 4 and 5 carry `known_at` (RECORD time) and
`observed_through` (WORLD time). Phase 6 adds the one it is about: **`decided_at`**, the record
instant at which a named human committed. A decision package version binds both cut-offs it was
built under; the commitment binds `decided_at`; the replay reconstructs *known / believed / tested*
strictly under the package's cut-offs and *observed* strictly after `decided_at`. The corridor
replay evidence was recorded in 2026; nothing in Phase 6 backdates a decision into January 2024 —
the demonstration decides in 2026 about a world observed through 2024-01-17, and says so.

| Reused as built | From | How Phase 6 uses it |
|---|---|---|
| Canonical objects, 43-column header, `objects.admit_version`, schema registry, `validateHeader`, `canonical_write_actions` | Phase 0 | packages, approvals, briefings and replay records are canonical objects; nothing new in the header |
| Governed pipeline (`PipelineService.write/consequentialRead`), capabilities, SECURITY DEFINER ports asserting the bound action, FORCE RLS, receipts, audit chain | Phase 0–1 | every decision write goes through the same envelope and scope triple; every approval, commitment, dissent and refusal is an audited receipt (C-036) |
| The policy engine's consequence classes and the **fail-closed C3+ rule** (`maxConsequence: 'C2'`, "human-gate runtime not available") and the reserved error `EYE-WFL-002 human_gate_required` | Phase 0 | Phase 6 **is** the human-gate runtime: `decision.commit` is the first C3 action, allowed only under a `human_gate` obligation the commit port verifies (§3) |
| Two-person separation at the database (a source's approver ≠ its registrar, enforced by CHECK and port) | Phase 1 | the same shape for decisions: approver ≠ author ≠ committer's own approval; enforced in the port, not the UI |
| Agent principals with identity, owner, budgets, revocation; agent sessions minted from the registry; the scheduler and worker of scheduled collection | Phase 1, #44 | the Decision, Executive Briefing and Reporting agents are registered principals with budgets and stop conditions; cadence jobs run through the existing scheduler with their own job kind; agents cannot approve (§3, F7) |
| Evidence with custody, versions retrievable as known at; withdrawal and governed deletion semantics; availability established by reading (#44) | Phase 1, #44 | replay reads evidence as known at the package's cut-offs; an artefact withdrawn later is reported unavailable in the replay, never substituted |
| Claims with truth state and lineage; the human review queue | Phase 2 | a package's "believed" layer cites claims with their truth state retained |
| Entities and edges with temporal validity; Strategy Graph `OBJ/ASU/DEC/CMT/OUT` with `graph.dependencies`, `record_impact` and the operator-initiated walk | Phase 3 | a package binds to exactly one `DEC` strategy object and its `OBJ` objectives; a commitment creates a `CMT`; a recorded outcome creates an `OUT`; invalidating an assumption flags the packages that rest on it through the walk |
| Forecasts with validation states, scenario trees and branch flips under both clocks, indicators, warnings with owners and response windows, `foldControls` | Phase 4 | the "believed" layer; monitoring conditions bind to indicators and warnings; windows closing come from warnings' response windows; inherited controls fold from every cited object into the package |
| Twins with kinds and citations, simulation runs with immutable contracts, reproduction verdicts, sensitivity, comparison on a common baseline, reconciliation | Phase 5 | the "tested" layer: an option's consequences cite completed runs by id, version and digest; uncertainty carries the run's sensitivity, the twin's validation status and the forecast's validation state; outcomes reconcile against simulated consequences with the Phase 5 port |
| Readiness register and live scheduled collection | #43, #44 | briefings say whether the evidence behind them is live, replayed or blocked; a stale or failed collection is "degraded", never "normal" (constitutional rule 7) |
| Model Gateway (replay / local-live) | Phase 2 | **not used for numbers, rankings or approvals.** Optional narrative on a briefing, as in Phases 4–5; `narrative` may stay `null` |
| Post-C18 upgrade check, `test:int:all`, acceptance suite, demo scripts, the demo Playwright suite | Phase 0–5 | extended by lines, not by new gates |

**What Phase 6 adds:** the `decision` schema (packages, versions, options, consequences,
dissent, approver policies, approvals, commitments, monitoring conditions, outcomes), the
`executive` schema (briefings, decision rooms, membership, review cadence), the replay port and
its records, four canonical object types, four roles, `decision.*` / `briefing.*` / `room.*` PDP
actions with the first human-gated C3 action, three bounded agent contracts, a sixth workspace
(Decisions, Briefings), and Act VI of the corridor demonstration. Nothing else.

**Validation limitations carried into decisions, verbatim.** A package cannot say more than its
inputs do. Every option's consequence block carries, and the screens show: the twin's validation
status (`unvalidated (synthetic grounding)` for NORDWERK), the runs' `synthetic` truth state, the
assumptions carrying each result (the runs' sensitivity), the scenario branch's flip basis and both
clocks, and each cited forecast's validation state (`validation_impossible` for the corridor,
`validated_retrospective` for ECB, T3 unmeasured). The inherited controls of every cited object
fold into the package (`foldControls`, fail-closed); a package citing a synthetic run carries
`synthetic_state = true` and the demonstration's decision is labelled **synthetic** in every
surface, exactly as the storyboard lists "the decision itself" among the fictions.

## 3. Architecture

| Component | What it is |
|---|---|
| **Decision package** | A `DPK` canonical object, versioned; each version is a draft until proposed, then immutable. A version declares: the **`DEC` strategy object** it is the package of (created with it when absent), the **objectives** (`OBJ` refs; at least one), **constraints** and **policy limits**, the **options** (at least two, one of which is the explicit status quo *do nothing*), and for every option its **consequences** — typed citations `{ kind: run \| forecast \| claim \| evidence \| assumption \| warning, id, version, digest }` where a *simulated* consequence cites a completed `SIM` run (control or intervention on one common baseline) and an option with no run says `unsimulated` with a reason and is marked as such — the option's **uncertainty** (the runs' sensitivity, the twin's validation status, the forecasts' validation states, the branch's basis, both clocks), **reversibility**, **second-order effects**, **information value** (what a further observation would change), **risks and opportunities**; the **approver policy** (named human principals or role-at-scope with a quorum, and the rule that the author cannot approve); the **monitoring conditions** (indicator thresholds, warning classes, review cadence, the owner who is routed to); the **owner**; the folded **inherited controls**; and — from proposal onward — **the choice**: what is actually being decided. A version is proposed with `choice = { option_key, rationale (the human's own words), decision_deadline, accepted_trade_offs[], action_owner (a named human principal), outcome_criteria[] }` where each outcome criterion is measurable — `{ key, quantity, unit, target, comparator, by }` — and names the twin element or indicator it will be observed on. The choice, its conditions, the options, the objectives, the approver policy and the monitoring conditions are all inside the **version digest** an approval signs; **changing the choice is a new version and needs fresh approval**; the commitment, the `CMT` it creates, the monitoring conditions and every outcome identify the approved `option_key` and the version digest. Approving a menu of alternatives is not an approval of anything. Truth state `asserted`; `synthetic_state` folds up from citations. Its `known_at` and `observed_through` are the cut-offs under which the cited runs and evidence were read and are bound into the version. |
| **Dissent** | Append-only records on a package version by a named human principal: position, rationale, the citation it rests on if any. Never deleted, never overridden by approval; shown in the package, the briefing and the replay. An agent cannot dissent (a supervisor's *refusal* is a different record, §3 agents). |
| **Approval and commitment workflow — the authority contract** | States `draft → proposed → under_review → approved → committed → monitoring → closed`, with `rejected` and `withdrawn` terminal, every transition an append-only event with the principal. **Approval** (`APR` canonical object, append-only, revocable by its approver) binds the approver, the exact package version, its digest (which includes the choice), the decision, an expiry and the session assurance; the port refuses an approver who is the author, the proposer or the action owner of that version, who is not an active human principal in the tenant, who does not satisfy the approver policy at the package's scope, or whose approval would already be expired. A version becomes `approved` when the policy's **quorum of distinct eligible humans** is met by unexpired, unrevoked approvals of the current digest. **Commitment** is a separate act by a named human holding `decision_authority`. **The PDP rule matches the exact action `decision.commit`** (not a prefix) at `maxConsequence: 'C3'` with the obligation `{ type: 'human_gate' }`; every other `decision.*`, `briefing.*` and `room.*` prefix stays at C2. **The route pins `consequenceClass: 'C3'`** on the commit route, so a caller-supplied lower class in the envelope cannot evade the gate, and the port verifies that the bound consequence class in the database context is `C3` and the bound action is `decision.commit` — a commit reached under any other context fails closed. Inside the transaction the commit port (`decision.commit_package`) re-verifies: the version is `approved` and its digest is the one the approvals signed; the approval set still meets the quorum of distinct eligible humans, none expired, none revoked, none by the author/proposer/action owner; the committer is an active human principal with a live session (the context's own live-authority check) and holds `decision_authority` at the package's scope; the package is locked (`FOR UPDATE`) and has no commitment — a concurrent or repeated commit is refused with the existing commitment identified, never duplicated. Anything else is refused with `EYE-WFL-002 human_gate_required` and audited. **Evidence:** the commitment record carries the approval ids and digests it rested on, the policy decision id and audit sequence of the commit, the committer and `decided_at`. On commit the port writes the **`CMT` strategy object** (title and statement naming the approved option and its conditions, linked to the `DEC`) and the canonical `CMT` version, records `decided_at`, moves the package to `committed`, and freezes the version's replay inputs. A change to a package after approval is a **new version**; approvals bind to the digest they signed and do not carry forward. |
| **Monitoring and outcomes** | Monitoring conditions bind to existing Phase 4 indicators and warning classes and to the review cadence. After commitment the package is `monitoring`: a breach or a warning in its conditions surfaces in the decision room and the next briefing, routed to the owner with the response window; a review falling due without a review event shows **review overdue**. Outcomes are recorded by a human as `OUT` strategy objects citing the observation they rest on; where an option's consequence was simulated, the outcome is **reconciled** against it with Phase 5's reconciliation port (the difference recorded, nothing overwritten). Closing a package records the outcome set and the lessons as text, not as a learned parameter (Phase 7). |
| **Executive briefing** | A `BRF` canonical object, an immutable snapshot **composed deterministically from stored records** for a room or a domain at an instant: *what changed* (evidence admitted or confirmed, claims, branch flips, warnings raised or acknowledged, runs completed, packages moved — since the previous briefing, under the reader's known-at), *why it matters* (the objectives, assumptions, decisions and packages that depend on what changed, through `graph.dependencies` and `record_impact`), *who owns it* (the owners on the warnings, twins, packages and rooms), *which window is closing* (warning response windows, review deadlines, approval expiries, ordered by time left). Every item carries its truth state, its freshness and whether its source is live, replayed, degraded or blocked; nothing degraded renders as normal. **The comparison baseline is bound, not recomputed:** a briefing records its **watermark** — the prior briefing it follows (id and composed instant, or none) and the reader's `known_at` — and enumerates the **source records** it was composed from (ids and versions); its **content digest** is over those and the items, so recomposing with the same watermark and the same `known_at` yields the same digest, and a later briefing follows the recorded one rather than "whatever is newest now". The Model Gateway may add a `narrative` (nullable) that is labelled as narrative and cites the items it summarises; it never adds, ranks or removes an item. **Retrieval is governed like composition:** reading a briefing checks the reader's current authority, purpose and room membership at read time; a stored snapshot never lends a later reader the composing agent's authority, and the controls folded into the briefing (classification, rights, residency) are enforced on retrieval and on export. |
| **Decision room** | A governed space per package: members (named principals with roles: owner, approvers, dissenters, observers), the package's versions, its approvals and dissent, its briefings, the cadence (`review_every`, `next_review_at`) and the events of the room. Membership and cadence changes are governed writes by the owner. A room is `open`, `deciding`, `monitoring` or `closed` and mirrors the package's state; it adds nothing to the package's authority. |
| **Decision Replay — executable snapshot semantics** | `decision.replay(package, version, as_of?)` reconstructs five layers from the records that existed at each moment, through the existing known-at paths and **never through current projections**. Each layer has an exact cut-off: **known** — the evidence versions and series points the package and its runs cite, with `recorded_at ≤ known_at` and, where the object carries event or observation time, `≤ observed_through`; **believed** — the cited claims with the truth state of the version whose `recorded_at ≤ known_at`, the cited forecasts with the validation state of that version, the scenario branch state as of `known_at` and `observed_through` (Phase 4's `branch_state_as_of` under both clocks), the assumptions and the verification state they had at `known_at`; **tested** — the cited runs' immutable contracts and outputs digests (the run's own `completed_at ≤ decided_at`) and the reproduction verdicts with `recorded_at ≤ decided_at`; **decided** — the package version and its digest, the dissent with `recorded_at ≤ decided_at`, the approvals with `recorded_at ≤ decided_at` (revocations after it belong to *observed*), the commitment, and the **policy and authority records** of the commit (policy decision id, audit sequence, bundle version) — nothing recorded after `decided_at`; **observed** — strictly what was recorded after `decided_at` **and at or before the replay's upper bound `as_of`** (default: the replay instant; bound into the record): outcomes, reconciliations, later warnings and branch flips, later reproduction verdicts, corrections, withdrawals and deletions of cited artefacts. **Availability is reported separately from history.** A cited artefact that was later *corrected* while its cited version is retained is **historical evidence and is included** in its layer as it stood, with the later version listed under *observed*; correction alone never makes it unavailable. Withdrawal, governed deletion and loss of the reader's access are reported as `unavailable: { layer, id, version, reason }` — and the layer never substitutes a later or different version. **Two digests, kept apart:** the **content digest** is over the layers' contents only (the cut-offs and the ids, versions and digests of every included object), so two replays of the same package under the same cut-offs and upper bound produce the same content digest whatever the reader or the instant; the **invocation record** (reader, purpose, replayed instant, the availability list at that instant) is stored beside it and is not part of the content digest. A replay is itself recorded (`RPL` canonical object) with both. |
| **Agents (corrected roadmap)** | Three bounded contracts, registered as agent principals with owner, permissions, budgets, stop conditions, escalation and audit trail (constitutional rule 4, C-028), each running only the actions its contract names: the **Decision agent** assembles option cards from completed runs, forecasts and claims into a *draft* package version — it can draft and annotate, and can neither propose, approve, dissent nor commit; the **Executive Briefing agent** composes briefing snapshots on the room's cadence or on demand, within a budget of reads and gateway calls, and stops and escalates to the room owner when the budget is hit or an input is degraded beyond its threshold; the **Reporting agent** renders reports and exports from stored records with attribution, classification and truth states intact, and refuses an export the reader's clearance does not cover. **Planner / Supervisor / Workflow orchestration is completed for these three**: a workflow contract records the steps of a decision (draft → propose → review → approve → commit → monitor → close) as governed events; the planner schedules the briefing and review tasks through the existing scheduler; the supervisor enforces budgets, stop conditions and the separation rules — an agent's attempt to approve, commit or dissent is refused at the PDP and at the port, and the refusal is recorded. Nothing learns or self-modifies (C-031). |

**Data model.** Forward migrations at the next unused number when implementation starts (`0041`
at the time of writing), in the shape of `0032`–`0040`: `decision.*` and `executive.*` with event
logs + projections, scope triple NOT NULL and CHECK-constrained, `FORCE ROW LEVEL SECURITY`,
SECURITY DEFINER ports asserting the caller's own bound action, append-only where the constitution
says immutable (approvals, dissent, commitments, replay records, briefings). The post-C18 upgrade
check is extended by lines — **not a new gate**.

**Every admission boundary, inventoried and to be proved** (in the shape of Phase 5 §3):

| Boundary | `DPK` | `APR` | `BRF` | `RPL` |
|---|---|---|---|---|
| `objects.schema_registry` | `DPK@v1` | `APR@v1` | `BRF@v1` | `RPL@v1` |
| `observation.canonical_write_actions` | `decision.package.propose → ['DPK']` | `decision.approve → ['APR']` | `briefing.compose → ['BRF']` | `decision.replay → ['RPL']` |
| database ports | `decision.declare_package`, `open_version`, `set_option`, `record_dissent`, `propose_version`, `record_review`, `commit_package`, `record_outcome`, `close_package` | `decision.approve_version`, `revoke_approval` | `executive.compose_briefing`, `open_room`, `set_membership`, `set_cadence`, `record_review` | `decision.record_replay` |
| PDP actions and roles | `decision.package.*`, `decision.dissent`, `decision.read` — `decision_owner`; `decision.commit` (**C3, human gate**) — `decision_authority` | `decision.approve` — `decision_approver` (human only) | `briefing.*`, `room.*` — `executive`, `decision_owner`; `briefing.compose` also `briefing_agent` | `decision.replay` — every reader role, audited |
| `graph.dependencies` / `record_impact` | dependent `DEC` (the package's strategy object) with a `packages` bucket | — | — | — |
| UI | Decisions workspace: state badges, `SYNTHETIC` on every simulated consequence, dissent visible | approval receipts only from authoritative responses | Briefings workspace: degraded and window-closing marks | Replay view: five layers, cut-offs shown, unavailable marked |
| Controls | a `twin.version.admit`-authorised writer cannot admit a `DPK`; an agent principal cannot admit an `APR`; a `decision.commit` without a satisfying approval set fails closed with `EYE-WFL-002`; a null or malformed nested citation fails the JSON CHECK closed | the author's own approval refused by CHECK and port; an expired approval refused at commit | a briefing cannot be composed for a room the reader is not a member of; a degraded input cannot be rendered as healthy | a replay cannot read a version recorded after `decided_at` into known/believed/tested |

**The bounded Phase 3 writes, inventoried separately.** Phase 3's `graph.declare_strategy` port serves `graph.strategy.declare` only and does **not** accept any `decision.*` capability; that separation is preserved. A package therefore **binds to a `DEC` that a strategy owner has already declared** through Phase 3's own route — a package never declares a `DEC`. Phase 6 adds exactly two bounded writes into the strategy graph, each in its own port asserting its own action and writing one object type: `decision.commit_package` (action `decision.commit`) writes the **`CMT`** row and event (naming the approved option and its conditions, linked to the `DEC`) and admits the canonical `CMT` version — `canonical_write_actions: decision.commit → ['CMT']`; `decision.record_outcome` (action `decision.outcome`) writes the **`OUT`** row and event and admits the canonical `OUT` version — `decision.outcome → ['OUT']`. Neither port can write an `OBJ`, an `ASU` or a `DEC`; a `decision.*` capability cannot reach `graph.declare_strategy`; and `graph.strategy.declare` cannot admit a `DPK`, an `APR` or a `CMT` (controls in the M2 suite).

**Roles, actions and read boundaries — the complete inventory.**

| Role | Kind | Grants (PDP action → role) |
|---|---|---|
| `decision_owner` | human | `decision.package.declare`, `.version`, `.option`, `.choice`, `.propose`, `.withdraw`, `decision.dissent`, `decision.review`, `decision.outcome`, `decision.close`, `decision.read`, `decision.replay`, `room.*`, `briefing.read` |
| `decision_approver` | human | `decision.approve` (and revoke), `decision.dissent`, `decision.read`, `decision.replay`, `briefing.read` |
| `decision_authority` | human | `decision.commit` (exact action, C3, human gate), `decision.read`, `decision.replay`, `briefing.read` |
| `executive` | human | `decision.read`, `decision.replay`, `briefing.read`, `room.read`, `report.render` |
| `decision_agent` | agent | `decision.package.draft` (options and uncertainty into a **draft** version only), `decision.read` — never propose, approve, dissent, commit |
| `briefing_agent` | agent | `briefing.compose`, `decision.read`, `prediction.read`, `twin.read`, `simulation.read`, `graph.read`, `observation.read.*` (the upstream reads a briefing needs, each audited) — never any write outside `briefing.compose` |
| `reporting_agent` | agent | `report.render`, and the same upstream reads — never any decision write |
| existing readers (`domain_admin`, `domain_analyst`, `auditor`, `strategy_owner`, `forecast_owner`, `twin_owner`, `simulation_operator`, `tenant_admin`, `platform_admin`) | human | `decision.read`, `decision.replay`, `briefing.read` (audited consequential reads) |

The PDP checks the role binding; the ports check the **principal kind** (`identity.principals.kind = 'human'`) for approve, commit and dissent, so a mis-bound agent principal is refused at the port as well.

**Agent session path.** Phase 6 agents are registered in `executive.agents` (a principal of kind `agent`, the contract kind, owner, budgets, stop conditions, escalation target, status). A run for an agent is opened through `identity.decision_agent_session_open` — the same shape as Phase 1's `identity.agent_session_open`: an identity-operation context, the registry row must be active and match the registered contract digest, the principal must be an active agent principal — and the run acts as that agent through the ordinary pipeline. The trigger (an operator, or the scheduler's job for the room's cadence) is recorded on the run; the agent's output carries the agent's identity and method version. Budgets are spent on the run (reads, gateway calls, elapsed time); a budget hit stops the run, records `stopped` with the reason and an escalation to the named human; a refusal (an agent attempting `decision.propose`, `.approve`, `.dissent` or `.commit`) is recorded on the run as well as in the audit.

**Upstream reads the agents may perform:** exactly the consequential reads listed above, each through the pipeline with `audit_access`; no direct table access, no reads outside the agent's domain.

**Controls travel.** The inherited controls of every cited object fold into the package (§2), from the package and its sources into a briefing, from a package into a replay record, and into any export; classification, rights, residency and retention are enforced on retrieval and export, not only at composition.

**API.** The same surface, same envelope, same capabilities, same receipts: `decisions/*`
(declare, version, option, dissent, propose, review, approve, commit, outcome, close, list, get,
replay), `briefings/*` (compose, list, get), `rooms/*` (open, membership, cadence, review, list,
get), `agents/decision/*` (register, budgets, stop, escalations). Reading and writing stay separate
decisions.

**UI.** A sixth workspace: **Decisions** (package by state; options side by side on their common
baseline with `SYNTHETIC` on every simulated value and the assumption carrying each result;
uncertainty and validation limitations in words; dissent; approvers and their approvals; commit;
monitoring conditions and outcomes; Replay with the five layers and the cut-offs) and
**Briefings** (what changed / why it matters / who owns it / which window is closing; the room with
its members and cadence; review overdue in words). Same rules: receipts only from authoritative
responses, state never by colour alone, keyboard-operable, RTL-mirrored.

## 4. Data requirements, and the source decisions preserved

**No new source, connector, credential, purchase or permission email.** The source decisions of
2026-09-05 and 2026-09-07 stand: PortWatch stays in replay with rights pending the IMF's answer
(the redrafted request is not sent); ECB, EU sanctions RSS and payload and World Bank stay live
under their existing cadences and budgets; UN Comtrade is untouched; nothing is purchased. Phase 6
adds no data — it decides on what Phases 1–5 already hold.

| Need | Where it comes from | State |
|---|---|---|
| Objectives and assumptions | Phase 3 strategy graph (act III): the corridor objectives and "the corridor is open" | exists |
| The situation | Phase 4 scenario branch flipped in replay; the warning routed to its owner with its window | exists |
| Options and consequences | Phase 5 Act V runs on one control: reroute, air bridge, draw-down, draw-down + reroute, and the control itself as *do nothing* | exists |
| Uncertainty | the runs' sensitivity; the twin's `unvalidated (synthetic grounding)`; the forecasts' validation states; the branch's basis under both clocks | exists |
| Pre-decision history | Act IV's publisher restatement, applied and walked in Act V **before** the decision — preserved as history the decision was taken with | exists |
| **Outcome after the decision** | **new synthetic upload `outcomes-2024Q1.csv`** through the existing NORDWERK file connector (`data_origin: synthetic`, marked at object level): one observed row per outcome criterion — the plant's actual line-stop days for `SYN-LINE-A1` over the decision window, with the same quantity, unit and target the chosen run's output uses — recorded after the commitment. The chosen run's exact output becomes a `simulated` twin element citing the run; the upload's row becomes an `observed` element on a later twin version; Phase 5's `record_reconciliation` records the difference | **new synthetic fixture; no external source** |
| Personas | A. Hoffmann, M. Dvořák, T. Nakamura, and two new synthetic personas for the decision owner and the executive approver — created by the platform administrator as in Phase 5 | new, synthetic |

Everything real (PortWatch, ECB, EU sanctions, World Bank) stays attributed; the company, the runs
and **the decision itself** stay marked synthetic, as the storyboard's real/fiction table requires.

## 5. Implementation stages and dependencies

| Stage | Deliverable | Depends on | Est. |
|---|---|---|---|
| **P6-M1** | Migration `0041`: `decision` schema, `DPK@v1`, packages with versions, objectives, options, typed consequence citations, uncertainty, dissent, approver policy, monitoring conditions; roles `decision_owner`, `decision_approver`, `decision_authority`, `executive`; `decision.*` PDP actions (reads and drafting at ≤ C2); the `DEC` binding and the `packages` impact bucket; upgrade check +lines | Phase 3 (merged); Phase 5's runs and reconciliation (PR #44 stack) | 5–6 days |
| **P6-M2** | Migration `0042`: approvals `APR@v1`, commitments, the state machine, the **human-gate runtime** — `decision.commit` as the first C3 action with the `human_gate` obligation and the commit port's re-verification; `CMT` creation; refusals audited | M1 | 4–5 days |
| **P6-M3** | Migration `0043`: replay records `RPL@v1` and the replay port over the known-at paths of Phases 1–5; unavailable-artefact reporting; replay digest | M1, M2; #44's availability semantics | 5–6 days |
| **P6-M4** | Migration `0044`: `executive` schema — briefings `BRF@v1`, rooms, membership, cadence, review events; deterministic composition; window-closing ordering; degraded marks; optional narrative | M1, M2; Phase 4 warnings | 5–6 days |
| **P6-M5** | Monitoring and outcomes: conditions bound to indicators and warnings; breach routing; `OUT` recording and reconciliation against simulated consequences; review-overdue; propagation of invalidated assumptions to packages through the operator-initiated walk | M2, M4; Phase 5 reconciliation | 3–4 days |
| **P6-M6** | The three agents as registered principals with budgets, stop conditions and escalation; workflow contract events; supervisor refusals; cadence jobs through the existing scheduler (own job kind, separate queue name) | M4, M5; #44's scheduler | 4–5 days |
| **P6-M7** | Decisions and Briefings workspaces; Act VI of the demonstration; F1–F8 acceptance; Phase 6 report and handoff; demo Playwright suite extended | M2–M6 | 6–7 days |

**Realistic duration: 6–7 weeks**, one engineer, local-only, no live sources beyond those already
activated.

**Data requirements per stage:** M1–M3 run on the demonstration database after acts I–V; M4–M6
add only synthetic personas and rooms; M7 needs the fresh demonstration (acts I–V, then VI).

## 6. Acceptance criteria — to be frozen before implementation

Eight, in the shape of E1–E8: product capabilities the roadmap and constitution name, each proved
through the real database and controller harness and, where it renders, in a browser.

| # | Criterion |
|---|---|
| **F1** | **Decision completeness (C-024), refused otherwise — and what is approved is the choice.** A package version is proposed only with at least one `OBJ` objective, at least two options including the explicit status quo, typed consequence citations with exact id, version and digest for every simulated consequence (a completed `SIM` run on one common baseline; incompatible baselines refused; an unsimulated option says so and is marked), an uncertainty block per option derived by the port from the cited objects (the run's sensitivity, the twin's validation status, every cited forecast's validation state, the branch's basis, both clocks), reversibility, second-order effects, information value, constraints, an approver policy naming humans or roles with a quorum, monitoring conditions bound to existing indicators or warning classes, **and the choice**: the proposed option, the human rationale, the decision deadline, the accepted trade-offs, a named action owner and measurable outcome criteria. The choice and its conditions are inside the version digest; changing the choice opens a new version and its predecessor's approvals do not carry. Truth states are never collapsed: a simulated consequence is `synthetic`, a forecast consequence carries its validation state, a claim its truth state; inherited controls fold fail-closed and `synthetic_state` folds upward. |
| **F2** | **No decision reaches `committed` without a valid human approval record, and the gate cannot be evaded.** The PDP authorises above C2 **only the exact action `decision.commit`** (`maxConsequence: 'C3'`, obligation `human_gate`); every other `decision.*`, `briefing.*` and `room.*` prefix stays at C2. The commit route pins `consequenceClass: 'C3'`, and the port verifies the bound consequence class and the bound action in the database context, so a lower caller-supplied class or another action's context fails closed. Inside the transaction the port refuses — with `EYE-WFL-002`, audited — when the version is not `approved` or its digest is not the one the approvals signed; when the approval set does not meet the quorum of **distinct eligible humans**; when any counted approval is by the author, the proposer or the action owner, by a non-human principal, by a principal outside the policy, expired or revoked; when the committer is not an active human with a live session holding `decision_authority` at the package's scope; or when a commitment already exists (concurrent and repeated commits are serialised by a row lock and the second is refused naming the first). The commitment records the approval ids and digests, the policy decision id and audit sequence, the committer and `decided_at`; the `CMT` it writes names the approved option. Controls, each at the port with the API bypassed: an agent principal's approval; the author's, proposer's and action owner's self-approval; an approval of a superseded digest; a revoked and an expired approval; a quorum met by one person approving twice; a commit by an agent; a commit under a C2 context; a second commit; `graph.strategy.declare` admitting a `DPK`/`APR`/`CMT` and `decision.commit` admitting anything but a `CMT`. Positive control: a compliant approval set and commit succeed and produce the receipts. |
| **F3** | **Dissent and accountability (C-036).** A dissent is an append-only record by a named human, with rationale and optional citation; it is visible on the package, in every briefing that includes the package, and in the replay's *decided* layer; approval does not remove it; every approval, commitment, dissent, refusal and override is an attributable audit record with the version digest. |
| **F4** | **The executive surface says what changed, why it matters, who owns it and which window is closing — from a bound baseline, read under the reader's own authority.** A briefing records its watermark (the prior briefing or none, and the reader's `known_at`) and its source records; its content digest is over those and its items, so recomposition with the same watermark and `known_at` yields the same digest and never shifts its own baseline; every item carries truth state, freshness and source state (live / replayed / degraded / blocked) and nothing degraded renders as normal; windows are ordered by time left; the narrative is optional, labelled and cites only included items; reading a briefing enforces the reader's current authority, purpose and room membership and the briefing's folded controls, and a stored snapshot lends no later reader the composing agent's authority; a room shows members, cadence and **review overdue** when a review is due without a review event. |
| **F5** | **Decision Replay excludes hindsight, with executable cut-offs.** For a committed package, replay reconstructs *known / believed / tested* strictly under the package's `known_at` and `observed_through` (each layer's cut-off as §3 states, including the policy and authority records, dissent and reproduction verdicts by their own `recorded_at ≤ decided_at`) and refuses any object version recorded after `decided_at` into those layers; *decided* holds the version and digest, dissent, approvals, commitment and the commit's policy and audit records; *observed* holds only what was recorded after `decided_at` and at or before the bound upper `as_of`. A cited artefact **corrected** after the decision with its cited version retained is included as historical evidence with the later version under *observed*; **withdrawal, governed deletion and access loss** are reported separately as unavailable, never substituted. The **content digest** covers the layers' contents only; the invocation record (reader, instant, availability at that instant) is stored beside it. Controls: a restatement recorded after the decision → the cited version still under *known*, the restated version under *observed*; a cited evidence version withdrawn after the decision → unavailable in *known* with the reason, the withdrawal under *observed*; a run reproduced after the decision → the pre-decision verdict under *tested*, the later one under *observed*; an approval revoked after the decision → counted under *decided*, the revocation under *observed*; two replays under the same cut-offs and upper bound by different readers → equal content digests, different invocation records; a replay with an earlier `as_of` excludes what came after it. |
| **F6** | **Monitoring conditions bind to what exists, and outcomes reconcile against the approved choice.** A committed package's conditions reference existing indicators and warning classes and name the approved option; a breach or warning after commitment surfaces in the room and the next briefing, routed to the owner with the window; an outcome is recorded by a human as `OUT` for one of the approved choice's outcome criteria, citing an admitted **observed** twin element of the same quantity, unit and target, and — where the criterion was simulated — the chosen run's exact output is a `simulated` twin element citing the run and Phase 5's `record_reconciliation` records the difference, nothing overwritten; an invalidated assumption reaches the packages resting on it through the operator-initiated walk (the package's `DEC` in the walk's decisions bucket), with *propagation pending* before it and the automatic `CorrectionApplied` consumer still deferred. |
| **F7** | **Agents are bounded and cannot decide.** The Decision, Executive Briefing and Reporting agents are registered in `executive.agents` as agent principals with owner, role grants (§3 inventory), budgets, stop conditions and escalation, and run through `identity.decision_agent_session_open`; an agent that hits its budget stops, records it and escalates to a named human; every agent output carries the agent identity, method and model version and is marked agent-produced; an agent's attempt to propose, approve, dissent or commit is refused at the PDP (no grant) **and** at the port (principal kind), and recorded; the workflow contract records every step as a governed event; the planner schedules only through the existing scheduler under the agent's budget; the supervisor's refusals are recorded; an agent's upstream reads are the listed consequential reads only. |
| **F8** | **Phase 0–5 regression**: full CI green except the independently red C15 gate, no constitutional invariant weakened, C18 still frozen at 0021, the Phase 1–5 operator journeys unchanged, the frozen E1–E8 and T1–T4 / D1–D8 unchanged, source decisions preserved, cadences and budgets unchanged, the automatic `CorrectionApplied` consumer still deferred. |

**Measured targets.** No forecast, twin or decision accuracy is claimed: the demonstration decides
on a synthetic company with synthetic runs. The measurable claims are F2's refusal rate on every
invalid approval and commit path (100% refused, at the port), F5's digest equality across N replays
(N ≥ 3) and its hindsight controls (0 later-recorded versions admitted into the earlier layers),
F4's composition digest equality, F1's refusal rate on incomplete packages (100%), and the
admission-boundary controls of §3 (100% refused across object types).

## 6a. Decision rules (to be frozen with F1–F8)

| # | Rule |
|---|---|
| **1** | A commitment is made by a named human principal holding `decision_authority`, under the exact action `decision.commit` at C3, and requires a valid approval set bound to the exact version digest — a quorum of distinct eligible humans; approvals by the author, the proposer or the action owner of that version, by any non-human principal, or outside the approver policy are invalid; an approval expires, can be revoked, and does not carry to a new version; a second commitment is refused. What is approved is the **choice** (option, rationale, deadline, trade-offs, action owner, outcome criteria), never a menu. |
| **2** | Every simulated consequence cites a completed run by id, version and digest, and options are compared only on one common baseline; an option without a run is `unsimulated` and marked. |
| **3** | A package carries the validation limitations of everything it cites — the twin's validation status, each forecast's validation state, the runs' sensitivity and synthetic truth state, the branch's basis under both clocks — and shows them wherever a consequence is shown. |
| **4** | Dissent is append-only and never removed by approval or commitment. |
| **5** | A package version binds `known_at` and `observed_through`; a commitment binds `decided_at`; a replay binds its upper `as_of`; the replay reads *known / believed / tested* only through the known-at paths under the version's cut-offs and admits no object version recorded after `decided_at`; *observed* holds only what came after `decided_at` and not after `as_of`. Replay evidence is never described as known before it was recorded. |
| **6** | A cited artefact later **corrected** with its cited version retained stays in its replay layer as historical evidence; one **withdrawn, governed-deleted or no longer accessible** to the reader is reported unavailable, separately, with the reason; nothing later is ever substituted. The content digest covers contents; invocation metadata is stored beside it. |
| **7** | Briefings are composed from stored records; the Model Gateway may narrate an included item and may not add, rank or remove one. Degraded, stale, replayed or blocked inputs are shown as such. |
| **8** | Agents draft, compose and report within declared budgets; they never propose, approve, dissent or commit; a budget hit stops and escalates; a refusal is recorded. |
| **9** | No decision that materially determines rights (C-050) is in scope; consequence class C4 is never authorised in Phase 6. |
| **10** | Only two writes reach the strategy graph from Phase 6, each through its own port under its own action: the `CMT` on commit and the `OUT` on outcome. A package binds to an existing `DEC`; it never declares one. |
| **11** | A briefing binds its watermark and source records; a reader's authority, purpose and room membership are enforced when a briefing or replay is read or exported, and the folded controls travel with it. |

## 7. What this plan deliberately excludes

Autonomous execution of decisions and any C4 action · learning from outcomes into models,
thresholds or prompts, and the governed release pipeline (Phase 7) · agents beyond the three
assigned here, and marketplaces · new twins, behaviour models or forecasts · optimisation or
recommendation ranking by a model · any new source cohort, connector, credential, purchase or
permission email · any new gate, testing framework or acceptance matrix beyond F1–F8.

## 8. The end-to-end demonstration — Act VI, "we decide, and we can prove what we knew"

Acts I–V run as today on a fresh database. Then:

1. **The room.** The decision owner (a new synthetic persona created by the platform
   administrator) opens the room *January corridor collapse — Regensburg line*; members: the
   owner, the executive approver (new synthetic persona), M. Dvořák and T. Nakamura as observers;
   cadence weekly.
2. **The package.** The strategy owner (J. Weber) declares the `DEC` *January corridor collapse —
   response* through Phase 3's own route, under act III's objective *keep the Regensburg line
   running through Q1 within cost*. Version 1 binds that `DEC`; options: reroute, air bridge, draw-down, draw-down + reroute,
   and *do nothing* — each consequence one of Act V's runs on the same control, every value
   `SYNTHETIC`, the assumption carrying each result beside it; uncertainty in words: twin
   *unvalidated (synthetic grounding)*, corridor forecast *validation_impossible*, branch flipped
   on the observed replay collapse read at the 2026 record-time cut-off, observed through
   2024-01-17; approver policy: the executive approver; monitoring: the transit indicator, the
   safety-stock condition, weekly review; **the choice**: draw-down + reroute, the owner's
   rationale in their own words, decision deadline, the accepted trade-off (days below safety
   stock), the action owner (T. Nakamura) and the measurable outcome criterion (line-stop days for
   `SYN-LINE-A1` over the window, target 0, observed on the twin). The Decision agent drafted the
   option cards; the owner proposed the version — the agent could not.
3. **Dissent.** M. Dvořák records that draw-down leaves 38 days below safety stock.
4. **Approval and commitment.** The owner holds `decision_authority`; the executive approver is a
   different human. The owner's own approval is refused (403, audited). The executive approves
   version 1. A last-minute change of the choice creates version 2 and the approval does not
   carry; the executive approves version 2. The owner commits under the exact C3 action:
   `decided_at` recorded, the `CMT` naming the approved option appears in the strategy graph. A
   second commit is refused naming the first; a commit attempted through an agent session, and one
   attempted with the envelope claiming C2, are refused with `EYE-WFL-002`.
5. **The briefing.** The Executive Briefing agent composes the room's briefing: what changed
   (the flip, the warning, the six runs, the commitment), why it matters (the objective and the
   assumption *the corridor is open*), who owns it, which window is closing (the warning's response
   window and the next review) — with the PortWatch source marked *replayed* and the ECB source
   *live*.
6. **What comes after — chronology preserved.** Act IV's publisher restatement was applied and
   walked in Act V, **before** the decision: it is pre-decision history, visible in the package's
   *known* and *believed* layers as the corrected corridor evidence and the unverified twin
   version the decision was nevertheless taken with. After the commitment the demonstration
   appends a **separately identified synthetic observation**: the NORDWERK outcomes upload
   (`outcomes-2024Q1.csv`, document time 2024-04-10, recorded now, marked synthetic) stating the
   plant's actual line-stop days for `SYN-LINE-A1` over the window. The chosen run's exact
   `line_stop_days` output is grounded as a `simulated` element on a new twin version citing the
   run; the upload's row is grounded as an `observed` element of the same quantity and unit on the
   following version; Phase 5's reconciliation records the difference; the owner records the
   `OUT` for the outcome criterion, citing that observed element. The assumption the package rests
   on, if corrected later, reaches the package through the walk via its `DEC`.
7. **Replay.** Anyone with read authority replays version 2: *known* shows the evidence through
   2024-01-17 as recorded in 2026; *believed* the branch state, forecasts and assumptions as they
   stood; *tested* the six runs with their pre-decision reproduction verdicts; *decided* the
   version, the dissent, the approvals, the commitment and the commit's policy and audit records;
   *observed* the outcomes upload, the reconciliation and the `OUT` — and nothing from *observed*
   appears in the earlier layers; Act V's restatement stays where it belongs, before the decision.
   A second replay by another reader yields the same content digest and a different invocation
   record.
8. **What it does not say.** No model recommended an option; no agent approved anything; nothing
   learned from the outcome. That is Phase 7.

## 9. What can proceed while the security maintenance is blocked

The C15 gate is red on the pinned images (PR #39; latest verified check 2026-09-08 13:21 UTC: no
patched official image available). That blocks **merges**, not construction:

* **Proceed now, on a `phase6-decisions` branch from PR #44's current head**, carrying this
  plan once its acceptance is frozen: P6-M1 through P6-M7. Every required check except
  `supply-chain` runs on the branch and is expected green, as it is on #44 today; the local
  regression (`test:int:all`, acceptance, upgrade check, demo, browser suite) runs as in Phase 5.
  Migrations are numbered after 0040 and remain forward-only.
* **Independent of the unmerged stack** (could start from `main`): the deterministic briefing
  composer and its golden tests, the approver-policy evaluation and its unit tests, the replay
  digest canonicalisation. Everything that reads runs, twins, forecasts or scheduled collection
  depends on the #44 stack.
* **Waits for C15 — in the recorded order:** #39 (the governed digest update when a patched image
  exists, with disposition reconciliation) → #36 → #38 → #40 → #41 → #43 → #44 → this plan's
  PR → the Phase 6 implementation PR. The FINAL C16/C17 steps skipped behind C15 must run green on
  each final candidate. The implementation PR stays unmerged for one consolidated review, like
  Phases 4 and 5.
* **Continues independently:** the read-only image recheck on the maintenance branch.

## 10. Owner decisions — confirmed 2026-09-08

1. **Object codes** — `DPK`, `APR`, `BRF`, `RPL`, linked to the existing `DEC`, `CMT` and `OUT`
   strategy objects — confirmed.
2. **Who may commit** — `decision_authority` distinct from `decision_approver`. For Act VI the
   human owner holds `decision_authority` and a **different human** approves; author, proposer and
   action-owner self-approval stays forbidden — confirmed (§8 and this section agree).
3. **Approver policy shape** — named humans and role-at-scope policies with a **quorum of distinct
   eligible humans** — confirmed.
4. **Consequence class** — only the exact `decision.commit` action at C3 under the human gate; C4
   stays denied — confirmed.
5. **Branch base and sequencing** — `phase6-decisions` from PR #44 at
   `c5460465aa3c9a551d15ee5f565c8986dd509a55`; merge order as recorded — confirmed.
6. **Demonstration** — the two synthetic personas (decision owner, executive approver) and the
   weekly cadence — confirmed.

No approval is needed for what the plan preserves: the source decisions, the forecast and twin
limitations, the frozen E1–E8, T1–T4 and D1–D8, the closed reviews, and the deferred consumer.

## 11. The first implementation stage — P6-M1, defined

**Goal.** A decision package exists as a governed, versioned object with typed consequence
citations, uncertainty, dissent, an approver policy and monitoring conditions; it binds to a `DEC`
strategy object; incompleteness is refused at proposal; every `DPK` admission boundary is proved —
F1, the dissent half of F3, and the `DPK` rows of §3. No approvals, commitments, briefings, replay
or UI in M1.

**Migration `0041_decision_packages.sql`** (forward-only):
* `decision.package_events` (append-only) and `decision.packages_current` (projection): package
  id, scope triple, the bound `DEC` strategy object id, title, statement, owner, state
  (`draft`, `proposed`, …), current version, controls, `synthetic_state`.
* `decision.package_versions` (append-only once proposed): `version`, `supersedes`, `state`
  (`draft` → `proposed`), `known_at`, `observed_through`, objectives (`OBJ` ids, ≥ 1), constraints,
  approver policy jsonb (named principals or role-at-scope with quorum; CHECK: at least one
  approver; the author cannot be listed as the only approver), monitoring conditions jsonb (CHECK:
  each names an existing indicator or warning class and an owner), **choice jsonb** (option key,
  human rationale, decision deadline, accepted trade-offs, action owner — a named human — and
  measurable outcome criteria; required at proposal; inside the version digest), reversibility,
  information value, the `DPK` header digest, `version_digest` bound at proposal.
* `decision.options` (append-only per draft version): `key`, title, `kind` (`intervention` |
  `status_quo`), consequences jsonb array of typed citations (CHECK, failing closed on null or
  malformed nested fields: `kind ∈ {run, forecast, claim, evidence, assumption, warning}`, uuid
  `id`, integer `version`, 64-hex `digest`), `simulated` boolean with `unsimulated_reason` when
  false, uncertainty jsonb (sensitivity ref, twin validation status, forecast validation states,
  branch basis, both clocks — derived by the port from the cited objects, **never taken from the
  caller**), second-order effects, risks, opportunities, reversibility.
* `decision.dissent` (append-only): version, principal (human, CHECK by port), position,
  rationale, optional citation.
* Ports (SECURITY DEFINER, `observation.assert_authority` + `assert_scope`):
  `decision.declare_package` (creates or binds the `DEC`), `decision.open_version`,
  `decision.set_option` (draft only; derives uncertainty and folds controls and synthetic state
  from the cited objects; refuses a run citation that is not a completed run or whose baseline
  differs from the version's control), `decision.record_dissent` (human only),
  `decision.propose_version` (binds `version_digest` and the canonical `DPK` version atomically;
  refuses < 1 objective, < 2 options, no status quo, a simulated consequence without a valid
  citation, a missing uncertainty block, an empty approver policy, or an unbound monitoring
  condition); `graph.dependencies` dependent type `DEC` for the package with a `packages` impact
  bucket (the package is reached through its `DEC`); roles `decision_owner`, `decision_approver`,
  `decision_authority`, `executive`, `decision_agent`, `briefing_agent`, `reporting_agent`; PDP
  rules `decision.package.*`, `decision.dissent`, `decision.read` (≤ C2);
  `observation.canonical_write_actions`: `decision.package.propose → ['DPK']`.
* `DPK@v1` in `objects.schema_registry`; `decision.rebuild_projections()`.

**Services.** `apps/api/src/decision/` — `decision.capabilities.ts` (narrow interfaces per
action), `decision.controller.ts` (`decisions/declare`, `/:id/versions/open`,
`/:id/versions/:v/option`, `/:id/versions/:v/dissent`, `/:id/versions/:v/propose`, `/list`,
`/:id/get`), `packages/package.service.ts` (header construction with inherited controls,
admission through `admitObject`, refusal of incomplete versions before the transaction),
`consequences/` (readers that turn a cited run, forecast or claim into a consequence with its
uncertainty, recording the citation). Module boundaries: `decision` → `twin`, `prediction`,
`graph`, `observation` through their exported services only; dependency-cruiser rule added.

**Tests.** `test/int/phase6-decisions.test.ts` through the real harness: declare → binds an
existing `DEC` and refuses a package naming none, or a `DEC` that is not a `DEC`; proposing
without a choice, with a choice naming an option that does not exist, an action owner that is not
a human, or an outcome criterion without quantity, unit and target → refused; an option citing a run that is not completed, or on a
different baseline → refused; a caller-supplied uncertainty block → ignored, the port's derived
block used; a simulated consequence citing a synthetic run → the version and package carry
`synthetic_state = true` (F1); proposing with one option, or two without a status quo, or without
an approver policy, or with a monitoring condition naming no existing indicator → refused;
proposal binds `version_digest` and a further option on the proposed version is refused and opens
version 2 instead; dissent by a human appended and listed, dissent by an agent principal refused
(F3); admission-boundary controls: `twin.version.admit` cannot admit a `DPK`,
`decision.package.propose` cannot admit a `SIM`, a null citation digest fails closed (§3). Unit:
header and controls fold for `DPK`; approver-policy validation. Upgrade check:
`INTENDED_ADDITIONS` +1 migration, +7 roles, +1 schema registry row. Regression: `test:int:all`,
acceptance, typecheck, boundaries.

**Exit criteria for M1.** All of the above green locally with the API stopped; the Phase 6
branch's CI green except `supply-chain`; `PHASE6_REPORT.md` opened with the M1 evidence table.
No UI in M1.

## 12. Evidence classes, kept distinct throughout

| Class | What it establishes | Where it is recorded |
|---|---|---|
| Database/controller harness | the ports, refusals, digests, cut-offs and the hindsight controls, through the real PostgreSQL, pipeline and controllers | `PHASE6_REPORT.md` per stage |
| Browser | what the operator sees: states in words, `SYNTHETIC` marks, degraded marks, the replay's five layers | demo Playwright suite, screenshots under `evidence/` |
| Demonstration (replay / live / synthetic) | Act VI on the demonstration deployment: real sources attributed, replayed sources marked, the company and the decision marked synthetic | the seed transcript, redacted |
| CI at the candidate | build-test, browser-regression, C19 lifecycle; C15 independently | GitHub, linked by run id |
| Independent review | the reviewer's own execution with doubles, stated as such | review closure records |

Batch failures with isolated passes are recorded with their uncertainty, as in Phases 4–5, and
never rewritten as clean runs.

## 13. Estimated implementation time

Six to seven weeks in total (§5). P6-M1 is five to six days from the freeze of F1–F8 and §6a.

## 13. Pre-freeze corrections incorporated (owner's approval of 2026-09-08)

| # | Correction | Where |
|---|---|---|
| 1 | What is approved is the **choice**: proposed option, human rationale, decision deadline, accepted trade-offs, action owner, measurable outcome criteria — inside the version digest; changing it needs fresh approval; commitment, `CMT`, monitoring and outcomes identify it | §3 package row, §6 F1/F6, §6a rule 1, §8, §11 |
| 2 | The authority contract completed: exact-action PDP rule for `decision.commit` at C3 with the `human_gate` obligation; consequence class pinned at the route and verified at the port; transactional verification and evidence; active human authority; distinct-person quorum; expiry; revocation; concurrent and repeated commits; the bounded `CMT`/`OUT` writes inventoried and separated from `graph.strategy.declare` | §3 workflow row, §3 boundary paragraph, §6 F2, §6a rules 1 and 10 |
| 3 | Snapshot semantics executable: per-layer cut-offs including policy/authority records, dissent and reproduction verdicts; bound upper `as_of`; retained corrected versions stay historical; withdrawal/deletion/access loss reported separately; content digest apart from invocation metadata; briefing watermark and source records bound | §3 replay and briefing rows, §6 F4/F5, §6a rules 5, 6, 11 |
| 4 | Role, action and read-boundary inventory completed: seven roles, the agent session path (`identity.decision_agent_session_open`, `executive.agents`), permitted upstream reads, controls carried into briefings, replays and exports, reader authority and room membership enforced on retrieval | §3 inventory, §6 F4/F7, §6a rule 11, §11 |
| 5 | Act VI chronology and outcome fixture: Act V's restatement preserved as pre-decision history; a separately identified synthetic outcomes upload after commitment; the chosen run's exact output as a `simulated` element reconciled against a later admitted `observed` element of the same quantity, unit and target; §4 discloses the fixture; no external source | §4, §6 F6, §8 |

