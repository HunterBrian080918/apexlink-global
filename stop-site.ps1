$root = Split-Path -Parent $MyInvocation.MyCommand.Path
$pidFile = Join-Path $root ".server.pid"

if (Test-Path -LiteralPath $pidFile -PathType Leaf) {
  $serverPid = Get-Content -LiteralPath $pidFile -ErrorAction SilentlyContinue | Select-Object -First 1
  if ($serverPid) {
    Stop-Process -Id ([int]$serverPid) -Force -ErrorAction SilentlyContinue
  }
  Remove-Item -LiteralPath $pidFile -Force -ErrorAction SilentlyContinue
}

Get-CimInstance Win32_Process |
  Where-Object {
    $_.Name -eq "node.exe" -and
    $_.CommandLine -like "*server.js*" -and
    $_.CommandLine -like "*Documents*"
  } |
  ForEach-Object {
    Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue
  }

for ($attempt = 0; $attempt -lt 20; $attempt += 1) {
  $listener = Get-NetTCPConnection -LocalPort 8000 -State Listen -ErrorAction SilentlyContinue
  if (-not $listener) {
    break
  }
  Start-Sleep -Milliseconds 300
}
