# Phase 1 — Synthetic Company Specification

> **Every fact in this document is SYNTHETIC.** NORDWERK ANTRIEBSTECHNIK GmbH does not exist. No
> real company, customer, supplier, contract, price or shipment is described here, and none is
> required to build or demonstrate Phase 1.
>
> **Marking convention (enforced, not decorative):** every synthetic record carries `synthetic: true`
> and an identifier prefixed `SYN-`. The Observation Operations UI renders a persistent
> `SYNTHETIC` marker on any object whose source contract has `data_origin: synthetic`. A synthetic
> record can never be displayed without it.

---

## 1. Company identity

| Field | Value |
|---|---|
| Legal name | **NORDWERK ANTRIEBSTECHNIK GmbH** *(synthetic)* |
| Identifier | `SYN-ORG-NORDWERK` |
| Founded | 1974 *(synthetic)* |
| Sector | Electric drive units and precision actuators for industrial automation |
| Headcount | 1 840 |
| Revenue | €612 M (FY2023) |
| HQ | Regensburg, Bavaria, Germany |
| Customers | Tier-1 automotive and factory-automation OEMs *(unnamed — no customer data, real or invented, is needed)* |

**Why a drivetrain manufacturer.** The corridor decision needs a business where a two-week component
delay actually stops a line: high-value, low-substitutability parts, single-sourced, sea-freighted,
with contractual delivery penalties. A commodity assembler would absorb the delay and there would be
no decision to demonstrate.

---

## 2. Locations

| ID | Site | Role | Capacity |
|---|---|---|---|
| `SYN-SITE-REG` | Regensburg, DE | Final assembly, HQ | 4 200 units/week |
| `SYN-SITE-BRN` | Brno, CZ | Rotor subassembly | 5 000 units/week |
| `SYN-WH-DUI` | Duisburg, DE | Inbound consolidation warehouse | 9 000 m² |

## 3. Production lines

| ID | Line | Site | Product | Rate | Depends on |
|---|---|---|---|---|---|
| `SYN-LINE-A1` | A1 | Regensburg | NW-620 drive unit | 1 800/wk | `SYN-PART-MAG`, `SYN-PART-PWR` |
| `SYN-LINE-A2` | A2 | Regensburg | NW-410 actuator | 2 400/wk | `SYN-PART-MAG` |
| `SYN-LINE-B1` | B1 | Brno | Rotor subassembly | 5 000/wk | `SYN-PART-MAG` |

## 4. Components and dependencies

| ID | Component | Supplier | Country | Sourcing | Lead time | Unit cost |
|---|---|---|---|---|---|---|
| `SYN-PART-MAG` | NdFeB permanent-magnet rotor sets | `SYN-SUP-NB` | CN (Ningbo) | **single-source** | 42 d door-to-door | €118 |
| `SYN-PART-PWR` | Power-electronics modules | `SYN-SUP-KH` | CN (Kunshan) | dual-source (70/30) | 38 d | €244 |
| `SYN-PART-BRG` | Precision bearings | `SYN-SUP-SE` | SE | dual-source | 12 d | €31 |
| `SYN-PART-HSG` | Aluminium housings | `SYN-SUP-CZ` | CZ | local | 6 d | €54 |

`SYN-PART-MAG` is the dependency the whole demonstration turns on: single-sourced, sea-freighted
through the affected corridor, and consumed by all three lines.

## 5. Suppliers

| ID | Supplier | Country | Supplies | Terms |
|---|---|---|---|---|
| `SYN-SUP-NB` | Ningbo Precision Magnetics Co. | CN | `SYN-PART-MAG` | FOB Ningbo, 60 d payment |
| `SYN-SUP-KH` | Kunshan Power Systems Ltd. | CN | `SYN-PART-PWR` | FOB Shanghai |
| `SYN-SUP-SE` | Nordbearing AB | SE | `SYN-PART-BRG` | DAP Regensburg |
| `SYN-SUP-CZ` | Moravia Castings s.r.o. | CZ | `SYN-PART-HSG` | DAP Brno |

## 6. Route

`SYN-ROUTE-ASIA-EU-01` — the standing route for `SYN-PART-MAG`:

```
Ningbo-Zhoushan (CNNGB)
  → Malacca Strait
  → Bab el-Mandeb Strait      ← chokepoint4  (the corridor at risk)
  → Suez Canal                ← chokepoint1
  → Rotterdam (NLRTM)
  → rail/barge → Duisburg (SYN-WH-DUI)
  → truck → Regensburg (SYN-SITE-REG)
```

Nominal transit **28 days** port-to-port; **42 days** door-to-door.
Alternative `SYN-ROUTE-ASIA-EU-02` via **Cape of Good Hope** (`chokepoint7`): **+11 days**, **+€1 850
per container**.

## 7. Shipments in flight at the start of the replay window

All dates are the synthetic operating picture as of `2024-01-12T00:00:00Z`.

| ID | Component | Qty | Vessel *(synthetic)* | Position at window open | ETA Rotterdam | Status |
|---|---|---|---|---|---|---|
| `SYN-SHIP-4471` | `SYN-PART-MAG` | 38 400 sets | *MV Kestrel Meridian* | Approaching Bab el-Mandeb | 2024-01-29 | **at risk** |
| `SYN-SHIP-4472` | `SYN-PART-MAG` | 41 000 sets | *MV Kestrel Aurora* | Malacca Strait | 2024-02-08 | reroutable |
| `SYN-SHIP-4468` | `SYN-PART-PWR` | 12 000 modules | *MV Hanse Trader* | Suez transit | 2024-01-19 | in transit |
| `SYN-SHIP-4475` | `SYN-PART-MAG` | 39 200 sets | *(not yet loaded)* | Ningbo | 2024-02-22 | bookable |

## 8. Inventory and safety stock (as of window open)

| Component | On hand | Safety stock | Weekly consumption | Cover |
|---|---|---|---|---|
| `SYN-PART-MAG` | 63 400 sets | 40 000 | 9 200 | **6.9 weeks** |
| `SYN-PART-PWR` | 21 800 | 15 000 | 1 800 | 12.1 weeks |
| `SYN-PART-BRG` | 88 000 | 30 000 | 6 100 | 14.4 weeks |
| `SYN-PART-HSG` | 14 500 | 8 000 | 4 200 | 3.5 weeks |

**The arithmetic that creates the decision.** `SYN-SHIP-4471` lands 2024-01-29. Cover runs to
≈ 2024-02-28. An 11-day Cape reroute moves arrival to ≈ 2024-02-09 — still inside cover. A *second*
consecutive reroute (`SYN-SHIP-4472`, ETA 2024-02-08 → 2024-02-19) plus any port congestion breaches
safety stock in the first week of March. **The window that is closing is the booking decision for
`SYN-SHIP-4475`, not the ship already at sea.**

That distinction is the point of the demonstration, and Phase 1 shows the *evidence* that makes it
visible — not the conclusion.

## 9. Costs and contractual constraints

| Item | Value |
|---|---|
| Cape reroute | +€1 850/container; `SYN-SHIP-4471` = 24 containers → **+€44 400** |
| Air freight (emergency) | €19.40/kg; one week of `SYN-PART-MAG` ≈ 4 100 kg → **≈ €79 500/week** |
| Line-stop cost, A1 | €142 000/day |
| Customer LD clause | 0.8 %/week of order value, cap 8 % *(synthetic contract terms)* |
| Q1 committed volume | 23 400 NW-620 units |

## 10. Ground truth for the demonstration

The externally verifiable half — the corridor signal — is **real IMF PortWatch data**, captured live
on 2026-09-02 for the frozen window:

| Date | Bab el-Mandeb transits | capacity | Suez transits | Cape of Good Hope transits |
|---|---|---|---|---|
| 2024-01-11 | 55 | 2 048 432 | 50 | 74 |
| 2024-01-12 | 35 | 1 470 236 | 36 | 83 |
| 2024-01-13 | 43 | 1 717 684 | 47 | 82 |
| 2024-01-14 | **27** | **826 735** | 49 | 52 |
| 2024-01-15 | 29 | 1 498 065 | 53 | 73 |

December 2023 daily mean at Bab el-Mandeb: **65 transits**. January 2024 mean: **39**.

The synthetic company is fiction. The corridor collapse is not — and the demonstration keeps the two
clearly separated, because a system whose whole purpose is provenance must not blur which facts are
which.

## 11. What Phase 1 does *not* do with this data

It does not compute cover, model the reroute, predict the breach, or recommend anything. Those are
Phases 2–6. Phase 1 registers the sources, collects the evidence, preserves the original bytes with
custody, quarantines what fails validation, shows freshness and coverage, and handles corrections.
The §8 arithmetic above is written here so a reviewer can see the demonstration is *about* something
real — not so that Phase 1 can pretend to perform it.
