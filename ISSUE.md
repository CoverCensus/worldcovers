# WorldCovers / APMC -- Consolidated Issues

This file tracks the original beta-feedback issues and the MD/MI review
batch, plus the reconciled September 19 offline-note follow-ups. It is not
the full current engineering queue. Completed work is archived in
[Trello](https://trello.com/b/HDC2qwhi/worldcovers) and Git history, not here.
Keep original issue numbers when removing completed entries. Later work also appears
in GitHub PRs and Reese's workspace-local `docs/issues.md`.

## Contributor email verification

Self-service Contributor signup and account repairs are implemented and
published on staging through `0c8fd52`. Michael approved signup on
2026-10-23. Editor selection and Collection assignments remain manual.
Existing accounts retain access without fabricated verification.

Hosted checks completed on `woco.dev` v1.9.4 on 2026-10-25 in the session
"Test staging editor onboarding":

- Signup, email verification, and Contributor login passed.
- The Contributor submitted Vermont Submission 9326 without approval access.
- After manual Editor assignment and a fresh login, Vermont approval created
  Marking 105553 (`APMC-VT-M0001`).
- Approval of New Hampshire Submission 9327 was denied; it remained pending.
- Password change, old-password rejection, and new-password login passed.
- Logout cleared both open tabs for the Contributor and Editor.

The check found review buttons visible outside the assigned Collection,
although the API correctly denied approval. Local commit `594075f` fixes
button visibility and code previews on Marking and Cover Submission pages
and sets VERSION to 1.9.6. All 680 frontend tests, type checking, and build
passed. That commit is not yet published or deployed.

Evidence: staging Marking 105553 and Submission 9327; browser evidence in
`/private/tmp/woco-onboarding-2026-10-25/`; regression tests in
`frontend/src/pages/ContributionDetail.permissions.test.tsx`.
No new account-verification task is needed. Preserve accepted S1 and the
separate scopes of [T30](https://trello.com/c/wDojGejL) and
[T84](https://trello.com/c/smLXK7tJ). These staging results do not assert a
production rollout.

For a later rollout, preserve the existing safeguards: back up auth data,
pause account creation while installing code with migration 0024, create
`account_rate_cache` before workers start, and apply the nginx access-log
change. Do not roll back to unguarded login after unverified accounts exist;
keep verification guards and disable signup while correcting a failure.
No rollout or account change is authorized by this status update.

## Review baseline (2026-10-25)

Reviewed current source, test evidence, previous sessions, and live Trello.
Published staging is `0c8fd522c27693872d8ceff105ae787c615bd73e`; published
main is `84105ec04d3030fe0831e6af57805d071d8a92de`. Local `staging` is at
`594075ffb3f80f749f088c5f1e903b85f498eebb`, the sole unpublished code commit.
October 18/19 changes below are published. No tests or live data operations
were rerun for this synchronization. Michael approved these corrections and
confirmed that Michigan is in production and all its checks are complete.

## Historical review baselines

The following revisions, publication states, and board states describe their
review dates. They are not the current baseline.

**Latest focused review before email signup:** 2026-10-19, checked Dates Seen and Manuscript
display/search changes against live Trello, including archived cards.
The October 19 notes below record implementation and remaining verification.
The October 18 cleanup and T8-T10 production reviews remain recorded below.

**Last full review:** 2026-10-17, clean published `staging` at
`972f3b7d24e2ae27874e52fc0b021f8b28affca0`, upstream `origin/staging`.
Published `main` is `09569e9df633330af2db92a4bf9bf164022d54c0`.
Checked source, relevant tests, recent PRs, deployment runs, and live Trello,
including archived cards. No application tests or hosted data audit was run.
Michael approved the documentation and board plan in this session.
Successful October 14 deployments: [staging](https://github.com/CoverCensus/worldcovers/actions/runs/38593965174)
and [production](https://github.com/CoverCensus/worldcovers/actions/runs/38606892315).
These results do not establish data coverage or stakeholder acceptance.
Production also has [8f0d1fd](https://github.com/CoverCensus/worldcovers/commit/8f0d1fd211ed3860839c3a54259d805f892e1334),
which keeps saved Submissions visible when Collection links are missing;
the same behavior is now present in staging. Preserve it in future promotions.

Previous review, 2026-10-08, focused on T40, T72, T73, and T78, starting from clean local
`staging` at `c0e09f3ecd1f9e21276da07c09f340924bdb3dd4`. The code and tests
support the implementation notes below. Reused this session's local checks:
483 backend tests ran with two skipped; all 428 frontend tests, type checking,
and the production build passed. Local browser checks covered Citation
save/resume/approval, image permissions, and public-name preferences.
No application tests were rerun for this documentation review. Published
staging was checked at `f60453e56cbed39e4893bbcb2213a782a214a606`;
PR #171 already published the core T78 fix. The approved October 8 board sync
updated all four card descriptions and added local validation evidence while
preserving prior history. T72/T73 are Testing under Michael for verification;
T40 remains To Do under Reese, and T78 remains Testing under Reese. Hosted
verification, data coverage, and acceptance remain separate; T78's dated
staging report is recorded below. The September board snapshot is preserved
as history.

Previous review, 2026-09-30: clean local `staging` at
`d58887850d124ac7f1b10d8611decfbb16c5807a`. Published staging is
`04414625a00295976b151a8d94e0db4fdd7fefb1`; published main is
`3ae3b6b533a3ac546d69d0178aa0a4fce520cb1b` (PR #168). Local commits
`ac1e294` (yearless date display) and `d588878` (linking) are
unpublished. Checked the affected code, documents, and live Trello; no
application tests, hosted data audit, or browser check was run in this sync.
Publication, deployment, data coverage, and acceptance remain separate.

Previous review, 2026-09-28: starting from clean local `staging` at
`9f342609fa573a7e3a4e11d5badd12c0dd269d39`. Published staging remains
`50a3a5f82db8f5f96e3117d1281de9f0840d750a`; published main is
`3010b2bca178fb7094ba0ec01ab807117194f5cc`. Local commits `084da79`
(admin shortcuts and prior doc reconciliation) and `9f34260` (Massachusetts
munger fixes) are unpublished. Checked current source, tests, affected
DECISIONS.md rules, and live Trello. Tests were inspected, not run; no hosted
data or browser audit was performed. Successful deployment runs record
[staging, September 27 UTC](https://github.com/CoverCensus/worldcovers/actions/runs/36285140402)
at `50a3a5f` and
[production, September 24 UTC](https://github.com/CoverCensus/worldcovers/actions/runs/36016499237)
at `3010b2b`. These workflow results do not establish data coverage or acceptance.

Previous review, 2026-09-27: `staging` at published
`50a3a5f82db8f5f96e3117d1281de9f0840d750a` (PR #167). Reconciled the pulled
ISSUE.md with live Trello, this session's plans, and the affected code/tests.
Preserved Reese's carried-image update. Existing local edits to DECISIONS.md,
README.md, and docs/glossary.md were left unchanged. Tests were inspected,
not run; no hosted data or browser checks were performed in this review.
Deployment reports, data checks, and acceptance remain separate evidence.

Previous review, 2026-09-21: `staged-20260921` at published
`33b41f5da58e1b9337edc490f1c87eff6c009728`. Compared current code and tests,
DECISIONS.md, recent PRs, and live Trello. Existing local ISSUE.md intake edits
were preserved. Tests were inspected, not run; a focused multipart-input
check confirmed the Citation loss tracked in T72. This review does not prove
deployment, data coverage, mail delivery, or Editor acceptance.

Previous review, 2026-09-19: local `staging` at `d3da460`. Committed application
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

## Current status (2026-10-25)

Live Trello and prior sessions were reconciled with current source evidence.
Michael confirmed the Michigan production rollout and checks complete:
T21, T22, and T55 are Done. T23 and T24 retain their separate territory-policy
and search scope. T25-T28 remain Testing for the completed MD/MI batch;
T19 remains Testing for the completed BPM2 pass.

T1, T11-T13, T18, T24, T49, T89, S23, and S35 are Doing. T39, T43,
T44, T47, T48, T51, T66, T69-T71, T74, T82-T84, T87, T90-T92, T96,
T98, T99, T102, S19, and S33 are Testing. Other current statuses are
recorded in their sections below. Existing assignments are preserved.

S16/S17, S20, and T52-T54 remain Backlog. S27 stays Testing for operator
tools. S39 is declined and Done; it is not deferred ratings work.

The September 27 session plan was T8's Richmond check, then T9's Amelia
rates and T10's New Glasgow shapes. Find source rows and target IDs first,
compare staging and production separately, and repair only confirmed
mismatches. Those were the September 28 review limits; later results follow.
For T8, Michael limited the October 18 acceptance target to production;
the verified results and remaining acceptance step are in Issue 2.
For T9, Michael confirmed the Amelia examples and moved the card to Testing
on October 18. Production verification passed; staging has no Virginia
Markings. The results and remaining staging coverage gap are in Issue 3.
For T10, Michael moved the card to Testing after the October 18 New Glasgow
production shape review. Results and the staging coverage gap are in Issue 4.
T15 remains To Do with Michael's assignment restored from the live card.

Current engineering responsibility: Michael owns data engineering, including
direct model adjustments. Reese owns other frontend/backend development.
Responsibility is distinct from a card assignment or a claim that work has
started. T32-T35 are Michael's explicit exception; split mixed work at the
model/data boundary rather than assigning it by directory alone.

Trello is the source for current card membership. T25 is Testing without a
member; this sync does not choose or change an owner. S23 (Entry history)
and S35 (bulk approval) are Doing; both are implemented and retain their
recorded verification and acceptance scope.

S33 and S34 are now active F9 requirements in the design. The feature table
below records story status separately from available code. Developer docs
([T1](https://trello.com/c/AvISZKlp)), security configuration
([T3](https://trello.com/c/R2QCv9o1)), backend/tool tests
([T4](https://trello.com/c/vawmAdKi)), frontend tests
([T5](https://trello.com/c/H7ydiAxO)), performance baseline review
([T6](https://trello.com/c/uIotrsGQ)), and production mail delivery
([T30](https://trello.com/c/wDojGejL)) remain open. T1 is Doing; T3-T6
and T30 are To Do. Existing suites and baseline
results remain implementation evidence. T6 also records the completed catalog
count and page-load repairs in published commit `2a8238d`. The October 24
session measured production read-only queries and local before/after results;
baseline acceptance remains on T6. Accessibility/internationalization
([T2](https://trello.com/c/kXYAFWkw)) and long-soak/large-data runs
([T29](https://trello.com/c/p4BvgCcQ)) remain in Backlog.

T4 also retains two dated coverage questions from the June 15 review: check
current regression coverage for diameter filtering and migrated-Editor
permissions to revise or reject their own submissions. That review found
no narrow tests; it does not establish the current test inventory.

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
the dataset; the remaining branding scope discrepancy is in Issue 23.
ASCC = the first catalog being digitized into APMC. USPCS = U.S. Philatelic
Classics Society (sponsor and first intended community). VPHC = Virginia Postal History Catalog.
v1 = the legacy ColdFusion/MSSQL system behind worldcovers.org (`worldcovers-v1/`).

---

# September 19 follow-ups

Source: Michael's offline-note intake and current-source review, 2026-09-19.
T numbers below are Trello tasks, not additions to the original Issue 1-34
numbering. These requirements extend existing features.

## September 21 email review

Michael requested this focused review and capture of remaining work. Baseline:
clean `staged-20260921` at published
`33b41f5da58e1b9337edc490f1c87eff6c009728`. This supplements the dated
September 19 review above. The later code review updates the current status
summary separately.

| Request | Current evidence | Remaining work |
| --- | --- | --- |
| Remove Move to another marking | Removed from `ThumbnailImageActions.tsx`. | No new implementation task. T33's instruction to preserve actions excludes this deliberately removed action. |
| Remove Link existing cover from Marking detail | Removed from `RecordDetail.tsx`. | Preserve this removal during T37 workflow work; do not restore the control. |
| Create cover from this image | Implemented: `RecordDetail.tsx` opens the ordinary Cover form; `CoverEdit.tsx` shows the existing image and sends its ID. `contribution_apply.py` moves the same Image row on approval, with no duplicate file or row. 2026-09-24: final Submit was rejected with "Add at least one cover image" because the image-required check counted only uploaded files; `_submitted_payload_has_images` now also accepts a positive `source_marking_image_id`. 2026-09-27: the resumed draft and the review gallery omitted the carried image because `submitted_data` holds only its id; `ContributionDetailSerializer` now resolves it as `source_marking_image` (null once the image leaves the marking), `CoverEdit.tsx` rebuilds the tile from that and sends the id from the gallery rather than router state, and removing the tile on resume clears the id through `removed_existing_image_keys`. The row still moves only on approval. | T37: verify the full flow using the example at https://hellowoco.app/record/21032 and a safe staging equivalent. Removal from the Marking occurs on approval, not merely on submission. Confirm that timing meets the request. Broader T37 work remains open. |
| State whether a submission is a Marking or Cover | Implemented in `ContributionDetail.tsx` and `CoverContributionDetail.tsx`, using `entryKindForContribution`. | T32 related verification: check https://hellowoco.app/contribution/91 with Editor access. Guest access redirects to login. Confirm its actual Entry kind and displayed label; old payloads without submission_kind use a heuristic. Repair data only if a mismatch is established. |
| Latest date on a second line | The munger already attaches a recognised (L) row's date to its parent Marking. The September 21 production check of https://hellowoco.app/record/30841 (HUNTSVILLE,M.T.) displayed 11/12/1813 for both bounds. The source's correct latest date was not established in this review. | T49: inspect the source second line, trace extraction, parsing, import, and date aggregation, then repair only the confirmed gap. Record source citation, expected precision, affected IDs, and results separately for woco.dev and hellowoco.app. No blind reimport. |

Evidence: [filter options](frontend/src/hooks/useFilterOptions.ts),
[thumbnail controls](frontend/src/components/entry-detail/ThumbnailImageActions.tsx),
[Marking detail](frontend/src/pages/RecordDetail.tsx),
[Cover form](frontend/src/pages/CoverEdit.tsx),
[Cover approval](backend/common/contribution_apply.py),
[submission labels](frontend/src/lib/contributionDisplay.ts), and
[date emission](tools/ascc_data_munger.py).
Existing tests were inspected, not run: `ThumbnailImageActions.test.tsx`,
`coverFromImageHandoff.test.ts`, `contributionDisplay.test.ts`, and
`test_cover_contribution_apply.py`. These support the code findings, not
deployment or acceptance. The reported Editor workflow was not exercised.
README.md and DECISIONS.md need no change for this intake.

### Follow-up: Rotate image button

Free-angle rotation alongside Crop is implemented in PR #191 and promoted
to production in PR #192. The October 20
T66 discussion records production deployment. T66 is Testing under Reese,
F5 - Image Attachments. It retains browser checks and acceptance for saved
orientation, original retention, thumbnails, metadata, permissions, and later
crops. Related: T33/T37. No repeat implementation is needed.

### Follow-up: VPHC Reference Work

Michael requested VPHC in the Reference Works list. The remaining checks
are recorded below.

- **Issue 13 / T15:** `VPHC1 - Virginia Postal History Catalog (1st Ed.)`
  is present in the public Reference Work options on both
  [production](https://hellowoco.app/api/v2/reference-works/options/) and
  [staging](https://woco.dev/api/v2/reference-works/options/), checked during
  this follow-up. Retain the check of the signed-in Reference Works list and
  Marking/Cover form selectors, including saving the Citation. Do not create
  a duplicate VPHC record. `getReferenceWorks()` follows every page of the
  list, so a work missing from a form is a data question, not pagination. The
  VPHC ledger requires an existing VPHC1 row; `import_vphc_reference` loads
  places and postmasters, not the bibliographic Reference Work.
Evidence: [Reference Work service](frontend/src/services/referenceWorks.ts).

### Follow-up: Editors add and edit Reference Works (S19)

Implemented in PR #197 and deployed to woco.dev on October 22; S19 is
Testing. Editors and Administrators reach a Reference Works page (`/reference-works`, linked from
the navigation and the Dashboard) that lists every work, adds one, and edits
one; there is no delete. The API's write rule now follows the project's
Editor definition (a Collection assignment, the review permission, or
superuser), the same rule the Color, Shape and Lettering endpoints use, and
the serializer refuses a duplicate title and edition, an out-of-range year,
and a change to a code that existing Citations rely on. The citation cards on
the Marking and Cover forms show the title first, then the first author plus
"et al." when the authorship names several people, with edition, volume and
year; a single person's comma-containing name is never split and the full
authorship is unchanged in storage. Rules in DECISIONS.md "Manage Reference
Works Through The Editor Page". Remaining: a browser check on each site as an
Editor and as a Contributor, and acceptance. Source-choice verification stays
with Issue 13/T15.

### Follow-up: Email Editors about pending submissions

Michael requested working email so Editors can be notified of pending
submissions. Reuse [T30](https://trello.com/c/wDojGejL) for sender/relay repair
and proof of production delivery. Its earlier sender-rejection report is
dated evidence; this intake did not test the current relay.

[T68 - Email Editors about pending submissions](https://trello.com/c/Y2SycFtn)
is To Do, unassigned,
F3 - Submission Workflow, with application work under Reese. It depends on
T30 for delivery. Current mail code covers account activation and password
reset; submission creation/resubmission does not notify assigned Editors.

Acceptance: notify active Editors with confirmed assignments to the affected
Collection about pending Marking and Cover submissions, with a link to the
correct site's review queue. Verify recipients and Collection assignments
before sending; the private Editor roster is not an assignment source.
Decide manual sending, per-submission notification, or a digest before
implementation, including treatment of the existing pending queue and
resubmissions. Exclude drafts and completed reviews, prevent accidental
duplicate sends, and report delivery failures without losing submissions.
Verify receipt with an authorised test recipient before general use.

This is the requested pending-submission email capability. S36's broader
notification preferences and channels remain deferred. Evidence:
[submission handlers](backend/common/api/v2/views.py),
[activation mail](backend/common/signals.py), and
[mail settings](backend/woco/settings.py). No notifications were sent.

### Follow-up: Help on data and image rights and attribution

Michael requested a Help section explaining rights and attribution for data
and images. [T69](https://trello.com/c/BAU8GBYS) is Testing,
F9 - Documentation & Help. Rights and Attribution is allowlisted public
Help, published in PR #198 with staging deployment evidence. It reports
stated terms and unresolved rights questions; it selects no license.

Acceptance: publish a discoverable Help section covering source citations,
image creator/rights-holder credit, contributor credit and name preferences,
submission permissions, reuse terms, and how to raise a rights or credit
correction. Include separate worked attribution examples for data and images,
with source and license links and any changes made. Establish the applicable
project terms and source-specific permissions before stating them as policy;
distinguish software licensing from data and image terms. Reconcile the
footer with the confirmed policy, and explain how to handle missing or unclear
rights information. Preserve private correspondence and contact details.

The article is in the Help allowlist. Verify its Guest-facing presentation. Related: T40 for
contributor credit; T61 remains the separate deferred software-license audit.
Evidence: [Help publication](backend/common/api/help.py),
[footer](frontend/src/components/Footer.tsx), and
[acknowledgements](docs/acknowledgements.md). This records the implemented Help; it does not select a new license.

Published on branch `reese/69-rights-help` (October 22): a new Help article,
[Rights and Attribution](docs/rights-and-attribution.md), added to the
allowlist. It reports what the site already states (GPL-3.0 for the
software; the footer's CC BY 4.0 statement for catalog records; listings
accepted on their catalog's authority; the Contributor name opt-in), gives a
worked credit line for a record and for an image with "changes made", explains
corrections, and lists under "Not yet confirmed" the terms the project has not
written down: whether CC BY 4.0 covers catalog-derived listings, reuse of
source text or page images, per-image creator and rights records, and credit
for later editors. No licence was selected and no policy was published; the
footer keeps its sentence and gains a link to the article; the FAQ points to
it; the glossary's VPHC entry no longer calls VPHC forthcoming. Remaining:
Michael and Ian answer the open questions on the card so the last section
can shrink; acceptance.

### Follow-up: Region type and county entry on new/edit pages

Michael requested Region type controls on new/edit pages so users can enter
counties. [T70](https://trello.com/c/u6OfTiMR) is Testing under Reese,
F3 - Submission Workflow. Reese owns the
application work; Michael owns any required model/data changes.

Implemented in PR #204, with staging deployment recorded; no model change. The Marking new/edit form offers a County selector under State
(the COUNTY Regions under the chosen state, asked of `/regions/` by the
state's id) and a "County not listed" text field; both survive draft save,
resume and edit prefill and travel as `county_id`, `county` and
`county_proposed`. Approval (`_link_county`) links the county to the Post
Office only when the town has no county link yet, never replaces or deletes
one, and refuses a county outside the resolved state. The Editor's review
shows the county and, on an edit, whether approval will link it or leave a
differing existing link unchanged; a typed county is shown with a reminder to
create the Region first. The review page's county facts (name, whether the
town is known, its current county, what approval will do) come from the
server (`county_intent`), never from the client-sent name. Hosted
verification on woco.dev and acceptance remain. Not done here: the Post
Office page still shows only the state. Refinement to consider later: a
county link whose `valid_to` has passed still counts as "the town has a
county" for the add-only rule; a dated-jurisdiction aware rule would need a
decision on which county is current.

The Region model supports COUNTY and parent Regions. PostOfficeRegion
holds dated jurisdiction links. County input now travels through the
Submission; approval preserves existing links and rejects the wrong parent.

Acceptance: expose Region type and county-entry controls in the applicable
new/edit forms, select the correct county within its parent jurisdiction,
and retain the selection through draft save/resume, submission, Editor
review, approval, and subsequent editing. Store county jurisdiction on the
Post Office through PostOfficeRegion; Cover context follows its linked
Marking(s), not a new county field on Cover. Preserve state/territory context
and Collection routing; do not put county names into the existing State
selector. Preserve historical jurisdiction dates and existing links when an
unrelated field is edited. Define how a missing county can be proposed and
reviewed without giving Contributors direct Region-administration rights.
Verify same-name counties under different parents and existing imported
county links. Reuse the existing Region tiers rather than a second type list.

Evidence: [Region and PostOfficeRegion](backend/common/models.py),
[form](frontend/src/pages/Contribute.tsx),
[Region options](frontend/src/services/regions.ts),
[approval](backend/common/contribution_apply.py), and
[county display](frontend/src/services/markings.ts).

### Follow-up: Manual Postmaster entry

Michael requested manual Postmaster entry.
[T71](https://trello.com/c/By0kwVmn) is Testing under Reese,
F3 - Submission Workflow. Reese owns the
application work; Michael owns any required model/data changes.

Implemented in PR #205 with staging deployment recorded. Migration `0023_postmaster_manual_entry` adds
`origin` (IMPORT/MANUAL) and `source_note` to `PostmasterTenure`; Editors
add and correct people and events through the API (POST/PATCH, no DELETE)
and from the Post Office page; each write is one Submission Transaction;
roles, review and later-import handling are recorded in
[VPHC-DECISIONS.md](docs/devel/VPHC-DECISIONS.md). Hosted verification
and acceptance remain.

Editors can add and correct Postmasters and appointment events through
POST/PATCH APIs and the Post Office page. Event writes require responsibility
for the Post Office, and writes are audited.

Acceptance: provide a discoverable application workflow to select or add a
Postmaster and record or correct an event at the correct Post Office, with
source evidence and the date precision actually known. Preserve the existing
distinction between a person and an appointment/office event; do not store
an inferred service end as a sourced date or merge people by name alone.
Define permitted roles, review requirements, and change history before adding
write endpoints. Preserve imported provenance and define how later source
imports handle manually entered records and corrections. Verify create,
edit, persistence, permission checks, and display on the associated pages.
Review the source_ref field's suitability for manual citations rather than
requiring a fabricated workbook cell reference.

Evidence: [Postmaster APIs](backend/common/api/v2/views.py),
[models](backend/common/models.py),
[frontend service](frontend/src/services/postmasters.ts), and
[import command](backend/common/management/commands/import_vphc_reference.py).
The source importer remains separate from the manual-entry workflow.

## September 26 email intake and September 27 follow-up

These items are recorded on the existing cards. Site observations below are
from that intake or Reese's report, not checks repeated in this reconciliation.

- **[T37](https://trello.com/c/u1f8iyjw), Testing under Reese:**
  PRs #161/#167 preserve the carried image through draft, resume, review,
  and approval. Reese's October 7 checks confirmed approval-only transfer on
  both sites, including production Marking 21032 and Cover 2204.
  PRs #173-#175 add visible disabled actions, carried-image approval order,
  Cover-edit transfer, and crops into approved associated imageless Markings.
  Those catalog crops preserve the Cover's original image.
  [PR #181](https://github.com/CoverCensus/worldcovers/pull/181) adds browser
  cropping of new uploads on Marking forms; the crop replaces that pending
  upload and the uncropped original is not submitted. October 22: the
  new-Marking form gains an "Also submit the Cover this marking is on"
  section (type, date or unknown, flags, description, cover images seeded
  with the uncropped original of a cropped upload); the submission stores it
  as `pending_cover`, and approving the Marking creates an ordinary pending
  Cover submission for the new Marking in the same transaction, reviewed on
  the existing cover page. Two approvals, one form, no model change; the
  provisional-Cover-from-an-edit item is split to T92 (built October 23, see
  the T92 entry below). Production rollout is
  recorded in the October 15 card comment after PR #182 and the successful
  October 14 deploy. Verify the remaining shipped cases separately from
  the unresolved combined Marking/Cover and provisional Cover workflow.
  Both Entries require review; approval, draft, return, rejection, and
  parent/child behavior remain to be decided. Existing-record linking stays
  restricted to Editors and Administrators; T34/T35 retain wording and refresh checks.
- **[T77](https://trello.com/c/lGfEJzSw), Testing under Michael:**
  The September 26 intake records production record 30876 showing `rough C`,
  despite the earlier report of `rough c`. Compare source, import text, and
  available record history to establish the cause and correction, or record
  the exact evidence gap. Preserve source wording; do not repeat a repair
  when the current value is correct.

## September 21 code-review gaps

These remaining gaps were noted in DECISIONS.md and mapped to the tasks
below. Application work belongs to Reese; any model changes belong to Michael.
T72 and T73 were locally verified in `c0e09f3` and published through
[PR #176](https://github.com/CoverCensus/worldcovers/pull/176); hosted
verification and acceptance remain. The approved October 8 sync moved both
cards to Testing and assigned Michael to verification. T74's restoration
scope is implemented in PR #206; T74 is Testing and S23 is Doing.

### T72 - Preserve all Citations in multipart submissions

[T72 on Trello](https://trello.com/c/FOS1WZHa) - F3 Submission Workflow.

Implemented and locally verified in `c0e09f3`, published through
[PR #176](https://github.com/CoverCensus/worldcovers/pull/176). Marking and Cover forms preserve
all selected Citations and details through draft save, resume, submission,
review, and approval. Omission preserves the stored set; explicit empty
selection clears it. Multipart and JSON regression tests cover both Entry
types, including edits with two existing Citations. The frontend loads all
Reference Work and Citation pages and blocks saving when existing Citations
cannot be loaded.

Hosted verification and acceptance remain: verify two selected Reference
Works and their details through the complete form workflow, then verify
explicit clearing. This is separate from T15's source-choice data checks.
The original September 21 QueryDict check retained only ID 22 from IDs 11
and 22; the submit path now reads all repeated values.

Evidence: [Marking form](frontend/src/pages/Contribute.tsx),
[Cover form](frontend/src/pages/CoverEdit.tsx),
[submit path](backend/common/api/v2/views.py),
[_sync_citations](backend/common/contribution_apply.py),
[submission tests](backend/common/tests/test_submission_citations.py),
[form tests](frontend/src/pages/SubmissionCitations.test.tsx), and
[pagination tests](frontend/src/services/citationPaging.test.ts).

### T73 - Scope image writes to Collection responsibility

[T73 on Trello](https://trello.com/c/wgtwKkWr) - F5 Image Attachments.

Implemented and locally verified in `c0e09f3`, published through
[PR #176](https://github.com/CoverCensus/worldcovers/pull/176). Image creation, updates,
deletion, and moves enforce subject responsibility; moves check both source
and destination. Cover checks include linked Marking Regions. Existing
Administrator overrides and Contributor restrictions remain. Regression
tests cover allowed and denied writes, mixed-Region Covers, reassignment,
and rejection of an unauthorized upload before a file is written.

Hosted verification and acceptance remain: an Editor cannot change images
outside their assigned scope through direct API calls, while authorized
writes and moves still work. Verify file retention and image order after a
move.

Evidence: [ImageViewSet](backend/common/api/v2/views.py),
[permissions](backend/common/api/v2/permissions.py),
[ImageSerializer](backend/common/api/v2/serializers.py), and
[image write tests](backend/common/tests/test_image_write_permissions.py).

### T74 - Define and verify Entry version restoration

[T74 on Trello](https://trello.com/c/eX68bPRW) - F8 Audit Trail.

Scope implemented in published PR #206, with staging deployment recorded
on T74. Restoring a version reconciles the Entry to its snapshot:
scalar fields; Citations by (reference work, detail); Image rows by
storage filename, re-added only when the file is still in storage (a
removed row keeps its file on disk); dates seen by their normalised
(granularity, date key); and, for Covers, marking links by marking id
(skipping markings now removed) and the valuation. Links between a
Marking and its Covers are not part of a Marking version and are left
unchanged; a snapshot that did not record a relationship leaves those
rows alone; re-added images are not tracings and show the restoring
Editor as uploader. Every limitation that applies is listed before the
action by `GET restore-preview` and stored on the RESTORE_VERSION
transaction.

Flow: Record History (both Entry types) offers "Restore this version" on
events that saved a version; the dialog shows current vs version field
rows, per-relationship counts and "What this restore cannot bring back",
then confirms through `restore-version`, which runs in one transaction
(before-snapshot, apply, transaction row, new version) and answers 409
after a rollback when a constraint refuses the rows. The same
responsibility check as before applies; a Cover restore that would link
markings outside a non-superuser Editor's regions is refused. Recycle-
binned Entries use the recycle-bin restore, not this.

Verify on woco.dev then hellowoco.app: as an Editor, open a record's
history, click Restore this version on an older version, read the
comparison and limitations, confirm; the record changes and a
"Restored version" event appears. Anonymous
`GET /api/v2/markings/<id>/restore-preview/?version_no=1` answers 401 or
403. Follow-ups, not in this card: a picker for versions older than the
10 history events shown; recording `is_tracing` in snapshots.

Evidence: [restore plan](backend/common/version_restore.py),
[restore-preview and restore-version](backend/common/api/v2/views.py),
[tests](backend/common/tests/test_version_restore.py),
[dialog](frontend/src/components/entry-detail/RestoreVersionDialog.tsx).

## Quick fixes assigned to Michael

T32-T35 are Testing and remain assigned to
Michael (`grubermeister`) at his request.
This is an explicit exception to the usual frontend/backend responsibility
boundary. The current source contains the UI changes; acceptance still
requires checking the affected pages and recording the site and revision.
T32's remaining generic catalog-code errors are corrected in the published
October 18 changes. Missing-code, duplicate-code, and generation
errors now identify the Marking or Cover. Hosted verification remains open.

| Task | Outcome | Feature | Acceptance scope |
| --- | --- | --- | --- |
| [T32](https://trello.com/c/VkbZnDZ1) | Distinguish Marking and Cover catalog code labels | F3 | Use Catalog Marking code and Catalog Cover code in the relevant forms, review labels, placeholders, and error messages. Each code's Entry type must be clear. |
| [T33](https://trello.com/c/9XzQrOLb) | Split thumbnail action buttons into two rows | F5 | Verify the implemented two-row layout on desktop and narrow screens. Preserve current actions and permissions: Move to another marking was deliberately removed; Move to cover became Create cover from this image. |
| [T34](https://trello.com/c/L5tx4C7m) | Encourage Cover creation in the image upload warning | F3 | Explain that the image may show a whole Cover; suggest creating a Cover record or using an existing one. Preserve acknowledge-and-continue. The heuristic uses dimensions, not image recognition. This task changes wording, not creation workflow. |
| [T35](https://trello.com/c/8GLvhowq) | Refresh destination thumbnails after moving an image | F5 | Cover-to-Marking moves now refresh the source gallery and associated Marking previews; verify success, refresh failure feedback, and selection after removal. The former Marking-to-Cover move is now T37's Create cover from this image flow: verify both galleries after approval and return to detail. Do not restore the removed move control. |

## Other follow-ups

T50 is Testing under Michael. T52-T54 are Backlog and unassigned.
T37 is Testing under Reese; T40/T45 are Testing under Michael.
T39/T43/T44/T47/T48/T51 are Testing. T42 is To Do under Michael;
T55 is Done after Michael's October 25 production confirmation.
The responsibility column directs planning;
it does not assert work has started or change existing card memberships.
Model/data work belongs to Michael even when a related interface belongs
to Reese. Source observations below describe code, not deployed behaviour.

| Task | Outcome | Feature | Responsibility | Scope and acceptance |
| --- | --- | --- | --- | --- |
| [T37](https://trello.com/c/u1f8iyjw) | Create image destinations from crop and move workflows | F5 | Reese; Michael for model changes | PR #202 is merged with staging deployment evidence. Shipped: carried-image flow, ordered approval, Cover-edit transfer, visible disabled actions, catalog crops into associated imageless Markings, and upload crops on Marking forms (PRs #173-#175, #181). Catalog crops keep the original; upload crops replace it. Testing under Reese. October 22 (branch `reese/37-marking-with-cover`): a new-Marking submission may carry its Cover (`pending_cover`); approving the Marking creates a pending Cover submission for it, reviewed separately; both Entries' review and links retained; no model change. Provisional Cover states from a Marking edit split to T92. Existing-record linking remains restricted to Editors and Administrators. |
| [T39](https://trello.com/c/YtcnoRop) | Compare proposed changes beside the current Entry | F3 | Reese | Implemented in PR #192 with production deployment recorded October 20. Show current and proposed values side by side during Marking and Cover submission review. Existing history is not this comparison. Acceptance: an Editor can identify changed and unchanged values before deciding. |
| [T40](https://trello.com/c/vqYH3R2Z) | Preserve contributor credit preferences across edits | F3 | Michael: model; Reese: application | Preference protection is implemented and locally verified in `c0e09f3`, published through PR #176, for Markings and Covers, including older drafts, direct API edits, and admin forms. Only the original Contributor can change their choice; public credit still uses `created_by`. Cumulative credit and each person's opt-in remain unresolved. Hosted verification and acceptance remain. Preserve existing opt-in credit display for Markings and Covers. Evidence: [preference tests](backend/common/tests/test_submitter_name_preference.py) and [form tests](frontend/src/pages/SubmitterNamePreference.test.tsx). |
| [T41](https://trello.com/c/LI10JpcC) | Define rescind and inactivity handling for submissions | F3 | Reese; Michael for model changes | Keep existing pending approve/reject/revision and owner withdrawal. Define rescind, the inactivity interval, and whether the request concerns submissions or published Entries before implementing additional actions. Acceptance: agreed transitions and permissions, then verified behaviour; no arbitrary deletion policy. |
| [T42](https://trello.com/c/dfKkGHWl) | Support circa qualifiers on Marking and Cover dates | F3 | Michael: model; Reese: controls | Store approximation separately from missing date components and offer the requested Circa control. Acceptance: qualifier survives submission, review, retrieval, and display for both Entry types without inventing date precision. Published source commit `9f34260` protects source `c1849` from becoming an exact year during bundle processing; it does not add the application field or Circa control. |
| [T43](https://trello.com/c/h55E9wFA) | Add captions to image upload forms | F5 | Reese | Implemented in PR #192 with production deployment recorded October 20. Expose editable per-image captions on Marking and Cover submission forms. Reuse Image.image_description unless a concrete distinction requires otherwise. Acceptance: caption persists and is available on image display after review. |
| [T44](https://trello.com/c/rkYy8Yqd) | Copy an existing Entry into a new submission | F3 | Reese | Implemented in PR #192 with production deployment recorded October 20. Start a new Marking or Cover submission prefilled from an existing Entry so Contributors change only the differences. Define which images, citations, and relationships copy. Acceptance: new submission never updates the source Entry or inherits approval/identity. |
| [T45](https://trello.com/c/9MUNA89m) | Add staff admin shortcut and review legacy admin items | F7 | Reese; Michael for model/data implications | Show "Admin Panel" first in the desktop user dropdown and mobile account actions when is_staff is true. Open /admin/ in the current tab. Keep Dashboard or My Submissions second, using the existing role-based label and destination. Review the deprecated Postcover registration before hiding/removing it; retain required access and data. Acceptance: the shortcut follows staff permission and only confirmed obsolete admin items are removed. Add Superuser-only magic-wand links from catalog list and gallery Marking boxes, Associated Cover boxes, and Marking and Cover detail headers to the corresponding Django admin change form in the current tab. Staff permission alone does not enable these record links. Exclude draft Submission boxes and removed Entries. The shortcut and wand links are published in source commit `084da79`; browser verification and legacy Postcover review remain open. Deployment is unverified. |
| [T47](https://trello.com/c/8AVh7K9r) | Report possible duplicate Markings in existing data | F11 | Reese; Michael: acceptance | PR #193 is merged and deployed to staging; the operator run and acceptance remain. Implemented as the read-only `report_duplicate_markings` command (branch `reese/47-duplicate-markings-report`, October 20): one CSV row per group member, EXACT tier (every attribute equal except code/catalog text, the munger's merge rule) and NEAR tier (same primary state, town key, type, inscription key, shape, colour family, width/height within 0.5 mm). Dates are shown; `--require-date-overlap` filters. Rules recorded in DECISIONS.md and reused by T48. Matches do not authorize automatic merge/deletion. Remaining: run on each site by hand and record counts and revision on the card; acceptance. Published source commit `9f34260` merges equal generated v1 results offline and does not implement this report. |
| [T48](https://trello.com/c/gQ639Ld4) | Suggest similar Entries during new and edit submissions | F3 | Reese; Michael: matching/data | PR #194 is merged and deployed to staging; browser review and acceptance remain. Implemented (branch `reese/48-similar-entries`, October 20): an advisory "Similar existing Markings" panel under the Colour field on the Marking form, fed by the read-only `GET /api/v2/markings/similar/` (match = T47's full key; related = same town and inscription, other details differ; the edited Marking excluded; ten rows with counts; no code or user fields), and a client-side "Similar existing Covers" panel on the Cover form from the parent Marking's sibling covers (type and date, once a year is typed). Warning only; Submit is never blocked. Rules in DECISIONS.md "Warn About Similar Entries, Never Block"; shared keys in `common/matching.py`. Remaining: browser check on each site and acceptance. |
| [T49](https://trello.com/c/bvNVhddr) | Verify catalog interpretation and illustrated Cover capture | F11 | Michael | The October 24 source-date comparison is complete; see `.codex/ascc-date-audit-2026-10-24/report.md` and `summary.json`. It changed no application data. Review cross-reference exclusion (SHIP 1808-60), See State date references, date inheritance/precision, star ownership, and ring ornament placement against source pages. Capture IL illustrated Covers at printed pages 66 and 79 with citations. Account for exclusions and uncertainty rather than inventing fields. Related: T19, T25, T26; no blind reimport. |
| [T50](https://trello.com/c/B25HULz7) | Remove added parent town text from child inscriptions | F11 | Michael | Testing. Michael confirmed cleanup on both sites on September 26. The board records production record 40028 displaying Ratemark Text `10`. Preserve each child inscription and original source text; final verification and acceptance remain. The implemented `repair_ascc_child_inscriptions` commits by default; `--dry-run` previews. [Usage](docs/devel/TOOLS.md#ascc-inscription-repair-t50). Do not repeat the completed repair. |
| [T51](https://trello.com/c/os08ghUA) | Archive selected records before purge and sweep orphans | F10 | Michael | Collection backup, restore, verification, and guarded state removal are published in `323b594`, with dependency/macOS test repairs in `16c79b7`; see [operator tools](docs/devel/TOOLS.md#collection-backup-and-restore) and the [transfer procedure](docs/devel/RUNBOOK.md#collection-transfer-between-instances). T13 records Michael's October 21 confirmation that Hawaii's 13 Markings were promoted to production and removed from testing. This transfer is complete. Purge archive and orphan-row checks shipped separately in PR #196, with staging deployment recorded October 22: `purge_recycle_bin` writes and verifies a `tools/wip/out/` archive (fixture, image bytes, manifest) covering every deleted or relinked row before deleting, reports scope in dry-run, and restores through `loaddata` plus a media copy; `verify_media_integrity` reports Image/Citation/DateSeen rows whose subject is gone. Rules in DECISIONS.md "Archive Before A Permanent Purge". Files on disk are never deleted; an orphan sweep is a separate decision. Remaining: an operator dry-run on each site and acceptance. Separate from S25/S26 application backup/restore. |
| [T52](https://trello.com/c/2djEMidu) | Preserve catalog sections within Collections | F7 | Michael: model/data; Reese: application | Represent each state's source section order and cited explanatory prose within its Collection. Preserve source structure during intake. This is not the deferred user comment workflow S42. Acceptance: one representative state retains section membership, order, and source prose. |
| [T53](https://trello.com/c/Q0KacWwW) | Compare sampled image colors and approximate Pantone matches | F5 | Michael: data/mapping; Reese: application | Use expected hex and sampled photo color for the first comparison, then approximate Pantone mapping. Existing Color storage is not a matching workflow. Define the Pantone reference and approximation method before implementation; distinguish this from deferred automatic predominant-color detection. |
| [T54](https://trello.com/c/GZp3g2kZ) | Decide how to represent Cover and strike condition | F11 | Michael | The ASCC header distinguishes Cover and strike condition; current models have no dedicated field. Decide whether and where to record it from evidence. This is a scope/model decision, not approval to invent grades from prices. |
| [T55](https://trello.com/c/8b8Xss1G) | Reconcile Michigan city by city before a verified rerun | F11 | Michael | Done: Michael confirmed on October 25 that Michigan is in production and all checks are complete. The October 24 review accounted for 1,457 source rows, six explained exclusions, 2,390 Markings, 559 Covers, and 436 Images; local load and 94 review links were verified. Preserve the reviewed bundle and its source notes. T23/T24 remain separate policy/search work; T26 remains Testing. |

September 28 source review for T49: commit `9f34260` adds source
aliases for merged (L) rows, targets the preceding device and color,
preserves catalog date evidence through the v1 overlay, and resolves
duplicate source context before merging equal generated results.
[Regression tests](tools/tests/test_ma_regressions.py) cover color/date pairs,
source precision, standalone Marking types, and retained Images and Cover
links. Tests were inspected, not run in that review. The commit is published;
full-bundle verification, cross-state checks, and site-specific repair remain
unverified. The source evidence is the local v1 export, not a newly checked
catalog facsimile. Retain the Huntsville, Mobile, and IL checks.

### Prevent public disclosure of user email and account flags

[T78](https://trello.com/c/dCdskX07): Testing under Reese, verified on the live
board October 8; F2 - Collection Discovery.

The core disclosure fix was published in
[PR #171](https://github.com/CoverCensus/worldcovers/pull/171). Public Marking
detail no longer returns nested `created_by` or `modified_by` user objects.
`c0e09f3`, published through PR #176, adds Guest and Contributor checks across public Entry list,
detail, and nested responses. Public Marking credit remains opt-in; internal
audit identity is retained. Local checks passed. Hosted verification and
acceptance remain separate.

The card records Reese's October 2 staging verification at `94e9f7b`:
anonymous reads of woco.dev Marking 48909 and 40 recently modified Markings
returned no email, account flags, or nested user objects. His October 5
production check still found the fields on hellowoco.app Marking 48909.
[Promotion PR #172](https://github.com/CoverCensus/worldcovers/pull/172)
merged, but its deployment failed. PR #176 superseded that promotion; the
latest production deployment succeeded on October 14. These are deployment
results and dated site reports, not a fresh privacy check. Guest/Contributor
production verification and final acceptance remain.

Acceptance: public list/detail and nested Entry responses do not expose
email or account flags; opted-out Contributors are not identified through
nested user objects. Test Guest and Contributor reads, opted-in and
opted-out credit, and the authenticated administrative views that need
identity. Keep the Editor roster restricted. Verify deployment separately.
No real contact details need to be copied into the tracker.

Remaining policy question, also recorded in PR #171: whether public
`CoverMarking.reviewer_username` and integer audit IDs on lookup responses
are appropriate. Those fields remain; do not describe this fix as complete
API anonymity. Related: T40 credit preferences. Keep the Editor roster restricted.

Evidence: [serializers](backend/common/api/v2/serializers.py),
[public-response tests](backend/common/tests/test_marking_public_user_fields.py),
and [restricted roster tests](backend/common/tests/test_editor_roster.py).
The original September review found nested email and account flags in
[the earlier serializer](https://github.com/CoverCensus/worldcovers/blob/50a3a5f82db8f5f96e3117d1281de9f0840d750a/backend/common/api/v2/serializers.py#L996);
that evidence describes the defect before PR #171.

## Existing work reused and implemented requests

- Description appears above Associated Covers after
  [PR #154](https://github.com/CoverCensus/worldcovers/pull/154). This is present
  in both deployed source revisions recorded above. No new browser acceptance
  check was performed; no historical backfill card is needed.

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
  County entry on the Marking new/edit forms is implemented (T70, 2026-10-23);
  hosted verification remains.
  New uploads use region folders; older-file cleanup and draft relocation
  remain unverified, not assumed defects. No new implementation cards for
  these already implemented capabilities or unverified file-cleanup concerns.

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
| [T64](https://trello.com/c/pufJgNTJ) | Accept and process PDF, BMP, and RAW uploads | Convert supported files into a web-displayable catalogue image before storage. Define PDF page selection and supported RAW formats, preserve useful resolution metadata, enforce size and decode limits, and verify previews, thumbnails, cropping, moves, submission review, and final Entry display. Current uploads remain PNG and JPEG until this work is complete. |

Full report generation is retained under deferred S43 as broader scope to
define; it does not replace active S5 exports. Email distribution lists for
review are retained with S36 as a related deferred idea; routing and whether
email can perform review actions remain undecided. The narrower request to
email Editors about pending submissions is active under T68, with mail
delivery repair under T30.

## October 17 sync and feature requests

Source: Michael's approved sync plan and Ian's requests relayed on 2026-10-17.

- **[T82](https://trello.com/c/aX5MzTQA), Testing, F2:** implemented
  and visually accepted locally by Michael on October 18. Staging deployment
  at `2e77277` passed; PR #192 later promoted the code to production. Hosted
  visual acceptance remains. Catalog Search and Marking detail Color text is bold and
  uses the stored hex value, with a contrasting background and a plain-text
  fallback. Michael authorized approximate screen values: all 62 local Color
  rows were populated, then 28 compound values were revised. The palette
  covers all 49 production Color names checked on October 18. Michael then
  authorized hosted data updates: all 64 staging Color records and all 49
  production Color records now have display values. Staging's two range names
  use midpoint display values outside the command palette. Saved values were
  checked after each update; no white placeholders remain. Names, Pantone
  codes, and Entry links were preserved. Production used the reviewed palette
  through a one-time script because its deployed code then lacked the command.
  These are display choices, not measured ink colors or Pantone matches.
  Separate from deferred T53/T56 and catalog Color cleanup.
- **[T83](https://trello.com/c/F5gzAlhh), Testing, F2/F3:** implemented
  and published in Catalog Search and both Dashboard tabs. Fresh views default to
  25; explicit choices, including 10, remain in the URL. Existing page-reset
  and return-navigation behavior remains. Service/API defaults and intentional
  picker/background-fetch sizes were reviewed and retained: these list views
  send their selected page size explicitly. Hosted verification remains open.
- **[T84](https://trello.com/c/smLXK7tJ), Testing, F1:** new Contributor
  accounts use verified email signup. Test-site signup points to production.
  The old request POST returns 410. Administrators can still see and manually
  handle old pending requests. October 25 staging account and permission
  checks passed, as recorded above. T30 retains production-mail acceptance;
  T68 retains Editor notifications. Earlier manual-request behavior is history.

S39's declined status is now recorded in the design and Trello.

## October 18 published quick fixes

Michael authorized these changes and the matching ISSUE.md/Trello updates.
The October 18 changes are now in published staging. The original verification
results below are dated evidence, not a new test run or hosted acceptance.

The Color palette utility follows the project's commit-by-default rule:
`./woco set_color_display_hex --actor <user id>` applies values;
`./woco set_color_display_hex --dry-run` previews them.

- **T83:** [Dashboard defaults](frontend/src/lib/dashboardParams.ts) now use
  25, matching the earlier Catalog Search change. The URL tests cover fresh
  defaults and explicit 10-row choices for both Dashboard tabs.
- **T32:** [Catalog-code validation](backend/common/catalog_codes.py), the
  generation API, and the Marking form now use Entry-specific error wording.
  Direct checks covered missing and duplicate codes for both Entry types and
  missing generation context. T32 stays in Testing for hosted acceptance,
  including the separate legacy Entry-kind check at contribution 91.
- **[T92](https://trello.com/c/GRCAFvqL), Testing, F5:** implemented in
  PR #203 with staging deployment recorded, part (c) of the October 7
  T37 memo. On a Marking edit, a whole-cover upload is offered as a Cover
  draft for that published Marking: the form posts the draft through the
  existing cover submit path with the file (uncropped original if cropped),
  removes the tile once the server holds it, and links to the cover editor.
  The record page lists the signed-in user's own cover drafts for the
  Marking under Associated Covers as "Draft - not yet submitted", outside
  the count and only to their author; the drafts fetch now asks for draft
  rows at page size 100 instead of the unfiltered first ten. Decisions
  (Reese, memo questions 11-13): draft rather than pending; drafts only on
  the record page; image moved, not copied. No backend code change; a test
  pins draft visibility. Limitation: an image already saved with an edit
  draft is not re-measured on resume and gets no offer. Hosted verification
  remains open.
- **[S33](https://trello.com/c/9TH4dywm), Testing:** PR #195 is merged
  with staging deployment recorded. The Marking new/edit form now has
  keyboard-accessible help for Lettering style, Impression, and Is Irregular,
  using the glossary meanings and the existing tooltip component. Existing
  visible Lettering guidance remains. The keyboard check covers focus,
  accessible description, Escape dismissal, and no accidental form submit.
  October 20 (branch `reese/33-field-help`): the same `FieldHelp` now sits
  beside every remaining textual field on both submission forms (Marking:
  Type, Manuscript, State, Town, Inscription, Shape, Color, Description,
  Rate Value, Catalog code, Width/Height, Reference Works; Cover: Type, Date,
  No image, Institutionally Owned, Backstamp, Description, Reference Works),
  with wording taken from the glossary. Tooltips define, visible text
  instructs, and help sits outside the checkbox labels. Three in-app strings
  that contradicted the glossary were corrected (date-format example,
  Ratemark/Auxmark names, lettering), and the glossary Cover entry now names
  the envelope types. Deliberately without help: image zones, captions,
  tracing, submitter name, and the Editor-only Dates seen card. The Search
  page filters remain for a follow-up under this story.
- **[T1](https://trello.com/c/AvISZKlp):** README.md and BUILD.md now explain
  custom database setup, matching `WOCO_DB_NAME` to `DB_NAME`, environment
  precedence, and existing `mysql.cnf` handling. Checked against `tools/setup.sh`,
  `.env.example`, and Django settings; no fresh database installation was run.
  The broader developer-documentation review remains Doing on T1.

Verification: 32 focused frontend tests and 14 backend tests passed, along
with frontend type checking, build, and diff checks. Lint had no errors and
three warnings in generated coverage reports. These checks do
not establish hosted acceptance. T82/T83 are now Testing; their current
memberships are recorded on Trello.

## October 19 Dates Seen and Manuscript updates

The October 19 review used local `106e4b4` and published `b58d6ae`.
Both changes are now in published staging. The checks below are historical;
no application tests were rerun for this synchronization.

- **[T89 - Verify Dates Seen on new and edit Marking forms](https://trello.com/c/DrMz2Wnj):** implemented in
  [b58d6ae](https://github.com/CoverCensus/worldcovers/commit/b58d6ae6e0fc30997a64353d758ff01f6c917bad).
  Dates Seen is inline above ERD/LRD on both forms. ERD/LRD is hidden until
  the direct Dates Seen list has a date. New Marking dates save with drafts,
  appear in review, and are applied on approval. Authorized changes to saved
  Marking dates save immediately. Contributor restrictions and partial-date
  precision remain. Local checks passed: 511 frontend tests, 68 focused
  backend tests, type checking, and build. Remaining: verify placement, range
  visibility, draft persistence, approval, and permissions on woco.dev and
  hellowoco.app after confirming each site's deployed revision. T89 is Doing
  under Reese. Evidence:
  [form tests](frontend/src/pages/MarkingEditImages.test.tsx) and
  [submission tests](backend/common/tests/test_contribution_submit.py).
  T75 remains Done; T25's source-data checks remain separate.
- **Manuscript display and search:** published commit `106e4b4` hides Shape and
  Dimensions in catalog search results; Marking detail already omitted them.
  Manuscripts: Only hides and clears Shape and Dimensions filters, including
  values from saved search URLs. Local checks passed: 45 display tests, two
  search tests, type checking, lint on changed files, and build. Publication
  is confirmed; hosted acceptance remains unconfirmed. No separate verification card
  was requested for this change. Evidence: [display tests](frontend/src/components/CatalogRecordFields.test.tsx)
  and [search tests](frontend/src/pages/Search.manuscripts.test.tsx).

## Existing October requests

These requests already have cards. Their descriptions hold the current
scope and acceptance; no new task is needed.

| Card | Existing scope | Status |
| --- | --- | --- |
| [T85](https://trello.com/c/EEVZea3W/203-t85-locate-and-scope-ascc-book-2-and-book-3-sources) | Locate and scope ASCC Book 2 and Book 3 sources | To Do |
| [T86](https://trello.com/c/K5iHL6lw/204-t86-record-editorial-policy-decisions-for-state-editors) | Record editorial policy decisions for State Editors | To Do |
| [T87](https://trello.com/c/zYso8noz/205-t87-edit-captions-on-already-saved-images) | Edit captions on already-saved images | Testing |
| [T88](https://trello.com/c/A6WuUara/206-t88-decide-whether-a-cover-edit-without-a-date-keeps-the-current-date) | Decide whether a Cover edit without a date keeps the current date | To Do |
| [T89](https://trello.com/c/DrMz2Wnj/207-t89-verify-dates-seen-on-new-and-edit-marking-forms) | Verify Dates Seen on new and edit Marking forms | Doing |
| [T90](https://trello.com/c/A3dTmufk/208-t90-upgrade-django-rest-framework-to-3183-for-three-high-severity-advisories) | Upgrade Django REST framework to 3.18.3 for three high-severity advisories | Testing |
| [T91](https://trello.com/c/Ffca8oa3/209-t91-add-the-ianthom-foundation-funding-line-to-acknowledgements) | Add the IanThom Foundation funding line to Acknowledgements | Testing |
| [T92](https://trello.com/c/GRCAFvqL/210-t92-offer-a-provisional-cover-from-a-cover-like-upload-during-a-marking-edit) | Offer a provisional Cover from a cover-like upload during a Marking edit | Testing |
| [T93](https://trello.com/c/obBYLbrF/211-t93-review-page-fails-on-a-marking-submission-that-carries-a-staged-cover) | Review page fails on a Marking submission that carries a staged Cover | To Do |
| [T94](https://trello.com/c/3PutrcL0/212-t94-scope-the-maine-philatelic-society-data-import) | Scope the Maine Philatelic Society data import | To Do |
| [T95](https://trello.com/c/FXv46Rqx/213-t95-keep-the-list-position-after-viewing-a-marking-add-previous-next-on-the-marking-page) | Keep the list position after viewing a Marking; add Previous/Next on the Marking page | To Do |
| [T96](https://trello.com/c/PTNeonZ9/214-t96-show-submission-counts-on-the-dashboard-needs-revision-drafts-pending-each-a-link) | Show submission counts on the Dashboard: needs revision, drafts, pending, each a link | Testing |
| [T97](https://trello.com/c/NOY0Ws2m/215-t97-open-the-approval-screen-from-a-submissions-title-or-pending-badge-not-only-its-image) | Open the approval screen from a submission's title or Pending badge, not only its image | To Do |
| [T98](https://trello.com/c/XBh5X1AK/216-t98-apply-apmc-branding-society-logo-replaces-the-w-worldcovers-becomes-apmc-on-every-screen) | Apply APMC branding: Society logo replaces the W, "WorldCovers" becomes "APMC" on every screen | Testing |
| [T99](https://trello.com/c/SUDGkiF0/217-t99-add-a-support-the-apmc-donation-block-to-the-home-page) | Add a "Support the APMC" donation block to the home page | Testing |
| [T100](https://trello.com/c/vJVVYwI7/218-t100-refresh-getting-started-remove-wocodev-references-add-the-editor-review-walkthrough) | Refresh Getting Started: remove woco.dev references, add the Editor review walkthrough | To Do |
| [T101](https://trello.com/c/6HTpRHmn/219-t101-add-a-measurement-guide-to-help-ruler-overlay-for-slanted-rate-marks-and-cds) | Add a measurement guide to Help: ruler overlay for slanted rate marks and CDS | To Do |
| [T102](https://trello.com/c/11AB0eZj/220-t102-evaluate-domain-and-hosting-path-options-for-the-apmc-site) | Evaluate domain and hosting-path options for the APMC site | Testing |

T85's October 24 comment identifies Books II/III in the USPCS electronic
library. Recorded sequencing, permission, and logistics limits remain.
T86 records the meeting decision that State Editors may extend listings past
1861 and may use multiple manuscript listings or one listing with dated images.
Other editorial questions remain on that card. T96/T98/T99 have staging
implementation evidence. T102's recommendation and email draft are complete;
no domain purchase, DNS change, SSO implementation, or email sending follows
from that result. T93's staged-Cover review report remains separate from the
completed signup check. T87's saved-caption editing shipped in PR #192, with
production deployment recorded October 20; it remains Testing.

# MD/MI editor-review batch (Ian email, 18 Jun 2026)

The remaining asks from Ian's 18 Jun 2026 email are listed below.
Completed batch items are omitted; original batch numbers are retained.

## Crosswalk -- Ian's email asks -> batch item -> status

Michael confirmed on 2026-10-25 that the MD/MI batch work is complete and
instructed that it be placed in Testing. Final acceptance remains separate.
Do not repeat the completed batch work or import from the old checklist.

| Ian's ask | Batch item | Status |
|---|---|---|
| Dates Seen, Amelia no-date handling, and VA `(1)` rule for WV | Batch #25 | **Testing** - [T25](https://trello.com/c/nSiEkCYk) |
| Institutional designation | Batch #29 | **Testing** - [T26](https://trello.com/c/S7ZsuqjL) |
| Per-state notification and editor review | Batch #31 | **Testing** - [T27](https://trello.com/c/cq72B5NA) |
| MD: Ann.MD and B M House source entries | Batch #35 | **Testing** - [T28](https://trello.com/c/UpnN07Yq) |
| MI: institutional flag for leading-star listings | Batch #37 | **Testing** - [T26](https://trello.com/c/S7ZsuqjL) |

The per-state notification requirement still applies to future work: notify
Ian before running a new state so he can provide its notation and quirks.
This completed batch does not authorize another import or new invitations.

---

# Issues

This section retains Backlog, To Do, Doing, and Testing work, plus brief
closure notes for the Michigan corrections accepted in this sync. Where code is
complete but a data check or decision remains, the status names that remaining
action. Original issue numbers are retained, so gaps are expected.

## Data & ingestion

### Issue 1 -- Fix WV data ingestion ("WV disconnect")
**Status:** To Do - [T7](https://trello.com/c/0zS0WvY1) - **Assigned:** Michael (`grubermeister`) - **Depends on:** none
The original feedback reported missing Martinsburg and Shepherdstown listings
and Ian's WV submissions. This is not a current absence finding. Identify the
source rows and target IDs on each intended site, then distinguish import
gaps, pending records, and search/filter behaviour before proposing a repair.
- [ ] Martinsburg, WV markings appear in listings
- [ ] Shepherdstown, WV markings appear in listings
- [ ] Ian's submitted markings are findable
- [ ] Root cause documented: import gap vs. query/filter bug

### Issue 2 -- Fix Richmond town-name normalization
**Status:** Testing - [T8](https://trello.com/c/YUs5t7yl) - **Assigned:** Michael (`grubermeister`) - **Depends on:** none
The original report described `Richmd, VA` display and Richmond search failures.
On 2026-10-18, Frank checked the production API, rendered Catalog Search,
and both Marking detail pages. Michael limited acceptance to hellowoco.app;
staging verification is outside this check. The site displayed version 1.9.4.

| Legacy source row | Production Marking | Color | Post Office | Inscription Text |
| --- | --- | --- | --- | --- |
| 587 | [23010](https://hellowoco.app/record/23010) | BLACK | 7191: RICHMOND | `RICHMD.VA.` |
| 913, parent 587 | [23011](https://hellowoco.app/record/23011) | RED | 7191: RICHMOND | `RICHMD.VA.` |

The local legacy snapshot `backups/db_export/tblRawStateData.csv` has
`txtTown=Richmond` and `txtTownPostmark=RICHMD.VA.` for both source rows.
Their catalog text and Colors match the production records. Both production
titles read `RICHMOND, VA - "RICHMD.VA."`; detail pages show Town and Townmark
Text separately. Preserve the abbreviated Inscription Text.

State = Virginia and Town = Richmond returned 376 Markings, including these
two on pages 7 and 8 at the default page size of 10. The keyword search
[`Richmond, VA`](https://hellowoco.app/search?q=Richmond%2C%20VA&page=8)
returned 397 Markings, with both on page 8. This
[focused search](https://hellowoco.app/search?state=Virginia&town=Richmond&q=Richmd)
shows both together. Counts and page positions are the October 18 results.
Post Offices 7189 (`RICHMD`) and 7190 (`RICHMD.VA`) returned no public Markings.
No code or data repair was needed or performed for these examples.

The evidence supports a possible confusion between Post Office name and
Inscription Text, but does not prove what the original reporter saw. The
complaint supplied no record ID or screenshot. Recommended feedback contacts
are Ian Gibson-Smith and Greg Stone, named in the source feedback group;
the individual Richmond reporter is unconfirmed. No notifications were sent.
Reese needs a follow-up only if review reproduces an application defect.

- [x] Identify source rows and production Markings with the reported abbreviation
- [x] Verify Richmond Post Office names and preserve the source Inscription Text
- [x] Verify both Markings appear in Richmond searches and display correctly
- [ ] Ask the feedback contacts to confirm these examples address the complaint; record acceptance before Done

### Issue 3 -- Verify remaining Amelia rate errors in deployed data
**Status:** Testing - [T9](https://trello.com/c/TF3jpD2V) - **Assigned:** Michael (`grubermeister`) - **Depends on:** none - **Source:** Greg Stone
The unknown-date/size parser defect is fixed in
[PR #71](https://github.com/CoverCensus/worldcovers/pull/71), with targeted
coverage in `tools/tests/test_munger_field_classify.py`. Do not reimplement
that fix. The PR reports an MD/MI/FL/DE staging re-import, not a fresh audit
of all affected Virginia records.

The October 18 production review matched all 20 Virginia source rows with
a leading unknown-date placeholder in `tools/wip/in/tblRawStateData.csv`
to 146 active Markings sharing those catalog passages on hellowoco.app.
This includes all 11 source rows with a bare diameter after the placeholder.
The database and public API agreed: no diameter was stored as a Rate Value.
No data repair or new parser change was needed. This check covers the
reported size-as-rate defect, not every field in those Markings.

Michael confirmed Amelia [22108](https://hellowoco.app/record/22108)
(29 mm Townmark, no Rate Value) and
[22109](https://hellowoco.app/record/22109) (5-cent Ratemark), then moved T9
to Testing. Other checked examples include Falls Church
[22355](https://hellowoco.app/record/22355), Pendleton
[22885](https://hellowoco.app/record/22885), and Wadesville
[23231](https://hellowoco.app/record/23231).
Staging (woco.dev) had zero active Virginia Markings on October 18, so the
card's staging data check remains unavailable; production results do not
establish staging coverage.

- [x] Parser distinguishes an unknown-date/size placeholder from a real diameter or rate
- [x] Verify Amelia and other affected VA records in production; no size-as-rate errors found
- [x] Michael confirms the two Amelia production examples
- [ ] Resolve the staging coverage gap before final acceptance: verify Virginia data when available, or explicitly accept production-only scope

### Issue 4 -- Marking-shape parsing: circle imported as straight-line (New Glasgow)
**Status:** Testing - [T10](https://trello.com/c/GgrdimJ1) - **Assigned:** Michael (`grubermeister`) - **Depends on:** none - **Source:** Greg Stone
Greg's original report described New Glasgow circles imported as straight-line
Markings. The October 18 production review did not reproduce that error.
Legacy source rows 457 and 880 in `tools/wip/in/tblRawStateData.csv` contain
`NEW GLASGOW/VA.(1835-50;30;5;Black,Red) 25`. Production Townmarks
[22751](https://hellowoco.app/record/22751) (black) and
[22752](https://hellowoco.app/record/22752) (red) both report Circle and
30 x 30 mm through the public API. The source image
`backups/images/virginia/Marking-457-4819.jpg` visibly shows a circle;
its SHA-256 matches the image attached to both production records.

All 19 New Glasgow search results were checked. None reports a straight-line
Shape. The four additional VPHC Townmarks report Circle, and the Manuscript
Markings have no Shape. No data repair was needed. Michael moved T10 to
Testing after reviewing these results. Staging (woco.dev) had zero active
Virginia Markings during the same session's T9 check, so staging coverage
remains unverified.

- [x] Verify the two ASCC New Glasgow Townmarks have the correct circular Shape in production
- [x] Check the other New Glasgow results for circles classified as straight-line
- [ ] Resolve the staging coverage gap before final acceptance: verify Virginia data when available, or explicitly accept production-only scope

### Issue 5 -- Import updated VA data from worldcovers.org
**Status:** Doing - [T11](https://trello.com/c/eU2o17lO) - **Assigned:** Reese Ludwick - **Depends on:** none
Reconcile the Virginia legacy-source snapshot with current WoCo records before
requesting another import. Record the source date, matching keys, target site,
counts, missing/extra records, and release disposition. The original request
does not establish that the current target is missing those records.
- [ ] VA records from worldcovers.org present in the new system
- [ ] Record counts reconcile between source and target

### Issue 6 -- Finish VPHC data reconciliation and editor acceptance
**Status:** Doing - [T12](https://trello.com/c/AqdYZttW) - **Assigned:** Reese Ludwick - **Depends on:** Issue 5 data reconciliation
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

### Issue 8 -- State rollout tracking
**Status:** Doing - [T13](https://trello.com/c/kWFoGpi3) - **Assigned:** Michael (`grubermeister`) - **Depends on:** none
Current rollout evidence, reconciled October 25:

- Michigan is in production and all checks are complete, confirmed by Michael
  on October 25. T21/T22/T55 are Done; no repeat load or acceptance pass.
- Massachusetts was loaded on woco.dev. The October 18 BPM2 audit covered
  5,349 Massachusetts Markings; the Citation pass is complete (T19).
- T13 records Michael's October 21 confirmation that Hawaii's 13 Markings
  were promoted to production and removed from testing after review.
- The October 24 session found 33 staging-only states with 31,687 Markings.
  This is dated coverage evidence, not a current count after later promotions.
  The weekend promotion plan alone does not prove completion for other states.

The table below is the September 19 snapshot with the October 18 Michigan
annotation. Later results above supersede it. Unverified coverage for other
states is not an instruction to repeat their loads.

| Stage | Sections / next work |
| --- | --- |
| Loaded into hellowoco.app production | WV, VA, MD, DE, FL, AL, IL, DC, IA, NC, OH, CT, TN |
| Deleted from woco.dev after production load | MD, DE, AL, IL, DC, IA, OH, CT, TN |
| Still in staging | MI: withheld from production pending further review, including known issues and completeness audit; WV: possibly missing VA entries; VA: verify VPHC additions; FL and NC: attempt OCR |
| Need staging load for initial review; suggested Editors exist | LA, VT, GA, RI, ME, NH, NJ, SC, TX, OK, HI, MS, CA, ND, NM, AZ, CO, UT, NE, MO, AR, NV, WI |
| Difficult and unloaded | NY, PA, MA, KY |
| Deferred until everything else is finished | AK, SD, IN, WA, OR, ID, WY, MT, KS, MN, XX |

The September 19 claim that every staging Entry also exists in production
is historical and cannot establish current coverage. Do not assume staging
and production have the same records or field values. XX is retained as supplied.
Suggested Editors are not confirmed appointments or permission assignments.
The Editor roster is implemented; accuracy of Collection assignments remains
a separate data check.

October 18 roster privacy correction (T46): Michael requested names and state
assignments without email addresses on the Editor screen. The page and
`/api/v2/editor-roster/` now omit emails. Local roster API tests and all 475
frontend tests passed. Staging deployment at `2e77277` passed; hosted page and
API verification remain pending. The T46 Trello description now states the
no-email requirement, with the prior description preserved in a comment.

September 28 source review: Massachusetts source preparation has progressed
through offline review and fixes in published source commit `9f34260`. That
review did not establish a load; the later October 18 staging audit above does. The September 19 state groups remain a dated report.

- [x] Record the current reported state groups
- [ ] Record source preparation, staging/production revisions, review, and acceptance as each section progresses
- [ ] Record remaining state-specific checks without repeating completed MI/HI work
- [ ] Load review-ready sections following the per-state coordination requirement in Batch #31

## UI copy & forms

### Issue 13 -- Submit New Marking page updates
**Status:** To Do - [T15](https://trello.com/c/v7KiOTHu) - **Assigned:** Michael (`grubermeister`) - **Depends on:** none (submission guidelines are implemented)
- [x] Rename "Create Marking" -> **"Submit New Marking"**
- [x] Expose **ERD** (Earliest Recorded Date) and **LRD** (Latest Recorded Date) fields for state editors
- [ ] Verify Reference Work choices for **"ASCC Edition 5", "ASCC Edition 6", "VPHC Catalog 1st Edition"** on each intended site; record IDs/titles and repair only confirmed duplicates or omissions
- [x] Apply the shared submission guidelines block
- [x] Townmark field explains that it means the **EXACT** text on the marking
Progress note, 2026-07-03: page H1, state-editor ERD/LRD, centralized
guidelines, and exact-text help are implemented. The original duplicate-ASCC
report needs a current check. PR #57 reports ASCC edition availability at that
time, and PR #106 adds VPHC reference data; neither proves current choices.

### Issue 14 -- Submit Edit to Marking page updates
**Status:** To Do - [T16](https://trello.com/c/uyTgorOk) - **Assigned:** unassigned - **Depends on:** none (submission guidelines are implemented)
- [x] Rename "Edit Marking" -> **"Submit Edit to Existing Marking"**
- [x] Date-format selector: "Select one or more date formats" -> **"Select Date format"** (single-select)
- [ ] Resolve the original year-and-month code question with Ian: the historical request listed YMDD twice. Its old MD = month/day wording is not the current glossary definition (MD = Month date only). Use [the glossary](docs/glossary.md) for current code meanings; the glossary does not establish Ian's decision.
- [x] Add ERD/LRD fields for state editors
- [x] Apply the shared submission guidelines block
Progress note, 2026-06-15: edit-marking H1 now uses the requested wording; date
format now behaves as a single-select radio menu and uses the requested empty
state text.
Progress note, 2026-07-03: state-editor ERD/LRD and centralized guidelines are
implemented on the shared marking form.

## Markings model & display (Greg Stone parsing feedback)

### Issue 19 -- Ratemark display: plain vs. in-circle rate
**Status:** Testing - [T17](https://trello.com/c/Vf3dOZAe) - **Assigned:** Michael (`grubermeister`) - **Depends on:** none - **Source:** Greg Stone
Show the difference between a plain rate ("5") and a rate enclosed in a circle --
as the Stampless catalog distinguishes Cumberland vs. Curdsville.
- [ ] A "5" and a circled "5" render distinguishably
- [ ] Cumberland and Curdsville display their correct rate styling

## Content, branding & citations

### Issue 23 -- Branding: APMC + Classics Society
**Status:** Doing - [T18](https://trello.com/c/E8OcLZaT) - **Assigned:** Reese Ludwick - **Depends on:** none - related **[R7]**
The October 23/24 decision records the approved APMC name and Society seal.
T98 implemented them in PR #208, with staging deployment recorded. T99
implemented the Society link and donation target in PR #210, also deployed
to staging. The original request for a membership link conflicts with the
latest T18 comment saying none was requested; no membership link is present.
Michael's final disposition of that discrepancy and remaining acceptance
stay on T18. Name and logo approval are complete, not a new approval task.

### Issue 24 -- Per-state reference citations
**Status:** Testing - [T19](https://trello.com/c/FN102Dm0) - **Assigned:** Michael (`grubermeister`) - **Depends on:** 13
As each state is added, attach its source reference/citation (e.g. VPHC Catalog) --
listings from another catalog are accepted as genuine on that catalog's authority.
- [ ] Imported listings carry their source reference work
- [ ] VA imports cite the VPHC Catalog where applicable

Production review completed 2026-10-18 on `hellowoco.app`; awaiting acceptance
in Testing. Applied and verified 14 ASCC6 additions (Reference Work 14), one
VPHC1 addition (15), and 40 FPHC2 additions (17). All approved changes passed
public API checks. Final counts: 30,106 active Markings; 24,600 cite ASCC6,
5,754 cite VPHC1, and 40 cite FPHC2. Counts overlap. The 31 uncited Markings
are the two excluded legacy records and 29 later additions; no missing source
Citation has been established for them. Completely new work may be uncited.
Staging was not audited. Michigan remains withheld on `woco.dev`.
Detailed source mappings, per-state audit evidence, and change records are in
`tools/wip/review/t19-production-2026-10-18/`. The dated steps below preserve
the review history; final results and decisions take precedence.

Source decision confirmed by Michael on 2026-10-18: a legacy source row
without original catalog text did not come from ASCC6. Catalog text generated
by the importer from split fields does not establish ASCC6 provenance.
Exclude Markings 21884 (Benwood), 21885, and 21888 (Berkeley Springs) from
the proposed ASCC6 additions. Preserve their existing Citations.

Michael approved ASCC6 for Marking 21032 on 2026-10-18. Citation 52650
was added in production and verified on its public page. Audit transaction
19905 and MarkingVersion 18374 record the change. No catalog locator was
invented.

Michael confirmed on 2026-10-18 that legacy Markings with original catalog
text require an ASCC6 Citation. Applied the remaining 14 additions in production
and verified all 14 through the public API, preserving existing Citations.
Together with Marking 21032, all 15 approved additions are complete. A fresh
production check found only the three excluded Markings above still have
catalog text without ASCC6; their text was generated by the importer.
North Mountain exception confirmed by Michael on 2026-10-18: Marking 21789
was originally from ASCC but revised from VPHC. Replaced the ASCC6 Citation
added during this repair with VPHC1 only and verified production. Updated
only the Citation fields of Contribution 4008 to retain VPHC1; it remains
pending. Source interpretation is Michael's decision; no catalog locator
was supplied. The final repair is 14 ASCC6 additions and one VPHC1 addition.
The Contribution remains pending. Michael approved moving T19 to Testing
on 2026-10-18; the card and this issue now record that status.

FPHC follow-up completed on 2026-10-18: created Reference Work 17 (`FPHC2`),
*Florida Postal History 1763-1861*, second edition, 2021, edited by Deane R.
Briggs, Francis Ferguson, and Thomas M. Lera; publisher Florida Postal History
Society; ISBN 978-0-692-04014-0. Verified the title and publication details in
`tools/wip/in/Florida Postal History Catalog.pdf`, pages 1-2, and Iola Type I
on page 176. The online bibliography at https://www.sefsc.org/books.html lists
2022 for the later edition; retained 2021 as printed in the cited PDF.
Added Citation 52666 (`p. 176`) to Marking 51999 and verified the public API.
Michael also approved FPHC2, page 176, for Iola Type II Marking 52000.
Added Citation 52667 on 2026-10-18 and verified the public API.

FPHC description pass completed on 2026-10-18: added FPHC2 Citations to
12 further Florida Markings whose descriptions name the catalog: 32846, 32847,
33226, 52002, 52003, 52004, 52005, 52006, 52007, 52008, 52009, and 52010.
Also added the approved Alligator Type VI Citation to 52001 (pages 58 and 60).
Checked page references against the local PDF and verified all 13 additions
through the public production API. Preserved existing ASCC6 Citations.
The two Iola Citations were already complete. All 14 description matches
now have FPHC2 Citations; Marking 52001 brings this pass to 15 cited Markings.

Michael confirmed on 2026-10-18 that Florida Markings with catalog Type
labels require FPHC Citations. Added FPHC2 to all 25 remaining matching
Markings, using page references checked in the local PDF; verified all 25
through the public production API. Preserved the 18 existing ASCC6 links.
All 34 Florida Markings with Type labels now cite FPHC2. FPHC2 now has
40 Marking Citations from this review.

Citation rule clarified by Michael: completely new work may remain uncited.
A blank Citation alone is not a defect or a T19 blocker. After this pass,
29 of the later additions remain uncited; this review has not established
that they require a Citation. Do not assign ASCC6 or require manual source
review merely because they have no Citation.

Massachusetts BPM2 Citation pass: **Testing**, completed on `woco.dev`
on 2026-10-18; Michael confirmed completion and Testing status on
2026-10-25. All prepared BPM2 Citations were already present. Removed
10 blank duplicates; 225 BPM2 Citations remained, with zero duplicates
and ASCC6 Citations preserved. No additions were needed.
Evidence: `tools/wip/review/bpm2-2026-10-18/result.json` and
`verified-removals.json`. This staging evidence does not establish later
production coverage. T19 retains this pass; [T49](https://trello.com/c/bvNVhddr)
retains its separate catalog-interpretation work.
- [x] Complete the separate Massachusetts BPM2 Citation pass

# Michigan E2E follow-ups (from PR #50)

The Michigan reconciliation is complete. Michael confirmed on October 25
that it is in production and all checks are complete. The October 24 bundle
review accounts for 1,457 source rows, six explained exclusions, 2,390
Markings, 559 Covers, and 436 Images. The local load and 94 review links were
verified before promotion. Preserve the reviewed bundle and manual corrections
in `tools/wip/review/mi-2026-10-24/`, including its source questions and
candidate-duplicate notes; those notes do not reopen the accepted rollout.

### Issue 28 -- Michigan territory-suffix reconciliation

**Status:** Done - [T21](https://trello.com/c/ECYaM9WU).
The corrected bundle has no retained territorial suffix in Post Office names.
The old 173-of-837 count is historical. Jurisdiction text and source context
are preserved. Production checks are complete per Michael, October 25.

### Issue 29 -- Port Lawrence #1/#2 source and office identity reconciliation

**Status:** Done - [T22](https://trello.com/c/VMnasWSJ).
Source rows 20964-20967 map to three Markings; #1/#2 context is preserved in
notes. The earlier parser exclusion is repaired. Production checks are
complete per Michael, October 25. T23/T24 below retain their separate scope.

### Issue 30 -- Bless `regions.csv` territory rows into canonical data + DB
**Status:** To Do - [T23](https://trello.com/c/u5qtEgAp) - **Assigned:** Michael (`grubermeister`) - **Depends on:** none (historical Michigan pipeline run completed)
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
**Status:** Doing - [T24](https://trello.com/c/2GkfHBtv) - **Assigned:** Michael (`grubermeister`) - **Depends on:** none (historical Michigan pipeline run completed)
Territory regions hang off USA (parent id 1), not off their successor state -- so a
`region=MI` search won't include Michigan Territory markings as modeled. Decide
whether territories should also parent under (or alias to) their successor state
for search. Also: region filtering is per **post office**, not per **marking** -- a
town in two regions shows all its markings under either filter (correct per the
junction, but a territory-UI design input).

# Open decisions

The contacts below come from the original feedback. They identify who was
asked for a decision, not the current task assignee. T23 remains To Do under
Michael; T18 is Doing under Reese and T24 is Doing under Michael.
T16 remains To Do and unassigned. T21/T22 are accepted and Done.

| Original issue | Decision | Original decision contact | Current task |
|---|---|---|---|
| Issue 14 | Confirm the "year-and-month" date-format code (source listed YMDD twice) | Ian | T16 |
| Issue 23 | Name/seal approved and implemented; resolve membership-link scope discrepancy and remaining acceptance | Michael | T18 |
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

Implementation context for features with remaining work in
`docs/devel/design.md`. Completed stories are omitted.
The design defines scope and points here for status. This table was reconciled
with current source and live Trello on October 25, 2026. Older review baselines
above are historical. Publication, deployment, data coverage, and acceptance
remain separate. Routes are registered in `frontend/src/App.tsx`.

| Feature | Where implemented | Status |
|---------|-------------------|--------------|
| F2 Collection Discovery | SPA (`/`, `/search`, `/record/:id`, `/covers/:coverId`); S5 document exports not found | To Do: S5; Testing: T78 (fix published and production deployment succeeded; current production verification, acceptance, and the public-identity policy question remain open) |
| F3 Submission Workflow | SPA contribution and editor review flows, including bulk approval/rejection (see notes below) | Testing: T72; Doing: S35 (implemented; verification and acceptance remain) |
| F4 Comment Workflow | Deferred: standalone Entry comments; existing notes to the Editor are part of Submissions | Backlog: S16, S17 |
| F5 Image Attachments | SPA (image upload inside contribution forms) | Testing: T73 |
| F6 Reference Work Management | Editors add and edit through the SPA Reference Works page (`/reference-works`, October 22) and `/api/v2/reference-works/`; Django `/admin/` remains; no delete in the application | Testing: S19 |
| F7 Collection Administration | SPA `/admin/collections` (superuser only), Editor-only `/editors` roster, and Django `/admin/` | Backlog: S20 |
| F8 Audit Trail | SPA submission transactions and editor/admin record-history views; django-reversion history in Django `/admin/` | Doing: S23; Testing: T74 (preview/restore implemented in PR #206; acceptance remains) |
| F9 Documentation & Help | SPA (`/help`, `/help/:docSlug`); articles authored as repo Markdown; Rights and Attribution article published October 22 | Testing: S24, S33, S34, T69 |
| F10 System Maintenance | Operator CLI and deployment workflows -- see `docs/devel/RUNBOOK.md`; no application interface | Testing: S27; To Do: S25, S26 |
| F11 Catalog Data Pipeline | Offline tooling -- see `docs/devel/TOOLS.md` and `docs/devel/PIPELINE.md` | State-specific data tasks remain open; see Data & ingestion and Other follow-ups. |
| F12 Engineering | Shared developer docs, test coverage, accessibility, performance, and dependency checks | Doing: T1; To Do: T4-T6; Backlog: T2, T29, T61 |
| F13 Project Administration | Design, branding approval, and board governance | Doing: T18; Trello Policy is in README |

The deferred stories are S16, S17, S20, S36-S38, S40, and S42-S49.

Notes:

- **F3**: Contributors submit new Entries via `/contribute`, edit pending
  submissions via `/edit/:id`, and see any submission's status at
  `/contribution/:id`. Editors review, approve, reject, and return
  submissions from `/dashboard` (Editor Dashboard) and `/contribution/:id`
  (`ContributionDetail`). The SPA Editor Dashboard also supports bulk approve
  and reject, shipped in [PR #118](https://github.com/CoverCensus/worldcovers/pull/118).
  Django `/admin/` has secondary bulk actions for administrators.
  T72's Citation preservation fix is implemented and locally verified with
  multipart and JSON tests and browser checks. Hosted verification and
  acceptance remain. T40's original-Contributor preference protection is
  implemented; cumulative credit remains open.
- **F5**: T73's Image API responsibility checks are implemented and locally
  verified, including source and destination checks for moves. Hosted
  verification and acceptance remain.
- **F8**: Editors/admins can view record history on marking and cover detail
  pages. This is separate from the full django-reversion interface in Django
  `/admin/`; history is not limited to that admin interface.
  PR #206 shares a preview/restore plan for recorded scalar fields, Citations,
  Image rows, Dates Seen, and Cover links/valuation. Missing files and
  unrecorded relationships remain explicit limits. T74 is Testing separately
  from S23 history viewing.
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
