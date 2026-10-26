# Rebuilds the CLI for this machine and installs it as the daily-driver `opencode`.
# Run from the repository root after pulling or making changes on dev.

$ErrorActionPreference = "Stop"

bun run --cwd packages/cli build --single --skip-install
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

$source = "packages/cli/dist/cli-windows-x64/bin/opencode.exe"
if (-not (Test-Path $source)) { throw "Build output not found: $source" }

$target = Join-Path $env:USERPROFILE ".local/bin/opencode.exe"
Copy-Item $source $target -Force
Write-Host "Installed $target"
& $target --version
