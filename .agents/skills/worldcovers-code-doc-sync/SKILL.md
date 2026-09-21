---
name: worldcovers-code-doc-sync
description: Review WorldCovers code and tests against design intent, ISSUE.md, and the practical rules in DECISIONS.md, then produce a documentation reconciliation plan for approval. Use for code/document drift or planning preparation between separate worldcovers-sync-plan Trello reviews. Invocation alone makes no changes.
---

# WorldCovers Code And Docs Sync Plan

Make ISSUE.md describe the work that remains and DECISIONS.md explain what a
coding agent must preserve. Check both against the current code, tests, and
design. Do not change application code to make the documents agree.

This is a review workflow. Produce a concrete plan for the user's approval;
invocation alone does not authorize edits to files or Trello. Creating or
installing this skill does not run a sync. Apply changes only after the user
requests implementation of the plan, within that approved scope. Preserve
authorization already given for that plan in the current session; do not ask
again without a material change. Approval of a previous run is not standing
approval for a new run. Product choices, code fixes, data operations,
deployment, commits, and pushes require their own task scope.
Requests to plan, review, or audit remain read-only in every Codex mode.

## Fit between the two Trello reviews

Keep [worldcovers-sync-plan](../worldcovers-sync-plan/SKILL.md) separate and
unchanged. It currently reviews the repo and Trello and proposes updates;
it requires a request to apply those updates before it writes them.

The intended order is:

1. Run worldcovers-sync-plan before planning to compare live Trello with
   ISSUE.md. Bring forward relevant findings and any authorized corrections.
2. Run this skill to plan reconciliation of code, design, ISSUE.md, and
   DECISIONS.md. Apply the local changes only after the user approves them.
3. Run worldcovers-sync-plan again, focused on the changed local claims, to
   check that Trello agrees and propose or apply updates within user scope.

Running this skill alone produces the step 2 plan and a proposed handoff for
step 3. The final board check uses the local changes after they are applied.
Do not silently start board writes or require a board connection for local
work. If the user requests the whole sequence, read and use the companion
skill at steps 1 and 3. Stop after the local plan for the user's decision
unless implementation of that plan is already authorized. A request to plan
the sequence describes the steps; it does not start those steps. If Trello is
known to be unavailable, keep its stages pending and continue local evidence
review. Do not repeat the companion's full
repo audit at step 3 unless new evidence requires it. An unapplied plan is
not a completed sync, but delivering the requested plan completes the review.

## Establish what is being checked

- Find the current WorldCovers checkout root with
  `git rev-parse --show-toplevel` and confirm the expected remote is
  `CoverCensus/worldcovers`. Resolve project paths from that root.
- Read applicable AGENTS.md instructions, README.md, docs/glossary.md,
  docs/devel/model.md, docs/devel/design.md, ISSUE.md, and DECISIONS.md.
  Read .codex/README.md if present. Private notes and archives are optional
  and may be absent in a fresh clone. Report evidence gaps; do not recreate
  or publish private files. Read relevant vision or history material when
  it explains an actual choice.
- Note the branch, HEAD, relevant dirty files, and date in the response.
  Inspect existing diffs and preserve them. Distinguish working-tree evidence
  from committed code; neither proves deployment or acceptance.
- Use the first Trello review if supplied. Do not claim it ran or was applied
  without evidence. No board access means board status is unverified, not
  that local reconciliation must stop.
- For a named feature or change, check its affected rules and issues. With
  no narrower scope, check every DECISIONS.md rule and active ISSUE.md item
  against relevant code. Sample unrelated closed history only when needed
  to detect a duplicate or explain a decision. State anything not checked.

## Resolve each claim from evidence

Design and explicit user decisions define intended behaviour. Code and tests
show what is implemented. ISSUE.md tracks work and acceptance. DECISIONS.md
explains durable rules. Trello supplies live board organisation and workflow
state through the companion skill. None of these replaces all the others.

Trace the relevant route, permission, model, helper, and test far enough to
check the claim. A symbol name, comment, test count, or old bot explanation
is not proof. Reading a test is not running it. Check recent diffs or Git
history when a claim may predate a change. Verify published revisions before
using GitHub evidence links; use local links for unpublished work.
If no existing test supports a claim, say so instead of inventing coverage.

For each mismatch, choose the smallest supported outcome:

- Code follows an established choice but prose is old: propose corrected prose.
- Code falls short of design: retain the requirement and link the existing
  issue for the gap. Do not describe the defect as a rule to preserve.
- The intended behaviour is unresolved: record the precise choice needed.
  Do not infer a new product decision just because the code behaves that way.
- Sources or recent edits conflict: state both with evidence. Continue
  independent corrections; leave dependent changes unresolved.
- Code is present but verification, deployment, or acceptance is unknown:
  record only the implementation evidence. Do not promote a task to Done.

Do not restore old behaviour to satisfy stale wording. Preserve existing
accepted work unless current evidence contradicts its stated scope. Keep
API, web interface, Django admin, and operator tools distinct. Separate
implementation from source-data coverage and site-specific verification.

If the documents and evidence already agree, propose no change. Do not
refresh dates or rephrase sound rules merely to show that a review ran.

## Plan the two local document updates

Specify exact replacement text or a small patch for each correction, its
evidence, and any dependency on an unresolved decision. The following rules
apply to proposed edits and to their later authorized implementation.

### ISSUE.md

Reuse the matching Original Issue, MD/MI Batch, S story, or T task. Match by
scope, not bare number. Correct current claims, dependencies, and links with
brief evidence. Preserve historical snapshots as dated history.

Do not change assignment, priority, or board status based on code alone.
If there is no matching issue, add a short descriptive gap in ISSUE.md with
evidence, required outcome or question, and a checkable acceptance condition.
Mark it as needing Trello mapping. Do not allocate a T number locally; the
companion skill must check live and archived cards first. Reuse the same gap
on later runs rather than adding another copy. Do not create another queue.

### DECISIONS.md

Write practical rules in simple technical English at a tenth-grade reading
level. Follow project terms exactly. For each affected subject, use:

- **Do:** the behaviour to preserve, naming the Entry type and operation.
- **Don't:** a concrete mistake to avoid, with essential exceptions stated.
- **Why:** the practical consequence in one or two sentences.
- **Evidence:** relevant design, implementation, and existing test links.
- **Open work:** exact ISSUE.md references for unfinished requirements or
  known gaps; distinguish directly tracked work from merely related work.

Include only choices that help prevent a wrong change. Do not add a rule for
every fix, repeat the feature inventory, or copy test totals and status
reports. Do not claim a safeguard covers every endpoint unless checked.
State scope and implementation limits so a less-capable agent can follow
instructions literally. Remove superseded rules; do not accumulate warnings.

Keep VPHC source-specific detail, including postmaster history, in the existing
VPHC document. General edit safety can remain a project rule with a link to
that history. Treat historical Regions as a wider problem than VA/WV; an
implemented exception does not settle territory search policy.

Do not edit docs/devel/ENGINEERING-ARCHIVE.md or keep it current. Do not change
design, glossary, or other guides to hide a conflict; identify any needed
out-of-scope correction in the handoff. Respect existing uncommitted edits.

## Deliver the plan and verify later execution

Check proposed text, ASCII, local links and heading anchors. Each corrected
claim must have evidence; each gap must map to an existing issue or a proposed
unmapped entry. Confirm a second pass would not duplicate issues or rewrite
unchanged rules. Run no application suite just for prose changes; use a
focused safe check only when a material claim cannot be settled by inspection.

Finish with the baseline, exact proposed edits, evidence limits, unresolved
decisions, validation steps, and a short
handoff for worldcovers-sync-plan. For each board-relevant change include:
existing source ID and card URL if known, exact local change, evidence,
acceptance condition, and any unresolved decision. Label unapplied local
corrections as proposed. Keep proposed board edits
separate from verified board state. Never report Trello synced because the
local documents now agree.

Use the required proposed_plan format in Plan Mode. In other modes, present
the same concrete review plan and make clear that no changes were applied.
After approval, re-read affected files before editing, preserve concurrent
changes, and apply only the authorized corrections. Patch only the relevant
paragraphs in dirty documents; retain unrelated edits. Check the final diff and
links, then hand the actual local changes to worldcovers-sync-plan for the
final board review. Do not silently expand the approved plan when new drift
appears; report it separately and finish independent authorized changes.

Use the response as the handoff by default. Save a note in the workspace
.codex/ directory only when the user wants a persistent handoff. Do not add
a new maintained report, refresh the frozen archive, or post board comments.
