# Swaps the installed opencode.exe for a build from the local archive.
# Close clients first; running sessions keep their current build until restarted.
#   bun run local:rollback                     # newest archived build
#   bun run local:rollback -Build 20261028170804581

param([string]$Build)

$ErrorActionPreference = "Stop"
. (Join-Path $PSScriptRoot "local-builds.ps1")

$target = Join-Path $env:USERPROFILE ".local/bin/opencode.exe"
$installedBin = Split-Path $target
$archives = Get-LocalBuildArchives
if ($archives.Count -eq 0) { throw "No archived builds under $(Get-LocalBuildArchiveRoot)." }

$selected = $null
if ($Build) {
    $selected = $archives | Where-Object { $_.Name -eq $Build }
    if ($null -eq $selected) { throw "No archived build named '$Build'. Available: $($archives.Name -join ', ')" }
} else {
    $selected = $archives[0]
}
$source = Join-Path $selected.FullName "opencode.exe"
if (-not (Test-Path -LiteralPath $source)) { throw "Archived build has no opencode.exe: $($selected.FullName)." }
$sourceRecord = Read-LocalBuildRecord (Join-Path $selected.FullName "opencode-build.json")

Write-Host "Rolling back to archive $($selected.Name)."
if ($null -ne $sourceRecord) { Write-Host "Archive version: $($sourceRecord.version)" }

# A rollback that turns out wrong needs an undo path, so the current executable
# is renamed aside and only pre-existing renames are cleaned up.
$existingRenames = @(Get-ChildItem -LiteralPath $installedBin -Filter "opencode.exe.old-*" -File -ErrorAction SilentlyContinue)
$old = "$target.old-$(Get-Date -Format 'yyyyMMddHHmmssfff')"
if (Test-Path -LiteralPath $target) { Move-Item -LiteralPath $target -Destination $old }
try { Copy-Item -LiteralPath $source -Destination $target -Force }
catch {
    if ((Test-Path -LiteralPath $old) -and -not (Test-Path -LiteralPath $target)) {
        Move-Item -LiteralPath $old -Destination $target
    }
    throw
}

$renderers = @(Get-ChildItem -LiteralPath $selected.FullName -Filter "opentui-*.dll" -File)
foreach ($renderer in $renderers) {
    $destination = Join-Path $installedBin $renderer.Name
    if (-not (Test-Path -LiteralPath $destination)) {
        Copy-Item -LiteralPath $renderer.FullName -Destination $destination
    }
}

# The record must describe the executable on disk. An archive without one
# predates build manifests, so the current record would lie about the rollback.
$archiveRecord = Join-Path $selected.FullName "opencode-build.json"
if (Test-Path -LiteralPath $archiveRecord) {
    Copy-Item -LiteralPath $archiveRecord -Destination (Join-Path $installedBin "opencode-build.json") -Force
} elseif (Test-Path -LiteralPath (Join-Path $installedBin "opencode-build.json")) {
    Remove-Item -LiteralPath (Join-Path $installedBin "opencode-build.json") -Force
    Write-Host "Removed the installed build record; this archive predates build manifests."
}

foreach ($rename in $existingRenames) {
    Remove-Item -LiteralPath $rename.FullName -Force -ErrorAction SilentlyContinue
}

Write-Host "Rolled back to $($selected.Name). The pre-rollback build is at $old."
& $target --version
