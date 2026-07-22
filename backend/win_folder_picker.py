"""Windows folder picker using tkinter (fallback when PowerShell dialog fails)."""

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
    folder = filedialog.askdirectory(title="Select Directory to Monitor", mustexist=True)
    root.destroy()
    if folder:
        sys.stdout.write(folder)
        sys.stdout.flush()


if __name__ == "__main__":
    main()
