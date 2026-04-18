"""Helpers for computing PostmarkImage metadata from image bytes or files on disk."""
import hashlib
import io
import mimetypes
from pathlib import Path
from typing import Optional

ALLOWED_MIME_TYPES = {"image/png", "image/jpeg", "image/jpg", "image/tiff"}


def extract_image_metadata(content: bytes, mime_type: str) -> Optional[dict]:
    """
    Compute PostmarkImage metadata (checksum, dimensions, size) from raw bytes.
    Returns dict with file_checksum, mime_type, image_width, image_height,
    file_size_bytes, or None if the bytes aren't a valid/allowed image.
    """
    if not content:
        return None
    if mime_type not in ALLOWED_MIME_TYPES:
        return None
    try:
        from PIL import Image as PILImage
    except ImportError:
        return None
    try:
        img = PILImage.open(io.BytesIO(content))
        width, height = img.size
    except Exception:
        width, height = 0, 0
    return {
        "file_checksum": hashlib.sha256(content).hexdigest(),
        "mime_type": mime_type[:50],
        "image_width": width,
        "image_height": height,
        "file_size_bytes": len(content),
    }


def read_image_metadata_from_path(path: Path) -> Optional[dict]:
    """Read an image from disk and return its PostmarkImage metadata, or None if missing/invalid."""
    if not path.is_file():
        return None
    mime_type, _ = mimetypes.guess_type(path.name)
    if not mime_type:
        return None
    return extract_image_metadata(path.read_bytes(), mime_type)
