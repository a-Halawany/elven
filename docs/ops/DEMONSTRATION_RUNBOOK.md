# The NORDWERK demonstration — the operator's runbook

How the demonstration service is restarted, migrated and rehearsed without changing what it serves. Written after the
restart incident of 2026-09-13 (§6; PHASE6_REPORT §24.3), which Codex's B11 review asked to be carried here: a future
restart must select the demonstration's database and vault roots explicitly and verify the running target, and the
Phase 0 bootstrap script must never be used as a restart.

## 1. What the demonstration is

| Part | Value | Why it matters |
|---|---|---|
| Database | `eye_demo` in the `eye-postgres` container — **not** the default `eye` | `eye` is the Phase 0 bootstrap database: 66 audit-integrity incidents on record, so an API serving it reports `/readyz` `degraded` |
| API | `apps/api/dist/main.js` on **:3401**; `EYE_DB_NAME=eye_demo`; the scheduler **enabled** (`EYE_SCHEDULER_ENABLED=true`, one job per source queue); `EYE_DEGRADED_DIR=apps/api/.eye-local/degraded-demo` | persisted schedules reconcile at start against the agents on record; the degraded journal is the demonstration's own |
| Vault | `.eye-local/vault/{quarantine,evidence,archive,export}`, relative to the repository root — the roots the process runs with when no `EYE_VAULT_*_ROOT` is set (`apps/api/src/config/config.ts` resolves a relative root against the workspace root, not the process's cwd) | an archive **moves** bytes and a deletion removes them: the roots of the running process are where the demonstration's evidence lives |
| Web | `apps/web` on :3000 (the `eye-web` launch configuration) | |
| Redis | the `eye-redis` container | queues only — rebuildable (BACKUP_RESTORE.md §3) |
| Local secrets | `.eye-local/env`, mode 0600, never committed; a source credential is one `EYE_SRC_<NAME>=…` line there | a changed env file binds nothing until the API is **restarted** with it: readiness reads the running process, not the file |

## 2. Restart — `scripts/ops/demo-restart.sh`

```bash
scripts/ops/demo-restart.sh
```

The script loads `.eye-local/env`, sets the demonstration's identity (the database, the degraded directory, the scheduler,
the per-source concurrency), stops the API listening on :3401 if there is one, starts `apps/api/dist/main.js`, waits for
`/readyz`, and then **verifies the running target** before it reports success: the process's `EYE_DB_NAME`, its vault roots
(or the statement that the workspace roots apply), the scheduler flag, and `/readyz` reading `ok`. It exits non-zero when
the process serves any database but `eye_demo` or is not ready. `--build` rebuilds `apps/api` first (after a code change);
`--verify-only` checks the running process and restarts nothing. `EYE_DEMO_PORT` and `EYE_DEMO_DB_NAME` retarget the
script at a rehearsal copy (the port is passed to the process it starts as `EYE_RUNTIME_PORT`). Nothing it prints is a
credential.

```bash
scripts/ops/demo-restart.sh --verify-only
```

is the check to run whenever the demonstration's state is in doubt — before an act, after any host activity that could
have started an API, and in every act's first lines.

## 3. What must not be used as a restart

`scripts/demo.sh` is the **Phase 0 bootstrap**: fresh containers, a regenerated local secret handoff, migrations on the
**default** database `eye`, the audited bootstrap, an API on :3401 against `eye`, the Phase 0 acceptance suite. It is the
right script for a fresh stack and the wrong one for a running demonstration: it replaces the demonstration process with
one that serves `eye` (see §6). Nothing in it names `eye_demo`.

## 4. Migrating the demonstration (a new batch)

1. **Back up first.** `scripts/ops/backup.sh` (BACKUP_RESTORE.md §4) for the whole runtime state, or at least
   `docker exec eye-postgres pg_dump -U eye -Fc eye_demo > <dated file>` — the act records the path and size.
2. **Stop the API**, then migrate through the migrator with the demonstration named. The migrator reads the process
   environment only, so the local secret handoff is sourced first:
   `set -a; . .eye-local/env; set +a; (cd apps/api && EYE_DB_NAME=eye_demo node scripts/migrate.mjs)`.
3. **Rebuild** what changed: `pnpm --filter @eye/api build`; `pnpm --filter @eye/web build` when a page changed.
4. **Restart with the verification**: `scripts/ops/demo-restart.sh` (or `--build` to fold step 3 in).
5. When a connector's **code digest** changed, the agents registered against the previous digest stop matching
   (SOURCE_INTEGRATION_STATUS §9.11.10): `node scripts/integrations/reprovision-rest-agents.mjs`, then restart once more so
   the scheduler reconciles the persisted schedules to the new agents.

## 5. Rehearsing an act

An act is rehearsed on a **restored copy** before it runs on the demonstration: `eye_demo` restored into a disposable
database, the vault copied to a scratch directory and the API started on another port with `EYE_DB_NAME=<the copy>`
and all four `EYE_VAULT_*_ROOT` pointing at the copy — an archive moves bytes and a deletion removes them, so a rehearsal
on the demonstration's roots would move the demonstration's evidence. The copy is dropped and restored again between
rehearsals (terminate its backends first). The rehearsal's API is stopped by its port before the demonstration's act.

## 6. The incident — 2026-09-13T19:59Z

`scripts/demo.sh` was run on the host outside the author's session (its log at `/tmp/eye-api.log`). It rebuilt `dist`,
migrated the default database `eye` through 0070 (the local env names no `EYE_DB_NAME`), and started an API on :3401
against `eye` — the Phase 0 database with 66 audit-integrity incidents on record, so `/readyz` read `degraded` — replacing
the demonstration process that served `eye_demo`; its web start on :3000 exited 143 (the port held) and was restarted.
On 2026-09-14T16:20Z the demonstration API was restarted on `eye_demo` (`/readyz` ok, 0 incidents) with the same `dist`.
`eye_demo` itself was not touched by that run: its migrations, rows and vault were as the B11 act left them. What the
incident showed: a restart that does not name its target lands on the default, and a restart that does not verify its
target reports nothing wrong. §2's script does both; §3 names what not to run.

**The second incident — 2026-09-15T17:31Z (the B12 act).** The act ran `scripts/ops/demo-restart.sh --build 2>&1 | sed …` to
capture the restart into the evidence file. The API came up on the B12 build and the script's verification passed, but the
capture never received its output: the script detached the API by calling a bash FUNCTION in the background, which leaves a
bash subshell alive as the API's parent holding the saved copies of the script's stdout for the API's lifetime — the pipe
never closes, the caller waits. The earlier acts had piped the script the same way and happened not to block. Corrected: the
forked subshell now `exec`s the API (`( cd apps/api && exec nohup node dist/main.js >> "$LOG" 2>&1 < /dev/null ) &`), so
nothing of the caller's reaches the API (bash's internal descriptors are close-on-exec); the restart was repeated by the
corrected script inside the act. What it showed: a restart script is part of the evidence path and is exercised under a
pipe like any other command.

**Left on the demonstration by the B12 act (2026-09-15), RETIRED by the B13 act (2026-09-15T22:36Z):** an ARCHIVE schedule of profile "24 months" for the source
`nordwerk-internal` (due after 0 seconds) — retired through the governed route `POST …/retention/schedules/:id/retire` with its history kept (§8). A schedule acts only on an evaluation (`/schedules/evaluate`, the steward's act):
an evaluation opens archive actions for that source's hot records past their due (all of them, under the sane policy's 200
opens per evaluation; a restored record only after the 30-day restore window) — opened only; nothing moves without the
authority's approval and the steward's execution. No route retires a schedule (recorded as a follow-up); until one exists,
retire it by SQL on `eye_demo` (`UPDATE retention.schedules SET state = 'retired' WHERE schedule_id = …`) if an evaluation
must not open those actions.

## 7. Reading the running target by hand

The process environment is read on macOS with `ps -E -p <pid> -o command=` and on Linux from `/proc/<pid>/environ`,
filtered to the demonstration's non-secret settings: `EYE_DB_NAME`, `EYE_VAULT_*_ROOT`, `EYE_SCHEDULER_ENABLED`,
`EYE_DEGRADED_DIR`, `EYE_CONNECTOR_PER_SOURCE_CONCURRENCY`. `/readyz` says whether the process is connected and whether
the audit chain is clean (`auditIncidents`), not which database it serves — the environment says that. No value of a
credential is printed by the script or should be by hand.

## 8. The customer export's delivery on the demonstration (B13, 2026-09-15) — the demonstration key, the transfer station, what is demonstration and what is production

**The demonstration signing key.** The product signs export packages with the tenant's Ed25519 key, held by REFERENCE: the
private half is a one-line variable `EYE_EXPORT_SIGNING_KEY_<NAME>` (the base64 of the PKCS8 DER) in the deployment's environment —
on this host the local secret handoff `.eye-local/env` (mode 0600, git-ignored) — resolved by the API process at the declaration and
at every build, never recorded, never logged. The demonstration's key was generated by

```bash
node scripts/retention/generate-demo-signing-key.mjs --public-out .eye-local/export-signing-demo.pub.pem >> .eye-local/env
```

(the generator prints exactly the env line to stdout and the public PEM to the named file; its guidance goes to stderr), the API
restarted (`scripts/ops/demo-restart.sh --build` sources the env), and the key DECLARED through the route with
`purpose: 'demonstration'` (`ed25519:fcd9d6bf234efb3f`; `POST …/retention/signing-keys/list` shows it with readiness `bound`).
**Production activation** is a separate, named step: a production key generated and held under the owner's key custody, bound under
its own reference, declared with `purpose: 'production'`, and the demonstration key retired with a reason
(`POST …/retention/signing-keys/<key id>/retire`). A package signed by the retired key still verifies against its recorded public key.

**The transfer station.** `.eye-local/transfer-station-demo` (created by the operator; an absolute directory outside the four vault
roots — the product refuses one inside them, a vault root itself, or a symlink into one) is the demonstration's ISOLATED SYNTHETIC
DESTINATION, declared as `nordwerk-transfer-station` (kind `transfer_station`). The product writes `<tenant>/<domain>/<action>/
package.tar`, `package.sig` and `delivery.json` there and reads the recipient's `receipt.json` back; the DEMONSTRATION RECIPIENT is
`scripts/retention/transfer-station-recipient.mjs` (it verifies the package with the customer's verifier and writes the receipt; it is
not the product and not a production recipient). The https destination `nordwerk-exports` (`https://exports.nordwerk.example/receive`,
credential reference `EYE_DST_NORDWERK`) is the PRODUCTION kind: on this host its reference is unbound, so its readiness reads
`blocked-credential` and a delivery to it is recorded FAILED `credential_unbound` before any egress. Its activation is the customer's
endpoint and the bound credential (`EYE_DST_NORDWERK=<the bearer value>` in the deployment's environment, the API restarted).

**What the act leaves.** The retired schedule; the demonstration key (active); the two destinations; the station's files and receipt
for the delivered action; the revoked package's ledger rows (its bytes gone). The station directory is not in the backup boundary
(`scripts/ops/backup.sh` tars the vault, not the station); it is the demonstration's record of a delivery, reproducible by the act.

**The demonstration https recipient (B14, 2026-09-16).** `scripts/retention/https-recipient.mjs` is the DEMONSTRATION stand-in for a
customer's https endpoint (not the product, not a production recipient): a real TLS server on this host's loopback interface
(`https://127.0.0.1:3443`), its self-signed certificate and store under `.eye-local/https-recipient-demo` (mode 0700; the
certificate is the TRUST ANCHOR declared with the destination `nordwerk-exports-demo` — the endpoint
`https://nordwerk-exports.demo.invalid:3443/receive`), the bearer it requires bound by reference `EYE_DST_NORDWERK_DEMO` in
`.eye-local/env` (generated by the act's runner; the API process carries it on the one hop; never printed). Start it after a reboot with

```bash
(set -a; . .eye-local/env; set +a; nohup node scripts/retention/https-recipient.mjs --cert .eye-local/https-recipient-demo/recipient-cert.pem --key .eye-local/https-recipient-demo/recipient-key.pem --listen 127.0.0.1:3443 --bearer-env EYE_DST_NORDWERK_DEMO --public-key .eye-local/export-signing-demo.pub.pem --recipient "NORDWERK GmbH — demonstration https recipient" --store .eye-local/https-recipient-demo >> .eye-local/https-recipient-demo/recipient.log 2>&1 &)
```

(the certificate lasts two days from its generation; regenerate with `--self-signed nordwerk-exports.demo.invalid` and declare a new
destination with the new anchor when it expires). WHAT IT PROVES AND WHAT IT DOES NOT: the product's delivery egress refuses every
loopback and private address by design, so a delivery from the demonstration API to this recipient is recorded FAILED transport
(`dns_failure` — the `.invalid` name resolves nowhere) and nothing leaves the process; the positive exchange over TLS with this same
recipient is the harness's (`phase6-retention-b14`, the product's own pinned transport on a real socket with the address vetting the one
substituted step). A delivery through the production egress needs a recipient on a PUBLIC address: the customer's endpoint with its
credential and certificate chain, or — for a hosted demonstration the owner authorizes — this script behind a TLS-terminating edge
(`--plain`, the platform's `$PORT`), declared by its public hostname with the edge's certificate chain as the anchor (or none, the
deployment's trust store).

**The relationship closure and the streamed archive (B15, 2026-09-16).** A customer export now carries the knowledge derived from its
records in `links.json` (the claims by lineage, the graph's edges, the entities with their identifiers, the exclusions under the
ceiling), named by the manifest's `package.links` inside the signed chain; the customer's verifier checks it (`verify-export.mjs`, three
`links:` checks) and scans a tar block by block in constant memory. A package of any size under 64 GiB is fetched by the customer's tool
from the stream route — `node scripts/retention/fetch-export.mjs --api http://localhost:3401 --token <the session token> --tenant <T>
--domain <D> --action <the export's action id> --out <file>.tar --public-key .eye-local/export-signing-demo.pub.pem` (the token is the
caller's session's; never written down) — which streams the tar to the file, compares the streamed sha256 with the announced digest and
runs the verifier; the page's JSON download keeps its 256 MiB ceiling (the browser holds the Blob whole). The station write and the https
delivery stream the archive likewise.

**The revocation notice.** A revocation now tells every destination that received the package: the station receives
`revocation.json` beside `delivery.json` and the product removes its own `package.tar`/`package.sig` there after the commit; the
demonstration recipient answers with `node scripts/retention/transfer-station-recipient.mjs <station> <tenant> <domain> <action>
--revocation` (`--refuse` to keep the copies and answer `copies_destroyed: false`), collected by
`POST …/actions/<id>/export/revocation-notices/<notice id>/collect-receipt`; a further notice by
`POST …/actions/<id>/export/revocation-notices { destinationKey }`.


**The governed import and the exchange mirror (B16, 2026-09-16).** The demonstration now holds a SECOND DOMAIN of the tenant,
`NORDWERK Exchange Mirror (SYNTHETIC)` (created by the act through `POST /v1/tenants/<T>/domains`; idempotent by name), with its own
personas — `m.keller` (retention_steward of the mirror) and `u.fischer` (collection_manager of the mirror), each with a session credential
of its own — the intake source contract `nordwerk-exchange-intake@1` (an upload contract, active, rights confirmed, ceiling `internal`,
residency EU: the contract every imported manifest is recorded under; its ceiling is the import's policy gate), the transfer station
declared in the mirror as `nordwerk-transfer-station` (the SAME directory the origin domain delivers to — the disconnected path, read
entry by entry), and the EXCHANGE PARTNER `nordwerk-origin`: the origin's public key (`.eye-local/export-signing-demo.pub.pem`; a partner
IS a key — the public material only — with an intake contract) declared by the administrator through
`POST …/retention/partners/declare { partnerKey, party, purpose, publicKeyPem, intakeSourceId, intakeContractVersion }`
(`…/partners/list`, `…/partners/<id>/retire { reason }`). An import is opened by the mirror's steward from the station —
`POST …/retention/imports/open { source: { kind: 'station', destinationKey, origin: { tenantId, domainId, actionId } } }` — or inline
(`{ kind: 'inline', base64, exchange? }`; over the real listener the inline body is bounded by the JSON body limit, 100 KiB — the
customer's tool `node scripts/retention/import-package.mjs` states it), verified by sixteen ordered checks (printed by the act), approved
by a SECOND principal on the package digest (`…/imports/<id>/approve { packageDigest, rationale }` — H. Bergmann, the tenant's
retention authority; never the opener), admitted by the steward (`…/imports/<id>/admit`; never the approver) — every record, claim
version, entity and edge under a NEW id with the origin identity in `payload.imported_from`, the import's item map recording
`origin id@version → new id@version` — or withdrawn (`…/imports/<id>/withdraw { reason }`; its quarantine copies tombstoned; `…/imports/<id>/get`, `…/imports/list`). The
customer's round-trip tool compares the origin package, the re-export and the import's record:
`node scripts/retention/compare-round-trip.mjs --origin <E1 dir> --reexport <E2 dir> --map <the import's GET as JSON>`. A quarantined
import's kept entries live under the quarantine vault root and are swept by the sweeper after the quarantine TTL. **What the act leaves:**
the mirror domain with its personas, contract, station and partner; the corrected claim version (C@4) in the origin; the admitted import
with its receipt and the four imported manifests in the mirror (`custody.imported`); the re-export E2 from the mirror; the quarantined
pre-partner import; E3 revoked with the station's mismatched receipt kept on its delivery row. **Two stated limits:** the round trip is
within one installation (a second domain of the tenant) — a foreign installation is the activation step (the other side's public key
declared as the partner; the station or an https destination in between); the positive https exchange remains the harness's (§B14).
**The signing-key binding:** the build refuses (`signing_key_mismatch`, paused for retry, nothing built) when the reference bound in the
process derives a key other than the tenant's declared active key — a rehearsal on a restored copy that binds its own key must therefore
retire the copy's key row and declare its own (by SQL on the copy, as the rehearsal script does), never by touching the demonstration's.

**Imported knowledge announced; the origin's revocation propagated (B17, 2026-09-16).** The mirror domain now holds the SEVEN
SUBSCRIBERS (registered by the administrator with M. Keller as the owner; `relationships` with the demonstration's selection) and two
more personas — `k.vogel` (twin_owner of the mirror) and `s.roth` (strategy_owner of the mirror). An admission now announces itself:
one `GraphChanged/import.admitted` from the admission's own transaction (the created identities, the imported edges, the admitted
claims and records; no walk) and one `ObservationRecorded` per admitted record — the mirror's subscribers take them (retrieval verifies
the projections; the rest find nothing to do until the mirror builds on the knowledge). THE REVOCATION REACHES THE MIRROR: when
H. Bergmann revokes an origin export a domain of the tenant has admitted, the revoke act notifies the importer on the origin's ledger
(the same SIGNED notice, `recipient import:<tenant>/<domain>/<import_id>`) and executes `retention.import.revoke` in the mirror as the
same principal — the imported edges retracted, the created entities retired (identifiers kept), one withdrawn version per imported
object (the lineage carried), the records' bytes tombstoned with `custody.tombstoned`; the import `revoked`; the origin's notice
acknowledged with the mirror's receipt; ONE `GraphChanged/import.revoked` with the walk, so a twin bounded by a retired entity or citing a
withdrawn record goes unverified. The mirror's steward runs the same act by `POST …/retention/imports/<id>/revoke { source: { kind:
'origin' } }` (the pending path — an origin principal without authority in the mirror — or a retry after a legal hold is lifted), or
`{ source: { kind: 'station', destinationKey } }` for a FOREIGN origin's signed `revocation.json` at the import's origin path (verified
against the partner's key; unsigned or unverifiable → refused, nothing destroyed). A LEGAL HOLD on an imported record refuses its step:
the import stays `revoking`, the origin's notice is answered `mismatched` until the hold is lifted and the steward retries. THE SIGNED
NOTICE: every `revocation.json` and https notice now carries `signature` (`eye-revocation-notice/1`, by the package's key when its
reference is bound and derives it, else the active key with `signed_with: 'active_key'` inside the signed bytes); the demonstration
recipient run with `--revocation --public-key .eye-local/export-signing-demo.pub.pem` VERIFIES it before obeying and keeps its copies
otherwise. A destroyed copy is never reused: a later package of the same records admits them afresh under new ids. **What the act
leaves:** each run revokes the import the previous run (or B16) left admitted and leaves its own (E4's); the mirror never holds two live
copies of the NORDWERK knowledge; the two personas; the mirror's subscriptions; the origin's memory-mappings subscription registered anew
(its consumer method changed in B17 — the B8 rule: a changed method is a new consumer). **The rehearsal copy** needs, beyond the
key-row swap, the demonstration key row's reference renamed (the rehearsal binds its own key under that name; the product refuses to
sign with a reference that derives another key and falls back to the active key, stating it inside the signed bytes).

**The lifecycle announced and the chain (B18, 2026-09-17).** `eye_demo` is migrated through 0078; the API serves the B18 build. The act
(`scripts/phase6/act-b18.mjs`, runner `$S/b18/act-b18.sh`) re-registers the TWINS and DECISIONS subscriptions of BOTH domains when their
consumer digest differs from the process's (the B8 rule; the replacements replay from the revoked cursors), then: revokes the mirror's
standing REVOKED import again (`retried`, nothing to remove — B18.1 on the demonstration; the mirror's ONE live import, E4's, is read and
never touched); versions the mirror twin (K. Vogel) and the origin twin (T. Nakamura — the new version keeps the CURRENT version's world
cut-off so the corridor branch's flip of act IV lies within it; the cited records that B12 re-archived are RESTORED first through the
governed restore, P. Novák executing and H. Bergmann approving); issues the 90-day `ecb-eurusd` forecast (N. Eriksen) and a scenario on
it; runs a shocked control and a reroute on the flipped branch; declares a package on the demo DEC with its room, proposes (L. Brandt),
approves (S. Okafor), commits at C3; then the chain — the forecast WITHDRAWN as unfit (`POST …/prediction/forecasts/:id/withdraw
{reason, unfitClass}`, the forecast owner), the reroute REPRODUCED and thereby INVALIDATED (`POST …/twins/simulations/:runId/reproduce`;
the operator's own `POST …/twins/simulations/:runId/invalidate {reason}` is the harness's), the package REOPENED on the first note after
the commitment (`POST …/decisions/packages/:id/reopen {cause: {kind: 'input_invalidated', ref: <the note's event id>}}`, the decision
owner) and re-decided to a SECOND commitment, version 1 replayed at its own instant; L. Ferreira decides the standing challenge case and
A. Hoffmann challenges the claim again; the register read by J. Weber (36/14/0). **What the act leaves:** each run re-issues the 90-day
forecast (the previous run's is withdrawn — no supersession), versions both twins once more, declares a new package with its room,
decides the previous run's challenge and challenges again; the January package and acts I–V are never reopened, withdrawn or
invalidated; nothing is cleaned. **The rehearsal copy** needs nothing beyond B17's edits (the key-row swap, the station repoint, the
demo row's reference renamed); the first rehearsal stopped on the act's hard-coded twin cut-off — the product's refusal was right.

**The working domain (B18).** A TENANT-homed persona (`h.bergmann`, `retention_authority`; a tenant administrator likewise) who opens
`/graph/retention` — or any of the six domain workspaces — is asked for the domain to work in: a tenant administrator picks from the
list, another tenant role pastes the domain id; the header then shows `working domain` with `change`; the choice is the tab's and the
persona's (`sessionStorage['eye.working_domain']`), cleared by Sign out. The approvals the acts perform by API (`retention.action.approve`,
`retention.import.approve`, the key declaration, the package revoke) are now the persona's in the browser too — the owner's walk. The
web is rebuilt with it (`pnpm --filter @eye/web build`; the `eye-web` launch configuration on :3000). A pasted domain id of another tenant
is not refused at scope resolution: the reads answer empty, the writes are refused by the domain keys.

**The browser gate and the demonstration API (B18).** `pnpm test:e2e` starts its OWN API on :3401 (`playwright.config.ts`,
`reuseExistingServer: false`) — the demonstration API must be stopped for a local run of the gate (`lsof -iTCP:3401 -sTCP:LISTEN -t | xargs
kill`) against a fresh database named by `EYE_DB_NAME` with the four `EYE_VAULT_*_ROOT` under a scratch directory (never `.eye-local/vault`),
and restarted afterwards by `scripts/ops/demo-restart.sh` (the B18 act did both: its first line records the verify failing while the API
was down, its step 2 the restart). The hosted job needs nothing of this.

**The source-derived memory records (B19, 2026-09-17).** `eye_demo` is migrated through 0079; the API serves the B19 build. The act
(`scripts/phase6/act-b19.mjs`, runner `$S/b19/act-b19.sh`) looks every basis up at run time (no id hard-coded; a refused candidate is
skipped with the reason): K. Müller DERIVES (`POST …/graph/memory/derive {basis: {kind: 'claim' | 'warning', id, version?}, sourceKind,
recordClass, title, audience, validity?, retention?, related}`; the knowledge owner's human-gated act) a telemetry record from the newest
PortWatch `daily_transit_count` claim and from the corridor warning, and a document record from the NORDWERK supply-relationship claim
(its validity declared — the basis carries no event time); L. Brandt retrieves; S. Okafor composes a briefing that CONTINUES the domain's
newest briefing in its own room (a composition over the whole history folds restricted: act IV's corridor scenario rests on no forecast —
the composer's rule); the same REL is derived once as a communication record and withdrawn by R. Adler; A. Hoffmann challenges and L.
Ferreira corrects the REL in review, J. Weber propagates `claim_correction`, R. Adler re-derives (`POST …/graph/memory/:id/supersede` with
`payload.basis`), L. Brandt replays version 1; S. Roth's derivation from the mirror's imported claim is refused; M. Dvorak corrects the
evidence, the propagation agent's walk marks DOC, P. Novák's deletion of that manifest PAUSES naming `memory_item:<DOC>` and is withdrawn.
**What the act leaves:** the telemetry and warning records; DOC at version n+1 (`basis_corrected`); the communication record withdrawn; a
review correction of the REL and an evidence correction per run (the REL's version and the evidence's version advance by one each run);
nothing retired; no subscription re-registered (no consumer method changed). **The rehearsal copy** needs nothing beyond B17's edits.
**The page:** `/graph/memory` — "Derive from a source" (the basis kind and id, the source kind, the class, the title, the audience, the
validity, the retention); the answer says the classification `declared / inherited / applied`; a derivation the person's clearance does not
cover is refused; the record form records human records only.

**The index tier (B20, 2026-09-22).** `eye_demo` is migrated through 0080; the API serves the B20 build. The act
(`scripts/phase6/act-b20.mjs`, runner `$S/b20/act-b20.sh`) re-registers the RETRIEVAL subscription of BOTH domains when its consumer
digest differs from the process's (the B8 rule: the retrieval consumer's method changed in B20 — the symmetric check that withdraws; the
six other kinds are listed and left) — each replacement replays from the revoked cursor's OWN event (`fromSeq` = the cursor − 1), so its
first check applies and the domain reads `current`; a caught-up domain would otherwise leave the replacement `unverified` until its next
change. Then: the register through the route (36/14/0; L3-I02's `bound_to` names `B20 (0080)`) and the strict check through
`/projections/verify` on every partition of both domains — the act STOPS before any withdrawal if a row fails (a drift found on `eye_demo`
is a finding to record, never an act); A. Hoffmann's search and neighbourhood printing the projection block; the administrator (the
platform-admin session acting in the origin — the demonstration has no domain_admin persona) WITHDRAWS `edges_current` (`POST
…/graph/projections/edges_current/withdraw {reason}` under `graph.projection.withdraw`; human-gated, C2) with the reason "representation
review before the ontology proposal", the reads labelled and the walk constrained, a second withdrawal idempotent; P. Novák opens a
deletion on a candidate manifest looked up at run time (the first that resolves executable is taken, the others withdrawn), H. Bergmann
approves, the execution PAUSES `(projection_withdrawn)`; S. Okafor continues the domain's newest briefing in its room (NOT degraded by the
projection — its `degraded true` is the sources', B10); L. Brandt retrieves a memory item (unaffected); the administrator REBUILDS
(`POST …/graph/projections/edges_current/rebuild {reason}` under `graph.projection.rebuild`) → `restored` (`updated 0, inserted 0,
removed 0` — nothing drifts on the demonstration; the harness carries drift, poison, missing rows and the representation version), the
`projection.rebuilt` event's six deliveries settled (the dispatcher's reconcile tick applies the replayed delivery — the act waits up to
150 s), the paused deletion resolved again and WITHDRAWN. **The operator's own acts** run through `/graph/subscriptions` — the
"Projections (the index tier)" table: one row per partition (condition, state, revision / verified through / lag, withdrawn since and
the reason, the representation, the last rebuild, the last check's counts), the reason input `#preason` (eight characters at least) and
the two governed buttons Withdraw and Rebuild per row, the answers verbatim, the projection events beneath; a refused rebuild names the
unrebuildable rows, the held poisoned rows with their holders, and the dangling references. **A representation bump** (a migration that
changes `graph.projection_representation_version()`) withdraws every partition of every domain at its next check; each returns to service
by a human-gated rebuild — six per domain, in the order entities → resolutions → edges → strategy → invalidations → memory — and every
read is served from the log under the new rule, labelled, meanwhile; B20 bumps nothing. **What the act leaves:** each run revokes and
re-registers the retrieval subscription of a domain whose subscription is outdated (a run on the same build leaves it), withdraws and
restores `edges_current` of the origin once (three ledger rows), leaves one deletion action withdrawn and one briefing; nothing retired;
no persona created; no `.eye-local` edit. **The rehearsal copy** (`eye_demo_b20` on :3411, `$S/b20/rehearsal.sh`) needs nothing beyond
B17's edits; the first rehearsal stopped on the act's own briefing pin (the sources' degradation attributed to the projection), the second
on the act's own scene-1 wait (30 s against the 60-second reconcile tick) and its lookups against the revoked subscription's rows — both
act-side, corrected; the third held. **The browser gate** stops the demonstration API and web as before (§8, B18) and is restarted by
`scripts/ops/demo-restart.sh`; the B20 run was on `eye_browser_20260922` with isolated vault roots (51 tests). **The backup rule (from
B20):** the demonstration's pre-migration backups live under `.eye-local/backups/` (`eye_demo-pre-0080-20260922T193304Z.dump`,
51,890,423 bytes) — a durable directory the host never sweeps; the B18 and B19 dumps were written to the session scratchpad, which the host
sweeps after three days, and were LOST that way over the five-day gap (stated).

**Fitness, coherence and challenge; the cold tier unreachable (B21, 2026-09-24).** `eye_demo` is migrated through 0081; the API
serves the B21 build. The act (`scripts/phase6/act-b21.mjs`, runner `$S/b21/act-b21.sh`) looks every object up at run time by SQL
against the database it is pointed at (no id hard-coded) and casts BY ROLE: the administrator = the platform-admin session, N.
Eriksen (`forecast_owner`), J. Weber (`strategy_owner`), T. Nakamura (`twin_owner` — the twin's owner and the runs' operator), A.
Hoffmann (`domain_analyst`, the download); K. Vogel and S. Roth are mirror-domain personas and R. Adler and L. Ferreira hold no
foresight role — named in the act's header as the correction; no persona is created. Scene 0 re-registers the THREE consumers whose
method changed in B21 — `forecasts`, `scenarios`, `decisions` (the B8 rule: a changed method is a new consumer;
`register-subscriptions.mjs` compares the live `code_digest` with the process's) — each replacement replaying from the revoked
cursor's OWN event, and leaves the four others (`twins`, `retrieval`, `memory-mappings`, `relationships`); the register is read
through the route (40/10/0; the four foresight rows `bound in 0081`; L9-I05's clause re-homed to B22) and the honest defaults
printed. Then: the twin's owner refused (`POST …/twins/:twinId/versions/:version/validate` — the separation of duties) and the
administrator validating the admitted version FIT (the envelope keys the port computed; `ValidateTwin@v1`; no GraphChanged), a
control run carrying `twin_fitness` and `envelope_state` on `SimulationStarted` (the outside-envelope run is NOT staged: the
demonstration's elements lie inside the model's envelope and nothing is regrounded for a show — the harness T1.6); N. Eriksen
assessing the corridor forecast (`POST …/prediction/forecasts/:id/assess`) — the rule's verdict printed WITH its measures (the
demonstration's read `unfit (data_shift)`: the attention mark from an earlier act is the first class in the rule's order; the lapsed
daily cadence would name `envelope_breach` beside it; no scheduler re-issues), the event and its six deliveries, a second assessment
idempotent, the forecast NEVER withdrawn by the act; J. Weber declaring a scenario with a duplicate downside branch (admitted
`failed`, the findings and `routed_to`; a scenario on the unfit forecast refused first), T. Nakamura's run on its branch refused,
the scenario retired and a successor declared (no branch-close act exists); J. Weber challenging a run OF THE ACT'S OWN (the
demonstration's intervention runs all sit on scenarios retired by review — the act carries a twin version whose `known_at` follows
the successor scenario, copies the demonstration's own intervention shape, opens a comparable control, and names no scenario: a
shock bound to an unflipped branch is refused), the administrator requesting the re-run, T. Nakamura opening it as a governed run
(`correctsRunId`, `challengeId` — the nested paths `…/simulations/:runId/challenges/:challengeId/{rerun,withdraw,decide}`), the
compare on the common control, the administrator's DISMISSAL (the demonstration's runs are never invalidated by the act — the upheld
path and the promotion-to-simulation refusal run on the rehearsal copy only, printed REHEARSAL ONLY) and the administrator's
PROMOTION of the control (`POST …/simulations/:runId/promote`; the operator refused to promote his own). **The marker scene (scene
5) and its guards:** the act ITSELF moves the demonstration's archive root marker (`.eye-local/vault/archive/.eye-vault-root`) aside
to `.eye-local/vault/.eye-vault-root.archive-aside` — the product's own definition of reachability (B18) standing in for an
unmounted cold volume; nothing under the root moves — after THREE refusals to start (the marker must read `archive`; no aside file
may exist; the API must report the root reachable now), and restores it in its `finally` and on `exit`/`SIGINT`/`SIGTERM`/`SIGHUP`,
printing the marker's sha256 before and after; a cold NORDWERK record answers metadata-only (`custody.retrieval_degraded`,
`EYE-DEG-001`, `tier/state` archive `reachable false`) and verified again after; the runner prints `ls .eye-local/vault/` after the
act as its independent proof. THE RULE: never move a marker under `.eye-local/vault` outside an act rehearsed on the copy; after any
interrupted act check `ls .eye-local/vault/` for an `.eye-vault-root.*-aside` file and restore it by hand FIRST (`mv
.eye-local/vault/.eye-vault-root.archive-aside .eye-local/vault/archive/.eye-vault-root`); a restarted API re-creates a missing
marker (`ensureRoots`) and would hide the aside copy. `/retention/tier/state` now says `reachable` per root. Nothing else under
`.eye-local` is edited by the act. **What the act leaves:** one validation, one assessment, two carried twin versions, two scenarios
(one retired), one dismissed challenge, one re-run, one promotion, one `custody.retrieval_degraded` row on the cold record beside
two `custody.retrieved` rows; the three re-registered subscriptions (a run on the same build leaves them); no evidence retired;
nothing withdrawn; the marker back in place. **The rehearsal copy** (`eye_demo_b21` on :3411, `$S/b21/rehearsal.sh`) is restored
afresh for every run WITH the vault copied (`$S/b21/demo/vault`; the API on :3411 runs with `EYE_VAULT_ARCHIVE_ROOT` under the copy)
— the marker scene runs on the COPY's archive root first; the ninth rehearsal held whole (`evidence/cp6/b21-rehearsal.txt`), the
eight stops before it every one recorded in the file's header: the FIRST WEDGED the copy's API at the control run — a governed write
nested inside another deadlocking on `ctx.build`'s sweep of hour-old capability nonces (phase 5's making; never on a fresh database;
a copy inherits the demonstration publisher's nonces) — a product defect fixed in B21 (the run's and the reproduction's evidence
retrievals now run BEFORE the write; harness T1.8); THE RULE from it: never a governed write inside another — a handler that needs a
governed read or retrieval does it before its own write, as `prediction.controller.ts` assembles under a read before its write and
`twin.controller.ts` now retrieves under `simulation.read` before `simulation.run`; the residual sites of the same class
(`twin.ground`, the forecast issue, backtest and outcome writes) are recorded for the owner (CP6_BATCHES §B21.4) with the systemic
remedy (`ctx.build`'s sweep with `FOR UPDATE SKIP LOCKED`, a later migration under C18's watch); a rehearsal that hangs at a login
is this wedge's signature — `pg_stat_activity` shows an `eye_commit` session idle in transaction and a second one waiting in
`ctx.issue_commit`; kill the wedged instance, `rehearsal.sh` restores afresh. **The backups:** the pre-migration dump under
`.eye-local/backups/` (`eye_demo-pre-0081-20260924T085136Z.dump`, 52,584,453 bytes — the durable directory, the B20 rule); the
orphan fixture blobs that pre-C5 harness runs wrote under `.eye-local/vault/evidence/` were moved aside to
`.eye-local/backups/vault-orphans-20260924/` (20 files of two verify-run tenants), not deleted — every harness file B21 adds or
appends to names its own temporary vault roots. **The browser gate** stops the demonstration API and web as before (§8, B18) and is
restarted by `scripts/ops/demo-restart.sh`; the B21 run was on `eye_browser_20260924` with isolated vault roots (51 tests; no new
hosted walk — the fitness walk `e2e/phase6-fitness.demo.spec.ts` runs against the seeded demonstration through
`playwright.demo.config.ts` only). **THE RULE FOR `main`'S CHAIN (from the merges of 2026-09-23):** a flake on `main`'s `ci` is
re-run in FULL, never with `--failed` — a partial re-run packages no evidence archive, so C17 finalize fails on it, and the C19
anchor's causal rule refuses to publish a resolution whose source attempt is not the one the finalized evidence authenticates ("a
same-SHA match is not a causal binding" — the anchor at `870b212` was refused this way; every attempt preserved); and the C19
lifecycle's delivery-chain dry run resolves the NEWEST finalization on `main`, so its first attempt after a head whose chain is
inconsistent fails against the previous head's evidence and is re-run once its own finalization exists (the lifecycle at `6212c5b`,
attempt 2 green; #58's own lifecycle on the PR likewise before its merge). An armed merge waits for the required checks to CONCLUDE,
never for "zero failing checks" (the #58 merge went through on a timed-out wait while attempt 2's build-test was pending — the
integrator's error, recorded; the post-merge chain on `main` decided it green).

**The attention policy and the consumers; the containers on the official pins (B22, 2026-09-24).** The service containers run the
OFFICIAL images `main` pins (`postgres@sha256:77f58511…` PostgreSQL 18.6, `redis@sha256:ba6e394f…`) since 16:46Z on the reused
volume (`docs/ops/evidence/live-recreation-20260924T164303Z.md`: the backup — unsealed, the operator's passphrase is not on this host —
under `.eye-local/backups/containers-return-20260924T164303Z/`, the isolated restore check on the target images, the recreation, the
rollback). `eye_demo` is migrated through 0083 (backup `.eye-local/backups/eye_demo-pre-0082-20260924T175523Z.dump`); the API serves
the B22 build; the web shell was rebuilt (the Attention page `/decisions/attention`). The act (`scripts/phase6/act-b22.mjs`) casts BY
ROLE — M. Dvořák (`executive`, `collection_manager` — the source scenes: U. Fischer holds `collection_manager` in the mirror domain
only), N. Eriksen, J. Weber, L. Brandt, L. Ferreira, A. Hoffmann, the administrator; it registers the FOUR new consumers once
(`attention` and `proposals` replaying the domain's history, `source-health` and `observations` from now), publishes policy versions 1
and 2, suspends and reactivates the PortWatch chokepoints source (a minute; the reactivation's first scheduled tick runs at once),
reopens the B18 corridor package on the policy cause (it stays reopened with a draft version 3 — the owner's to propose and commit or
withdraw) and waits out the two-minute warning deadline before escalating. **Re-running the act** is refused by design where it would
repeat a fact (the same rules are a 409; the four consumers are left as registered). **The rehearsal copy** (`eye_demo_b22` restored
from the backup; its API on :3411 against the SEPARATE rehearsal Redis :6392 — the copy shares the demonstration's tenant and domain ids,
so its queues must never share the demonstration's Redis — and an APFS clone of the vault; runner `$S/b22/rehearse.sh`).

## 9. B23 on the demonstration (2026-09-25) — what changed and how to rehearse

- `eye_demo` is migrated through **0084** (the backup before it: `.eye-local/backups/eye_demo-pre-0084-20260924T232509Z.dump`); the API restarted on the B23 build with `scripts/ops/demo-restart.sh` (VERIFIED), the web restarted through the `eye-web` launch configuration.
- The **decisions** and **attention** subscriptions of the origin domain were revoked and registered again by the administrator (their consumer code digests changed in 0084; backlog left). The mirror domain's older decisions/forecasts/scenarios subscriptions carry earlier digests — reported by the act, left as they are.
- Attention policy **v3** is active (v2's five classes + `decision.material_change` and `review.convened`).
- The synthetic **red-sea-corridor-stream** replay source is registered, approved and active with its collection agent (its contract is `STREAM_SOURCE_CONTRACTS` in `scripts/phase1/source-contracts.mjs`, outside the seed); its stream on `red-sea-corridor-stream:chokepoint4` is `closed_incomplete` at the planted publisher gap — a declared incomplete range, by design.
- The graph revision head of the origin domain is 1 (revision r1 re-asserts the four REL edges B6's act had retracted for its own scene); two twin versions went unverified on it (the twins subscriber's designed reaction).
- **Rehearsal rig** (never the demo): the newest `eye_demo-pre-0084-*.dump` restored as `eye_demo_b23`, the API on :3411 against the REHEARSAL Redis `eye-redis-b12` (:6392 — the copy shares tenant and domain ids, so never the demo Redis), a vault copy; the heavy suites through `scripts/dev/heavy-slot.sh` (two slots on this host).


## 10. B24 on the demonstration (2026-09-25): what changed and how to rehearse

- **Migrations.** `eye_demo` is migrated through **0086**. The backup taken before 0085/0086 is `.eye-local/backups/eye_demo-pre-0085-20260925T162716Z.dump`. The API was restarted on the B24 build with `scripts/ops/demo-restart.sh` (VERIFIED), and the web through the `eye-web` launch configuration.
- **Re-registered subscriptions.** The administrator revoked and re-registered the origin domain's **attention**, **observations**, **source-health** and **proposals** subscriptions, whose consumer code digests changed in 0086. Their backlogs were left.
- **Two agents now run on the demonstration**, and the act leaves both running:
  - The **attention agent** (`attention-timer@1.0.0`; M. Dvořák accountable) ticks every 60 s on the scheduler. It escalates overdue items, plans and drains deliveries, rebalances, and sweeps lapsed suppression requests.
  - The **extraction agent** (`intelligence.plan-execution@1.0.0`; L. Ferreira owner, K. Müller escalation) runs the selected transformation plans of new observations.
  - Revoke either through its governed route if a quiet demonstration is wanted. A revoked attention agent's tick is recorded as refused, never skipped.
- **Attention policy v4 is active.** It adds the overload rule `max_open_per_owner` 1, the further materiality thresholds, notification on `in_app` and the SYNTHETIC `demo-mailbox` channel, and suppression approval on the approval-required class.
- **The demo mailbox is SYNTHETIC.** `executive.demo_mailbox` is a local sink inside the database: no email, SMS, Teams or push message leaves the product. A real provider is owner decision D6.
- **What the act leaves on `eye_demo`:**
  - an invalidated run, and an act-owned package committed after the markers were acknowledged;
  - a 90-day ECB-rate forecast with its scenario, twin version 8 and two runs;
  - an upload with its admitted claims;
  - an approved suppression and an active delegation;
  - one queue evaluation;
  - K. Müller's restricted memory item.
  - The ECB source was suspended and then reactivated, and every marker it set is cleared.
- **The rehearsal rig (never the demonstration).**
  - Restore the newest `eye_demo-pre-0085-*.dump` as `eye_demo_b24`.
  - Run the API on :3411 against the REHEARSAL Redis `eye-redis-b12` (:6392), with a vault copy.
  - Run `scripts/phase6/act-b24.mjs` with `EYE_DB_NAME=eye_demo_b24 EYE_API=http://localhost:3411`.
  - A run takes about 8 minutes, most of it waiting on the database clock for the two-minute deadline and the 60 s tick.
- **The demo walk.** Run `e2e/phase6-attention.demo.spec.ts` through `playwright.demo.config.ts` after the act; screenshots go to `evidence/phase6-browser/b24-*.png`.
- **B24-F1 (2026-09-26).** `eye_demo` is migrated through **0087**, the backup before it being `.eye-local/backups/eye_demo-pre-0087-20260926T122536Z.dump`. The API was restarted with `scripts/ops/demo-restart.sh` (VERIFIED). The extraction agent now runs a plan execution only against its queued evidence version: a corrected version is reselected explicitly, and a withdrawn one is refused.

## 11. B28 on the demonstration (2026-09-26): what changed and how to rehearse

- **Migrations.** `eye_demo` is migrated through **0088**. The backup taken before it is `.eye-local/backups/eye_demo-pre-0088-20260926T183223Z.dump`. The API was restarted with `scripts/ops/demo-restart.sh` (VERIFIED), and the web through the `eye-web` launch configuration.
- **Subscriptions.** The attention subscription was revoked and registered anew, because its consumer identity changed in 0088 (novelty forwarded). The new kinds **stream-rules** and **warnings** were registered by the tenant administrator with the backlog left.
- **Agents.** The **Weak Signal Agent** is registered (kind `weak_signal`); it nominates and ranks only. The **attention agent** now also raises candidates owed a warning right after its tick. It routes them to a named person, never to itself.
- **The synthetic sources.** The SYNTHETIC late stream `red-sea-corridor-stream-late` is registered and active (its contract is in `STREAM_SOURCE_CONTRACTS`). The corridor stream rule is active, and its processor is running.
- **What the act leaves:**
  - the insurer-withdrawal weak signal under `monitor` with a falsify condition;
  - the deduplicated Bab el-Mandeb warning, with three members (one contradicting), expired and escalated, plus J. Weber's `late` feedback and a warning evaluation;
  - an assumption on NORDWERK's internal records, and a package committed after the marker was acknowledged;
  - a remediation closed `closed_recovered`.
- **The rehearsal rig (never the demonstration).**
  - Restore the newest `eye_demo-pre-0088-*.dump` as `eye_demo_b28`.
  - Run the API on :3411 against the REHEARSAL Redis `eye-redis-b12` (:6392).
  - Run `scripts/phase6/act-b28.mjs` with `ACT_FAST_EXPIRY=1`. It moves only one warning's response window into the past with the superuser, prints a `REHEARSAL SHORTCUT` line saying so, and takes about 5 minutes.
  - **On `eye_demo` the flag is never set**: the act waits for the real one-hour window (about 62 minutes).
- **The demo walk.** Run `e2e/phase6-b28.demo.spec.ts` through `playwright.demo.config.ts` after the act; screenshots go to `evidence/phase6-browser/b28-*.png`.

## 12. B32 on the demonstration (2026-09-28): what changed and how to rehearse

- **Migrations.** `eye_demo` is migrated through **0089**. The backups taken before it are `.eye-local/backups/eye_demo-pre-0089-20260928T091041Z.dump` and `eye_demo-pre-0089-20260928T103136Z.dump` (3351 TOC entries each). The API was restarted with `scripts/ops/demo-restart.sh` (VERIFIED).
- **Principals and roles.** **C. Brenner** was created through the governed principal route with the role `risk_owner`. Four second-role bindings were made by the administrator through the database controller, because Phase 0 has no governed route that binds a second role to an existing human (C14 frozen). As `seed-decisions.mjs` did before, this is the one act outside the governed routes, and it is disclosed in the act's output:
  - C. Brenner: `strategy_owner` and `decision_owner`;
  - L. Brandt: `opportunity_sponsor` and `strategy_owner`.
- **Agents.** The **Risk Agent** and the **Opportunity Agent** are registered (kinds `risk` and `opportunity`, accountable C. Brenner, escalation M. Dvořák). They estimate only.
- **What the act leaves** (nothing is cleaned; all amounts, targets and probabilities are SYNTHETIC):
  - "On-time delivery 95%" linked to the Regensburg assembly capability, the dual-sourcing initiative, the bearings budget and the line workforce. The gap view shows GAP 3/5. The on-time measure's only reading is A. Hoffmann's entry for a day nine days before the act, so it goes further out of date every day;
  - the risk taxonomy v1 and the supply-chain appetite (EUR 250k);
  - the corridor-closure risk, accepted outside appetite, with its control, its warning of origin `exposure` (acknowledged by C. Brenner) and its mitigation decision (draft);
  - the Morocco opportunity, sponsored, with its evaluation decision (draft);
  - the magnet-price risk and one aggregation;
  - the health definition v1 (approved by S. Okafor), two snapshots, and a supply-resilience change that was challenged and dismissed.
- **The rehearsal rig (never the demonstration).**
  - Restore the newest `eye_demo-pre-0089-*.dump` as `eye_demo_b32`, then migrate it.
  - Run the API on :3411 against the REHEARSAL Redis `eye-redis-b12` (:6392), with a copy of the vault.
  - Run `scripts/phase6/act-b32.mjs` with `EYE_DB_NAME=eye_demo_b32 EYE_API=http://localhost:3411`. It takes a few seconds; it has no clock shortcut and needs none.
  - **Every harness and rehearsal sets `EYE_REDIS_PORT=6392`.** The harness default :6379 is the demonstration's Redis (§B32.6 of `audit/CP6_BATCHES.md`).
- **The demo walk.** Run `e2e/phase6-b32.demo.spec.ts` through `playwright.demo.config.ts` after the act; screenshots go to `evidence/phase6-browser/b32-*.png`. The pages are `/graph/strategy/alignment`, `/prediction/exposures` and `/decisions/health`.

## 13. B34 on the demonstration (2026-09-28/29): what changed, the operator preparation, and how to rehearse

- **Migrations.** `eye_demo` is migrated through **0091** (0090 on 2026-09-28; 0091, the B34-F corrections, on 2026-09-29). The backups taken before them are `.eye-local/backups/eye_demo-pre-0090-20260928T205841Z.dump` and `eye_demo-pre-0090-20260928T213126Z.dump` (before 0090), and `eye_demo-pre-0091-20260929T084440Z.dump` (65,260,677 bytes; before 0091).
- **The operator preparation** (before the act, and before any later restart that should keep the B34 channels and the synthetic execution path working; the act says each in its output):
  - **The SYNTHETIC ERP** (`scripts/execution/synthetic-erp.mjs`) runs on loopback **:3444**. It is a stand-in for NORDWERK's purchasing system, never a product component, and it refuses any non-loopback address. Its certificate is under `.eye-local/execution-erp-demo`; T. Richter declared that certificate as the execution target's trust anchor. Its bearer is bound BY REFERENCE, `EYE_DST_NORDWERK_ERP_DEMO`, in the local secret handoff. The value is never printed or typed. **Do not restart the ERP casually:** a restart mints a new certificate, which breaks the demonstration target's declared anchor (a target is retire-only; a new anchor means a new declared target).
  - **The local sinks** (SYNTHETIC; loopback only; nothing is forwarded; memory only): `node scripts/attention/local-sinks.mjs --host 127.0.0.1 --smtp-port 2525 --http-port 3446`.
  - **The demo API restarted with the synthetic execution switch and the sinks named, IN THE CALLER'S ENVIRONMENT** (the form used on 2026-09-29, VERIFIED):

    ```
    EYE_EXECUTION_SYNTHETIC_LOOPBACK=on \
    EYE_ATTENTION_SINK_HOST=127.0.0.1 EYE_ATTENTION_SMTP_PORT=2525 \
    EYE_ATTENTION_SMS_WEBHOOK_URL=http://127.0.0.1:3446/sms \
    EYE_ATTENTION_TEAMS_WEBHOOK_URL=http://127.0.0.1:3446/teams \
    scripts/ops/demo-restart.sh
    ```

    Do not put these in `.eye-local/env`: every harness sources that file, and a harness must never deliver to the demonstration's sinks or take the synthetic path by inheritance. **A restart WITHOUT the sink variables leaves the email, SMS and Teams deliveries failing and retrying** (the in-app channel is unaffected); **a restart WITHOUT the switch returns every execution attempt to the production vetting**, which refuses the loopback target (`address_not_public`). The switch accepts only `on` or `off`; any other value refuses startup. After a host restart, start the ERP and the sinks again before restarting the API this way.
- **The execution path on `eye_demo` (B34-F2, 0091 §F2).** With the switch on, a handoff to a target recorded synthetic, whose endpoint host is an IPv4 loopback LITERAL (`https://127.0.0.1:3444`, not `localhost`) and whose trust anchor is declared, is carried through the product's own egress on the **synthetic-loopback** path: the pinned transport to that literal, the anchor verified, the bearer by reference, no redirects. **The positive scene now runs through the product** (receipt, partial effect, residual, compensation, reconciliation — played on 2026-09-29, `evidence/cp6/act-b34f.txt`). **The refusal remains the production default:** every other target, and every target with the switch off, goes through the unchanged production vetting and is refused as before; K. Lange's handoff of 2026-09-28, refused at the transport (failed after 5 attempts), stays the negative evidence. Each attempt records its path (`transport`: `synthetic-loopback` or `production`; the database refuses a forged label), and the commitments page shows it. A non-synthetic target is still refused at declaration (422). The harness proof is `phase6-execution-b34f` (P1, R1, T1, C1).
- **Principals and roles.** **T. Richter** (`domain_admin`) and **K. Lange** (`execution_authority`) were created through the governed principal route. **The external collaborator (B34-F1, 0091 §F1):** an invitation is now REQUESTED by the workspace owner and PROVISIONED by an identity administrator (`platform_admin` / `tenant_admin`, never the requester) through the identity authority (`POST …/executive/collab/grants/:grantId/provision`). On 2026-09-29 L. Brandt requested the invitation for **R. Haddad** (customs broker, SYNTHETIC partner firm); L. Brandt's own provisioning was refused (403); the administrator provisioned it (the grant `invited`, 14 days, the principal marked external). The grant invited under 0090 (its principal written by the removed bypass port) was revoked through the corrected path; the identity authority revoked its credential and bumped its epoch. The external is never an active member. The invitation went to the SYNTHETIC demo mailbox, and its token never leaves the API process, so the external does not sign in on the demonstration (the local pickup is B36's (t)). The external's role binding is not revoked at a grant's end (inert; B61).
- **Subscriptions and policy.** The attention subscription was revoked and registered anew, because its consumer identity changed in 0090. The new kind **commitments** was registered by the administrator with the backlog left. M. Dvořák published attention policy **version 6** with the four new classes (email notification SYNTHETIC).
- **What the acts leave** (nothing is cleaned; the external, the purchase lines, the amounts and the ERP are SYNTHETIC):
  - the collaboration workspace on the corridor mitigation case, with M. Dvořák as a reviewer, the customs brief, the 0090-era grant REVOKED, and R. Haddad's grant provisioned under 0091 (expires 2026-10-13, then lapses by the tick, the identity side revokes what is live and their tasks are reassigned);
  - the external's review task, escalated to M. Dvořák and completed (endorse with conditions);
  - the assumption "Customs pre-clearance holds for the rerouted consignments", verified by J. Weber;
  - the mitigation case version 1, held, then deferred (next review 2026-10-05), resumed and committed, and its commitment's tracker: the root, the handoff item on the bearings budget, the customs deliverable (overdue, with an extension J. Weber co-signed);
  - the execution target `nordwerk-purchasing-demo` and three handoffs, all reconciled: the original refused at the transport (`failed` → `reconciled`), the compensating reissue half effected (brg-6205 200/400, mag-n42 60/120), and the reissue of the remaining half, effected in full; the two `reissue_residual` compensations done; the purchase-request item back `in_progress` with its `blocked` and `partial_effect` exceptions resolved;
  - the opportunity and commitment items in the queue, one act, and a breach escalated with its email receipt from the local sink;
  - risk taxonomy version 2, activated by S. Okafor.
- **Commit now requires the consequence preview's digest.** The older act scripts and `seed-decisions.mjs` would be refused if re-run. They are historical, and they are not rehearsal material for a database at 0090 or later.
- **Running the act on `eye_demo`.** Source `.eye-local/env` first (without printing it): the ERP's bearer is bound by reference, and the act's operator control call (the ERP's `partial` / `normal` mode) needs it. On 2026-09-29 run 1 was started without it and stopped at scene C. **`ACT_SCENES=b34f` replays scenes W and C only**; scenes A, W part 2 and X held on 2026-09-28 (`evidence/cp6/act-b34.txt`) and are not rerun-safe (they need a fresh state and minute-scale waits) — the act says so.
- **The rehearsal rig (never the demonstration).**
  - Restore the newest `eye_demo-pre-0091-*.dump` (or `pre-0090` for a full act) as a rehearsal copy, then migrate it.
  - Run the API on :3411 against the REHEARSAL Redis (:6392), with a copy of the vault, with `EYE_EXECUTION_SYNTHETIC_LOOPBACK=on` in that API's environment.
  - Run a second synthetic ERP and a second set of sinks on other loopback ports (2026-09-29: the ERP on :3454, the sinks 2535/3456), and name them in that API's environment. Never point the rehearsal at :3444, :2525 or :3446.
  - **Repoint the COPY's execution target at the rehearsal ERP before the act.** Execution targets are retire-only, so the rig updates the copy's target with the `retire_only` trigger disabled for that ONE statement ON THE COPY, and STOPS if the update fails. On 2026-09-29 rehearsal 1 did not stop when the repoint failed, and its positive scene reached the demonstration's ERP on :3444 (two rehearsal handoffs in its in-memory log; its mode set partial, then normal; `eye_demo` untouched; the ERP not restarted to keep its anchor). **`act-b34` now refuses a rehearsal copy whose target names :3444** (exit 3).
  - Run `scripts/phase6/act-b34.mjs` with `EYE_DB_NAME=<the copy> EYE_API=http://localhost:3411` (and `ACT_ERP_ENDPOINT` / `ACT_ERP_CERT` for the rehearsal ERP; `ACT_SCENES=b34f` for W and C only). The full act takes about 6 minutes. The review deadline and the deliverable's due instant are set minutes out so that the real scheduled ticks cross them, and the act says so.
  - **Every harness and rehearsal sets `EYE_REDIS_PORT=6392`** (§12).
- **The demo walk.** Run `e2e/phase6-b34.demo.spec.ts` through `playwright.demo.config.ts` after the act: **4/4** on 2026-09-29 (+ the execution case and the grants view); screenshots go to `evidence/phase6-browser/b34-*.png` (`b34-04-execution.png`, `b34-05-grants.png` added). The pages are `/decisions/tasks`, `/decisions/workspaces` and `/decisions/commitments`; the walk asserts the residual line names the compensation owner (it showed `undefined` before the fix in `apps/web/lib/commitments.ts`).

## 14. B29 on the demonstration (2026-09-29): what changed and how to rehearse

- **The state.** `eye_demo` is migrated through **0092** (`0092_b29_twin_families_methods_constraints.sql`, 2026-09-29). The backup taken before it is `.eye-local/backups/eye_demo-pre-0092-20260929T121053Z.dump` (65,718,364 bytes). The API was restarted on the B29 build with `scripts/ops/demo-restart.sh --build`, the sinks and `EYE_EXECUTION_SYNTHETIC_LOOPBACK=on` in the caller's environment (§13's form, VERIFIED). The act `scripts/phase6/act-b29.mjs` held every scene on `eye_demo` (`evidence/cp6/act-b29.txt`, 2.0 s).
- **New personas** (created through the governed principal route): **E. Kovács** (Regensburg plant operations; `twin_owner` — the process twin and the discrete-event study twin), **R. Aydın** (enterprise planning; `twin_owner` — the enterprise twin), **H. Petrović** (`method_steward`), **S. Lindqvist** (`constraint_steward`). T. Nakamura owns the corridor twin and the new supply network. **The Supply Chain Agent** is registered (kind `supply_chain`; accountable T. Nakamura, escalation M. Dvořák). A pure steward opens the shell since `a0d6e7d` (`identity.self.read`).
- **What the act leaves** (nothing is cleaned; every figure is SYNTHETIC; the new twins' elements are ASSUMED and cite the NORDWERK terms record):
  - **the twins:** "Enterprise twin — NORDWERK" (kind `enterprise`; R. Aydın), "Regensburg plant — assembly line (process twin)" (kind `process`; E. Kovács), "Hub-module supply network — NORDWERK Regensburg (3 tiers)" (kind `supply-network`, 21 elements; T. Nakamura), "Regensburg plant — line 1 and its bearing supply (discrete-event study)" (kind `supply-chain`; E. Kovács — the process family's schema holds line capacity, not a station model); the corridor twin at **v10** (`supply.capacity_per_day` 620; v9 the 1000 baseline);
  - **the contracts and links:** the corridor's contract (`supply.capacity_per_day`, approved flow + discrete-event, capacity-planning) and the process twin's; the links process ← corridor and enterprise ← process (declared by the downstream owners); four couplings proposed and four applied; the enterprise twin's completeness 2/3 (the market not linked) and its capacity utilisation 1.2903;
  - **the agent:** one Supply Chain Agent run with 4 proposals (the bottleneck — the tier-2 bearing maker at 1800 pcs/day holding Regensburg to 450/day — ACCEPTED by T. Nakamura — and three single-source findings) and its refused admit recorded on the run;
  - **the run:** `discrete-event@1` bound to the study twin; the run (seed 29, 42 days, the bearing shortage at 40 % for 21 days from day 8: output 25280, backlog 7480, 18 line-stop days) and its reproduction (the identical outputs digest); H. Petrović's passing probe;
  - **the constraint set:** "Regensburg warehouse capacity" v1 (S. Lindqvist; `warehouse:regensburg.pallets` ≤ 1800 per day) with two recorded checks — the week-42 plan REFUSED (2350 on 2026-10-14) and the amended plan satisfied.
  - The act is RERUN-SAFE: a second run says "stands — an earlier run" per scene instead of writing twice.
- **Not staged here** (harness-proven): the quarantine → probe → reinstatement path (phase6-methods-b29 C1, a harness-only unstable adapter); conservation, topology, the gate at run opening and indeterminate (phase6-constraints-b29 D3–D5).
- **The rehearsal rig (never the demonstration).**
  - Restore the newest `.eye-local/backups/eye_demo-pre-0092-*.dump` into **`eye_demo_b29`**, then migrate it.
  - Run the rehearsal API on **:3411** against that copy with **`EYE_REDIS_PORT=6392`** (the rehearsal Redis, §12) and the **rehearsal sinks 2535/3456** named in its environment (§13's variables with those ports). Never point the rehearsal at :2525 or :3446.
  - Run the act: `EYE_DB_NAME=eye_demo_b29 EYE_API=http://localhost:3411 node scripts/phase6/act-b29.mjs`. Rehearsal 1 on 2026-09-29 held every scene on the first attempt.
- **The demo walk.** After the act, run `e2e/phase6-b29.demo.spec.ts` through `playwright.demo.config.ts` with **`EYE_B29_DES_RUN=<the run id the act prints>`** ("the discrete-event run the walk reads"; without it the walk opens the listed runs until one names `discrete-event@1`): **5/5** on 2026-09-29 (+ B34's 4). Screenshots go to `evidence/phase6-browser/b29-*.png` (`b29-01-composition-enterprise`, `b29-02-composition-process`, `b29-03-supply-network`, `b29-04-methods`, `b29-05-discrete-event-run`, `b29-06-constraints`). The pages are `/twins`, `/twins/simulations` and `/twins/constraints`.
- **The restart** is unchanged from §13: the sinks and `EYE_EXECUTION_SYNTHETIC_LOOPBACK=on` in the caller's environment (never in `.eye-local/env`), then `scripts/ops/demo-restart.sh`; after a code change, `scripts/ops/demo-restart.sh --build`.
- **B29-F on the demonstration (2026-09-29; the owner's bounded B29 review).** `eye_demo` is migrated through **0093** (`0093_b29f_draft_withdrawal.sql`: the governed withdrawal of an open twin draft). The backup taken before it is `.eye-local/backups/eye_demo-pre-0093-20260929T204305Z.dump` (66,761,480 bytes). The API was restarted on the B29-F build with `scripts/ops/demo-restart.sh` (the sinks and the switch in the caller's environment, §13's form, VERIFIED). **The act `scripts/phase6/act-b29f.mjs`** (`evidence/cp6/act-b29f.txt`) is ONE scene by E. Kovács on a new process twin, "Regensburg plant — line 3 (process twin; the B29-F draft recovery)": the zero-capacity line refused AT GROUNDING (the accumulated-draft rule; nothing written); a wrong figure (500) grounded; the key refused a second time (one element per key per draft); a second draft refused; the draft WITHDRAWN with a reason (`twin.version.withdraw`) — its element kept, the event `version.withdrawn`; grounding into the withdrawn draft refused; a new draft on the same branch grounded right (1000) and admitted; the process measures. It is RERUN-SAFE (a twin with an admitted version says "stands"). The B29 act is not replayed. The rehearsal rig is §14's (`eye_demo_b29` migrated to 0093; the API on :3411 with `EYE_REDIS_PORT=6392`, a COPY of the vault under `EYE_VAULT_*_ROOT`, the rehearsal sinks 2535/3456): `EYE_DB_NAME=eye_demo_b29 EYE_API=http://localhost:3411 node scripts/phase6/act-b29f.mjs` held on the first attempt and said "stands" on the second. Not staged (harness-proven, `phase6-composition-b29` C1): the admission-time refusal of an element another path wrote and its recovery by the same withdrawal; the cross-element organisation case.

## 15. B36 on the demonstration (2026-09-30): what changed, the operator preparation, and how to rehearse

- **The state.** `eye_demo` was migrated through 0094 on 2026-09-30; the backup taken before it is `.eye-local/backups/eye_demo-pre-0094-20260930T015858Z.dump` (67,663,796 bytes); the API was restarted on the B36 build (`03a8089`) with `scripts/ops/demo-restart.sh` (built first), the sinks and `EYE_EXECUTION_SYNTHETIC_LOOPBACK=on` in the caller's environment (§13's form, VERIFIED), `EYE_EXECUTIVE_SIGNING_KEY_DEMO` in `.eye-local/env`; the act `scripts/phase6/act-b36.mjs` HELD (`ALL SCENES HELD · 135.7 s`) and stood on the rerun (`2.0 s`) — `evidence/cp6/act-b36.txt` (both runs); the demo web started for the walks with `NEXT_PUBLIC_EYE_API=http://localhost:3401 pnpm --filter @eye/web start`.
- **New personas** (SYNTHETIC; created by the act through the governed principal route with `createPersona`, the password `EYE_TEST_ADMIN_PASSWORD`): **r.vogel** and two more **board members** (`board_member` — they decide board-class packages only on `/decisions/board`; standard actions are denied at the PDP); **e.lindqvist** (auditor, TENANT scope — she raises the challenge); **chief.of.staff** (`executive_operator`, PER-03 — curates the agenda, routes work and escalates gaps; denied on approve, decide, commit, distribute and publish, each denial audited); **a.novak** (`strategy_owner` — the planning lead; NOT the operator); a **second executive** (reviews the external draft). The existing cast is unchanged: m.dvorak (executive), l.brandt (decision authority and owner), s.okafor / c.brenner (approvers), k.lange (execution authority), t.richter (domain admin), j.weber (strategy owner), n.eriksen (forecast owner), r.haddad (the external customs broker — a NEW grant; act-b34's is revoked), e.kovacs / r.aydin (twin owners), t.nakamura. The external signs in through the LOCAL pickup (below), never a real mailbox.
- **The operator preparation** (before the act, and before any later restart):
  - **The executive signing key** `EYE_EXECUTIVE_SIGNING_KEY_DEMO` lives in `.eye-local/env` (the MAIN tree only; `demo-restart.sh` sources it). It is the demonstration's OWN Ed25519 key, bound BY REFERENCE (`EYE_EXECUTIVE_SIGNING_KEY_<NAME>`, default `_DEMO`); the value is never printed or typed. Every B36 signature — the approval and the decision, accept-priority, the snapshot approval, the plan baseline, the publication — verifies against it. A restart WITHOUT it refuses every signing act.
  - **The sinks and the switch IN THE CALLER'S ENVIRONMENT**, exactly §13's form (`EYE_EXECUTION_SYNTHETIC_LOOPBACK=on`, `EYE_ATTENTION_SINK_HOST=127.0.0.1`, `EYE_ATTENTION_SMTP_PORT=2525`, the SMS and Teams webhooks on `:3446`), never in `.eye-local/env`: the decision's distribution, the publication's email channel and the attention deliveries go to the local sinks (SYNTHETIC; nothing forwarded). The synthetic ERP on **:3444** is unchanged (do not restart it casually — §13); B36's "real" target `nordwerk-erp-real` is a loopback literal (`https://127.0.0.1:9/…`, a self-signed anchor) that the production egress REFUSES — nothing real is activated or reached.
  - After a host restart: the ERP, then the sinks, then `scripts/ops/demo-restart.sh` with the variables above.
- **What the act leaves** (nothing is cleaned; every figure SYNTHETIC): the weekly cadence opened and reset (the closing record), the operator's agenda and escalation, a scenario room on the corridor scenario with a deadline, the context set to the Regensburg objective; the dual-sourcing approval and decision SIGNED and the decision DISTRIBUTED (in_app + the email sink's receipt); a second package ("B36 gate") with a recusal, a dismissed challenge and K. Lange's denied `gate/defer` in its replay, left uncommitted; a board package approved by r.vogel; the corridor item's act settled FAILED and RESUMED, its priority ACCEPTED (signed); attention policy version with `governance {fairness_floor 0.7, staleness_ceiling_hours 168}` and the HOLD raised (left for the walk); a monthly forum; the on-time measure restated by its owner (the OWNER-EDIT FLAG on the change), an exclude exception on the customs component, the snapshot approved (signed), the dual-sourcing allocation REVOKED, the stale-measure detection raised by the tick; a briefing policy and a v3 briefing (the band, the suppressed claim, the omission, the disputed package, the indicator; the corridor warning RETAINED through the planted outage); "Board pack" approved by digest, delivered to the three board members and L. Brandt with receipts, corrected (the recipients notified), archived and exported (residency EU); an external draft to the partner firm reviewed by the second executive, its export REFUSED on residency; the plan "Dual-sourcing 2027" (EUR 1 200 000, authority 900 000) with two initiatives and two milestones, baselined (signed), its Q2 variance, its breach (the authority lowered below the funded sum) acknowledged, a package citing the initiative HELD then committed; R. Haddad's NEW grant with its delivery, picked up and accepted (the expert's surface); two `collab.review` tasks with B waiting on A; `nordwerk-erp-real` registered, activated, refused by the egress, deactivated; the mitigation's outcome reviewed and its learning recorded; the Morocco opportunity's exploit response committed, its outcome recorded and reviewed, the closure co-signed, the package closed, the learning recorded by the sponsor.
- **The rehearsal rig (never the demonstration).**
  - Restore the newest `eye_demo-pre-0094-*.dump` (or copy `eye_demo`) into **`eye_demo_b36`**, then migrate it (`EYE_DB_NAME=eye_demo_b36 pnpm db:migrate`).
  - Build in the MAIN tree first (`pnpm --filter @eye/api build`); run the rehearsal API on **:3411** with **`EYE_REDIS_PORT=6392`** (the rehearsal Redis, §12), **a COPY of the vault** under `EYE_VAULT_QUARANTINE_ROOT` / `EYE_VAULT_EVIDENCE_ROOT` / `EYE_VAULT_ARCHIVE_ROOT` / `EYE_VAULT_EXPORT_ROOT` (the publications write their bytes under the export root), its own `EYE_DEGRADED_DIR` and `EYE_DEMO_API_LOG`, the **rehearsal sinks 2535/3456** and `EYE_EXECUTION_SYNTHETIC_LOOPBACK=on` in that API's environment; the rehearsal ERP :3454 is not needed (B36 issues no effected handoff). Never point the rehearsal at :3401, :2525, :3446, :3444 or :6379.
  - Run the act: `EYE_DB_NAME=eye_demo_b36 EYE_API=http://localhost:3411 node scripts/phase6/act-b36.mjs` — TWICE: the act is RERUN-SAFE and the second run must say "stands — an earlier run" everywhere. Stop the rehearsal API when done (`kill $(lsof -iTCP:3411 -sTCP:LISTEN -t)`).
  - **The ONE-harness rule** (the shared-memory incident of 2026-09-30, §B36.1): the container's 64 MB `/dev/shm` is shared by every harness and the demonstration — run one harness file at a time, drop scratch databases when done, never touch `/dev/shm`; on `could not resize shared memory segment` stop and report.
- **The act's env lines for the walks.** The act prints them at its end (`EYE_B36_…=<value>`); export them before the walks: `EYE_B36_PACKAGE_TITLE` (the dual-sourcing package), `EYE_B36_GATE_PACKAGE_TITLE` (the "B36 gate" package), `EYE_B36_BOARD_LOGIN` (r.vogel), `EYE_B36_AUDITOR_LOGIN` (e.lindqvist), `EYE_B36_OPERATOR_LOGIN` (chief.of.staff), `EYE_B36_EXECUTIVE_LOGIN` (m.dvorak), `EYE_B36_OBJECTIVE_TITLE` (the Regensburg objective), `EYE_B36_PLANNING_LEAD` (a.novak), `EYE_B36_PUBLICATION_TITLE` ("Board pack"), `EYE_B36_INVITATION_ID` (the grant), `EYE_B36_EXPERT_PASSWORD` (the expert's SYNTHETIC password, default customs-broker-b36-synthetic), `EYE_DEMO_EXECUTIVE` / `EYE_DEMO_STRATEGY_LEAD` (m.dvorak / j.weber). The act says whether it performed the pickup and the acceptance itself or left them for the collab walk to do from `/login?invitation=`.
- **The walks.** After the act, through `playwright.demo.config.ts` (the hosted config ignores `*.demo.spec.ts` — these are DEMO WALKS, not hosted cases): `e2e/phase6-b36-home.demo.spec.ts` (`/home`), `phase6-b36-gates.demo.spec.ts` (`/decisions`, `/decisions/board`), `phase6-b36-attention.demo.spec.ts` (`/decisions/attention`, `/decisions/attention/recovery`), `phase6-b36-strategy.demo.spec.ts` (`/decisions/health`, `/graph/strategy/alignment`), `phase6-b36-briefing.demo.spec.ts` (`/decisions/briefings`), `phase6-b36-publishing.demo.spec.ts` (`/decisions/publications`), `phase6-b36-planning.demo.spec.ts` (`/graph/strategy/planning`, `/graph/strategy`), `phase6-b36-collab.demo.spec.ts` (`/login?invitation=`, `/decisions/workspaces`, `/decisions/tasks`, `/decisions/commitments`, `/prediction/exposures`). Screenshots go to `evidence/phase6-browser/b36-*.png`. Their result: **35/35** (27.7 s) on 2026-09-30 against the live demonstration (the walks brought to green on the demonstration first — walk-side selector, order and persona fixes — then three room-read defects fixed in `room.service.ts`: a room without a package read its null package id as the literal "null" and refused the rooms list (500), the room read answered no `member` so the studio never rendered, and the room's edition list carried no `schema_version`; 47 screenshots `evidence/phase6-browser/b36-*.png`).
- **Not staged (harness-proven, said, not claimed):** gates — the stale-digest 409 on a signature, the upheld challenge after commitment (`reopen_required`), the recused approver's later approval refused (`phase6-gates-b36`); attention — the degraded-state fixtures the act does not arm (`delivery_sink_down`, `tick_stalled`, `policy_invalid`, `evaluation_stale`) and their recovery routes, the re-delivery bound (`phase6-attention-b36`); strategy — the requester approving their own exception refused, the lapsed exception request, the detection under a policy that does not route it (`phase6-strategy-b36`); briefing — the undeclared omission refused, the audience refusal 403 and the contract refusal 422, the expiry by the tick (`phase6-briefing-b36`); publishing — the withdrawal, a classification above the source's refused, delivery beyond the audience refused, the acknowledgement (`phase6-publishing-b36`); planning — the dependency cycle refused, `budget_authority` refused beyond authority, the sponsor-only pause and close, the replay `plan_as_of` (`phase6-planning-b36`); home — the reset refused over an open board-class decision, a retired objective refused as context, the operator's denials on each consequential act (`phase6-home-b36`); collab — the pickup lock after five failures, a task completing with an unmet dependency refused, the activation by the registrar refused, the deactivated target's handoff refused (`phase6-collab-b36`).
- **The restart** is unchanged from §13: the sinks and the switch in the caller's environment, the signing key in `.eye-local/env`, then `scripts/ops/demo-restart.sh`; after a code change, `scripts/ops/demo-restart.sh --build`.

## 16. B90 on the demonstration (2026-09-30): what changed, the operator preparation, and how to rehearse

- **The state.** `eye_demo` migrated through **0095** on 2026-09-30 (the backup before it: `.eye-local/backups/eye_demo-pre-0095-20260930T131206Z.dump`, 71,296,580 bytes); the API restarted on the B90 build with `scripts/ops/demo-restart.sh --build` with the sinks and `EYE_EXECUTION_SYNTHETIC_LOOPBACK=on` in the caller's environment (VERIFIED: the API serves `eye_demo` and is ready); the web rebuilt and restarted through the `eye-web` launch configuration on :3000; the act held and stood (`evidence/cp6/act-b90.txt`). `EYE_EXECUTIVE_SIGNING_KEY_DEMO` in `.eye-local/env` signs the metric certification. B90 adds no sink, port or listener: the event products are PULL-ONLY, nothing is delivered outward.
- **New personas** (SYNTHETIC; created through the governed principal route with `createPersona`, the password `EYE_TEST_ADMIN_PASSWORD`): **F. Aydın `f.aydin`** (`data_steward`, DOMAIN scope — registers the platform products for their owners, degrades with a reason, records the domain review, defines the metrics, reconciles and owns catalog entries; she CANNOT certify a metric — the owner does) — created by `scripts/phase6/b90-platform-products.mjs`, which the act runs first; **H. Weber `h.weber`** (`domain_analyst`, NORDWERK procurement lead — the accepted consumer of the corridor warning stream). The existing cast: m.dvorak (executive — certifies the corridor exposure metric; owns the Strategic Health Score), n.eriksen (the B28 forecast owner — the stream's owner unless the act's `EYE_B90_EVENTS_OWNER` says otherwise), a.novak (the catalog reader), t.richter, a.hoffmann, l.brandt, t.nakamura, c.brenner (the platform products' owners).
- **The operator preparation** (before the act):
  - **The attention policy** must route the class `catalog.coverage` to the role `data_steward` (if the current version does not, the act must publish one through the governed route before the first reconciliation); `product.degradation`, `subscription.lag` and `metric.certification` route to the product's consumers, the subscription's owner and the metric's owner by the ports themselves.
  - **The SYNTHETIC AIS source.** `eye_demo` has no source titled "Red Sea AIS" (the nearest is the B28 corridor stream fixture); the act registers **"Red Sea AIS positions (synthetic)"** through `observation.source.register`, approves and activates it (the upload-source idiom of `phase4-helpers.ts`) BEFORE the first reconciliation. No real AIS feed is reached.
  - **The EUR measure.** If no corridor measure is in EUR, the act declares one through the graph route and observes two SYNTHETIC readings before the corridor exposure metric is defined.
- **What the act leaves** (nothing is cleaned; every figure SYNTHETIC): the nine platform products registered, declared, reviewed, released and observed for their owners; the corridor warning stream (product key `corridor-warning-stream`, kind event, over `prediction.warning_events`; schema v1 — title, consequence_class, confidence, closes_at, routed_to; the contract WRN@v2; the purposes executive and procurement) released; H. Weber's subscription (purpose procurement; three fields; consequence C2; lag policy 2 events / 86400 s; handles corrections and replays) authorized, its checkpoint at 4, a LAGGING episode with the owner's item and the scorecard's `lag_events` missed, conformed, resumed and attained; one `product.degraded` and one `product.restored` event on the stream (H. Weber's queue item "Product corridor-warning-stream DEGRADED"; an accepted domain review); the corridor exposure metric at grain month certified for 90 days (signed; MET@v1), its uncertified draft variant, the Strategic Health Score at grain component certified; the AIS source owned by the steward, the lineage AIS → the corridor forecasts product → the stream, the AIS staging asset for 2025 week 40 flagged ORPHAN with the coverage item in the steward's queue.
- **The rehearsal rig (never the demonstration).**
  - Restore the newest `eye_demo-pre-0095-*.dump` (or copy `eye_demo`) into **`eye_demo_b90`**, then migrate it (`EYE_DB_NAME=eye_demo_b90 pnpm db:migrate`).
  - Build in the MAIN tree first (`pnpm --filter @eye/api build`); run the rehearsal API on **:3411** with **`EYE_REDIS_PORT=6392`** (the rehearsal Redis, §12), a COPY of the vault under the four `EYE_VAULT_*_ROOT` variables, its own `EYE_DEGRADED_DIR` and `EYE_DEMO_API_LOG`, the rehearsal sinks 2535/3456 and `EYE_EXECUTION_SYNTHETIC_LOOPBACK=on` (§15's form; B90 itself needs none of them). Never point the rehearsal at :3401, :2525, :3446, :3444 or :6379.
  - Run the act: `EYE_DB_NAME=eye_demo_b90 EYE_API=http://localhost:3411 node scripts/phase6/act-b90.mjs` — TWICE: the act is RERUN-SAFE and the second run must say "stands — an earlier run" everywhere. The act waits on the real tick for the stream, the lag, the scorecard, the certification sweep and the reconciliation (steps 61, 63, 64, 65, 66). Stop the rehearsal API when done (`kill $(lsof -iTCP:3411 -sTCP:LISTEN -t)`).
  - **The ONE-harness rule** (§15): one harness file at a time; never touch the container's `/dev/shm`.
- **The act's env lines for the walks.** The act prints them at its end; export them before the walks: `EYE_B90_STEWARD` and `EYE_B90_STEWARD_LOGIN` (f.aydin), `EYE_B90_PRODUCTS_OWNER` (n.eriksen), `EYE_B90_CONSUMER` and `EYE_B90_EVENTS_CONSUMER` (h.weber), `EYE_B90_EVENTS_OWNER` (the stream's owner), `EYE_B90_EVENTS_STREAM_TITLE` ("Corridor warning stream"), `EYE_B90_EXECUTIVE_LOGIN` (m.dvorak), `EYE_B90_METRIC_TITLE`, `EYE_B90_DRAFT_TITLE`, `EYE_B90_HEALTH_TITLE`, `EYE_B90_READER` (a.novak), `EYE_B90_AIS_TITLE` ("Red Sea AIS positions (synthetic)").
- **The walks.** After the act, through `playwright.demo.config.ts` (DEMO WALKS, ignored by the hosted gate): `e2e/phase6-b90-products.demo.spec.ts` (`/graph/data/products`, `/graph/data/products/[productId]`), `phase6-b90-events.demo.spec.ts` (`/graph/data/events`), `phase6-b90-metrics.demo.spec.ts` (`/graph/data/metrics`), `phase6-b90-catalog.demo.spec.ts` (`/graph/data/catalog`). Screenshots go to `evidence/phase6-browser/b90-*.png`. Their result: **16/16** on the live demonstration on 2026-09-30, twice (12.5 s, 12.7 s), after two walk-side corrections in the catalog walk (the entries list names an entry by its title, not its reference; the reader's clearance is printed beside the hidden count, not inside it) — no product defect; 19 screenshots under `evidence/phase6-browser/b90-*.png`.
- **The scenes** (`STAGES.csv` B90): **F-P7-F-09** — the corridor warning stream registered as an event product owned by the intelligence domain; NORDWERK procurement subscribes, falls behind its lag policy and is flagged, while the scorecard shows SLO attainment; **F-P7-F-10** — the certified corridor exposure metric served with its grain and source revision, the uncertified variant refused in the executive view; **F-P7-F-11** — the steward searches the catalog for "Red Sea AIS", sees the owner, the lineage to the corridor forecasts and the flagged orphaned staging asset. The act's result: **HELD** on `eye_demo` on 2026-09-30 — `ALL SCENES HELD · 187.8 s` (120 ✓ lines, no ✗; the rerun `ALL SCENES HELD · 1.1 s`, every write scene "stands — an earlier run", 0 ✗), after the rehearsal on `eye_demo_b90` (a fresh copy: 120 ✓ `· 163.1 s`, the rerun 20 ✓ `· 1.1 s`; `evidence/cp6/act-b90-rehearsal.txt`). The rehearsal found one PRODUCT defect, corrected in 0095 §R before `eye_demo` was migrated: `products.restore_product` accepted any `ok` scorecard — one computed BEFORE a person's degradation among them — so a steward's stated degradation could be undone with no review; a degradation by a person is now restored only after an accepted `domain` review newer than it, and a tick's degradation only by a scorecard computed after it (the products harness 19/19 with the case, the prelude 9/9); and three act-side fixes (the warning intake drained before the stream is declared, the lag-attained check bound to after the resumption, the platform products' env names). `evidence/cp6/act-b90.txt`.
- **Not staged (harness-proven, said, not claimed):** registry — the three publication denials, the owner reviewing their own product refused (`phase6-dataproducts-b90`); products — the breaking release denied over an accepted consumer without a passing test, migration to a newer version, cost, withdrawal, retirement and its refusals, the degradation BY THE TICK after two below-floor scorecards (`phase6-products-b90`); events — the schema pause and conformance, replay from a checkpoint, correction withholding, revocation, cross-tenant isolation (`phase6-events-b90`); metrics — the conflict refusal, a definition diff withdrawing the certification, the reproducibility fault, the expiry sweep by the tick, the steward's certification refused (`phase6-metrics-b90`); catalog — the stale / duplicate / inconsistent / lineage_missing / ownership_lapsed flags, the item routed to the OWNER on a lapse, recertification, glossary redefinition, confidential entries hidden and counted (`phase6-catalog-b90`).
- **The restart** is unchanged from §15.
- **B90-F1 on the demonstration (2026-09-30; the owner's bounded B90 review).** `eye_demo` is migrated through **0096** (`0096_b90f_subscription_catchup.sql`: the subscription catch-up). The backup taken before it is `.eye-local/backups/eye_demo-pre-0096-20260930T204341Z.dump` (72,630,411 bytes); the API restarted with `scripts/ops/demo-restart.sh` (the sinks and the switch in the caller's environment; VERIFIED). The act's recovery scene is now the CATCH-UP: on this demonstration, whose first lag was resolved before 0096 by acknowledging the head unread, the act plays a SECOND lag episode (three new warnings; the tick flags H. Weber's subscription again; the unread acknowledgement and the premature conformance are refused; H. Weber catches up the backlog in bounded batches, processes and acknowledges each; conforms; N. Eriksen resumes). Rehearsed first on `eye_demo_b90f` (§16's rig; `evidence/cp6/act-b90f-rehearsal.txt`), then HELD on `eye_demo` (`evidence/cp6/act-b90f.txt`; the original `evidence/cp6/act-b90.txt` kept). The walks 16/16 twice (their screenshots of this run saved as `evidence/phase6-browser/b90f-*.png`; the B90 originals kept). On the events page a lagging consumer sees "Catch up the backlog" in place of "Read events".
- **B90-F1's second pass on the demonstration (2026-10-01).** `eye_demo` is migrated through **0098** (`0098_b90f2_catchup_contiguous_coverage.sql`: a catch-up must start at or before the served mark). The backup taken before it is `.eye-local/backups/eye_demo-pre-0098-20261001T111117Z.dump` (74,009,161 bytes). The API was rebuilt and restarted with `scripts/ops/demo-restart.sh --build` and the same environment as §15 (VERIFIED); the web runs next 16.3.6. No scene changes: the act's catch-up already starts at the served mark. `act-b90` and `act-b27` rerun and stand; the walks pass 27/27. Walk reruns overwrite the screenshots of record, so copy them first and restore them after.

## 17. B27 on the demonstration (2026-10-01): what changed, the operator preparation, and how to rehearse

- **The state.** `eye_demo` is migrated through **0097** (`0097_b27_scenario_anatomy_sets_coherence.sql`) after a backup (`.eye-local/backups/eye_demo-pre-0097-20260930T213603Z.dump`, 72,967,245 bytes), the API restarted on the B27 build with `scripts/ops/demo-restart.sh --build` with the sinks and `EYE_EXECUTION_SYNTHETIC_LOOPBACK=on` in the caller's environment (§15's form), the web rebuilt and restarted through the `eye-web` launch configuration on :3000 — done on 2026-10-01 (VERIFIED). B27 adds no sink, port, listener or provider; its two tick steps (`scenario-relevance` 67, `scenario-quality` 68) run inside the existing tick.
- **The personas** (all existing on `eye_demo`; SYNTHETIC; no persona is created): **J. Weber `j.weber`** (`strategy_owner` — declares the fresh "Bab el-Mandeb closure" scenario and its elements, declares and invalidates the ASU, owns the quality scenario and the scenario set, resolves the proposal); **N. Eriksen `n.eriksen`** (`forecast_owner` — owns the disruption branch "Insurer withdrawal" and is tasked on its suspension; proposes a scenario from a forecast shift); **L. Brandt `l.brandt`** (`decision_owner`, `decision_authority` — declares the fresh Regensburg package, binds the set, proposes — refused, then admitted — and opens the comparison); **M. Dvořák `m.dvorak`** (`executive` — records the portfolio review; J. Weber may record it instead); **A. Hoffmann `a.hoffmann`** (`domain_analyst` — the reader: every B27 write is refused to her at the policy, every B27 read is admitted).
- **The operator preparation** (before the act):
  - **The attention classes.** B27 raises `scenario.suspension` (to the branch owner), `scenario.set_gap` (to the set owner), `scenario.quality` (to the scenario owner), `scenario.signpost` (to the scenario owner) and `scenario.proposal` (to the domain's strategy owners) from its own ports; the act checks that the demonstration's attention policy version admits the five classes before the first scene (if it does not, the act publishes a version that does through the governed route — the §16 idiom).
  - **The SYNTHETIC freight-rate series.** `eye_demo` has no freight-rate series (checked read-only); the act registers `freight-rate:red-sea-container-spot` and defines the freight-rate indicator on it as J. Weber. No real freight feed is reached.
  - **The Regensburg package.** Both Regensburg packages are COMMITTED and a set cannot be bound to a committed package: the act declares a FRESH package on the Regensburg decision as L. Brandt (options status quo and dual source) through the decision routes of `act-b34.mjs` / `act-b36.mjs`.
- **What the act leaves** (nothing is cleaned; every figure SYNTHETIC): the "Bab el-Mandeb closure" scenario with its Baseline (J. Weber) and the disruption "Insurer withdrawal" (N. Eriksen), the drivers "Houthi activity" (scenario-wide, exogenous) and "insurer withdrawal", the actor "carriers" (agency high), the mechanism "war-risk premium → rerouting" (and, if the act declares them, the intervention "naval escort" and an impact on the Regensburg objective), the ASU "insurers keep war-risk cover" linked CRITICAL to the disruption branch and INVALIDATED — the branch **SUSPENDED** with N. Eriksen's `scenario.suspension` item open (the act leaves it suspended: `EYE_B27_ANATOMY_STAGE=suspended`); "Bab el-Mandeb freight exposure (SYNTHETIC)" with its baseline, the upside "Freight-rate spike", the disruption "Strait closure" and the user-defined "strait shutdown", the freight-rate indicator retired, a FAILED quality evaluation (`indistinct_branches`; the signpost MISSING), not decision-active, J. Weber's `scenario.quality` item, a four-band frequency map and two governed probabilities (by the map, by expert elicitation); the scenario set over the quarter scenario's Baseline, Disruption, "regional blockade" and stress branches, ACTIVE, its first check failed on stress and its latest passed, bound to L. Brandt's fresh package whose proposal was refused once (409, stress named) and then admitted; one portfolio review; N. Eriksen's forecast-shift proposal resolved by J. Weber.
- **The rehearsal rig (never the demonstration).**
  - Restore the newest `eye_demo-pre-0097-*.dump` (or copy `eye_demo`) into **`eye_demo_b27`**, then migrate it (`EYE_DB_NAME=eye_demo_b27 pnpm db:migrate`).
  - Build in the MAIN tree first (`pnpm --filter @eye/api build`); run the rehearsal API on **:3411** with **`EYE_REDIS_PORT=6392`** (the rehearsal Redis, §12), a COPY of the vault under the four `EYE_VAULT_*_ROOT` variables, its own `EYE_DEGRADED_DIR` and `EYE_DEMO_API_LOG`, the rehearsal sinks 2535/3456 and `EYE_EXECUTION_SYNTHETIC_LOOPBACK=on` (§15's form; B27 itself needs none of them). Never point the rehearsal at :3401, :2525, :3446, :3444 or :6379.
  - Run the act: `EYE_DB_NAME=eye_demo_b27 EYE_API=http://localhost:3411 node scripts/phase6/act-b27.mjs` — TWICE: the act is RERUN-SAFE and the second run must say "stands — an earlier run" everywhere. Stop the rehearsal API when done (`kill $(lsof -iTCP:3411 -sTCP:LISTEN -t)`).
  - **The ONE-harness rule** (§15): one harness file at a time; never touch the container's `/dev/shm`.
- **The act's env lines for the walks.** The act prints them at its end; export them before the walks: `EYE_B27_ANATOMY_SCENARIO` (the "Bab el-Mandeb closure" title), `EYE_B27_ANATOMY_BRANCH` (the disruption branch), `EYE_B27_ANATOMY_STRATEGY` (j.weber), `EYE_B27_ANATOMY_BRANCH_OWNER` (n.eriksen), `EYE_B27_ANATOMY_READER` (a.hoffmann), `EYE_B27_ANATOMY_STAGE` (suspended); `EYE_B27_QUALITY_SCENARIO_TITLE`, `EYE_B27_QUALITY_OWNER` (j.weber), `EYE_B27_QUALITY_READER` (a.hoffmann); `EYE_B27_SETS_TITLE`, `EYE_B27_SETS_OWNER` (j.weber), `EYE_B27_SETS_DECIDER` (l.brandt).
- **The walks.** After the act, through `playwright.demo.config.ts` (DEMO WALKS, ignored by the hosted gate): `e2e/phase6-b27-anatomy.demo.spec.ts` (`/prediction/scenarios/anatomy`), `phase6-b27-quality.demo.spec.ts` (`/prediction/scenarios/quality`), `phase6-b27-sets.demo.spec.ts` (`/prediction/scenarios/sets`). Screenshots go to `evidence/phase6-browser/b27-*.png`. Their result: **11/11** on the live demonstration, twice (7.3 s each), after the walks' region lookups were made exact (a scroll region's name contained the section's) and the sets walk opened `/prediction/scenarios/sets` directly (a decision owner holds no prediction.read); 11 screenshots under `evidence/phase6-browser/b27-*.png`.
- **The scenes** (`STAGES.csv` B27): **F-P4-07** — the "Bab el-Mandeb closure" scenario declares Houthi activity and insurer withdrawal as drivers, carriers as actors; invalidating the insurer assumption suspends the disruption branch and tasks its owner; **F-P4-08** — L. Brandt compares the baseline, disruption and user-defined "regional blockade" branches side by side for the Regensburg supply decision; a missing stress branch is flagged before the recommendation is allowed; **F-P4-09** — two corridor branches that differ only in wording fail the distinctiveness check; the scenario shows its missing freight-rate indicator as stale (on the demonstration the retired freight-rate signpost reads MISSING — both fail the evaluation; the STALE reading needs a clock move and is harness-proven). The act's result: **HELD** on `eye_demo` on 2026-10-01 — `ALL SCENES HELD · 71.0 s` (61 ✓, no ✗; the rerun `ALL SCENES HELD · 0.3 s`, every write scene standing), after the rehearsal on `eye_demo_b27` (a fresh copy: 66.8 s, then 0.4 s; `evidence/cp6/act-b27-rehearsal.txt`) — `evidence/cp6/act-b27.txt`. The anatomy: J. Weber's "Bab el-Mandeb closure" with its drivers, actor, mechanism, intervention, impact and records; the critical assumption "Insurers keep war-risk cover" invalidated → "Insurer withdrawal" SUSPENDED in the same act, N. Eriksen tasked, her reinstatement refused while it stays invalidated (left suspended for the walk). The sets: J. Weber's "Regensburg supply" set flagging the missing stress branch; L. Brandt's fresh package on the January Regensburg decision bound and its proposal REFUSED (recommendation rejected (plurality)), admitted after the stress branch joins; the comparison, M. Dvořák's portfolio review, the tick's relevance score, N. Eriksen's proposal from the escalated insurer signal (her own resolution refused), J. Weber's acceptance. The quality: the freight-exposure scenario's wording-only branches FAIL distinctiveness with the retired freight-rate signpost MISSING, NOT DECISION-ACTIVE, J. Weber tasked; the map and two probabilities; a narrative basis and A. Hoffmann refused. Side effect stated: the relevance step notified N. Eriksen once per breached branch of the every-kind scenario (8 signpost items).
- **Not staged (harness-proven, said, not claimed):** anatomy — the element refusals and the in-use retirement, the reinstatement refusals and the recovery (re-verify → reinstate → a run admitted), a flipped branch suspended and returned to flipped, a scenario-wide critical link suspending every live branch, the records superseded (`phase6-anatomy-b27`); quality — the collapse, contradiction and temporal-order failures, the STALE indicator (a clock move), the awaiting indicator not stale, the probability refusals (a narrative basis, the sum beyond 1, a superseded map), the model method, a suspended branch's probability not summed, the tick's re-evaluation (`phase6-quality-b27`); sets — the suspended stress branch shown not counted and reinstated, a second portfolio review, relevance raised by a signpost breach and the owner notified once, the weak-signal proposal, the risk and planning-cycle refusals, the set retired once its package leaves flight (`phase6-sets-b27`).
- **The restart** is unchanged from §15.
- **The 2026-10-01 pass on the demonstration.** `eye_demo` is through **0098** (§16's last line; backup `.eye-local/backups/eye_demo-pre-0098-20261001T111117Z.dump`). The B27 bookkeeping correction changes no scene. The act reruns and stands; the walks pass. The browser gates stop the demonstration (:3401, :3000); restart it after with `scripts/ops/demo-restart.sh` and the §15 environment, then the `eye-web` launch configuration.

## 18. B31 on the demonstration (2026-10-01): what changed, the operator preparation, and how to rehearse

- **The state.** `eye_demo` is migrated through **0099** (`0099_b31_simulation_orchestration_impact_validity.sql`). The backup taken before it is `.eye-local/backups/eye_demo-pre-0099-20261001T142416Z.dump` (74,711,222 bytes). The API and the web were restarted on the B31 build with `scripts/ops/demo-restart.sh` and the §15 environment, then the `eye-web` launch configuration (VERIFIED).
- **The personas** (existing; no persona is created): T. Nakamura (twin owner — every B31 route he is cast in accepts the twin owner; he holds no `simulation_operator` binding), J. Weber (budget approver, reviewer), L. Brandt (decision authority and package owner), N. Eriksen (forecast owner), M. Dvořák, A. Hoffmann, C. Brenner (the challenger), S. Okafor (the approver).
- **What the act leaves** (nothing is cleaned; every figure SYNTHETIC): the completed 5,000-path experiment with its manifest and the partial one-second-budget experiment; the corridor closure run's sensitivity analysis, second-order effects, the elicited branch probabilities, L. Brandt's WAIT assessment with its open item, N. Eriksen's probability statement; L. Brandt's decision-use POLICY (require) — **it now applies to every later proposal and commitment in the demonstration domain**; the promoted control, the invalidated reroute run, the fresh package reading INPUT INVALIDATED with its commitment refused; the Downside branch BOUND to corridor v14 — **later runs on that branch must start from v14** until its owner rebinds or retires the binding.
- **The rehearsal rig (never the demonstration).** Restore the newest `eye_demo-pre-0099-*.dump` into **`eye_demo_b31`** and migrate it; run the rehearsal API on **:3411** with **`EYE_REDIS_PORT=6392`**, a COPY of the vault under the four `EYE_VAULT_*_ROOT` variables, its own degraded directory and API log (as §17); run `EYE_DB_NAME=eye_demo_b31 EYE_API=http://localhost:3411 node scripts/phase6/act-b31.mjs` TWICE — the act waits on the attention agent's real ticks (about four minutes), and the second run must say "stands — an earlier run" everywhere.
- **The walks.** After the act, export its `EYE_B31_*` lines (values with spaces are printed quoted; quote them when exporting) and run `e2e/phase6-b31-{orchestration,impact,validity}.demo.spec.ts` through `playwright.demo.config.ts`. Point `EYE_SHOTS` at a scratch directory for a regression run so the screenshots of record are not overwritten.
- **Not staged (harness-proven, said, not claimed):** orchestration retries, convergence, lost workers, capacity and cancellation; impact's timing factor, forged rankings, the superseded map, portfolio-review payoffs and the method fabric; validity's quality gates, claim and indicator conditions, rebinding, assumption sensitivity, the reach of an unverified twin version and the no-policy commitment refusal.
- **The restart** is unchanged from §15.
- **B31-F on the demonstration (2026-10-01).** `eye_demo` is migrated through **0100** (`0100_b31f_reinstatement_conditions_constraint_contract.sql`). The backup taken before it is `.eye-local/backups/eye_demo-pre-0100-20261001T160945Z.dump` (75,744,339 bytes). Only database functions changed, so the API needed no rebuild. `act-b27` and `act-b31` rerun and stand; the B27 and B31 walks pass 20/20 (screenshots to a scratch `EYE_SHOTS`, the screenshots of record unchanged). A branch bound to a constraint set now admits a run only at the bound version: rebind after the steward versions or retires the set. A claim- or indicator-suspended branch is reinstated only after the condition resolves or its link is revised.

## 19. B35 on the demonstration (2026-10-01/02): what changed, the operator preparation, and how to rehearse

- **The state.** `eye_demo` is migrated through **0101** (`0101_b35_decision_analysis_recommendation_explanation_reopen.sql`). The backup taken before it is `.eye-local/backups/eye_demo-pre-0101-20261001T213754Z.dump` (78,207,035 bytes). The API and the web were restarted on the B35 build (§15's environment; VERIFIED).
- **The personas** (existing; none created): L. Brandt (decision owner and authority), S. Okafor (approver and reviewer; the appeal's adjudicator), J. Weber (the appellant; records the change of conditions), C. Brenner (owner of act-b34's corridor mitigation package), N. Eriksen (the scenario owner who re-versions), A. Hoffmann (enters the stock option's assessment), the Decision Agent (its run session).
- **What the act leaves** (nothing is cleaned; every figure SYNTHETIC): L. Brandt's "Second source for bearings" package with its criteria v1 and v2, obligation, candidates and assembly; the agent's and L. Brandt's recommendations, the agent's accepted for consideration; the corridor forecast's explanation v2 and the closed appeal case; act-b34's mitigation package REOPENED with v2 open (a proposal or commitment of it meets act-b31's decision-use policy), the scenario's upside branch, the outcome assessment.
- **The Decision Agent's session.** The act opens the agent's run session outside the API (the runtime's identity port and token signing, reading the identity credential and the signing secret from `.eye-local/env`). Never print them; never copy the act's session code elsewhere.
- **The rehearsal rig.** Restore the newest `eye_demo-pre-0101-*.dump` into **`eye_demo_b35`** and migrate; the rehearsal API on **:3411** with **`EYE_REDIS_PORT=6392`**, a vault copy and its own degraded directory (as §17); run `EYE_DB_NAME=eye_demo_b35 EYE_API=http://localhost:3411 node scripts/phase6/act-b35.mjs` twice (the second "stands" everywhere).
- **The walks.** Export the act's `EYE_B35_*` lines (the reopen decider and owner must be set: c.brenner, n.eriksen) and run `e2e/phase6-b35-{analysis,explanation,reopen,recommendation}.demo.spec.ts` through `playwright.demo.config.ts`; a regression run of earlier walks points `EYE_SHOTS` at a scratch directory.
- **The restart** is unchanged from §15.

## 20. N-01 and B30 on the demonstration (2026-10-02): what changed, the operator preparation, and how to rehearse

- **The state.**
  - `eye_demo` is migrated through **0103** (0102 N-01, then 0103 B30) by `pnpm db:migrate`. NEVER use `scripts/ops/apply-pending.sh` against `eye_demo`.
  - The backup taken immediately before is `.eye-local/backups/eye_demo-pre-0102-20261002T145926Z.dump`.
  - The API and the web were restarted on the B30 build (the restart line of §15, unchanged).
- **The personas** (existing; none created):
  - T. Nakamura: twin owner; owns the estimators, approves, sets the SLO, opens the merge, admits the exploratory run, retires.
  - T. Richter: domain administrator; their exploratory admission is refused.
  - S. Lindqvist: declares the conservation set `corridor-transit-balance`.
  - H. Petrović: method steward; concurs.
  - J. Weber: the blockade assumption; approves the fabric budget.
  - E. Kovács: the fabric experiment.
  - A. Hoffmann: proposes the estimate when PortWatch has nothing new.
- **The Reconciliation Agent** is registered by the administrator (kind `reconciliation`). It proposes only when the PortWatch publisher records a NEW count after the estimators' declaration, and the tick queues the check. Otherwise the act says so and a person proposes.
- **"5 days stale" holds on the staging day only.** The age counts from the database's day; on a later day the act re-admits a head at day − 5. The blockade merge is left OPEN; the walk's completion is refused. The 75-day state lives on the branch `stress-75`, never on actual's head.
- **The rehearsal rig.** It is the same as §19, with these differences:
  - Restore the newest `eye_demo-pre-0102-*.dump` into **`eye_demo_b30`** and migrate it.
  - Run the rehearsal API on **:3411** with **`EYE_REDIS_PORT=6394`**.
  - Run `EYE_DB_NAME=eye_demo_b30 EYE_API=http://localhost:3411 node scripts/phase6/act-b30.mjs`.
  - The first run takes about 10 minutes: an estimate reads the whole series through governed retrievals, and the tick waits are real.
- **The walks.** Export the act's `EYE_B30_*` lines, including `EYE_B30_PROPOSED_BY`, and run `e2e/phase6-b30-{branches,envelope,estimation,experiments}.demo.spec.ts` through `playwright.demo.config.ts`. For a regression run, set `EYE_SHOTS` to a scratch directory so the screenshots of record are not overwritten. Older acts printed some env values unquoted: load them with a parser, not `source`.

## 21. B91 on the demonstration (2026-10-04): what changed, the operator preparation, and how to rehearse

- **The state.**
  - `eye_demo` is migrated through **0105** (0104 B30-F on 2026-10-04, backup `eye_demo-pre-0104-20261004T111119Z.dump`; then 0105 B91, backup `eye_demo-pre-0105-20261004T121709Z.dump`), both by `pnpm db:migrate`. NEVER use `scripts/ops/apply-pending.sh` against `eye_demo`.
  - The API was restarted on the B91 build in §13's form: the switch and the sinks in the caller's environment, never in `.eye-local/env`.
- **The personas.**
  - **Created by the act**, through governed routes:
    - **C. Marchetti** (`c.marchetti`, `commercial_authority` at PLATFORM — the vendor; created on `POST /v1/platform/principals` by the platform administrator);
    - **N. Vogel** (`n.vogel`, `tenant_admin` of NORDWERK; the tenant route).
  - **Existing personas used:** T. Nakamura (the sweep), E. Kovács (the experiment), M. Dvořák (the budget owner and the attention policy), A. Hoffmann and L. Ferreira (the extraction whose gateway call is metered), E. Lindqvist (the auditor), T. Richter.
- **The order is fixed:**
  1. `node scripts/phase6/act-b91.mjs` (the scenes, about 7 minutes of real ticks);
  2. the four walks `e2e/phase6-b91-{entitlements,grace,ledger,meters}.demo.spec.ts` with the act's `EYE_B91_*` lines;
  3. **`node scripts/phase6/act-b91.mjs --restore`**.
- **Why the order matters:**
  - B91-M stages only while NORDWERK is uncontracted, so it can be staged ONCE per database.
  - While the licence is in GRACE, new work in every licensed capability is refused (only running work may finish; only the attention tick is exempt). `--restore` issues the full licence (v2, no term end) and raises the compute cap to warn.
  - After `--restore`, every later act on NORDWERK works as before; act-b30 holds after it.
  - Re-running the scenes after `--restore` holds: they read their records.
- **NORDWERK is CONTRACTED from now on.** A licence row turns the gate on for good. A later stage that adds a licensable capability must add it to the licence (a new version through the vendor's issue route), or its writes are refused with `EYE-ENT-001`.
- **The rehearsal rig.**
  - Restore the newest `eye_demo-pre-0105-*.dump` (or `-pre-0104-*`) into **`eye_demo_b91`** and migrate it.
  - Run the API on **:3411** with **`EYE_REDIS_PORT=6395`**, then `EYE_DB_NAME=eye_demo_b91 EYE_API=http://localhost:3411 node scripts/phase6/act-b91.mjs`.
  - The rig scripts were the session's (reset, start, stop, run); they follow §20's.
