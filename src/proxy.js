'use strict';
// Local header-injecting proxy. Stream servers need Cookie/Referer that <video>, dash.js, VLC and ffmpeg
// can't send themselves, so every stream goes through http://127.0.0.1:PORT/<token>/<scheme>/<host>/<path>.
// Absolute URLs inside DASH/HLS manifests are rewritten to point back at the proxy.
const http = require('http');
const crypto = require('crypto');
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

  async _handle(req, res) {
    const cors = {
      'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'Range, Content-Type',
      'Access-Control-Allow-Methods': 'GET, HEAD, OPTIONS',
      'Access-Control-Expose-Headers': 'Content-Length, Content-Range, Accept-Ranges',
    };
    if (req.method === 'OPTIONS') { res.writeHead(204, cors); return res.end(); }
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
