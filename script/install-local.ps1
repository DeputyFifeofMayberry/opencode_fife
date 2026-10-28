# Rebuilds the CLI for this machine and installs it as the daily-driver `opencode`.
# Run from the repository root after pulling or making changes on dev:
#   bun run install:local

$ErrorActionPreference = "Stop"

$root = (Get-Location).Path
function Get-FileDigest([string]$path) {
    $stream = [IO.File]::OpenRead($path)
    $sha = [Security.Cryptography.SHA256]::Create()
    try { return [BitConverter]::ToString($sha.ComputeHash($stream)).Replace("-", "").ToLowerInvariant() }
    finally { $stream.Dispose(); $sha.Dispose() }
}
function Get-SourceState {
    $commit = git rev-parse HEAD
    if ($LASTEXITCODE -ne 0) { throw "Run the installer from the repository root with a valid HEAD." }
    $status = @(git status --porcelain=v1 --untracked-files=all)
    $diff = @(git -c core.safecrlf=false diff --binary HEAD)
    $untracked = @(git ls-files --others --exclude-standard | ForEach-Object {
        if (Test-Path -LiteralPath $_ -PathType Leaf) { "$_ $(Get-FileDigest (Join-Path $root $_))" }
    })
    $bytes = [Text.Encoding]::UTF8.GetBytes((@($commit) + $status + $diff + $untracked -join "`n"))
    $sha = [Security.Cryptography.SHA256]::Create()
    try { $fingerprint = [BitConverter]::ToString($sha.ComputeHash($bytes)).Replace("-", "").ToLowerInvariant() }
    finally { $sha.Dispose() }
    return @{ commit = "$commit"; dirty = ($status.Count -gt 0); status = $status; fingerprint = $fingerprint }
}

$sourceState = Get-SourceState
$env:OPENCODE_CHANNEL = "dev"
$env:OPENCODE_VERSION = "0.0.0-dev-$(Get-Date -Format 'yyyyMMddHHmmssfff')"

bun run --cwd packages/cli build --single --skip-install
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

bun run --cwd packages/cli script/service-smoke.ts
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
if ((Get-SourceState).fingerprint -ne $sourceState.fingerprint) {
    throw "Source changed during build or verification. Nothing installed; rerun once edits are finished."
}

$source = "packages/cli/dist/cli-windows-x64/bin/opencode.exe"
if (-not (Test-Path $source)) { throw "Build output not found: $source" }

$target = Join-Path $env:USERPROFILE ".local/bin/opencode.exe"
$staged = "$target.new"
$installedBin = Split-Path $target
New-Item -ItemType Directory -Path $installedBin -Force | Out-Null
$previousBuild = $null
if (Test-Path -LiteralPath $target) {
    $previousBuild = Join-Path $env:USERPROFILE ".local/share/opencode-fife-builds/$(Get-Date -Format 'yyyyMMddHHmmssfff')"
    New-Item -ItemType Directory -Path $previousBuild | Out-Null
    Copy-Item -LiteralPath $target -Destination $previousBuild
    Get-ChildItem -LiteralPath $installedBin -Filter "opentui-*.dll" -File | Copy-Item -Destination $previousBuild
    $previousManifest = Join-Path $installedBin "opencode-build.json"
    if (Test-Path -LiteralPath $previousManifest) { Copy-Item -LiteralPath $previousManifest -Destination $previousBuild }
}

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

Copy-Item -LiteralPath $source -Destination $staged -Force

# Windows locks a running image against writes but allows renaming it, so move the
# current copy aside and drop the new one in. A backup still held by a running
# session stays until a later install removes it.
$old = "$target.old-$(Get-Date -Format 'yyyyMMddHHmmssfff')"
if (Test-Path -LiteralPath $target) { Move-Item -LiteralPath $target -Destination $old }
try { Move-Item -LiteralPath $staged -Destination $target }
catch {
    if ((Test-Path -LiteralPath $old) -and -not (Test-Path -LiteralPath $target)) {
        Move-Item -LiteralPath $old -Destination $target
    }
    throw
}
Get-ChildItem "$target.old-*" -ErrorAction SilentlyContinue | Remove-Item -Force -ErrorAction SilentlyContinue

@{
    version = $env:OPENCODE_VERSION
    channel = $env:OPENCODE_CHANNEL
    installedAt = (Get-Date).ToUniversalTime().ToString("o")
    repository = $root
    source = $sourceState
    sha256 = Get-FileDigest $target
    previousBuild = $previousBuild
} | ConvertTo-Json -Depth 5 | Set-Content -LiteralPath (Join-Path $installedBin "opencode-build.json") -Encoding UTF8

Write-Host "Installed $target"
& $target --version
Write-Host "Previous build: $previousBuild"
Write-Host "Running sessions were not restarted. Open the new build when existing work is idle."
