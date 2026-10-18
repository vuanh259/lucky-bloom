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
  request.server=server; return request;
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
  assert.equal((await api('choose', { spinId: state.spins[2].id })).status, 200);
  const resumed = await register(api, '  LINH dễ thương ', 'female');
  assert.equal(resumed.status, 200); assert.equal(resumed.data.name, 'Linh dễ thương');
  assert.equal(resumed.data.gender, 'female');
  assert.equal(resumed.data.remaining, 0); assert.equal(resumed.data.choice.spin_id, state.spins[2].id);
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
  assert.equal(separate.status, 200); assert.equal(separate.data.id, (await api('me')).data.id); assert.equal(separate.data.readOnly, true);
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
  const api = client(first); await register(api);
  for (let i = 0; i < 3; i++) await api('spin', {});
  const player = (await api('me')).data;
  await api('choose', { spinId: player.spins[0].id });
  await api('fulfillment', { mode: 'gift', phone: '0900000000', address: 'Địa chỉ kiểm thử lưu qua restart' });
  await new Promise(resolve => { first.closeAllConnections(); first.close(resolve); });
  second = createApp({ databasePath }); second.listen(0, '127.0.0.1'); await once(second, 'listening');
  const other = client(second, api.cookie);
  const restored = await other('me');
  assert.equal(restored.status, 200); assert.equal(restored.data.spins.length, 3); assert.equal(restored.data.remaining, 0);
  assert.equal(restored.data.fulfillment.address, 'Địa chỉ kiểm thử lưu qua restart');
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

async function completeSpins(api) {
  // These receiving tests require a cash-eligible result, independent of random luck.
  const admin=client(api.server);await admin('admin/login',{password:'test-admin-password'});
  const structure=(await admin('admin/prizes')).data;await admin('admin/prizes',{items:structure.map(p=>({...p,quantity:p.id==='encourage'?1:0}))});
  await register(api);
  for (let i = 0; i < 3; i++) await api('spin', {});
  const player = (await api('me')).data;
  await api('choose', { spinId: player.spins[0].id });
  return player;
}
async function setValues(admin, amount = 50000) {
  await admin('admin/login', { password: 'test-admin-password' });
  const gifts = (await admin('admin/gift-values')).data;
  return admin('admin/gift-values', { items: gifts.map(g => ({ id: g.id, amount:g.id==='surprise'?null:amount })) });
}
test('delivery requires a choice and valid contact details; saves once and is private', async t => {
  const server = await serve(t), visitor = client(server), stranger = client(server), admin = client(server);
  await register(visitor);
  assert.equal((await visitor('fulfillment', { mode: 'gift', phone: '0900000000', address: 'Địa chỉ kiểm thử' })).status, 400);
  for (let i = 0; i < 3; i++) await visitor('spin', {});
  const p = (await visitor('me')).data; await visitor('choose', { spinId: p.spins[0].id });
  assert.equal((await visitor('fulfillment', { mode: 'gift', phone: '123', address: 'abc' })).status, 400);
  const saved = await visitor('fulfillment', { mode: 'gift', phone: '0900000000', address: 'Địa chỉ kiểm thử, không giao hàng' });
  assert.equal(saved.status, 200); assert.equal(saved.data.fulfillment.phone, '0900000000');
  assert.equal(saved.data.fulfillment.mode, 'gift'); assert.equal(saved.data.fulfillment.cashAmount, null);
  assert.equal((await visitor('fulfillment', { mode: 'gift' })).status, 409);
  assert.equal((await stranger('admin/players')).status, 401);
  await setValues(admin);
  assert.equal((await admin('admin/players')).data[0].fulfillment.address, 'Địa chỉ kiểm thử, không giao hàng');
});
test('cash values are admin controlled, validated and frozen on submission', async t => {
  const server = await serve(t), visitor = client(server), admin = client(server);
  const p = await completeSpins(visitor);
  await setValues(admin, null);
  const data = { mode: 'cash', method: 'bank', bank: 'Ngân hàng kiểm thử', account: '000000000001', holder: 'NGUOI KIEM THU', expectedAmount: 50000 };
  assert.equal((await visitor('fulfillment', data)).status, 400);
  assert.equal((await visitor('admin/gift-values', { items: [] })).status, 401);
  assert.equal((await setValues(admin, -1)).status, 400);
  assert.equal((await setValues(admin)).status, 200);
  assert.equal((await visitor('me')).data.spins[0].gift.cashValue, 50000);
  assert.equal((await visitor('fulfillment', { ...data, expectedAmount: 1 })).status, 409);
  assert.equal((await visitor('fulfillment', { ...data, account: '' })).status, 400);
  const saved = await visitor('fulfillment', data); assert.equal(saved.status, 200);
  assert.equal(saved.data.fulfillment.cashAmount, 50000); assert.equal(saved.data.fulfillment.account, '000000000001');
  await setValues(admin, 80000);
  const current = (await visitor('me')).data;
  assert.equal(current.fulfillment.cashAmount, 50000); assert.equal(current.spins[0].gift.cashValue, 80000);
  assert.equal(current.choice.spin_id, p.spins[0].id);
});
test('QR accepts only bounded image data and allows only owner or admin to read', async t => {
  const server = await serve(t), visitor = client(server), stranger = client(server), admin = client(server);
  const p = await completeSpins(visitor); await setValues(admin);
  const data = { mode: 'cash', method: 'qr', expectedAmount: 50000 };
  assert.equal((await visitor('fulfillment', { ...data, qrData: 'data:image/svg+xml;base64,PHN2Zz4=' })).status, 400);
  assert.equal((await visitor('fulfillment', { ...data, qrData: 'data:image/png;base64,bm90LWltYWdl' })).status, 400);
  const qrData = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aX1sAAAAASUVORK5CYII=';
  const saved = await visitor('fulfillment', { ...data, qrData });
  assert.equal(saved.status, 200); assert.equal(saved.data.fulfillment.hasQr, true); assert.equal(saved.data.fulfillment.qrData, undefined);
  const url = `http://127.0.0.1:${server.address().port}/api/qr?userId=${p.id}`;
  const own = await fetch(url, { headers: { Cookie: visitor.cookie } });
  assert.equal(own.status, 200); assert.equal(own.headers.get('Content-Type'), 'image/png'); assert.equal(own.headers.get('Cache-Control'), 'no-store');
  assert.deepEqual(Buffer.from(await own.arrayBuffer()), Buffer.from(qrData.split(',')[1], 'base64'));
  assert.equal((await fetch(url)).status, 401);
  await register(stranger, 'Người khác'); assert.equal((await fetch(url, { headers: { Cookie: stranger.cookie } })).status, 403);
  assert.equal((await fetch(url, { headers: { Cookie: admin.cookie } })).status, 200);
});

test('leaderboard exposes only prize aggregates and sorts by configured value', async t => {
  const server = await serve(t), visitor = client(server), admin = client(server);
  const before = await visitor('leaderboard');
  assert.equal(before.status, 200); assert.equal(before.data.length, 20);
  assert.ok(before.data.every(row => (row.value===null || row.value===0 || row.value >= 1000 && row.value <= 100000) && row.count === 0));
  await completeSpins(visitor);
  await visitor('fulfillment', { mode: 'gift', phone: '0900000000', address: 'Địa chỉ kiểm thử riêng tư' });
  const board = (await client(server)('leaderboard')).data;
  assert.equal(board.reduce((n, row) => n + row.count, 0), 1);
  for (let i = 1; i < board.length; i++) assert.ok(board[i-1].value >= board[i].value);
  assert.ok(board.every(row => Object.keys(row).sort().join(',') === 'count,gift,value'));
  assert.ok(!JSON.stringify(board).includes('0900000000'));
  assert.ok(!JSON.stringify(board).includes('Linh dễ thương'));
});

test('name and gender replay returns results without private payment data or mutation rights', async t => {
  const server=await serve(t), owner=client(server), reviewer=client(server);
  const p=await completeSpins(owner);
  await owner('fulfillment',{mode:'cash',method:'bank',bank:'Ngân hàng kiểm thử',account:'000000000001',holder:'NGUOI KIEM THU',expectedAmount:p.spins[0].gift.cashValue});
  const replay=await register(reviewer,'  LINH dễ thương  ','female');
  assert.equal(replay.status,200); assert.equal(replay.data.id,p.id); assert.equal(replay.data.readOnly,true);
  assert.equal(replay.data.spins.length,3); assert.equal(replay.data.choice.spin_id,p.spins[0].id);
  assert.equal(replay.data.fulfillment.mode,'cash'); assert.equal(replay.data.fulfillment.redacted,true);
  assert.equal(replay.data.fulfillment.account,undefined); assert.equal(replay.data.fulfillment.bank,undefined);
  assert.equal(replay.data.fulfillment.holder,undefined); assert.equal(replay.data.fulfillment.hasQr,undefined);
  assert.equal((await reviewer('me')).data.readOnly,true);
  assert.equal((await reviewer('spin',{})).status,401);
  assert.equal((await reviewer('choose',{spinId:p.spins[0].id})).status,401);
  assert.equal((await reviewer('fulfillment',{mode:'gift'})).status,401);
  assert.equal((await reviewer('qr')).status,401);
  assert.equal((await owner('me')).data.fulfillment.account,'000000000001');
  const wrongGender=await register(client(server),'Linh dễ thương','male');
  assert.equal(wrongGender.status,201); assert.notEqual(wrongGender.data.id,p.id);
});
test('public prize structure has quantities only; only admin can configure it; pages serve', async t => {
  const server=await serve(t), guest=client(server), admin=client(server);
  const prizes=(await guest('prizes')).data;
  assert.deepEqual(prizes.map(p=>p.quantity),[2,3,10,20,60]);
  assert.ok(prizes.every(p=>Object.keys(p).sort().join(',')==='id,label,quantity'));
  assert.equal((await guest('admin/prizes',{items:prizes})).status,401);
  await admin('admin/login',{password:'test-admin-password'});
  assert.equal((await admin('admin/prizes',{items:prizes.map(p=>({...p,quantity:-1}))})).status,400);
  assert.equal((await admin('admin/prizes',{items:prizes.map(p=>({...p,quantity:7}))})).status,200);
  assert.ok((await guest('prizes')).data.every(p=>p.quantity===7));
  for(const path of ['/','/wheel','/prizes?page=2']){
    const res=await fetch('http://127.0.0.1:'+server.address().port+path);
    assert.equal(res.status,200); const html=await res.text();
    assert.ok(html.includes('wish-dialog')); assert.ok(html.includes('receive-dialog'));
    assert.ok(!html.includes('leaderboard-section'));
  }
});


test('gift can change before receiving is submitted; shipping, bank and QR submissions lock it', async t => {
  for (const method of ['gift','bank','qr']) {
    const server=await serve(t), owner=client(server), outsider=client(server), admin=client(server);
    const p=await completeSpins(owner); await setValues(admin);
    const changed=await owner('choose',{spinId:p.spins[1].id});
    assert.equal(changed.status,200); assert.equal(changed.data.choice.spin_id,p.spins[1].id);
    assert.equal(changed.data.fulfillment,null); assert.equal(changed.data.remaining,0);
    const qrData='data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aX1sAAAAASUVORK5CYII=';
    const details=method==='gift'?{mode:'gift',phone:'0900000000',address:'Địa chỉ kiểm thử, shipper giao được'}:method==='bank'?{mode:'cash',method:'bank',bank:'Ngân hàng kiểm thử',account:'000000000001',holder:'NGUOI KIEM THU',expectedAmount:50000}:{mode:'cash',method:'qr',qrData,expectedAmount:50000};
    assert.equal((await owner('fulfillment',{...details,expectedSpinId:p.spins[0].id})).status,409);
    assert.equal((await owner('fulfillment',{...details,expectedSpinId:p.spins[1].id})).status,200);
    const before=(await owner('me')).data;
    assert.equal((await owner('choose',{spinId:p.spins[2].id})).status,409);
    const after=(await owner('me')).data;
    assert.equal(after.choice.spin_id,p.spins[1].id); assert.deepEqual(after.fulfillment,before.fulfillment);
    assert.equal(after.spins.length,3); assert.equal(after.remaining,0);
    assert.equal((await owner('choose',{spinId:p.spins[1].id})).status,200);
    if(method==='qr') assert.equal((await fetch('http://127.0.0.1:'+server.address().port+'/api/qr',{headers:{Cookie:owner.cookie}})).status,200);
    await register(outsider,'Người khác'); for(let i=0;i<3;i++) await outsider('spin',{});
    const other=(await outsider('me')).data;
    assert.equal((await owner('choose',{spinId:other.spins[0].id})).status,400);
    assert.equal((await admin('admin/players')).data.find(row=>row.id===p.id).choice.spin_id,p.spins[1].id);
  }
});

test('special gift cannot be converted even through admin configuration',async t=>{
 const server=await serve(t),admin=client(server),owner=client(server);await admin('admin/login',{password:'test-admin-password'});
 const structure=(await admin('admin/prizes')).data;await admin('admin/prizes',{items:structure.map(p=>({...p,quantity:p.id==='special'?1:0}))});
 const catalog=(await admin('admin/gift-values')).data;assert.equal(catalog.length,20);assert.equal(catalog.find(g=>g.id==='surprise').cashValue,null);
 assert.equal((await admin('admin/gift-values',{items:catalog.map(g=>({id:g.id,amount:g.id==='surprise'?1000:g.cashValue}))})).status,400);
 await register(owner);for(let i=0;i<3;i++)await owner('spin',{});const state=(await owner('me')).data;assert.ok(state.spins.every(s=>s.gift.id==='surprise'));
 await owner('choose',{spinId:state.spins[0].id});assert.equal((await owner('fulfillment',{mode:'cash',expectedAmount:1000})).status,400);
});
