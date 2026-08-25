$root = $PSScriptRoot
$l = New-Object System.Net.HttpListener
$l.Prefixes.Add('http://localhost:8765/')
$l.Start()
while ($l.IsListening) {
  $c = $l.GetContext()
  $u = $c.Request.Url.LocalPath
  if ($u -eq '/') { $u = '/game.html' }
  $rel = [Uri]::UnescapeDataString($u.TrimStart('/'))
  $f = Join-Path $root $rel
  try { $f = [IO.Path]::GetFullPath($f) } catch { $c.Response.StatusCode=400; $c.Response.Close(); continue }
  if (-not $f.StartsWith($root)) { $c.Response.StatusCode=403; $c.Response.Close(); continue }
  if ([IO.File]::Exists($f)) {
    $ext = [IO.Path]::GetExtension($f).ToLower()
    $ct = 'application/octet-stream'
    if ($ext -eq '.html') { $ct='text/html; charset=utf-8' }
    elseif ($ext -eq '.js')  { $ct='application/javascript; charset=utf-8' }
    elseif ($ext -eq '.css') { $ct='text/css; charset=utf-8' }
    elseif ($ext -eq '.json'){ $ct='application/json; charset=utf-8' }
    $c.Response.ContentType = $ct
    $b = [IO.File]::ReadAllBytes($f)
    $c.Response.ContentLength64 = $b.Length
    $c.Response.OutputStream.Write($b,0,$b.Length)
  } else {
    $c.Response.StatusCode = 404
  }
  $c.Response.Close()
}
