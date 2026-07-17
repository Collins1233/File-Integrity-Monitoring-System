from datetime import datetime

from config import LOG_FILE


def save_log(message):
    time_now = datetime.now().strftime("%Y-%m-%d %H:%M:%S")

    with open(LOG_FILE, "a", encoding="utf-8") as log_file:
        log_file.write(f"{time_now} - {message}\n")