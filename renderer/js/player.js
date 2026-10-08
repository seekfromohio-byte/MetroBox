import { h, $, icon, iconBtn, btn, toast, menu, dialog, select, fmtTime, clamp, epLabel } from './util.js';
import { S, saveSettings, setProgress, getProgress, pushHistory } from './state.js';
import { A } from './actions.js';
import { parseSubs, activeCue, subStyle } from './subs.js';
import { closeDetail } from './detail.js';
import { openExternalPlayer, downloadEpisode } from './playflow.js';

let active = null;
export const isPlaying = () => !!active;

export function openPlayer(ctx) {
  if (active) active.destroy();
  closeDetail();
  const P = S.settings.player;
  const st = { ctx: { ...ctx }, sources: [], idx: 0, dash: null, levels: [], level: 'auto', cues: [], caps: [], capIdx: -1, offset: 0, fs: false, idleT: null, nextDismissed: false, nextTimer: null, lastSave: 0, ended: false, dead: false, fill: false, spinT: null };

  const video = h('video', { preload: 'auto', playsInline: true });
  const flashIcon = h('div.pl-flash');
  const spinner = h('div.spinner', { style: { display: 'none' } });
  const subsEl = h('div.pl-subs'); const subsSpan = h('span');
  subsEl.append(subsSpan); subsEl.style.bottom = `${P.sub.bottom}%`; Object.assign(subsSpan.style, subStyle(P.sub)); subsSpan.style.display = 'none';
  const msg = h('div.pl-msg', { style: { display: 'none' } });
  const title = h('div.pl-title'); const sub = h('div.pl-sub');
  const buf = h('div.pl-buf'); const fill = h('div.pl-fill'); const thumb = h('div.pl-thumb'); const tip = h('div.pl-tip', '0:00');
  const track = h('div.pl-track', buf, fill, thumb); const seek = h('div.pl-seek', track, tip);
  const tCur = h('span.pl-time', '0:00'); const tDur = h('span.pl-time', '0:00');
  const playBtn = iconBtn('pause', 'Pause (Space)', () => toggle(), 'pl-play', true);
  const volBtn = iconBtn('volume_up', 'Mute (M)', () => { video.muted = !video.muted; }, '');
  const vol = h('md-slider.pl-vol', { min: 0, max: 1, step: 0.01, value: P.muted ? 0 : P.volume, 'aria-label': 'Volume' });
  const nextBtn = iconBtn('skip_next', 'Next episode (N)', () => goNext(), '');
  const epBtn = iconBtn('format_list_bulleted', 'Episodes', () => drawer(), '');
  const speedBtn = iconBtn('speed', 'Playback speed', () => speedMenu(), '');
  const subBtn = iconBtn('closed_caption', 'Subtitles (C)', () => subMenu(), '');
  const qBtn = iconBtn('hd', 'Quality', () => qualityMenu(), '');
  const aspBtn = iconBtn('aspect_ratio', 'Fit / fill (A)', () => { st.fill = !st.fill; root.classList.toggle('fill', st.fill); toast(st.fill ? 'Fill screen' : 'Fit to screen', { ms: 1200 }); }, '');
  const pipBtn = iconBtn('picture_in_picture_alt', 'Picture in picture (P)', () => pip(), '');
  const fsBtn = iconBtn('fullscreen', 'Fullscreen (F)', () => setFs(!st.fs), '');
  const moreBtn = iconBtn('more_vert', 'More', () => moreMenu(), '');
  const top = h('div.pl-top', iconBtn('arrow_back', 'Back (Esc)', () => destroy(), 'scrimmed'), h('div', { style: { flex: 1, minWidth: 0 } }, title, sub), moreBtn);
  const bot = h('div.pl-bot', seek, h('div.pl-row', playBtn, iconBtn('replay_10', 'Back 10 seconds (J)', () => skip(-10), ''), iconBtn('forward_10', 'Forward 10 seconds (L)', () => skip(10), ''),
    h('div.pl-volwrap', volBtn, vol), tCur, h('span.pl-time', { style: { opacity: 0.5, margin: 0 } }, '/'), tDur, h('div.pl-grow'), nextBtn, epBtn, speedBtn, subBtn, qBtn, aspBtn, pipBtn, fsBtn));
  const root = h('div.player', { tabindex: -1 }, video, subsEl, h('div.pl-center', flashIcon, spinner), top, bot, msg);
  $('#player-layer').append(root);

  // ---------- helpers
  const dash = () => st.sources[st.idx] && st.sources[st.idx].dash;
  const nextEp = () => {
    const d = st.ctx.item; if (!d.series) return null;
    const flat = d.seasons.flatMap((s) => s.episodes.map((e) => [s.number, e]));
    const i = flat.findIndex(([s, e]) => s === st.ctx.se && e === st.ctx.ep);
    return i >= 0 && flat[i + 1] ? { se: flat[i + 1][0], ep: flat[i + 1][1] } : null;
  };
  function headline() {
    const { item, se, ep } = st.ctx;
    title.textContent = item.title; sub.textContent = item.series ? `${epLabel(se, ep)}` : [item.year, item.duration].filter(Boolean).join(' · ');
    nextBtn.style.display = nextEp() ? '' : 'none'; epBtn.style.display = item.series && item.seasons.length ? '' : 'none';
    document.title = `${item.title}${item.series ? ` ${epLabel(se, ep)}` : ''} — MetroBox`;
    if ('mediaSession' in navigator) navigator.mediaSession.metadata = new MediaMetadata({ title: item.title + (item.series ? ` ${epLabel(se, ep)}` : ''), artist: 'MetroBox', artwork: item.poster ? [{ src: item.poster }] : [] });
  }
  function flash(name) { flashIcon.replaceChildren(icon(name, true)); flashIcon.classList.remove('go'); void flashIcon.offsetWidth; flashIcon.classList.add('go'); }
  function showMsg({ text, loading, actions, error }) {
    msg.style.display = '';
    msg.replaceChildren(loading ? h('div.spinner') : icon(error ? 'error' : 'info'), h('div.t-title-m', { style: { whiteSpace: 'pre-wrap' } }, text), actions ? h('div', { style: { display: 'flex', gap: '8px', flexWrap: 'wrap', justifyContent: 'center' } }, actions) : null);
  }
  const hideMsg = () => { msg.style.display = 'none'; };
  const setSpin = (on) => { clearTimeout(st.spinT); if (on) st.spinT = setTimeout(() => { spinner.style.display = ''; }, 250); else spinner.style.display = 'none'; };
  function toggle() { if (video.paused) { video.play().catch(() => {}); flash('play_arrow'); } else { video.pause(); flash('pause'); } }
  function skip(sec) { if (st.trans) { seekTrans(video.currentTime + (st.transBase || 0) + sec); flash(sec < 0 ? 'replay_10' : 'forward_10'); return; } video.currentTime = clamp(video.currentTime + sec, 0, video.duration || 1e9); flash(sec < 0 ? 'replay_10' : 'forward_10'); }
  function setFs(on) { st.fs = on; window.mb.setFullscreen(on); fsBtn.replaceChildren(icon(on ? 'fullscreen_exit' : 'fullscreen')); }
  async function pip() { try { if (document.pictureInPictureElement) await document.exitPictureInPicture(); else await video.requestPictureInPicture(); } catch (e) { toast('Picture in picture isn’t available here.'); } }
  function wake() {
    root.classList.remove('idle', 'nocursor'); clearTimeout(st.idleT);
    st.idleT = setTimeout(() => { if (!video.paused && !document.querySelector('.menu') && !document.querySelector('.pl-drawer')) root.classList.add('idle', 'nocursor'); }, 3000);
  }
  function saveProg(force) {
    const d = video.duration; if (!isFinite(d) || d < 30) return;
    if (!force && Date.now() - st.lastSave < 5000) return;
    st.lastSave = Date.now();
    if (video.currentTime > 5 || getProgress(st.ctx.item.id, st.ctx.se, st.ctx.ep)) setProgress(st.ctx.item, st.ctx.se, st.ctx.ep, video.currentTime, d);
  }

  // ---------- loading sources
  async function load(startAt) {
    st.ended = false; st.nextDismissed = false; hideUpNext(); st.cues = []; st.caps = []; st.capIdx = -1; subsSpan.style.display = 'none';
    headline(); pushHistory(st.ctx.item, st.ctx.se, st.ctx.ep);
    showMsg({ loading: true, text: 'Finding the best stream…' });
    let opts;
    try { opts = await window.mb.play(st.ctx.pid, st.ctx.se, st.ctx.ep); } catch (e) { if (!st.dead) fail(e.message); return; }
    if (st.dead) return;
    const seen = new Set(); st.sources = opts.filter((o) => (seen.has(o.url) ? false : seen.add(o.url)));
    if (!st.sources.length) { fail('No playable streams were found for this title.'); return; }
    const want = P.quality === 'auto' ? Infinity : +P.quality;
    // With hardware HEVC (VAAPI on Linux), HEVC sources are just normal sources.
    const canHevc = !!(window.MediaSource && MediaSource.isTypeSupported && MediaSource.isTypeSupported('video/mp4; codecs="hev1.1.6.L120.90"'));
    const hevc = (x) => !canHevc && /hevc|h\.?265|hvc1|hev1/i.test(x.codec || '');
    let pick = st.sources.findIndex((x) => x.height <= want && !hevc(x));
    if (pick < 0) pick = st.sources.findIndex((x) => !hevc(x));
    if (pick < 0) pick = st.sources.findIndex((x) => x.height <= want);
    st.idx = Math.max(0, pick);
    let pos = startAt;
    if (pos === undefined) { const pr = getProgress(st.ctx.item.id, st.ctx.se, st.ctx.ep); pos = P.resume && pr && pr.dur && pr.pos > 20 && pr.pos / pr.dur < 0.94 ? pr.pos : 0; }
    // No hardware HEVC: transcode locally with ffmpeg when no external player is configured, else hand off.
    st.trans = null; st.transBase = 0;
    if (pick < 0 || hevc(st.sources[st.idx])) {
      const det = await window.mb.detectPlayers().catch(() => ({}));
      const ext = (P.fallback === 'vlc' && det.vlc) || (P.fallback === 'mpv' && det.mpv);
      if (det.ffmpeg && !ext) st.trans = {};
      else { noPicture(pos); return; }
    }
    start(pos);
    loadCaptions(st.sources[st.idx].streamId, st.ctx.pid);
  }
  function destroyEngine() { if (st.dash) { try { st.dash.reset(); } catch { /* ignore */ } st.dash = null; } st.levels = []; st.level = 'auto'; }
  async function start(pos) {
    destroyEngine(); hideMsg(); setSpin(true); st.decodeOk = false; st.blankSince = 0; st.transSeeking = false;
    const o = st.sources[st.idx];
    video.playbackRate = P.speed; video.volume = P.volume; video.muted = P.muted;
    if (st.trans) {
      try {
        const r = await window.mb.transcode(o, { ss: pos || 0 });
        if (st.dead) return;
        st.transBase = pos || 0;
        video.src = (r && r.src) || r; video.play().catch(() => { });
      } catch (e) { if (!st.dead) noPicture(pos); return; }
    } else if (o.dash) {
      const dp = window.dashjs.MediaPlayer().create();
      dp.updateSettings({ debug: { logLevel: 1 }, streaming: { buffer: { fastSwitchEnabled: true, bufferTimeAtTopQuality: 40, bufferTimeAtTopQualityLongForm: 60, bufferToKeep: 30 }, retryAttempts: { MediaSegment: 3, MPD: 3 }, abr: { autoSwitchBitrate: { video: true, audio: true } } } });
      dp.on(window.dashjs.MediaPlayer.events.STREAM_INITIALIZED, () => {
        st.levels = dp.getBitrateInfoListFor('video') || [];
        if (P.quality !== 'auto' && st.levels.length) {
          const t = +P.quality; const byH = st.levels.slice().sort((a, b) => b.height - a.height);
          const pick = byH.find((l) => l.height <= t) || byH[byH.length - 1];
          setLevel(pick.qualityIndex, true);
        }
        qBtn.title = 'Quality';
      });
      dp.on(window.dashjs.MediaPlayer.events.ERROR, (e) => { const m = (e.error && e.error.message) || 'Stream error'; if (e.error && e.error.code === 25) { noPicture(); return; } if (e.error && e.error.code && [10, 11, 25, 26, 27].includes(e.error.code)) fail(`The stream couldn’t be played (${m}).`); });
      st.dash = dp; dp.initialize(video, o.src, true, pos > 0 ? pos : undefined);
    } else {
      video.src = o.src;
      if (pos > 0) video.addEventListener('loadedmetadata', () => { video.currentTime = pos; }, { once: true });
      video.play().catch(() => {});
    }
    if (P.autoFullscreen && !st.fs) setFs(true);
    window.mb.keepAwake(!!P.keepAwake);
  }
  function setLevel(qi, quiet) {
    if (!st.dash) return;
    if (qi === 'auto') { st.dash.updateSettings({ streaming: { abr: { autoSwitchBitrate: { video: true } } } }); st.level = 'auto'; } else { st.dash.updateSettings({ streaming: { abr: { autoSwitchBitrate: { video: false } } } }); st.dash.setQualityFor('video', qi, true); st.level = qi; }
    if (!quiet) toast(qi === 'auto' ? 'Quality: Auto' : `Quality: ${st.levels.find((l) => l.qualityIndex === qi).height}p`, { ms: 1400 });
  }
  function fail(text) {
    setSpin(false);
    const acts = [btn('Retry', 'filled', () => load(video.currentTime || undefined), 'refresh')];
    if (st.sources.length > 1 && st.idx < st.sources.length - 1) acts.push(btn('Try another source', 'tonal', () => { st.idx++; start(video.currentTime || 0); }));
    acts.push(btn('Open in VLC', 'tonal', () => externalHere('vlc'), 'open_in_new'), btn('Close', 'text', () => destroy()));
    showMsg({ text, error: true, actions: acts });
  }
  async function loadCaptions(streamId, pid) {
    try {
      st.caps = await window.mb.captions(pid, streamId); if (st.dead) return;
      if (P.subAuto && P.subLang) { const i = st.caps.findIndex((c) => c.name.toLowerCase().includes(P.subLang.toLowerCase())); if (i >= 0) selectCap(i, true); }
    } catch { /* optional */ }
  }
  async function selectCap(i, quiet) {
    if (i < 0) { st.capIdx = -1; st.cues = []; subsSpan.style.display = 'none'; return; }
    try {
      const text = await window.mb.subtitle(st.caps[i].url); const cues = parseSubs(text);
      if (!cues.length) throw new Error('empty');
      st.cues = cues; st.capIdx = i; st.offset = 0; if (!quiet) toast(`Subtitles: ${st.caps[i].name}`, { ms: 1400 });
    } catch { toast('That subtitle file couldn’t be read.'); }
  }
  async function externalHere(engine) {
    video.pause(); const { item, se, ep, pid } = st.ctx;
    await openExternalPlayer(item, se, ep, pid, engine);
  }

  // ---------- unsupported video format: hand over to VLC / mpv at the same position
  async function noPicture(posOverride) {
    if (st.fallingBack || st.dead) return; st.fallingBack = true;
    video.pause(); setSpin(false);
    const { item, se, ep, pid } = st.ctx; const pos = posOverride ?? (video.currentTime || 0); const mode = P.fallback;
    const why = 'The built-in player can’t show this video’s format (usually HEVC / H.265), so you’d only get sound.';
    const manual = async () => {
      const det = await window.mb.detectPlayers().catch(() => ({}));
      const acts = [];
      if (det.ffmpeg && !st.trans) acts.push(btn('Play here (transcoded)', 'tonal', () => { st.fallingBack = false; st.trans = {}; if (!st.sources.some((x) => !/hevc|h\.?265|hvc1|hev1/i.test(x.codec || ''))) st.idx = Math.min(st.idx, st.sources.length - 1); start(pos); }, 'auto_awesome'));
      acts.push(btn('Play in VLC', det.vlc ? 'filled' : 'text', () => handoff('vlc'), 'open_in_new'));
      if (det.mpv) acts.push(btn('Play in mpv', 'tonal', () => handoff('mpv')));
      const alt = st.sources.findIndex((x, i) => i !== st.idx);
      if (alt >= 0) acts.push(btn('Try another source', 'tonal', () => { st.fallingBack = false; st.idx = alt; start(pos); }));
      acts.push(btn('Close', 'text', () => destroy()));
      showMsg({ text: why, error: true, actions: acts });
    };
    async function handoff(engine) {
      showMsg({ loading: true, text: `${why}\nOpening in ${engine === 'vlc' ? 'VLC' : 'mpv'}…` });
      const ok = await openExternalPlayer(item, se, ep, pid, engine, pos);
      if (ok) { toast(`Opened in ${engine === 'vlc' ? 'VLC' : 'mpv'} — the built-in player can’t show this format.`, { ms: 6000 }); destroy(); } else { st.fallingBack = false; manual(); }
    }
    if (mode === 'vlc' || mode === 'mpv') handoff(mode); else manual();
  }

  // ---------- menus
  function speedMenu() { menu(speedBtn, [0.5, 0.75, 1, 1.25, 1.5, 1.75, 2].map((v) => ({ label: v === 1 ? 'Normal' : `${v}×`, checked: video.playbackRate === v, onClick: () => { video.playbackRate = v; P.speed = v; saveSettings('player'); } })), { up: true, align: 'right' }); }
  function qualityMenu() {
    const items = [];
    if (dash() && st.levels.length) {
      items.push({ label: 'Auto', checked: st.level === 'auto', onClick: () => setLevel('auto') });
      st.levels.slice().sort((a, b) => b.height - a.height).forEach((l) => items.push({ label: `${l.height}p`, checked: st.level === l.qualityIndex, onClick: () => setLevel(l.qualityIndex) }));
    } else st.sources.forEach((s, i) => items.push({ label: s.label, checked: i === st.idx, onClick: () => { if (i !== st.idx) { st.idx = i; start(video.currentTime || 0); } } }));
    if (!items.length) { toast('No quality options yet.', { ms: 1200 }); return; }
    menu(qBtn, items, { up: true, align: 'right' });
  }
  function subMenu() {
    const items = [{ label: 'Off', checked: st.capIdx < 0, onClick: () => selectCap(-1) }];
    st.caps.forEach((c, i) => items.push({ label: c.name, checked: st.capIdx === i, onClick: () => selectCap(i) }));
    if (!st.caps.length) items.push({ label: 'No subtitles available', disabled: true });
    items.push({ divider: true },
      { label: 'Text smaller', icon: 'remove', onClick: () => { P.sub.size = clamp(P.sub.size - 10, 50, 250); applySub(); saveSettings('player'); } },
      { label: 'Text larger', icon: 'add', onClick: () => { P.sub.size = clamp(P.sub.size + 10, 50, 250); applySub(); saveSettings('player'); } },
      { label: `Delay −0.5s  (now ${st.offset.toFixed(1)}s)`, icon: 'swap_horiz', onClick: () => { st.offset -= 0.5; toast(`Subtitle delay ${st.offset.toFixed(1)}s`, { ms: 1000 }); } },
      { label: `Delay +0.5s  (now ${st.offset.toFixed(1)}s)`, icon: 'swap_horiz', onClick: () => { st.offset += 0.5; toast(`Subtitle delay ${st.offset.toFixed(1)}s`, { ms: 1000 }); } });
    menu(subBtn, items, { up: true, align: 'right' });
  }
  function applySub() { Object.assign(subsSpan.style, subStyle(P.sub)); subsEl.style.bottom = `${P.sub.bottom}%`; }
  function moreMenu() {
    const { item, se, ep, pid } = st.ctx;
    menu(moreBtn, [{ label: 'Play in VLC', icon: 'open_in_new', onClick: () => externalHere('vlc') }, { label: 'Play in mpv', icon: 'open_in_new', onClick: () => externalHere('mpv') }, { divider: true },
      { label: 'Download this', icon: 'download', onClick: () => downloadEpisode(item, se, ep, pid) }, { label: 'Keyboard shortcuts', icon: 'keyboard', onClick: showShortcuts }], { align: 'right' });
  }
  function drawer() {
    if ($('.pl-drawer', root)) { $('.pl-drawer', root).remove(); return; }
    const d = st.ctx.item; let season = st.ctx.se;
    const list = h('div.eps');
    const fillList = () => {
      list.replaceChildren(); const s = d.seasons.find((x) => x.number === season);
      (s ? s.episodes : []).forEach((n) => {
        const cur = season === st.ctx.se && n === st.ctx.ep;
        list.append(h('button.ep.sl' + (cur ? '.done' : ''), { onclick: () => { dr.remove(); switchTo(season, n); } }, h('div.num', cur ? icon('play_arrow', true) : String(n)), h('div.meta', h('div.t-title-m', `Episode ${n}`))));
      });
    };
    const sel = select(d.seasons.map((s) => [s.number, `Season ${s.number}`]), season, (v) => { season = +v; fillList(); });
    const dr = h('div.pl-drawer', h('div', { style: { display: 'flex', alignItems: 'center', gap: '8px' } }, h('div.t-title-l', { style: { flex: 1 } }, 'Episodes'), iconBtn('close', 'Close', () => dr.remove(), 'sm')), d.seasons.length > 1 ? sel : null, list);
    fillList(); root.append(dr);
  }
  function showShortcuts() {
    const rows = [['Space / K', 'Play / pause'], ['← / → ', 'Seek 10s'], ['J / L', 'Seek 10s back / forward'], ['↑ / ↓', 'Volume'], ['M', 'Mute'], ['F', 'Fullscreen'], ['C', 'Toggle subtitles'], ['[ / ]', 'Subtitle delay'], ['< / >', 'Speed'], ['N', 'Next episode'], ['A', 'Fit / fill'], ['0–9', 'Jump to 0–90%'], ['Esc', 'Leave fullscreen / close']];
    dialog({ title: 'Keyboard shortcuts', body: h('div.shortcuts', rows.flatMap(([k, v]) => [h('span.kbd', k), h('span', v)])), actions: [{ label: 'Close', kind: 'text' }] });
  }

  // ---------- episodes
  function switchTo(se, ep) {
    saveProg(true); st.ctx = { ...st.ctx, se, ep }; load(0);
  }
  function goNext() { const n = nextEp(); if (n) { hideUpNext(); switchTo(n.se, n.ep); } }
  function hideUpNext() { clearInterval(st.nextTimer); const c = $('.pl-next', root); if (c) c.remove(); }
  function showUpNext(countdown) {
    const n = nextEp(); if (!n || $('.pl-next', root) || st.nextDismissed) return;
    let left = countdown || 0;
    const label = h('span.t-label', countdown ? `Starting in ${left}s` : 'Up next');
    const card = h('div.pl-next', h('div', h('div.t-label.t-muted', label), h('div.t-title-m', `${st.ctx.item.title} · ${epLabel(n.se, n.ep)}`)),
      btn('Play now', 'filled', goNext, 'play_arrow'), iconBtn('close', 'Dismiss', () => { st.nextDismissed = true; hideUpNext(); }, 'sm'));
    root.append(card);
    if (countdown) st.nextTimer = setInterval(() => { left--; label.textContent = `Starting in ${left}s`; if (left <= 0) goNext(); }, 1000);
  }

  // ---------- events
  // Transcoded streams aren't seekable natively — seeking restarts ffmpeg at the target position.
  function restartTrans(ss) {
    if (st.transSeeking || st.dead) return;
    st.transSeeking = true; setSpin(true);
    window.mb.transcode(st.sources[st.idx], { ss }).then((r) => {
      if (st.dead) return;
      video.src = (r && r.src) || r; video.play().catch(() => { });
      setTimeout(() => { st.transSeeking = false; }, 500);
    }).catch(() => { st.transSeeking = false; });
  }
  function seekTrans(to) {
    to = Math.max(0, to || 0);
    if (to < 1.5) { st.transBase = 0; restartTrans(0); return; }
    st.transBase = to; restartTrans(to);
  }
  video.addEventListener('waiting', () => setSpin(true));
  for (const ev of ['playing', 'canplay', 'seeked']) video.addEventListener(ev, () => { setSpin(false); if (ev === 'playing') hideMsg(); });
  video.addEventListener('play', () => { playBtn.replaceChildren(icon('pause', true)); wake(); window.mb.keepAwake(!!P.keepAwake); });
  video.addEventListener('pause', () => { playBtn.replaceChildren(icon('play_arrow', true)); root.classList.remove('idle', 'nocursor'); saveProg(true); window.mb.keepAwake(false); });
  video.addEventListener('volumechange', () => { volBtn.replaceChildren(icon(video.muted || video.volume === 0 ? 'volume_off' : 'volume_up', true)); vol.value = video.muted ? 0 : video.volume; vol.style.setProperty('--p', `${vol.value * 100}%`); if (!video.muted && video.volume > 0) P.volume = video.volume; P.muted = video.muted; saveSettings('player'); });
  video.addEventListener('error', () => { const c = video.error && video.error.code; if (!dash()) { if (c === 4) noPicture(); else fail('The video failed to load.'); } });
  video.addEventListener('ended', () => { st.ended = true; saveProg(true); if (nextEp() && !st.nextDismissed) { hideUpNext(); showUpNext(P.autoplayNext ? 6 : 0); } else { root.classList.remove('idle'); } });
  vol.addEventListener('input', () => { video.muted = false; video.volume = +vol.value; });
  vol.style.setProperty('--p', `${vol.value * 100}%`);
  root.addEventListener('pointermove', wake); root.addEventListener('pointerdown', wake);
  let clickT = null;
  video.addEventListener('click', () => { clearTimeout(clickT); clickT = setTimeout(toggle, 230); });
  video.addEventListener('dblclick', () => { clearTimeout(clickT); setFs(!st.fs); });
  video.addEventListener('wheel', (e) => { e.preventDefault(); video.muted = false; video.volume = clamp(video.volume - Math.sign(e.deltaY) * 0.05, 0, 1); }, { passive: false });
  const d = () => (st.trans ? 3600 : (isFinite(video.duration) && video.duration > 0 ? video.duration : 0));
  const pct = (e) => { const r = track.getBoundingClientRect(); return clamp((e.clientX - r.left) / r.width, 0, 1); };
  seek.addEventListener('pointermove', (e) => { const f = pct(e); tip.style.left = `${f * 100}%`; tip.textContent = fmtTime(f * (video.duration || 0)); });
  seek.addEventListener('pointerdown', (e) => { seek.setPointerCapture(e.pointerId); seek.classList.add('drag'); const mv = (ev) => { if (!d()) return; if (st.trans) { seekTrans(pct(ev) * d()); return; } video.currentTime = pct(ev) * d(); tick(); }; mv(e); seek.onpointermove = (ev) => { mv(ev); tip.style.left = `${pct(ev) * 100}%`; }; seek.onpointerup = () => { seek.classList.remove('drag'); seek.onpointermove = null; seek.onpointerup = null; }; });
  const offFs = window.mb.onFullscreen((on) => { st.fs = on; fsBtn.replaceChildren(icon(on ? 'fullscreen_exit' : 'fullscreen')); });
  const onKey = (e) => {
    if (document.querySelector('#dialog-layer .scrim') || e.target.tagName === 'INPUT' && e.target.type === 'text') return;
    const k = e.key; let used = true; wake();
    if (k === ' ' || k === 'k' || k === 'K') toggle();
    else if (k === 'ArrowRight') skip(P.skip); else if (k === 'ArrowLeft') skip(-P.skip);
    else if (k === 'l' || k === 'L') skip(10); else if (k === 'j' || k === 'J') skip(-10);
    else if (k === 'ArrowUp') { video.muted = false; video.volume = clamp(video.volume + 0.05, 0, 1); } else if (k === 'ArrowDown') video.volume = clamp(video.volume - 0.05, 0, 1);
    else if (k === 'm' || k === 'M') video.muted = !video.muted;
    else if (k === 'f' || k === 'F' || k === 'F11') setFs(!st.fs);
    else if (k === 'c' || k === 'C') { if (st.capIdx >= 0) selectCap(-1); else if (st.caps.length) selectCap(0); }
    else if (k === '[') { st.offset -= 0.1; toast(`Subtitle delay ${st.offset.toFixed(1)}s`, { ms: 900 }); } else if (k === ']') { st.offset += 0.1; toast(`Subtitle delay ${st.offset.toFixed(1)}s`, { ms: 900 }); }
    else if (k === '<' || k === ',') { video.playbackRate = Math.max(0.25, video.playbackRate - 0.25); toast(`Speed ${video.playbackRate}×`, { ms: 900 }); } else if (k === '>' || k === '.') { video.playbackRate = Math.min(3, video.playbackRate + 0.25); toast(`Speed ${video.playbackRate}×`, { ms: 900 }); }
    else if (k === 'n' || k === 'N') goNext();
    else if (k === 'a' || k === 'A') aspBtn.click(); else if (k === 'p' || k === 'P') pip();
    else if (/^[0-9]$/.test(k)) { if (d()) { if (st.trans) seekTrans(d() * (+k / 10)); else video.currentTime = d() * (+k / 10); } }
    else if (k === 'Escape') { if ($('.pl-drawer', root)) $('.pl-drawer', root).remove(); else if (document.querySelector('.menu')) { /* menu handles it */ } else if (st.fs) setFs(false); else destroy(); }
    else if (k === '?') showShortcuts(); else used = false;
    if (used) e.preventDefault();
  };
  document.addEventListener('keydown', onKey, true);
  if ('mediaSession' in navigator) { const ms = navigator.mediaSession; ms.setActionHandler('play', () => video.play()); ms.setActionHandler('pause', () => video.pause()); ms.setActionHandler('seekbackward', () => skip(-10)); ms.setActionHandler('seekforward', () => skip(10)); ms.setActionHandler('nexttrack', () => goNext()); }

  function tick() {
    const d = st.trans ? 3600 : (isFinite(video.duration) && video.duration > 0 ? video.duration : 0); const c = video.currentTime;
    const ct = st.trans ? c + (st.transBase || 0) : c;
    if (isFinite(d) && d > 0) {
      fill.style.width = `${(c / d) * 100}%`; thumb.style.left = `${(c / d) * 100}%`;
      let b = 0; for (let i = 0; i < video.buffered.length; i++) if (video.buffered.start(i) <= c + 0.5) b = Math.max(b, video.buffered.end(i));
      buf.style.width = `${(b / d) * 100}%`; tDur.textContent = fmtTime(d);
      if (!video.paused && !st.trans) saveProg(false);
      if (!st.ended && !st.trans && nextEp() && d > 120 && d - c < 25 && !st.nextDismissed) showUpNext(0);
    }
    tCur.textContent = fmtTime(ct);
    // Watchdog: time is advancing (audio) but no picture is ever produced -> unsupported video codec (usually HEVC).
    if (!st.decodeOk && !st.fallingBack && !video.paused && video.readyState >= 2 && c > 1.5) {
      const q = video.getVideoPlaybackQuality ? video.getVideoPlaybackQuality() : { totalVideoFrames: 1 };
      if (video.videoWidth > 0 && q.totalVideoFrames > 0) st.decodeOk = true;
      else { st.blankSince = st.blankSince || Date.now(); if (Date.now() - st.blankSince > 2500) { st.decodeOk = true; noPicture(); } }
    }
    if (st.cues.length) { const t = activeCue(st.cues, c - st.offset); if (t) { if (subsSpan.dataset.t !== t) { subsSpan.dataset.t = t; subsSpan.innerHTML = t.replace(/\n/g, '<br>'); } subsSpan.style.display = ''; } else { subsSpan.style.display = 'none'; subsSpan.dataset.t = ''; } }
  }
  const ticker = setInterval(tick, 150);

  function destroy() {
    if (st.dead) return; st.dead = true;
    try { saveProg(true); } catch { /* ignore */ }
    clearInterval(ticker); clearInterval(st.nextTimer); clearTimeout(st.idleT);
    document.removeEventListener('keydown', onKey, true); offFs();
    destroyEngine(); video.pause(); video.removeAttribute('src'); video.load();
    if (document.pictureInPictureElement) document.exitPictureInPicture().catch(() => {});
    window.mb.keepAwake(false); if (st.fs) window.mb.setFullscreen(false);
    root.remove(); active = null; document.title = 'MetroBox'; A.back('player');
  }
  active = { destroy };
  headline(); applySub(); load();
  root.focus();
  return active;
}

A.play = (ctx) => {
  const e = S.settings.player.engine;
  if (e === 'vlc' || e === 'mpv') { closeDetail(); openExternalPlayer(ctx.item, ctx.se, ctx.ep, ctx.pid, e); return; }
  openPlayer(ctx);
};
