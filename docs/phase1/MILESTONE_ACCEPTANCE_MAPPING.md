# Phase 1 — Milestone & Acceptance Mapping

> Maps product deliverables onto the **existing** P1-M1…M7 milestones and the **existing** A1–A13
> acceptance matrix from PHASE1_PLAN.md Revision 5. **No new milestone, no new acceptance criterion,
> no second matrix.** Revision 5's criteria and its F01–F46 fault-injection list remain the maximum
> Phase 1 gate.

---

## 1. Time budget

**Target 3–4 weeks.** Product-building time and verification time are tracked separately, because
conflating them is how a phase silently becomes a test project.

| | Build | Verify | Total |
|---|---|---|---|
| P1-M1 | 2.5 d | 1.0 d | 3.5 d |
| P1-M2 | 3.0 d | 1.5 d | 4.5 d |
| P1-M3 | 4.0 d | 2.0 d | 6.0 d |
| P1-M4 | 2.5 d | 1.5 d | 4.0 d |
| P1-M5 | 1.5 d | 1.0 d | 2.5 d |
| P1-M6 | 4.0 d | 1.5 d | 5.5 d |
| P1-M7 | 0.5 d | 3.5 d | 4.0 d |
| **Total** | **18.0 d** | **12.0 d** | **30.0 d ≈ 4.0 weeks** |

Build 60 % / verify 40 %. If the phase threatens four weeks, **defer optional functionality** (§4) —
never add gates and never trim the acceptance matrix.

---

## 2. Milestones

### P1-M1 — Registry, contracts, policy · 3.5 d

| | |
|---|---|
| **Product output** | Migration 0013 (observation event tables, projections, RLS under capability ports); SRC schema + registry; §7 contract enforcement; `collection_manager` role; `observation.*` policy rules |
| **Demonstration** | Register a source through the API under a full §7 contract; a second operator approves it; each fail-closed case denies scheduling |
| **Dependencies** | Phase 0 commit pipeline, policy engine, audit |
| **Owner decisions** | D1 (authority taxonomy), D2 (rights-state gate) |
| **Acceptance** | **A1** contract field set, registrar ≠ approver, 3-point revalidation, every fail-closed case · **A3** four-time conformance · **A11** projections rebuild byte-equal |

### P1-M2 — Evidence vault, quarantine, upload connector · 4.5 d

| | |
|---|---|
| **Product output** | Tenant-scoped vault (dual volumes, opaque locators, create-if-absent, digest verify pre/post/on-read); quarantine lifecycle; **file-upload connector (PDF/DOCX/CSV)**; §8.2 content controls; **replay fixture capture + manifest** |
| **Demonstration** | Upload the synthetic BOM pack — three admit with full custody, two quarantine (`DEF-02` traversal, `DEF-07` type mismatch); download is attachment-only and audited before bytes move |
| **Dependencies** | M1 |
| **Owner decisions** | D3 (replay window — recommended locked), D4 (planted defect set) |
| **Acceptance** | **A2** chain of custody, byte-identical retrieval, POL/AUD before retrieval · **A7** missing/corrupt blob fail closed, quarantine/admitted separation · **A5** isolation negatives incl. blob retrieval and existence/timing disclosure |

### P1-M3 — Adapter SDK, RSS, REST poller, scheduling, agents · 6.0 d

| | |
|---|---|
| **Product output** | Connector adapter SDK; **RSS/Atom** connector (§10.1 framing, §8.3 parser isolation); **generic governed REST poller**; §8.1 network hardening incl. complete-origin credential stripping; BullMQ Job Schedulers with the 60 s floor; agent contracts (§11) |
| **Demonstration** | The EU sanctions RSS feed and the PortWatch REST endpoint both collect on schedule under contract, as version-pinned agent principals with code digests recorded |
| **Dependencies** | M2 |
| **Owner decisions** | D5 (GDELT overlay), D6 (Comtrade as replay) |
| **Acceptance** | **A4** no external I/O in transactions; **F01–F46** fault injection at every numbered step and durable sub-boundary; orphan sweeper recovery; replay-vs-new-observation distinction · **A9** per-run reauthorization, revocation while queued, budget breach, instance/code-digest mismatch, queue-replay rejection · **A10** SSRF corpus, hostile XML within budgets, complete-origin credential stripping, secret/URL-query redaction |

### P1-M4 — Coverage model and source health · 4.0 d

| | |
|---|---|
| **Product output** | `coverage_measurements` (all nine dimensions, five states); health events + projection; `SourceHealthChanged`; sweeper/reconciliation (§5.11) |
| **Demonstration** | PortWatch shows degraded freshness *distinguished from* a collection failure; the two-day gap (`DEF-08`) reports `insufficient_evidence`, never healthy; the health timeline replays identically from stored events |
| **Dependencies** | M3 |
| **Owner decisions** | D7 (freshness thresholds), D8 (coverage universe versioning) |
| **Acceptance** | **A6** every dimension with stored `evaluated_at`/window/denominator/universe-version/calc-version/evidence refs; `unknown`/`not_applicable`(+approved reason)/`insufficient_evidence`; unknown never healthy; deterministic replay |

### P1-M5 — Correction and withdrawal intake · 2.5 d

| | |
|---|---|
| **Product output** | Correction cases; `CorrectionReceived` with explicit `propagation_scope`; supersession preserving prior versions |
| **Demonstration** | The sanctions republication (`DEF-05`) opens a case, supersedes v2 with v3, states unresolved propagation honestly; a known-at query reproduces the pre-correction state; a spoofed correction is rejected; `DEF-09` exercises withdrawal |
| **Dependencies** | M4 |
| **Owner decisions** | D9 (correction detection = digest comparison) |
| **Acceptance** | **A8** correction, withdrawal, supersession, historical preservation, spoofed-correction rejection, propagation-failure handling |

### P1-M6 — Observation Operations UI + Playwright · 5.5 d

| | |
|---|---|
| **Product output** | WS-02: Overview, Source Registry + 4-step registration, approval, evidence browser + custody + safe download, health, quarantine queue, corrections. Responsive, accessible, RTL-ready, **no optimistic governed actions** |
| **Demonstration** | The full end-to-end journey of §3 below, driven in a browser |
| **Dependencies** | M1–M5 |
| **Owner decisions** | D10 (visual direction), D11 (RTL readiness vs. localisation) |
| **Acceptance** | **A12** Playwright journeys incl. accessibility (keyboard, landmarks, labels), attachment-only downloads, non-disclosure on denied views; Phase 0's 10 Playwright scenarios stay green |

### P1-M7 — Acceptance, hostile corpus, regression, report · 4.0 d

| | |
|---|---|
| **Product output** | §13 acceptance extension incl. the F01–F46 table; malicious-input corpus; full Phase 0 regression; Phase 1 Report |
| **Demonstration** | The complete demonstration script, end to end, network disconnected |
| **Dependencies** | M1–M6 |
| **Owner decisions** | none |
| **Acceptance** | **A13** all Phase 0 suites green, no constitutional invariant weakened · re-run of A1–A12 |

---

## 3. The frozen end-to-end demonstration

Exactly as specified, and the acceptance evidence for A12:

```
register a source → approve it (second operator) → collect evidence →
inspect original bytes and chain of custody → view health, freshness and coverage →
inspect quarantine → submit a correction or withdrawal
```

Each arrow is a Playwright step. The journey runs against the frozen replay set with no network.

---

## 4. Deferral order if four weeks is threatened

Deferred **before** anything else is touched — never a gate, never an acceptance criterion:

1. GDELT live overlay (S8) — the deterministic path does not use it.
2. Live overlay entirely — replay is the demonstration.
3. World Bank connector (S6) — structural context, not corridor signal.
4. ECB connector (S5) — same.
5. `S2-replay` port-level context — the chokepoint series carries the story.

Cohort 1 stays three connector *types* regardless; deferral removes source instances, never
connector kinds, and never a §13 criterion.

---

## 5. Owner decisions

Each has a recommendation; silence means the recommendation stands.

| # | Decision | Recommendation |
|---|---|---|
| D1 | Authority taxonomy | Two classes: `authoritative` / `observational`. A third ("semi-") invites argument at registration and would be interpreted differently by each operator. |
| D2 | Block activation on unconfirmed rights? | **Yes.** Contract stays `draft` until the exact reuse notice is read. Replay is unaffected, so this costs nothing and prevents a rights claim we cannot support. |
| D3 | Replay window | **2024-01-12 → 2024-01-15.** Verified sharpest inflection: 55 → 27 transits, 60 % capacity fall, visible Cape reroute. |
| D4 | Planted defect set | The ten in the replay manifest — each maps to a §8.2/§7 control that would otherwise be asserted rather than shown. |
| D5 | GDELT overlay | **Include, marked observational.** It demonstrates holding a low-authority source without contaminating the record. |
| D6 | UN Comtrade | **Replay upload, no key.** Annual data; a live poller would add the system's only credential for no demonstrated gain. |
| D7 | Freshness thresholds | Per contract, from observed cadence: PortWatch 3 d, sanctions RSS 30 d, ECB 3 d, World Bank 90 d. Publisher lag reported distinctly from collection failure. |
| D8 | Coverage universe versioning | Version per source contract; a changed denominator definition is a new version, never a silent recalculation. |
| D9 | Correction detection | Digest comparison against the prior admitted EVD for the same contract key → supersession. Recorded as a limitation where the publisher has no corrections channel. |
| D10 | Visual direction | Calm dark-capable neutral ground, one accent for interaction, semantic colour reserved for state. Motion only on state change. |
| D11 | RTL | **Readiness only** — layout mirrors and does not break. No localisation claimed in Phase 1. |

---

## 6. Backlog routing

New ordinary findings during Phase 1 go to the **post-phase backlog**, not into this phase's gate,
unless they demonstrate a present constitutional violation. Already routed there from Phase 0:
permission-parser hardening beyond the exact `contents: read` map, and further reconciliation cases
in the patched-image recheck.
