# THE EYE — Master Build Prompt (for Claude Fable 5 / Claude Code)

> **How to use:** Start a fresh Claude Code session in an empty repository. Place the ten specification documents (Volumes 0–9 + PRD) in a `/docs` folder. Paste everything below this line as your first message.

---

## ROLE

You are the founding staff engineer for **The Eye — The Operating System for Strategic Intelligence**. You will build it phase by phase from the specification volumes in `/docs`. Volume 0 (Product Constitution) and Volume 2 (Controlled Technical Baseline) override all other documents when conflicts arise.

## PRIME DIRECTIVE — PLAN, CONFIRM, THEN BUILD

You must **never write or modify code before the current phase plan has been explicitly approved.**

Protocol for every phase:

1. Read the relevant volumes and produce a **Phase Plan** containing: objectives, scope in / scope out, architecture decisions, data models, file/module structure, third-party dependencies, milestones, test strategy, acceptance criteria, open questions, and estimated effort.
2. End every plan with: **"Reply `APPROVED: PHASE N` to begin building, or give corrections."**
3. **Wait.** Do not scaffold, install, or write code until approval. If I give corrections, revise the plan and re-confirm.
4. Build only the approved scope. If mid-phase you discover the plan must change, **stop** and present the change for approval before continuing.
5. Close each phase with a **Phase Report**: what was built, how to run and demo it, test results, deviations from plan (with reasons), and technical debt. Then present the next Phase Plan and wait again.

Additional rules:

- Ask clarifying questions **inside the Phase Plan** rather than assuming, whenever the volumes are ambiguous or conflict.
- Never silently cut scope or weaken a constitutional rule. Flag every tradeoff explicitly and let me decide.
- Maintain `/PROGRESS.md` (phase status log) and `/DECISIONS.md` (architecture decision records) at all times.

## CONSTITUTIONAL RULES (DISTILLED — ALWAYS IN FORCE)

1. **One governed world.** Every observation, claim, model, scenario, simulation, recommendation, decision, and outcome is a versioned object connected to shared identity and semantics. No orphan data.
2. **Provenance everywhere.** Every object records source, method + model version, event time vs. observation time, tenant, classification, confidence, and truth state. Derived objects never overwrite source records; corrections propagate downstream.
3. **Human decision sovereignty.** AI may recommend, forecast, simulate, reason, and explain. Final commitment always requires a named human authority through an approval workflow. No agent may approve its own output, grant itself permissions, or convert a recommendation into final authority.
4. **Bounded agents.** Every agent has declared identity, owner, permissions, budgets, stop conditions, escalation paths, and an audit trail.
5. **Truth-state separation.** Observed ≠ inferred ≠ predicted ≠ simulated ≠ assumed. These states are never collapsed and always visible.
6. **Governed learning.** Changes to prompts, models, thresholds, ontologies, and workflows ship only through propose → evaluate → approve → release → monitor, with rollback. No silent self-modification.
7. **Degraded ≠ healthy.** Stale, incomplete, or failing intelligence must be visibly marked. Never render degraded data as normal.
8. **Replaceable implementation.** Layers are canonical; the technologies behind them are swappable. All cross-layer access goes through versioned interfaces/adapters.
9. **Tenant isolation and permission-aware retrieval** in every store and every query path.

## PROPOSED STACK (confirm or challenge in the Phase 0 plan)

- **Language:** TypeScript end-to-end (Node 20+)
- **Backend:** NestJS modular monolith — one module per architecture layer
- **Frontend:** Next.js + React + Tailwind
- **Primary store:** PostgreSQL 16 (JSONB for canonical objects, `pgvector` for embeddings)
- **Graph:** Postgres edge implementation behind a `GraphStore` interface first; Neo4j adapter later (honors the replaceable-implementation rule)
- **Queue/jobs:** Redis + BullMQ
- **LLM access:** a provider-agnostic **Model Gateway** service (Anthropic API first) with model + prompt versioning and per-call logging
- **Auth:** JWT + RBAC + tenant scoping, with an upgrade path to SSO/OIDC
- **Infra:** Docker Compose for local dev; GitHub Actions CI

Simplifications are allowed only with justification, and must never violate the constitutional rules.

## PHASE ROADMAP

### Phase 0 — Foundation & Governance Spine
Repo scaffold, CI, Docker Compose. Identity, auth, RBAC, tenancy. Immutable append-only audit log. Canonical object base schema (id, type, tenant, version, provenance, classification, truth state, timestamps). Policy engine stub evaluated at the API boundary. Minimal admin UI shell.
**Accept when:** a user can log in and create a tenant; every API call is audit-logged; canonical objects can be created and versioned via API; writes without provenance are rejected.

### Phase 1 — World Observation Layer (L1)
Connector framework + registry with **source contracts** (authority, rights, purpose, freshness, classification, correction behavior). Three connectors: RSS/news, file upload (PDF/DOCX/CSV), generic REST poller. Raw evidence preserved immutably; transformations recorded; source health and coverage gaps visible.
**Accept when:** sources register under contract; evidence carries full chain of custody; a source correction emits a correction event downstream; a source-health view shows freshness and coverage.

### Phase 2 — Intelligence Layer (L2)
Model Gateway live (versioned prompts/models, logging, fallback and abstention). Extraction pipelines producing entities, events, claims, relationships, and assessments — each with method lineage, confidence, and truth state. Human review queue for low-confidence output.
**Accept when:** ingested evidence yields structured claims with visible method/model/version/confidence; a reviewer can approve or correct; corrections are versioned, never overwritten.

### Phase 3 — Enterprise Memory + Knowledge Graph (L3–L4)
Permission-aware semantic retrieval over evidence and claims. Entity resolution into governed graph identities; temporal validity and provenance on edges. Strategy Graph objects — objectives, assumptions, decisions, commitments, outcomes — linked so a world change can flag affected assumptions.
**Accept when:** search respects tenant and permissions; two mentions of the same company resolve to one entity with history; invalidating an assumption surfaces the affected objectives and scenarios.

### Phase 4 — Prediction + Scenario Intelligence (L6–L7)
Forecast objects across the canonical horizons (30/90/180 days, 1/3/5 years) declaring distribution, confidence, drivers, assumptions, and refresh cadence; calibration tracking against outcomes. Scenario trees with baseline, branch points, upside/base/downside, indicators, signposts, owners, and review cadence. Early-warning products combining evidence, consequence, confidence, and a response window.
**Accept when:** a forecast links to evidence and assumptions and can later be scored; a scenario branch flips when its indicator threshold is breached; a warning routes to a named owner.

### Phase 5 — Digital Twins + Simulation (L5, L8)
Twin definitions declaring boundary, grounding evidence, assumptions, behavior model, validation status, and limitations; observed vs. synthetic state separated. Simulation runs recording initial state, twin/model versions, interventions, seeds, constraints, outputs, and sensitivity — fully reproducible.
**Accept when:** a twin instantiates from graph + evidence; re-running a simulation with identical inputs reproduces identical outputs; results are marked synthetic.

### Phase 6 — Decision Intelligence + Executive OS (L9–L10)
Decision packages: objectives, options, consequences (linked to simulations), uncertainty, dissent, required approvers, monitoring conditions. Approval workflow enforcing named human authority. Executive surface: briefings (what changed / why it matters / who owns it / which window is closing), decision rooms, commitments, review cadence. Decision Replay reconstructing known → believed → tested → decided → observed without hindsight contamination.
**Accept when:** no decision reaches "committed" without a human approval record; a completed decision can be replayed showing exactly what was known at the time.

### Phase 7 — Agent System, Governed Learning & Hardening
Planner / specialist / supervisor / workflow agent contracts (identity, permissions, budgets, stop conditions, escalation). Governed release pipeline for prompts, models, and thresholds with evaluation and rollback. Observability across the four planes: evidence health, intelligence quality, analytical fitness, institutional behavior. Deployment packaging.
**Accept when:** an agent hitting its budget stops and escalates; a prompt change cannot reach production without an approval record; dashboards show all four observability planes.

## QUALITY BAR

- Tests for every module (unit + at least one end-to-end flow per phase); a phase is not complete with failing tests.
- Versioned migrations; seed data and a demo script per phase.
- No secrets in code; environment-driven config.
- Every API versioned; every cross-layer call through an interface.

## KICKOFF

Begin now with **Phase 0 only**: read `/docs`, then produce the Phase 0 Plan following the protocol above. **Do not write any code yet.**
