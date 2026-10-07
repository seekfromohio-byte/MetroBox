import { h, icon, btn, segmented } from './util.js';
import { S } from './state.js';
import { getHome } from './data.js';
import { posterCard, skeletonGrid, errorState, emptyState } from './components.js';

/** Movies / Series: browse everything the feed offers, with genre chips and sorting. */
export function mountBrowse(page, kind) {
  const wantSeries = kind === 'series'; let dead = false; let pageNo = 0; let loading = false; let done = false;
  const items = new Map(); let genre = 'All'; let sort = 'default';
  const head = h('div', { style: { display: 'flex', alignItems: 'center', gap: '16px', flexWrap: 'wrap', marginBottom: '16px' } }, h('h1.t-headline', { class: 'page-title', style: { margin: 0, flex: 1 } }, wantSeries ? 'TV Series' : 'Movies'));
  const chips = h('div.chips', { style: { marginBottom: '24px' } });
  const grid = h('div'); const more = h('div', { style: { display: 'flex', justifyContent: 'center', padding: '28px' } });
  const sortSeg = segmented([['default', 'Featured'], ['rating', 'Top rated'], ['year', 'Newest'], ['title', 'A–Z']], sort, (v) => { sort = v; render(); });
  head.append(sortSeg);
  page.append(head, chips, grid, more);
  grid.append(skeletonGrid());

  function render() {
    let list = [...items.values()].filter((i) => !!i.series === wantSeries);
    const genres = {}; list.forEach((i) => (i.genres || []).forEach((g) => { genres[g] = (genres[g] || 0) + 1; }));
    const top = Object.entries(genres).sort((a, b) => b[1] - a[1]).slice(0, 12).map((x) => x[0]);
    chips.replaceChildren(...['All', ...top].map((g) => h('button.chip.sl' + (g === genre ? '.sel' : ''), { onclick: () => { genre = g; render(); } }, g === genre ? icon('check') : null, g)));
    if (genre !== 'All') list = list.filter((i) => (i.genres || []).includes(genre));
    if (sort === 'rating') list.sort((a, b) => (+b.rating || 0) - (+a.rating || 0)); else if (sort === 'year') list.sort((a, b) => (+b.year || 0) - (+a.year || 0)); else if (sort === 'title') list.sort((a, b) => a.title.localeCompare(b.title));
    grid.replaceChildren(list.length ? h('div.grid', list.map((i) => posterCard(i))) : (loading ? skeletonGrid() : emptyState('movie', 'Nothing here yet', 'Load more to discover titles.')));
    more.replaceChildren(done ? null : btn(loading ? 'Loading…' : 'Load more', 'tonal', () => load(), 'refresh'));
  }
  async function load() {
    if (loading || done || dead) return; loading = true; render();
    try {
      const data = await getHome(pageNo + 1); if (dead) return; pageNo++;
      let fresh = 0;
      for (const it of [...data.hero, ...data.rows.flatMap((r) => r.items)]) if (!items.has(it.id)) { items.set(it.id, it); fresh++; }
      if (!fresh || pageNo >= 8) done = true;
      if (pageNo < 3 && [...items.values()].filter((i) => !!i.series === wantSeries).length < 24 && !done) { loading = false; return load(); }
    } catch (e) { if (!dead) { grid.replaceChildren(errorState(e.message, () => { loading = false; load(); })); loading = false; return; } } finally { loading = false; }
    if (!dead) render();
  }
  load();
  return { destroy() { dead = true; } };
}
