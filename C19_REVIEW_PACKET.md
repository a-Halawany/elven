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

**Routing rule.** A newly discovered attack class goes to the **post-Phase-0 backlog**. Only a demonstrated violation of
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
| C18+C19 gate (under the 900 s watchdog) | **PASS** — all 4 stages, 510 + 44 controls, 238.8 s, `contained=true` |
| Anchor + pipeline control suites | **PASS** — 213 controls |
| Persisted production instructions | exact repo and 40-hex SHA, **0 placeholders**; each of the 5 fields refused when omitted |
| Foreign checkout | pinned and detached at the publication SHA; moving/abbreviated/absent references refused, nothing left behind |
| Bootstrap files | `metadata.json` and `VERIFY.md` regenerated from the signed payload and the anchored policy and compared byte for byte; 6 single-change differentials refuse, genuine baseline stays at 0 |
| Genuine package `verify-offline` | **exit 0** — isolation confirmed from inside, pinned cosign executed in-boundary, 0 findings |
| Real reconstructed bundle | **exactly `reuse`**, zero signing, real verifier and pinned cosign |
| Package after the stored TUF timestamp's expiry | **still verifies** |
| Seven single-change mutations | each **refused** (wrapper, inner, sidecar, payload, bundle, trust material, inventory) |
| Offline anchor selftest | **PASS** — 0 network attempts |
| OS network-denial boundary, this host | **PASS** — functionally proved via `sandbox-exec` |
| Typecheck | **PASS** — all workspaces |
| gitleaks | **no leaks in repository source** |
| Supply-chain gate | **FAIL — `CVE-2026-14456` only**, see §10; no secret findings, no worktree mutation |
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
| Cosign | pinned **`v3.1.3`**, per-platform digests in `c19-cosign.json` (linux-amd64 `4629c757b761…`) **verified before execution** |
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

## 9a. The delivery orchestration was redesigned, not patched again

Three reviews rejected three candidates. Each finding was real, each was fixed, and the next review
found the same shape somewhere else. The fourth review identified why: the structure itself was
wrong. Resolution, acquisition, recovery and verification existed in **four** places — two workflow
YAML files with their own `jq` filters, `c19-fixture.mjs`, and `c19-acquire.mjs` — and they
disagreed. The harness resolved fixtures one way and production another, so a green harness proved
something production never did.

### One pipeline

| Module | Sole responsibility |
|---|---|
| `lib/c19-github.mjs` | every GitHub read, with Link-header pagination and fail-closed errors |
| `lib/c19-resolve.mjs` | canonical earliest successful attempt, across all matching run ids |
| `lib/c19-acquire.mjs` | attempt-scoped acquisition, wrapper/inner authentication, C17 verification |
| `lib/c19-rekor.mjs` | Rekor entry ↔ Sigstore bundle conversion |
| `lib/c19-cosign.mjs` | one pinned binary, used by signing and every verification |
| `lib/c19-sandbox.mjs` | OS-level network denial |
| `lib/c19-pipeline.mjs` | the fifteen steps, in order |
| `c19-deliver.mjs` | the one command, in four modes |

Workflow YAML now supplies triggers, permissions and inputs only. A control asserts neither
workflow filters runs, walks attempts or downloads artifacts itself.

### The live chain, executed end to end

`dry-run` against fixture `a8d34c4d` (source `32772872150#1`, finalizer `32773496008#1`) runs the
whole pipeline against the live API and stops at the irreversible step:

```
canonical source 32772872150#1, finalizer 32773496008#1 (same-SHA, unambiguous)
wrapper aae9eefebee22c57… inner c17-cross-host-finalized-a8d34c4d….zip
authenticated source 32772872150#1
payload cde0148bfe948641… identity 08c70e35dc0b553a…
all reversible validation passed
would-sign — the log has no record for these bytes; a real run would sign exactly once here
DRY RUN — zero OIDC requests, zero signing operations, zero Rekor writes
```

The payload digest is a function of the workflow commit passed in, so it differs between a local
reproduction and a hosted run — as it must, since that commit is part of what is being attested.

### The fifth review round: five demonstrated blockers, corrected

**verify-offline could not succeed.** It called the verifier with `recovery: true` and no
`fetchRun`, so the verifier always added *"no means of confirming the original signing run was
authorised"* — a correct refusal for online recovery, reached in a mode that has no network by
construction. It also accepted a cosign path it never invoked, so every check the module explicitly
delegates was omitted while still being listed as delegated. Offline identity is now its own mode
(the certificate's own invocation against the pinned policy and the signed payload's bindings, with
a live run-fetcher refused rather than tolerated), what offline cannot establish is listed in
`DECLARED_OFFLINE_LIMITS`, and the package verifier executes the pinned cosign — digest-verified
before execution — with both verifiers required to pass.

**The positive recovery control bypassed the verifier**, injecting `verifyBundleFn: () => []`. There
is now a source-owned Sigstore fixture generated from scratch: a fixture CA; a leaf carrying the
exact Fulcio OID extensions and an embedded SCT signed over the RFC 6962 precertificate
reconstruction; a real ECDSA signature over a payload built by the pipeline's own
`buildCanonicalPayload`; a real Merkle tree, note-format checkpoint and SET; a verifiable TUF chain;
and a trusted root pinning the three fixture keys. **Pinned cosign v3.1.3 verifies it.**

Giving the verifier its first real signature immediately found a defect in the verifier itself:
`verifyArtifactSignature` called `verify(null, digest, …)`, which Node does not read as a prehashed
digest for EC keys and which returns **false for every genuine ECDSA signature**. It would have
rejected every real Sigstore bundle. Nothing caught it because the only fixture carried a
placeholder signature — the precise cost of a control that replaces the verifier it is testing.

**OS isolation trusted a caller-supplied flag.** Anyone could pass `--inside-sandbox` and the
verifier skipped to verifying, reporting a boundary that was never built. The marker now only
routes: the child proves its own isolation by attempting a connection to a literal address and
requiring the OS to refuse it. Unknown flags are refused rather than ignored.

**Malformed Rekor responses became "no entry."** `Array.isArray(uuids) ? uuids : []` lived inside
the CLI where no control could reach it, converting a malformed success into the one answer that
leads to signing. The transport is now its own module, returns the response raw or throws, and is
exercised at that boundary end to end for zero signing attempts.

**The offline trust contract contradicted itself.** The committed TUF timestamp expires
2026-09-06 and verification used the wall clock, so an archival package with a ten-year payload
window would have stopped verifying six days after it was built. Update freshness and historical
verification are now separate purposes: adopting new metadata requires it to be current; verifying
an archived bundle checks signatures, thresholds and the minimum versions the source-held policy
pins. The package carries `tuf/timestamp.json`, `tuf/snapshot.json`, `tuf/targets.json` and
`policy.json` — without which *"the TUF root authenticates the trusted root"* was an assertion the
verifier had no way to check — and that material is verified against an anchor held independently,
from the reviewed source SHA. `--anchor` may not be the package directory. The instructions check
out the exact SHA rather than mutable main, and every required canonical payload field is enforced.

**The package's own instructions are not the trust root.** `metadata.json` and `VERIFY.md` were
exact-inventory filenames whose *contents* nothing ever read, so replacing them with an attacker's
repository and instructions produced zero findings — a package could redirect the very bootstrap
that selects the supposedly independent verifier and anchor. And `buildDeliveryMetadata` accepted
the caller's `repo` unchanged, checked only for being nonempty, so `attacker/example` was rendered.

Both files are now DERIVED, never supplied: the repository comes from the independently anchored
policy (a caller may pass one, but only to be checked against it), the source SHA and inner name
from the signed payload, the certificate identity and issuer from the anchored policy, and the
publication identity is recomputed from the signed payload rather than carried over from the run
that built the package. `signings` is gone — it is an observation reconstructible from nothing, and
presenting it beside authenticated facts invited it to be read as one. During verification both
files are regenerated from the signed payload and the anchored policy and compared byte for byte,
with an exact key schema; an anchor carrying no policy is a finding rather than a silent skip.

**The approved repository and SHA are obtained independently, through the review handoff.** The
package's instructions are a convenience for executing that, not the source of it: the TUF root
inside a package would equally authenticate a trusted root substituted alongside it.

**Production plumbing, corrected after the fifth round.** Two defects lived only on the production
path, and the fixture concealed both rather than catching them.

`verifyInstructions` fell back to `<owner>/<repo>` and `<REVIEWED SHA>` when metadata omitted them,
and the publish call site omitted both — so a control that supplied them by hand rendered a perfect
document while a real package would have shipped instructions telling its reader to clone a
placeholder. The metadata is now built in one place, `buildDeliveryMetadata`, which the publish path
calls and the controls exercise; the five rendering fields are required, the fallbacks are gone, and
the SHA must be a full 40-character commit taken from `acquisition.authed.sourceSha` — what the
C17-verified evidence proves, not what the caller asked for.

The post-publication foreign checkout was `git clone --depth 1 <repo>`, which resolves to whatever
the default branch is at that moment. Had main advanced after signing, the package would have been
verified with a different verifier, policy and anchor than the publication was made under — after
the irreversible Rekor write, so the failure would have been unrecoverable and not even about the
evidence. `scripts/gate/c19-foreign-checkout.sh` now fetches the commit itself, checks it out
detached, and asserts `git rev-parse HEAD` equals the publication SHA immediately before
verification; a moving, abbreviated or absent reference is refused and nothing usable is left
behind. The anchor is passed explicitly as that checkout. The anchor workflow and a nonpublishing
hosted leg run the same script, and that leg advances the default branch exactly as main advancing
after signing would:

```
c19-foreign-checkout: /tmp/pinned pinned at 9f710631… , detached
a moving clone resolves to c5bc9579…, NOT the publication's 9f710631…
pinned checkout is unaffected by main advancing
refused: main | HEAD | c5bc957 | 0000…0000
the assertion refused before anything could be verified
```

**Ordering.** The second tip check ran before the sandbox probes and the Rekor query; both take real
time and main can move inside them. It now runs inside the sign branch, after the search, with
nothing between it and `sign-blob` — asserted by observing the call order, not by reading source.

### What the redesign corrected

**The publication runner was depending on another job's setup.** It now installs and builds for
itself — the C17 verifier regenerates from that tree, so borrowed state is not enough.

**`workflowDigest` was wrong in kind, not just in value.** Fulcio's Build Config Digest is GitHub's
workflow *commit* (`workflow_sha`). A hash of the YAML bytes could never match a certificate,
because Fulcio never puts one there. The YAML digest is preserved as its own signed field.

**Cosign v2.4.1 is vulnerable and was never invoked.** Now v3.1.3, pinned by digest, verified before
execution, with the same resolved binary signing and verifying, and one explicitly named bundle
format on both sides.

**Recovery was dead code relative to the real command.** Rekor entries and Sigstore bundles differ
in field names *and* encodings — `body` vs `canonicalizedBody`, hex vs base64 log ids and proof
hashes, checkpoint string vs `{envelope}`, PEM vs DER, hex vs base64 digests. Each is a place a
plausible conversion silently produces something unverifiable. The conversion is implemented and
tested field by field against a self-consistent fixture with a real ECDSA key, a real RFC 6962 tree,
a real signed checkpoint and a real SET — so the whole reconstruction and verification path executes
without publishing this project.

Recovery also no longer requires the original run's conclusion to be `success`. That requirement
would have refused every case recovery exists for: Rekor accepted the signature and the run then
failed or was cancelled before persisting the bundle.

**Signing happened before the offline boundary was known to exist.** The publish job runs on Ubuntu,
where unprivileged `unshare` does not work. The pipeline signed with cosign first and called offline
verification afterwards, which threw — so a real publication would have written to Rekor and then
deterministically failed before persisting anything. The boundary is now proved *functionally*
before any irreversible operation, and `sudo unshare` is declared alongside the unprivileged form
because the unprivileged form is not enough on hosted runners. No sandbox means zero signing
attempts, not a post-publication failure.

**The superseded-tip check ran only at resolution.** Acquisition, C17 verification and payload
construction sit between resolution and signing, all against a live API, and main can move inside
that window. Publish now re-reads the tip immediately before the irreversible step. The check also
runs before the run lookup, so a superseded commit whose runs had aged out no longer reports "no
push run exists" — a true statement about a different problem.

**Recovery could never return `reuse`.** It supplied neither `sourceSha` nor `workflowDigest` to the
fail-closed identity verifier, required the original run's conclusion to be `success`, and attached
`_recoveredFromUuid` to the bundle, which is outside the Sigstore schema and rejected by strict
cosign parsing. Expectations now come from the canonical signed payload, recovery provenance is
written *beside* the bundle, and the positive differential asserts **exactly** `reuse` with exactly
zero signing operations, the bundle at the normal path, and no `_`-prefixed keys.

**TUF was never verified.** Comparing a digest to one declared in an unauthenticated `targets.json`
authenticates nothing — it agrees with itself. Signatures, thresholds, versions, expiry, rollback
and both hash *and* length are now verified from the source-held root. Ten mutations are rejected;
the threshold controls show 2-of-5 corrupted signatures still passes and 3-of-5 does not, so the
threshold is doing work rather than the check being uniformly strict.

**The validity window was `1970`–`9999`,** which is the absence of a window. It is derived from the
authenticated finalizer completion instant: bounded, and identical on every retry.

**Attempt numbers are run-local and cannot be sorted globally.** The old ordering could replace an
already-canonical run `10` attempt `2` with a later run `20` attempt `1`. Ordering is now by
authoritative timestamp with deterministic ties, a 404 inside a run's declared attempt range is
indeterminate rather than "did not succeed", malformed Rekor responses are refused rather than read
as "no record exists" and signed over, uuids are validated and deduplicated, and a fetched entry
must be the one that was requested.

**`sudo` discards the environment, and the Linux boundary needs `sudo`.** The re-execution marker
lived in the environment, so it never reached the child; the child took the outer branch and
re-executed itself again, printing the re-execution line twice and never performing the
verification — while still reporting that it had gone offline. macOS could not surface this, because
`sandbox-exec` preserves the environment. The marker is now an argument, which survives an
environment reset and is therefore also required to carry no secret. A control asserts the
re-execution happens exactly once.

**The workflow commit was defaulted to the source commit.** They are different commits of different
things. Omitting the flag produced a signed payload asserting a workflow digest that is not the
workflow's, which no Fulcio certificate could match — a false binding, signed, from a silent
default. It is now required.

**Offline was enforced inside Node.** That proves nothing about a spawned `cosign`, which is the
process whose offline behaviour matters most. It is now `unshare --net` on Linux and `sandbox-exec`
with `(deny network*)` on macOS — both constrain descendants — and an unavailable mechanism refuses
rather than running unconstrained and calling the result offline.

**Attempt scoping had no API to use.** Measured, not assumed: `/runs/{id}/attempts/{n}/artifacts`
returns 404, and the artifact object carries `workflow_run.id` but no `run_attempt`. Scoping
therefore uses this repository's own artifact naming contract, which encodes the attempt — better
than an API field, because it is source-owned.

**Causal binding could not come from the run listing.** GitHub does not expose which run triggered a
`workflow_run`. Resolution therefore *proposes* the identity and the finalizer receipt inside the
C17-verified evidence *authenticates* it; acquisition refuses if they disagree.

### Controls

188 behavioural controls execute the real code paths with injected GitHub responses. None asserts on
comments, test names or YAML text — that is precisely what let three rounds of defects survive a
green suite. Three controls that still did were replaced with executed ones this round: the
superseded-tip guard, which was a grep for its own source line and would have passed unchanged while
the guard was scoped wrongly; and the two offline-verification claims, which now run the real CLI
with the denial mechanisms unreachable (it must refuse) and normally (the verification must happen
in the re-executed child).

Package verification previously had only negative controls, so nothing showed it could pass. A
genuine package — real bytes, digests computed from the files actually written, a payload that is
the canonical encoding of its own content — now raises no structural finding, and one flipped byte
in the inner evidence is caught.

## 10. Unexecuted external steps

GitHub Actions was in a `major_outage` during the first CI window (incident opened
2026-08-26T15:11:58Z, resolved 2026-08-27T00:26:44Z). Runs from that window — `32985314704`
(`startup_failure`, 0 jobs) and `32985092165` (both jobs `cancelled`, 0 steps) — carry **no
information about this branch in either direction** and are disregarded.

Actions is now operational and the checks have run. On the candidate: `build-test` **success**,
`browser-regression` **success**, both `C19 lifecycle` jobs **success** on `ubuntu-latest` *and*
`macos-14`, and the hosted nonpublishing `delivery-chain-dry` job **success** — it resolved a real
publication, acquired and authenticated the evidence, built the payload, passed every reversible
check and stopped at `would-sign`, with zero OIDC requests, zero signing operations and zero Rekor
writes.

`ci` is **red on `supply-chain` only**, and only on `CVE-2026-14456` — see below. Two defects were
found by the hosted runs and could not have been found locally, because they are Linux-only: the
`sudo` environment reset described in §9a, and a control that reached the live GitHub API. Both are
fixed in the candidate.

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

# the whole gate under its 900-second bound (produce, verify, 510 + 44 controls)
node scripts/gate/c18-watchdog.mjs 900 node scripts/gate/c18-gate.mjs

# hermetic suite
pnpm --filter @eye/api exec vitest run test/gate/c18-db-paths.test.ts

# anchor attack matrix, delivery pipeline, and lifecycle/containment controls
pnpm --filter @eye/api exec vitest run --config vitest.c18.config.ts \
  test/gate/c19-anchor.ctl.ts test/gate/c19-pipeline.ctl.ts
pnpm --filter @eye/api exec vitest run --config vitest.c18-serial.config.ts

# the delivery pipeline against the live API, stopping at the irreversible step.
# The source root must be an INSTALLED checkout of the fixture SHA: the C17 verifier
# regenerates the archive from it, and an uninstalled tree is refused rather than skipped.
REPO=a-Halawany/elven
eval "$(node scripts/gate/c19-fixture.mjs --repo "$REPO" | grep -E '^(sha|finalizer_run|finalizer_attempt)=')"
git worktree add --detach /tmp/c19-src "$sha" && (cd /tmp/c19-src && pnpm install --frozen-lockfile)
# --workflow-sha is REQUIRED: Fulcio's Build Config Digest is GitHub's workflow commit, and
# defaulting it to the source commit would sign a binding that is false.
node scripts/gate/c19-deliver.mjs dry-run --repo "$REPO" --sha "$sha" \
  --finalizer-run "$finalizer_run" --finalizer-attempt "$finalizer_attempt" \
  --workflow-sha "$(git rev-parse HEAD)" \
  --source-root /tmp/c19-src --out /tmp/c19-dry

# the supply-chain gate. Its cache and output MUST live outside the worktree: writing them
# inside makes the gate report that scanning changed the source it was describing, and makes
# gitleaks scan trivy's own vulnerability database. Expect exactly one failure class,
# CVE-2026-14456, which is separate repository maintenance (see below).
node scripts/gate/supply-chain.mjs --out /tmp/c15-out --trivy-cache /tmp/c15-cache

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
7. **The order of the irreversible step** — confirm that on a host with no denial mechanism the
   pipeline performs zero signing operations, rather than signing and then failing to verify.
8. **The TUF threshold** — confirm the mutations are non-vacuous: below-threshold corruption must
   still pass, or the check is merely strict rather than correct.

Two notes for a reviewer reproducing this locally. The scanner pins authenticate the *binary*, not
the version string, so a Homebrew build of the correct version is refused by design; install the
release binaries with `scripts/gate/install-scanners.sh` (`DEST=` to a writable directory, with that
directory first on `PATH`). And `plan` and `dry-run` deliberately accept a historical commit: they
cannot sign, and requiring them to describe main's current tip would make the harness impossible
rather than safe. `publish` enforces the tip unconditionally, twice.
