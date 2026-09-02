# Capability Preservation Map — where the rest of the Eye enters

> Purpose: prove nothing has been dropped by scoping Phase 1 honestly. Every headline capability has
> a named phase, a named layer, and an acceptance condition **taken from the existing roadmap** —
> none invented here.
>
> This is a map, not a plan. Each phase lands through its own approved plan.

---

## 1. The corridor demonstration, phase by phase

One storyline, extended seven times. Phase 1 is the first row and claims nothing above it.

| Phase | Layers | The corridor demonstration gains | Roadmap acceptance condition |
|---|---|---|---|
| **1** | L1 | Sources under contract, approved by a second person; corridor evidence with full custody; quarantine; freshness/coverage incl. `unknown`; a publisher correction superseded without overwriting history | Sources register under contract; evidence carries full chain of custody; a source correction emits a correction event downstream; a source-health view shows freshness and coverage |
| **2** | L2 | Extraction turns bytes into claims — "transits fell 51 % over 72 h" — each with method lineage, model/version, confidence and truth state; low-confidence output queues for human review | Ingested evidence yields structured claims with visible method/model/version/confidence; a reviewer can approve or correct; corrections are versioned, never overwritten |
| **3** | L3–L4 | Entity resolution binds chokepoint4, the route, the supplier and the component into one governed graph with temporal validity and provenance on edges; Strategy Graph objects link objectives and assumptions, so "the corridor is open" becoming false flags what depended on it | Search respects tenant and permissions; two mentions of the same company resolve to one entity with history; invalidating an assumption surfaces the affected objectives and scenarios |
| **4** | L6–L7 | Forecast objects across the canonical horizons (30/90/180 days, 1/3/5 years) with distribution, confidence, drivers, assumptions and refresh cadence, calibrated against outcomes; a scenario tree whose branch flips when the transit-count indicator breaches threshold; an early warning routed to a named owner | A forecast links to evidence and assumptions and can later be scored; a scenario branch flips when its indicator threshold is breached; a warning routes to a named owner |
| **5** | L5, L8 | A digital twin of the Ningbo→Regensburg chain declaring boundary, grounding evidence, assumptions, behaviour model, validation status and limitations; reroute vs. air vs. draw-down simulated with recorded seeds and interventions, reproducibly, outputs marked synthetic | A twin instantiates from graph + evidence; re-running a simulation with identical inputs reproduces identical outputs; results are marked synthetic |
| **6** | L9–L10 | A decision package: objectives, options, consequences linked to simulations, uncertainty, dissent, required approvers, monitoring conditions; executive briefing — what changed, why it matters, who owns it, which window is closing; Decision Replay reconstructing known → believed → tested → decided → observed without hindsight | No decision reaches "committed" without a human approval record; a completed decision can be replayed showing exactly what was known at the time |
| **7** | agents, learning | A monitoring agent watching the indicator within budget, stopping and escalating at its limit; threshold and prompt changes shipped only through an approved, evaluated, rollback-capable release; observability across all four planes | An agent hitting its budget stops and escalates; a prompt change cannot reach production without an approval record; dashboards show all four observability planes |

---

## 2. Capability register

| Capability | Enters | Phase 1 status | What Phase 1 deliberately does instead |
|---|---|---|---|
| Semantic content extraction | **2** | **Absent** | Transport framing + safety validation only, always with `method_ref` (locked decision 3) |
| Model Gateway / LLM | **2** | **Absent** | No LLM key is required or used |
| Entities, events, claims, relationships | **2** | Absent | Evidence objects only — bytes, custody, times |
| Human review queue for low confidence | **2** | Absent | Quarantine is a *validity* queue, not a confidence queue — a different thing, not an early version |
| Permission-aware semantic retrieval | **3** | Absent | Scoped list/detail over registered objects |
| **Knowledge Graph** + entity resolution | **3** | Absent | Object linkage is parent/child framing within one source |
| Strategy Graph (objectives, assumptions) | **3** | Absent | — |
| **Six prediction horizons** (30/90/180 d, 1/3/5 y) | **4** | Absent | — |
| Scenario trees, branch points, signposts | **4** | Absent | — |
| Early-warning products | **4** | Absent | Source **health** ≠ world warning. Health says our collection is degraded; a warning would say the world changed. |
| **Digital Twins** | **5** | Absent | — |
| **Simulation** | **5** | Absent | — |
| **Decision intelligence**, approvals, Decision Replay | **6** | Absent | Source-contract approval is governance of *collection*, not of decisions |
| Executive briefings, decision rooms, commitments | **6** | Absent | — |
| **Agent system** (planner/specialist/supervisor) | **7** | **Partially present, honestly** | Observation/Crawler/Collection contracts exist as registered principals with identity, budgets and revocation (§11). These are *collection* agents. The planner/supervisor system is Phase 7. The Crawler contract is defined with **no cohort-1 instance**. |
| **Continuous / governed learning** | **7** | Absent | — |
| Four-plane observability | **7** | Absent | Source health is one plane's raw material |
| Deployment packaging | **7** | Absent | Local Docker profile only (EXC-P1-002) |

---

## 3. Source-universe coverage

Phase 1 is **cohort 1 of 20 constitutional source classes** — 1 substantially covered, 4 partially,
15 not implemented. That register is [L1_CONNECTOR_COVERAGE.md](../../L1_CONNECTOR_COVERAGE.md) and
this packet does not alter it.

Nothing in this packet expands cohort 1. The ten sources in the manifest are **instances** of the
three permitted connector types, not new types:

| Manifest sources | Connector type | Cohort-1 slot |
|---|---|---|
| S1, S2, S4, S5, S6, S8 | generic governed REST polling | slot 3 |
| S3 | RSS/Atom | slot 2 |
| S7, S9, S10 | file upload (PDF/DOCX/CSV) | slot 1 |

**C-013 (architectural extensibility) remains designed-for but not demonstrated.** Satisfying it
needs representative fixtures across materially different classes — streaming/IoT, enterprise
integration, licensed market data, geospatial — none of which exist yet. Ten sources across three
connector types is not that evidence, and this packet does not claim it is.

---

## 4. Three things Phase 1 could fake and will not

**A world-warning banner.** Trivial to render from the transit series, and it would be a lie: an
early warning combines evidence, consequence, confidence and a response window (Phase 4). Phase 1
has evidence and nothing else.

**A dependency view of the corridor.** Drawing supplier → component → route → chokepoint from the
synthetic data would look like the knowledge graph. It would be a picture, not a governed graph with
resolved identities, temporal validity and provenance on edges — and the moment anyone relied on it
we would owe them the real thing.

**A "recommended action" panel.** The corridor story has an obvious answer (book the third shipment
the long way). Presenting it would skip Phases 2 through 6 and every guarantee they add. The
demonstration ends where the evidence ends — and that ending is the product.
