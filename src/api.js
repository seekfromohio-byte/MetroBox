'use strict';
// MovieBox client - JavaScript port of the provider in mesamirh/MovieBox-Tui
// (request signing, host rotation, home feed / search / details / play-info / captions).
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const HOSTS = [
  'https://api6.aoneroom.com', 'https://api5.aoneroom.com', 'https://api4.aoneroom.com',
  'https://api4sg.aoneroom.com', 'https://api3.aoneroom.com', 'https://api6sg.aoneroom.com',
  'https://api.inmoviebox.com',
];
const RETRY = new Set([403, 406, 407, 429, 500, 502, 503, 504]);
const SECRET = Buffer.from('efa891974eecd3148df63aa611602defd101259ba521022c57ae0566bd8e', 'hex');
const STREAM_REFERER = 'https://sportslive.wine';
const BFF = '/wefeed-mobile-bff';

const md5 = (b) => crypto.createHash('md5').update(b).digest('hex');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const rnd = (a) => a[Math.floor(Math.random() * a.length)];
const hex = (n) => Array.from({ length: n }, () => '0123456789abcdef'[Math.floor(Math.random() * 16)]).join('');
const str = (v) => (v === undefined || v === null || v === '' ? null : String(v));

class ApiError extends Error {}

function clientToken(ts) {
  const s = String(ts);
  return `${s},${md5(Buffer.from([...s].reverse().join('')))}`;
}

function sortedQuery(u) {
  const pairs = [...new URL(u).searchParams.entries()];
  pairs.sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0));
  return pairs.map(([k, v]) => `${k}=${v}`).join('&');
}

function canonical(method, accept, ctype, url, body, ts) {
  const u = new URL(url);
  const q = sortedQuery(url);
  const cu = q ? `${u.pathname}?${q}` : u.pathname;
  let bl = '', bh = '';
  if (body !== null && body !== undefined) {
    const raw = Buffer.from(body);
    bl = String(raw.length);
    bh = md5(raw.subarray(0, 102400));
  }
  return [method.toUpperCase(), accept || '', ctype || '', bl, String(ts), bh, cu].join('\n');
}

function signature(method, url, body, ts) {
  const mac = crypto.createHmac('md5', SECRET)
    .update(canonical(method, 'application/json', 'application/json', url, body, ts)).digest('base64');
  return `${ts}|2|${mac}`;
}

function genIdentity() {
  const [osv, build] = rnd([['9', 'PQ3A.190605.03081104'], ['10', 'QP1A.191005.007.A3'], ['11', 'RP1A.200720.011'],
    ['12', 'S1B.220414.015'], ['13', 'TQ2A.230405.003']]);
  const model = rnd(['23078RKD5C', '2201117TY', '2201117TG', '22101316G', '21121210G', 'M2012K11AG', 'M2007J20CG']);
  const vc = rnd([50020117, 50020118, 50020119, 50020120, 50020121]);
  const ua = `com.community.oneroom/${vc} (Linux; U; Android ${osv}; en_US; ${model}; Build/${build}; Cronet/135.0.7012.3)`;
  const info = JSON.stringify({
    package_name: 'com.community.oneroom', version_name: '4.0.01.0813.03', version_code: vc, os: 'android',
    os_version: osv, install_ch: 'ps', device_id: hex(32), install_store: 'ps',
    gaid: `${hex(8)}-${hex(4)}-${hex(4)}-${hex(4)}-${hex(12)}`, brand: 'Redmi', model, system_language: 'en',
    net: rnd(['NETWORK_WIFI', 'NETWORK_MOBILE']), region: 'US',
    timezone: rnd(['Asia/Kolkata', 'Asia/Shanghai', 'Asia/Tokyo', 'America/New_York', 'Europe/London']),
    sp_code: '40401', 'X-Play-Mode': '2',
  });
  const ip = `${rnd(['103.241', '49.36', '117.195', '106.198', '122.162', '157.32', '182.70', '103.58', '27.60', '59.90'])}`
    + `.${1 + Math.floor(Math.random() * 253)}.${1 + Math.floor(Math.random() * 253)}`;
  return { ua, info, ip };
}

// ---- stream helpers
function isNoticeUrl(url) {
  const u = url.toLowerCase();
  return ['1c7de0bd3393702d9191801f15f88f8d', '9a0461bc39da389663bf3dbb17091d3f', 'b164fbfb4347792950bdfbfb563d39d9',
    '/notice.mp4'].some((x) => u.includes(x)) || (u.includes('macdn.aoneroom.com') && u.includes('/other/'));
}
const toMpd = (u) => {
  const base = u.replace(/\*+$/, '').replace(/\/+$/, '');
  return /^https?:\/\//.test(base) ? `${base}/index.mpd` : null;
};
const b64 = (s) => Buffer.from(s.replace(/-/g, '+').replace(/_/g, '/'), 'base64');

function dashFromPolicy(cookie) {
  for (const part of cookie.split(';')) {
    const t = part.trim();
    const i = t.indexOf('urlprefix=');
    if (i >= 0) {
      try {
        const m = toMpd(b64(t.slice(i + 10).split(':')[0].trim()).toString());
        if (m) return m;
      } catch { /* try next */ }
    }
    if (t.startsWith('CloudFront-Policy=')) {
      try {
        const raw = t.slice('CloudFront-Policy='.length).trim().replace(/_/g, '=').replace(/~/g, '/');
        const m = toMpd(JSON.parse(b64(raw).toString()).Statement[0].Resource);
        if (m) return m;
      } catch { /* try next */ }
    }
  }
  return null;
}

const cleanTitle = (t) => (String(t || '').replace(/\s*\[[^\]]*\]\s*$/, '').trim() || 'Untitled');

function parseSubject(s) {
  const id = str(s.subjectId ?? s.id);
  if (!id) return null;
  const cover = s.cover;
  const poster = (cover && typeof cover === 'object' ? (cover.url || cover.thumbnail) : null)
    || s.coverUrl || s.poster || s.pic || null;
  const y = String(s.releaseDate || s.year || s.releaseInfo || '').match(/(19|20)\d{2}/);
  return {
    id, title: cleanTitle(s.title || s.name), series: Number(s.subjectType ?? s.stype ?? 1) === 2,
    year: y ? y[0] : '', poster, rating: str(s.imdbRatingValue),
    genres: String(s.genre || '').split(',').map((g) => g.trim()).filter(Boolean).slice(0, 4),
  };
}

class MovieBox {
  constructor(cacheDir) {
    this.cacheDir = cacheDir;
    Object.assign(this, genIdentity());
    this.token = null; this.exp = 0; this.hostIdx = 0; this.loginPromise = null;
    try {
      const d = JSON.parse(fs.readFileSync(path.join(cacheDir, 'session.json'), 'utf8'));
      if (d.token && d.exp > Date.now() / 1000 + 60) { this.token = d.token; this.exp = d.exp; }
    } catch { /* no session yet */ }
  }

  _saveSession() {
    try {
      fs.mkdirSync(this.cacheDir, { recursive: true });
      fs.writeFileSync(path.join(this.cacheDir, 'session.json'), JSON.stringify({ token: this.token, exp: this.exp }));
    } catch { /* non-fatal */ }
  }

  _setToken(token) {
    this.token = token;
    try {
      const exp = JSON.parse(b64(token.split('.')[1]).toString()).exp;
      this.exp = exp ? Number(exp) : Date.now() / 1000 + 7 * 86400;
    } catch { this.exp = Date.now() / 1000 + 7 * 86400; }
    this._saveSession();
  }

  async _ensure() {
    if (this.token && this.exp > Date.now() / 1000 + 60) return this.token;
    if (!this.loginPromise) {
      this.loginPromise = (async () => {
        const data = await this._hosts('POST', `${BFF}/user-api/visitor-login`, '{}', null);
        if (!data || !data.token) throw new ApiError('MovieBox did not return a session token');
        this._setToken(data.token);
        return this.token;
      })().finally(() => { this.loginPromise = null; });
    }
    return this.loginPromise;
  }

  _invalidate() {
    this.token = null; this.exp = 0;
    try { fs.unlinkSync(path.join(this.cacheDir, 'session.json')); } catch { /* ignore */ }
  }

  _headers(method, url, body, token) {
    const ts = Date.now();
    const h = {
      'User-Agent': this.ua, Accept: 'application/json', 'Content-Type': 'application/json',
      'x-client-token': clientToken(ts), 'x-tr-signature': signature(method, url, body, ts),
      'x-client-info': this.info, 'x-client-status': '0', 'x-forwarded-for': this.ip,
    };
    if (token) h.Authorization = `Bearer ${token}`;
    return h;
  }

  async _hosts(method, p, body, token) {
    const start = this.hostIdx;
    let backoff = 50;
    for (let i = 0; i < HOSTS.length; i++) {
      if (i) { await sleep(backoff); backoff = 50; }
      const idx = (start + i) % HOSTS.length;
      const url = HOSTS[idx] + p;
      let r;
      try {
        r = await fetch(url, {
          method, headers: this._headers(method, url, body, token),
          body: body === null || body === undefined ? undefined : body, signal: AbortSignal.timeout(12000),
        });
      } catch { this.hostIdx = (idx + 1) % HOSTS.length; continue; }
      const xu = r.headers.get('x-user');
      if (xu) { try { const t = JSON.parse(xu).token; if (t) this._setToken(t); } catch { /* ignore */ } }
      if (RETRY.has(r.status)) {
        this.hostIdx = (idx + 1) % HOSTS.length;
        if (r.status === 429) backoff = Math.min((parseFloat(r.headers.get('retry-after')) || 0.4) * 1000, 3000);
        continue;
      }
      this.hostIdx = idx;
      if (!r.ok) throw new ApiError(`HTTP ${r.status}`);
      let j;
      try { j = await r.json(); } catch { continue; }
      return j && typeof j === 'object' && !Array.isArray(j) && 'data' in j ? j.data : j;
    }
    throw new ApiError('All MovieBox hosts failed');
  }

  async _req(method, p, body = null) {
    const tok = await this._ensure();
    try { return await this._hosts(method, p, body, tok); } catch (e) {
      if (!(e instanceof ApiError)) throw e;
      this._invalidate();
      return this._hosts(method, p, body, await this._ensure());
    }
  }

  // ---- endpoints
  /** Home feed as Netflix-style rows. Returns { hero: [...], rows: [{title, items}] } */
  async home(page = 1, tab = '2') {
    const data = await this._req('GET', `${BFF}/tab-operating?page=${page}&tabId=${tab}&version=`);
    const groups = Array.isArray(data) ? data : (data && data.items) || [];
    const hero = []; const rows = []; const seenHero = new Set();
    for (const g of groups) {
      const bannerSubs = ((g.banner && g.banner.banners) || []).map((b) => ({ s: b.subject, img: (b.image && b.image.url) || b.imageUrl || null }));
      for (const { s, img } of bannerSubs) {
        const it = s && parseSubject(s);
        if (it && !seenHero.has(it.id)) { seenHero.add(it.id); hero.push({ ...it, backdrop: img, description: s.description || s.intro || '' }); }
      }
      const subs = [...((g.customData && g.customData.items) || []).map((c) => c.subject), ...(g.subjects || [])];
      const seen = new Set(); const items = [];
      for (const s of subs) {
        const it = s && typeof s === 'object' ? parseSubject(s) : null;
        if (it && !seen.has(it.id)) { seen.add(it.id); items.push(it); }
      }
      if (items.length >= 3) {
        const t = g.title || g.name || g.opTitle || g.label || g.groupName || g.moduleName || null;
        const kinds = new Set(items.map((i) => i.series));
        rows.push({ title: t ? String(t) : (kinds.size === 1 ? (items[0].series ? 'Series for you' : 'Movies for you') : 'Trending now'), items });
      }
    }
    return { hero, rows };
  }

  async search(query, page = 1) {
    const data = await this._req('POST', `${BFF}/subject-api/search/v2`,
      JSON.stringify({ keyword: query, page, perPage: 20, subjectType: 0 }));
    let subs = data && data.results && data.results[0] ? data.results[0].subjects : null;
    if (!subs && data) subs = data.list;
    return (subs || []).map(parseSubject).filter(Boolean);
  }

  async details(id) {
    const d = await this._req('GET', `${BFF}/subject-api/get?subjectId=${encodeURIComponent(id)}`);
    const s = (d && d.subject) || d || {};
    const info = parseSubject(s) || { id, title: 'Unknown', series: false, year: '', poster: null };
    const dur = s.duration;
    Object.assign(info, {
      description: s.description || s.intro || '', tagline: s.tagline || '',
      genres: Array.isArray(s.genre) ? s.genre.filter((g) => typeof g === 'string')
        : String(s.genre || '').split(',').map((g) => g.trim()).filter(Boolean),
      director: s.director || '', stars: s.stars || '', country: s.countryName || '',
      rating: str(s.imdbRatingValue ?? s.rating),
      duration: typeof dur === 'number' && dur > 0 ? `${Math.floor(dur / 60)}m` : (typeof dur === 'string' && !['', '0', '0m'].includes(dur.trim()) ? dur.trim() : ''),
      dubs: [], seasons: [],
    });
    for (const dub of s.dubs || []) {
      const did = str(dub.subjectId ?? dub.id);
      if (did) info.dubs.push({ id: did, label: dub.lanName || dub.language || dub.title || 'Dub' });
    }
    if (info.series) {
      let si;
      try { si = await this._req('GET', `${BFF}/subject-api/season-info?subjectId=${encodeURIComponent(id)}`); } catch { si = d && d.seasons; }
      const arr = Array.isArray(si) ? si : (si && si.seasons) || [];
      for (const se of arr) {
        const eps = (se.episodeNumbers || []).map(Number).filter(Boolean);
        const list = eps.length ? eps : Array.from({ length: Number(se.maxEp) || 0 }, (_, i) => i + 1);
        info.seasons.push({ number: Number(se.se) || 1, episodes: list });
      }
    }
    return info;
  }

  /** Playable options, best first. Each has headers the stream server requires. */
  async playOptions(id, se = 0, ep = 0) {
    const q = `subjectId=${encodeURIComponent(id)}${se || ep ? `&se=${se}&ep=${ep}` : ''}`;
    const data = await this._req('GET', `${BFF}/subject-api/play-info/v2?${q}`);
    const out = [];
    for (const st of (data && data.streams) || []) {
      const cookie = st.signCookie || '';
      const raw = st.url || '';
      const url = dashFromPolicy(cookie) || (/^https?:/.test(raw) && !isNoticeUrl(raw) ? raw : null);
      if (!url) continue;
      const headers = { Referer: STREAM_REFERER, 'User-Agent': this.ua };
      if (cookie) headers.Cookie = cookie.replace(/;+\s*$/, '').split(';').map((p) => p.trim()).filter(Boolean).join('; ');
      const resStr = String(st.resolutions || data.displayResolutions || '1080');
      const res = [...new Set((resStr.match(/\d+/g) || ['1080']).map(Number))].sort((a, b) => b - a);
      out.push({ label: `${res[0]}p`, height: res[0], url, headers, dash: url.endsWith('.mpd'),
        streamId: str(st.id), codec: st.codecName || st.codec || st.format || '' });
    }
    out.sort((a, b) => b.height - a.height);
    return out;
  }

  async captions(id, streamId) {
    if (!streamId) return [];
    let d;
    try { d = await this._req('GET', `${BFF}/subject-api/get-ext-captions?subjectId=${encodeURIComponent(id)}&resourceId=${encodeURIComponent(streamId)}`); } catch { return []; }
    const seen = new Set(); const out = [];
    for (const c of (d && d.extCaptions) || []) {
      const url = c.url || ''; const size = Number(c.size) || 0;
      if (!url || url.includes('aa348f2541d13ffe') || seen.has(url) || (size > 0 && size <= 50)) continue;
      seen.add(url);
      out.push({ name: c.lanName || c.lan || 'Unknown', url });
    }
    return out;
  }
}

module.exports = { MovieBox, ApiError, STREAM_REFERER, signature, canonical, clientToken, dashFromPolicy };
