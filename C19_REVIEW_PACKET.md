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
| Commits ahead of main | 35 |
| Diff | 66 files (packet and cross-platform workflow included) |
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
| C18+C19 gate (under the 900 s watchdog) | **PASS** — 387 parallel + 37 serial, 212.1 s, `contained=true` |
| Hermetic control suite | **PASS** — 1094/1094, 130.4 s |
| Anchor attack matrix | **PASS** — 65/65 |
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

## 9a. What CI found, and what it did not

Two failures appeared once Actions recovered. They have different causes and different owners.

### A genuine defect in this branch — found by CI, fixed, proven

`C19 lifecycle` failed on **both platforms** at the controls step: the serial suite's coverage
runner imports `@eye/contracts` from its **built** output, and the workflow only ran
`pnpm install`. Both platforms executed 36 controls and then failed with `ERR_MODULE_NOT_FOUND`
for `packages/contracts/dist/index.js`.

The local battery had been passing only because a `dist/` from an earlier build was still on disk.
That is stale state, not a correct workflow, and it is exactly the class of defect a hosted run
exists to catch. Reproduced locally by deleting `dist/` — identical failure, then 37/37 after
`pnpm build`. A `pnpm build` step is now part of the workflow.

**What CI proved before failing:** the offline anchor selftest passed on **both** `ubuntu-latest`
and `macos-14`. The remaining steps — attack matrix, zero-owned-process, zero-Docker-leftover, and
the assertion that the job holds no OIDC token — were **skipped**, so they are not yet proven in a
hosted run.

### A repository-wide blocker that this branch did not introduce

`ci` failed on `supply-chain` with four ungoverned HIGH findings for **`CVE-2026-14456`**
(`libcrypto3` and `libssl3`) in the pinned postgres and redis images.

Re-running main's own CI at unchanged `3d9c80c` produces **byte-identical findings** — same CVE,
same four packages, same pinned digests, which are identical between main and this branch. This is
a newly published CVE in upstream base images.

**No control was weakened to get past it.** Under the frozen routing rule this is not a
constitutional invariant violation, so it does not reopen C19; it is ordinary maintenance — govern
the CVE with a recorded justification, or move the pinned base images — and it blocks `main`
equally. A reviewer should see it rather than have it worked around.

### Merge-ref relationship, stated exactly

For `pull_request` events GitHub builds a **synthetic merge commit**, so no claim is made that the
head SHA was checked out directly:

| | |
|---|---|
| PR #21 head ref | the frozen candidate |
| Synthetic merge commit | `5507047abc2cd4599939ae82aa3507a19b96cbc7` (for the previous candidate) |
| Its parents | `3d9c80c7…` (main) **+** the candidate |
| Run API `head_sha` | the candidate |

The candidate is therefore tested **as a parent of a synthetic merge**, with `github.sha` being the
merge commit. A reviewer verifying a PR-triggered run must resolve `refs/pull/21/merge` and confirm
its second parent, not assume `github.sha` is the head.

### Local runs must be serial

An earlier local battery reported 10 hermetic failures, all `Test timed out in 60000ms`, with the
suite taking 9241 s instead of ~130 s. The gate, the hermetic suite and the CI investigation were
sharing one machine. Run serially, the same suite is **1094/1094 in 130.4 s**. Those failures were
contention, not defects — recorded here so the discrepancy is not mistaken for flakiness.

## 10. Unexecuted external steps

GitHub Actions was in a `major_outage` during the first CI window (incident opened
2026-08-26T15:11:58Z, resolved 2026-08-27T00:26:44Z). Runs from that window — `32985314704`
(`startup_failure`, 0 jobs) and `32985092165` (both jobs `cancelled`, 0 steps) — carry **no
information about this branch in either direction** and are disregarded.

Actions is now operational and the checks have run, with the results in §9a.

**The following remain genuinely unexecuted and must not be treated as passing:**

1. The `C19 lifecycle` steps after the controls step — attack matrix, zero-owned-process,
   zero-Docker-leftover, and the no-OIDC assertion — on **either** platform. They were skipped
   behind the build defect and need a green re-run.
2. PR-triggered `ci` **to completion** — it is currently blocked by `CVE-2026-14456`, which blocks
   `main` equally and is not this branch's to fix.
3. Any hosted evidence production, finalizer run or artifact download for this candidate.
4. The publication dry run in its real workflow context.
5. The first Rekor publication — deliberately not attempted, and gated on this review.

The review should not conclude until item 1 is green on both platforms. Item 2 cannot go green
until the CVE is governed or the base images move, which is a decision outside C19.

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
