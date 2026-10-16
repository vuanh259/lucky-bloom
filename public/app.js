const $ = id => document.getElementById(id);
let gifts = [], user = null, mode = 'register', selected = null, spinning = false, rotation = 0;
const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
async function api(path, data) {
  const res = await fetch('/api/' + path, data === undefined ? {} : { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) });
  const value = await res.json();
  if (!res.ok) throw new Error(value.error || 'Có lỗi kết nối.');
  return value;
}
function toast(message) { $('toast').textContent = message; $('toast').hidden = false; clearTimeout(toast.timer); toast.timer = setTimeout(() => $('toast').hidden = true, 4500); }
function drawWheel() {
  const canvas = $('wheel'), ctx = canvas.getContext('2d'), size = canvas.width, c = size / 2, r = c - 4, arc = Math.PI * 2 / gifts.length;
  ctx.clearRect(0, 0, size, size);
  gifts.forEach((gift, i) => {
    const start = -Math.PI / 2 + i * arc;
    ctx.beginPath(); ctx.moveTo(c, c); ctx.arc(c, c, r, start, start + arc); ctx.closePath(); ctx.fillStyle = gift.color; ctx.fill();
    ctx.strokeStyle = '#fff9ef'; ctx.lineWidth = 4; ctx.stroke();
    ctx.save(); ctx.translate(c, c); ctx.rotate(start + arc / 2); ctx.translate(r * .69, 0); ctx.rotate(Math.PI / 2);
    ctx.textAlign = 'center'; ctx.fillStyle = '#6b5149'; ctx.font = '54px "Segoe UI Emoji", sans-serif'; ctx.fillText(gift.emoji, 0, 0);
    ctx.font = '500 23px "Segoe UI", sans-serif'; ctx.fillText(gift.name, 0, 40); ctx.restore();
  });
  for (let i = 0; i < 36; i++) { const a = i * Math.PI * 2 / 36; ctx.beginPath(); ctx.arc(c + Math.cos(a) * (r - 14), c + Math.sin(a) * (r - 14), 3.4, 0, Math.PI * 2); ctx.fillStyle = '#fff9ef'; ctx.fill(); }
}
function setMode(next) {
  mode = next; $('auth-error').textContent = ''; $('registration-fields').hidden = mode === 'login';
  $('name').required = mode === 'register';
  document.querySelectorAll('[name=gender]').forEach(el => el.required = mode === 'register');
  $('password').autocomplete = mode === 'register' ? 'new-password' : 'current-password';
  $('auth-submit').textContent = mode === 'register' ? 'Nhận 3 lượt may mắn ↗' : 'Đăng nhập và tiếp tục ♡';
  ['register', 'login'].forEach(m => { $(m + '-tab').classList.toggle('active', m === mode); $(m + '-tab').setAttribute('aria-selected', String(m === mode)); });
}
function render() {
  $('welcome').hidden = !!user; $('play').hidden = !user; $('account').replaceChildren();
  const male = user?.gender === 'male'; $('bye').hidden = !male;
  if (male && location.pathname !== '/bai-anh-em') history.replaceState({}, '', '/bai-anh-em');
  if (!male && location.pathname === '/bai-anh-em') history.replaceState({}, '', '/');
  if (!user) return;
  const name = document.createElement('span'); name.textContent = '♡ ' + user.name;
  const logout = document.createElement('button'); logout.className = 'text-button'; logout.textContent = 'Đăng xuất'; logout.onclick = signOut;
  $('account').append(name, logout); if (male) return;
  $('greeting').textContent = `Chào ${user.name} ♡`;
  $('play-hint').textContent = user.choice ? 'Một món quà nhỏ đang chờ đến tay bạn.' : user.remaining ? `Bạn còn ${user.remaining} lượt khám phá điều dễ thương.` : 'Ba điều dễ thương đã ở đây. Bạn thích món nào nhất?';
  $('turns').replaceChildren();
  for (let i = 0; i < 3; i++) { const el = document.createElement('div'); el.className = 'turn-chip' + (i < user.spins.length ? ' used' : ''); el.textContent = i < user.spins.length ? '✓ Lượt ' + (i + 1) : '✧ Lượt ' + (i + 1); $('turns').append(el); }
  $('spin').hidden = !user.remaining; $('spin').disabled = spinning;
  $('result-count').textContent = `${user.spins.length} / 3`;
  $('selection-hint').textContent = user.choice ? 'Món quà đã chốt được lưu cho người tổ chức.' : user.remaining ? 'Quay đủ 3 lượt rồi chọn món bạn yêu nhất nhé.' : 'Chạm vào một món quà, rồi bấm chốt để xác nhận.';
  $('results').replaceChildren();
  if (!user.spins.length) { const empty = document.createElement('div'); empty.className = 'empty-gift'; empty.textContent = '🎁 Giỏ quà đang chờ vòng quay đầu tiên'; $('results').append(empty); }
  user.spins.forEach(spin => {
    const isSelected = user.choice ? user.choice.spin_id === spin.id : selected === spin.id;
    const button = document.createElement('button'); button.className = 'gift-option' + (isSelected ? ' selected' : ''); button.disabled = !!user.choice || !!user.remaining || spinning; button.setAttribute('aria-pressed', String(isSelected));
    const icon = document.createElement('span'); icon.className = 'gift-icon'; icon.textContent = spin.gift.emoji;
    const text = document.createElement('span'), title = document.createElement('strong'), sub = document.createElement('small'); title.textContent = spin.gift.name; sub.textContent = 'Kết quả lượt ' + spin.turn; text.append(title, sub);
    const check = document.createElement('span'); check.className = 'check'; check.textContent = isSelected ? '♥' : '○'; button.append(icon, text, check);
    button.onclick = () => { selected = spin.id; render(); }; $('results').append(button);
  });
  $('confirm-gift').hidden = !!user.choice || !!user.remaining; $('confirm-gift').disabled = !selected || spinning;
  $('chosen').hidden = !user.choice;
  if (user.choice) { const gift = user.spins.find(s => s.id === user.choice.spin_id).gift; $('chosen').replaceChildren(); const b = document.createElement('b'); b.textContent = `${gift.emoji} ${gift.name}`; const p = document.createElement('span'); p.textContent = 'Đã chốt quà! Người tổ chức đã có lựa chọn của bạn ♡'; $('chosen').append(b, p); }
}
async function signOut() {
  try { await api('logout', {}); user = null; selected = null; render(); } catch (e) { toast(e.message); }
}
$('bye-logout').onclick = signOut;
$('register-tab').onclick = () => setMode('register'); $('login-tab').onclick = () => setMode('login');
$('show-password').onclick = () => { const show = $('password').type === 'password'; $('password').type = show ? 'text' : 'password'; $('show-password').setAttribute('aria-label', show ? 'Ẩn mật khẩu' : 'Hiện mật khẩu'); };
$('auth-form').onsubmit = async event => {
  event.preventDefault(); $('auth-submit').disabled = true; $('auth-error').textContent = '';
  try { const data = Object.fromEntries(new FormData(event.currentTarget)); user = await api(mode === 'register' ? 'register' : 'login', data); $('password').value = ''; selected = null; render(); }
  catch (e) { $('auth-error').textContent = e.message; }
  finally { $('auth-submit').disabled = false; }
};
$('spin').onclick = async () => {
  if (spinning) return; spinning = true; $('spin').disabled = true; $('spin').textContent = 'May mắn đang đến…'; $('play-error').textContent = '';
  try {
    const next = await api('spin', {}), result = next.spins.at(-1), index = gifts.findIndex(g => g.id === result.gift.id), segment = 360 / gifts.length;
    const target = (360 - (index + .5) * segment) % 360;
    rotation += 360 * 5 + (target - rotation % 360 + 360) % 360;
    $('wheel').style.transform = `rotate(${rotation}deg)`;
    await new Promise(resolve => setTimeout(resolve, reduceMotion ? 60 : 4300));
    user = next; toast(`${result.gift.emoji} Bạn quay được ${result.gift.name}!`);
    document.body.classList.add('celebrate'); setTimeout(() => document.body.classList.remove('celebrate'), 1900);
  } catch (e) {
    $('play-error').textContent = e.message;
    // A request may have been committed even if its response was interrupted.
    try { user = await api('me'); } catch { /* The error above remains visible. */ }
  } finally { spinning = false; $('spin').textContent = 'Quay nào! ✧'; render(); }
};
$('confirm-gift').onclick = async () => {
  if (!selected || spinning) return;
  const gift = user.spins.find(s => s.id === selected).gift;
  if (!confirm(`Bạn chốt ${gift.name} nhé? Sau khi chốt sẽ không đổi được.`)) return;
  $('confirm-gift').disabled = true; $('play-error').textContent = '';
  try { user = await api('choose', { spinId: selected }); render(); toast('Đã lưu món quà bạn chọn ♡'); }
  catch (e) { $('play-error').textContent = e.message; try { user = await api('me'); } catch {} render(); }
};
async function init() {
  try {
    gifts = await api('gifts'); drawWheel();
    const res = await fetch('/api/me');
    if (res.ok) user = await res.json(); else if (res.status !== 401) throw new Error('Chưa tải được tài khoản. Hãy tải lại trang.');
    render();
  } catch (e) { $('auth-error').textContent = e.message || 'Chưa kết nối được máy chủ. Hãy tải lại trang.'; $('auth-submit').disabled = true; }
}
init();
