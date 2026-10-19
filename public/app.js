import {setGiftArt,preloadGiftArt,giftImages} from './gift-art.js';
import {buildWheelLayout} from './wheel-layout.js';
const $ = id => document.getElementById(id);
let gifts = [], user = null, selected = null, spinning = false, rotation = 0;
const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
async function api(path,data) { return LuckyBloom.request(path,data); }
function toast(message) { $('toast').textContent = message; $('toast').hidden = false; clearTimeout(toast.timer); toast.timer = setTimeout(() => $('toast').hidden = true, 4500); }
const tierNames={special:'Đặc biệt',first:'Giải nhất',second:'Giải nhì',third:'Giải ba',encourage:'Lắt nhắt'};
function wheelSegments(){return buildWheelLayout(gifts,structure);}
function drawWheel(){
 const canvas=$('wheel'),ctx=canvas.getContext('2d'),c=canvas.width/2,r=c-4;ctx.clearRect(0,0,canvas.width,canvas.height);
 for(const gift of wheelSegments()){
  const start=-Math.PI/2+gift.start;ctx.beginPath();ctx.moveTo(c,c);ctx.arc(c,c,r,start,start+gift.arc);ctx.closePath();ctx.fillStyle=gift.color;ctx.fill();ctx.strokeStyle='#fff9ef';ctx.lineWidth=3;ctx.stroke();
  ctx.save();ctx.translate(c,c);ctx.rotate(start+gift.arc/2);ctx.translate(r*.79,0);ctx.rotate(Math.PI/2);ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillStyle='#523e3b';ctx.font=gift.tier==='special'?'bold 62px "Segoe UI",sans-serif':'42px "Segoe UI Emoji",sans-serif';if(gift.tier!=='special'&&giftImages.has(gift.id)){ctx.drawImage(giftImages.get(gift.id),-25,-25,50,50);}else ctx.fillText(gift.tier==='special'?'?':gift.emoji,0,0,48);ctx.restore();
 }
 canvas.setAttribute('aria-label','Vòng quay gồm '+wheelSegments().length+' ô quà xen kẽ loại giải. Giải đặc biệt là dấu hỏi.');
 $('wheel-legend').replaceChildren();for(const p of structure){const badge=document.createElement('span');badge.className='tier-badge';badge.style.backgroundColor=gifts.find(g=>g.tier===p.id)?.color||'#eee';badge.textContent=p.label;$('wheel-legend').append(badge);}
}

function showSpinResult(gift){setGiftArt($('spin-result-icon'),gift);$('spin-result-name').textContent=gift.name;$('spin-result-tier').textContent=structure.find(p=>p.id===gift.tier)?.label||'Phần quà';$('spin-result-tier').style.backgroundColor=gift.color;$('spin-result-dialog').showModal();}

function render() {
  $('welcome').hidden = false; $('play').hidden = !user; $('account').replaceChildren();
  const male = user?.gender === 'male'; $('bye').hidden = !male;
  if (male && LuckyBloom.path() !== '/bai-anh-em') LuckyBloom.navigate('/bai-anh-em',true);
  if (!male && LuckyBloom.path() === '/bai-anh-em') LuckyBloom.navigate('/',true);
  renderPages();
  if (!user) return;
  const name = document.createElement('span'); name.textContent = '♡ ' + user.name;
  $('account').append(name); if (male) return;
  $('greeting').textContent = `Chào ${user.name} ♡`;
  $('play-hint').textContent = user.choice ? 'Một món quà nhỏ đang chờ đến tay bạn.' : user.remaining ? `Bạn còn ${user.remaining} lượt khám phá điều dễ thương.` : 'Ba điều dễ thương đã ở đây. Bạn thích món nào nhất?';
  $('turns').replaceChildren();
  for (let i = 0; i < 3; i++) { const el = document.createElement('div'); el.className = 'turn-chip' + (i < user.spins.length ? ' used' : ''); el.textContent = i < user.spins.length ? '✓ Lượt ' + (i + 1) : '✧ Lượt ' + (i + 1); $('turns').append(el); }
  $('spin').hidden = !user.remaining || user.readOnly; $('spin').disabled = spinning;
  $('spin-mobile').hidden=$('spin').hidden;$('spin-mobile').disabled=spinning;$('spin-mobile').textContent=spinning?'May mắn đang đến…':`Quay nào! ✧ · Còn ${user.remaining} lượt`;
  $('result-count').textContent = `${user.spins.length} / 3`;
  $('selection-hint').textContent = user.choice ? user.fulfillment ? 'Đã gửi thông tin nhận. Món quà đã được khóa và không thể đổi nữa.' : user.readOnly ? 'Bạn đang xem lại món quà đã chọn.' : 'Bạn có thể đổi quà trước khi gửi thông tin nhận.' : user.remaining ? 'Quay đủ 3 lượt rồi chọn món bạn yêu nhất nhé.' : 'Chạm vào một món quà, rồi bấm chốt để xác nhận.';
  $('results').replaceChildren();
  if (!user.spins.length) { const empty = document.createElement('div'); empty.className = 'empty-gift'; empty.textContent = '🎁 Giỏ quà đang chờ vòng quay đầu tiên'; $('results').append(empty); }
  user.spins.forEach(spin => {
    const isSelected = (selected ?? user.choice?.spin_id) === spin.id;
    const button = document.createElement('button'); button.className = 'gift-option' + (isSelected ? ' selected' : ''); button.disabled = !!user.remaining || spinning || user.readOnly || !!user.fulfillment; button.setAttribute('aria-pressed', String(isSelected));
    const icon = document.createElement('span'); icon.className = 'gift-icon'; setGiftArt(icon,spin.gift);
    const text = document.createElement('span'), title = document.createElement('strong'), sub = document.createElement('small'); title.textContent = spin.gift.name; sub.textContent = (structure.find(p=>p.id===spin.gift.tier)?.label||'Phần quà')+' · Lượt '+spin.turn; button.style.borderLeft='6px solid '+(gifts.find(g=>g.id===spin.gift.id)?.color||spin.gift.color); text.append(title, sub);
    const check = document.createElement('span'); check.className = 'check'; check.textContent = isSelected ? '♥' : '○'; button.append(icon, text, check);
    button.onclick = () => { selected = spin.id; render(); }; $('results').append(button);
  });
  $('confirm-gift').hidden = !!user.remaining || user.readOnly || !!user.fulfillment; $('confirm-gift').disabled = !selected || selected === user.choice?.spin_id || spinning;
  $('confirm-gift').textContent = user.choice ? 'Xác nhận đổi quà ♡' : 'Chốt món quà này ♡';
  $('chosen').hidden = !user.choice;
  if (user.choice) { const gift = user.spins.find(s => s.id === user.choice.spin_id).gift; $('chosen').replaceChildren(); const b = document.createElement('b'); setGiftArt(b,gift);b.append(document.createTextNode(' '+gift.name)); const p = document.createElement('span'); p.textContent = user.fulfillment ? 'Đã chốt quà và gửi thông tin nhận ♡' : 'Đã chốt quà! Bấm Cách nhận quà để hoàn tất nhé ♡'; $('chosen').append(b, p); }
  renderReceiving();
}
$('bye-home').onclick = async () => {
  $('bye-home').disabled = true;
  try {
    await api('leave', {}); user = null; selected = null;
    $('auth-form').reset(); $('auth-error').textContent = ''; render();
    $('name').focus();
  } catch (e) { toast(e.message); }
  finally { $('bye-home').disabled = false; }
};
$('auth-form').onsubmit = async event => {
  event.preventDefault(); $('auth-submit').disabled = true; $('auth-error').textContent = '';
  try { const data = Object.fromEntries(new FormData(event.currentTarget)); user = await api('join', data); selected = null; navigate(user.gender==='male'?'/bai-anh-em':'/wheel'); if(user.fulfillment) openCelebration(); else if(user.choice && !user.readOnly) openReceiving(); }
  catch (e) { $('auth-error').textContent = e.message; }
  finally { $('auth-submit').disabled = false; }
};
$('spin').onclick = async () => {
  if (spinning) return; spinning = true; $('spin-mobile').disabled=true;$('spin-mobile').textContent='May mắn đang đến…'; $('spin').disabled = true; $('spin').textContent = 'May mắn đang đến…'; $('play-error').textContent = '';
  try {
    const next=await api('spin',{}),result=next.spins.at(-1),options=wheelSegments().filter(p=>p.id===result.gift.id),tier=options[Math.floor(Math.random()*options.length)];
    const target=(360-(tier.start+tier.arc/2)*180/Math.PI)%360;
    rotation+=360*8+(target-rotation%360+360)%360;
    $('wheel').style.transform=`rotate(${rotation}deg)`;
    await new Promise(resolve=>setTimeout(resolve,reduceMotion?60:7300));
    user=next;showSpinResult(result.gift);
    document.body.classList.add('celebrate'); setTimeout(() => document.body.classList.remove('celebrate'), 1900);
  } catch (e) {
    $('play-error').textContent = e.message;
    // A request may have been committed even if its response was interrupted.
    try { user = await api('me'); } catch { /* The error above remains visible. */ }
  } finally { spinning = false; $('spin').textContent = 'Quay nào! ✧'; render(); }
};
let pendingGift = null;
$('confirm-gift').onclick = () => {
  if (!selected || spinning || user.readOnly || user.fulfillment || selected === user.choice?.spin_id) return;
  pendingGift = selected;
  const gift = user.spins.find(s => s.id === pendingGift).gift;
  $('gift-confirm-title').textContent = user.choice ? 'Xác nhận đổi quà' : 'Xác nhận chọn quà';
  setGiftArt($('gift-confirm-name'),gift);$('gift-confirm-name').append(document.createTextNode(' '+gift.name));
  $('gift-confirm-note').textContent = user.choice ? 'Bạn muốn đổi sang món này? Sau khi gửi thành công thông tin nhận quà hoặc chuyển khoản, bạn sẽ không đổi quà được nữa.' : 'Bạn chọn món quà này nhé? Sau khi xác nhận, hãy điền cách nhận trong popup tiếp theo. Bạn chỉ có thể đổi quà trước khi gửi thông tin nhận.';
  $('gift-confirm-error').textContent = ''; $('gift-confirm-dialog').showModal();
};
function cancelGift() { pendingGift = null; selected = null; render(); }
$('gift-confirm-cancel').onclick = () => { $('gift-confirm-dialog').close(); cancelGift(); };
$('gift-confirm-dialog').addEventListener('cancel', event => { if ($('gift-confirm-save').disabled) event.preventDefault(); else cancelGift(); });
$('gift-confirm-save').onclick = async () => {
  if (!pendingGift || $('gift-confirm-save').disabled) return;
  $('gift-confirm-save').disabled = true; $('gift-confirm-cancel').disabled = true;
  try {
    user = await api('choose', { spinId: pendingGift }); selected = null; pendingGift = null;
    $('gift-confirm-dialog').close();
    $('receiving-form').reset(); qrData = null; $('qr-preview').hidden = true; $('qr-preview').removeAttribute('src'); $('receive-error').textContent = '';
    render(); openReceiving(); toast('Đã lưu món quà bạn chọn ♡');
  } catch(e) { $('gift-confirm-error').textContent = e.message; }
  finally { $('gift-confirm-save').disabled = false; $('gift-confirm-cancel').disabled = false; }
};
async function init() {
  try {
    gifts = await api('gifts');
    structure = await api('prizes'); await preloadGiftArt(gifts); drawWheel();
    prizePage=Number(new URLSearchParams(LuckyBloom.search()).get('page'))||1;
    try { user=await api('me'); } catch(e) { if(e.status!==401)throw e; }
    render(); if(LuckyBloom.path()==='/wheel')scrollToWheel();
  } catch (e) { $('auth-error').textContent = e.message || 'Chưa kết nối được máy chủ. Hãy tải lại trang.'; $('auth-submit').disabled = true; }
}
const money = value => new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(value);
let qrData = null;
function renderReceiving() {
  const active = user?.gender === 'female' && !!user.choice;
  $('receiving-form').hidden = !active || !!user?.fulfillment || user.readOnly;
  $('receive-summary').hidden = !active || !user?.fulfillment;
  if (!active) return;
  const gift = user.spins.find(s => s.id === user.choice.spin_id).gift;
  const noCash=gift.tier==='special'||gift.id==='surprise'||!gift.cashValue;
  $('cash-mode').disabled = noCash; $('cash-mode').closest('label').hidden=noCash;
  $('address-note').textContent=gift.id==='phone-case'?'♡ Nhập địa chỉ shipper có thể giao tới và ghi rõ loại máy điện thoại bạn đang dùng để nhận đúng ốp.':'♡ Nhập địa chỉ mà shipper có thể giao hàng tới được nhé.';
  if (noCash && $('cash-mode').checked) document.querySelector('[name=mode][value=gift]').checked = true;
  $('cash-value').textContent = !noCash ? `Giá trị tương đương của ${gift.name}: ${money(gift.cashValue)}` : 'Món quà này chỉ nhận quà, không áp dụng quy đổi tiền.';
  syncReceiving();
  const f = user.fulfillment;
  if (!f) return;
  $('receive-summary').replaceChildren();
  const h = document.createElement('h3'); h.textContent = 'Đã gửi thông tin nhận ♡';
  const detail = document.createElement('p');
  detail.textContent = f.redacted ? (f.mode === 'gift' ? '🎁 Bạn đã chọn nhận quà. Thông tin nhận đã được lưu riêng tư.' : '💸 Bạn đã chọn nhận giá trị tương đương: ' + money(f.cashAmount)) : f.mode === 'gift' ? `🎁 Nhận quà\nĐiện thoại: ${f.phone}\nĐịa chỉ: ${f.address}` : `💸 Nhận giá trị tương đương: ${money(f.cashAmount)}\n` + (f.method === 'bank' ? `Ngân hàng: ${f.bank}\nSố tài khoản: ${f.account}\nChủ tài khoản: ${f.holder}` : 'Nhận qua mã QR bạn đã tải lên.');
  if(!f.redacted&&f.deliveryDate)detail.textContent+='\nNgày nhận: '+f.deliveryDate.split('-').reverse().join('/')+'\nKhoảng giờ: '+f.deliveryFrom+'–'+f.deliveryTo+' (GMT+7)'+(f.drinkFlavor?'\nVị trà sữa: '+f.drinkFlavor:'');
  $('receive-summary').append(h, detail);
  if (f.hasQr) { const img = document.createElement('img'); img.className = 'qr-preview'; LuckyBloom.qr().then(url=>{if(img.isConnected)img.src=url;else if(url.startsWith('blob:'))URL.revokeObjectURL(url);}).catch(()=>{img.alt='Không tải được QR. Hãy thử lại.';}); img.alt = 'QR nhận tiền đã gửi'; $('receive-summary').append(img); }
  const note = document.createElement('p'); note.textContent = 'Người tổ chức đã nhận được thông tin. Nếu cần sửa, hãy liên hệ người tổ chức nhé.'; $('receive-summary').append(note);
}
function syncReceiving() {
  const cash = $('cash-mode').checked, qr = document.querySelector('[name=method][value=qr]').checked;
  const gift=user?.spins.find(s=>s.id===user.choice?.spin_id)?.gift,drink=!cash&&['tea','lemon-tea'].includes(gift?.id),milk=drink&&gift.id==='tea';
  $('drink-fields').hidden=!drink;$('drink-flavor-fields').hidden=!milk;
  for(const id of ['delivery-date','delivery-from','delivery-to']){$(id).disabled=!drink;$(id).required=drink;}
  $('drink-flavor').disabled=!milk;$('drink-flavor').required=milk;
  $('delivery-date').min=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Bangkok',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
  $('delivery-fields').hidden = cash; $('cash-fields').hidden = !cash;
  $('bank-fields').hidden = qr; $('qr-fields').hidden = !qr;
  for (const id of ['receive-phone', 'receive-address']) { $(id).disabled = cash; $(id).required = !cash; }
  for (const id of ['receive-bank', 'receive-account', 'receive-holder']) { $(id).disabled = !cash || qr; $(id).required = cash && !qr; }
  $('receive-qr').disabled = !cash || !qr; $('receive-qr').required = cash && qr;
}
$('receiving-form').onchange = syncReceiving;
$('receive-qr').onchange = async () => {
  qrData = null; $('qr-preview').hidden = true; $('qr-preview').removeAttribute('src'); $('receive-error').textContent = '';
  const file = $('receive-qr').files[0]; if (!file) return;
  if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type) || file.size > 1 * 1024 * 1024) { $('receive-error').textContent = 'Chọn ảnh PNG, JPEG hoặc WebP, tối đa 1 MB.'; $('receive-qr').value = ''; return; }
  try {
    const data = await new Promise((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(reader.result); reader.onerror = () => reject(new Error('Không đọc được ảnh. Hãy chọn lại.')); reader.readAsDataURL(file); });
    if ($('receive-qr').files[0] !== file) return;
    qrData = data; $('qr-preview').src = data; $('qr-preview').hidden = false;
  } catch (e) { $('receive-error').textContent = e.message; }
};
$('receiving-form').onsubmit = async event => {
  event.preventDefault(); $('receive-error').textContent = ''; $('receive-submit').disabled = true;
  try {
    const data = Object.fromEntries(new FormData(event.currentTarget));
    data.expectedSpinId = user.choice.spin_id;
    if(data.mode==='gift'&&data.deliveryFrom&&data.deliveryTo&&data.deliveryFrom>=data.deliveryTo)throw new Error('Giờ kết thúc cần sau giờ bắt đầu trong cùng ngày.');
    if (data.mode === 'cash') {
      data.expectedAmount = user.spins.find(s => s.id === user.choice.spin_id).gift.cashValue;
      if (data.method === 'qr') { if (!qrData) throw new Error('Hãy chờ ảnh QR tải xong hoặc chọn lại ảnh.'); data.qrData = qrData; }
    }
    user = await api('fulfillment', data); qrData = null; $('receive-qr').value = ''; render(); $('receive-dialog').close(); openCelebration(); toast('Đã lưu thông tin nhận của bạn ♡');
  } catch (e) {
    $('receive-error').textContent = e.message;
    try { user = await api('me'); render(); } catch {}
  } finally { $('receive-submit').disabled = false; }
};


let structure = [], prizePage = 1;
const pageSize = 4;
function navigate(path) {
  if(path.startsWith('/prizes')) prizePage=Number(new URL(path,location.origin).searchParams.get('page'))||1;
  LuckyBloom.navigate(path); render(); if(path==='/wheel')scrollToWheel();else window.scrollTo({top:0,behavior:reduceMotion?'instant':'smooth'});
}
function scrollToWheel(){requestAnimationFrame(()=>$('wheel-tools').scrollIntoView({block:'start',behavior:reduceMotion?'instant':'smooth'}));}
function openReceiving() {
  if (!user?.choice) return;
  renderReceiving(); if (!$('receive-dialog').open) $('receive-dialog').showModal();
}
function openCelebration() {
  if (!user?.fulfillment) return;
  $('wish-name').textContent = `Gửi ${user.name} một chút yêu thương ♡`;
  if (!$('wish-dialog').open) $('wish-dialog').showModal();
}
function renderPages() {
  let path = LuckyBloom.path();
  document.body.classList.toggle('on-wheel',path==='/wheel');
  if (path === '/wheel' && !user) { LuckyBloom.navigate('/',true); path='/'; }
  $('entry-page').hidden = path !== '/';
  $('wheel-page').hidden = path !== '/wheel';
  $('prizes-page').hidden = path !== '/prizes';
  $('how-section').hidden = path !== '/';
  $('wheel-tools').hidden = path !== '/wheel';
  $('open-receiving').hidden = !user?.choice;
  $('open-wish').hidden = !user?.fulfillment;
  $('review-note').hidden = !user?.readOnly;
  $('review-banner').hidden = !user?.readOnly || path !== '/wheel';
  $('prizes-back').textContent = user?.gender === 'female' ? '← Về vòng quay' : '← Về trang chủ';
  $('structure-list').replaceChildren();
  for (const prize of structure) { const row=document.createElement('div'); row.className='structure-row';row.style.borderLeft='5px solid '+(gifts.find(g=>g.tier===prize.id)?.color||'#eee'); const title=document.createElement('span'); title.textContent=prize.label; const count=document.createElement('strong'); count.textContent=prize.quantity+' giải'; row.append(title,count); $('structure-list').append(row); }
  renderPrizes();
}
function renderPrizes(){
 const params=new URLSearchParams(LuckyBloom.search()),filter=params.get('tier')||'';
 const active=structure.find(p=>p.id===filter);$('tier-menu').hidden=!!active;$('tier-detail').hidden=!active;
 $('tier-menu').replaceChildren();
 for(const prize of structure){
  const button=document.createElement('button');button.className='tier-category';button.style.backgroundColor=gifts.find(g=>g.tier===prize.id)?.color||'#eee';
  const icon=document.createElement('span');icon.className='tier-category-icon';icon.textContent={special:'?',first:'🏆',second:'🌸',third:'🍀',encourage:'🍬'}[prize.id];
  const title=document.createElement('strong');title.textContent=prize.label;const note=document.createElement('small');note.textContent='Khám phá '+gifts.filter(g=>g.tier===prize.id).length+' món quà →';button.append(icon,title,note);
  button.onclick=()=>{prizePage=1;navigate('/prizes?tier='+prize.id);};$('tier-menu').append(button);
 }
 $('prize-cards').replaceChildren();if(!active)return;
 $('tier-detail-title').textContent=active.label;
 const items=gifts.filter(g=>g.tier===filter),pages=Math.max(1,Math.ceil(items.length/pageSize));prizePage=Math.min(Math.max(1,prizePage),pages);
 for(const gift of items.slice((prizePage-1)*pageSize,prizePage*pageSize)){
  const card=document.createElement('article');card.className='prize-card';card.style.backgroundColor=gift.color;const icon=document.createElement('span');icon.className='prize-card-icon';if(gift.tier==='special')icon.textContent='?';else setGiftArt(icon,gift);const name=document.createElement('h3');name.textContent=gift.name;card.append(icon,name);$('prize-cards').append(card);
 }
 $('page-status').textContent='Trang '+prizePage+' / '+pages;$('prizes-prev').disabled=prizePage===1;$('prizes-next').disabled=prizePage===pages;
}

document.addEventListener('click',event=>{
  const link=event.target.closest('[data-page]'); if(!link)return;
  event.preventDefault(); navigate(link.dataset.page);
});
window.addEventListener('popstate',()=>{prizePage=Number(new URLSearchParams(LuckyBloom.search()).get('page'))||1;render();});
$('tier-list-back').onclick=()=>navigate('/prizes');
function changePrizePage(delta) { prizePage+=delta; LuckyBloom.navigate(`/prizes?tier=${new URLSearchParams(LuckyBloom.search()).get('tier')||''}&page=${prizePage}`,true); renderPrizes(); }
$('prizes-prev').onclick=()=>changePrizePage(-1); $('prizes-next').onclick=()=>changePrizePage(1);
$('prizes-back').onclick=()=>navigate(user?.gender==='female'?'/wheel':'/');
$('open-receiving').onclick=openReceiving; $('open-wish').onclick=openCelebration;
$('receive-close').onclick=()=>$('receive-dialog').close();
$('wish-close').onclick=()=>$('wish-dialog').close();

$('spin-mobile').onclick=()=>$('spin').click();
$('spin-result-close').onclick=()=>$('spin-result-dialog').close();
init();
