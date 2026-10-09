import test from 'node:test';
import assert from 'node:assert/strict';
import { createAssetCacheManager } from '../public/js/assetCache.js';

const catalog = { schema: 1, version: 'a'.repeat(64), files: [{ url: '/assets/a.png', bytes: 3,
  sha256: 'b'.repeat(64), type: 'image/png', aliases: [] }], totalFiles: 1, totalBytes: 3, complete: true, missing: [] };

function fixture() {
  const messages = [], work = [], listeners = new Map();
  let catalogReads = 0, broken = false, playing = false;
  const sw = { postMessage(data, ports) {
    messages.push(data);
    if (data.type === 'ASSET_CACHE_PLAYING') playing = data.playing;
    ports[0].postMessage({ ok: true, playing });
  } };
  const registration = { active: sw };
  const environment = {
    isSecureContext: true, caches: {}, crypto: globalThis.crypto, Blob, MessageChannel, AbortController,
    setTimeout: (fn, ms) => setTimeout(fn, ms === 1000 ? 1 : ms), clearTimeout,
    navigator: {
      serviceWorker: { controller: sw, ready: Promise.resolve(registration),
        register: async () => registration, addEventListener: (name, fn) => listeners.set(name, fn),
        removeEventListener: (name) => listeners.delete(name) },
      locks: { request: async (_name, _options, fn) => fn({}) },
      storage: { estimate: async () => ({ usage: 1, quota: 1000 }), persisted: async () => false },
    },
    Worker: class {
      postMessage(message) {
        work.push(message);
        setTimeout(() => {
          this.onmessage?.({ data: { id: message.id, type: 'progress', readyFiles: 0, readyBytes: 0, missingFiles: 1, missingBytes: 3 } });
          this.onmessage?.({ data: { id: message.id, type: 'done' } });
        }, 0);
      }
      terminate() { this.onmessage = null; }
    },
  };
  const manager = createAssetCacheManager({ environment, doFetch: async (url) => {
    if (url.includes('catalog')) { catalogReads++; return Response.json(broken ? {} : catalog); }
    return Response.json({ policy: { enabled: false } });
  } });
  return { manager, messages, work, catalogReads: () => catalogReads, broken: (value) => { broken = value; },
    update: () => listeners.get('message')?.({ data: { type: 'ASSET_CACHE_UPDATED' } }) };
}

test('manager initialization errors are retryable and explicit reopens refresh the catalog', async () => {
  const f = fixture();
  try {
    f.broken(true);
    assert.equal((await f.manager.initialize()).error, 'ASSET_CACHE_BAD_CATALOG');
    f.broken(false);
    assert.equal((await f.manager.initialize()).phase, 'idle');
    assert.equal(f.catalogReads(), 2);
    await f.manager.initialize();
    assert.equal(f.catalogReads(), 3, 'explicit reopen adopts changes and checks actual cache');
    assert.equal(f.manager.getState().policy.enabled, false, 'disabled online filling still leaves local import available');
  } finally { f.manager.destroy(); }
});

test('a reconnect already in combat installs its playing guard without adopting a new catalog; lobby return retries', async () => {
  const f = fixture();
  try {
    await f.manager.setPlaying(true);
    assert.equal((await f.manager.initialize()).phase, 'paused');
    assert.equal(f.catalogReads(), 0);
    assert.equal(f.messages.filter((m) => m.type === 'ASSET_CACHE_PLAYING').at(-1).playing, true);
    await f.manager.setPlaying(false);
    assert.equal(f.manager.getState().phase, 'idle'); assert.equal(f.catalogReads(), 1);
    const before = f.messages.length;
    await f.manager.setPlaying(false); await f.manager.setPlaying(false);
    assert.equal(f.messages.length, before, 'high-frequency store emits do not rewrite the playing pin');
  } finally { f.manager.destroy(); }
});

test('passive asset progress notifications inspect local keys without repeatedly downloading the catalog', async () => {
  const f = fixture();
  try {
    await f.manager.initialize();
    f.update(); f.update();
    await new Promise((resolve) => setTimeout(resolve, 30));
    assert.equal(f.catalogReads(), 1);
    assert.equal(f.work.filter((job) => job.action === 'scan').length, 2, 'notifications are coalesced into one local scan');
  } finally { f.manager.destroy(); }
});
