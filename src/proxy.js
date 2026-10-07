'use strict';
// Local header-injecting proxy. Stream servers need Cookie/Referer that <video>, dash.js, VLC and ffmpeg
// can't send themselves, so every stream goes through http://127.0.0.1:PORT/<token>/<scheme>/<host>/<path>.
// Absolute URLs inside DASH/HLS manifests are rewritten to point back at the proxy.
const http = require('http');
const crypto = require('crypto');
const { spawn } = require('child_process');
const { Readable } = require('stream');

const PASS = ['content-type', 'content-length', 'content-range', 'accept-ranges', 'last-modified', 'etag'];

class StreamProxy {
  constructor() { this.sessions = new Map(); this.port = 0; this.server = null; }

  start() {
    return new Promise((resolve, reject) => {
      this.server = http.createServer((req, res) => this._handle(req, res).catch(() => { try { res.destroy(); } catch { /* gone */ } }));
      this.server.on('error', reject);
      this.server.listen(0, '127.0.0.1', () => { this.port = this.server.address().port; resolve(this.port); });
    });
  }

  urlFor(url, headers) {
    const token = crypto.randomBytes(8).toString('base64url');
    this.sessions.set(token, { headers: { ...headers }, at: Date.now() });
    if (this.sessions.size > 200) this.sessions.delete(this.sessions.keys().next().value);
    const u = new URL(url);
    return `http://127.0.0.1:${this.port}/${token}/${u.protocol.replace(':', '')}/${u.host}${u.pathname}${u.search}`;
  }

  // Live HEVC→H.264 transcode of a stream through system ffmpeg, served as fragmented MP4.
  // Reusing a token kills the previous ffmpeg for it, which is how seeking works.
  transcodeUrl(url, headers, ss = 0, token = null) {
    if (!this.transcoders) this.transcoders = new Map();
    if (!token) {
      token = crypto.randomBytes(8).toString('base64url');
      if (this.transcoders.size > 12) {
        const oldest = this.transcoders.keys().next().value;
        this._killTranscoder(oldest); this.transcoders.delete(oldest);
      }
    }
    const prev = this.transcoders.get(token);
    if (prev) { try { prev.child.kill('SIGKILL'); } catch { /* gone */ } }
    this.transcoders.set(token, { url, headers: { ...headers }, ss: Number(ss) || 0, child: null });
    return `http://127.0.0.1:${this.port}/t/${token}/${encodeURIComponent(url)}/${Number(ss) || 0}`;
  }

  _killTranscoder(token) {
    const t = this.transcoders && this.transcoders.get(token);
    if (t && t.child) { try { t.child.kill('SIGKILL'); } catch { /* gone */ } }
  }

  _runTranscoder(req, res, token, url, cors) {
    const t = this.transcoders && this.transcoders.get(token);
    if (!t) { res.writeHead(404, cors); return res.end(); }
    const hdr = Object.entries(t.headers || {}).map(([k, v]) => `${k}: ${v}\r\n`).join('') + '\r\n';
    const child = spawn('ffmpeg', [
      '-hide_banner', '-loglevel', 'error', '-headers', hdr, '-i', url,
      '-map', '0:v:0', '-map', '0:a:0?',
      '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '23', '-maxrate', '4500k', '-bufsize', '9M',
      '-vf', "scale=-2:'min(720,ih)'",
      '-c:a', 'aac', '-ac', '2', '-b:a', '160k',
      '-movflags', '+frag_keyframe+empty_moov+default_base_moof', '-f', 'mp4', 'pipe:1',
    ], { stdio: ['ignore', 'pipe', 'pipe'] });
    t.child = child;
    if (process.env.MB_DEBUG_UPDATES) console.log('[tc] ffmpeg spawned');
    let stderr = '';
    child.stderr.on('data', (d) => { stderr = (stderr + d).slice(-4000); });
    res.on('close', () => { try { child.kill('SIGKILL'); } catch { /* gone */ } });
    let started = false;
    child.stdout.on('data', (chunk) => {
      if (!started) { started = true; if (process.env.MB_DEBUG_UPDATES) console.log('[tc] first bytes out'); res.writeHead(200, { ...cors, 'Content-Type': 'video/mp4', 'Cache-Control': 'no-store' }); }
      res.write(chunk);
    });
    child.on('error', (e) => { if (!res.headersSent) { res.writeHead(500, cors); res.end(); } else res.end(); });
    child.on('exit', (code) => {
      if (process.env.MB_DEBUG_UPDATES) console.log('[tc] ffmpeg exit', code, '|', stderr.split('\n').filter(Boolean).pop() || '(no stderr)');
      if (!started && !res.headersSent) {
        res.writeHead(502, { ...cors, 'Content-Type': 'text/plain' });
        res.end(`ffmpeg exited (${code}) ${stderr.split('\n').filter(Boolean).pop() || ''}`);
      } else res.end();
    });
  }

  async _handle(req, res) {
    const cors = {
      'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'Range, Content-Type',
      'Access-Control-Allow-Methods': 'GET, HEAD, OPTIONS',
      'Access-Control-Expose-Headers': 'Content-Length, Content-Range, Accept-Ranges',
    };
    if (req.method === 'OPTIONS') { res.writeHead(204, cors); return res.end(); }
    const tm = /^\/t\/([^/]+)\/([^/]+)\/(\d+(?:\.\d+)?)$/.exec(req.url.split('?')[0]);
    if (req.method === 'GET' && tm && this.transcoders) {
      if (process.env.MB_DEBUG_UPDATES) console.log('[tc] request for', tm[1], 'ss=' + tm[3], 'known:', !!this.transcoders.get(tm[1]));
      const token = tm[1]; const url = decodeURIComponent(tm[2]); const ss = Number(tm[3]) || 0;
      const t = this.transcoders.get(token);
      if (t) { t.url = url; t.ss = ss; } // the URL path carries the seek target; token holds headers
      return this._runTranscoder(req, res, token, url, cors);
    }
    const m = /^\/([^/]+)\/(https?)\/([^/]+)(\/.*)?$/.exec(req.url);
    const sess = m && this.sessions.get(m[1]);
    if (!sess) { res.writeHead(404, cors); return res.end(); }
    const upstream = `${m[2]}://${m[3]}${m[4] || '/'}`;
    const headers = { ...sess.headers };
    if (req.headers.range) headers.Range = req.headers.range;
    const ac = new AbortController();
    res.on('close', () => ac.abort());
    let r;
    try { r = await fetch(upstream, { method: req.method === 'HEAD' ? 'HEAD' : 'GET', headers, signal: ac.signal, redirect: 'follow' }); } catch {
      res.writeHead(502, cors); return res.end();
    }
    const ctype = r.headers.get('content-type') || '';
    const pathOnly = upstream.split('?')[0];
    const isManifest = req.method === 'GET' && r.ok && (/\.(mpd|m3u8)$/.test(pathOnly) || /dash\+xml|mpegurl/i.test(ctype));
    if (isManifest) {
      const base = `http://127.0.0.1:${this.port}/${m[1]}`;
      const text = (await r.text()).replace(/(https?):\/\/([^/"'<>\s?]+)/g, (_, s, h) => `${base}/${s}/${h}`);
      const body = Buffer.from(text);
      res.writeHead(r.status, { ...cors, 'Content-Type': ctype || 'application/octet-stream', 'Content-Length': body.length });
      return res.end(body);
    }
    const out = { ...cors };
    for (const k of PASS) { const v = r.headers.get(k); if (v) out[k] = v; }
    res.writeHead(r.status, out);
    if (req.method === 'HEAD' || !r.body) return res.end();
    const stream = Readable.fromWeb(r.body);
    stream.on('error', () => res.destroy());
    stream.pipe(res);
  }
}

module.exports = { StreamProxy };
