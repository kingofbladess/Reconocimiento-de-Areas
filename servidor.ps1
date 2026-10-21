# Servidor local mínimo para Windows (no necesita instalar nada). Lo usa "Iniciar (Windows).bat".
$ErrorActionPreference = "Stop"
$root = [IO.Path]::GetFullPath((Split-Path -Parent $MyInvocation.MyCommand.Path)).TrimEnd('\') + '\'
$port = 8765
$listener = New-Object System.Net.HttpListener
$listener.Prefixes.Add("http://localhost:$port/")
$listener.Start()
Start-Process "http://localhost:$port/"
Write-Host "Reconocimiento Venezuela abierta en http://localhost:$port/"
Write-Host "Deja esta ventana abierta mientras uses la app. Ciérrala para detenerla."
$types = @{ ".html" = "text/html; charset=utf-8"; ".js" = "text/javascript; charset=utf-8"; ".css" = "text/css; charset=utf-8";
  ".png" = "image/png"; ".webmanifest" = "application/manifest+json"; ".json" = "application/json"; ".md" = "text/plain; charset=utf-8" }
while ($listener.IsListening) {
  $ctx = $listener.GetContext()
  try {
    $rel = [Uri]::UnescapeDataString($ctx.Request.Url.AbsolutePath.TrimStart('/'))
    if ($rel -eq "") { $rel = "index.html" }
    $file = [IO.Path]::GetFullPath((Join-Path $root $rel))
    if ($file.StartsWith($root) -and (Test-Path -LiteralPath $file -PathType Leaf)) {
      $bytes = [IO.File]::ReadAllBytes($file)
      $ext = [IO.Path]::GetExtension($file).ToLower()
      $ctx.Response.ContentType = $(if ($types.ContainsKey($ext)) { $types[$ext] } else { "application/octet-stream" })
      $ctx.Response.OutputStream.Write($bytes, 0, $bytes.Length)
    } else { $ctx.Response.StatusCode = 404 }
  } catch { $ctx.Response.StatusCode = 500 }
  $ctx.Response.Close()
}
