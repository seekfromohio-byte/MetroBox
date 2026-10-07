'use strict';
// MetroBox - Made by JayJoice
const { app, BrowserWindow, ipcMain, protocol, net, dialog, shell, session, Menu, powerSaveBlocker, Notification } = require('electron');
const path = require('path');
const fs = require('fs');
const { pathToFileURL } = require('url');
const { MovieBox } = require('./src/api');
const { StreamProxy } = require('./src/proxy');
const { Store } = require('./src/store');
const { Downloads } = require('./src/downloads');
const players = require('./src/players');

protocol.registerSchemesAsPrivileged([{ scheme: 'app', privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true } }]);

const ROOT = path.join(__dirname, 'renderer');
let win = null; let store; let api; let proxy; let downloads; let blockerId = null;
const wrap = (fn) => async (_e, ...a) => { try { return { ok: true, data: await fn(...a) }; } catch (e) { return { ok: false, error: e && e.message ? e.message : String(e) }; } };

if (!app.requestSingleInstanceLock()) { app.quit(); } else {
  app.on('second-instance', () => { if (win) { if (win.isMinimized()) win.restore(); win.focus(); } });
}

app.commandLine.appendSwitch('autoplay-policy', 'no-user-gesture-required');
// Hardware acceleration can be switched off in Settings (blank/green video on some GPU drivers). Must be decided before ready.
try {
  const early = new Store(path.join(app.getPath('userData'), 'data')).get('settings', {}) || {};
  if (early.player && early.player.hwAccel === false) app.disableHardwareAcceleration();
} catch { /* defaults */ }

function settings() { return (store.get('settings', {}) || {}); }

// ---------- updates (HyperOS-style: check on launch, notify with what's new) ----------
// Host a latest.json next to your deb releases and point UPDATE_URL at it:
//   { "version": "2.0.7", "url": "https://…/metrobox_2.0.7_amd64.deb", "notes": "What's new…" }
const UPDATE_URL = process.env.MB_UPDATE_URL || 'https://raw.githubusercontent.com/JayJoice/MetroBox/main/latest.json';
const cmpVer = (a, b) => {
  const pa = String(a).split('.').map((x) => parseInt(x) || 0); const pb = String(b).split('.').map((x) => parseInt(x) || 0);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) { const d = (pa[i] || 0) - (pb[i] || 0); if (d) return d; }
  return 0;
};
async function checkUpdates(manual) {
  const cur = app.getVersion();
  const r = await fetch(UPDATE_URL, { headers: { 'User-Agent': `MetroBox/${cur}` }, signal: AbortSignal.timeout(15000) });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  const m = await r.json();
  const version = String(m.version || '');
  if (!version) throw new Error('Manifest has no version');
  const found = cmpVer(version, cur) > 0;
  const payload = { found, version, current: cur, url: String(m.url || ''), notes: String(m.notes || '') };
  if (process.env.MB_DEBUG_UPDATES) console.log('[update]', JSON.stringify(payload));
  if (found) {
    if (win && !win.isDestroyed()) win.webContents.send('update:found', payload);
    if (Notification.isSupported()) {
      const first = payload.notes.split('\n').find((l) => l.trim()) || 'Open MetroBox to see what is new.';
      const n = new Notification({ title: `MetroBox ${version} is available`, body: first.slice(0, 180) });
      n.on('click', () => { if (win && !win.isDestroyed()) { win.show(); win.focus(); win.webContents.send('update:found', payload); } });
      n.show();
    }
  }
  return payload;
}

function createWindow() {
  const b = store.get('window', { width: 1320, height: 840 });
  win = new BrowserWindow({
    width: b.width, height: b.height, x: b.x, y: b.y, minWidth: 720, minHeight: 520,
    title: 'MetroBox', backgroundColor: '#141318', autoHideMenuBar: true, show: false,
    icon: path.join(__dirname, 'build', 'icon.png'),
    webPreferences: { preload: path.join(__dirname, 'preload.js'), contextIsolation: true, sandbox: true, spellcheck: false, backgroundThrottling: false },
  });
  if (b.maximized) win.maximize();
  win.once('ready-to-show', () => win.show());
  win.loadURL('app://metrobox/index.html');
  const saveBounds = () => { if (!win || win.isDestroyed() || win.isFullScreen()) return; store.set('window', { ...win.getNormalBounds(), maximized: win.isMaximized() }); };
  win.on('resize', saveBounds); win.on('move', saveBounds);
  win.on('enter-full-screen', () => win.webContents.send('fullscreen', true));
  win.on('leave-full-screen', () => win.webContents.send('fullscreen', false));
  win.webContents.setWindowOpenHandler(({ url }) => { if (/^https?:/.test(url)) shell.openExternal(url); return { action: 'deny' }; });
  win.webContents.on('will-navigate', (e, url) => { if (!url.startsWith('app://')) { e.preventDefault(); if (/^https?:/.test(url)) shell.openExternal(url); } });
  win.on('closed', () => { win = null; });
}

async function decodeText(buf) {
  let t = new TextDecoder('utf-8').decode(buf);
  if ((t.match(/\uFFFD/g) || []).length > 3) t = new TextDecoder('windows-1252').decode(buf);
  return t;
}

app.whenReady().then(async () => {
  Menu.setApplicationMenu(null);
  const data = app.getPath('userData');
  store = new Store(path.join(data, 'data'));
  proxy = new StreamProxy(); await proxy.start();
  api = process.env.MB_MOCK ? new (require('./src/mock').Mock)(proxy) : new MovieBox(path.join(data, 'cache'));
  downloads = new Downloads(store, proxy, settings);
  downloads.on('change', (items) => { if (win && !win.isDestroyed()) win.webContents.send('dl:change', items); });

  protocol.handle('app', (req) => {
    const u = new URL(req.url);
    let rel = decodeURIComponent(u.pathname); if (rel === '/') rel = '/index.html';
    const file = path.normalize(path.join(ROOT, rel));
    if (!file.startsWith(ROOT)) return new Response('forbidden', { status: 403 });
    return net.fetch(pathToFileURL(file).toString());
  });

  const ok = (ch, fn) => ipcMain.handle(ch, wrap(fn));
  ok('load', () => ({ settings: store.get('settings', null), profiles: store.get('profiles', null), version: app.getVersion(), mock: !!process.env.MB_MOCK, platform: process.platform }));
  ok('save', (key, value) => { if (!['settings', 'profiles'].includes(key)) throw new Error('bad key'); store.set(key, value); return true; });
  ok('api:home', (page) => api.home(page));
  ok('api:search', (q, page) => api.search(q, page));
  ok('api:details', (id) => api.details(id));
  ok('api:play', async (id, se, ep) => {
    const opts = await api.playOptions(id, se, ep);
    return opts.map((o) => ({ ...o, src: proxy.urlFor(o.url, o.headers) }));
  });
  ok('api:captions', (id, sid) => api.captions(id, sid));
  ok('api:subtitle', async (url) => {
    const r = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' }, signal: AbortSignal.timeout(20000) });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    return decodeText(Buffer.from(await r.arrayBuffer()));
  });
  ok('player:detect', () => players.detect(settings().player || {}));
  ok('player:open', ({ engine, option, title, subtitleText, startAt }) => players.openExternal({ engine, url: proxy.urlFor(option.url, option.headers), title, subtitleText, startAt, settings: settings().player || {} }).then((r) => { if (!r.ok) throw new Error(r.error); return true; }));
  ok('dl:list', () => downloads.list());
  ok('dl:add', (p) => { const r = downloads.add(p); if (!r.ok) throw new Error(r.error); return r; });
  ok('dl:cancel', (id) => downloads.cancel(id));
  ok('dl:retry', (id) => downloads.retry(id));
  ok('dl:remove', (id, del) => downloads.remove(id, del));
  ok('dl:open-folder', () => shell.openPath(downloads.dir()));
  ok('dl:play-file', (file) => shell.openPath(file));
  ok('dialog:dir', async () => { const r = await dialog.showOpenDialog(win, { properties: ['openDirectory', 'createDirectory'] }); return r.canceled ? null : r.filePaths[0]; });
  ok('data:export', async () => {
    const r = await dialog.showSaveDialog(win, { defaultPath: 'metrobox-backup.json', filters: [{ name: 'JSON', extensions: ['json'] }] });
    if (r.canceled) return false;
    fs.writeFileSync(r.filePath, JSON.stringify({ app: 'MetroBox', settings: store.get('settings'), profiles: store.get('profiles') }, null, 2)); return true;
  });
  ok('data:import', async () => {
    const r = await dialog.showOpenDialog(win, { properties: ['openFile'], filters: [{ name: 'JSON', extensions: ['json'] }] });
    if (r.canceled) return null;
    const j = JSON.parse(fs.readFileSync(r.filePaths[0], 'utf8'));
    if (j.app !== 'MetroBox') throw new Error('Not a MetroBox backup file.');
    return { settings: j.settings, profiles: j.profiles };
  });
  ok('app:clear-cache', async () => { await session.defaultSession.clearCache(); try { fs.rmSync(path.join(app.getPath('userData'), 'cache', 'session.json'), { force: true }); } catch { /* none */ } return true; });
  ok('win:zoom', (f) => { if (win) win.webContents.setZoomFactor(Math.min(2, Math.max(0.6, f))); return true; });
  ok('win:keep-awake', (on) => {
    if (on && blockerId === null) blockerId = powerSaveBlocker.start('prevent-display-sleep');
    if (!on && blockerId !== null) { powerSaveBlocker.stop(blockerId); blockerId = null; }
    return true;
  });
  ok('win:fullscreen', (on) => { if (win) win.setFullScreen(!!on); return true; });
  ok('app:relaunch', () => { store.flushAll(); app.relaunch(); app.exit(0); return true; });
  ok('update:check', () => checkUpdates(true));
  ok('shell:external', (url) => { if (/^https?:\/\//.test(url)) shell.openExternal(url); return true; });

  createWindow();
  setTimeout(() => { checkUpdates(false).catch(() => { /* silent at launch */ }); }, 5000);
  app.on('activate', () => { if (!win) createWindow(); });
});

app.on('before-quit', () => { if (store) store.flushAll(); });
app.on('window-all-closed', () => { app.quit(); });
