"""Source fidelity and layout checks for the FPHC dump."""

import json
import sys
from pathlib import Path

import pdfplumber
import pytest
from PIL import Image

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from fphc_extract import native_page, page_selection, placed_assets, validate_inventory, write_jsonl
from fphc_layout import attach_context, link_captions, text_lines


def line(text, top, font="Book-Bold", size=12, left=200, right=400):
    return {"id": f"line-{top}-{left}", "text": text, "bbox": [left, top, right, top + size],
            "fonts": [font], "sizes": [float(size)]}


def page(number, lines=(), images=(), tables=(), words=()):
    return {"pdf_page": number, "printed_page": number, "width": 612, "height": 792,
            "lines": list(lines), "images": list(images), "tables": list(tables), "words": list(words)}


def test_office_changes_within_page_and_continues_after_image_pages():
    heading = line("ABRAHAMTOWN", 55)
    second = line("ADAMSVILLE", 300)
    image = {"id": "figure-1", "bbox": [100, 340, 300, 450]}
    table = {"id": "table-1", "bbox": [80, 70, 560, 150],
             "rows": [{"cells": ["I", "ADAMSVILLE", "1852", "black", "29mm", "ms. rates", "5 - 10"]}]}
    pages = [page(54, [heading, second], [image]), page(55, tables=[table])]
    offices = attach_context(pages, [])
    assert [office["heading"] for office in offices] == ["ABRAHAMTOWN", "ADAMSVILLE"]
    assert offices[0]["spans"][0]["bbox"][3] == 300
    assert image["office_id"] == offices[1]["id"]
    assert table["office_id"] == offices[1]["id"]


def test_caption_keeps_literal_type_and_ambiguous_side_by_side_images():
    caption = {"id": "caption", "text": "Type VI a (blue ink)", "bbox": [100, 210, 300, 221]}
    images = [{"id": "left", "bbox": [100, 100, 195, 200], "office_id": "office", "office_candidates": ["office"]},
              {"id": "right", "bbox": [205, 100, 300, 200], "office_id": "office", "office_candidates": ["office"]}]
    record = page(308, images=images)
    record["office_spans"] = [{"office_id": "office", "bbox": [0, 45, 612, 792]}]
    record["captions"] = [caption]
    exceptions = []
    link_captions(record, exceptions)
    assert caption["text"] == "Type VI a (blue ink)"
    assert caption["image_id"] is None
    assert caption["image_candidates"] == ["left", "right"]
    assert exceptions[0]["kind"] == "unresolved_caption_placement"


def test_crossing_office_boundary_does_not_choose_an_office():
    image = {"id": "crossing", "bbox": [100, 250, 300, 350]}
    pages = [page(54, [line("ABRAHAMTOWN", 55), line("ADAMSVILLE", 300)], [image])]
    exceptions = []
    attach_context(pages, exceptions)
    assert image["office_id"] is None
    assert len(image["office_candidates"]) == 2
    assert any(item["kind"] == "element_crosses_office_boundary" for item in exceptions)


def test_heading_font_roundoff_does_not_extend_previous_office():
    heading = line("CAMPBELLTON", 277)
    heading["sizes"] = [11.999999999999943]
    image = {"id": "figure", "bbox": [100, 320, 300, 440]}
    pages = [page(98, [line("CALLAHAN (C.H.)", 55), heading], [image])]
    offices = attach_context(pages, [])
    assert [office["heading"] for office in offices] == ["CALLAHAN (C.H.)", "CAMPBELLTON"]
    assert image["office_id"] == offices[1]["id"]


def test_image_inventory_detects_missing_repeated_placement():
    native = [{"pdf_page": 53, "object_id": 7, "kind": "image"}] * 2
    pages = [page(53, images=[{"id": "figure", "object_id": 7}])]
    exceptions = []
    assert not validate_inventory(pages, native, exceptions)
    assert exceptions == [{"kind": "image_inventory_mismatch", "pdf_page": 53,
                           "object_id": 7, "poppler_count": 2, "placement_count": 1}]


def test_continuation_preserves_blank_cells_and_repeated_types():
    first = {"id": "first", "bbox": [80, 200, 560, 300],
             "rows": [{"cells": ["Postmaster", "Appointment", "Reporting Data", "Compensation", "Receipts"]},
                      {"cells": ["Alice", "1850", "", "", ""]}]}
    second = {"id": "second", "bbox": [80, 60, 560, 100],
              "rows": [{"cells": ["", "", "yr. end 1851", "$1.00", ""]}]}
    pages = [page(314, [line("PENSACOLA", 55)], tables=[first]), page(315, tables=[second])]
    attach_context(pages, [])
    assert second["continuation_candidate_id"] == "first"
    assert second["rows"][0]["cells"] == ["", "", "yr. end 1851", "$1.00", ""]


def test_json_is_ascii_and_source_punctuation_round_trips(tmp_path):
    records = [{"heading": "Abe\u2019s Spring", "date": "1850\u20131894", "blank": ""}]
    path = tmp_path / "pages.jsonl"
    write_jsonl(path, records)
    assert path.read_bytes().isascii()
    assert json.loads(path.read_text()) == records[0]


@pytest.mark.parametrize("spec", ["0", "458", "5-3", "53;57", "", "1,"])
def test_invalid_page_selection(spec):
    with pytest.raises(ValueError):
        page_selection(spec, 457)


def test_page_selection():
    assert page_selection("53-55,57", 457) == {53, 54, 55, 57}


def test_separate_columns_are_not_joined_as_one_caption():
    words = [{"id": "a", "text": "Type I", "bbox": [50, 100, 100, 111], "font": "Book-Italic", "size": 11},
             {"id": "b", "text": "History", "bbox": [350, 100, 400, 110], "font": "Book", "size": 10}]
    assert [item["text"] for item in text_lines(words, "p0057")] == ["Type I", "History"]


def make_pdf(path):
    """A small real PDF with a ruled table, blank cells, and a rotated image."""
    content = "BT /F1 12 Tf 36 762 Td (1) Tj ET\n"
    content += "BT /F1 7.5 Tf 36 750 Td (Fort No 6) Tj ET\n"
    content += "BT /F2 12 Tf 220 720 Td (EXAMPLE OFFICE) Tj ET\n"
    for x in (50, 150, 250, 350, 450, 550):
        content += f"{x} 500 m {x} 560 l S\n"
    for y in (500, 520, 540, 560):
        content += f"50 {y} m 550 {y} l S\n"
    for x, text in zip((55, 155, 255, 355, 455),
                       ("Postmaster", "Appointment", "Reporting Data", "Compensation", "Receipts")):
        content += f"BT /F1 9 Tf {x} 547 Td ({text}) Tj ET\n"
    content += "BT /F1 9 Tf 55 527 Td (Alice Example) Tj 100 0 Td (01.01.1850) Tj ET\n"
    content += "BT /F1 9 Tf 255 507 Td (yr. end 1851) Tj 100 0 Td ($1.00) Tj ET\n"
    content += "q 0 80 -40 0 300 300 cm /Im0 Do Q\n"
    objects = [b"<< /Type /Catalog /Pages 2 0 R >>",
               b"<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
               b"<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R /F2 5 0 R >> /XObject << /Im0 7 0 R >> >> /Contents 6 0 R >>",
               b"<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
               b"<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>",
               f"<< /Length {len(content)} >>\nstream\n{content}endstream".encode("ascii"),
               b"<< /Type /XObject /Subtype /Image /Width 2 /Height 1 /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /ASCIIHexDecode /Length 14 >>\nstream\nFF00000000FF>\nendstream"]
    data = b"%PDF-1.4\n"
    offsets = []
    for index, obj in enumerate(objects, 1):
        offsets.append(len(data))
        data += f"{index} 0 obj\n".encode("ascii") + obj + b"\nendobj\n"
    xref = len(data)
    data += f"xref\n0 {len(objects) + 1}\n0000000000 65535 f \n".encode("ascii")
    data += b"".join(f"{offset:010d} 00000 n \n".encode("ascii") for offset in offsets)
    data += f"trailer\n<< /Root 1 0 R /Size {len(objects) + 1} >>\nstartxref\n{xref}\n%%EOF\n".encode("ascii")
    path.write_bytes(data)


def test_native_table_blanks_image_transform_and_stable_ids(tmp_path):
    path = tmp_path / "sample.pdf"
    make_pdf(path)
    with pdfplumber.open(path) as pdf:
        record = native_page(pdf.pages[0], "source", [])
    with pdfplumber.open(path) as pdf:
        repeated = native_page(pdf.pages[0], "source", [])
    assert record == repeated
    assert record["printed_page"] == 1
    assert len(record["tables"]) == 1
    assert record["tables"][0]["rows"][2]["cells"] == ["", "", "yr. end 1851", "$1.00", ""]
    assert record["tables"][0]["rows"][2]["cell_raw_text"] == ["", "", "yr. end 1851", "$1.00", ""]
    assert record["images"][0]["native_width"] == 2
    assert record["images"][0]["matrix"] == [0, 80, -40, 0, 300, 300]
    assert len(record["chars"]) == sum(len(char["text"]) for char in record["chars"])


def test_placed_image_preserves_rotation_and_native_file(tmp_path):
    path = tmp_path / "sample.pdf"
    make_pdf(path)
    cache, output = tmp_path / "cache", tmp_path / "out"
    cache.mkdir()
    (output / "assets").mkdir(parents=True)
    original = Image.new("RGB", (2, 1), "red")
    original.putpixel((1, 0), (0, 0, 255))
    original.save(cache / "native-000.png")
    with pdfplumber.open(path) as pdf:
        record = native_page(pdf.pages[0], "source", [])
        native = [{"pdf_page": 1, "kind": "image", "object_id": 7, "number": 0, "files": ["native-000.png"]}]
        placed_assets(pdf.pages[0], record, native, cache, output, False, [])
    image = record["images"][0]
    assert (output / "assets/native-000.png").read_bytes() == (cache / "native-000.png").read_bytes()
    with Image.open(output / image["placed_asset"]["path"]) as crop:
        assert crop.height > crop.width
        assert crop.getpixel((crop.width // 2, 10))[2] > 200
        assert crop.getpixel((crop.width // 2, crop.height - 10))[0] > 200
