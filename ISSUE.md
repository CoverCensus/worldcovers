# WorldCovers / APMC -- Consolidated Issues

This file tracks the original beta-feedback issues and the MD/MI review
batch. It is not the full current engineering queue. Later work also appears
in GitHub PRs and Reese's workspace-local `docs/issues.md`.

**Last correction review:** 2026-09-13, against repo commit `f333cb4` and merged
PRs. This was a source and PR review, not a new audit of the live datasets.
Entries without new evidence retain their prior status. Use PRs for change
history; an implemented fix, a data load, and editor acceptance are separate
results.

| Source | Scope in this file |
|---|---|
| `06-09-emails.md` (Ian Gibson-Smith, Greg Stone) | Original Issues 1-27 |
| Reese's `docs/issues.md` | Pipeline milestones [R1]-[R8] and the separate MD/MI batch |
| `docs/DECISIONS.md`, `docs/mi-edge-cases.md`, `docs/michigan-report-for-michael.md` | Original Issues 28-34 and Michigan E2E notes |
| Ian's email of 18 Jun 2026, 12:54 PM | MD/MI batch #22-#38 |

**Reference names:** `Issue N` means an original issue in this file.
`Batch #N` means an MD/MI review item. `Reese queue #N` means an item in his
workspace-local queue. `PR #N` means a GitHub pull request. Keep the existing
numbers; always include the label when referring to them outside their table.
The older `ISSUES.md`, Trello export, and Trello board are historical sources.

**Note for collaborators and agents:** referenced workspace files can be absent
from a checkout because Reese kept them gitignored in his branch's workspace
or removed them before committing. That is expected; it does not mean the
checkout is incomplete or an import failed. Do not recreate those files just
to satisfy a reference. If available in Reese's workspace, use them as source
context; otherwise use the linked PRs and current code. This applies to the
source paths above and other local paths cited below, including
`ASCC Data/regions.csv` and `worldcovers-v1/`.

**Scope:** WorldCovers / APMC only. IanThom.org and ChinaOverprints (and the
Bluehost/Porkbun account admin) are a separate, lower-precedence track and are
**not** in this file. Credentials and donor lists from the email archive are
deliberately omitted here.

**Precedence:** *"Worldcovers takes total precedence"* -- Ian, 9 Jun 2026.

**Glossary:** WoCo = the software. APMC = the dataset (proposed go-live brand).
ASCC = the first catalog being digitized into APMC. USPCS = U.S. Philatelic
Classics Society (sponsor). VPHC = Virginia Postal History Society catalog.
v1 = the legacy ColdFusion/MSSQL system behind worldcovers.org (`worldcovers-v1/`).

---

# MD/MI editor-review batch (Ian email, 18 Jun 2026)

The batch contains 17 asks from Ian's 18 Jun 2026 email. Reese gave it priority
over state expansion at that time. The remaining actions are listed below;
do not read the June priority note as a new instruction to repeat completed
work.

## Crosswalk -- Ian's email asks -> batch item -> status

| Ian's ask | Batch item | Status |
|---|---|---|
| State-editor approval flag and filter | Batch #22 | **done** - [PR #60](https://github.com/CoverCensus/worldcovers/pull/60) |
| Rate-vs-Aux guidance, description, and lettering help | Batch #23 | **done** - [PR #61](https://github.com/CoverCensus/worldcovers/pull/61); decision in Issue 21 |
| Multi-territory support | Batch #24 | **done for requested display/search and Adamsville merge** - [PR #59](https://github.com/CoverCensus/worldcovers/pull/59), [PR #71](https://github.com/CoverCensus/worldcovers/pull/71); broader search policy remains Issue 31 |
| Dates Seen, Amelia no-date handling, and VA `(1)` rule for WV | Batch #25 | **partial** - Amelia parser fix in PR #71; remaining checks below |
| Decade dates: blank date and note | Batch #26 | **done** - PR #71 |
| Editor-only dates on new markings | Batch #27 | **done** - [PR #67](https://github.com/CoverCensus/worldcovers/pull/67) |
| Territory/state detail tags and search | Batch #28 | **done** - PR #59; broader alias policy remains Issue 31 |
| Institutional designation | Batch #29 | **code implemented; data verification open** - [PR #66](https://github.com/CoverCensus/worldcovers/pull/66) and current starred-listing import |
| Clear Filters at the top | Batch #30 | **done** - [PR #64](https://github.com/CoverCensus/worldcovers/pull/64) |
| Per-state notification and editor review | Batch #31 | **open for confirmation** - staging re-import reported in PR #71; invitations and acceptance not confirmed here |
| MD: Anna/Polis backstamp | Batch #32 | **done** - PR #71 |
| MD: S/D notation in notes | Batch #33 | **done** - PR #71 |
| MD: Barry manuscript and congressional-frank note | Batch #34 | **done** - PR #71 |
| MD: Ann.MD and B M House source entries | Batch #35 | **open** - investigate source match and decide handling |
| MI: merge Adamsville date variants | Batch #36 | **done** - PR #71 |
| MI: institutional flag for leading-star listings | Batch #37 | **code implemented; data verification open** - remaining checks below |
| MI: ADA.MI circular shape | Batch #38 | **done** - PR #71 |

PR #71 reports a data-only staging re-import and live verification of its
fixes. These completed engineering items do not require another implementation
pass. The PR does not establish production rollout or final editor acceptance.

## Remaining batch actions

- **Batch #25:** verify the requested multiple-date wording and the VA `(1)`
  rule on WV data. The Amelia size-as-rate parser defect is fixed; any remaining
  occurrence needs a named source row and target record (see Issue 3).
- **Batch #29 and Batch #37:** verify the affected Michigan listings on the
  target site. Institutional search shipped in PR #66. Current munger code also
  creates institutional covers for leading-star listings, covered by
  `test_munger_emits_institutional_covers_for_starred_townmark_variants` in
  `tools/tests/test_v1_pipeline.py`. Record any missing flags with source rows
  and target IDs before requesting another code change or data refresh.
- **Batch #31:** retain the per-state notification requirement: notify Ian
  before running a new state so he can provide its notation and quirks. Confirm
  whether MD/MI editors were invited after the reported staging re-import and
  record their acceptance or remaining corrections. Do not infer either from
  a merge or repeat the re-import solely because the old checklist said open.
- **Batch #35:** investigate Ann.MD and B M House against the catalog, then
  record whether to retain, correct, remove, or flag each listing.

---

## Historical status snapshot (2026-07-03)

The counts and rollout notes in this section describe that date, not the
current database. Use the corrected issue entries for remaining work.

**State rollout order (Ian):** VA -> WV -> **Michigan** -> Maryland -> Florida -> Tennessee -> Alabama.

| Milestone | What | Status |
|---|---|---|
| **M1** | Reproduce VA E2E locally, then Michigan E2E | **DONE** |
| [R1] | VA pipeline reproduced E2E locally | [DONE] **DONE** -- 11,559 rows, 0 errors. Required local patches (not unmodified); see `docs/DECISIONS.md`. |
| [R2] | Michigan E2E via per-state extensibility | [DONE] **DONE** -- 10,224 rows, 0 errors; verified API/media. **PR #50** merged. Verdict: **config-only, no Michigan adapter class.** Open tails -> Issues 28-32. |
| M2 | Frontend gaps: user upload+verify, territory UI | **Partially shipped** -- reviewed filter (#60), multi-territory display/search (#59), editor-only ERD/LRD (#67), submitter-name opt-in, link-existing cover/marking (#84), and image order/move (#85) are in `staging`. Original Prospect Hill main-image flow and parser/re-run-gated items remain open. |
| M3 | QoL: citation search, branding, opt-out | **Partially shipped** -- acknowledgements are done, Rate-vs-Aux convention/copy is resolved, and submitter withdrawal policy is resolved. Branding/APMC sign-off and per-state citation rollout remain open. |

Related PRs from that snapshot:
- **Reese queue #46 / PR #83** user-safe refresh wrappers: `backup_user_markings` and `restore_user_markings`.
- **Reese queue #47 / PR #84** link existing covers and markings from detail pages.
- **Reese queue #48 / PR #85** move images between markings and covers in both directions.
- **PR #87** tooling, deploy-assets, and docs cleanup; added the feature-surface table below.

**Highest-value finding (resolved):** the four "fresh-install schema drift" alarms
from the VA write-up **did not reproduce** on a clean DB -- they were residue of an
earlier broken-`main` migrate against the same DB. Migration-integrity alarm
**downgraded**. The local test-DB privilege gap is fixed (Issue 33).

---

# Issues

Status values: `open` - `in-progress` - `blocked` - `done`. Where code is
complete but a data check or decision remains, the status names that remaining
action. Dependencies in this section refer to original Issues 1-34.

## Data & ingestion

### Issue 1 -- Fix WV data ingestion ("WV disconnect")
**Status:** open - **Depends on:** none
West Virginia markings don't appear in listings -- Martinsburg and Shepherdstown
are entirely absent, and Ian's own markings don't show. Ian: add WV **asap**.
- [ ] Martinsburg, WV markings appear in listings
- [ ] Shepherdstown, WV markings appear in listings
- [ ] Ian's submitted markings are findable
- [ ] Root cause documented: import gap vs. query/filter bug

### Issue 2 -- Fix Richmond town-name normalization
**Status:** open - **Depends on:** none
Records render the town as `Richmd, VA` instead of "Richmond" -- unsearchable and
looks broken to beta testers. (Same *family* of head-parsing normalization as the
Michigan territory-suffix residue, Issue 28.)
- [ ] Records showing `Richmd` display as "Richmond"
- [ ] Searching "Richmond, VA" returns those markings

### Issue 3 -- Verify remaining Amelia rate errors in deployed data
**Status:** open (data verification only) - **Depends on:** none - **Source:** Greg Stone
The unknown-date/size parser defect is fixed in
[PR #71](https://github.com/CoverCensus/worldcovers/pull/71), with targeted
coverage in `tools/tests/test_munger_field_classify.py`. Do not reimplement
that fix. The PR reports an MD/MI/FL/DE staging re-import, not a fresh audit
of all affected Virginia records.

- [x] Parser distinguishes an unknown-date/size placeholder from a real diameter or rate
- [ ] Verify Amelia and other affected VA records on the intended site
- [ ] If an error remains, record its source row and target ID, then decide whether a data repair or new parser fix is needed

### Issue 4 -- Marking-shape parsing: circle imported as straight-line (New Glasgow)
**Status:** open - **Depends on:** none - **Source:** Greg Stone
Markings shown as circles in the Stampless catalog import as straight-line.
- [ ] New Glasgow imports with the correct circular shape
- [ ] Spot-check confirms catalog circles aren't imported as straight-line

### Issue 5 -- Import updated VA data from worldcovers.org
**Status:** in-progress (Michael) - **Depends on:** none
Bring the updated Virginia records from worldcovers.org into WoCo. VA is first in
the rollout and the basis for beta testing and the VPHC comparison.
- [ ] VA records from worldcovers.org present in the new system
- [ ] Record counts reconcile between source and target

### Issue 6 -- Finish VPHC data reconciliation and editor acceptance
**Status:** open (remaining data and review work) - **Depends on:** Issue 5 data reconciliation
VPHC reference and marking ingestion are implemented in
[PR #106](https://github.com/CoverCensus/worldcovers/pull/106), with manuscript
support in [PR #132](https://github.com/CoverCensus/worldcovers/pull/132).
The workflow applies comparison-ledger actions, cites `VPHC1`, archives
identified duplicates, and normally queues marking contributions for review.
See [VPHC commands](docs/devel/TOOLS.md#vphc-commands).

- [x] Reference import and marking-ledger application exist
- [x] Imported contributions carry VPHC reference citations and provenance
- [x] Duplicate archiving and manuscript support exist
- [ ] Reconcile remaining source rows, skips, duplicates, and pending contributions for the intended release
- [ ] Confirm target-site coverage and editor acceptance; implementation and PR rehearsal counts do not establish completeness

### Issue 7 -- Enter Michigan data -- [DONE] DONE
**Status:** done (pipeline) - **Depends on:** none - **Assigned:** Reese [R2] - **PR #50**
Michigan imported E2E: **10,224 rows, 0 errors** (2,617 markings, 837 post
offices, 93 images), verified at API/media. Section-driven region assignment
validated live (Detroit -> 4 regions; Michigan Territory carries 292 POs incl.
WI/IA/MN precursors). Architecture verdict: **config-only, no Michigan adapter** --
everything state-specific was *data*, not *code*. Entry-process notes captured in
`docs/devel/PIPELINE.md` for repeatability on later states.
**Remaining tails -> Issues 28-31** (territory-suffix stripping, `#N` offices,
territory abbrevs, blessing region rows, territory search/UI).

### Issue 8 -- State rollout tracking
**Status:** open - **Depends on:** none
Track ingestion order VA -> WV -> MI -> MD -> FL -> TN -> AL with current status each.
(Live status lives in the snapshot above; this issue = the standing tracker.)
- [ ] Checklist exists with all 7 states in order + current status

## Bugs & cleanup

### Issue 9 -- Editor dashboard: delete bad records
**Status:** done (staging data cleanup) - **Depends on:** none
Delete the folded-cover record dated `1864-01-01` (submitted by Ian, missing
image) and the other fake submission Ian rejected.
- [x] `1864-01-01` folded-cover record removed
- [x] Rejected fake submission removed
Resolution note, 2026-06-14: closed by the staging orphan-submission cleanup
recorded under "Completed staging fixes" below.

### Issue 10 -- Submitter edit/revise permission bug
**Status:** done (account permissions) - **Depends on:** none
Authenticated editor (repro: Wayne Farley) could not revise/reject their own
pending listing -- *"not authorized to reject or revise anything."* Michael's manual
user-ID fix suggests a **systemic permissions gap after account migration** from
worldcovers.org.
- [x] Editor can edit and approve their own pending/approved listing
- [x] Migrated accounts get correct permissions without manual intervention
- [x] Regression: no editor sees a spurious "not authorized" on their own records
Resolution note, 2026-06-15: current backend auth payload and contribution
queries use editor role plus assigned collections. The original migrated-account
permission failure is no longer tracked as open. Review-pass caveat: the Wayne
Farley reproduction is not covered by a narrow regression test; see
"Review pass, 2026-06-15" below.

### Issue 11 -- Submit New Cover: set the main image marking (Prospect Hill bug)
**Status:** open - **Depends on:** none - related **[R3]**
A newly added cover can't be designated the main image for its marking
(reproduced by Ian on Prospect Hill). Editors can't control which image
represents a marking. Backend (`ImageViewSet`/`ImageResource`) exists -- overlaps
the [R3] `SubmitImageDialog.tsx` -> `/api/v2/images/` wiring.
- [ ] After adding a cover, submitter can mark it the main image
- [ ] Chosen main image displays on the marking detail screen

## UI copy & forms

### Issue 12 -- Canonical submission-guidelines content block
**Status:** open (copy approval) - **Depends on:** none
One reusable guidelines block (used on three submission pages -- define once):
1. Image quality -- "300 dpi preferred"
2. Rate vs. Auxiliary -- current Issue 21 convention: number-bearing markings are Rate; word-only markings are usually Auxiliary
3. Reference works -- "To add a new reference, please add a note to editor for approval and addition"
4. Date-verification -- "please include image verifying date if not on exterior of cover"
- [x] Reusable component/string exists with all four items
- [ ] Content approved against Ian's wording
Progress note, 2026-07-03: centralized guideline labels live in
`frontend/src/labels/guidelines.ts`; Issue 21 resolved the Rate-vs-Aux wording.

### Issue 13 -- Submit New Marking page updates
**Status:** open - **Depends on:** 12
- [x] Rename "Create Marking" -> **"Submit New Marking"**
- [x] Expose **ERD** (Earliest Recorded Date) and **LRD** (Latest Recorded Date) fields for state editors
- [ ] Reference Works lists **"ASCC Edition 5", "ASCC Edition 6", "VPHC Catalog 1st Edition"** (currently shows ASCC twice -- remove dup)
- [x] Apply guidelines block (Issue 12)
- [x] Townmark field explains that it means the **EXACT** text on the marking
Progress note, 2026-07-03: page H1, state-editor ERD/LRD, centralized
guidelines, and exact-text help are implemented. Reference-work seed cleanup
remains open.

### Issue 14 -- Submit Edit to Marking page updates
**Status:** open - **Depends on:** 12
- [x] Rename "Edit Marking" -> **"Submit Edit to Existing Marking"**
- [x] Date-format selector: "Select one or more date formats" -> **"Select Date format"** (single-select)
- [ ] Document date-format codes: **MD** (month/day), **MDD** (month and day), **YMD** (year and month), **YMDD** (year, month and day) -- WARNING *source listed "YMDD" twice; confirm the year-and-month code with Ian*
- [x] Add ERD/LRD fields for state editors
- [x] Apply guidelines block (Issue 12)
Progress note, 2026-06-15: edit-marking H1 now uses the requested wording; date
format now behaves as a single-select radio menu and uses the requested empty
state text.
Progress note, 2026-07-03: state-editor ERD/LRD and centralized guidelines are
implemented on the shared marking form.

### Issue 15 -- Submit New Cover page updates
**Status:** done (frontend copy) - **Depends on:** 12
- [x] Apply guidelines block (Issue 12), including the date-verification-image note
Resolution note, 2026-07-03: `CoverEdit.tsx` renders the centralized
`COVER_SUBMISSION_GUIDELINES`, including the date-verification image note.

### Issue 16 -- Rename "Record Details" to entity-specific details
**Status:** done (frontend copy) - **Depends on:** none
- [x] Cover detail and cover contribution pages read **"Cover Details"**
- [x] Marking detail page reads **"Marking Details"**
Resolution note, 2026-06-15: replaced the generic `Record Details` label with
entity-specific details labels: `Cover Details` for covers and `Marking Details`
for markings.

### Issue 17 -- Submitter acknowledgement on covers
**Status:** done (frontend/API/privacy) - **Depends on:** 16 - related **[R8]**
On **Submit New Cover** (covers only, **not** markings): "Would you like your
name to display as the submitter?" If yes -> show "Submitted by [name]" on the
Cover Details screen. Incentivizes uploads.
- [x] Yes/no acknowledgement checkbox on Submit New Cover
- [x] When yes: "Submitted by [name]" appears on Cover Details
- [x] When no: no submitter name shown
- [x] Option does **not** appear on marking submission
Resolution note, 2026-07-03: cover submissions persist
`display_submitter_name`; the API only returns `submitter_name` when the
submitter opted in, and Cover Details renders that server-gated value.

### Issue 18 -- Catalog Search: search by size (diameter)
**Status:** done (frontend/API filter) - **Depends on:** none
- [x] Catalog Search exposes a size/diameter filter
- [x] Searching by diameter returns matching markings
Resolution note, 2026-06-15: `frontend/src/pages/Search.tsx` shows a Diameter
input for circle-family shapes and mirrors diameter to both `height` and `width`.
`frontend/src/services/markings.ts` sends those params to `/api/v2/markings/`;
`backend/common/filters.py` applies exact `height` and `width` filters.

## Markings model & display (Greg Stone parsing feedback)

### Issue 19 -- Ratemark display: plain vs. in-circle rate
**Status:** open - **Depends on:** none - **Source:** Greg Stone
Show the difference between a plain rate ("5") and a rate enclosed in a circle --
as the Stampless catalog distinguishes Cumberland vs. Curdsville.
- [ ] A "5" and a circled "5" render distinguishably
- [ ] Cumberland and Curdsville display their correct rate styling

### Issue 20 -- "Years Seen" model for marking dates -- [DONE]
**Status:** done (decision resolved) - **Depends on:** none - **Source:** Greg Stone
Decision, 2026-07-03: the separate "Years Seen" model-change question is closed.
Keep ERD/LRD as the public earliest/latest bounds, backed by date-observation
rows where the current model supports them. Do not replace the current approach
with a separate free-form Years Seen field.
- [x] Decision recorded in this tracker
- [x] ERD/LRD remain the displayed earliest/latest bounds
- [x] Discrete date observations stay in the existing date-observation model

### Issue 21 -- Rate vs. Auxiliary classification decision -- [DONE]
**Status:** done (decision + copy) - **Depends on:** 12 - **Source:** Greg Stone
Decision, 2026-07-03: keep Ratemarks as a distinct marking type. Current
submitter guidance uses the shipped rule of thumb: number-bearing markings are
Rate; word-only markings are usually Auxiliary. This is no longer an open board
decision.
- [x] Classification decision documented with rationale
- [x] Guidelines (Issue 12) reflect the final convention
- [x] Decision removed from the open-decision table

## Content, branding & citations

### Issue 22 -- Rewrite the Acknowledgements page
**Status:** done (content + route) - **Depends on:** none
Replace with Ian's supplied copy (sections: U.S. Philatelic Classics Society,
Project Team, Beta Testers, Past Editors of the Catalogue, Donors). Full verbatim
text in `06-09-emails.md` -> "Acknowledgements" thread, and drafted at
`worldcovers/docs/acknowledgements.md`.
- [x] Page matches the supplied sections
- [x] All named people/orgs match the email exactly (spelling verified)
Resolution note, 2026-06-15: `docs/acknowledgements.md` contains the required
sections, `frontend/src/App.tsx` routes `/acknowledgements`, and
`frontend/src/components/Footer.tsx` links to the page.

### Issue 23 -- Branding: APMC + Classics Society
**Status:** open - **Depends on:** none - related **[R7]**
**WARNING Board approval required before merge.**
Replace "Worldcovers" branding with **APMC**, add the U.S. Philatelic Classics
Society logo, and add Society website / "Become a member" links.
- [ ] "APMC" branding + Classics Society logo replace "Worldcovers"
- [ ] Society website + membership links present and correct
- [ ] Final branding/logo/links confirmed with the board before merge

### Issue 24 -- Per-state reference citations
**Status:** open - **Depends on:** 13
As each state is added, attach its source reference/citation (e.g. VPHC Catalog) --
listings from another catalog are accepted as genuine on that catalog's authority.
- [ ] Imported listings carry their source reference work
- [ ] VA imports cite the VPHC Catalog where applicable

## Lower priority / later

### Issue 25 -- Marking with multiple states/territories
**Status:** done (display/search) - **Depends on:** none - related **[R5]**
Support and display a single marking belonging to more than one state/territory.
**Spike already answered by the Michigan run:** the `post_office_regions` junction
is **already many-to-many** (`unique_together [post_office, region]`); Detroit
links to four regions and `PostOffice.region` resolves the display region. So this
is largely **display + filter UI**, not a schema change. See Issue 31.
- [x] A marking can be associated with multiple states/territories
- [x] Detail screen displays all associated states
Resolution note, 2026-07-03: detail display and region-filter links are merged
via PR #59. Broader territory alias/search-design questions remain in Issue 31.

### Issue 26 -- Decide whether contributors may link existing covers and markings
**Status:** open (permission decision) - **Depends on:** none
[PR #84](https://github.com/CoverCensus/worldcovers/pull/84) added linking in
both directions from the detail pages. Editors and administrators can repeat
this action to associate one cover with several markings without uploading
it again. Ordinary contributors do not have that write permission.

- [x] Editors/admins can link existing covers and markings without another upload
- [ ] Decide whether ordinary contributors should be allowed to create these links
- [ ] If approved, define review and permission rules before extending the UI/API

### Issue 27 -- Submitter self-delete / withdrawal policy -- [DONE]
**Status:** done (policy + implementation) - **Depends on:** none
Decision, 2026-07-03: submitters may withdraw their own unapproved submissions
(`draft`, `pending`, `needs_revision`, or `rejected`). Approved contributions are
not hard-deleted through this path; removing a published catalog record goes
through the record remove / recycle-bin flow.
- [x] Decision recorded with rationale
- [x] Submitter can delete own unapproved submission
- [x] Approved contributions cannot be hard-deleted by submitter withdrawal

---

# Michigan E2E follow-ups (from PR #50)

These follow-ups were first recorded during the Michigan import. Issues 32
and 34 now have corrected resolutions below. The other entries retain their
recorded decisions or verification needs; their old counts are not a fresh
live census. Source references (see the collaborator note above):
`docs/mi-edge-cases.md`, `docs/michigan-report-for-michael.md`, `docs/DECISIONS.md`.

### Issue 28 -- Territory-suffix residue fragments post offices  * biggest MI data-quality item
**Status:** open (needs Michael's call) - **Depends on:** 7
Head parsing leaves `M.T` / `Mic.T` / `Mich.Ty or M.T` in town names, so **173 of
837 PO names** carry residue and the same town splits across periods (`ADRIAN M.T`
!= `ADRIAN`; Green Bay = 3 variants; only 37 merged cleanly). With section-driven
regions, the suffix is now **redundant** -- stripping it in `parse_head` (same family
as the VA trailing-year peel, `8be62ca`) fixes fragmentation and loses nothing.
Reported then as "Town: GREEN BAY M.T". Confirm the current affected rows
and Michael's handling decision before changing or re-running this data.

### Issue 29 -- `#N` office numbers: Port Lawrence #1 / #2 (2 real markings excluded)
**Status:** open (needs Michael's call) - **Depends on:** 7
`#` is outside the munger's PO-name charset -> import aborts. Two real Toledo-Strip
offices (values 1000.00 / 1250.00) were provisionally re-typed LISTING->META in the
scratch CSV to complete the run. **They must come back** once Michael picks a
handling: allow `#` in the charset, or normalize to `NO. 1`.

### Issue 30 -- Bless `regions.csv` territory rows into canonical data + DB
**Status:** open (needs Michael's go) - **Depends on:** 7
Two proposed rows live only in the gitignored scratch `tools/wip/in/regions.csv`:

| id | name | tier | parent | established | defunct |
|---|---|---|---|---|---|
| 59 | Michigan Territory | TERRITORY | 1 (USA) | 1805-06-30 | 1837-01-26 |
| 60 | Indiana Territory | TERRITORY | 1 (USA) | 1800-07-04 | 1816-12-11 |

Dates cross-checked (Wikipedia / Indiana Historical Bureau); follow the seed
convention that a territory's `defunct_date` = its successor's `established_date`.
Canonical `ASCC Data/regions.csv` and the DB are untouched pending Michael's OK.
**Sub-question:** abbrevs for both territories -- left empty (catalog only offers
the ambiguous `M.T.`). Hard constraint for any future code: must **not** collide
with a 2-char state abbrev (`MI`/`IN`/`MT` taken), since the munger keys catalog
files to regions by exact filename-prefix match.

### Issue 31 -- Territory search/UI surfacing
**Status:** open (design) - **Depends on:** 7 - related **25, [R5]**, M2
Territory regions hang off USA (parent id 1), not off their successor state -- so a
`region=MI` search won't include Michigan Territory markings as modeled. Decide
whether territories should also parent under (or alias to) their successor state
for search. Also: region filtering is per **post office**, not per **marking** -- a
town in two regions shows all its markings under either filter (correct per the
junction, but a territory-UI design input). Feeds the M2 territory-filter work.

### Issue 32 -- Preserve dates peeled from town headings
**Status:** done (parser implementation) - **Depends on:** none - related **Issue 20**
The old proposal is implemented. `tools/munger/head.py` removes trailing dates
from the town name and preserves them as `head_date_text`.
`tools/ascc_data_munger.py` consumes that value in date parsing; regression
cases are in `tools/tests/test_munger_head_dates.py`. The earlier statement
that this always drops the peeled year is obsolete. Issue 20 retains the
existing date-observation model, not a separate Years Seen field.

### Issue 33 -- Local backend test-DB privilege
**Status:** done (infra) - **Depends on:** none
Resolved locally on 2026-06-12: `wocod@localhost` has `GRANT ALL PRIVILEGES ON
test_worldcovers.*`, and Django can create/drop the test DB. Verified from repo
root with `uv run python backend/manage.py test common.tests.test_api_permissions
-v 2 --noinput` (exit code 0). The setup SQL now grants `test_worldcovers.*` for
fresh installs.

Staging checkouts without that test module can verify the DB grant directly:

```sh
sudo -u wocod -H bash -lc 'cd /srv/woco && mysql --defaults-file=mysql.cnf -e "DROP DATABASE IF EXISTS test_worldcovers; CREATE DATABASE test_worldcovers CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci; DROP DATABASE test_worldcovers;"'
```

Expected exit code: 0.
*(The four "migration drift" alarms from the VA write-up are
**withdrawn** -- fresh installs are healthy; see DECISIONS.md.)*

### Issue 34 -- Raw primary-key collision blocker for multi-state imports
**Status:** done (obsolete blocker)
The current importer uses names/codes as natural keys and lets Django assign
primary keys. `MarkingResource` and `PostOfficeResource` use `code` for matching
and foreign-key resolution. See
[import_ascc_bundle.py](backend/common/management/commands/import_ascc_bundle.py)
and [admin.py](backend/common/admin.py).

Do not add ID offsetting to solve the old raw-PK import problem. This closes
that architectural blocker, not every data-quality check on combined state
loads. Track any current collision with the input bundle, natural key, and
error; record per-state load results under Issue 8.

---

# Historical staging fixes (June 2026)

These were found while debugging staging after the original 1-34 issue merge.
These are historical results, not instructions to repeat the cleanup. Use
current backup and restore procedures in `docs/devel/RUNBOOK.md`.

## Staging orphan submissions pointing at missing records
**Status:** done (staging data cleanup) - **Date:** 2026-06-14
Approved submission rows were visible from the user-submissions dashboard even
when their target marking or cover route no longer resolved. Example symptoms:
`/record/3005` returned not found, and `/record/3005/cover/1673` linked through
the same missing parent marking. Root cause was staging data, not stale code:
approved contribution/version rows referenced records that no longer existed or
could no longer be reached.

Cleanup rule used on staging:
- Find approved `Contributions` rows whose `marking_id` is missing, or whose
  cover/version data points through a missing parent marking.
- Delete dependent version rows first, or set their `transaction_id` to `NULL`
  before deleting parent `SubmissionTransactions`.
- Delete the bad `SubmissionTransactions`.
- Delete the bad `Contributions`.

No code change was required for the data purge itself.

## Dashboard Back from approved submissions
**Status:** done (frontend) - **Date:** 2026-06-14
Opening an approved marking or cover from the user-submissions dashboard and then
clicking Back could navigate to a parent record instead of returning to the
dashboard. The dashboard now passes `fromDashboard` plus the originating
`dashboardTab`, and the detail pages preserve that state through approved-record
redirects.

Files changed:
- `frontend/src/pages/Dashboard.tsx`
- `frontend/src/pages/ContributionDetail.tsx`
- `frontend/src/pages/CoverContributionDetail.tsx`
- `frontend/src/pages/CoverDetail.tsx`
- `frontend/src/pages/RecordDetail.tsx`

Verified from `frontend/` with `npm run build`; expected exit code 0.

---

# Historical review pass, 2026-06-15

Scope: `ISSUE.md` checked against the current repo state after marking Issues
9, 10, 18, 22, and 33 resolved.

Findings:
- Issues 9, 10, 18, 22, and 33 are now marked `done`.
- Issue 18 is supported by current source: `frontend/src/pages/Search.tsx`
  exposes Diameter for circle-family shapes, `frontend/src/services/markings.ts`
  sends `height` and `width`, and `backend/common/filters.py` filters exact
  dimensions. Test gap: no backend test currently exercises dimension filtering.
- Issue 22 is supported by current source: `docs/acknowledgements.md` has the
  required sections, `/acknowledgements` is routed in `frontend/src/App.tsx`, and
  the footer links to it.
- Issue 33 was already correctly marked `done`; no change needed beyond this
  review note.
- Issue 16 is now closed with entity-specific labels: `Cover Details` for cover
  pages and `Marking Details` for marking pages.
- Issue 9 is a staging data cleanup, not a source-code behavior; source review
  cannot re-prove the deleted staging rows. The completed cleanup procedure is
  recorded below and now linked from Issue 9.
- Issue 10's original migrated-account permission failure is closed. Current
  code uses editor role plus collection assignments for contribution visibility
  and review access. Test gap: there is no narrow regression test named for the
  Wayne Farley reproduction.
- No additional stale `done`/`open` mismatch was found in the checked areas.

---

# Open decisions awaiting Ian / Michael / the board

| Original issue | Decision | Owner | Blocks |
|---|---|---|---|
| Issue 14 | Confirm the "year-and-month" date-format code (source listed YMDD twice) | Ian | Issue 14 |
| Issue 23 | APMC branding / logo / Society links sign-off | Board | Issue 23 |
| Issue 26 | Allow ordinary contributors to link existing covers and markings? | Project team | Issue 26 |
| Issue 28 | Strip territory suffixes in `parse_head`? | Michael | Issue 28 |
| Issue 29 | `#N` office-name handling (allow `#` or `NO. N`) | Michael | Issue 29 |
| Issue 30 | Bless territory region rows into canonical `regions.csv` + DB; territory abbrevs | Michael | Issue 30 |
| Issue 31 | Territory search behavior (parent under successor state?) | Michael | Issue 31 |

---

# Out of scope / non-engineering follow-ups

- **Hosting cost** -- Bob / Eric Stone meeting on APMC hosting (Website ~$975/qtr, Chronicle ~$465/qtr); Eric asked for a load/cost recommendation. Business decision.
- **Billing/naming** -- confirm "Covercensus" == "Worldcovers" for tax/billing (pending Michael).
- **ASCC data-model doc** -- reference only (Google Doc linked in `06-09-emails.md` -> "ASCC database" thread).
- **IanThom.org / ChinaOverprints / account admin / Jay Logan transition** -- separate, lower-precedence track. Not tracked here.

---

# Feature implementation surfaces (reviewed 2026-09-13)

Where each `docs/devel/design.md` feature (F1-F11) is implemented today.
The design doc is pure spec and points here for status. Routes are the ones
registered in `frontend/src/App.tsx`; re-verify against that file when
updating this table.

| Feature | Where implemented |
|---------|-------------------|
| F1 Authentication | SPA (`/auth`, `/reset-password`) |
| F2 Collection Discovery | SPA (`/`, `/search`, `/record/:id`, `/covers/:coverId`) |
| F3 Submission Workflow | SPA contribution and editor review flows, including bulk approval/rejection (see notes below) |
| F4 Comment Workflow | Partial: comments to the Editor travel inside Submissions; no standalone Entry comments yet |
| F5 Image Attachments | SPA (image upload inside contribution forms) |
| F6 Reference Work Management | Django `/admin/` only; the SPA exposes reference works for citation but has no management UI |
| F7 Collection Administration | SPA `/admin/collections` (superuser only) + Django `/admin/` |
| F8 Audit Trail | SPA submission transactions and editor/admin record-history views; django-reversion history in Django `/admin/` |
| F9 Documentation & Help | SPA (`/help`, `/help/:docSlug`) |
| F10 System Maintenance | Not in the application yet; operator CLI only -- see `docs/devel/RUNBOOK.md` |
| F11 Catalog Data Pipeline | Offline tooling only -- see `docs/devel/TOOLS.md` and `docs/devel/PIPELINE.md` |

Notes:

- **F3**: Contributors submit new Entries via `/contribute`, edit pending
  submissions via `/edit/:id`, and see any submission's status at
  `/contribution/:id`. Editors review, approve, reject, and return
  submissions from `/dashboard` (Editor Dashboard) and `/contribution/:id`
  (`ContributionDetail`). The SPA Editor Dashboard also supports bulk approve
  and reject, shipped in [PR #118](https://github.com/CoverCensus/worldcovers/pull/118).
  Django `/admin/` has secondary bulk actions for administrators.
- **F8**: Editors/admins can view record history on marking and cover detail
  pages. This is separate from the full django-reversion interface in Django
  `/admin/`; history is not limited to that admin interface.
- **F4**: The standalone comment-on-Entry flow from the design is not
  implemented yet. What exists today is the contributor's
  comment-to-Editor, carried inside the submission payload and shown on
  `/contribution/:id`.
- **F10**: Backup, restore, and update through the application interface
  remain unimplemented; these are operator tasks run from the command
  line today.
