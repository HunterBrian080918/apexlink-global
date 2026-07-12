param(
  [int]$Port = 8000
)

$listener = [System.Net.HttpListener]::new()
$listener.Prefixes.Add("http://+:$Port/")
$listener.Start()

$root = Split-Path -Parent $MyInvocation.MyCommand.Path
$contentTypes = @{
  ".css"  = "text/css; charset=utf-8"
  ".html" = "text/html; charset=utf-8"
  ".js"   = "application/javascript; charset=utf-8"
  ".json" = "application/json; charset=utf-8"
  ".png"  = "image/png"
  ".jpg"  = "image/jpeg"
  ".jpeg" = "image/jpeg"
  ".svg"  = "image/svg+xml"
  ".webp" = "image/webp"
}

$ipAddresses = Get-NetIPAddress -AddressFamily IPv4 |
  Where-Object {
    $_.IPAddress -notlike "127.*" -and
    $_.IPAddress -notlike "169.254.*" -and
    $_.PrefixOrigin -ne "WellKnown"
  } |
  Select-Object -ExpandProperty IPAddress -Unique

Write-Host "Serving $root"
Write-Host "Local:   http://127.0.0.1:$Port/"

foreach ($ip in $ipAddresses) {
  Write-Host "Network: http://$ip`:$Port/"
}

try {
  while ($listener.IsListening) {
    $context = $listener.GetContext()
    $requestPath = [System.Uri]::UnescapeDataString($context.Request.Url.AbsolutePath.TrimStart("/"))

    if ([string]::IsNullOrWhiteSpace($requestPath)) {
      $requestPath = "index.html"
    }

    $safePath = $requestPath.Replace("/", "\")
    $fullPath = [System.IO.Path]::GetFullPath((Join-Path $root $safePath))

    if ($fullPath.StartsWith($root, [System.StringComparison]::OrdinalIgnoreCase) -and -not (Test-Path -LiteralPath $fullPath -PathType Leaf)) {
      $extension = [System.IO.Path]::GetExtension($fullPath)

      if ([string]::IsNullOrWhiteSpace($extension)) {
        $htmlCandidate = [System.IO.Path]::GetFullPath("$fullPath.html")
        $indexCandidate = [System.IO.Path]::GetFullPath((Join-Path $fullPath "index.html"))

        if ($htmlCandidate.StartsWith($root, [System.StringComparison]::OrdinalIgnoreCase) -and (Test-Path -LiteralPath $htmlCandidate -PathType Leaf)) {
          $fullPath = $htmlCandidate
        }
        elseif ($indexCandidate.StartsWith($root, [System.StringComparison]::OrdinalIgnoreCase) -and (Test-Path -LiteralPath $indexCandidate -PathType Leaf)) {
          $fullPath = $indexCandidate
        }
      }
    }

    if (-not $fullPath.StartsWith($root, [System.StringComparison]::OrdinalIgnoreCase) -or -not (Test-Path -LiteralPath $fullPath -PathType Leaf)) {
      $context.Response.StatusCode = 404
      $bytes = [System.Text.Encoding]::UTF8.GetBytes("404 Not Found")
      $context.Response.OutputStream.Write($bytes, 0, $bytes.Length)
      $context.Response.Close()
      continue
    }

    $extension = [System.IO.Path]::GetExtension($fullPath).ToLowerInvariant()
    $contentType = $contentTypes[$extension]

    if (-not $contentType) {
      $contentType = "application/octet-stream"
    }

    $bytes = [System.IO.File]::ReadAllBytes($fullPath)
    $context.Response.StatusCode = 200
    $context.Response.ContentType = $contentType
    $context.Response.ContentLength64 = $bytes.Length
    $context.Response.OutputStream.Write($bytes, 0, $bytes.Length)
    $context.Response.Close()
  }
}
finally {
  $listener.Stop()
}
