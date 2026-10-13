"""Dump the 2021 FPHC second edition without creating WoCo records.

Run: uv run python tools/fphc_extract.py
Needs Poppler's pdfimages. Output text is ASCII JSON with escaped source text.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import math
import re
import shutil
import subprocess
import sys
from collections import Counter
from pathlib import Path
from typing import Any

import pdfplumber
from pdfminer.pdfinterp import PDFPageInterpreter
from pdfplumber.page import PDFPageAggregatorWithMarkedContent

from fphc_layout import Record, attach_context, read_index, text_lines

VERSION = 1
WIP = Path(__file__).resolve().parent / "wip"
TABLE_SETTINGS = {"intersection_tolerance": 6, "snap_tolerance": 4}
SAMPLE_PAGES = [53, 54, 55, 56, 57, 60, 72, 73, 100, 201, 229, 277,
                302, 308, 314, 315, 318, 409, 410, 452]


def checksum(path: Path) -> str:
    with path.open("rb") as stream:
        return hashlib.file_digest(stream, "sha256").hexdigest()


def write_json(path: Path, data: Any) -> None:
    path.write_text(json.dumps(data, ensure_ascii=True, indent=2) + "\n", encoding="ascii")


def write_jsonl(path: Path, records: list[Record]) -> None:
    with path.open("w", encoding="ascii") as stream:
        for record in records:
            stream.write(json.dumps(record, ensure_ascii=True, separators=(",", ":")) + "\n")


def box(item: Record) -> list[float]:
    return [float(item[key]) for key in ("x0", "top", "x1", "bottom")]


class ImageDevice(PDFPageAggregatorWithMarkedContent):
    """Keep image transforms while pdfplumber reads the same page layout."""

    def __init__(self, *args: Any, **kwargs: Any) -> None:
        super().__init__(*args, **kwargs)
        self.image_transforms: list[Record] = []

    def render_image(self, name: str, stream: Any) -> None:
        super().render_image(name, stream)
        self.image_transforms.append({"object_id": stream.objid, "name": name,
                                      "matrix": list(self.ctm)})


def native_page(page: Any, prefix: str, exceptions: list[Record]) -> Record:
    device = ImageDevice(page.pdf.rsrcmgr, pageno=page.page_number, laparams=page.pdf.laparams)
    PDFPageInterpreter(page.pdf.rsrcmgr, device).process_page(page.page_obj)
    # Reuse the parsed layout so image transforms and text share one pass.
    page._layout = device.get_result()
    page_prefix = f"{prefix}-p{page.page_number:04d}"
    chars = [{"id": f"{page_prefix}-c{index:05d}", "text": char["text"],
              "bbox": box(char), "font": char["fontname"], "size": char["size"],
              "matrix": list(char["matrix"]), "mcid": char.get("mcid")}
             for index, char in enumerate(page.chars, 1)]
    words = [{"id": f"{page_prefix}-w{index:05d}", "text": word["text"],
              "bbox": box(word), "font": word["fontname"], "size": word["size"]}
             for index, word in enumerate(page.extract_words(extra_attrs=["fontname", "size"]), 1)]
    result = {
        "id": page_prefix, "pdf_page": page.page_number, "pdf_page_index": page.page_number - 1,
        "printed_page": None,
        "width": page.width, "height": page.height, "rotation": page.rotation,
        "raw_text": "".join(char["text"] for char in chars),
        "layout_text": page.extract_text(layout=True) or "",
        "chars": chars, "words": words, "lines": text_lines(words, page_prefix),
        "rules": [{"id": f"{page_prefix}-e{index:04d}", "bbox": box(edge),
                   "orientation": edge["orientation"], "width": edge.get("linewidth"),
                   "object_type": edge["object_type"]}
                  for index, edge in enumerate(page.edges, 1)],
        "tables": [], "images": [], "ocr": [],
    }
    numbers = [word for word in words if word["bbox"][1] < 34 and word["text"].isdigit()
               and abs(word["size"] - 12) < .01]
    if len(numbers) == 1:
        result["printed_page"] = int(numbers[0]["text"])
        result["printed_page_word_id"] = numbers[0]["id"]
    else:
        exceptions.append({"kind": "unresolved_printed_page", "pdf_page": page.page_number,
                           "candidates": numbers})
    for index, table in enumerate(page.find_tables(TABLE_SETTINGS), 1):
        table_id = f"{page_prefix}-t{index:03d}"
        rows = [{"id": f"{table_id}-r{row_index:03d}", "row_index": row_index,
                 "bbox": list(row.bbox), "cell_bboxes": [list(cell) if cell else None for cell in row.cells],
                 "cells": cells}
                for row_index, (row, cells) in enumerate(zip(table.rows, table.extract()), 1)]
        boundaries = sorted({value for row in rows for cell in row["cell_bboxes"] if cell
                             for value in (cell[0], cell[2])})
        table_chars = [(char, (char["bbox"][0] + char["bbox"][2]) / 2,
                        (char["bbox"][1] + char["bbox"][3]) / 2) for char in chars
                       if table.bbox[0] <= (char["bbox"][0] + char["bbox"][2]) / 2 < table.bbox[2]
                       and table.bbox[1] <= (char["bbox"][1] + char["bbox"][3]) / 2 < table.bbox[3]]
        for row in rows:
            row["cell_columns"] = [{"column_index": boundaries.index(cell[0]),
                                    "column_span": boundaries.index(cell[2]) - boundaries.index(cell[0])}
                                   if cell else None for cell in row["cell_bboxes"]]
            row["cell_raw_text"] = []
            for column_index, (cell, value) in enumerate(zip(row["cell_bboxes"], row["cells"])):
                if cell is None:
                    row["cell_raw_text"].append(None)
                    continue
                raw = "".join(char["text"] for char, x, y in table_chars
                              if cell[0] <= x < cell[2] and cell[1] <= y < cell[3])
                row["cell_raw_text"].append(raw)
                if "".join(raw.split()) != "".join(value.split()):
                    exceptions.append({"kind": "table_reading_order_difference", "pdf_page": page.page_number,
                                       "source_id": row["id"], "column_index": column_index})
        record = {"id": table_id, "bbox": list(table.bbox), "column_boundaries": boundaries,
                  "detection_method": "vector_rules", "rows": rows}
        result["tables"].append(record)
        columns = len(rows[0]["cells"])
        if 53 <= page.page_number <= 452 and columns not in (5, 7):
            exceptions.append({"kind": "unusual_table_columns", "pdf_page": page.page_number,
                               "source_id": table_id, "column_count": columns})
    for index, image in enumerate(page.images, 1):
        transform = device.image_transforms[index - 1]
        if image["stream"].objid != transform["object_id"]:
            raise ValueError(f"Image transform order differs on PDF page {page.page_number}")
        record = {
            "id": f"{page_prefix}-i{index:03d}", "bbox": box(image),
            "object_id": transform["object_id"], "resource_name": image["name"],
            "matrix": transform["matrix"], "native_width": image["srcsize"][0],
            "native_height": image["srcsize"][1], "bits": image["bits"],
            "is_mask": bool(image.get("imagemask")), "mcid": image.get("mcid"),
            "has_soft_mask": "SMask" in image["stream"].attrs,
        }
        result["images"].append(record)
    if len(device.image_transforms) != len(result["images"]):
        raise ValueError(f"Missing image placements on PDF page {page.page_number}")
    invalid_chars = [char["id"] for char in chars if "\ufffd" in char["text"] or "(cid:" in char["text"]]
    if invalid_chars:
        exceptions.append({"kind": "native_text_needs_review", "pdf_page": page.page_number,
                           "char_ids": invalid_chars, "ocr_status": "not_run"})
    return result


def native_assets(pdf: Path, cache: Path, force: bool) -> list[Record]:
    """Poppler preserves JPEG streams and writes other pixels losslessly."""
    index_path = cache / "native_index.json"
    if index_path.exists() and not force:
        records = json.loads(index_path.read_text(encoding="ascii"))
        if all((cache / filename).is_file() for record in records for filename in record["files"]):
            return records
    tool = shutil.which("pdfimages")
    if not tool:
        raise ValueError("pdfimages is missing; install Poppler")
    listing = subprocess.run([tool, "-list", str(pdf)], capture_output=True, text=True, check=True)
    prefix = cache / "native"
    subprocess.run([tool, "-png", "-j", "-jp2", "-jbig2", str(pdf), str(prefix)],
                   capture_output=True, check=True)
    records = []
    for line in listing.stdout.splitlines()[2:]:
        cells = line.split()
        if not cells:
            continue
        number = int(cells[1])
        files = sorted(path.name for path in cache.glob(f"native-{number:03d}.*"))
        if not files:
            raise ValueError(f"No native file for image {number}")
        records.append({"pdf_page": int(cells[0]), "number": number, "kind": cells[2],
                        "width": int(cells[3]), "height": int(cells[4]),
                        "object_id": int(cells[10]), "generation": int(cells[11]),
                        "x_ppi": float(cells[12]), "y_ppi": float(cells[13]), "files": files})
    write_json(index_path, records)
    return records


def placed_assets(page: Any, record: Record, native: list[Record], cache: Path,
                  output: Path, force: bool, exceptions: list[Record]) -> None:
    if not record["images"]:
        return
    by_object = {item["object_id"]: item for item in native
                 if item["pdf_page"] == page.page_number and item["kind"] == "image"}
    masks = {item["number"]: item for item in native if item["kind"] in ("smask", "mask")}
    rendered = None
    for image in record["images"]:
        original = by_object.get(image["object_id"])
        image["native_assets"] = []
        if original:
            assets = [original]
            mask = masks.get(original["number"] + 1)
            if mask and mask["pdf_page"] == page.page_number:
                assets.append(mask)
            for asset in assets:
                for filename in asset["files"]:
                    target = output / "assets" / filename
                    if force or not target.exists() or checksum(target) != checksum(cache / filename):
                        shutil.copyfile(cache / filename, target)
                    image["native_assets"].append({"path": f"assets/{filename}", "kind": asset["kind"],
                                                    "sha256": checksum(target)})
        else:
            exceptions.append({"kind": "native_image_not_found", "source_id": image["id"],
                               "pdf_page": page.page_number, "object_id": image["object_id"]})
        a = image["bbox"]
        clipped = [max(0, a[0]), max(0, a[1]), min(page.width, a[2]), min(page.height, a[3])]
        image["placed_bbox"] = clipped
        if clipped[2] <= clipped[0] or clipped[3] <= clipped[1]:
            exceptions.append({"kind": "image_outside_page", "source_id": image["id"],
                               "pdf_page": page.page_number})
            image["placed_asset"] = None
            continue
        filename = image["id"] + ".png"
        target = output / "assets" / filename
        if force or not target.exists():
            if rendered is None:
                rendered = page.to_image(resolution=300, antialias=True).original
            scale_x, scale_y = rendered.width / page.width, rendered.height / page.height
            pixels = (math.floor(clipped[0] * scale_x), math.floor(clipped[1] * scale_y),
                      math.ceil(clipped[2] * scale_x), math.ceil(clipped[3] * scale_y))
            crop = rendered.crop(pixels)
            crop.save(target)
            crop.close()
        image["placed_asset"] = {"path": f"assets/{filename}", "sha256": checksum(target),
                                  "method": "page_render_crop", "dpi": 300}
    if rendered is not None:
        rendered.close()


def validate_inventory(pages: list[Record], native: list[Record], exceptions: list[Record]) -> bool:
    """Compare independent Poppler and pdfminer image inventories."""
    expected = Counter((item["pdf_page"], item["object_id"]) for item in native if item["kind"] == "image")
    found = Counter((page["pdf_page"], item["object_id"]) for page in pages for item in page["images"])
    for key in sorted(expected.keys() | found.keys()):
        if expected[key] != found[key]:
            exceptions.append({"kind": "image_inventory_mismatch", "pdf_page": key[0],
                               "object_id": key[1], "poppler_count": expected[key], "placement_count": found[key]})
    return expected == found


def page_selection(spec: str | None, total: int) -> set[int]:
    if spec is None:
        return set(range(1, total + 1))
    selected = set()
    for part in spec.split(","):
        match = re.fullmatch(r"(\d+)(?:-(\d+))?", part.strip())
        if not match:
            raise ValueError("Use page numbers or ranges, such as 53-57,315")
        start, end = int(match[1]), int(match[2] or match[1])
        if not 1 <= start <= end <= total:
            raise ValueError(f"Page range must be between 1 and {total}")
        selected.update(range(start, end + 1))
    return selected


def extract(pdf_path: Path, output: Path, cache_root: Path, selected_spec: str | None,
            force: bool) -> Record:
    source_hash = checksum(pdf_path)
    prefix = "fphc-" + source_hash[:12]
    cache = cache_root / f"{prefix}-v{VERSION}-pdfplumber-{pdfplumber.__version__}"
    if output.resolve() == cache.resolve() or output.resolve() in pdf_path.resolve().parents:
        raise ValueError("Output must be separate from the source PDF and cache")
    with pdfplumber.open(pdf_path) as pdf:
        if len(pdf.pages) != 457:
            raise ValueError("This extractor expects the 457-page 2021 FPHC second edition")
        title_text = " ".join((pdf.pages[0].extract_text() or "").split())
        publication_text = " ".join((pdf.pages[1].extract_text() or "").split())
        if ("Second Edition" not in title_text or "2021" not in publication_text
                or "Florida Postal History Society" not in publication_text):
            raise ValueError("The source does not identify the expected FPHC edition")
        pdf.pages[0].close()
        pdf.pages[1].close()
        selected = page_selection(selected_spec, len(pdf.pages))
        previous_manifest = output / "manifest.json"
        if previous_manifest.exists():
            previous = json.loads(previous_manifest.read_text(encoding="ascii"))
            if previous["source"]["sha256"] != source_hash:
                raise ValueError("Output contains another source; choose a separate output directory")
            if previous["settings"]["selected_pages"] != sorted(selected):
                raise ValueError("Output contains a different page selection; choose a separate output directory")
        cache.mkdir(parents=True, exist_ok=True)
        (output / "assets").mkdir(parents=True, exist_ok=True)
        native = native_assets(pdf_path, cache, force)
        pages, exceptions = [], []
        for page in pdf.pages:
            path = cache / f"page-{page.page_number:04d}.json"
            if path.exists() and not force:
                cached = json.loads(path.read_text(encoding="ascii"))
                record = cached["page"]
                exceptions.extend(cached["exceptions"])
            else:
                page_exceptions: list[Record] = []
                record = native_page(page, prefix, page_exceptions)
                write_json(path, {"page": record, "exceptions": page_exceptions})
                exceptions.extend(page_exceptions)
            pages.append(record)
            if page.page_number % 50 == 0:
                print(f"Read PDF page {page.page_number}/{len(pdf.pages)}", flush=True)
            page.close()
        inventory_matches = validate_inventory(pages, native, exceptions)
        offices = attach_context(pages, exceptions)
        kept_pages = [page for page in pages if page["pdf_page"] in selected]
        for record in kept_pages:
            page = pdf.pages[record["pdf_page"] - 1]
            placed_assets(page, record, native, cache, output, force, exceptions)
            page.close()
            if record["pdf_page"] % 50 == 0:
                print(f"Saved assets through PDF page {record['pdf_page']}", flush=True)
        offices = [office for office in offices
                   if any(span["pdf_page"] in selected for span in office["spans"])]
        exceptions = [item for item in exceptions if item.get("pdf_page") in selected
                      or item["kind"] == "index_entry_without_heading"]
        counts = {"pages": len(kept_pages), "offices": len(offices),
                  "characters": sum(len(page["chars"]) for page in kept_pages),
                  "tables": sum(len(page["tables"]) for page in kept_pages),
                  "table_rows": sum(len(table["rows"]) for page in kept_pages for table in page["tables"]),
                  "image_placements": sum(len(page["images"]) for page in kept_pages),
                  "captions": sum(len(page["captions"]) for page in kept_pages),
                  "exceptions": len(exceptions)}
        manifest = {
            "schema_version": VERSION, "extraction_version": VERSION,
            "source": {"filename": pdf_path.name, "sha256": source_hash, "page_count": len(pdf.pages)},
            "publication": {"title": "Florida Postal History 1763-1861", "edition": "Second Edition",
                            "year": 2021, "editors": ["Deane R. Briggs, M.D.", "Francis Ferguson", "Thomas M. Lera"],
                            "publisher": "Florida Postal History Society", "source_pages": [1, 2, 4],
                            "credits_text": pages[3]["layout_text"], "publication_text": pages[1]["layout_text"]},
            "settings": {"pdfplumber_version": pdfplumber.__version__, "table_settings": TABLE_SETTINGS,
                         "coordinates": "PDF points from top left", "placed_asset_dpi": 300,
                         "ocr": "not_run", "selected_pages": sorted(selected)},
            "counts": counts, "exception_counts": dict(sorted(Counter(item["kind"] for item in exceptions).items())),
            "reference_pages": [{"pdf_page": number, "text": pages[number - 1]["layout_text"]} for number in (6, 53)],
            "native_image_objects": native, "office_index": read_index(pages),
            "validation": {"sample_pages": SAMPLE_PAGES, "all_pages_read": True,
                           "image_inventory_matches": inventory_matches,
                           "image_transforms_checked": True, "database_records_created": 0},
        }
        write_jsonl(output / "pages.jsonl", kept_pages)
        write_jsonl(output / "offices.jsonl", offices)
        write_jsonl(output / "exceptions.jsonl", exceptions)
        write_json(output / "manifest.json", manifest)
        return manifest


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--pdf", type=Path, default=WIP / "in" / "Florida Postal History Catalog.pdf")
    parser.add_argument("--out-dir", type=Path, default=WIP / "out" / "fphc")
    parser.add_argument("--cache-dir", type=Path, default=WIP / "cache" / "fphc")
    parser.add_argument("--pages", help="PDF pages to save; all pages are read for office context")
    parser.add_argument("--force", action="store_true", help="Rebuild cached extraction and placed images")
    args = parser.parse_args(argv)
    try:
        manifest = extract(args.pdf, args.out_dir, args.cache_dir, args.pages, args.force)
    except (OSError, ValueError, subprocess.CalledProcessError) as error:
        print(f"FPHC extraction failed: {error}".encode("ascii", "backslashreplace").decode("ascii"), file=sys.stderr)
        return 1
    print(json.dumps(manifest["counts"], ensure_ascii=True, sort_keys=True))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
