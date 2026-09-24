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

**Don't:** Rely on a hidden button, a filtered screen, or permission to enter
the review area as proof that the user may change any Entry.

**Why:** Other clients can call the API directly. A role check alone does
not establish responsibility for a Collection.

**Evidence:** [Roles](docs/devel/design.md#roles) and
[API-first design](docs/devel/design.md#technical-constraints);
[permission checks](backend/common/api/v2/permissions.py);
[bulk review tests](backend/common/tests/test_bulk_review.py) and
[Entry removal tests](backend/common/tests/test_entry_remove_permissions.py).

**Open work:** [Issue 26 / T20](ISSUE.md#issue-26----decide-whether-contributors-may-link-existing-covers-and-markings)
leaves Contributor linking permissions undecided. [T37 and T38](ISSUE.md#other-follow-ups)
cover related image and destination workflows, not approval to widen access.
There is also a gap: ordinary `ImageViewSet` writes in
[the API](backend/common/api/v2/views.py) check role but not Collection
responsibility; crop adds a subject check. [T73](ISSUE.md#t73---scope-image-writes-to-collection-responsibility)
tracks source and destination checks. Do not copy that omission into new write paths.

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
[approval tests](backend/common/tests/test_cover_contribution_apply.py);
[resolved Issue 27](ISSUE.md#issue-27----submitter-self-delete--withdrawal-policy----done).

**Open work:** [T41](ISSUE.md#other-follow-ups) covers further rescind and
inactivity rules. Do not invent an expiry period or automatic deletion rule.

## Preserve Data That An Edit Does Not Change

**Do:** Preserve existing field values when an approved Marking or Cover edit
omits them. Handle a requested clear according to that field's validation.
Keep the form and approval code in agreement about omission and clearing.
For Citations, an omitted list preserves the stored set; a supplied list
replaces it, and an explicit empty list clears it.

**Don't:** Build a replacement Entry using empty defaults for missing fields.
Do not assume every empty value is valid, or that supplied image, Citation,
and relationship lists are always appended to existing data.

**Why:** A partial edit describes only part of an Entry. Treating missing
values as empty can erase information the Contributor never changed.

**Evidence:** [Edit story S7](docs/devel/design.md#stories);
[approval helpers](backend/common/contribution_apply.py)
(`_apply_marking_edit`, `_apply_cover_edit`, `_sync_citations`);
[merge tests](backend/common/tests/test_marking_edit_merge.py) and
[Cover/edit tests](backend/common/tests/test_cover_contribution_apply.py).

**Open work:** [T39](ISSUE.md#other-follow-ups) covers comparing proposed and
current values during review. [T40](ISSUE.md#other-follow-ups) covers
contributor credit: an edit can replace the display-name preference, and
public credit uses the original creator. Keeping omitted fields does not
solve consent or cumulative credit. Upload forms also flatten multi-value
Citation input in [the submit path](backend/common/api/v2/views.py); do not
assume every form can express the full Citation replacement set.
[T72](ISSUE.md#t72---preserve-all-citations-in-multipart-submissions) tracks
preserving all selections and explicit clearing through the form workflow.

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
[refresh tests](backend/common/tests/test_date_range_cache.py);
[resolved Issue 20](ISSUE.md#issue-20----years-seen-model-for-marking-dates----done).

**Open work:** [T42](ISSUE.md#other-follow-ups) adds a separate approximation
qualifier for Markings and Covers. Partial dates do not implement it.
The [glossary](docs/glossary.md) says new dates are contributed only through
Covers, but [Editor submission tests](backend/common/tests/test_contribution_submit.py)
and the current submit path support direct Marking date edits.
[T75](ISSUE.md#t75---reconcile-date-guidance-with-editor-submissions) tracks
the wording correction. Do not remove the working Editor path merely to
match the glossary.

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
of that list. For an Editor listing, publish confirmed assignments only.

**Don't:** Publish every Markdown file under `docs/`, or assume placing a
file under `docs/devel/` alone prevents publication. The API checks names,
not just directories. Do not publish proposed appointments or private
contact details as an Editor roster.

**Why:** Help is readable by Guests. Adding an internal file must not expose
it to the public.

**Evidence:** [Help stories S24/S34](docs/devel/design.md#stories);
[Help API](backend/common/api/help.py);
[publication tests](backend/common/tests/test_help_docs_allowlist.py).

**Open work:** [S24/S34](ISSUE.md#feature-implementation-surfaces-reviewed-2026-09-13)
cover Help and article authoring. Repo Markdown is the current article source;
there is no general article editor in the web interface.
[T46](ISSUE.md#other-follow-ups) covers an Editor listing generated from
confirmed assignments.

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
