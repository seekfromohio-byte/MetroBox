import { h, icon, iconBtn, btn, img, fmtBytes, toast, confirmDialog } from './util.js';
import { emptyState } from './components.js';

export function mountDownloads(page) {
  const list = h('div'); let items = [];
  page.append(h('div', { style: { display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '20px' } }, h('h1.t-headline.page-title', { style: { flex: 1, margin: 0 } }, 'Downloads'), btn('Open folder', 'tonal', () => window.mb.dl.openFolder(), 'folder_open')), list);
  const draw = () => {
    list.replaceChildren(...(items.length ? items.map(card) : [emptyState('download', 'No downloads yet', 'Use the download button on a movie or episode. DASH streams need ffmpeg (sudo apt install ffmpeg).')]));
  };
  const statusText = (d) => ({ queued: 'Queued', running: d.speedUnit === 'x' ? `Downloading · ${d.speed ? `${d.speed.toFixed(1)}× speed` : '…'}` : `Downloading · ${d.speed ? `${fmtBytes(d.speed)}/s` : '…'}`, done: 'Finished', error: `Failed: ${d.error}`, canceled: 'Canceled', paused: 'Paused (app closed)' }[d.status] || d.status);
  function card(d) {
    const acts = [];
    if (d.status === 'done') acts.push(iconBtn('play_arrow', 'Play file', () => window.mb.dl.playFile(d.file), 'filled'));
    if (['running', 'queued'].includes(d.status)) acts.push(iconBtn('cancel', 'Cancel', () => window.mb.dl.cancel(d.id)));
    if (['error', 'canceled', 'paused'].includes(d.status)) acts.push(iconBtn('refresh', 'Retry', () => window.mb.dl.retry(d.id)));
    acts.push(iconBtn('delete', 'Remove', async () => { const del = d.status === 'done' ? await confirmDialog('Remove download?', 'The list entry will be removed. Delete the file from disk too?', 'Delete file too') : false; window.mb.dl.remove(d.id, del === true); }));
    return h('div.dl', img(d.poster, d.title), h('div.meta', h('div.t-title-m', d.title), h('div.t-label.t-muted', statusText(d)),
      d.status === 'running' || d.status === 'queued' ? h('div.lin' + (d.progress ? '' : '.indet'), h('i', { style: d.progress ? { width: `${Math.round(d.progress * 100)}%` } : {} })) : null), acts);
  }
  window.mb.dl.list().then((l) => { items = l; draw(); });
  const off = window.mb.dl.onChange((l) => { items = l; draw(); });
  return { destroy: off };
}
