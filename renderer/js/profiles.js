import { h, $, icon, btn, iconBtn, dialog, confirmDialog, toast } from './util.js';
import { S, AVATAR, newProfile, switchProfile, saveData, profile } from './state.js';

export function avatar(p, size = 40) {
  return h('div.avatar', { style: { width: `${size}px`, height: `${size}px`, background: p.color, fontSize: `${Math.round(size * 0.5)}px`, borderRadius: size > 60 ? 'var(--r-xl)' : '50%' }, title: p.name }, p.emoji);
}

export function editProfile(p, isNew, done) {
  const draft = { name: p.name, emoji: p.emoji, color: p.color };
  const name = h('md-outlined-text-field', { type: 'text', value: draft.name, maxLength: 20, placeholder: 'Name', 'aria-label': 'Profile name' });
  const preview = h('div', { style: { display: 'flex', justifyContent: 'center' } });
  const emo = h('div.chips'); const col = h('div.swatches', { style: { justifyContent: 'flex-start' } });
  const redraw = () => {
    preview.replaceChildren(avatar({ ...draft, name: name.value }, 88));
    emo.replaceChildren(...AVATAR.EMOJIS.map((e) => h('md-filter-chip.chip.sl', { selected: e === draft.emoji, style: { '--md-filter-chip-label-text-size': '20px' }, onclick: () => { draft.emoji = e; redraw(); } }, e)));
    col.replaceChildren(...AVATAR.COLORS.map((c) => h('button.swatch' + (c === draft.color ? '.sel' : ''), { style: { background: c }, 'aria-label': c, onclick: () => { draft.color = c; redraw(); } })));
  };
  redraw();
  const d = dialog({ title: isNew ? 'New profile' : 'Edit profile', body: h('div', { style: { display: 'flex', flexDirection: 'column', gap: '16px' } }, preview, h('label.field', name), emo, col),
    actions: [...(!isNew && S.data.list.length > 1 ? [{ label: 'Delete', kind: 'text', value: 'del' }] : []), { label: 'Cancel', value: false }, { label: 'Save', kind: 'filled', value: true }],
    onClose: async (v) => {
      if (v === true) { p.name = name.value.trim() || p.name; p.emoji = draft.emoji; p.color = draft.color; if (isNew) { S.data.list.push(p); } saveData('profile'); done && done(); }
      if (v === 'del' && await confirmDialog('Delete profile?', `“${p.name}” and its list and watch history will be removed.`, 'Delete', true)) {
        S.data.list = S.data.list.filter((x) => x.id !== p.id); if (S.data.active === p.id) S.data.active = S.data.list[0].id; saveData('profile'); done && done();
      }
    } });
  setTimeout(() => name.focus(), 50);
  return d;
}

export function showProfilePicker({ onPick, canClose = false } = {}) {
  $('.profiles')?.remove(); let manage = false;
  const list = h('div.pf-list'); const root = h('div.profiles', h('h1.t-display', { style: { fontSize: '40px' } }, 'Who’s watching?'), list);
  const foot = h('div', { style: { display: 'flex', gap: '12px' } });
  const draw = () => {
    list.replaceChildren(...S.data.list.map((p) => h('button.pf.sl', { onclick: () => { if (manage) editProfile(p, false, draw); else { switchProfile(p.id); root.remove(); onPick && onPick(p); } } },
      h('div.pf-av', { style: { background: p.color } }, p.emoji), h('div.t-title-m', p.name), manage ? h('span.pf-edit', icon('edit')) : null)),
    S.data.list.length < 6 ? h('button.pf.sl', { onclick: () => editProfile(newProfile('', S.data.list.length), true, draw) }, h('div.pf-av', { style: { background: 'var(--sc-high)', color: 'var(--on-surface-variant)' } }, icon('person_add')), h('div.t-title-m', 'Add profile')) : null);
    foot.replaceChildren(btn(manage ? 'Done' : 'Manage profiles', manage ? 'filled' : 'outlined', () => { manage = !manage; draw(); }, manage ? 'check' : 'edit'), canClose ? btn('Cancel', 'text', () => root.remove()) : null);
  };
  root.append(foot); draw(); document.body.append(root);
  const esc = (e) => { if (e.key === 'Escape' && canClose && !$('#dialog-layer .scrim')) { root.remove(); document.removeEventListener('keydown', esc); } };
  document.addEventListener('keydown', esc);
}
