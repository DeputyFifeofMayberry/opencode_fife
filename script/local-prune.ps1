# Trims the local build archive to the retention limit and removes stale
# renamed executables from .local/bin, without building or installing.
#   bun run local:prune

$ErrorActionPreference = "Stop"
. (Join-Path $PSScriptRoot "local-builds.ps1")

$removed = Invoke-LocalPrune
if ($removed.Count -eq 0) {
    Write-Host "Archive is within the keep-$localBuildsKeep limit."
} else {
    Write-Host "Removed $($removed.Count) archive(s): $($removed.Name -join ', ')"
}

$binDir = Join-Path $env:USERPROFILE ".local/bin"
$leftover = Remove-LocalStaleRenames -BinDir $binDir
if ($leftover.Count -gt 0) {
    Write-Host "$($leftover.Count) previous executable(s) remain in $binDir, held by running sessions: $($leftover.Name -join ', ')"
}
