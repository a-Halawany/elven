# THE EYE — Phase 2 Product Build Plan: Intelligence Layer (L2)

> Scope comes strictly from the frozen roadmap (`docs/the-eye-master-build-prompt.md`, Phase 2) and
> the phase boundaries the demonstration already promises
> (`docs/phase1/DEMO_STORYBOARD.md` §2). It does not touch Phases 3–7.
>
> **APPROVED** by the owner as product acceptance — not as a claim of independent code review —
> with the model decision recorded in §4 and criterion **B5 corrected before freezing**.
> **B1–B6 are frozen** and are not to be expanded during implementation unless a constitutional
> invariant is violated.

---

## 1. Product objective

**Turn preserved bytes into governed claims.**

Phase 1 can prove *what arrived and from whom*. It cannot say what any of it means — deliberately.
Phase 2 makes the platform read its own evidence and produce structured, attributable claims:

> "Transits at chokepoint4 fell 51 % over 72 hours" — with the method that produced it, the model
> and prompt version, a confidence, a truth state, and a link back to the exact evidence bytes.

The roadmap's acceptance sentence is the product test: *ingested evidence yields structured claims
with visible method/model/version/confidence; a reviewer can approve or correct; corrections are
versioned, never overwritten.*

Phase 2 does **not** resolve entities into a graph (Phase 3), forecast (Phase 4), simulate
(Phase 5), decide (Phase 6) or run autonomous agents beyond the bounded extraction runs that
Phase 1's agent contract already governs (Phase 7).

## 2. Capabilities added

**For the analyst**
* See claims extracted from evidence, each carrying method, model, prompt version, confidence and
  truth state, and each linked to the evidence it came from.
* Open a claim and read the exact bytes it was derived from, at the offsets it used.
* Filter by confidence, truth state, method, source and time.
* Correct a claim. The correction is a new version; the prior one stays retrievable.

**For the reviewer**
* A **review queue** of low-confidence and abstained output, ordered by consequence.
* Approve, correct or reject with a written reason — a second person, as with quarantine.
* See what the model abstained on, and why abstention is not the same as absence.

**For the operator**
* Register and version **extraction methods** the way sources are registered: declared inputs,
  model and prompt version, cost and latency budgets, abstention policy, and an accountable owner.
* Watch extraction runs, their budgets, their failures and their fallbacks.
* See a **model gateway** view: which model served which run, at which version, with what fallback
  and what it refused.

## 3. Architecture

| Component | What it is |
|---|---|
| **Model Gateway** | The single egress for model calls, in two modes — `replay` (recorded responses, the deterministic default) and `local-live` (a local open-weights model through an Ollama/llama.cpp adapter). Versioned prompts and models as governed objects; every call logged with **mode**, request digest, model id, weights digest, runtime version, prompt version, decoding configuration, latency and outcome; declared fallback chain; **abstention as a first-class result**, not an error. No model call may originate anywhere else, and no hosted API is used. |
| **Extraction pipeline** | Evidence → typed extraction run → candidate claims. Runs under the Phase 1 agent contract: per-run reauthorization, code digest, budgets, stop-and-escalate. No external I/O inside a database transaction — the Phase 1 rule carries forward unchanged. |
| **Claim store** | New canonical object types under the existing 43-column header and the four-axis temporal model: `ENT` (entity mention), `EVT` (event), `CLM` (claim), `REL` (relationship), `ASM` (assessment). Written only through `objects.admit_version`, append-only, corrected by supersession. |
| **Method lineage** | Every claim binds method ref, model id and version, prompt version, input evidence ids with byte offsets, and the run that produced it. A claim whose lineage cannot be resolved is not admitted. |
| **Review queue** | A governed work queue with routing by confidence and consequence class, a two-person rule for corrections, and audited decisions. |

**Data model.** One forward migration, `0023`, in the same shape as `0022`: extraction methods
(event-sourced + current projection), extraction runs, claim objects, review cases and decisions.
Scope triple NOT NULL and CHECK-constrained, `FORCE ROW LEVEL SECURITY`, SECURITY DEFINER ports
asserting the caller's own action. Migration `0023` gets the same upgrade-compatibility check
`0022` has — the existing script, extended by one ceiling, **not a new gate**.

**API.** Extends the existing `/v1/tenants/:t/domains/:d/` surface: `methods/*` (register, approve,
activate, version), `extraction/*` (run, list, get), `claims/*` (list, get, known-at, correct),
`review/*` (queue, decide). Same envelope, same capability model, same receipts.

**UI.** A second workspace beside Observation Operations, reusing its components: Claims browser
(with evidence pane), Review queue, Methods registry, Model gateway view. Same rules — receipts
only from authoritative responses, state never by colour alone, keyboard-operable, RTL-mirrored.

## 4. Connectors and external data

**No new connectors.** Phase 2 consumes what Phase 1 already collected. The ten sources, the replay
set and the evidence vault are the inputs.

**What is genuinely new is a model** — and the decision is made. The Model Gateway is **dual-mode**:

| Mode | Role | Cost |
|---|---|---|
| **`replay`** — recorded responses | The **deterministic default** for CI, acceptance and the reproducible demonstration. Responses are captured once and replayed thereafter, exactly as Phase 1 replays source bytes. | €0, no credential |
| **`local-live`** — a real local open-weights model | The **live extraction provider**, through an Ollama or llama.cpp adapter, with model name, **weights digest**, runtime version, prompt version and decoding configuration all pinned and recorded on every call. | €0, no credential |

**A hosted model API is not used in Phase 2.** No API key and no paid subscription is requested.
The existing UN Comtrade key stays untouched, and Phase 2 adds no connectors.

**Replay is never presented as if a model ran live.** The mode is a first-class field on every
gateway call, every extraction run, every claim's lineage and every receipt, and the UI labels it
on the claim, the run and the gateway view. A reader must never have to infer whether a number came
from a recorded response or from a model that actually executed.

**What continues on frozen replay evidence:** all ten sources, the whole corridor demonstration,
and the evidence the extraction reads. Nothing in Phase 2 requires going live.

**Credentials required:** none under option C. Option B alone requires a key and a spend decision.
The existing UN Comtrade key stays unused and untouched either way.

## 5. Milestones

| M | Deliverable | Est. |
|---|---|---|
| **P2-M1** | Migration `0023` + method registry + `0023` upgrade-compatibility check | 3–4 days |
| **P2-M2** | Model Gateway: versioned prompts/models, call log, fallback chain, abstention, budget enforcement | 4–5 days |
| **P2-M3** | Extraction pipeline under the agent contract; ENT/EVT/CLM/REL/ASM admitted with full lineage | 5–7 days |
| **P2-M4** | Review queue: routing, two-person corrections, versioned never-overwritten corrections | 3–4 days |
| **P2-M5** | Claims + Review + Methods + Gateway UI | 4–5 days |
| **P2-M6** | Corridor demonstration extended to the second storyboard row; acceptance criteria; Phase 2 report | 3–4 days |

**Realistic duration: 4–5 weeks**, comparable to Phase 1 and on the same assumptions — one
engineer, local-only, no live sources.

## 6. Frozen acceptance criteria

Six, deliberately few, and none of them a new framework. Each proves a product capability the
roadmap names.

| # | Criterion |
|---|---|
| **B1** | Ingested Phase 1 evidence yields structured claims, each carrying method ref, model id, model version, prompt version, confidence and truth state — and each resolving back to the exact evidence bytes it was derived from. A claim whose lineage cannot be resolved is refused, not admitted with a gap. |
| **B2** | A reviewer can approve, correct or reject a claim. A correction admits a **new version**; the prior version stays retrievable and a known-at query reproduces the pre-correction state. Nothing is overwritten. |
| **B3** | Low-confidence and abstained output reaches the review queue and **cannot bypass it**. Abstention is recorded as its own outcome and is never rendered as absence or as a zero-confidence claim. |
| **B4** | Every model call goes through the Model Gateway and is logged with model, version, prompt version and outcome. A call attempted outside the gateway fails closed. A budget breach stops the run and escalates. |
| **B5** | **Extraction identity and idempotency.** An extraction's identity is derived from the evidence digest plus the method, model, prompt and decoding-configuration digests. Repeating the same identity is **idempotent**: it returns the previously recorded result rather than silently calling the model again. In **`replay`** mode the recorded response is byte-identical and the canonical claims are byte-identical. A deliberately requested **new live attempt** is recorded as a new attempt — this criterion makes **no claim that separate live model executions are byte-identical across hardware or runtimes**, because they are not. Any difference between live attempts stays visible as its own attempt and **cannot silently overwrite an admitted claim**. |
| **B6** | Phase 0 and Phase 1 regression: full CI green, no constitutional invariant weakened, C18 still frozen at 0021, and the Phase 1 operator journey unchanged. |

## 7. What this plan deliberately excludes

Entity resolution and the knowledge graph (Phase 3) · forecasts and scenarios (Phase 4) · twins and
simulation (Phase 5) · decision packages and Decision Replay (Phase 6) · planner/supervisor agents
and the governed release pipeline (Phase 7) · any new source cohort · any new gate, testing
framework or acceptance matrix beyond B1–B6.
