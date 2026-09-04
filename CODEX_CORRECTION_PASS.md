# THE EYE — Bounded correction pass on the Codex review of `6914af03`

> **Baseline reviewed:** `6914af0329a177a4603825d8ca90496e764ebc44` (Phase 3, merged).
> **Scope:** the seven finding groups, in the product paths. Nothing else was reopened —
> Phase 0's closure, C18's freeze at `0021` and C19's anchoring are untouched, and no new
> testing framework or governance programme was created.
>
> **Candidate:** the head of `codex-correction-pass` — the exact SHA is on the pull request, so
> this record cannot go stale against its own amendments.
> **This PR is unmerged, for review.**

---

## 1. How evidence is classified here

The original review was explicit about its limits, and this pass preserves the same
distinctions rather than flattening them into "verified".

| Class | What it means | Where it lives |
|---|---|---|
| **Source** | Read the implementation at the baseline | inline, per finding |
| **Service** | Real TypeScript implementations driven through in-memory capability doubles, and — where a network call is under test — a controlled local HTTP response | `apps/api/test/unit/codex-corrections.test.ts` (**26 tests**) |
| **Database / API** | Real PostgreSQL, real governed ports, real capability contexts | `apps/api/test/int/phase3-corrections.test.ts` (**9 tests**) |
| **Journey** | The three-act demonstration driving the real HTTP API end to end | `scripts/phase3/seed-graph.mjs` |
| **Browser** | **Not performed in this pass.** No finding below is supported by UI evidence. |

Every service and database probe below **failed at the baseline first**. They are kept as the
regression: revert a fix and the corresponding probe goes red.

## 2. Disposition of all seven groups

### F1 — Source restrictions and synthetic provenance are not preserved through extraction

**CONFIRMED** (source, service). The extraction header hard-coded `synthetic_state: false` and
`classification: 'internal'` and nulled rights, residency, retention and access policy; the human
correction path additionally nulled four of the same fields. Codex's own narrowing is preserved:
the probe stopped at canonical validation, so **no database disclosure was demonstrated** at the
baseline.

**Corrected.** `inheritedControlsOf()` reads the control block off the evidence object and the
derived claim carries all six fields (ES-29-002). It **fails closed**: evidence that does not state
its classification is treated as `restricted`, and unstated synthetic state is treated as synthetic
— the opposite of the previous defaults. `review.service.ts` now carries rights, residency,
retention and access policy from the prior version, because a reviewer's correction is not a
declassification.

*Verified:* service ×3 · journey — the corrected run shows the claim about the synthetic
manufacturer admitted with `synthetic_state = true`, which at the baseline was `false`.

### F2 — Graph construction can bypass identity resolution and review meaning

**CONFIRMED, both halves** (source, service). The endpoint map collapsed accepted resolutions onto
normalised display names, last write winning, so row order decided which entity received a
relationship; and no review-state check stood between a queued claim and an edge assertion.

**Corrected.** The map now records *every* entity a name resolves to: one is a lookup, more than
one is an ambiguity **refused with a named reason** rather than settled by iteration order. The
review state is checked before assertion **and independently in the port** (`graph.assert_edge`,
migration 0025) — two boundaries, as everywhere else in this system — with the admitting review
state recorded on the edge event.

*Verified:* service ×5 (order-independence, ambiguity refusal, happy path, queued refusal, approved
admission) · database ×2 (the port refuses a queued claim and writes nothing; an approved claim is
admitted and the event records `review_state`).

### F3 — Known-at retrieval is not consistently historical

**CONFIRMED, both halves** (source, service). A historical entity view selected the mentions
current at the cutoff and then fetched the **latest** version of each claim behind them; and the
edge path took the newest 2,000 rows *before* applying the historical filter, so a single eligible
old edge behind 2,000 later ones vanished from a historical view.

**Corrected.** `claimsFor(..., knownAt)` returns the version current *then*. `asOf` now **filters
before bounding**, and `asOfBounded` reports `complete` so a caller is told when the scan bound was
reached rather than handed a silently partial graph.

*Verified:* service ×3 · database ×2.

### F4 — Correction propagation is incomplete

Four sub-items, and **they did not all end in the same place.**

| # | Finding | Disposition |
|---|---|---|
| **4a** | No consumer connects `CorrectionApplied` / `ClaimReviewed` to graph impact | **CONFIRMED — NARROWED, NOT CLOSED.** See below. |
| **4b** | The walk never established the evidence-to-derived-claim closure | **CONFIRMED — corrected.** |
| **4c** | An 8-hop bound could return "assessed" with no truncation field | **CONFIRMED — corrected.** |
| **4d** | "Already built" keyed on claim identity, not the corrected version | **CONFIRMED — corrected.** |

**4a is not fixed, deliberately.** The outbox publishes to a BullMQ queue and **nothing
subscribes** — confirmed by source. Building a governed consumer means a new worker with its own
authority, principal, budgets, failure handling and escalation, which is a subsystem, not a bounded
correction. What this pass does instead is **stop the gap being silent**: `/impact/awaiting` lists
applied corrections whose downstream impact nobody has assessed, and says so in the response. The
corrected journey reports two such corrections outstanding. *Propagation remains
operator-initiated. That is a real remaining limitation, recorded in §4.*

**4b corrected.** A Phase 1 correction supersedes **evidence**, and the walk understood only claim,
entity, edge and split triggers — so the object a correction actually changes had no way in.
Migration 0025 adds the `evidence_correction` trigger and the walk closes evidence → claims through
`intelligence.claim_lineage`, then proceeds as before. *This is why the demonstration previously had
to be handed a claim id by hand.*

**4c corrected.** `truncated` and `unexplored` are computed, persisted and stated in the
assessment's own words. Critically, **a truncated walk does not retire Phase 1's sentence**:
replacing *"downstream consumers not yet present"* with an "assessed" statement is a claim of
completeness a partial walk has not earned, so the case keeps its unresolved sentence and gains the
assessment id — a reader sees both that something was assessed and that it did not finish.

**4d corrected.** Idempotency is keyed on `claim@version`, so a corrected v2 rebuilds rather than
being silently covered by the v1 edge.

*Verified:* service ×5 · database ×3 · journey — the corrected run reaches **3 claims** from the
corrected evidence and marks the assumption unverified while reporting the objective and commitment.

### F5 — Stored model pins do not establish which model executed

**CONFIRMED** (source; service, against a controlled local HTTP response). The gateway recorded the
method's configured pin and accepted a response naming a different model.

**Corrected.** The runtime's own `model` field is read back, compared to the pin, and **a mismatch
fails the call** rather than being attributed to the pin. Every call record now carries
`pinned_model`, `observed_model` and a `model_identity` verdict with four honest values:
`observed_matches_pin`, `observed_differs_from_pin`, `not_reported_by_runtime`, and
`not_observed_replay` — the last because a replayed response observes no runtime at all, and saying
so is the difference between recorded configuration and verified execution. Both `call()` and
`rank()` are covered.

*Verified:* service ×2.

### F6 — Evidence-span and method-output admission have gaps

**6a CONFIRMED — corrected.** The parser accepted `byte_end: 1,000,000` against three bytes of
evidence. It now bounds every span by the evidence the request actually carried; a claim whose
offsets cannot be read back is refused, not admitted with unusable lineage.

**6b CONFIRMED — corrected, and the narrowing matters.** A method declaring only `ENT` could
construct a `REL` candidate. Codex did not demonstrate persistence, and this pass checked whether a
later boundary would have caught it: **it would not.**
`observation.canonical_write_actions` pins `intelligence.claim.admit` to
`ENT, EVT, CLM, REL, ASM` — the *action's* range, not the *method's* declared `target_types`. The
database would have accepted the REL. The gap was therefore real and unguarded, and is now closed at
the service with the refusal **reported** as `undeclaredRefusals` rather than dropped, because a
method quietly emitting a type nobody approved is a fact about the method.

*Verified:* service ×3.

### F7 — Live-connector readiness overstated, and a demonstrated IPv6 helper defect

**Readiness: CONFIRMED** (source). `rest.connector.ts` issues exactly one request per configured
endpoint and stops. There is **no pagination loop** and **nothing reads `credential_ref`**.

The defect was the *claim*, so the claim is what was corrected.
`PHASE1_PRODUCT_HANDOFF.md` §6 said *"Activating any live source is a deliberate contract change
plus a rights decision, **not a code change**"* and marked four connectors bare "Yes". Both are now
corrected in place, with the previous wording quoted so the record shows what changed: those
connectors are **single-poll only**, a backfill needs connector code, and a keyed source needs the
secret binding built first.

**IPv6: CONFIRMED — corrected.** `isForbiddenAddress` compared string prefixes, so `::1` was caught
and `0:0:0:0:0:0:0:1` was not, and `startsWith('fe80')` covered a **tenth** of the `fe80::/10`
link-local range — `fe90::1`, `fea0::1`, `feb0::1` were all permitted. The check now expands to the
eight 16-bit words and tests prefixes **by value**, covering loopback in every notation, the whole
of `fe80::/10`, `fec0::/10`, `fc00::/7`, `ff00::/8`, NAT64, discard, documentation ranges and
IPv4-mapped addresses in both dotted and hex form. Unparseable input fails closed.

As Codex stated, this demonstrates a **guard defect, not a complete SSRF exploit** — and that
distinction is preserved: the guard is one control among resolve-then-connect pinning, the host
allowlist and the scheme allowlist.

*Verified:* service ×5.

## 3. Verification results

| Suite | Result |
|---|---|
| Service-level probes (new) | **26 / 26** — all 26 failed at the baseline |
| Database / API probes (new) | **9 / 9** |
| Integration, everything | **545 / 545** (22 files) |
| C18-era manifest (`test:int`) | **297 / 297** — the count C18's frozen contract pins, unchanged |
| Phase 0 acceptance | **58 / 58** |
| Unit (api) | **2060 / 2060** |
| Post-C18 upgrade check (`0022`→`0025`) | **PASS** — 1020 pre-existing rows unchanged; upgraded and virgin schema digests identical (`0dbb0f7b8bdb64e4…`); later-phase suites on upgraded data **248 / 248** |
| Typecheck · module boundaries | clean · no violations |
| Corridor demonstration, all three acts | **0 problems** |

## 4. Remaining limitations

Stated because they are real, not because they are comfortable.

* **Propagation is still operator-initiated (F4a).** No consumer subscribes to
  `CorrectionApplied`. The obligation is now *visible* — `/impact/awaiting` lists corrections
  nobody has walked — but nothing performs the walk automatically. Building that consumer is a
  subsystem and belongs in its own change.
* **Both traversals are still bounded.** `MAX_HOPS` is 8 and the historical edge scan is 50,000.
  Neither is unbounded; the difference from the baseline is that reaching a bound is now **reported**
  rather than indistinguishable from completeness.
* **No browser verification in this pass.** Nothing above rests on UI evidence. The `/impact/awaiting`
  route has no screen yet.
* **`undeclaredRefusals` is service-enforced only.** The database pins types per *action*, not per
  *method*, so this rule has one boundary rather than the two most rules here have.
* **F6b's persistence was never demonstrated** — at the baseline or now. The construction gap was
  real and is closed; whether a specific undeclared candidate would have survived the full
  admission path was not established either way.

## 5. What was deliberately not done

The review's broader original-vision findings are not expanded into here. They belong in the
roadmap and the capability preservation map, and this pass did not touch them. C18 and C19 were not
reopened. Migration 0025 is additive and forward-only; no released migration was rewritten.
