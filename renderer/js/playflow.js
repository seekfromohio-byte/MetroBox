import { toast, epLabel, epKey } from './util.js';
import { S, profile, getProgress } from './state.js';
import { A } from './actions.js';
import { getDetails } from './data.js';

/** Where should "Play" start for this title? Resume the latest unfinished episode, else the first one. */
export function playTarget(d) {
  const entries = Object.values(profile().progress).filter((e) => e.item.id === d.id && e.dur).sort((a, b) => b.t - a.t);
  const last = entries[0];
  if (!d.series) return { se: 0, ep: 0, resume: !!(last && last.pos > 20 && last.pos / last.dur < 0.94), pos: last ? last.pos : 0 };
  const flat = d.seasons.flatMap((s) => s.episodes.map((ep) => [s.number, ep]));
  if (last) {
    if (last.pos / last.dur < 0.94) return { se: last.se, ep: last.ep, resume: last.pos > 20, pos: last.pos };
    const i = flat.findIndex(([s, e]) => s === last.se && e === last.ep);
    if (i >= 0 && flat[i + 1]) return { se: flat[i + 1][0], ep: flat[i + 1][1], resume: false, pos: 0 };
  }
  const first = flat[0] || [1, 1];
  return { se: first[0], ep: first[1], resume: false, pos: 0 };
}

export async function quickPlay(item) {
  try {
    toast(`Loading “${item.title}”…`, { ms: 1500 });
    const d = await getDetails(item.id);
    const t = playTarget(d);
    A.play({ item: d, se: t.se, ep: t.ep, pid: d.id });
  } catch (e) { toast(`Couldn’t start playback: ${e.message}`); }
}

export async function downloadEpisode(d, se, ep, pid) {
  try {
    const opts = await window.mb.play(pid || d.id, se, ep);
    if (!opts.length) throw new Error('No downloadable stream found.');
    const o = { ...opts[0] }; delete o.src;
    const title = d.title + (se || ep ? ` ${epLabel(se, ep)}` : '');
    await window.mb.dl.add({ key: epKey(pid || d.id, se, ep), title, poster: d.poster, option: o });
    toast(`Downloading ${title}`, { action: 'View', onAction: () => A.go('downloads') });
  } catch (e) { toast(e.message); }
}

/** Background prefetch of stream options + subtitles, so pressing Play doesn't wait on the network.
 *  Warmed from the detail page; openExternalPlayer reuses it (or does the same chain on a miss). */
const prefetch = new Map();
export function prefetchExternal(pid, se = 0, ep = 0) {
  const key = `${pid}/${se}/${ep}`;
  if (!prefetch.has(key)) {
    prefetch.set(key, (async () => {
      const opts = await window.mb.play(pid, se, ep);
      if (!opts.length) return null;
      const o = { ...opts[0] }; delete o.src;
      let subtitleText = null;
      try {
        const caps = await window.mb.captions(pid, o.streamId);
        const want = (S.settings.player.subLang || '').toLowerCase();
        const c = caps.find((x) => want && x.name.toLowerCase().includes(want)) || null;
        if (c) subtitleText = await window.mb.subtitle(c.url);
      } catch { /* subtitles are optional */ }
      return { option: o, subtitleText };
    })().catch(() => { prefetch.delete(key); return null; }));
    if (prefetch.size > 8) prefetch.delete(prefetch.keys().next().value);
  }
  return prefetch.get(key);
}

export async function openExternalPlayer(d, se, ep, pid, engine, startAt = 0) {
  try {
    const pre = await prefetchExternal(pid || d.id, se, ep);
    if (!pre) throw new Error('No stream found for this title.');
    await window.mb.openExternal({ engine, option: pre.option, title: d.title + (se || ep ? ` ${epLabel(se, ep)}` : ''), subtitleText: pre.subtitleText, startAt });
    toast(`Opened in ${engine === 'vlc' ? 'VLC' : 'mpv'}`);
    return true;
  } catch (e) { toast(e.message); return false; }
}
export { getProgress };
