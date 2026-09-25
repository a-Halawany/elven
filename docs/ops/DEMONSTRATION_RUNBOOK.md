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
