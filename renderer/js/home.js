import { h, icon, btn, toast } from './util.js';
import { S, profile, continueWatching, clearProgress, on } from './state.js';
import { getHome } from './data.js';
import { posterCard, row, skeletonRow, errorState } from './components.js';
import { createHero } from './hero.js';

const MAX_PAGES = 6;
export function mountHome(page, main) {
  let dead = false; let pageNo = 0; let loading = false; let done = false; let hero = null; const seenTitles = new Set();
  const personal = h('div'); const feed = h('div'); const sentinel = h('div', { style: { height: '1px' } });
  const heroHost = h('div'); const status = h('div');
  page.append(heroHost, personal, feed, sentinel, status);
  renderPersonal();
  feed.append(skeletonRow(), skeletonRow());

  function renderPersonal() {
    personal.replaceChildren();
    const cw = S.settings.home.continueRow ? continueWatching() : [];
    if (cw.length) {
      personal.append(row('Continue watching', cw, (e) => posterCard(e.item, {
        progress: e.pos / e.dur, sub: e.se ? `S${e.se} · E${e.ep}` : `${Math.max(1, Math.round((e.dur - e.pos) / 60))}m left`,
        onRemove: (it) => { clearProgress(it.id); toast('Removed from Continue watching'); },
      })));
    }
    const ml = profile().mylist;
    if (S.settings.home.listRow && ml.length) personal.append(row('My List', ml, (it) => posterCard(it, { onListChange: () => setTimeout(renderPersonal, 50) })));
  }
  const offs = [on('progress', renderPersonal), on('list', renderPersonal)];

  async function loadNext() {
    if (loading || done || dead) return;
    loading = true; status.replaceChildren();
    try {
      const data = await getHome(pageNo + 1);
      if (dead) return;
      if (pageNo === 0) feed.replaceChildren();
      pageNo++;
      if (pageNo === 1 && S.settings.home.hero) {
        const items = data.hero.length ? data.hero : data.rows.flatMap((r) => r.items).filter((i) => i.poster).slice(0, 6);
        if (items.length) { hero = createHero(items); heroHost.replaceChildren(hero); page.classList.add('with-hero'); }
      }
      let added = 0;
      for (const r of data.rows) {
        const t = seenTitles.has(r.title) ? `${r.title} · more` : r.title; seenTitles.add(r.title);
        feed.append(row(t, r.items, (it) => posterCard(it))); added++;
      }
      if (!added || pageNo >= MAX_PAGES) { done = true; feed.append(h('div.footer', pageNo >= MAX_PAGES ? 'That’s the whole lineup for now.' : 'No more rows.')); }
      if (pageNo === 1 && !added && !data.hero.length) { feed.replaceChildren(errorState('MovieBox returned an empty home feed.', () => location.reload())); done = true; }
    } catch (e) {
      if (dead) return;
      if (pageNo === 0) { feed.replaceChildren(errorState(e.message, () => { feed.replaceChildren(skeletonRow(), skeletonRow()); loading = false; loadNext(); })); } else status.replaceChildren(btn('Load more rows', 'tonal', () => loadNext(), 'refresh'));
      done = pageNo === 0;
    } finally { loading = false; }
  }
  const io = new IntersectionObserver((es) => { if (es.some((x) => x.isIntersecting)) loadNext(); }, { root: main, rootMargin: '600px' });
  io.observe(sentinel);
  loadNext();
  return { destroy() { dead = true; io.disconnect(); offs.forEach((f) => f()); if (hero) hero.destroy(); } };
}
