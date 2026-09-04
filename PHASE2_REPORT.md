# THE EYE — Phase 2 Report: Intelligence Layer (L2)

> Status: **IMPLEMENTED — awaiting owner review.** Built from `main` after Phase 0 closed at
> [`phase0-v1.0.0`](https://github.com/a-Halawany/elven/releases/tag/phase0-v1.0.0) and Phase 1
> merged as `045ee030`.
> Plan: [PHASE2_BUILD_PLAN.md](PHASE2_BUILD_PLAN.md) (approved, B1–B6 frozen) · Phase 1:
> [PHASE1_PRODUCT_HANDOFF.md](PHASE1_PRODUCT_HANDOFF.md)

Phase 1 could prove what arrived and from whom. Phase 2 makes the platform **read its own evidence
and produce attributable claims** — each carrying the method, the model and its weights digest, the
prompt version, the decoding configuration, the **mode** it ran in, and the exact evidence bytes it
rests on. It does not resolve entities into a graph, forecast, simulate or decide; those are
Phases 3–6 and this phase refuses to imply them.

---

## 1. What was built

| Area | Delivered |
|---|---|
| **Schema** | Migration `0023` (~960 lines): extraction methods (events + projection), the recorded-response store, the gateway call log, extraction runs, **extraction attempts**, claim lineage, and the review queue — every table with the scope triple NOT NULL and CHECK-constrained, under `FORCE ROW LEVEL SECURITY`, written only through SECURITY DEFINER ports that assert the caller's own bound action. |
| **Model Gateway** | The single egress for model calls, in **two modes**. `replay` answers from a response recorded for exactly this request digest. `local-live` runs a local open-weights model over the Ollama/llama.cpp HTTP API, **loopback only**. No hosted model API exists in the code and none is configurable. Abstention is a first-class outcome; a malformed response is **refused**, not coerced. |
| **Method registry** | Registered by one operator, approved by a **different** one (a table constraint, not a disabled button), then activated. A method declares its whole pin: model, weights digest, runtime, prompt ref/version/digest, decoding config and digest, mode, confidence floor, review threshold and budgets. |
| **Extraction** | Evidence → ENT/EVT/CLM/REL/ASM, admitted through the same `objects.admit_version` path Phases 0 and 1 use, under a bounded **declared target set**. The method is locked `FOR SHARE` inside the admitting transaction. Vault reads happen outside any transaction, as Phase 1 requires. |
| **Extraction identity** | Evidence digest + method + model + weights + prompt + decoding digests. The **database** decides whether the model is called again, not the caller. |
| **Review queue** | Low-confidence output and abstentions are queued in the same transaction that admits the claim, so no claim exists un-queued. A decision needs a written reason; the agent that produced the output cannot decide it. A correction admits a **new version**. |
| **UI** | A second workspace beside Observation Operations: Overview, Claims (with full lineage), Review, Methods, Gateway. Mode is rendered wherever output is rendered. |
| **Demonstration** | The corridor story's second act, driven entirely over the real HTTP API. |

## 2. How to run it

```bash
./scripts/demo.sh
node scripts/phase1/seed-demo.mjs
node scripts/phase2/seed-extraction.mjs
```

The Phase 2 seed drives the real API with real governed envelopes. From the seeded Phase 1 state it
registers the corridor extraction method, has a second operator approve and activate it, loads the
recorded responses, extracts, proves idempotency, works the review queue, corrects a claim without
overwriting it, and reads the claim back at an instant before the correction.

Observed on a live run:

```
1. register the extraction method (as a.hoffmann)
   reads imf-portwatch-chokepoints
   model qwen2.5:3b-instruct · weights d9ed12f78c8d2d0f… · prompt extract/corridor-transit@v1
2. approval by a DIFFERENT operator
   ✓ the registrar cannot approve their own method (403)
   ✓ approved by L. Ferreira    ✓ activated
3. load the recorded model responses (mode: replay)      ✓ 60 recorded
4. extract — claims with lineage to the evidence bytes
   ✓ run … mode=replay state=completed
     evidence read 40 · claims 117 · abstentions 1 · queued for review 40 · calls 40
5. the same extraction again — idempotent, not a second call
   ✓ 40 identities returned their recorded result; 0 model calls
6. the review queue
   ✓ an abstention is queued as an abstention, with no claim attached
   ✓ a decision without an adequate reason is refused
   ✓ corrected → version 2 (the prior version is untouched)
7. known-at — ✓ sees v1 before the correction; current is v2 — no hindsight
8. projections rebuild — methods, runs, review: mismatched 0
```

**Two new operators**, and the split between them is the product, not scaffolding:
**R. Okafor** (`extraction_agent`) runs methods and admits claims; **L. Ferreira**
(`extraction_manager`) approves methods and decides review cases. Neither can do the other's job —
the PDP refuses the role, and the database separately refuses a review decided by the agent that
produced the output.

## 3. The six frozen criteria

`apps/api/test/int/phase2-acceptance.test.ts` — **23/23**, on the existing integration harness. No
new gate, no new framework.

| # | Criterion | Evidence |
|---|---|---|
| **B1** | Claims carry method, model, versions, confidence and evidence lineage | Every lineage row resolves to an evidence object carrying that digest; the stored claim carries all fourteen pin fields; all five claim schemas make `lineage`, `mode`, `evidence_digest`, `extraction_identity` and `retrieval_decision_id` mandatory. **Reading and writing are two decisions**: the read/write decision sets are disjoint, and every read leaves a `custody.retrieved` entry naming its run and method |
| **B2** | A reviewer approves, corrects or rejects; a correction versions, never overwrites | A correction admits v2 with `truth_state: asserted` while v1 stays `extracted` and retrievable; known-at before the correction returns v1; a reasonless decision is refused; the producing agent is refused |
| **B3** | Low confidence and abstention cannot bypass review | Every claim below the threshold has a queued case; claims above it have none; an abstention **cannot** carry a claim — the constraint refuses it |
| **B4** | Every model call goes through the gateway and is logged; a budget breach stops and escalates | Each call carries mode, model, prompt version, decoding digest and outcome; the log is append-only; a method budgeted at one call ends `budget_exceeded` and leaves a `run.budget_exceeded` event |
| **B5** | Extraction identity and idempotency | A different prompt or decoding config yields a different identity; a repeat produces idempotent hits with **zero** gateway calls and admits nothing twice; recorded responses are byte-identical to their digests; a deliberate new attempt is recorded as **attempt 2**, not an overwrite; the attempts table is append-only |
| **B6** | Phase 0 and Phase 1 untouched; full regression green | `observation.item.admit` still pins `[OBS, EVD]` and `intelligence.claim.admit` cannot write either; migrations 0001–0023 all present, C18 frozen at 0021; every intelligence projection rebuilds with zero drift |

**Regression, on a quiescent database:** integration `test:int:all` **493/493** (the Phase 0 and
Phase 1 470 plus these 23) · Phase 0 acceptance **58/58** · the C18-era manifest `test:int`
**297/297**, unchanged, which is the count C18 froze · the post-C18 upgrade check (0022 and 0023)
**PASS**, with 194/194 later-phase tests against the upgraded database.

> The C18-era manifest now excludes `phase2-*` as well as `phase1-*`. C18 is frozen at migration
> 0021 and its differential verifier pins the suite's argv, so every later phase's suites stay out
> of the set it counts — and 297 keeps meaning exactly what it meant when it was frozen.

## 3a. The live path, measured

`local-live` is not a code path that exists — it has been run. One complete corridor
extraction, against a real model executing on this machine:

```
0. the local runtime and the model it actually loaded
   ✓ ollama 0.33.2 on 127.0.0.1:11434
   ✓ qwen2.5:3b-instruct · weights 357c53fb659c5076de1d65cc…
   · family qwen2 · params 3.1B · quant Q4_K_M
1. register a local-live method, pinned to the reported weights
   ✓ approved by a second operator, then activated
2. one live extraction — a real model answers
   ✓ run … mode=local-live state=completed in 1.7s
     evidence read 2 · claims 2 · abstentions 0 · calls 2
3. reading and writing were two decisions
   · read  EVD 01a068a0… → POL … audit #5064
   · read  EVD 01a068a0… → POL … audit #5066
   · write claims          → POL …
   ✓ the read decisions and the write decisions are disjoint
4. the gateway log
   ✓ mode=local-live outcome=completed model=qwen2.5:3b-instruct
     runtime=ollama/0.33.2 in 689 ms
   ✓ 2 live response(s) recorded — marked 'local-live', not 'fixture'
5. replaying the recorded response calls the model zero times
   ✓ 2 identities returned their recorded result; 0 model calls
   ✓ the gateway logged no further live call
6. the claims, as a reader sees them
   · 2 claim(s) carry mode=local-live
   ✓ the claim records the digest the runtime reported for the weights that answered
=== live path proven ===
```

**The weights digest is the runtime's, not ours.** The method is pinned to the
digest `ollama` reports for the blob it actually holds (`357c53fb…`), read from
`/api/tags` at registration time. A pin to a value we chose would prove nothing
about what answered.

Run it yourself with `node scripts/phase2/live-extraction.mjs`, with `ollama serve`
running and `qwen2.5:3b-instruct` pulled (1.93 GB). **It is not wired into CI** and
is not meant to be: hosted CI runs `replay`, which is deterministic and needs no
model.

**On the quality of what it said.** The claims a 3B instruct model produced are
thin — it identified the chokepoints and little else. That is the model, not the
path, and the product shows it honestly: each claim carries its confidence, its
mode and its evidence span, and anything below the method's threshold goes to a
person. Phase 2 is not a claim that a small local model is a good analyst.

## 4. The model decision, as implemented

**Replay is the default and it never pretends a model ran.** `mode` is NOT NULL with no default on
the gateway call, the run, the claim lineage and the attempt; it appears in every receipt and on
every screen that shows output. A replay miss is a **failure with a named reason** — it does not
fall through to a live call, because a demonstration that quietly reached a model would be a
demonstration of something else.

**`local-live` is a real local model.** The adapter speaks the Ollama HTTP API (which llama.cpp's
server also speaks), refuses any host that is not loopback, and pins model, weights digest, runtime,
prompt version and decoding configuration on every call. A live response is recorded as it is made,
so the same extraction becomes reproducible afterwards without the model.

**No hosted model API, no new credential, no paid service.** The UN Comtrade key remains untouched
and unused, and Phase 2 adds no connectors.

## 5. Defects found and fixed during implementation

1. **A failed attempt was answering for an extraction identity.** The first cut made *any* prior
   attempt idempotent, so a replay miss became a permanent answer no later run could get past.
   Corrected in `0023` before it shipped: only an attempt that ADMITTED claims or recorded an
   ABSTENTION — real outcomes the model produced — makes an identity idempotent. Failures stay
   recorded and visible; they simply do not answer for the identity.
2. **The orchestrator reused one envelope across three different actions.** The pipeline requires an
   envelope's action to equal its route's, and it was right to refuse. Each governed operation now
   builds its own envelope, keeping the correlation id.
3. Same class, in the review route: the internal read before a correction derived its own read
   envelope instead of borrowing the write's.
4. **Deliberate intelligence refusals answered 500.** Mapped to honest HTTP answers beside the
   Phase 1 rules, in the product's own words — the registrar approving their own method, a
   reasonless decision, an agent deciding its own output, an unreachable transition.
5. **The demonstration's method read everything.** Scoped to its source: a method that reads
   evidence it was never written for abstains on most of it, and an abstention that only means
   "this was never mine" tells a reviewer nothing.
6. The fixture keys were built from the wrong fields (the EVD *row* rather than its payload), so
   every replay missed. Keyed on the payload's locator and content digest, as the gateway is.
7. **`intelligence.rebuild_projections()` counted every tenant in the cluster.** It is SECURITY
   DEFINER, so row-level security is not a boundary it can rely on, and my first version took no
   arguments and filtered nothing — a caller in one domain received counts covering all of them.
   Not content, but a cross-tenant disclosure and simply a wrong answer about the domain asked
   about. It now derives the scope from the **established context** (`public.eye_tenant()` /
   `eye_domain()`) and refuses when no tenant is established. Phase 1's equivalent was already
   scoped, by parameter; deriving it from the context is the stricter of the two, because there is
   no argument a caller could get wrong. Caught by the demonstration reporting 29 methods for a
   domain that has one.

## 6. Known limitations

* **The corridor demonstration runs in `replay`; the live path was exercised separately.** §3a is
  one bounded live run over two evidence objects — enough to prove the product path, not a claim
  that the whole corridor story has been extracted by a model. The acceptance suite and CI run
  `replay` only, deliberately: they must be deterministic and must not need a model.
* **The corridor demonstration's recorded responses are AUTHORED FIXTURES.** They were written by
  hand for this evidence. No model produced them, and nothing in the product says one did: they are
  stored `recorded_from: 'fixture'`, the gateway view shows that column, and a claim built from one
  carries `mode: replay`. Responses a model actually produced are stored `recorded_from: 'local-live'`
  — §3a's two are the only ones — and the two are never conflated.
* ~~Extraction reads evidence bytes under its own action.~~ **Closed.** Extraction now obtains a
  separate `observation.evidence.retrieve` decision per evidence object and reads through Phase 1's
  own `EvidenceService` — manifest-resolved, digest re-verified, custody-writing. There is no second
  vault path. Both decisions are visible in the extraction receipt and in every claim's lineage, and
  the custody entry names the extraction that read the bytes.
* **Confidence is the model's own number.** Nothing calibrates it, and Phase 2 does not claim it is
  calibrated. Calibration tracking arrives with forecasts in Phase 4.
* **Claims are not entities.** Two claims about "Bab el-Mandeb Strait" are two strings, not one
  resolved entity. Entity resolution is Phase 3.
* The LOCAL-ONLY posture is unchanged: `EXC-P0-004`, no external deployment, no real customer data.
