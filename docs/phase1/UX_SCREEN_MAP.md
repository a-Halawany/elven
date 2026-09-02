# Phase 1 — Observation Operations: Screen Map & Wireframes

> WS-02, per PHASE1_PLAN §12 (P1-M6) and acceptance A12. Premium, calm, dynamic. Nothing here adds
> scope beyond the plan's UI deliverable.

---

## 1. Design stance

The operator is watching a world they do not control, using evidence they must be able to defend
later. Three consequences shape every screen:

1. **Calm by default, loud only on change.** Motion is reserved for state transitions that matter —
   a freshness threshold crossed, an item quarantined. Ambient animation would train the eye to
   ignore movement, which is the one thing this interface cannot afford.
2. **Provenance is not a detail view.** Source, authority class, acquisition mode and freshness are
   present wherever evidence is, at list density. A reviewer must never have to click to discover
   they are looking at an observational source.
3. **Governed actions never look done before they are.** No optimistic UI on register, approve,
   correct, withdraw or download. The control enters a pending state and resolves on the server's
   answer. A row that says "approved" means the server said so.

**Visual language.** Deep neutral ground with a slight cool bias; one accent reserved for
interactive affordances; semantic colour (healthy / degraded / unknown / quarantined) kept separate
from the accent so state is never confused with interactivity. `unknown` is rendered in a distinct
neutral — never green, never a blank.

---

## 2. Screen map

```
Observation Operations
├── /observation                     Overview — the standing picture
├── /observation/sources             Source Registry (list)
│   ├── /new                         Register (multi-step)
│   ├── /:id                         Source detail
│   │   ├── #contract                Contract terms & lifecycle
│   │   ├── #health                  Freshness · coverage · authenticity
│   │   ├── #runs                    Collection runs
│   │   └── #approvals               Approval trail (registrar ≠ approver)
│   └── /:id/approve                 Approval review (separate operator)
├── /observation/evidence            Evidence browser
│   └── /:id                         Evidence detail
│       ├── #custody                 Chain of custody
│       ├── #bytes                   Original bytes (safe download)
│       └── #lineage                 Method lineage, parent/child framing
├── /observation/quarantine          Quarantine queue
│   └── /:id                         Quarantined item + reason
└── /observation/corrections         Corrections & withdrawals
    ├── /new                         Submit correction / withdrawal
    └── /:id                         Correction case
```

---

## 3. Wireframes

### 3.1 Overview — `/observation`

```
┌──────────────────────────────────────────────────────────────────────────────┐
│ ≡  Observation Operations                     [tenant ▾] [operator ▾] [?]    │
├──────────────────────────────────────────────────────────────────────────────┤
│ COLLECTION STATUS                                            last 24h        │
│ ┌────────────┬────────────┬────────────┬────────────┬──────────────────────┐ │
│ │ 9 SOURCES  │ 7 ACTIVE   │ 1 DEGRADED │ 1 DRAFT    │ 382 EVIDENCE OBJECTS │ │
│ │            │            │  S1 stale  │  rights?   │  88% replay · 12% live│ │
│ └────────────┴────────────┴────────────┴────────────┴──────────────────────┘ │
│                                                                              │
│ SOURCE HEALTH                                              [all ▾] [⟳ 30s]  │
│ ┌──────────────────────────────────────────────────────────────────────────┐ │
│ │ ● IMF PortWatch — Chokepoints     AUTHORITATIVE   fresh 9d   cov 96%  ⌄  │ │
│ │ ● EU Sanctions (RSS)              AUTHORITATIVE   fresh 4h   cov  —   ⌄  │ │
│ │ ◐ ECB EUR/USD                     AUTHORITATIVE   fresh 18h  cov 88%  ⌄  │ │
│ │ ○ GDELT Discovery                 OBSERVATIONAL   fresh 2h   cov  ?   ⌄  │ │
│ │ ◍ World Bank Indicators           AUTHORITATIVE   UNKNOWN    cov  ?   ⌄  │ │
│ └──────────────────────────────────────────────────────────────────────────┘ │
│   ● healthy   ◐ degraded   ◍ unknown   ○ observational   ⊘ suspended         │
│                                                                              │
│ NEEDS ATTENTION                                                              │
│  ⚠ 3 items quarantined            → Quarantine queue                        │
│  ⚠ 1 correction awaiting review   → Corrections                             │
│  ⚠ 1 source contract unconfirmed rights (PortWatch)  → Source detail        │
└──────────────────────────────────────────────────────────────────────────────┘
```

`UNKNOWN` occupies the same visual weight as a value. It is never blank, never dashed away, never
coloured as healthy — a source we cannot measure is a fact about our coverage, not an absence.

### 3.2 Register a source — `/observation/sources/new`

Four steps, each server-validated before the next. The §7 contract is long; the form does not
pretend otherwise, it paginates honestly and shows progress.

```
┌──────────────────────────────────────────────────────────────────────────────┐
│ Register a source                                    ① ─── ② ─── ③ ─── ④    │
│                                                   Identity Authority Ops Review│
├──────────────────────────────────────────────────────────────────────────────┤
│ ② AUTHORITY & RIGHTS                                                         │
│                                                                              │
│ Authority class          ( ) Authoritative   (•) Observational               │
│   ⓘ An observational source may never be presented as factual authority.     │
│     This is enforced at admission, not just in the interface.                │
│                                                                              │
│ Legal basis              [ Publisher terms of reuse            ]             │
│ Licence                  [ CC-BY 4.0                           ]             │
│ Permitted use            [x] internal analysis  [ ] redistribution           │
│ Rights state             (•) confirmed  ( ) pending confirmation             │
│ Purpose                  [ corridor monitoring                 ]             │
│ Classification ceiling   [ internal ▾ ]                                      │
│ Residency                [ EU ▾ ]                                            │
│ Retention                [ 24 months ▾ ]   Deletion obligation [ none ▾ ]    │
│                                                                              │
│                                        [ Back ]  [ Continue ]                │
└──────────────────────────────────────────────────────────────────────────────┘
```

Step ④ shows the assembled contract read-only and submits it as **`draft`**. It cannot self-approve:
the submitting operator sees "Submitted for approval — you cannot approve your own registration",
naming the separation-of-duties rule rather than merely disabling a button.

### 3.3 Approval — `/observation/sources/:id/approve`

A different operator, with `collection_manager`. Shows the full contract, the registrar's identity,
and a decision the server confirms before the UI moves:

```
│ Registered by  operator:a.hoffmann        2024-01-12 09:14:02Z              │
│ Approving as   operator:m.dvorak          (registrar ≠ approver ✓)          │
│                                                                             │
│                       [ Reject with reason ]  [ Approve ]                   │
│                                                                             │
│ … after click:        [ Approving… ]   ← disabled; no optimistic state      │
```

### 3.4 Evidence detail — custody — `/observation/evidence/:id#custody`

```
┌──────────────────────────────────────────────────────────────────────────────┐
│ ← Evidence  EVD-7c41…                                    [ Download ⤓ ]      │
│ IMF PortWatch — Chokepoints    AUTHORITATIVE    REPLAY    admitted           │
├──────────────────────────────────────────────────────────────────────────────┤
│ CHAIN OF CUSTODY                                                             │
│                                                                              │
│  ┌─ source contract ────────── SRC-portwatch-chokepoints @ v3 (active)       │
│  │                             approved by operator:m.dvorak 2024-01-12      │
│  ├─ agent ─────────────────── agent:observation.rest@1.4.0                   │
│  │                             code digest sha256:9f2c…be71                  │
│  │                             owner operator:a.hoffmann                     │
│  ├─ run ─────────────────────  run:01HQ…  started 2024-01-14T06:00:03Z       │
│  │                             endpoint services9.arcgis.com/…/query         │
│  │                             TLS verified · origin allowlisted             │
│  ├─ observation ────────────── OBS-3ab9…  observed 2024-01-14T06:00:07Z      │
│  ├─ bytes ─────────────────── 4 182 B · sha256:6ce1…f0a3                     │
│  │                             verified pre-store · post-store · on read     │
│  └─ admitted ───────────────── 2024-01-14T06:00:09Z into eye-evidence        │
│                                                                              │
│ FOUR TIMES                                                                   │
│  event 2024-01-14T00:00Z · observation 06:00:07Z · valid 2024-01-14 ·        │
│  record 06:00:09Z                                                            │
│                                                                              │
│ AUTHENTICITY  (four separate concepts — never conflated)                     │
│  transport endpoint  ✓ TLS verified                                          │
│  byte integrity      ✓ digest matches, re-verified on this read              │
│  source origin       ✓ allowlist + pinned IP                                 │
│  content authenticity  ◍ UNKNOWN — no publisher signature mechanism exists   │
│                          for this source. TLS and digests do not establish   │
│                          that the content is genuinely the publisher's.      │
└──────────────────────────────────────────────────────────────────────────────┘
```

That last row is the one the interface exists to make unavoidable.

**Download** is attachment-only, sandboxed, never inline-rendered, and is a consequential read:
POL/AUD durable before bytes are served.

### 3.5 Source health — `#health`

```
│ FRESHNESS       last admitted 2026-08-23 · 9d 4h ago                         │
│                 expected daily · threshold 3d ·  ◐ DEGRADED                  │
│                 ⓘ Publisher lag, not a collection failure — the last         │
│                   successful run was 4h ago and returned the same latest row.│
│                                                                              │
│ COVERAGE        window 2023-12-01 → 2024-01-31 · universe v2 · calc v1.1     │
│  expected_coverage   62/62 days      measured    100%                        │
│  actual_coverage     60/62 days      measured     96.8%                      │
│  completeness        ── 2 days absent ──  insufficient_evidence              │
│  latency             median 9d 2h    measured                                │
│  authenticity        see four concepts above                                 │
│  correction_lag      no corrections observed   not_applicable                │
│                      reason: publisher has no corrections channel (approved) │
│  blind_spots         ◍ unknown                                               │
│  degraded_regions    ◍ unknown                                               │
│                                                                              │
│  evaluated_at 2026-09-02T08:14:22Z    evidence: run:01HR…, adm:…  [replay ⟳] │
```

Separating *publisher lag* from *collection failure* is the difference between an operator trusting
the panel and learning to ignore it.

### 3.6 Quarantine — `/observation/quarantine`

```
│ ⚠ QUARANTINED — not admitted, stored in eye-quarantine, never in evidence    │
│                                                                             │
│ ┌────────────────────────────────────────────────────────────────────────┐  │
│ │ nordwerk-bom-2024Q1.docx   upload   a.hoffmann   2024-01-12T10:22Z      │  │
│ │ ⊘ Archive entry escapes the extraction root ("../../etc/passwd")        │  │
│ │   Rejected before expansion. Bytes preserved for review.                │  │
│ │                          [ Inspect ]  [ Release… ]  [ Discard… ]        │  │
│ └────────────────────────────────────────────────────────────────────────┘  │
│ ┌────────────────────────────────────────────────────────────────────────┐  │
│ │ chokepoints-2024-01-13.json   rest   agent:observation.rest@1.4.0       │  │
│ │ ⊘ Schema drift: required field `n_total` absent (contract tolerance 0)  │  │
│ └────────────────────────────────────────────────────────────────────────┘  │
```

Release requires a reason and a second operator; the button opens a dialog, never acts directly.

### 3.7 Corrections — `/observation/corrections/:id`

```
│ CORRECTION CASE  COR-0912…                        status: applied           │
│ Received 2024-01-14T11:02Z from EU Sanctions (RSS) — publisher republication │
│                                                                             │
│ AFFECTED — DIRECTLY KNOWN                                                   │
│   EVD-4b21…  eu-sanctions-1.1.csv  v2 → superseded by v3                    │
│   OBS-91cc…  superseded                                                     │
│                                                                             │
│ PROPAGATION SCOPE                                                           │
│   resolved:   2 objects above                                               │
│   unresolved: downstream consumers not yet present                          │
│               (knowledge graph / dependency graph arrives in Phase 3)       │
│   ⓘ We state what we do not know. Nothing downstream is claimed to be       │
│     corrected, because nothing downstream exists yet to correct.            │
│                                                                             │
│ HISTORY   v2 remains retrievable · known-at queries reproduce the pre-       │
│           correction state                                                  │
```

---

## 4. Navigation & operator journey

**Primary nav** (left rail, collapsible): Overview · Sources · Evidence · Quarantine · Corrections.
Persistent tenant/domain indicator — cross-tenant confusion is a governance failure, not a UX one.

**Two journeys.**
*Registrar* — Overview → Sources → Register (4 steps) → submitted, awaiting approval.
*Collection manager* — Overview → attention item → Approve, or Quarantine → inspect → release/discard,
or Corrections → review case.

Every governed action ends at a server-confirmed state, with the audit entry visible from the object
it concerns.

---

## 5. Responsive behaviour

| Breakpoint | Layout |
|---|---|
| ≥1440px | Left rail + content + contextual detail pane |
| 1024–1439px | Left rail + content; detail becomes an overlay |
| 768–1023px | Rail collapses to icons; tables drop to priority columns (state, source, time) |
| <768px | Single column; tables become cards; **no horizontal page scroll** — wide data scrolls inside its own container |

Provenance and authority-class never drop out at any breakpoint. If space is short, something else
goes.

---

## 6. Accessibility (A12 requires it in Playwright)

* Full keyboard operation; visible focus; logical tab order; no keyboard traps in dialogs.
* Landmarks (`banner`, `navigation`, `main`, `complementary`), one `h1` per screen, ordered headings.
* Every control labelled; icon-only buttons carry accessible names.
* State never by colour alone — glyph + text accompany every health state.
* Contrast ≥ 4.5:1 body, ≥ 3:1 large text and UI boundaries, both themes.
* Live regions announce collection-status changes politely; quarantine arrivals assertively.
* `prefers-reduced-motion` honoured: transitions collapse to instant.
* Tables are real tables with scope'd headers and captions.

---

## 7. RTL readiness

Logical CSS properties throughout (`margin-inline`, `padding-block`, `inset-inline-start`); `dir` on
`<html>`; directional icons mirror, status glyphs do not; numerals, digests and timestamps stay LTR
inside RTL text via `bdi`/`unicode-bidi: isolate`. Layout is mirrored in Playwright with `dir="rtl"`
to catch hard-coded `left`/`right`. **No translation is claimed for Phase 1** — readiness means the
layout does not break, not that the product is localised.

---

## 8. The rule on optimistic presentation

Register, approve, reject, release, discard, correct, withdraw, download.

For each: control → `pending` (disabled, labelled with the verb in progress) → server response →
resolved state, with the audit record reachable. On failure, the prior state is restored and the
reason shown in full — never "something went wrong".

A governed action that appears to have happened before the server agreed is a provenance lie in the
interface, and this is a provenance product.
