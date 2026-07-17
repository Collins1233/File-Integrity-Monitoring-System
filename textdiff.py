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


def compare_text(old_file, new_file):
    """
    Compares two text files and returns the differences.
    """

    old_lines = read_text_file(old_file)

    new_lines = read_text_file(new_file)

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