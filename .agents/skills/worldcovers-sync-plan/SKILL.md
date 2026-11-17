---
name: worldcovers-sync-plan
description: Review WorldCovers code and tests against design, README.md, ISSUE.md, and DECISIONS.md, then reconcile the evidence with live Trello. Use for project status, implementation planning, or code/document drift. Produce one linked correction plan; apply only changes authorized in the current task.
---

# WorldCovers Sync Plan

Keep code evidence, project documents, and Trello consistent through one
workflow. Code and tests show implementation; design and recorded project decisions
define intended behavior. README.md explains use, ISSUE.md records remaining
work and acceptance, DECISIONS.md holds practical rules, and Trello shows the
live work board. Report conflicts instead of making one source silently
override another.

Invocation produces a review plan. It does not authorize file edits, board
writes, application changes, data operations, deployment, or Git actions.
Creating or updating this skill does not run a sync. If implementation or
application of the plan is already authorized, continue within that scope;
do not ask again for the same approval. File and board changes may share one
approved plan, but approval for one does not imply approval for the other.
Follow AGENTS.md for separate Git permissions. Requests to plan, review, or
audit remain read-only in every Codex mode.

## Choose the scope and establish the baseline

- Use the current checkout. Find its root with `git rev-parse --show-toplevel`
  and confirm that its remote identifies `CoverCensus/worldcovers`.
- Read AGENTS.md, README.md, ISSUE.md, DECISIONS.md, docs/vision.md,
  docs/glossary.md, docs/devel/model.md, and docs/devel/design.md. Read the
  relevant local context in .codex/README.md when present. Follow links only
  as needed for the affected claims.
- For a named change, review its affected rules, requirements, and cards.
  Reuse current-session evidence that is still valid. A full sync also checks
  all active ISSUE.md items and DECISIONS.md rules. State what was not checked;
  do not turn each small edit into another full audit.
- Record the review date, branch, full HEAD, upstream, and relevant dirty
  files. Inspect staged and unstaged diffs and preserve existing work.
  Distinguish working-tree behavior from committed behavior.
- Use the GitHub CLI (`gh`) to verify published revisions and relevant open
  or recent PRs. Remote-tracking refs and local PR summaries can be stale.
  Use published blob/tree links only for verified revisions; use local links
  for unpublished work. Do not push merely to make an evidence link work.
- Private notes, historical workspaces, and archives can be absent. Follow
  AGENTS.md when history matters; report gaps without recreating or publishing
  private files. Do not use an old audit or temporary report as a live inventory.
- Follow dependencies into bodger when the affected extraction work lives
  there. Keep WorldCovers application behavior, offline tooling, source-data
  coverage, and hosted operations distinct.

## Read the affected Trello work

The expected board is WorldCovers in the Cover Census workspace:
https://trello.com/b/HDC2qwhi/worldcovers. Verify its identity, policy, lists,
and labels. Read affected cards, checklists, and relevant activity. Follow
pagination and truncation flags. A focused review needs the relevant scope,
not every card on the board.

Reuse a current-session board read when still valid. If Trello is unavailable,
continue the local review and mark the board comparison pending/unverified.
Do not substitute a dated snapshot or require a board connection for local work.

Use these meanings unless the user changes them. If the live policy differs,
report the conflict and propose a correction:

- Backlog: deferred requirements.
- To Do: active implementation, investigation, or decisions remaining.
- Doing: work confirmed as currently underway.
- Testing: implemented work awaiting verification or stakeholder acceptance.
- Done: accepted work. Preserve existing Done status unless evidence
  contradicts the requirement; a missing old acceptance note is not enough
  to reopen it.

Preserve original card URLs, identifiers, descriptions, and assignments.
Do not infer owners or deadlines from old notes. Apply board membership and
assignment rules from the live policy when proposing a move.

## Check claims against code and tests

Trace the relevant route, permission, model, helper, command, and test far
enough to establish behavior. A matching filename, symbol, comment, or test
count is not proof. Reading tests is not running them. Record missing test
coverage instead of inventing it. Use recent history when a claim may predate
a fix or follow-up.

- Separate implementation, passing checks, deployment, source coverage, and
  stakeholder acceptance. A merged PR establishes none of the latter by
  itself. Name the site, revision, and date for operational evidence.
- Keep API, web interface, Django admin, and operator tooling distinct. A CLI
  command does not fulfill a requirement for an application interface; an API
  can implement a capability without a matching SPA management screen.
- If code follows an established decision and prose is old, propose corrected
  prose. If code falls short of design, retain the requirement and identify
  the existing issue or a missing gap. Do not turn a defect into a rule to keep.
- If intent or sources conflict, state the precise decision needed. Continue
  independent corrections without inventing a product decision. Do not change
  application behavior, restore old behavior, or weaken design merely to make
  documents agree.
- If evidence and documents already agree, propose no edit. Do not refresh
  dates or rewrite sound rules just to show that a review ran.

Keep Original Issue N, MD/MI Batch #N, Trello S#/T#/F#,
and GitHub PR #N distinct. Match by scope and evidence, never by bare number.

## Build one linked correction plan

Use a small evidence table: document section or source ID, current claim,
observed state, evidence, and exact proposed correction or remaining question.
Include only affected changes and their dependencies.

### README.md and related guides

Check affected setup commands, dependencies, database versions by environment,
architecture, user flows, verification, deployment, and links against current
code/configuration. Derive versions from those sources. Correct related guides
only within the authorized scope; flag other needed changes separately.

### ISSUE.md

ISSUE.md lists open work only. Follow "Rules For This File" at its top.

- Reuse the matching row (issue, batch item, S story, or T task). Keep the
  original numbering.
- Each row states what remains and when it is done. Nothing else.
- When work is accepted, delete its row. Do not leave a closure note.
- Never add dated review logs, baselines, commit hashes, test counts,
  deploy results, or developer names. Put that evidence on the Trello card.
- If finished work produced a lasting rule, add it to DECISIONS.md.

Do not change assignment, priority, or board status based on code alone. If a
requirement has no matching item, propose a short gap with evidence, required
outcome or decision, and checkable acceptance criteria. Reuse that gap on later
runs. Mark it as needing Trello mapping until live numbering is checked.

### DECISIONS.md

Keep practical rules that prevent a wrong change. Use plain American English,
the project's exact terms, and this structure for affected rules:

- **Do:** the behavior to preserve, with the Entry type and operation.
- **Don't:** a concrete mistake to avoid, including essential exceptions.
- **Why:** the practical consequence in one or two sentences.
- **Evidence:** relevant design, implementation, and existing test links.
- **Open work:** exact ISSUE.md references for unfinished requirements or
  known gaps, distinguishing directly tracked work from related work.

Do not add a rule for every fix, repeat the feature inventory, or copy test
totals and status reports. State the checked scope and implementation limits;
do not claim a safeguard covers every endpoint unless verified. Remove
superseded rules. Keep VPHC source-specific rules and postmaster history in
the existing VPHC documents, including bodger references when relevant.
Treat historical Regions as wider than the implemented VA/WV exception.
Do not alter design or glossary to hide a conflict.

### Trello

Map every unresolved in-scope source item to an existing card or give an
evidence-based reason no card is needed. Use the design's F# map. Group
overlapping feedback by distinct outcome and cross-link related work.
Link completed PRs as evidence instead of creating historical backfill.

For each proposed change, give the card ID/URL, current and target list,
exact title/description changes, labels, evidence, and acceptance criteria.
Keep descriptions concise; do not duplicate assignments and labels in prose.

Before proposing a new T number, check active and archived cards, including
cards in archived lists, for duplicates and the highest used number. Do not
assume a board call includes archived lists. Propose archiving only verified
duplicates after checking for unique content. Preserve recoverable history.
For a reopen, align list position and the separate completion flag.

For data tasks, identify source records, target site, expected result, and
known coverage. If records or the target are unknown, finding them is the
first task step. Do not schedule repeat imports from stale checklists or
describe an owner decision as missing code.

Fit proposed writes to supported connector fields and limits. Flag operations
the available tools cannot perform instead of claiming them complete.

## Deliver, apply when authorized, and verify

Present one plan containing the baseline and material drift, exact local
corrections, dependent board changes, unresolved decisions, evidence limits,
and verification steps. Distinguish proposals from applied changes. Use the
required proposed_plan format in Plan Mode. The response is the handoff;
save a note under .codex/ only when the user requests one.

For an authorized application of the plan:

1. Re-read affected files and cards before writes. Preserve concurrent edits
   and patch only approved paragraphs. Finish independent authorized changes
   when new drift appears; report the additional scope separately.
2. Apply local corrections and check ASCII, the diff, links, and anchors.
   Each corrected claim needs evidence; each gap needs an issue/card mapping
   or an explicit pending mapping. Check that another run would not duplicate
   issues or rewrite unchanged rules. Do not run an application suite just
   for prose; use focused checks only when needed to settle a material claim.
3. Compare the actual local changes with Trello in a focused final pass.
   Reuse unchanged evidence rather than repeating the full audit. Apply only
   board changes authorized in the current task. A local doc edit alone does
   not establish that Trello is synced.
4. Verify applied card fields, URLs, unique active identifiers, labels,
   completion flags, assignments, and source coverage. Check uncertain write
   outcomes before retrying. Respect existing notification requirements and
   separate authorization for comments or other messages.

Report what was reviewed, proposed, applied, or left pending. Do not claim
deployment, acceptance, or Done status from a documentation correction,
commit, push, or successful import alone.
