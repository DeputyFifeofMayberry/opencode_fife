# Rebuilds the CLI for this machine and installs it as the daily-driver `opencode`.
# Run from the repository root after pulling or making changes on dev:
#   bun run install:local

$ErrorActionPreference = "Stop"

bun run --cwd packages/cli build --single --skip-install
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

$source = "packages/cli/dist/cli-windows-x64/bin/opencode.exe"
if (-not (Test-Path $source)) { throw "Build output not found: $source" }

$target = Join-Path $env:USERPROFILE ".local/bin/opencode.exe"
$staged = "$target.new"
Copy-Item $source $staged -Force

# Windows locks a running image against writes but allows renaming it, so move the
# current copy aside and drop the new one in. A backup still held by a running
# session stays until a later install removes it.
if (Test-Path $target) { Move-Item $target "$target.old-$(Get-Date -Format 'yyyyMMddHHmmss')" }
Move-Item $staged $target
Get-ChildItem "$target.old-*" -ErrorAction SilentlyContinue | Remove-Item -Force -ErrorAction SilentlyContinue

Write-Host "Installed $target"
& $target --version
