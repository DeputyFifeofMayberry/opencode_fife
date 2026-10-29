# Compares the installed local build with the current repository state.
# Run from the repository root:
#   bun run local:status

$ErrorActionPreference = "Stop"
. (Join-Path $PSScriptRoot "local-builds.ps1")

$binDir = Join-Path $env:USERPROFILE ".local/bin"
$record = Read-LocalBuildRecord (Join-Path $binDir "opencode-build.json")
if ($null -eq $record) {
    Write-Host "No installed build record in $binDir. Run 'bun run update:local' to install one."
    exit 0
}

Write-Host "Installed: $($record.version) from $($record.source.commit.Substring(0, 12)), installed $($record.installedAt)"

$head = git rev-parse HEAD
if ($LASTEXITCODE -ne 0) { throw "Run from the repository root with a valid HEAD." }
$installed = $record.source.commit
if ($installed -eq $head) {
    Write-Host "Up to date: the installed build matches dev HEAD."
} else {
    $behind = git rev-list --count "$installed..HEAD"
    if ($LASTEXITCODE -ne 0) {
        Write-Host "The installed commit is not in this repository's history (rewritten or from another checkout)."
    } else {
        Write-Host "dev is $behind commit(s) ahead of the installed build. Update with 'bun run update:local' when the user asks."
    }
}

$status = @(git status --porcelain=v1 --untracked-files=all)
if ($status.Count -gt 0) {
    Write-Host "Repository has $($status.Count) uncommitted change(s); the installer requires a committed tree."
}

$archives = Get-LocalBuildArchives
Write-Host "Archived builds: $($archives.Count) (keeping $localBuildsKeep)"
