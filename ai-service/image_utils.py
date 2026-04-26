# utils/image_utils.py — Image processing helpers

import base64
import io
import os
from pathlib import Path
from PIL import Image


# Supported image types
SUPPORTED_IMAGE_TYPES = {"image/jpeg", "image/jpg", "image/png"}
SUPPORTED_PDF_TYPE = "application/pdf"

MAX_IMAGE_SIZE = (2048, 2048)  # Claude vision works best at reasonable resolution


def get_media_type(filename: str, content_type: str = None) -> str:
    """Determine media type from filename extension or content_type."""
    ext = Path(filename).suffix.lower()
    ext_map = {
        ".jpg": "image/jpeg",
        ".jpeg": "image/jpeg",
        ".png": "image/png",
        ".pdf": "application/pdf",
    }
    return ext_map.get(ext, content_type or "image/jpeg")


def image_to_base64(file_bytes: bytes, media_type: str) -> str:
    """
    Convert raw file bytes to base64 string.
    For images, resizes if too large to keep within Claude API limits.
    """
    if media_type == "application/pdf":
        # For PDFs, encode directly — Claude can read PDFs
        return base64.standard_b64encode(file_bytes).decode("utf-8")

    # For images: open, optionally resize, re-encode to JPEG
    try:
        img = Image.open(io.BytesIO(file_bytes))

        # Convert to RGB if needed (handles RGBA PNGs etc)
        if img.mode in ("RGBA", "P", "LA"):
            img = img.convert("RGB")

        # Resize if too large
        if img.width > MAX_IMAGE_SIZE[0] or img.height > MAX_IMAGE_SIZE[1]:
            img.thumbnail(MAX_IMAGE_SIZE, Image.LANCZOS)

        # Re-encode to bytes
        buffer = io.BytesIO()
        img.save(buffer, format="JPEG", quality=90)
        buffer.seek(0)

        return base64.standard_b64encode(buffer.read()).decode("utf-8")

    except Exception as e:
        # Fallback: encode as-is
        return base64.standard_b64encode(file_bytes).decode("utf-8")


def prepare_image_for_claude(file_bytes: bytes, filename: str, content_type: str = None):
    """
    Prepare an uploaded file for Claude's vision API.
    Returns (base64_data, media_type) tuple.
    """
    media_type = get_media_type(filename, content_type)

    # Normalize media type for Claude
    if media_type in ("image/jpg",):
        media_type = "image/jpeg"

    base64_data = image_to_base64(file_bytes, media_type)
    return base64_data, media_type
