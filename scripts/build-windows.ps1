# Build FIMS.exe on Windows.
# Usage (from repo root):
#   powershell -ExecutionPolicy Bypass -File .\scripts\build-windows.ps1

$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent $PSScriptRoot
Set-Location $Root

Write-Host "==> Installing JS + Python dependencies"
npm run install:all
if ($LASTEXITCODE -ne 0) { throw "npm run install:all failed" }

Write-Host "==> Building frontend"
npm run build
if ($LASTEXITCODE -ne 0) { throw "npm run build failed" }

Write-Host "==> Installing build tools"
py -3 -m pip install -r backend\requirements-build.txt
if ($LASTEXITCODE -ne 0) { throw "pip install failed" }

Write-Host "==> Creating Windows icon"
py -3 -c @"
from pathlib import Path
from PIL import Image
src = Path('frontend/public/fim-logo.png')
dst = Path('frontend/public/fim-logo.ico')
img = Image.open(src).convert('RGBA')
img.save(dst, sizes=[(16,16),(32,32),(48,48),(64,64),(128,128),(256,256)])
print('wrote', dst)
"@
if ($LASTEXITCODE -ne 0) { throw "icon generation failed" }

Write-Host "==> Running PyInstaller"
if (Test-Path dist) { Remove-Item -Recurse -Force dist }
if (Test-Path build) { Remove-Item -Recurse -Force build }
py -3 -m PyInstaller --noconfirm --clean FIMS.spec
if ($LASTEXITCODE -ne 0) { throw "PyInstaller failed" }

$Exe = Join-Path $Root "dist\FIMS.exe"
if (-not (Test-Path $Exe)) { throw "Expected output missing: $Exe" }

Write-Host ""
Write-Host "Build complete: $Exe"
Write-Host "Double-click FIMS.exe to open the dashboard in your browser."
Write-Host "Baselines, logs, and reports are stored next to the .exe."
