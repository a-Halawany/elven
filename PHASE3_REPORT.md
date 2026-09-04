# THE EYE — Phase 3 Report: Enterprise Memory + Knowledge Graph (L3–L4)

> Status: **IMPLEMENTED — awaiting owner review.** Built from `main` after Phase 2 closed at
> [`6b4b22d6`](https://github.com/a-Halawany/elven/commit/6b4b22d69467ed398210c38cbf6c2183e2907c80).
> Plan: [PHASE3_BUILD_PLAN.md](PHASE3_BUILD_PLAN.md) (approved, C1–C7 frozen with the owner's eight
> resolver authority rules) · Phase 2: [PHASE2_REPORT.md](PHASE2_REPORT.md) ·
> Phase 1: [PHASE1_REPORT.md](PHASE1_REPORT.md).
>
> Nothing here claims independent code review. Every number below was measured by running the
> suites and the demonstration; nothing is estimated.

---

## 1. What was built

Phase 2 produced attributable claims. They were still strings: two claims about the same
chokepoint were two unrelated statements, nothing connected the corridor to the shipment or the
shipment to the component, and nothing noticed when a corrected claim undermined something a
person was relying on.

Phase 3 closes both gaps.

| Component | What it is |
|---|---|
| **Entity registry** | Governed entity identities. Every mention keeps its own `ENT` claim, its own evidence and its own lineage; a resolution is a separate, reversible assertion linking mention → entity and **never an edit to the claim**. |
| **Identifier registry** | Externally issued identifiers, and the authority that issues them. A unique index makes an authoritative identifier name exactly one entity — which is what makes an automatic resolution a lookup with a unique answer rather than a heuristic with a tie-break. |
| **Resolver** | Deterministic first: authoritative identifier, then first sighting of one, then a single normalised-name match, then ambiguity, then nothing. The Model Gateway ranks the ambiguous tail through Phase 2's **single egress**, and a ranking is evidence attached to a proposal. |
| **Resolution queue** | Everything the resolver may not resolve on its own authority. Decided by a person who is not the proposer, with a written reason — and that person may redirect the resolution onto an entity the resolver never proposed. |
| **Split** | A wrongly merged entity is separated by moving named mentions. The prior resolutions are **superseded, not deleted**, keeping their method, score and instant. |
| **Edges** | Bitemporal and provenance-bound: world time (`valid_from`/`valid_to`) and record time (`asserted_at`/`retracted_at`) are separate axes, and every edge names the claim, the evidence object and the digest behind it. |
| **Permission-aware search** | Evidence, claims and entities in one place, under the same row-level security. A result the caller may not see is **absent**, and every hit says why it matched. |
| **Strategy Graph** | `OBJ`, `ASU`, `DEC`, `CMT`, `OUT` as canonical objects with the 43-column header. `rests_on` is **mandatory in the schema**: an objective linked to nothing is an objective no correction can ever reach. |
| **Invalidation propagation** | A correction walks the dependency graph, marks every dependent assumption **unverified** — not false, not withdrawn — and **lists** the objectives, decisions and commitments above them for a person. |
| **UI** | A third workspace: Overview, Search, Entities, Resolutions, Explore, Strategy and Impact. |

**Migration `0024`**, one forward migration in the shape of `0022` and `0023`: scope triple NOT NULL
and CHECK-constrained, `FORCE ROW LEVEL SECURITY` on all thirteen tables, and every write through a
SECURITY DEFINER port asserting the caller's own bound action. It joins the existing post-C18
upgrade check by one line — **not a new gate**.

## 2. The eight resolver authority rules, and where each one lives

The owner froze eight rules before implementation. They are enforced as **constraints and port
refusals**, not as conventions a service is trusted to follow — so a resolver bug can produce a
wrong proposal but cannot produce a wrong acceptance.

| # | Rule | Where it is enforced |
|---|---|---|
| 1 | An exact match on the same authoritative external identifier may resolve automatically, with source, rule/version and full provenance recorded | `res_auto_only_on_identifier`, `res_identifier_match_is_exact`, and `graph.propose_resolution`, which **re-checks the identifier against the registry itself** rather than trusting the caller |
| 2 | Name-only, fuzzy, conflicting or incomplete matches never auto-resolve | `res_auto_only_on_identifier` — an accepted row without a decider must have `method = 'deterministic_identifier'` |
| 3 | When deterministic scoring cannot produce an authoritative exact match, the gateway may rank candidates | `ModelGatewayService.rank()`, reached under `intelligence.gateway.call` — a separate governed operation from writing the proposal |
| 4 | A model proposal is evidence for the queue, not a final identity decision | the same constraint as rule 2: a `model_assisted` row can never be accepted without a person |
| 5 | Model-assisted resolution carries mode, model/weights/runtime, prompt and decoding digests, confidence, candidate set and source evidence lineage | `res_model_lineage_complete` — all of it or the row cannot exist |
| 6 | Ambiguous resolutions need a human who is not the proposing agent, with a written reason | `res_decision_has_reason`, `res_decider_is_not_proposer`, the port's own refusal, **and** a policy bundle that grants `graph.resolution.decide` to no agent role at all |
| 7 | Abstention or insufficient evidence stays unresolved; never force a best match | no port writes an acceptance without an identifier or a person; a conflicting-identifier mention and a failed ranking both stay unresolved and are reported |
| 8 | Wrong resolutions are reversible through supersession/split, preserving history and known-at results | `graph.split_entity` supersedes and deletes nothing; `accepted_at`/`superseded_at` make known-at a predicate rather than a reconstruction |

One deliberate carve-out is written into rule 6's constraint and explained beside it: a `human`
resolution — the row a **split** writes — is a person's own direct act, where there is no separate
proposer to be independent of. It is not a loophole: the only port that writes an accepted `human`
row requires the human-only `graph.entity.split` action and a written reason, and a `human` row
created through `graph.propose_resolution` is still born `proposed` and still has to survive
`graph.decide_resolution`.

## 3. The seven frozen criteria

All measured on the real governed ports, under real capability contexts, on the existing
integration harness. **43 tests, 43 passing.**

| # | Criterion | How it is proved |
|---|---|---|
| **C1** | Two spellings, one entity, both mentions survive | `"Bab el-Mandeb Strait"` and `"Bab-el-Mandeb"` — which normalise **differently**, so nothing about this was a string match — resolve to one entity through the PortWatch identifier. Each keeps its own claim and its own evidence digest, and the entity records which resolved when, at what score, under which rule, and that **no person decided it**. |
| **C2** | An uncertain resolution cannot merge silently | A name match reaches the queue; the constraint refuses an accepted name match **even from the superuser**; an agent is denied the deciding action; a person who is not the proposer decides it with a reason; the proposer is refused its own proposal; a model-assisted row without full lineage cannot be inserted. A person may also **redirect** a resolution onto an entity the resolver never proposed — recorded as a `human` decision keeping the resolver's original proposal. |
| **C3** | A wrong merge is reversible, history survives | A split moves named mentions; the prior resolutions are superseded with their method and score intact; a known-at query **before** the split still reproduces the merged view and **after** it does not; the new entity names what it was split from. |
| **C4** | Search is permission-aware; absence is not an oracle | An entity in another domain is found from that domain and **absent** from this one — and the response is byte-identical in shape and content to a search that matched nothing. Search returns metadata only; reading bytes stays `observation.evidence.retrieve`. A principal with no graph role is **denied**, not partially answered. |
| **C5** | Edges carry temporal validity and provenance; as-of has no hindsight | Every edge names its `REL` claim and evidence digest. An as-of query positioned before assertion returns nothing. World time and record time are independently filterable. A retraction removes the edge going forward, leaves `valid_to` untouched, and the pre-retraction view still shows it. |
| **C6** | Invalidating an assumption surfaces what rested on it | A correction marks the dependent assumption **unverified** with a reason, lists the objective and commitment above it with **how each was reached**, changes neither of them, and replaces the correction case's propagation sentence — while a case no propagation has walked still says exactly what Phase 1 said. |
| **C7** | Phase 0, 1 and 2 unchanged underneath | `0024` applied and `0021` still present; Phase 1 and 2 canonical write actions untouched; `CLM@v1` still Phase 0's and `CLM@v2` still Phase 2's; all thirteen graph tables under FORCE RLS; every graph projection derivable from its event log; the graph event logs append-only; and a Phase 2 claim still has **exactly the one version Phase 2 admitted** — resolution is an assertion about a claim, never an edit to it. |

## 4. Measured

| Suite | Result |
|---|---|
| Phase 3 acceptance (C1–C7) | **43 / 43** |
| Integration, everything | **536 / 536** (21 files) |
| C18-era manifest (`test:int`) | **297 / 297** — the count C18's frozen contract pins, unchanged |
| Phase 0 acceptance (`test:accept`) | **58 / 58** |
| Post-C18 upgrade check (`0022`→`0024`) | **PASS** — 1020 pre-existing rows unchanged; `identity.roles` +7, `objects.schema_registry` +13, `public.schema_migrations` +3, exactly as declared; upgraded and virgin schema digests identical (`69a4c8530e4d4ea1…`); later-phase suites on upgraded data **239 / 239** |
| Unit suites | api **2034** + **9** (hermetic suite meta, run unparallelised) · contracts **203** · tokens **3** |
| Typecheck · module boundaries | clean · no violations (421 modules, 1596 dependencies) |
| Corridor demonstration, all three acts | **0 problems** |

## 5. The demonstration — act III, measured

`node scripts/phase3/seed-graph.mjs`, on a database freshly migrated, bootstrapped and seeded by
acts I and II. Every step is an HTTP request an operator could make; there is no back door.

```
2. record the responses and extract the relationships
   run … mode=replay state=completed
   evidence read 2 · claims 14 · abstentions 0 · idempotent 0

4. resolve mentions to entities (as k.adeyemi, the agent)
   read 48 mention(s)
   resolved automatically 39   (authoritative identifier only)
   sent to a person             9
   entities created            10
   left unresolved              0

5. a person decides the queue (as s.larsen, who did not propose any of it)
   corridor entity: Suez Canal (20 mention(s) from the publisher's own rows)
   ✓ the resolution agent was refused the decision (policy bundle)
   ✓ 9 accepted by a person, 1 of them redirected onto a different entity

6. 5 edge(s) from 5 relationship claim(s)

7. 5 edge(s) visible now · 0 edge(s) visible at 1 January 2024 — no hindsight
   from the corridor, 5 entity(ies) within 4 hops
   Suez Canal · MV Hanse Trader · SYN-SHIP-4468 · SYN-PART-PWR · NORDWERK ANTRIEBSTECHNIK GmbH

9. ✓ propagated — 1 assumption(s) marked unverified; 1 objective(s), 0 decision(s) and
     1 commitment(s) reported for human review
     assumption unverified: The Suez Canal corridor stays open
     objective reported:    Keep the Regensburg line supplied through Q1
     commitment reported:   Hold the booked routing for the third shipment

10. ✓ "dependency propagation assessed by invalidation …: 1 assumption(s) marked unverified;
      1 objective(s), 0 decision(s) and 1 commitment(s) reported for human review"

11. entities_current 10 · resolutions_current 48 · edges_current 5 ·
    strategy_current 3 · invalidations_current 1 — no drift in any of them
```

**The redirection is the half a machine must not do.** The shipping manifest writes `"Suez"`; the
publisher writes `"Suez Canal"`. No string comparison joins those and rule 2 forbids guessing, so
the mention reached the queue — and a person who knows the domain said they are the same corridor.
The record says a **person** said so, keeps their reason, and preserves the resolver's own proposal
beside it.

**The corridor now reaches the manufacturer.** Five hops from a chokepoint the IMF published to the
company whose line depends on it, every edge naming the claim and the evidence bytes it rests on.

## 6. The sentence Phase 1 could not write

Since Phase 1 every correction case has carried:

> *"downstream consumers not yet present (KG/dependency graph arrives Phase 3)"*

That was a true statement **about the world at the time**, not a fixed label, and leaving it in
place once a dependency graph exists and has been walked would make it false. So:

* `0024` adds **one nullable column** to a Phase 1 table — `propagation_assessment_id` — and
  nothing else in that schema changes.
* `graph.record_impact` replaces the sentence **for the single case its walk actually assessed**,
  and names the assessment that did it.
* Phase 1's default is untouched. A case no propagation has walked still says exactly what it said
  before, and the acceptance suite asserts both halves.

No Phase 1 code path changed, no Phase 1 test changed.

## 7. What was touched outside Phase 3, and why

Three things, each additive and each with a reason that is not convenience.

* **`ModelGatewayService.rank()`** — a new method on the Phase 2 gateway. `call()` is untouched and
  a ranking request digests differently, so the two can never collide in the replay store. It lives
  there because *"the single egress for model calls"* is that file's whole reason to exist; a Phase
  3 egress of its own would have broken that invariant in order to avoid touching the file, which
  is the wrong trade.
* **The policy bundle** — the Phase 3 roles gain `intelligence.gateway.call` and
  `intelligence.read`, narrowly: the resolver reaches the model through Phase 2's front door and
  reads the method pin it ranks under through Phase 2's own read action. Holding those authorises
  reaching the model and reading the registry, and nothing else; neither lets a resolution role
  admit a claim.
* **The Phase 2 corridor fixture** — the entity claim now carries the `portid` the publisher prints
  in its own bytes. That is a fixture becoming richer, not a code path changing: it is the
  identifier that makes rule 1 demonstrable on real published data.

## 7a. The authenticated walkthrough, and the bug it found

One smoke walkthrough was performed as `s.larsen` (`resolution_manager`), authenticated through
the same environment-backed `/v1/auth/login` path the seed scripts use — no credential was typed,
printed, logged or committed, and the session was installed exactly as `lib/api.ts#login` installs
it. No test framework was added.

**It failed on the first attempt, and the failure was real.** The Graph shell resolves the working
scope from the server's answer about who you are — deliberately never from anything the client
remembered — and that call, `identity.self.read`, was refused with *"no qualifying role binding for
action in resolved scope"*. The policy rule for it had been written when `collection_*` were the
only domain roles and was **never extended**: a `resolution_manager` could not read its own
identity, so the workspace could not open at all.

The same gap silently affected **Phase 2**: `extraction_manager` and `extraction_agent` were
missing from that rule too, so the Intelligence workspace was equally unopenable for the roles it
had introduced. Phase 2's API and acceptance suite never touched the route, so nothing caught it.

The fix adds the five later-phase domain roles to that one rule. Widening it is safe for the reason
the route already relies on: it returns the CALLER's own record, there is no identifier to pass, and
so there is nothing to widen into a directory.

**After the fix, every screen rendered against live demonstration data:**

| Screen | What it showed |
|---|---|
| Overview | 10 entities · 48 accepted resolutions, **39 automatic** · 5 edges · 1 objective, 1 assumption, 1 commitment, 1 unverified · 1 invalidation assessed |
| Entities | the registry, and `Suez Canal` opened to its identifier `imf_portwatch chokepoint1`, 21 mentions — 20 marked *"no person — an authoritative identifier resolved it"*, one by *"a person"* — and a full history carrying the `human-retarget@1` row with its written reason |
| Resolution queue | 9 candidates, each with method, rule, score, *"this principal may not decide it"*, the evidence digest, what matched, and every candidate considered |
| Manual redirect | **exercised live**: `"Suez"` redirected onto `Suez Canal` through the UI's own control — `201 Created`, queue 9 → 8 |
| Explore | `Suez Canal → transits → MV Hanse Trader → carries → SYN-SHIP-4468 → carries → SYN-PART-PWR → depends_on → NORDWERK ANTRIEBSTECHNIK GmbH` |
| Strategy | OBJ, ASU and CMT, with the assumption **UNVERIFIED** and the other two reading *"not applicable — only an assumption is verified"* |
| Impact | the assessment, its statement, and the affected assumption, objective and commitment each with **how the walk reached it** |
| Search | 52 results for "Suez", every hit stating why it matched, with the scope note on the response |

The queue was empty after the demonstration cleared it, so a genuinely queued proposal was created
first through a **deliberately requested new attempt** of the supply-chain extraction — Phase 2's
own documented behaviour, not a back door.

## 8. Defects found and fixed during implementation

Six, all found by running the thing rather than by reading it.

0. **A later-phase role could not read its own identity**, so neither the Graph nor the Intelligence
   workspace could open for the roles those phases introduced. Found by the authenticated
   walkthrough above; it is listed first because it is the only one that a reader of the code would
   have had no reason to look for.

1. **A split violated its own separation-of-duties constraint.** `graph.split_entity` wrote the
   successor resolution with the deciding person as both proposer and decider, and
   `res_decider_is_not_proposer` refused it — correctly, for the case it was written for. Fixed by
   naming the carve-out explicitly in the constraint (§2) rather than by weakening it.
2. **The header's `audit_correlation_id` must be the governed operation's own.** The first
   Strategy-Graph test built its envelope and its header with two different correlation ids;
   `objects.admit_version` refused the admission. The refusal was right and the test was wrong.
3. **A relationship's byte span ran backwards.** The supply-chain fixture computed a span from the
   vessel's offset to the shipment's, and the shipment appears earlier in the record. The
   extraction contract refused the whole response — correctly, because a byte span is a claim about
   the bytes. Fixed with `min`/`max` over both ends.
4. **The supply-chain uploads are whole CSV files, not framed rows.** The first fixture parsed them
   as JSON and abstained on everything. The abstention was honest and useless; the parser now reads
   the CSV the connector actually preserved.
5. **The corridor did not reach the manufacturer.** Phase 2's declared-target bound is eight claims
   per evidence object, and the first claim set spent them on nodes rather than links, leaving the
   chain broken at the shipment. The bound is not the bug; spending it badly was.

## 9. Known limitations

* **Ambiguity resolves against a proposed target.** When the resolver finds several candidates and
  no gateway is configured, the proposal names the lowest-ordered candidate purely to have a target
  and **says so in its evidence**, carrying every candidate in the set. It is not a ranking and the
  screen does not present it as one, but a reader who ignores the note could mistake it for a
  preference.
* **An unmatched mention mints a candidate entity.** A mention that matches nothing gets a new
  entity proposed for it, and rejecting that proposal leaves the entity with no accepted
  resolution. It is visible (mention count zero) and reversible, but nothing yet retires it.
* **The model-assisted tail is implemented and not exercised by the demonstration.** `rank()` runs
  in both modes and carries full lineage, and the acceptance suite proves a model-assisted row
  cannot exist without that lineage — but the corridor demonstration configures no method for
  ranking, so it runs deterministic-only. That is the posture the plan recommended; the path is
  there when a method is pinned to it.
* **Edge building matches ends by normalised mention text.** A `REL` claim whose subject spelling
  differs from every resolved mention's is skipped with a named reason rather than being guessed
  at. That is the right refusal, and it means relationship claims benefit from resolution having
  run first.
* **One unreproduced local unit failure.** A `pnpm test` run that overlapped with files being
  written into the working tree reported `1 failed | 2033 passed`. Two subsequent full runs, and
  CI's `build-test` on a clean runner, all reported **2034 / 2034**. The run that failed was
  captured through a filter that kept only summary lines, so **the failing test's name was not
  recorded and I could not identify it afterwards.** It is noted here rather than omitted: I do not
  know what it was, and "not reproducible" is a weaker statement than "not real".
* **`graph.` actions fail closed.** There is no catch-all rule: an unknown graph action is
  `indeterminate` and denied. That is deliberate and it means a new action needs a bundle entry.
