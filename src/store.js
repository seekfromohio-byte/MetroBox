'use strict';
const fs = require('fs');
const path = require('path');

/** Tiny JSON store: atomic writes, debounced, one file per key. */
class Store {
  constructor(dir) { this.dir = dir; this.timers = new Map(); this.cache = new Map(); fs.mkdirSync(dir, { recursive: true }); }
  file(key) { return path.join(this.dir, `${key}.json`); }
  get(key, fallback = null) {
    if (this.cache.has(key)) return this.cache.get(key);
    try { const v = JSON.parse(fs.readFileSync(this.file(key), 'utf8')); this.cache.set(key, v); return v; } catch {
      try { const v = JSON.parse(fs.readFileSync(`${this.file(key)}.bak`, 'utf8')); this.cache.set(key, v); return v; } catch { return fallback; }
    }
  }
  set(key, value) {
    this.cache.set(key, value);
    clearTimeout(this.timers.get(key));
    this.timers.set(key, setTimeout(() => this.flush(key), 400));
  }
  flush(key) {
    clearTimeout(this.timers.get(key)); this.timers.delete(key);
    if (!this.cache.has(key)) return;
    const f = this.file(key); const tmp = `${f}.tmp`;
    try {
      fs.writeFileSync(tmp, JSON.stringify(this.cache.get(key)));
      if (fs.existsSync(f)) fs.copyFileSync(f, `${f}.bak`);
      fs.renameSync(tmp, f);
    } catch { /* disk full / permissions: keep running */ }
  }
  flushAll() { for (const k of [...this.timers.keys()]) this.flush(k); }
}
module.exports = { Store };
