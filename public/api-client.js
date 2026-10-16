(() => {
  const config=window.LUCKY_BLOOM_CONFIG||{};
  const remote=!!config.supabaseUrl;
  const basePath=(config.basePath||'/').replace(/\/?$/,'/');
  const namespace='lucky-bloom:'+basePath;
  const storage=role=>role==='admin'?sessionStorage:localStorage;
  const getToken=role=>storage(role).getItem(namespace+':'+role)||'';
  const setToken=(role,value)=>value?storage(role).setItem(namespace+':'+role,value):storage(role).removeItem(namespace+':'+role);
  const endpoint=(path)=>remote?config.supabaseUrl.replace(/\/$/,'')+'/functions/v1/lucky-bloom/api/'+path:'/api/'+path;
  async function request(path,data){
    const role=path.startsWith('admin/')?'admin':'user';
    const headers={};if(data!==undefined)headers['Content-Type']='application/json';
    if(remote&&getToken(role))headers.Authorization='Bearer '+getToken(role);
    const r=await fetch(endpoint(path),{method:data===undefined?'GET':'POST',headers,...(data===undefined?{}:{body:JSON.stringify(data)})});
    const value=await r.json();if(!r.ok){const e=new Error(value.error||'Không kết nối được máy chủ.');e.status=r.status;throw e;}
    if(remote&&value.sessionToken){setToken(role,value.sessionToken);delete value.sessionToken;}
    if(remote&&['leave','admin/logout'].includes(path))setToken(role,'');
    return value;
  }
  async function qr(userId,admin=false){
    const path='qr'+(userId?'?userId='+userId:'');
    if(!remote)return endpoint(path);
    const r=await fetch(endpoint(path),{headers:{Authorization:'Bearer '+getToken(admin?'admin':'user')}});
    if(!r.ok)throw new Error('Không tải được ảnh QR.');
    return URL.createObjectURL(await r.blob());
  }
  const path=()=>remote?(location.hash.slice(1).split('?')[0]||'/'):location.pathname;
  const search=()=>remote?(location.hash.includes('?')?'?'+location.hash.split('?')[1]:''):location.search;
  function navigate(url,replace=false){const target=remote?basePath+'#'+url:url;history[replace?'replaceState':'pushState']({},'',target);}
  window.LuckyBloom={request,qr,path,search,navigate,remote,basePath};
})();
