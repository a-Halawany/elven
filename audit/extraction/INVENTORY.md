# Volume extraction inventory

Source: git HEAD `07edd9dcd57e972203fb9e7bbcdab3a398c642b5` (branch phase6-decisions). Bytes retrieved with `git show <HEAD>:<path>`; each blob id recomputed as sha1(`blob <len>\0<bytes>`) and compared with the pinned id and size before extraction.

Tools: pypdf 6.18.0 (PDF, page by page, `=== PAGE n ===` markers), python-docx 1.2.0 (DOCX, body order preserved, `=== PARA n ===` every 50 paragraphs, `## ` prefix on Heading/Title-styled paragraphs, tables as `[TABLE]` blocks with rows joined by ` | `).

Identifier regex: `[A-Z]{1,5}(-[A-Z]{1,4})?-[A-Z]?\d{2,4}(-\d{2,4}){0,2}` (word-bounded) plus layer ids `L\d{1,2}-[CI]\d{2}`. Counts are DISTINCT identifier strings per prefix. Families named in the brief but found in no volume: `IF-`, `V0-`. Near-empty threshold: fewer than 120 characters after the two running-header lines.


## v00 — The_Eye_Volume_0_Product_Constitution_v1.0 elvin.docx

- Path at HEAD: `docs/The_Eye_Volume_0_Product_Constitution_v1.0 elvin.docx`
- Blob: `f079067067d9db0bdf389b0f4a32fcbad15af44f` (verified), 88681 bytes
- Extraction: `/private/tmp/claude-501/-Users-halawany-work-personal-mohammed-new-project/8704aca5-efd0-4164-8e07-dbc1322f9c20/scratchpad/volumes/v00.txt`, source copy `/private/tmp/claude-501/-Users-halawany-work-personal-mohammed-new-project/8704aca5-efd0-4164-8e07-dbc1322f9c20/scratchpad/volumes/src/v00.docx`
- Units: 419 paragraphs, 41 tables (201 rows)
- Characters in extraction file: 92104

### Identifier families (1)

| Prefix | Distinct ids | Range | Example lines |
|---|---|---|---|
| `C` | 52 | C-001 … C-052 | `line 103` CONSTITUTIONAL INVARIANTS / C-051  Constitutional change control / C-052  Documentation inheritance<br>`line 120` CONSTITUTIONAL INVARIANTS / C-001  Category integrity / C-002  Closed strategic loop / C-003  Product boundary<br>`line 142` CONSTITUTIONAL INVARIANTS / C-003  Product boundary / C-006  Enterprise operating standard / C-010  Truth-state separation |

### Headings detected (142; listed up to 120, keyed by paragraph #)

- 3: [Title] Product Constitution
- 9: [Heading 1] Document Control
- 11: [Heading 2] Constitutional authority
- 13: [Heading 2] Normative language
- 19: [Heading 1] Preamble
- 25: [Heading 1] Contents
- 68: [Heading 1] 1  Purpose, Authority, and Use
- 71: [Heading 2] What this volume controls
- 77: [Heading 2] What this volume does not freeze
- 79: [Heading 2] Conformance
- 81: [Heading 1] 2  Mission, Category, and Doctrine
- 83: [Heading 2] Mission
- 85: [Heading 2] The six operating verbs
- 92: [Heading 2] Category definition
- 95: [Heading 1] 3  Product Principles and Prohibitions
- 97: [Heading 2] Founding principles
- 106: [Heading 2] Constitutional prohibitions
- 113: [Heading 1] 4  Customers and Domain Applicability
- 115: [Heading 2] Customer universe
- 117: [Heading 2] Common core
- 119: [Heading 2] Domain specialization
- 121: [Heading 2] Organizational scale
- 123: [Heading 1] 5  Human Authority and Responsible Use
- 125: [Heading 2] Decision sovereignty
- 127: [Heading 2] High-impact boundaries
- 129: [Heading 2] Responsible institutional use
- 131: [Heading 2] Explanation without performative transparency
- 138: [Heading 1] 6  The Strategic Intelligence Lifecycle
- 146: [Heading 2] Lifecycle continuity
- 148: [Heading 2] Re-entry and iteration
- 150: [Heading 1] 7  Canonical Architecture
- 152: [Heading 2] Cross-cutting planes
- 154: [Heading 2] Layer contracts
- 156: [Heading 2] Knowledge Graph as the heart
- 158: [Heading 1] 8  World Observation Layer
- 160: [Heading 2] Source universe
- 162: [Heading 2] Observation object
- 164: [Heading 2] Coverage intelligence
- 166: [Heading 2] Adversarial environment
- 168: [Heading 1] 9  Intelligence Layer
- 170: [Heading 2] Core transformations
- 172: [Heading 2] Intelligence object model
- 178: [Heading 2] Conflict and uncertainty
- 180: [Heading 2] Time and revision
- 182: [Heading 1] 10  Enterprise Memory and Strategic Memory
- 184: [Heading 2] Enterprise Memory
- 186: [Heading 2] Strategic Memory
- 188: [Heading 2] Memory writes
- 190: [Heading 2] Durability and forgetting
- 192: [Heading 1] 11  Knowledge Graph and Strategy Graph
- 194: [Heading 2] Knowledge Graph scope
- 196: [Heading 2] Graph truth model
- 198: [Heading 2] Strategy Graph
- 200: [Heading 2] Ontology governance
- 202: [Heading 1] 12  Digital Twins
- 204: [Heading 2] Canonical twin portfolio
- 206: [Heading 2] Twin anatomy
- 213: [Heading 2] Actual and simulated state
- 215: [Heading 2] Twin confidence
- 217: [Heading 1] 13  Prediction Engine
- 219: [Heading 2] Forecast package
- 221: [Heading 2] Model ensembles and disagreement
- 223: [Heading 2] Evaluation
- 225: [Heading 1] 14  Scenario Intelligence
- 227: [Heading 2] Scenario anatomy
- 229: [Heading 2] Scenario portfolio
- 231: [Heading 2] Living scenarios
- 233: [Heading 2] Scenario Marketplace
- 235: [Heading 1] 15  Simulation Engine
- 237: [Heading 2] Simulation classes
- 239: [Heading 2] Experiment contract
- 241: [Heading 2] Causal discipline
- 243: [Heading 2] Human challenge
- 245: [Heading 1] 16  Decision Intelligence
- 247: [Heading 2] Decision object
- 249: [Heading 2] Option architecture
- 251: [Heading 2] Recommendation contract
- 253: [Heading 2] Decision Replay
- 255: [Heading 1] 17  Executive Operating System
- 257: [Heading 2] Executive workspaces
- 259: [Heading 2] Briefing as a product
- 261: [Heading 2] Attention governance
- 263: [Heading 2] Multiple interfaces, one truth
- 265: [Heading 1] 18  Multi-Agent Architecture
- 267: [Heading 2] Agent contract
- 269: [Heading 2] Orchestration and separation of duties
- 271: [Heading 2] Tool and model boundaries
- 273: [Heading 2] Learning boundary
- 280: [Heading 1] 19  Trust and Provenance Layer
- 282: [Heading 2] Trust envelope
- 284: [Heading 2] Provenance graph
- 286: [Heading 2] Trust policy
- 288: [Heading 2] Audit and non-repudiation
- 290: [Heading 1] 20  Data Governance and Interoperability
- 292: [Heading 2] Data product model
- 294: [Heading 2] Canonical semantics
- 296: [Heading 2] Ownership and federation
- 298: [Heading 2] Interoperability and exit
- 300: [Heading 1] 21  Security, Privacy, Sovereignty, and Resilience
- 302: [Heading 2] Zero-trust operating model
- 304: [Heading 2] Data and model protection
- 306: [Heading 2] AI and information threats
- 308: [Heading 2] Privacy and lawful use
- 310: [Heading 2] Resilience and safe degradation
- 312: [Heading 1] 22  Deployment Constitution
- 314: [Heading 2] Semantic parity
- 316: [Heading 2] Control-plane boundaries
- 318: [Heading 2] Portability and reproducibility
- 320: [Heading 1] 23  Continuous Learning and Evaluation
- 322: [Heading 2] Learning loop
- 329: [Heading 2] Feedback is evidence, not truth
- 331: [Heading 2] Evaluation system
- 333: [Heading 2] Tenant isolation
- 335: [Heading 1] 24  Proactive Intelligence and Marketplaces
- 337: [Heading 2] Weak signals and early warning
- 339: [Heading 2] Risk and opportunity symmetry
- 341: [Heading 2] Strategic Health Score
- 343: [Heading 2] Agent Marketplace
- 345: [Heading 2] Scenario Marketplace
- 347: [Heading 1] 25  Product Experience and Operational Quality
- … 22 more not listed

## v01 — The_Eye_Volume_1_Executive_Vision_Book_v1.0 elvin.docx

- Path at HEAD: `docs/The_Eye_Volume_1_Executive_Vision_Book_v1.0 elvin.docx`
- Blob: `cb6de42bbb4c82491632934d74435d6c7f6bf011` (verified), 609027 bytes
- Extraction: `/private/tmp/claude-501/-Users-halawany-work-personal-mohammed-new-project/8704aca5-efd0-4164-8e07-dbc1322f9c20/scratchpad/volumes/v01.txt`, source copy `/private/tmp/claude-501/-Users-halawany-work-personal-mohammed-new-project/8704aca5-efd0-4164-8e07-dbc1322f9c20/scratchpad/volumes/src/v01.docx`
- Units: 624 paragraphs, 5 tables (123 rows)
- Characters in extraction file: 111696

### Identifier families (1)

| Prefix | Distinct ids | Range | Example lines |
|---|---|---|---|
| `C` | 52 | C-001 … C-052 | `line 30` This book inherits the canonical product name, mission, operating verbs, product principles, ten-layer architecture, human-authority doctrine, source <br>`line 124` CONSTITUTIONAL INHERITANCE  /  C-001  ·  C-002  ·  C-004  ·  C-052<br>`line 142` CONSTITUTIONAL INHERITANCE  /  C-002  ·  C-032  ·  C-049 |

### Headings detected (186; listed up to 120, keyed by paragraph #)

- 6: [Title] Executive Vision Book
- 12: [Heading 1] Document Control
- 15: [Heading 2] Constitutional inheritance
- 17: [Heading 2] Normative relationship
- 19: [Heading 1] Founding Perspective
- 26: [Heading 1] Contents
- 92: [Heading 1] Executive Thesis
- 94: [Heading 2] The problem
- 96: [Heading 2] The category
- 98: [Heading 2] The strategic promise
- 114: [Heading 1] 1  The Strategic Environment Has Changed
- 116: [Heading 2] The compression of decision time
- 118: [Heading 2] The widening field of consequence
- 120: [Heading 2] From periodic planning to continuous orientation
- 124: [Heading 1] 2  Why Institutions Lose Foresight
- 126: [Heading 2] Fragmentation creates false calm
- 128: [Heading 2] Memory disappears at organizational boundaries
- 130: [Heading 2] Uncertainty is compressed into narrative
- 137: [Heading 1] 3  The Cost of Fragmented Intelligence
- 139: [Heading 2] Delay is a strategic cost
- 141: [Heading 2] Local optimization becomes enterprise contradiction
- 143: [Heading 2] The hidden tax on executive attention
- 147: [Heading 1] 4  A New Operating Category
- 149: [Heading 2] Why the operating-system model matters
- 151: [Heading 2] More than the interfaces it may contain
- 153: [Heading 2] A category built around decisions
- 157: [Heading 1] 5  The Founding Mission and Doctrine
- 159: [Heading 2] The mission
- 163: [Heading 2] The six operating verbs
- 172: [Heading 1] 6  Human Authority Is a System Property
- 174: [Heading 2] Humans decide
- 176: [Heading 2] Human control must be substantive
- 178: [Heading 2] Machine speed, human accountability
- 189: [Heading 1] 7  One Closed Strategic Loop
- 191: [Heading 2] Continuity from evidence to outcome
- 193: [Heading 2] The loop re-enters itself
- 195: [Heading 2] The governing object model
- 199: [Heading 1] 8  World Observation as a Persistent Field of View
- 201: [Heading 2] A universal source universe
- 203: [Heading 2] Observation with chain of custody
- 205: [Heading 2] Coverage intelligence
- 212: [Heading 1] 9  From Evidence to Understanding
- 214: [Heading 2] A governed transformation system
- 216: [Heading 2] Truth states prevent semantic collapse
- 218: [Heading 2] Disagreement is retained, not averaged away
- 222: [Heading 1] 10  Enterprise Memory and Strategic Memory
- 224: [Heading 2] Enterprise Memory
- 226: [Heading 2] Strategic Memory
- 228: [Heading 2] Permanent memory with lawful forgetting
- 232: [Heading 1] 11  The Knowledge Graph as the Shared Model of Reality
- 236: [Heading 2] Everything connects through governed meaning
- 238: [Heading 2] Time is native to the graph
- 240: [Heading 2] The Strategy Graph
- 243: [Heading 1] 12  Digital Twins as Living Strategic Models
- 247: [Heading 2] A system of twins, not a single model
- 249: [Heading 2] Grounding and versioning
- 251: [Heading 2] From representation to strategic experimentation
- 254: [Heading 1] 13  Prediction Across Six Horizons
- 258: [Heading 2] Different horizons require different questions
- 260: [Heading 2] Forecasts are distributions, not declarations
- 262: [Heading 2] Prediction serves decision, not spectacle
- 265: [Heading 1] 14  Scenario Intelligence and the Discipline of Multiple Futures
- 267: [Heading 2] Coherent futures, not narrative decoration
- 269: [Heading 2] Living scenarios
- 271: [Heading 2] Strategy under uncertainty
- 275: [Heading 1] 15  Simulation Before Commitment
- 277: [Heading 2] Testing interventions and shocks
- 279: [Heading 2] Reproducibility is the basis of trust
- 281: [Heading 2] Simulation informs judgment
- 288: [Heading 1] 16  Decision Intelligence and Accountable Choice
- 292: [Heading 2] A complete decision package
- 294: [Heading 2] Authority, approval, and override
- 296: [Heading 2] The unit of institutional learning
- 299: [Heading 1] 17  The Executive Operating System
- 301: [Heading 2] A workspace organized around responsibility
- 303: [Heading 2] Briefing as a live intelligence product
- 305: [Heading 2] Attention governance
- 309: [Heading 1] 18  A Governed Society of AI Agents
- 313: [Heading 2] Specialized families, common governance
- 315: [Heading 2] Orchestration and separation of duties
- 317: [Heading 2] Learning without silent self-modification
- 328: [Heading 1] 19  Proactive Intelligence and Weak Signals
- 330: [Heading 2] From query response to persistent sensing
- 332: [Heading 2] Weak signals remain weak
- 334: [Heading 2] Proactivity with attention policy
- 338: [Heading 1] 20  Early Warning with Context
- 340: [Heading 2] Warnings are governed intelligence products
- 342: [Heading 2] Deduplication and prioritization
- 344: [Heading 2] Warnings connect to response
- 351: [Heading 1] 21  Risk and Opportunity Are Symmetric
- 353: [Heading 2] Beyond defensive risk registers
- 355: [Heading 2] Opportunity is governed with equal discipline
- 357: [Heading 2] Choices combine mitigation and exploitation
- 361: [Heading 1] 22  Domain Intelligence as One Connected World
- 363: [Heading 2] Specialist depth without semantic isolation
- 365: [Heading 2] Cross-domain effects create strategic consequence
- 367: [Heading 2] Shared evidence, explicit methods
- 375: [Heading 1] 23  Supply Chain and Operational Resilience
- 377: [Heading 2] A connected dependency model
- 379: [Heading 2] From disruption alert to consequence
- 381: [Heading 2] Resilience as an executive choice
- 385: [Heading 1] 24  The Strategic Health Score
- 387: [Heading 2] A composite view anchored in objectives
- 389: [Heading 2] Every component remains inspectable
- 391: [Heading 2] Health is directional and decision-linked
- 395: [Heading 1] 25  Decision Replay and Institutional Learning
- 397: [Heading 2] Learning without hindsight distortion
- 399: [Heading 2] Separate decision quality from outcome luck
- 401: [Heading 2] Lessons become governed assets
- 408: [Heading 1] 26  The Strategy Graph and Organizational Alignment
- 410: [Heading 2] Strategy becomes inspectable
- 412: [Heading 2] Alignment is a relationship problem
- 414: [Heading 2] Change propagates through intent
- 418: [Heading 1] 27  A Strategic Cadence from Daily Signals to Five-Year Choices
- 420: [Heading 2] Daily and event-driven orientation
- 422: [Heading 2] Weekly and monthly governance
- 424: [Heading 2] Annual and multi-year strategy
- 435: [Heading 1] 28  Governments and Defence
- 437: [Heading 2] A whole-of-system view
- 439: [Heading 2] Authority and classification by design
- … 66 more not listed

## v02 — The_Eye_Volume_2_Technical_Presentation_v1.1 elvin.pdf

- Path at HEAD: `docs/The_Eye_Volume_2_Technical_Presentation_v1.1 elvin.pdf`
- Blob: `62925dd018a9006a476da7cc0d2a0daf87eb1d2f` (verified), 14213756 bytes
- Extraction: `/private/tmp/claude-501/-Users-halawany-work-personal-mohammed-new-project/8704aca5-efd0-4164-8e07-dbc1322f9c20/scratchpad/volumes/v02.txt`, source copy `/private/tmp/claude-501/-Users-halawany-work-personal-mohammed-new-project/8704aca5-efd0-4164-8e07-dbc1322f9c20/scratchpad/volumes/src/v02.pdf`
- Units: 50 pages
- Characters in extraction file: 841
- PDF metadata: producer='LibreOfficeDev 26.8.0.0.alpha0 (X86_64)' creator='Impress' title='Presentation'
- Empty pages (50): 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27, 28, 29, 30, 31, 32, 33, 34, 35, 36, 37, 38, 39, 40, 41, 42, 43, 44, 45, 46, 47, 48, 49, 50
- Near-empty pages (0): none

### Identifier families (0)

| Prefix | Distinct ids | Range | Example lines |
|---|---|---|---|

### Headings detected (0; listed up to 120, keyed by page)


## v03 — The_Eye_Volume_3_Technical_Architecture_v1.0 elvin.pdf

- Path at HEAD: `docs/The_Eye_Volume_3_Technical_Architecture_v1.0 elvin.pdf`
- Blob: `dab2408476ff2ddab85656ad586bad6414b49c66` (verified), 3679286 bytes
- Extraction: `/private/tmp/claude-501/-Users-halawany-work-personal-mohammed-new-project/8704aca5-efd0-4164-8e07-dbc1322f9c20/scratchpad/volumes/v03.txt`, source copy `/private/tmp/claude-501/-Users-halawany-work-personal-mohammed-new-project/8704aca5-efd0-4164-8e07-dbc1322f9c20/scratchpad/volumes/src/v03.pdf`
- Units: 122 pages
- Characters in extraction file: 252914
- PDF metadata: producer='LibreOfficeDev 26.8.0.0.alpha0 (X86_64)' creator='Writer' title='The Eye — Volume 3: Technical Architecture'
- Empty pages (0): none
- Near-empty pages (0): none

### Identifier families (4)

| Prefix | Distinct ids | Range | Example lines |
|---|---|---|---|
| `L{n}-C` | 92 | L1-C01 … L9-C09 | `p25` L1-C01 Source Registry and Contract Service<br>`p25` L1-C02 Connector Runtime and Adapter SDK<br>`p25` L1-C03 Collection Scheduler and Subscription |
| `C` | 52 | C-001 … C-052 | `p2` CONSTITUTIONAL INHERITANCE  /  C-006  ·  C-008  ·  C-051  ·  C-052<br>`p3` CONSTITUTIONAL INHERITANCE  /  C-001  ·  C-002  ·  C-004  ·  C-005  ·  C-035  ·  C-042<br>`p7` CONSTITUTIONAL INHERITANCE  /  C-001  ·  C-002  ·  C-004  ·  C-008  ·  C-009  ·  C-042 |
| `L{n}-I` | 50 | L1-I01 … L9-I05 | `p26` L1-I01 RegisterSource Command Creates or versions a governed source contract after<br>`p26` L1-I02 Acquire Command / stream Collects content or state under contract, purpose, rate, and<br>`p26` L1-I03 ObservationRecorded Domain event Announces an immutable observation and evidence |
| `ADR` | 20 | ADR-0001 … ADR-0020 | `p121` ADR-0001 Canonical ten-layer<br>`p121` ADR-0002 Knowledge Graph<br>`p121` ADR-0003 Canonical intelligence |

### Headings detected (60; listed up to 120, keyed by page)

- 8: PART I — System Definition
- 9: 1  Authority, Scope, and Architecture Status
- 10: 2  System Context and Stakeholders
- 12: 3  The Strategic Intelligence Lifecycle
- 14: 4  The Canonical Ten-Layer Architecture
- 16: 5  Cross-Cutting Control Planes
- 18: 6  System Boundaries and Trust Zones
- 20: 7  Canonical Intelligence Object Model
- 22: 8  Interaction Styles and the Contract Envelope
- 24: PART II — Canonical Layer Architecture
- 25: 9  World Observation Layer
- 27: 10  Intelligence Layer
- 29: 11  Enterprise Memory
- 31: 12  Knowledge Graph
- 34: 13  Digital Twins
- 36: 14  Prediction Engine
- 38: 15  Scenario Intelligence
- 40: 16  Simulation Engine
- 42: 17  Decision Intelligence
- 45: 18  Executive Operating System
- 47: PART III — Shared Intelligence Substrates
- 48: 19  Strategy Graph
- 50: 20  Temporal Truth and Truth-State Separation
- 52: 21  Trust, Provenance, and Chain of Custody
- 54: 22  Identity, Access, and Policy Enforcement
- 55: 23  Multi-Agent Orchestration
- 57: 24  Model Gateway and Model Pluralism
- 58: 25  Workflow, State, and Human Gates
- 59: 26  Evaluation and Continuous Learning
- 60: 27  Search, Retrieval, and Context Assembly
- 61: 28  Marketplace Package Architecture
- 62: 29  Proactive Intelligence and Early Warning
- 64: PART IV — Runtime Intelligence Flows
- 65: 30  Observe-to-Evidence Flow
- 67: 31  Evidence-to-Understanding Flow
- 69: 32  Correction and Withdrawal Propagation
- 71: 33  Graph-to-Twin Reconciliation
- 73: 34  Forecast Production Flow
- 75: 35  Scenario Branch Lifecycle
- 77: 36  Simulation Run Lifecycle
- 79: 37  Decision Package and Approval Flow
- 81: 38  Decision Replay and Outcome Learning
- 83: PART V — Deployment and Enterprise
- 84: 39  Deployment Model and Semantic Parity
- 85: 40  SaaS Operating Envelope
- 86: 41  Private Cloud Operating Envelope
- 87: 42  On-Premise Operating Envelope
- 88: 43  Sovereignty, Residency, Keys, and Disconnected Operation
- 89: 44  Security Architecture
- 90: 45  Resilience and Safe Degradation
- 91: 46  Observability and Site Reliability
- 92: 47  Portability, Interoperability, and Exit
- 93: PART VI — Architecture Governance
- 94: 48  Architecture Decision Rights
- 96: 49  Conformance and Exceptions
- 97: 50  Quality Attribute Contracts
- 98: 51  Release, Configuration, and Schema Evolution
- 99: 52  Tenant and Domain Specialization
- 100: 53  Architecture Verification
- 101: 54  Boundaries to Volumes 4–7

## v04 — The_Eye_Volume_4_Engineering_Specification_v1.0 elvin.pdf

- Path at HEAD: `docs/The_Eye_Volume_4_Engineering_Specification_v1.0 elvin.pdf`
- Blob: `08efeffbce4f901b05b1d5c9a13a58377b116c96` (verified), 7185556 bytes
- Extraction: `/private/tmp/claude-501/-Users-halawany-work-personal-mohammed-new-project/8704aca5-efd0-4164-8e07-dbc1322f9c20/scratchpad/volumes/v04.txt`, source copy `/private/tmp/claude-501/-Users-halawany-work-personal-mohammed-new-project/8704aca5-efd0-4164-8e07-dbc1322f9c20/scratchpad/volumes/src/v04.pdf`
- Units: 195 pages
- Characters in extraction file: 459995
- PDF metadata: producer='LibreOfficeDev 26.8.0.0.alpha0 (X86_64)' creator='Writer' title='The Eye — Volume 4: Engineering Specification'
- Empty pages (0): none
- Near-empty pages (0): none

### Identifier families (26)

| Prefix | Distinct ids | Range | Example lines |
|---|---|---|---|
| `ES` | 410 | ES-01-001 … ES-72-005 | `p10` ES-01-001<br>`p10` ES-01-002<br>`p10` ES-01-003 |
| `L{n}-C` | 92 | L1-C01 … L9-C09 | `p69` L1-C01 Source Registry and Contract<br>`p69` L1-C02 Connector Runtime and<br>`p69` L1-C03 Collection Scheduler and |
| `C` | 52 | C-001 … C-052 | `p2` CONSTITUTIONAL INHERITANCE  /  C-006  ·  C-008  ·  C-051  ·  C-052<br>`p3` CONSTITUTIONAL INHERITANCE  /  C-004  ·  C-005  ·  C-008  ·  C-035  ·  C-042  ·  C-049  ·  C-052<br>`p8` CONSTITUTIONAL INHERITANCE  /  C-001  ·  C-004  ·  C-005  ·  C-008  ·  C-035  ·  C-042  ·  C-052 |
| `L{n}-I` | 50 | L1-I01 … L9-I05 | `p70` L1-I01 RegisterSource Command Typed asynchronous or bounded<br>`p70` L1-I02 Acquire Command /<br>`p70` L1-I03 ObservationRecorded Domain event Immutable versioned domain event |
| `SLO` | 22 | SLO-001 … SLO-022 | `p183` SLO-001 Canonical write<br>`p183` SLO-002 Canonical read<br>`p183` SLO-003 Event publication |
| `ADR` | 20 | ADR-0001 … ADR-0020 | `p192` ADR-0001 Canonical ten-layer<br>`p192` ADR-0002 Knowledge Graph<br>`p192` ADR-0003 Canonical intelligence |
| `TS` | 20 | TS-001 … TS-020 | `p184` TS-001 Unit and property Local logic, invariants, state transitions, boundary<br>`p184` TS-002 Schema conformance Canonical objects, envelopes, errors, compatibility Every change Contract authority<br>`p184` TS-003 Consumer contract Provider/consumer combinations and degraded |
| `EYE-AUT` | 3 | EYE-AUT-001 … EYE-AUT-003 | `p181` EYE-AUT-001 access_denied Current policy denies the normalized action. No Do not retry unchanged; request<br>`p181` EYE-AUT-002 policy_indeterminate Authorization cannot be safely resolved. Bounded Retry only under published<br>`p181` EYE-AUT-003 obligation_unmet A required control obligation cannot be |
| `EYE-STA` | 3 | EYE-STA-001 … EYE-STA-003 | `p181` EYE-STA-001 object_not_found No authorized object version matches the<br>`p181` EYE-STA-002 version_conflict Expected and current authoritative versions<br>`p181` EYE-STA-003 truth_state_prohibited The operation is not valid for the object's |
| `EYE-WFL` | 3 | EYE-WFL-001 … EYE-WFL-003 | `p181` EYE-WFL-001 workflow_conflict Transition is invalid for current durable state. No Refresh instance and use a<br>`p181` EYE-WFL-002 human_gate_required A named human authorization is required<br>`p181` EYE-WFL-003 deadline_exceeded Work cannot complete within its useful or |
| `EYE-IDN` | 2 | EYE-IDN-001 … EYE-IDN-002 | `p181` EYE-IDN-001 authentication_required No acceptable principal proof is present. No Authenticate at required assurance.<br>`p181` EYE-IDN-002 authentication_failed Credential, audience, issuer, device, or |
| `EYE-QUA` | 2 | EYE-QUA-001 … EYE-QUA-002 | `p181` EYE-QUA-001 quality_insufficient Product quality is below declared decision-<br>`p181` EYE-QUA-002 result_abstained The method cannot support a responsible |
| `EYE-REQ` | 2 | EYE-REQ-001 … EYE-REQ-002 | `p181` EYE-REQ-001 invalid_request Request cannot be interpreted under the<br>`p181` EYE-REQ-002 unsupported_version Contract, schema, ontology, model, or |
| `EYE-AGT` | 1 | EYE-AGT-001 … EYE-AGT-001 | `p181` EYE-AGT-001 capability_denied Agent lacks a valid grant for the tool, data, or |
| `EYE-AUD` | 1 | EYE-AUD-001 … EYE-AUD-001 | `p181` EYE-AUD-001 audit_unavailable Required durable evidence cannot be |
| `EYE-CAP` | 1 | EYE-CAP-001 … EYE-CAP-001 | `p181` EYE-CAP-001 capacity_exhausted Admission control cannot safely accept |
| `EYE-DEG` | 1 | EYE-DEG-001 … EYE-DEG-001 | `p181` EYE-DEG-001 capability_degraded Requested capability is constrained by an |
| `EYE-DEP` | 1 | EYE-DEP-001 … EYE-DEP-001 | `p181` EYE-DEP-001 dependency_unavailabl |
| `EYE-EXT` | 1 | EYE-EXT-001 … EYE-EXT-001 | `p181` EYE-EXT-001 external_effect_unknow |
| `EYE-GOV` | 1 | EYE-GOV-001 … EYE-GOV-001 | `p182` EYE-GOV-001 conformance_blocked Artifact or operation lacks current governing |
| `EYE-INT` | 1 | EYE-INT-001 … EYE-INT-001 | `p181` EYE-INT-001 integrity_failure Digest, signature, ordering, or custody |
| `EYE-MDL` | 1 | EYE-MDL-001 … EYE-MDL-001 | `p181` EYE-MDL-001 no_conforming_model No approved model satisfies task and policy |
| `EYE-PRV` | 1 | EYE-PRV-001 … EYE-PRV-001 | `p181` EYE-PRV-001 provenance_incomplete Required source or transformation lineage is |
| `EYE-RCV` | 1 | EYE-RCV-001 … EYE-RCV-001 | `p182` EYE-RCV-001 reconciliation_required Recovery or failover left state requiring |
| `EYE-TEN` | 1 | EYE-TEN-001 … EYE-TEN-001 | `p181` EYE-TEN-001 domain_context_invalid Tenant or domain context is absent, |
| `EYE-TMP` | 1 | EYE-TMP-001 … EYE-TMP-001 | `p181` EYE-TMP-001 temporal_scope_invalid Time interval, clock quality, or as-of |

### Headings detected (81; listed up to 120, keyed by page)

- 9: PART I — Engineering Authority
- 10: 1  Engineering Authority and Scope
- 12: 2  Specification Hierarchy and Conformance
- 14: 3  Normative Requirement Model
- 16: 4  Product Boundary and Engineering Decomposition
- 18: 5  Engineering Principles
- 20: 6  Cross-Volume Traceability
- 22: PART II — Platform Construction Model
- 23: 7  Runtime Topology
- 25: 8  Customer Intelligence Domain
- 27: 9  Intelligence Cells
- 29: 10  Shared Control Services
- 31: 11  Component Ownership and Service Boundaries
- 33: 12  State Ownership and Persistence
- 35: 13  Cross-Cutting Control Enforcement
- 37: 14  Deployment Semantic Parity
- 39: PART III — Contract System
- 40: 15  Canonical Service Contract
- 42: 16  Synchronous API Profile
- 44: 17  Command Profile
- 46: 18  Query and Consistency Profile
- 47: 19  Event Profile
- 49: 20  Canonical Contract Envelope
- 51: 21  Error, Abstention, and Partial-Result Model
- 52: 22  Idempotency, Ordering, Retry, and Compensation
- 53: 23  Versioning, Compatibility, and Contract Registry
- 54: PART IV — Object and State Engineering
- 55: 24  Canonical Intelligence Object Header
- 57: 25  Identity, Naming, and Tenancy
- 58: 26  Temporal Truth Engineering
- 60: 27  Truth State, Confidence, and Uncertainty
- 62: 28  Provenance and Lineage Engineering
- 64: 29  Policy, Classification, Retention, and Rights
- 66: 30  Correction, Supersession, and Projection Rebuild
- 68: PART V — Canonical Layer Implementations
- 69: 31  World Observation Layer
- 72: 32  Intelligence Layer
- 75: 33  Enterprise Memory
- 78: 34  Knowledge Graph
- 81: 35  Digital Twins
- 84: 36  Prediction Engine
- 87: 37  Scenario Intelligence
- 90: 38  Simulation Engine
- 93: 39  Decision Intelligence
- 96: 40  Executive Operating System
- 99: PART VI — Runtime Intelligence Execution
- 100: 41  Durable Workflow Runtime
- 102: 42  Human Gates and Approvals
- 104: 43  Multi-Agent Execution Runtime
- 106: 44  Agent Tool and Capability Control
- 108: 45  Model Gateway and Inference Runtime
- 110: 46  Evaluation and Fitness
- 112: 47  Proactive Warning Runtime
- 114: 48  Decision Replay and Governed Learning
- 116: PART VII — Security, Trust, and Sovereignty
- 117: 49  Identity and Authentication
- 119: 50  Authorization and Policy Enforcement
- 121: 51  Tenant and Domain Isolation
- 123: 52  Cryptography, Keys, and Secrets
- 125: 53  Network Trust and Controlled Egress
- 127: 54  Privacy, Minimization, and Sovereignty
- 129: 55  Audit and Non-Repudiation
- 131: 56  Software Supply Chain and Marketplaces
- 133: PART VIII — Reliability and Operations
- 134: 57  Quality Contracts and SLOs
- 136: 58  Performance and Capacity Engineering
- 138: 59  Availability and Resilience
- 140: 60  Degraded Service Semantics
- 142: 61  Backup, Recovery, and Disaster Recovery
- 144: 62  Observability and Telemetry
- 146: 63  Incident, Change, and Problem Management
- 148: 64  Operational Data Lifecycle
- 150: PART IX — Delivery and Verification
- 151: 65  Repository and Module Standards
- 153: 66  Configuration and Feature Control
- 155: 67  Test Architecture
- 157: 68  CI/CD and Release Gates
- 159: 69  Environment Promotion
- 161: 70  Deployment Packaging
- 163: 71  Operational Acceptance
- 165: 72  Engineering Governance and Exceptions

## v05 — The_Eye_Volume_5_AI_Architecture_v1.0 elvin.pdf

- Path at HEAD: `docs/The_Eye_Volume_5_AI_Architecture_v1.0 elvin.pdf`
- Blob: `cc97ed452c263adc1fa01028e67677d71efe61b1` (verified), 10292126 bytes
- Extraction: `/private/tmp/claude-501/-Users-halawany-work-personal-mohammed-new-project/8704aca5-efd0-4164-8e07-dbc1322f9c20/scratchpad/volumes/v05.txt`, source copy `/private/tmp/claude-501/-Users-halawany-work-personal-mohammed-new-project/8704aca5-efd0-4164-8e07-dbc1322f9c20/scratchpad/volumes/src/v05.pdf`
- Units: 199 pages
- Characters in extraction file: 449990
- PDF metadata: producer='LibreOfficeDev 26.8.0.0.alpha0 (X86_64)' creator='Writer' title='The Eye — Volume 5: AI Architecture'
- Empty pages (0): none
- Near-empty pages (0): none

### Identifier families (9)

| Prefix | Distinct ids | Range | Example lines |
|---|---|---|---|
| `AI` | 360 | AI-01-001 … AI-72-005 | `p10` AI-01-001<br>`p10` AI-01-002<br>`p10` AI-01-003 |
| `AI-C` | 57 | AI-C001 … AI-C057 | `p163` AI-C001 Model<br>`p163` AI-C002 Model<br>`p163` AI-C003 Model |
| `C` | 52 | C-001 … C-052 | `p2` CONSTITUTIONAL INHERITANCE  /  C-004  ·  C-005  ·  C-008  ·  C-028  ·  C-051  ·  C-052<br>`p3` CONSTITUTIONAL INHERITANCE  /  C-001  ·  C-004  ·  C-005  ·  C-024  ·  C-028  ·  C-035  ·  C-044  ·  C-052<br>`p8` CONSTITUTIONAL INHERITANCE  /  C-001  ·  C-004  ·  C-005  ·  C-009  ·  C-024  ·  C-028  ·  C-035  ·  C-044  ·  C-052 |
| `AG` | 44 | AG-001 … AG-044 | `p166` AG-001 Observation Agent Acquisition<br>`p166` AG-002 Crawler Agent Acquisition<br>`p166` AG-003 Search Agent Acquisition |
| `EM` | 32 | EM-001 … EM-032 | `p181` EM-001 Correctness Exact task and field correctness against governed reference Task + population +<br>`p181` EM-002 Evidence faithfulness Material claims supported by resolved evidence Task + population +<br>`p181` EM-003 Citation precision Citations support the associated claim Task + population + |
| `AR` | 30 | AR-001 … AR-030 | `p183` AR-001 Unsupported factual claim Evidence binding, product admission, abstention, correction<br>`p183` AR-002 Fabricated or misaligned citation Citation resolver, span validation, provenance gate Adversarial test + runtime<br>`p183` AR-003 Identity or relationship error Candidate state, confidence, stewardship, merge/split history Adversarial test + runtime |
| `AI-ADR` | 24 | AI-ADR-001 … AI-ADR-024 | `p195` AI-ADR-001 AI remains subordinate to the ten<br>`p195` AI-ADR-002 Human final authority is non-<br>`p195` AI-ADR-003 Task contracts are provider- |
| `MC` | 20 | MC-001 … MC-020 | `p171` MC-001 Large language<br>`p171` MC-002 Vision-language<br>`p171` MC-003 Speech and audio |
| `TC` | 18 | TC-00 … TC-17 | `p180` TC-00 Observe only Read public or approved non-sensitive<br>`p180` TC-01 Restricted read Read protected internal object or source Disclosure and inference risk Purpose + object policy<br>`p180` TC-02 Search Query approved indexes or external |

### Headings detected (81; listed up to 120, keyed by page)

- 9: PART I — AI Authority
- 10: 1  AI Architecture Authority and Scope
- 12: 2  AI Specification Hierarchy and Conformance
- 14: 3  Human Decision Sovereignty
- 16: 4  Explainability by Construction
- 18: 5  Model, Method, and Agent Pluralism
- 20: 6  AI Traceability and Documentation Inheritance
- 22: PART II — AI System Architecture
- 23: 7  AI System Context
- 25: 8  AI Plane Decomposition
- 27: 9  AI Product and Value Flow
- 29: 10  Model Control Plane
- 31: 11  Agent Control Plane
- 33: 12  Context Control Plane
- 35: 13  Knowledge, Memory, and Twin Grounding Fabric
- 37: 14  Evaluation, Governance, and Learning Planes
- 39: PART III — Model and Inference Platform
- 40: 15  Model Identity, Registry, and Lifecycle
- 42: 16  Model Gateway, Routing, and Resolution
- 44: 17  Model Adapters and Provider Abstraction
- 46: 18  Prompt, Instruction, and Policy Artifacts
- 48: 19  Context Assembly and Budgeting
- 50: 20  Structured Output and Product Admission
- 52: 21  Inference Security and Privacy Boundary
- 54: 22  Inference Capacity, Latency, and Economics
- 56: PART IV — Context, Retrieval, and Grounding
- 57: 23  Hybrid Retrieval Architecture
- 59: 24  Graph Retrieval and Graph Reasoning
- 61: 25  Enterprise, Strategic, and Agent Memory Boundaries
- 63: 26  Temporal and Version-Aware Context
- 65: 27  Entity and Relationship Grounding
- 67: 28  Digital Twin Grounding for AI
- 69: 29  Provenance, Citations, and Evidence Binding
- 71: PART V — Multi-Agent Runtime
- 72: 30  Agent Identity, Role, and Package
- 74: 31  Agent Execution Lifecycle
- 76: 32  Planner Agent Architecture
- 78: 33  Supervisor Agent Architecture
- 80: 34  Workflow Agent and Durable Orchestration
- 82: 35  Agent Communication and Coordination Protocol
- 84: 36  Tool, Capability, Sandbox, and Side-Effect Architecture
- 86: 37  Human Gates and Mixed-Initiative Collaboration
- 88: 38  Agent Context, Memory, Checkpointing, and Replay
- 90: PART VI — Observation and Understanding
- 91: 39  Observation, Crawler, and Collection Agents
- 93: 40  Search Agent
- 95: 41  Cleaning and Classification Agents
- 97: 42  Summarization Agent
- 99: 43  Named Entity Recognition and Identity Resolution Agents
- 101: 44  Relationship Agent
- 103: 45  Knowledge Graph and Ontology Agents
- 105: 46  Reasoning, Evidence, Provenance, and Dissent Agents
- 107: 47  Governance, Evaluation, and Learning Agents
- 109: PART VII — Foresight, Decision, and Domain
- 110: 48  Prediction Agent
- 112: 49  Scenario Agent
- 114: 50  Simulation Agent
- 116: 51  Decision Agent
- 118: 52  Risk and Opportunity Agents
- 120: 53  Competitor and Supply Chain Agents
- 122: 54  Geopolitical and Technology Agents
- 124: 55  Cyber and Financial Agents
- 126: 56  Executive Briefing and Reporting Agents
- 128: 57  Weak Signal and Early Warning Agents
- 130: PART VIII — AI Trust, Safety, and Explainability
- 131: 58  AI Risk Taxonomy and Consequence Classes
- 133: 59  Safe Action and Side-Effect Governance
- 135: 60  Prompt, Instruction, and Tool Security
- 137: 61  Data, Model, and Agent Privacy
- 139: 62  Model and Agent Safety Architecture
- 141: 63  Uncertainty, Calibration, Abstention, and Partial Results
- 143: 64  Explanation, Contestability, and Human Factors
- 145: 65  AI Audit, Non-Repudiation, and Accountability
- 147: PART IX — Evaluation, Learning, and Operations
- 148: 66  AI Evaluation Architecture
- 150: 67  Red Teaming and Safety Testing
- 152: 68  Runtime Monitoring, Drift, and Fitness
- 154: 69  Governed Learning and Adaptation
- 156: 70  AI Release, Promotion, Rollback, and Retirement
- 158: 71  AI Deployment Parity and Sovereignty
- 160: 72  AI Incident, Continuity, and Governance Closure

## v06 — The_Eye_Volume_6_Infrastructure_Architecture_v1.0 elvin .pdf

- Path at HEAD: `docs/The_Eye_Volume_6_Infrastructure_Architecture_v1.0 elvin .pdf`
- Blob: `9a33d8221892792afffec3c719ae113359294155` (verified), 11356353 bytes
- Extraction: `/private/tmp/claude-501/-Users-halawany-work-personal-mohammed-new-project/8704aca5-efd0-4164-8e07-dbc1322f9c20/scratchpad/volumes/v06.txt`, source copy `/private/tmp/claude-501/-Users-halawany-work-personal-mohammed-new-project/8704aca5-efd0-4164-8e07-dbc1322f9c20/scratchpad/volumes/src/v06.pdf`
- Units: 193 pages
- Characters in extraction file: 589688
- PDF metadata: producer='LibreOfficeDev 26.8.0.0.alpha0 (X86_64)' creator='Writer' title='The Eye - Volume 6: Infrastructure Architecture'
- Empty pages (0): none
- Near-empty pages (0): none

### Identifier families (19)

| Prefix | Distinct ids | Range | Example lines |
|---|---|---|---|
| `IA` | 432 | IA-01-001 … IA-72-006 | `p10` IA-01-001<br>`p10` IA-01-002<br>`p10` IA-01-003 |
| `C` | 52 | C-001 … C-052 | `p2` CONSTITUTIONAL INHERITANCE  /  C-003  ·  C-004  ·  C-008  ·  C-036  ·  C-049  ·  C-051  ·  C-052<br>`p3` CONSTITUTIONAL INHERITANCE  /  C-001  ·  C-004  ·  C-007  ·  C-008  ·  C-035  ·  C-036  ·  C-041  ·  C-049  ·  C-052<br>`p8` CONSTITUTIONAL INHERITANCE  /  C-001  ·  C-004  ·  C-007  ·  C-008  ·  C-034  ·  C-035  ·  C-036  ·  C-041  ·  C-049  ·  C-052 |
| `IM` | 40 | IM-001 … IM-040 | `p177` IM-001 Availability Proportion of eligible user journeys completing in an acceptable<br>`p177` IM-002 Decision-path availability Availability of the complete evidence-to-human-decision path Service + tenant + deployment +<br>`p177` IM-003 Request latency Distribution of accepted request completion time Service + tenant + deployment + |
| `FM` | 32 | FM-01 … FM-32 | `p179` FM-01 Compute node loss Node pool Reschedule disposable work; restore stateful<br>`p179` FM-02 Accelerator fault Device / serving<br>`p179` FM-03 Scheduler partition Cluster / cell Freeze unsafe placement; preserve running work Control partition exercise |
| `IC` | 30 | IC-01 … IC-30 | `p181` IC-01 Human strong authentication Access edge and identity provider Authentication logs and assurance claims<br>`p181` IC-02 Workload identity Runtime and service fabric Attested short-lived identity records<br>`p181` IC-03 Device identity Edge and fleet Firmware and device attestation |
| `RU` | 26 | RU-01 … RU-26 | `p168` RU-01 Stateless service Request or event Replicated; disposable Drain and reschedule<br>`p168` RU-02 Stateful service Partition or shard Quorum or owner-aware Fence, fail over, reconcile<br>`p168` RU-03 Control-plane controller Desired-state object Leader or quorum Freeze change; restore control |
| `IADR` | 24 | IADR-001 … IADR-024 | `p189` IADR-001 One infrastructure contract across<br>`p189` IADR-002 Cell-oriented isolation and failure<br>`p189` IADR-003 Management plane separated from |
| `SC` | 24 | SC-01 … SC-24 | `p170` SC-01 Canonical strategic state Owning canonical layer Strong or contract-defined Versioned, corrected, never silently<br>`p170` SC-02 Operational authoritative<br>`p170` SC-03 Temporal graph state Knowledge Graph Temporal and revision-aware Replayable changes and deterministic |
| `DR` | 20 | DR-01 … DR-20 | `p182` DR-01 Identity and trust roots Zero or bounded<br>`p182` DR-02 Policy bundles Last approved<br>`p182` DR-03 Key management No committed |
| `MS` | 20 | MS-01 … MS-20 | `p171` MS-01 Domain event At least once Aggregate or partition Consumer idempotency and replay<br>`p171` MS-02 Integration event At least once Source and entity key Schema registry and consumer compatibility<br>`p171` MS-03 Command At least once Command target Idempotency key and one authoritative effect |
| `NZ` | 20 | NZ-01 … NZ-20 | `p169` NZ-01 Public access edge Untrusted external Authenticated ingress only Gateway and protection policy<br>`p169` NZ-02 Customer private edge Customer network Registered private services Mutual trust and route policy<br>`p169` NZ-03 External source enclave Approved sources Connector runtime only Destination, content, and custody |
| `ST` | 14 | ST-01 … ST-14 | `p164` ST-01<br>`p164` ST-02<br>`p164` ST-03 |
| `CP` | 12 | CP-01 … CP-12 | `p163` CP-01 Compute General compute pool Runtime Node pool Host portable service, policy, workflow, and analytical<br>`p163` CP-02 Compute Memory-optimized<br>`p163` CP-03 Compute Compute-intensive pool Runtime Node pool Host simulation, transformation, and deterministic |
| `NW` | 12 | NW-01 … NW-12 | `p163` NW-01 Network External access edge Runtime Region / site Terminate authenticated user, API, and system<br>`p163` NW-02 Network API gateway Runtime Region / site Enforce API contracts, identity context, rate, and<br>`p163` NW-03 Network Service connectivity |
| `OP` | 12 | OP-01 … OP-12 | `p165` OP-01<br>`p165` OP-02<br>`p165` OP-03 |
| `PF` | 12 | PF-01 … PF-12 | `p164` PF-01<br>`p164` PF-02<br>`p164` PF-03 |
| `TR` | 12 | TR-01 … TR-12 | `p165` TR-01<br>`p165` TR-02<br>`p165` TR-03 |
| `DP` | 10 | DP-01 … DP-10 | `p163` DP-01 Deployment Deployment profile<br>`p163` DP-02 Deployment Environment and site<br>`p163` DP-03 Deployment Intelligence cell controller Control Cell Reconcile cell composition, placement, isolation, and |
| `DL` | 8 | DL-01 … DL-08 | `p165` DL-01<br>`p165` DL-02<br>`p165` DL-03 |

### Headings detected (81; listed up to 120, keyed by page)

- 9: PART I — Infrastructure Authority
- 10: 1  Infrastructure Architecture Authority and Scope
- 12: 2  Specification Hierarchy and Conformance
- 14: 3  Infrastructure Principles and Semantic Parity
- 16: 4  Shared Responsibility and Customer Control
- 18: 5  Failure-Domain and Blast-Radius Doctrine
- 20: 6  Infrastructure Traceability and Documentation Inheritance
- 22: PART II — Deployment and Runtime Foundation
- 23: 7  System Context and Deployment Models
- 25: 8  SaaS Reference Architecture
- 27: 9  Private Cloud Reference Architecture
- 29: 10  On-Premise Reference Architecture
- 31: 11  Disconnected and Air-Gapped Operations
- 33: 12  Regional, Zonal, Site, and Cell Topology
- 35: 13  Tenant, Domain, and Intelligence Cell Isolation
- 37: 14  Shared Control Services and Management Plane
- 39: PART III — Compute and Acceleration
- 40: 15  Compute Platform Architecture
- 42: 16  CPU Workload Architecture
- 44: 17  GPU and Accelerator Architecture
- 46: 18  Model Serving Infrastructure
- 48: 19  Agent and Workflow Runtime Infrastructure
- 50: 20  Batch and Stream Processing Infrastructure
- 52: 21  Edge, IoT, and Remote Collection Infrastructure
- 54: 22  Resource Scheduling, Quotas, and Admission
- 56: PART IV — Network and Connectivity
- 57: 23  Network Architecture and Segmentation
- 59: 24  Ingress, API, and Access Edge
- 61: 25  Service-to-Service Connectivity
- 63: 26  Data Plane and Control Plane Separation
- 65: 27  DNS, Naming, Discovery, and Time
- 67: 28  Egress, External Integration, and Source Connectivity
- 69: 29  Private Connectivity and Customer Networks
- 71: 30  Network Resilience, Performance, and Observability
- 73: PART V — Storage, Messaging, and State
- 74: 31  Storage Architecture and State Classes
- 76: 32  Transactional and Operational Datastores
- 78: 33  Object and Evidence Storage
- 80: 34  Knowledge Graph Storage Infrastructure
- 82: 35  Vector, Search, and Index Infrastructure
- 84: 36  Digital Twin and Simulation State Infrastructure
- 86: 37  Event Streaming, Messaging, and Durable Queues
- 88: 38  Cache, Temporary State, and Checkpoint Infrastructure
- 90: PART VI — Platform Runtime and Intelligence
- 91: 39  Container, Orchestration, and Runtime Platform
- 93: 40  Service Platform and Internal Developer Platform
- 95: 41  Workflow Engine Infrastructure
- 97: 42  Agent Execution Sandbox Infrastructure
- 99: 43  Model Gateway and Inference Fabric
- 101: 44  Retrieval and Context Infrastructure
- 103: 45  Data and AI Pipeline Runtime
- 105: 46  Executive Experience and Collaboration Infrastructure
- 107: 47  Integration Runtime and Connector Isolation
- 109: 48  Platform APIs, Events, and Contract Enforcement
- 111: PART VII — Trust, Security, and Sovereignty
- 112: 49  Identity, Workload Trust, and Privileged Access
- 114: 50  Policy Enforcement Infrastructure
- 116: 51  Cryptography, Key Management, and Trust Anchors
- 118: 52  Secrets, Certificates, and Credential Lifecycle
- 120: 53  Data Protection and Confidential Computing
- 122: 54  Tenant, Domain, and Workload Isolation
- 124: 55  Software Supply Chain and Artifact Integrity
- 126: 56  Security Monitoring, Detection, and Response
- 128: 57  Sovereignty, Residency, and Administrative Control
- 130: PART VIII — Reliability, Continuity, and Operations
- 131: 58  Observability and Telemetry Architecture
- 133: 59  Service-Level Management and Error Budgets
- 135: 60  Capacity, Performance, and Load Engineering
- 137: 61  High Availability and Fault Tolerance
- 139: 62  Backup, Restore, and State Reconciliation
- 141: 63  Disaster Recovery and Regional Continuity
- 143: 64  Incident Command and Operational Response
- 145: 65  Change, Maintenance, and Lifecycle Operations
- 147: 66  Degraded Modes and Continuity of Strategic Operations
- 149: PART IX — Delivery, Economics, and Governance
- 150: 67  Infrastructure-as-Code and Configuration Architecture
- 152: 68  Build, Release, Promotion, and Rollback Infrastructure
- 154: 69  Fleet, Patch, and Vulnerability Management
- 156: 70  Cost, FinOps, Sustainability, and Unit Economics
- 158: 71  Deployment Acceptance and Operational Readiness
- 160: 72  Infrastructure Governance and Baseline Closure

## v07 — The_Eye_Volume_7_Data_Platform_v1.0 elvin.pdf

- Path at HEAD: `docs/The_Eye_Volume_7_Data_Platform_v1.0 elvin.pdf`
- Blob: `81a6cc01958db0cebe823550cc0a62956f671b27` (verified), 11299146 bytes
- Extraction: `/private/tmp/claude-501/-Users-halawany-work-personal-mohammed-new-project/8704aca5-efd0-4164-8e07-dbc1322f9c20/scratchpad/volumes/v07.txt`, source copy `/private/tmp/claude-501/-Users-halawany-work-personal-mohammed-new-project/8704aca5-efd0-4164-8e07-dbc1322f9c20/scratchpad/volumes/src/v07.pdf`
- Units: 195 pages
- Characters in extraction file: 641270
- PDF metadata: producer='LibreOfficeDev 26.8.0.0.alpha0 (X86_64)' creator='Writer' title='The Eye - Volume 7: Data Platform'
- Empty pages (0): none
- Near-empty pages (0): none

### Identifier families (21)

| Prefix | Distinct ids | Range | Example lines |
|---|---|---|---|
| `DP` | 432 | DP-01-001 … DP-72-006 | `p10` DP-01-001<br>`p10` DP-01-002<br>`p10` DP-01-003 |
| `C` | 52 | C-001 … C-052 | `p2` CONSTITUTIONAL INHERITANCE  /  C-003  ·  C-004  ·  C-008  ·  C-009  ·  C-011  ·  C-012  ·  C-035  ·  C-052<br>`p3` CONSTITUTIONAL INHERITANCE  /  C-002  ·  C-009  ·  C-010  ·  C-011  ·  C-012  ·  C-015  ·  C-035  ·  C-037  ·  C-052<br>`p8` CONSTITUTIONAL INHERITANCE  /  C-002  ·  C-005  ·  C-009  ·  C-010  ·  C-011  ·  C-012  ·  C-015  ·  C-035  ·  C-037  ·  C-049 |
| `DQM` | 40 | DQM-001 … DQM-040 | `p178` DQM-001 Contract conformance rate Records, objects, or events satisfying the active data contract. Asset + tenant + deployment +<br>`p178` DQM-002 Schema rejection rate Inputs rejected for schema or constraint violation. Asset + tenant + deployment +<br>`p178` DQM-003 Source freshness Age of the latest accepted source observation against contract. Asset + tenant + deployment + |
| `DCN` | 32 | DCN-01 … DCN-32 | `p182` DCN-01 Source authority before collection Source registry and connector admission Contract, rights, purpose, and approval<br>`p182` DCN-02 Content quarantine Intake boundary Inspection, isolation, release authority<br>`p182` DCN-03 Immutable raw preservation Evidence store Digest, version, custody, retention |
| `DF` | 32 | DF-01 … DF-32 | `p180` DF-01 Source unavailable Source Expose coverage and freshness loss; retry by<br>`p180` DF-02 Source authority revoked Source contract Stop collection and downstream promotion Revocation drill<br>`p180` DF-03 Malicious or corrupt |
| `DADR` | 24 | DADR-001 … DADR-024 | `p191` DADR-001 Contracts precede physical data<br>`p191` DADR-002 Canonical ownership remains singular Every authoritative lifecycle has one<br>`p191` DADR-003 Raw evidence is immutable and |
| `LR` | 24 | LR-01 … LR-24 | `p183` LR-01 Source contracts Policy history retained Hours Versioned registry Contract and revocation<br>`p183` LR-02 Raw evidence No acknowledged<br>`p183` LR-03 Canonical objects Last committed |
| `SP` | 24 | SP-01 … SP-24 | `p168` SP-01 Government and<br>`p168` SP-02 News and media feed API / RSS / crawl Publication, update, correction,<br>`p168` SP-03 Financial market feed Streaming / batch Exchange time, sequence, entitlement Gap, latency, entitlement |
| `DPD` | 20 | DPD-01 … DPD-20 | `p173` DPD-01 Canonical object product Typed object API +<br>`p173` DPD-02 Observation evidence product Object + metadata World Observation Custody, rights, freshness, correction<br>`p173` DPD-03 Curated domain dataset Open table + contract Domain data owner Quality, lineage, SLO, portability |
| `DZ` | 20 | DZ-01 … DZ-20 | `p167` DZ-01 External source<br>`p167` DZ-02 Enterprise source<br>`p167` DZ-03 Transfer quarantine Intake authority Unvalidated packages and |
| `TT` | 20 | TT-01 … TT-20 | `p172` TT-01 Immutable observation Observed Event + observation + record time Correction creates a new version<br>`p172` TT-02 Source assertion Asserted Assertion validity + observation Withdrawal preserves history<br>`p172` TT-03 Extracted claim Extracted Evidence time + extraction record Re-extraction remains a new version |
| `DC` | 16 | DC-01 … DC-16 | `p169` DC-01 Add optional field Backward compatible Consumer default and unknown-field tests Ordinary controlled release<br>`p169` DC-02 Add required field Incompatible without<br>`p169` DC-03 Remove field Incompatible Consumer inventory and deprecation |
| `IN` | 14 | IN-01 … IN-14 | `p163` IN-01<br>`p163` IN-02<br>`p163` IN-03 |
| `ST` | 14 | ST-01 … ST-14 | `p164` ST-01<br>`p164` ST-02<br>`p164` ST-03 |
| `KN` | 12 | KN-01 … KN-12 | `p164` KN-01<br>`p164` KN-02<br>`p164` KN-03 |
| `OP` | 12 | OP-01 … OP-12 | `p165` OP-01<br>`p165` OP-02<br>`p165` OP-03 |
| `SM` | 12 | SM-01 … SM-12 | `p163` SM-01<br>`p163` SM-02<br>`p164` SM-03 |
| `TR` | 12 | TR-01 … TR-12 | `p165` TR-01<br>`p165` TR-02<br>`p165` TR-03 |
| `GV` | 10 | GV-01 … GV-10 | `p163` GV-01<br>`p163` GV-02<br>`p163` GV-03 |
| `SV` | 10 | SV-01 … SV-10 | `p165` SV-01<br>`p165` SV-02<br>`p165` SV-03 |
| `DL` | 8 | DL-01 … DL-08 | `p166` DL-01<br>`p166` DL-02<br>`p166` DL-03 |

### Headings detected (81; listed up to 120, keyed by page)

- 9: PART I — Data Authority and Operating Model
- 10: 1  Data Platform Authority and Scope
- 12: 2  Specification Hierarchy and Data Conformance
- 14: 3  Data Principles and Semantic Parity
- 16: 4  Data Ownership, Stewardship, and Accountability
- 18: 5  Data Domain and Product Operating Model
- 20: 6  Data Classification and Consequence Model
- 22: 7  Data Traceability and Documentation Inheritance
- 24: 8  Data Platform System Context
- 26: PART II — Acquisition and Ingestion
- 27: 9  Source Registry and Collection Contracts
- 29: 10  External Source Ingestion
- 31: 11  Enterprise Application and Database Ingestion
- 33: 12  Document, Media, and Unstructured Content Ingestion
- 35: 13  Event, Stream, IoT, and Telemetry Ingestion
- 37: 14  Batch, File, API, RSS, and Custom Source Ingestion
- 39: 15  Change Data Capture and Synchronization
- 41: 16  Intake Validation, Quarantine, and Raw Preservation
- 43: PART III — Contracts, Semantics, and Temporal
- 44: 17  Canonical Data Contract
- 46: 18  Schema Registry and Compatibility
- 48: 19  Canonical Intelligence Object Model
- 50: 20  Identity, Naming, and Tenant Scoping
- 52: 21  Temporal and Bitemporal Data
- 54: 22  Truth State, Confidence, and Uncertainty
- 56: 23  Provenance, Lineage, and Chain of Custody
- 58: 24  Correction, Withdrawal, Supersession, and Reconciliation
- 60: PART IV — Storage and Processing Architecture
- 61: 25  Data Storage Architecture and State Tiers
- 63: 26  Lakehouse and Analytical Storage
- 65: 27  Transactional and Operational Data Stores
- 67: 28  Object, Evidence, and Archive Storage
- 69: 29  Event Streaming and Durable Messaging
- 71: 30  Batch Processing and Orchestration
- 73: 31  Stream Processing and Complex Event Handling
- 75: 32  Query, Caching, Materialization, and Projection
- 77: PART V — Knowledge, Memory, and Strategic
- 78: 33  Knowledge Graph Data Architecture
- 80: 34  Ontology, Taxonomy, and Semantic Governance
- 82: 35  Entity Resolution and Master Identity
- 84: 36  Relationship, Event, Claim, and Assessment Data
- 86: 37  Enterprise Memory and Strategic Record
- 88: 38  Search, Vector, and Retrieval Data
- 90: 39  Digital Twin State and Time Travel
- 92: 40  Forecast, Scenario, Simulation, Decision, and Outcome Data
- 94: PART VI — Data Products, Serving, and Interoperability
- 95: 41  Data Product Architecture
- 97: 42  Data APIs and Query Services
- 99: 43  Event Products and Subscriptions
- 101: 44  Analytics and Semantic Serving
- 103: 45  Feature, Training, Evaluation, and Feedback Data
- 105: 46  Context Assembly and Retrieval Products
- 107: 47  Data Exchange, Export, and Portability
- 109: 48  Marketplace Data Packages and Extension Contracts
- 111: PART VII — Governance, Trust, and Lifecycle
- 112: 49  Metadata Catalog and Data Discovery
- 114: 50  Policy, Access, and Purpose Enforcement
- 116: 51  Privacy, Minimization, Consent, and Lawful Basis
- 118: 52  Residency, Sovereignty, and Cross-Border Control
- 120: 53  Encryption, Tokenization, Masking, and Confidentiality
- 122: 54  Retention, Legal Hold, Archive, and Deletion
- 124: 55  Data Stewardship, Approval, and Exception Management
- 126: 56  Data Audit, Non-Repudiation, and Accountability
- 128: PART VIII — Quality, Reliability, and Operations
- 129: 57  Data Quality Architecture
- 131: 58  Freshness, Completeness, and Coverage
- 133: 59  Data Observability and Lineage Monitoring
- 135: 60  Data SLOs, Capacity, and Performance
- 137: 61  Availability, Durability, and Degraded Data Modes
- 139: 62  Backup, Restore, and Disaster Recovery
- 141: 63  Data Incident, Breach, and Correction Response
- 143: 64  Operational Data Lifecycle and Housekeeping
- 145: PART IX — Delivery, Economics, and Governance
- 146: 65  Data Pipeline Engineering and Repository Standards
- 148: 66  Configuration, Infrastructure, and Environment Promotion
- 150: 67  Test Data, Fixtures, and Verification Architecture
- 152: 68  Data Release, Migration, Backfill, and Rollback
- 154: 69  Deployment Parity, Disconnected Sync, and Air Gaps
- 156: 70  Data Cost, Capacity, Sustainability, and Unit Economics
- 158: 71  Data Platform Acceptance and Operational Readiness
- 160: 72  Data Platform Governance and Baseline Closure

## v08 — The_Eye_V8_PRD elvin.pdf

- Path at HEAD: `docs/The_Eye_V8_PRD elvin.pdf`
- Blob: `d1a704b1a041726fabaaa6d3b43888d57cd966b6` (verified), 11875347 bytes
- Extraction: `/private/tmp/claude-501/-Users-halawany-work-personal-mohammed-new-project/8704aca5-efd0-4164-8e07-dbc1322f9c20/scratchpad/volumes/v08.txt`, source copy `/private/tmp/claude-501/-Users-halawany-work-personal-mohammed-new-project/8704aca5-efd0-4164-8e07-dbc1322f9c20/scratchpad/volumes/src/v08.pdf`
- Units: 209 pages
- Characters in extraction file: 743977
- PDF metadata: producer='LibreOfficeDev 26.8.0.0.alpha0 (X86_64)' creator='Writer' title='The Eye - Volume 8: Product Requirements Document'
- Empty pages (0): none
- Near-empty pages (0): none

### Identifier families (23)

| Prefix | Distinct ids | Range | Example lines |
|---|---|---|---|
| `PR` | 432 | PR-01-001 … PR-72-006 | `p11` PR-01-001<br>`p11` PR-01-002<br>`p11` PR-01-003 |
| `AT` | 72 | AT-01 … AT-72 | `p178` AT-01 Product Authority, Scope,<br>`p178` AT-02 Product Principles and User<br>`p178` AT-03 Customers, Tenants, and |
| `C` | 52 | C-001 … C-052 | `p2` CONSTITUTIONAL INHERITANCE  /  C-003  ·  C-004  ·  C-008  ·  C-035  ·  C-042  ·  C-051  ·  C-052<br>`p3` CONSTITUTIONAL INHERITANCE  /  C-001  ·  C-002  ·  C-004  ·  C-005  ·  C-006  ·  C-035  ·  C-047  ·  C-049  ·  C-052<br>`p9` CONSTITUTIONAL INHERITANCE  /  C-001  ·  C-002  ·  C-004  ·  C-005  ·  C-009  ·  C-015  ·  C-024  ·  C-027  ·  C-035  ·  C-042  · |
| `MET` | 40 | MET-001 … MET-040 | `p198` MET-001 Strategic loop closure<br>`p198` MET-002 Decision package<br>`p198` MET-003 Decision Replay success Historical decision snapshots reconstructed |
| `OBJ` | 40 | OBJ-01 … OBJ-40 | `p186` OBJ-01 Evidence item View original Any evidence<br>`p186` OBJ-02 Evidence item Annotate Analyst or reviewer Creates a linked versioned<br>`p186` OBJ-03 Evidence item Correct or |
| `FEX` | 32 | FEX-01 … FEX-32 | `p194` FEX-01 Source unavailable Observation<br>`p194` FEX-02 Source rights<br>`p194` FEX-03 Freshness expired Intelligence stale Cutoff, expected arrival, impact, next action Last verified state with visible |
| `ADR` | 24 | ADR-001 … ADR-024 | `p205` ADR-001<br>`p205` ADR-002<br>`p205` ADR-003 |
| `GLB` | 24 | GLB-01 … GLB-24 | `p192` GLB-01 Perceivable text Text alternatives, scalable text, reflow, spacing, contrast, non-color<br>`p192` GLB-02 Keyboard operation Complete journeys without pointer, visible focus, logical order, no<br>`p192` GLB-03 Screen reader |
| `JRN` | 24 | JRN-01 … JRN-24 | `p173` JRN-01 Establish customer<br>`p173` JRN-02 Register and activate a<br>`p173` JRN-03 Investigate a strategic |
| `PAR` | 24 | PAR-01 … PAR-24 | `p193` PAR-01 Human authority and<br>`p193` PAR-02 Canonical objects Identical identity, version, time, truth, provenance, policy,<br>`p193` PAR-03 Knowledge Graph Identical ontology, temporal revision, provenance, query, |
| `PER` | 24 | PER-01 … PER-24 | `p169` PER-01 Board or governing<br>`p169` PER-02 Executive decision<br>`p169` PER-03 Chief of staff or |
| `ENT` | 20 | ENT-01 … ENT-20 | `p196` ENT-01 Universal Strategic<br>`p196` ENT-02 World Observation Source registry, collection plans, external<br>`p196` ENT-03 Knowledge and Memory Entity, relationship, Knowledge Graph, |
| `HX` | 20 | HX-01 … HX-20 | `p190` HX-01 Evidence disclosure Show sources, citations, versions, cutoff, omissions, and<br>`p190` HX-02 Truth-state label<br>`p190` HX-03 Uncertainty statement Show form, magnitude or class, drivers, calibration, and |
| `WS` | 20 | WS-01 … WS-20 | `p171` WS-01 Executive Operating<br>`p171` WS-02 Observation<br>`p171` WS-03 Research and |
| `AG` | 12 | AG-01 … AG-12 | `p166` AG-01<br>`p166` AG-02<br>`p166` AG-03 |
| `AU` | 12 | AU-01 … AU-12 | `p164` AU-01<br>`p164` AU-02<br>`p164` AU-03 |
| `DL` | 12 | DL-01 … DL-12 | `p167` DL-01<br>`p167` DL-02<br>`p167` DL-03 |
| `DS` | 12 | DS-01 … DS-12 | `p165` DS-01<br>`p165` DS-02<br>`p165` DS-03 |
| `EO` | 12 | EO-01 … EO-12 | `p166` EO-01<br>`p166` EO-02<br>`p166` EO-03 |
| `FW` | 12 | FW-01 … FW-12 | `p165` FW-01<br>`p165` FW-02<br>`p165` FW-03 |
| `OB` | 12 | OB-01 … OB-12 | `p164` OB-01 Observe and Collect Source registry Register source authority, rights,<br>`p164` OB-02 Observe and Collect Collection contract manager Version endpoint, schedule, schema,<br>`p164` OB-03 Observe and Collect Observation operations |
| `TR` | 12 | TR-01 … TR-12 | `p167` TR-01<br>`p167` TR-02<br>`p167` TR-03 |
| `UM` | 12 | UM-01 … UM-12 | `p164` UM-01<br>`p165` UM-02<br>`p165` UM-03 |

### Headings detected (81; listed up to 120, keyed by page)

- 10: PART I — Product Authority and Operating
- 11: 1  Product Authority, Scope, and Decision Rights
- 13: 2  Product Principles and User Value Contract
- 15: 3  Customers, Tenants, and Operating Contexts
- 17: 4  Roles, Personas, and Human Authority Model
- 19: 5  Information Architecture and Workspace System
- 21: 6  Product State, Lifecycle, and Work Object Model
- 23: 7  Accessibility, Localization, and Global Readiness
- 25: 8  Product System Context and Cross-Volume Conformance
- 27: PART II — Observe and Collect
- 28: 9  Source Registry and Collection Workspace
- 30: 10  Observation Operations and Source Coverage
- 32: 11  Search, Discovery, and Research Workspace
- 34: 12  Document and Media Intelligence
- 36: 13  Live Event, Stream, IoT, and Telemetry Experience
- 38: 14  Enterprise Systems and Internal Data Experience
- 40: 15  Collection Plans, Watchlists, and Priorities
- 42: 16  Intake Validation, Quarantine, and Evidence Review
- 44: PART III — Understand and Remember
- 45: 17  Intelligence Object and Evidence Experience
- 47: 18  Entity, Identity, and Relationship Workbench
- 49: 19  Knowledge Graph Exploration and Curation
- 51: 20  Enterprise Memory and Strategic Record
- 53: 21  Claims, Contradictions, Confidence, and Uncertainty
- 55: 22  Timelines, Provenance, and Decision-Grade Traceability
- 57: 23  Classification, Summaries, and Analyst Workflows
- 59: 24  Corrections, Withdrawals, Reconciliation, and Replay
- 61: PART IV — Predict, Detect, and Warn
- 62: 25  Weak Signal Detection
- 64: 26  Early Warning System
- 66: 27  Risk Intelligence
- 68: 28  Opportunity Intelligence
- 70: 29  Competitor Intelligence
- 72: 30  Supply Chain Intelligence
- 74: 31  Geopolitical, Technology, Cyber, and Financial Intelligence
- 76: 32  Forecasting and Prediction Horizons
- 78: PART V — Scenario, Simulation, and Decision
- 79: 33  Scenario Intelligence Workspace
- 81: 34  Scenario Marketplace
- 83: 35  Simulation Design and Run Control
- 85: 36  Digital Twin Portfolio and State
- 87: 37  Strategy Graph and Objective-Capability Alignment
- 89: 38  Decision Intelligence and Recommendation Review
- 91: 39  Human Approval, Commitment, and Decision Record
- 93: 40  Decision Replay, Outcome Attribution, and Learning
- 95: PART VI — Executive Operating System and Collaboration
- 96: 41  Executive Operating System
- 98: 42  Strategic Briefings and Command Views
- 100: 43  Strategic Health Score
- 102: 44  Proactive Intelligence and Priority Queue
- 104: 45  Strategic Planning and Initiative Governance
- 106: 46  Collaboration, Tasks, and Workflow Orchestration
- 108: 47  Reporting, Publishing, and Distribution
- 110: 48  Mobile, Field, Offline, and Disconnected Operation
- 112: PART VII — Agents and Automation
- 113: 49  Agent Operating Model and Marketplace
- 115: 50  Observation, Search, and Collection Agents
- 117: 51  Cleaning, Classification, NER, and Relationship Agents
- 119: 52  Knowledge Graph, Memory, and Reasoning Agents
- 121: 53  Prediction, Scenario, Simulation, and Decision Agents
- 123: 54  Domain Intelligence Agents
- 125: 55  Planner, Supervisor, Workflow, and Briefing Agents
- 127: 56  Agent Controls, Explainability, Escalation, and Human Override
- 129: PART VIII — Trust, Governance, Administration, and Operations
- 130: 57  Trust and Provenance Experience
- 132: 58  Identity, Access, and Tenant Administration
- 134: 59  Policy, Privacy, Residency, and Consent
- 136: 60  Security, Cyber, and Incident Experience
- 138: 61  Model, Agent, and Data Governance Console
- 140: 62  Audit, Evidence, Compliance, and Investigation
- 142: 63  Reliability, Degraded Modes, and Recovery Experience
- 144: 64  Integrations, APIs, Exports, and Extensibility
- 146: PART IX — Commercialization, Delivery, and Acceptance
- 147: 65  SaaS, Private Cloud, and On-Premise Product Parity
- 149: 66  Packaging, Entitlements, and Licensing
- 151: 67  Onboarding, Configuration, and Data Migration
- 153: 68  Implementation, Adoption, and Change Management
- 155: 69  Service Management, Support, and Customer Success
- 157: 70  Product Analytics, Quality, and Unit Economics
- 159: 71  Product Acceptance and Operational Readiness
- 161: 72  Product Governance and Baseline Closure

## v09 — The_Eye_Volume_9_UI_UX_Design_System_v1.0 elvin .pdf

- Path at HEAD: `docs/The_Eye_Volume_9_UI_UX_Design_System_v1.0 elvin .pdf`
- Blob: `657c95092c1d00ad52965e9fc2d45d9075c8e244` (verified), 12422483 bytes
- Extraction: `/private/tmp/claude-501/-Users-halawany-work-personal-mohammed-new-project/8704aca5-efd0-4164-8e07-dbc1322f9c20/scratchpad/volumes/v09.txt`, source copy `/private/tmp/claude-501/-Users-halawany-work-personal-mohammed-new-project/8704aca5-efd0-4164-8e07-dbc1322f9c20/scratchpad/volumes/src/v09.pdf`
- Units: 195 pages
- Characters in extraction file: 702513
- PDF metadata: producer='LibreOfficeDev 26.8.0.0.alpha0 (X86_64)' creator='Writer' title='The Eye - Volume 9: UI/UX Design System'
- Empty pages (0): none
- Near-empty pages (0): none

### Identifier families (38)

| Prefix | Distinct ids | Range | Example lines |
|---|---|---|---|
| `UX` | 432 | UX-01-001 … UX-72-006 | `p10` UX-01-001<br>`p10` UX-01-002<br>`p10` UX-01-003 |
| `CMP` | 112 | CMP-001 … CMP-112 | `p168` CMP-001 Foundation Focus Ring Context, content, state, actions, help Rest, hover, focus, active,<br>`p168` CMP-002 Foundation Divider Context, content, state, actions, help Rest, hover, focus, active,<br>`p168` CMP-003 Foundation Scroll Area Context, content, state, actions, help Rest, hover, focus, active, |
| `C` | 52 | C-001 … C-052 | `p11` CONSTITUTIONAL INHERITANCE  /  C-001  /  C-003  /  C-047  /  C-051  /  C-052<br>`p13` CONSTITUTIONAL INHERITANCE  /  C-001  /  C-002  /  C-003  /  C-027  /  C-047<br>`p15` CONSTITUTIONAL INHERITANCE  /  C-001  /  C-003  /  C-004  /  C-005  /  C-047  /  C-048 |
| `PAT` | 48 | PAT-01 … PAT-48 | `p173` PAT-01 Inspect without mutation Open exact object/version; preserve context and audit access No side effect on view<br>`p173` PAT-02 Context switch with impact preview Show changed dimensions and affected work before commit Never switch silently<br>`p173` PAT-03 Save draft Persist versioned work without implying submission Never label as approval |
| `OBJ` | 40 | OBJ-01 … OBJ-40 | `p176` OBJ-01 Evidence item View original Any evidence consumer Never mutates source bytes Immutable identity, version, truth, time,<br>`p176` OBJ-02 Evidence item Annotate Analyst or reviewer Creates a linked versioned<br>`p176` OBJ-03 Evidence item Correct or withdraw Source authority Non-destructive governed case Before/after, authority, reason, impact, |
| `VIZ` | 36 | VIZ-01 … VIZ-36 | `p175` VIZ-01 Time series Change through time Time basis, units, source, gaps, uncertainty Line alone without missing<br>`p175` VIZ-02 Event timeline Ordered events and decisions Event/record time, actor, source, correction Chronology without time basis<br>`p175` VIZ-03 Probability band Forecast distribution Horizon, cutoff, quantiles, calibration, method Single deterministic line |
| `NOT` | 32 | NOT-01 … NOT-32 | `p184` NOT-01 Information update Low In-app activity stream No Informational only<br>`p184` NOT-02 Assigned task Normal In-app and configured work channel Acknowledge Due time and evidence explicit<br>`p184` NOT-03 Review request Normal In-app and email or enterprise channel Acknowledge Exact object version required |
| `GLB` | 24 | GLB-01 … GLB-24 | `p180` GLB-01 Perceivable text Text alternatives, scalable text, reflow, spacing, contrast, non-color<br>`p180` GLB-02 Keyboard operation Complete journeys without pointer, visible focus, logical order, no<br>`p180` GLB-03 Screen reader semantics Landmarks, names, roles, states, relationships, live-region restraint NVDA, JAWS, VoiceOver, and |
| `JRN` | 24 | JRN-01 … JRN-24 | `p183` JRN-01 Establish customer operating<br>`p183` JRN-02 Register and activate a source Entry: Discover / rights; Work: contract / validate / approve; Closure:<br>`p183` JRN-03 Investigate a strategic question Entry: Intent / search; Work: evidence / entities / claims; Closure: |
| `PER` | 24 | PER-01 … PER-24 | `p181` PER-01 Board or governing body<br>`p181` PER-02 Executive decision authority Makes accountable strategic decisions and<br>`p181` PER-03 Chief of staff or executive |
| `REL` | 24 | REL-01 … REL-24 | `p195` REL-01 Authority Every material design asset has one accountable owner and approved status.<br>`p195` REL-02 Traceability Requirements, components, patterns, journeys, tests, findings, and releases resolve bidirectionally.<br>`p195` REL-03 Context Tenant, domain, role, objective, horizon, scenario, classification, and time remain explicit where material. |
| `UX-ADR` | 24 | UX-ADR-001 … UX-ADR-024 | `p192` UX-ADR-001 Volume 9 is the controlled visual and interaction<br>`p192` UX-ADR-002 Interfaces remain access modes to the<br>`p192` UX-ADR-003 The application shell is persistent and context- |
| `HX` | 20 | HX-01 … HX-20 | `p178` HX-01 Evidence disclosure Show sources, citations, versions, cutoff, omissions, and policy-<br>`p178` HX-02 Truth-state label Distinguish observed, asserted, inferred, assessed, synthetic,<br>`p178` HX-03 Uncertainty statement Show form, magnitude or class, drivers, calibration, and |
| `WS` | 20 | WS-01 … WS-20 | `p182` WS-01 Executive Operating System Executive cadence, priorities, warnings, decisions,<br>`p182` WS-02 Observation Operations Source coverage, freshness, collection health, blind<br>`p182` WS-03 Research and Discovery Structured search, exploration, saved research, |
| `LAY` | 17 | LAY-001 … LAY-017 | `p163` LAY-001 size.control.sm 28px Dense secondary controls<br>`p163` LAY-002 size.control.md 36px Default controls<br>`p163` LAY-003 size.control.lg 44px Touch and consequential controls |
| `CNT` | 16 | CNT-01 … CNT-16 | `p166` CNT-01 Product identity The Eye Never abbreviate in first use or redefine category<br>`p166` CNT-02 Workspace title Noun phrase Names governed work, not a dashboard collection<br>`p166` CNT-03 Object title Canonical human-readable identity Immutable ID remains available |
| `TYP` | 15 | TYP-001 … TYP-015 | `p163` TYP-001 font.family.ui Inter Variable Segoe UI, Arial, sans-serif Interface text<br>`p163` TYP-002 font.family.mono IBM Plex Mono Consolas, monospace IDs, digests, code, logs<br>`p163` TYP-003 type.display.1 40/48 700 Major command-room title |
| `CAP-AU` | 12 | CAP-AU-01 … CAP-AU-12 | `p11` the declared acceptance unit. Volume 8 trace: Ch. 1, Ch. 8, Ch. 71, Ch. 72. Capabilities: CAP-AU-01, CAP-AU-09, CAP-AU-11, CAP-AU-12. Full trace: Appe<br>`p11` the declared acceptance unit. Volume 8 trace: Ch. 1, Ch. 8, Ch. 71, Ch. 72. Capabilities: CAP-AU-01, CAP-AU-09, CAP-AU-11, CAP-AU-12. Full trace: Appe<br>`p11` the declared acceptance unit. Volume 8 trace: Ch. 1, Ch. 8, Ch. 71, Ch. 72. Capabilities: CAP-AU-01, CAP-AU-09, CAP-AU-11, CAP-AU-12. Full trace: Appe |
| `CAP-DS` | 12 | CAP-DS-01 … CAP-DS-12 | `p53` for the declared acceptance unit. Volume 8 trace: Ch. 6, Ch. 39, Ch. 58, Ch. 67. Capabilities: CAP-AU-07, CAP-DS-11, CAP-PD-03. Full trace: Appendix N<br>`p57` 006 close for the declared acceptance unit. Volume 8 trace: Ch. 5, Ch. 39, Ch. 46. Capabilities: CAP-AU-06, CAP-DS-11, CAP-EO-08. Full trace: Appendix<br>`p66` close for the declared acceptance unit. Volume 8 trace: Ch. 21, Ch. 25, Ch. 32, Ch. 38. Capabilities: CAP-UM-09, CAP-FW-01, CAP-DS-10. Full trace: App |
| `CAP-FW` | 12 | CAP-FW-01 … CAP-FW-12 | `p47` close for the declared acceptance unit. Volume 8 trace: Ch. 7, Ch. 17, Ch. 32, Ch. 43. Capabilities: CAP-AU-08, CAP-FW-12, CAP-EO-05. Full trace: Appe<br>`p66` close for the declared acceptance unit. Volume 8 trace: Ch. 21, Ch. 25, Ch. 32, Ch. 38. Capabilities: CAP-UM-09, CAP-FW-01, CAP-DS-10. Full trace: App<br>`p79` declared acceptance unit. Volume 8 trace: Ch. 25. Capabilities: CAP-FW-01, CAP-FW-02. Full trace: Appendix N. |
| `LS` | 12 | LS-01 … LS-12 | `p165` LS-01 Draft Authoring; not review-active<br>`p165` LS-02 Proposed Submitted for governed review<br>`p165` LS-03 In Review Named review is active |
| `NUM` | 12 | NUM-01 … NUM-12 | `p166` NUM-01 Probability 0-100% or 0-1 by domain contract Show definition, calibration, horizon, cutoff, and uncertainty<br>`p166` NUM-02 Confidence Named calibrated class or interval Never use as authority or generic certainty<br>`p166` NUM-03 Range Lower to upper with units State method and confidence or scenario basis |
| `SPC` | 12 | SPC-001 … SPC-012 | `p163` SPC-001 space.0 0px No separation<br>`p163` SPC-002 space.2 2px Optical correction only<br>`p163` SPC-003 space.4 4px Inline micro-gap |
| `CAP-EO` | 11 | CAP-EO-01 … CAP-EO-11 | `p13` close for the declared acceptance unit. Volume 8 trace: Ch. 2, Ch. 8, Ch. 41. Capabilities: CAP-AU-02, CAP-EO-01, CAP-EO-06. Full trace: Appendix N.<br>`p23` for the declared acceptance unit. Volume 8 trace: Ch. 7, Ch. 48, Ch. 71. Capabilities: CAP-AU-08, CAP-EO-10, CAP-PD-11. Full trace: Appendix N.<br>`p28` acceptance unit. Volume 8 trace: Ch. 5, Ch. 41, Ch. 63. Capabilities: CAP-AU-06, CAP-EO-01, CAP-TG-11. Full trace: Appendix N. |
| `CAP-UM` | 11 | CAP-UM-01 … CAP-UM-12 | `p21` for the declared acceptance unit. Volume 8 trace: Ch. 3, Ch. 5, Ch. 6, Ch. 17, Ch. 21, Ch. 22. Capabilities: CAP-AU-04, CAP-AU-07, CAP-UM-01, CAP-UM-1<br>`p21` for the declared acceptance unit. Volume 8 trace: Ch. 3, Ch. 5, Ch. 6, Ch. 17, Ch. 21, Ch. 22. Capabilities: CAP-AU-04, CAP-AU-07, CAP-UM-01, CAP-UM-1<br>`p34` the declared acceptance unit. Volume 8 trace: Ch. 5, Ch. 6, Ch. 17, Ch. 64. Capabilities: CAP-AU-07, CAP-UM-01, CAP-TG-08. Full trace: Appendix N. |
| `CAP-PD` | 10 | CAP-PD-01 … CAP-PD-12 | `p23` for the declared acceptance unit. Volume 8 trace: Ch. 7, Ch. 48, Ch. 71. Capabilities: CAP-AU-08, CAP-EO-10, CAP-PD-11. Full trace: Appendix N.<br>`p25` close for the declared acceptance unit. Volume 8 trace: Ch. 8, Ch. 71, Ch. 72. Capabilities: CAP-AU-09, CAP-AU-11, CAP-PD-12. Full trace: Appendix N.<br>`p38` UX-14-006 close for the declared acceptance unit. Volume 8 trace: Ch. 5, Ch. 7, Ch. 48. Capabilities: CAP-AU-08, CAP-EO-10, CAP-PD-11. Full trace: App |
| `TS` | 10 | TS-01 … TS-10 | `p165` TS-01 Observed OBSERVED color.observed Solid circle Directly recorded evidence; source and time required<br>`p165` TS-02 Asserted ASSERTED color.asserted Outlined square Claim made by an attributable source or actor<br>`p165` TS-03 Inferred INFERRED color.inferred Linked nodes Derived relationship or conclusion; method required |
| `CAP-AG` | 8 | CAP-AG-01 … CAP-AG-08 | `p36` declared acceptance unit. Volume 8 trace: Ch. 11, Ch. 44, Ch. 49, Ch. 56. Capabilities: CAP-OB-04, CAP-EO-06, CAP-AG-01. Full trace: Appendix N.<br>`p113` the declared acceptance unit. Volume 8 trace: Ch. 49, Ch. 54, Ch. 61. Capabilities: CAP-AG-01, CAP-AG-06, CAP-TG-05. Full trace: Appendix N.<br>`p115` acceptance unit. Volume 8 trace: Ch. 55. Capabilities: CAP-AG-07. Full trace: Appendix N. |
| `CAP-TG` | 8 | CAP-TG-01 … CAP-TG-11 | `p17` 006 close for the declared acceptance unit. Volume 8 trace: Ch. 4, Ch. 58. Capabilities: CAP-AU-03, CAP-AU-05, CAP-TG-02. Full trace: Appendix N.<br>`p28` acceptance unit. Volume 8 trace: Ch. 5, Ch. 41, Ch. 63. Capabilities: CAP-AU-06, CAP-EO-01, CAP-TG-11. Full trace: Appendix N.<br>`p30` for the declared acceptance unit. Volume 8 trace: Ch. 3, Ch. 5, Ch. 41. Capabilities: CAP-AU-04, CAP-EO-02, CAP-TG-02. Full trace: Appendix N. |
| `REG` | 8 | REG-01 … REG-08 | `p167` REG-01 Global context Persistent above or before work May collapse to explicit switcher; never disappear<br>`p167` REG-02 Workspace navigation Persistent or recoverable primary wayfinding Preserve location, history, and return path<br>`p167` REG-03 Primary task Largest and first semantic work region One clear task owner per composition |
| `BP` | 5 | BP-01 … BP-05 | `p167` BP-01 Compact 0-639px Single-column task flow; bottom navigation; no hidden authority or state<br>`p167` BP-02 Narrow 640-959px Single primary canvas with optional modal supporting detail<br>`p167` BP-03 Standard 960-1439px Collapsible rail; 12-column grid; one supporting panel |
| `CAP-OB` | 5 | CAP-OB-04 … CAP-OB-09 | `p36` declared acceptance unit. Volume 8 trace: Ch. 11, Ch. 44, Ch. 49, Ch. 56. Capabilities: CAP-OB-04, CAP-EO-06, CAP-AG-01. Full trace: Appendix N.<br>`p55` 006 close for the declared acceptance unit. Volume 8 trace: Ch. 11, Ch. 17, Ch. 19, Ch. 62. Capabilities: CAP-OB-04, CAP-UM-01, CAP-TG-06. Full trace:<br>`p74` 006 close for the declared acceptance unit. Volume 8 trace: Ch. 12, Ch. 13. Capabilities: CAP-OB-06, CAP-OB-07, CAP-OB-08. Full trace: Appendix N. |
| `CLR` | 4 | CLR-00 … CLR-03 | `p162` CLR-00<br>`p162` CLR-01<br>`p162` CLR-02 |
| `DEN` | 3 | DEN-01 … DEN-03 | `p167` DEN-01 Strategic 44px controls; 40-48px rows Executive, decision, briefing, and touch contexts<br>`p167` DEN-02 Operational 36px controls; 32-36px rows Default analytical and administrative work<br>`p167` DEN-03 Inspection 28-32px controls; 28-32px rows High-density tables, traces, and operations centers |
| `FW` | 3 | FW-01 … FW-10 | `p187` FW-01, CAP-DS-10<br>`p187` FW-07, CAP-FW-08,<br>`p187` FW-10, CAP-FW-11 |
| `UM` | 3 | UM-04 … UM-12 | `p187` UM-12, CAP-DS-12<br>`p187` UM-04, CAP-UM-05,<br>`p187` UM-08, CAP-DS-12 |
| `AG` | 1 | AG-08 … AG-08 | `p117` AG-08. Full trace: Appendix N. |
| `DS` | 1 | DS-11 … DS-11 | `p93` DS-11, CAP-DS-12. Full trace: Appendix N. |

### Headings detected (81; listed up to 120, keyed by page)

- 9: PART 1 — Design Authority and System Foundations
- 10: 1  Design Authority, Scope, and Conformance
- 12: 2  Experience Doctrine and Strategic Intelligence Loop
- 14: 3  Design Principles and Experience Prohibitions
- 16: 4  Personas, Roles, Authority, and Consequence Classes
- 18: 5  Design System Architecture and Governance Model
- 20: 6  Canonical Context, Truth, and Product State
- 22: 7  Accessibility, Inclusion, and Global Readiness
- 24: 8  Cross-Volume Traceability and Design Acceptance
- 26: PART 2 — Application Shell and Information
- 27: 9  Global Application Shell
- 29: 10  Operating Context Bar and Scope Switching
- 31: 11  Workspace Navigation and Wayfinding
- 33: 12  Object-Centered Information Architecture
- 35: 13  Search, Command, and Intent Entry
- 37: 14  Page Composition, Grid, Density, and Responsive Behavior
- 39: 15  Cross-Workspace Continuity, Deep Links, and History
- 41: 16  Multi-Window, Large Display, and Command Environment
- 43: PART 3 — Foundations and Component System
- 44: 17  Color, Contrast, and Semantic Status
- 46: 18  Typography, Numerical Data, and Content Hierarchy
- 48: 19  Spacing, Layout, Elevation, and Surfaces
- 50: 20  Iconography, Symbols, and Visual Language
- 52: 21  Forms, Input, Validation, and Error Prevention
- 54: 22  Data Tables, Lists, Trees, and High-Density Inspection
- 56: 23  Panels, Drawers, Dialogs, and Progressive Disclosure
- 58: 24  Motion, Feedback, Loading, and Perceived Performance
- 60: PART 4 — Strategic Object and Evidence Experience
- 61: 25  Canonical Object Header and Identity
- 63: 26  Evidence, Citation, Provenance, and Chain of Custody
- 65: 27  Truth State, Confidence, Uncertainty, and Dissent
- 67: 28  Temporal State, Timeline, As-Of, and Replay
- 69: 29  Entity, Relationship, and Knowledge Graph Exploration
- 71: 30  Enterprise Memory and Strategic Record
- 73: 31  Documents, Media, Geospatial, and Scientific Evidence
- 75: 32  Corrections, Withdrawals, Reconciliation, and Impact
- 77: PART 5 — Foresight and Strategic Decision Experience
- 78: 33  Weak Signals and Indicator Workbench
- 80: 34  Early Warning and Escalation Experience
- 82: 35  Risk and Opportunity Intelligence
- 84: 36  Competitor, Supply Chain, and Domain Intelligence
- 86: 37  Forecast Portfolio and Prediction Horizons
- 88: 38  Scenario Intelligence and Scenario Marketplace
- 90: 39  Simulation Run Center and Digital Twin Branching
- 92: 40  Strategy Graph, Decision Case, and Human Commitment
- 94: PART 6 — Executive and Collaborative Operating
- 95: 41  Executive Operating System Home
- 97: 42  Strategic Briefing and Command Views
- 99: 43  Strategic Health Score
- 101: 44  Proactive Intelligence and Priority Queue
- 103: 45  Strategic Planning and Initiative Governance
- 105: 46  Collaboration, Tasks, Reviews, and Workflow
- 107: 47  Reporting, Publishing, Distribution, and Receipts
- 109: 48  Mobile, Field, Offline, and Disconnected Operation
- 111: PART 7 — Agentic Experience and Automation
- 112: 49  Agent Identity, Role, and Capability Surface
- 114: 50  Agent Planner and Task Plan
- 116: 51  Agent Run, Trace, Tool Use, and Checkpoints
- 118: 52  Multi-Agent Supervision and Workflow Orchestration
- 120: 53  Agent Recommendations, Explanations, and Abstention
- 122: 54  Agent Escalation, Side Effects, and Human Override
- 124: 55  Agent Marketplace and Package Installation
- 126: 56  Agent Incidents, Containment, Replay, and Learning
- 128: PART 8 — Trust, Governance, Administration, and Operations
- 129: 57  Trust and Provenance Experience
- 131: 58  Identity, Access, Tenant, and Domain Administration
- 133: 59  Policy, Privacy, Residency, Consent, and Classification
- 135: 60  Model, Agent, Data, and Ontology Governance
- 137: 61  Security, Cyber, Incident, and Investigation Experience
- 139: 62  Audit, Evidence, Compliance, and Non-Repudiation
- 141: 63  Reliability, Degraded Modes, Recovery, and Service Health
- 143: 64  Integrations, APIs, Exports, and Extensibility
- 145: PART 9 — Delivery, Quality, and Design Operations
- 146: 65  SaaS, Private Cloud, and On-Premise Experience Parity
- 148: 66  Onboarding, Configuration, Migration, and Adoption
- 150: 67  Entitlements, Packaging, Licensing, and Marketplaces
- 152: 68  Design Tokens, Themes, and Customer Branding
- 154: 69  Content Design, Terminology, Localization, and Translation
- 156: 70  Product Analytics, UX Telemetry, and Experience Quality
- 158: 71  Design Acceptance, Accessibility Certification, and Release Readiness
- 160: 72  Design Governance, Contribution, Versioning, and Baseline Closure

## v10 — The_Eye_Volume_10_Investor_Package_v1.0 elvin.pdf

- Path at HEAD: `docs/The_Eye_Volume_10_Investor_Package_v1.0 elvin.pdf`
- Blob: `152de5911d0e5c99e57cf94ef06e966dee6e7713` (verified), 5491176 bytes
- Extraction: `/private/tmp/claude-501/-Users-halawany-work-personal-mohammed-new-project/8704aca5-efd0-4164-8e07-dbc1322f9c20/scratchpad/volumes/v10.txt`, source copy `/private/tmp/claude-501/-Users-halawany-work-personal-mohammed-new-project/8704aca5-efd0-4164-8e07-dbc1322f9c20/scratchpad/volumes/src/v10.pdf`
- Units: 164 pages
- Characters in extraction file: 311019
- PDF metadata: producer='LibreOfficeDev 26.8.0.0.alpha0 (X86_64)' creator='Writer' title='The Eye — Volume 10: Investor Package'
- Empty pages (0): none
- Near-empty pages (0): none

### Identifier families (7)

| Prefix | Distinct ids | Range | Example lines |
|---|---|---|---|
| `IR` | 240 | IR-01-001 … IR-60-004 | `p13` IR-01-001 Truth boundary Represent Executive Investment Thesis only within the declared claim class and scope Claim register / owner approval<br>`p13` IR-01-002 Planning separation Prevent architecture or planning language from implying actual product, customer or financial<br>`p13` IR-01-003 Proof gate |
| `DA` | 30 | DA-01 … DA-30 | `p143` DA-01 Geopolitical posture Executive committee 180 days Growth Baseline / alternatives / evidence / authority / outcome<br>`p143` DA-02 Supply-chain disruption Mission command 1 year Risk Baseline / alternatives / evidence / authority / outcome<br>`p143` DA-03 Regulatory adaptation Risk committee 3–5 years Capability Baseline / alternatives / evidence / authority / outcome |
| `R` | 30 | R-01 … R-30 | `p153` R-01 Category education High High Buyers classify product as chatbot, dashboard or<br>`p153` R-02 Scope execution High Critical Breadth outruns core-loop quality Requirement gates; one end-to-end journey CTO / Product<br>`p153` R-03 Enterprise sales duration High High Pipeline ages without production budget Qualification, mutual plans, downside runway CRO / CFO |
| `S` | 22 | S-01 … S-22 | `p20` Current basis [S-01] [S-02]<br>`p35` Current basis [S-03] [S-04] [S-05] [S-06] [S-09]<br>`p103` Current basis [S-10]–[S-22] |
| `DR` | 20 | DR-01 … DR-20 | `p162` DR-01 Corporate records Formation, registered office, directors, approvals, subsidiaries, good standing Legal<br>`p162` DR-02 Capitalization Cap table, securities, options, SAFEs, notes, rights and dilution CFO / Legal<br>`p162` DR-03 Finance Historical statements, bank records, tax, liabilities, model and cash reconciliation CFO |
| `ENT` | 20 | ENT-01 … ENT-20 | `p145` ENT-01 Source connectors Foundation Named scope / policy / usage / evidence<br>`p145` ENT-02 Observation workflows Foundation Named scope / policy / usage / evidence<br>`p145` ENT-03 Entity resolution Foundation Named scope / policy / usage / evidence |
| `REL` | 20 | REL-01 … REL-20 | `p163` REL-01 Issuer identity verified Legal name, authority, registered details and signatories match governing records<br>`p163` REL-02 Corporate facts verified Team, entity, ownership, capitalization, liabilities and history are evidenced<br>`p163` REL-03 Product facts verified Implementation, production status, customers, deployments and metrics are evidenced |

### Headings detected (70; listed up to 120, keyed by page)

- 11: PART 1 — Investment Thesis and Category
- 12: 1  Executive Investment Thesis
- 14: 2  Strategic Intelligence Failure
- 16: 3  Category Definition
- 18: 4  Closed Strategic Loop
- 20: 5  Why Now
- 22: 6  Long-Horizon Outcome
- 24: PART 2 — Market and Customers
- 25: 7  Customer Universe
- 27: 8  Consequential Decision Archetypes
- 29: 9  Buyers, Champions, and Human Authorities
- 31: 10  Lighthouse Use Cases
- 33: 11  Market Opportunity Model
- 35: 12  Regulatory and Sovereignty Tailwinds
- 37: PART 3 — Product and Strategic Value
- 38: 13  Product System
- 40: 14  World Observation to Intelligence
- 42: 15  Knowledge Graph and Enterprise Memory
- 44: 16  Digital Twins and Six-Horizon Prediction
- 46: 17  Scenario, Simulation, and Decision Intelligence
- 48: 18  Executive OS, Decision Replay, and Learning
- 50: PART 4 — Technology, AI, and Trust
- 51: 19  Multi-Agent Operating Model
- 53: 20  Model Pluralism and LLM Strategy
- 55: 21  Data Platform and Source Universe
- 57: 22  Explainability, Provenance, and Truth
- 59: 23  Security, Privacy, and Sovereignty
- 61: 24  Deployment Parity and Disconnected Operations
- 63: PART 5 — Productization and Delivery
- 64: 25  UI/UX and Strategic Workflows
- 66: 26  Implementation and Time-to-Value
- 68: 27  Domain Specialization Without Fragmentation
- 70: 28  Integration, Interoperability, and Exit
- 72: 29  Reliability, Support, and Operational Quality
- 74: 30  Product Readiness and Evidence Boundary
- 76: PART 6 — Business Model and Commercial Architecture
- 77: 31  Revenue Architecture
- 79: 32  Packaging, Entitlements, and Licensing
- 81: 33  Pricing and Metering
- 83: 34  Deployment Economics
- 85: 35  Marketplace and Ecosystem Economics
- 87: 36  Services, Support, and Partner Economics
- 89: PART 7 — Go-to-Market and Ecosystem
- 90: 37  Market Entry Sequence
- 92: 38  Design Partner Program
- 94: 39  Enterprise Sales Motion
- 96: 40  Government and Defence Motion
- 98: 41  Land-and-Expand System
- 100: 42  Channels, Alliances, and Consulting Ecosystem
- 102: PART 8 — Competition and Defensibility
- 103: 43  Competitive Category Map
- 105: 44  Build, Buy, and Status Quo Alternatives
- 107: 45  Strategic Differentiation
- 109: 46  Strategic Graph and Memory Moat
- 111: 47  Trust, Control, and Deployment Moat
- 113: 48  Ecosystem, Learning, and Switching Dynamics
- 115: PART 9 — Economics and Capital Plan
- 116: 49  Financial Planning Doctrine
- 118: 50  Five-Year Reference Case
- 120: 51  Gross Margin and Infrastructure Economics
- 122: 52  Unit Economics and Customer Value
- 124: 53  Workforce and Operating Model
- 126: 54  Capital Plan, Milestones, and Sensitivities
- 128: PART 10 — Execution, Governance, and Diligence
- 129: 55  Execution Roadmap
- 131: 56  Operating Metrics and Board Cadence
- 133: 57  Enterprise Risk Register
- 135: 58  Governance, Responsible AI, and Compliance
- 137: 59  Data Room, Claims Control, and Diligence
- 139: 60  Investment Decision Framework and Baseline Closure
