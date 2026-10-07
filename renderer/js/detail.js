import { h, icon, iconBtn, btn, img, toast, menu, select, epKey, epLabel } from './util.js';
import { S, inList, toggleList, getProgress, on } from './state.js';
import { A } from './actions.js';
import { getDetails } from './data.js';
import { playTarget, downloadEpisode, openExternalPlayer, prefetchExternal } from './playflow.js';

let current = null;
export function closeDetail() { if (current) { current.remove(); current = null; document.removeEventListener('keydown', onKey, true); } }
function onKey(e) { if (e.key === 'Escape' && current && !document.querySelector('#dialog-layer .scrim, .menu') && !document.querySelector('.player')) { e.stopPropagation(); closeDetail(); } }

export function openDetail(item) {
  closeDetail();
  const scroll = h('div.sheet-scroll');
  const sheet = h('div.sheet', { role: 'dialog', 'aria-label': item.title }, iconBtn('close', 'Close', closeDetail, 'sheet-close scrimmed'), scroll);
  const scrim = h('div.scrim', { style: { zIndex: 150 }, onpointerdown: (e) => { if (e.target === scrim) closeDetail(); } }, sheet);
  current = scrim; document.body.append(scrim); document.addEventListener('keydown', onKey, true);
  const head = (d, loading) => h('div.sheet-head', h('div.bg', { style: { backgroundImage: d.poster ? `url("${d.poster}")` : '' } }),
    h('div.sheet-poster', { style: { backgroundImage: d.poster ? `url("${d.poster}")` : '' } }),
    h('div.sheet-info', h('div.t-headline', { style: { fontSize: '34px', lineHeight: '40px', fontWeight: 700 } }, d.title),
      d.tagline ? h('div', { style: { opacity: 0.85 } }, d.tagline) : null,
      h('div.hero-meta', ...[d.rating ? h('span.badge', icon('star', true), String(d.rating).slice(0, 3)) : null, d.year, d.series ? 'Series' : 'Movie', d.duration, d.country].filter(Boolean)
        .flatMap((x, i) => (i ? [h('span.sep', '•'), x] : [x]))),
      loading ? h('div.lin.indet', { style: { width: '220px' } }, h('i')) : null));
  scroll.append(head(item, true));
  getDetails(item.id).then((d) => { if (current === scrim) render(d); }, (e) => { scroll.replaceChildren(head(item, false), h('div.sheet-body', h('div.t-muted', `Couldn’t load details: ${e.message}`), btn('Try again', 'tonal', () => openDetail(item), 'refresh'))); });

  function render(d) {
    let pid = d.id; let season = d.seasons[0] ? d.seasons[0].number : 1;
    const epList = h('div.eps');
    const t = playTarget(d);
    prefetchExternal(pid, t.se, t.ep); // warm stream + subtitles so Play starts instantly
    const playLabel = t.resume ? (d.series ? `Resume ${epLabel(t.se, t.ep)}` : 'Resume') : (d.series ? `Play ${epLabel(t.se, t.ep)}` : 'Play');
    const listBtn = btn(inList(d.id) ? 'In My List' : 'My List', 'tonal', () => {
      const added = toggleList(d); listBtn.replaceChildren(icon(added ? 'bookmark_added' : 'add', true), added ? 'In My List' : 'My List');
    }, inList(d.id) ? 'bookmark_added' : 'add', 'lg');
    const more = iconBtn('more_vert', 'More options', () => menu(more, [
      { label: 'Play in VLC', icon: 'open_in_new', onClick: () => openExternalPlayer(d, t.se, t.ep, pid, 'vlc') },
      { label: 'Play in mpv', icon: 'open_in_new', onClick: () => openExternalPlayer(d, t.se, t.ep, pid, 'mpv') },
      ...(!d.series ? [{ divider: true }, { label: 'Download', icon: 'download', onClick: () => downloadEpisode(d, 0, 0, pid) }] : []),
      { divider: true }, { label: 'Open in browser search', icon: 'language', onClick: () => window.mb.openUrl(`https://www.google.com/search?q=${encodeURIComponent(`${d.title} ${d.year}`)}`) },
    ], { align: 'right' }), 'tonal lg');
    const dub = d.dubs.length ? select([[d.id, 'Original audio'], ...d.dubs.map((x) => [x.id, x.label])], pid, (v) => { pid = v; }) : null;
    const body = h('div.sheet-body',
      h('div', { style: { display: 'flex', gap: '12px', alignItems: 'center', flexWrap: 'wrap' } },
        btn(playLabel, 'filled', () => A.play({ item: d, se: t.se, ep: t.ep, pid }), 'play_arrow', 'lg'), listBtn, more, dub),
      d.description ? h('p.t-body-l', { style: { maxWidth: '75ch' } }, d.description) : null,
      d.genres.length ? h('div.chips', d.genres.map((g) => h('span.chip.static.assist', g))) : null,
      d.director ? h('div.kv', h('b', 'Director'), h('span', d.director)) : null,
      d.stars ? h('div.kv', h('b', 'Cast'), h('span', d.stars)) : null);
    if (d.series) {
      const seasonSel = d.seasons.length > 1 ? select(d.seasons.map((s) => [s.number, `Season ${s.number}`]), season, (v) => { season = +v; fill(); }) : null;
      body.append(h('div', { style: { display: 'flex', alignItems: 'center', gap: '16px' } }, h('h2.t-title-l', 'Episodes'), seasonSel), epList);
      const fill = () => {
        epList.replaceChildren();
        const s = d.seasons.find((x) => x.number === season);
        if (!s || !s.episodes.length) { epList.append(h('div.t-muted', 'No episode list available for this title.')); return; }
        for (const n of s.episodes) {
          const pr = getProgress(d.id, season, n); const frac = pr && pr.dur ? Math.min(1, pr.pos / pr.dur) : 0; const done = frac > 0.94;
          epList.append(h('div.ep.sl' + (done ? '.done' : ''), { role: 'button', tabindex: 0, onclick: () => A.play({ item: d, se: season, ep: n, pid }), onkeydown: (e) => { if (e.key === 'Enter') A.play({ item: d, se: season, ep: n, pid }); } },
            h('div.num', done ? icon('check') : String(n)),
            h('div.meta', h('div.t-title-m', `Episode ${n}`), frac > 0.02 && !done ? h('div.lin', h('i', { style: { width: `${frac * 100}%` } })) : null),
            iconBtn('download', `Download episode ${n}`, (e) => { e.stopPropagation(); downloadEpisode(d, season, n, pid); }, 'sm'),
            h('span.icon-btn.sm', icon('play_arrow', true))));
        }
      };
      fill();
    }
    scroll.replaceChildren(head(d, false), body);
  }
}

A.openDetail = openDetail;
