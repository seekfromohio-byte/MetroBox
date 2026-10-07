'use strict';
const { contextBridge, ipcRenderer } = require('electron');
const call = async (ch, ...a) => {
  const r = await ipcRenderer.invoke(ch, ...a);
  if (!r.ok) throw new Error(r.error);
  return r.data;
};
const on = (ch, cb) => { const f = (_e, v) => cb(v); ipcRenderer.on(ch, f); return () => ipcRenderer.removeListener(ch, f); };
contextBridge.exposeInMainWorld('mb', {
  load: () => call('load'),
  save: (key, value) => call('save', key, value),
  home: (page) => call('api:home', page),
  search: (q, page) => call('api:search', q, page),
  details: (id) => call('api:details', id),
  play: (id, se, ep) => call('api:play', id, se, ep),
  transcode: (o, opts) => call('api:transcode', { url: o.url, headers: o.headers, ss: (opts && opts.ss) || 0 }),
  captions: (id, sid) => call('api:captions', id, sid),
  subtitle: (url) => call('api:subtitle', url),
  detectPlayers: () => call('player:detect'),
  openExternal: (p) => call('player:open', p),
  dl: {
    list: () => call('dl:list'), add: (p) => call('dl:add', p), cancel: (id) => call('dl:cancel', id),
    retry: (id) => call('dl:retry', id), remove: (id, del) => call('dl:remove', id, del),
    openFolder: () => call('dl:open-folder'), playFile: (f) => call('dl:play-file', f),
    onChange: (cb) => on('dl:change', cb),
  },
  pickDir: () => call('dialog:dir'),
  exportData: () => call('data:export'),
  importData: () => call('data:import'),
  clearCache: () => call('app:clear-cache'),
  setZoom: (f) => call('win:zoom', f),
  keepAwake: (on_) => call('win:keep-awake', on_),
  setFullscreen: (on_) => call('win:fullscreen', on_),
  onFullscreen: (cb) => on('fullscreen', cb),
  relaunch: () => call('app:relaunch'),
  checkUpdates: () => call('update:check'),
  onUpdate: (cb) => on('update:found', cb),
  openUrl: (u) => call('shell:external', u),
});
