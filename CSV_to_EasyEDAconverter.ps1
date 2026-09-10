# ============================================================
# CSV_to_EasyEDAconverter.ps1
# Converts a Pick & Place CSV (EasyEDA format) to EasyEDA
# auto-placement assets.
#
# Input : Pick & Place CSV as produced by EasyEDA/ST NUCLEO
#         columns: Designator,Footprint,Mid X,Mid Y,Ref X,Ref Y,
#                  Pad X,Pad Y,Layer,Rotation,Comment
# Output (same OutDir):
#   1) batch_positions_EasyEDAPro.csv : for the official EasyEDA Pro
#      extension "easyeda/eext-batch-place-components"
#      columns: Name,X(mil),Y(mil)
#   2) batch_script_EasyEDAStd.js      : for EasyEDA Standard (web)
#      Scripts API (Run Script code)
#
# Usage in PowerShell:
#   powershell -ExecutionPolicy Bypass -File CSV_to_EasyEDAconverter.ps1 `
#              -InputCsv "path\Pick_Place_for_MB1136.csv"
#              -OutDir   "C:\Users\Administrator\Desktop\NUCLEO_EasyEDA_auto_placement"
# IMPORTANT: This script must be ASCII/ANSI encoded (PowerShell 5.1).
# ============================================================
param(
  [string]$InputCsv = "C:\Users\Administrator\Desktop\103\NUCLEO_STM32F103_mb1136_manufacturing\MB1136C\Gerber\Pick_Place_for_MB1136.csv",
  [string]$OutDir   = "C:\Users\Administrator\Desktop\NUCLEO_EasyEDA_auto_placement"
)
$ErrorActionPreference = 'Stop'
New-Item -ItemType Directory -Force -Path $OutDir | Out-Null

if (-not (Test-Path -LiteralPath $InputCsv)) { throw "CSV not found: $InputCsv" }

$ci = [System.Globalization.CultureInfo]::InvariantCulture
function Get-Number([string]$s) {
  $s = $s.Trim().TrimEnd('mil').TrimEnd('mm').TrimEnd('inch')
  return [double]::Parse($s, $ci)
}

# --- 1) read / clean CSV -----------------------------------------------
$rows = Import-Csv -LiteralPath $InputCsv
$parts = @()
foreach ($r in $rows) {
  $des = ''; if ($null -ne $r.Designator) { $des = ($r.Designator -as [string]).Trim() }
  if (-not $des) { continue }                              # skip empty rows
  if ($des -match '^Designator\d') { continue }            # skip logo/silk markers (Designator1/2/4/22...)
  $mx = $null; if ($r.'Mid X') { $mx = Get-Number ([string]$r.'Mid X') }
  $my = $null; if ($r.'Mid Y') { $my = Get-Number ([string]$r.'Mid Y') }
  $rot = 0;   if ($r.Rotation) { $rot = Get-Number ([string]$r.Rotation) }
  $layer = 'T'; if ($r.Layer) { $layer = ([string]$r.Layer).Trim() }
  if ($null -eq $mx -or $null -eq $my) { continue }
  $parts += [pscustomobject]@{ Designator=$des; MidX=$mx; MidY=$my; Rotation=$rot; Layer=$layer }
}
Write-Host ("Parts: {0}" -f $parts.Count)

# --- 2) EasyEDA Pro extension batch CSV ----------------------------------
$expCsv = Join-Path $OutDir 'batch_positions_EasyEDAPro.csv'
$out = New-Object 'System.Collections.Generic.List[string]'
$out.Add('Name,X(mil),Y(mil)')
foreach ($p in $parts) { $out.Add(("{0},{1},{2}" -f $p.Designator, $p.MidX, $p.MidY)) }
[System.IO.File]::WriteAllLines($expCsv, $out, (New-Object System.Text.UTF8Encoding($false)))

# --- 3) EasyEDA Std script ------------------------------------------------
$js = Join-Path $OutDir 'batch_script_EasyEDAStd.js'
$sb = New-Object System.Text.StringBuilder
[void]$sb.AppendLine('// ============================================================')
[void]$sb.AppendLine('// EasyEDA (Standard / web) auto-placement script  (auto-generated)')
[void]$sb.AppendLine('// Board: NUCLEO STM32F103 MB1136 (positions from Pick&Place CSV)')
[void]$sb.AppendLine('// Uses the official EasyEDA Scripts API.')
[void]$sb.AppendLine('// Docs : https://docs.easyeda.com/en/API/EasyEDA-API/')
[void]$sb.AppendLine('//')
[void]$sb.AppendLine('// [BEFORE YOU RUN]')
[void]$sb.AppendLine('// 1. Open your PCB in EasyEDA (https://easyeda.com/editor).')
[void]$sb.AppendLine('// 2. Have all components (footprints) already placed anywhere on')
[void]$sb.AppendLine('//    the board via netlist import, so Designators exist exactly.')
[void]$sb.AppendLine('// 3. Set the coordinate origin (green cross) at the board base')
[void]$sb.AppendLine('//    point if needed. Default origin is OK to try first.')
[void]$sb.AppendLine('// 4. Top-right settings (gear) > Scripts > Run Script code:')
[void]$sb.AppendLine('//    paste this whole file and press Run.')
[void]$sb.AppendLine('//')
[void]$sb.AppendLine('// [WHAT IT DOES]')
[void]$sb.AppendLine('//   Moves each part in PARTS[] to absolute (MidX(mil), MidY(mil))')
[void]$sb.AppendLine('//   and applies Rotation(deg).')
[void]$sb.AppendLine('//   Rows commented with "// B" are Bottom-side parts: position and')
[void]$sb.AppendLine('//   rotation are set, but you must Flip them to Bottom afterwards')
[void]$sb.AppendLine('//   (select them, then flip; verify X-mirroring manually).')
[void]$sb.AppendLine('// ============================================================')
[void]$sb.AppendLine('')
[void]$sb.AppendLine('var PARTS = [')
foreach ($p in $parts) {
  [void]$sb.AppendLine(('  ["{0}", {1}, {2}, {3}],  // {4}' -f $p.Designator, [string]$p.MidX, [string]$p.MidY, [string]$p.Rotation, $p.Layer))
}
[void]$sb.AppendLine('];')
[void]$sb.AppendLine('')
[void]$sb.AppendLine('function findFootprint(comps, fps, des) {')
[void]$sb.AppendLine('  for (var i = 0; i < comps.length; i++) {')
[void]$sb.AppendLine('    var c = comps[i];')
[void]$sb.AppendLine('    if (c.cppname !== des) continue;')
[void]$sb.AppendLine('    var ids = c.gIds || [];')
[void]$sb.AppendLine('    for (var j = 0; j < ids.length; j++) { if (fps[ids[j]]) return ids[j]; }')
[void]$sb.AppendLine('  }')
[void]$sb.AppendLine('  return null;')
[void]$sb.AppendLine('}')
[void]$sb.AppendLine('')
[void]$sb.AppendLine('function main() {')
[void]$sb.AppendLine("  var src = api('getSource', { type: 'json' });")
[void]$sb.AppendLine('  var root = src.shape || src;')
[void]$sb.AppendLine('  var comps = root.component || [];')
[void]$sb.AppendLine("  var fps = root.FOOTPRINT || root.package || {};")
[void]$sb.AppendLine('  var missed = [];')
[void]$sb.AppendLine('  var done = 0;')
[void]$sb.AppendLine('  for (var k = 0; k < PARTS.length; k++) {')
[void]$sb.AppendLine('    var p = PARTS[k];')
[void]$sb.AppendLine('    var id = findFootprint(comps, fps, p[0]);')
[void]$sb.AppendLine('    if (!id) { missed.push(p[0]); continue; }')
[void]$sb.AppendLine("    api('moveObjsTo', { objs: [id],")
[void]$sb.AppendLine("      x: api('coordConvert', { type: 'real2canvas', x: p[1] + 'mil' }),")
[void]$sb.AppendLine("      y: api('coordConvert', { type: 'real2canvas', y: p[2] + 'mil' }) });")
[void]$sb.AppendLine("    if (p[3]) api('rotate', { ids: [id], degree: p[3] });")
[void]$sb.AppendLine('    done++;')
[void]$sb.AppendLine('  }')
[void]$sb.AppendLine("  var msg = 'Auto placement done: ' + done + ' / ' + PARTS.length +")
[void]$sb.AppendLine("            '\nNot found: ' + (missed.length ? missed.join(', ') : 'none');")
[void]$sb.AppendLine("  if (typeof alert === 'function') { alert(msg); } else { console.log(msg); }")
[void]$sb.AppendLine('}')
[void]$sb.AppendLine('')
[void]$sb.AppendLine('main();')
[System.IO.File]::WriteAllText($js, $sb.ToString(), (New-Object System.Text.UTF8Encoding($false)))

Write-Host "Generated:"
Write-Host "  - $expCsv"
Write-Host "  - $js"