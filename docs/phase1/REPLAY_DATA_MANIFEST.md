# Phase 1 — Replay Data Manifest

> Defines the frozen evidence set for the deterministic demonstration. **Nothing is captured by this
> packet**; capture is P1-M2 work after approval.

---

## 1. The frozen window

**`2024-01-12T00:00:00Z` → `2024-01-15T00:00:00Z`** — 72 hours.

**Why this window.** It is the sharpest verifiable inflection in the Red Sea corridor that IMF
PortWatch actually records, and it is bracketed by enough surrounding data to show a baseline and a
partial recovery. Verified live on 2026-09-02:

* Bab el-Mandeb daily transits fall **55 → 35 → 43 → 27 → 29** across 11–15 January.
* Cargo capacity at the trough (14 Jan) is **826 735**, against **2 048 432** on 11 January — a
  **60 % fall in three days**.
* Cape of Good Hope rises **74 → 83 → 82** as traffic reroutes.
* Monthly means: December 2023 **65** transits/day, January 2024 **39**.

The window is historical and closed, so the data cannot move under the demonstration.

**Context band.** `2023-12-01 → 2024-01-31` is captured for every corridor series so the UI can show
the 72 hours against a baseline. The *demonstration* is the 72 hours; the band is context.

---

## 2. Replay sets

| Set | Source | Content | Est. objects | Est. bytes |
|---|---|---|---|---|
| `S1-replay` | PortWatch chokepoints | Daily rows, `chokepoint1/4/7`, 2023-12-01 → 2024-01-31 | 186 | ~120 KB |
| `S2-replay` | PortWatch ports | Daily rows, Rotterdam + Ningbo-Zhoushan, same band | 124 | ~90 KB |
| `S3-replay` | EU sanctions RSS | 3 feed states: pre-update, post-update, post-correction | 3 | ~12 KB |
| `S4-replay` | EU sanctions CSV/XML | 2 payload versions matching S3 states | 2 | ~9 MB |
| `S5-replay` | ECB EUR/USD | Daily observations across the band | 42 | ~30 KB |
| `S6-replay` | World Bank | 4 indicator series, DE/CN/NL | 4 | ~20 KB |
| `S7-replay` | UN Comtrade | HS 8505 (magnets) DE imports, 2022–2023, manual export | 2 | ~400 KB |
| `S8-replay` | GDELT | 1 captured result set, marked observational | 1 | ~40 KB |
| `S9-synthetic` | Internal | Company CSV/PDF/DOCX per the spec | 14 | ~2 MB |
| `S10-advisories` | Carrier/port | Operator-supplied PDFs | 4 | ~3 MB |
| **Deterministic total** | | | **≈ 382** | **≈ 15 MB** |

## 3. Deliberate defects in the frozen set

The demonstration must show quarantine and correction doing real work, so the frozen set contains
planted defects. Each is documented here so no reviewer mistakes one for an accident.

| ID | Set | Defect | Exercises |
|---|---|---|---|
| `DEF-01` | `S9-synthetic` | CSV with a leading `=` formula cell | Formula-risk classification (§8.2), never evaluated |
| `DEF-02` | `S9-synthetic` | DOCX whose archive contains a `../` path entry | Path-traversal rejection → quarantine |
| `DEF-03` | `S9-synthetic` | PDF with an embedded-file marker | `active_content_risk` flag; PDF stored opaque |
| `DEF-04` | `S1-replay` | One row with `n_total` absent | Schema drift → quarantine, not admission |
| `DEF-05` | `S4-replay` | Second version differing in 3 rows | Supersession + `CorrectionReceived` |
| `DEF-06` | `S3-replay` | Feed item whose `guid` repeats with a new `pubDate` | Correction vs. new-observation distinction |
| `DEF-07` | `S9-synthetic` | Declared `.csv`, sniffed as ZIP | Declared-vs-sniffed type recording |
| `DEF-08` | `S1-replay` | Two-day gap in the series | Coverage `insufficient_evidence` — never "healthy" |
| `DEF-09` | `S10-advisories` | An advisory the operator later withdraws | Withdrawal handling |
| `DEF-10` | `S8-replay` | Observational item contradicting an authoritative one | Authority classification holds; no reconciliation attempted (that is Phase 2+) |

`DEF-08` and `DEF-10` matter most. `DEF-08` proves a gap is surfaced as *unknown* rather than
smoothed away; `DEF-10` proves a low-authority source cannot quietly outrank an authoritative one.

## 4. Capture procedure

1. Capture through the **shipping connector code**, not a bespoke script.
2. Preserve the complete HTTP response: status, retained headers, body bytes, retrieval instant.
3. Write `fixtures/phase1/replay/<set>/MANIFEST.json` — per file: retrieval URL, retrieval instant,
   status, retained headers, SHA-256, byte length, `acquisition_mode: replay`.
4. Commit manifest digests. A file that does not match fails closed.
5. Serve replay from a local fixture responder honouring the same source contract, so the connector
   under test is the connector that ships.

**Capture happens once.** Re-capture requires a new manifest version and a recorded reason —
otherwise "frozen" means nothing.

## 5. Live overlay (optional, 10–15 %)

| Source | Live adds | If unavailable |
|---|---|---|
| S1/S2 PortWatch | Today's rows beside the frozen window | Panel shows `live overlay unavailable`; demo continues |
| S3 EU sanctions RSS | Current feed state and real `pubDate` | Same |
| S5 ECB | Today's reference rate | Same |
| S8 GDELT | Current discovery items, marked observational | Same |

**Overlay rules.** Additive only. It may never modify, replace or reorder a replay object. Overlay
objects carry `acquisition_mode: live` and are visually distinguished. **A source being down is a
freshness observation to display, not a demonstration failure** — arguably the overlay is most
valuable on the day something is down.

## 6. Ratio, as it will actually measure

With the deterministic set at ~382 objects and a typical overlay of ~40–60:

```
replay_share_by_object ≈ 382 / (382 + 50) ≈ 88.4 %      ← inside the 85–90 % target
replay_share_by_bytes  ≈ dominated by S4 (9 MB) and S9/S10 (5 MB), ≈ 97 %
```

Both are reported. By-bytes is high because one sanctions file outweighs hundreds of small rows —
which is exactly why the two figures are never collapsed into one number.
