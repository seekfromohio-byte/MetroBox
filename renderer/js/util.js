import { ICONS } from './icons.js';

export const $ = (s, r = document) => r.querySelector(s);
export const $$ = (s, r = document) => [...r.querySelectorAll(s)];
export const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
export function debounce(fn, ms) { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; }

/** Hyperscript: h('div.card.big#id', {onclick, style:{}, dataset:{}}, ...children) */
export function h(spec, props, ...kids) {
  if (props !== undefined && (props === null || typeof props !== 'object' || props instanceof Node || Array.isArray(props))) { kids.unshift(props); props = null; }
  const m = /^([a-z0-9]*)((?:[.#][\w-]+)*)$/i.exec(spec) || [null, 'div', ''];
  const el = document.createElement(m[1] || 'div');
  const typeScale = { 't-display': 'md-typescale-display-small', 't-headline': 'md-typescale-headline-medium', 't-title-l': 'md-typescale-title-large', 't-title-m': 'md-typescale-title-medium', 't-label': 'md-typescale-label-medium', 't-body-l': 'md-typescale-body-large' };
  const addClass = (name) => { el.classList.add(name); if (typeScale[name]) el.classList.add(typeScale[name]); };
  for (const part of m[2].match(/[.#][\w-]+/g) || []) { if (part[0] === '.') addClass(part.slice(1)); else el.id = part.slice(1); }
  for (const [k, v] of Object.entries(props || {})) {
    if (v === undefined || v === null || v === false) continue;
    if (k === 'style' && typeof v === 'object') { for (const [sk, sv] of Object.entries(v)) { if (sk.startsWith('--')) el.style.setProperty(sk, sv); else el.style[sk] = sv; } }
    else if (k === 'dataset') Object.assign(el.dataset, v);
    else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2).toLowerCase(), v);
    else if (k === 'class') v.split(' ').filter(Boolean).forEach(addClass);
    else if (k in el && k !== 'list' && typeof v !== 'object') el[k] = v;
    else el.setAttribute(k, v === true ? '' : v);
  }
  const add = (k) => { if (k === null || k === undefined || k === false) return; if (Array.isArray(k)) k.forEach(add); else el.append(k instanceof Node ? k : document.createTextNode(String(k))); };
  kids.forEach(add);
  return el;
}

export function icon(name, fill = false) {
  const d = ICONS[fill && ICONS[`${name}-fill`] ? `${name}-fill` : name] || '';
  const s = document.createElement('span'); s.className = 'icon';
  s.slot = 'icon';
  s.innerHTML = `<svg viewBox="0 -960 960 960" aria-hidden="true"><path d="${d}"/></svg>`;
  return s;
}
export function iconBtn(name, label, onclick, cls = '', fill = false) {
  const classes = cls.split(' ').filter(Boolean);
  const variant = classes.includes('filled') ? 'md-filled-icon-button' : classes.includes('tonal') ? 'md-filled-tonal-icon-button' : classes.includes('outlined') ? 'md-outlined-icon-button' : 'md-icon-button';
  const el = h(`${variant}.icon-btn.sl${cls ? `.${classes.join('.')}` : ''}`, { title: label, 'aria-label': label, onclick }, icon(name, fill));
  el.firstElementChild.slot = 'icon';
  return el;
}
export function btn(label, kind, onclick, ico, extra = '') {
  const variant = ({ filled: 'md-filled-button', tonal: 'md-filled-tonal-button', outlined: 'md-outlined-button', text: 'md-text-button', error: 'md-filled-button' })[kind] || 'md-text-button';
  const el = h(`${variant}.btn.sl.${kind}${extra ? `.${extra.split(' ').join('.')}` : ''}`, { onclick }, ico ? icon(ico, kind === 'filled') : null, label);
  if (ico) el.firstElementChild.slot = 'icon';
  return el;
}

export function fmtTime(s) {
  if (!isFinite(s) || s < 0) s = 0;
  s = Math.floor(s); const hh = Math.floor(s / 3600); const mm = Math.floor((s % 3600) / 60); const ss = s % 60;
  return hh ? `${hh}:${String(mm).padStart(2, '0')}:${String(ss).padStart(2, '0')}` : `${mm}:${String(ss).padStart(2, '0')}`;
}
export const fmtBytes = (n) => (n > 1e9 ? `${(n / 1e9).toFixed(2)} GB` : n > 1e6 ? `${(n / 1e6).toFixed(1)} MB` : `${Math.round(n / 1e3)} KB`);
export const epKey = (id, se = 0, ep = 0) => `${id}:${se}:${ep}`;
export const epLabel = (se, ep) => (se || ep ? `S${String(se).padStart(2, '0')}E${String(ep).padStart(2, '0')}` : '');

/** Image with fade-in; falls back to a placeholder icon. */
export function img(src, alt = '') {
  if (!src) return h('span', { style: { display: 'none' } });
  const i = h('img', { alt, loading: 'lazy', decoding: 'async', draggable: false, referrerPolicy: 'no-referrer' });
  i.onload = () => i.classList.add('in');
  i.onerror = () => i.remove();
  if (src) i.src = src;
  return i;
}

// ---------- toast
let toastTimer;
export function toast(msg, { action, onAction, ms = 4200 } = {}) {
  const layer = $('#toast-layer'); layer.innerHTML = '';
  const el = h('div.snackbar', { role: 'status' }, h('span', { style: { flex: 1 } }, msg),
    action ? btn(action, 'text', () => { onAction && onAction(); el.remove(); }) : null,
    iconBtn('close', 'Dismiss', () => el.remove(), 'sm'));
  layer.append(el); clearTimeout(toastTimer); toastTimer = setTimeout(() => el.remove(), ms);
}

// ---------- menu
export function menu(anchor, items, { align = 'left', up = false } = {}) {
  closeMenus();
  const el = h('md-menu.menu');
  for (const it of items) {
    if (it.divider) { el.append(h('md-divider')); continue; }
    const headline = it.header || it.label;
    const row = h(`md-menu-item.menu-item${it.header ? '.menu-head' : ''}`, { disabled: !!it.disabled || !!it.header, onclick: () => { closeMenus(); it.onClick && it.onClick(); } },
      h('span', { slot: 'headline' }, headline));
    if (!it.header && it.icon) { const ic = icon(it.icon); ic.slot = 'start'; row.append(ic); }
    if (!it.header && it.checked) { const checked = icon('check'); checked.slot = 'end'; row.append(checked); }
    if (!it.header && it.right) { it.right.slot = 'trailing-supporting-text'; row.append(it.right); }
    el.append(row);
  }
  document.body.append(el);
  el.anchorElement = anchor;
  el.positioning = 'popover';
  el.anchorCorner = up ? (align === 'right' ? 'start-end' : 'start-start') : (align === 'right' ? 'end-end' : 'end-start');
  el.menuCorner = up ? (align === 'right' ? 'end-end' : 'end-start') : (align === 'right' ? 'start-end' : 'start-start');
  el.open = true;
  return el;
}
export function closeMenus() { $$('#dialog-layer md-menu, body > md-menu').forEach((m) => { m.open = false; m.remove(); }); }

// ---------- dialog
export function dialog({ title, body, actions, wide, onClose }) {
  const layer = $('#dialog-layer');
  let result;
  let settled = false;
  const d = h('md-dialog.dialog', { style: wide ? { '--md-dialog-container-max-width': 'min(720px,94vw)' } : {} },
    title ? h('div.t-headline', { slot: 'headline' }, title) : null,
    body ? h('div.dialog-content', { slot: 'content' }, body) : null,
    actions ? h('div.actions', { slot: 'actions' }, actions.map((a) => btn(a.label, a.kind || 'text', () => { a.onClick && a.onClick(); close(a.value); }))) : null);
  const close = (v) => { result = v; return d.close(v === undefined ? '' : String(v)); };
  d.addEventListener('closed', () => { if (settled) return; settled = true; d.remove(); onClose && onClose(result); });
  d.addEventListener('cancel', () => { result = undefined; });
  layer.append(d);
  d.show();
  return { close, el: d };
}
export const confirmDialog = (title, text, okLabel = 'OK', danger = false) => new Promise((res) => {
  dialog({ title, body: h('p', { class: 't-muted' }, text), onClose: (v) => res(v === true),
    actions: [{ label: 'Cancel', value: false }, { label: okLabel, kind: danger ? 'error' : 'filled', value: true }] });
});

// ---------- form controls
export function switchCtl(value, onChange, label) {
  return h('md-switch.switch', { selected: !!value, 'aria-label': label || 'toggle', onchange: (e) => onChange(!!e.currentTarget.selected) });
}
export function segmented(options, value, onChange) {
  const el = h('div.seg', { role: 'group' });
  const render = () => { el.replaceChildren(); for (const [v, label, ico] of options) {
    const active = v === value;
    const b = h(`${active ? 'md-filled-tonal-button' : 'md-outlined-button'}.seg-item`, { onclick: () => { value = v; render(); onChange(v); } }, ico ? icon(ico) : null, label);
    if (ico) b.firstElementChild.slot = 'icon';
    el.append(b);
  } };
  render(); return el;
}
export function slider(min, max, step, value, onInput, fmt = (v) => v) {
  const input = h('md-slider.slider', { min, max, step, value, 'aria-label': 'Setting value' });
  const val = h('span.val', fmt(value));
  input.addEventListener('input', () => { val.textContent = fmt(+input.value); onInput(+input.value); });
  return [input, val];
}
export function select(options, value, onChange) {
  const s = h('md-outlined-select.select', { value: String(value), 'aria-label': 'Choose an option', onchange: () => onChange(s.value) }, options.map(([v, l]) => h('md-select-option', { value: String(v), headline: l, selected: String(v) === String(value) })));
  return s;
}
export function setSliderFill(input) { input.style.setProperty('--p', `${((input.value - input.min) / (input.max - input.min)) * 100}%`); }
