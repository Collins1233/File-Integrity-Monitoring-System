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