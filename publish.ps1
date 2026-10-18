# Publish this folder to GitHub. Render watches the repo and redeploys on push.
#
#   powershell -ExecutionPolicy Bypass -File publish.ps1 "what changed"
#
# Uses the portable git/gh tools installed under ~\.alphadesk\tools
# (no admin rights needed).
param([string]$Message = "Update AlphaDesk")

$ErrorActionPreference = 'Stop'
$tools = Join-Path $env:USERPROFILE '.alphadesk\tools'
$git = Join-Path $tools 'mingit\cmd\git.exe'
$ghBin = Join-Path $tools 'gh\bin'
$gitBin = Join-Path $tools 'mingit\cmd'

if (-not (Test-Path $git)) {
  throw "Portable git not found at $git. See DEPLOY.md for setup."
}

$env:PATH = "$ghBin;$gitBin;$env:PATH"
Set-Location $PSScriptRoot

# Stage everything, then only commit if something actually changed.
& $git add -A
& $git diff --cached --quiet
if ($LASTEXITCODE -eq 0) {
  Write-Host "Nothing to publish - working tree is clean." -ForegroundColor Yellow
  return
}

& $git commit -m $Message
& $git push
Write-Host "Pushed. Render will rebuild and redeploy automatically." -ForegroundColor Green
