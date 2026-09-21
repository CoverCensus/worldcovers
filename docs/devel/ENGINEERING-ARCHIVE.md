# Engineering Archive

Frozen on 2026-09-20 from the former DECISIONS.md. These entries preserve
historical explanations, evidence, and reported results. They may contain
stale claims, obsolete instructions, or conclusions not supported by current
code. Their issue numbers may refer to the original author's local queue.

Do not use this file as an operating guide or current status report. Do not
keep it in sync with later changes. Use [DECISIONS.md](../../DECISIONS.md)
for rules to preserve, [ISSUE.md](../../ISSUE.md) for tracked work, and the
[current guides](README.md) for procedures. Code paths below are relative
to the repository root.

VPHC-specific history, including postmaster data, is in
[VPHC-DECISIONS.md](VPHC-DECISIONS.md).

## 2026-09-10 -- CI verification lives in one reusable workflow, and runs on pull requests (#161, #155)

**What was decided.** Three calls, all in the CI restructure:

1. **The verification steps move into `.github/workflows/verify.yml` (`on: workflow_call`)**, and
   `pr-checks.yml`, `build-and-deploy.yml` and `deploy-prod.yml` all call it. The steps are no
   longer written down anywhere else.
2. **Pull requests now run the full chain** -- frontend lint/typecheck/test/build/audit, tools
   pytest, Django system checks, and the ~402-test backend suite -- via a new `pr-checks.yml`.
3. **The backend suite runs against a MariaDB 10.11 service container**, with `mysql.cnf`
   generated in-job.

**Why.**

*(1)* Duplication is what caused the outage this fixes. `3a0da7f` tightened the frontend gate to
`npm audit --audit-level=moderate` and merged green, because **no `pull_request` workflow ran npm at
all** -- `review.yml` was the only one and it runs `python3 .github/scripts/review.py` and nothing
else. The tightened gate then failed on `origin/staging` itself, so four finished PRs (138-141)
became undeployable through no fault of their own, and PR 138's merge produced a failed deploy
(run `34431905923`, step `Verify frontend`). Two copies of a check that are supposed to agree, with
nothing forcing them to, is the defect class; one definition removes it. The `deploy` jobs are
deliberately left inline -- they are genuinely different per environment (woco.dev vs
hellowoco.app), and only the *verification* half was ever meant to be identical.

*(2)* Both deploy workflows ran `manage.py check` only, so 40+ test files and ~402 tests executed
only when a developer remembered to (issues.md #161). #128 and #150 both shipped backend behaviour
changes to production on 2026-09-10 with no automated gate behind them -- their entire safety net was
one person running the suite by hand. Verified after the fact, on production, that both are correct
(10/10 and 19/19); that this came out right does not make it a process.

*(3)* Production runs MariaDB `10.11.14`, not MySQL, and `settings.py:126` pins
`django.db.backends.mysql` with no sqlite fallback -- so the suite needs a real server and it should
be the one prod runs. `mysql.cnf` is gitignored (`.gitignore:252`) and is read via
`OPTIONS.read_default_file`, so CI generates it. It must carry explicit `host`/`port`, which
`mysql.cnf.example` does not: the service container is reachable over TCP only, and the example's
implicit unix-socket default cannot connect from a runner.

**Consequence to watch.** The backend job adds roughly 2.5 minutes to every PR and every deploy, and
it is now a hard gate -- a flaky test blocks shipping where previously nothing did. That is the
intended trade. The risk is controlled on the way in: `pr-checks.yml` runs on the pull request that
introduces it, so the new job proves itself before the deploy-workflow changes can take effect.

## 2026-09-08 -- Date observations keep a DELETE verb, and cannot be moved between records (#128)

**What was decided.** Three calls, all inside the #128 scoping/audit fix:

1. **`DateSeenViewSet` keeps DELETE**, made audited via `perform_destroy`, rather than closing the
   verb through `http_method_names` the way `CoverValuationViewSet` and `CoverMarkingViewSet` did.
2. **A PATCH can no longer change `subject_type`/`subject_id`** -- a move is now a 400, and the
   sanctioned path is delete-then-create.
3. **A COVER-subject date change is logged against the cover only**, never fanned out to the linked
   markings.

**Why.**

*(1)* The sibling precedent reads as a general rule but isn't one. Those two viewsets closed DELETE
because the entity had *no sanctioned removal flow*. Dates do: `contribution_apply.py` deletes every
`DateSeen` row for a subject on each apply, `signals.py` carries a handler written specifically for
the delete path, and `test_date_range_cache.py` asserts that an **API** DELETE maintains the
denormalized `earliest_seen`/`latest_seen` columns. Declaring date deletion unsanctioned at the API
while the apply pipeline does it wholesale would be incoherent, and #107's editable Dates Seen UI
needs row removal. A date is an observation, not an entity -- deleting a mis-transcribed one is the
normal correction, and a `DateSeenRecycleBin` for a five-field child row is over-engineering.

*(2)* DRF only ever shows `has_object_permission` the **old** object. Without this, a VA editor
could PATCH `subject_id` and land a row they own onto a marking they don't -- reintroducing exactly
the hole the issue is about, through the one verb that looked scoped. No caller does it
(`covers.ts` sends only `date` and `granularity`), delete-and-create is equivalent and fully
audited, and forbidding it keeps one row hanging off one parent so the audit trail never forks.
The ORM move path (`signals.py`'s `stash_previous_date_seen_subject`) is untouched.

*(3)* `SubmissionTransaction.marking` is a single FK. With N linked markings there is no
non-arbitrary one to pick, and writing N transactions would misrepresent one edit as many. The
linked markings' cached ranges still move; only the changelog placement differs.

**Consequence to watch.** Each write now emits one transaction and one version row. That is right
per-edit and matches `MarkingViewSet`, but if #107 ships **bulk** date editing, N rows submitted
together become N versions on one changelog. The answer then is a batch endpoint writing one
transaction and one version per submit -- **not** per-row version suppression. Recorded in the
viewset docstring so it is found at the point of change.

**Source or evidence.** `contribution_apply.py` `_sync_cover_date_seen` / `_sync_marking_date_seen`;
`signals.py` `refresh_date_range_on_date_seen_delete`; `test_date_range_cache.py`
`test_api_date_seen_crud_maintains_columns` (passes untouched -- the regression gate);
`backend/common/tests/test_date_seen_permissions.py`. Full backend suite 389 passing.

**Date.** 2026-09-08

---

## 2026-08-25 -- WV markings cross-list to Virginia on evidence of pre-statehood use (#123)

**What was decided.** A West Virginia marking also appears under a Virginia state filter **if and
only if it carries an actual date on or before 1863-06-20**, the day WV separated from Virginia.

- **The boundary is INCLUSIVE.** Ian, 2026-08-24, asked directly about statehood day itself:
  *"count it as both. So THAT DAY should be under a WV and VA."* A `<` instead of `<=` is the
  off-by-one; `test_the_boundary_date_itself_appears_under_both_states` exists to catch it.
- **Evidence is required, never inferred.** Reese, 2026-08-25: *"under no circumstances should it
  cross unless told. If any date is predated before June 20 1863, then you mark it as cross."*
  So the **92 undated** WV markings on prod do NOT cross-list. Absence of a date is not evidence
  of an early one.
- **One entry, two filter memberships.** The marking's own `state` still reads "West Virginia" --
  a marking has one home state. Ian asked for *"one entry, but with different state
  classifications"*, so this is the design, not a bug.

**Effect, measured on live prod:** 1,066 markings qualify, so Virginia goes **4,066 -> 5,132**.
18 are post-statehood and 92 undated, both excluded.

**Why the predicate reads `dates_seen` and not `Marking.earliest_seen`.** Both return 1,066 on
today's data, which makes the choice look arbitrary. It is not: **#121 changed `earliest_seen` to
resolve by span containment, so it is no longer a strict minimum** -- a coarse YEAR row can be
absorbed into a later precise date inside its span. The rule says *any* date, so the code queries
the dates. Cover dates count too (a cover bearing the marking, dated 1860, is evidence), matching
the scope `compute_marking_date_ranges` already walks. A bare YEAR stores as its floor,
`1863-01-01`, so "1863" qualifies -- deliberate, and pinned by a test rather than left to luck.

**Sort is filter-aware.** The default ordering leads with `primary_region_name`, the marking's own
state, which would put all 1,066 cross-listed rows after every Virginia one -- around page 41 of 51
-- i.e. effectively hidden. With a state filter active, `MarkingViewSet.ordering` drops that key so
towns interleave. It is a **property**, not a method: DRF resolves the default sort with
`getattr(view, "ordering")` and never calls a method. An explicit `?ordering=` is never overridden.

**Two consequences accepted knowingly.** A Virginia editor sees cross-listed WV markings and is
403'd on write, because `_user_is_responsible_for_marking` resolves through the single primary
region -- correct (a WV marking is West Virginia's to edit), and the label warns before the click;
no permission model change. And per-state counts now exceed the unfiltered total, since 1,066 rows
belong to two filters; no facet UI displays that sum.

**One trap hit while building this, worth recording because the code comments now warn about it.**
The first implementation resolved WV towns as
`PostOffice.objects.filter(post_office_regions__region__abbrev="WV").exclude(post_office_regions__region__region_tier__in=SUBREGION_TIERS)`.
The `.exclude()` crosses the junction, so it compiles to **NOT EXISTS** and means *"this town has
no county link at all"* -- which silently dropped every WV town that has one, i.e. all of them.
Same shape as the measured failure in `views.town_options` (593 of 2,162 post offices surviving).
Fixed by resolving the regions first, on Region's own columns, then matching the junction once.

**Verification.** 16 new tests in `test_marking_list_fanout.py`, all through `assertWalkIsClean`,
which walks **every page** and asserts `len(ids) == len(set(ids)) == count` -- 4 of them verified
failing before the fix. The single-page pattern would not do: a cross-listing OR is exactly the
change that passes a page-1 assertion and breaks pagination. The expected live count (5,132) was
derived by running the predicate against prod as SQL, independently of the code.

## 2026-08-23 -- Catalog return path reuses the Issue #87 sessionStorage mirror, not router state

**What was decided.** Returning to the catalog from a marking detail restores the filters, sort and
page the user had set. The mechanism is a new `frontend/src/lib/catalogParams.ts` --
`rememberCatalogLocation()` / `catalogHref()` -- mirroring the catalog's serialized query string into
`sessionStorage` under `worldcovers.catalog.lastView`, exactly as `dashboardParams.ts` does for the
dashboard under key `worldcovers.dashboard.lastView`.

**Why.** Catalog Search already put every filter in the URL and read it back on mount, so the bug was
never in the filter state -- it was in the return path. `RecordDetail.handleBack` did
`navigate("/search")`: a *forward* navigation with no query string, so the catalog re-mounted with
empty params and cleared everything. Same for `CoverDetail`'s last-resort fallback and Contribute's
`fromSearch` return. Only the browser's own Back button worked, because the URL write-back uses
`{ replace: true }`.

**Why not react-router location state, which `Search.tsx` already passes as `{ fromSearch: true }`.**
Router state does not survive a page reload or a multi-hop redirect, and detail screens are reachable
several navigations deep (record -> cover -> edit). The sessionStorage mirror recovers the view without
the caller knowing what it was -- the same reasoning recorded for #87.

**Why not `navigate(-1)`.** A history pop restores the filtered URL, but only when the detail page was
actually reached from the catalog; entering by deep link or after a redirect would send the user off
the site or backwards through an unrelated page. The explicit href is deterministic.

**One latent bug had to go with it.** `prevHeightFilterRef` / `prevWidthFilterRef` were hardcoded to
`""` while every sibling ref seeds from the restored state, and `useDebounce` seeds its state from
`value` on first render -- so the "reset page to 1 when a filter changes" effect fired *on mount* for
any view carrying a height or width filter and discarded the restored `?page=N`. Both refs now seed
through a module-level `normalizeDimensionInput`, which also replaces the two duplicate copies of
that rule (one in-component, one inlined in the effect to dodge the TDZ).

**Scope.** Only params already URL-backed are restored. `viewMode` (list/gallery) and
`valuationFilter` remain non-persistent -- Reese's call, out of scope for this fix.

**Evidence.** `frontend/src/pages/Search.tsx` persist effect (write-back with `{ replace: true }`);
`frontend/src/pages/RecordDetail.tsx` `handleBack`; `frontend/src/lib/dashboardParams.ts:227-253`
(the #87 pattern being mirrored). Full frontend suite green under Node 22: 33 suites, 184 tests.

## 2026-08-17 -- Marking list ordering is an annotation contract, not a relation path (issue #103)

**What was decided.** `MarkingViewSet` no longer exposes or defaults to
`post_office__post_office_regions__region__name` as an ordering key. The list queryset carries
`primary_region_name` / `primary_region_abbrev` -- correlated `Subquery` annotations resolving the
town's most-recent active non-`SUBREGION_TIERS` region -- and those are the ordering keys.

**Why a rewrite and not an allowlist entry.** DRF matches an explicit `ordering_fields` list
**verbatim** (`rest_framework/filters.py:264-291`), so leaving the junction spelling in the list
would hand it straight to `order_by()` and restore the fan-out. Bookmarked search URLs still carry
it, and rejecting it outright would silently change the sort under the user. So
`AliasedOrderingFilter` (`common/filters.py`) rewrites retired keys from a `ordering_aliases` map on
the view. **If you add an ordering key that crosses a to-many relation, it belongs in that map, not
in `ordering_fields`.**

**The invariant worth keeping.** `_primary_region_subquery` mirrors `PostOffice.region`'s tie-break
exactly -- `defunct_date DESC NULLS FIRST, established_date DESC NULLS LAST`, minus subregion tiers --
so the sort key and the displayed `state` cannot disagree. Change one and change both.
`PostOffice.region` gained the same tier guard: it resolved to the state before only because VA/WV
carry an `established_date` and counties do not, so one dated county row would have flipped it.

**`PostOffice.regions` (plural) deliberately still returns county links** -- the marking detail page
needs them for its County field. Consumers meaning "state/territory" filter on `region_tier`, which
the serializer ships on every entry.

**A trap, measured.** `PostOffice.objects.exclude(post_office_regions__region__region_tier__in=...)`
looks like the obvious way to drop county links and is wrong: excluding across a to-many relation
compiles to `NOT EXISTS`, so it drops every town that has *any* county link -- **593 of 2,162 post
offices survived** it locally. `town_options` iterates the junction instead, where the same
predicate is a forward FK.

**Sources.** [Django `order_by`](https://docs.djangoproject.com/en/5.2/ref/models/querysets/#order-by)
* [`distinct`](https://docs.djangoproject.com/en/5.2/ref/models/querysets/#distinct)
* [Subquery](https://docs.djangoproject.com/en/5.2/ref/models/expressions/#subquery-expressions)
* [DRF #6886](https://github.com/encode/django-rest-framework/issues/6886)
* [django-filter usage](https://django-filter.readthedocs.io/en/stable/guide/usage.html) (the
`filterset_fields` dict form behind `region_tier__in`).

## 2026-08-15 -- Backups: mysqldump over MySQL Shell, `/var/backups` over `/srv/woco/backups`, DB before media

**What was decided.** The automated backup system (`deploy/worldcovers-backup.sh` and
friends) makes three choices that a reasonable reader might expect to go the other way.

**1. `mysqldump`, not the MySQL Shell dump utilities.** The MySQL 8.0 manual now
carries a Tip recommending Shell's utilities over `mysqldump`
([using-mysqldump](https://dev.mysql.com/doc/refman/8.0/en/using-mysqldump.html)),
and `mysqlpump` is deprecated as of 8.0.34
([mysqlpump](https://dev.mysql.com/doc/refman/8.0/en/mysqlpump.html)). Shell's
advantage is parallel dumping and integrated compression, which matters on large
datasets; ours is a **1.7 MB compressed / 22.2 MB raw** dump. Against it: Shell has its
own dump format, and there is no equivalent on prod's MariaDB -- so adopting it means
carrying two tools and two restore paths for two environments whose comparability is the
whole point. `mysqldump` is also what the 2026-08-07 manual backup used and what the
2026-08-10 restore rehearsal passed with. The flag set is frozen to that proven set plus
`--no-tablespaces` (`PROCESS` is required without it as of 8.0.21, and `wocod`
deliberately lacks it). Deliberately excluded: `--databases` (keeps the dump loadable
into a scratch DB for rehearsal), `--events` (none exist), and `--set-gtid-purged`
(MySQL-only; MariaDB's dumper rejects it -- the same portability trap as
`ISSUE-2026-08-10-01`, one layer down).

**2. `/var/backups/woco`, not `/srv/woco/backups`.** The latter already exists and
already holds 1.9 GB. It is also **inside the git checkout** that `deploy/deploy.sh`
runs `git reset --hard` against, and that a recovery would re-clone. Backups must not
live in a directory the deploy process manages. `/var/backups` is the FHS location and
is on the same filesystem as the media tree, which is what makes `rsync --link-dest`
hardlinks work at all. The 1.9 GB of pre-existing content was left alone: deleting data
during a backup rollout is exactly backwards.

**3. The database is dumped before media, and the order is a correctness property.**
`mysqldump --single-transaction` snapshots at time T; the media rsync finishes at T+n. A
file created in that window lands on disk with no DB row -- a harmless orphan. The
reverse order yields DB rows pointing at files that were never copied -- a broken image
link, which is precisely the failure `backups/2026-08-07/README.md` warns about.

**Accepted limitation, recorded rather than hidden.** `--single-transaction` is not
isolated from concurrent DDL: the manual states that while such a dump is in process, no
other connection should use `ALTER TABLE`, `CREATE TABLE`, `DROP TABLE`, `RENAME TABLE`
or `TRUNCATE TABLE`
([mysqldump](https://dev.mysql.com/doc/refman/8.0/en/mysqldump.html)). A `deploy.sh`
migration racing the 02:30 UTC window would produce an inconsistent dump that passes
every check we make. Low probability, not cheaply fixable, documented in `BACKUP.md`.

**Related:** the manifest's row-count census is taken from the live database a few
seconds before `START TRANSACTION`, so `worldcovers-restore` treats a row-count
difference as a **report** and only a missing table as a hard failure. Claiming exactness
we do not have would be worse than saying so.

**Source / evidence.** Verified end to end on woco.dev 2026-08-15: first snapshot 43
tables / 7,693 media files / 1.33 GB, with `common_region` (199) and `post_office`
(5,754) matching the live API exactly from an independent path. Restore rehearsal from
the pulled copy passed with the census exact and media 0 missing / 0 corrupt / 0 size
drift. Hardlinking measured: two snapshots that would be 2.52 GB as independent copies
occupy 1.26 GB. Failure injection (unreachable database) left `LAST_SUCCESS` untouched,
pruned nothing, and wrote `ALERT` with `consecutive_failures=1`.

## 2026-08-07 -- Image validation combines #76's wrong-kind warning with #94's no-image opt-out

**What was decided.** On `Contribute.tsx` and `CoverEdit.tsx`, submission validation now
chains both image rules rather than choosing one:

```ts
if (gallery.length === 0 && !noMarkingImage) {
  errors.images = "Add at least one image or confirm no image is available";
} else if (coverLikeImageCount > 0 && !wrongImageKindAcknowledged) {
  errors.images = "Confirm the highlighted image is correct, or remove it, before submitting.";
}
```

Both controls render -- the "No image is available to upload" `Checkbox` and
`<WrongImageKindWarning>`.

**What changed.** Issue #76 as originally implemented made at least one image a hard
requirement (`"At least one image is required"`). That is now relaxed: a contributor who
ticks the no-image opt-out may submit an empty gallery. The wrong-kind acknowledgement is
unreachable when the gallery is empty, so the opt-out always takes precedence.

**Why.** PR #94 (merged to staging 2026-08-06) added the `noMarkingImage` / `noCoverImage`
opt-out to the same validation block that #76 had rewritten. Rebasing
`reese/issue-75-v1-cover-routing` onto staging surfaced this as a direct textual conflict in
both files. Keeping #76's hard requirement would have reverted a feature already merged and
live on woco.dev; dropping #76's check would have descoped the issue. Neither rule
invalidates the other -- they guard different failure modes (no image at all vs. an image of
the wrong kind) -- so both were kept.

**Source / evidence.**
- Conflict surfaced by `git rebase origin/staging reese/issue-75-v1-cover-routing`,
  commit `8a923a9` (#76) replayed onto `e7b4612` (#95).
- Confirmed with Reese 2026-08-07 before resolution.
- Verified: `npm run lint`, `npm run typecheck`, `npm test` (19 suites / 90 tests), and
  `npm run build` all pass; `frontend/src/lib/contributionToFields.test.ts` (staging's
  opt-out) and `frontend/src/components/WrongImageKindWarning.test.tsx` (#76) both green.

## 2026-08-07 -- `0013_image_cropped_from` renumbered to `0014`

**What was decided.** The #77 migration was renamed
`0013_image_cropped_from.py` -> `0014_image_cropped_from.py`, with its dependency repointed
from `0012_backfill_marking_date_ranges` to `0013_merge_staging_dateselect`.

**Why.** Staging's PR #94 introduced `0013_merge_staging_dateselect.py`, so after the rebase
two migrations claimed `0013` and the `common` app had two leaf nodes. Git does not flag
this -- both files merge cleanly -- but Django raises *"Conflicting migrations detected;
multiple leaf nodes in the migration graph"* at runtime. Renumbering to sit after staging's
merge node keeps the graph linear and avoids generating a second merge migration.

**Source / evidence.** `manage.py makemigrations --check --dry-run` -> "No changes detected";
`manage.py check` -> no issues; `manage.py showmigrations common` shows a single linear tail
ending at `0014_image_cropped_from`.
