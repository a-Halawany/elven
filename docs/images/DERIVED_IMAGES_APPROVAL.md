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
