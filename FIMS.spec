# -*- mode: python ; coding: utf-8 -*-
"""PyInstaller spec for the Windows FIMS desktop build. Run on Windows only."""

import os
from pathlib import Path

from PyInstaller.utils.hooks import collect_all, collect_submodules

ROOT = Path(SPECPATH).resolve()
BACKEND = ROOT / "backend"
FRONTEND_DIST = ROOT / "frontend" / "dist"
ICON = ROOT / "frontend" / "public" / "fim-logo.ico"

if not FRONTEND_DIST.is_dir():
    raise SystemExit(
        "frontend/dist is missing. Run `npm run build` before PyInstaller."
    )

datas = [
    (str(FRONTEND_DIST), os.path.join("frontend", "dist")),
    (str(BACKEND / "win_folder_picker.py"), "backend"),
    (str(BACKEND / "win_file_picker.py"), "backend"),
]

if ICON.is_file():
    datas.append((str(ICON), "frontend/public"))

binaries = []
hiddenimports = [
    "uvicorn.logging",
    "uvicorn.loops",
    "uvicorn.loops.auto",
    "uvicorn.protocols",
    "uvicorn.protocols.http",
    "uvicorn.protocols.http.auto",
    "uvicorn.protocols.websockets",
    "uvicorn.protocols.websockets.auto",
    "uvicorn.lifespan",
    "uvicorn.lifespan.on",
    "multipart",
    "email.mime.text",
    "reportlab.pdfbase.*",
]

for package in ("uvicorn", "fastapi", "starlette", "anyio", "pydantic"):
    pkg_datas, pkg_binaries, pkg_hidden = collect_all(package)
    datas += pkg_datas
    binaries += pkg_binaries
    hiddenimports += pkg_hidden

hiddenimports += collect_submodules("reportlab")
hiddenimports += collect_submodules("docx")
hiddenimports += collect_submodules("openpyxl")
hiddenimports += collect_submodules("pptx")
hiddenimports += collect_submodules("pypdf")

a = Analysis(
    [str(BACKEND / "desktop_main.py")],
    pathex=[str(BACKEND)],
    binaries=binaries,
    datas=datas,
    hiddenimports=hiddenimports,
    hookspath=[],
    hooksconfig={},
    runtime_hooks=[],
    excludes=[],
    noarchive=False,
    optimize=0,
)

pyz = PYZ(a.pure)

exe = EXE(
    pyz,
    a.scripts,
    a.binaries,
    a.datas,
    [],
    name="FIMS",
    debug=False,
    bootloader_ignore_signals=False,
    strip=False,
    upx=True,
    upx_exclude=[],
    runtime_tmpdir=None,
    console=False,
    disable_windowed_traceback=False,
    argv_emulation=False,
    target_arch=None,
    codesign_identity=None,
    entitlements_file=None,
    icon=str(ICON) if ICON.is_file() else None,
)
