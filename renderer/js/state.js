import { debounce, epKey } from './util.js';

export const DEFAULTS = {
  theme: { mode: 'system', seed: '#6750A4', amoled: false, glass: false, shape: 'standard', font: 'roboto', cardSize: 168, reduceMotion: false, uiScale: 1 },
  home: { hero: true, heroAuto: true, heroSeconds: 9, continueRow: true, listRow: true, startPage: 'home', askProfile: false },
  player: {
    engine: 'builtin', autoplayNext: true, resume: true, quality: 'auto', skip: 10, speed: 1, volume: 0.9, muted: false, keepAwake: true,
    autoFullscreen: false, fallback: 'vlc', hwAccel: true, vlcPath: '', mpvPath: '', ffmpegPath: '',
    subLang: 'English', subAuto: true,
    sub: { size: 100, color: '#ffffff', bg: 0.5, edge: 'shadow', font: 'sans', bottom: 9, offset: 0 },
  },
  downloadDir: '',
  recent: [],
};

const EMOJIS = ['🎬', '🍿', '🦊', '🐼', '🚀', '👾', '🎧', '🌙', '🔥', '🐙'];
const COLORS = ['#7e57c2', '#26a69a', '#ef5350', '#42a5f5', '#ffa726', '#66bb6a', '#ec407a', '#8d6e63'];
export const AVATAR = { EMOJIS, COLORS };

const merge = (base, over) => {
  if (Array.isArray(base) || typeof base !== 'object' || base === null) return over === undefined ? base : over;
  const out = { ...base };
  for (const k of Object.keys(over || {})) out[k] = k in base ? merge(base[k], over[k]) : over[k];
  return out;
};

export const S = { settings: structuredClone(DEFAULTS), data: null, version: '', mock: false, platform: 'linux', defaultDownloadDir: '' };
const listeners = {};
export const on = (ev, fn) => { (listeners[ev] ||= new Set()).add(fn); return () => listeners[ev].delete(fn); };
export const emit = (ev, v) => (listeners[ev] ? [...listeners[ev]].forEach((f) => f(v)) : 0);

export function newProfile(name, i = 0) {
  return { id: `p${Date.now().toString(36)}${Math.floor(Math.random() * 1e4)}`, name, emoji: EMOJIS[i % EMOJIS.length], color: COLORS[i % COLORS.length], mylist: [], progress: {}, history: [] };
}

export async function loadState() {
  const r = await window.mb.load();
  S.version = r.version; S.mock = r.mock; S.platform = r.platform || 'linux'; S.defaultDownloadDir = r.defaultDownloadDir || '';
  S.settings = merge(DEFAULTS, r.settings || {});
  S.data = r.profiles && r.profiles.list && r.profiles.list.length ? r.profiles : { active: null, list: [newProfile('Me')] };
  if (!S.data.list.find((p) => p.id === S.data.active)) S.data.active = S.data.list[0].id;
}

const persistSettings = debounce(() => window.mb.save('settings', S.settings), 300);
const persistData = debounce(() => window.mb.save('profiles', S.data), 500);
export function saveSettings(topic = 'settings') { persistSettings(); emit(topic, S.settings); }
export function saveData(topic = 'data') { persistData(); emit(topic, S.data); }
export function flushNow() { window.mb.save('settings', S.settings); window.mb.save('profiles', S.data); }

export const profile = () => S.data.list.find((p) => p.id === S.data.active);
export function switchProfile(id) { S.data.active = id; saveData('profile'); }
const snap = (i) => ({ id: i.id, title: i.title, poster: i.poster, series: !!i.series, year: i.year || '', rating: i.rating || null, backdrop: i.backdrop || null });

// ---- My List
export const inList = (id) => profile().mylist.some((x) => x.id === id);
export function toggleList(item) {
  const p = profile(); const i = p.mylist.findIndex((x) => x.id === item.id);
  if (i >= 0) p.mylist.splice(i, 1); else p.mylist.unshift(snap(item));
  saveData('list'); return i < 0;
}

// ---- progress / history / continue watching
export const getProgress = (id, se = 0, ep = 0) => profile().progress[epKey(id, se, ep)] || null;
export function setProgress(item, se, ep, pos, dur) {
  const p = profile(); const k = epKey(item.id, se, ep);
  p.progress[k] = { pos, dur, t: Date.now(), se, ep, item: snap(item) };
  const keys = Object.keys(p.progress);
  if (keys.length > 400) keys.sort((a, b) => p.progress[a].t - p.progress[b].t).slice(0, keys.length - 400).forEach((x) => delete p.progress[x]);
  saveData('progress');
}
export function pushHistory(item, se, ep) {
  const p = profile();
  p.history = [{ item: snap(item), se, ep, t: Date.now() }, ...p.history.filter((h) => h.item.id !== item.id)].slice(0, 120);
  saveData('history');
}
/** Latest unfinished entry per title. */
export function continueWatching() {
  const best = new Map();
  for (const e of Object.values(profile().progress)) {
    if (!e.dur || e.pos < 20 || e.pos / e.dur > 0.94) continue;
    const cur = best.get(e.item.id);
    if (!cur || e.t > cur.t) best.set(e.item.id, e);
  }
  return [...best.values()].sort((a, b) => b.t - a.t).slice(0, 20);
}
export function clearProgress(id) { const p = profile(); for (const k of Object.keys(p.progress)) if (k.startsWith(`${id}:`)) delete p.progress[k]; saveData('progress'); }
export function pushRecent(q) { const r = S.settings.recent.filter((x) => x.toLowerCase() !== q.toLowerCase()); r.unshift(q); S.settings.recent = r.slice(0, 10); saveSettings('recent'); }
