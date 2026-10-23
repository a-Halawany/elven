# B40 — the design decisions (binding for the prelude and every part)

Stage B40, source platform: F-P1-01 registry/rights, F-P1-02 vault/authenticity, F-P1-03 intake/quarantine, F-P1-04 acquisition policy,
F-P1-12 connector runtime. 80 rows (MAP.md). One combined migration **0123_b40_source_platform.sql**. Branch `phase6-b40` from main `219846f`.
The integration pass's records of #94's merge and main's chain (ci 39423986224, C19 39423986194, finalize 39433958629, anchor 39434131636) go in
B40's first records section (CP6 §B40.0) — no records-only commit elsewhere.

- **D1 (Q1) slices.** B40's dependents take `F-P1-0x@B40` slices (B41/B42 would otherwise cycle with F-P1-01). Bookkeeping adds the P1 lines to
  the tracker controls.
- **D2 (the owner's word, 2026-10-21) the scanning engine — a REAL ClamAV engine for the local/dev profile.** Build the engine PORT (versioned
  engines; each verdict recorded as evidence WITH the engine identity — image digest, engine version — and the signature-database identity —
  database versions/build times and their digests), Engine 1 the sandboxed content inspector, and Engine 2 ClamAV over clamd. The image is selected
  and admitted through the EXISTING processes only: digest pinning, supported-platform scanning (linux/amd64 + linux/arm64), the image inventory and
  admission (C15's own manifest/compose pins and its recheck) — never a weakened C15–C19 control, a licence-policy change, a broad suppression or an
  inventory evasion. The signature database is configured explicitly (its source, its update policy, the identity recorded). The real path is
  exercised end to end: intake → scan → quarantine / admission with a CLEAN input, a HARMLESS detection fixture (the EICAR test string, generated
  at run time, never committed as a literal file the scanners would flag) and an UNAVAILABLE / FAILED scan — an unavailable or incomplete scan is
  NEVER a clean verdict (fail closed → quarantine). Existing content restrictions and human admission authority are unchanged. The in-harness
  stand-in stays for adapter unit tests only — it does not complete the real-engine integration. If the existing admission requirements block the
  chosen image, the precise blocker is reported and the affected rows stay partial. **EXC-P1-001 stays OPEN during construction**; B40's report
  presents the exit evidence (the integrated engine, quarantine verdict evidence, the engine integration tests, the corpus results) and a proposed
  disposition — the owner closes it; its other exposure limits and EXC-P0-003 (OPEN, EXPIRED, exit B65) are unchanged.
- **D3 (Q3) isolation.** The inspector and the connector cell are child processes under Node 24's permission model (spawn-confined.ts: no network
  for the inspector, fs read of the one item, memory/time caps, env stripped, killed on timeout → `unavailable` → quarantine, fail closed). Network-
  level isolation (namespaces/firewall) is carried to B103/B109 — stated, never claimed.
- **D4 (the owner's word, 2026-10-21) revoked rights refuse decision-active use.** Effective rights are enforced through the affected LINEAGE on
  the existing option, publication, export and gate paths (`objects._lineage_usable` and its callers), from CURRENT database state — never waiting
  for a reconciliation tick. BOTH rights sources count: the source CONTRACT's rights (`graph.ev_evidence_state` exposes `contract_rights_state`
  separately) AND the separate rights-TERMS records (0121's terms-derived `rights_state`, which `_lineage_usable` checks today) — an in-force terms
  record must NOT bypass a separately revoked applicable contract, and vice versa. Revocation also unschedules collection, marks the derived
  products (0088's `mark_source_impact`) and lists them for the steward. Proven: the affected use REFUSED with no business effect; unaffected scope
  still usable; recovery ONLY after the applicable rights are legitimately restored through governed versions; history intact; reading stays as it
  was (D9: historical readability grants nobody new evidence-content access).
- **D5 (Q5)** an analyst discovers and registers a candidate; the collection manager evaluates/approves (registrar ≠ approver, the 0022 rule).
- **D6 (Q6) authenticity.** A failed signature is ADMITTED as `authenticity_failed` (constrained: refused at decision-active use, shown weak in
  B82's trust layer); an UNKNOWN signer (no anchor in force) is quarantined. Unsigned sources keep "content authenticity unknown" (the hosted
  phase1-observation journey 7 text stays).
- **D7 (Q7)** SRC@v4 contracts quarantine active content by default; v1–v3 contracts behave exactly as before (no back-fill — **D8, Q10**).
- **D9b (Q8)** reviewer ≠ uploader for MANUAL uploads only (the hosted journey 8's same-manager collect-and-discard stays green).
- **D10 (Q9)** throttling is demonstrated with a synthetic replay set with planted 429 + Retry-After on loopback, on a port the act-target module
  refuses for the live addresses.
- **D11 (Q11)** evidence attributes and inherited obligations are side ledgers; no header field (D22 kept; bases in `version_operations.basis`).
- **D12 (Q12)** a custom adapter package needs a second person's approval (approver ≠ registrar), never an agent.
- **D13 (Q13)** customer approval of a source is recorded by the customer sponsor (W. Zielińska, SYNTHETIC) with `claim = demonstration`.
- **D14 (Q14) no new role.** **D15 (Q15)** every new action is an EXACT PDP rule placed before the `observation.` prefix rule; nothing widened.
- **D16 (Q16)** the two stale quarantine cases stay visible, untouched, listed for the owner.
- **D17 (Q17)** fault-injection points F47–F56 added beside F01–F46 (A4's idiom).
- **D18 frozen.** No change to `.github/workflows/*`, `scripts/gate/*`, the C15–C19 controls, `docker-compose.yml`, `pnpm-workspace.yaml` overrides,
  EXCEPTIONS.md, applied migrations 0001–0122; no new npm dependency; `packages/connector-sdk` is private, dependency-free, and must pass the C15
  licence inventory before any push. D9 (no evidence-content widening) and D22 hold. The act, the candidate act and the walk call
  `scripts/act-target.mjs` before any login. Every key in a fixture is generated at run time — never a key literal in the repository.
- **D19 the history scan.** Every builder scans its own commits with the pinned gitleaks (`$S/bin/gitleaks detect --source . --log-opts
  "<base>..HEAD"`) BEFORE reporting; a key-shaped literal is split before it is committed. The integrator runs the hosted-equivalent scan
  (a GitHub clone with the branch checked out) before every push.
- **D20 demonstration.** The six scenes of MAP.md §8 with the named SYNTHETIC personas; acceptance records `claim = demonstration`; construction,
  demonstrated operation and real acceptance kept apart; the act rehearsed on a restored copy of the newest pre-0123 backup (reproducing the live
  state — never a Redis flush that re-fires schedules) before the live run.

## Alongside this delivery (the owner's word, 2026-10-21) — bounded functional corrections, not a new review programme
- **R1 the impact trigger UI**: `apps/web/app/graph/impact/page.tsx` passes `digest={null}` to "Record the trigger" and "Close the challenge" while
  `apps/web/lib/authority-b81.ts` requires `digestFreeze` → both stay disabled. Reproduce in the browser; give each a review binding that fits the
  command's ACTUAL contract (no dummy digest; CommandReview not relaxed globally); say plainly which binding is a client-side payload review and
  which is server-enforced version binding; prove submission and closure through the governed routes and that changed inputs invalidate the review.
- **R2 the evidenced-read expiry**: `consequentialReadEvidenced` calls its handler before `assertReadComplete` without §TR's savepoint. Reproduce
  first on unchanged main through a governed evidenced read; only if reproduced, the narrow correction (expired → the existing 503 EYE-DEP-001,
  incomplete output discarded, failure evidence kept, a fresh request recovers; result-derived audit outcomes, live-context errors, denials and the
  context lifetime unchanged). Report a source finding separately from a reproduced route defect.
- **R3 carriers**: the shared audit-lock contention / interactive-request blocking → **B63** (isolation and service health), with an effort estimate
  and its completion evidence (a long read beside an ordinary request, audit integrity and authorization completeness preserved). The B50 walk's
  45 s wait accommodates latency and fixes nothing; the A/B timing stays separate from any claim about the cause. Fonts at B111; the local C15
  timeout unresolved; every other carrier intact.
- **R4 the credential rotation** (prepared, NOT executed live): exactly the three exposed demo credentials. A redacted plan rehearsed on an isolated
  copy: references and consumers identified without printing values; existing signed artifacts still verify; the exposed keys retired from new
  signing; the delivery credential coordinated with its consumer; the executive verifier's current-key-only resolution addressed (the minimum
  software work named if public-key retention needs it); the exact operations, preservation checks and recovery procedure.

## D2 — the admission result (2026-10-21, `clamav/PROCESS.md`, `clamav/scans/`, `clamav/engine/`)
**BLOCKED under the existing process; nothing admitted, nothing committed.** The official `clamav/clamav` (Alpine, 1.5.4 = stable) has NO linux/arm64
child (two-platform requirement fails; amd64 scans 0/0). The two-platform `clamav/clamav:1.5.4_base-debian` (index sha256:dfe9a0c9…90eb; amd64
88f3ed69…94f8, arm64 a852e9d4…36ad) scans **1 CRITICAL + 53 HIGH per platform** (108 ungoverned), none fixed upstream; libxml2 (CRITICAL
CVE-2026-6653) and libcurl are linked by clamd / libclamav / freshclam, so a "not affected" disposition would be dishonest. Also: the licence policy
does not inventory container images (a gap, not changed); admission would need a compose pin (D18 froze compose), a third image renumbers the
arm64 scan steps, re-records the C15 trace fixture and the legacy compose view, and upstream watching would edit frozen `c19-patched-images.mjs`.
**Owner decision**: (a) ~38 target-specific dispositions with libxml2/libcurl as accepted risks, or (b) a derived amd64+arm64 image from Cisco's Alpine
recipe through the existing derived-images approval, or (c) wait for Debian fixes / an official arm64 Alpine.
**So §IN builds**: the engine port; Engine 1 the content inspector; Engine 2 the clamd ADAPTER (INSTREAM, PING, VERSION; engine + database identity
on every verdict; timeouts and partial replies → `unavailable` / `incomplete`, never clean); its unit tests against the in-harness stand-in; and a
REAL-ENGINE integration harness that runs only when `EYE_CLAMD_ADDR` names a reachable clamd (otherwise it is skipped and SAYS so — never green by
omission) — run locally against the evaluation engine (the unadmitted Debian image, loopback :3310, database volume `eye-clamav-db`, freshclam
deliberate) with clean / EICAR assembled in memory / engine stopped, recorded as **evaluation evidence of an unadmitted image**. The rows needing an
admitted engine in the local/dev profile stay PARTIAL naming the owner's decision; EXC-P1-001 stays OPEN (exit evidence presented, not claimed).

## Bookkeeping notes for the integrator (the owner's word, 2026-10-21)
- **B63 carries the shared audit-lock contention** (a consequential read commits its audit row first and holds the audit chain head's row lock for
  the whole read; long reads — the trust overview ~48 s, the trace ~11 s — make every other audited request of the tenant wait, `/v1/me` included).
  STAGES B63 own effort **+0.25–0.5 U** (isolation and service health), its note naming the measurable completion evidence: a harness where a long
  consequential read (held ≥ 30 s) runs beside an ordinary audited request whose latency stays within its normal bound, with the audit chain's
  integrity verified end to end and B33-H's authorization-completeness checks unchanged and green. The B50 walk's 45 s wait accommodates latency and
  fixes nothing; the A/B timing (the trace ~11 s on both builds) is not a claim about the intermittent delays' cause.
- **Unchanged carriers**: the fonts' 0.15–0.3 U at B111; the local C15 runner timeout UNRESOLVED; every earlier carrier intact. ClamAV admission,
  the SDK workspace descriptor and EXC-P1-001's closing are the owner's decisions.
