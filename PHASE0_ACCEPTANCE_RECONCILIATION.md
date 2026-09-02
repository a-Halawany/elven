# THE EYE — Phase 0 / C19 Acceptance-Record Reconciliation

> **Status: READY FOR POST-MERGE INDEPENDENT ACCEPTANCE REVIEW — NOT FORMALLY CLOSED**
>
> Documentation only. This branch changes no implementation, no workflow, no dependency and no
> test. It creates no tag, publishes no release, performs no signing operation, requests no OIDC
> token, and writes nothing new to Rekor.
>
> **Repository baseline under review:** `a792cd9a33ad8e16e12fc16037541d56a7506417`
> **Branch base:** that same SHA, taken directly, so this record cannot drift from what it describes.

---

## 0. Why this document exists

Phase 0 was described as closed in several places before any independent acceptance had happened.
The record also carried statements that were true when written and false afterwards, and were never
retracted. This document reconciles them against the actual GitHub history and the immutable
transparency-log evidence, and states the process exceptions plainly instead of smoothing them
over.

It does not reopen C18 or C19, does not introduce new acceptance criteria, and does not claim
independent acceptance. It is the target for that review, not a substitute for it.

---

## 1. The reconciled chronology

Every time is UTC and comes from the GitHub API or from the transparency log, not from a
narrative. `reviews=0` is GitHub's own count of submitted pull-request reviews.

| When | What | Immutable reference |
|---|---|---|
| 2026-09-01T16:32:36Z | `ci` and `C19 lifecycle` pass on PR #21's head `b6ac2467` | runs 33532406962, 33532406929 |
| **2026-09-01T16:41:53Z** | **PR #21 merged by `a-Halawany` with `reviews=0`** → merge commit `82e90858` | PR [#21](https://github.com/a-Halawany/elven/pull/21) |
| 2026-09-01T16:41:55Z | `ci` on main at `82e90858` — success | run 33533348259 |
| 2026-09-01T16:49:01Z | `C17 finalize` — success | run 33534058587 |
| 2026-09-01T16:50:00Z | `C19 anchor` — `publish` job ran and **signed once** | run 33534158991, attempt 1 |
| **2026-09-01T16:52:49Z** | **First irreversible Rekor publication** | logIndex `2678296492` |
| 2026-09-01T21:47:17Z | PR #25 merged, `reviews=0` → `e3599648` (the corrected C19 implementation) | PR [#25](https://github.com/a-Halawany/elven/pull/25) |
| 2026-09-01T21:54:55Z | `C19 anchor` attempt 1 signed; **attempt 2 re-ran and reused** the existing entry with `0 signing operation(s)` | run 33563602548 |
| 2026-09-01T21:57:24Z | Second Rekor publication | logIndex `2681035221` |
| 2026-09-01T21:58:13Z | `C15 patched-image recheck` (manual dispatch) — success | run 33563880127 |
| 2026-09-02T09:19:41Z | PR #27 merged, `reviews=0` → `1440a09b` (gitleaks allowlist for a published URL parameter) | PR [#27](https://github.com/a-Halawany/elven/pull/27) |
| 2026-09-02T09:27:18Z | PR #26 merged, `reviews=0` → **`a792cd9a`, the baseline under review** | PR [#26](https://github.com/a-Halawany/elven/pull/26) |
| 2026-09-02T09:27:36Z | `C19 anchor` for the now-superseded `1440a09b` **refused to publish** — by design | run 33614221773 |
| 2026-09-02T09:35:52Z | `C19 anchor` at `a792cd9a` — signed once | run 33614981989, attempt 1 |
| 2026-09-02T09:38:25Z | Third Rekor publication | logIndex `2684653822` |
| **2026-09-02T12:08:08Z** | **PR #28 (Phase 1 implementation) opened — before this reconciliation existed** | PR [#28](https://github.com/a-Halawany/elven/pull/28), `reviews=0`, OPEN |
| 2026-09-02T12:09:16Z | Scheduled `C15 patched-image recheck` — success, no patched image available | run 33628366761 |

The refusal at 09:27:36 is worth naming as a control that fired rather than as noise. The anchor
run for `1440a09b` reached its resolution step and stopped: *"1440a09b… is no longer the tip of
main (a792cd9a…); this publication is superseded, and an old successful run must not anchor
evidence for a branch that has moved on."* No signature and no log write followed.

### 1.1 Contradictions in the existing record, and what is true

| Statement | Where | Status |
|---|---|---|
| "**Status: NOT MERGED · NOT SIGNED · NOT PUBLISHED.** Nothing in this branch has reached Rekor." | `C19_REVIEW_PACKET.md` line 3 | **Superseded.** True when written (PR #21 was an open draft). PR #21 merged at 16:41:53Z and three publications have since reached Rekor. |
| "**C19 is the next gate and has not been implemented.**" | `PROGRESS.md` lines 61, 1106, 1169, 1228 | **Superseded.** C19 was implemented and merged in PR #21 and corrected in PR #25. |
| "no part of C19 has been started" | `PROGRESS.md` lines 769, 813, 878, 937, 998, 1051 | **Superseded**, same reason. These sit inside dated historical records and remain accurate *as history*; they are not current status. |
| "`e35996483a…` — the commit at which Phase 0 closed" | `PHASE1_BUILD_PACKET.md` line 8 | **Corrected.** `e3599648` is the commit at which the C19 implementation was completed and published. It is **not** a commit at which Phase 0 was independently accepted, because no independent acceptance has occurred. |
| "C19 may be called closed only when … **Signatures existing is not closure.**" | `GATE2_2_FINAL_CLOSURE_PLAN.md` §C19.7 | **Still governing, and not yet satisfied by an independent party.** The technical conditions it lists are claimed complete by the implementer and are evidenced below; the independence it requires is exactly what is outstanding. |

Nothing above is deleted from its original location. Each carries a pointer to this record so that
a reader arriving at the stale sentence learns it is stale, and the original wording survives as
the historical artifact it is.

---

## 2. Three SHAs, and everything between them

These are three different things and the record has blurred them.

| | SHA | What it is |
|---|---|---|
| **C19 implementation / publication SHA** | `e35996483a6b827603e04cac4d52101d27ca5269` | Merge of PR #25. The corrected C19 implementation. Has its own Rekor entry (logIndex `2681035221`). |
| **Repository baseline under review** | `a792cd9a33ad8e16e12fc16037541d56a7506417` | Merge of PR #26. What this reconciliation describes and what an independent reviewer should verify. Has its **own** Rekor entry (logIndex `2684653822`). |
| First C19 merge (superseded) | `82e908587f089403fc5dcea11c35e3617e209b20` | Merge of PR #21. The first irreversible publication (logIndex `2678296492`). Superseded by `e3599648` for implementation defects; the log entry remains and cannot be withdrawn. |

**Intervening commits — all five, none of them implementation:**

| SHA | Date | What |
|---|---|---|
| `bb8e300e32f22c1a5005db89a52b3cee2bac86c6` | 2026-09-02T07:25:06Z | Phase 1 Build Packet — documentation only |
| `f44e03ac7a9b15d83b8c3ce762edb0fe4986712b` | 2026-09-02T09:10:29Z | Gate: gitleaks allowlist for one published URL parameter |
| `1440a09b175eb80fab2e2f6a694d09ac2f853157` | 2026-09-02T09:19:41Z | Merge of PR #27 |
| `c11c05ddc6b446750c20f539c3a78271c6a0a2df` | 2026-09-02T09:19:56Z | Merge of main into the packet branch |
| `a792cd9a33ad8e16e12fc16037541d56a7506417` | 2026-09-02T09:27:17Z | Merge of PR #26 — the baseline |

### 2.1 What the C19 signature does and does not cover

**Each publication signs its own commit and nothing later.** The Fulcio certificate for the
`e3599648` publication carries `e3599648` in its source-repository-digest and build-config-digest
extensions; it says nothing whatsoever about `bb8e300`, `f44e03a`, `1440a09b`, `c11c05dd` or
`a792cd9a`. A reader must not treat the C19 signature as extending forward over later commits.

The baseline `a792cd9a` is covered because the anchor workflow ran again on it and produced a
**separate** signature over a **separate** payload, with its own certificate binding `a792cd9a`,
its own Rekor entry and its own delivery artifact — not because the earlier signature reaches
forward.

---

## 3. Delivery artifacts and immutable evidence

Three publications exist. All three artifacts are still retrievable and none has expired.

### 3.1 Baseline under review — `a792cd9a…`

| Field | Value |
|---|---|
| Artifact name | `c19-delivery-a792cd9a33ad8e16e12fc16037541d56a7506417` |
| Artifact id / size | `9840617475` / 4 678 157 bytes |
| Artifact ZIP SHA-256 (GitHub) | `8ae539c2918d1c37c824d259f601121669e81e04df63b916f208145cb826f3d0` |
| Inner evidence artifact | `c17-cross-host-finalized-a792cd9a33ad8e16e12fc16037541d56a7506417.zip` |
| Inner SHA-256 | `1ea2feb2af5101ec9a818ec9dc5688e269d7d3f5cf51d93d3af85f7974a2b3c5` |
| Signed payload SHA-256 | `eb558d2b48b7ff920c260c7924355e5661ada55c81c8b4eb24b31c95097b40da` |
| **Rekor entry UUID** | `108e9186e8c5677ab88208e3dfc8ea055e9fe61e6e201a608c4d0b7f40b7ca5c1872b04d8d28f0d8` |
| Rekor leaf hash (UUID without the tree-id prefix) | `b88208e3dfc8ea055e9fe61e6e201a608c4d0b7f40b7ca5c1872b04d8d28f0d8` |
| **Log index** | `2684653822` |
| **Integrated time** | `1788341905` = 2026-09-02T09:38:25Z |
| Log ID | `c0d23d6ad406973f9559f3ba2d1ca01f84147d8ffc5b8445c224f98b9591801d` (rekor.sigstore.dev) |
| Entry kind | `hashedrekord` v0.0.1 |
| **Certificate identity (SAN)** | `https://github.com/a-Halawany/elven/.github/workflows/c19-anchor.yml@refs/heads/main` |
| **OIDC issuer** | `https://token.actions.githubusercontent.com` |
| Certificate validity | 2026-09-02 09:38:25Z … 09:48:25Z (10 minutes) |
| Run invocation URI in the certificate | `https://github.com/a-Halawany/elven/actions/runs/33614981989/attempts/1` |
| Source `ci` run / finalizer run | `33614198879#1` / `33614897613#1` |
| Signer (anchor) run | `33614981989#1` |
| Signed source tree | `aa99f074186156a274b5db9380e7520adaf3d4e9` |
| Workflow YAML digest | `74cd388b113a36dceb859f4990c098683083ffd7148ded055a72de4b82fc60fd` |

### 3.2 C19 implementation / publication SHA — `e3599648…`

| Field | Value |
|---|---|
| Artifact name | `c19-delivery-e35996483a6b827603e04cac4d52101d27ca5269` |
| Artifact id / size | `9822534492` / 4 678 191 bytes |
| Artifact ZIP SHA-256 (GitHub) | `7c6d42bbeb7f9c3f514a1ef9df1e316ed2470afe4eb354409798ae4309166d57` |
| Inner SHA-256 | `2c408ec1d0f11368e8fc0e837dac393c3a015d29107b2c1216a32838725eea04` |
| Signed payload SHA-256 | `8b44b3deefa47420604acfc1e4727b7c0e8a2a89a40a52e31ac80c1c436d5605` |
| **Rekor entry UUID** | `108e9186e8c5677a11747e3613e653df003cda960e92c9352d2e58159101acc0073792365394445d` |
| **Log index** | `2681035221` |
| **Integrated time** | `1788299844` = 2026-09-01T21:57:24Z |
| Certificate identity / issuer | as above (identical workflow identity and issuer) |
| Certificate validity | 2026-09-01 21:57:24Z … 22:07:24Z |
| Run invocation URI | `https://github.com/a-Halawany/elven/actions/runs/33563602548/attempts/1` |
| Source `ci` / finalizer / signer runs | `33562943745#1` / `33563527488#1` / `33563602548#1` |
| Signed source tree | `083c32c4faf64e040bd3db644e80f03caa5c95e9` |

### 3.3 First (superseded) publication — `82e90858…`

| Field | Value |
|---|---|
| Artifact name | `c19-delivery-82e908587f089403fc5dcea11c35e3617e209b20` |
| Artifact id / size | `9811346721` / 4 678 010 bytes |
| Artifact ZIP SHA-256 (GitHub) | `6f553f86411beb929c5e15f9eee28f2461c28ba252401f44c8e8a644777af160` |
| Inner SHA-256 | `178abd9b6fd758336953d24002e1f58db83ced675e11afee6a4e94aaf10ca10e` |
| Signed payload SHA-256 | `58bfdad8d4122ba9e4a98a70f52f917d65b9ec016de54a3cc42503b9a872ecae` |
| **Rekor entry UUID** | `108e9186e8c5677a10eadaf839317033a2fb5d3184bc93610c72c32b4bdbb4f78e13b56ed59d1a9b` |
| **Log index** | `2678296492` |
| **Integrated time** | `1788281569` = 2026-09-01T16:52:49Z |
| Run invocation URI | `https://github.com/a-Halawany/elven/actions/runs/33534158991/attempts/1` |
| Source `ci` / finalizer / signer runs | `33533348259#1` / `33534058587#1` / `33534158991#1` |
| Signed source tree | `3f069838ebf41b1a5883adb1ff5a0d96f9949339` |

This entry is **permanent**. It was published before any independent acceptance and before the
defects that PR #25 corrected were found. It cannot be withdrawn, and the record does not pretend
it can be.

### 3.4 The exact fresh-checkout offline verification command

Shipped inside every delivery package as `VERIFY.md`, reproduced here verbatim. The anchor must
come from the reviewed commit, never from the copies travelling inside the package:

```bash
git clone https://github.com/a-Halawany/elven src
git -C src fetch --depth 1 origin a792cd9a33ad8e16e12fc16037541d56a7506417
git -C src -c advice.detachedHead=false checkout --detach a792cd9a33ad8e16e12fc16037541d56a7506417
test "$(git -C src rev-parse HEAD)" = "a792cd9a33ad8e16e12fc16037541d56a7506417"
```

```bash
node src/scripts/gate/c19-deliver.mjs verify-offline --package . --anchor src/scripts/gate/lib --out /tmp/c19-verify --cosign <pinned cosign v3.1.3>
```

The equivalent single-tool command, for a reviewer who prefers to drive cosign directly:

```bash
cosign verify-blob --bundle bundle.sigstore.json --certificate-identity https://github.com/a-Halawany/elven/.github/workflows/c19-anchor.yml@refs/heads/main --certificate-oidc-issuer https://token.actions.githubusercontent.com --trusted-root trusted-root.json --offline payload.json
```

Pinned cosign is **v3.1.3**; the tracked digests are `linux-amd64`
`4629c757b7618056f8ddd7e2625ae9fdd94c0372a65049520bc7d9df9efc7f71`, `darwin-arm64`
`5cf948c2f4dfe59687bdd0b8523709067383e03982cc543475c8a7dc70e92a76`, `darwin-amd64`
`2347488e5d5b25336644024dfeca5601b190e91197a71a917bda44744aff106c`
(`scripts/gate/lib/c19-cosign.json`).

---

## 4. Verification results, separated by leg and platform

### 4.1 Hosted, at the baseline `a792cd9a`

| Leg | Platform | Run | Result |
|---|---|---|---|
| **Direct head** — `ci` on `push` to main | ubuntu-latest | 33614198879 | success (`build-test`, `browser-regression`, `supply-chain`) |
| **Synthetic merge** — `ci` on `pull_request` (GitHub's merge ref for PR #26) | ubuntu-latest | 33613527101 | success (all three jobs) |
| **C19 lifecycle** — direct head | ubuntu-latest **and** macos-14 | 33614198999 | success on both, plus `delivery-chain-dry` and `foreign-checkout-pinning` |
| **C19 lifecycle** — synthetic merge | ubuntu-latest and macos-14 | 33613527100 | success |
| **Finalizer** | ubuntu-latest | 33614897613 | success |
| **Anchor `verify`** (holds no signing capability) | ubuntu-latest **and** macos-14 | 33614981989 | success on both |
| **Publication** | ubuntu-latest | 33614981989 attempt 1 | signed once; `publish PASS (1 signing operation(s))` |
| **Offline verification from a foreign checkout** | ubuntu-latest | 33614981989 | `isolation confirmed from inside — DENIED:ENETUNREACH`; `package verification, 0 finding(s)`; `verify-offline PASS` |

The `verify` job runs on **both** ubuntu-latest and macos-14 and holds no `id-token`, so the
two-platform evidence is genuinely separate from the single-platform publication.

### 4.2 Recovery / reuse leg

Run 33563602548 (at `e3599648`) was re-run. **Attempt 1** signed once. **Attempt 2** found the
existing entry and reported `C19 deliver: reuse` followed by `publish PASS (0 signing
operation(s))` — the reconstruction path executing in production against a real prior publication,
not a fixture. Its offline verification passed identically.

Run 33614221773 exercised the **refusal** path: an anchor run whose upstream commit was no longer
the tip of main stopped at resolution and never signed.

### 4.3 Independently reproduced during this reconciliation (macOS, this machine)

All three delivery packages were downloaded from GitHub and re-checked **without cosign and
without the project's own verifier**, using only OpenSSL and Node's `crypto`. Fourteen checks per
package, 42 of 42 PASS:

1. inner artifact bytes hash to the sidecar digest;
2. that digest equals the **signed** `finalizedInnerDigest` field;
3. `payload.json` bytes hash to the bundle's `messageDigest`;
4. the same digest is what the Rekor entry body records;
5. the ECDSA (P-256) signature verifies over `payload.json` under the certificate's key;
6. the Rekor body carries the same signature bytes;
7. the certificate SAN equals the identity the packaged policy requires;
8. the OIDC issuer extension equals the required issuer;
9. the leaf's issuer is a CA present in the packaged trusted root;
10. the leaf's signature verifies under that CA's key;
11. the Merkle **inclusion proof recomputes the signed checkpoint root**;
12. the certificate binds *that* commit as its source/build digest;
13. the certificate binds the `github-hosted` runner environment;
14. the package metadata identity matches the packaged policy.

The three entries were additionally confirmed against the **public** log by direct read-only query,
which returned matching UUID, log index and integrated time for each:

```bash
curl -s "https://rekor.sigstore.dev/api/v1/log/entries?logIndex=2684653822"
```

**What this reproduction does not establish:** it does not run the project's own verifier or cosign
(no pinned binary is present on this machine), so it is an independent recomputation of the
cryptography, not a re-execution of the shipped verification path. It also does not re-run any
hosted job.

---

## 5. CVE-2026-14456 — current disposition

Governed by `docs/SCANNER_DISPOSITIONS.md` records **SCX-0006 … SCX-0009**, classification
**`RISK_ACCEPTED`** for all four — deliberately *not* `NOT_AFFECTED`, because the affected OpenSSL
code is installed in both images.

**Exactly what is affected**

| Record | Image | Package | Installed | Fixed in | Platform |
|---|---|---|---|---|---|
| SCX-0006 | `postgres@sha256:b6a16ed0eb96e2c362811f7eeb951eac8b459e7b40be4149ea5444aa7c65569b` (alpine 3.24.1) | `libcrypto3` | `3.5.7-r0` | `3.5.8-r0` | linux/amd64 |
| SCX-0007 | same postgres child | `libssl3` | `3.5.7-r0` | `3.5.8-r0` | linux/amd64 |
| SCX-0008 | `redis@sha256:a6a88248ad5b0c724b7f2b380b7d21f46097db158b2b077ef85bcb97f90aee3a` (alpine 3.23.5) | `libcrypto3` | `3.5.7-r0` | `3.5.8-r0` | linux/amd64 |
| SCX-0009 | same redis child | `libssl3` | `3.5.7-r0` | `3.5.8-r0` | linux/amd64 |

Scanner severity HIGH; **OpenSSL's own vendor rating is Low**; CVSS 7.5
`AV:N/AC:L/PR:N/UI:N/S:U/C:N/I:N/A:H` — availability only. The defect is unbounded memory growth in
an OpenSSL **QUIC server listener** handling Initial packets for unknown destination connection
IDs. Reaching it requires the application to create a QUIC Listener SSL object.

**Scope and prohibited uses.** Valid only for the Phase 0 LOCAL-ONLY profile (`EXC-P0-004`). While
any of these records is in force it is prohibited to expose PostgreSQL or Redis on any non-loopback
interface; to process customer, production or personal data; to run any externally reachable
deployment, demonstration or shared environment; or to carry these dispositions into a Phase 1 or
later profile without fresh review.

**Compensating controls.** (1) Neither service runs a QUIC listener — PostgreSQL serves its wire
protocol over TCP and Redis serves RESP over TCP, and the repository contains no QUIC configuration
for either. (2) Redis runs without TLS at all in this profile. (3) Both are bound to loopback only
(`127.0.0.1:5432`, `127.0.0.1:6379`). (4) The advisory is availability-only. (5) ADR-P0-01 requires
a monthly re-pin and re-scan as a blocking gate.

**Automated patched-image recheck.** `scripts/gate/check-patched-images.mjs`, wired to
`.github/workflows/c15-patched-image-recheck.yml`, runs **daily at 07:20 UTC** and on manual
dispatch. It resolves the current official `postgres:18-alpine` and `redis:8-alpine` digests and
scans them for this advisory; when a patched official digest appears it **fails**, naming the
digest to re-pin to, and these four records must then be deleted, because the gate rejects a record
that matches nothing.

**Scheduled recheck evidence — most recent, run 33628366761 (schedule, 2026-09-02T12:09:16Z, at the
baseline):**

```
postgres:18-alpine -> sha256:d3e1620b530c944afa6e887d22eb899824da68e19c52024bf98f5220c88a65b2
  CVE-2026-14456 is reported (2 row(s))
redis:8-alpine    -> sha256:becdda6c7f4b3fb42e42fd7f120bbf5c54c4caaaf16f26da24e4563d2c1f0576
  CVE-2026-14456 is reported (2 row(s))
c15-recheck: no patched official image yet; SCX-0006..0009 remain justified
```

The manual dispatch at 2026-09-01T21:58:13Z (run 33563880127) reported the same.

**Expiry / review boundary.** All four expire **2026-11-05** and are rejected by the gate **on**
that date (`expires_on <= runDate`), so they are not in force during their stated expiry day. That
date is the mandatory re-review deadline. Owner `founding-engineer`, approver
`gate-2.2-security-review`, approved 2026-09-01 — and see §6 on what that approver string does and
does not mean.

---

## 6. Process-exception record — PEX-P0-001

This is recorded so that it cannot be quietly re-described later.

1. **PR #21 was merged, and an irreversible Rekor publication followed, with zero GitHub reviews
   and without the required pre-merge independent acceptance.** GitHub reports `reviews=0` and no
   review decision for PR #21. It was merged at 2026-09-01T16:41:53Z; the resulting publication was
   integrated into the public transparency log at 2026-09-01T16:52:49Z, log index `2678296492`, and
   is permanent.
2. **This must not be rewritten as if approval occurred beforehand.** No document in this
   repository may describe the C19 merge, or any of the three publications, as having been
   independently accepted, approved or reviewed prior to merge. They were not. Approvals recorded
   in the disposition records (`approver: gate-2.2-security-review`) and in the exception register
   are **the implementer's own attestations**, not independent sign-off.
3. **Phase 1 implementation began before this reconciliation was complete.** PR #28 was opened at
   2026-09-02T12:08:08Z with the Phase 1 L1 implementation, ahead of the formal Phase 0 acceptance
   reconciliation that this document performs. The ordering requirement was not followed. That is
   stated here rather than repaired by back-dating.
4. **PR #28 remains unmerged and is now frozen pending acceptance.** It is OPEN, `reviews=0`, head
   `a94ca703`, and is not modified, merged or closed by this branch.
5. **Acceptance or merging of the Phase 1 Build Packet is not independent Phase 0 acceptance.**
   PR #26 was merged with `reviews=0`. The owner's approval message for the Build Packet approved
   *Phase 1 scope and implementation*; it neither reviewed nor accepted the Phase 0 / C19 closure
   evidence, and this record does not treat it as having done so.
6. Every merge in the Phase 0 history carries `reviews=0`: PRs #14 … #28 inclusive. Single-operator
   merging is the standing condition of this repository, not an exception made once.

---

## 7. Proposed Phase 0 tag and release — **NOT CREATED**

Provided for the reviewer to accept, amend or reject. Nothing below has been created, pushed or
published, and this branch grants itself no `contents: write`.

**Proposed tag target:** `a792cd9a33ad8e16e12fc16037541d56a7506417`
**Proposed tag name:** `phase0-v1.0.0-rc.1`
**Type:** annotated (`git tag -a`), created **only** by the owner after independent acceptance.

Proposed annotation / release body:

```text
Phase 0 — Foundation and Governance Spine (release candidate)

Baseline: a792cd9a33ad8e16e12fc16037541d56a7506417

What this tag marks: the repository state whose Phase 0 governance spine — identity, tenancy,
policy, audit chain, canonical objects, capability-bound ports, the C1–C19 correction series and
the C19 external-anchoring delivery chain — is offered for independent acceptance review.

What it does NOT mark: independent acceptance. No pull request in this history has been reviewed
by a second party; every merge carries reviews=0. The C19 publication for PR #21 was written to
the public Rekor log before any independent review existed, and that entry is permanent.

External anchoring for this commit:
  artifact   c19-delivery-a792cd9a33ad8e16e12fc16037541d56a7506417
  payload    eb558d2b48b7ff920c260c7924355e5661ada55c81c8b4eb24b31c95097b40da
  rekor      logIndex 2684653822, integrated 2026-09-02T09:38:25Z
  identity   https://github.com/a-Halawany/elven/.github/workflows/c19-anchor.yml@refs/heads/main
  issuer     https://token.actions.githubusercontent.com

Scope limits in force: LOCAL-ONLY (EXC-P0-004). No external deployment, no real customer data, no
production claims. Container dispositions SCX-0006..0009 (CVE-2026-14456) expire 2026-11-05.

Status: READY FOR POST-MERGE INDEPENDENT ACCEPTANCE REVIEW — NOT FORMALLY CLOSED.
```

---

## 8. Separation of claims

### 8.1 Claude's implementation and self-verification claims
Everything asserting that a control is correct, complete, or sufficient: the C1–C19 closure
narratives in `PROGRESS.md` and `GATE2_2_FINAL_CLOSURE_PLAN.md`; the assertion that the mutation
matrices are non-vacuous; the `NOT_AFFECTED` and `RISK_ACCEPTED` reachability judgements in
`docs/SCANNER_DISPOSITIONS.md`; the local test counts; and the claim that C19.7's technical
conditions are met. These were produced by the same agent that wrote the code. They are a target
for review, not evidence of review.

### 8.2 Immutable GitHub-hosted operational evidence
Facts that exist outside this repository's narrative and can be re-read by anyone: workflow run
ids, their per-job conclusions and their logs; artifact ids, sizes and ZIP digests; pull-request
merge times, merge commits and `reviews=0`; the three Rekor entries with their UUIDs, log indices
and integrated times; and the Fulcio certificates with their SAN, issuer and build-config
extensions. Where this document states such a fact, it comes from that source.

### 8.3 Process exceptions
§6 (PEX-P0-001) in full: zero-review merges, publication before acceptance, Phase 1 beginning
before this reconciliation, and the Build Packet approval not being Phase 0 acceptance.

### 8.4 Claims independently reproduced during this reconciliation
Only these, and only by the means described in §4.3: the 42 cryptographic checks across the three
delivery packages, and the public-log confirmation of all three entries. This reproduction was
performed on macOS by direct recomputation, deliberately not using the project's own verifier. It
is machine-checkable and does not depend on trusting this repository's narrative — but it was still
run by the same agent, and a reviewer should re-run it rather than take it on trust.

### 8.5 Findings that still require an independent reviewer
1. Whether the C19.7 acceptance criteria are genuinely met, in substance, at `a792cd9a`.
2. Whether the reachability judgements behind SCX-0004 … SCX-0009 are sound, particularly the
   `RISK_ACCEPTED` QUIC-listener argument.
3. Whether the C1–C19 corrections closed the defects they claim to close, or merely relocated them.
4. Whether the fault-injection, mutation and containment matrices are non-vacuous — the property
   the implementer asserts and cannot self-certify.
5. Whether any evidence artifact contains material that should not be published; the packages were
   not re-examined for that during this reconciliation.
6. Whether the permanent `82e90858` entry, published before review, needs anything beyond this
   record — a decision only the owner can make, since the entry cannot be withdrawn.

---

## 9. Known limitations of this reconciliation

* It is documentation-only and changes no behaviour. No control was re-executed on hosted
  infrastructure; §4.1 reports what those runs recorded, it does not re-run them.
* The project's own offline verifier and cosign were **not** executed locally, because no pinned
  cosign binary is present on this machine and acquiring one was outside the authorised scope. §4.3
  is an independent recomputation, not a re-execution of the shipped path.
* Artifact retention: the three delivery packages are currently retrievable from GitHub. GitHub
  artifacts expire. The Rekor entries and the packages' self-contained bundles do not depend on
  that retention, but the convenience of `gh run download` does.
* Rekor's public API was queried read-only to confirm three entries. No entry was created,
  modified or re-published, and no OIDC token was requested.
* **A defect in the frozen PR #28 was observed and deliberately not fixed here.**
  `apps/api/src/observation/coverage/` is excluded by the `coverage/` pattern at `.gitignore:4`, so
  `coverage.service.ts` and `facts.service.ts` were never committed. PR #28's `build-test` and
  `browser-regression` jobs fail on a fresh checkout with `TS2307: Cannot find module
  '../coverage/coverage.service.js'` (runs 33628827694, 33628271070). It breaks a **Phase 1**
  claim, not a Phase 0 acceptance claim, so under the standing instruction it belongs in the Phase 1
  backlog; it is recorded here because it was found here, and because PR #28 must not be described
  as a working implementation until it is fixed.

---

**Final status: READY FOR POST-MERGE INDEPENDENT ACCEPTANCE REVIEW — NOT FORMALLY CLOSED**
