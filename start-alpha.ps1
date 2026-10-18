# AlphaDesk launcher - thin wrapper around watch-alpha.ps1 (the supervisor
# that keeps the server and the public tunnel alive).
#
#   start:  powershell -ExecutionPolicy Bypass -File start-alpha.ps1
#   stop:   powershell -ExecutionPolicy Bypass -File start-alpha.ps1 -Stop
#
# The public URL is written to ~/.alphadesk/tunnel-url.txt and served by
# GET /api/tunnel. Temporary (quick) URLs change whenever the tunnel restarts;
# see watch-alpha.ps1 for how to pin a permanent one.

param(
  [switch]$Stop,
  [switch]$Force
)

$ErrorActionPreference = 'SilentlyContinue'
$here    = Split-Path -Parent $MyInvocation.MyCommand.Path
$dot     = Join-Path $env:USERPROFILE '.alphadesk'
$urlFile = Join-Path $dot 'tunnel-url.txt'

if ($Stop) {
  $c = Get-NetTCPConnection -LocalPort 8787 -State Listen -ErrorAction SilentlyContinue
  if ($c) { Stop-Process -Id $c[0].OwningProcess -Force -ErrorAction SilentlyContinue; Write-Host "stopped server (PID $($c[0].OwningProcess))" }
  Get-Process cloudflared,ngrok -ErrorAction SilentlyContinue | Stop-Process -Force
  Remove-Item $urlFile -Force -ErrorAction SilentlyContinue
  Write-Host 'AlphaDesk stopped.'
  exit 0
}

& (Join-Path $here 'watch-alpha.ps1') -Force:$Force

$u = if (Test-Path $urlFile) { (Get-Content $urlFile -Raw).Trim() } else { $null }
if ($u) {
  Write-Host ''
  Write-Host 'AlphaDesk is live on the internet:'
  Write-Host "  $u"
  Write-Host ''
  Write-Host 'Open it from any PC or phone on any network.'
  Write-Host 'Current link is also at GET /api/tunnel.'
} else {
  Write-Host 'No public URL yet - see ~/.alphadesk/watch.log'
  Write-Host 'Local: http://localhost:8787'
}
