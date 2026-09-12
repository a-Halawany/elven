# IMF PortWatch — permission record (placeholder)

> **Status: permission GRANTED — owner-reported, 2026-09-10. The grant text has not been supplied.**
> This file is the place the grant and its conditions attach when the owner supplies them. Until
> then it records only what the owner reported and what is pending; nothing below asserts a
> condition the IMF has or has not set.

## 1. What is recorded

| Item | Record |
|---|---|
| Publisher | International Monetary Fund — PortWatch (with Oxford; the datasets name the World Bank and the WTO as partners) |
| Datasets the request named | PortWatch Daily Chokepoints Data (ArcGIS item `3da2b9ca97684916b75c4013f95d18ab`) and the corresponding daily port data |
| Request | `PORTWATCH_PERMISSION_REQUEST_2026-09.md` (redraft of 2026-09-08). The status document of 2026-09-07 recorded it as prepared and not sent; the owner's report of 2026-09-10 supersedes that record. |
| Approval | **Owner-reported on 2026-09-10**: IMF PortWatch permission is GRANTED, and activation may progress within the approved rights, cadence and budget. |
| Grant text | **Not supplied.** To be attached verbatim in §2 when received. |
| Rights evidence on the contracts | The string recorded through `/sources/:sourceId/rights` on 2026-09-10: `owner-reported IMF permission, 2026-09-10; grant text pending at docs/sources/portwatch-grant.md` (`imf-portwatch-chokepoints` v1; `imf-portwatch-ports` v1 and v2). |

## 2. The grant, verbatim — PENDING

*(Attach the IMF's reply here exactly as received: date, sender, subject, body. Do not paraphrase.)*

## 3. Conditions — PENDING, to be read from §2 once attached

| Condition | Value | Where it must be reflected |
|---|---|---|
| Permitted uses (evaluation now; commercial deployment; customer-facing derived analyses) | pending | `authority_and_rights.permitted_use` on the next contract version; the readiness register |
| Attribution wording | pending — the contracts carry the request's own provisional wording, "Source: IMF PortWatch (IMF / Oxford), portwatch.imf.org", marked provisional | `authority_and_rights.attribution`; every screen and export that shows PortWatch figures |
| Rate or volume limit | pending — the contracts keep v1's budgets (12 requests and 32 MiB per run, daily cadence); the request promised well under one request per second | `security_and_operations.budgets`; `identity.cadence_seconds` |
| Scope (which series, which chokepoints and ports, historical depth) | pending — the request asked for 2019-01-01 → present for three chokepoints (Bab el-Mandeb, Suez, Hormuz) and two ports, then daily | `security_and_operations.backfill` (`from`, `where`); `identity.endpoints` |
| Retention, granularity, latency restrictions | pending | `authority_and_rights.retention`; the freshness expectation |
| Fee, licence or data-use agreement | pending — no purchase has been made or authorised | this record; DECISIONS.md if a fee applies |
| Preferred endpoint or bulk download for history | pending — the request offered to use one instead of paging the FeatureServer | `security_and_operations.backfill.endpoint` |

## 4. What the grant text unblocks

Until §2 is attached, the platform holds the owner's report as the rights evidence and keeps every
contract field the grant could condition at its v1 value (permitted use, budgets, cadence,
retention). Widening any of them — commercial use, customer-facing derived figures, a larger scope,
a different cadence — waits for the text. The activation work performed on the owner's report, and
what it found, is recorded in `SOURCE_INTEGRATION_STATUS.md` §9.
