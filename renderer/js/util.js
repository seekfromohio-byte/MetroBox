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
  for (const part of m[2].match(/[.#][\w-]+/g) || []) { if (part[0] === '.') el.classList.add(part.slice(1)); else el.id = part.slice(1); }
  for (const [k, v] of Object.entries(props || {})) {
    if (v === undefined || v === null || v === false) continue;
    if (k === 'style' && typeof v === 'object') { for (const [sk, sv] of Object.entries(v)) { if (sk.startsWith('--')) el.style.setProperty(sk, sv); else el.style[sk] = sv; } }
    else if (k === 'dataset') Object.assign(el.dataset, v);
    else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2).toLowerCase(), v);
    else if (k === 'class') v.split(' ').filter(Boolean).forEach((c) => el.classList.add(c));
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
  s.innerHTML = `<svg viewBox="0 -960 960 960" aria-hidden="true"><path d="${d}"/></svg>`;
  return s;
}
export function iconBtn(name, label, onclick, cls = '', fill = false) {
  return h(`button.icon-btn.sl${cls ? `.${cls.split(' ').join('.')}` : ''}`, { title: label, 'aria-label': label, onclick }, icon(name, fill));
}
export function btn(label, kind, onclick, ico, extra = '') {
  return h(`button.btn.sl.${kind}${extra ? `.${extra.split(' ').join('.')}` : ''}`, { onclick }, ico ? icon(ico, kind === 'filled') : null, label);
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
  const el = h('div.menu', { role: 'menu' });
  for (const it of items) {
    if (it.divider) { el.append(h('div.menu-div')); continue; }
    if (it.header) { el.append(h('div.menu-head', it.header)); continue; }
    el.append(h('button.menu-item.sl', { role: 'menuitem', disabled: !!it.disabled, onclick: () => { closeMenus(); it.onClick && it.onClick(); } },
      it.icon ? icon(it.icon) : h('span.chk', it.checked ? icon('check') : null), h('span', { style: { flex: 1 } }, it.label), it.right || null));
  }
  document.body.append(el);
  const r = anchor.getBoundingClientRect(); const w = el.offsetWidth; const hh = el.offsetHeight;
  let x = align === 'right' ? r.right - w : r.left; let y = up ? r.top - hh - 6 : r.bottom + 6;
  if (y + hh > innerHeight - 8) y = Math.max(8, r.top - hh - 6);
  el.style.left = `${clamp(x, 8, innerWidth - w - 8)}px`; el.style.top = `${clamp(y, 8, innerHeight - hh - 8)}px`;
  setTimeout(() => { const off = (e) => { if (!el.contains(e.target)) { closeMenus(); document.removeEventListener('pointerdown', off, true); } }; document.addEventListener('pointerdown', off, true); }, 0);
  return el;
}
export function closeMenus() { $$('.menu').forEach((m) => m.remove()); }

// ---------- dialog
export function dialog({ title, body, actions, wide, onClose }) {
  const layer = $('#dialog-layer');
  const scrim = h('div.scrim', { onpointerdown: (e) => { if (e.target === scrim) close(); } });
  const close = (v) => { scrim.remove(); document.removeEventListener('keydown', esc, true); onClose && onClose(v); };
  const esc = (e) => { if (e.key === 'Escape' && layer.lastElementChild === scrim) { e.stopPropagation(); close(); } };
  document.addEventListener('keydown', esc, true);
  const d = h('div.dialog', { role: 'dialog', 'aria-modal': 'true', style: wide ? { maxWidth: 'min(720px,94vw)', width: '720px' } : {} },
    title ? h('div.t-headline', { style: { fontSize: '24px' } }, title) : null, body,
    actions ? h('div.actions', actions.map((a) => btn(a.label, a.kind || 'text', () => { close(a.value); a.onClick && a.onClick(); }))) : null);
  scrim.append(d); layer.append(scrim);
  return { close, el: d };
}
export const confirmDialog = (title, text, okLabel = 'OK', danger = false) => new Promise((res) => {
  dialog({ title, body: h('p', { class: 't-muted' }, text), onClose: (v) => res(v === true),
    actions: [{ label: 'Cancel', value: false }, { label: okLabel, kind: danger ? 'error' : 'filled', value: true }] });
});

// ---------- form controls
export function switchCtl(value, onChange, label) {
  const b = h('button.switch', { role: 'switch', 'aria-checked': String(!!value), 'aria-label': label || 'toggle', onclick: () => { value = !value; b.setAttribute('aria-checked', String(value)); onChange(value); } });
  return b;
}
export function segmented(options, value, onChange) {
  const el = h('div.seg');
  const render = () => { el.innerHTML = ''; for (const [v, label, ico] of options) el.append(h('button.sl' + (v === value ? '.sel' : ''), { onclick: () => { value = v; render(); onChange(v); } }, v === value ? icon('check') : (ico ? icon(ico) : null), label)); };
  render(); return el;
}
export function slider(min, max, step, value, onInput, fmt = (v) => v) {
  const input = h('input', { type: 'range', min, max, step, value });
  const val = h('span.val', fmt(value));
  const sync = () => input.style.setProperty('--p', `${((input.value - min) / (max - min)) * 100}%`);
  input.addEventListener('input', () => { sync(); val.textContent = fmt(+input.value); onInput(+input.value); }); sync();
  return [input, val];
}
export function select(options, value, onChange) {
  const s = h('select.select', { onchange: () => onChange(s.value) }, options.map(([v, l]) => h('option', { value: v, selected: String(v) === String(value) }, l)));
  return s;
}
export function setSliderFill(input) { input.style.setProperty('--p', `${((input.value - input.min) / (input.max - input.min)) * 100}%`); }
