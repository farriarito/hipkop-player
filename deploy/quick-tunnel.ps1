# Ephemeral public URL for demos and phone checks — no Cloudflare account needed.
#
#   powershell -File deploy/quick-tunnel.ps1            # tunnels http://127.0.0.1:8080
#   powershell -File deploy/quick-tunnel.ps1 -Port 4180 # tunnels the dev server
#
# The printed https://<random>.trycloudflare.com dies with this process and has no
# uptime guarantee. For a real deployment see docs/DEPLOY.md (section C).

param([int]$Port = 8080)

$ErrorActionPreference = 'Stop'
$exe = Join-Path $PSScriptRoot 'cloudflared.exe'

if (-not (Test-Path $exe)) {
	Write-Host "downloading cloudflared into $exe"
	$ProgressPreference = 'SilentlyContinue'
	Invoke-WebRequest 'https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-windows-amd64.exe' -OutFile $exe
}

Write-Host "tunneling http://127.0.0.1:$Port (Ctrl+C to stop)"
& $exe tunnel --url "http://127.0.0.1:$Port" --no-autoupdate