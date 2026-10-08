import { h, icon, btn, toast, confirmDialog } from './util.js';
import { S, profile, continueWatching, clearProgress, saveData, on } from './state.js';
import { posterCard, emptyState } from './components.js';

const ago = (t) => { const s = (Date.now() - t) / 1000; if (s < 3600) return `${Math.max(1, Math.round(s / 60))}m ago`; if (s < 86400) return `${Math.round(s / 3600)}h ago`; if (s < 86400 * 30) return `${Math.round(s / 86400)}d ago`; return new Date(t).toLocaleDateString(); };

export function mountLibrary(page, start = 'list') {
  let tab = start; const body = h('div'); const tabs = h('md-tabs.tabs', { 'aria-label': 'Library sections' }); const bar = h('div', { style: { display: 'flex', alignItems: 'center', marginBottom: '8px' } }, h('h1.t-headline.page-title', { style: { flex: 1, margin: 0 } }, 'Library'));
  page.append(bar, tabs, body);
  const offs = [on('list', draw), on('progress', draw), on('history', draw)];
  function draw() {
    const p = profile();
    tabs.replaceChildren(...[['list', 'My List', p.mylist.length], ['continue', 'Continue watching', continueWatching().length], ['history', 'History', p.history.length]].map(([k, l, n]) => h('md-primary-tab.tab', { selected: k === tab, onclick: () => { tab = k; draw(); } }, `${l}${n ? ` (${n})` : ''}`)));
    bar.querySelector('.btn')?.remove();
    if (tab === 'history' && p.history.length) bar.append(btn('Clear history', 'text', async () => { if (await confirmDialog('Clear history?', 'This removes the list of titles you’ve watched on this profile.', 'Clear', true)) { p.history = []; saveData('history'); } }, 'delete'));
    if (tab === 'list') {
      body.replaceChildren(p.mylist.length ? h('div.grid', p.mylist.map((i) => posterCard(i, { onListChange: () => {} }))) : emptyState('bookmark', 'Your list is empty', 'Tap + on any title to save it here for later.'));
    } else if (tab === 'continue') {
      const c = continueWatching();
      body.replaceChildren(c.length ? h('div.grid', c.map((e) => posterCard(e.item, { progress: e.pos / e.dur, sub: e.se ? `S${e.se} · E${e.ep} · ${ago(e.t)}` : ago(e.t), onRemove: (it) => { clearProgress(it.id); toast('Removed'); } }))) : emptyState('play_circle', 'Nothing in progress', 'Start watching something and it will appear here.'));
    } else {
      body.replaceChildren(p.history.length ? h('div.grid', p.history.map((e) => posterCard(e.item, { sub: `${e.se ? `S${e.se}E${e.ep} · ` : ''}${ago(e.t)}` }))) : emptyState('history', 'No history yet', 'Titles you watch will show up here.'));
    }
  }
  draw();
  return { destroy: () => offs.forEach((f) => f()) };
}
