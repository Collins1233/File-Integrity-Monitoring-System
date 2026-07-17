import os
import json
import tkinter as tk
from tkinter import filedialog, messagebox, scrolledtext
from datetime import datetime

from scanner import scan_folder
from baseline import BASELINE_FILE
from integrity import run_integrity_check


selected_folder = ""


def select_folder():
    global selected_folder

    selected_folder = filedialog.askdirectory()

    if selected_folder:
        folder_value.config(text=selected_folder)
        status_value.config(text="Folder selected")


def create_baseline_gui():
    if not selected_folder:
        messagebox.showwarning("No Folder Selected", "Please select a folder first.")
        return

    created_at = datetime.now().strftime("%Y-%m-%d %H:%M:%S")

    output_box.delete("1.0", tk.END)
    output_box.insert(tk.END, "Creating baseline...\n\n")
    app.update()

    files = scan_folder(selected_folder)

    baseline = {
        "folder_path": selected_folder,
        "created_at": created_at,
        "files": files
    }

    with open(BASELINE_FILE, "w", encoding="utf-8") as file:
        json.dump(baseline, file, indent=4)

    output_box.insert(tk.END, "========================================\n")
    output_box.insert(tk.END, "Baseline Created Successfully\n")
    output_box.insert(tk.END, "========================================\n")
    output_box.insert(tk.END, f"Folder Monitored : {selected_folder}\n")
    output_box.insert(tk.END, f"Files Scanned    : {len(files)}\n")
    output_box.insert(tk.END, f"Baseline File    : {BASELINE_FILE}\n")
    output_box.insert(tk.END, f"Created On       : {created_at}\n")
    output_box.insert(tk.END, "========================================\n")

    files_card_value.config(text=str(len(files)))
    modified_card_value.config(text="0")
    deleted_card_value.config(text="0")
    new_card_value.config(text="0")
    status_value.config(text="Baseline created")

    messagebox.showinfo("Success", "Baseline created successfully.")


def check_integrity_gui():
    output_box.delete("1.0", tk.END)
    output_box.insert(tk.END, "Checking file integrity...\n\n")
    status_value.config(text="Scanning...")
    app.update()

    result = run_integrity_check()

    if not result["success"]:
        output_box.insert(tk.END, result["message"])
        status_value.config(text="Check failed")
        messagebox.showwarning("Error", result["message"])
        return

    modified_files = result["modified_files"]
    deleted_files = result["deleted_files"]
    new_files = result["new_files"]
    text_differences = result["text_differences"]

    output_box.insert(tk.END, "========================================\n")
    output_box.insert(tk.END, "Integrity Check Results\n")
    output_box.insert(tk.END, "========================================\n\n")

    if not modified_files and not deleted_files and not new_files:
        output_box.insert(tk.END, "[NO CHANGE] All files are intact.\n")
        status_value.config(text="Healthy")
    else:
        status_value.config(text="Integrity violations detected")

        if modified_files:
            output_box.insert(tk.END, "Modified Files\n")
            output_box.insert(tk.END, "----------------------------------------\n")

            for file_path in modified_files:
                output_box.insert(tk.END, f"[MODIFIED] {file_path}\n")

                if file_path in text_differences:
                    output_box.insert(tk.END, "\nExact Text Changes\n")
                    output_box.insert(tk.END, "----------------------------------------\n")

                    for line in text_differences[file_path]:
                        output_box.insert(tk.END, f"{line}\n")

                    output_box.insert(tk.END, "\n")
                else:
                    output_box.insert(
                        tk.END,
                        "Exact content comparison not supported for this file type.\n\n"
                    )

        if deleted_files:
            output_box.insert(tk.END, "\nDeleted Files\n")
            output_box.insert(tk.END, "----------------------------------------\n")

            for file_path in deleted_files:
                output_box.insert(tk.END, f"[DELETED] {file_path}\n")

        if new_files:
            output_box.insert(tk.END, "\nNew Files\n")
            output_box.insert(tk.END, "----------------------------------------\n")

            for file_path in new_files:
                output_box.insert(tk.END, f"[NEW FILE] {file_path}\n")

    total_changes = len(modified_files) + len(deleted_files) + len(new_files)

    output_box.insert(tk.END, "\nSummary\n")
    output_box.insert(tk.END, "----------------------------------------\n")
    output_box.insert(tk.END, f"Modified Files : {len(modified_files)}\n")
    output_box.insert(tk.END, f"Deleted Files  : {len(deleted_files)}\n")
    output_box.insert(tk.END, f"New Files      : {len(new_files)}\n")
    output_box.insert(tk.END, f"Total Changes  : {total_changes}\n")
    output_box.insert(tk.END, f"PDF Report     : {result['report_path']}\n")
    output_box.insert(tk.END, "========================================\n")

    modified_card_value.config(text=str(len(modified_files)))
    deleted_card_value.config(text=str(len(deleted_files)))
    new_card_value.config(text=str(len(new_files)))

    messagebox.showinfo("Completed", "Integrity check completed.")


def open_reports_folder():
    reports_path = os.path.abspath("reports")

    if not os.path.exists(reports_path):
        messagebox.showwarning("No Reports", "No reports folder found yet.")
        return

    os.startfile(reports_path)


def open_log_file():
    log_path = os.path.abspath("fim_log.txt")

    if not os.path.exists(log_path):
        messagebox.showwarning("No Log File", "No log file found yet.")
        return

    os.startfile(log_path)


def clear_output():
    output_box.delete("1.0", tk.END)


def make_sidebar_button(parent, text, command):
    return tk.Button(
        parent,
        text=text,
        command=command,
        bg="#374151",
        fg="white",
        activebackground="#4b5563",
        activeforeground="white",
        relief="flat",
        font=("Arial", 10, "bold"),
        cursor="hand2",
        width=22,
        height=2
    )


def create_card(parent, title, value):
    card = tk.Frame(parent, bg="white", relief="ridge", bd=1)
    card.pack(side="left", expand=True, fill="both", padx=8, pady=8)

    title_label = tk.Label(
        card,
        text=title,
        bg="white",
        fg="#6b7280",
        font=("Arial", 10)
    )
    title_label.pack(pady=(12, 3))

    value_label = tk.Label(
        card,
        text=value,
        bg="white",
        fg="#111827",
        font=("Arial", 20, "bold")
    )
    value_label.pack(pady=(3, 12))

    return value_label


app = tk.Tk()
app.title("File Integrity Monitoring System")
app.geometry("1100x700")
app.configure(bg="#f3f4f6")

# Sidebar
sidebar = tk.Frame(app, bg="#111827", width=230)
sidebar.pack(side="left", fill="y")
sidebar.pack_propagate(False)

sidebar_title = tk.Label(
    sidebar,
    text="FIM SYSTEM",
    bg="#111827",
    fg="white",
    font=("Arial", 16, "bold")
)
sidebar_title.pack(pady=(25, 5))

sidebar_subtitle = tk.Label(
    sidebar,
    text="Security Monitor",
    bg="#111827",
    fg="#9ca3af",
    font=("Arial", 9)
)
sidebar_subtitle.pack(pady=(0, 30))

select_btn = make_sidebar_button(sidebar, "Select Folder", select_folder)
select_btn.pack(pady=7)

baseline_btn = make_sidebar_button(sidebar, "Create Baseline", create_baseline_gui)
baseline_btn.pack(pady=7)

check_btn = make_sidebar_button(sidebar, "Check Integrity", check_integrity_gui)
check_btn.pack(pady=7)

reports_btn = make_sidebar_button(sidebar, "Open Reports", open_reports_folder)
reports_btn.pack(pady=7)

logs_btn = make_sidebar_button(sidebar, "Open Logs", open_log_file)
logs_btn.pack(pady=7)

clear_btn = make_sidebar_button(sidebar, "Clear Output", clear_output)
clear_btn.pack(pady=7)

exit_btn = tk.Button(
    sidebar,
    text="Exit",
    command=app.destroy,
    bg="#dc2626",
    fg="white",
    activebackground="#b91c1c",
    activeforeground="white",
    relief="flat",
    font=("Arial", 10, "bold"),
    cursor="hand2",
    width=22,
    height=2
)
exit_btn.pack(side="bottom", pady=25)

# Main area
main_area = tk.Frame(app, bg="#f3f4f6")
main_area.pack(side="right", expand=True, fill="both")

header = tk.Frame(main_area, bg="#f3f4f6")
header.pack(fill="x", padx=25, pady=(20, 10))

header_title = tk.Label(
    header,
    text="File Integrity Monitoring Dashboard",
    bg="#f3f4f6",
    fg="#111827",
    font=("Arial", 20, "bold")
)
header_title.pack(anchor="w")

header_subtitle = tk.Label(
    header,
    text="Monitor files, detect changes, generate reports, and review integrity alerts.",
    bg="#f3f4f6",
    fg="#6b7280",
    font=("Arial", 10)
)
header_subtitle.pack(anchor="w", pady=(3, 0))

folder_panel = tk.Frame(main_area, bg="white", relief="ridge", bd=1)
folder_panel.pack(fill="x", padx=25, pady=10)

folder_title = tk.Label(
    folder_panel,
    text="Selected Folder",
    bg="white",
    fg="#374151",
    font=("Arial", 10, "bold")
)
folder_title.pack(anchor="w", padx=15, pady=(10, 2))

folder_value = tk.Label(
    folder_panel,
    text="No folder selected",
    bg="white",
    fg="#111827",
    font=("Arial", 10),
    anchor="w"
)
folder_value.pack(fill="x", padx=15, pady=(0, 10))

cards_frame = tk.Frame(main_area, bg="#f3f4f6")
cards_frame.pack(fill="x", padx=17, pady=5)

files_card_value = create_card(cards_frame, "Files Monitored", "0")
modified_card_value = create_card(cards_frame, "Modified", "0")
deleted_card_value = create_card(cards_frame, "Deleted", "0")
new_card_value = create_card(cards_frame, "New Files", "0")

status_panel = tk.Frame(main_area, bg="white", relief="ridge", bd=1)
status_panel.pack(fill="x", padx=25, pady=10)

status_title = tk.Label(
    status_panel,
    text="System Status",
    bg="white",
    fg="#374151",
    font=("Arial", 10, "bold")
)
status_title.pack(anchor="w", padx=15, pady=(10, 2))

status_value = tk.Label(
    status_panel,
    text="Waiting for folder selection",
    bg="white",
    fg="#2563eb",
    font=("Arial", 11, "bold"),
    anchor="w"
)
status_value.pack(fill="x", padx=15, pady=(0, 10))

results_label = tk.Label(
    main_area,
    text="Results Output",
    bg="#f3f4f6",
    fg="#111827",
    font=("Arial", 12, "bold")
)
results_label.pack(anchor="w", padx=25, pady=(10, 5))

output_box = scrolledtext.ScrolledText(
    main_area,
    width=100,
    height=18,
    font=("Consolas", 9),
    bg="#111827",
    fg="#e5e7eb",
    insertbackground="white",
    relief="flat"
)
output_box.pack(expand=True, fill="both", padx=25, pady=(0, 20))

app.mainloop()