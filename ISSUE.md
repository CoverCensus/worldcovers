# WorldCovers / APMC -- Consolidated Issues

This file tracks the original beta-feedback issues and the MD/MI review
batch, plus the reconciled September 19 offline-note follow-ups. It is not
the full current engineering queue. Later work also appears
in GitHub PRs and Reese's workspace-local `docs/issues.md`.

**Last review:** 2026-09-19, local `staging` at `d3da460`. Committed application
source matches published `338bc657` (PR #145). Uncommitted frontend work
appeared during the tracker sync and was left untouched; its progress is not
assessed here. Local docs/setup changes are preserved. State coverage below is
Michael's report, not a fresh production audit.

Previous review, 2026-09-13: local `staging` at `f6a86c5`. Implementation
evidence uses published commit `f333cb4` and merged PRs; `f6a86c5` adds repo
documentation and setup changes. Status and assignments include Michael's
confirmed updates. Live datasets were not audited again.

| Source | Scope in this file |
|---|---|
| `06-09-emails.md` (Ian Gibson-Smith, Greg Stone) | Original Issues 1-27 |
| Reese's `docs/issues.md` | Pipeline milestones [R1]-[R8] and the separate MD/MI batch |
| `docs/DECISIONS.md`, `docs/mi-edge-cases.md`, `docs/michigan-report-for-michael.md` | Original Issues 28-34 and Michigan E2E notes |
| Ian's email of 18 Jun 2026, 12:54 PM | MD/MI batch #22-#38 |
| Michael's offline-note intake, 19 Sep 2026 | Current state groups and September 19 follow-ups; original passages retained in the private session knowledgebase |

**Reference names:** `Issue N` means an original issue in this file.
`Batch #N` means an MD/MI review item. `Reese queue #N` means an item in his
workspace-local queue. `PR #N` means a GitHub pull request. Keep the existing
numbers; always include the label when referring to them outside their table.
The older `ISSUES.md` and Trello export are historical sources.
Backlog is deferred work; To Do is active work still to address; Doing is work
underway; Testing is work under verification or acceptance review; Done is
accepted work. A merge alone does not establish data coverage, production
rollout, or acceptance.

Trello descriptions contain scope, evidence, and acceptance criteria. Keep
responsibility and status summaries here; use Trello fields for membership,
swimlane, and feature labels. Label colors identify features: F1 green,
F2 yellow, F3 orange, F4 pink, F5 purple, F6 blue, F7 dark green, F8 gray,
F9 sky blue, F10 red, and F11 lime. F12 Engineering (dark blue) covers shared
technical work; F13 Project Administration (dark purple) covers planning,
branding, and board governance. Every current card has an area label,
including deferred work. Labels do not change priority or release scope.

Trello is Michael's visual work board; this file is the detailed reference.
Sync preserves his board organization and updates the reference to match.

## Current status (2026-09-19)

Update, 2026-09-19: live Trello statuses, assignments, and feature labels were
checked again after Michael's final Backlog and Doing moves. The board has
29 Backlog, 42 To Do, 14 Doing, 5 Testing, and 24 Done cards, excluding README.
Michael confirmed S16/S17 are deferred to Backlog and S27 remains
in Testing for operator tools, without an application update interface.
Historical defect reports below require current source/target checks before
repair. No hosted datasets or deployments were audited in this update.

S6, S7, S8, S15, S18, S22, S30, S31, S32, and S41 are accepted through live
stakeholder review and confirmed use. Previously accepted stories remain Done.
The separate data and editor-review tasks below remain open.

T31-T36 are Doing and assigned to Michael for the quick UI fixes he selected.
Michael moved S20 and T52-T54 to Backlog. Other To Do and Backlog cards
remain unassigned unless noted. The eight earlier Doing tasks
are assigned to Michael (`grubermeister`): T7, T10, T13, T22, T23, T26, T27,
and T28. Their original Issue or Batch sections below link to the cards.

Current engineering responsibility: Michael owns data engineering, including
direct model adjustments. Reese owns other frontend/backend development.
Responsibility is distinct from a card assignment or a claim that work has
started. T31-T36 are Michael's explicit exception; split mixed work at the
model/data boundary rather than assigning it by directory alone.

| Work in Testing | Current assignees |
|---|---|
| [S12 - Submission queue filters and sorting](https://trello.com/c/hvcjPb6q) | Reese Ludwick, Jay Logan |
| [S24 - Read help articles](https://trello.com/c/lqyysKov) | Michael (`grubermeister`), Jay Logan |
| [S27 - Apply system updates](https://trello.com/c/tT4fnM4W) | Michael (`grubermeister`), Jay Logan |
| [S34 - Add and edit help articles](https://trello.com/c/F7fYDJLl) | Michael (`grubermeister`) |
| [T14 - Submission-guideline copy acceptance](https://trello.com/c/O90RdMxz) | Reese Ludwick |

S33 and S34 are now active F9 requirements in the design. The feature table
below records story status separately from available code. Developer docs
([T1](https://trello.com/c/AvISZKlp)), security configuration
([T3](https://trello.com/c/R2QCv9o1)), backend/tool tests
([T4](https://trello.com/c/vawmAdKi)), frontend tests
([T5](https://trello.com/c/H7ydiAxO)), performance baseline review
([T6](https://trello.com/c/uIotrsGQ)), and production mail delivery
([T30](https://trello.com/c/wDojGejL)) are To Do. Existing suites and baseline
results remain implementation evidence. Accessibility/internationalization
([T2](https://trello.com/c/kXYAFWkw)) and long-soak/large-data runs
([T29](https://trello.com/c/p4BvgCcQ)) remain in Backlog.

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

**Glossary:** WoCo = the software. APMC = American Postal Markings Catalog,
the dataset; branding sign-off remains Issue 23.
ASCC = the first catalog being digitized into APMC. USPCS = U.S. Philatelic
Classics Society (sponsor and first intended community). VPHC = Virginia Postal History Catalog.
v1 = the legacy ColdFusion/MSSQL system behind worldcovers.org (`worldcovers-v1/`).

---

# September 19 follow-ups

Source: Michael's offline-note intake and current-source review, 2026-09-19.
T numbers below are Trello tasks, not additions to the original Issue 1-34
numbering. These requirements extend existing features; accepted stories
remain Done within their original scope.

## Quick fixes assigned to Michael

All six are Doing, assigned to Michael (`grubermeister`) at his request.
This is an explicit exception to the usual frontend/backend responsibility
boundary. This sync does not establish implementation progress. Each card links source;
acceptance requires checking the affected pages and recording the revision.

| Task | Outcome | Feature | Acceptance scope |
| --- | --- | --- | --- |
| [T31](https://trello.com/c/LK3sXe5j) | Move postmasters below associated Covers | F2 | Show Associated Covers before the postmasters list on the Marking detail page. Preserve both sections and their existing behaviour. |
| [T32](https://trello.com/c/VkbZnDZ1) | Distinguish Marking and Cover catalog code labels | F3 | Use Catalog Marking code and Catalog Cover code in the relevant forms, review labels, placeholders, and error messages. Each code's Entry type must be clear. |
| [T33](https://trello.com/c/9XzQrOLb) | Split thumbnail action buttons into two rows | F5 | Arrange actions below Marking and Cover thumbnails in two readable rows. Check desktop and narrow layouts; preserve all actions and permissions. |
| [T34](https://trello.com/c/L5tx4C7m) | Encourage Cover creation in the image upload warning | F3 | Explain that the image may show a whole Cover; suggest creating a Cover record or using an existing one. Preserve acknowledge-and-continue. The heuristic uses dimensions, not image recognition. This task changes wording, not creation workflow. |
| [T35](https://trello.com/c/8GLvhowq) | Refresh destination thumbnails after moving an image | F5 | After a successful image move, refresh the source gallery and affected associated destination previews without manual reload. Verify both Marking-to-Cover and Cover-to-Marking; retain sensible selection after removal. |
| [T36](https://trello.com/c/FT3w6YrX) | Include town in Cover draft labels on Marking pages | F2 | Show the town and state when known in draft Cover labels on Marking detail cards. Reuse the API display name or existing location data, with a useful fallback for missing location. |

## Other follow-ups

T52-T54 are Backlog; the others are To Do. All are unassigned.
The responsibility column directs planning;
it does not assert work has started or change existing card memberships.
Model/data work belongs to Michael even when a related interface belongs
to Reese. Source observations below describe code, not deployed behaviour.

| Task | Outcome | Feature | Responsibility | Scope and acceptance |
| --- | --- | --- | --- | --- |
| [T37](https://trello.com/c/u1f8iyjw) | Create image destinations from crop and move workflows | F5 | Reese; Michael for model changes | Add create-new Cover/Marking destinations and crop/move controls in edit forms. Keep eligible actions visible when no destination exists. From a potential Cover upload in a Marking edit, allow a provisional associated Cover; define draft versus pending first. If the associated Marking has no image, offer a crop into that existing Marking. Preserve the original image. Contributor permission expansion depends on T20; wording and refresh are T34/T35. |
| [T38](https://trello.com/c/eB0oWj65) | Search for recognizable link and move destinations | F2 | Reese | Replace code-only identification with searchable Entry details for linking and moving. Keep actions distinct and existing permission boundaries; T20 owns any Contributor link-permission change. Acceptance: find and select both Cover and Marking destinations without knowing a code. |
| [T39](https://trello.com/c/YtcnoRop) | Compare proposed changes beside the current Entry | F3 | Reese | Show current and proposed values side by side during Marking and Cover submission review. Existing history is not this comparison. Acceptance: an Editor can identify changed and unchanged values before deciding. |
| [T40](https://trello.com/c/vqYH3R2Z) | Preserve contributor credit preferences across edits | F3 | Michael: model; Reese: application | An edit currently replaces display_submitter_name and public credit uses created_by only. Define cumulative credit and each person's opt-in, then prevent one contributor's edit from replacing another's choice. Preserve Issue 17's completed original feature. |
| [T41](https://trello.com/c/LI10JpcC) | Define rescind and inactivity handling for submissions | F3 | Reese; Michael for model changes | Keep existing pending approve/reject/revision and owner withdrawal. Define rescind, the inactivity interval, and whether the request concerns submissions or published Entries before implementing additional actions. Acceptance: agreed transitions and permissions, then verified behaviour; no arbitrary deletion policy. |
| [T42](https://trello.com/c/dfKkGHWl) | Support circa qualifiers on Marking and Cover dates | F3 | Michael: model; Reese: controls | Store approximation separately from missing date components and offer the requested Circa control. Acceptance: qualifier survives submission, review, retrieval, and display for both Entry types without inventing date precision. |
| [T43](https://trello.com/c/h55E9wFA) | Add captions to image upload forms | F5 | Reese | Expose editable per-image captions on Marking and Cover submission forms. Reuse Image.image_description unless a concrete distinction requires otherwise. Acceptance: caption persists and is available on image display after review. |
| [T44](https://trello.com/c/rkYy8Yqd) | Copy an existing Entry into a new submission | F3 | Reese | Start a new Marking or Cover submission prefilled from an existing Entry so Contributors change only the differences. Define which images, citations, and relationships copy. Acceptance: new submission never updates the source Entry or inherits approval/identity. |
| [T45](https://trello.com/c/9MUNA89m) | Add staff admin shortcut and review legacy admin items | F7 | Reese; Michael for model/data implications | Add Django admin navigation gated by is_staff. Review the deprecated Postcover registration before hiding/removing it; retain required access and data. Acceptance: shortcut follows staff permission and only confirmed obsolete admin items are removed. |
| [T46](https://trello.com/c/evcIZUrt) | Generate a current state Editor listing for Help | F9 | Reese | Regenerate the Help listing when confirmed Editor assignments change. Do not publish suggested appointments or private roster details. Acceptance: assignment changes update the listing and the publication allowlist exposes only the intended document. |
| [T47](https://trello.com/c/8AVh7K9r) | Report possible duplicate Markings in existing data | F11 | Michael | Scan state, town, type, shape, dimensions, color, and optionally dates. Define match rules; report candidate groups with record IDs and evidence. Matches do not authorize automatic merge/deletion. Coordinate matching with T48. |
| [T48](https://trello.com/c/gQ639Ld4) | Suggest similar Entries during new and edit submissions | F3 | Reese; Michael: matching/data | Check for similar Markings or Covers before new/edit submission. Coordinate criteria with T47; define warning versus blocking and exclude the Entry being edited. Acceptance: useful candidate previews without false claims of identity. |
| [T49](https://trello.com/c/bvNVhddr) | Verify catalog interpretation and illustrated Cover capture | F11 | Michael | Review cross-reference exclusion (SHIP 1808-60), See State date references, date inheritance/precision, star ownership, and ring ornament placement against source pages. Capture IL illustrated Covers at printed pages 66 and 79 with citations. Account for exclusions and uncertainty rather than inventing fields. Related: T19, T25, T26; no blind reimport. |
| [T50](https://trello.com/c/B25HULz7) | Remove added parent town text from child inscriptions | F11 | Michael | The munger prepends parent Townmark text to Ratemark/Auxmark inscription_txt. Remove only added text, preserving actual inscriptions. Identify affected source and target records, verify corrected output, and reconcile any data repair by site. |
| [T51](https://trello.com/c/os08ghUA) | Archive selected records before purge and sweep orphans | F10 | Michael | Extend existing purge/verification tools to dump selected records before deletion and identify orphan Citations/Images. Archive image bytes if deleting files. Acceptance: restorable archive is verified before erasure; dry-run reports scope. This is separate from S25/S26 application backup/restore. |
| [T52](https://trello.com/c/2djEMidu) | Preserve catalog sections within Collections | F7 | Michael: model/data; Reese: application | Represent each state's source section order and cited explanatory prose within its Collection. Preserve source structure during intake. This is not the deferred user comment workflow S42. Acceptance: one representative state retains section membership, order, and source prose. |
| [T53](https://trello.com/c/Q0KacWwW) | Compare sampled image colors and approximate Pantone matches | F5 | Michael: data/mapping; Reese: application | Use expected hex and sampled photo color for the first comparison, then approximate Pantone mapping. Existing Color storage is not a matching workflow. Define the Pantone reference and approximation method before implementation; distinguish this from deferred automatic predominant-color detection. |
| [T54](https://trello.com/c/GZp3g2kZ) | Decide how to represent Cover and strike condition | F11 | Michael | The ASCC header distinguishes Cover and strike condition; current models have no dedicated field. Decide whether and where to record it from evidence. This is a scope/model decision, not approval to invent grades from prices. |
| [T55](https://trello.com/c/8b8Xss1G) | Reconcile Michigan city by city before a verified rerun | F11 | Michael | Account for every Michigan source listing, including intentional exclusions, then rerun and verify corrected output on woco.dev. Record source version, target revision, omissions, duplicates, and acceptance; separate production promotion. Link existing T21/T22/T23/T24/T26 tails; Issue 7's historical pipeline completion stays done. |

## Existing work reused and implemented requests

- Basic exports use S5: individual Entry DOCX/PDF and list PDF/XLSX. Admin
  exports and operator backups do not satisfy that application requirement.
- Editor Reference Work creation uses S19. Include compact display with title
  first, first author plus et al., volume, edition, and publication date;
  preserve full authorship and do not split a single person's comma-containing
  name. Source-choice data checks remain Issue 13/T15.
- State rollout uses Issue 8/T13; VA/WV and VPHC checks retain Issues 1, 5, 6
  and Batch #25. Link MI completeness to existing MI tails rather than repeat
  their completed implementation.
- Has Covers is implemented in Search and `filter_has_covers`, with dedicated
  tests. Region already represents counties and dated PostOfficeRegion links.
  New uploads use region folders; older-file cleanup and draft relocation
  remain unverified, not assumed defects. No new implementation cards for these.

## Deferred offline wishes

All are Backlog and unassigned. Michael explicitly deferred this entire
section. These ideas are not evidence that a feature or audit once existed.

| Task | Wish | Scope |
| --- | --- | --- |
| [T56](https://trello.com/c/zwtdxlSz) | Detect predominant color from uploaded images | Suggest a Marking or Cover color from the image. Define the intended ink/material region so background pixels do not dominate. This is deferred; no implementation or method selected. |
| [T57](https://trello.com/c/aGwVExGE) | Convert known catalog text to fields and back | Parse hand-entered catalog text in a known format into fields and regenerate text from edits. Separate this interactive wish from existing offline extraction. |
| [T58](https://trello.com/c/MhF6jQex) | Separate catalog extraction into its own repository | Consider an extraction repository with catalog-specific branches; submodule is only a possibility. No repository split or branching scheme selected. |
| [T59](https://trello.com/c/kvaWqzCg) | Suggest atomic fields from free text | Suggest structured values from descriptions or snippets for human review. Distinct from known-format parsing; no AI provider selected. |
| [T60](https://trello.com/c/E6Wbp7yu) | Evaluate an extensible versioning layer for CoverCensus | Consider a dedicated layer such as Dolt instead of embedded Django revision logic. Dolt is a candidate, not a selected technology; define CoverCensus scope first. |
| [T61](https://trello.com/c/LXCEAOzU) | Audit licensing and fully free distribution compatibility | Audit licenses and dependencies and test a fully free distribution, with Trisquel proposed. This is a desired audit, not a completed finding or legal conclusion. |
| [T62](https://trello.com/c/kShMWNpf) | Personalize detail and search field display | Allow saved field ordering on detail pages and hide/show choices in search. Other profile customization is unspecified. |
| [T63](https://trello.com/c/GxfGUqS0) | Generate tracings and suggested details from original photos | Explore AI-generated tracings and recommended record details. Preserve originals and distinguish generated output from evidence; human review remains required. |
| T64 | Accept and process PDF, BMP, and RAW uploads | Convert supported files into a web-displayable catalogue image before storage. Define PDF page selection and supported RAW formats, preserve useful resolution metadata, enforce size and decode limits, and verify previews, thumbnails, cropping, moves, submission review, and final Entry display. Current uploads remain PNG and JPEG until this work is complete. |

Full report generation is retained under deferred S43 as broader scope to
define; it does not replace active S5 exports. Email distribution lists for
review are retained with S36 as a related deferred idea; routing and whether
email can perform review actions remain undecided.

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
| Dates Seen, Amelia no-date handling, and VA `(1)` rule for WV | Batch #25 | **To Do** - [T25](https://trello.com/c/nSiEkCYk), unassigned; Amelia parser fix in PR #71; remaining checks below |
| Decade dates: blank date and note | Batch #26 | **done** - PR #71 |
| Editor-only dates on new markings | Batch #27 | **done** - [PR #67](https://github.com/CoverCensus/worldcovers/pull/67) |
| Territory/state detail tags and search | Batch #28 | **done** - PR #59; broader alias policy remains Issue 31 |
| Institutional designation | Batch #29 | **Doing** - [T26](https://trello.com/c/S7ZsuqjL), Michael (`grubermeister`); code implemented in [PR #66](https://github.com/CoverCensus/worldcovers/pull/66) and current starred-listing import |
| Clear Filters at the top | Batch #30 | **done** - [PR #64](https://github.com/CoverCensus/worldcovers/pull/64) |
| Per-state notification and editor review | Batch #31 | **Doing** - [T27](https://trello.com/c/cq72B5NA), Michael (`grubermeister`); staging re-import reported in PR #71; invitations and acceptance still to confirm |
| MD: Anna/Polis backstamp | Batch #32 | **done** - PR #71 |
| MD: S/D notation in notes | Batch #33 | **done** - PR #71 |
| MD: Barry manuscript and congressional-frank note | Batch #34 | **done** - PR #71 |
| MD: Ann.MD and B M House source entries | Batch #35 | **Doing** - [T28](https://trello.com/c/UpnN07Yq), Michael (`grubermeister`); investigate source match and decide handling |
| MI: merge Adamsville date variants | Batch #36 | **done** - PR #71 |
| MI: institutional flag for leading-star listings | Batch #37 | **Doing** - [T26](https://trello.com/c/S7ZsuqjL), Michael (`grubermeister`); code implemented; remaining data checks below |
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

Status values: `Backlog`, `To Do`, `Doing`, `Testing`, and `Done`, as defined
above. Historical `done` entries retain their original wording. Where code is
complete but a data check or decision remains, the status names that remaining
action. Dependencies in this section refer to original Issues 1-34.

## Data & ingestion

### Issue 1 -- Fix WV data ingestion ("WV disconnect")
**Status:** Doing - [T7](https://trello.com/c/0zS0WvY1) - **Assigned:** Michael (`grubermeister`) - **Depends on:** none
The original feedback reported missing Martinsburg and Shepherdstown listings
and Ian's WV submissions. This is not a current absence finding. Identify the
source rows and target IDs on each intended site, then distinguish import
gaps, pending records, and search/filter behaviour before proposing a repair.
- [ ] Martinsburg, WV markings appear in listings
- [ ] Shepherdstown, WV markings appear in listings
- [ ] Ian's submitted markings are findable
- [ ] Root cause documented: import gap vs. query/filter bug

### Issue 2 -- Fix Richmond town-name normalization
**Status:** To Do - [T8](https://trello.com/c/YUs5t7yl) - **Assigned:** unassigned - **Depends on:** none
The original report described `Richmd, VA` display and Richmond search failures.
Current affected records have not been verified. Record the source row, target
Post Office, displayed name, and search result on the intended site. Correct
only a reproduced gap; do not assume the parser still has the reported defect.
- [ ] Records showing `Richmd` display as "Richmond"
- [ ] Searching "Richmond, VA" returns those markings

### Issue 3 -- Verify remaining Amelia rate errors in deployed data
**Status:** To Do - [T9](https://trello.com/c/TF3jpD2V) - **Assigned:** unassigned - **Depends on:** none - **Source:** Greg Stone
The unknown-date/size parser defect is fixed in
[PR #71](https://github.com/CoverCensus/worldcovers/pull/71), with targeted
coverage in `tools/tests/test_munger_field_classify.py`. Do not reimplement
that fix. The PR reports an MD/MI/FL/DE staging re-import, not a fresh audit
of all affected Virginia records.

- [x] Parser distinguishes an unknown-date/size placeholder from a real diameter or rate
- [ ] Verify Amelia and other affected VA records on the intended site
- [ ] If an error remains, record its source row and target ID, then decide whether a data repair or new parser fix is needed

### Issue 4 -- Marking-shape parsing: circle imported as straight-line (New Glasgow)
**Status:** Doing - [T10](https://trello.com/c/GgrdimJ1) - **Assigned:** Michael (`grubermeister`) - **Depends on:** none - **Source:** Greg Stone
Greg's original report described New Glasgow circles imported as straight-line
Markings. Compare source images/text with current target shape and display,
record site and record IDs, and repair only confirmed mismatches.
- [ ] New Glasgow imports with the correct circular shape
- [ ] Spot-check confirms catalog circles aren't imported as straight-line

### Issue 5 -- Import updated VA data from worldcovers.org
**Status:** To Do - [T11](https://trello.com/c/eU2o17lO) - **Assigned:** unassigned - **Depends on:** none
Reconcile the Virginia legacy-source snapshot with current WoCo records before
requesting another import. Record the source date, matching keys, target site,
counts, missing/extra records, and release disposition. The original request
does not establish that the current target is missing those records.
- [ ] VA records from worldcovers.org present in the new system
- [ ] Record counts reconcile between source and target

### Issue 6 -- Finish VPHC data reconciliation and editor acceptance
**Status:** To Do - [T12](https://trello.com/c/AqdYZttW) - **Assigned:** unassigned - **Depends on:** Issue 5 data reconciliation
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
Michael's September 19 request adds a city-by-city completeness audit and
rerun: account for every source listing, including intentional exclusions.
The earlier successful run does not establish completeness; see the later
follow-ups and current staging work under Issue 8.

### Issue 8 -- State rollout tracking
**Status:** Doing - [T13](https://trello.com/c/kWFoGpi3) - **Assigned:** Michael (`grubermeister`) - **Depends on:** none
Michael reported the following on 2026-09-19. The July rollout sequence is
historical. Production presence, data quality, and Editor acceptance are
separate results; these reports were not independently checked on either site.

| Stage | Sections / next work |
| --- | --- |
| Loaded into hellowoco.app production | WV, VA, MD, DE, FL, MI, AL, IL, DC, IA, NC, OH, CT, TN |
| Deleted from woco.dev after production load | MD, DE, AL, IL, DC, IA, OH, CT, TN |
| Still in staging | MI: known issues and completeness audit; WV: possibly missing VA entries; VA: verify VPHC additions; FL and NC: attempt OCR |
| Need staging load for initial review; suggested Editors exist | LA, VT, GA, RI, ME, NH, NJ, SC, TX, OK, HI, MS, CA, ND, NM, AZ, CO, UT, NE, MO, AR, NV, WI |
| Difficult and unloaded | NY, PA, MA, KY |
| Deferred until everything else is finished | AK, SD, IN, WA, OR, ID, WY, MT, KS, MN, XX |

Every current staging Entry also exists in production, per Michael; this
does not establish matching field values. XX is retained as supplied.
Suggested Editors are not confirmed appointments or permission assignments.
- [x] Record the current reported state groups
- [ ] Record source preparation, staging/production revisions, review, and acceptance as each section progresses
- [ ] Verify and correct the five retained staging sections
- [ ] Load review-ready sections following the per-state coordination requirement in Batch #31

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
**Status:** done; accepted under
[Trello S18](https://trello.com/c/erfGld8B/8-s18-attach-images-to-a-submission)
as of 2026-09-13.
The original Prospect Hill report is recorded as resolved in
[PR #57](https://github.com/CoverCensus/worldcovers/pull/57). Current
`frontend/src/pages/CoverEdit.tsx` has a Set as default control and preserves
gallery order. The old `SubmitImageDialog.tsx` was removed in PR #55.
Do not recreate it or repeat this implementation from the old checklist.
If the problem recurs, record the site, record ID, role, and exact steps.
This source review did not repeat the live Prospect Hill check.

## UI copy & forms

### Issue 12 -- Canonical submission-guidelines content block
**Status:** Testing - [T14](https://trello.com/c/O90RdMxz) - **Assigned:** Reese Ludwick - **Depends on:** none
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
**Status:** To Do - [T15](https://trello.com/c/v7KiOTHu) - **Assigned:** unassigned - **Depends on:** 12
- [x] Rename "Create Marking" -> **"Submit New Marking"**
- [x] Expose **ERD** (Earliest Recorded Date) and **LRD** (Latest Recorded Date) fields for state editors
- [ ] Verify Reference Work choices for **"ASCC Edition 5", "ASCC Edition 6", "VPHC Catalog 1st Edition"** on each intended site; record IDs/titles and repair only confirmed duplicates or omissions
- [x] Apply guidelines block (Issue 12)
- [x] Townmark field explains that it means the **EXACT** text on the marking
Progress note, 2026-07-03: page H1, state-editor ERD/LRD, centralized
guidelines, and exact-text help are implemented. The original duplicate-ASCC
report needs a current check. PR #57 reports ASCC edition availability at that
time, and PR #106 adds VPHC reference data; neither proves current choices.

### Issue 14 -- Submit Edit to Marking page updates
**Status:** To Do - [T16](https://trello.com/c/uyTgorOk) - **Assigned:** unassigned - **Depends on:** 12
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
The original Cover-only request was: "Would you like your
name to display as the submitter?" If yes -> show "Submitted by [name]" on the
Cover Details screen. Incentivizes uploads.
- [x] Yes/no acknowledgement checkbox on Submit New Cover
- [x] When yes: "Submitted by [name]" appears on Cover Details
- [x] When no: no submitter name shown
Current source also supports opt-in on Marking submissions and displays
the opted-in name on Marking details (`Contribute.tsx`, `RecordDetail.tsx`).
The original Cover feature remains done; cumulative credit and preference
overwriting on edits are separate September 19 follow-up work.
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
**Status:** To Do - [T17](https://trello.com/c/Vf3dOZAe) - **Assigned:** unassigned - **Depends on:** none - **Source:** Greg Stone
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
**Status:** To Do - [T18](https://trello.com/c/E8OcLZaT) - **Assigned:** unassigned - **Depends on:** none - related **[R7]**
**WARNING Board approval required before merge.**
Replace "Worldcovers" branding with **APMC**, add the U.S. Philatelic Classics
Society logo, and add Society website / "Become a member" links.
- [ ] "APMC" branding + Classics Society logo replace "Worldcovers"
- [ ] Society website + membership links present and correct
- [ ] Final branding/logo/links confirmed with the board before merge

### Issue 24 -- Per-state reference citations
**Status:** To Do - [T19](https://trello.com/c/FN102Dm0) - **Assigned:** unassigned - **Depends on:** 13
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
**Status:** To Do - [T20](https://trello.com/c/yEfLz6cC) - **Assigned:** unassigned - **Depends on:** none
[PR #84](https://github.com/CoverCensus/worldcovers/pull/84) added linking in
both directions from the detail pages. Editors and administrators can repeat
this action to associate one cover with several markings without uploading
it again. Ordinary contributors do not have that write permission.

Narrowed 2026-09-21: "Link Existing Cover" was removed from the marking detail
screen at Ian's request ("both of these are confusing and we need to come up
with a better method"). The cover detail screen keeps its "Link Existing
Marking" control, so linking still exists, but in one direction only. The open
decision below is unchanged.

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
**Status:** To Do - [T21](https://trello.com/c/ECYaM9WU) - **Assigned:** unassigned - **Depends on:** 7
The historical Michigan run reported territory suffixes in 173 of 837 Post
Office names, including `M.T`, `Mic.T`, and `Mich.Ty or M.T`, with fragmented
town names. Those counts are not a current census. Confirm source rows,
current target records, and Michael's handling decision before changing or
re-running data. Removing suffixes is a proposed remedy, not a verified fix.

### Issue 29 -- `#N` office numbers: Port Lawrence #1 / #2 (2 real markings excluded)
**Status:** Doing - [T22](https://trello.com/c/VMnasWSJ) - **Assigned:** Michael (`grubermeister`) - **Depends on:** 7
The historical Michigan run reported a parser failure on `#` and provisionally
re-typed two Toledo-Strip listings (values 1000.00 / 1250.00) from LISTING to
META in scratch data. Locate those source listings and current target records
before asserting that they remain excluded. Michael must confirm literal `#`
or `NO. N` handling; repair only a verified omission or parsing defect.

### Issue 30 -- Bless `regions.csv` territory rows into canonical data + DB
**Status:** Doing - [T23](https://trello.com/c/u5qtEgAp) - **Assigned:** Michael (`grubermeister`) - **Depends on:** 7
The historical proposal recorded these scratch rows in
`tools/wip/in/regions.csv`; their IDs and copy status are not current evidence:

| id | name | tier | parent | established | defunct |
|---|---|---|---|---|---|
| 59 | Michigan Territory | TERRITORY | 1 (USA) | 1805-06-30 | 1837-01-26 |
| 60 | Indiana Territory | TERRITORY | 1 (USA) | 1800-07-04 | 1816-12-11 |

The original note reported date checks against Wikipedia and the Indiana
Historical Bureau. Identify current canonical rows and target IDs, verify the
dates and boundary convention against source evidence, and obtain Michael's
decision on names and abbreviations. Do not assume the canonical files or
database remain untouched. Avoid state-abbreviation collisions and do not
recreate missing scratch files merely to satisfy this historical reference.

### Issue 31 -- Territory search/UI surfacing
**Status:** To Do - [T24](https://trello.com/c/2GkfHBtv) - **Assigned:** unassigned - **Depends on:** 7 - related **25, [R5]**, M2
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

# Open decisions

The contacts below come from the original feedback. They identify who was
asked for a decision, not the current task assignee. Only T22 and T23 in this
table are Doing and assigned to Michael; the other tasks are To Do and
unassigned as of 2026-09-13.

| Original issue | Decision | Original decision contact | Current task |
|---|---|---|---|
| Issue 14 | Confirm the "year-and-month" date-format code (source listed YMDD twice) | Ian | T16 |
| Issue 23 | APMC branding / logo / Society links sign-off | Board | T18 |
| Issue 26 | Allow ordinary contributors to link existing covers and markings? | Project team | T20 |
| Issue 28 | Strip territory suffixes in `parse_head`? | Michael | T21 |
| Issue 29 | `#N` office-name handling (allow `#` or `NO. N`) | Michael | T22 |
| Issue 30 | Bless territory region rows into canonical `regions.csv` + DB; territory abbrevs | Michael | T23 |
| Issue 31 | Territory search behavior (parent under successor state?) | Michael | T24 |

---

# Out of scope / non-engineering follow-ups

- **Hosting cost** -- Bob / Eric Stone meeting on APMC hosting (Website ~$975/qtr, Chronicle ~$465/qtr); Eric asked for a load/cost recommendation. Business decision.
- **Billing/naming** -- confirm "Covercensus" == "Worldcovers" for tax/billing (pending Michael).
- **ASCC data-model doc** -- reference only (Google Doc linked in `06-09-emails.md` -> "ASCC database" thread).
- **IanThom.org / ChinaOverprints / account admin / Jay Logan transition** -- separate, lower-precedence track. Not tracked here.

---

# Feature implementation surfaces (reviewed 2026-09-13)

Where each `docs/devel/design.md` feature (F1-F13) is implemented today.
The design doc is pure spec and points here for status. Implementation evidence
comes from the September 13 review and later notes below; story status matches
the live board checked on September 19. To Do can include further work on an implemented
capability. Routes are registered in `frontend/src/App.tsx`; re-verify against
that file when updating this table.

| Feature | Where implemented | Status |
|---------|-------------------|--------------|
| F1 Authentication | SPA (`/auth`, `/reset-password`) | Done: S1 |
| F2 Collection Discovery | SPA (`/`, `/search`, `/record/:id`, `/covers/:coverId`); S5 document exports not found | Done: S2, S3, S4, S41; To Do: S5 |
| F3 Submission Workflow | SPA contribution and editor review flows, including bulk approval/rejection (see notes below) | Done: S6-S11, S13-S15; Testing: S12; To Do: S35 |
| F4 Comment Workflow | Deferred: standalone Entry comments; existing notes to the Editor are part of Submissions | Backlog: S16, S17 |
| F5 Image Attachments | SPA (image upload inside contribution forms) | Done: S18 |
| F6 Reference Work Management | Editor/admin add/edit through `/api/v2/reference-works/` and Django `/admin/`; the SPA has citation lookup but no management UI | To Do: S19 |
| F7 Collection Administration | SPA `/admin/collections` (superuser only) + Django `/admin/` | Done: S21; Backlog: S20 |
| F8 Audit Trail | SPA submission transactions and editor/admin record-history views; django-reversion history in Django `/admin/` | Done: S22; To Do: S23 |
| F9 Documentation & Help | SPA (`/help`, `/help/:docSlug`); articles authored as repo Markdown | Testing: S24, S34; To Do: S33 |
| F10 System Maintenance | Operator CLI and deployment workflows -- see `docs/devel/RUNBOOK.md`; no application interface | Testing: S27; To Do: S25, S26 |
| F11 Catalog Data Pipeline | Offline tooling -- see `docs/devel/TOOLS.md` and `docs/devel/PIPELINE.md` | Done: S28-S32; separate data tasks remain open |
| F12 Engineering | Shared developer docs, test coverage, accessibility, performance, and dependency checks | To Do: T1, T4-T6; Backlog: T2, T29, T61 |
| F13 Project Administration | Design, branding approval, and board governance | Done: S0 and board setup; To Do: T18; Trello Policy is in README |

The deferred stories are S16, S17, S20, S36-S40, and S42-S49. S0 (design) and board setup
are also Done; they are not user-facing features in the design's S1-S49 map.

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
- **F4**: Michael deferred the standalone comment-on-Entry flow on 2026-09-19.
  What exists today is the Contributor's
  comment-to-Editor, carried inside the submission payload and shown on
  `/contribution/:id`.
- **F9**: The help API reads repo Markdown. FAQ entries have a read-only API
  and Django admin editing support. No general article-editing screen exists
  in the SPA. S34 is in Testing under Michael for review of the authoring
  workflow. Acceptance must cover adding/editing an article, publication,
  correct public rendering, and keeping internal material out of Help.
  PR #145 is merged at `338bc657` and implements the publication allowlist.
  Deployment and acceptance were not checked in the September 19 source review.
- **F10**: Michael confirmed on 2026-09-19 that S27 requires operator tools
  and stays in Testing under Michael and Jay. Verify the deployment steps
  and record the target site, revision, result, and acceptance. An application
  update interface is not required. S25 and S26 remain To Do for application
  backup and restore.
