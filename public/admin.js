const $ = id => document.getElementById(id);
let players = [];
async function api(path, body) {
  const r = await fetch('/api/admin/' + path, body === undefined ? {} : { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  const result = await r.json(); if (!r.ok) { const e = new Error(result.error); e.status = r.status; throw e; } return result;
}
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
    const created = document.createElement('td'); created.textContent = date(p.created_at); tr.append(created); $('players').append(tr);
  });
}
async function load() {
  $('refresh').disabled = true;
  try { players = await api('players'); $('admin-login').hidden = true; $('dashboard').hidden = false; $('admin-logout').hidden = false; $('dashboard-error').textContent = ''; $('last-updated').textContent = 'Cập nhật: ' + new Date().toLocaleString('vi-VN', { timeZone: 'Asia/Bangkok' }) + ' (GMT+7)'; render(); }
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
  const rows = [['Tên', 'Mã người chơi', 'Giới tính', 'Lượt 1', 'Lượt 2', 'Lượt 3', 'Quà đã chọn', 'Thời gian tham gia (GMT+7)', 'Thời gian chốt (GMT+7)'], ...players.map(p => [p.name, p.id, p.gender === 'female' ? 'Nữ' : 'Nam', ...[0, 1, 2].map(i => p.spins[i]?.gift.name || ''), chosen(p)?.name || '', date(p.created_at), p.choice ? date(p.choice.created_at) : ''])];
  const blob = new Blob(['\ufeff' + rows.map(r => r.map(cell).join(',')).join('\r\n')], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob), a = document.createElement('a'); a.href = url; a.download = 'lucky-bloom-nguoi-choi.csv'; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
};
load();
