import mimetypes
import os

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
    if extension in OFFICE_FILE_TYPES:
        return "document"
    return "binary"


def is_backup_type(extension: str) -> bool:
    return get_preview_category(extension) in {"text", "image", "pdf", "document"}


def is_image_type(extension: str) -> bool:
    return (extension or "").lower() in IMAGE_EXTENSIONS


def extract_preview_text(file_path: str, extension: str) -> str | None:
    extension = (extension or "").lower()
    if extension in TEXT_EXTENSIONS:
        from textdiff import read_text_file
        return "".join(read_text_file(file_path))
    if extension in OFFICE_FILE_TYPES or extension in PDF_EXTENSIONS or extension == ".rtf":
        return extract_office_text(file_path, extension)
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
    return format_office_change(old_path, new_path, extension)


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
