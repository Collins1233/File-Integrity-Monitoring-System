import mimetypes
import os
import shutil
import tempfile
from contextlib import contextmanager

from config import (
    IMAGE_EXTENSIONS,
    OFFICE_FILE_TYPES,
    PDF_EXTENSIONS,
    TEXT_EXTENSIONS,
)
from comparators import extract_office_text, format_office_change


def get_preview_category(extension: str) -> str:
    extension = (extension or "").lower()
    if extension in TEXT_EXTENSIONS:
        return "text"
    if extension in IMAGE_EXTENSIONS:
        return "image"
    if extension in PDF_EXTENSIONS:
        return "pdf"
    if extension in OFFICE_FILE_TYPES or extension == ".rtf":
        return "document"
    return "binary"


def is_backup_type(extension: str) -> bool:
    return get_preview_category(extension) in {"text", "image", "pdf", "document"}


def is_image_type(extension: str) -> bool:
    return (extension or "").lower() in IMAGE_EXTENSIONS


@contextmanager
def readable_copy(file_path: str):
    """
    Yield a temp copy of the file for reading.
    Office apps on Windows often lock the live path; a copy still opens reliably.
    """
    temp_path = None
    try:
        suffix = os.path.splitext(file_path)[1] or ".bin"
        fd, temp_path = tempfile.mkstemp(prefix="fim_read_", suffix=suffix)
        os.close(fd)
        shutil.copy2(file_path, temp_path)
        yield temp_path
    finally:
        if temp_path and os.path.exists(temp_path):
            try:
                os.remove(temp_path)
            except OSError:
                pass


def extract_preview_text(file_path: str, extension: str) -> str | None:
    extension = (extension or "").lower()
    if extension in TEXT_EXTENSIONS:
        from textdiff import read_text_file
        return "".join(read_text_file(file_path))
    if extension in OFFICE_FILE_TYPES or extension in PDF_EXTENSIONS or extension == ".rtf":
        try:
            with readable_copy(file_path) as path:
                return extract_office_text(path, extension)
        except Exception:
            try:
                return extract_office_text(file_path, extension)
            except Exception:
                return None
    return None


def format_backup_diff(old_path: str, new_path: str, extension: str):
    extension = (extension or "").lower()
    if is_image_type(extension):
        return {
            "preview_type": "image",
            "document_type": "image",
            "summary": {
                "lines_removed": 0,
                "lines_added": 0,
                "total_changes": 1,
            },
        }
    if extension in TEXT_EXTENSIONS:
        from textdiff import read_text_file, format_text_change
        result = format_text_change(read_text_file(old_path), read_text_file(new_path))
        result["preview_type"] = "text"
        return result

    # Prefer temp copies so Word/Excel locks on Windows don't break comparison.
    try:
        with readable_copy(old_path) as safe_old, readable_copy(new_path) as safe_new:
            result = format_office_change(safe_old, safe_new, extension)
    except Exception:
        result = format_office_change(old_path, new_path, extension)

    if result is None:
        return None

    # Even when extracted text matches (formatting-only change), still return
    # both full documents so the UI can show original vs current side by side.
    if result.get("summary", {}).get("total_changes", 0) == 0:
        result["message"] = (
            "The file hash changed, but the readable text looks the same. "
            "This often means formatting, metadata, or an embedded object changed."
        )
    return result


def resolve_content_path(path: str, version: str, baseline_copy: str | None) -> str | None:
    if version == "baseline":
        if baseline_copy and os.path.exists(baseline_copy):
            return baseline_copy
        return None
    if os.path.isfile(path):
        return path
    return None


def guess_media_type(file_path: str) -> str:
    media_type, _ = mimetypes.guess_type(file_path)
    return media_type or "application/octet-stream"
