# AlphaDesk supervisor.
#
# Keeps the API/static server (port 8787) and the public tunnel alive, and keeps
# ~/.alphadesk/tunnel-url.txt pointing at the current public URL. It is safe to
# run as often as you like: it only acts when something is actually down.
#
# Wired to the "AlphaDesk" scheduled task (at logon, then every 5 minutes) so the
# site recovers by itself after a reboot, a network drop, or a crash.
#
#   powershell -ExecutionPolicy Bypass -File watch-alpha.ps1
#   powershell -ExecutionPolicy Bypass -File watch-alpha.ps1 -Force   # always restart the tunnel
#
# Providers, chosen by ~/.alphadesk/tunnel.config.json:
#   { "provider": "tailscale" }                                  -> permanent https://<machine>.<tailnet>.ts.net
#   { "provider": "ngrok",  "ngrokAuthtoken": "...", "ngrokDomain": "name.ngrok-free.app" }
#   { "provider": "quick" }   (default) Temporary Cloudflare trycloudflare.com URL - RANDOM each restart.

param(
  [switch]$Force,
  [switch]$Quiet
)

$ErrorActionPreference = 'SilentlyContinue'
$dot     = Join-Path $env:USERPROFILE '.alphadesk'
$root    = Split-Path -Parent $MyInvocation.MyCommand.Path
$cf      = Join-Path $dot 'cloudflared.exe'
$ng      = Join-Path $dot 'ngrok.exe'
$ts      = 'C:\Program Files\Tailscale\tailscale.exe'
$log     = Join-Path $dot 'watch.log'
$urlFile = Join-Path $dot 'tunnel-url.txt'
$cfLog   = Join-Path $dot 'tunnel.log'
$cfg     = Join-Path $dot 'tunnel.config.json'
$PORT    = 8787

New-Item -ItemType Directory -Force -Path $dot | Out-Null
function Log($m) { "$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')  $m" | Add-Content -Path $log -Encoding utf8 }
function Say($m) { if (-not $Quiet) { Write-Host $m } }

# Detach a process from this PowerShell/Task-Scheduler job so it survives the
# script exiting (Task Scheduler can tear down child processes on completion).
function Detach($cmdline) {
  $r = Invoke-CimMethod -ClassName Win32_Process -MethodName Create -Arguments @{ CommandLine = $cmdline }
  return $r.ProcessId
}

# --- configuration ----------------------------------------------------------
$provider = 'quick'; $ngToken = ''; $ngDomain = ''
if (Test-Path $cfg) {
  try {
    $c = Get-Content $cfg -Raw | ConvertFrom-Json
    if ($c.provider) { $provider = $c.provider }
    $ngToken  = $c.ngrokAuthtoken
    $ngDomain = $c.ngrokDomain
  } catch { Log "config: could not parse $cfg" }
}
# If Tailscale is installed and this machine is signed in, prefer the permanent
# Funnel URL unless the config explicitly asks for something else.
$tsReady = $false
$tsUrl = $null
if (Test-Path $ts) {
  $j = (& $ts status --json 2>$null) | ConvertFrom-Json
  if ($j.Self.DNSName -and $j.BackendState -eq 'Running') {
    $tsReady = $true
    $tsUrl = "https://$($j.Self.DNSName.TrimEnd('.'))"
  }
}
if ($provider -eq 'quick' -and $tsReady) { $provider = 'tailscale' }

# --- 1. API/static server ---------------------------------------------------
$listen = Get-NetTCPConnection -LocalPort $PORT -State Listen -ErrorAction SilentlyContinue
if (-not $listen) {
  $node = (Get-Command node.exe -ErrorAction SilentlyContinue).Source
  if (-not $node) { $node = 'C:\Program Files\nodejs\node.exe' }
  $entry = Join-Path $root 'server\src\index.js'
  $npid = Detach "`"$node`" `"$entry`""
  Log "server: started (pid $npid)"
  Say "server: started (pid $npid)"
  Start-Sleep -Seconds 3
}

# --- 2. is the public URL healthy? -----------------------------------------
function PublicHealthy($u) {
  if (-not $u) { return $false }
  try { return ((Invoke-WebRequest "$u/api/tunnel" -UseBasicParsing -TimeoutSec 15).StatusCode -eq 200) }
  catch { return $false }
}

$wantUrl = $null
if ($provider -eq 'tailscale') { $wantUrl = $tsUrl }
elseif ($provider -eq 'ngrok')  { if ($ngDomain) { $wantUrl = "https://$ngDomain" } }
$haveUrl = $null
if (Test-Path $urlFile) { $haveUrl = (Get-Content $urlFile -Raw).Trim() }

$healthy = $false
if ($provider -eq 'tailscale') {
  $healthy = $tsReady -and (PublicHealthy $tsUrl)
} elseif ($provider -eq 'ngrok') {
  $healthy = (Get-Process ngrok -ErrorAction SilentlyContinue) -and (PublicHealthy $wantUrl)
} else {
  $healthy = (Get-Process cloudflared -ErrorAction SilentlyContinue) -and (PublicHealthy $haveUrl)
}
if (-not $healthy) { Start-Sleep -Seconds 5; $healthy =
  if ($provider -eq 'tailscale') { $tsReady -and (PublicHealthy $tsUrl) }
  elseif ($provider -eq 'ngrok') { (Get-Process ngrok -ErrorAction SilentlyContinue) -and (PublicHealthy $wantUrl) }
  else { (Get-Process cloudflared -ErrorAction SilentlyContinue) -and (PublicHealthy $haveUrl) } }

if (-not $Force -and $healthy) {
  if ($wantUrl -and $haveUrl -ne $wantUrl) { Set-Content -Path $urlFile -Value $wantUrl -Encoding ascii }
  Say "tunnel: healthy ($provider)"
  exit 0
}

# --- 3. (re)start the tunnel ------------------------------------------------
Log "tunnel: unhealthy -> restarting (provider=$provider)"

if ($provider -eq 'tailscale') {
  if ($tsReady) {
    & $ts funnel --bg $PORT | Out-Null
    Set-Content -Path $urlFile -Value $tsUrl -Encoding ascii
    Log "tunnel: tailscale funnel $tsUrl"
    Say "tunnel: tailscale funnel $tsUrl"
    exit 0
  }
  # Tailscale not installed / signed out: fall back to a quick tunnel so the
  # site stays reachable (its hostname is random and changes on restart).
  Log "tunnel: tailscale unavailable -> falling back to quick"
  Say "tunnel: tailscale unavailable - falling back to a temporary Cloudflare link"
  $provider = 'quick'
}

Get-Process cloudflared,ngrok -ErrorAction SilentlyContinue | Stop-Process -Force
Remove-Item $urlFile -Force -ErrorAction SilentlyContinue
Start-Sleep -Seconds 1

if ($provider -eq 'ngrok' -and (Test-Path $ng) -and $ngToken -and $ngDomain) {
  Detach "`"$ng`" http $PORT --authtoken=$ngToken --url=https://$ngDomain --log=`"$dot\ngrok.log`"" | Out-Null
  Set-Content -Path $urlFile -Value "https://$ngDomain" -Encoding ascii
  Log "tunnel: ngrok static https://$ngDomain"
  Say "tunnel: ngrok static https://$ngDomain"
  exit 0
}

if (-not (Test-Path $cf)) { Log "tunnel: cloudflared missing at $cf"; Say "tunnel: cloudflared missing at $cf"; exit 1 }
Remove-Item $cfLog -Force -ErrorAction SilentlyContinue
Detach "`"$cf`" tunnel --url http://localhost:$PORT --no-autoupdate --logfile `"$cfLog`"" | Out-Null

$url = $null
for ($i = 0; $i -lt 30 -and -not $url; $i++) {
  Start-Sleep -Seconds 1
  if (Test-Path $cfLog) {
    $m = [regex]::Match((Get-Content $cfLog -Raw), 'https://[a-z0-9-]+\.trycloudflare\.com')
    if ($m.Success) { $url = $m.Value }
  }
}
if ($url) {
  Set-Content -Path $urlFile -Value $url -Encoding ascii
  Log "tunnel: quick $url"
  Say "tunnel: quick $url"
} else {
  Log "tunnel: URL not found"; Say "tunnel: URL not found"
}
