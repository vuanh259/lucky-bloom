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
function client(server) {
  let cookie = '';
  return async (path, body, headers = {}) => {
    const res = await fetch(`http://127.0.0.1:${server.address().port}/api/${path}`, { method: body === undefined ? 'GET' : 'POST', headers: { ...(body === undefined ? {} : { 'Content-Type': 'application/json' }), Cookie: cookie, ...headers }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
    if (res.headers.get('set-cookie')) cookie = res.headers.get('set-cookie').split(';')[0];
    return { status: res.status, data: await res.json(), headers: res.headers };
  };
}
const register = (api, username = 'linh', gender = 'female') => api('register', { username, name: 'Linh dễ thương', password: 'test-password', gender });

test('female account gets exactly 3 turns under concurrency, owns choice, survives login', async t => {
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
  await api('logout', {}); assert.equal((await api('me')).status, 401);
  assert.equal((await api('login', { username: 'linh', password: 'wrong' })).status, 401);
  const login = await api('login', { username: 'LINH', password: 'test-password' });
  assert.equal(login.data.remaining, 0); assert.equal(login.data.choice.spin_id, state.spins[1].id);
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

test('validation, uniqueness, CSRF and disabled admin default', async t => {
  const server = await serve(t, { adminPassword: '' }), api = client(server);
  assert.equal((await api('register', { username: 'x', name: '', password: '123', gender: 'female' })).status, 400);
  assert.equal((await register(api)).status, 201); assert.equal((await register(api)).status, 409);
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
  const other = client(second);
  const restored = await other('login', { username: 'linh', password: 'test-password' });
  assert.equal(restored.status, 200); assert.equal(restored.data.spins.length, 1); assert.equal(restored.data.remaining, 2);
});
