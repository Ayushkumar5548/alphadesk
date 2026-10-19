# AlphaDesk server supervisor (fast).
#
# Runs the API/static server (port 8787) and restarts it within seconds if the
# process ever exits, so the public link cannot stay broken. Also captures the
# server's own stdout/stderr so a crash can actually be diagnosed afterwards.
#
# Single-instance: a named mutex makes extra copies exit immediately, so the
# 5-minute safety task (watch-alpha.ps1) can call this as often as it likes.
#
#   powershell -ExecutionPolicy Bypass -File run-server.ps1

$ErrorActionPreference = 'SilentlyContinue'

$dot   = Join-Path $env:USERPROFILE '.alphadesk'
$root  = Split-Path -Parent $MyInvocation.MyCommand.Path
$entry = Join-Path $root 'server\src\index.js'
$log   = Join-Path $dot 'server.log'
$out   = Join-Path $dot 'server-out.log'
$err   = Join-Path $dot 'server-err.log'
$PORT  = 8787

New-Item -ItemType Directory -Force -Path $dot | Out-Null
function Log($m) { "$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')  $m" | Add-Content -Path $log -Encoding utf8 }

# --- keep the logs from growing without bound -------------------------------
foreach ($f in @($log, $out, $err)) {
  if ((Test-Path $f) -and ((Get-Item $f -ErrorAction SilentlyContinue).Length -gt 1048576)) {
    Move-Item -Force $f "$f.1"
  }
}

# --- single-instance guard --------------------------------------------------
$mutex = New-Object System.Threading.Mutex($false, 'Global\AlphaDeskServerSupervisor')
$owned = $false
try { $owned = $mutex.WaitOne(0) }
catch [System.Threading.AbandonedMutexException] { $owned = $true }
if (-not $owned) { Log "supervisor: already running -> exit"; exit 0 }

$node = (Get-Command node.exe -ErrorAction SilentlyContinue).Source
if (-not $node) { $node = 'C:\Program Files\nodejs\node.exe' }
if (-not (Test-Path $node)) { Log "supervisor: node.exe not found -> exit"; exit 1 }

Log "supervisor: up (pid $PID)"

while ($true) {
  # If the port is already served (by us or anything else), don't fight over it.
  $listen = Get-NetTCPConnection -LocalPort $PORT -State Listen -ErrorAction SilentlyContinue
  if ($listen) { Start-Sleep -Seconds 5; continue }

  $startedAt = Get-Date
  Log "server: starting"
  $p = Start-Process -FilePath $node -ArgumentList "`"$entry`"" -PassThru `
        -NoNewWindow -RedirectStandardOutput $out -RedirectStandardError $err
  Log "server: pid $($p.Id)"

  $p.WaitForExit()
  $code = $p.ExitCode
  $ran  = [int]((Get-Date) - $startedAt).TotalSeconds
  Log "server: exited (code=$code) after ${ran}s -> restarting in 3s"

  # A crash-looping server must not spin the CPU: back off a little.
  Start-Sleep -Seconds 3
}
