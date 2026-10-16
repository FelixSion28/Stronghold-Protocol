// Browser asset-cache coordinator; pure at import time so importing it under Node is safe.
// All expensive work runs in a dedicated worker. UI consumes codes through i18n, never raw errors.
import { validateAssetCatalog, assetCacheError } from '../../shared/assetCache.js';

const initialState = (env) => {
  const supported = !!(env.isSecureContext && env.caches && env.navigator?.serviceWorker
    && env.Worker && env.crypto?.subtle && env.navigator?.locks);
  return { supported, phase: 'idle', error: null,
    totalFiles: 0, readyFiles: 0, totalBytes: 0, readyBytes: 0, missingFiles: 0, missingBytes: 0,
    speedBps: 0, version: null, storage: { usage: 0, quota: 0, persisted: false,
      persistenceSupported: supported && typeof env.navigator?.storage?.persist === 'function' }, playing: false,
    catalogComplete: false, serverMissingFiles: 0, importStats: null, scanStats: null, waiting: false, policy: null,
    persistence: 'idle' };
};

export function createAssetCacheManager({ environment = globalThis, doFetch, workerURL = '/js/asset-cache-worker.js',
  swURL = '/asset-cache-sw.js', catalogURL = '/api/asset-cache/catalog', statusURL = '/api/asset-cache/status' } = {}) {
  const env = environment;
  const state = initialState(env);
  const listeners = new Set();
  const fetcher = doFetch || ((...args) => env.fetch(...args));
  let catalog = null;
  let initialized = false;
  let initializing = null;
  let registration = null;
  let ownPlaying = false;
  let worker = null;
  let task = null;
  let nextID = 0;
  let operation = null;
  let backgroundTimer = null;
  let checkingStorage = null;
  let checkingCatalog = null;
  let persistenceRequest = null;
  const getState = () => ({ ...state, storage: { ...state.storage }, importStats: state.importStats && { ...state.importStats },
    scanStats: state.scanStats && { ...state.scanStats }, policy: state.policy && { ...state.policy } });
  const patch = (next) => {
    Object.assign(state, next);
    for (const fn of [...listeners]) { try { fn(getState()); } catch { /* Consumer must not break cache progress. */ } }
  };

  function timeLimited(promise, ms, code) {
    return new Promise((resolve, reject) => {
      const timer = env.setTimeout(() => reject(assetCacheError(code)), ms);
      promise.then((value) => { env.clearTimeout(timer); resolve(value); }, (error) => { env.clearTimeout(timer); reject(error); });
    });
  }

  async function updateStorage() {
    if (checkingStorage) return checkingStorage;
    checkingStorage = (async () => {
      // Quota and persistence inspection can fail independently in private browser modes.
      const [estimate, persisted] = await Promise.allSettled([
        Promise.resolve().then(() => env.navigator.storage?.estimate?.()),
        Promise.resolve().then(() => env.navigator.storage?.persisted?.()),
      ]);
      patch({ storage: { ...state.storage,
        ...(estimate.status === 'fulfilled' && estimate.value
          ? { usage: estimate.value.usage || 0, quota: estimate.value.quota || 0 } : {}),
        ...(persisted.status === 'fulfilled' && typeof persisted.value === 'boolean'
          ? { persisted: persisted.value } : {}),
      } });
    })();
    try { await checkingStorage; } finally { checkingStorage = null; }
  }

  async function swMessage(type, payload = {}) {
    const target = env.navigator.serviceWorker.controller || registration?.active;
    if (!target) throw assetCacheError('ASSET_CACHE_SW_UNAVAILABLE');
    return new Promise((resolve, reject) => {
      const channel = new env.MessageChannel();
      const timer = env.setTimeout(() => { channel.port1.close(); reject(assetCacheError('ASSET_CACHE_SW_UNAVAILABLE')); }, 10000);
      channel.port1.onmessage = ({ data }) => {
        env.clearTimeout(timer); channel.port1.close();
        if (data?.ok) resolve(data); else reject(assetCacheError(data?.error || 'ASSET_CACHE_STORAGE_ERROR'));
      };
      try { target.postMessage({ type, ...payload }, [channel.port2]); }
      catch (error) { env.clearTimeout(timer); channel.port1.close(); reject(assetCacheError('ASSET_CACHE_SW_UNAVAILABLE', error)); }
    });
  }

  async function refreshCatalog() {
    if (ownPlaying) return catalog;
    if (checkingCatalog) return checkingCatalog;
    checkingCatalog = (async () => {
      const abort = new env.AbortController();
      const timer = env.setTimeout(() => abort.abort(), 15000);
      try {
        const response = await fetcher(catalogURL, { cache: 'no-cache', signal: abort.signal });
        if (!response.ok) throw assetCacheError('ASSET_CACHE_CATALOG_UNAVAILABLE');
        const next = validateAssetCatalog(await response.json());
        if (ownPlaying) return catalog;
        await swMessage('ASSET_CACHE_PIN', { catalog: next, playing: ownPlaying });
        catalog = next;
        patch({ version: next.version, totalFiles: next.totalFiles, totalBytes: next.totalBytes,
          catalogComplete: next.complete, serverMissingFiles: next.missing.length,
          importStats: state.version === next.version ? state.importStats : null });
        return next;
      } catch (error) { throw error.code ? error : assetCacheError('ASSET_CACHE_CATALOG_UNAVAILABLE', error); }
      finally { env.clearTimeout(timer); }
    })();
    try { return await checkingCatalog; } finally { checkingCatalog = null; }
  }

  function stopWorker(code = 'ASSET_CACHE_PAUSED') {
    if (!worker) return;
    worker.terminate(); worker = null;
    const previous = task; task = null;
    previous?.reject(assetCacheError(code));
  }

  function runWorker(action, extra = {}) {
    if (task) throw assetCacheError('ASSET_CACHE_BUSY');
    if (!worker) {
      try { worker = new env.Worker(workerURL); }
      catch (error) { throw assetCacheError('ASSET_CACHE_WORKER_UNAVAILABLE', error); }
      worker.onmessage = ({ data }) => {
        if (!task || data.id !== task.id) return;
        if (data.type === 'progress') {
          const { readyFiles, readyBytes, missingFiles, missingBytes, speedBps, importStats, scanStats, waiting } = data;
          patch({ readyFiles, readyBytes, missingFiles, missingBytes,
            ...(speedBps === undefined ? {} : { speedBps }), ...(importStats ? { importStats } : {}),
            ...(scanStats ? { scanStats } : {}), ...(waiting === undefined ? {} : { waiting }) });
        } else if (data.type === 'done' || data.type === 'error') {
          const finished = task; task = null;
          if (data.type === 'done') finished.resolve(getState());
          else finished.reject(assetCacheError(data.code || 'ASSET_CACHE_STORAGE_ERROR'));
        }
      };
      worker.onerror = () => stopWorker('ASSET_CACHE_WORKER_UNAVAILABLE');
      worker.onmessageerror = () => stopWorker('ASSET_CACHE_WORKER_UNAVAILABLE');
    }
    return new Promise((resolve, reject) => {
      task = { id: ++nextID, resolve, reject };
      try { worker.postMessage({ id: task.id, action, catalog, ...extra }); }
      catch (error) { task = null; reject(assetCacheError('ASSET_CACHE_WORKER_UNAVAILABLE', error)); }
    });
  }

  async function assertMutable() {
    if (ownPlaying || (await swMessage('ASSET_CACHE_CAN_MUTATE')).playing) throw assetCacheError('ASSET_CACHE_PLAYING');
  }

  function passiveScan() {
    if (!initialized || operation || backgroundTimer !== null) return;
    backgroundTimer = env.setTimeout(() => {
      backgroundTimer = null;
      if (!operation) perform('scan', { refresh: false }).catch(() => {});
    }, 1000);
  }

  function onSWMessage({ data }) {
    if (data?.type === 'ASSET_CACHE_PLAYING_CHANGED') {
      patch({ playing: ownPlaying || !!data.playing });
      if (data.playing && operation) pause();
    } else if (data?.type === 'ASSET_CACHE_UPDATED') passiveScan();
  }

  async function initialize({ refresh = true } = {}) {
    if (initialized) {
      if (refresh && !ownPlaying && !operation) return perform('scan', { refresh: true });
      return getState();
    }
    if (initializing) return initializing;
    if (!state.supported) {
      patch({ phase: 'unsupported', error: env.isSecureContext ? 'ASSET_CACHE_UNSUPPORTED' : 'ASSET_CACHE_HTTPS_REQUIRED' });
      return getState();
    }
    initializing = (async () => {
      patch({ phase: 'initializing', error: null });
      try {
        registration = await timeLimited(env.navigator.serviceWorker.register(swURL, { scope: '/', type: 'module', updateViaCache: 'none' }),
          15000, 'ASSET_CACHE_SW_UNAVAILABLE');
        registration = await timeLimited(env.navigator.serviceWorker.ready, 15000, 'ASSET_CACHE_SW_UNAVAILABLE');
        env.navigator.serviceWorker.addEventListener('message', onSWMessage);
        // Register the match guard immediately, including a reconnect directly into a match.
        // Until this document has a catalog it uses the ordinary network path.
        const playback = await swMessage('ASSET_CACHE_PLAYING', { playing: ownPlaying });
        patch({ playing: ownPlaying || !!playback.playing });
        await refreshCatalog();
        if (!catalog) throw assetCacheError('ASSET_CACHE_PLAYING');
        await runWorker('scan');
        initialized = true;
        patch({ phase: state.missingFiles ? 'idle' : 'ready' });
        await updateStorage();
        // Status is optional UI information. Catalog/import remain available when online filling is disabled.
        try {
          const response = await timeLimited(fetcher(statusURL, { cache: 'no-store' }), 10000, 'ASSET_CACHE_CATALOG_UNAVAILABLE');
          if (response.ok) patch({ policy: (await response.json()).policy || null });
        } catch { /* Optional status endpoint must not disable local import. */ }
      } catch (error) {
        const paused = error.code === 'ASSET_CACHE_PLAYING' || error.code === 'ASSET_CACHE_PAUSED';
        patch({ phase: paused ? 'paused' : 'error', error: paused ? null : error.code || 'ASSET_CACHE_STORAGE_ERROR' });
      }
      return getState();
    })();
    try { return await initializing; } finally { initializing = null; }
  }

  async function ensureReady() {
    await initialize({ refresh: false });
    if (!initialized) throw assetCacheError(state.error || 'ASSET_CACHE_UNSUPPORTED');
  }

  async function perform(action, { deep = false, file = null, refresh = false } = {}) {
    await ensureReady();
    if (operation) throw assetCacheError('ASSET_CACHE_BUSY');
    const phase = action === 'import' ? 'importing' : action === 'download' ? 'downloading' : deep ? 'verifying' : 'checking';
    const mutates = action !== 'scan' || deep;
    const job = { paused: false };
    operation = job;
    patch({ phase, error: null, speedBps: 0, waiting: false,
      ...(action === 'import' ? { importStats: null } : {}), ...(deep ? { scanStats: null } : {}) });
    try {
      const run = async () => {
        if (job.paused) throw assetCacheError('ASSET_CACHE_PAUSED');
        if (mutates) {
          await assertMutable();
          await refreshCatalog();
          await assertMutable();
        } else if (refresh && !ownPlaying) await refreshCatalog();
        if (!mutates) {
          const playback = await swMessage('ASSET_CACHE_CAN_MUTATE');
          patch({ playing: ownPlaying || !!playback.playing });
        }
        if (job.paused) throw assetCacheError('ASSET_CACHE_PAUSED');
        if (action === 'clear') {
          await swMessage('ASSET_CACHE_CLEAR');
          patch({ readyFiles: 0, readyBytes: 0, missingFiles: state.totalFiles, missingBytes: state.totalBytes });
        } else {
          await runWorker(action, { deep, ...(file ? { file } : {}) });
          if (action === 'import' || action === 'download') await swMessage('ASSET_CACHE_PRUNE');
        }
      };
      if (mutates) await env.navigator.locks.request('sp-asset-cache-mutation', { ifAvailable: true }, async (lock) => {
        if (!lock) throw assetCacheError('ASSET_CACHE_BUSY');
        await run();
      });
      else await run();
      patch({ phase: state.missingFiles ? 'idle' : 'ready', speedBps: 0, waiting: false });
      return getState();
    } catch (error) {
      const code = job.paused ? 'ASSET_CACHE_PAUSED' : error.code || 'ASSET_CACHE_STORAGE_ERROR';
      patch({ phase: code === 'ASSET_CACHE_PAUSED' ? 'paused' : 'error', error: code === 'ASSET_CACHE_PAUSED' ? null : code,
        speedBps: 0, waiting: false });
      // Pausing is a successful user action, and must not create an unhandled promise rejection.
      if (code === 'ASSET_CACHE_PAUSED') return getState();
      throw assetCacheError(code, error);
    } finally { operation = null; await updateStorage(); }
  }

  function pause() {
    if (operation) operation.paused = true;
    stopWorker();
    if (operation) patch({ phase: 'paused', speedBps: 0, waiting: false, error: null });
  }
  const scan = (options = {}) => operation && !options.deep ? Promise.resolve(getState()) : perform('scan', { refresh: true, ...options });
  const manager = {
    getState, state: getState, initialize, scan,
    subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn); },
    downloadMissing: () => perform('download'),
    importZip(file) {
      if (!(file instanceof env.Blob)) return Promise.reject(assetCacheError('ASSET_CACHE_ZIP_INVALID'));
      return perform('import', { file });
    },
    pause, clear: () => perform('clear'),
    requestPersistence() {
      if (!state.supported || !state.storage.persistenceSupported) {
        patch({ persistence: 'unsupported' });
        return Promise.resolve(false);
      }
      if (state.storage.persisted) {
        patch({ persistence: 'granted' });
        return Promise.resolve(true);
      }
      if (persistenceRequest) return persistenceRequest;

      // Invoke persist() before the first await so browsers retain the user activation.
      let pending;
      patch({ persistence: 'requesting' });
      try { pending = env.navigator.storage.persist(); }
      catch {
        patch({ persistence: 'error' });
        return Promise.resolve(false);
      }
      persistenceRequest = (async () => {
        try {
          const granted = !!await pending;
          await updateStorage();
          patch({ persistence: granted ? 'granted' : 'denied',
            storage: { ...state.storage, persisted: granted || state.storage.persisted } });
          return granted;
        } catch {
          await updateStorage();
          patch({ persistence: 'error' });
          return false;
        } finally { persistenceRequest = null; }
      })();
      return persistenceRequest;
    },
    async setPlaying(value) {
      if (ownPlaying === !!value) return;
      ownPlaying = !!value;
      patch({ playing: ownPlaying });
      if (ownPlaying) pause();
      if (registration) {
        try {
          const result = await swMessage('ASSET_CACHE_PLAYING', { playing: ownPlaying });
          patch({ playing: ownPlaying || !!result.playing });
        } catch { /* No SW must never prevent entering a match. */ }
      }
      if (!ownPlaying && !initialized && !initializing) await initialize({ refresh: false });
      // Do not apply catalog upgrades on this page automatically: assets/data modules may still
      // hold old manifests. Explicit operations in the lobby or a normal reload adopt the new catalog.
    },
    destroy() {
      pause();
      if (backgroundTimer !== null) env.clearTimeout(backgroundTimer);
      env.navigator?.serviceWorker?.removeEventListener('message', onSWMessage);
      listeners.clear();
    },
  };
  return manager;
}

export const assetCache = createAssetCacheManager();
// Imported art in Cache Storage, and the predicate the classic worker in public/sw.js duplicates.
//
// Keep IMPORTED_ASSET_CACHE, IMPORTED_ASSET_CACHE_PREFIX and IMPORTED_ASSET_PATH byte-for-byte in sync with
// public/sw.js. That file is a classic script (not a module) so Firefox 108 and Safari 16.4 can register it; it
// cannot import this module. A unit test fails if the two copies disagree.
//
// The worker serves only same-origin GET of a content-hashed /assets/, /fonts/ or /media/ URL. A hit comes from
// this cache. A miss goes to the network and is not written here. HTML, scripts, /data/, /sim/ and /ws are never
// matched. A Range request is left to the network so audio seeking still reaches the server. What an import stored is
// also listed in one index entry of the cache (IMPORTED_INDEX_URL): Chrome cannot list a cache that large.

/** Cache Storage name. Bump the suffix to drop previously imported bytes on the next activation. */
export const IMPORTED_ASSET_CACHE = 'sp-imported-assets-v1';

/** Prefix of every version of this cache. Activation deletes other names that start with it. */
export const IMPORTED_ASSET_CACHE_PREFIX = 'sp-imported-assets-';

/** Pathname of a URL this cache may answer. The hash is the same 16 hex digits as shared/assetPaths.js. */
export const IMPORTED_ASSET_PATH = /^\/(?:assets|fonts|media)\/~[0-9a-f]{16}\//;

/**
 * Whether a request should be answered from the import cache.
 * `pageOrigin` is the page (and the worker) origin. A relative URL is resolved against it.
 * @param {Request | { url?: string, method?: string, headers?: { get?: Function, range?: string } } | string} request
 * @param {string} [pageOrigin]
 */
export function shouldServeImportedAsset(request, pageOrigin) {
  const method = typeof request === 'string' ? 'GET' : (request?.method || 'GET');
  if (String(method).toUpperCase() !== 'GET') return false;
  if (request && typeof request === 'object' && request.headers) {
    const headers = request.headers;
    const range = typeof headers.get === 'function' ? headers.get('range') : (headers.range || headers.Range);
    if (range) return false;
  }
  const raw = typeof request === 'string' ? request : request?.url;
  if (!raw || !pageOrigin) return false;
  let url;
  try { url = new URL(raw, pageOrigin); } catch { return false; }
  if (url.origin !== pageOrigin) return false;
  return IMPORTED_ASSET_PATH.test(url.pathname);
}

/** Why import is unavailable, or `{ ok: true }` on a secure context that has the APIs. */
export function importSupport(nav = globalThis.navigator, secure = globalThis.isSecureContext) {
  if (!secure) return { ok: false, reason: 'insecure' };
  if (!nav?.serviceWorker || !globalThis.caches || !globalThis.crypto?.subtle) return { ok: false, reason: 'unsupported' };
  return { ok: true };
}

/**
 * Register public/sw.js. Failures are swallowed: a missing worker must not stop the game.
 * Call only from boot. Unit tests import the downloader and must not register a worker as a side effect.
 * @returns {Promise<boolean>}
 */
export function registerImportedAssetWorker(nav = globalThis.navigator, secure = globalThis.isSecureContext) {
  if (!secure || !nav?.serviceWorker?.register) return Promise.resolve(false);
  return nav.serviceWorker.register('/sw.js', { scope: '/', updateViaCache: 'none' }).then(() => true, () => false);
}

/** Content-Type stored with an imported response, chosen from the URL the game will request. */
export function contentTypeFor(url) {
  const path = String(url || '').split('?')[0].toLowerCase();
  if (path.endsWith('.png')) return 'image/png';
  if (path.endsWith('.jpg') || path.endsWith('.jpeg')) return 'image/jpeg';
  if (path.endsWith('.webp')) return 'image/webp';
  if (path.endsWith('.gif')) return 'image/gif';
  if (path.endsWith('.mp3')) return 'audio/mpeg';
  if (path.endsWith('.ogg') || path.endsWith('.oga')) return 'audio/ogg';
  if (path.endsWith('.m4a') || path.endsWith('.aac')) return 'audio/aac';
  if (path.endsWith('.wav')) return 'audio/wav';
  if (path.endsWith('.opus')) return 'audio/ogg';
  if (path.endsWith('.woff2')) return 'font/woff2';
  if (path.endsWith('.woff')) return 'font/woff';
  if (path.endsWith('.css')) return 'text/css; charset=utf-8';
  if (path.endsWith('.json')) return 'application/json';
  if (path.endsWith('.atlas')) return 'text/plain; charset=utf-8';
  return 'application/octet-stream';
}

/** Put one body at each URL. Each put gets its own copy: Cache Storage consumes the body. */
export async function putImportedAsset(cache, urls, bytes, typeFor = contentTypeFor) {
  const body = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  await Promise.all([...urls].map((url) => {
    const copy = body.slice();
    const response = new Response(copy, {
      status: 200,
      headers: { 'Content-Type': typeFor(url) },
    });
    return cache.put(url, response);
  }));
}

function pathnameOf(url) {
  try { return new URL(url, 'http://localhost').pathname; } catch { return ''; }
}

/**
 * The import's own list of the pathnames it stored: a JSON array kept in the import cache at this same-origin path,
 * which the worker never answers (not a hashed /assets/, /fonts/ or /media/ URL). Chrome refuses Cache.keys() for a
 * cache of more than about 15,000 entries ("Operation too large"); a whole pack stores some 43,000 (the audio twice).
 */
export const IMPORTED_INDEX_URL = '/sp-imported-index.json';

/** The index as a Set, or null without a readable one. */
async function readImportIndex(cache) {
  try {
    const hit = await cache.match(IMPORTED_INDEX_URL);
    if (!hit) return null;
    const list = await hit.json();
    return Array.isArray(list) ? new Set(list.filter((p) => typeof p === 'string' && p !== IMPORTED_INDEX_URL)) : null;
  } catch {
    return null;
  }
}

/** Pathnames of Cache.keys() (throws for a cache too large to list). */
async function keyPaths(cache) {
  const out = new Set();
  for (const req of await cache.keys()) {
    const path = pathnameOf(typeof req === 'string' ? req : req.url);
    if (path && path !== IMPORTED_INDEX_URL) out.add(path);
  }
  return out;
}

/**
 * Pathnames currently stored for imported art (assets, fonts and the audio /media/ alias): the import's index, else
 * the cache's keys (a cache written without an index); an empty set when neither can be read.
 */
export async function listImportedPaths(cachesApi = globalThis.caches) {
  if (!cachesApi?.open) return new Set();
  try {
    const cache = await cachesApi.open(IMPORTED_ASSET_CACHE);
    return (await readImportIndex(cache)) ?? await keyPaths(cache);
  } catch {
    return new Set();
  }
}

/**
 * Add the pathnames an import stored to the index (assetPack.js, as an import ends — finished, cancelled or failed).
 * Without an index yet, the cache's keys seed it when Cache.keys() still answers.
 * @param {Cache} cache the open import cache
 * @param {Iterable<string>} paths
 */
export async function addImportedPaths(cache, paths) {
  let all = await readImportIndex(cache);
  if (!all) {
    try { all = await keyPaths(cache); } catch { all = new Set(); }
  }
  for (const p of paths) if (typeof p === 'string' && p && p !== IMPORTED_INDEX_URL) all.add(p);
  await cache.put(IMPORTED_INDEX_URL, new Response(JSON.stringify([...all].sort()), {
    status: 200, headers: { 'Content-Type': 'application/json' },
  }));
}

/** How many imported files are stored, counting /assets/ and /fonts/ only (not the /media/ alias). */
export async function countImportedFiles(cachesApi = globalThis.caches) {
  const paths = await listImportedPaths(cachesApi);
  let n = 0;
  for (const path of paths) {
    if (path.startsWith('/assets/') || path.startsWith('/fonts/')) n++;
  }
  return n;
}

/** Delete every version of the import cache. The worker stays registered. */
export async function clearImportedAssets(cachesApi = globalThis.caches) {
  if (!cachesApi?.delete) return false;
  try {
    if (cachesApi.keys) {
      const names = await cachesApi.keys();
      const ours = names.filter((name) => String(name).startsWith(IMPORTED_ASSET_CACHE_PREFIX));
      if (ours.length) {
        await Promise.all(ours.map((name) => cachesApi.delete(name)));
        return true;
      }
    }
    return await cachesApi.delete(IMPORTED_ASSET_CACHE);
  } catch {
    return false;
  }
}

/** `navigator.storage.estimate()`, or null. `usage` is the whole origin, not only this cache. */
export async function storageEstimate(nav = globalThis.navigator) {
  try {
    const est = await nav?.storage?.estimate?.();
    if (!est) return null;
    return { usage: est.usage || 0, quota: est.quota || 0 };
  } catch {
    return null;
  }
}

/**
 * Ask the browser to keep the origin's storage. The return value is not a promise that the bytes will survive
 * eviction (iOS may still drop them after about seven days).
 * @returns {Promise<boolean | null>}
 */
export async function askPersistStorage(nav = globalThis.navigator) {
  try {
    if (!nav?.storage?.persist) return null;
    return await nav.storage.persist();
  } catch {
    return null;
  }
}
