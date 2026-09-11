# CP-6 — the implementation batches for the decided product choices, the eight scenario kinds and the `CorrectionApplied` consumer

Opened 2026-09-11 at the owner's direction ("define and implement concrete acceptance-unit batches").
Each batch names the acceptance units it closes (`audit/acceptance-units/*.csv`), the exact change,
the evidence class that verifies it, and the profiles it applies to. A batch is **done** only when its
units are `verified:<scope>` on the artefact and profiles they apply to (S7): a local demonstration
never verifies a `profiles = all` unit; hosted CI on a fresh database verifies the harness cases.

| Batch | Scope | Units | State (2026-09-11) |
|---|---|---|---|
| **B3 — scenario kinds** | the eight kinds of Volume 0 ch. 14 as a versioned vocabulary; divergence and per-branch assumptions | AU-PRD-0021 | **implemented** on `phase6-decisions` (migration 0058; harness case C-022 in `phase4-acceptance`, 16/16 locally); `verified:ci` once the hosted run at the implementing head is green |
| **B1 — `CorrectionApplied` consumer** | the automatic dependency walk on an applied correction | AU-MEM-… (propagation), AU-OBS-… (correction lifecycle) — see §B1 | defined; not implemented |
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

## B1 — the `CorrectionApplied` consumer (defined)

**Today.** `graph.controller.ts`: propagation is operator-initiated; the outbox publishes
`CorrectionApplied`; `impact.awaitingPropagation` makes the unpropagated queue visible; migration 0034
records the walk's reach into twins and simulations. Nothing subscribes.

**Change.**
1. A `propagation` agent principal kind and grant (forward migration): the consumer runs under a
   governed agent session exactly as scheduled collection does (`agent_session_open`, extended by
   progress — 0057), never under a person's session and never as a system bypass. The grant is
   registered per domain by an administrator (`observation.agent.register` pattern), revocable.
2. A BullMQ worker on `domain-events` filtered to `CorrectionApplied` (job id = outbox row id, so a
   redelivery is a no-op): for each event it opens an agent session, runs the SAME walk the operator
   route runs (`graph.impact.propagate`), records the impact (0034's `record_impact`), and closes.
   A refused grant, an expired session or a walk failure is recorded on the case (`propagation:
   failed, reason`) and retried on the next tick; it never ends the process (the 0057 publisher rule).
3. The case moves out of `awaitingPropagation` only when the walk records `complete`; a truncated
   walk stays `partial` and visible, as today.

**Acceptance units (new, to be added to group-b with these ids reserved):** AU-MEM-0091 "an applied
correction is propagated automatically within one consumer tick, and the impact record names the
agent instance that walked it"; AU-MEM-0092 "a redelivered `CorrectionApplied` walks nothing twice";
AU-MEM-0093 "a revoked propagation grant stops automatic walks, the case stays visible as awaiting,
and the operator route still works"; AU-MEM-0094 "the consumer's failure is recorded on the case and
retried; the API process never exits". Evidence: harness (real Redis, real outbox) → `verified:ci`.

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

B3 is done in code (this checkpoint). Next: **B1** (the consumer) — it is the one deferred item every
review has carried, it reuses the agent-session machinery 0057 completed, and its units are
harness-verifiable on the hosted chain. Then B2 (warning levels), then B4/B5 (audit mechanics, no
product risk). The synthetic-company demonstration (`eye_demo`, NORDWERK) remains the deliverable
every batch is exercised on: B3's kinds become visible on the demonstration when a scenario with the
new kinds is declared there through the governed route (a scripted act, `scripts/phase4/`), which is
the next demonstration step after the hosted run is green.
