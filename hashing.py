import hashlib

BUFFER_SIZE = 4096


def calculate_hash(file_path):
    sha256 = hashlib.sha256()

    with open(file_path, "rb") as file:
        for block in iter(lambda: file.read(BUFFER_SIZE), b""):
            sha256.update(block)

    return sha256.hexdigest()