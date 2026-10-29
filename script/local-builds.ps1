# Shared helpers for the local build archive under %USERPROFILE%\.local.
# Dot-source from the local update scripts; not meant to run directly:
#   . (Join-Path $PSScriptRoot "local-builds.ps1")

$localBuildsKeep = 5

function Get-LocalBuildArchiveRoot {
    return Join-Path $env:USERPROFILE ".local/share/opencode-fife-builds"
}

function Get-LocalBuildArchives {
    # Archive directories use 17-digit timestamp names, so name order is time order.
    $root = Get-LocalBuildArchiveRoot
    if (-not (Test-Path -LiteralPath $root)) { return @() }
    return @(Get-ChildItem -LiteralPath $root -Directory | Sort-Object Name -Descending)
}

function Read-LocalBuildRecord([string]$path) {
    if (-not (Test-Path -LiteralPath $path)) { return $null }
    try { return Get-Content -LiteralPath $path -Raw | ConvertFrom-Json } catch { return $null }
}

function Invoke-LocalPrune {
    # Keeps the newest archives and returns the removed directories.
    param([int]$Keep = $localBuildsKeep)
    $archives = Get-LocalBuildArchives
    $removed = @($archives | Select-Object -Skip $Keep)
    foreach ($archive in $removed) {
        Remove-Item -LiteralPath $archive.FullName -Recurse -Force
    }
    return $removed
}

function Remove-LocalStaleRenames {
    # Removes leftover opencode.exe.old-* renames. A running session can hold the
    # old image, so leftovers are returned instead of treated as a failure.
    param([string]$BinDir)
    Get-ChildItem -LiteralPath $BinDir -Filter "opencode.exe.old-*" -File -ErrorAction SilentlyContinue |
        Remove-Item -Force -ErrorAction SilentlyContinue
    return @(Get-ChildItem -LiteralPath $BinDir -Filter "opencode.exe.old-*" -File -ErrorAction SilentlyContinue)
}
