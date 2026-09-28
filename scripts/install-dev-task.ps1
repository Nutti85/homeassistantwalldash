$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path $PSScriptRoot -Parent
$taskName = 'WallDash local preview'
$npmPath = (Get-Command npm.cmd).Source
$userId = [System.Security.Principal.WindowsIdentity]::GetCurrent().Name

# Task Scheduler owns the process lifetime, independently of Codex/terminal sessions.
$command = "& '$($npmPath.Replace("'", "''"))' run dev; exit `$LASTEXITCODE"
$action = New-ScheduledTaskAction -Execute 'powershell.exe' -Argument "-NoProfile -NonInteractive -WindowStyle Hidden -Command `"$command`"" -WorkingDirectory $projectRoot
$trigger = New-ScheduledTaskTrigger -AtLogOn -User $userId
$recoveryTrigger = New-ScheduledTaskTrigger -Once -At (Get-Date).AddMinutes(1) -RepetitionInterval (New-TimeSpan -Minutes 1)
$principal = New-ScheduledTaskPrincipal -UserId $userId -LogonType Interactive -RunLevel Limited
$settings = New-ScheduledTaskSettingsSet -ExecutionTimeLimit ([TimeSpan]::Zero) -RestartCount 999 -RestartInterval (New-TimeSpan -Minutes 1) -MultipleInstances IgnoreNew -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -StartWhenAvailable

$existing = Get-ScheduledTask -TaskName $taskName -ErrorAction SilentlyContinue
if ($existing) {
    if ($existing.Actions.WorkingDirectory -ne $projectRoot) {
        throw "Task '$taskName' belongs to another worktree: $($existing.Actions.WorkingDirectory)"
    }
    if ($existing.State -eq 'Running') {
        Write-Host "$taskName is already running at http://127.0.0.1:5173"
        exit 0
    }
}

$listeners = Get-NetTCPConnection -State Listen -ErrorAction SilentlyContinue | Where-Object LocalPort -in 3000, 5173
if ($listeners) {
    throw 'Ports 3000/5173 are occupied. Verify the owning command line and worktree before stopping that dev session, then rerun this installer.'
}

Register-ScheduledTask -TaskName $taskName -Action $action -Trigger @($trigger, $recoveryTrigger) -Principal $principal -Settings $settings -Force | Out-Null
Start-ScheduledTask -TaskName $taskName
Write-Host "Installed $taskName for $projectRoot. Preview: http://127.0.0.1:5173; log: .local-dev.log"
