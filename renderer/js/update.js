import { h, dialog, toast } from './util.js';
import { S } from './state.js';

/** HyperOS-updater-style dialog: big version, what's new, Download. */
export function showUpdateDialog(u) {
  if (!u || !u.version) return;
  dialog({
    title: `MetroBox ${u.version}`,
    body: h('div', { style: { display: 'flex', flexDirection: 'column', gap: '10px' } },
      h('div.t-label.t-muted', `New version ${u.version} · you have ${u.current || S.version}`),
      u.notes ? h('p.t-body-l', { style: { whiteSpace: 'pre-wrap', margin: 0 } }, u.notes) : h('p.t-body-l.t-muted', { style: { margin: 0 } }, 'No release notes were provided.'),
      h('div.t-label.t-muted', '* The download opens in your browser. Install it with your package manager.')),
    actions: [
      { label: 'Later' },
      u.url ? { label: 'Download', kind: 'filled', onClick: () => window.mb.openUrl(u.url) } : null,
    ].filter(Boolean),
  });
}

/** Listen for updates found at launch. */
export function initUpdates() {
  window.mb.onUpdate((u) => showUpdateDialog(u));
}
