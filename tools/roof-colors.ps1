# Dachfarben aus den Luftbildern des Umlands (für die Bautyp-Erkennung in tools/classify-buildings.js).
# Liest data/raw/region/roof-jobs.json (schreibt tools/convert-region.js: je Luftbild die Häuser mit Mittelpunkt und
# Radius in Pixeln), mittelt die Farbe auf jedem Dach und schreibt data/raw/region/roof-colors.json ({ id: [r, g, b] }).
# Node hat keinen JPEG-Leser, deshalb hier mit .NET (System.Drawing, nur Windows). Ohne diese Datei arbeitet die
# Erkennung ohne Dachfarbe weiter.
# Aufruf: powershell -ExecutionPolicy Bypass -File tools/roof-colors.ps1   (danach node tools/convert-region.js erneut)
$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
$raw = Join-Path $root 'data\raw\region'
Add-Type -AssemblyName System.Drawing
Add-Type -ReferencedAssemblies System.Drawing -TypeDefinition @'
using System; using System.Drawing; using System.Drawing.Imaging; using System.Runtime.InteropServices; using System.Text;
public static class RoofSampler {
  // jobs: je Haus id, x, y, r (Pixel); Ergebnis: "id":[r,g,b], (leer bei weißem Bild = außerhalb des Landes)
  public static void Sample(string file, double[] jobs, StringBuilder sb) {
    using (var bmp = new Bitmap(file)) {
      var d = bmp.LockBits(new Rectangle(0, 0, bmp.Width, bmp.Height), ImageLockMode.ReadOnly, PixelFormat.Format24bppRgb);
      var px = new byte[d.Stride * bmp.Height];
      Marshal.Copy(d.Scan0, px, 0, px.Length);
      bmp.UnlockBits(d);
      for (int k = 0; k + 3 < jobs.Length; k += 4) {
        double cx = jobs[k + 1], cy = jobs[k + 2], r = Math.Max(1.0, jobs[k + 3]);
        long R = 0, G = 0, B = 0, n = 0, white = 0;
        for (int y = (int)Math.Floor(cy - r); y <= (int)Math.Ceiling(cy + r); y++) {
          if (y < 0 || y >= bmp.Height) continue;
          for (int x = (int)Math.Floor(cx - r); x <= (int)Math.Ceiling(cx + r); x++) {
            if (x < 0 || x >= bmp.Width || (x - cx) * (x - cx) + (y - cy) * (y - cy) > r * r) continue;
            int o = y * d.Stride + x * 3; int b = px[o], g = px[o + 1], rr = px[o + 2];
            if (rr > 247 && g > 247 && b > 247) { white++; continue; }
            R += rr; G += g; B += b; n++;
          }
        }
        if (n == 0 || white > n) continue;
        sb.Append('"').Append((long)jobs[k]).Append("\":[").Append(R / n).Append(',').Append(G / n).Append(',').Append(B / n).Append("],");
      }
    }
  }
}
'@
$jobs = Get-Content (Join-Path $raw 'roof-jobs.json') -Raw | ConvertFrom-Json
$sb = New-Object System.Text.StringBuilder
[void]$sb.Append('{')
$n = 0
foreach ($p in $jobs.PSObject.Properties) {
  $file = Join-Path $root ('data\region\ortho\' + $p.Name)
  if (-not (Test-Path $file)) { continue }
  [RoofSampler]::Sample($file, [double[]]$p.Value, $sb)
  $n++
  if ($n % 100 -eq 0) { Write-Host "$n Luftbilder" }
}
if ($sb.Length -gt 1) { $sb.Length-- }
[void]$sb.Append('}')
[IO.File]::WriteAllText((Join-Path $raw 'roof-colors.json'), $sb.ToString())
Write-Host "Fertig: $n Luftbilder -> data/raw/region/roof-colors.json"
