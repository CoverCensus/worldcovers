# Decisions: Rules For Code Changes

Use these rules when changing WorldCovers. They connect the design to
behaviour supported by code and tests. Read the evidence for the area you
change; a rule here does not prove that every endpoint follows it.

[ISSUE.md](ISSUE.md) holds work and status. A linked task is not permission
to invent its unresolved policy. If sources disagree, state the difference
before making a behaviour change. These notes do not establish deployment
or acceptance. Update a rule when its design choice changes, not after every
repair or test run.

For earlier reasoning, see the frozen
[engineering archive](docs/devel/ENGINEERING-ARCHIVE.md) and
[VPHC decisions](docs/devel/VPHC-DECISIONS.md), including postmaster data.
Historical instructions in those files do not override current requirements.

## Keep Entry Types And Relationships Clear

**Do:** Use Marking for the cataloged postal Marking and Cover for the physical
Cover. Link them through `CoverMarking`. Use Entry when referring to either.
A Collection groups work for one Region and has assigned Editors.

**Don't:** Add an Entry table, copy Marking classification fields onto a
Cover, or use the existing Collection model for a person's private holdings.

**Why:** A Cover can carry several Markings, and a Marking can appear on
several Covers. Combining their data loses that distinction. A Collection
also sets responsibility for review.

**Evidence:** [Domain model](docs/devel/model.md#domain-tables);
[models](backend/common/models.py) (`Marking`, `Cover`, `CoverMarking`,
`Collection`); [Cover approval tests](backend/common/tests/test_cover_contribution_apply.py)
check separate Cover creation and its Marking link.

**Open work:** [S49](docs/devel/design.md#backlog-stories), Personal Collections,
is deferred and requires a separate model concept. Do not add it as part of
a repair to institutional Collections.

## Enforce Permissions In The Backend

**Do:** Check the user's role and permission for the specific operation in
the API. Preserve assigned-Collection checks for Submission review, including
each item in a bulk action. Preserve the existing Region checks for Marking
writes and Entry removal. Cover removal requires responsibility for all
linked Marking Regions; the Administrator has a separate override.
Check responsibility before ordinary Image creation, updates, and deletion.
Check both source and destination when moving an Image, including the linked
Marking Regions for a Cover. Preserve existing Administrator overrides and
Contributor restrictions.

**Don't:** Rely on a hidden button, a filtered screen, or permission to enter
the review area as proof that the user may change any Entry.

**Why:** Other clients can call the API directly. A role check alone does
not establish responsibility for a Collection.

**Evidence:** [Roles](docs/devel/design.md#roles) and
[API-first design](docs/devel/design.md#technical-constraints);
[permission checks](backend/common/api/v2/permissions.py);
[bulk review tests](backend/common/tests/test_bulk_review.py) and
[Entry removal tests](backend/common/tests/test_entry_remove_permissions.py);
[Image API](backend/common/api/v2/views.py) and
[image write tests](backend/common/tests/test_image_write_permissions.py).

The [T20 decision](https://trello.com/c/yEfLz6cC) keeps existing-record linking
restricted to Editors and Administrators; Contributor linking was declined.

**Open work:** [T37](ISSUE.md#other-follow-ups) covers related image and
destination workflows, not approval to widen access.
[T73](ISSUE.md#t73---scope-image-writes-to-collection-responsibility)
tracks hosted verification and acceptance of Image write checks.

## Keep Submissions Separate From Publication

**Do:** Keep draft, pending, needs revision, rejected, and approved states
distinct. Apply a Contributor's proposed catalog changes through approval.
Allow owners to withdraw their unapproved Submissions. Use the existing
Entry removal and recycle-bin flow for published Markings and Covers.

**Don't:** Publish a pending edit when saving it, or let Submission withdrawal
hard-delete an approved Entry. Hard-delete means permanent database deletion.

**Why:** Review must happen before a proposed change affects the catalog.
Removing a proposal and removing a published Entry have different effects
and permissions.

**Evidence:** [Submission stories S6-S15](docs/devel/design.md#stories);
[approval and removal paths](backend/common/api/v2/views.py);
[withdrawal tests](backend/common/tests/test_contribution_withdraw.py) and
[approval tests](backend/common/tests/test_cover_contribution_apply.py).

**Open work:** [T41](ISSUE.md#other-follow-ups) covers further rescind and
inactivity rules. Do not invent an expiry period or automatic deletion rule.

## Preserve Data That An Edit Does Not Change

**Do:** Preserve existing field values when an approved Marking or Cover edit
omits them. Handle a requested clear according to that field's validation.
Keep the form and approval code in agreement about omission and clearing.
For Citations, an omitted list preserves the stored set; a supplied list
replaces it, and an explicit empty list clears it.
Preserve every selected Citation and its details in multipart and JSON
submissions, including draft save, resume, review, and approval.

**Don't:** Build a replacement Entry using empty defaults for missing fields.
Do not assume every empty value is valid, or that supplied image, Citation,
and relationship lists are always appended to existing data.

**Why:** A partial edit describes only part of an Entry. Treating missing
values as empty can erase information the Contributor never changed.

**Evidence:** [Edit story S7](docs/devel/design.md#stories);
[approval helpers](backend/common/contribution_apply.py)
(`_apply_marking_edit`, `_apply_cover_edit`, `_sync_citations`);
[merge tests](backend/common/tests/test_marking_edit_merge.py) and
[Cover/edit tests](backend/common/tests/test_cover_contribution_apply.py);
[submission tests](backend/common/tests/test_submission_citations.py) and
[form tests](frontend/src/pages/SubmissionCitations.test.tsx).

**Open work:** [T39](ISSUE.md#other-follow-ups) covers comparing proposed and
current values during review.
[T72](ISSUE.md#t72---preserve-all-citations-in-multipart-submissions) tracks
hosted verification and acceptance of Citation preservation and explicit
clearing through the form workflow. [T40](ISSUE.md#other-follow-ups) covers
cumulative credit; preserve the public-credit rule below when changing edits.

## Serialize Only Approved Public Credit, Never User Objects

**Do:** Expose Marking and Cover submitter names only through the opt-in
`submitter_name`, using the original Contributor in `created_by`. Preserve
that Contributor's public-name preference when another person edits the
Entry. Only the original Contributor can change their choice through an
approved Submission, direct API edit, or admin edit form. Keep internal
audit identity and the separate permission checks for audit access.

**Don't:** Expose nested account objects, email, or account flags in public
Entry responses. Do not treat Editor review or Administrator authority as
consent to change another person's public-name preference.

**Why:** Corrections must preserve privacy and credit. A username alone can
identify a Contributor who chose not to receive public credit.

**Evidence:** [Public serializer fix, PR #171](https://github.com/CoverCensus/worldcovers/pull/171);
[serializers](backend/common/api/v2/serializers.py),
[approval helpers](backend/common/contribution_apply.py), and
[admin forms](backend/common/admin.py);
[public-response tests](backend/common/tests/test_marking_public_user_fields.py),
[preference tests](backend/common/tests/test_submitter_name_preference.py), and
[form tests](frontend/src/pages/SubmitterNamePreference.test.tsx).

**Open work:** [T40](ISSUE.md#other-follow-ups) requires a cumulative-credit
model and each person's opt-in.
[T78](ISSUE.md#prevent-public-disclosure-of-user-email-and-account-flags)
retains hosted verification and acceptance. Public reviewer usernames and
integer audit IDs remain a separate policy question; this rule does not
claim that every public identity field has been removed.

## Preserve Date Evidence And Precision

**Do:** Store the known date components and their precision in `DateSeen`.
Keep displayed earliest/latest Marking bounds derived from observations on
the Marking and its associated Covers. Preserve the existing date-range
calculation and its refresh when observations change.

**Don't:** Turn a year-only observation into a claimed exact day. A generated
date used for sorting does not supply missing evidence. Do not replace the
observations with a free-text Years Seen field or treat a partial date as
Circa, which means an approximate date.

**Why:** A missing month and an approximate year are different uncertainties.
Search and display must not make source evidence more precise than it is.

**Evidence:** [Date model](docs/devel/model.md#dates_seen);
[date calculation](backend/common/date_range.py);
[date-range tests](backend/common/tests/test_marking_date_range.py) and
[refresh tests](backend/common/tests/test_date_range_cache.py).

**Open work:** [T42](ISSUE.md#other-follow-ups) adds a separate approximation
qualifier for Markings and Covers. Partial dates do not implement it.
The [glossary](docs/glossary.md) and
[Editor submission tests](backend/common/tests/test_contribution_submit.py)
support direct Editor changes to Marking dates; Contributors supply dates
through Covers. The guidance correction is archived in
[T75](https://trello.com/c/GCR4oSI9). Preserve the working Editor path.

## Account For Historical Regions In Search

**Do:** Preserve one Marking when it belongs in more than one historical
Region context. Use its Post Office's Region relationships and the date
evidence. Treat a territory that later became parts of several states as
a historical Region, not as another name for just one modern state.

**Don't:** Duplicate a Marking to list it under another Region. Do not equate
historical jurisdiction, displayed state, search membership, and permission
to edit. Do not apply the VA/WV date rule to every territorial change.

**Why:** Political boundaries change. Finding an Entry under a Region does
not by itself establish who may edit it.

**Evidence:** [Region relationships](docs/devel/model.md#post_office_regions)
and [Marking context](docs/devel/model.md#markings);
[current filters](backend/common/filters.py);
[search-result tests](backend/common/tests/test_marking_list_fanout.py).

**Open work:** [Issue 31 / T24](ISSUE.md#issue-31----territory-searchui-surfacing)
tracks broader territory search policy. The model describes date-based
Region context; general filtering currently follows Post Office links,
with a separate dated VA/WV exception. That exception does not implement
a general solution for former territories or their successor states.

## Preserve Audit History And Distinguish Recovery Actions

**Do:** Use the existing approval and direct-edit paths that write the
change log and version snapshot. A snapshot is a saved state of an Entry.
Keep approval and its history writes in the same database transaction so
they succeed or fail together. Bulk review does this separately for each
Submission. Keep date edits audited against their actual Marking or Cover.

**Don't:** Replace these paths with a database update that skips history.
Do not treat viewing history, restoring a version, returning an Entry from
the recycle bin, and restoring a backup as equivalent actions.

**Why:** The catalog needs a traceable account of changes. A saved history
entry does not prove that every field and relationship can be restored.

**Evidence:** [Audit stories S22/S23](docs/devel/design.md#stories);
[approval paths](backend/common/api/v2/views.py) and
[snapshot code](backend/common/audit.py);
[bulk audit tests](backend/common/tests/test_bulk_review.py) and
[date audit tests](backend/common/tests/test_date_seen_permissions.py).

**Open work:** [S23](ISSUE.md#feature-implementation-surfaces-reviewed-2026-09-13)
is related history work, not a specific plan for full version restoration.
The current Marking and Cover snapshot restore functions restore selected
fields and Citations, but not images or date observations.
[T74](ISSUE.md#t74---define-and-verify-entry-version-restoration) tracks the
restoration scope and verification separately from history viewing.

## Publish Help Content Explicitly

**Do:** Publish Help articles only through the explicit document-name
allowlist in the Help API. Keep engineering notes and private rosters out
of that list. Generate the Editor roster from active users assigned to active
Collections. Restrict its names and state assignments to Editors and
Administrators through `/editors` and `/api/v2/editor-roster/`. Do not include
email addresses in this page or its API response.

**Don't:** Publish every Markdown file under `docs/`, or assume placing a
file under `docs/devel/` alone prevents publication. The API checks names,
not just directories. Do not publish proposed appointments or private
contact details in public Help. The restricted Editor roster is a separate
application page, not a Help article.

**Why:** Help is readable by Guests. Adding an internal file must not expose
it to the public.

**Evidence:** [Help stories S24/S34](docs/devel/design.md#stories);
[Help API](backend/common/api/help.py);
[publication tests](backend/common/tests/test_help_docs_allowlist.py);
[roster tests](backend/common/tests/test_editor_roster.py);
[PR #163](https://github.com/CoverCensus/worldcovers/pull/163).

**Open work:** [S24/S34](ISSUE.md#feature-implementation-surfaces-reviewed-2026-09-13)
cover Help and article authoring. Repo Markdown is the current article source;
there is no general article editor in the web interface.
[T46](https://trello.com/c/evcIZUrt) is Done for the restricted assignment-based
roster. [T78](ISSUE.md#prevent-public-disclosure-of-user-email-and-account-flags)
tracks verification and acceptance of the core public-user disclosure fix,
plus the remaining public-identity policy question. Roster permission tests
do not establish privacy on other endpoints.

## Distinguish Application Features From Operator Tools

**Do:** Check which interface a design story requires: the application,
Django admin, or operator tools. Follow the existing
[runbook](docs/devel/RUNBOOK.md), [backup guide](docs/devel/BACKUP.md), and
[deployment guide](docs/devel/DEPLOY.md) for server work.

**Don't:** Count a command-line backup as the application backup feature,
or build an application update screen to satisfy S27. Do not copy server
versions, commands, or deployment status into this file.

**Why:** Application permissions and server access are different. A tool
can work correctly without meeting the interface required by a story.

**Evidence:** [Maintenance stories S25-S27](docs/devel/design.md#stories);
[backup script](deploy/worldcovers-backup.sh),
[restore script](deploy/worldcovers-restore.sh), and
[deployment workflow](.github/workflows/build-and-deploy.yml);
[backup/restore safeguards tests](tools/tests/test_backup_scripts.py).

**Open work:** [S25/S26](ISSUE.md#feature-implementation-surfaces-reviewed-2026-09-13)
require application backup and restore. Existing operator tools do not
complete them. The same section records Michael's decision that S27 uses
operator tools and does not require an application update interface.

## Utilities Commit By Default

**Do:** Utilities that change data commit by default. Provide `--dry-run`
to preview changes without writing.

**Don't:** Make dry run the default or require `--commit` to perform the
utility's normal operation.

**Why:** Running the utility should perform its stated task. Testing
without changes is an explicit option.

**Evidence:** Michael's explicit instruction, 2026-09-24.

## Use The Existing Utility Work Directories

**Do:** Use `tools/wip/in` for utility input files, `tools/wip/out` for
generated output, and `tools/wip/cache` for intermediate or cached files.

**Don't:** Invent another input, output, intermediate, or cache location for
a utility.

**Why:** One known working area makes utility files easier to find, review,
and clean up.

**Evidence:** Michael's instruction, 2026-09-24;
[pipeline paths](docs/devel/PIPELINE.md) and [ignore rules](.gitignore).

## Keep Commit Work In Sync With Trello

**Do:** Assign the relevant Trello cards and move only the work in the current
commit to Doing. Run a focused worldcovers-sync-plan review. Develop and test
the change, then move those cards to Testing. Run worldcovers-code-doc-sync
for affected rules and a focused worldcovers-sync-plan check before pushing
and deploying. Apply proposed document and board corrections within the
approved task scope.

**Don't:** Treat the push or deployment as acceptance, or move cards from
Testing to Done as part of this commit workflow.

**Why:** The cards, code, and documents stay aligned as work moves forward.
Acceptance can be checked separately after the workflow ends.

**Evidence:** Michael's workflow decision, 2026-09-24;
[sync plan](.agents/skills/worldcovers-sync-plan/SKILL.md) and
[code and docs sync](.agents/skills/worldcovers-code-doc-sync/SKILL.md).

## Keep Test-Only Settings Under `TESTING`

**Do:** Put behaviour that exists only to make the suite fast or quiet (the MD5
password hasher, the WARNING log level) inside the `if TESTING:` block in
`backend/woco/settings.py`. Measure with `manage.py test --timing --durations 25`
before and after any change that claims a speed-up.

**Don't:** Delete, skip, or weaken a test to buy time, enable `--parallel` on
MariaDB without first proving the per-worker clone is populated, or let a
test-only setting leak into a production code path.

**Why:** The 2026-10 slowdown (2m50s per deploy) was ~650 PBKDF2 hashes in
`setUp()`, not the 461 tests; the one-line hasher change cut the suite from
137 s to 23 s with every test still running. On MariaDB Django clones the
test database through a `mysqldump | mysql` pipe whose failure it ignores,
and the GitHub runner ships MySQL 8 client tools that fail against MariaDB.
Evidence: `docs/issues.md` #179 (workspace register), `verify.yml` comments.

## Show Eligible Image Actions With A Reason, Never Hide Them

**Do:** On the Marking and Cover detail screens, render an editor's per-image
controls whenever the editor may act at all (`canManageImages` /
`imageActionState.showControls`), and disable a control with its reason as
visible text when the image is unsaved or its destination is missing
(`lib/imageActionState.ts`, `lib/coverImageActionState.ts`). Keep "Create
cover from this image" as the Marking-to-Cover path.

**Don't:** Hide a control because a destination list is empty, show a reason
only in a tooltip, or restore "Move to another marking" (removed at Ian's
request on 2026-09-21; ISSUE.md T33/T35). Do not widen who may act: roles are
unchanged and T20 owns any Contributor change.

**Why:** A hidden control reads as a missing feature; a Delaware editor lost
two days to one on the marking screen (workspace `docs/issues.md` 166). The
cover screen had the same defect in the other direction: it passed no
`onMoveImage` when the cover had no associated Marking and hid move and
delete for an unsaved image. Evidence: workspace `docs/issues.md` #180;
`EntryAssociatedThumbnailsCard.test.tsx`, `CoverDetail.imageActions.test.tsx`,
`coverImageActionState.test.ts`.

## Approve Images In The Order The Contributor Arranged

**Do:** Record the carried marking image's gallery index as
`source_marking_image_position` when a cover submission is saved
(`image_order` is consumed at submit and never stored), expose it on the
contribution detail as `source_marking_image.position`, and let approval place
the repointed row at that slot, shifting later rows by one
(`_repoint_source_marking_image`). Honor `source_marking_image_id` on a cover
edit exactly as on a create, including the "no metas, one carried image" case.

**Don't:** Append the carried image after the uploads, copy or re-upload it,
delete and recreate it, or run `_sync_images` after the repoint.

**Why:** The form and the review page showed the carried tile where the
contributor put it (first by default) while approval appended it last, so the
published cover disagreed with what both screens had shown. The cover-edit
applier never called the repoint at all. Workspace `docs/DECISIONS.md`
2026-09-27 had left this "on purpose, on the T37 card"; closed here. Evidence:
`CarriedOverMarkingImageTests`, `CarriedOverImageOnCoverEditTests`,
`CarriedImagePositionHelperTests`, `coverFromImageHandoff.test.ts`; workspace
`docs/issues.md` #181.

## Crop Into A Destination Only Through The Crop Endpoint

**Do:** Send a crop to another record with the optional `subject_type` /
`subject_id` on `POST /images/{id}/crop/`. Accept only a Marking linked to
the source Cover by an approved `CoverMarking` that currently has no image;
check the editor's responsibility for both the source and the destination;
validate the view before writing any file; keep the original image on the
Cover. On the cover screen offer "Crop into marking" only as this
destination action, visible and disabled with a reason when no Marking
qualifies.

**Don't:** Compose crop-then-move in the client, accept a destination the
server has not validated, let a same-subject cover crop appear without a
request behind it, or move or delete the source.

**Why:** One request keeps the operation atomic and auditable through a
single row with `cropped_from`; a client composition would leave a stray
Cover image whenever the second call failed. Both crop and ordinary Image
writes now check Collection responsibility (T73); keep those checks when
adding a destination. This reverses the crop docstring's earlier
"crop and move stay separate, composable operations" for this one
destination; the default same-subject crop is unchanged. Evidence:
`ImageCropIntoMarkingTests`; `permissions.py`
`user_is_responsible_for_subject`; `coverImageActionState.test.ts`;
workspace `docs/issues.md` #182.

## Marking Edits Add Images Only

**Do:** On Submit Edit to Existing Marking (and a resumed draft of one), show
the Marking's current images as a read-only strip and let the form add new
images only, placed after the current ones. At submit, rebuild the stored list
as the current Image rows followed by the contributor's uploads
(`_keep_marking_images_on_edit`). At approval, create only the new rows
(`_sync_images(additive_only=True)`). Change existing images on the Marking
page, where editor responsibility is checked.

**Don't:** Accept `removed_existing_image_keys`, `existing_image_tags`, a
reorder of current images, or "No image is available" from a Marking edit, or
require a Marking edit to carry an image. New-Marking submissions and Cover
edits keep their full gallery controls.

**Why:** Ian, 2026-10-14: existing images appearing on the edit screen "don't
think we want that ... we don't want contributors getting that". Any signed-in
user could propose deleting every image on a Marking, and the review screen
showed only the resulting list, never the removals, so an editor could approve
a deletion without seeing it. Approval enforces the rule independently of the
form, so payloads queued before this change cannot delete either. Evidence:
`test_marking_edit_cannot_remove_retag_or_clear_existing_images`,
`test_approved_marking_edit_keeps_current_images_and_appends_uploads`,
`MarkingEditImages.test.tsx`.

## Crop An Upload In The Browser Before It Is Submitted

**Do:** On the Marking form (Submit New Marking and Submit Edit to Existing
Marking), offer Crop on each new upload and from the "may show a whole Cover"
warning. Crop in the browser (`lib/cropImageFile.ts`, drawn from the element
the selection was made on) and replace the upload with the crop, keeping its
position and Tracing flag. Save browser crops, catalog crops, and new JPEG
or PNG uploads as PNG to avoid further JPEG compression loss. On both server
upload paths, apply EXIF rotation or mirroring before storage, remove the
orientation tag, and compute dimensions, size, and checksum from the PNG.
Preserve resolution, color profiles, and supported credit metadata on server
uploads. Share the selection UI with the server crop (`CropSelectionDialog`).

**Don't:** Send a pending upload's crop to `POST /images/{id}/crop/` (the file
is not an Image row yet, and that endpoint is editor-only and writes the
catalog at once), submit the uncropped original alongside the crop, or offer
Crop on a Marking's current images in the form (they are read-only; editors
crop them on the Marking page).

**Why:** Ian, 2026-10-14: "As folks usually have the whole cover, could you
add the crop function to the edit marking screen so that the user can crop out
the marking itself before submission." Cropping before submission keeps the
change inside the normal review flow: the reviewer sees exactly the image that
would be published. Reese chose to replace rather than keep the original
(2026-10-14). This does not conflict with "Crop Into A Destination Only
Through The Crop Endpoint", which governs catalog images. A canvas keeps no
metadata, so the low-resolution notice keeps the result measured on the
original. T66 (rotation) can extend the same dialog. Evidence:
`cropImageFile.test.ts`; a headless-Chromium run of `/edit/:id` against a
mocked API posted a 440x440 crop of a 2400x1500 scan.
Michael chose PNG storage over further JPEG compression on 2026-10-18.
Normalization and pixel preservation are covered by
`ImageUploadNormalizationTests` and `ImageCropOrientationTests`; multipart
storage is covered by `ImageWritePermissionTests`.

## Rotate Marking Images In Quarter Turns, In Place

**Do:** Offer Rotate beside Crop for an editor on the Marking page
(`ThumbnailImageActions`) and for a contributor on each new upload in the
Marking form. Both use `RotateImageDialog`, which previews the turn and saves
once. On the Marking page, `POST /images/{id}/rotate/ {quarter_turns: 1|2|3}`
(clockwise) writes the turned pixels to a new PNG file beside the original and
points the same Image row at it, keeping its position, view, caption and
Tracing flag. It logs `image_rotated` with the previous `storage_filename` and
writes a MarkingVersion. On the form, `lib/rotateImageFile.ts` turns the upload
in the browser and replaces it like a browser crop.

**Don't:** Rotate Cover images (the endpoint returns 400), offer fine-angle
straightening, overwrite the original file or reuse its filename, delete the
previous file, or rotate a pending submission's image on the review page.

**Why:** Ian, 2026-10-16: "After a marking image (only markings and not
covers) is there an easy way to allow for rotation". Reese chose quarter turns,
these two screens, and replace-in-place on 2026-10-19. Quarter turns are exact
pixel moves (Pillow `transpose`), so nothing is resampled. A rotated copy added
like a crop would leave the sideways image as the default. `/media/` is served
with `expires 30d`, so only a new filename shows the turn at once, and
`storage_filename` can be shared by several rows, so the old file stays. The
review page has no pending-image edit path; an editor approves, then rotates.
Evidence: `test_image_rotate.py`, `rotateImageFile.test.ts`,
`markings.rotate.test.ts`, `ThumbnailImageActions.test.tsx`.

## Caption New Uploads Through Their Image Metas

**Do:** Give each new upload on the Marking and Cover forms an optional
"Caption (optional)" field (`ImageCaptionInput`). The form sends the captions as
`marking_image_descriptions` / `cover_image_descriptions`, a JSON list
positional over the uploaded files like `*_image_tags`. The submit view strips
each one, rejects any over 500 characters before writing a file, and stores it
as that upload's `image_description` meta; approval already copies the meta
onto `Image.image_description`. Show a caption as a `<figcaption>` under the
main image on the Marking and Cover pages and both review pages; show a
draft's saved caption read-only on its tile.

**Don't:** Edit the caption of an already-saved image here (Marking edits stay
add-only; a Cover edit's kept rows keep their caption), copy the caption into
`alt`, or hide the "Front"/"Back"/"Details" view labels that v1 imports wrote
into the same field.

**Why:** Trello T43 asks for editable per-upload captions and reuse of
`image_description`. Riding the metas needs no model change and no approval
change, and drafts already keep metas as they are. Django does not enforce
`max_length` on a `TextField`, so the API sets the cap. WAI advises that alt
text should not repeat a caption. Reese chose new uploads only and showing the
v1 labels as they are on 2026-10-19; changing that data is Michael's call.
Evidence: `test_image_captions.py`, `ImageCaptions.test.tsx`.
