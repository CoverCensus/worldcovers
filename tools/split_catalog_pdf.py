#!/usr/bin/env python3
"""Render a catalog PDF to per-page images and split each page down the middle.

The catalog pages are laid out as two side-by-side columns that OCR treats as
one smooshed page. This utility renders each page to a high-DPI image, then
emits separate left/right half-page images ready for OCR.

Usage:
    python split_catalog_pdf.py path/to/catalog.pdf [--dpi 300] [--out DIR]
"""

import argparse
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path

from PIL import Image


def render_pages(pdf_path: Path, workdir: Path, dpi: int) -> list[Path]:
    prefix = workdir / "page"
    subprocess.run(
        ["pdftoppm", "-r", str(dpi), "-png", str(pdf_path), str(prefix)],
        check=True,
    )
    return sorted(workdir.glob("page-*.png"))


def split_page(page_img: Path, out_dir: Path, page_num: int) -> None:
    with Image.open(page_img) as im:
        width, height = im.size
        mid = width // 2
        left = im.crop((0, 0, mid, height))
        right = im.crop((mid, 0, width, height))
        left.save(out_dir / f"page-{page_num:04d}-L.png")
        right.save(out_dir / f"page-{page_num:04d}-R.png")





def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("pdf", type=Path, help="Path to the catalog PDF")
    parser.add_argument("--dpi", type=int, default=300, help="Render DPI (default: 300)")
    parser.add_argument(
        "--out",
        type=Path,
        default=None,
        help="Output directory (default: sibling folder named after the PDF basename)",
    )
    parser.add_argument(
        "--start-page",
        type=int,
        default=1,
        help="Catalog page number of the first PDF page (default: 1). "
             "Output files are named page-<catalog#>-L/R.png.",
    )
    args = parser.parse_args()

    pdf_path: Path = args.pdf.resolve()
    if not pdf_path.is_file():
        print(f"error: {pdf_path} is not a file", file=sys.stderr)
        return 1

    if shutil.which("pdftoppm") is None:
        print("error: pdftoppm not found on PATH (install poppler)", file=sys.stderr)
        return 1

    out_dir = (args.out or pdf_path.with_suffix("")).resolve()
    out_dir.mkdir(parents=True, exist_ok=True)

    with tempfile.TemporaryDirectory() as tmp:
        workdir = Path(tmp)
        print(f"Rendering {pdf_path.name} at {args.dpi} DPI...")
        pages = render_pages(pdf_path, workdir, args.dpi)
        if not pages:
            print("error: no pages rendered", file=sys.stderr)
            return 1
        print(f"Splitting {len(pages)} page(s) into {out_dir}")
        for idx, page_img in enumerate(pages):
            split_page(page_img, out_dir, args.start_page + idx)

    print("Done.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
