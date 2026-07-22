"""Windows file picker using tkinter (fallback when PowerShell dialog fails)."""

import sys
import tkinter as tk
from tkinter import filedialog


def main() -> None:
    root = tk.Tk()
    root.withdraw()
    try:
        root.attributes("-topmost", True)
    except tk.TclError:
        pass
    root.update_idletasks()
    files = filedialog.askopenfilenames(title="Select Files to Monitor")
    root.destroy()
    if files:
        sys.stdout.write("\n".join(files))
        sys.stdout.flush()


if __name__ == "__main__":
    main()
