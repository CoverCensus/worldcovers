"""Read the printed organization of the 2021 FPHC second edition.

All coordinates are PDF points, measured from the top left of the page.
This module records source layout. It does not identify postal objects.
"""

from __future__ import annotations

import re
from collections import defaultdict
from typing import Any

Record = dict[str, Any]


def bounds(items: list[Record]) -> list[float]:
    return [
        min(item["bbox"][0] for item in items),
        min(item["bbox"][1] for item in items),
        max(item["bbox"][2] for item in items),
        max(item["bbox"][3] for item in items),
    ]


def overlaps(a: list[float], b: list[float]) -> bool:
    return min(a[2], b[2]) > max(a[0], b[0]) and min(a[3], b[3]) > max(a[1], b[1])


def name_key(text: str) -> str:
    """Compare an index name with a heading; keep both original strings."""
    text = re.sub(r"\s*\(?C\.?\s*H\.?\)?\s*$", "", text, flags=re.IGNORECASE)
    return re.sub(r"[^A-Z0-9]", "", text.upper())


def section_name(page: int) -> str:
    if page <= 6:
        return "Publication and introduction"
    if page <= 38:
        return "Historical sections, military posts, and routes"
    if page <= 41:
        return "Listing of Post Offices (1821-1861) by County"
    if page <= 52:
        return "Maps"
    if page <= 452:
        return "Alphabetical listing of Post Offices"
    if page == 453:
        return "Bibliography"
    if page <= 455:
        return "Post Office Index"
    return "Biographies and final page"


def text_lines(words: list[Record], prefix: str) -> list[Record]:
    """Group adjacent native words without joining separate page columns."""
    rows: list[list[Record]] = []
    for word in sorted(words, key=lambda item: (item["bbox"][1], item["bbox"][0])):
        if not rows or abs(rows[-1][0]["bbox"][1] - word["bbox"][1]) > 2:
            rows.append([])
        rows[-1].append(word)
    lines = []
    for row in rows:
        runs: list[list[Record]] = []
        for word in sorted(row, key=lambda item: item["bbox"][0]):
            if not runs or word["bbox"][0] - runs[-1][-1]["bbox"][2] > 18:
                runs.append([])
            runs[-1].append(word)
        for run in runs:
            lines.append({
                "id": f"{prefix}-l{len(lines) + 1:04d}",
                "text": " ".join(item["text"] for item in run),
                "bbox": bounds(run),
                "word_ids": [item["id"] for item in run],
                "fonts": sorted({item["font"] for item in run}),
                "sizes": sorted({item["size"] for item in run}),
            })
    return lines


def read_index(pages: list[Record]) -> list[Record]:
    entries = []
    for page in pages:
        if page["pdf_page"] not in (454, 455):
            continue
        rows: dict[float, list[Record]] = defaultdict(list)
        for word in page["words"]:
            if word["bbox"][1] > 45:
                rows[round(word["bbox"][1], 1)].append(word)
        for row in rows.values():
            pending = []
            for word in sorted(row, key=lambda item: item["bbox"][0]):
                if word["text"].isdigit() and 53 <= int(word["text"]) <= 452:
                    if pending:
                        entries.append({
                            "name": " ".join(item["text"] for item in pending),
                            "catalog_page": int(word["text"]),
                            "index_page": page["pdf_page"],
                            "bbox": bounds(pending + [word]),
                        })
                    pending = []
                else:
                    pending.append(word)
    return entries


def office_headings(page: Record) -> list[Record]:
    if not 53 <= page["pdf_page"] <= 452:
        return []
    return [line for line in page["lines"]
            if line["bbox"][1] > 45 and all(abs(size - 12) < .01 for size in line["sizes"])
            and all("Bold" in font for font in line["fonts"])]


def build_offices(pages: list[Record], exceptions: list[Record]) -> list[Record]:
    index = read_index(pages)
    offices = []
    for page in pages:
        page["office_spans"] = []
        for heading in office_headings(page):
            matches = [entry for entry in index
                       if name_key(entry["name"]) == name_key(heading["text"])]
            office = {
                "id": heading["id"] + "-office",
                "heading": heading["text"],
                "heading_id": heading["id"],
                "start": {"pdf_page": page["pdf_page"], "bbox": heading["bbox"]},
                "index_entries": matches,
                "spans": [],
            }
            offices.append(office)
            if not any(entry["catalog_page"] == page["printed_page"] for entry in matches):
                exceptions.append({"kind": "office_index_mismatch", "source_id": office["id"],
                                   "pdf_page": page["pdf_page"], "heading": heading["text"],
                                   "index_entries": matches})
    active = None
    by_heading = {office["heading_id"]: office for office in offices}
    for page in pages:
        if not 53 <= page["pdf_page"] <= 452:
            continue
        top = 45.0
        for heading in office_headings(page):
            if active is not None:
                add_span(active, page, top, heading["bbox"][1])
            active = by_heading[heading["id"]]
            top = heading["bbox"][1]
        if active is not None:
            add_span(active, page, top, page["height"])
    for entry in index:
        if not any(name_key(office["heading"]) == name_key(entry["name"]) for office in offices):
            exceptions.append({"kind": "index_entry_without_heading", "index_entry": entry,
                               "pdf_page": entry["index_page"]})
    return offices


def add_span(office: Record, page: Record, top: float, bottom: float) -> None:
    if bottom <= top:
        return
    span = {"office_id": office["id"], "pdf_page": page["pdf_page"],
            "printed_page": page["printed_page"], "bbox": [0.0, top, page["width"], bottom]}
    office["spans"].append(span)
    page["office_spans"].append(span)


def apply_office(item: Record, page: Record) -> None:
    candidates = [span["office_id"] for span in page["office_spans"]
                  if overlaps(item["bbox"], span["bbox"])]
    item["office_candidates"] = candidates
    item["office_id"] = candidates[0] if len(candidates) == 1 else None


def find_captions(page: Record) -> list[Record]:
    """The book prints figure captions in 11-point italic type."""
    captions = []
    for line in page["lines"]:
        if not all(abs(size - 11) < .01 for size in line["sizes"]) or not all("Italic" in font for font in line["fonts"]):
            continue
        if any(overlaps(line["bbox"], table["bbox"]) for table in page["tables"]):
            continue
        if (captions and 0 <= line["bbox"][1] - captions[-1]["bbox"][3] <= 5
                and abs(line["bbox"][0] - captions[-1]["bbox"][0]) < 30):
            previous = captions[-1]
            previous["text"] += "\n" + line["text"]
            previous["bbox"] = bounds([previous, line])
            previous["line_ids"].append(line["id"])
        else:
            captions.append({"id": line["id"] + "-caption", "text": line["text"],
                             "bbox": list(line["bbox"]), "line_ids": [line["id"]]})
    return captions


def link_captions(page: Record, exceptions: list[Record]) -> None:
    for image in page["images"]:
        image["caption_ids"] = []
        image["nearby_caption_ids"] = []
    for caption in page["captions"]:
        apply_office(caption, page)
        candidates = []
        for image in page["images"]:
            a, b = image["bbox"], caption["bbox"]
            gap = b[1] - a[3]
            overlap = min(a[2], b[2]) - max(a[0], b[0])
            if -2 <= gap <= 40 and overlap >= min(a[2] - a[0], b[2] - b[0]) * .5:
                candidates.append((max(0, gap), image))
                image["nearby_caption_ids"].append(caption["id"])
        nearest = min((gap for gap, _ in candidates), default=0)
        close = [image for gap, image in candidates if gap <= nearest + 2]
        caption["image_candidates"] = [image["id"] for _, image in candidates]
        caption["image_id"] = None
        if (len(close) == 1 and close[0]["office_id"] == caption["office_id"]
                and len(caption["office_candidates"]) <= 1
                and len(close[0]["office_candidates"]) <= 1):
            caption["image_id"] = close[0]["id"]
            close[0]["caption_ids"].append(caption["id"])
            caption["placement_status"] = "clear_below_image"
        else:
            caption["placement_status"] = "unresolved"
            exceptions.append({"kind": "unresolved_caption_placement", "pdf_page": page["pdf_page"],
                               "source_id": caption["id"], "image_candidates": caption["image_candidates"]})


def attach_context(pages: list[Record], exceptions: list[Record]) -> list[Record]:
    offices = build_offices(pages, exceptions)
    preceding: dict[str, Record] = {}
    for page in pages:
        page["catalog_section"] = section_name(page["pdf_page"])
        office_heading_ids = {line["id"] for line in office_headings(page)}
        page["section_headings"] = [line for line in page["lines"]
                                    if line["bbox"][1] > 45 and line["id"] not in office_heading_ids
                                    and (all("Bold" in font for font in line["fonts"])
                                         or min(line["sizes"]) >= 18)
                                    and not any(overlaps(line["bbox"], table["bbox"]) for table in page["tables"])]
        for kind in ("lines", "tables", "images"):
            for item in page[kind]:
                apply_office(item, page)
                if kind != "lines" and len(item["office_candidates"]) > 1:
                    exceptions.append({"kind": "element_crosses_office_boundary", "source_id": item["id"],
                                       "pdf_page": page["pdf_page"], "office_candidates": item["office_candidates"]})
        for image in page["images"]:
            a = image["bbox"]
            nearby = [a[0] - 20, a[1] - 40, a[2] + 20, a[3] + 40]
            image["nearby_line_ids"] = [line["id"] for line in page["lines"]
                                        if overlaps(line["bbox"], nearby)]
        for table in page["tables"]:
            first = " ".join(cell or "" for cell in table["rows"][0]["cells"])
            table["header_text"] = first if "Postmaster" in first or "Usage" in first else None
            office_id = table["office_id"]
            previous = preceding.get(office_id) if office_id else None
            table["preceding_same_office_table_id"] = previous["id"] if previous else None
            table["continuation_candidate_id"] = (
                previous["id"] if previous and table["header_text"] is None
                and len(table["rows"][0]["cells"]) == len(previous["rows"][0]["cells"]) else None)
            if office_id:
                preceding[office_id] = table
        page["captions"] = find_captions(page)
        link_captions(page, exceptions)
    return offices
