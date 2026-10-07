'use strict';
// Downloads: DASH streams are remuxed with ffmpeg (reading through the local proxy so headers are added);
// plain MP4 streams are fetched directly with resume support.
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const { EventEmitter } = require('events');
const { Readable } = require('stream');
const { pipeline } = require('stream/promises');
const { detect } = require('./players');

const safe = (s) => String(s).replace(/[\\/:*?"<>|]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 120) || 'video';
const toSec = (t) => { const m = /(\d+):(\d+):(\d+(?:\.\d+)?)/.exec(t); return m ? (+m[1]) * 3600 + (+m[2]) * 60 + parseFloat(m[3]) : 0; };

class Downloads extends EventEmitter {
  constructor(store, proxy, getSettings) {
    super();
    this.store = store; this.proxy = proxy; this.getSettings = getSettings;
    this.items = store.get('downloads', []).map((d) => (d.status === 'running' || d.status === 'queued' ? { ...d, status: 'paused', speed: 0 } : d));
    this.jobs = new Map(); this.queue = [];
  }

  dir() {
    const d = this.getSettings().downloadDir || path.join(require('os').homedir(), 'Videos', 'MetroBox');
    fs.mkdirSync(d, { recursive: true });
    return d;
  }

  list() { return this.items; }
  _save() { this.store.set('downloads', this.items); this.emit('change', this.items); }

  add({ key, title, poster, option }) {
    if (this.items.find((d) => d.key === key && d.status !== 'error' && d.status !== 'canceled')) return { ok: false, error: 'Already in downloads.' };
    if (option.dash && !detect(this.getSettings()).ffmpeg) return { ok: false, error: 'ffmpeg is required to download this stream (sudo apt install ffmpeg).' };
    const file = path.join(this.dir(), `${safe(title)}.mp4`);
    const item = { id: `${Date.now()}${Math.floor(Math.random() * 1000)}`, key, title, poster, file, status: 'queued', progress: 0, size: 0, speed: 0, error: '', option };
    this.items.unshift(item); this._save(); this._pump();
    return { ok: true, id: item.id };
  }

  _pump() {
    const running = this.items.filter((d) => d.status === 'running').length;
    if (running >= 2) return;
    const next = this.items.slice().reverse().find((d) => d.status === 'queued');
    if (!next) return;
    next.status = 'running'; this._save();
    (next.option.dash ? this._ffmpeg(next) : this._http(next)).then(() => this._finish(next), (e) => this._finish(next, e));
    this._pump();
  }

  _finish(item, err) {
    this.jobs.delete(item.id);
    if (item.status === 'canceled' || item.status === 'paused') { this._save(); return this._pump(); }
    if (err) { item.status = 'error'; item.error = String(err.message || err).slice(0, 200); try { fs.unlinkSync(`${item.file}.part`); } catch { /* none */ } } else { item.status = 'done'; item.progress = 1; item.speed = 0; }
    this._save(); this._pump();
  }

  async _http(item) {
    const ac = new AbortController(); this.jobs.set(item.id, { abort: () => ac.abort() });
    const part = `${item.file}.part`;
    let have = 0; try { have = fs.statSync(part).size; } catch { /* fresh */ }
    const headers = { ...item.option.headers, ...(have ? { Range: `bytes=${have}-` } : {}) };
    const r = await fetch(item.option.url, { headers, signal: ac.signal });
    if (!r.ok && r.status !== 206) throw new Error(`HTTP ${r.status}`);
    if (r.status === 200) have = 0;
    const total = have + (Number(r.headers.get('content-length')) || 0);
    item.size = total;
    const out = fs.createWriteStream(part, { flags: have ? 'a' : 'w' });
    let got = have; let last = Date.now(); let lastBytes = got;
    const src = Readable.fromWeb(r.body);
    src.on('data', (c) => {
      got += c.length;
      const now = Date.now();
      if (now - last > 700) { item.speed = ((got - lastBytes) / (now - last)) * 1000; last = now; lastBytes = got; item.progress = total ? got / total : 0; this._save(); }
    });
    await pipeline(src, out);
    fs.renameSync(part, item.file);
  }

  /** Index of the highest-resolution video stream in a DASH manifest (ffprobe), or null. */
  _bestVideo(ffmpegBin, url) {
    return new Promise((resolve) => {
      const probe = path.join(path.dirname(ffmpegBin), 'ffprobe');
      if (!fs.existsSync(probe)) return resolve(null);
      let out = '';
      const p = spawn(probe, ['-v', 'error', '-select_streams', 'v', '-show_entries', 'stream=index,width,height,bit_rate', '-of', 'json', url], { stdio: ['ignore', 'pipe', 'ignore'] });
      const t = setTimeout(() => p.kill('SIGKILL'), 25000);
      p.stdout.on('data', (b) => { out += b; });
      p.on('error', () => { clearTimeout(t); resolve(null); });
      p.on('close', () => {
        clearTimeout(t);
        try {
          const s = JSON.parse(out).streams || [];
          s.sort((a, b) => (b.height || 0) - (a.height || 0) || (Number(b.bit_rate) || 0) - (Number(a.bit_rate) || 0));
          resolve(s.length ? s[0].index : null);
        } catch { resolve(null); }
      });
    });
  }

  async _ffmpeg(item) {
    const bin = detect(this.getSettings()).ffmpeg;
    const url = this.proxy.urlFor(item.option.url, item.option.headers);
    const best = await this._bestVideo(bin, url);
    if (item.status === 'canceled') return;
    return new Promise((resolve, reject) => {
      const args = ['-y', '-hide_banner', '-loglevel', 'info', '-i', url, '-map', best === null ? '0:v:0?' : `0:${best}`, '-map', '0:a?', '-c', 'copy', '-movflags', '+faststart', `${item.file}.part.mp4`];
      const p = spawn(bin, args, { stdio: ['ignore', 'ignore', 'pipe'] });
      this.jobs.set(item.id, { abort: () => p.kill('SIGTERM') });
      let dur = 0; let tail = '';
      p.stderr.on('data', (b) => {
        const s = b.toString(); tail = (tail + s).slice(-600);
        if (!dur) { const d = /Duration:\s*([\d:.]+)/.exec(s); if (d) dur = toSec(d[1]); }
        const t = /time=([\d:.]+)/g; let m; let cur = 0;
        while ((m = t.exec(s))) cur = toSec(m[1]);
        const sp = /speed=\s*([\d.]+)x/.exec(s);
        if (dur && cur) { item.progress = Math.min(0.99, cur / dur); item.speed = sp ? parseFloat(sp[1]) : 0; item.speedUnit = 'x'; this._save(); }
      });
      p.on('error', reject);
      p.on('close', (code) => {
        if (item.status === 'canceled' || item.status === 'paused') return resolve();
        if (code === 0) { try { fs.renameSync(`${item.file}.part.mp4`, item.file); resolve(); } catch (e) { reject(e); } } else reject(new Error(`ffmpeg exited ${code}: ${tail.split('\n').filter(Boolean).pop() || ''}`));
      });
    });
  }

  cancel(id) {
    const it = this.items.find((d) => d.id === id); if (!it) return;
    it.status = 'canceled'; const j = this.jobs.get(id); if (j) j.abort();
    for (const f of [`${it.file}.part`, `${it.file}.part.mp4`]) { try { fs.unlinkSync(f); } catch { /* none */ } }
    this._save();
  }

  retry(id) { const it = this.items.find((d) => d.id === id); if (!it) return; it.status = 'queued'; it.error = ''; it.progress = 0; this._save(); this._pump(); }

  remove(id, deleteFile) {
    const it = this.items.find((d) => d.id === id); if (!it) return;
    if (it.status === 'running') this.cancel(id);
    if (deleteFile) { try { fs.unlinkSync(it.file); } catch { /* none */ } }
    this.items = this.items.filter((d) => d.id !== id); this._save();
  }
}

module.exports = { Downloads };
