# Development mode: backend with auto-reload + Vite dev server (proxies /api to the backend).
$ErrorActionPreference = 'Stop'

$root = Split-Path -Parent $PSScriptRoot
Set-Location $root

$python = Join-Path $root '.venv\Scripts\python.exe'
if (-not (Test-Path $python)) { throw 'Virtual environment .venv not found. Run scripts/start.ps1 once first.' }

$port = if ($env:BOTTLE_THRONE_PORT) { $env:BOTTLE_THRONE_PORT } else { '8765' }

$backend = Start-Process -FilePath $python -NoNewWindow -PassThru -ArgumentList @(
    '-m', 'uvicorn', 'bottle_throne.app:create_app', '--factory', '--reload',
    '--reload-dir', 'src', '--host', '127.0.0.1', '--port', $port
)

try {
    Push-Location (Join-Path $root 'web')
    if (-not (Test-Path 'node_modules')) { npm install }
    Write-Host 'Front end (dev): http://127.0.0.1:5173/'
    npm run dev
}
finally {
    Pop-Location
    if (-not $backend.HasExited) {
        # Stop the reloader and its worker processes.
        & taskkill /PID $backend.Id /T /F | Out-Null
    }
}
