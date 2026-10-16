import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { startServer } from '../server/index.js';
import { planMerges, groupReady } from '../server/matchmaker.js';
import { planSolos } from '../server/soloQueue.js';
import { subsetPublic } from '../shared/plugins/ui.js';
import { encodeWire, decodeWire } from '../shared/wireCodec.js';
import { writePlugin } from './helpers/pluginFixtures.js';
import { TestClient } from './helpers/wsClient.js';

const room = (code, content) => ({ code, content, mode: 'coop', difficulty: 'NORMAL', capacity: 4,
  timerScale: 2.5, searching: true, searchSince: 0, hostId: code,
  seats: [{ playerId: code, seat: 0, connected: true, ready: true, content: 'ready' }, null, null, null] });

test('matching isolates content, cosmetics and modes, and respects readiness and consent', () => {
  const content = { cs: 'a'.repeat(64), vanilla: false, plugins: [{ id: 'rules', settings: { n: 1 } }] };
  const a = room('a', content), b = room('b', structuredClone(content));
  assert.equal(planMerges([a, b], 20000).length, 1);
  for (const change of [{ cs: 'b'.repeat(64) }, { vs: 'c'.repeat(64) }, { modeId: 'mode_x_rules_one' },
    { plugins: [{ id: 'rules', settings: { n: 2 } }] }]) {
    b.content = { ...content, ...change };
    assert.deepEqual(planMerges([a, b], 20000), []);
  }
  a.seats[0].content = 'loading';
  assert.equal(groupReady(a), false);
  a.seats[0].content = 'ready';
  a.content = { ...content, trusted: { plugins: [] } };
  assert.equal(groupReady(a), false);
  a.seats[0].consentCs = content.cs;
  assert.equal(groupReady(a), true);
  const entries = Array.from({ length: 3 }, (_, i) => ({ playerId: `s${i}`, difficulty: 'NORMAL', since: 0 }));
  assert.deepEqual(planSolos([a], entries), [], 'public solo queue never joins an opted-in plugin room');
});

test('interface plugins see all twenty seats and new business messages retain compact-v1 JSON fallback', () => {
  const players = Array.from({ length: 20 }, (_, seat) => ({ playerId: `p${seat}`, seat, name: `P${seat}`, lp: 30 }));
  assert.equal(subsetPublic({ players }).players.length, 20);
  for (const msg of [
    { t: 'room.setPlugins', plugins: [{ id: 'rules' }] },
    { t: 'room.contentReady', cs: 'a'.repeat(64), ok: true },
    { t: 'room.consent', cs: 'a'.repeat(64), accept: true },
    { t: 'b.rehearsalResult', taskId: 'task', choice: 2 },
    { t: 'b.rehearsal', taskId: 'task', candidates: [] },
  ]) {
    assert.deepEqual(encodeWire(msg), msg);
    assert.deepEqual(decodeWire(JSON.parse(JSON.stringify(encodeWire(msg)))), msg);
  }
});

test('twenty compact clients start a data-plugin match in its child host with the selected timer scale', { timeout: 45000 }, async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'sp-v030-capacity-'));
  const pluginsDir = path.join(root, 'plugins');
  writePlugin(path.join(pluginsDir, 'rules'), { manifest: 2, version: '1.0.0', app: '*', api: 1,
    class: 'content', permissions: ['data.patch'], data: ['patch.json'] }, { 'patch.json': { patch: 1, ops: [] } });
  const clients = [];
  let srv;
  try {
    srv = await startServer({ port: 0, host: '127.0.0.1', quiet: true, pluginsDir, assetIndex: false,
      noticeFile: null, announcementsDir: path.join(root, 'announcements'), serverSettingsDir: path.join(root, 'settings') });
    const ok = async (client, msg) => {
      let reply;
      try { reply = await client.request(msg, 10000); }
      catch (error) { throw new Error(`${msg.t} for ${client.id}: ${error.message}`, { cause: error }); }
      assert.equal(reply.t, 'ok', `${msg.t}: ${JSON.stringify(reply)}`);
    };
    for (let i = 0; i < 20; i++) {
      const c = await TestClient.connect(srv.url.replace('http', 'ws') + '/ws', { wire: true });
      clients.push(c);
      c.id = (await c.hello(`Compat${i}`)).playerId;
    }
    const host = clients[0];
    await ok(host, { t: 'room.create', mode: 'coop', difficulty: 'NORMAL', capacity: 20, timerScale: 2.5 });
    const first = await host.waitFor('room.state', s => s.hostId === host.id);
    await ok(host, { t: 'room.setPlugins', plugins: [{ id: 'rules' }] });
    const mod = await host.waitFor('room.state', s => s.content?.vanilla === false);
    for (const c of clients.slice(1)) await ok(c, { t: 'room.join', code: first.code });
    assert.equal((await host.request({ t: 'room.start' })).code, 'NOT_READY');
    assert.equal((await clients[19].request({ t: 'room.ready', ready: true })).code, 'CONTENT_NOT_READY');
    for (const c of clients) {
      await ok(c, { t: 'room.contentReady', cs: mod.content.cs, ok: true });
      await ok(c, { t: 'room.ready', ready: true });
    }
    await ok(host, { t: 'room.start' });
    const pub = await clients[19].waitFor('m.public', p => p.phase === 'INFO_CHECK');
    assert.equal(pub.players.length, 20);
    assert.equal(pub.timerScale, 2.5);
    assert.equal(pub.poolGroups.length, 5);
    const active = srv.lobby.rooms.get(first.code);
    assert.equal(active.match.hosted, true);
    assert.equal(active.content.cs, mod.content.cs);
  } finally {
    await Promise.all(clients.map(c => c.terminate().catch(() => {})));
    await srv?.close();
    assert.equal(path.dirname(path.resolve(root)), path.resolve(os.tmpdir()));
    assert.ok(path.basename(root).startsWith('sp-v030-capacity-'));
    fs.rmSync(root, { recursive: true, force: true });
  }
});
