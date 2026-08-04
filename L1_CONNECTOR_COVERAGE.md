# L1 Connector Coverage Matrix — World Observation Layer

> Honest-scope register (approval instruction L). The frozen source universe is
> Volume 0 Appendix B (20 constitutional source classes). **Phase 1 implements
> the first cohort only (3 connectors). Phase 1 does NOT claim the World
> Observation Layer or the source universe is complete.** Every later cohort
> lands through its own approved plan; this matrix is updated per phase.

| # | Source class (Vol 0 App. B) | Phase 1 status | Planned cohort | Notes |
|---|---|---|---|---|
| 1 | Governments | Not implemented | Cohort 2+ | Feeds may partially arrive via RSS where officially published; that does not constitute governments-class coverage |
| 2 | Regulations | Not implemented | Cohort 2+ | |
| 3 | News | **Cohort 1 (partial)** — RSS/Atom publisher feeds only | — | Broadcast/specialist/breaking-event coverage NOT included |
| 4 | Financial Markets | Not implemented | Cohort 3+ | Licensing-gated |
| 5 | Research | Not implemented | Cohort 2+ | |
| 6 | Scientific Papers | Not implemented | Cohort 2+ | |
| 7 | Patents | Not implemented | Cohort 3+ | |
| 8 | Company Filings | Not implemented | Cohort 2+ | |
| 9 | Supply Chains | Not implemented | Cohort 3+ | |
| 10 | IoT | Not implemented | Cohort 4+ | Requires stream ingestion (event-streaming component, not BullMQ) |
| 11 | ERP | Not implemented | Cohort 4+ | Enterprise integration contracts |
| 12 | CRM | Not implemented | Cohort 4+ | |
| 13 | Internal Documents | **Cohort 1 (partial)** — manual file upload (PDF/DOCX/CSV) only | — | No repository/mail/drive integration |
| 14 | Satellites | Not implemented | Cohort 5+ | Licensing + geospatial pipeline |
| 15 | Climate | Not implemented | Cohort 4+ | |
| 16 | Geopolitical Events | Not implemented | Cohort 3+ | |
| 17 | Social Signals | Not implemented | Cohort 5+ | Lawful-collection controls first |
| 18 | APIs | **Cohort 1 (partial)** — generic REST poller (JSON over HTTPS, contract-scoped) | — | Not a universal API integration framework |
| 19 | RSS | **Cohort 1** — RSS/Atom under source contract | — | |
| 20 | Custom Sources | **Cohort 1 (partial)** — via file upload / REST poller under customer-defined contracts | — | Disconnected imports NOT included |

**Coverage summary:** 1 class substantially covered (RSS), 4 partially covered (News, Internal Documents, APIs, Custom), 15 not implemented. The architecture requirement (C-013: support the full canonical universe **without architectural rework**) is satisfied by the connector-adapter contract, source-contract model, and evidence vault — capability breadth arrives cohort by cohort.
