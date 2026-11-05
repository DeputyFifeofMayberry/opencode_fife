# Restores the most recent agent-system backup and/or archived CLI build.
# Close clients first; running sessions keep their current build until restarted.
#   bun run local:rollback                     # agent system + newest archived build
#   bun run local:rollback -AgentsOnly         # agents, skills, and configuration only
#   bun run local:rollback -BinaryOnly         # CLI only
#   bun run local:rollback -Build 20261028170804581
# Exit codes: 0 restored, 2 no backup for the requested layer, 3 error.

param(
    [switch]$AgentsOnly,
    [switch]$BinaryOnly,
    [string]$Build
)

$ErrorActionPreference = "Stop"
. (Join-Path $PSScriptRoot "local-builds.ps1")

if ($AgentsOnly -and $BinaryOnly) {
    throw "-AgentsOnly and -BinaryOnly together restore nothing. Choose one."
}

$configRoot = if ($env:OPENCODE_CONFIG_DIR) { $env:OPENCODE_CONFIG_DIR } else { Join-Path $env:USERPROFILE ".config/opencode" }
$agentExit = 0
$binaryExit = 0

if (-not $BinaryOnly) {
    & bun script/agent-system/cli.ts rollback --config-root $configRoot
    $agentExit = $LASTEXITCODE
    if ($agentExit -eq 3) { exit 3 }
    if ($agentExit -eq 2) {
        if ($AgentsOnly) { exit 2 }
        Write-Host "No agent-system backup; skipping the agent layer."
    }
}

if (-not $AgentsOnly) {
    $target = Join-Path $env:USERPROFILE ".local/bin/opencode.exe"
    $installedBin = Split-Path $target
    $archives = Get-LocalBuildArchives
    if ($archives.Count -eq 0) {
        if ($BinaryOnly) {
            Write-Host "No archived builds under $(Get-LocalBuildArchiveRoot)."
            exit 2
        }
        Write-Host "No archived builds; the CLI is unchanged."
        $binaryExit = 2
    } else {
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

        Write-Host "Rolling back the CLI to archive $($selected.Name)."
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

        Write-Host "Rolled back the CLI to $($selected.Name). The pre-rollback build is at $old."
        & $target --version
    }
}

if ($agentExit -eq 2 -and $binaryExit -eq 2) { exit 2 }
exit 0
