$ErrorActionPreference = 'Stop'
$root = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$file = Join-Path $root 'data\public-share\processes.json'
if (-not (Test-Path -LiteralPath $file)) { Write-Output 'No share session'; exit }
$state = Get-Content -LiteralPath $file -Raw | ConvertFrom-Json
foreach ($kind in @('app','tunnel')) {
  $id = [int]$state."${kind}Pid"
  $process = Get-Process -Id $id -ErrorAction SilentlyContinue
  if (-not $process) { continue }
  $expectedName = if ($kind -eq 'app') { 'node' } else { 'cloudflared' }
  $started = [DateTime]::Parse($state."${kind}Started").ToUniversalTime()
  if ($process.ProcessName -ne $expectedName -or [Math]::Abs(($process.StartTime.ToUniversalTime() - $started).TotalSeconds) -gt 1) {
    throw "PID $id belongs to another process; refusing to stop it."
  }
  Stop-Process -Id $id
}
Remove-Item -LiteralPath $file
Write-Output 'HIPKOP temporary share stopped. Migrated database and media preserved.'
