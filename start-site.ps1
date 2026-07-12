param(
  [int]$Port = 8000
)

$root = Split-Path -Parent $MyInvocation.MyCommand.Path
$pidFile = Join-Path $root ".server.pid"
$logDir = Join-Path $root "logs"
$stdoutLog = Join-Path $logDir "server.out.log"
$stderrLog = Join-Path $logDir "server.err.log"
$stopScript = Join-Path $root "stop-site.ps1"
$nodeCommand = Get-Command node -ErrorAction SilentlyContinue

if (-not $nodeCommand) {
  throw "Node.js was not found on PATH. Install Node.js 20+ and make sure 'node' is available."
}

if (-not (Test-Path -LiteralPath $logDir -PathType Container)) {
  New-Item -ItemType Directory -Path $logDir | Out-Null
}

& powershell.exe -NoProfile -ExecutionPolicy Bypass -File $stopScript

$previousPort = $env:PORT
$previousNodeEnv = $env:NODE_ENV
$env:PORT = [string]$Port
$env:NODE_ENV = "development"
$process = Start-Process `
  -FilePath $nodeCommand.Source `
  -ArgumentList "server.js" `
  -WorkingDirectory $root `
  -RedirectStandardOutput $stdoutLog `
  -RedirectStandardError $stderrLog `
  -WindowStyle Hidden `
  -PassThru
$env:PORT = $previousPort
$env:NODE_ENV = $previousNodeEnv

Start-Sleep -Seconds 3

if (-not $process.HasExited) {
  Set-Content -LiteralPath $pidFile -Value $process.Id -Encoding ASCII
}

Start-Process "http://127.0.0.1:$Port/"
