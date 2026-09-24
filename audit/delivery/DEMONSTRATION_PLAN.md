# The NORDWERK demonstration: the complete story (baseline 2026-09-24)

This is one story on one synthetic company, told through the whole product. Every scene runs through the real HTTP path by the named personas and states the effect it produced in the ledgers, the outbox and the pages. Where nothing happened, the scene says so, as every act since B10 does.

Each stage's per-feature scenes are in `STAGES.csv` (`demo_scenes`) and `FEATURE_TRACKER.csv`. This file connects them into one sequence.

## The company and the question

**NORDWERK Antriebstechnik GmbH** makes drive-train components. Its Regensburg assembly line depends on gearboxes, bearings and castings. Many of those parts reach Europe through the **Bab el-Mandeb / Red Sea corridor**.

The standing strategic question: *will corridor disruption break our delivery commitments, and what do we commit to about it?*

**The cast.** All thirteen personas exist in the seed. The parts below are their parts in this story; each act checks the recorded role before casting, as B22 did when M. Dvořák replaced U. Fischer.

| Persona | Role |
|---|---|
| L. Brandt | Decision owner |
| S. Roth | Strategy owner |
| N. Eriksen | Forecaster |
| A. Hoffmann | Analyst |
| K. Müller | Knowledge owner |
| M. Dvořák | Collection manager, origin domain |
| U. Fischer | Collection manager, mirror domain only |
| P. Novák | Export operator |
| H. Bergmann | Approver |
| R. Adler | Record authority |
| J. Weber | Challenger |
| K. Vogel | Twin owner |
| S. Okafor | Side-effect approver |

## What the demonstration already proves (on `eye_demo`, through 0083)

| Chapter | Proven by | What a viewer sees today |
|---|---|---|
| Sources are governed | Phase 1 seed and contracts, the ECB activation, scheduled collection (#44), act-b11 (credential path) | RSS, REST and upload sources under contracts with rights; scheduled ticks; custody with digests; a governed credential reference (the Comtrade key is not present, and that is stated) |
| Intelligence is extracted and reviewed | Phase 2 seed, live-extraction | Claims with evidence spans, a review gate, and provenance to the byte |
| Knowledge is a graph with memory | Phase 3, act-b10 (memory workspace), act-b19 (source-derived memory), act-b20 (index-tier degradation) | Entities, edges and the strategy graph; memory records derived under a human gate; a projection withdrawn and served degraded, then restored |
| The future is forecast and warned | Phase 4, act-b18 (lifecycle announced), act-b21 (fitness / coherence / challenge) | Forecasts with backtests; scenarios; warning levels; an unfit forecast withdrawn; a scenario judged incoherent; a simulation challenged and upheld |
| Twins and simulations ground the options | Phase 5, act-b21 | Twin snapshots grounded; simulation runs reproduced; the envelope; promotion |
| The decision is human and replayable | Phase 6 acts, act-b18 | A decision package committed by the executive; reopened on an invalidation and re-committed; Decision Replay of what was known at commitment |
| Retention, export and import are lawful | act-b11 … act-b17 | Archive and restore-to-hot, the cold-tier manager, a signed export delivered with a receipt, an HTTPS exchange with a trust anchor, a revocation notice, governed import round trip into the mirror domain, revocation propagated |
| Attention reaches the right human | act-b22 | Policy v1 → v2 published by a named human; the queue routes, acknowledges, suppresses and escalates; the consumers mark source impact, hold proposals and select plans; the B18 package is reopened with a draft v3 awaiting the owner |

**Not yet shown:** material-change events, the briefing's attention section, event-time streams, enterprise and CDC sources, documents, OCR and media, semantic retrieval, the full forecasting portfolio, twin families, strategic planning and the health score, bounded agents at scale, learning, the marketplaces, the platform's trust and profiles, the unified experience, and commercial operation. The chapters below add them.

## The complete story (chapters in delivery order; each scene belongs to its stage's act)

### Chapter 1. "Something material happened" (B23, B24; A1; October)

- **B23:** A Bab el-Mandeb closure bulletin raises **MaterialChangeRaised**. ReviewConvened opens the corridor review. The commands and the query (L1-I02, L3-I02, L4-I02, L7-I02) are exercised from the pages. The weekly briefing (BRF@v2) gains its attention section listing the closure with its confidence band.
- **B24:** Escalation fires on the timer host with no manual tick. The COO's item is delivered on the synthetic channel with a receipt. N. Eriksen's suppression needs approval. A source-impact marker now **refuses** a decision-active read of the affected forecast.

### Chapter 2. "What do we really know?" (B50, B40, B45, B51, B43, B46, B42, B48; A2; October–December)

- **B50:** A late-August ETA is stored as an interval. A correction to one port bulletin shows its forward impact on claims, the forecast, the warning and last week's briefing. The executive scrubs the timeline to the day of the decision.
- **B40:** A Red Sea shipping-notice feed is registered by two people and later has its rights revoked. A tampered customs bulletin is admitted only as authenticity-failed. A macro-laden supplier PDF is quarantined.
- **B45:** The extraction method is registered and evaluated. A prompt loses recall on Arabic sources and its activation is refused. A hosted provider outage falls back to the local route.
- **B51:** "chokepoint" and "transits_through" are added through ontology governance. A three-edge supplier revision commits atomically. A path query explains why a gearbox depends on Bab el-Mandeb.
- **B43:** Out-of-order Regensburg telemetry and an edge gateway's buffered upload keep their custody.
- **B46:** A scanned bill of lading is OCR'd field by field. An Arabic Yemeni port notice is translated with provenance. The event "vessel attacked near Bab el-Mandeb" is proposed.
- **B42:** Public feeds (sanctions, weather, AIS on synthetic fixtures) arrive through governed adapters. The licensed feeds stay gated (D4).
- **B48:** Two sources disagree on the reopening; both stay visible with their trust. A "70% of gearbox imports" claim shows its calibration population.

### Chapter 3. "What might happen?" (B28, B29, B25, B27, B31, B30, B26; A1/A3; October–February)

- **B28:** AIS transit events arrive late; the corridor rule fires on event time. A weak signal on insurer withdrawals is nominated and tested. Three reports become one deduplicated warning.
- **B29:** The enterprise twin composes the Regensburg process twin and the corridor twin. A three-week bearing shortage is simulated; the constraint engine refuses an infeasible plan.
- **B25:** A 30-day and a 5-year corridor forecast use different methods. Two methods disagree, and the ensemble shows the assumption that splits them.
- **B27:** Scenario anatomy for the closure. Baseline, disruption and blockade branches are compared side by side. Two branches that differ only in wording fail distinctiveness.
- **B31:** A 5,000-path experiment is budgeted, checkpointed, paused and resumed. Second-order effects on delivery dates appear, with value of information.
- **B30:** A PortWatch-style count proposes corridor capacity at 62%, and the twin owner approves it. Merging the blockade branch back is refused until reconciliation.
- **B26:** Forecast drivers and failure conditions are shown. An outcome lands, the forecast is judged unfit, and the scheduler re-issues it.

### Chapter 4. "What does it mean for us?" (B32, B33, B53, B49, B55, B41, B44, B52, B54; October–February)

- **B32:** The 95% on-time objective is linked to the Regensburg capability. The corridor risk exceeds appetite. **The Strategic Health Score's supply-resilience dimension falls from 71 to 58**, and the drill-down shows why.
- **B33:** A tier-2 bearing supplier in Shenzhen is inferred and validated. A competitor opens a plant in Morocco.
- **B53:** A German supplier memo is found semantically. The weekly brief's context manifest is signed.
- **B49:** "Will the closure delay gearbox deliveries beyond Q3?" is assessed with alternatives. The board summary keeps its caveat, and when the report is withdrawn the summary is flagged.
- **B55:** An initiative with no path to an objective is flagged. Research is saved and rerun at its original cutoff.
- **B41:** Silence is distinguished from denial. A duplicated-shipment rule degrades a product. A watchlist is created from the objective.
- **B44:** ERP purchase orders arrive via CDC; a cancelled PO propagates as a tombstone. Syndicated attack reports deduplicate.
- **B52:** "NORDWERK GmbH" is resolved against its Arabic-script register entry.
- **B54:** The new procurement lead asks memory why the company dual-sourced in 2025. Retention of an expired contract removes the document and every derivative. **AU-MEM-0067 closes per object.**

### Chapter 5. "Decide, commit, execute" (B34, B35, B36; A1; November–January)

- **B34:** A partner customs expert is invited with a 14-day expiry, and her task escalates. The approver attaches "only if customs pre-clearance holds", and at commitment the condition holds the commit. A governed purchase-request handoff goes to a synthetic ERP, and half the effect completes visibly.
- **B35:** The "second source for bearings" package scores three options. The Decision Agent proposes Morocco beside the owner's recommendation. J. Weber contests the forecast's source. When the corridor reopens, the decision is reopened.
- **B36:** The 2027 dual-sourcing initiative is baselined. **The Monday cadence:** the COO's home, the ranked corridor item, the decision room, a commitment, the loop reset. The board pack is approved by digest and delivered; a correction versions the publication.

### Chapter 6. "Agents do the legwork, under control" (B70–B78; A2/A3; November–January)

- **B70:** A signed supply-chain-watch agent package is admitted; a tampered one is refused. A durable workflow survives a killed API. A typed message separates observation from inference.
- **B71:** "What does a 30-day closure do?" is planned, supervised and checkpointed. A clearance reduced mid-run is honored on resume. M. Dvořák's stop is respected.
- **B72:** Delegation and supervision happen in the Agent Operations workspace. S. Okafor approves a supplier notice by digest.
- **B73:** Specialist families run: search within the collection contract; the relationship agent; the Dissent Agent arguing for the Cape route; the scenario agent within the envelope.
- **B74 and B75:** The evaluation set has a temporal cutoff. The Arabic slice fails fitness. Calibration drift constrains a method. An injection suite blocks a release. A canary and rollback run.
- **B76:** "We underestimated port congestion" becomes a governed lesson with attribution. The governance console suspends an expired method. An agent incident is contained and replayed.
- **B77 and B78:** The Corridor Analytics publisher's package is inspected, installed with a permission diff, then revoked, with its dependents marked. A chokepoint scenario package is localized. A drive-train domain pack is added. A supply-disruption decision archetype is used.

### Chapter 7. "The platform can be trusted" (B60–B67; A3; October–December)

- **B60:** An idempotent ERP retry creates no second commitment. Observations are published to the lakehouse.
- **B61:** The director signs in through a local IdP with WebAuthn step-up. Contract evidence is encrypted under the domain key.
- **B62:** A policy bundle is activated and rolled back. A data-subject access and erasure request honors a legal hold. EU residency refuses a non-EU target.
- **B63:** One trace runs from observation to decision. The briefing is issued in deterministic fallback when the model is down. A backfill flood does not starve the warning.
- **B64:** An SLO burns its budget and holds a release. A corrupted evidence object is restored from the immutable backup.
- **B65:** A fresh laptop installs into kind from the signed package. N+1 is promoted and then rolled back.
- **B66:** A compromised connector credential is detected and contained. An auditor walks the rerouting decision's chain.
- **B67:** Regensburg runs cut off for 48 hours on a signed bundle delivered on removable media.

### Chapter 8. "One product, for every role" (B80–B86; A3; September–December)

- **B80:** The NORDWERK theme is certified for contrast. Forms are unified. The context bar gives an impact preview.
- **B81:** The reroute approval shows eligibility, recusal, the frozen digest and typed confirmation. The stale feed appears everywhere with its degraded contract. The header grammar is the same on every object.
- **B82:** A corridor flow map with probability bands and table alternatives. Drill-down from the recommendation to the evidence.
- **B83 and B84:** Knowledge and foresight workspaces: an entity split with a consequence preview; a twin branch and run compared. Package assembly with threaded review, the decision, and the briefing published. The warning is received in-app and on a verified channel. Team recertification.
- **B85:** The executive home for S. Roth. An RTL Arabic briefing for the Djibouti port liaison (the localization build; translation is gated by D12).
- **B86:** The offline, watermarked briefing in a Djibouti port office.

### Chapter 9. "It runs as a business" (B90–B94; A1; October–February)

- **B90:** The warning stream as an owned event product. The certified metric "corridor exposure (EUR at risk)". A catalog search.
- **B91:** A simulation sweep metered against the budget. An entitlement explains the unlicensed Simulation module.
- **B92:** The operating review: loop-closure rate, acknowledgement latency, calibration.
- **B93:** The ERP as an API client with webhooks and quotas. **The full exit package verified offline.**
- **B94:** A subsidiary is onboarded from its legacy spreadsheet. A support case with 4-hour scoped access. Go-live readiness.

### Epilogue (H1–H3: hardening; M3: final walk; R1–R3: deployment)

- **H1:** Double-submits return the first result. A throttled burst. Orphan nodes are flagged. The latency budget holds during an alert storm.
- **H2:** Egress refused. The warning-storm capacity replay. A primary killed mid-approval completes once. The golden journey matches on compose and kind.
- **H3:** A screen-reader user approves the package by keyboard. The councils' governance workspace.
- **M3, the owner's walk:** one uninterrupted pass through Chapters 1–9 on `eye_demo`, from the closure bulletin to Decision Replay months later. Each scene's effects are cited from the ledgers. This is the demonstration of record for final acceptance.
- **R1–R3:** only with the external prerequisites:
  - separate EU cells with evacuation; the private-cloud install on NORDWERK's IdP and keys;
  - a capability accepted for the Regensburg domain only, with expiring evidence;
  - the investor and commercial package, which has no synthetic demonstration.

## Rules for every act

- **Rehearse on a restored copy first**, with its own Redis and a vault clone; then run on `eye_demo`. Only the coordinator (A1) runs on `eye_demo`.
- **Look up every object at run time;** no hard-coded ids.
- **State demonstration versus production** wherever a substitute is used: synthetic channel, synthetic ERP, public-feed fixtures, local IdP, kind cluster.
- **Leave the owner's pending acts alone:** the B18 package's draft v3 is the owner's to propose, commit or withdraw. Acts never act for the owner.
- **Keep the chapters coherent:** a later act builds on the state an earlier act left (the same corridor, warning, package and objectives), never on a reset database.
