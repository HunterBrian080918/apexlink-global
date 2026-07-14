$root = Split-Path -Parent $MyInvocation.MyCommand.Path
$node = "C:\Program Files\nodejs\node.exe"
$serverScript = Join-Path $root "server.js"
$taskName = "AvelixLinkLocalSite"
$startScript = Join-Path $root "start-site.ps1"
$stopScript = Join-Path $root "stop-site.ps1"

if (-not (Test-Path -LiteralPath $node -PathType Leaf)) {
  throw "Node.js not found at $node"
}

$taskCommand = 'set "NODE_ENV=development" && "{0}" "{1}"' -f $node, $serverScript
$taskAction = New-ScheduledTaskAction -Execute "cmd.exe" -Argument ('/c {0}' -f $taskCommand)
$taskTrigger = New-ScheduledTaskTrigger -AtLogOn
$taskSettings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries
$principal = New-ScheduledTaskPrincipal -UserId "SYSTEM" -RunLevel Highest -LogonType ServiceAccount

Register-ScheduledTask `
  -TaskName $taskName `
  -Action $taskAction `
  -Trigger $taskTrigger `
  -Settings $taskSettings `
  -Principal $principal `
  -Force | Out-Null

& powershell.exe -NoProfile -ExecutionPolicy Bypass -File $stopScript
Start-ScheduledTask -TaskName $taskName
Start-Sleep -Seconds 3

Write-Output "Task installed and started: $taskName"
