# Contribution Moderation Workflow

## Architecture: Option A (Contribution in `common` app)

The Contribution model lives in the existing `common` app because:
- Contributions are tightly coupled with Postmarks (the catalog)
- State assignment and region logic already exist in `common`
- Avoids circular imports and keeps the domain cohesive

---

## Contribution Model

| Field | Type | Description |
|-------|------|-------------|
| `id` | AutoField | Primary key |
| `contributor` | FK → User | User who submitted |
| `postmark` | OneToOne → Postmark (nullable) | Set when approved; created from `submitted_data` for new entries |
| `submitted_data` | JSONField | Proposed changes (state, town, type, color, description, etc.) |
| `status` | CharField | `pending`, `approved`, `rejected`, `needs_revision` |
| `reviewer` | FK → User (nullable) | User who approved/rejected |
| `review_notes` | TextField | Notes from reviewer |
| `created_at` | DateTimeField | Submission time |
| `updated_at` | DateTimeField | Last update |

---

## API Endpoints

### Contributor Endpoints

| Method | Endpoint | Description |
|--------|---------|-------------|
| GET | `/api/contributions/` | List current user's contributions |
| POST | `/api/contributions/` | Submit a new contribution (creates Contribution, not Postmark) |
| POST | `/api/contributions/` with `editContributionId` | Update a pending contribution |
| POST | `/api/contributions/` with `editPostmarkId` | Update an existing approved Postmark |

### Moderation Endpoints (State Editors)

| Method | Endpoint | Description |
|--------|---------|-------------|
| GET | `/api/contributions/` | List contributions (own + region) |
| GET | `/api/contributions/<id>/` | Retrieve a contribution |
| POST | `/api/contributions/<id>/approve/` | Approve; apply `submitted_data` to catalog |
| POST | `/api/contributions/<id>/reject/` | Reject; catalog unchanged |

### Query Parameters (List)

- `status` – Filter by `pending`, `approved`, `rejected`, `needs_revision`

---

## Permissions

- **Contributors**: Create contributions, view their own, edit pending ones
- **State Editors**: Users assigned to a region (via `UserLocationAssignment` or `AdministrativeUnitResponsibility`) can list, retrieve, approve, and reject contributions for that region
- **Superusers**: Full access

---

## Workflow

1. **Submit**: User POSTs to `/api/contributions/` → creates `Contribution` with `status=pending`
2. **Review**: State Editor lists contributions, opens detail
3. **Approve**: POST to `/api/contributions/<id>/approve/` → `_apply_contribution_to_catalog()` creates/updates Postmark, links to Contribution, sets `status=approved`
4. **Reject**: POST to `/api/contributions/<id>/reject/` → sets `status=rejected`, catalog unchanged

---

## Migration Plan

1. **Run migration**: `python manage.py migrate common`
2. **Existing data**: Current system writes directly to Postmark. No migration of existing Postmarks to Contributions; new submissions use the Contribution workflow.
3. **Frontend**: Update Contribute form to handle `contributionId` in response; Dashboard to show pending contributions from GET `/api/contributions/`.

---

## Example API Calls

### Submit (new)
```bash
POST /api/contributions/
Content-Type: application/json

{
  "state": "Virginia",
  "town": "Richmond",
  "firstSeen": "2002",
  "lastSeen": "2005",
  "type": "Single Arc",
  "color": "Black",
  "manuscript": "No",
  "description": "...",
  "references": "..."
}
# Response: {"detail": "Submission sent...", "contributionId": 42}
```

### Approve
```bash
POST /api/contributions/42/approve/
Content-Type: application/json

{"review_notes": "Looks good."}
# Response: {"detail": "Contribution approved.", "postmarkId": 123}
```

### Reject
```bash
POST /api/contributions/42/reject/
Content-Type: application/json

{"review_notes": "Duplicate entry."}
# Response: {"detail": "Contribution rejected."}
```
