$ErrorActionPreference = "Stop"
$repo = "Y:\CodingProjects\opencode_fife"
$base = "C:\Windows\Temp\opencode\as-scenarios"
if (Test-Path $base) { Remove-Item -Recurse -Force $base }
New-Item -ItemType Directory -Path $base | Out-Null

$script:pass = 0
$script:fail = 0
function Check([bool]$condition, [string]$message) {
    if ($condition) { Write-Output "PASS $message"; $script:pass++ }
    else { Write-Output "FAIL $message"; $script:fail++ }
}
function New-Root([string]$name) {
    $path = Join-Path $base $name
    New-Item -ItemType Directory -Path $path -Force | Out-Null
    return $path
}
function Get-Sha([string]$path) {
    $bytes = [IO.File]::ReadAllBytes($path)
    $sha = [Security.Cryptography.SHA256]::Create()
    try { return [BitConverter]::ToString($sha.ComputeHash($bytes)).Replace("-", "").ToLowerInvariant() }
    finally { $sha.Dispose() }
}
function Get-LfSha([string]$path) {
    $text = [IO.File]::ReadAllText($path).Replace("`r`n", "`n")
    $sha = [Security.Cryptography.SHA256]::Create()
    try { return [BitConverter]::ToString($sha.ComputeHash([Text.Encoding]::UTF8.GetBytes($text))).Replace("-", "").ToLowerInvariant() }
    finally { $sha.Dispose() }
}
function Run-Install([string]$root, [string[]]$extra = @()) {
    $args = @("script/agent-system/cli.ts", "install", "--config-root", $root, "--skip-runtime-verify") + $extra
    $previous = $ErrorActionPreference
    $ErrorActionPreference = "Continue"
    $out = & bun @args 2>&1
    $code = $LASTEXITCODE
    $ErrorActionPreference = $previous
    return @{ code = $code; output = ($out -join "`n") }
}
function Run-Status([string]$root, [string[]]$extra = @()) {
    $args = @("script/agent-system/cli.ts", "status", "--config-root", $root) + $extra
    $previous = $ErrorActionPreference
    $ErrorActionPreference = "Continue"
    $out = & bun @args 2>&1
    $code = $LASTEXITCODE
    $ErrorActionPreference = $previous
    return @{ code = $code; output = ($out -join "`n") }
}
function Run-Rollback([string]$root) {
    $previous = $ErrorActionPreference
    $ErrorActionPreference = "Continue"
    $out = & bun script/agent-system/cli.ts rollback --config-root $root 2>&1
    $code = $LASTEXITCODE
    $ErrorActionPreference = $previous
    return @{ code = $code; output = ($out -join "`n") }
}
function Read-Json([string]$path) { return Get-Content $path -Raw | ConvertFrom-Json }
function Backup-Dirs([string]$root) {
    $p = Join-Path $root "backups/agent-system"
    if (-not (Test-Path $p)) { return @() }
    return @(Get-ChildItem $p -Directory | Sort-Object Name)
}

Write-Output "=== AC-06 idempotence ==="
$root = New-Root "ac06"
$first = Run-Install $root
Check ($first.code -eq 0) "AC-06 first install exits 0"
$before = (Backup-Dirs $root).Count
$hashesBefore = @{}
Get-ChildItem (Join-Path $root "agents"), (Join-Path $root "skills") -Recurse -File | ForEach-Object { $hashesBefore[$_.FullName] = Get-LfSha $_.FullName }
$second = Run-Install $root
Check ($second.code -eq 0) "AC-06 second install exits 0"
Check ($second.output -match "in sync") "AC-06 second install reports in sync"
Check ((Backup-Dirs $root).Count -eq $before) "AC-06 second install creates no new backup ($before)"
$changed = 0
Get-ChildItem (Join-Path $root "agents"), (Join-Path $root "skills") -Recurse -File | ForEach-Object {
    if ($hashesBefore[$_.FullName] -ne (Get-LfSha $_.FullName)) { $changed++ }
}
Check ($changed -eq 0) "AC-06 no managed file hash changed"

Write-Output "=== AC-07 local modification and unmanaged preservation ==="
$root = New-Root "ac07"
$null = Run-Install $root
$target = Join-Path $root "agents/spec-writer.md"
$original = [IO.File]::ReadAllText($target)
[IO.File]::WriteAllText($target, $original + "`nLOCAL-EDIT-MARKER`n")
$refused = Run-Install $root
Check ($refused.code -ne 0) "AC-07 edited managed file refused without -Force"
Check ($refused.output -match "spec-writer\.md") "AC-07 refusal names the file"
Check ([IO.File]::ReadAllText($target).Contains("LOCAL-EDIT-MARKER")) "AC-07 refused file left unchanged"
$forced = Run-Install $root @("--force")
Check ($forced.code -eq 0) "AC-07 -Force exits 0"
Check (-not [IO.File]::ReadAllText($target).Contains("LOCAL-EDIT-MARKER")) "AC-07 -Force replaces the file"
$backup = (Backup-Dirs $root)[-1]
$backupFile = Join-Path $backup.FullName "files/agents/spec-writer.md"
Check (Test-Path $backupFile) "AC-07 -Force backs up the edited file"
Check ([IO.File]::ReadAllText($backupFile).Contains("LOCAL-EDIT-MARKER")) "AC-07 backup contains the edited content"
$customAgent = Join-Path $root "agents/custom.md"
$customSkill = Join-Path $root "skills/custom-skill/SKILL.md"
[IO.File]::WriteAllText($customAgent, "custom agent`n")
New-Item -ItemType Directory -Path (Split-Path $customSkill) -Force | Out-Null
[IO.File]::WriteAllText($customSkill, "custom skill`n")
$afterCustom = Run-Install $root
Check ($afterCustom.code -eq 0) "AC-07 install with unmanaged files exits 0"
Check ($afterCustom.output -match "Unmanaged files preserved") "AC-07 reports unmanaged files"
Check ((Test-Path $customAgent) -and (Test-Path $customSkill)) "AC-07 unmanaged files survive"

Write-Output "=== AC-07 pre-existing stale file with no installed manifest ==="
$root = New-Root "ac07stale"
$stale = Join-Path $root "agents/spec-writer.md"
New-Item -ItemType Directory -Path (Split-Path $stale) -Force | Out-Null
[IO.File]::WriteAllText($stale, "stale role`n")
$staleResult = Run-Install $root
Check ($staleResult.code -eq 0) "AC-07 stale pre-existing install exits 0"
$backup = (Backup-Dirs $root)[-1]
$backupFile = Join-Path $backup.FullName "files/agents/spec-writer.md"
Check (Test-Path $backupFile) "AC-07 stale file copied into backup"
Check ([IO.File]::ReadAllText($backupFile) -eq "stale role`n") "AC-07 stale backup content matches"
$backupJson = Read-Json (Join-Path $backup.FullName "backup.json")
$entry = $backupJson.files | Where-Object { $_.path -eq "agents/spec-writer.md" }
Check ($entry.existed -eq $true) "AC-07 backup records the file existed"

$root = New-Root "ac07collision"
$null = Run-Install $root
$installedCollision = Read-Json (Join-Path $root "agent-system.installed.json")
$installedCollision.files = @($installedCollision.files | Where-Object { $_.target -ne "agents/spec-writer.md" })
[IO.File]::WriteAllText((Join-Path $root "agent-system.installed.json"), ($installedCollision | ConvertTo-Json -Depth 10))
[IO.File]::WriteAllText((Join-Path $root "agents/spec-writer.md"), "collision`n")
$collision = Run-Install $root
Check ($collision.code -ne 0) "AC-07 unmanaged collision refused without -Force"
Check ($collision.output -match "unmanaged file collides") "AC-07 collision reported as unmanaged"
$forcedCollision = Run-Install $root @("--force")
Check ($forcedCollision.code -eq 0) "AC-07 -Force replaces the unmanaged collision"
Check (-not [IO.File]::ReadAllText((Join-Path $root "agents/spec-writer.md")).Contains("collision")) "AC-07 collision replaced with managed content"

Write-Output "=== AC-08 config merge ==="
$root = New-Root "ac08"
$opencode = @{
    update = "disable"
    provider = @{ example = @{ apiKey = "test-value" } }
    plugins = @("other-plugin")
    effort_policy = @{ mode = "frozen"; agent_operations = @{ fast = "old" } }
} | ConvertTo-Json -Depth 8
[IO.File]::WriteAllText((Join-Path $root "opencode.json"), $opencode)
$router = @"
{
  // user comment
  "activePreset": "custom",
  "presets": {
    "custom": { "fast": { "model": "x" } },
    "fife": { "fast": { "model": "old" } }
  },
  "other": true
}
"@
[IO.File]::WriteAllText((Join-Path $root "opencode-model-router.overrides.jsonc"), $router)
$merged = Run-Install $root
Check ($merged.code -eq 0) "AC-08 install with existing config exits 0"
$oc = Read-Json (Join-Path $root "opencode.json")
Check ($oc.update -eq "disable") "AC-08 opencode.json update key preserved"
Check ($oc.provider.example.apiKey -eq "test-value") "AC-08 provider block preserved"
Check ($oc.plugins -contains "other-plugin") "AC-08 unrelated plugin preserved"
Check ($oc.plugins -contains "opencode-model-router@2.9.1") "AC-08 exact plugin pin added"
Check ($oc.effort_policy.mode -eq "frozen") "AC-08 unrelated effort_policy key preserved"
$canonical = Read-Json (Join-Path $repo "agent-system/config/opencode.fragment.json")
Check (($oc.effort_policy.agent_operations | ConvertTo-Json -Compress) -eq ($canonical.effort_policy.agent_operations | ConvertTo-Json -Compress)) "AC-08 agent_operations canonical"
$rt = Read-Json (Join-Path $root "opencode-model-router.overrides.jsonc")
Check ($rt.activePreset -eq "custom") "AC-08 active preset preserved"
Check ($rt.presets.custom.fast.model -eq "x") "AC-08 other preset preserved"
Check ($rt.other -eq $true) "AC-08 unrelated router key preserved"
$canonicalRouterText = (Get-Content (Join-Path $repo "agent-system/config/model-router.overrides.jsonc") -Raw) -replace '(?m)^\s*//.*$', ''
$canonicalRouter = $canonicalRouterText | ConvertFrom-Json
Check (($rt.presets.fife | ConvertTo-Json -Compress) -eq ($canonicalRouter.presets.fife | ConvertTo-Json -Compress)) "AC-08 presets.fife canonical"
Check ($merged.output -match "comments were normalized") "AC-08 reports comment normalization"
$backup = (Backup-Dirs $root)[-1]
Check ([IO.File]::ReadAllText((Join-Path $backup.FullName "files/opencode-model-router.overrides.jsonc")).Contains("// user comment")) "AC-08 backup preserves original comments"

Write-Output "=== AC-08 malformed config refusal ==="
$root = New-Root "ac08bad"
[IO.File]::WriteAllText((Join-Path $root "opencode.json"), "{ not json`n")
$bad = Run-Install $root
Check ($bad.code -ne 0) "AC-08 malformed opencode.json refused"
Check ($bad.output -match "Cannot parse") "AC-08 parse error reported"
$backup = (Backup-Dirs $root)[-1]
Check (Test-Path (Join-Path $backup.FullName "files/opencode.json")) "AC-08 malformed file backed up"
Check ([IO.File]::ReadAllText((Join-Path $backup.FullName "files/opencode.json")) -eq "{ not json`n") "AC-08 malformed backup content matches"
Check (-not (Test-Path (Join-Path $root "agents/spec-writer.md"))) "AC-08 refusal writes no managed files"

$root = New-Root "ac08badrouter"
[IO.File]::WriteAllText((Join-Path $root "opencode-model-router.overrides.jsonc"), "{ not json`n")
$badRouter = Run-Install $root
Check ($badRouter.code -ne 0) "AC-08 malformed router overrides refused"
$backup = (Backup-Dirs $root)[-1]
Check (Test-Path (Join-Path $backup.FullName "files/opencode-model-router.overrides.jsonc")) "AC-08 malformed router backed up"

Write-Output "=== AC-09 permission gate ==="
$root = New-Root "ac09"
[IO.File]::WriteAllText((Join-Path $root "cli.json"), (@{ session = @{ permissions = "autoaccept"; tps = $true }; other = 1 } | ConvertTo-Json -Depth 5))
$gate = Run-Install $root
Check ($gate.code -eq 0) "AC-09 autoaccept install exits 0"
$cli = Read-Json (Join-Path $root "cli.json")
Check ($cli.session.permissions -eq "prompt") "AC-09 autoaccept changed to prompt"
Check ($cli.session.tps -eq $true) "AC-09 unrelated cli.json key preserved"
Check ($cli.other -eq 1) "AC-09 unrelated top-level cli.json key preserved"
$installed = Read-Json (Join-Path $root "agent-system.installed.json")
Check ($installed.permissionMode -eq "prompt") "AC-09 installed manifest records prompt"
$backup = (Backup-Dirs $root)[-1]
$backupCli = Read-Json (Join-Path $backup.FullName "files/cli.json")
Check ($backupCli.session.permissions -eq "autoaccept") "AC-09 backup preserves autoaccept"
Check ($gate.output -match "Permission mode: prompt") "AC-09 install reports prompt mode"

$root = New-Root "ac09keep"
[IO.File]::WriteAllText((Join-Path $root "cli.json"), (@{ session = @{ permissions = "autoaccept" } } | ConvertTo-Json -Depth 5))
$env:OPENCODE_AGENT_SYSTEM_SKIP_RUNTIME_VERIFY = "1"
$previous = $ErrorActionPreference
$ErrorActionPreference = "Continue"
$keep = & powershell.exe -NoProfile -ExecutionPolicy Bypass -File script/install-local.ps1 -AgentsOnly -ConfigRoot $root -KeepAutoAccept 2>&1
$keepCode = $LASTEXITCODE
$ErrorActionPreference = $previous
$env:OPENCODE_AGENT_SYSTEM_SKIP_RUNTIME_VERIFY = $null
Check ($keepCode -eq 0) "AC-09 -KeepAutoAccept exits 0"
Check (($keep -join "`n") -match "suppresses ask prompts") "AC-09 -KeepAutoAccept warns that ask gates are suppressed"
$cli = Read-Json (Join-Path $root "cli.json")
Check ($cli.session.permissions -eq "autoaccept") "AC-09 -KeepAutoAccept keeps autoaccept"
$installed = Read-Json (Join-Path $root "agent-system.installed.json")
Check ($installed.permissionMode -eq "autoaccept") "AC-09 -KeepAutoAccept records autoaccept mode"
Check ($installed.keepAutoAccept -eq $true) "AC-09 -KeepAutoAccept records the opt-out"

Write-Output "=== AC-10 status exit codes ==="
$root = New-Root "ac10"
$null = Run-Install $root
$inSync = Run-Status $root @("--json")
Check ($inSync.code -eq 0) "AC-10 clean install status exits 0"
$report = $inSync.output | ConvertFrom-Json
Check ($report.installed -eq $true) "AC-10 status reports installed"
Check ($report.agentSystemVersion -eq "2.0.0") "AC-10 status reports agent-system version"
Check ($report.roleContentVersion -eq "1.1.1") "AC-10 status reports role-content version"
Check ($report.files.total -eq 54 -and $report.files.inSync -eq 54) "AC-10 status reports 54/54 in sync"
Check ($null -ne $report.cli) "AC-10 status reports CLI record"
[IO.File]::WriteAllText((Join-Path $root "agents/spec-writer.md"), "edited`n")
$drift = Run-Status $root @("--json")
Check ($drift.code -eq 1) "AC-10 edited managed file status exits 1"
$report = $drift.output | ConvertFrom-Json
Check ($report.files.drifted -contains "agents/spec-writer.md") "AC-10 status reports the drifted file"
Remove-Item (Join-Path $root "agent-system.installed.json")
$missing = Run-Status $root @("--json")
Check ($missing.code -eq 2) "AC-10 missing installed manifest exits 2"
$report = $missing.output | ConvertFrom-Json
Check ($report.installed -eq $false) "AC-10 missing manifest reports not installed"
[IO.File]::WriteAllText((Join-Path $root "agent-system.installed.json"), "{ broken`n")
$broken = Run-Status $root @("--json")
Check ($broken.code -eq 2) "AC-10 unreadable installed manifest exits 2"
$report = $broken.output | ConvertFrom-Json
Check ($report.errors.Count -gt 0) "AC-10 unreadable manifest reports an error"
$tempRepo = New-Root "ac10repo"
New-Item -ItemType Directory -Path (Join-Path $tempRepo "agent-system") -Force | Out-Null
[IO.File]::WriteAllText((Join-Path $tempRepo "agent-system/manifest.json"), "{ broken`n")
[IO.File]::WriteAllText((Join-Path $tempRepo "agent-system/manifest.schema.json"), "{}`n")
$root = New-Root "ac10error"
$null = Run-Install $root
$errorStatus = Run-Status $root @("--json", "--repo-root", $tempRepo)
Check ($errorStatus.code -eq 3) "AC-10 internal error exits 3"
$report = $errorStatus.output | ConvertFrom-Json
Check ($report.errors.Count -gt 0) "AC-10 internal error reported"

Write-Output "=== AC-11 rollback ==="
$root = New-Root "ac11"
$stale = Join-Path $root "agents/spec-writer.md"
New-Item -ItemType Directory -Path (Split-Path $stale) -Force | Out-Null
[IO.File]::WriteAllText($stale, "pre-install role`n")
$opencodeBefore = "{`n  `"custom`": true`n}`n"
[IO.File]::WriteAllText((Join-Path $root "opencode.json"), $opencodeBefore)
$null = Run-Install $root
$custom = Join-Path $root "agents/custom.md"
[IO.File]::WriteAllText($custom, "created after backup`n")
$rollback = Run-Rollback $root
Check ($rollback.code -eq 0) "AC-11 rollback exits 0"
Check ([IO.File]::ReadAllText($stale) -eq "pre-install role`n") "AC-11 restores the pre-existing agent byte-for-byte"
Check ([IO.File]::ReadAllText((Join-Path $root "opencode.json")) -eq $opencodeBefore) "AC-11 restores the pre-existing configuration byte-for-byte"
Check (-not (Test-Path (Join-Path $root "agents/implementer.md"))) "AC-11 removes install-created managed files"
Check (Test-Path $custom) "AC-11 preserves a file created after the backup"
Check ($rollback.output -match "custom\.md") "AC-11 reports the preserved file"
Check (-not (Test-Path (Join-Path $root "agent-system.installed.json"))) "AC-11 removes the install-created manifest"

$root = New-Root "ac11no"
$noBackup = Run-Rollback $root
Check ($noBackup.code -eq 2) "AC-11 no backup exits 2"
Check ($noBackup.output -match "No agent-system backup") "AC-11 no backup message is clear"

$root = New-Root "ac11restore"
$null = Run-Install $root
$installedV1 = Get-Sha (Join-Path $root "agent-system.installed.json")
[IO.File]::WriteAllText((Join-Path $root "agents/spec-writer.md"), "edited for v2`n")
$null = Run-Install $root @("--force")
$rollback2 = Run-Rollback $root
Check ($rollback2.code -eq 0) "AC-11 rollback after force install exits 0"
Check ((Get-Sha (Join-Path $root "agent-system.installed.json")) -eq $installedV1) "AC-11 restores the previous installed manifest byte-for-byte"
$status = Run-Status $root @("--json")
$report = $status.output | ConvertFrom-Json
Check ($report.agentSystemVersion -eq "2.0.0" -and $report.roleContentVersion -eq "1.1.1") "AC-11 status reports the restored versions"

Write-Output ""
Write-Output "SUMMARY: $script:pass passed, $script:fail failed"
if ($script:fail -gt 0) { exit 1 }
exit 0
