export function pickGiftIndex(catalog,prizes,randomInt){
 const tiers=prizes.filter(p=>p.quantity>0&&catalog.some(g=>g.tier===p.id));const total=tiers.reduce((n,p)=>n+p.quantity,0);if(!total)return -1;
 let pick=randomInt(total),tier;for(const p of tiers){pick-=p.quantity;if(pick<0){tier=p.id;break;}}
 const options=catalog.map((g,i)=>({g,i})).filter(x=>x.g.tier===tier);return options[randomInt(options.length)].i;
}
const hash = async value => [...new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(value)))].map(b=>b.toString(16).padStart(2,'0')).join('');
const token = () => [...crypto.getRandomValues(new Uint8Array(32))].map(b=>b.toString(16).padStart(2,'0')).join('');
function validImage(data){
  const match=typeof data==='string'&&/^data:(image\/(png|jpeg|webp));base64,([A-Za-z0-9+/]+={0,2})$/.exec(data);
  if(!match||match[3].length%4)throw Object.assign(Error('Chỉ nhận ảnh QR PNG, JPEG hoặc WebP.'),{status:400});
  const bytes=Uint8Array.from(atob(match[3]),c=>c.charCodeAt(0));
  if(!bytes.length||bytes.length>1048576)throw Object.assign(Error('Ảnh QR tối đa 1 MB.'),{status:400});
  const head=new TextDecoder().decode(bytes.slice(0,12));
  const ok=match[2]==='png'?bytes.length>=24&&[137,80,78,71,13,10,26,10].every((b,i)=>bytes[i]===b):match[2]==='jpeg'?bytes.length>=20&&bytes[0]===255&&bytes[1]===216&&bytes[2]===255:head.startsWith('RIFF')&&head.slice(8,12)==='WEBP';
  if(!ok)throw Object.assign(Error('Tệp không phải ảnh hợp lệ.'),{status:400});
  return {bytes,mime:match[1],ext:match[2]};
}
export function createHandler(env,fetcher=fetch){
  const base=(env.SUPABASE_URL||'').replace(/\/$/,'');
  const key=env.SUPABASE_SERVICE_ROLE_KEY;
  const origins=(env.ALLOWED_ORIGINS||'').split(',').map(s=>s.trim()).filter(Boolean);
  async function rpc(action,payload={},tokenHash=null){
    const r=await fetcher(base+'/rest/v1/rpc/lb_api',{method:'POST',headers:{apikey:key,Authorization:'Bearer '+key,'Content-Type':'application/json'},body:JSON.stringify({action,payload,token_hash:tokenHash})});
    if(!r.ok)throw Object.assign(Error('Không xử lý được dữ liệu. Kiểm tra migration hoặc liên hệ người tổ chức.'),{status:500});
    return r.json();
  }
  return async request=>{
    const origin=request.headers.get('Origin');
    const cors={'Access-Control-Allow-Headers':'authorization,content-type','Access-Control-Allow-Methods':'GET,POST,OPTIONS','Vary':'Origin','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'};
    if(origin&&origins.includes(origin))cors['Access-Control-Allow-Origin']=origin;
    const json=(value,status=200)=>Response.json(value,{status,headers:cors});
    if(origin&&!origins.includes(origin))return json({error:'Tên miền này chưa được cấu hình truy cập.'},403);
    if(!base||!key)return json({error:'Máy chủ Supabase chưa được cấu hình.'},503);
    if(request.method==='OPTIONS')return new Response(null,{status:204,headers:cors});
    if(!['GET','POST'].includes(request.method))return json({error:'Phương thức không hợp lệ.'},405);
    try{
      const url=new URL(request.url),path=url.pathname.replace(/^.*\/lucky-bloom\//,'');
      const route={
        'GET api/gifts':'gifts','GET api/prizes':'prizes','GET api/me':'me','POST api/join':'join','POST api/leave':'leave','POST api/spin':'spin','POST api/choose':'choose','POST api/fulfillment':'receive','GET api/qr':'qr',
        'GET api/admin/players':'admin-players','GET api/admin/prizes':'admin-prizes','POST api/admin/prizes':'admin-prizes','GET api/admin/gift-values':'admin-values','POST api/admin/gift-values':'admin-values','POST api/admin/login':'admin-login','POST api/admin/logout':'admin-logout'
      }[request.method+' '+path];
      if(!route)return json({error:'Không tìm thấy thao tác.'},404);
      let payload={};
      if(request.method==='POST'){
        if(!request.headers.get('Content-Type')?.startsWith('application/json'))return json({error:'Chỉ chấp nhận JSON.'},415);
        const reader=request.body?.getReader(),chunks=[];let size=0;
        if(reader){while(true){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>2*1024*1024){await reader.cancel();return json({error:'Dữ liệu quá dài.'},413);}chunks.push(value);}}
        const bytes=new Uint8Array(size);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.length;}
        try{payload=JSON.parse(new TextDecoder().decode(bytes)||'{}');}catch{return json({error:'Dữ liệu không hợp lệ.'},400);}
        if(!payload||Array.isArray(payload)||typeof payload!=='object')return json({error:'Dữ liệu không hợp lệ.'},400);
      }
      const raw=request.headers.get('Authorization')?.replace(/^Bearer /i,'')||'';
      const tokenHash=raw?await hash(raw):null;
      if(['join','admin-login','receive'].includes(route)){
        const remote=request.headers.get('x-forwarded-for')?.split(',')[0]||'unknown';
        const limited=await rpc('rate',{key:await hash(key+':'+route+':'+remote)});
        if(limited.error)return json({error:limited.error},limited.status);
      }
      let sessionToken;
      if(route==='admin-login'){
        if(!env.ADMIN_PASSWORD||env.ADMIN_PASSWORD.length<12)return json({error:'Hãy cấu hình ADMIN_PASSWORD tối thiểu 12 ký tự trên Supabase.'},503);
        const a=await hash(typeof payload.password==='string'?payload.password:''),b=await hash(env.ADMIN_PASSWORD);let diff=0;for(let i=0;i<a.length;i++)diff|=a.charCodeAt(i)^b.charCodeAt(i);
        if(diff)return json({error:'Mật khẩu quản trị chưa đúng.'},401);
        sessionToken=token();const r=await rpc('admin-session',{new_hash:await hash(sessionToken)});return json({...r,sessionToken});
      }
      if(route==='join'){
        if(typeof payload.name!=='string')return json({error:'Hãy nhập tên mà người tổ chức nhận ra được.'},400);
        const name=payload.name.normalize('NFC').trim().replace(/\s+/g,' ');
        if(!name||name.length>80||/[\u0000-\u001f\u007f]/.test(name))return json({error:'Tên cần từ 1 đến 80 ký tự.'},400);
        sessionToken=token();payload={name,name_key:name.toLocaleLowerCase('vi-VN'),gender:payload.gender,new_hash:await hash(sessionToken)};
      }
      if(route==='spin'){
        const catalog=await rpc('gifts'),prizes=await rpc('prizes');
        const randomInt=n=>{const limit=Math.floor(4294967296/n)*n;let v;do{v=crypto.getRandomValues(new Uint32Array(1))[0];}while(v>=limit);return v%n;};
        const index=pickGiftIndex(catalog,prizes,randomInt);
        if(index<0)return json({error:'Vòng quay chưa có giải khả dụng. Liên hệ người tổ chức nhé.'},409);
        payload={random_index:index};
      }
      let uploaded=null;
      if(route==='receive'){
        payload={...payload};delete payload.qr_path;
        if(payload.mode==='cash'){const state=await rpc('me',{},tokenHash);const gift=state.spins?.find(s=>s.id===state.choice?.spin_id)?.gift;if(gift?.tier==='special'||gift?.id==='surprise')return json({error:'Giải đặc biệt không được quy đổi.'},400);}
        if(payload.mode==='cash'&&payload.method==='qr'){
          const state=await rpc('me',{},tokenHash);
          if(state.error)return json({error:state.error},state.status);
          if(state.readOnly||state.gender!=='female'||!state.choice||state.fulfillment)return json({error:'Không thể gửi ảnh cho phiên này.'},403);
          const image=validImage(payload.qrData);
          uploaded=state.id+'/'+crypto.randomUUID()+'.'+image.ext;
          const upload=await fetcher(base+'/storage/v1/object/kk/'+uploaded,{method:'POST',headers:{apikey:key,Authorization:'Bearer '+key,'Content-Type':image.mime,'x-upsert':'false'},body:image.bytes});
          if(!upload.ok)throw Object.assign(Error('Không tải được QR. Hãy thử lại.'),{status:502});
          payload.qr_path=uploaded;delete payload.qrData;
        }
      }
      if(route==='qr'){const userId=url.searchParams.get('userId');if(userId&&!/^\d+$/.test(userId))return json({error:'Mã người chơi không hợp lệ.'},400);payload=userId?{userId:Number(userId)}:{};}
      const result=await rpc(route,payload,tokenHash);
      if(result?.error){
        if(uploaded)await fetcher(base+'/storage/v1/object/kk',{method:'DELETE',headers:{apikey:key,Authorization:'Bearer '+key,'Content-Type':'application/json'},body:JSON.stringify({prefixes:[uploaded]})});
        return json({error:result.error},result.status||400);
      }
      if(route==='qr'){
        const image=await fetcher(base+'/storage/v1/object/authenticated/kk/'+result.path,{headers:{apikey:key,Authorization:'Bearer '+key}});
        if(!image.ok)return json({error:'Không tải được ảnh QR.'},404);
        return new Response(image.body,{status:200,headers:{...cors,'Content-Type':image.headers.get('Content-Type')||'application/octet-stream'}});
      }
      return json(sessionToken?{...result,sessionToken}:result);
    }catch(e){return json({error:e.status?e.message:'Không kết nối được máy chủ. Hãy thử lại.'},e.status||500);}
  };
}
