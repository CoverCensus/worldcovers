# WorldCovers / APMC -- Consolidated Issues

This file tracks the original beta-feedback issues and the MD/MI review
batch, plus the reconciled September 19 offline-note follow-ups. It is not
the full current engineering queue. Later work also appears
in GitHub PRs and Reese's workspace-local `docs/issues.md`.

**Latest focused review:** 2026-10-18, local quick fixes for T82, T83, T32,
S33, and T1. See the October 18 notes below for implementation and checks.
The earlier Issue 2 / T8 production check remains recorded under Issue 2.

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
current staging lacks this fix. Preserve it in future production promotions.

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
`ac1e294` (yearless date display) and `d588878` (T38 linking) are
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

## Current status (2026-10-18, focused updates)

After the October 17 approved sync, Trello had 29 Backlog, 40 To Do, 9 Doing,
18 Testing, and 38 Done cards, excluding the README policy card. T82/T83
were added to To Do and T20 moved from Testing to Done. Counts, affected
descriptions, completion flags, labels, and existing memberships were checked
after the writes. A merge does not establish acceptance or data coverage.
On October 18, Michael moved T8 to Testing after the production check below;
the live card confirms Testing, Michael's assignment, and incomplete acceptance.
The October 17 board counts above are a dated snapshot, not a new board audit.

T9, T10, T13, T19, and T24 are Doing under Michael (`grubermeister`).
T11, T12, and T18 are Doing under Reese. T7, T15, T21, T22, T23, T26,
T28, T42, and T55 are To Do under Michael. T43, T44, and T66 are To Do
under Reese. Other To Do and Backlog cards remain unassigned unless noted.

T31, T36, T14, T46, T67, T75, T80, and T81 are Done.
T38, T65, T76, and S12 are Done with October 5-6 verification and acceptance
recorded in their card comments. T32-T35 and T50 remain Testing under Michael.
T8, T17, T27, T40, T45, T72, T73, and T77 are Testing under Michael;
T37, T78, and T79 are Testing under Reese.

S6, S7, S8, S15, S18, S22, S30, S31, S32, and S41 remain accepted.
S16/S17, S20, and T52-T54 remain Backlog. S27 stays Testing for operator
tools; it does not require an application update interface.

Ian declined ordinary Contributor linking (Issue 26 / T20) and social ratings
(S39), as recorded by Michael on October 9. T20 closes the permission decision;
S39 is Done for a declined request, not an implemented ratings feature.
S39 has no member; retain that assignment gap rather than invent an owner.
The design still lists S39 as deferred and needs a separate correction.

Michael confirmed Color and child-inscription cleanup on both sites on
September 26. Reese verified and accepted T65 on October 5; T50 remains
Testing. Do not repeat completed repairs from historical checklists.

The September 27 session plan was T8's Richmond check, then T9's Amelia
rates and T10's New Glasgow shapes. Find source rows and target IDs first,
compare staging and production separately, and repair only confirmed
mismatches. The Doing status is from Trello; no new site-check result is
established by the September 28 review.
For T8, Michael limited the October 18 acceptance target to production;
the verified results and remaining acceptance step are in Issue 2.
T15 remains To Do with Michael's assignment restored from the live card.

Current engineering responsibility: Michael owns data engineering, including
direct model adjustments. Reese owns other frontend/backend development.
Responsibility is distinct from a card assignment or a claim that work has
started. T31-T36 are Michael's explicit exception; split mixed work at the
model/data boundary rather than assigning it by directory alone.

| Work in Testing | Current assignees |
|---|---|
| S24, S27 | Michael (`grubermeister`), Jay Logan |
| S34, T8, T17, T27, T32-T35, T40, T45, T50, T72, T73, T77 | Michael (`grubermeister`) |
| T37, T78, T79 | Reese Ludwick |

The completed T20 move closes Ian's recorded refusal; it does not add permission.

S23 (Entry history) and S35 (bulk approval) are implemented and await
verification and acceptance. They remain To Do and unassigned on the board;
assign a reviewer before moving them to Testing. Code alone does not close them.

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

## September 21 email review

Michael requested this focused review and capture of remaining work. Baseline:
clean `staged-20260921` at published
`33b41f5da58e1b9337edc490f1c87eff6c009728`. This supplements the dated
September 19 review above. The later code review updates the current status
summary separately.

| Request | Current evidence | Remaining work |
| --- | --- | --- |
| Clean search colors such as RED 35 | The September 21 dropdown report is historical. Michael confirmed cleanup on both sites on September 26. PR #155 adds parser/repair work; PR #160 tracks the checker and operator guide. | T65 is Done: Reese verified both sites and recorded acceptance on October 5. Do not repeat the completed repair. |
| Remove Move to another marking | Removed from `ThumbnailImageActions.tsx`. | No new implementation task. T33's instruction to preserve actions excludes this deliberately removed action. |
| Remove Link existing cover from Marking detail | Removed from `RecordDetail.tsx`. | No duplicate removal task. T38 retains the work to define a clearer linking method; do not restore this control as part of the picker work. |
| Create cover from this image | Implemented: `RecordDetail.tsx` opens the ordinary Cover form; `CoverEdit.tsx` shows the existing image and sends its ID. `contribution_apply.py` moves the same Image row on approval, with no duplicate file or row. 2026-09-24: final Submit was rejected with "Add at least one cover image" because the image-required check counted only uploaded files; `_submitted_payload_has_images` now also accepts a positive `source_marking_image_id`. 2026-09-27: the resumed draft and the review gallery omitted the carried image because `submitted_data` holds only its id; `ContributionDetailSerializer` now resolves it as `source_marking_image` (null once the image leaves the marking), `CoverEdit.tsx` rebuilds the tile from that and sends the id from the gallery rather than router state, and removing the tile on resume clears the id through `removed_existing_image_keys`. The row still moves only on approval. | T37: verify the full flow using the example at https://hellowoco.app/record/21032 and a safe staging equivalent. Removal from the Marking occurs on approval, not merely on submission. Confirm that timing meets the request. Broader T37 work remains open. |
| State whether a submission is a Marking or Cover | Implemented in `ContributionDetail.tsx` and `CoverContributionDetail.tsx`, using `entryKindForContribution`. | T32 related verification: check https://hellowoco.app/contribution/91 with Editor access. Guest access redirects to login. Confirm its actual Entry kind and displayed label; old payloads without submission_kind use a heuristic. Repair data only if a mismatch is established. |
| Latest date on a second line | The munger already attaches a recognised (L) row's date to its parent Marking. The September 21 production check of https://hellowoco.app/record/30841 (HUNTSVILLE,M.T.) displayed 11/12/1813 for both bounds. The source's correct latest date was not established in this review. | T49: inspect the source second line, trace extraction, parsing, import, and date aggregation, then repair only the confirmed gap. Record source citation, expected precision, affected IDs, and results separately for woco.dev and hellowoco.app. No blind reimport. |

[T65](https://trello.com/c/j8JvVEDS) is Done under Michael and Reese, under F11 - Catalog Data Pipeline, with F2 -
Collection Discovery for the search effect. Data work belongs to Michael;
any application change belongs to Reese. T64 was reserved locally at intake
and is now mapped in Deferred offline wishes below.
Existing task memberships and lists are unchanged by this intake.

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

Michael also reported a request for a Rotate button alongside Crop.
Not implemented at the reviewed revision: `CropImageDialog.tsx` and the
image API support rectangular cropping, but have no image rotation action.
No matching task was found in the board review.
[T66](https://trello.com/c/bnjVBgXI) is To Do under Reese,
under F5 - Image Attachments; application work belongs to Reese.

Acceptance: add rotation alongside Crop, retain the original image, enforce
the existing image-edit permissions, and keep saved orientation, thumbnails,
image metadata, and later crops consistent after reload. Before implementation,
confirm whether quarter turns are enough or fine-angle straightening is needed,
and which Marking/Cover editing screens need the control. Related: T33/T37.

### Follow-up: VPHC Reference Work and Envelope Cover type

Michael requested VPHC in the Reference Works list and the Cover type
`ENV - Envelope`. The implementation and remaining checks are recorded below.

- **Issue 13 / T15:** `VPHC1 - Virginia Postal History Catalog (1st Ed.)`
  is present in the public Reference Work options on both
  [production](https://hellowoco.app/api/v2/reference-works/options/) and
  [staging](https://woco.dev/api/v2/reference-works/options/), checked during
  this follow-up. Retain the check of the signed-in Reference Works list and
  Marking/Cover form selectors, including saving the Citation. Do not create
  a duplicate VPHC record. `getReferenceWorks()` reads only the first page;
  check pagination if an existing work is missing from a form. The VPHC
  ledger requires an existing VPHC1 row; `import_vphc_reference` loads places
  and postmasters, not the bibliographic Reference Work.
- **[T67 - Add ENV - Envelope as a Cover type](https://trello.com/c/JN6C4SVt):** Done under Michael, F3 -
  Submission Workflow. [PR #156](https://github.com/CoverCensus/worldcovers/pull/156)
  added FL, FLF, ENV, ENVF, FC, and UNK. Migration 0018 widens `Cover.type`
  to four characters. New forms default to UNK and normalize blank or unknown
  form values to UNK; stored blank values remain allowed. Model documentation
  and regression tests cover the change. The accepted scope includes create,
  draft/resume, submit, review/approve, display, and edit.

Evidence: [Cover model](backend/common/models.py),
[submission validation](backend/common/api/v2/views.py),
[approval types](backend/common/contribution_apply.py),
[Cover form](frontend/src/pages/CoverEdit.tsx), and
[Reference Work service](frontend/src/services/referenceWorks.ts).

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
and images. [T69](https://trello.com/c/BAU8GBYS) is To Do, unassigned,
F9 - Documentation & Help. Current public
Help has no dedicated guidance; the footer says all catalog data is available
under CC BY 4.0, but that statement alone does not establish the rights for
each imported source or image.

Acceptance: publish a discoverable Help section covering source citations,
image creator/rights-holder credit, contributor credit and name preferences,
submission permissions, reuse terms, and how to raise a rights or credit
correction. Include separate worked attribution examples for data and images,
with source and license links and any changes made. Establish the applicable
project terms and source-specific permissions before stating them as policy;
distinguish software licensing from data and image terms. Reconcile the
footer with the confirmed policy, and explain how to handle missing or unclear
rights information. Preserve private correspondence and contact details.

Use an existing published Help document or deliberately add a new document
to the Help allowlist. Verify it is accessible to Guests. Related: T40 for
contributor credit; T61 remains the separate deferred software-license audit.
Evidence: [Help publication](backend/common/api/help.py),
[footer](frontend/src/components/Footer.tsx), and
[acknowledgements](docs/acknowledgements.md). This intake records the work;
it does not select a new license or publish a rights policy.

### Follow-up: Region type and county entry on new/edit pages

Michael requested Region type controls on new/edit pages so users can enter
counties. [T70](https://trello.com/c/u6OfTiMR) is To Do, unassigned,
F3 - Submission Workflow. Reese owns the
application work; Michael owns any required model/data changes.

The Region model already supports COUNTY and parent Regions, and
PostOfficeRegion has dated jurisdiction links. Marking detail displays
counties. The current Marking new/edit form accepts State and Town/City;
its Region options intentionally exclude counties. Submission approval
resolves the Post Office from state and town, with no county input path.
Storage and display therefore do not satisfy this request.

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

Michael reported that the application does not expose manual Postmaster
entry. [T71](https://trello.com/c/By0kwVmn) is To Do, unassigned,
F3 - Submission Workflow. Reese owns the
application work; Michael owns any required model/data changes.

Current Postmaster and PostmasterTenure APIs are read-only, and the frontend
fetches appointment events for display. The source-import command is not a
manual-entry interface. T31 changes display order only and does not cover
this missing capability.

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

Evidence: [read-only APIs](backend/common/api/v2/views.py),
[models](backend/common/models.py),
[frontend service](frontend/src/services/postmasters.ts), and
[import command](backend/common/management/commands/import_vphc_reference.py).
The current API comment that editing belongs to source catalogs describes
the existing limit; it does not satisfy the requested manual-entry workflow.

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
  upload and the uncropped original is not submitted. Production rollout is
  recorded in the October 15 card comment after PR #182 and the successful
  October 14 deploy. Verify the remaining shipped cases separately from
  the unresolved combined Marking/Cover and provisional Cover workflow.
  Both Entries require review; approval, draft, return, rejection, and
  parent/child behavior remain to be decided. T20 does not grant Contributor
  linking; T34/T35 retain wording and refresh checks.
- **[T76](https://trello.com/c/tRtMQsfN), Done under Reese:**
  PR #158 and the yearless-date fix published through PR #170 are accepted.
  Reese's October 5-6 API and browser checks cover full, partial, yearless,
  undated, and tied dates on both sites. No hosted example has more than ten
  Covers; that case is supported by `markings.coverPaging.test.ts`.
  Preserve date precision, stable ordering, and unchanged Marking thumbnails.

- **[T77](https://trello.com/c/lGfEJzSw), Testing under Michael:**
  The September 26 intake records production record 30876 showing `rough C`,
  despite the earlier report of `rough c`. Compare source, import text, and
  available record history to establish the cause and correction, or record
  the exact evidence gap. Preserve source wording; do not repeat a repair
  when the current value is correct.

## September 21 code-review gaps

The September 30 board snapshot has T72-T74 To Do and unassigned; T75 is Done
under Reese. These gaps were noted in DECISIONS.md and mapped to the tasks
below. Application work belongs to Reese; any model changes belong to Michael.
T72 and T73 were locally verified in `c0e09f3` and published through
[PR #176](https://github.com/CoverCensus/worldcovers/pull/176); hosted
verification and acceptance remain. The approved October 8 sync moved both
cards to Testing and assigned Michael to verification. T74's restoration
scope remains unresolved.

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
move. T20's resolved refusal does not block these checks.

Evidence: [ImageViewSet](backend/common/api/v2/views.py),
[permissions](backend/common/api/v2/permissions.py),
[ImageSerializer](backend/common/api/v2/serializers.py), and
[image write tests](backend/common/tests/test_image_write_permissions.py).

### T74 - Define and verify Entry version restoration

[T74 on Trello](https://trello.com/c/eX68bPRW) - F8 Audit Trail.

The Marking and Cover snapshot restore functions restore selected fields
and Citations, but not images or date observations. S23 covers viewing
history and does not close this recovery gap.

Define which fields and relationships version restoration must restore,
including image references and files, dates, and Cover/Marking links. Make
any limitations explicit before the action. Verify the agreed result for
both Entry types, including permissions, audit history, and rollback on
failure. Do not equate a partial snapshot restore with full Entry recovery,
recycle-bin restoration, or S26 backup restoration.

Evidence: [snapshot restore functions](backend/common/audit.py) and
[restore-version endpoints](backend/common/api/v2/views.py).

### T75 - Reconcile date guidance with Editor submissions

[T75 on Trello](https://trello.com/c/GCR4oSI9) - F9 Documentation & Help.

The September 21 glossary gap is resolved. [PR #164](https://github.com/CoverCensus/worldcovers/pull/164)
updated public guidance and direct Editor controls for Marking dates.
T75 is Done under Reese on the live board. Dates may come from catalog text,
Cover observations, or permitted Editor changes to Marking dates. Contributors
still supply dates through Covers. Preserve role checks and date precision;
T42 remains the separate Circa requirement.

Evidence: [Dates in the glossary](docs/glossary.md),
[date API](backend/common/api/v2/views.py), and
[Editor submission tests](backend/common/tests/test_contribution_submit.py).

## Quick fixes assigned to Michael

T31 and T36 are Done; T32-T35 are Testing. All six remain assigned to
Michael (`grubermeister`) at his request.
This is an explicit exception to the usual frontend/backend responsibility
boundary. The current source contains the UI changes; acceptance still
requires checking the affected pages and recording the site and revision.
T32's remaining generic catalog-code errors are corrected in the local
October 18 changes. Missing-code, duplicate-code, and generation
errors now identify the Marking or Cover. Hosted verification remains open.

| Task | Outcome | Feature | Acceptance scope |
| --- | --- | --- | --- |
| [T31](https://trello.com/c/LK3sXe5j) | Move postmasters below associated Covers | F2 | Show Associated Covers before the postmasters list on the Marking detail page. Preserve both sections and their existing behaviour. |
| [T32](https://trello.com/c/VkbZnDZ1) | Distinguish Marking and Cover catalog code labels | F3 | Use Catalog Marking code and Catalog Cover code in the relevant forms, review labels, placeholders, and error messages. Each code's Entry type must be clear. |
| [T33](https://trello.com/c/9XzQrOLb) | Split thumbnail action buttons into two rows | F5 | Verify the implemented two-row layout on desktop and narrow screens. Preserve current actions and permissions: Move to another marking was deliberately removed; Move to cover became Create cover from this image. |
| [T34](https://trello.com/c/L5tx4C7m) | Encourage Cover creation in the image upload warning | F3 | Explain that the image may show a whole Cover; suggest creating a Cover record or using an existing one. Preserve acknowledge-and-continue. The heuristic uses dimensions, not image recognition. This task changes wording, not creation workflow. |
| [T35](https://trello.com/c/8GLvhowq) | Refresh destination thumbnails after moving an image | F5 | Cover-to-Marking moves now refresh the source gallery and associated Marking previews; verify success, refresh failure feedback, and selection after removal. The former Marking-to-Cover move is now T37's Create cover from this image flow: verify both galleries after approval and return to detail. Do not restore the removed move control. |
| [T36](https://trello.com/c/FT3w6YrX) | Include town in Cover draft labels on Marking pages | F2 | Show the town and state when known in draft Cover labels on Marking detail cards. Reuse the API display name or existing location data, with a useful fallback for missing location. |

## Other follow-ups

T46 is Done under Michael; T50 is Testing under Michael. T52-T54 are
Backlog and unassigned. T37 is Testing under Reese; T40/T45 are Testing
under Michael. T38 is Done under Michael and Reese. T43/T44 are To Do under
Reese, T42/T55 To Do under Michael; other tasks here are To Do and unassigned.
The responsibility column directs planning;
it does not assert work has started or change existing card memberships.
Model/data work belongs to Michael even when a related interface belongs
to Reese. Source observations below describe code, not deployed behaviour.

| Task | Outcome | Feature | Responsibility | Scope and acceptance |
| --- | --- | --- | --- | --- |
| [T37](https://trello.com/c/u1f8iyjw) | Create image destinations from crop and move workflows | F5 | Reese; Michael for model changes | Shipped: carried-image flow, ordered approval, Cover-edit transfer, visible disabled actions, catalog crops into associated imageless Markings, and upload crops on Marking forms (PRs #173-#175, #181). Catalog crops keep the original; upload crops replace it. Testing under Reese. Combined Marking/Cover and provisional Cover states remain unresolved; retain both Entries' review and links. T20 keeps Contributor linking restricted. |
| [T38](https://trello.com/c/eB0oWj65) | Search for recognizable link and move destinations | F2 | Reese | Done. Published through PR #170; Reese accepted both-site browser checks on October 6. Whole-catalog search, pagination, existing-link status, Backstamp, and narrow-screen behavior were checked. Benton already had approved links, so no duplicate link was submitted. Preserve existing link/move scope and removed controls. |
| [T39](https://trello.com/c/YtcnoRop) | Compare proposed changes beside the current Entry | F3 | Reese | Show current and proposed values side by side during Marking and Cover submission review. Existing history is not this comparison. Acceptance: an Editor can identify changed and unchanged values before deciding. |
| [T40](https://trello.com/c/vqYH3R2Z) | Preserve contributor credit preferences across edits | F3 | Michael: model; Reese: application | Preference protection is implemented and locally verified in `c0e09f3`, published through PR #176, for Markings and Covers, including older drafts, direct API edits, and admin forms. Only the original Contributor can change their choice; public credit still uses `created_by`. Cumulative credit and each person's opt-in remain unresolved. Hosted verification and acceptance remain. Preserve Issue 17's completed original feature. Evidence: [preference tests](backend/common/tests/test_submitter_name_preference.py) and [form tests](frontend/src/pages/SubmitterNamePreference.test.tsx). |
| [T41](https://trello.com/c/LI10JpcC) | Define rescind and inactivity handling for submissions | F3 | Reese; Michael for model changes | Keep existing pending approve/reject/revision and owner withdrawal. Define rescind, the inactivity interval, and whether the request concerns submissions or published Entries before implementing additional actions. Acceptance: agreed transitions and permissions, then verified behaviour; no arbitrary deletion policy. |
| [T42](https://trello.com/c/dfKkGHWl) | Support circa qualifiers on Marking and Cover dates | F3 | Michael: model; Reese: controls | Store approximation separately from missing date components and offer the requested Circa control. Acceptance: qualifier survives submission, review, retrieval, and display for both Entry types without inventing date precision. Published source commit `9f34260` protects source `c1849` from becoming an exact year during bundle processing; it does not add the application field or Circa control. |
| [T43](https://trello.com/c/h55E9wFA) | Add captions to image upload forms | F5 | Reese | Expose editable per-image captions on Marking and Cover submission forms. Reuse Image.image_description unless a concrete distinction requires otherwise. Acceptance: caption persists and is available on image display after review. |
| [T44](https://trello.com/c/rkYy8Yqd) | Copy an existing Entry into a new submission | F3 | Reese | Start a new Marking or Cover submission prefilled from an existing Entry so Contributors change only the differences. Define which images, citations, and relationships copy. Acceptance: new submission never updates the source Entry or inherits approval/identity. |
| [T45](https://trello.com/c/9MUNA89m) | Add staff admin shortcut and review legacy admin items | F7 | Reese; Michael for model/data implications | Show "Admin Panel" first in the desktop user dropdown and mobile account actions when is_staff is true. Open /admin/ in the current tab. Keep Dashboard or My Submissions second, using the existing role-based label and destination. Review the deprecated Postcover registration before hiding/removing it; retain required access and data. Acceptance: the shortcut follows staff permission and only confirmed obsolete admin items are removed. Add Superuser-only magic-wand links from catalog list and gallery Marking boxes, Associated Cover boxes, and Marking and Cover detail headers to the corresponding Django admin change form in the current tab. Staff permission alone does not enable these record links. Exclude draft Submission boxes and removed Entries. The shortcut and wand links are published in source commit `084da79`; browser verification and legacy Postcover review remain open. Deployment is unverified. |
| [T46](https://trello.com/c/evcIZUrt) | Provide the Editor-only state roster | F7 | Reese: application; Michael: assignment data | Done. PR #163 implements `/editors` and `/api/v2/editor-roster/` for Editors and Administrators. Active users assigned to active Collections appear with name, email, and states. Guests and Contributors are denied. This replaces the public Help approach; the Help allowlist is unchanged. Assignment accuracy remains a separate data check. |
| [T47](https://trello.com/c/8AVh7K9r) | Report possible duplicate Markings in existing data | F11 | Michael | Scan state, town, type, shape, dimensions, color, and optionally dates. Define match rules; report candidate groups with record IDs and evidence. Matches do not authorize automatic merge/deletion. Coordinate matching with T48. Published source commit `9f34260` merges equal generated v1 results after context resolution and preserves source aliases; it does not implement this existing-data report. |
| [T48](https://trello.com/c/gQ639Ld4) | Suggest similar Entries during new and edit submissions | F3 | Reese; Michael: matching/data | Check for similar Markings or Covers before new/edit submission. Coordinate criteria with T47; define warning versus blocking and exclude the Entry being edited. Acceptance: useful candidate previews without false claims of identity. |
| [T49](https://trello.com/c/bvNVhddr) | Verify catalog interpretation and illustrated Cover capture | F11 | Michael | Review cross-reference exclusion (SHIP 1808-60), See State date references, date inheritance/precision, star ownership, and ring ornament placement against source pages. Capture IL illustrated Covers at printed pages 66 and 79 with citations. Account for exclusions and uncertainty rather than inventing fields. Related: T19, T25, T26; no blind reimport. |
| [T50](https://trello.com/c/B25HULz7) | Remove added parent town text from child inscriptions | F11 | Michael | Testing. Michael confirmed cleanup on both sites on September 26. The board records production record 40028 displaying Ratemark Text `10`. Preserve each child inscription and original source text; final verification and acceptance remain. The implemented `repair_ascc_child_inscriptions` commits by default; `--dry-run` previews. [Usage](docs/devel/TOOLS.md#ascc-inscription-repair-t50). Do not repeat the completed repair. |
| [T51](https://trello.com/c/os08ghUA) | Archive selected records before purge and sweep orphans | F10 | Michael | Extend existing purge/verification tools to dump selected records before deletion and identify orphan Citations/Images. Archive image bytes if deleting files. Acceptance: restorable archive is verified before erasure; dry-run reports scope. This is separate from S25/S26 application backup/restore. |
| [T52](https://trello.com/c/2djEMidu) | Preserve catalog sections within Collections | F7 | Michael: model/data; Reese: application | Represent each state's source section order and cited explanatory prose within its Collection. Preserve source structure during intake. This is not the deferred user comment workflow S42. Acceptance: one representative state retains section membership, order, and source prose. |
| [T53](https://trello.com/c/Q0KacWwW) | Compare sampled image colors and approximate Pantone matches | F5 | Michael: data/mapping; Reese: application | Use expected hex and sampled photo color for the first comparison, then approximate Pantone mapping. Existing Color storage is not a matching workflow. Define the Pantone reference and approximation method before implementation; distinguish this from deferred automatic predominant-color detection. |
| [T54](https://trello.com/c/GZp3g2kZ) | Decide how to represent Cover and strike condition | F11 | Michael | The ASCC header distinguishes Cover and strike condition; current models have no dedicated field. Decide whether and where to record it from evidence. This is a scope/model decision, not approval to invent grades from prices. |
| [T55](https://trello.com/c/8b8Xss1G) | Reconcile Michigan city by city before a verified rerun | F11 | Michael | Account for every Michigan source listing, including intentional exclusions, then rerun and verify corrected output on woco.dev. Record source version, target revision, omissions, duplicates, and acceptance; separate production promotion. Link existing T21/T22/T23/T24/T26 tails; Issue 7's historical pipeline completion stays done. |

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
API anonymity. Related: T40 credit preferences and T46's restricted roster.

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
  County entry through new/edit forms is still missing and is tracked in T70.
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

- **T80, Done under Reese, F3:** stored rates show without trailing zeros on
  edit and draft resume; unchanged rates do not create false history changes.
  [PR #179](https://github.com/CoverCensus/worldcovers/pull/179), promoted in
  [PR #182](https://github.com/CoverCensus/worldcovers/pull/182).
- **T81, Done under Reese, F5:** current Marking images are read-only on
  Submit Edit; edits append images only, enforced at submit and approval.
  [PR #180](https://github.com/CoverCensus/worldcovers/pull/180), promoted in
  PR #182. Older pending deletion requests retain the original images.
- **[T82](https://trello.com/c/aX5MzTQA), To Do, unassigned, F2:** implemented locally
  and visually accepted by Michael on October 18; publication and deployment
  remain pending. Catalog Search and Marking detail Color text is bold and
  uses the stored hex value, with a contrasting background and a plain-text
  fallback. Michael authorized approximate screen values: all 62 local Color
  rows were populated, then 28 compound values were revised. The palette
  covers all 49 production Color names checked on October 18. Names, Pantone
  codes, and Entry links were preserved; production data was not changed.
  These are display choices, not measured ink colors or Pantone matches.
  Separate from deferred T53/T56 and completed T65.
- **[T83](https://trello.com/c/F5gzAlhh), To Do, unassigned, F2/F3:** implemented
  locally in Catalog Search and both Dashboard tabs. Fresh views default to
  25; explicit choices, including 10, remain in the URL. Existing page-reset
  and return-navigation behavior remains. Service/API defaults and intentional
  picker/background-fetch sizes were reviewed and retained: these list views
  send their selected page size explicitly. Hosted verification remains open.
  S41 remains Done for its original configurable-pagination scope.

S39's [October 9 decision](https://trello.com/c/qVWJMQGK) closes the request
as declined, not implemented. The design's deferred S39 wording and the
DECISIONS.md statements about undecided Contributor linking and obsolete date
guidance need separate approved edits; this update changes ISSUE.md only.

## October 18 local quick fixes

Michael authorized these changes and the matching ISSUE.md/Trello updates.
The working tree is based on published `staging`
`972f3b7d24e2ae27874e52fc0b021f8b28affca0`. Changes in this commit have not
been pushed or deployed. Earlier unrelated ISSUE.md edits were left uncommitted.

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
- **[S33](https://trello.com/c/9TH4dywm):** the Marking new/edit form now has
  keyboard-accessible help for Lettering style, Impression, and Is Irregular,
  using the glossary meanings and the existing tooltip component. Existing
  visible Lettering guidance remains. The keyboard check covers focus,
  accessible description, Escape dismissal, and no accidental form submit.
  This bounded part is implemented; the broader tooltip story remains To Do.
- **[T1](https://trello.com/c/AvISZKlp):** README.md and BUILD.md now explain
  custom database setup, matching `WOCO_DB_NAME` to `DB_NAME`, environment
  precedence, and existing `mysql.cnf` handling. Checked against `tools/setup.sh`,
  `.env.example`, and Django settings; no fresh database installation was run.
  The broader developer-documentation review remains To Do.

Verification: 32 focused frontend tests and 14 backend tests passed, along
with frontend type checking, build, and diff checks. Lint had no errors and
three warnings in generated coverage reports. These checks do
not establish hosted acceptance. T82/T83 remain in their current To Do lane
with no members; the board policy requires an assigned member before moving
to Testing. The connector cannot assign card members. Their descriptions
record local implementation separately from that board-state limitation.

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
| Institutional designation | Batch #29 | **To Do** - [T26](https://trello.com/c/S7ZsuqjL), Michael (`grubermeister`); code implemented in [PR #66](https://github.com/CoverCensus/worldcovers/pull/66) and current starred-listing import |
| Clear Filters at the top | Batch #30 | **done** - [PR #64](https://github.com/CoverCensus/worldcovers/pull/64) |
| Per-state notification and editor review | Batch #31 | **Testing** - [T27](https://trello.com/c/cq72B5NA), Michael (`grubermeister`); staging re-import reported in PR #71; invitations and acceptance still to confirm |
| MD: Anna/Polis backstamp | Batch #32 | **done** - PR #71 |
| MD: S/D notation in notes | Batch #33 | **done** - PR #71 |
| MD: Barry manuscript and congressional-frank note | Batch #34 | **done** - PR #71 |
| MD: Ann.MD and B M House source entries | Batch #35 | **To Do** - [T28](https://trello.com/c/UpnN07Yq), Michael (`grubermeister`); investigate source match and decide handling |
| MI: merge Adamsville date variants | Batch #36 | **done** - PR #71 |
| MI: institutional flag for leading-star listings | Batch #37 | **To Do** - [T26](https://trello.com/c/S7ZsuqjL), Michael (`grubermeister`); code implemented; remaining data checks below |
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
**Status:** Doing - [T9](https://trello.com/c/TF3jpD2V) - **Assigned:** Michael (`grubermeister`) - **Depends on:** none - **Source:** Greg Stone
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
**Status:** Doing Do - [T11](https://trello.com/c/eU2o17lO) - **Assigned:** Reese Ludwick - **Depends on:** none
Reconcile the Virginia legacy-source snapshot with current WoCo records before
requesting another import. Record the source date, matching keys, target site,
counts, missing/extra records, and release disposition. The original request
does not establish that the current target is missing those records.
- [ ] VA records from worldcovers.org present in the new system
- [ ] Record counts reconcile between source and target

### Issue 6 -- Finish VPHC data reconciliation and editor acceptance
**Status:** Doing Do - [T12](https://trello.com/c/AqdYZttW) - **Assigned:** Reese Ludwick - **Depends on:** Issue 5 data reconciliation
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
Michael confirmed on October 18 that Michigan is withheld in `woco.dev`
pending further review and is not in production.

### Issue 8 -- State rollout tracking
**Status:** Doing - [T13](https://trello.com/c/kWFoGpi3) - **Assigned:** Michael (`grubermeister`) - **Depends on:** none
Michael reported the following on 2026-09-19, with Michigan corrected on
2026-10-18: Michigan is withheld in `woco.dev` pending further review and is
not in production. The October 18 production audit found no public Michigan
Markings, consistent with that decision. The other September 19 workflow
groups remain dated reports. The July rollout sequence is historical.
Production presence, data quality, and Editor acceptance are separate results.

| Stage | Sections / next work |
| --- | --- |
| Loaded into hellowoco.app production | WV, VA, MD, DE, FL, AL, IL, DC, IA, NC, OH, CT, TN |
| Deleted from woco.dev after production load | MD, DE, AL, IL, DC, IA, OH, CT, TN |
| Still in staging | MI: withheld from production pending further review, including known issues and completeness audit; WV: possibly missing VA entries; VA: verify VPHC additions; FL and NC: attempt OCR |
| Need staging load for initial review; suggested Editors exist | LA, VT, GA, RI, ME, NH, NJ, SC, TX, OK, HI, MS, CA, ND, NM, AZ, CO, UT, NE, MO, AR, NV, WI |
| Difficult and unloaded | NY, PA, MA, KY |
| Deferred until everything else is finished | AK, SD, IN, WA, OR, ID, WY, MT, KS, MN, XX |

The September 19 claim that every staging Entry also exists in production
is superseded by the October 18 Michigan correction. Do not assume staging
and production have the same records or field values. XX is retained as supplied.
Suggested Editors are not confirmed appointments or permission assignments.

September 28 source review: Massachusetts source preparation has progressed
through offline review and fixes in published source commit `9f34260`. Staging
load, production load, and Editor acceptance are not established by this
review. The September 19 state groups above remain a dated report.

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
**Status:** Done - [T14](https://trello.com/c/O90RdMxz) - **Assigned:** Reese Ludwick - **Depends on:** none
One reusable guidelines block (used on three submission pages -- define once):
1. Image quality -- "300 dpi preferred"
2. Rate vs. Auxiliary -- current Issue 21 convention: number-bearing markings are Rate; word-only markings are usually Auxiliary
3. Reference works -- "To add a new reference, please add a note to editor for approval and addition"
4. Date-verification -- "please include image verifying date if not on exterior of cover"
- [x] Reusable component/string exists with all four items
- [x] Content approved against Ian's wording -- accepted by Reese on 2026-09-24; the four subjects remain. PR #165 removed the unrequested review-time promise.
Progress note, 2026-07-03: centralized guideline labels live in
`frontend/src/labels/guidelines.ts`; Issue 21 resolved the Rate-vs-Aux wording.

### Issue 13 -- Submit New Marking page updates
**Status:** To Do - [T15](https://trello.com/c/v7KiOTHu) - **Assigned:** Michael (`grubermeister`) - **Depends on:** 12
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
The original Cover feature remains done. T40's preference protection is now
implemented and locally verified for edits; cumulative credit remains open.
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
**Status:** Testing Do - [T17](https://trello.com/c/Vf3dOZAe) - **Assigned:** Michael (`grubermeister`) - **Depends on:** none - **Source:** Greg Stone
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
**Status:** Doing Do - [T18](https://trello.com/c/E8OcLZaT) - **Assigned:** Reese Ludwick - **Depends on:** none - related **[R7]**
**WARNING Board approval required before merge.**
Replace "Worldcovers" branding with **APMC**, add the U.S. Philatelic Classics
Society logo, and add Society website / "Become a member" links.
- [ ] "APMC" branding + Classics Society logo replace "Worldcovers"
- [ ] Society website + membership links present and correct
- [ ] Final branding/logo/links confirmed with the board before merge

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

Separate follow-up requested by Michael on 2026-10-18: review Massachusetts
Markings that should also cite `BPM2` (*Boston Postal Markings to 1890*,
second edition). Check source references and target record IDs, then add
the supported Citations and catalog locators while preserving ASCC Citations.
Coordinate source interpretation with [T49](https://trello.com/c/bvNVhddr).
This is a separate pass from T19's current production repair; the target site
and affected records must be established before changes.
- [ ] Complete the separate Massachusetts BPM2 Citation pass

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
**Status:** Done Do - [T20](https://trello.com/c/yEfLz6cC) - **Assigned:** Michael (`grubermeister`) - **Depends on:** none
[PR #84](https://github.com/CoverCensus/worldcovers/pull/84) added linking in
both directions from the detail pages. Editors and administrators can repeat
this action to associate one cover with several markings without uploading
it again. Ordinary contributors do not have that write permission.

Narrowed 2026-09-21: "Link Existing Cover" was removed from the marking detail
screen at Ian's request ("both of these are confusing and we need to come up
with a better method"). The cover detail screen keeps its "Link Existing
Marking" control, so linking still exists, but in one direction only.
Decision, 2026-10-09: Ian declined ordinary Contributor linking, as reported
by Michael in the [T20 comment](https://trello.com/c/yEfLz6cC). Keep linking
restricted to Editors and Administrators; the API enforces that restriction.

- [x] Editors/admins can link existing covers and markings without another upload
- [x] Record the decision: ordinary Contributors may not create these links
- [x] Preserve the existing Editor/Administrator restriction

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
**Status:** To Do - [T21](https://trello.com/c/ECYaM9WU) - **Assigned:** Michael (`grubermeister`) - **Depends on:** 7
The historical Michigan run reported territory suffixes in 173 of 837 Post
Office names, including `M.T`, `Mic.T`, and `Mich.Ty or M.T`, with fragmented
town names. Those counts are not a current census. Confirm source rows,
current target records, and Michael's handling decision before changing or
re-running data. Removing suffixes is a proposed remedy, not a verified fix.

### Issue 29 -- `#N` office numbers: Port Lawrence #1 / #2 (2 real markings excluded)
**Status:** To Do - [T22](https://trello.com/c/VMnasWSJ) - **Assigned:** Michael (`grubermeister`) - **Depends on:** 7
The historical Michigan run reported a parser failure on `#` and provisionally
re-typed two Toledo-Strip listings (values 1000.00 / 1250.00) from LISTING to
META in scratch data. Locate those source listings and current target records
before asserting that they remain excluded. Michael must confirm literal `#`
or `NO. N` handling; repair only a verified omission or parsing defect.

### Issue 30 -- Bless `regions.csv` territory rows into canonical data + DB
**Status:** To Do - [T23](https://trello.com/c/u5qtEgAp) - **Assigned:** Michael (`grubermeister`) - **Depends on:** 7
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
**Status:** Doing Do - [T24](https://trello.com/c/2GkfHBtv) - **Assigned:** Michael (`grubermeister`) - **Depends on:** 7 - related **25, [R5]**, M2
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
asked for a decision, not the current task assignee. T21, T22, and T23 are
To Do under Michael. T18 is Doing under Reese and T24 is Doing under
Michael on the October 17 board. T16 remains To Do and unassigned.
Issue 26 is resolved: Ian declined Contributor linking on October 9.

| Original issue | Decision | Original decision contact | Current task |
|---|---|---|---|
| Issue 14 | Confirm the "year-and-month" date-format code (source listed YMDD twice) | Ian | T16 |
| Issue 23 | APMC branding / logo / Society links sign-off | Board | T18 |
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
The design doc is pure spec and points here for status. Implementation surfaces
and story status were rechecked September 28, 2026, against local `9f34260`
and published staging `50a3a5f`. Local-only changes and deployment limits are
recorded above. To Do can include further work on an implemented
capability. Routes are registered in `frontend/src/App.tsx`; re-verify against
that file when updating this table.
The October 8 focused review updated T40, T72, T73, and T78 implementation
notes. The October 17 review records T40, T72, T73, and T78 in Testing. The October 17 sync updates current board status and published implementation
evidence; the September board snapshot remains dated history.

| Feature | Where implemented | Status |
|---------|-------------------|--------------|
| F1 Authentication | SPA (`/auth`, `/reset-password`) | Done: S1 |
| F2 Collection Discovery | SPA (`/`, `/search`, `/record/:id`, `/covers/:coverId`); S5 document exports not found | Done: S2, S3, S4, S41; To Do: S5; Testing: T78 (fix published and production deployment succeeded; current production verification, acceptance, and the public-identity policy question remain open) |
| F3 Submission Workflow | SPA contribution and editor review flows, including bulk approval/rejection (see notes below) | Done: S6-S15; Testing: T72; To Do: S35 (implemented; verification and acceptance remain) |
| F4 Comment Workflow | Deferred: standalone Entry comments; existing notes to the Editor are part of Submissions | Backlog: S16, S17 |
| F5 Image Attachments | SPA (image upload inside contribution forms) | Done: S18; Testing: T73 |
| F6 Reference Work Management | Editor/admin add/edit through `/api/v2/reference-works/` and Django `/admin/`; the SPA has citation lookup but no management UI | To Do: S19 |
| F7 Collection Administration | SPA `/admin/collections` (superuser only), Editor-only `/editors` roster, and Django `/admin/` | Done: S21, T46; Backlog: S20 |
| F8 Audit Trail | SPA submission transactions and editor/admin record-history views; django-reversion history in Django `/admin/` | Done: S22; To Do: S23 (history viewing implemented; verification and acceptance remain), T74 (restoration scope) |
| F9 Documentation & Help | SPA (`/help`, `/help/:docSlug`); articles authored as repo Markdown | Testing: S24, S34; To Do: S33 |
| F10 System Maintenance | Operator CLI and deployment workflows -- see `docs/devel/RUNBOOK.md`; no application interface | Testing: S27; To Do: S25, S26 |
| F11 Catalog Data Pipeline | Offline tooling -- see `docs/devel/TOOLS.md` and `docs/devel/PIPELINE.md` | Done: S28-S32; separate data tasks remain open |
| F12 Engineering | Shared developer docs, test coverage, accessibility, performance, and dependency checks | To Do: T1, T4-T6; Backlog: T2, T29, T61 |
| F13 Project Administration | Design, branding approval, and board governance | Done: S0 and board setup; Doing: T18; Trello Policy is in README |

The deferred stories are S16, S17, S20, S36-S38, S40, and S42-S49.
S39 is declined, as recorded on October 9; its design entry is not yet corrected. S0 (design) and board setup
are also Done; they are not user-facing features in the design's S1-S49 map.

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
  verification and acceptance remain; S18's accepted status is unchanged.
- **F8**: Editors/admins can view record history on marking and cover detail
  pages. This is separate from the full django-reversion interface in Django
  `/admin/`; history is not limited to that admin interface.
  Snapshot restoration is partial; T74 tracks its scope and verification
  separately from S23 history viewing.
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
