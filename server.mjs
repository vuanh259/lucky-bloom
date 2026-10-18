import http from 'node:http';
import { setupFulfillment } from './fulfillment.mjs';
import { DatabaseSync } from 'node:sqlite';
import { randomBytes, randomInt, timingSafeEqual, createHash } from 'node:crypto';
import { readFileSync, mkdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(fileURLToPath(import.meta.url));
const hash = value => createHash('sha256').update(value).digest('hex');
const fail = (status, message) => Object.assign(new Error(message), { status });
const same = (a, b) => timingSafeEqual(Buffer.from(hash(a)), Buffer.from(hash(b)));
export function createApp(options = {}) {
  const databasePath = options.databasePath || process.env.DATABASE_PATH || join(root, 'data/lucky-bloom.sqlite');
  if (databasePath !== ':memory:') mkdirSync(dirname(resolve(databasePath)), { recursive: true });
  const db = new DatabaseSync(databasePath);
  db.exec(`PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON;
    CREATE TABLE IF NOT EXISTS users(id INTEGER PRIMARY KEY, username TEXT NOT NULL UNIQUE, name TEXT NOT NULL, gender TEXT NOT NULL CHECK(gender IN ('female','male')), salt TEXT NOT NULL, password TEXT NOT NULL, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
    CREATE TABLE IF NOT EXISTS sessions(token TEXT PRIMARY KEY, user_id INTEGER REFERENCES users(id), role TEXT NOT NULL, expires INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS spins(id INTEGER PRIMARY KEY, user_id INTEGER NOT NULL REFERENCES users(id), turn INTEGER NOT NULL CHECK(turn BETWEEN 1 AND 3), gift TEXT NOT NULL, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, UNIQUE(user_id,turn));
    CREATE TABLE IF NOT EXISTS choices(user_id INTEGER PRIMARY KEY REFERENCES users(id), spin_id INTEGER NOT NULL UNIQUE REFERENCES spins(id), created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);`);
  const gifts = JSON.parse(readFileSync(join(root, 'gifts.json'), 'utf8'));
  if (!Array.isArray(gifts) || gifts.length < 2 || gifts.length > 100 || gifts.some(g => !g.id || !g.name || !/^#[0-9a-f]{6}$/i.test(g.color))) throw new Error('gifts.json không hợp lệ');
  const receiving = setupFulfillment(db, gifts);
  db.exec('CREATE TABLE IF NOT EXISTS prize_structure(id TEXT PRIMARY KEY, label TEXT NOT NULL, quantity INTEGER NOT NULL CHECK(quantity>=0))');
  const defaultPrizes = [["special","Giải đặc biệt",1],["first","Giải nhất",2],["second","Giải nhì",12],["third","Giải ba",12],["encourage","Giải lắt nhắt",15]];
  for (const prize of defaultPrizes) db.prepare('INSERT OR IGNORE INTO prize_structure VALUES(?,?,?)').run(...prize);
  const tierByGift = { surprise:'special', bear:'first', lipstick:'second', flowers:'third', cake:'encourage', tea:'encourage' };
  function prizeStructure() { return defaultPrizes.map(([id]) => db.prepare('SELECT * FROM prize_structure WHERE id=?').get(id)); }
  if(!db.prepare('SELECT 1 FROM app_settings WHERE key=?').get('catalog_20261018')){
    db.exec('BEGIN IMMEDIATE');try{for(const g of gifts){db.prepare('DELETE FROM gift_values WHERE gift_id=?').run(g.id);if(g.cashValue)db.prepare('INSERT INTO gift_values VALUES(?,?)').run(g.id,g.cashValue);}for(const p of defaultPrizes)db.prepare('UPDATE prize_structure SET label=?,quantity=? WHERE id=?').run(p[1],p[2],p[0]);db.prepare('INSERT INTO app_settings VALUES(?,?)').run('catalog_20261018','true');db.exec('COMMIT');}catch(e){db.exec('ROLLBACK');throw e;}
  }
  if(!db.prepare('SELECT 1 FROM app_settings WHERE key=?').get('catalog_icons_20261018')){db.prepare('INSERT OR IGNORE INTO gift_values VALUES(?,?)').run('lemon-tea',10000);db.prepare('INSERT INTO app_settings VALUES(?,?)').run('catalog_icons_20261018','true');}
  if(!db.prepare('SELECT 1 FROM app_settings WHERE key=?').get('wheel_slots_42')){for(const p of defaultPrizes)db.prepare('UPDATE prize_structure SET quantity=? WHERE id=?').run(p[2],p[0]);db.prepare('INSERT INTO app_settings VALUES(?,?)').run('wheel_slots_42','true');}
  const nameKey = name => name.normalize('NFC').trim().replace(/\s+/g,' ').toLocaleLowerCase('vi-VN');
  function viewState(req) {
    let current;
    try { current = session(req); } catch { current = session(req, 'review'); }
    return state(current.user_id, current.role === 'review');
  }
  const adminPassword = options.adminPassword ?? process.env.ADMIN_PASSWORD ?? '';
  const secure = options.secure ?? process.env.COOKIE_SECURE === 'true';
  const limits = new Map();
  function limited(req, route) {
    const key = req.socket.remoteAddress + route, now = Date.now();
    if (limits.size > 10000) for (const [k, v] of limits) if (v.until < now) limits.delete(k);
    const item = limits.get(key);
    if (!item || item.until < now) { limits.set(key, { count: 1, until: now + 60000 }); return; }
    if (++item.count > 25) throw fail(429, 'Bạn thao tác hơi nhanh. Thử lại sau một phút nhé.');
  }
  function cookie(req, name) {
    const match = (req.headers.cookie || '').split(';').map(v => v.trim()).find(v => v.startsWith(name + '='));
    return match ? match.slice(name.length + 1) : '';
  }
  function session(req, role = 'user') {
    const token = cookie(req, role === 'admin' ? 'bloom_admin' : 'bloom_session');
    const s = db.prepare('SELECT * FROM sessions WHERE token=? AND role=? AND expires>?').get(hash(token), role, Date.now());
    if (!s) throw fail(401, role === 'admin' ? 'Bạn cần đăng nhập quản trị để tiếp tục.' : 'Hãy nhập tên và giới tính để vào chơi nhé.');
    return s;
  }
  function startSession(res, userId, role = 'user') {
    const token = randomBytes(32).toString('hex');
    const lifetime = role === 'admin' ? 7 * 86400000 : 365 * 86400000;
    db.prepare('DELETE FROM sessions WHERE expires<?').run(Date.now());
    db.prepare('INSERT INTO sessions VALUES(?,?,?,?)').run(hash(token), userId, role, Date.now() + lifetime);
    res.setHeader('Set-Cookie', `${role === 'admin' ? 'bloom_admin' : 'bloom_session'}=${token}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${lifetime / 1000}${secure ? '; Secure' : ''}`);
  }
  function state(id, readOnly = false) {
    const u = db.prepare('SELECT id,username,name,gender,created_at FROM users WHERE id=?').get(id);
    const spins = db.prepare('SELECT id,turn,gift,created_at FROM spins WHERE user_id=? ORDER BY turn').all(id).map(s => ({ ...s, gift: { ...JSON.parse(s.gift), cashValue: receiving.value(JSON.parse(s.gift).id) } }));
    const choice = db.prepare('SELECT spin_id,created_at FROM choices WHERE user_id=?').get(id) || null;
    const full = receiving.record(id);
    const fulfillment = readOnly && full ? { mode: full.mode, cashAmount: full.cashAmount, redacted: true } : full;
    return { ...u, spins, choice, fulfillment, readOnly, remaining: 3 - spins.length };
  }
  function eligible(req) {
    const s = session(req), u = db.prepare('SELECT * FROM users WHERE id=?').get(s.user_id);
    if (u.gender !== 'female') throw fail(403, 'bai anh em');
    return s.user_id;
  }
  async function body(req, max = 8192) {
    let text = '', length = 0;
    for await (const chunk of req) { length += chunk.length; if (length > max) throw fail(413, 'Dữ liệu quá dài.'); text += chunk; }
    try { return JSON.parse(text || '{}'); } catch { throw fail(400, 'Dữ liệu không hợp lệ.'); }
  }
  const publicFiles = new Map([
    ['/wheel', ['index.html', 'text/html; charset=utf-8']], ['/prizes', ['index.html', 'text/html; charset=utf-8']],
    ['/', ['index.html', 'text/html; charset=utf-8']], ['/bai-anh-em', ['index.html', 'text/html; charset=utf-8']],
    ['/admin', ['admin.html', 'text/html; charset=utf-8']], ['/style.css', ['style.css', 'text/css; charset=utf-8']],
    ['/api-client.js',['api-client.js','text/javascript; charset=utf-8']],['/config.js',['config.js','text/javascript; charset=utf-8']],
    ['/wheel-layout.js',['wheel-layout.js','text/javascript; charset=utf-8']],
    ['/app.js', ['app.js', 'text/javascript; charset=utf-8']], ['/admin.js', ['admin.js', 'text/javascript; charset=utf-8']]
  ]);
  const server = http.createServer(async (req, res) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('Referrer-Policy', 'same-origin');
    res.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; object-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'");
    const url = new URL(req.url, 'http://localhost'), path = url.pathname;
    function json(data, status = 200) { res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' }); res.end(JSON.stringify(data)); }
    try {
      if (req.method === 'POST') {
        if (req.headers['sec-fetch-site'] === 'cross-site') throw fail(403, 'Yêu cầu không hợp lệ.');
        if (req.headers.origin) {
          let origin; try { origin = new URL(req.headers.origin); } catch { throw fail(403, 'Yêu cầu không hợp lệ.'); }
          if (origin.host !== req.headers.host) throw fail(403, 'Yêu cầu không hợp lệ.');
        }
        if (!req.headers['content-type']?.startsWith('application/json')) throw fail(415, 'Chỉ chấp nhận JSON.');
      }
      if (path === '/api/gifts' && req.method === 'GET') return json(receiving.catalog().map(g => ({...g,tier:g.tier || tierByGift[g.id] || 'encourage'})));
      if (path === '/api/prizes' && req.method === 'GET') return json(prizeStructure());
      if (path === '/api/admin/prizes' && req.method === 'GET') { session(req,'admin'); return json(prizeStructure()); }
      if (path === '/api/admin/prizes' && req.method === 'POST') {
        session(req,'admin'); const b = await body(req);
        if (!Array.isArray(b.items) || b.items.length !== defaultPrizes.length || new Set(b.items.map(i=>i?.id)).size !== defaultPrizes.length || b.items.some(i=>!defaultPrizes.some(p=>p[0]===i?.id) || !Number.isSafeInteger(i.quantity) || i.quantity<0 || i.quantity>100000)) throw fail(400,'Số lượng mỗi giải phải là số nguyên từ 0 đến 100.000.');
        db.exec('BEGIN IMMEDIATE');
        try { for (const item of b.items) db.prepare('UPDATE prize_structure SET quantity=? WHERE id=?').run(item.quantity,item.id); db.exec('COMMIT'); } catch(e) { db.exec('ROLLBACK'); throw e; }
        return json(prizeStructure());
      }
      if (path === '/api/leaderboard' && req.method === 'GET') {
        const chosen = db.prepare('SELECT s.gift FROM choices c JOIN spins s ON s.id=c.spin_id').all().map(row => JSON.parse(row.gift).id);
        const entries = receiving.catalog().map(gift => ({ gift: { id: gift.id, name: gift.name, emoji: gift.emoji }, value: gift.cashValue || 0, count: chosen.filter(id => id === gift.id).length })).sort((a,b) => b.value-a.value);
        return json(entries);
      }
      if (path === '/api/fulfillment' && req.method === 'POST') {
        const id = eligible(req); limited(req, 'fulfillment');
        const b = await body(req, 3 * 1024 * 1024);
        receiving.save(id, b); return json(state(id));
      }
      if (path === '/api/admin/gift-values' && req.method === 'GET') { session(req, 'admin'); return json(receiving.catalog()); }
      if (path === '/api/admin/gift-values' && req.method === 'POST') {
        session(req, 'admin'); const b = await body(req); return json(receiving.configure(b.items));
      }
      if (path === '/api/qr' && req.method === 'GET') {
        let own = null, admin = false;
        try { own = session(req).user_id; } catch {}
        try { session(req, 'admin'); admin = true; } catch {}
        const id = Number(url.searchParams.get('userId') || own);
        if (!own && !admin) throw fail(401, 'Bạn cần quyền truy cập để xem ảnh.');
        if (!admin && id !== own) throw fail(403, 'Bạn không được xem ảnh này.');
        const row = db.prepare('SELECT qr,qr_mime FROM fulfillment WHERE user_id=?').get(id);
        if (!row?.qr) throw fail(404, 'Chưa có ảnh QR.');
        res.writeHead(200, { 'Content-Type': row.qr_mime, 'Cache-Control': 'no-store', 'Content-Disposition': 'inline; filename="receive-qr.' + ({'image/png':'png','image/jpeg':'jpg','image/webp':'webp'}[row.qr_mime]) + '"' });
        return res.end(row.qr);
      }
      if (path === '/api/me' && req.method === 'GET') return json(viewState(req));
      if (path === '/api/join' && req.method === 'POST') {
        limited(req, 'join');
        const b = await body(req);
        // Re-entry in this browser always resumes the same record and its spent turns.
        const existing = db.prepare('SELECT user_id FROM sessions WHERE token=? AND role=? AND expires>?').get(hash(cookie(req, 'bloom_session')), 'user', Date.now());

        if (typeof b.name !== 'string') throw fail(400, 'Hãy nhập tên mà người tổ chức nhận ra được.');
        const name = b.name.normalize('NFC').trim().replace(/\s+/g, ' ');
        if (!name || name.length > 80 || /[\u0000-\u001f\u007f]/.test(name)) throw fail(400, 'Hãy nhập tên của bạn (tối đa 80 ký tự).');
        if (!['female', 'male'].includes(b.gender)) throw fail(400, 'Hãy chọn giới tính.');
        const matches = db.prepare('SELECT id,name FROM users WHERE gender=? ORDER BY EXISTS(SELECT 1 FROM choices WHERE choices.user_id=users.id) DESC,id DESC').all(b.gender);
        const match = matches.find(row => nameKey(row.name) === nameKey(name));
        if (match) {
          if (existing?.user_id === match.id) return json(state(match.id));
          startSession(res,match.id,'review'); return json(state(match.id,true));
        }
        // Keep legacy NOT NULL columns to preserve previously saved players and results.
        // These internal IDs are not usernames; visitors do not create credentials.
        const result = db.prepare('INSERT INTO users(username,name,gender,salt,password) VALUES(?,?,?,?,?)').run('guest:' + randomBytes(16).toString('hex'), name, b.gender, '', '');
        const id = Number(result.lastInsertRowid); startSession(res, id); return json(state(id), 201);
      }
      if (path === '/api/leave' && req.method === 'POST') {
        let current; try { current=session(req); } catch { current=session(req,'review'); }
        const player = db.prepare('SELECT gender FROM users WHERE id=?').get(current.user_id);
        // Returning from the goodbye page preserves the saved record and never resets a spinner's turns.
        if (player.gender !== 'male') throw fail(403, 'Không thể đặt lại lượt quay.');
        await body(req);
        db.prepare('DELETE FROM sessions WHERE token=?').run(hash(cookie(req, 'bloom_session')));
        res.setHeader('Set-Cookie', `bloom_session=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0${secure ? '; Secure' : ''}`);
        return json({ ok: true });
      }
      if (path === '/api/spin' && req.method === 'POST') {
        const id = eligible(req); await body(req);
        // Synchronous transaction prevents concurrent requests from spending extra turns.
        db.exec('BEGIN IMMEDIATE');
        try {
          const count = db.prepare('SELECT COUNT(*) AS n FROM spins WHERE user_id=?').get(id).n;
          if (count >= 3) throw fail(409, 'Bạn đã dùng hết 3 lượt quay rồi.');
          const available=prizeStructure().filter(p=>p.quantity>0&&gifts.some(g=>g.tier===p.id));
          const total=available.reduce((n,p)=>n+p.quantity,0);if(!total)throw fail(409,'Vòng quay chưa có giải khả dụng.');
          let pick=randomInt(total),tier;for(const p of available){pick-=p.quantity;if(pick<0){tier=p.id;break;}}
          const options=gifts.filter(g=>g.tier===tier),gift=options[randomInt(options.length)];
          db.prepare('INSERT INTO spins(user_id,turn,gift) VALUES(?,?,?)').run(id, count + 1, JSON.stringify(gift));
          db.exec('COMMIT');
        } catch (e) { db.exec('ROLLBACK'); throw e; }
        return json(state(id));
      }
      if (path === '/api/choose' && req.method === 'POST') {
        const id = eligible(req), b = await body(req);
        db.exec('BEGIN IMMEDIATE');
        try {
          if (db.prepare('SELECT COUNT(*) AS n FROM spins WHERE user_id=?').get(id).n !== 3) throw fail(409, 'Hãy quay đủ 3 lượt trước khi chọn quà nhé.');
          const previous = db.prepare('SELECT spin_id FROM choices WHERE user_id=?').get(id);
          const spin = db.prepare('SELECT id FROM spins WHERE id=? AND user_id=?').get(Number(b.spinId) || 0, id);
          if (!spin) throw fail(400, 'Hãy chọn một món quà từ 3 lượt của bạn.');
          if (previous && previous.spin_id !== spin.id && receiving.record(id)) throw fail(409, 'Bạn đã gửi thông tin nhận quà nên không thể đổi quà nữa.');
          if (!previous || previous.spin_id !== spin.id) {
            // Only unfulfilled choices can change; saved contact/payment information is preserved.
            db.prepare('INSERT INTO choices(user_id,spin_id) VALUES(?,?) ON CONFLICT(user_id) DO UPDATE SET spin_id=excluded.spin_id,created_at=CURRENT_TIMESTAMP').run(id, spin.id);
          }
          db.exec('COMMIT');
        } catch (e) { db.exec('ROLLBACK'); throw e; }
        return json(state(id));
      }
      if (path === '/api/admin/login' && req.method === 'POST') {
        limited(req, 'admin'); const b = await body(req);
        if (adminPassword.length < 12) throw fail(503, 'Trang quản trị chưa được cấu hình. Hãy đặt ADMIN_PASSWORD tối thiểu 12 ký tự trên máy chủ.');
        if (typeof b.password !== 'string' || !same(b.password, adminPassword)) throw fail(401, 'Mật khẩu quản trị chưa đúng.');
        startSession(res, null, 'admin'); return json({ ok: true });
      }
      if (path === '/api/admin/logout' && req.method === 'POST') {
        db.prepare('DELETE FROM sessions WHERE token=?').run(hash(cookie(req, 'bloom_admin')));
        res.setHeader('Set-Cookie', `bloom_admin=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0${secure ? '; Secure' : ''}`); return json({ ok: true });
      }
      if (path === '/api/admin/players' && req.method === 'GET') {
        session(req, 'admin'); const players = db.prepare('SELECT id FROM users ORDER BY id DESC').all().map(u => state(u.id));
        return json(players);
      }
      const file = publicFiles.get(path);
      if (file && req.method === 'GET') { res.writeHead(200, { 'Content-Type': file[1], 'Cache-Control': 'no-cache' }); return res.end(readFileSync(join(root, 'public', file[0]))); }
      json({ error: 'Không tìm thấy trang.' }, 404);
    } catch (e) { if (!e.status) console.error(e); if (!res.headersSent) json({ error: e.status ? e.message : 'Có lỗi máy chủ. Bạn thử lại nhé.' }, e.status || 500); else res.end(); }
  });
  server.on('close', () => db.close());
  return server;
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const server = createApp();
  const port = Number(process.env.PORT || 3000), host = process.env.HOST || '127.0.0.1';
  server.listen(port, host, () => console.log(`Lucky Bloom: http://${host}:${port}`));
}
