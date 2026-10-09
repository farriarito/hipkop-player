$ErrorActionPreference = 'Stop'
$root = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$stateDir = Join-Path $root 'data\public-share'
$file = Join-Path $stateDir 'processes.json'
$state = Get-Content -LiteralPath $file -Raw | ConvertFrom-Json
$app = Get-Process -Id $state.appPid -ErrorAction SilentlyContinue
if ($app) {
  if ($app.ProcessName -ne 'node' -or [Math]::Abs(($app.StartTime.ToUniversalTime() - [DateTime]::Parse($state.appStarted).ToUniversalTime()).TotalSeconds) -gt 1) {
    throw 'Saved PID now belongs to a different process'
  }
  Stop-Process -Id $app.Id
  $app.WaitForExit()
}
$envFile = Join-Path $stateDir 'runtime.env'
$newApp = Start-Process -FilePath (Get-Command node).Source -ArgumentList @("--env-file=`"$envFile`"", 'dist/server.js') -WorkingDirectory $root -WindowStyle Hidden -RedirectStandardOutput (Join-Path $stateDir 'app-out.log') -RedirectStandardError (Join-Path $stateDir 'app-error.log') -PassThru
$state.appPid = $newApp.Id
$state.appStarted = $newApp.StartTime.ToUniversalTime().ToString('o')
$state | ConvertTo-Json | Set-Content -LiteralPath $file -Encoding utf8NoBOM
$deadline = (Get-Date).AddSeconds(30)
$ready = $false
while ((Get-Date) -lt $deadline) {
  try { if ((Invoke-RestMethod "http://127.0.0.1:$($state.port)/api/health" -TimeoutSec 3).ok) { $ready = $true; break } }
  catch { Start-Sleep -Seconds 1 }
}
if (-not $ready) { throw 'Restarted service failed health check; inspect logs' }
Write-Output "Production app restarted; HTTPS URL unchanged: $($state.origin)/hipkop"
