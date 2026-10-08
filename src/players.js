'use strict';
const { spawn, spawnSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

function which(bin, custom) {
  if (custom && fs.existsSync(custom)) return custom;
  const command = process.platform === 'win32' ? 'where.exe' : 'which';
  const r = spawnSync(command, [bin], { encoding: 'utf8', windowsHide: true });
  const p = (r.stdout || '').trim();
  return p.split(/\r?\n/)[0] || null;
}

function detect(settings = {}) {
  return {
    vlc: which('vlc', settings.vlcPath), mpv: which('mpv', settings.mpvPath), ffmpeg: which('ffmpeg', settings.ffmpegPath),
  };
}

/** Launch VLC or mpv on a proxied stream URL. Returns { ok, error? } */
async function openExternal({ engine, url, title, subtitleText, startAt, settings }) {
  const bin = detect(settings)[engine];
  if (!bin) return { ok: false, error: `${engine} was not found. Install it and add it to PATH, or set its full path in Settings.` };
  const args = [];
  let subFile = null;
  if (subtitleText) {
    subFile = path.join(os.tmpdir(), `metrobox-sub-${Date.now()}.${/^\s*WEBVTT/.test(subtitleText) ? 'vtt' : 'srt'}`);
    fs.writeFileSync(subFile, subtitleText);
  }
  if (engine === 'vlc') {
    args.push(url, '--play-and-exit', '--no-video-title-show', `--meta-title=${title}`, '--adaptive-logic=rate', '--network-caching=500');
    if (startAt > 1) args.push(`--start-time=${Math.floor(startAt)}`);
    if (subFile) args.push(`--sub-file=${subFile}`);
  } else {
    args.push(url, `--force-media-title=${title}`, '--keep-open=no');
    if (startAt > 1) args.push(`--start=${Math.floor(startAt)}`);
    if (subFile) args.push(`--sub-file=${subFile}`);
  }
  try {
    const child = spawn(bin, args, { detached: true, stdio: 'ignore', windowsHide: true });
    child.on('exit', () => { if (subFile) fs.unlink(subFile, () => {}); });
    child.unref();
    return await new Promise((resolve) => {
      child.once('error', (e) => { if (subFile) fs.unlink(subFile, () => {}); resolve({ ok: false, error: e.message }); });
      setTimeout(() => resolve({ ok: true }), 400);
    });
  } catch (e) { return { ok: false, error: e.message }; }
}

module.exports = { detect, openExternal };
