# V1 Summary: The Original Data Format

This document describes the "v1" data format used in the early stages of the CoverCensus project — the flat CSV extraction format that preceded the current 17-type domain model defined in `model.md`. It exists to help future developers and agents understand where we came from, what changed, and why.

## What v1 Was

The v1 format was a direct transcription of ASCC (American Stampless Cover Catalog) page scans into flat CSV files. Each state section of the catalog was extracted into its own CSV using a Claude skill called `catalog-extract`. The format was intentionally minimal and preservation-oriented: the goal was to get the printed catalog data into a machine-readable form without imposing any interpretation on it.

### The v1 CSV Schema

Every v1 extraction file had exactly three columns:

| Column | Type | Description |
|--------|------|-------------|
| `Listing` | string | The **complete text** of the catalog entry as printed, reproduced faithfully as a single string. Includes town name, state abbreviation, dates, size measurements, rate markings, colors, leader dots, and value — all as one undivided field. |
| `Page` | integer | The printed page number found at the bottom of the scanned page (not the PDF page index). |
| `Images Above` | integer | Count of postmark illustrations (handstamp reproductions) appearing immediately above that listing on the page. `0` if none. |

### What a v1 Row Looks Like

A typical entry:

```csv
"MARTINSBURG,/W.VA.(1864;26;DUE/3[C];Blue) . . . . . . . . . 40.00",438,0
```

A continuation entry (same town, different marking variant):

```csv
"Same(1864;DC-30;DUE/6[C];Blue) . . . . . . . . . . . . . . 60.00",438,0
```

A section header (included as its own row for context):

```csv
"HANDSTAMPED TOWN POSTMARKS",297,0
```

### Key Design Principles of v1

The v1 format was governed by several deliberate constraints:

**No parsing of the listing text.** The `Listing` column was sacrosanct — it contained the full catalog entry exactly as printed, and the extraction process was explicitly forbidden from splitting it into sub-columns for town, date, size, color, value, etc. This was a hard rule, not a suggestion. The reasoning: the ASCC catalog's typographic conventions are dense, inconsistent, and full of edge cases (semicolons inside parentheses, commas within quoted fields, `Same(` continuation lines that inherit context from parent rows, rate markings with nested brackets). Premature parsing would silently lose information or impose incorrect structure.

**Preservation of typographic detail.** Semicolons, slashes, brackets, parentheses, leader dots, spacing — all preserved exactly as printed. Even apparent typos in the catalog (misspellings like "BRAOZ", "MONTANO") were reproduced faithfully. The source of truth was the printed page, not what someone thought the catalog *meant* to say.

**`Same(` lines as independent rows.** When the catalog uses `Same(` to indicate a continuation entry for the same town/device with different characteristics (a different rate marking, different date, different color), each `Same(` line got its own CSV row rather than being folded into the parent. Leading whitespace on indented `Same(` lines was preserved.

**Image counts as a linking mechanism.** The `Images Above` column was the closest thing v1 had to a relationship between textual entries and visual content. It didn't identify *which* image — just how many postmark illustrations appeared directly above a given listing. This was a crude but reliable spatial proxy that could be cross-referenced later with extracted image files (produced by a separate `extract_postmarks.py` script using PyMuPDF and aspect-ratio heuristics).

**Section headers included as rows.** Headings like "HANDSTAMPED TOWN POSTMARKS", "CIRCLE TOWN POSTMARKS WITH PAID, FREE AND RATES", "MANUSCRIPT TOWN MARKS" were included as their own CSV rows with `Images Above = 0`. This preserved the document's organizational structure without requiring a separate metadata format.

### What v1 Did Not Have

The v1 format had no concept of:

- Entities or identity — no IDs, no primary keys, no notion of "this is the same post office across entries"
- Relationships — no foreign keys, no junction tables, no way to say "this ratemark was used with that town postmark"
- Normalized vocabularies — colors, shapes, lettering styles were whatever the catalog text said, uncontrolled
- Separate marking types — postmarks, ratemarks, and auxiliary marks were all embedded in the single `Listing` string
- Valuations as distinct from the listing — the dollar amount was part of the text blob
- Dates as structured data — "1864", "1860's", "186-", "Aug.25,1864" were all just substrings
- Physical dimensions as numbers — "26", "DC-30", "C--", "SL-39x3" were all just text within the listing
- Any distinction between a cover and its markings — the unit of data was the catalog line, not the postal artifact

### Scope of v1 Extraction

The `catalog-extract` skill was used across dozens of US state sections, producing per-state CSV files (e.g., `WV_ASCC_listings.csv`, `OH-1_ASCC-CTG_listings_full.csv`, `FL_ASCC_catalog_listings.csv`, `SC_ASCC_listings.csv`). Some large states required multiple extraction sessions. The Ohio extraction alone produced 1,679 rows across pages 297–316. The skill was iteratively refined — an early version attempted to parse the listing text into separate columns (Town Postmark, Dates Seen, Size, Rate Marking, Color, Value), but this was abandoned in favor of the single-string `Listing` column after the parsing proved unreliable and lossy.

## What Changed: v1 → Current Model

The current `model.md` defines a fully normalized relational domain model with 17 types. The transition from v1 to the current model represents a fundamental shift from "transcription of a printed page" to "structured representation of the postal-history domain."

### The 17 Types (Current Model)

The current model decomposes the flat catalog listing into independently-identified entities:

- **Cover** — the physical postal artifact (folded letter or folded letter sheet; `coverType` enum: FC, FL)
- **Postmark** — an independently-identified town marking device, anchored to a PostOffice; the catalog-entry identity
- **Ratemark** — an independently-identified rate-indicating device, *not* anchored to any single PostOffice; associated laterally with Postmarks via a many-to-many junction
- **Auxmark** — a dependent marking owned by exactly one parent marking (Postmark or Ratemark), with no independent identity
- **PostOffice** — a named postal facility within a Region
- **Region** — a geographic/administrative area (state, territory)
- **CoverPostmark** — junction table linking Covers to Postmarks (many-to-many)
- **PostmarkRatemark** — junction table linking Postmarks to Ratemarks (many-to-many)
- **DateObserved** — recorded usage dates for a Postmark, with granularity metadata
- **PostmarkValuation** — catalog-assigned value for a Postmark entry, in USD cents
- **Citation** — reference-work attribution targeting a Cover or Postmark
- **Color** — normalized color vocabulary (seed values: Black, Blue, Red, Green, Brown, etc.)
- **Shape** — normalized marking-shape vocabulary (seed values: Circle, Double Circle, Straight Line, etc.)
- **Lettering** — normalized lettering-style vocabulary (seed values: Serif, Sans Serif, Roman, Gothic, etc.)
- **MarkFraming** — framing/border treatment for any marking type (polymorphic via parentMarkType)
- **Impression** — physical quality/appearance vocabulary for struck markings

### The Structural Decomposition

The key insight that drove the model design is that a single v1 listing line like:

```
MARTINSBURG,/W.VA.(1864;26;DUE/3[C];Blue) . . . 40.00
```

actually contains information about multiple distinct domain entities:

- A **PostOffice** ("Martinsburg" in "W.VA." / West Virginia)
- A **Postmark** device (circle type, 26mm, with specific lettering)
- A **Ratemark** device ("DUE/3", circle-enclosed)
- A **Color** (Blue)
- A **DateObserved** (1864, year granularity)
- A **PostmarkValuation** ($40.00)
- An implicit **Cover** (the physical artifact this was struck on)
- An implicit **CoverPostmark** junction (this cover bears this postmark)
- An implicit **PostmarkRatemark** junction (this postmark was used with this ratemark)

The v1 format collapsed all of this into one text string. The current model teases it apart.

### Three Kinds of Markings, Three Structural Roles

One of the most significant design decisions in the current model is the treatment of physical postal markings. Postmark, Ratemark, and Auxmark share an almost identical field set (isManuscript, shapeId, letteringId, colorId, isIrregular, width, height, inscriptionText, impression) and the same conditional invariant block around `isManuscript`. A reviewer's first instinct is to collapse them into a single "Marking" type with a role discriminator.

The model intentionally keeps them separate because they have fundamentally different identity and ownership semantics:

- **Postmark** — anchored-independent: tied to a specific PostOffice, the catalog-entry identity, anchors DateObserved and PostmarkValuation
- **Ratemark** — floating-independent: not anchored to any single PostOffice, associated laterally with Postmarks via many-to-many; the same physical handstamp ("PAID 6") could be used across multiple offices
- **Auxmark** — dependent: owned by exactly one parent marking, no independent identity outside that relationship

The field-level duplication is the cost of modeling these different relationship patterns correctly. It's deliberate, not accidental.

### Vocabulary Normalization

Where v1 had whatever text the catalog printed ("Black", "Blue-green", "Maroon"), the current model introduces controlled vocabulary types (Color, Shape, Lettering) with seed values and the explicit acknowledgment that these are "intentionally provisional" — the editorial vocabularies will expand as more catalog data is processed, but they provide a stable reference layer for querying and analysis.

### The `isManuscript` Conditional

A marking is either handstamped (using a physical device) or manuscript (drawn by hand with a pen). This distinction affects which fields are meaningful: handstamped markings have shape, lettering, dimensions, and impression quality; manuscript markings have none of these. The current model encodes this through conditional invariants on the `isManuscript` boolean — when true, shapeId/letteringId/width/height/impression must be null; when false, they may be populated. This is one of the invariant tangles that motivated exploration of formal verification (Lean 4) as a specification layer.

## Why v1 Still Matters

The v1 CSVs are the raw material. They're the closest machine-readable representation of what the ASCC catalog actually says, uncorrupted by interpretation. Every entity in the current model was ultimately derived from parsing and decomposing v1 listing text. When something looks wrong in the normalized data, the v1 CSV is the reference you go back to — it's the audit trail.

The v1 format also represents the extraction pipeline's natural output. The `catalog-extract` skill continues to produce v1-format CSVs from new catalog page scans. These CSVs feed into a "data munger" tool (originally a Jupyter notebook, later refactored into a proper module) that parses the listing text, resolves `Same(` inheritance, normalizes vocabularies, and populates the current model's tables.

The pipeline is:

```
Scanned PDF pages
       │
       ├─ [catalog-extract skill] ──→ v1 CSV (Listing, Page, Images Above)
       │
       ├─ [extract_postmarks.py]  ──→ postmark illustration images (IMG-{page}-{index}.png)
       │
       ├─ [data munger]           ──→ parsed + normalized entities per model.md
       │
       └─ [database load]         ──→ relational tables with FKs and invariants
```

v1 is Stage 1 of this pipeline. It's not legacy — it's the intake format.

## Migration Notes for Developers

If you're working with v1 CSVs and need to understand how they map to the current model, keep in mind:

- **`Same(` inheritance is implicit.** A `Same(` row inherits its town/state from the most recent non-`Same(` row above it. Fields not restated in the `Same(` line (like color or size) may or may not carry forward — the catalog is inconsistent about this, and the v1 format deliberately does not resolve the ambiguity. The data munger handles inheritance logic.

- **Leader dots are part of the text.** The `..... 40.00` at the end of a listing is preserved in the `Listing` column. The value is extractable by parsing from the right, but it's not a separate field in v1.

- **Page numbers are printed page numbers, not PDF indices.** The ASCC catalog has its own pagination. A PDF containing pages 297–316 of the catalog will have PDF page indices 1–20, but the `Page` column will read 297–316.

- **Image association is spatial, not semantic.** `Images Above = 1` means there's a postmark illustration physically above this listing on the page. It doesn't tell you which Postmark entity the image corresponds to — that association is resolved later by cross-referencing the extracted images with the parsed postmark data.

- **Section headers are rows, not metadata.** If you're iterating through a v1 CSV, you'll encounter rows like `"HANDSTAMPED TOWN POSTMARKS",297,0` interspersed with actual listings. These need to be recognized and handled (used for context, then filtered out of the actual data rows).

- **Not all states are extracted yet.** The v1 corpus is an ongoing extraction effort. Coverage varies — some states have complete extractions, others are partial or missing.
