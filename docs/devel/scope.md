# WorldCovers — Feature Scope

## SPA vs. Django Admin

Not every feature in [design.md](design.md) is implemented in the React SPA. The table below shows where each feature lives so that frontend developers and designers know exactly what to look for and where.

| Feature | Name | Where implemented |
|---------|------|-------------------|
| F1 | Authentication | SPA (`/login`, `/reset-password`) |
| F2 | Collection Administration | Django `/admin/` only |
| F3 | Reference Work Management | Django `/admin/` only |
| F4 | Collection Discovery | SPA (`/`, `/search`, record detail) |
| F5 | Personal Collection Management | SPA (`/dashboard`, `/contribute`, `/edit`) |
| F6 | Audit Trail | SPA (`/my-suggestions`, `/submission/:id`) |
| F7 | Submission Workflow | SPA (both contributor submission and Editor review/approval) |
| F8 | Comment Workflow | SPA (`/record/:id`) + API moderation (`/api/v2/comments`) |
| F9 | System Maintenance | Django `/admin/` only |
| F10 | Catalog Data Pipeline | Offline tooling only — see [TOOLS.md](TOOLS.md) |

## Admin-only features

**F2 — Collection Administration** (S10, S11): Creating institutional collections and assigning Editors is done exclusively through Django `/admin/`. There are no SPA screens for these operations and none are planned — this is intentional, not a gap.

**F3 — Reference Work Management** (S16): Adding, editing, and removing reference works (citable catalogs and publications) is done through Django `/admin/`. The SPA exposes reference works for citation in contribution forms but does not provide management UI.

**F9 — System Maintenance** (S21, S22, S23): Backup, restore, and system update operations are Administrator-only and are exposed through Django `/admin/`, not the SPA.

**F10 — Catalog Data Pipeline** (S24–S28): Exploratory analysis, data normalization, format conversion, and bulk import/export are offline operations. They run as Django management commands and Jupyter notebooks in `tools/`, not through any application interface. See [TOOLS.md](TOOLS.md) for invocation details.

## Notes

**F7 — Submission Workflow**: Fully in the SPA for all roles. Contributors submit and track status via `/contribute`, `/my-suggestions`, and `/submission/:id`. Editors review, approve, reject, and request revisions via `/contribution/:id` (`ContributionDetail`). Django `/admin/` has a `ContributionAdmin` with bulk approve/reject actions, but that is a secondary convenience for administrators, not the primary Editor interface.
