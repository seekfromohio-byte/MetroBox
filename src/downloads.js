'use strict';
// Downloads: DASH streams are remuxed with ffmpeg (reading through the local proxy so headers are added);
// plain MP4 streams are fetched directly with resume support.
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { EventEmitter } = require('events');
const { Readable } = require('stream');
const { pipeline } = require('stream/promises');
const { detect } = require('./players');

const safe = (s) => String(s).replace(/[\\/:*?"<>|]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 120) || 'video';
const toSec = (t) => { const m = /(\d+):(\d+):(\d+(?:\.\d+)?)/.exec(t); return m ? (+m[1]) * 3600 + (+m[2]) * 60 + parseFloat(m[3]) : 0; };

class Downloads extends EventEmitter {
  constructor(store, proxy, getSettings, videosDir = path.join(os.homedir(), 'Videos')) {
    super();
    this.store = store; this.proxy = proxy; this.getSettings = getSettings; this.videosDir = videosDir;
    this.items = store.get('downloads', []).map((d) => (d.status === 'running' || d.status === 'queued' ? { ...d, status: 'paused', progress: d.option && d.option.dash ? 0 : d.progress, speed: 0 } : d));
    this.jobs = new Map(); this.queue = [];
  }

  dir() {
    const d = this.getSettings().downloadDir || path.join(this.videosDir, 'MetroBox');
    fs.mkdirSync(d, { recursive: true });
    return d;
  }

  list() { return this.items; }
  _save() { this.store.set('downloads', this.items); this.emit('change', this.items); }

  add({ key, title, poster, option }) {
    if (this.items.find((d) => d.key === key && d.status !== 'error' && d.status !== 'canceled')) return { ok: false, error: 'Already in downloads.' };
    if (option.dash && !detect(this.getSettings()).ffmpeg) return { ok: false, error: 'ffmpeg is required to download this stream. Install it and add it to PATH, or set its full path in Settings.' };
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
    if (item.status === 'canceled' || item.status === 'paused') {
      const suffixes = item.status === 'canceled' || item.option.dash ? ['.part', '.part.mp4'] : [];
      for (const suffix of [...suffixes, ...Array.from({ length: 4 }, (_, i) => `.part.seg${i}`)]) { try { fs.unlinkSync(`${item.file}${suffix}`); } catch { /* file may still be open on Windows */ } }
      this._save(); return this._pump();
    }
    if (err) {
      item.status = 'error'; item.error = String(err.message || err).slice(0, 200);
      if (item.option.dash) { try { fs.unlinkSync(`${item.file}.part.mp4`); } catch { /* none */ } }
    } else { item.status = 'done'; item.progress = 1; item.speed = 0; }
    this._save(); this._pump();
  }

  async _http(item) {
    const ac = new AbortController(); const rangeControllers = new Set();
    this.jobs.set(item.id, { abort: () => { ac.abort(); rangeControllers.forEach((c) => c.abort()); } });
    const part = `${item.file}.part`;
    let have = 0; try { have = fs.statSync(part).size; } catch { /* fresh */ }
    const headers = { ...item.option.headers };
    if (have) {
      const r = await fetch(item.option.url, { headers: { ...headers, Range: `bytes=${have}-` }, signal: ac.signal });
      if (!r.ok && r.status !== 206) throw new Error(`HTTP ${r.status}`);
      let expectedBytes;
      if (r.status === 206) {
        const range = /^bytes (\d+)-(\d+)\/(\d+|\*)$/i.exec(r.headers.get('content-range') || '');
        if (!range || Number(range[1]) !== have || (range[3] !== '*' && Number(range[2]) + 1 !== Number(range[3]))) throw new Error('The server returned an invalid resume range.');
        expectedBytes = Number(range[2]) - have + 1;
      }
      await this._writeHttpResponse(item, r, part, r.status === 200 ? 0 : have, expectedBytes);
      if (ac.signal.aborted) throw new Error('Download stopped.');
      fs.renameSync(part, item.file);
      return;
    }

    const probe = await fetch(item.option.url, { headers: { ...headers, Range: 'bytes=0-0' }, signal: ac.signal });
    if (!probe.ok && probe.status !== 206) throw new Error(`HTTP ${probe.status}`);
    const match = /^bytes 0-0\/(\d+)$/i.exec(probe.headers.get('content-range') || '');
    const total = match ? Number(match[1]) : 0;
    if (probe.status === 206 && total >= 16 * 1024 * 1024) {
      await probe.body?.cancel();
      try { await this._downloadRanges(item, part, total, headers, ac, rangeControllers); }
      catch (e) {
        for (let i = 0; i < 4; i++) { try { fs.unlinkSync(`${part}.seg${i}`); } catch { /* none */ } }
        if (ac.signal.aborted) throw e;
        const full = await fetch(item.option.url, { headers, signal: ac.signal });
        if (full.status !== 200) throw new Error(`HTTP ${full.status}`);
        await this._writeHttpResponse(item, full, part, 0);
      }
    } else if (probe.status === 200) {
      await this._writeHttpResponse(item, probe, part, 0);
    } else {
      await probe.body?.cancel();
      const full = await fetch(item.option.url, { headers, signal: ac.signal });
      if (full.status !== 200) throw new Error(`HTTP ${full.status}`);
      await this._writeHttpResponse(item, full, part, 0);
    }
    if (ac.signal.aborted) throw new Error('Download stopped.');
    fs.renameSync(part, item.file);
  }

  async _writeHttpResponse(item, response, part, have, expectedBytes) {
    const contentRange = /^bytes \d+-\d+\/(\d+)$/i.exec(response.headers.get('content-range') || '');
    const total = contentRange ? Number(contentRange[1]) : have + (Number(response.headers.get('content-length')) || 0);
    item.size = total;
    const out = fs.createWriteStream(part, { flags: have ? 'a' : 'w' });
    let got = have; let last = Date.now(); let lastBytes = got;
    const src = Readable.fromWeb(response.body);
    src.on('data', (chunk) => {
      got += chunk.length;
      const now = Date.now();
      if (now - last >= 700) { item.speed = ((got - lastBytes) / (now - last)) * 1000; last = now; lastBytes = got; item.progress = total ? Math.min(0.999, got / total) : 0; this._save(); }
    });
    await pipeline(src, out);
    if (expectedBytes !== undefined && got - have !== expectedBytes) throw new Error('The resumed download was incomplete.');
  }

  async _downloadRanges(item, part, total, headers, parent, controllers) {
    const count = Math.min(4, Math.max(2, Math.ceil(total / (16 * 1024 * 1024))));
    const size = Math.ceil(total / count); const segments = [];
    for (let i = 0; i < count; i++) {
      const start = i * size; const end = Math.min(total - 1, start + size - 1);
      segments.push({ i, start, end, path: `${part}.seg${i}`, length: 0 });
    }
    let next = 0; let received = 0; let last = Date.now(); let lastBytes = 0;
    item.size = total; item.progress = 0; item.speed = 0; this._save();
    const worker = async () => {
      while (next < segments.length) {
        const segment = segments[next++]; const controller = new AbortController(); controllers.add(controller);
        const stop = () => controller.abort(); parent.signal.addEventListener('abort', stop, { once: true });
        try {
          const response = await fetch(item.option.url, { headers: { ...headers, Range: `bytes=${segment.start}-${segment.end}` }, signal: controller.signal });
          const expectedRange = new RegExp(`^bytes ${segment.start}-${segment.end}/${total}$`, 'i');
          if (response.status !== 206 || !expectedRange.test(response.headers.get('content-range') || '')) throw new Error('The server does not support reliable parallel downloads.');
          const out = fs.createWriteStream(segment.path, { flags: 'w' });
          const src = Readable.fromWeb(response.body);
          src.on('data', (chunk) => {
            segment.length += chunk.length; received += chunk.length;
            const now = Date.now();
            if (now - last >= 700) { item.speed = ((received - lastBytes) / (now - last)) * 1000; last = now; lastBytes = received; item.progress = Math.min(0.999, received / total); this._save(); }
          });
          await pipeline(src, out);
          if (segment.length !== segment.end - segment.start + 1) throw new Error('A parallel download segment was incomplete.');
        } catch (e) {
          controllers.forEach((active) => active.abort());
          throw e;
        } finally { controllers.delete(controller); parent.signal.removeEventListener('abort', stop); }
      }
    };
    try {
      const results = await Promise.allSettled(Array.from({ length: count }, worker));
      const failed = results.find((result) => result.status === 'rejected');
      if (failed) throw failed.reason;
      if (parent.signal.aborted) throw new Error('Download stopped.');
      const out = fs.createWriteStream(part);
      for (const segment of segments) await pipeline(fs.createReadStream(segment.path), out, { end: false });
      await new Promise((resolve, reject) => { out.once('error', reject); out.end(resolve); });
      if (parent.signal.aborted) throw new Error('Download stopped.');
      segments.forEach((segment) => fs.unlinkSync(segment.path));
    } catch (e) {
      controllers.forEach((controller) => controller.abort());
      segments.forEach((segment) => { try { fs.unlinkSync(segment.path); } catch { /* none */ } });
      try { fs.unlinkSync(part); } catch { /* none */ }
      throw e;
    }
  }

  /** Index of the highest-resolution video stream in a DASH manifest (ffprobe), or null. */
  _bestVideo(ffmpegBin, url) {
    return new Promise((resolve) => {
      const probe = path.join(path.dirname(ffmpegBin), process.platform === 'win32' ? 'ffprobe.exe' : 'ffprobe');
      if (!fs.existsSync(probe)) return resolve(null);
      let out = '';
      const p = spawn(probe, ['-v', 'error', '-select_streams', 'v', '-show_entries', 'stream=index,width,height,bit_rate', '-of', 'json', url], { stdio: ['ignore', 'pipe', 'ignore'], windowsHide: true });
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
    if (item.status === 'canceled' || item.status === 'paused') return;
    return new Promise((resolve, reject) => {
      const args = ['-y', '-hide_banner', '-loglevel', 'info', '-i', url, '-map', best === null ? '0:v:0?' : `0:${best}`, '-map', '0:a?', '-c', 'copy', '-movflags', '+faststart', `${item.file}.part.mp4`];
      const p = spawn(bin, args, { stdio: ['ignore', 'ignore', 'pipe'], windowsHide: true });
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
    for (const f of [`${it.file}.part`, `${it.file}.part.mp4`, ...Array.from({ length: 4 }, (_, i) => `${it.file}.part.seg${i}`)]) { try { fs.unlinkSync(f); } catch { /* none */ } }
    this._save();
  }

  pause(id) {
    const it = this.items.find((d) => d.id === id); if (!it || !['running', 'queued'].includes(it.status)) return;
    it.status = 'paused'; it.speed = 0;
    if (it.option.dash) { it.progress = 0; try { fs.unlinkSync(`${it.file}.part.mp4`); } catch { /* none */ } }
    else {
      let partial = 0; try { partial = fs.statSync(`${it.file}.part`).size; } catch { /* segmented download has no resumable file yet */ }
      it.progress = it.size ? Math.min(0.999, partial / it.size) : 0;
    }
    const job = this.jobs.get(id); if (job) job.abort();
    this._save();
  }

  retry(id) {
    const it = this.items.find((d) => d.id === id); if (!it) return;
    it.status = 'queued'; it.error = '';
    if (it.option.dash) { it.progress = 0; it.speed = 0; }
    this._save(); this._pump();
  }

  remove(id, deleteFile) {
    const it = this.items.find((d) => d.id === id); if (!it) return;
    if (it.status === 'running') this.cancel(id);
    if (deleteFile) { try { fs.unlinkSync(it.file); } catch { /* none */ } }
    this.items = this.items.filter((d) => d.id !== id); this._save();
  }
}

module.exports = { Downloads };
