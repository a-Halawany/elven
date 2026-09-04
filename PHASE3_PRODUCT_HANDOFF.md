# THE EYE — Phase 3 Product Handoff

> **Enterprise Memory + Knowledge Graph (L3–L4).** What a person can now do that they could not
> before Phase 3, how to run it, and what is honestly not finished.
>
> This is a product handoff, not a claim of independent code review. Report:
> [PHASE3_REPORT.md](PHASE3_REPORT.md). Plan and frozen criteria:
> [PHASE3_BUILD_PLAN.md](PHASE3_BUILD_PLAN.md).

---

## 1. What an operator can now do, end to end

**As an analyst**

* **Search** evidence, claims and entities in one place — and see, on every hit, **why it matched**.
  A result outside your tenant or domain is absent, not redacted, and the response is identical in
  shape to one where nothing matched.
* **Open an entity** and read its whole history: every mention that resolved to it, from which
  evidence, at what score, by which rule, and whether a person or an authoritative identifier
  decided it. Superseded and rejected resolutions are shown with the live ones.
* **Ask a known-at question of an entity** — "what did this hold on 14 January?" — answered from
  when each resolution was accepted and when it stopped being the answer.
* **Explore the graph** with both instants on screen: *known at* (what we believed) and *valid at*
  (what held). Walk a neighbourhood, find a path, or look at the whole graph as it stood.

**As a reviewer**

* Work a **resolution queue** of everything the resolver was not permitted to decide, seeing what
  matched, by how much, every candidate considered, and — for a model-ranked proposal — the mode,
  model, weights digest, runtime, prompt and decoding digests and confidence.
* **Accept, reject, or redirect.** Redirecting resolves the mention to an entity the resolver never
  proposed; the record then says a person chose it, keeps the reason, and preserves the resolver's
  original proposal beside it.
* **Split** a wrongly merged entity. Nothing is deleted: the prior resolutions are superseded with
  their method and score intact, and a known-at query before the split still reproduces the merged
  view.

**As an operator**

* Declare **objectives, assumptions, decisions, commitments and outcomes**, each of which must name
  what it rests on with a rationale — the form will not submit without it.
* Run **Impact**: preview what a correction would touch before committing, then propagate. Every
  dependent assumption is marked *unverified*; the objectives, decisions and commitments above them
  are **listed for a person** and left exactly as they were.

## 2. The exact reproducible run

Nothing below needs a credential, a paid service, a hosted model or a network fetch beyond the
frozen replay sets already in the repository.

```bash
./scripts/demo.sh                        # postgres+redis, build, migrate, bootstrap, API, web
node scripts/phase1/seed-demo.mjs        # act I   — evidence, custody, corrections
node scripts/phase2/seed-extraction.mjs  # act II  — evidence becomes claims
node scripts/phase3/seed-graph.mjs       # act III — claims become a governed memory
```

Act III exits non-zero if any step it checks fails. On the measured run it reported **0 problems**.

The web shell is at `http://localhost:3000`; the Graph workspace is at `/graph`. Sign in as one of
the operators act III creates — `s.larsen` (resolution manager), `k.adeyemi` (resolution agent) or
`j.weber` (strategy owner) — with the operator password in the 0600 `.eye-local/env` handoff file.
The rail carries Overview, Search, Entities, Resolutions, Explore, Strategy and Impact.

## 3. What the demonstration shows

| Act III step | What it proves |
|---|---|
| 39 mentions resolved automatically, 9 sent to a person | Only an exact match on an authoritative external identifier resolves itself. Everything else waits. |
| The resolution agent is refused the decision | The policy bundle grants the deciding action to no agent role, and the database independently refuses a decider who proposed the row. |
| 1 of 9 redirected | `"Suez"` in a shipping manifest is `"Suez Canal"` in the publisher's rows. No string comparison joins those; a person did, and the record says so. |
| 5 edges, 5 entities within 4 hops of the corridor | Suez Canal → MV Hanse Trader → SYN-SHIP-4468 → SYN-PART-PWR → NORDWERK ANTRIEBSTECHNIK GmbH, every edge naming the claim and evidence digest it rests on. |
| 0 edges visible at 1 January 2024 | An as-of query returns the graph **as it stood**, not as we later learned it was. |
| 1 assumption unverified, 1 objective and 1 commitment reported | The correction reached what rested on it, marked only what it has standing to mark, and reported the rest. |
| The correction case's sentence changed | *"downstream consumers not yet present"* is retired for the case that was actually walked — and only for that case. |

## 4. The eight resolver rules as delivered

The owner's rules are enforced by database constraints and port refusals, so a resolver bug can
produce a wrong proposal but not a wrong acceptance. §2 of the report maps each rule to the exact
constraint, port and policy rule that enforces it, including the one deliberate carve-out (a
`human` split resolution) and why it is not a loophole.

## 5. What is not finished

**Real capability gaps**

* An ambiguous proposal with no gateway configured names the lowest-ordered candidate purely to
  have a target. It says so in its evidence and carries every candidate, but a reader who ignores
  the note could mistake it for a preference.
* A rejected proposal can leave behind the candidate entity it was proposed against. It is visible
  (mention count zero) and reversible; nothing yet retires it.
* Edge building matches ends by normalised mention text. A relationship claim whose spelling
  matches no resolved mention is skipped with a named reason rather than guessed at — correct, and
  it means resolution must run first.
* The model-assisted tail is implemented, lineage-enforced and unit-proven, but the corridor
  demonstration runs deterministic-only because no method is pinned to ranking. That is the posture
  the plan recommended.
* The graph screens were verified by their build and by the API they call, not by signing in — the
  implementer does not enter credentials into forms. An operator following §2 sees them directly.

**Deliberately out of scope**

Forecasts and calibration (Phase 4) · twins and simulation (Phase 5) · decision packages and
Decision Replay (Phase 6) · planner/supervisor agents and the governed release pipeline (Phase 7) ·
any new source, connector, credential or paid service.

## 6. Credentials and services

**None added.** Phase 3 registers no source, requests no key, reaches no hosted endpoint, and
touches nothing outside the frozen replay sets. The UN Comtrade free-tier key remains in secret
storage, unused and untouched, exactly as Phases 1 and 2 left it.

## 7. Migration 0024 — upgrade evidence

The existing post-C18 check now covers `0022`, `0023` and `0024` — one script, one purpose, **not a
second gate**. On the measured run: 1020 pre-existing rows unchanged across 29 governed tables;
`identity.roles` +7, `objects.schema_registry` +13, `public.schema_migrations` +3, exactly as
declared; the upgraded schema digest identical to a virgin full-set database
(`69a4c8530e4d4ea1…`); Phase 0 authority behaviour 297/297 before and after; later-phase suites on
the upgraded data 239/239. C18 stays frozen at `0021` and its pinned integration count is still
**297**.
