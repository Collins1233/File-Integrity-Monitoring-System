from datetime import datetime


class ScanProgress:
    def __init__(self):
        self.reset()

    def reset(self):
        self.active = False
        self.operation = ""
        self.current = 0
        self.total = 0
        self.current_file = ""
        self.started_at = None
        self.finished_at = None

    def start(self, operation: str, total: int = 0):
        self.active = True
        self.operation = operation
        self.current = 0
        self.total = total
        self.current_file = ""
        self.started_at = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
        self.finished_at = None

    def update(self, current: int, total: int, current_file: str = ""):
        self.current = current
        self.total = total
        self.current_file = current_file

    def finish(self):
        self.active = False
        self.finished_at = datetime.now().strftime("%Y-%m-%d %H:%M:%S")

    def as_dict(self):
        percent = 0
        if self.total > 0:
            percent = round((self.current / self.total) * 100)

        return {
            "active": self.active,
            "operation": self.operation,
            "current": self.current,
            "total": self.total,
            "percent": percent,
            "current_file": self.current_file,
            "started_at": self.started_at,
            "finished_at": self.finished_at,
        }


scan_progress = ScanProgress()
