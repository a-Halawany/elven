# Atomic requirements audit — shared brief for every volume agent

You are auditing one volume of "The Eye" product specification against the repository at
`/Users/halawany/work/personal/mohammed/new_project` (branch `phase6-decisions`, HEAD `07edd9dc`
plus an uncommitted correction pass in `apps/api`). The owner's mandate: 100% of the agreed product
across Volumes 0–10. A requirement stays open until it is implemented, verified with evidence of the
right class, and released. Phase closures do not close requirements.

## Hard rules
- READ-ONLY on the repository except for ONE output file you create: `audit/requirements/<your file>.csv`
  (create the directory `audit/requirements/` if missing). Do not run builds, tests, git commands that
  change state (`git status`/`git log`/`git show` are fine), migrations, servers, or anything paid/hosted.
- Do not invent requirement text. Every row's `clause` is the requirement's own words from the extraction
  (trim to ≤ 400 characters, keep the normative sentence). If a requirement has no identifier in the
  source, assign a tracking id `V<nn>-T-<seq>` and say so in `notes`.
- Never mark something `implemented` or `verified` without an evidence pointer you actually found
  (a file path, a migration, a test name, a workflow job). Code that exists but whose behaviour you did
  not confirm by test evidence is `implemented` + `unverified` (that is honest and expected). No completion
  percentage anywhere.
- Distinguish work the master build prompt scheduled for Phase 7 (`phase_origin = phase7`) from work
  that belongs to an earlier phase and is absent (`phase_origin = omission`), and from work delivered in
  Phases 0–6 (`phase_origin = phase0` … `phase6`). The phase plan is in
  `docs/the-eye-master-build-prompt.md`; the repository's phase reports are `PROGRESS.md`,
  `PHASE1_REPORT.md` … `PHASE6_REPORT.md`, `SCHEDULED_COLLECTION.md`, `FULL_PRODUCT_DELIVERY_REGISTER.md`.

## Where the text is
Extractions (verified against the pinned blobs) are in
`/private/tmp/claude-501/-Users-halawany-work-personal-mohammed-new-project/8704aca5-efd0-4164-8e07-dbc1322f9c20/scratchpad/volumes/`:
`v00.txt` … `v10.txt` with `=== PAGE n ===` markers (PDF) or `=== PARA n ===` markers (DOCX), and
`INVENTORY.md` (identifier prefixes, headings with page numbers). Volume 2 is image-only; its slides are
rendered as `v02-pages/slide-NN.png` (read them with the Read tool).

## Where the code is (search it; do not guess)
- API (NestJS): `apps/api/src/` — modules `observation` (sources, contracts, connectors, quarantine,
  acquisition, scheduling), `objects` (canonical objects, outbox), `graph` (entities, claims, strategy graph,
  impact), `prediction` (series, forecasts, indicators, scenarios, warnings), `twin` (twins, grounding,
  simulations, reconciliation), `decision` (packages, approvals, commitments, replay, monitoring, outcomes),
  `executive` (rooms, briefings, agents, worker), `identity` (principals, sessions, bindings), `policy`
  (PDP rules in `pdp.service.ts`), `pipeline` (governed write/read), `audit`, `tenancy`, `shared`.
- Database: `apps/api/migrations/0001…0050*.sql` (schemas identity, policy, audit, objects, observation,
  graph, prediction, simulation, twin, decision, executive, ctx).
- Web (Next.js): `apps/web/app/**`, `apps/web/lib/**`, `apps/web/components/**`.
- Tests: `apps/api/test/int/*.test.ts` (real database/controller harness), `apps/api/test/**` (unit),
  `apps/api/test/gate/**` (release gates), `apps/api/e2e/*.spec.ts` (browser), `packages/contracts`.
- Release/ops: `.github/workflows/*.yml` (C15 supply-chain, C16, C17, C18, C19 gates), `scripts/gate/**`,
  `docker-compose.yml`, `infra/**`, `docs/SCANNER_DISPOSITIONS.md`.
- Use `grep -rn`/`rg` liberally; cite the most specific file(s). Read a file only when you need to
  confirm behaviour for a status.

## Output: one CSV, UTF-8, header exactly
```
id,volume,chapter,page,clause,family_seed,capability_area,impl_status,verif_status,release_status,phase_origin,package,evidence,remaining_work,notes
```
- `id`: the original identifier (e.g. `ES-31-004`, `C-012`, `L4-C07`, `ADR-0007`); tracking ids as above.
- `volume`: `V0`…`V10`. `chapter`: the chapter number/title. `page`: page number (PDF) or paragraph
  index (DOCX).
- `clause`: the requirement text (quote, ≤ 400 chars, no line breaks; escape quotes CSV-style).
- `family_seed`: the historical register family this maps to, `V<nn>-F<nnn>` (from the family list in
  this brief's companion file `FAMILIES.txt`; map by chapter), or empty if none fits.
- `capability_area`: one of `observation`, `intelligence`, `memory-graph`, `prediction`, `twin-simulation`,
  `decision`, `executive-os`, `agents`, `learning-evaluation`, `marketplace`, `identity-policy`, `data-platform`,
  `infrastructure`, `ux`, `commercial`, `governance-docs`.
- `impl_status`: `missing` | `partial` | `implemented`.
- `verif_status`: `unverified` | `passed:<scope>` (e.g. `passed:harness`, `passed:browser`, `passed:ci`) |
  `failed` | `stale` | `not-applicable` (explanatory/investor prose with no product behaviour).
- `release_status`: `none` | `branch-only` | `merged`. (Phases 0–5 are on `main` = merged; Phase 6 and
  scheduled collection are branch-only; anything else none.)
- `phase_origin`: `phase0`…`phase6` | `phase7` | `omission` | `not-applicable`.
- `package`: the delivery package that owns the remaining work: `R0`, `P1`, `P2`, `P3`, `P4`, `P5`, `P6`,
  `P7-A`, `P7-B`, `P7-C`, `P7-D`, `P7-E`, `P7-F` (definitions in `FAMILIES.txt`), or `done` when nothing remains.
- `evidence`: semicolon-separated pointers (`apps/api/src/…`, `migrations/00xx…`, `test/int/…: <case>`,
  `.github/workflows/ci.yml: <job>`), empty when none.
- `remaining_work`: the specific missing behaviour, missing evidence, or external dependency (≤ 300 chars).
- `notes`: cross-volume links (other ids), ambiguities for the owner, tracking-id explanations.

Every numbered requirement in the volume gets a row (all of them — do not sample). Explanatory
chapters without numbered requirements get one row per normative statement you find, or a single
`not-applicable` row for the chapter if it is purely explanatory. Aim for completeness over prose;
`remaining_work` must be concrete enough for an engineer to start.

## Final message
Report: the output path, the row count, counts by `impl_status` and by `phase_origin`, the ten most
consequential `missing` items in one line each, and any extraction gaps (pages you could not read).
Keep it under 600 words. Do not paste the CSV.
