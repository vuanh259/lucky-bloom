import { test } from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createApp } from '../server.mjs';

async function serve(t, options = {}) {
  const server = createApp({ databasePath: ':memory:', adminPassword: 'test-admin-password', ...options });
  server.listen(0, '127.0.0.1'); await once(server, 'listening');
  t.after(() => new Promise(resolve => { server.closeAllConnections(); server.close(resolve); }));
  return server;
}
function client(server, initialCookie = '') {
  let cookie = initialCookie;
  const request = async (path, body, headers = {}) => {
    const res = await fetch(`http://127.0.0.1:${server.address().port}/api/${path}`, { method: body === undefined ? 'GET' : 'POST', headers: { ...(body === undefined ? {} : { 'Content-Type': 'application/json' }), Cookie: cookie, ...headers }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
    if (res.headers.get('set-cookie')) cookie = res.headers.get('set-cookie').split(';')[0];
    request.cookie = cookie;
    return { status: res.status, data: await res.json(), headers: res.headers };
  };
  return request;
}
const register = (api, name = 'Linh dễ thương', gender = 'female') => api('join', { name, gender });

test('name-only entry gets exactly 3 turns under concurrency and resumes without credentials', async t => {
  const server = await serve(t), api = client(server), outsider = client(server);
  assert.equal((await api('me')).status, 401);
  const reg = await register(api); assert.equal(reg.status, 201); assert.equal(reg.data.remaining, 3);
  assert.ok(reg.headers.get('set-cookie').includes('HttpOnly')); assert.equal(reg.data.password, undefined);
  assert.equal((await api('choose', { spinId: 1 })).status, 409);
  const responses = await Promise.all(Array.from({ length: 8 }, () => api('spin', {})));
  assert.equal(responses.filter(r => r.status === 200).length, 3);
  assert.equal(responses.filter(r => r.status === 409).length, 5);
  const state = (await api('me')).data; assert.deepEqual(state.spins.map(s => s.turn), [1, 2, 3]);
  await register(outsider, 'other');
  for (let i = 0; i < 3; i++) await outsider('spin', {});
  assert.equal((await outsider('choose', { spinId: state.spins[0].id })).status, 400);
  assert.equal((await api('choose', { spinId: state.spins[1].id })).status, 200);
  assert.equal((await api('choose', { spinId: state.spins[2].id })).status, 409);
  const resumed = await register(api, 'Tên khác', 'male');
  assert.equal(resumed.status, 200); assert.equal(resumed.data.name, 'Linh dễ thương');
  assert.equal(resumed.data.gender, 'female');
  assert.equal(resumed.data.remaining, 0); assert.equal(resumed.data.choice.spin_id, state.spins[1].id);
  const sameBrowser = client(server, api.cookie);
  assert.equal((await sameBrowser('me')).data.remaining, 0);
  assert.equal((await api('spin', {})).status, 409);
});

test('male account is saved and cannot spin or choose; admin sees all records', async t => {
  const server = await serve(t), male = client(server), female = client(server), admin = client(server);
  assert.equal((await register(male, 'nam', 'male')).status, 201);
  assert.equal((await male('spin', {})).status, 403); assert.equal((await male('choose', { spinId: 1 })).status, 403);
  await register(female); for (let i = 0; i < 3; i++) await female('spin', {});
  const state = (await female('me')).data; await female('choose', { spinId: state.spins[2].id });
  assert.equal((await male('admin/players')).status, 401);
  assert.equal((await admin('admin/login', { password: 'wrong' })).status, 401);
  assert.equal((await admin('admin/login', { password: 'test-admin-password' })).status, 200);
  const people = (await admin('admin/players')).data;
  assert.equal(people.length, 2); assert.equal(people.find(p => p.gender === 'male').spins.length, 0);
  assert.equal(people.find(p => p.gender === 'female').choice.spin_id, state.spins[2].id);
  assert.ok(people.every(p => !p.password && !p.salt));
  await admin('admin/logout', {}); assert.equal((await admin('admin/players')).status, 401);
});

test('name and gender validation, separate visitors, removed auth, CSRF and admin default', async t => {
  const server = await serve(t, { adminPassword: '' }), api = client(server);
  assert.equal((await api('join', { name: '', gender: 'female' })).status, 400);
  assert.equal((await api('join', { name: 'Linh', gender: 'other' })).status, 400);
  assert.equal((await api('join', { name: 'a'.repeat(81), gender: 'female' })).status, 400);
  assert.equal((await api('register', {})).status, 404);
  assert.equal((await api('login', {})).status, 404);
  assert.equal((await register(api)).status, 201); assert.equal((await register(api)).status, 200);
  const other = client(server), separate = await register(other);
  assert.equal(separate.status, 201); assert.notEqual(separate.data.id, (await api('me')).data.id);
  assert.equal((await api('spin', {}, { Origin: 'https://evil.example' })).status, 403);
  assert.equal((await api('spin', {}, { 'Sec-Fetch-Site': 'cross-site' })).status, 403);
  assert.equal((await api('admin/login', { password: '' })).status, 503);
});

test('SQLite persists across server restarts', async t => {
  const dir = mkdtempSync(join(tmpdir(), 'bloom-test-')), databasePath = join(dir, 'test.sqlite');
  let second;
  t.after(async () => {
    if (second) await new Promise(resolve => { second.closeAllConnections(); second.close(resolve); });
    rmSync(dir, { recursive: true, force: true });
  });
  const first = createApp({ databasePath }); first.listen(0, '127.0.0.1'); await once(first, 'listening');
  const api = client(first); await register(api); await api('spin', {});
  await new Promise(resolve => { first.closeAllConnections(); first.close(resolve); });
  second = createApp({ databasePath }); second.listen(0, '127.0.0.1'); await once(second, 'listening');
  const other = client(second, api.cookie);
  const restored = await other('me');
  assert.equal(restored.status, 200); assert.equal(restored.data.spins.length, 1); assert.equal(restored.data.remaining, 2);
});

test('male visitor can return home and enter again, without resetting female turns', async t => {
  const server = await serve(t), visitor = client(server), admin = client(server);
  const male = await register(visitor, 'Bạn thử nam', 'male');
  assert.equal((await visitor('leave', {})).status, 200);
  assert.equal((await visitor('me')).status, 401);
  const female = await register(visitor, 'Bạn thử nữ', 'female');
  assert.equal(female.status, 201); assert.notEqual(female.data.id, male.data.id);
  await visitor('spin', {});
  assert.equal((await visitor('leave', {})).status, 403);
  assert.equal((await visitor('me')).data.remaining, 2);
  await admin('admin/login', { password: 'test-admin-password' });
  const players = (await admin('admin/players')).data;
  assert.equal(players.length, 2);
  assert.equal(players.find(p => p.id === male.data.id).gender, 'male');
});
