import { h, icon, iconBtn, img, toast } from './util.js';
import { inList, toggleList } from './state.js';
import { A } from './actions.js';

export function posterCard(item, opts = {}) {
  const prog = opts.progress;
  const listBtn = iconBtn(inList(item.id) ? 'bookmark_added' : 'add', inList(item.id) ? 'Remove from My List' : 'Add to My List', (e) => {
    e.stopPropagation();
    const added = toggleList(item);
    listBtn.replaceChildren(icon(added ? 'bookmark_added' : 'add', true)); listBtn.title = added ? 'Remove from My List' : 'Add to My List';
    toast(added ? `Added “${item.title}” to My List` : 'Removed from My List');
    opts.onListChange && opts.onListChange(added);
  }, 'sm scrimmed');
  const media = h('div.card-media', h('div.ph', icon('movie')), img(item.poster, item.title),
    item.rating ? h('div.card-badges', h('span.badge', icon('star', true), String(item.rating).slice(0, 3))) : null,
    h('div.card-over', h('div.acts',
      iconBtn('play_arrow', 'Play', (e) => { e.stopPropagation(); A.quickPlay(item); }, 'sm filled', true), listBtn,
      opts.onRemove ? iconBtn('close', 'Remove', (e) => { e.stopPropagation(); opts.onRemove(item); }, 'sm scrimmed') : null)),
    prog ? h('div.card-prog', h('i', { style: { width: `${Math.round(prog * 100)}%` } })) : null);
  const sub = opts.sub || [item.year, item.series ? 'Series' : 'Movie'].filter(Boolean).join(' · ');
  return h('div.card', { tabindex: 0, role: 'button', 'aria-label': item.title, onclick: () => A.openDetail(item),
    onkeydown: (e) => { if (e.key === 'Enter') { e.preventDefault(); A.openDetail(item); } } },
  media, h('div.card-title', item.title), h('div.card-sub', sub));
}

export function row(title, items, build, { id } = {}) {
  const scroll = h('div.row-scroll');
  items.forEach((it) => scroll.append(build(it)));
  const l = iconBtn('chevron_left', 'Scroll left', () => scroll.scrollBy({ left: -scroll.clientWidth * 0.85, behavior: 'smooth' }), 'row-nav l filled');
  const r = iconBtn('chevron_right', 'Scroll right', () => scroll.scrollBy({ left: scroll.clientWidth * 0.85, behavior: 'smooth' }), 'row-nav r filled');
  const sync = () => { l.classList.toggle('off', scroll.scrollLeft < 8); r.classList.toggle('off', scroll.scrollLeft + scroll.clientWidth > scroll.scrollWidth - 8); };
  scroll.addEventListener('scroll', sync, { passive: true });
  requestAnimationFrame(sync); setTimeout(sync, 300);
  return h('section.row', { id }, h('div.row-head', h('h2.t-title-l', title)), l, r, scroll);
}

export function skeletonRow(n = 9) {
  return h('section.row', h('div.row-head', h('div.skeleton', { style: { width: '180px', height: '24px', borderRadius: '6px' } })),
    h('div.row-scroll', Array.from({ length: n }, () => h('div', { style: { width: 'var(--card-w)' } }, h('div.skeleton', { style: { aspectRatio: '2/3' } }), h('div.skeleton', { style: { height: '14px', width: '80%', marginTop: '10px', borderRadius: '6px' } })))));
}
export function skeletonGrid(n = 18) {
  return h('div.grid', Array.from({ length: n }, () => h('div', h('div.skeleton', { style: { aspectRatio: '2/3' } }), h('div.skeleton', { style: { height: '14px', width: '70%', marginTop: '10px', borderRadius: '6px' } }))));
}
export function emptyState(ico, title, text, action) {
  return h('div.empty', icon(ico), h('div.t-title-l', { style: { color: 'var(--on-surface)' } }, title), text ? h('div', text) : null, action || null);
}
export function errorState(msg, retry) {
  return emptyState('cloud_off', 'Couldn’t reach MovieBox', msg, retry ? h('button.btn.tonal.sl', { onclick: retry }, icon('refresh'), 'Try again') : null);
}
