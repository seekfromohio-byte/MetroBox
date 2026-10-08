// Material 3 color system. Tonal palettes are built in OKLCH with each tone solved to a target CIE L*
// (close to M3's HCT), then mapped onto the standard M3 light/dark color roles.
const lin = (c) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
const gam = (c) => { c = Math.max(0, Math.min(1, c)); return c <= 0.0031308 ? 12.92 * c : 1.055 * c ** (1 / 2.4) - 0.055; };

export function hexToOklch(hex) {
  const h = hex.replace('#', '');
  const [r, g, b] = [0, 2, 4].map((i) => lin(parseInt(h.slice(i, i + 2), 16) / 255));
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  const L = 0.2104542553 * l + 0.7936177850 * m - 0.0040720468 * s;
  const a = 1.9779984951 * l - 2.4285922050 * m + 0.4505937099 * s;
  const bb = 0.0259040371 * l + 0.7827717662 * m - 0.8086757660 * s;
  return [L, Math.hypot(a, bb), ((Math.atan2(bb, a) * 180) / Math.PI + 360) % 360];
}

function oklchLin(L, C, H) {
  const a = C * Math.cos((H * Math.PI) / 180); const b = C * Math.sin((H * Math.PI) / 180);
  const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const s = (L - 0.0894841775 * a - 1.2914855480 * b) ** 3;
  return [4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s, -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s, -0.0041960863 * l - 0.7034186147 * m + 1.7076147010 * s];
}
const lstar = (rgb) => {
  const y = Math.max(0, Math.min(1, 0.2126 * rgb[0] + 0.7152 * rgb[1] + 0.0722 * rgb[2]));
  const f = y > 216 / 24389 ? Math.cbrt(y) : ((24389 / 27) * y + 16) / 116;
  return 116 * f - 16;
};
const inGamut = (rgb) => rgb.every((c) => c >= -0.0005 && c <= 1.0005);
const memo = new Map();

function toneHex(hue, chroma, tone) {
  if (tone <= 0) return '#000000';
  if (tone >= 100) return '#ffffff';
  const key = `${hue}|${chroma}|${tone}`;
  if (memo.has(key)) return memo.get(key);
  let lo = 0; let hi = 1; let c = chroma; let rgb;
  for (let i = 0; i < 40; i++) {
    const mid = (lo + hi) / 2; c = chroma; rgb = oklchLin(mid, c, hue);
    while (!inGamut(rgb) && c > 1e-4) { c *= 0.96; rgb = oklchLin(mid, c, hue); }
    if (lstar(rgb) < tone) lo = mid; else hi = mid;
  }
  rgb = oklchLin((lo + hi) / 2, c, hue);
  const out = `#${rgb.map((v) => Math.round(gam(v) * 255).toString(16).padStart(2, '0')).join('')}`;
  memo.set(key, out); return out;
}

const LIGHT = {
  primary: ['p', 40], 'on-primary': ['p', 100], 'primary-container': ['p', 90], 'on-primary-container': ['p', 10],
  secondary: ['s', 40], 'on-secondary': ['s', 100], 'secondary-container': ['s', 90], 'on-secondary-container': ['s', 10],
  tertiary: ['t', 40], 'on-tertiary': ['t', 100], 'tertiary-container': ['t', 90], 'on-tertiary-container': ['t', 10],
  error: ['e', 40], 'on-error': ['e', 100], 'error-container': ['e', 90], 'on-error-container': ['e', 10],
  surface: ['n', 98], 'on-surface': ['n', 10], 'surface-variant': ['nv', 90], 'on-surface-variant': ['nv', 30], outline: ['nv', 50], 'outline-variant': ['nv', 80],
  'sc-lowest': ['n', 100], 'sc-low': ['n', 96], sc: ['n', 94], 'sc-high': ['n', 92], 'sc-highest': ['n', 90],
  'inverse-surface': ['n', 20], 'inverse-on-surface': ['n', 95], 'inverse-primary': ['p', 80],
};
const DARK = {
  primary: ['p', 80], 'on-primary': ['p', 20], 'primary-container': ['p', 30], 'on-primary-container': ['p', 90],
  secondary: ['s', 80], 'on-secondary': ['s', 20], 'secondary-container': ['s', 30], 'on-secondary-container': ['s', 90],
  tertiary: ['t', 80], 'on-tertiary': ['t', 20], 'tertiary-container': ['t', 30], 'on-tertiary-container': ['t', 90],
  error: ['e', 80], 'on-error': ['e', 20], 'error-container': ['e', 30], 'on-error-container': ['e', 90],
  surface: ['n', 6], 'on-surface': ['n', 90], 'surface-variant': ['nv', 30], 'on-surface-variant': ['nv', 80], outline: ['nv', 60], 'outline-variant': ['nv', 30],
  'sc-lowest': ['n', 4], 'sc-low': ['n', 10], sc: ['n', 12], 'sc-high': ['n', 17], 'sc-highest': ['n', 22],
  'inverse-surface': ['n', 90], 'inverse-on-surface': ['n', 20], 'inverse-primary': ['p', 40],
};
const AMOLED = { surface: '#000000', 'sc-lowest': '#000000', 'sc-low': '#0b0b0d', sc: '#121215', 'sc-high': '#1a1a1e', 'sc-highest': '#232327' };

export function buildScheme(seed, dark, amoled = false) {
  const [, c, h] = hexToOklch(seed);
  const pc = Math.max(0.09, Math.min(c, 0.17));
  const pal = { p: [h, pc], s: [h, pc * 0.33], t: [(h + 60) % 360, pc * 0.5], n: [h, 0.01], nv: [h, 0.02], e: [25, 0.22] };
  const roles = dark ? DARK : LIGHT;
  const out = {};
  for (const [k, [p, t]] of Object.entries(roles)) out[k] = toneHex(+pal[p][0].toFixed(2), +pal[p][1].toFixed(4), t);
  if (dark && amoled) Object.assign(out, AMOLED);
  return out;
}

export const SEEDS = [['#6750A4', 'Violet'], ['#3F6AD8', 'Ocean'], ['#00897B', 'Teal'], ['#2E7D32', 'Forest'], ['#C2185B', 'Rose'], ['#E53935', 'Cinema red'], ['#EF6C00', 'Amber'], ['#8D6E63', 'Mocha']];
const FONTS = { roboto: "Roboto,'Noto Sans',system-ui,sans-serif", system: "system-ui,-apple-system,'Segoe UI','Noto Sans',sans-serif", serif: "Georgia,'Noto Serif','DejaVu Serif',serif", mono: "'JetBrains Mono','DejaVu Sans Mono',ui-monospace,monospace" };
const mq = window.matchMedia('(prefers-color-scheme: dark)');
let current = null;

export function isDark(t) { return t.mode === 'dark' || (t.mode === 'system' && mq.matches); }

export function applyTheme(t) {
  current = t;
  const dark = isDark(t);
  const scheme = buildScheme(t.seed, dark, dark && t.amoled);
  const root = document.documentElement;
  for (const [k, v] of Object.entries(scheme)) root.style.setProperty(`--${k}`, v);
  root.style.setProperty('color-scheme', dark ? 'dark' : 'light');
  root.style.setProperty('--shape', String({ sharp: 0.35, standard: 1, round: 1.5 }[t.shape] ?? 1));
  root.style.setProperty('--card-w', `${t.cardSize}px`);
  root.style.setProperty('--font', FONTS[t.font] || FONTS.roboto);
  root.classList.toggle('reduce-motion', !!t.reduceMotion);
  root.classList.toggle('lg', !!t.glass);
  return scheme;
}
mq.addEventListener('change', () => { if (current && current.mode === 'system') applyTheme(current); });
