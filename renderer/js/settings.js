import { h, icon, btn, iconBtn, switchCtl, segmented, slider, select, toast, dialog, confirmDialog, debounce } from './util.js';
import { S, DEFAULTS, saveSettings, saveData, flushNow, profile, loadState } from './state.js';
import { SEEDS } from './theme.js';
import { showUpdateDialog } from './update.js';
import { subStyle } from './subs.js';
import { clearCaches } from './data.js';
import { avatar, editProfile } from './profiles.js';
import { newProfile } from './state.js';

const srow = (label, desc, ...ctl) => h('div.srow', h('div.lbl', label, desc ? h('small', desc) : null), h('div.ctl', ctl));
const group = (title, ...rows) => h('div.group', h('h3', title), ...rows);

async function checkNow() {
  toast('Checking for updates…', { ms: 1500 });
  try {
    const r = await window.mb.checkUpdates();
    if (r && r.found) showUpdateDialog(r);
    else toast(`You're up to date (v${(r && r.current) || S.version}).`);
  } catch (e) { toast(`Update check failed: ${e.message}`); }
}

export function mountSettings(page, { rerender }) {
  const T = S.settings.theme; const H = S.settings.home; const P = S.settings.player;
  const th = (k, v) => { T[k] = v; saveSettings('theme'); };
  const swatches = h('div.swatches');
  const drawSw = () => {
    swatches.replaceChildren(...SEEDS.map(([c, n]) => h('button.swatch' + (c.toLowerCase() === T.seed.toLowerCase() ? '.sel' : ''), { title: n, 'aria-label': n, style: { background: c }, onclick: () => { th('seed', c); drawSw(); } })),
      h('input', { type: 'color', value: T.seed, title: 'Custom color', 'aria-label': 'Custom accent color', oninput: (e) => { th('seed', e.target.value); swatches.querySelectorAll('.swatch').forEach((s) => s.classList.remove('sel')); } }));
  };
  drawSw();
  const [cardR, cardV] = slider(120, 260, 4, T.cardSize, (v) => th('cardSize', v), (v) => `${v}px`);
  const [scaleR, scaleV] = slider(80, 150, 5, Math.round(T.uiScale * 100), (v) => { T.uiScale = v / 100; saveSettings('theme'); window.mb.setZoom(T.uiScale); }, (v) => `${v}%`);
  const [heroR, heroV] = slider(5, 20, 1, H.heroSeconds, (v) => { H.heroSeconds = v; saveSettings('home'); }, (v) => `${v}s`);

  const sub = P.sub; const preview = h('div.sub-preview', h('span', 'The quick brown fox jumps over the lazy dog.'));
  const drawPrev = () => { const s = preview.firstChild; Object.assign(s.style, subStyle(sub)); s.style.fontSize = `${Math.round(22 * sub.size / 100)}px`; s.style.bottom = `${sub.bottom}%`; };
  const sp = (k, v) => { sub[k] = v; drawPrev(); saveSettings('player'); };
  const subColors = h('div.swatches');
  const drawSubC = () => subColors.replaceChildren(...['#ffffff', '#ffe066', '#7fe3ff', '#8dffb0'].map((c) => h('button.swatch' + (c === sub.color ? '.sel' : ''), { style: { background: c }, 'aria-label': c, onclick: () => { sp('color', c); drawSubC(); } })));
  drawSubC();
  const [szR, szV] = slider(50, 250, 10, sub.size, (v) => sp('size', v), (v) => `${v}%`);
  const [bgR, bgV] = slider(0, 100, 5, Math.round(sub.bg * 100), (v) => sp('bg', v / 100), (v) => `${v}%`);
  const [posR, posV] = slider(3, 30, 1, sub.bottom, (v) => sp('bottom', v), (v) => `${v}%`);

  const players = h('span.status', h('i'), 'Checking…'); const status = h('div', { style: { display: 'flex', gap: '16px', flexWrap: 'wrap' } });
  const detect = async () => { try { const d = await window.mb.detectPlayers(); status.replaceChildren(...[['VLC', d.vlc], ['mpv', d.mpv], ['ffmpeg', d.ffmpeg]].map(([n, p]) => h('span.status' + (p ? '.ok' : '.bad'), { title: p || 'not found' }, h('i'), `${n}: ${p ? 'found' : 'not found'}`))); } catch { /* ignore */ } };
  detect();
  const pathInput = (key, ph) => h('label.field', { style: { width: '260px' } }, h('input', { type: 'text', value: P[key], placeholder: ph, 'aria-label': ph, onchange: (e) => { P[key] = e.target.value.trim(); saveSettings('player'); detect(); } }));

  const profList = h('div');
  const drawProf = () => profList.replaceChildren(...S.data.list.map((p) => h('div.srow', avatar(p, 40), h('div.lbl', p.name, h('small', `${p.mylist.length} in list · ${p.history.length} watched`)), iconBtn('edit', 'Edit profile', () => editProfile(p, false, () => { drawProf(); }))))
    , S.data.list.length < 6 ? h('div.srow', h('div.lbl', 'Add a profile', h('small', 'Each profile keeps its own list, history and progress.')), btn('Add', 'tonal', () => editProfile(newProfile('', S.data.list.length), true, drawProf), 'person_add')) : null);
  drawProf();
  const dirLabel = h('span.t-muted', { style: { maxWidth: '280px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', direction: 'rtl' } }, S.settings.downloadDir || '~/Videos/MetroBox');

  page.append(h('div.settings', h('h1.t-headline.page-title', { style: { margin: 0 } }, 'Settings'),
    group('Appearance',
      srow('Theme', 'Follow your system or force a mode.', segmented([['system', 'System', 'contrast'], ['light', 'Light', 'light_mode'], ['dark', 'Dark', 'dark_mode']], T.mode, (v) => th('mode', v))),
      srow('Pure black (AMOLED)', 'Uses true black surfaces in dark mode.', switchCtl(T.amoled, (v) => th('amoled', v), 'AMOLED')),
      srow('Liquid Glass', 'Frosted, translucent surfaces with a soft glossy highlight. Works in light and dark mode; turn it off if the blur feels heavy.', switchCtl(T.glass, (v) => th('glass', v), 'Liquid Glass')),
      srow('Accent color', 'The whole Material 3 palette is generated from this color.', swatches),
      srow('Corner shape', null, segmented([['sharp', 'Sharp'], ['standard', 'Standard'], ['round', 'Round']], T.shape, (v) => th('shape', v))),
      srow('Font', null, select([['roboto', 'Roboto'], ['system', 'System UI'], ['serif', 'Serif'], ['mono', 'Monospace']], T.font, (v) => th('font', v))),
      srow('Poster size', null, cardR, cardV), srow('Interface scale', null, scaleR, scaleV),
      srow('Reduce motion', 'Turns off animations and transitions.', switchCtl(T.reduceMotion, (v) => th('reduceMotion', v), 'Reduce motion'))),
    group('Home',
      srow('Start page', null, select([['home', 'Home'], ['movies', 'Movies'], ['series', 'Series'], ['library', 'Library']], H.startPage, (v) => { H.startPage = v; saveSettings('home'); })),
      srow('Featured billboard', 'Large rotating banner at the top of Home.', switchCtl(H.hero, (v) => { H.hero = v; saveSettings('home'); }, 'Hero')),
      srow('Rotate automatically', null, switchCtl(H.heroAuto, (v) => { H.heroAuto = v; saveSettings('home'); }, 'Auto rotate')),
      srow('Rotation time', null, heroR, heroV),
      srow('“Continue watching” row', null, switchCtl(H.continueRow, (v) => { H.continueRow = v; saveSettings('home'); }, 'Continue row')),
      srow('“My List” row', null, switchCtl(H.listRow, (v) => { H.listRow = v; saveSettings('home'); }, 'List row')),
      srow('Ask “Who’s watching?” on launch', null, switchCtl(H.askProfile, (v) => { H.askProfile = v; saveSettings('home'); }, 'Ask profile'))),
    group('Playback',
      srow('Player', 'The built-in player runs in the app window. VLC and mpv open as their own window.', segmented([['builtin', 'Built-in'], ['vlc', 'VLC'], ['mpv', 'mpv']], P.engine, (v) => { P.engine = v; saveSettings('player'); })),
      srow('If the video can’t be displayed', 'Some streams use HEVC / H.265, which the built-in player can’t draw (you’d get sound only). MetroBox detects this and hands the title to an external player at the same position.', select([['vlc', 'Open in VLC'], ['mpv', 'Open in mpv'], ['ask', 'Ask me']], P.fallback, (v) => { P.fallback = v; saveSettings('player'); })),
      srow('Hardware acceleration', 'Turn this off if video is blank, green or glitchy. Takes effect after a restart.', switchCtl(P.hwAccel !== false, (v) => { P.hwAccel = v; saveSettings('player'); flushNow(); toast('Restart MetroBox to apply.'); }, 'Hardware acceleration'), btn('Restart now', 'tonal', () => { flushNow(); setTimeout(() => window.mb.relaunch(), 300); }, 'refresh')),
      srow('Preferred quality', 'Used as the starting quality; Auto adapts to your connection.', select([['auto', 'Auto'], ['1080', '1080p'], ['720', '720p'], ['480', '480p'], ['360', '360p']], P.quality, (v) => { P.quality = v; saveSettings('player'); })),
      srow('Autoplay next episode', null, switchCtl(P.autoplayNext, (v) => { P.autoplayNext = v; saveSettings('player'); }, 'Autoplay')),
      srow('Resume where you left off', null, switchCtl(P.resume, (v) => { P.resume = v; saveSettings('player'); }, 'Resume')),
      srow('Keep screen awake while playing', null, switchCtl(P.keepAwake, (v) => { P.keepAwake = v; saveSettings('player'); }, 'Keep awake')),
      srow('Start in fullscreen', null, switchCtl(P.autoFullscreen, (v) => { P.autoFullscreen = v; saveSettings('player'); }, 'Fullscreen')),
      srow('Arrow-key seek', null, select([[5, '5 seconds'], [10, '10 seconds'], [15, '15 seconds'], [30, '30 seconds']], P.skip, (v) => { P.skip = +v; saveSettings('player'); })),
      srow('Default speed', null, select([[0.75, '0.75×'], [1, 'Normal'], [1.25, '1.25×'], [1.5, '1.5×']], P.speed, (v) => { P.speed = +v; saveSettings('player'); }))),
    group('Subtitles',
      srow('Pick a subtitle automatically', null, switchCtl(P.subAuto, (v) => { P.subAuto = v; saveSettings('player'); }, 'Auto subtitles')),
      srow('Preferred language', 'Matches the language name in the subtitle list.', h('label.field', { style: { width: '200px' } }, h('input', { type: 'text', value: P.subLang, placeholder: 'English', 'aria-label': 'Preferred subtitle language', onchange: (e) => { P.subLang = e.target.value.trim(); saveSettings('player'); } }))),
      preview, srow('Text size', null, szR, szV), srow('Text color', null, subColors), srow('Background opacity', null, bgR, bgV),
      srow('Outline', null, select([['none', 'None'], ['shadow', 'Shadow'], ['outline', 'Outline']], sub.edge, (v) => sp('edge', v))),
      srow('Font', null, select([['sans', 'Sans'], ['serif', 'Serif'], ['mono', 'Mono']], sub.font, (v) => sp('font', v))),
      srow('Height from bottom', null, posR, posV)),
    group('External players & tools', srow('Detected', 'VLC / mpv for external playback, ffmpeg for downloading DASH streams.', status),
      srow('VLC path', 'Leave empty to use the system one.', pathInput('vlcPath', '/usr/bin/vlc')), srow('mpv path', null, pathInput('mpvPath', '/usr/bin/mpv')), srow('ffmpeg path', null, pathInput('ffmpegPath', '/usr/bin/ffmpeg'))),
    group('Downloads', srow('Save to', null, dirLabel, btn('Change', 'tonal', async () => { const d = await window.mb.pickDir(); if (d) { S.settings.downloadDir = d; saveSettings('settings'); dirLabel.textContent = d; } }, 'folder_open'))),
    group('Profiles', profList),
    group('Data',
      srow('Back up', 'Export settings, lists and watch history to a file.', btn('Export', 'tonal', async () => { if (await window.mb.exportData()) toast('Backup saved'); }, 'upload')),
      srow('Restore', 'Import a MetroBox backup. This replaces your current data.', btn('Import', 'tonal', async () => {
        try { const r = await window.mb.importData(); if (!r) return; if (!(await confirmDialog('Replace current data?', 'Settings, lists and history will be replaced by the backup.', 'Replace', true))) return; await window.mb.save('settings', r.settings); await window.mb.save('profiles', r.profiles); await loadState(); rerender(true); toast('Backup restored'); } catch (e) { toast(e.message); }
      }, 'download')),
      srow('Clear cache', 'Removes cached images and the saved MovieBox session.', btn('Clear', 'tonal', async () => { await window.mb.clearCache(); clearCaches(); toast('Cache cleared'); }, 'delete')),
      srow('Reset settings', 'Restores every option on this page to its default.', btn('Reset', 'error', async () => { if (await confirmDialog('Reset all settings?', 'Your lists and history are kept.', 'Reset', true)) { S.settings = structuredClone(DEFAULTS); saveSettings('theme'); flushNow(); rerender(true); } }, 'restart_alt'))),
    group('About',
      srow('Updates', 'Checks automatically when MetroBox launches and notifies you about new versions and what changed.', btn('Check now', 'tonal', checkNow, 'refresh')),
      srow(h('span', 'MetroBox ', h('b', `v${S.version}`)), 'Made by JayJoice. An unofficial, community-made client built on the MovieBox-TUI project. Not affiliated with MovieBox.', btn('Shortcuts', 'tonal', () => window.dispatchEvent(new CustomEvent('mb-shortcuts')), 'keyboard')),
      S.mock ? srow('Demo mode', 'Running with sample data (MB_MOCK).') : null)));
  drawPrev();
  return { destroy() {} };
}
