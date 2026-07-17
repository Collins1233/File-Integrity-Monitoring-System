import difflib


def read_text_file(file_path):
    """
    Reads a text file and returns its contents as a list of lines.

    Tries UTF-8 first, then Latin-1 if necessary.
    """

    try:
        with open(file_path, "r", encoding="utf-8") as file:
            return file.readlines()

    except UnicodeDecodeError:

        try:
            with open(file_path, "r", encoding="latin-1") as file:
                return file.readlines()

        except Exception:
            return []

    except Exception:
        return []


def _normalize_lines(lines):
    return [line.rstrip("\n\r") for line in lines]


def compare_text(old_lines, new_lines):
    """
    Compares two lists of text lines and returns the unified diff.
    Accepts pre-read lists of strings (not file paths).
    """

    differences = list(

        difflib.unified_diff(

            old_lines,

            new_lines,

            fromfile="Baseline Version",

            tofile="Current Version",

            lineterm=""

        )

    )

    return differences


def format_text_change(old_lines, new_lines):
    """
    Build a user-friendly before/after comparison for the UI.
    """
    before = _normalize_lines(old_lines)
    after = _normalize_lines(new_lines)

    matcher = difflib.SequenceMatcher(None, before, after)
    changed_before = set()
    changed_after = set()

    for tag, i1, i2, j1, j2 in matcher.get_opcodes():
        if tag == "equal":
            continue
        if tag in ("replace", "delete"):
            changed_before.update(range(i1, i2))
        if tag in ("replace", "insert"):
            changed_after.update(range(j1, j2))

    lines_removed = len(changed_before)
    lines_added = len(changed_after)

    return {
        "before": before,
        "after": after,
        "changed_before_lines": sorted(changed_before),
        "changed_after_lines": sorted(changed_after),
        "summary": {
            "lines_removed": lines_removed,
            "lines_added": lines_added,
            "total_changes": lines_removed + lines_added,
        },
        "unified_diff": compare_text(old_lines, new_lines),
    }