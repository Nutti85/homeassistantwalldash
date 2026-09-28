$ErrorActionPreference = 'Stop'
$task = Get-ScheduledTask -TaskName 'WallDash local preview'
$projectRoot = Split-Path $PSScriptRoot -Parent
if ($task.State -ne 'Running') { throw 'Preview task is not running' }
if ($task.Actions.WorkingDirectory -ne $projectRoot) { throw 'Preview belongs to another worktree' }
if ($task.Settings.ExecutionTimeLimit -ne 'PT0S') { throw 'Preview has a runtime limit' }
if ($task.Settings.RestartCount -lt 1) { throw 'Preview will not restart after failure' }
if (-not ($task.Triggers | Where-Object { $_.Repetition.Interval -eq 'PT1M' })) { throw 'Preview has no periodic recovery trigger' }
if (-not ($task.Triggers | Where-Object { $_.CimClass.CimClassName -eq 'MSFT_TaskLogonTrigger' })) { throw 'Preview has no logon trigger' }
foreach ($url in @('http://127.0.0.1:3000/health', 'http://127.0.0.1:5173/api/states', 'http://127.0.0.1:5173/')) {
    $response = Invoke-WebRequest $url -UseBasicParsing -TimeoutSec 30
    if ($response.StatusCode -ne 200) { throw "$url returned $($response.StatusCode)" }
    Write-Host "$url OK"
}
