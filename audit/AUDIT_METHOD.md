# Atomic requirements audit — method, sources and limits

Started 2026-09-09 at head `561dd3c` (branch `phase6-decisions`), on the owner's mandate of 100% of the
agreed product across Volumes 0–10. This file records how the register under `audit/requirements/` was
produced so it can be reproduced, challenged and continued.

## Sources

The eleven volumes are Git blobs under `docs/` at `07edd9dcd57e972203fb9e7bbcdab3a398c642b5`. Each was
retrieved with `git show <head>:<path>`, its blob id recomputed as `sha1("blob <len>\0" + bytes)` and
compared with the pinned id and size before extraction; all eleven matched. Text was extracted page by
page (pypdf 6.18.0, `=== PAGE n ===` markers) or paragraph by paragraph for the two DOCX volumes
(python-docx 1.2.0, `=== PARA n ===` markers, tables as rows). Volume 2 has no text layer (raster
slides); its 50 pages were rendered to PNG (PyMuPDF, 110 dpi) and transcribed by reading each image.
The extraction inventory (identifier prefixes with distinct counts, chapter headings with pages, empty
pages) was checked against each volume's contents page: every PDF's numbered chapter sequence is gap-free.

| Volume | Units | Identifier families found (distinct) |
|---|---|---|
| 0 | 419 paragraphs, 41 tables | C (52) |
| 1 | 624 paragraphs, 5 tables | C (52, references) |
| 2 | 50 slides (images) | none; tracking ids V02-T-nnn |
| 3 | 122 pages | L{n}-C (92), L{n}-I (50), ADR (20), C (52 refs) |
| 4 | 195 pages | ES (410), SLO (22), TS (20), ADR (20), EYE-xxx (23), L{n}-C/I refs |
| 5 | 199 pages | AI (360), AI-ADR (24), AI-C (57), AG (44), EM (32), AR (30), MC (20), TC (18) |
| 6 | 193 pages | IA (432), IADR (24), IM (40), FM (32), IC (30), RU (26), SC (24), NZ/MS/DR (20 each), ST (14), CP/NW/PF/TR/OP (12 each), DP (10), DL (8) |
| 7 | 195 pages | DP (432), DADR (24), DQM (40), DF/DCN (32), SP/LR (24), DZ/TT/DPD (20), DC (16), IN/ST (14), SM/KN/TR/OP (12), GV/SV (10), DL (8) |
| 8 | 209 pages | PR (432), AT (72), OBJ/MET (40), FEX (32), PER/JRN/GLB/PAR/ADR (24), WS/HX/ENT (20), 9 more catalogues of 12 |
| 9 | 195 pages | UX (432), CMP (112), PAT (48), OBJ (40), VIZ (36), NOT (32), GLB/PER/JRN/UX-ADR/REL (24), HX/WS (20), LAY (17), CNT (16), TYP (15), CAP-* (89 bindings), SPC/LS/NUM (12), TS (10), REG (8), BP (5), CLR (30 after reconstruction), DEN (3) |
| 10 | 164 pages | IR (240), DA (30), R (30), S (22), ENT/DR/REL (20) |

## Rows and statuses

One row per identifier; one tracking row (`Vnn-T-nnn`) per normative clause that carries no identifier
(the Volume 0 chapter contracts and Appendix B classes, every Volume 2 slide commitment, Volume 10's
appendices). The clause is quoted from the extraction (≤ 400 characters). Statuses:

- `impl_status`: `missing` (nothing found), `partial` (some obligations met, the rest named in
  `remaining_work`), `implemented` (a concrete pointer found for the whole clause).
- `verif_status`: `unverified`, `passed:harness` (a real database/controller integration case),
  `passed:browser`, `passed:ci` (a gate job), `failed`, `stale`, `not-applicable` (explanatory or business
  content with no product behaviour — kept as rows, never counted as delivered).
- `release_status`: `merged` (on `main`), `branch-only` (on a reviewed unmerged branch), `none`.
  Note from the Volume 10 auditor: `main` ends at migration 0027 (Phase 3); Phases 4, 5 and 6 are on their
  branches. Rows citing Phase 4–6 evidence are `branch-only` wherever the auditor checked the branch
  state; where a row still says `merged` for Phase 4/5 evidence, the second pass corrects it.
- `phase_origin`: the phase of the master build prompt that delivered or scheduled the work
  (`phase0`…`phase6`, `phase7`), `omission` when no phase scheduled it, `not-applicable`.
- `package`: the owner's delivery package that owns the remaining work (R0, P1–P6, P7-A…P7-F) or `done`.

Evidence pointers are file paths, migration numbers, test names or workflow jobs found at this head.
`implemented` without a pointer is not allowed; `passed:*` without a named test or job is not allowed.

## The second pass (step S4) — what `audit/second-pass.mjs` did, and what the acceptance units add

Run over the first-pass files (kept in the session record) at head `2e83945`, the script:

- resolved every evidence pointer against the tracked tree at HEAD and at `main` (line-range suffixes,
  case-name suffixes and globs tolerated; bare migration numbers resolved by prefix); a pointer that
  resolves nowhere was moved out of `evidence` into `notes` as `UNRESOLVED pointer(s) at <head>` and
  can no longer support a verification (643 pointers, mostly prose-with-paths from the first pass);
- derived `release_status` from where the evidence lives — `branch-only` when any cited path or
  migration exists only on this branch, `merged` when every cited path is on `main`, `none` when
  nothing is implemented — replacing the first pass's hand-assigned labels and keeping the old value in
  `notes` when it differed (1,058 rows changed; the Phase 4/5/6 `merged` labels the first pass carried
  are gone: `main` ends at migration 0027);
- downgraded every `passed:*` that had no resolved test, spec, gate or workflow pointer to
  `unverified` (471 rows) — a module name is not evidence of a passing case;
- reassigned every row under package `done` (100): implemented-but-unverified rows to the package of
  their capability area with the missing evidence as remaining work; partial rows likewise; documentary
  rows (verification `not-applicable`) to `impl_status = not-applicable` with an applicability
  rationale (26) — a source convention is never turned into feature work;
- attached `source_ref` (`vNN.txt:<page|para|slide n>:L<line>` into `audit/extraction/text/`) to
  5,391 rows, so the full clause is always readable; 873 rows whose excerpt was paraphrased or
  reflowed by the first pass carry no automatic reference and are located by their `page` column;
- added `evidence_scope` (`main`, `branch`, `test` in any combination) so a reader sees at a glance
  whether a row's evidence is merged, branch-only, or test-backed.

The extraction record is persisted under `audit/extraction/` (verified texts, inventory, fetch/extract
scripts, the Volume 2 slide transcription with slide numbers, the per-volume generator scripts of the
first pass and the surveys they used). The acceptance units are in `audit/acceptance-units/` (one file
per capability group; the schema is in the header): one unit per obligation small enough to verify,
with its conditions, every source row it satisfies (the first being the primary source by the authority
order), the deployment profiles it applies to, the evidence class that proves it, and a status that is
`verified:<scope>` only when a named case exercises that unit on the artefact and profile it applies
to — a local-only demonstration never verifies a `profiles = all` unit.

## Limits of this first pass

- Statuses were assigned per volume by one auditor each, from a code/test survey; the second pass
  mechanically corrected release labels, verification claims and pointers (above) and the acceptance
  units reconcile the same obligation stated in several volumes; verifying every `partial` row's
  remaining-work statement against the code one by one is still open work of step S4.
- Chapter-level surveys informed many rows of the same chapter; a row's `evidence` therefore names the
  module that realises the chapter's behaviour, not always the exact function for that clause.
- Acceptance units are a first decomposition by capability group (`audit/acceptance-units/`); their
  `verified:*` statuses are inherited from row evidence and are to be re-checked case by case as each
  package's work starts.
- Four data-platform rows (V4 ES-24-005, V7 DADR-017, DADR-021, DPD-03) were not referenced by the
  group-a decomposition and were given one unit each (AU-DP-9001…9004) in the reconciliation; every
  register row is now referenced by at least one acceptance unit.
- The 220 historical families are mapped by chapter (`family_seed`); `audit/SUMMARY.md` lists the
  families with no atomic row yet so none is lost.
- Volume 2's transcription was made from images and may carry minor wording differences from the slides.
- No completion percentage is computed. `audit/SUMMARY.md` gives counts by status; a count of
  `implemented` rows is not a fraction of the product.

## Reproduction

`audit/summarise.mjs` regenerates `audit/SUMMARY.md` and `audit/summary.json` from the CSVs. The
extraction scripts, the rendered slides and the per-volume generator scripts live in the session
scratchpad; the CSVs are the durable artefact.
