"""Helpers for computing Image metadata from image bytes or files on disk."""
import hashlib
import io
import mimetypes
import struct
from pathlib import Path
from typing import Optional

from PIL import Image as PILImage, ImageCms, ImageOps, PngImagePlugin

ALLOWED_MIME_TYPES = {"image/png", "image/jpeg", "image/jpg"}

# Image.image_description is a TextField, whose max_length Django does not
# enforce, so every API path that writes a caption caps it here (T43, T87).
MAX_IMAGE_DESCRIPTION_LENGTH = 500


def extract_image_metadata(content: bytes, mime_type: str) -> Optional[dict]:
    """
    Compute Image metadata (checksum, dimensions, size) from raw bytes.
    Returns dict with file_checksum, mime_type, image_width, image_height,
    file_size_bytes, or None if the bytes aren't a valid/allowed image.
    """
    if not content:
        return None
    if mime_type not in ALLOWED_MIME_TYPES:
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
    """Read an image from disk and return its Image metadata, or None if missing/invalid."""
    if not path.is_file():
        return None
    mime_type, _ = mimetypes.guess_type(path.name)
    if not mime_type:
        return None
    return extract_image_metadata(path.read_bytes(), mime_type)


class CropError(ValueError):
    """A crop rectangle that cannot be applied to the given image."""


class RotateError(ValueError):
    """A rotation that cannot be applied to the given image."""


# Clockwise quarter turns. Pillow's ROTATE_* constants turn counter-clockwise.
_CLOCKWISE_TRANSPOSE = {
    1: PILImage.Transpose.ROTATE_270,
    2: PILImage.Transpose.ROTATE_180,
    3: PILImage.Transpose.ROTATE_90,
}


def _swap_resolution_axes(image: PILImage.Image) -> None:
    """A quarter turn swaps the physical resolution axes as well."""
    if dpi := image.info.get("dpi"):
        image.info["dpi"] = dpi[::-1]
    exif = image.getexif()
    if 282 in exif and 283 in exif:
        exif[282], exif[283] = exif[283], exif[282]
        image.info["exif"] = exif.tobytes()


def _oriented_image(source: PILImage.Image) -> PILImage.Image:
    image = ImageOps.exif_transpose(source)
    if source.getexif().get(274) in (5, 6, 7, 8):
        _swap_resolution_axes(image)
    return image


def _png_bytes(image: PILImage.Image) -> bytes:
    """Save decoded pixels without compression loss and keep useful metadata."""
    info = image.info.copy()
    exif = image.getexif()
    # Pixels already have their displayed orientation. Do not apply it twice.
    exif.pop(274, None)
    for tag, value in ((256, image.width), (257, image.height)):
        if tag in exif:
            exif[tag] = value
    if 34665 in exif:
        details = exif.get_ifd(34665)
        for tag, value in ((40962, image.width), (40963, image.height)):
            if tag in details:
                details[tag] = value
    info["exif"] = exif.tobytes() if exif else b""

    # PNG has no CMYK mode. Convert using the source profile when available.
    if image.mode == "CMYK":
        if profile := info.get("icc_profile"):
            destination = ImageCms.ImageCmsProfile(ImageCms.createProfile("sRGB"))
            image = ImageCms.profileToProfile(
                image, ImageCms.ImageCmsProfile(io.BytesIO(profile)), destination,
                outputMode="RGB",
            )
            info["icc_profile"] = destination.tobytes()
        else:
            image = image.convert("RGB")

    text = PngImagePlugin.PngInfo()
    for key, value in info.items():
        if isinstance(value, str):
            text.add_itxt(key, value)
    if xmp := info.get("xmp"):
        text.add_itxt("XML:com.adobe.xmp", xmp.decode("utf-8"))
    if comment := info.get("comment"):
        if isinstance(comment, bytes):
            text.add_text("Comment", comment.decode("latin-1"))
    if "gamma" in info:
        text.add(b"gAMA", struct.pack(">I", round(info["gamma"] * 100000)))
    if "chromaticity" in info:
        text.add(b"cHRM", struct.pack(">8I", *(round(v * 100000) for v in info["chromaticity"])))
    if "srgb" in info:
        text.add(b"sRGB", bytes([info["srgb"]]))
    output = io.BytesIO()
    image.save(output, format="PNG", **{**info, "pnginfo": text})
    return output.getvalue()


def normalize_image_upload(content: bytes, mime_type: str) -> bytes:
    """Convert a PNG or JPEG upload to an upright PNG without JPEG recompression."""
    if mime_type not in ALLOWED_MIME_TYPES:
        raise ValueError("Unsupported image format.")
    try:
        with PILImage.open(io.BytesIO(content)) as source:
            if source.format not in ("PNG", "JPEG"):
                raise ValueError("Unsupported image format.")
            source.load()
            return _png_bytes(_oriented_image(source))
    except Exception as exc:
        raise ValueError("Could not process the source image.") from exc


def crop_image_bytes(
    content: bytes,
    mime_type: str,
    box: tuple[int, int, int, int],
) -> bytes:
    """Crop ``content`` to ``box`` = (x, y, width, height) and re-encode it.

    Used by the editor crop tool (issue #77) to cut the marking out of a scan
    of a whole cover. Raises CropError for anything the caller should turn into
    a 400: an undecodable source, or a rectangle that is empty or reaches
    outside the image.

    The box uses the displayed pixels, after EXIF rotation or reflection.
    The output is PNG so faint strikes have no additional compression loss.
    """
    if mime_type not in ALLOWED_MIME_TYPES:
        raise CropError("Unsupported image format.")
    x, y, width, height = (int(v) for v in box)
    if width <= 0 or height <= 0:
        raise CropError("Crop width and height must be greater than zero.")
    if x < 0 or y < 0:
        raise CropError("Crop origin must be inside the image.")

    try:
        img = PILImage.open(io.BytesIO(content))
        img.load()
        img = _oriented_image(img)
    except Exception as exc:
        raise CropError("Could not read the source image.") from exc

    if x + width > img.width or y + height > img.height:
        raise CropError(
            f"Crop reaches outside the {img.width}x{img.height} source image."
        )

    cropped = img.crop((x, y, x + width, y + height))
    return _png_bytes(cropped)


def rotate_image_bytes(content: bytes, mime_type: str, quarter_turns: int) -> bytes:
    """Turn ``content`` clockwise by ``quarter_turns`` (1, 2 or 3) and re-encode it.

    Used by the editor Rotate tool (Trello T66) for a Marking image stored on
    its side. Quarter turns are exact pixel moves, so nothing is resampled.
    The turn starts from the displayed orientation, after EXIF rotation or
    reflection. The output is PNG, like a crop. Raises RotateError for anything
    the caller should turn into a 400.
    """
    if mime_type not in ALLOWED_MIME_TYPES:
        raise RotateError("Unsupported image format.")
    method = _CLOCKWISE_TRANSPOSE.get(quarter_turns)
    if method is None:
        raise RotateError("quarter_turns must be 1, 2 or 3.")

    try:
        img = PILImage.open(io.BytesIO(content))
        img.load()
        img = _oriented_image(img)
    except Exception as exc:
        raise RotateError("Could not read the source image.") from exc

    rotated = img.transpose(method)
    rotated.info = img.info.copy()
    if quarter_turns % 2:
        _swap_resolution_axes(rotated)
    return _png_bytes(rotated)
