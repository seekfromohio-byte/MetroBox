// Cached wrappers around the main-process API.
const homeCache = new Map(); const detailCache = new Map();
const TTL = 10 * 60 * 1000;

export async function getHome(page = 1, force = false) {
  const hit = homeCache.get(page);
  if (hit && !force && Date.now() - hit.t < TTL) return hit.v;
  const v = await window.mb.home(page);
  homeCache.set(page, { t: Date.now(), v }); return v;
}
export function getDetails(id) {
  const hit = detailCache.get(id);
  if (hit && Date.now() - hit.t < TTL) return hit.p;
  const p = window.mb.details(id).catch((e) => { detailCache.delete(id); throw e; });
  detailCache.set(id, { t: Date.now(), p }); return p;
}
export const clearCaches = () => { homeCache.clear(); detailCache.clear(); };
