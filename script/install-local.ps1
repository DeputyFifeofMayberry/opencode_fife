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

# Install the native renderer before the executable so startup does not depend on
# Bun extracting its embedded DLL. Hash-named DLLs may still be loaded by a session.
$renderers = @(Get-ChildItem -LiteralPath (Split-Path $source) -Filter "opentui-*.dll" -File)
if ($renderers.Count -eq 0) { throw "OpenTUI DLL not found beside build output: $source" }
foreach ($renderer in $renderers) {
    $destination = Join-Path (Split-Path $target) $renderer.Name
    if (-not (Test-Path -LiteralPath $destination)) {
        Copy-Item -LiteralPath $renderer.FullName -Destination $destination
    }
}

Copy-Item $source $staged -Force

# Windows locks a running image against writes but allows renaming it, so move the
# current copy aside and drop the new one in. A backup still held by a running
# session stays until a later install removes it.
if (Test-Path $target) { Move-Item $target "$target.old-$(Get-Date -Format 'yyyyMMddHHmmss')" }
Move-Item $staged $target
Get-ChildItem "$target.old-*" -ErrorAction SilentlyContinue | Remove-Item -Force -ErrorAction SilentlyContinue

Write-Host "Installed $target"
& $target --version
