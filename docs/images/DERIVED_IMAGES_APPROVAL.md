# Temporary derived service images — the owner's approval record

**Approval (owner, recorded 2026-09-10 from the review at `59a2459` and the owner's instruction).**
GHCR is approved as a TEMPORARY maintenance route for the PostgreSQL and Redis service images, until
compatible fixed official images are available and verified. Publication proceeds within this approval;
no waiver, no unchecked merge, no new purchase, no source cadence or budget change follows from it.

**Scope of the approval.** Publish the derived images built from `infra/images/candidates/v2/` (the pinned
upstream digests plus the util-linux, OpenSSL and c-ares fixes and an explicit non-root user) to
`ghcr.io/a-halawany/elven/postgres` and `ghcr.io/a-halawany/elven/redis`, as public packages, for
`linux/amd64` and `linux/arm64`; verify the pushed digests; re-issue the applicable SCX dispositions for the
new artefacts under the governed process; re-pin; run the complete FINAL chain. The workflow
`.github/workflows/publish-derived-images.yml` binds every run to the approved source revision named in
`infra/images/candidates/v2/PUBLISH.json`.

**Conditions kept.** Upstream monitoring stays (`c15-patched-image-recheck.yml`, its purpose updated to
"detect a compatible fixed official image for each service"); each service returns to a verified official
image through the digest/disposition/release process as soon as one qualifies on both platforms with its
provenance and compatibility verified — never by an automatic re-pin and never by deleting retained
evidence. The derived images are not a permanent commitment.

**Not part of this approval.** Any change to source cadences or budgets; any purchase; the UN Comtrade key
(untouched, deferred); any merge of the Phase 6 stack.

---

**Return in progress (recorded 2026-09-22; the approval above is untouched).** The condition the approval
named has occurred: the recheck (`c15-patched-image-recheck.yml`, scheduled run `35728647457`, 2026-09-22
12:41 UTC) reported a compatible fixed official image for BOTH services on BOTH platforms —
`postgres:18-alpine` → index `sha256:77f585114c32fbca283dc835b0596f4e52b51b4c6662d7810b2f4084f60a1873`
(18.6-alpine3.24; `libuuid` 2.42.3-r1, OpenSSL 3.5.8-r0, `c-ares` 1.34.8-r0) and `redis:8-alpine` →
index `sha256:ba6e394f6acc2a695ef1b6944f161b9ca813711739be68319fa0db3470673f1d` (8.10.2-alpine;
`setpriv` 2.41.6-r1, OpenSSL 3.5.8-r0). The return is being made through the digest/disposition/release
process the approval requires, and it is at the step that is the owner's: `docker-compose.yml` and
`conformance.manifest.json` are re-pinned to the official indexes (`pinned_at` 2026-09-22), their
provenance and compatibility are verified and recorded under `infra/images/official/20260922/`, and the
six SCX records that named the derived postgres image (SCX-0002…0005 on `linux/amd64`, SCX-0010/0011 on
`linux/arm64`) are DRAFTED as re-issues for the official children in `docs/SCANNER_DISPOSITIONS.md` §3.9
with their approval dates left PENDING. Nothing is deleted: the derived images stay published, their
receipts (`infra/images/published/20260910/`) and the 2026-09-10 records' text remain, and the approved
records in `scripts/gate/scanner-exclusions.json` are byte-for-byte as approved (they now match nothing,
which the C15 gate reports as such). The temporary route ends when the owner approves the re-issues
(`docs/SUPPLY_CHAIN_MAINTENANCE_2026-09.md` §8 lists exactly what remains); until then the gate is red on
the pending records and no merge is possible, which is the process working as written.

---

**Return completed (recorded 2026-09-23; the approval above is untouched).** The owner approved the six
re-issues on 2026-09-23 — "I approve the six prepared #57 reissues—SCX-0002, 0003, 0004, 0005, 0010 and
0011—with their existing scope, classifications and 2026-11-05 expiry unchanged. Record the actual approval
date." — and they are in force from that day in `scripts/gate/scanner-exclusions.json` `records`, each in
place of its 2026-09-10 version (listed by identity under `superseded_records`; full text in git history and
in `docs/SCANNER_DISPOSITIONS.md` §§3–3.8), the dispositions document re-bound by digest, the C15 trace
fixture and `real-image-results.json` re-recorded from a real run with the pinned scanners against the
official indexes. The temporary derived-image route named by this approval has therefore ended: both
services are on verified official images, through the digest/disposition/release process, by no automatic
re-pin and with no retained evidence deleted (the derived images stay published; their receipts remain).
Upstream monitoring stays at its cadence with its purpose updated once more — the configured official pin
passes, a NEWER compatible official build fails to trigger the governed re-pin, an indeterminate check fails
visibly (`docs/SUPPLY_CHAIN_MAINTENANCE_2026-09.md` §8.4). The governed recreation of the live containers onto
the official images remains a separate recorded operation under `docs/ops/BACKUP_RESTORE.md`.
