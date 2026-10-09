$ErrorActionPreference = 'Stop'
$root = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$stateDir = Join-Path $root 'data\public-share'
$stateFile = Join-Path $stateDir 'processes.json'
$node = (Get-Command node -ErrorAction Stop).Source
$tunnel = Join-Path $root 'tmp\deploy-tools\cloudflared.exe'
if (Test-Path -LiteralPath $stateFile) {
  $old = Get-Content -LiteralPath $stateFile -Raw | ConvertFrom-Json
  if ((Get-Process -Id $old.appPid -ErrorAction SilentlyContinue) -or (Get-Process -Id $old.tunnelPid -ErrorAction SilentlyContinue)) {
    throw 'Share processes already exist. Run scripts/stop-share.ps1 before restarting.'
  }
}
if (-not (Test-Path -LiteralPath $tunnel)) { throw 'Install the signed Cloudflare cloudflared.exe in tmp/deploy-tools first.' }
if ((Get-AuthenticodeSignature -LiteralPath $tunnel).Status -ne 'Valid') { throw 'cloudflared Windows signature is not valid.' }
if (-not (Test-Path -LiteralPath (Join-Path $stateDir 'hipkop.sqlite'))) { throw 'Restore the private migration bundle into data/public-share first.' }
if (-not (Test-Path -LiteralPath (Join-Path $root 'dist\server.js'))) { throw 'Run npm run build first.' }
$port = 4186
if (Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue) { throw "Port $port already in use" }
$envFile = Join-Path $stateDir 'runtime.env'
$token = if (Test-Path -LiteralPath $envFile) {
  ((Get-Content -LiteralPath $envFile | Where-Object { $_ -like 'HIPKOP_ADMIN_TOKEN=*' }) -replace '^HIPKOP_ADMIN_TOKEN=', '')
} else { '' }
if ($token.Length -lt 32) { $token = [Convert]::ToHexString([Security.Cryptography.RandomNumberGenerator]::GetBytes(32)).ToLowerInvariant() }
$tunnelOut = Join-Path $stateDir 'tunnel-out.log'
$tunnelErr = Join-Path $stateDir 'tunnel-error.log'
$helper = Start-Process -FilePath $tunnel -ArgumentList @('tunnel', '--url', "http://127.0.0.1:$port", '--protocol', 'http2', '--no-autoupdate') -WorkingDirectory $root -WindowStyle Hidden -RedirectStandardOutput $tunnelOut -RedirectStandardError $tunnelErr -PassThru
$app = $null
try {
  $deadline = (Get-Date).AddSeconds(75)
  $origin = ''
  while ((Get-Date) -lt $deadline -and -not $helper.HasExited) {
    Start-Sleep -Seconds 1
    $text = if (Test-Path -LiteralPath $tunnelErr) { Get-Content -LiteralPath $tunnelErr -Raw } else { '' }
    $match = [regex]::Match($text, 'https://[a-z0-9-]+\.trycloudflare\.com')
    if ($match.Success) { $origin = $match.Value; break }
    $helper.Refresh()
  }
  if (-not $origin) { throw "HTTPS tunnel failed; inspect $tunnelErr" }
  $db = (Join-Path $stateDir 'hipkop.sqlite').Replace('\','/')
  $media = (Join-Path $stateDir 'media').Replace('\','/')
  @(
    'NODE_ENV=production'
    "HIPKOP_PLAYER_HOST=127.0.0.1"
    "HIPKOP_PLAYER_PORT=$port"
    "HIPKOP_PUBLIC_ORIGIN=$origin"
    "HIPKOP_ADMIN_TOKEN=$token"
    "HIPKOP_DB_PATH=$db"
    "HIPKOP_MEDIA_DIR=$media"
    'HIPKOP_TRUST_PROXY=true'
    'HIPKOP_SCHEDULER=true'
  ) | Set-Content -LiteralPath $envFile -Encoding utf8NoBOM
  # Keep the operator credential readable only by this Windows account + SYSTEM.
  $identity = [Security.Principal.WindowsIdentity]::GetCurrent().Name
  & icacls.exe $envFile '/inheritance:r' '/grant:r' "${identity}:(F)" 'SYSTEM:(F)' | Out-Null
  if ($LASTEXITCODE -ne 0) { throw 'Failed to secure production credential file ACL' }
  $app = Start-Process -FilePath $node -ArgumentList @("--env-file=`"$envFile`"", 'dist/server.js') -WorkingDirectory $root -WindowStyle Hidden -RedirectStandardOutput (Join-Path $stateDir 'app-out.log') -RedirectStandardError (Join-Path $stateDir 'app-error.log') -PassThru
  $deadline = (Get-Date).AddSeconds(30)
  $ready = $false
  while ((Get-Date) -lt $deadline -and -not $app.HasExited) {
    try {
      $health = Invoke-RestMethod -Uri "http://127.0.0.1:$port/api/health" -TimeoutSec 3
      if ($health.ok -and $health.stats.albums -gt 0) { $ready = $true; break }
    } catch { Start-Sleep -Seconds 1 }
    $app.Refresh()
  }
  if (-not $ready) { throw 'Migrated production app failed its health check' }
  @{ origin=$origin; appPid=$app.Id; tunnelPid=$helper.Id; appStarted=$app.StartTime.ToUniversalTime().ToString('o'); tunnelStarted=$helper.StartTime.ToUniversalTime().ToString('o'); port=$port; started=(Get-Date).ToUniversalTime().ToString('o'); temporary=$true } |
    ConvertTo-Json | Set-Content -LiteralPath $stateFile -Encoding utf8NoBOM
  Write-Output "HIPKOP HTTPS share: $origin/hipkop"
  Write-Output 'Temporary share: this computer and both processes must remain running. Persistent cloud hosting still requires a cloud account.'
} catch {
  if ($app -and -not $app.HasExited) { Stop-Process -Id $app.Id }
  if (-not $helper.HasExited) { Stop-Process -Id $helper.Id }
  throw
}
