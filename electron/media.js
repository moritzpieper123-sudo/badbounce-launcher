/* Now playing (Spotify first, else any player) through the Windows media controls (SMTC).
   No Spotify login: it reads what the Spotify app shows Windows and sends play/pause/next/previous back.
   One hidden PowerShell runs a loop: it prints one JSON line per second, and picks up commands from a small file. */
const { spawn } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const CMD = path.join(os.tmpdir(), 'bb-media-cmd.txt');
let last = null, cover = null, proc = null, onChange = () => {};

const PS = (cmdFile) => `
$ErrorActionPreference = 'SilentlyContinue'
Add-Type -AssemblyName System.Runtime.WindowsRuntime
$asT = ([System.WindowsRuntimeSystemExtensions].GetMethods() | ? { $_.Name -eq 'AsTask' -and $_.GetParameters().Count -eq 1 -and $_.GetParameters()[0].ParameterType.Name -eq 'IAsyncOperation\`1' })[0]
function Await($op, [Type]$t) { $task = $asT.MakeGenericMethod($t).Invoke($null, @($op)); [void]$task.Wait(5000); $task.Result }
[void][Windows.Media.Control.GlobalSystemMediaTransportControlsSessionManager, Windows.Media.Control, ContentType = WindowsRuntime]
[void][Windows.Storage.Streams.IRandomAccessStreamWithContentType, Windows.Storage.Streams, ContentType = WindowsRuntime]
[void][Windows.Storage.Streams.DataReader, Windows.Storage.Streams, ContentType = WindowsRuntime]
$log = Join-Path $env:TEMP 'bb-media-log.txt'
function ReadCover($ref) {
  try {
    $st = Await ($ref.OpenReadAsync()) ([Windows.Storage.Streams.IRandomAccessStreamWithContentType])
    if (-not $st) { Add-Content $log 'cover: open failed'; return $null }
    $size = [uint32]$st.Size
    if ($size -eq 0) { Add-Content $log 'cover: empty'; return $null }
    $rd = New-Object Windows.Storage.Streams.DataReader($st.GetInputStreamAt(0))
    [void](Await ($rd.LoadAsync($size)) ([uint32]))
    $bytes = New-Object byte[] $size; $rd.ReadBytes($bytes); $rd.Dispose()
    $mime = $st.ContentType; if (-not $mime) { $mime = 'image/jpeg' }
    return @{ b64 = [Convert]::ToBase64String($bytes); mime = $mime }
  } catch { Add-Content $log ("cover: " + $_.Exception.Message); return $null }
}
$mgr = Await ([Windows.Media.Control.GlobalSystemMediaTransportControlsSessionManager]::RequestAsync()) ([Windows.Media.Control.GlobalSystemMediaTransportControlsSessionManager])
$cmdFile = '${cmdFile.replace(/'/g, "''")}'
$lastKey = ''; $tries = 0
while ($true) {
  $s = $null
  foreach ($x in $mgr.GetSessions()) { if ($x.SourceAppUserModelId -like '*Spotify*') { $s = $x } }
  if (-not $s) { $s = $mgr.GetCurrentSession() }
  if (Test-Path $cmdFile) {
    $c = (Get-Content $cmdFile -Raw).Trim(); Remove-Item $cmdFile -Force
    if ($s) {
      if ($c -eq 'toggle') { [void](Await ($s.TryTogglePlayPauseAsync()) ([bool])) }
      elseif ($c -eq 'next') { [void](Await ($s.TrySkipNextAsync()) ([bool])) }
      elseif ($c -eq 'prev') { [void](Await ($s.TrySkipPreviousAsync()) ([bool])) }
      elseif ($c -like 'seek:*') { $sec = [double]($c.Substring(5)); [void](Await ($s.TryChangePlaybackPositionAsync([long]($sec * 10000000))) ([bool])) }
      Start-Sleep -Milliseconds 250
    }
  }
  if (-not $s) { [Console]::Out.WriteLine('{"none":true}'); Start-Sleep -Milliseconds 1500; continue }
  $p = Await ($s.TryGetMediaPropertiesAsync()) ([Windows.Media.Control.GlobalSystemMediaTransportControlsSessionMediaProperties])
  $tl = $s.GetTimelineProperties(); $pb = $s.GetPlaybackInfo()
  $o = [ordered]@{ app = $s.SourceAppUserModelId; title = $p.Title; artist = $p.Artist; album = $p.AlbumTitle;
    playing = ($pb.PlaybackStatus -eq 'Playing'); pos = $tl.Position.TotalSeconds; dur = ($tl.EndTime - $tl.StartTime).TotalSeconds;
    at = $tl.LastUpdatedTime.ToUnixTimeMilliseconds() }
  $key = "$($p.Title)|$($p.Artist)"
  if ($key -ne $lastKey) {
    if ($p.Thumbnail) { $cv = ReadCover $p.Thumbnail; if ($cv) { $o.cover = $cv.b64; $o.mime = $cv.mime; $lastKey = $key; $tries = 0 } }
    $tries++; if ($tries -gt 6) { $lastKey = $key; $tries = 0; $o.nocover = $true } # Spotify sets the cover a moment after the song starts
  }
  [Console]::Out.WriteLine(($o | ConvertTo-Json -Compress))
  Start-Sleep -Milliseconds 900
}`;

function start(cb) {
  onChange = cb;
  if (process.env.BB_MEDIA_MOCK) { last = JSON.parse(process.env.BB_MEDIA_MOCK); setTimeout(() => cb(last), 1500); return; } // test hook
  if (process.platform !== 'win32' || proc) return;
  try { fs.unlinkSync(CMD); } catch { /* none */ }
  const enc = Buffer.from(PS(CMD), 'utf16le').toString('base64');
  proc = spawn('powershell.exe', ['-NoProfile', '-NonInteractive', '-WindowStyle', 'Hidden', '-ExecutionPolicy', 'Bypass', '-EncodedCommand', enc], { windowsHide: true });
  let buf = '';
  proc.stdout.on('data', (d) => {
    buf += d.toString();
    const lines = buf.split(/\r?\n/); buf = lines.pop();
    for (const l of lines) {
      if (!l.trim().startsWith('{')) continue;
      try {
        const o = JSON.parse(l);
        if (o.cover) { cover = `data:${o.mime || 'image/jpeg'};base64,${o.cover}`; delete o.cover; delete o.mime; }
        if (o.nocover) { cover = null; delete o.nocover; }
        const next = o.none ? null : { ...o, cover };
        const changed = JSON.stringify(next) !== JSON.stringify(last);
        last = next; if (changed) onChange(last);
      } catch { /* partial line */ }
    }
  });
  proc.on('exit', () => { proc = null; setTimeout(() => start(onChange), 15000); });
}
function command(c) { if (!/^(toggle|next|prev|seek:\d+(\.\d+)?)$/.test(String(c))) return; try { fs.writeFileSync(CMD, String(c)); } catch { /* ignore */ } }
function stop() { try { proc?.kill(); } catch { /* */ } proc = null; }
module.exports = { start, command, stop, status: () => last };
