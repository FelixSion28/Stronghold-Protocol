// Pure outfit manifest lookups. Kept separate so loading the roster does not load the renderer asset store.
const isObj = v => v !== null && typeof v === 'object' && !Array.isArray(v);
const str = v => typeof v === 'string' && v ? v : null;
const get = (o, k) => isObj(o) && Object.hasOwn(o, k) ? o[k] : undefined;

export function outfitRec(m, id) {
  const s = str(id);
  if (!s || !s.includes('#')) return null;
  const o = get(m, 'outfits');
  return get(get(o, 'chars'), s) || get(get(o, 'tokens'), s) || null;
}

export function outfitSpine(of, opts) {
  if (validSpine(of.spine)) return of.spine;               // a summon look: one model
  const sp = get(of, 'spine');
  const pick = (opts && opts.back && isObj(get(sp, 'back'))) ? sp.back : get(sp, 'front');
  return validSpine(pick) ? pick : null;
}

export function outfitArtUrl(m, id, kind) {
  const of = outfitRec(m, id);
  return of ? str(get(of, kind)) : null;
}

export function defaultArtUrl(m, charId) {
  return str(get(get(get(get(m, 'outfits'), 'defaults'), str(charId) || ''), 'art'));
}

export function validSpine(sp) {
  return isObj(sp) && typeof sp.skel === 'string' && /^\/[^\s]*\.skel$/.test(sp.skel) && typeof sp.atlas === 'string' && isObj(sp.anims);
}

