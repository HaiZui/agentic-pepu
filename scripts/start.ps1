# Starts The Bottle Throne on this laptop and opens the setup screen.
$ErrorActionPreference = 'Stop'

$root = Split-Path -Parent $PSScriptRoot
Set-Location $root

$python = Join-Path $root '.venv\Scripts\python.exe'
if (-not (Test-Path $python)) {
    Write-Host 'Creating virtual environment .venv ...'
    python -m venv .venv
    if ($LASTEXITCODE -ne 0) { throw 'Could not create .venv. Is Python 3.12+ installed and on PATH?' }
}

# Probe without writing to stderr: Windows PowerShell 5.1 treats redirected stderr as a terminating error here.
& $python -c "import importlib.util, sys; sys.exit(0 if importlib.util.find_spec('bottle_throne') else 1)"
if ($LASTEXITCODE -ne 0) {
    Write-Host 'Installing backend dependencies ...'
    & $python -m pip install -e .
    if ($LASTEXITCODE -ne 0) { throw 'pip install failed.' }
}

$web = Join-Path $root 'web'
$distIndex = Join-Path $web 'dist\index.html'
$needsBuild = -not (Test-Path $distIndex)
if (-not $needsBuild) {
    $builtAt = (Get-Item $distIndex).LastWriteTimeUtc
    $sources = @(
        Get-ChildItem (Join-Path $web 'src') -Recurse -File
        Get-Item (Join-Path $web 'index.html'), (Join-Path $web 'package.json'), (Join-Path $web 'vite.config.ts')
    )
    $needsBuild = [bool]($sources | Where-Object { $_.LastWriteTimeUtc -gt $builtAt } | Select-Object -First 1)
}

if ($needsBuild) {
    Push-Location $web
    try {
        if (-not (Test-Path 'node_modules')) {
            Write-Host 'Installing front-end dependencies ...'
            npm install
            if ($LASTEXITCODE -ne 0) { throw 'npm install failed.' }
        }
        Write-Host 'Building front end ...'
        npm run build
        if ($LASTEXITCODE -ne 0) { throw 'Front-end build failed.' }
    }
    finally {
        Pop-Location
    }
}

& $python -m bottle_throne --open
exit $LASTEXITCODE
