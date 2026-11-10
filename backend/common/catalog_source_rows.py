"""Read catalog evidence and verify relationships within a bundle."""

import csv
import re
from pathlib import Path

STEMS = {"post_offices": "OFFICE", "markings": "MARKING", "covers": "COVER"}
AUDIT = {"created_by", "modified_by", "created_date", "modified_date"}


def read_rows(directory: Path, stem: str) -> list[dict]:
    with (directory / (stem + ".csv")).open(encoding="utf-8", newline="") as file:
        return [{k: v for k, v in row.items() if k not in AUDIT} for row in csv.DictReader(file)]


def source_items(directory: Path, edition: str | None, allow_missing: bool) -> tuple[str, dict]:
    """Infer the ASCC edition from Entry codes, never from the seed bibliography."""
    optional = {"covers", "cover_markings", "cover_valuations"}

    def rows(stem):
        if (allow_missing or stem in optional) and not (directory / (stem + ".csv")).exists():
            return []
        return read_rows(directory, stem)

    items = {}
    for stem, kind in STEMS.items():
        for row in rows(stem):
            key = (kind, row["code"])
            if not key[1] or key in items:
                raise ValueError(f"Invalid or repeated source key {key}")
            items[key] = {"row": row}
    if edition is None:
        editions = {code.partition("-")[0] for kind, code in items if kind != "OFFICE"}
        if len(editions) != 1 or not re.fullmatch(r"ASCC[0-9]+", next(iter(editions), "")):
            raise ValueError("Expected Entry codes from one ASCC edition.")
        edition = editions.pop()
    for kind, code in items:
        if (kind != "OFFICE" or edition == "FPHC2") and not code.startswith(edition + "-"):
            raise ValueError(f"Unexpected {edition} source code {code}")
    for stem in (
        "cover_valuations",
        "post_office_regions",
        "dates_seen",
        "citations",
        "images",
        "cover_markings",
    ):
        for row in rows(stem):
            if stem == "post_office_regions":
                key = ("OFFICE", row["post_office"])
            elif stem in ("cover_markings", "cover_valuations"):
                key = ("COVER", row["cover"])
                if stem == "cover_markings" and ("MARKING", row["marking"]) not in items:
                    raise ValueError(f"Unknown parent Marking for {key}")
            else:
                if row["subject_type"] not in ("MARKING", "COVER"):
                    raise ValueError(f"Invalid subject type in {stem}")
                key = (row["subject_type"], row["subject_id"])
            if stem == "citations" and edition == "FPHC2" and row["reference_work"] != edition:
                raise ValueError(f"Unexpected Reference Work for {key}")
            items[key].setdefault(stem, []).append(row)
    for (kind, code), data in items.items():
        if kind == "OFFICE":
            regions = {r["region"] for r in data.get("post_office_regions", [])}
            if not regions or (edition == "FPHC2" and "USA-FL1" not in regions):
                raise ValueError(f"Missing Post Office Region for {code}")
        elif edition == "FPHC2" and not data.get("citations"):
            raise ValueError(f"Missing FPHC2 Citation for {code}")
        elif kind == "COVER" and not data.get("cover_markings"):
            raise ValueError(f"Missing CoverMarking for {code}")
        elif kind == "MARKING" and ("OFFICE", data["row"]["post_office"]) not in items:
            raise ValueError(f"Missing Post Office for {code}")
    return edition, items


def source_citations(evidence, edition):
    rows = [(c["reference_work"], c["citation_detail"]) for c in evidence.get("citations", [])]
    # The source code identifies the edition even on institutional Covers
    # for which ASCC supplies no separate page or Citation row.
    if not any(code == edition for code, _ in rows):
        rows.append((edition, ""))
    return rows
