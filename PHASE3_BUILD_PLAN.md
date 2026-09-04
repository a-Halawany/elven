# THE EYE — Phase 3 Product Build Plan: Enterprise Memory + Knowledge Graph (L3–L4)

> Scope comes strictly from the frozen roadmap (`docs/the-eye-master-build-prompt.md`, Phase 3) and
> the boundary the demonstration already promises (`docs/phase1/DEMO_STORYBOARD.md` §2, row 3).
> **Nothing here is implemented.** It does not touch Phases 4–7.

---

## 1. Product objective

**Turn claims into a governed memory that knows when the world has changed under it.**

Phase 2 produces attributable claims, but they are strings. Two claims about
"Bab el-Mandeb Strait" are two unrelated statements; nothing connects the chokepoint to the route,
the route to the supplier, or the supplier to the component. And nothing notices when a corrected
claim undermines something a person is relying on.

Phase 3 closes both gaps:

> `chokepoint4`, "Bab el-Mandeb Strait" and "Bab-el-Mandeb" resolve to **one governed entity** with
> its own history — and invalidating "the corridor is open" **surfaces the objectives that assumed
> it**.

The roadmap's acceptance sentence is the product test: *search respects tenant and permissions; two
mentions of the same company resolve to one entity with history; invalidating an assumption
surfaces the affected objectives and scenarios.*

Phase 3 does **not** forecast (Phase 4), simulate (Phase 5), decide (Phase 6), or add autonomous
agents beyond the bounded runs Phase 1's agent contract already governs (Phase 7).

## 2. Capabilities added

**For the analyst**
* Search evidence and claims in one place, permission-aware, and see **why** each result matched.
* Open an entity and read its whole history: every mention that resolved to it, when, from which
  evidence, and at what confidence.
* See an entity's edges — related entities, with the temporal validity and provenance of each edge.
* Ask a **known-at** question of the graph, not just of an object: what did we believe about this
  entity on 14 January?

**For the reviewer**
* A **resolution queue**: candidate merges the resolver is not confident about, with the evidence
  for and against, approved or rejected by a person. Same two-person discipline as Phase 2 review.
* **Split** an entity that was wrongly merged. The merge is not deleted; it is superseded, and the
  history says a person split it and why.

**For the operator**
* Declare **Strategy Graph** objects — objectives, assumptions, decisions, commitments, outcomes —
  and link an assumption to the claims and entities it rests on.
* When a claim is corrected or withdrawn, see **exactly which assumptions and objectives** are
  affected. Phase 1's corrections have said "downstream consumers not yet present" since the
  beginning; this is the phase that makes that sentence retire.

## 3. Architecture

| Component | What it is |
|---|---|
| **Entity registry** | Governed entity identities (`ENT` canonical objects gain a resolved identity, not a new type). Every mention keeps its own claim; resolution is a separate, reversible assertion linking mention → entity, never an edit to the claim. |
| **Resolver** | Deterministic blocking + scoring first (normalised name, source-scoped identifiers, co-occurrence). The Model Gateway is available for the ambiguous tail, in the same two modes with the same lineage. Above a threshold it resolves; below it, the queue. **No automatic merge is unreviewable** — every one records what matched and by how much. |
| **Graph edges** | `REL` claims become edges with temporal validity (`valid_from` / `valid_to`) and provenance on the edge itself. An edge is an assertion with a lifetime, not a fact. |
| **Permission-aware retrieval** | Search over evidence, claims and entities under the existing capability model — the same scope triple, the same RLS. A result a caller may not see is absent, not redacted, and never an existence oracle. |
| **Strategy Graph** | `OBJ` (objective), `ASM'` (assumption), `DEC` (decision), `CMT` (commitment), `OUT` (outcome) as canonical objects with the 43-column header, linked to the claims and entities they rest on. |
| **Invalidation propagation** | A correction or withdrawal walks the dependency graph and marks every assumption resting on the changed claim as **unverified**, then reports the objectives and commitments above them. It does not decide anything — it tells a person what to look at. |

**Data model.** One forward migration, `0024`, in the shape of `0022` and `0023`: entity registry
(events + projection), mention→entity resolutions, edges, the resolution queue, Strategy Graph
objects and dependency links. Scope triple NOT NULL and CHECK-constrained, `FORCE ROW LEVEL
SECURITY`, SECURITY DEFINER ports asserting the caller's own bound action. It joins the existing
post-C18 upgrade check by one line — **not a new gate**.

**API.** Extends the same surface: `entities/*` (list, get, history, known-at), `resolution/*`
(queue, decide, split), `graph/*` (neighbours, path, as-of), `strategy/*` (objectives, assumptions,
links), `search`. Same envelope, same capabilities, same receipts, and — as in Phase 2 — reading
and writing remain separate decisions.

**UI.** A third workspace: Search, Entities (with history and edges), Resolution queue, Strategy
Graph, and an **Impact** view that answers "what does this correction affect?". Same rules
throughout: receipts only from authoritative responses, state never by colour alone,
keyboard-operable, RTL-mirrored.

## 4. Connectors and external data

**None.** Phase 3 reads what Phases 1 and 2 already produced. No new source, no new credential, no
paid service, and the UN Comtrade key stays untouched.

The Model Gateway is reused **as built** for the ambiguous resolution tail — `replay` for CI,
acceptance and the demonstration; `local-live` against the same local model already pulled. No new
model, no new provider, no hosted API.

**One genuine decision, and it is small:** whether Phase 3's resolver may call the gateway at all,
or must stay deterministic. Deterministic-only is simpler to defend and cheaper to run; the model
helps exactly where names are messy. **Recommendation: deterministic first, gateway available
behind the method registry** — the same governed pin, so a model-assisted resolution carries the
same lineage a claim does. This needs no new authorization; it is noted because it changes what the
resolution queue contains.

## 5. Milestones

| M | Deliverable | Est. |
|---|---|---|
| **P3-M1** | Migration `0024` + entity registry + upgrade check extended by one line | 3–4 days |
| **P3-M2** | Deterministic resolver, mention→entity resolutions, entity history | 5–6 days |
| **P3-M3** | Resolution queue: candidate merges, two-person decisions, split without deletion | 3–4 days |
| **P3-M4** | Edges with temporal validity; graph neighbours, path, and as-of retrieval | 4–5 days |
| **P3-M5** | Strategy Graph objects and dependency links; invalidation propagation that retires "propagation unresolved" | 5–6 days |
| **P3-M6** | Permission-aware search; Entities, Resolution, Strategy and Impact UI | 5–6 days |
| **P3-M7** | Corridor demonstration extended to the third storyboard row; acceptance criteria; Phase 3 report | 3–4 days |

**Realistic duration: 5–6 weeks** — longer than Phase 2 because the Strategy Graph and invalidation
are new product surface rather than an extension of an existing pipeline. One engineer, local-only,
no live sources.

## 6. Proposed acceptance criteria

Seven, to be **frozen before implementation starts** and not expanded during it. Each proves a
product capability the roadmap names.

| # | Criterion |
|---|---|
| **C1** | Two mentions of the same real-world thing, from different sources and with different spellings, resolve to **one entity with history**: both mentions remain, each keeps its own claim and evidence, and the entity records which resolved when, by what score, and under whose decision. |
| **C2** | A resolution the resolver is not confident about **cannot merge silently**. It reaches the queue, is decided by a person who is not the agent that proposed it, and the decision records its reason. |
| **C3** | A wrongly merged entity can be **split**. The prior merge is superseded, not deleted; a known-at query before the split still reproduces the merged view, and after it does not. |
| **C4** | Search respects tenant, domain and permissions. A result the caller may not see is **absent, not redacted**, and the response is identical in shape to one where nothing matched. |
| **C5** | An edge carries temporal validity and provenance. An as-of query returns the graph **as it stood at that instant**, with no hindsight. |
| **C6** | **Invalidating an assumption surfaces what rested on it.** Correcting or withdrawing a claim marks every dependent assumption unverified and lists the affected objectives and commitments — and Phase 1's correction cases stop saying propagation is unresolved, because it no longer is. |
| **C7** | Phase 0, 1 and 2 regression: full CI green, no constitutional invariant weakened, C18 still frozen at 0021, and the Phase 1 and Phase 2 operator journeys unchanged. |

## 7. What this plan deliberately excludes

Forecasts, scenarios and calibration (Phase 4) · twins and simulation (Phase 5) · decision packages
and Decision Replay (Phase 6) · planner/supervisor agents and the governed release pipeline
(Phase 7) · any new source cohort, connector, credential or paid service · any new gate, testing
framework or acceptance matrix beyond C1–C7.
