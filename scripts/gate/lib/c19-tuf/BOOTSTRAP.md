# Sigstore TUF bootstrap — reproducible transcript

The repository previously stored only the TUF **root** and the resulting **trusted root**, with the
delegation chain between them described in prose. That is not evidence: a reader could not check
the stated provenance without redoing the walk and trusting that it produced the same answer.

The signed chain is therefore stored here in full, so the trusted root's provenance is verifiable
from the repository alone.

## The chain, as walked

```
root v15  ──signs──▶  timestamp v765  ──names──▶  snapshot v165  ──names──▶  targets v14
                                                                                  │
                                                                                  ▼
                                                                      trusted_root.json
                                            sha256 6494e21ea73fa7ee769f85f57d5a3e6a08725eae1e38c755fc3517c9e6bc0b66
```

The trusted root's digest **equals** the digest the signed `targets.json` declares for it. That
equality is what makes it authenticated material rather than a file someone downloaded.

## Files

| File | Role |
|---|---|
| `../c19-sigstore-tuf-root.json` | root v15 — the bootstrapped anchor, 3-of-5 threshold |
| `timestamp.json` | v765 — names the current snapshot |
| `snapshot.json` | v165 — names the current targets |
| `targets.json` | v14 — declares `trusted_root.json` and its sha256 |
| `../c19-sigstore-trusted-root.json` | the Fulcio CAs, Rekor log keys and CT log keys actually used |

## Reproducing it

```bash
BASE=https://tuf-repo-cdn.sigstore.dev
curl -sO $BASE/15.root.json
curl -s  $BASE/timestamp.json                    -o timestamp.json
SNAP=$(jq -r '.signed.meta["snapshot.json"].version' timestamp.json)
curl -s  $BASE/$SNAP.snapshot.json               -o snapshot.json
TV=$(jq -r '.signed.meta["targets.json"].version' snapshot.json)
curl -s  $BASE/$TV.targets.json                  -o targets.json
H=$(jq -r '.signed.targets["trusted_root.json"].hashes.sha256' targets.json)
curl -s  $BASE/targets/$H.trusted_root.json      -o trusted_root.json
# the load-bearing check: the file's digest must equal what targets.json declared
test "$H" = "$(sha256sum trusted_root.json | cut -d' ' -f1)" && echo "provenance verified"
```

TUF metadata **expires**, which is the point of the design. Version numbers here will age; the
`trusted_root.json` digest is pinned in `c19-trust.json` and is what verification actually depends
on. A control asserts that pin still matches the stored file, so a substituted trusted root fails
before it can be used.
