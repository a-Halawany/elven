# Gate-2 evidence — how it is bound to the source

This directory is **not** part of the source candidate. It is produced by running
the gate against a frozen `SOURCE_CANDIDATE_SHA` in a fresh isolated checkout and
is recorded afterwards in a separate `EVIDENCE_ATTESTATION_SHA`, so no artifact
ever contains evidence about itself.

| File | Content |
|---|---|
| `git-metadata.txt` | Declared SHAs, clean-worktree proof, isolated-checkout procedure |
| `tracked-source.sha256` | Archive + file-list digests for the source candidate |
| `tracked-source-manifest.sha256` | **Per-file** SHA-256 for all 144 tracked files |
| `the-eye-source.bundle` | Verifiable git bundle (clone/verify offline) |
| `test-runs.txt` | Raw log: every step with command, tool versions, timestamp, exit code and source SHA |
| `clean-typecheck.txt` | Clean-source typecheck + build in CI order, no stale artifacts |
| `demo-virgin-transcript.txt` | Virgin `demo.sh` run, login proof and teardown |
| `supply-chain/` | SBOM (source-SHA stamped), identity reconciliation, prod+dev licence inventories, dependency audit, both secret scans, filesystem scan, exact pinned-image scans |

Verify the bundle and the source independently:

```bash
git bundle verify evidence/the-eye-source.bundle
git clone evidence/the-eye-source.bundle verify && cd verify && git checkout <SOURCE_CANDIDATE_SHA>
git archive <SOURCE_CANDIDATE_SHA> | shasum -a 256   # must equal tracked-source.sha256
```
