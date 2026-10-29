# Lists the installed local build and every archived build, newest first.
# Run from the repository root:
#   bun run local:list

$ErrorActionPreference = "Stop"
. (Join-Path $PSScriptRoot "local-builds.ps1")

$binDir = Join-Path $env:USERPROFILE ".local/bin"
$record = Read-LocalBuildRecord (Join-Path $binDir "opencode-build.json")
if ($null -eq $record) {
    Write-Host "Installed: none (no build record in $binDir)"
} else {
    Write-Host "Installed: $($record.version) from $($record.source.commit.Substring(0, 12)), installed $($record.installedAt)"
}

$archives = Get-LocalBuildArchives
if ($archives.Count -eq 0) {
    Write-Host "Archived builds: none"
    exit 0
}
Write-Host ""
Write-Host "Archived builds, newest first (keeping $localBuildsKeep):"
foreach ($archive in $archives) {
    $archiveRecord = Read-LocalBuildRecord (Join-Path $archive.FullName "opencode-build.json")
    if ($null -eq $archiveRecord) { $version = "no build record" }
    else { $version = "$($archiveRecord.version) from $($archiveRecord.source.commit.Substring(0, 12))" }
    $size = [math]::Round((Get-ChildItem -LiteralPath $archive.FullName -Recurse -File | Measure-Object Length -Sum).Sum / 1MB)
    Write-Host ("  {0}  {1}  {2} MB" -f $archive.Name, $version, $size)
}
