# Gate-2.2 C19 — consolidated review packet

**Status: NOT MERGED · NOT SIGNED · NOT PUBLISHED.** Nothing in this branch has reached Rekor.

This packet was assembled by the same agent that wrote the change. It is **not** an independent
review and must not be read as one; it exists so that an independent review has a complete and
honest target.

---

## 1. Identity

| | |
|---|---|
| Base SHA | `3d9c80c7e088fa9359ac2428aab688dc898b39bf` (`origin/main`) |
| **Candidate SHA** | the tip of `c19-external-anchoring` — see §11; a packet cannot name its own commit without changing it |
| Branch | `c19-external-anchoring` (pushed, unmerged) |
| Pull request | [#21](https://github.com/a-Halawany/elven/pull/21) — draft, review only |
| Working tree | clean |
| Commits ahead of main | see handoff (a committed count invalidates itself on the next commit) |
| Diff | see handoff |
| Migrations touched | **0** — `0001`–`0021` unchanged |
| Fast-forward to main possible | yes (base is exactly `origin/main`) |

### C18 files changed, and why each was permitted

A C18 component may change only where a new, non-vacuous control reproduces a specific defect
against its frozen predecessor. Five did:

| File | Reproduced defect |
|---|---|
| `c18-watchdog.mjs` | SIGINT/SIGTERM/SIGHUP left child **and** reparented grandchild alive indefinitely |
| `c18-db-paths.mjs` | credentials in `docker` argv, then in container metadata; ambient env handed to every child |
| `c18-contract.mjs` | secret-handoff contract, run-resource identity, pre-spawn argv refusal |
| `c18-query-plan.mjs` | credential position moved from argv to env to stdin, class binding preserved |
| `c18-observational-limits.mjs` | limits reclassified against named authorities |

---

## 2. Frozen criteria

`scripts/gate/lib/c19-criteria.mjs` — **9 constitutional invariants · 18 acceptance criteria ·
62 attack families**.

**Routing rule.** A newly discovered attack class goes to **C20**. Only a demonstrated violation of
a constitutional invariant — a property C19 *claims* and does not hold — reopens the frozen set.
`route()` and `isConstitutional()` implement this, and controls prove both directions.

**Coverage is enforced, not asserted.** `C19_FAMILY_CONTROLS` maps all 62 families to named
controls; a meta-control asserts every family is mapped, every mapping names a real family, and
every named control exists verbatim in a suite. A family cannot be added without a control, and a
control cannot be renamed without the mapping failing.

---

## 3. Claim-to-authority ledger

`scripts/gate/lib/c19-authority.mjs`. The anchor proves exactly four things: **workflow identity**,
the **exact bytes signed**, **log inclusion**, and a **publication time window**.

| Claim | Authority | Status |
|---|---|---|
| evidence-archive-provenance | GitHub OIDC + Fulcio + Rekor | **closed** |
| bootstrap-marking-instant | none | open |
| backend-assigned-identifiers | none | open |
| per-instance-generated-secrets | none | open |
| docker-resource-identity | none | open |
| producer-local-clock | none | open |

Each open limit records the strongest property actually proved and exactly what would close it.
`verifyAuthorityLedger()` **refuses** to mark a claim closed without an independent authority, so a
limit cannot be closed by improving the packaging around it.

---

## 4. Trust material provenance

The first trust registry pinned GitHub's OIDC JWKS **leaf keys** as the offline root. Those rotate,
and a rotating leaf is not a trust anchor. Sigstore keyless does not need them: identity is proven
from the Fulcio certificate's own extensions.

Bootstrapped by walking the real TUF chain:

```
root v15  →  timestamp v765  →  snapshot v165  →  targets v14  →  trusted_root.json
```

`trusted_root.json` sha256 `6494e21e…bc0b66` — **equal to the digest the signed targets metadata
declares**. Pins 2 Fulcio CAs (3 certificates), 2 Rekor log keys, 2 CT log keys. A control proves a
tampered trusted root fails its digest, and another keeps the rotating-key mistake from returning.

---

## 5. Verification performed locally

| Check | Result |
|---|---|
| C18+C19 gate (under the 900 s watchdog) | see handoff — measured on the exact candidate |
| Hermetic control suite | see handoff |
| Anchor attack matrix | see handoff |
| Offline anchor selftest | **PASS** — 0 network attempts |
| Typecheck / lint | **PASS** |
| gitleaks (228 commits, 16.4 MB) | **no leaks found** |
| Owned processes surviving | **0** (non-empty ownership chains) |
| Owned Docker resources surviving | **0** containers, networks, volumes |

### Frozen-versus-corrected differentials

| Scenario | frozen `a8d34c4` | corrected |
|---|---|---|
| SIGINT | child + grandchild **ALIVE**, exit 1 | both contained, exit **130** |
| SIGTERM | child + grandchild **ALIVE**, exit 1 | both contained, exit **143** |
| SIGHUP | child + grandchild **ALIVE**, exit 1 | both contained, exit **129** |
| Deadline | child killed, grandchild **ALIVE** | both contained, exit 124 |
| setsid + reparent escapee | **SURVIVED**, exit 0 | contained |
| Nested: inner vs outer siblings | n/a | outer siblings **untouched** |
| Nested: outer reaches orphan after inner SIGKILL | n/a | **contained** via chain |

Merkle verifier: **180 genuine proofs** accepted across 11 tree sizes; wrong body, wrong
checkpoint, truncated path, extra node and out-of-range index all rejected.

---

## 6. Credential exposure

Handoff is **stdin into a memory-backed tmpfs**; the container entrypoint waits for its secret and
the `docker exec` argv names only a path.

| Surface | Result |
|---|---|
| Host process listing | absent (sampled continuously through a full producer run: **0 hits**) |
| Container process listing | absent |
| `docker inspect` `Config.Cmd` / `Config.Env` | absent |
| Docker logs | absent |
| Container writable layer (`docker diff`) | **0 entries** for the secret file; only the mount point appears |
| Evidence archive | redacted placeholder only; class recorded, value never |

A **pre-spawn refusal** in the producer stops any command whose argv contains a credential value or
a redaction placeholder — the watchdog cannot see a grandchild's argv, but the process building the
command line can.

---

## 7. Historical artifact cleanup

All **28** artifacts across both commits' runs were scanned with full nested extraction. No secret
value was printed, quoted, hashed or preserved; findings are counts and variable names only.

**Deleted — 2**, both `c18-db-paths-evidence-a1` from `d5061b8`, 332 unredacted
`PGPASSWORD`/`POSTGRES_PASSWORD` assignments each:

| Artifact | Run | Tombstone |
|---|---|---|
| `9329319708` | `32149519358` | API 404 on metadata **and** download; absent from the run listing |
| `9329549705` | `32150089911` | API 404 on metadata **and** download; absent from the run listing |

**Retained — 26.** The fifteen `8a23526` artifacts were previously *suspected* and are **clean**;
the ledger records that correction rather than the original suspicion.

**No rotation is claimed, because none is possible.** The values are per-run PostgreSQL container
passwords. Every container port was bound to `127.0.0.1` with an ephemeral host port — four loopback
bindings, zero `0.0.0.0` — and both runs executed on GitHub-hosted single-use runners. The
environment those credentials authenticated to no longer exists. The real risk was **public
retrievability from a public repository** until the November expiry, and deletion closed it.

---

## 8. Publication safety

| Control | State |
|---|---|
| Trigger | `workflow_run` after `ci` only — no `push`, `pull_request` or `workflow_dispatch` |
| Registration | `c19-anchor.yml` is **not registered** as a workflow (only default-branch `workflow_run` workflows are), so it cannot run from this branch at all |
| Workflow permissions | `contents: read`, `actions: read` |
| `id-token: write` | **publish job only** |
| `contents: write` | **nowhere** |
| Release / tag creation | none |
| Guard | push · success · `main` · exact repository · exact source repository · not a fork |
| Publish gating | `needs: [guard, verify]`, `if: needs.guard.outputs.publishable == 'true'` |
| Concurrency | keyed on source commit, `cancel-in-progress: false` |
| Cosign | pinned `v2.4.1`, digest `8b24b946…89249b` **verified before execution** |
| OIDC token | requested in-process by cosign; never written to a file, output, env file or log |
| Lifecycle workflow | holds **no** `id-token` at any level, and asserts its absence at runtime |

**Publication attempts so far: 0.**

---

## 9. Boundaries explicitly NOT claimed

- **Kernel sandboxing** — not claimed on Linux or macOS. Implementing one platform's mechanism
  would create a guarantee the other cannot match; the contract is deliberately identical on both.
- **Arbitrary hostile child** — a descendant that deliberately strips its ownership markers,
  escapes its process group and exists only between census observations is outside the boundary.
  A control **demonstrates** this rather than implying it, and fails if it ever silently changes.
- **SIGKILL to the watchdog itself** — unhandleable by any program.
- **The five open observational limits** in §3.

---

## 9a. Independent review REJECTED the previous candidate — what was wrong

An independent review rejected `28512e8` for C19 closure. Every finding was reproduced here before
anything was changed, and all of them were real. They are recorded in full because the pattern
matters more than the individual bugs: in three separate places the **prose asserted behaviour the
code did not have**, and controls were written against the prose.

### The verifier failed OPEN on identity

`verifyIdentity()` checked a field only when the caller supplied an expected value:

```js
if (expected === undefined || expected === null) return;   // skipped the check
```

The real CLI supplied no workflow digest, and the final workflow step supplied neither a source SHA
nor a run URI. Reproduced: an identity carrying a **wrong source SHA, wrong workflow digest and
wrong run invocation URI** verified with **zero findings**.

Policy v3 makes all 13 delivery-standing fields mandatory; a missing expectation is a refusal. It
adds stable repository and owner ids, distinguishes the signer's `workflow_run` trigger from the
upstream `push`, and includes `/attempts/N` in run invocation URIs as Fulcio actually records them.

### The transparency proof was not bound together

Signature and log entry were checked **separately**, which proves something was signed and something
was logged, never that they are the same thing. `canonicalizedBody` was never decoded, and the
Merkle root came from the bundle itself — so a one-leaf proof whose "root" is the attacker's own
leaf hash was **accepted**. A complete bypass.

Now: the log body is decoded and its digest, signature and certificate must be the ones under
verification; the SET is checked against a log key valid **at the time**; and the root must come
from an **authenticated signed checkpoint**. SCT presence and structure are checked, with signature
verification explicitly delegated to cosign and listed in `DELEGATED_TO_COSIGN` — a hand-rolled
look-alike would report success whether or not it was correct.

### "Recovery" never contacted Rekor

It ran `cosign verify-blob --help` and checked for a local bundle file. The exact failure it claimed
to handle — log accepted, runner died before persisting — therefore **signed again**. The controls
searched source comments and string ordering, so they passed.

`decideRecovery()` now queries the log and is driven by executed scenarios: no record → sign once;
**accepted entry with lost bundle → reuse, zero signing**; ambiguous → refuse; unverifiable →
refuse; log unreachable → refuse rather than blind-sign.

### The anchor workflow published and verified nothing

It never acquired an artifact and passed no `--artifact`/`--bundle`, so the step named *"verify the
published bundle"* verified no bundle, and `verify` with no arguments **exited 0**. It now binds the
source and finalizer runs, refuses a superseded main tip, acquires exactly one finalized artifact by
immutable id and digest, builds the canonical payload, verifies offline and again from a fresh
foreign checkout, and persists the bundle. Its verify job builds — omitting that would have repeated
the defect already fixed in `c19-lifecycle.yml`.

### The frozen signed contract had been abandoned

`c19-attest.mjs` was deleted mid-pass as "dead code" when signing pivoted to the raw ZIP. Signing an
archive carries no purpose, no domain separation, no nonce, no validity window and no binding to the
source run, finalizer run or tree. Restored: the signed object is a JCS-canonical, domain-separated
payload binding **25 mandatory fields**.

### Residue checks could report a false zero

Only containers were queried while the handoff claimed three types, and a docker failure was treated
as an empty inventory. Now all three are queried by exact label, and inability to determine ownership
is a containment failure — **exit 125** — not an absence of residue.

### Controls tested text, not behaviour

The 62-family map proved test *names* existed. Recovery, SCT, checkpoint and body-binding controls
are now behavioural, and the trust material's provenance is reproducible from the repository: the
signed `timestamp` → `snapshot` → `targets` chain is stored with a transcript, and a control asserts
`targets.json`'s declared digest still equals the trusted root in use.

### Docker on macOS: three states, not two

The corrected fail-closed residue check then failed on `macos-14` — correctly, because those runners
have no Docker daemon, so every query failed and ownership was `UNDETERMINED`. Refusing there
conflated two different facts.

Docker **absent** means nothing could have created a governed container, so residue is zero by
construction; it is reported as `NOT APPLICABLE`, because calling it "verified zero" would claim a
Docker parity that platform never had. Docker **installed but unqueryable** remains a containment
failure at exit 125: being unable to ask is not the same as there being nothing there. Three
controls pin the distinction, including that a partial query failure is still undetermined — two
good answers do not vouch for a third.

### Second review round: the publication path was unusable

A second independent review rejected the previous candidate. The findings were reproduced before
anything was changed, and every one was real.

**The dispatcher dropped `--payload`.** `publish` and `verify` both read `--artifact` and `--bundle`
and never `--payload`, so the exact command lines in the workflow died with "--payload is required".
`publish` was also called without `await`, so a rejection became an unhandled promise. The 74
controls exercised the helper functions and passed while the caller was broken. Subprocess controls
now invoke the workflow's literal argument vector, and four of them fail when the defect is
reinstated.

**The payload could not be recovered.** It embedded the signer's run id, a wall-clock `issuedAt` and
a RANDOM nonce, so every retry produced different bytes and a different digest — the Rekor search
could never find the entry a previous attempt had published. Idempotence was impossible by
construction. The signed payload now depends only on the publication identity (source run, finalizer
run, artifact), with the nonce DERIVED from those bindings; the signer's own run is bound by the
Fulcio certificate, where it belongs. Two invocations two seconds apart are byte-identical.

**Recovery wrote to the wrong path.** It produced `${bundlePath}.recovered.json` and returned, while
every downstream step expected `bundlePath` — so recovery could never complete. It now reconstructs
a real Sigstore bundle from the log entry, writes it where it is expected, and subjects it to the
same verification a freshly signed bundle receives. `expectedIdentity: {}` is refused outright.

**Delegation was a comment.** `DELEGATED_TO_COSIGN` named SCT verification, X.509 path validation
and bundle schema validation, and nothing ever invoked cosign. `verify-blob` now runs with the exact
certificate identity and issuer, offline against the pinned trusted root, and its absence fails
delivery standing.

**The finalizer was a race.** `C17 finalize` and this workflow were both triggered by `ci`
completing, so the anchor could query before the finalizer had succeeded — and it then selected any
successful finalizer with a matching SHA, without proving it belonged to the triggering run. The
anchor is now triggered BY the finalizer, so waiting is structural.

**The wrapper was signed instead of the evidence.** Acquisition hashed GitHub's download wrapper,
never checked the API's reported digest, never looked inside, and never ran the existing C17
finalization verifier. `c19-acquire.mjs` authenticates the wrapper, extracts exactly one inner
evidence ZIP and its sidecar (refusing unsafe entries rather than sanitising them), checks the
sidecar's name and digest bindings, runs the existing C17 verifier, and binds both wrapper and inner
digests into the payload.

**Most of the signed contract was ignored.** The verifier checked canonical form, evidence digest,
source SHA and `expiresAt > notBefore`. Everything else was signed and never compared. All mandatory
bindings are now checked against expectations established from GitHub's API, current validity is
enforced, and the nonce must equal the publication identity its own bindings determine.

**Expectations were not exported.** The workflow never set `WORKFLOW_DIGEST` for either verification
step, so a mandatory check had no expectation to compare against. Every verification step now
receives the full set, and a missing expectation is a refusal rather than a skip.

### One regression I introduced while correcting

Editing `dockerInventory` deleted the async sweep functions and broke every signal differential.
Caught by the suite, restored, re-verified 41/41. Recorded because a correction pass that silently
breaks what it is not touching is exactly what a reviewer should expect to be told about.

## 10. Unexecuted external steps

GitHub Actions was in a `major_outage` during the first CI window (incident opened
2026-08-26T15:11:58Z, resolved 2026-08-27T00:26:44Z). Runs from that window — `32985314704`
(`startup_failure`, 0 jobs) and `32985092165` (both jobs `cancelled`, 0 steps) — carry **no
information about this branch in either direction** and are disregarded.

Actions is now operational and the checks have run, with the results in §9a.

**Hosted run status is deliberately NOT asserted in this file.**

A packet that names its own candidate's run results goes stale the moment a correction produces a
new SHA, and committing run identifiers into the branch invalidates the very SHA under review. The
immutable run URLs, ids and conclusions are therefore delivered in the **handoff**, alongside the
exact SHA they belong to, and this section states only what is structurally outstanding:

1. **Hosted `C19 lifecycle` on both platforms** — must be green for the exact candidate under
   review, on both the direct-head (push) and synthetic-merge (pull_request) forms.
2. **The non-publishing end-to-end artifact plumbing** — resolve source and finalizer runs, acquire
   exactly one finalized artifact by id and digest, build the canonical payload, dry run, verify
   offline, verify from a fresh foreign checkout, persist the bundle. This lives in the `publish`
   job of `c19-anchor.yml`, which **cannot run from this branch at all** — `workflow_run` workflows
   register only from the default branch — so it has never executed anywhere and cannot until the
   branch merges. That is a genuine gap in the evidence, not a passing result.
3. **PR-triggered `ci` to completion** — blocked by `CVE-2026-14456` below.
4. **Hosted evidence production, finalizer run and artifact download** for the candidate.
5. **The first Rekor publication** — deliberately not attempted.

### `CVE-2026-14456`, described accurately

Scanner-reported **HIGH** for `libcrypto3`/`libssl3` in the pinned postgres and redis images.
OpenSSL itself rates the underlying QUIC-server issue **Low**, and this gate does not run a QUIC
server. It nonetheless blocks repository merge readiness, did not originate in C19, and hits `main`
identically at unchanged `3d9c80c`. It must be resolved by a separate maintenance change — governing
it with a recorded justification, or moving the base images — and **not** by weakening the
supply-chain gate.

---

## 11. Reproducing this review

```bash
git fetch origin c19-external-anchoring
git checkout c19-external-anchoring   # verify the tip matches the SHA in the handoff
pnpm install --frozen-lockfile

# offline anchor verification — asserts zero network attempts
node scripts/gate/c19-anchor-cli.mjs selftest --offline

# the whole gate under its 900-second bound (produce, verify, 387 + 37 controls)
node scripts/gate/c18-watchdog.mjs 900 node scripts/gate/c18-gate.mjs

# hermetic suite
pnpm --filter @eye/api exec vitest run test/gate/c18-db-paths.test.ts

# anchor attack matrix and lifecycle/containment controls
pnpm --filter @eye/api exec vitest run --config vitest.c18.config.ts test/gate/c19-anchor.ctl.ts
pnpm --filter @eye/api exec vitest run --config vitest.c18-serial.config.ts

# residue
node scripts/gate/c19-anchor-cli.mjs leftovers
```

Frozen-versus-corrected differentials materialise the predecessor from git
(`git show a8d34c4:scripts/gate/c18-watchdog.mjs`), so they cannot drift.

---

## 12. What a reviewer should attack first

1. **The identity policy** — every field is exact; confirm no pattern acceptance was reintroduced.
2. **The inclusion-proof verifier** — hand-written RFC 6962; try malformed audit paths.
3. **The publication guard** — six conditions; find one that does not defend a distinct bypass.
4. **The ownership chain** — confirm an inner watchdog cannot reach outside its subtree, and that
   an outer one still reaches a nested orphan.
5. **The authority ledger** — the closed claim is the one to challenge hardest.
6. **The DER reader** — it parses attacker-supplied bytes; bounds are checked, but verify that.
