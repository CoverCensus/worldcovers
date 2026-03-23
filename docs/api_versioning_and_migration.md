# WorldCovers API Versioning & Migration Documentation

This document outlines the architectural changes, API versioning strategies, frontend configuration updates, and database schema modifications made to integrate the `backend-apmc` codebase safely as **API Version 2 (v2)**, while guaranteeing 100% backward compatibility for the existing **API Version 1 (v1)**.

---

## 1. Versioning Strategy & Routing

To guarantee that the legacy application continues to function perfectly while new APMC models actively run in parallel, we decoupled the backend URLs using explicit folder boundaries. 

### Backend Separation
- **`backend/common/api/v1/`**: Contains the original, stable `views.py`, `serializers.py`, and `urls.py`. These files power the legacy system.
- **`backend/common/api/v2/`**: Contains the newly introduced `views.py`, `serializers.py`, and `urls.py` sourced directly from the `backend-apmc` branch. These contain updated serializers handling the new tables and properties.

### API Routing (`backend/woco/urls.py`)
Both codebases are mounted in tandem without conflicts:
- `[GET/POST] /api/v1/...` → Routes to `common.api.v1.urls`
- `[GET/POST] /api/v2/...` → Routes to `common.api.v2.urls`
- `[GET/POST] /api/...` → Acts as an alias forwarding legacy traffic securely to `v1`.

### Relative Imports Fixed
Within `v1` and `v2`, any relative imports targeting `models.py`, `filters.py`, `utils.py`, and `csv_import.py` were rewritten to accurately point back up to the `common` module (e.g. `from common.models import Postmark`).

---

## 2. Frontend Configuration Updates

Previously, the React frontend aggressively hardcoded suffix paths like `"/api/login/"` or `` `${apiBase}/api/publications/` `` into 30+ components and services. Since our system now runs `v1` side-by-side, injecting hardcoded `/api/`s leads to broken routes (e.g., `http://localhost:8000/api/v1/api/login/`).

**Changes Completed:**
1. Stripped hardcoded `"/api/"` strings across 30 UI files.
2. Formatted endpoints to dynamically rely solely on the `.env` configuration (appending merely `/login/` securely to the base). 
3. Setup `VITE_API_BASE_URL="http://localhost:8000/api/v1"` in `.env` to natively connect the SPA to `v1`.

---

## 3. Database Schema Modifications (Backend-APMC)

One of the largest hurdles was that the `backend-apmc` branch deleted original production migrations and scrubbed `v1` models (such as `AdminCsvUpload` and `FAQEntry`). Merging this natively would break existing systems and history. 

Instead of a blanket merge, an Abstract Syntax Tree (AST) Python analyzer merged exclusively the **new schemas and attributes** into `common/models.py`, persisting all historical models. We bundled these upgrades dynamically into a pristine, additive Django migration: `0034`.

### Tables Modified
**`Postmark`** was heavily enhanced. Rather than deleting old field representations (like `date_format`), we appended the following purely additive v2 fields:
- `code` *(CharField)*
- `catalog_txt` *(TextField)*
- `inscription_txt` *(TextField)*
- `impression` *(CharField)*
- `width` / `height` *(DecimalField)*
- `is_irreg` *(BooleanField)*
- `date_type` / `date_fmt` *(CharField)*
- `color` *(ForeignKey to Color)*
- `legacy_date_format` *(ForeignKey referencing existing DateFormat identifiers)*
- `shape` *(ForeignKey to new `Shape` model)*
- `lettering` *(ForeignKey to new `Lettering` model)*
- `post_office` *(ForeignKey to new `PostOffice` model)*

### Brand New Tables Added
To support v2's expanded archival relationships, the following independent tables were introduced:
- **Geographic & Jurisdictional Models**: `Region`, `PostOffice`
- **Physical Characteristics Models**: `Shape`, `Lettering`, `Framing`
- **Marking Identification Models**: `Ratemark`, `Auxmark`, `MarkFraming`
- **Artifact Binding Models**: `Cover`, `CoverPostmark` (joins Cover -> Postmark), `PostmarkRatemark` (joins Postmark -> Ratemark)
- **Citations Models**: `ReferenceWork`, `Citation`
- **Timestamps**: `DateObserved`

### Restored / Unaffected Tables
The following `v1` models remained completely intact despite `backend-apmc` attempting to erase or overwrite them:
- `Contribution` (Retained legacy structure)
- `AdminCsvUpload` (Retained for Dashboard use)
- `FAQEntry` (Retained without issues)

## Summary
The codebase now safely supports simultaneous `v1` standard functionality while unlocking `v2` logic for modern features and new physical domains. All changes are backwards-compatible and tracked successfully throughout the application’s lifespan without breaking production integrity.
