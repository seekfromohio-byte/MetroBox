// MetroBox - Made by JayJoice
import { h, $, icon, iconBtn, toast, menu, dialog, debounce } from './util.js';
import { initUpdates } from './update.js';
import { S, loadState, on, profile, switchProfile, saveSettings } from './state.js';
import { applyTheme } from './theme.js';
import { A } from './actions.js';
import { quickPlay, downloadEpisode } from './playflow.js';
import './detail.js';
import './player.js';
import { mountHome } from './home.js';
import { mountBrowse } from './browse.js';
import { mountSearch } from './search.js';
import { mountLibrary } from './library.js';
import { mountDownloads } from './downloads.js';
import { mountSettings } from './settings.js';
import { avatar, showProfilePicker } from './profiles.js';

A.quickPlay = quickPlay;
A.download = downloadEpisode;

const NAV = [['home', 'Home', 'home'], ['movies', 'Movies', 'movie'], ['series', 'Series', 'tv'], ['library', 'Library', 'bookmark'], ['downloads', 'Downloads', 'download']];
let route = null; let view = null; let page = null; let main = null; let searchInput = null; let lastScale = 1; let profBtn = null; let rail = null; let topbar = null;

function build() {
  const root = $('#app'); root.replaceChildren();
  rail = h('nav.rail', { 'aria-label': 'Main' }, h('div.logo', { title: 'MetroBox · Made by JayJoice' }, h('img', { src: 'img/logo-mark.png', alt: '', draggable: false })),
    ...NAV.map(([k, l, ic]) => navItem(k, l, ic)), h('div.spacer'), navItem('settings', 'Settings', 'settings'));
  searchInput = h('input', { type: 'search', placeholder: 'Search movies and series', 'aria-label': 'Search', spellcheck: false,
    oninput: debounce(() => doSearch(false), 450), onkeydown: (e) => { if (e.key === 'Enter') doSearch(true); if (e.key === 'Escape') { searchInput.value = ''; searchInput.blur(); doSearch(true); } } });
  const bar = h('label.searchbar', icon('search'), searchInput, h('span.kbd', '/'));
  profBtn = h('button.icon-btn.sl', { title: 'Profiles', 'aria-label': 'Profiles', style: { width: '44px', height: '44px' }, onclick: () => profileMenu() });
  topbar = h('header.topbar', bar, h('div', { style: { flex: 1 } }), profBtn);
  main = h('main.main', { onscroll: () => topbar.classList.toggle('scrolled', main.scrollTop > 40) }, topbar);
  root.append(h('div.shell', rail, main));
  drawProfBtn();
}
function navItem(k, label, ic) {
  return h('button.nav-item', { dataset: { route: k }, onclick: () => go(k), 'aria-label': label }, h('span.pill.sl', icon(ic, false)), h('span', label));
}
function drawProfBtn() { profBtn.replaceChildren(avatar(profile(), 36)); }
function profileMenu() {
  menu(profBtn, [{ header: 'Switch profile' }, ...S.data.list.map((p) => ({ label: p.name, checked: p.id === S.data.active, onClick: () => { switchProfile(p.id); } })), { divider: true },
    { label: 'Manage profiles', icon: 'person', onClick: () => showProfilePicker({ canClose: true, onPick: () => {} }) }, { label: 'Settings', icon: 'settings', onClick: () => go('settings') }], { align: 'right' });
}

function doSearch(immediate) {
  const q = searchInput.value.trim();
  if (route !== 'search') { if (!q) return; go('search', { q }); return; }
  view.setQuery(q); if (!q && immediate) { /* stays on search idle page */ }
}

export function go(next, opts = {}) {
  if (view && view.destroy) view.destroy();
  if (next.includes(':')) { const [r, sub] = next.split(':'); next = r; opts.sub = sub; }
  route = next; page = h('div.page'); main.querySelectorAll('.page').forEach((p) => p.remove()); main.append(page); main.scrollTop = 0; topbar.classList.remove('scrolled');
  rail.querySelectorAll('.nav-item').forEach((n) => n.classList.toggle('active', n.dataset.route === next));
  if (next === 'home') view = mountHome(page, main);
  else if (next === 'movies') view = mountBrowse(page, 'movie');
  else if (next === 'series') view = mountBrowse(page, 'series');
  else if (next === 'search') { view = mountSearch(page, opts.q || searchInput.value); if (opts.q) searchInput.value = opts.q; }
  else if (next === 'library') view = mountLibrary(page, opts.sub || 'list');
  else if (next === 'downloads') view = mountDownloads(page);
  else if (next === 'settings') view = mountSettings(page, { rerender });
  else view = mountHome(page, main);
  if (next !== 'search') searchInput.value = '';
}
A.go = go;

function rerender(full) { if (full) { applyTheme(S.settings.theme); window.mb.setZoom(S.settings.theme.uiScale); } const r = route || 'home'; build(); route = null; view = null; go(r === 'settings' ? 'settings' : r); }

function shortcuts() {
  const rows = [['/  or  Ctrl+K', 'Focus search'], ['Esc', 'Close dialog / player'], ['?', 'This list'], ['Space', 'Play / pause (in player)'], ['F', 'Fullscreen (in player)'], ['C', 'Subtitles (in player)'], ['N', 'Next episode (in player)']];
  dialog({ title: 'Keyboard shortcuts', body: h('div.shortcuts', rows.flatMap(([k, v]) => [h('span.kbd', k), h('span', v)])), actions: [{ label: 'Close' }] });
}

async function boot() {
  try { await loadState(); } catch (e) { $('#app').textContent = `MetroBox failed to start: ${e.message}`; return; }
  applyTheme(S.settings.theme); lastScale = S.settings.theme.uiScale; if (lastScale !== 1) window.mb.setZoom(lastScale);
  on('theme', () => { applyTheme(S.settings.theme); if (S.settings.theme.uiScale !== lastScale) { lastScale = S.settings.theme.uiScale; window.mb.setZoom(lastScale); } });
  on('profile', () => { drawProfBtn(); if (route) go(route); });
  build();
  const start = S.settings.home.startPage; go(['home', 'movies', 'series', 'library'].includes(start) ? start : 'home');
  if (S.data.list.length > 1 && S.settings.home.askProfile) showProfilePicker({ onPick: () => { drawProfBtn(); go(route); } });
  window.addEventListener('mb-search', (e) => { searchInput.value = e.detail; go('search', { q: e.detail }); if (route === 'search') view.setQuery(e.detail); });
  window.addEventListener('mb-shortcuts', shortcuts);
  window.addEventListener('offline', () => toast('You’re offline.')); window.addEventListener('online', () => toast('Back online.'));
  document.addEventListener('keydown', (e) => {
    const typing = /^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName);
    if (((e.key === '/' && !typing) || (e.key.toLowerCase() === 'k' && e.ctrlKey)) && !$('.player')) { e.preventDefault(); searchInput.focus(); searchInput.select(); }
    else if (e.key === '?' && !typing && !$('.player')) shortcuts();
  });
  window.MB = { go, S }; // handy for debugging / automated tests
  initUpdates();
}
boot();
