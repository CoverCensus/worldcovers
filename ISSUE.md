# WorldCovers / APMC -- Open Work

This file lists work that is not finished. Nothing else belongs here.

## Rules For This File

1. One row per open item. A row says what remains and when it is done.
2. When an item is accepted, delete its row. Do not leave a closure note.
3. Do not record dated review logs, commit hashes, test counts, deploy
   results, or who did what. Git history and the Trello card hold those.
4. A lasting rule that came out of finished work goes in
   [DECISIONS.md](DECISIONS.md), not here.
5. Keep original numbers (Issue N, Batch #N, T-number, S-number). Gaps in
   the numbering are expected.
6. Do not name individual developers. Trello holds card membership.

[Trello](https://trello.com/b/HDC2qwhi/worldcovers) is the source of truth
for the State column. If a State here differs from the card, the card is
right; correct this file.

Scope: WorldCovers / APMC only.

## Terms Used In The Tables

State values:

- Backlog: deferred. Not being worked on.
- To Do: active, not started.
- Doing: underway.
- Testing: built; a check or acceptance remains.
- Not recorded: this file has no State for the item. Read the card.

Other terms:

- Hosted check: verify the behavior on `woco.dev` (staging), then on
  `hellowoco.app` (production). Record site, revision, and result on the
  Trello card.
- Acceptance: the requester confirms the result. The card moves from
  Testing to Done, and the row is deleted from this file.
- A merge, a deploy, or a passing test is not acceptance.

Identifiers:

| Form | Meaning |
|---|---|
| S1-S49 | Story in [design.md](docs/devel/design.md#stories) |
| F1-F13 | Feature in [design.md](docs/devel/design.md#features) |
| T-number | Trello card |
| Issue N | Original beta-feedback issue, numbered 1-34 |
| Batch #N | Item from the MD/MI Editor review batch |
| PR #N | GitHub pull request |

Paths under `tools/wip/`, `backups/`, and `.codex/` are local and ignored by
Git. They can be absent from a checkout. Do not recreate them to satisfy a
reference.

## Feature Implementation Surfaces

Where each feature in [design.md](docs/devel/design.md#features) is
implemented. SPA routes are registered in `frontend/src/App.tsx`.

| Feature | Where implemented |
|---|---|
| F1 Authentication | SPA `/auth`, `/verify-email`, `/reset-password`; django-allauth under `/accounts/`; `backend/common/api/account.py` |
| F2 Collection Discovery | SPA `/`, `/search`, `/record/:id`, `/covers/:coverId`. S5 document exports are not built. |
| F3 Submission Workflow | SPA `/contribute`, `/edit/:id`, `/contribution/:id`, `/dashboard` (single and bulk review). Django `/admin/` has secondary bulk actions. |
| F4 Comment Workflow | Not built (Backlog). A Contributor's note to the Editor travels inside a Submission and is part of F3. |
| F5 Image Attachments | SPA image upload, crop, and rotate inside the submission forms and Entry detail pages. |
| F6 Reference Work Management | SPA `/reference-works`; API `/api/v2/reference-works/`; Django `/admin/`. No delete in the application. |
| F7 Collection Administration | SPA `/admin/collections` (superuser only) and `/editors` (Editor roster); Django `/admin/`. |
| F8 Audit Trail | SPA Record History on Marking and Cover detail pages, with version restore. Full django-reversion history is in Django `/admin/`. |
| F9 Documentation & Help | SPA `/help`, `/help/:docSlug`. Articles are allowlisted repo Markdown. FAQ entries are edited in Django `/admin/`. The SPA has no article editor. |
| F10 System Maintenance | Operator CLI only; see [RUNBOOK.md](docs/devel/RUNBOOK.md). No application screen. |
| F11 Catalog Data Pipeline | Offline tools; see [TOOLS.md](docs/devel/TOOLS.md) and [PIPELINE.md](docs/devel/PIPELINE.md). |
| F12 Engineering | Developer docs, tests, and dependency checks. |
| F13 Project Administration | Design, branding approval, and Trello board governance. |

Deferred stories are listed under
[Backlog Stories](docs/devel/design.md#backlog-stories) in design.md and are
not repeated here.

## F1 Authentication

| ID | Open work | State | Done when |
|---|---|---|---|
| [T30](https://trello.com/c/wDojGejL) | Repair the production mail sender and relay. | To Do | A message sent by production reaches an authorized test recipient. |
| [T84](https://trello.com/c/smLXK7tJ) | Roll verified-email Contributor signup out to production. Follow the rollout steps in DECISIONS.md, "Verify New Contributor Accounts With Allauth". Depends on T30. | Testing | Signup, email verification, login, and password change pass on `hellowoco.app`; acceptance. |

## F2 Collection Discovery

| ID | Open work | State | Done when |
|---|---|---|---|
| S5 | Build exports: one Entry as DOCX or PDF; a list of Entries as PDF or XLSX. Admin exports and operator backups do not count. | To Do | A Contributor can download all four formats from the SPA. |
| [T78](https://trello.com/c/dCdskX07) | Hosted check that public Entry list, detail, and nested responses expose no email, account flags, or nested user objects, for Guest and Contributor reads. | Testing | Check passes on production; acceptance. |
| [T78](https://trello.com/c/dCdskX07) | Decide whether public `CoverMarking.reviewer_username` and integer audit IDs on lookup responses may stay public. | Testing | Decision recorded in DECISIONS.md. |
| [T82](https://trello.com/c/aX5MzTQA) | Hosted visual check of Color text shown in its stored hex value in Catalog Search and Marking detail. | Testing | Acceptance. |
| [T83](https://trello.com/c/F5gzAlhh) | Hosted check that Catalog Search and both Dashboard tabs default to 25 rows and keep an explicit choice in the URL. | Testing | Acceptance. |
| [T95](https://trello.com/c/FXv46Rqx) | Hosted check of list-position return and Previous/Next on the Marking page. | Doing | Check passes on both sites. |
| [T95](https://trello.com/c/FXv46Rqx) | Decide whether the Cover page gets Previous/Next. | Doing | Decision recorded on the card. |
| Issue 31 / [T24](https://trello.com/c/2GkfHBtv) | Decide whether a Territory Region also parents under, or aliases to, its successor state for search. Today `region=MI` does not return Michigan Territory Markings. Region filtering is per Post Office, not per Marking. | Doing | Decision recorded in DECISIONS.md, "Account For Historical Regions In Search". |
| (no card) | Hosted check that Manuscript Markings hide Shape and Dimensions in search results, and that Manuscripts: Only clears those filters. | Not recorded | Check passes on both sites, or a card is opened. |

## F3 Submission Workflow

| ID | Open work | State | Done when |
|---|---|---|---|
| Issue 13 / [T15](https://trello.com/c/v7KiOTHu) | On each site, verify the Reference Work choices "ASCC Edition 5", "ASCC Edition 6", and "VPHC Catalog 1st Edition" in the Reference Works list and in the Marking and Cover form selectors, including saving a Citation. Repair only confirmed duplicates or omissions. | To Do | IDs and titles recorded on the card for both sites. |
| Issue 14 / [T16](https://trello.com/c/uyTgorOk) | Get the requester's answer on the "year-and-month" date-format code. The original request listed YMDD twice. | To Do | Answer recorded; glossary Date Format Codes updated if it changes. |
| [T32](https://trello.com/c/VkbZnDZ1) | Hosted check of Catalog Marking code and Catalog Cover code labels and Entry-specific error messages. | Testing | Acceptance. |
| [T32](https://trello.com/c/VkbZnDZ1) | As an Editor, open `https://hellowoco.app/contribution/91` and confirm its Entry kind label is correct. Old payloads without `submission_kind` use a heuristic. | Testing | Label confirmed, or the mismatch is repaired. |
| [T34](https://trello.com/c/L5tx4C7m) | Hosted check of the image upload warning that suggests creating a Cover. | Testing | Acceptance. |
| [T37](https://trello.com/c/u1f8iyjw) | Hosted check of Create cover from this image. Use `https://hellowoco.app/record/21032` and a safe staging equivalent. Confirm that removing the image from the Marking on approval, not on submission, meets the request. | Testing | Acceptance. |
| [T37](https://trello.com/c/u1f8iyjw) | Decide draft, Return, Reject, and parent/child behavior for a Marking submitted together with its Cover. | Testing | Decisions added to DECISIONS.md, "Submit A Marking And Its Cover Together, Approve Each". |
| [T39](https://trello.com/c/YtcnoRop) | Acceptance of the side-by-side current and proposed values on Submission review. | Testing | An Editor can tell changed from unchanged values before deciding. |
| [T40](https://trello.com/c/vqYH3R2Z) | Hosted check that only the original Contributor can change their public-name choice. | Testing | Acceptance. |
| [T40](https://trello.com/c/vqYH3R2Z) | Decide cumulative credit for later editors and how each person opts in. | Testing | Decision recorded in DECISIONS.md. |
| [T41](https://trello.com/c/LI10JpcC) | Define rescind, the inactivity interval, and whether the request concerns Submissions or published Entries. No new action before that. | Not recorded | Agreed transitions and permissions are written down. |
| [T42](https://trello.com/c/dfKkGHWl) | Add a Circa qualifier for Marking and Cover dates. Store approximation separately from missing date parts. Needs a model change. | To Do | The qualifier survives submission, review, retrieval, and display for both Entry types. |
| [T44](https://trello.com/c/rkYy8Yqd) | Acceptance of starting a new Submission prefilled from an existing Entry. | Testing | Acceptance. |
| [T48](https://trello.com/c/gQ639Ld4) | Browser check on each site of the "Similar existing Markings" and "Similar existing Covers" panels. | Testing | Acceptance. |
| [T68](https://trello.com/c/Y2SycFtn) | Email assigned Editors about pending Submissions. First decide: manual send, one email per Submission, or a digest. Depends on T30. | To Do | Active Editors assigned to the Collection receive a link to the correct site's review queue; drafts and completed reviews are excluded; no duplicate sends. |
| [T70](https://trello.com/c/u6OfTiMR) | Hosted check on `woco.dev` of County selection on the Marking forms through draft, review, and approval. | Testing | Acceptance. |
| [T70](https://trello.com/c/u6OfTiMR) | The Post Office page shows only the state. Decide whether it should show the County. | Testing | Decision recorded on the card. |
| [T71](https://trello.com/c/By0kwVmn) | Hosted check of manual Postmaster entry from the Post Office page. | Testing | Acceptance. |
| [T72](https://trello.com/c/FOS1WZHa) | Hosted check: select two Reference Works with details, carry them through draft, submit, review, and approval; then clear them explicitly. | Testing | Acceptance. |
| [T88](https://trello.com/c/A6WuUara) | Hosted check that a Cover edit without a date keeps the current date. | Doing | Check passes on both sites. |
| [T89](https://trello.com/c/DrMz2Wnj) | Hosted check of Dates Seen on the new and edit Marking forms: placement, range visibility, draft persistence, approval, and permissions. | Doing | Check passes on both sites. |
| [T93](https://trello.com/c/obBYLbrF) | Find which site holds Contribution 4339 and verify its review page there. Repeat the combined Marking-plus-Cover workflow with images on the deployed revision. | Testing | Both checks recorded on the card. |
| [T96](https://trello.com/c/PTNeonZ9) | Hosted check of Dashboard submission counts. | Testing | Acceptance. |
| [T97](https://trello.com/c/NOY0Ws2m) | Hosted check that a Submission's title and status Badge open the review page. | Doing | Check passes on both sites. |
| S35 | Verify bulk approval. Known limit: the unknown-field safeguard that disables Approve on the single review page does not apply to bulk review. | Doing | Acceptance. |

## F5 Image Attachments

| ID | Open work | State | Done when |
|---|---|---|---|
| [T33](https://trello.com/c/9XzQrOLb) | Check the two-row thumbnail action layout on desktop and narrow screens. | Testing | Acceptance. |
| [T35](https://trello.com/c/8GLvhowq) | Check that galleries and Marking previews refresh after an image move, including failure feedback. | Testing | Acceptance. |
| [T43](https://trello.com/c/h55E9wFA) | Acceptance of per-image captions on the submission forms. | Testing | A caption persists and shows after review. |
| T66 | Browser check of free-angle rotation: saved orientation, original kept, thumbnails, metadata, permissions, later crops. | Testing | Acceptance. |
| [T73](https://trello.com/c/wgtwKkWr) | Hosted check that an Editor cannot change images outside assigned Collections through direct API calls, and that allowed writes and moves still work. Check file retention and image order after a move. | Testing | Acceptance. |
| [T87](https://trello.com/c/zYso8noz) | Acceptance of caption editing on saved images. | Testing | Acceptance. |
| [T92](https://trello.com/c/GRCAFvqL) | Hosted check of the Cover draft offered from a whole-cover upload during a Marking edit. Known limit: an image already saved with an edit draft gets no offer on resume. | Testing | Acceptance. |

## F6 Reference Work Management

| ID | Open work | State | Done when |
|---|---|---|---|
| S19 | Browser check of `/reference-works` on each site, once as an Editor and once as a Contributor. | Testing | Acceptance. |

## F7 Collection Administration

| ID | Open work | State | Done when |
|---|---|---|---|
| [T45](https://trello.com/c/9MUNA89m) | Browser check of the staff Admin Panel shortcut and the superuser-only links to Django admin change forms. | Testing | Acceptance. |
| [T45](https://trello.com/c/9MUNA89m) | Review the deprecated `Postcover` admin registration before hiding or removing it. | Testing | Decision recorded on the card. |
| [T52](https://trello.com/c/2djEMidu) | Represent each state's catalog section order and cited explanatory prose within its Collection. | Backlog | One representative state keeps section membership, order, and source prose. |

## F8 Audit Trail

| ID | Open work | State | Done when |
|---|---|---|---|
| S23 | Acceptance of Entry history viewing. | Doing | Acceptance. |
| [T74](https://trello.com/c/eX68bPRW) | On `woco.dev`, then `hellowoco.app`: as an Editor, restore an older version from Record History and confirm a "Restored version" event appears. Confirm an anonymous `GET /api/v2/markings/<id>/restore-preview/?version_no=1` returns 401 or 403. | Testing | Acceptance. |
| (no card) | Version restore offers only the 10 history events shown; add a picker for older versions. Snapshots do not record `is_tracing`. | Not recorded | A card is opened or the limits are accepted. |

## F9 Documentation & Help

| ID | Open work | State | Done when |
|---|---|---|---|
| S24 | Acceptance of the public Help library, glossary, and FAQ. | Testing | Acceptance. |
| [S33](https://trello.com/c/9TH4dywm) | Add field help to the Search page filters. Both submission forms are done. | Testing | Search filters have keyboard-accessible help; acceptance. |
| S34 | Acceptance of the article authoring workflow: add or edit an article, publish it, confirm public rendering, confirm internal docs stay unpublished. | Testing | Acceptance. |
| [T69](https://trello.com/c/BAU8GBYS) | Answer the open rights questions listed under "Not yet confirmed" in [rights-and-attribution.md](docs/rights-and-attribution.md): CC BY 4.0 coverage of catalog-derived listings, reuse of source text and page images, per-image creator and rights records, credit for later editors. | Testing | Answers recorded; the article section is updated; acceptance. |
| [T91](https://trello.com/c/Ffca8oa3) | Acceptance of the IanThom Foundation funding line in Acknowledgements. | Testing | Acceptance. |
| [T100](https://trello.com/c/vJVVYwI7) | Capture the Getting Started screenshots listed in [getting-started-screenshots.md](docs/devel/getting-started-screenshots.md); hosted check; wording acceptance. | Doing | Acceptance. |
| [T101](https://trello.com/c/6HTpRHmn) | Add a measurement guide to Help: ruler overlay for slanted rate marks and CDS. | To Do | Article published and allowlisted. |

## F10 System Maintenance

| ID | Open work | State | Done when |
|---|---|---|---|
| S25 | Back up the database through the application. Operator scripts do not count. | To Do | An Administrator can start a backup from the SPA. |
| S26 | Restore from a backup through the application. Operator scripts do not count. | To Do | An Administrator can start a restore from the SPA. |
| S27 | Verify the manual deploy steps in [DEPLOY.md](docs/devel/DEPLOY.md#deploy-flow). | Testing | Target site, revision, and result recorded on the card; acceptance. |
| [T51](https://trello.com/c/os08ghUA) | Operator dry-run of `purge_recycle_bin` and `verify_media_integrity` on each site. | Testing | Acceptance. |
| [T51](https://trello.com/c/os08ghUA) | Decide whether to add an orphan-file sweep. Files on disk are never deleted today. | Testing | Decision recorded in DECISIONS.md, "Archive Before A Permanent Purge". |

## F11 Catalog Data Pipeline

### Data Corrections

| ID | Open work | State | Done when |
|---|---|---|---|
| Issue 1 / [T7](https://trello.com/c/0zS0WvY1) | Find the source rows and target IDs for Martinsburg and Shepherdstown, WV, and for the requester's WV Submissions, on each site. Classify each gap as import gap, pending record, or search behavior before any repair. | To Do | Both towns' Markings and the Submissions are findable; root cause recorded. |
| Issue 2 / [T8](https://trello.com/c/YUs5t7yl) | Ask the feedback contacts to confirm that production Markings 23010 and 23011 (`RICHMD.VA.`, Post Office RICHMOND) answer the Richmond complaint. | Testing | Confirmation recorded. |
| Issue 3 / [T9](https://trello.com/c/TF3jpD2V) | Staging has no Virginia Markings, so the Amelia rate check ran on production only. Verify on staging when Virginia data is there, or accept production-only scope. | Testing | One of the two is recorded on the card. |
| Issue 4 / [T10](https://trello.com/c/GgrdimJ1) | Same staging gap as Issue 3, for the New Glasgow Shape check. | Testing | One of the two is recorded on the card. |
| Issue 5 / [T11](https://trello.com/c/eU2o17lO) | Reconcile the Virginia legacy snapshot from worldcovers.org with current records. Record source date, matching keys, target site, counts, and missing or extra records. No import before that. | Doing | Record counts reconcile between source and target. |
| Issue 6 / [T12](https://trello.com/c/AqdYZttW) | Reconcile remaining VPHC source rows, skips, duplicates, and pending Submissions. Depends on Issue 5. | Doing | Target-site coverage confirmed; Editor acceptance. |
| Issue 19 / [T17](https://trello.com/c/Vf3dOZAe) | Show a plain rate ("5") differently from a rate in a circle. | Testing | Cumberland and Curdsville display their correct rate styling. |
| Issue 24 / [T19](https://trello.com/c/FN102Dm0) | Acceptance of the production source-Citation pass and the Massachusetts BPM2 Citation pass. Staging was not audited. | Testing | Acceptance. |
| Issue 30 / [T23](https://trello.com/c/u5qtEgAp) | Add Michigan Territory (1805-06-30 to 1837-01-26) and Indiana Territory (1800-07-04 to 1816-12-11) as canonical TERRITORY Regions under USA. Verify the dates against source evidence. Decide names and abbreviations; avoid state-abbreviation collisions. | To Do | Rows exist in the canonical region data and the database. |
| [T47](https://trello.com/c/8AVh7K9r) | Run `./woco report_duplicate_markings` on each site. Matches do not authorize a merge or deletion. | Testing | Counts and revision recorded on the card; acceptance. |
| [T49](https://trello.com/c/bvNVhddr) | Check against source pages: cross-reference exclusion (SHIP 1808-60), See State date references, date inheritance and precision, star ownership, ring ornament placement. Trace the second-line latest date for `https://hellowoco.app/record/30841` (HUNTSVILLE, M.T.) through extraction, parsing, import, and date aggregation. Capture the IL illustrated Covers at printed pages 66 and 79 with Citations. No blind reimport. | Doing | Each point has a recorded finding and, where confirmed, a repair on both sites. |
| [T50](https://trello.com/c/B25HULz7) | Final check that child inscriptions no longer carry added parent town text. Do not rerun `repair_ascc_child_inscriptions`. | Testing | Acceptance. |
| [T77](https://trello.com/c/lGfEJzSw) | Production record 30876 shows `rough C`; an earlier report said `rough c`. Compare source, import text, and record history. | Testing | Cause and correction recorded, or the evidence gap is stated. |
| Batch #25 / [T25](https://trello.com/c/nSiEkCYk) | Acceptance: Dates Seen, Amelia no-date handling, VA `(1)` rule for WV. | Testing | Acceptance. |
| Batch #29, #37 / [T26](https://trello.com/c/S7ZsuqjL) | Acceptance: institutional designation, including the MI leading-star listings. | Testing | Acceptance. |
| Batch #31 / [T27](https://trello.com/c/cq72B5NA) | Acceptance: per-state notification and Editor review. | Testing | Acceptance. |
| Batch #35 / [T28](https://trello.com/c/UpnN07Yq) | Acceptance: MD Ann.MD and B M House source entries. | Testing | Acceptance. |

### State Rollout

Issue 8 / [T13](https://trello.com/c/kWFoGpi3). State: Doing.

Last recorded state groups. Staging and production do not hold the same
records. Check the site before acting on a row.

| Stage | States |
|---|---|
| In production (`hellowoco.app`) | WV, VA, MD, DE, FL, AL, IL, DC, IA, NC, OH, CT, TN, MI, HI |
| On staging (`woco.dev`), not yet in production | MA |
| Need a staging load for first review | LA, VT, GA, RI, ME, NH, NJ, SC, TX, OK, MS, CA, ND, NM, AZ, CO, UT, NE, MO, AR, NV, WI |
| Difficult, not loaded | NY, PA, KY |
| Deferred until the rest is finished | AK, SD, IN, WA, OR, ID, WY, MT, KS, MN, XX |

XX is kept as supplied in the source list; its meaning is not recorded.

Open rollout work:

| Item | Open work | Done when |
|---|---|---|
| Florida (FPHC2) | The FPHC2 package (1,036 Marking listings, 786 Covers) is imported locally only. The local Florida Editor queue holds 16 Submissions for review. Hand off to a hosted site. Guide: [TOOLS.md](docs/devel/TOOLS.md#build-and-import-the-fphc2-bundle). | Site and revision recorded; a Florida Editor can open the queue. |
| North Carolina | 106 county and city catalog PDFs exist in the local APMC source folder `NorthCarolina/`. Import and Editor review of that source are not started. The earlier NC load used the ASCC. | Import plan recorded. |
| West Virginia | Possible missing Virginia cross-listed entries. See Issue 1. | Issue 1 is done. |
| Virginia | Verify the VPHC additions. See Issue 6. | Issue 6 is done. |
| Each new state | Follow the per-state rule in DECISIONS.md, "Ask For A State's Notation Before Loading It". | Source preparation, staging and production revisions, review, and acceptance recorded on T13. |
| Editor assignments | Check that Collection assignments on each site are accurate. Suggested Editors are not appointments. | Assignments verified on both sites. |

### New Sources

| ID | Open work | State | Done when |
|---|---|---|---|
| British catalogs | Prepare a fork of the site for the British catalogs by 2026-12-01. Source: local archive `British County Catalogs.zip` (three PDFs, three workbooks, volumes 1-4). Acceptance criteria for that date are not defined. | Not recorded | Acceptance criteria written; then met. |
| [T85](https://trello.com/c/EEVZea3W) | Locate and scope ASCC Book 2 and Book 3. They are in the USPCS electronic library; sequencing, permission, and logistics are open. | To Do | Scope recorded on the card. |
| [T94](https://trello.com/c/3PutrcL0) | Scope the Maine Philatelic Society data import. | To Do | Scope recorded on the card. |
| [T58](https://trello.com/c/MhF6jQex) | Verify a clean install of the optional bodger checkout per [PIPELINE.md](docs/devel/PIPELINE.md#optional-bodger-setup). | Not recorded | Install verified; acceptance. |
| [T54](https://trello.com/c/GZp3g2kZ) | Decide whether and where to record Cover and strike condition. The ASCC header distinguishes them; the model has no field. Do not derive grades from prices. | Backlog | Decision recorded in DECISIONS.md. |

### Editorial Policy

[T86](https://trello.com/c/K5iHL6lw). State: To Do.

Record editorial policy decisions for State Editors. Decided so far:

- State Editors may extend listings past 1861.
- State Editors may use several manuscript listings, or one listing with
  dated images.

Other editorial questions are open on the card. Done when the decisions are
published for State Editors.

## F12 Engineering

| ID | Open work | State | Done when |
|---|---|---|---|
| [T1](https://trello.com/c/AvISZKlp) | Developer documentation review. | Doing | A new developer can set up, find open work, and make a first change from the docs alone. |
| [T2](https://trello.com/c/kXYAFWkw) | Accessibility and internationalization. | Backlog | Scope defined. |
| [T3](https://trello.com/c/R2QCv9o1) | Security configuration review. | To Do | Findings recorded and addressed. |
| [T4](https://trello.com/c/vawmAdKi) | Backend and tools test coverage. Check for regression tests on diameter filtering and on a migrated Editor revising or rejecting their own Submission. | To Do | Both cases have tests, or are shown to be covered. |
| [T5](https://trello.com/c/H7ydiAxO) | Frontend test coverage. | To Do | Scope defined and met. |
| [T6](https://trello.com/c/uIotrsGQ) | Accept a performance baseline. | To Do | Baseline accepted. |
| [T29](https://trello.com/c/p4BvgCcQ) | Long-soak and large-data load runs. | Backlog | Runs recorded. |
| [T90](https://trello.com/c/A3dTmufk) | Acceptance of the Django REST framework 3.18.3 upgrade. | Testing | Acceptance. |

## F13 Project Administration

| ID | Open work | State | Done when |
|---|---|---|---|
| Issue 23 / [T18](https://trello.com/c/E8OcLZaT) | The original request asked for a Society membership link; the latest card comment says none was requested. No membership link is present. Resolve which is right. | Doing | Decision recorded; acceptance. |
| [T98](https://trello.com/c/XBh5X1AK) | Hosted acceptance of APMC branding: Society logo and the name "APMC" on every screen. | Testing | Acceptance. |
| [T99](https://trello.com/c/SUDGkiF0) | Hosted acceptance of the "Support the APMC" donation block on the home page. | Testing | Acceptance. |
| [T102](https://trello.com/c/11AB0eZj) | Acceptance of the domain and hosting-path recommendation. No domain purchase, DNS change, or SSO work follows without a new decision. | Testing | Acceptance. |

## Deferred Wishes

Ideas only. None is designed or scheduled. State for all: Backlog.

| ID | Wish |
|---|---|
| [T53](https://trello.com/c/Q0KacWwW) | Compare sampled image colors with the expected hex, then with approximate Pantone matches. |
| [T56](https://trello.com/c/zwtdxlSz) | Suggest a Marking or Cover Color from an uploaded image. |
| [T57](https://trello.com/c/aGwVExGE) | Parse hand-entered catalog text in a known format into fields, and regenerate the text from edits. |
| [T59](https://trello.com/c/kvaWqzCg) | Suggest structured field values from free text for human review. |
| [T60](https://trello.com/c/E6Wbp7yu) | Evaluate a dedicated versioning layer (Dolt is one candidate). |
| [T61](https://trello.com/c/LXCEAOzU) | Audit licenses and test a fully free distribution. |
| [T62](https://trello.com/c/kShMWNpf) | Saved field ordering on detail pages; show and hide choices in search. |
| [T63](https://trello.com/c/GxfGUqS0) | Generate tracings and suggested details from original photos, with human review. |
| [T64](https://trello.com/c/pufJgNTJ) | Accept PDF, BMP, and RAW uploads. Uploads are PNG and JPEG only today. |

## Not Engineering Work

Listed so nobody opens a card for them here.

- Hosting cost recommendation for the APMC site: a business decision.
- Whether "Covercensus" and "Worldcovers" are the same entity for tax and
  billing: unanswered.
- IanThom.org and ChinaOverprints: a separate project. Not tracked here.
