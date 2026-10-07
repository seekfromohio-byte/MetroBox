import { h, icon, btn, iconBtn, toast } from './util.js';
import { S, inList, toggleList } from './state.js';
import { A } from './actions.js';
import { getDetails } from './data.js';

export function createHero(items) {
  items = items.slice(0, 7);
  let idx = 0; let timer = null; let paused = false;
  const dur = S.settings.home.heroSeconds;
  const slides = items.map((it) => {
    const desc = h('p.hero-desc', it.description || '');
    const bg = it.backdrop
      ? h('div.hero-bg', { style: { backgroundImage: `url("${it.backdrop}")` } })
      : h('div.hero-bg.blur', { style: { backgroundImage: it.poster ? `url("${it.poster}")` : '' } });
    const meta = h('div.hero-meta', h('span.badge', icon('star', true), it.rating ? String(it.rating).slice(0, 3) : 'New'),
      it.year ? h('span', it.year) : null, h('span.sep', '•'), h('span', it.series ? 'Series' : 'Movie'),
      ...(it.genres || []).slice(0, 3).flatMap((g) => [h('span.sep', '•'), h('span', g)]));
    const listBtn = btn(inList(it.id) ? 'In My List' : 'My List', 'tonal', () => {
      const added = toggleList(it); listBtn.replaceChildren(icon(added ? 'bookmark_added' : 'add', true), added ? 'In My List' : 'My List');
      toast(added ? 'Added to My List' : 'Removed from My List');
    }, inList(it.id) ? 'bookmark_added' : 'add', 'lg');
    const el = h('div.hero-slide', bg,
      !it.backdrop && it.poster ? h('div.hero-poster', { style: { backgroundImage: `url("${it.poster}")` } }) : null,
      h('div.hero-body', meta, h('h1.hero-title', it.title), desc,
        h('div.hero-actions', btn('Play', 'filled', () => A.quickPlay(it), 'play_arrow', 'lg'), btn('More info', 'tonal', () => A.openDetail(it), 'info', 'lg'), listBtn)));
    el._fill = () => { if (it.description || el._filled) return; el._filled = true; getDetails(it.id).then((d) => { desc.textContent = d.description || ''; }).catch(() => {}); };
    return el;
  });
  const dots = h('div.hero-dots', { style: { '--dur': `${dur}s` } }, items.map((_, i) => h('button', { 'aria-label': `Slide ${i + 1}`, onclick: () => show(i, true) })));
  const root = h('div.hero', { onmouseenter: () => { paused = true; dots.classList.add('paused'); clearTimeout(timer); }, onmouseleave: () => { paused = false; dots.classList.remove('paused'); schedule(); } }, slides, items.length > 1 ? dots : null);

  function show(i, manual) {
    idx = (i + slides.length) % slides.length;
    slides.forEach((s, k) => s.classList.toggle('on', k === idx));
    [...dots.children].forEach((d, k) => { d.classList.remove('on'); if (k === idx) { void d.offsetWidth; d.classList.add('on'); } });
    slides[idx]._fill();
    if (manual) paused = false;
    schedule();
  }
  function schedule() {
    clearTimeout(timer);
    if (!S.settings.home.heroAuto || paused || slides.length < 2) return;
    timer = setTimeout(() => show(idx + 1), dur * 1000);
  }
  root.destroy = () => clearTimeout(timer);
  if (slides.length) show(0);
  return root;
}
