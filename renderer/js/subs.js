// SRT / WebVTT parsing + rendering helpers.
const unesc = (s) => s.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&nbsp;/g, ' ').replace(/&quot;/g, '"');
function clean(t) {
  t = t.replace(/\{\\[^}]*\}/g, '').replace(/<(?!\/?[ibu]>)[^>]*>/g, '');
  t = unesc(t).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  return t.replace(/&lt;(\/?)([ibu])&gt;/g, '<$1$2>').trim();
}
const sec = (h, m, s, ms) => (+(h || 0)) * 3600 + (+m) * 60 + (+s) + (+String(ms).padEnd(3, '0').slice(0, 3)) / 1000;

export function parseSubs(text) {
  const blocks = text.replace(/\r/g, '').replace(/^\uFEFF/, '').split(/\n{2,}/);
  const cues = [];
  const re = /(?:(\d+):)?(\d+):(\d+)[.,](\d+)\s*-->\s*(?:(\d+):)?(\d+):(\d+)[.,](\d+)/;
  for (const b of blocks) {
    const lines = b.split('\n'); const i = lines.findIndex((l) => l.includes('-->'));
    if (i < 0) continue;
    const m = re.exec(lines[i]); if (!m) continue;
    const t = clean(lines.slice(i + 1).join('\n')); if (!t) continue;
    cues.push({ s: sec(m[1], m[2], m[3], m[4]), e: sec(m[5], m[6], m[7], m[8]), t });
  }
  return cues.sort((a, b) => a.s - b.s);
}

export function activeCue(cues, time) {
  let lo = 0; let hi = cues.length - 1; let idx = -1;
  while (lo <= hi) { const mid = (lo + hi) >> 1; if (cues[mid].s <= time) { idx = mid; lo = mid + 1; } else hi = mid - 1; }
  const out = [];
  for (let i = idx; i >= 0 && i > idx - 4; i--) if (cues[i].e > time) out.unshift(cues[i].t);
  return out.join('\n');
}

export const SUB_FONTS = { sans: 'system-ui,Roboto,sans-serif', serif: 'Georgia,serif', mono: "'DejaVu Sans Mono',monospace" };
export function subStyle(sub) {
  const bg = `rgba(0,0,0,${sub.bg})`;
  const edge = { none: 'none', shadow: '0 2px 4px rgba(0,0,0,.95),0 0 2px rgba(0,0,0,.9)', outline: '-1px -1px 0 #000,1px -1px 0 #000,-1px 1px 0 #000,1px 1px 0 #000,0 0 4px #000' }[sub.edge] || 'none';
  return { fontSize: `${Math.round(28 * sub.size / 100)}px`, color: sub.color, background: bg, textShadow: edge, fontFamily: SUB_FONTS[sub.font] || SUB_FONTS.sans, fontWeight: '500' };
}
