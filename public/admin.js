const $ = id => document.getElementById(id);
let players = [];
async function api(path,body) { return LuckyBloom.request('admin/'+path,body); }
function date(value) { return new Date(value.replace(' ', 'T') + 'Z').toLocaleString('vi-VN', { timeZone: 'Asia/Bangkok' }); }
function chosen(p) { return p.spins.find(s => s.id === p.choice?.spin_id)?.gift; }
function render() {
  const summary = [[players.length, 'Người tham gia'], [players.filter(p => p.gender === 'female').length, 'Người chơi nữ'], [players.reduce((n, p) => n + p.spins.length, 0), 'Lượt quay đã thực hiện'], [players.filter(p => p.choice).length, 'Món quà đã chốt']];
  $('stats').replaceChildren(); summary.forEach(([n, label]) => { const el = document.createElement('div'); el.className = 'stat'; const strong = document.createElement('strong'); strong.textContent = n; const small = document.createElement('small'); small.textContent = label; el.append(strong, small); $('stats').append(el); });
  const query = $('search').value.toLocaleLowerCase('vi');
  const visible = players.filter(p => (p.name + ' ' + p.id).toLocaleLowerCase('vi').includes(query));
  $('players').replaceChildren(); $('empty').hidden = !!visible.length;
  visible.forEach(p => {
    const tr = document.createElement('tr'), person = document.createElement('td'), name = document.createElement('strong'), username = document.createElement('small'); name.textContent = p.name; username.textContent = 'Mã người chơi #' + p.id; person.append(name, username); tr.append(person);
    const gender = document.createElement('td'), badge = document.createElement('span'); badge.className = 'badge ' + (p.gender === 'male' ? 'male' : ''); badge.textContent = p.gender === 'male' ? 'Nam' : 'Nữ'; gender.append(badge); tr.append(gender);
    for (let i = 0; i < 3; i++) { const td = document.createElement('td'), s = p.spins[i]; td.textContent = s ? `${s.gift.emoji} ${s.gift.name}` : '—'; if (s) td.title = date(s.created_at); tr.append(td); }
    const gift = chosen(p), choice = document.createElement('td'); choice.textContent = gift ? `${gift.emoji} ${gift.name} ✓` : 'Chưa chọn'; if (gift) choice.title = 'Đã chốt: ' + date(p.choice.created_at); tr.append(choice);
    tr.append(receivingCell(p));
    const created = document.createElement('td'); created.textContent = date(p.created_at); tr.append(created); $('players').append(tr);
  });
}
async function load() {
  $('refresh').disabled = true;
  try { players = await api('players'); await loadValues(); await loadStructure(); $('admin-login').hidden = true; $('dashboard').hidden = false; $('admin-logout').hidden = false; $('dashboard-error').textContent = ''; $('last-updated').textContent = 'Cập nhật: ' + new Date().toLocaleString('vi-VN', { timeZone: 'Asia/Bangkok' }) + ' (GMT+7)'; render(); }
  catch (e) { if (e.status === 401) { $('admin-login').hidden = false; $('dashboard').hidden = true; $('admin-logout').hidden = true; } else $('dashboard-error').textContent = e.message; }
  finally { $('refresh').disabled = false; }
}
$('admin-form').onsubmit = async e => {
  e.preventDefault(); $('admin-submit').disabled = true; $('admin-error').textContent = '';
  try { await api('login', { password: $('admin-password').value }); $('admin-password').value = ''; await load(); }
  catch (error) { $('admin-error').textContent = error.message; } finally { $('admin-submit').disabled = false; }
};
$('admin-logout').onclick = async () => { try { await api('logout', {}); players = []; $('players').replaceChildren(); $('stats').replaceChildren(); $('dashboard').hidden = true; $('admin-login').hidden = false; $('admin-logout').hidden = true; } catch (e) { $('dashboard-error').textContent = e.message; } };
$('search').oninput = render; $('refresh').onclick = load;
$('export').onclick = () => {
  // Prefix formula-looking values to avoid spreadsheet formula execution.
  const cell = value => '"' + String(value ?? '').replace(/^[=+@\-\t\r]/, m => "'" + m).replaceAll('"', '""') + '"';
  const rows = [['Tên', 'Mã người chơi', 'Giới tính', 'Lượt 1', 'Lượt 2', 'Lượt 3', 'Quà đã chọn', 'Hình thức nhận', 'Giá trị quy đổi (VNĐ)', 'Số điện thoại', 'Địa chỉ', 'Ngân hàng', 'Số tài khoản', 'Chủ tài khoản', 'Có QR', 'Thời gian tham gia (GMT+7)', 'Thời gian chốt (GMT+7)'], ...players.map(p => [p.name, p.id, p.gender === 'female' ? 'Nữ' : 'Nam', ...[0, 1, 2].map(i => p.spins[i]?.gift.name || ''), chosen(p)?.name || '', p.fulfillment?.mode || '', p.fulfillment?.cashAmount ?? '', p.fulfillment?.phone || '', p.fulfillment?.address || '', p.fulfillment?.bank || '', p.fulfillment?.account || '', p.fulfillment?.holder || '', p.fulfillment?.hasQr ? 'Có (xem trong quản trị)' : '', date(p.created_at), p.choice ? date(p.choice.created_at) : ''])];
  const blob = new Blob(['\ufeff' + rows.map(r => r.map(cell).join(',')).join('\r\n')], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob), a = document.createElement('a'); a.href = url; a.download = 'lucky-bloom-nguoi-choi.csv'; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
};
let valueGifts = [];
async function loadValues() {
  valueGifts = await api('gift-values'); $('value-fields').replaceChildren();
  for (const gift of valueGifts) {
    const label = document.createElement('label'); label.textContent = `${gift.emoji} ${gift.name} (VNĐ)`;
    const input = document.createElement('input'); input.type = 'number'; input.min = '1000'; input.max = '1000000000'; input.step = '1'; input.placeholder = 'Chưa bật quy đổi'; input.value = gift.cashValue ?? ''; input.dataset.gift = gift.id; label.append(input); $('value-fields').append(label);
  }
}
$('value-form').onsubmit = async event => {
  event.preventDefault(); $('save-values').disabled = true; $('value-status').textContent = '';
  try {
    const items = [...$('value-fields').querySelectorAll('input')].map(input => ({ id: input.dataset.gift, amount: input.value === '' ? null : Number(input.value) }));
    valueGifts = await api('gift-values', { items }); $('value-status').textContent = 'Đã lưu giá trị quy đổi. Các thông tin nhận tiền đã gửi giữ nguyên số tiền đã xác nhận.';
  } catch (e) { $('value-status').textContent = e.message; } finally { $('save-values').disabled = false; }
};
function receivingCell(p) {
  const td = document.createElement('td'); td.className = 'receipt-detail'; const f = p.fulfillment;
  if (!f) { td.textContent = p.choice ? 'Chưa gửi thông tin nhận' : '—'; return td; }
  const text = document.createElement('div');
  text.textContent = f.mode === 'gift' ? `🎁 Nhận quà\nSĐT: ${f.phone}\nĐịa chỉ: ${f.address}` : `💸 Quy đổi: ${new Intl.NumberFormat('vi-VN').format(f.cashAmount)} đ\n` + (f.method === 'bank' ? `${f.bank}\nSTK: ${f.account}\nChủ TK: ${f.holder}` : 'Nhận bằng mã QR'); td.append(text);
  if (f.hasQr) {
    const a=document.createElement('button');a.className='text-button';a.textContent='Xem ảnh QR ↗';
    a.onclick=async()=>{
      const dialog=document.createElement('dialog');dialog.className='cute-dialog';const close=document.createElement('button');close.className='outline-button';close.textContent='Đóng';const img=document.createElement('img');img.className='qr-preview';img.alt='Đang tải QR riêng tư';dialog.append(close,img);document.body.append(dialog);dialog.showModal();
      const cleanup=()=>{if(img.src.startsWith('blob:'))URL.revokeObjectURL(img.src);dialog.remove();};close.onclick=()=>dialog.close();dialog.onclose=cleanup;
      try{const url=await LuckyBloom.qr(p.id,true);if(dialog.isConnected)img.src=url;else if(url.startsWith('blob:'))URL.revokeObjectURL(url);}catch(e){img.alt=e.message;}
    };td.append(a);
  }
  const time = document.createElement('small'); time.textContent = 'Gửi: ' + date(f.created_at); td.append(time); return td;
}

async function loadStructure() {
  const items = await api('prizes'); $('structure-fields').replaceChildren();
  for (const item of items) { const label = document.createElement('label'); label.textContent = item.label; const input = document.createElement('input'); input.type='number'; input.min='0'; input.max='100000'; input.step='1'; input.required=true; input.value=item.quantity; input.dataset.prize=item.id; label.append(input); $('structure-fields').append(label); }
}
$('structure-form').onsubmit = async event => {
  event.preventDefault(); $('structure-save').disabled=true;
  try { await api('prizes',{items:[...$('structure-fields').querySelectorAll('input')].map(input=>({id:input.dataset.prize,quantity:Number(input.value)}))}); $('structure-status').textContent='Đã lưu cơ cấu giải.'; } catch(e) { $('structure-status').textContent=e.message; } finally { $('structure-save').disabled=false; }
};
load();
