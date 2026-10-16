const error = message => Object.assign(new Error(message), { status: 400 });
const text = (value, max) => typeof value === 'string' ? value.trim().slice(0, max + 1) : '';
export function setupFulfillment(db, gifts) {
  db.exec(`CREATE TABLE IF NOT EXISTS gift_values(gift_id TEXT PRIMARY KEY, amount INTEGER NOT NULL CHECK(amount>0));
    CREATE TABLE IF NOT EXISTS fulfillment(user_id INTEGER PRIMARY KEY REFERENCES choices(user_id), mode TEXT NOT NULL CHECK(mode IN ('gift','cash')), details TEXT NOT NULL, cash_amount INTEGER, qr BLOB, qr_mime TEXT, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);`);
  db.exec('CREATE TABLE IF NOT EXISTS app_settings(key TEXT PRIMARY KEY, value TEXT NOT NULL)');
  if (!db.prepare('SELECT 1 FROM app_settings WHERE key=?').get('gift_values_initialized')) {
    db.exec('BEGIN IMMEDIATE');
    try {
      for (const gift of gifts) if (Number.isSafeInteger(gift.cashValue) && gift.cashValue >= 1000) db.prepare('INSERT OR IGNORE INTO gift_values VALUES(?,?)').run(gift.id, gift.cashValue);
      db.prepare('INSERT INTO app_settings VALUES(?,?)').run('gift_values_initialized', 'true'); db.exec('COMMIT');
    } catch (e) { db.exec('ROLLBACK'); throw e; }
  }
  function value(id) { return db.prepare('SELECT amount FROM gift_values WHERE gift_id=?').get(id)?.amount ?? null; }
  function catalog() { return gifts.map(g => ({ ...g, cashValue: value(g.id) })); }
  function record(id) {
    const row = db.prepare('SELECT mode,details,cash_amount,qr_mime,created_at FROM fulfillment WHERE user_id=?').get(id);
    return row ? { mode: row.mode, ...JSON.parse(row.details), cashAmount: row.cash_amount, hasQr: !!row.qr_mime, created_at: row.created_at } : null;
  }
  function configure(items) {
    if (!Array.isArray(items) || items.length !== gifts.length || new Set(items.map(i => i?.id)).size !== gifts.length) throw error('Hãy cấu hình đầy đủ danh sách quà.');
    for (const item of items) if (!gifts.some(g => g.id === item?.id) || (item.amount !== null && (!Number.isSafeInteger(item.amount) || item.amount < 1000 || item.amount > 1000000000))) throw error('Giá trị quy đổi phải từ 1.000 đến 1.000.000.000 đồng, hoặc để trống để tắt.');
    db.exec('BEGIN IMMEDIATE');
    try {
      for (const item of items) {
        if (item.amount === null) db.prepare('DELETE FROM gift_values WHERE gift_id=?').run(item.id);
        else db.prepare('INSERT INTO gift_values VALUES(?,?) ON CONFLICT(gift_id) DO UPDATE SET amount=excluded.amount').run(item.id, item.amount);
      }
      db.exec('COMMIT');
    } catch (e) { db.exec('ROLLBACK'); throw e; }
    return catalog();
  }
  function save(id, b) {
    const choice = db.prepare('SELECT c.spin_id,s.gift FROM choices c JOIN spins s ON c.spin_id=s.id WHERE c.user_id=?').get(id);
    if (!choice) throw error('Hãy chốt món quà trước khi điền thông tin nhận.');
    if (b.expectedSpinId !== undefined && b.expectedSpinId !== choice.spin_id) throw Object.assign(new Error('Món quà đã thay đổi. Hãy tải lại trang và xác nhận thông tin nhận cho món mới.'), { status: 409 });
    if (record(id)) throw Object.assign(new Error('Thông tin nhận đã được gửi. Liên hệ người tổ chức nếu cần sửa.'), { status: 409 });
    const details = {}, mode = b.mode;
    let cashAmount = null, qr = null, qrMime = null;
    if (mode === 'gift') {
      details.phone = text(b.phone, 20).replace(/[\s().-]/g, ''); details.address = text(b.address, 500);
      if (!/^(?:0\d{9}|\+84\d{9})$/.test(details.phone)) throw error('Hãy nhập số điện thoại Việt Nam hợp lệ (10 số hoặc +84).');
      if (details.address.length < 10 || details.address.length > 500) throw error('Hãy nhập địa chỉ nhận quà đầy đủ (10–500 ký tự).');
    } else if (mode === 'cash') {
      cashAmount = value(JSON.parse(choice.gift).id);
      if (cashAmount === null) throw error('Món quà này chưa được cấu hình giá trị quy đổi.');
      if (b.expectedAmount !== cashAmount) throw Object.assign(new Error('Giá trị quy đổi vừa thay đổi. Hãy tải lại trang và kiểm tra số tiền trước khi gửi.'), { status: 409 });
      details.method = b.method;
      if (b.method === 'bank') {
        details.bank = text(b.bank, 100); details.account = text(b.account, 40); details.holder = text(b.holder, 100);
        if (details.bank.length < 2 || details.bank.length > 100 || !/^[A-Za-z0-9-]{4,40}$/.test(details.account) || details.holder.length < 2 || details.holder.length > 100) throw error('Hãy nhập ngân hàng, số tài khoản và tên chủ tài khoản hợp lệ.');
      } else if (b.method === 'qr') {
        if (typeof b.qrData !== 'string') throw error('Hãy tải ảnh mã QR nhận tiền.');
        const match = /^data:(image\/(?:png|jpeg|webp));base64,([A-Za-z0-9+/]+={0,2})$/.exec(b.qrData);
        if (!match || match[2].length % 4 !== 0) throw error('Chỉ nhận ảnh PNG, JPEG hoặc WebP.');
        qr = Buffer.from(match[2], 'base64'); qrMime = match[1];
        if (!qr.length || qr.length > 1 * 1024 * 1024) throw error('Ảnh QR phải nhỏ hơn hoặc bằng 1 MB.');
        const valid = qrMime === 'image/png' ? qr.subarray(0, 8).equals(Buffer.from([137,80,78,71,13,10,26,10])) && qr.length >= 24 : qrMime === 'image/jpeg' ? qr[0] === 255 && qr[1] === 216 && qr[2] === 255 && qr.length >= 20 : qr.subarray(0,4).toString() === 'RIFF' && qr.subarray(8,12).toString() === 'WEBP';
        if (!valid) throw error('Nội dung tệp không phải ảnh hợp lệ. Hãy chọn lại ảnh QR.');
      } else throw error('Hãy chọn nhập tài khoản hoặc tải mã QR.');
    } else throw error('Hãy chọn hình thức nhận quà.');
    db.prepare('INSERT INTO fulfillment(user_id,mode,details,cash_amount,qr,qr_mime) VALUES(?,?,?,?,?,?)').run(id, mode, JSON.stringify(details), cashAmount, qr, qrMime);
    return record(id);
  }
  return { value, catalog, configure, record, save };
}
