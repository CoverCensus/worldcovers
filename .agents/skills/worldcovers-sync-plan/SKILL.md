---
name: worldcovers-sync-plan
description: Review the current WorldCovers repo against README.md and ISSUE.md, then compare its Trello board and produce ordered documentation and board update plans. Use for WorldCovers status reconciliation or requests to keep the repo, docs, and Trello in sync.
---

# WorldCovers Sync Plan

Produce two linked plans: first reconcile repo documentation with current
evidence, then reconcile Trello with that evidence and the proposed doc changes.
This is a review workflow. Do not edit project files, mutate Trello, commit,
push, deploy, import data, or send messages merely because this skill is invoked.
If the user separately requests implementation, apply only the authorized plan
and recheck the affected state before writes. An earlier session's approval is
not standing approval for future sync runs.

## Establish the review baseline

- Use the current WorldCovers checkout. Find its root with
  `git rev-parse --show-toplevel` and confirm the expected remote is
  `CoverCensus/worldcovers`. Resolve project paths from that root.
- Read applicable AGENTS.md instructions, README.md, ISSUE.md,
  docs/vision.md, and docs/devel/design.md. Follow links selectively when a
  claim needs support. Keep generated text and artifacts ASCII-only.
- Record the branch, full HEAD, dirty files, upstream, and review date.
  Read relevant staged and unstaged diffs. Preserve all existing changes.
  Separate working-tree behavior from committed behavior.
- Check published GitHub state through read-only tools. Local remote-tracking
  refs can be stale. Identify any unpublished commits before making links.
  Use a verified published commit for evidence URLs and name local-only changes
  separately. Use blob URLs for files and tree URLs for directories.
  Do not push to make a link work. If remote access fails, state the limit.
- Read recent and relevant PRs, including open work and follow-up notes.
  Local PR summaries and previous audit reports are dated aids, not current
  inventories. Do not require a past `/tmp` report or a fixed commit hash.

## Plan the documentation updates

Check claims against the implementation, not just another document. Use routes,
permissions, models, command entrypoints, tests, CI workflows, deployment files,
and relevant PR evidence. Follow the code far enough to verify the stated
capability; a matching filename or symbol alone is insufficient.

- For README.md, check setup commands, dependencies, database versions by
  environment, architecture, user flows, verification, deployment, and links.
  Derive current versions from code/configuration. Do not repeat old versions
  from this skill or a past chat.
- For ISSUE.md, review active statuses, unresolved checklists, decisions,
  dependencies, and the feature implementation table. Check later fixes and
  PR follow-ups before proposing new work. Preserve historical snapshots as
  history and keep original numbering.
- Keep Original Issue N, MD/MI Batch #N, Reese queue #N, Trello S#/T#/F#,
  and GitHub PR #N distinct. Match by scope and evidence, never by bare number.
- Design and vision define intended scope; code establishes implementation.
  If they differ, identify the missing capability or decision. Do not silently
  reduce a requirement to match the current implementation.
- Distinguish SPA, API, Django admin, and operator tooling. A CLI command does
  not satisfy a requirement for an application interface. Conversely, an API
  can implement a capability even if the SPA lacks a management screen.
- Record implementation, passing checks, deployment, data coverage, and
  stakeholder acceptance separately. A merged PR proves none of the latter
  by itself. Name the site and date for operational or data evidence.
- Missing historical workspace files do not imply a broken checkout. Do not
  propose recreating them just to satisfy references. When provenance matters,
  use available archive instructions in AGENTS.md and search only relevant
  history. Private notes and archives are optional and may be absent in a
  fresh clone. Report evidence gaps; do not recreate or publish private files.

Build a small evidence table: document section/source ID, current claim,
observed state, evidence, and exact proposed correction or remaining question.
Propose the smallest wording/status changes. Do not turn ISSUE.md into a full
PR history or add a new permanent status document. Refer to related docs only
where needed to explain or fix a contradiction.

## Plan the Trello updates

Discover the current Trello read tools. The expected board is WorldCovers in
the Cover Census workspace, at https://trello.com/b/HDC2qwhi/worldcovers.
Verify that identity and read its policy, lists, labels, and cards. Read relevant
checklists and activity. Follow pagination and truncation flags. Include archived
cards when checking prior work, duplicates, and the highest used T number;
do not assume a board call includes cards in archived lists.

Compare live cards with repo evidence and the proposed documentation corrections.
If Trello is unavailable, finish the repo/doc plan and mark the board comparison
blocked. Do not substitute a previous board snapshot for the live inventory.

Apply these agreed meanings unless the user changes them. If the live policy
differs, report it and propose the policy correction rather than silently
changing scope:

- Backlog: deferred requirements.
- To Do: active implementation, investigation, or decisions remaining.
- Doing: work confirmed as currently underway.
- Testing: implemented work awaiting verification or stakeholder acceptance.
- Done: accepted work. Preserve existing Done status unless evidence contradicts
  the requirement; absence of an old acceptance note alone is not a reason to
  reopen it.

Keep original card URLs, S#/T# identifiers, descriptions, and assignments.
Use the design's F# map. Group overlapping feedback into one distinct outcome
and cross-link related cards. Add only missing current work; link completed PRs
as evidence rather than creating a historical backfill.

For each proposed card change, give the card ID/URL, current and target list,
title/description changes, feature labels, evidence, and acceptance criteria.
For new tasks, propose unused T numbers after the highest active or archived
number. Record a source-to-card mapping for every unresolved issue or batch item,
or an evidence-based reason that no new card is needed.

For data checks, identify source records, target site, expected result, and
whether current coverage is known. If record IDs or the target are unknown,
make finding them the first task step; do not invent them. Do not schedule
repeat imports from stale checklists. Treat owner decisions as decisions, not
missing code. Do not infer current assignments or deadlines from old notes.

Propose archiving only verified duplicates after checking for unique content.
Preserve original cards and recoverable history. Do not assume duplicates still
exist because an earlier audit found them. List position and the card's separate
completion flag must agree; include both in proposed reopen operations. Fit
planned writes to the connector's supported fields and limits, and flag any
required operation it does not expose.

## Deliver the linked plan

Lead with the review baseline and the material drift found. Then present:

1. Documentation plan: specific README.md and ISSUE.md corrections with evidence.
2. Trello plan: exact updates, moves, new tasks, policy changes, or archives,
   including the source-to-card mapping and dependencies on the doc corrections.
3. Open questions and verification: distinguish blocked evidence from product
   decisions; explain how each proposed change will be checked.

Make the plan concrete enough to apply without another discovery pass. Ask only
for decisions that cannot be resolved from available evidence. Use the required
plan format when running in Plan Mode. A saved report is optional; use an
untracked output location and keep it dated instead of creating a second queue.

For later authorized execution, re-read changed docs and cards before writes,
preserve concurrent edits, and check uncertain write outcomes before retrying.
Verify source links, unique active identifiers, labels, completion flags,
assignments, and source coverage after changes. Use ASCII and diff checks for
doc-only edits; do not run application tests or live data operations just to
complete a status review.
