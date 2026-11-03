"""Normalize profile photos before storing them in the local database."""
import base64
import binascii
from io import BytesIO
import warnings

from fastapi import HTTPException
from PIL import Image, ImageOps, UnidentifiedImageError

MAX_PHOTO_BYTES = 2 * 1024 * 1024


def normalize_photo(value: str) -> str:
    try:
        header, encoded = value.split(",", 1)
        if header not in {"data:image/jpeg;base64", "data:image/png;base64", "data:image/webp;base64"}:
            raise ValueError
        raw = base64.b64decode(encoded, validate=True)
        if len(raw) > MAX_PHOTO_BYTES:
            raise HTTPException(413, "Choose a photo smaller than 2 MB.")
        with warnings.catch_warnings():
            warnings.simplefilter("error", Image.DecompressionBombWarning)
            with Image.open(BytesIO(raw), formats=["JPEG", "PNG", "WEBP"]) as image:
                if image.width * image.height > 25_000_000:
                    raise ValueError
                # Apply camera orientation, crop to a square, and discard metadata.
                photo = ImageOps.fit(ImageOps.exif_transpose(image).convert("RGB"), (256, 256), method=Image.Resampling.LANCZOS)
                output = BytesIO()
                photo.save(output, format="WEBP", quality=85)
        return "data:image/webp;base64," + base64.b64encode(output.getvalue()).decode("ascii")
    except (ValueError, binascii.Error, UnidentifiedImageError, OSError, Image.DecompressionBombError, Image.DecompressionBombWarning):
        raise HTTPException(422, "Choose a valid JPG, PNG, or WebP photo (up to 25 megapixels).") from None
