# THE EYE — Phase 1 Product Handoff

> **Candidate frozen at `84be53004c870e2748459ca83e07c2632b3d186a`.** Phase 0 is closed at
> [`phase0-v1.0.0`](https://github.com/a-Halawany/elven/releases/tag/phase0-v1.0.0) (target `a792cd9a`)
> and is not reopened by anything here. PR [#28](https://github.com/a-Halawany/elven/pull/28) stays
> open and unchanged; this document is prepared alongside it, not inside it.
>
> This is a **product** handoff. What an operator can do, what the demonstration shows, what is
> real, and what is not finished.

---

## 1. What is in the candidate

| | |
|---|---|
| Base (`main`) | `12f6e80737362dd32bbbcfa16e4d48db8b08a892` |
| Candidate | `84be53004c870e2748459ca83e07c2632b3d186a` |
| Diff | **104 files, +21,767 / −22** |

**Thirteen commits**, newest first:

```
84be530  Phase 1 report: record the repair, the manifest split, and the 0022 upgrade proof
2d329b9  Phase 1: leave C18 literally untouched — scope the manifest in the package scripts
462995e  Phase 1: keep C18 frozen at 0021, and give migration 0022 its own upgrade proof
d4b7800  Merge remote-tracking branch 'origin/main' into phase1-implementation
e9465e7  Phase 1 repair: the coverage/ ignore rule swallowed two source files
a94ca70  Phase 1 report: state where the demonstration's numbers come from
a68fcc8  Phase 1 closure: the A8 acceptance block, the report, and the exceptions opened
338d244  Phase 1 P1-M7: the acceptance matrix — A1–A11 and the F01–F46 fault injection
0ec37f0  Phase 1 A12: browser acceptance for the operator journey
42fff51  Phase 1 P1-M6: the Observation Operations interface
138bd13  Phase 1 P1-M5: quarantine review, corrections, withdrawal, sweeper
0175f0f  Phase 1 P1-M3/M4: connectors, agents, scheduling, coverage and health
37d415a  Phase 1 P1-M1/M2: observation schema, evidence vault, cohort-1 connectors
```

**Where the lines went** — two thirds of the change is product, not tests:

| Area | Lines |
|---|---|
| API source (`apps/api/src/observation/**`) | 8,782 |
| Tests (integration, fault injection, hostile input, browser) | 2,994 |
| Web UI (`apps/web/**`) | 2,889 |
| Migration `0022` | 2,346 |
| Scripts (fixtures, contracts, demo seed, upgrade check) | 2,311 |
| Replay fixtures | 2,114 |
| Docs | 209 |

## 2. What an operator can now do, end to end

Every one of these is reachable in the shipped UI and over the API, and every one produces a
receipt carrying its policy-decision id and audit sequence.

1. **Register a source under contract** — the full §7 field set through a four-step form: identity
   and publisher, authority and rights, security and operations, lifecycle. Nine refusal cases are
   enforced, each naming its reason rather than failing generically.
2. **Have a *different* person approve it.** The registrar cannot approve their own registration —
   that is a database constraint, not a disabled button.
3. **Activate it**, unless its rights are unconfirmed and the mode is live.
4. **Provision a collection agent** bound to a connector version and code digest, owned by a named
   human, revocable, budgeted.
5. **Collect** — on a schedule (60-second floor) or on demand.
6. **Watch bad input be refused**: type mismatch, archive path traversal, schema drift, oversize,
   hostile XML. Refusals land in quarantine with the reason.
7. **Review quarantine** — release or discard, with a written reason, as a second operator. An
   operator without `collection_manager` is refused; a review without an adequate reason is refused.
8. **Inspect evidence**: the custody chain, the four times, the four authenticity concepts kept
   separate, and a safe attachment-only retrieval that re-verifies the digest and is itself audited.
9. **Evaluate coverage and health** across nine dimensions, with `unknown` shown as a state rather
   than hidden, and publisher lag distinguished from collection failure.
10. **Replay the health timeline** deterministically from stored events.
11. **Receive a publisher correction**, apply it as a new version that supersedes without
    overwriting, and see stated in words what it did *not* resolve.
12. **Withdraw** an object — the truth state says `withdrawn`, not only the lifecycle.
13. **Run a known-at query** that reproduces what was known before a correction, without hindsight.
14. **Verify projections** rebuild from the event log with no drift.
15. **Sweep** for orphaned blobs and unreconciled runs.

## 3. The 72-Hour Corridor Decision — exact reproducible run

```bash
./scripts/demo.sh
```

Compose up (digest-pinned postgres/redis) → build → migrate → audited bootstrap → API on `:3401`,
shell on `:3000`. Then:

```bash
node scripts/phase1/seed-demo.mjs
```

The seed drives the **real HTTP API with real governed envelopes**. There is no back door: every
step is a request an operator could make, which is why a green run is itself evidence the journey
works. From a cold environment it ends at:

```
sources 10 · active 10 · draft 0 · unconfirmed rights 3
evidence objects 105 · open quarantine 1 · open corrections 0
replay share: 100% by object · 100% by bytes
```

Sign in at `http://localhost:3000` as **m.dvorak** (collection manager) or **a.hoffmann**
(observation operator) and walk the story: register → have the second operator approve and activate
→ collect → inspect custody and the four times → release the quarantined drift row with a reason →
evaluate coverage and read the gap it refuses to average away → correct a row and watch the prior
version stay retrievable → run a known-at query.

> Registration is idempotent; **collection is deliberately not**. The attempt key is scoped to the
> run, so re-collecting unchanged bytes later is a new observation, not a replay, and the counts
> grow. Only an exact replay within a run no-ops, and that no-op is audited.

## 4. The running product

The built shell serving at `http://localhost:3000` — the real application, not a mock:

**The Eye — Platform Administration.** Username / password / Sign in, on the Volume 9 token-driven
dark surface, semantic CSS variables, logical properties throughout so the shell mirrors under RTL.

**Live walkthrough, from the product's own responses.** The following is the seed driving the real
API — not test output:

```
3. source registration (as a.hoffmann)     ✓ 10 sources registered and active
7. collection agents                        instance- and version-specific, owned, revocable
8. collection
   ✓ imf-portwatch-chokepoints              admitted 63 · quarantined 1 · no-op 0
   ✓ eu-sanctions-rss                       admitted  3 · quarantined 0
   ✓ nordwerk-internal (4 files)            admitted  2 · quarantined 2
   ✓ imf-portwatch-ports                    admitted 22 · quarantined 0
9. coverage and health
   ✓ imf-portwatch-chokepoints  health degraded (publisher_lag)
       3 of 63 expected series-intervals carry no admitted evidence
   ✓ imf-portwatch-ports        health healthy (none)
   ✓ eu-sanctions-rss           health unknown (unknown)
       expected_coverage, actual_coverage, completeness could not be measured
10. evidence custody
   ✓ EVD 01a068a0… — the 2024-01-14 chokepoint row
       custody entries: 2
       four times: event 2024-01-14T00:00:00Z · observation … · record …
       authenticity: transport not_applicable · bytes verified · origin not_applicable · CONTENT unknown
       download: 392 B · attachment · integrity verified
11. quarantine review
   · type_mismatch: declared .csv but the bytes are a ZIP archive
   · path_traversal: archive entry escapes the extraction root ("../../etc/passwd")
   · schema_drift: required field `attributes.n_total` absent (contract tolerance 0)
   ✓ review without an adequate reason refused (400)
   ✓ review refused to an operator without collection_manager (403)
   ✓ discard the path-traversal archive
   ✓ release the schema-drift row after review
12. correction and withdrawal
   ✓ publisher republication received
   ✓ a correction naming evidence of no known source was rejected
   ✓ correction applied
13. projection rebuild        live 10 · rebuilt 10 · mismatched 0  (5 projections)
14. health replay             deterministic=true on 3 sources
15. sweeper                   orphan candidates 0 · tombstones completed 1
```

**Why there are no screenshots of the signed-in views here.** Producing them would mean typing an
operator password into a form, and credentials are not handled that way in this project — every
authenticated command reaches its target through the environment only. The two commands above put
the same screens in front of you in about a minute; `docs/phase1/UX_SCREEN_MAP.md` describes each
one, and the browser suite exercises all sixteen journeys headlessly.

## 5. The observation architecture delivered

| Capability | What is real |
|---|---|
| **Sources & contracts** | Event-sourced contract registry with a current projection; full §7 field set; registrar ≠ approver as a table constraint; three revalidation points, the last a transactionally protected re-read under `FOR SHARE` immediately before admission; nine fail-closed refusals. |
| **Agents** | Instance- and version-specific principals bound to a code digest and an accountable human owner; per-run reauthorization; revocable while queued; budgets that stop and escalate; instance- and digest-mismatch refusals. |
| **Scheduler** | BullMQ job schedulers with a 60-second floor, synced from the contract; checkpoints per source. |
| **Acquisition** | The §5 twelve-step lifecycle. **No external I/O inside any database transaction** — asserted structurally, not by review. Attempt idempotency is separate from evidence identity: a content digest is the identity of BYTES, never of an observation. |
| **Evidence custody** | Two non-nested vault roots verified at construction; opaque `<tenant>/<domain>/<uuid>` locators — never the digest, so the store is not an existence oracle; digest verified pre-store, post-store and on every read; retrieval resolves through the manifest only and writes its own custody entry. |
| **Coverage & health** | Nine dimensions with stored `evaluated_at`, window, denominator, universe version, calculation version and evidence refs; `measured / unknown / indeterminate / not_applicable / insufficient_evidence`; **`unknown` is never healthy**; publisher lag ≠ collection failure; deterministic replay from stored events. |
| **Quarantine** | Heuristic structural refusal, isolated volume, two-operator release with a written reason, discard with tombstone. |
| **Corrections** | Correction, withdrawal and supersession that never overwrite; spoofed claims resolved against what the domain actually holds and refused in the same words whether foreign or non-existent; propagation scope stated in words. |
| **Operator UI** | Sources (register → approve → activate), evidence browser with custody, quarantine queue, corrections, overview. Receipts only from authoritative responses; state never carried by colour alone; keyboard-operable; RTL-mirrored; attachment-only downloads. |
| **Isolation** | Scope triple NOT NULL and CHECK-constrained on every table; `FORCE ROW LEVEL SECURITY` throughout; PLATFORM authority deliberately cannot read observation state. |

## 6. The ten connectors — what is replay-backed, live-ready, or blocked

**All ten are `acquisition_mode: replay` today.** Nothing has been collected from a live third-party
endpoint in this phase.

| # | Source | Kind | Rights | Live-ready? |
|---|---|---|---|---|
| 1 | `eu-sanctions-rss` | RSS | confirmed (Decision 2011/833/EU) | **Yes** — anonymous HTTPS, no credential |
| 2 | `eu-sanctions-payload` | REST | confirmed (Decision 2011/833/EU) | **Yes** — anonymous HTTPS |
| 3 | `worldbank-indicators` | REST | confirmed (CC-BY-4.0) | **Yes** — anonymous HTTPS |
| 4 | `gdelt-discovery` | REST | confirmed (GDELT terms) | **Yes** — anonymous HTTPS |
| 5 | `imf-portwatch-chokepoints` | REST | **pending — UNVERIFIED** | Blocked on rights, not on technology |
| 6 | `imf-portwatch-ports` | REST | **pending — UNVERIFIED** | Blocked on rights |
| 7 | `ecb-eurusd` | REST | **pending — UNVERIFIED** | Blocked on rights |
| 8 | `un-comtrade-upload` | upload | confirmed (manual export) | Manual today; a live REST connector needs the free-tier key — see §7 |
| 9 | `nordwerk-internal` | upload | confirmed (internal) | Manual by design — synthetic manufacturer |
| 10 | `carrier-advisories` | upload | confirmed (internal) | Manual by design |

**Summary:** 4 ready for live acquisition with no credential and no licensing decision · 3 blocked
solely on unverified reuse terms · 1 credential-gated · 2 manual by design. Activating any live
source is a deliberate contract change plus a rights decision, not a code change.

## 7. UN Comtrade credential — recorded, not used

**A UN Comtrade free-tier API key already exists in secret storage.** It is recorded here as a
fact, and nothing more: it is **not displayed, copied, logged, committed, or read** by this
handoff, and **no code path uses it**. `un-comtrade-upload` is an operator-upload source with
`credential_ref: null` and `authentication_method: "none — no automated access"`.

Using it requires an explicit live-connector activation decision. Until that decision, the key
stays where it is and the source stays on replay evidence.

## 8. Migration 0022 — upgrade evidence

One migration, 2,346 lines: the observation registry, acquisition attempts, blob manifests and
tombstones, custody, quarantine, coverage/health, corrections, checkpoints — every table under
`FORCE ROW LEVEL SECURITY` behind SECURITY DEFINER ports that assert the caller's own action.

**Upgrade compatibility: PASS**, on the tracked migration runner
(`scripts/phase1/verify-0022-upgrade.mjs`, blocking in CI):

* a 0021 database given representative Phase 0 data and authorities through the real ports;
* 0022 applied; **all 1,020 pre-existing rows across 29 tables survive unchanged**;
* additions exactly as declared — `identity.roles` +2, `objects.schema_registry` +3,
  `public.schema_migrations` +1; anything else in either direction fails;
* Phase 0 authority behaviour re-proven after the upgrade;
* upgraded schema digest — columns, constraints, indexes, routines, policies, RLS flags, grants —
  **identical to a virgin 0001–0022 database**;
* the Phase 1 suites pass against the **upgraded** data, not only a virgin one.

## 9. Known limitations, and separately, optional improvements

### Not finished — real capability gaps

1. **Cohort 1 only.** 1 of 20 constitutional source classes substantially covered, 4 partially, 15
   not implemented. **C-013 architectural extensibility is designed for but not demonstrated** —
   that needs representative fixtures across materially different classes (streaming/IoT,
   enterprise integration, licensed market, geospatial), none of which exist.
2. **Nothing has been collected live.** Every connector is exercised against frozen replay evidence.
3. **Content authenticity is `unknown` for every source.** No publisher here offers a signature
   mechanism. Transport authenticity, publisher identity, byte integrity and content authenticity
   are recorded as four separate concepts and never conflated.
4. **Correction propagation is unresolved by construction.** There is no dependency graph until
   Phase 3, so every case states that rather than implying a propagation it cannot perform.
5. **Quarantine scanning is heuristic only** — no malware engine (`EXC-P1-001`, open).
6. **The evidence vault is local Docker volumes** — no replicated object store (`EXC-P1-002`, open).
   Loss of the volume loses raw bytes; the canonical metadata and digests prove what existed, not
   its content.
7. **Three sources cannot go live** until their reuse terms are verified.
8. **LOCAL-ONLY.** `EXC-P0-004` prohibits external deployment, real customer data and production
   claims. Container dispositions SCX-0006…0009 expire **2026-11-05**.

### Optional improvements — backlog, not gaps

* The vault does not content-address blobs, so identical bytes collected twice are stored twice.
  This is deliberate — a digest→locator index is the existence oracle the opaque locators prevent —
  but a scoped dedup design could revisit it.
* The outbox publisher mints a capability on every poll tick even when there is nothing to publish.
  Noisy, not incorrect; it is why the C14 inertness suite needs an idle database.
* Coverage evaluation is on demand; a scheduled evaluation would keep the overview current without
  an operator asking.
* The registration form covers the §7 field set but is long; it could learn presets per connector.

## 10. CI on the frozen candidate

`ci` **success** — `build-test`, `browser-regression`, `supply-chain`.
`C19 lifecycle` **success** — ubuntu-latest and macos-14, plus `delivery-chain-dry` and
`foreign-checkout-pinning`.

Inside `build-test`: integration (Phase 0 + Phase 1) ✅ · migration 0022 upgrade compatibility ✅ ·
C18 dual-path history gate ✅. Suite counts and the acceptance matrix are in
[PHASE1_REPORT.md](PHASE1_REPORT.md); they are not repeated here.

C18 remains frozen at migration 0021 and **no file it owns is modified by this candidate**.
