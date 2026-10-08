import { h, icon, btn, iconBtn, debounce } from './util.js';
import { S, pushRecent, saveSettings } from './state.js';
import { getHome } from './data.js';
import { posterCard, skeletonGrid, errorState, emptyState } from './components.js';

export function mountSearch(page, initial = '') {
  let q = ''; let pageNo = 1; let type = 'all'; let loading = false; let done = false; let results = []; let dead = false; let token = 0;
  const title = h('h1.t-headline.page-title', 'Search');
  const filter = h('div.chips', { style: { marginBottom: '20px' } });
  const body = h('div'); const more = h('div', { style: { display: 'flex', justifyContent: 'center', padding: '28px' } });
  page.append(title, filter, body, more);

  function chips() {
    filter.replaceChildren(...[['all', 'All'], ['movie', 'Movies'], ['series', 'Series']].map(([v, l]) => h('md-filter-chip.chip.sl', { selected: v === type, onclick: () => { type = v; draw(); chips(); } }, l)));
    filter.style.display = q ? '' : 'none';
  }
  async function idle() {
    body.replaceChildren(); more.replaceChildren(); title.textContent = 'Search';
    const rec = S.settings.recent;
    if (rec.length) body.append(h('div', { style: { marginBottom: '28px' } }, h('div', { style: { display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px' } }, h('h2.t-title-l', { style: { flex: 1 } }, 'Recent searches'), btn('Clear', 'text', () => { S.settings.recent = []; saveSettings('recent'); idle(); })),
      h('div.chips', rec.map((r) => { const chip = h('md-suggestion-chip.chip.sl', { onclick: () => window.dispatchEvent(new CustomEvent('mb-search', { detail: r })) }, icon('history'), r); chip.firstElementChild.slot = 'icon'; return chip; }))));
    body.append(h('h2.t-title-l', { style: { marginBottom: '16px' } }, 'Popular right now'), skeletonGrid(12));
    try { const d = await getHome(1); if (dead || q) return; const all = [...d.hero, ...d.rows.flatMap((r) => r.items)]; const u = [...new Map(all.map((i) => [i.id, i])).values()].slice(0, 24);
      body.lastChild.replaceWith(h('div.grid', u.map((i) => posterCard(i)))); } catch { if (!dead && !q) body.lastChild.replaceWith(h('div.t-muted', 'Type a title in the search bar above.')); }
  }
  function draw() {
    let list = results.filter((i) => type === 'all' || (type === 'series') === !!i.series);
    body.replaceChildren(list.length ? h('div.grid', list.map((i) => posterCard(i))) : loading ? skeletonGrid(12) : emptyState('search', 'No results', `Nothing found for “${q}”. Try a different spelling.`));
    more.replaceChildren(!done && results.length ? btn(loading ? 'Loading…' : 'Load more', 'tonal', () => run(false), 'refresh') : null);
  }
  async function run(reset) {
    const my = ++token; if (reset) { pageNo = 1; results = []; done = false; } else pageNo++;
    loading = true; if (reset) draw();
    try {
      const r = await window.mb.search(q, pageNo); if (dead || my !== token) return;
      const seen = new Set(results.map((x) => x.id)); let fresh = 0; for (const it of r) if (!seen.has(it.id)) { results.push(it); fresh++; }
      if (!fresh || r.length < 8) done = true; if (reset && results.length) pushRecent(q);
    } catch (e) { if (!dead && my === token) { body.replaceChildren(errorState(e.message, () => run(true))); loading = false; return; } }
    loading = false; if (!dead && my === token) draw();
  }
  function setQuery(next) {
    next = next.trim(); if (next === q) return; q = next; chips();
    if (!q) { token++; idle(); return; }
    title.textContent = `Results for “${q}”`; run(true);
  }
  chips(); if (initial) setQuery(initial); else idle();
  return { setQuery, destroy() { dead = true; } };
}
