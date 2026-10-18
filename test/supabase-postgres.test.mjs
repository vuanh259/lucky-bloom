import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {PGlite} from '@electric-sql/pglite';
import {createHandler,pickGiftIndex} from '../supabase/functions/lucky-bloom/handler.js';

test('Supabase/PostgreSQL migration enforces three spins, private replay, editable then locked gifts and admin privileges',async()=>{
 const db=new PGlite();
 try{
  await db.exec('create role anon;create role authenticated;create role service_role;create schema storage;create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);');
  await db.exec(readFileSync(new URL('../supabase/migrations/202610160001_lucky_bloom.sql',import.meta.url),'utf8'));
  const rpc=async(action,payload={},token_hash=null)=>(await db.query('select public.lb_api($1,$2::jsonb,$3) as result',[action,JSON.stringify(payload),token_hash])).rows[0].result;
  assert.equal((await rpc('gifts')).length,6);assert.deepEqual((await rpc('prizes')).map(p=>p.quantity),[2,3,5,10,20]);
  const owner='a'.repeat(64),review='b'.repeat(64),admin='c'.repeat(64);
  const joined=await rpc('join',{name:'Bạn kiểm thử',name_key:'bạn kiểm thử',gender:'female',new_hash:owner});assert.equal(joined.remaining,3);assert.equal(joined.readOnly,false);
  const responses=await Promise.all(Array.from({length:8},(_,i)=>rpc('spin',{random_index:i%6},owner)));
  assert.equal(responses.filter(r=>!r.error).length,3);assert.equal(responses.filter(r=>r.status===409).length,5);
  const state=await rpc('me',{},owner);assert.equal(state.spins.length,3);
  assert.equal((await rpc('choose',{spinId:state.spins[0].id},owner)).choice.spin_id,state.spins[0].id);
  assert.equal((await rpc('choose',{spinId:state.spins[1].id},owner)).choice.spin_id,state.spins[1].id);
  assert.equal((await rpc('choose',{spinId:999999},owner)).status,400);
  const bad=await rpc('receive',{mode:'gift',expectedSpinId:state.spins[0].id,phone:'0900000000',address:'Địa chỉ kiểm thử không giao quà'},owner);assert.equal(bad.status,409);
  const sent=await rpc('receive',{mode:'gift',expectedSpinId:state.spins[1].id,phone:'0900000000',address:'Địa chỉ kiểm thử không giao quà'},owner);assert.equal(sent.fulfillment.phone,'0900000000');
  assert.equal((await rpc('choose',{spinId:state.spins[2].id},owner)).status,409);
  const replay=await rpc('join',{name:'Bạn kiểm thử',name_key:'bạn kiểm thử',gender:'female',new_hash:review});assert.equal(replay.id,state.id);assert.equal(replay.readOnly,true);assert.equal(replay.fulfillment.phone,undefined);assert.equal(replay.fulfillment.redacted,true);
  assert.equal((await rpc('spin',{random_index:1},review)).status,403);assert.equal((await rpc('qr',{},review)).status,403);
  assert.equal((await rpc('admin-players',{},owner)).status,401);
  await rpc('admin-session',{new_hash:admin});assert.equal((await rpc('admin-players',{},admin)).length,1);
  await db.exec('set role anon');
  await assert.rejects(db.query("select public.lb_api('gifts')"));await db.exec('reset role');
  await db.exec('set role authenticated');await assert.rejects(db.query('select * from lucky_bloom.receiving'));await db.exec('reset role');
  assert.equal((await db.query("select public from storage.buckets where id='kk'")).rows[0].public,false);
  await db.exec(readFileSync(new URL('../supabase/migrations/202610180001_gift_catalog.sql',import.meta.url),'utf8'));
  const catalog=await rpc('gifts');assert.equal(catalog.length,20);assert.deepEqual((await rpc('prizes')).map(p=>p.quantity),[2,3,10,20,60]);
  assert.equal((await rpc('me',{},owner)).spins.length,3);assert.equal((await rpc('me',{},owner)).fulfillment.phone,'0900000000');
  for(const tier of ['special','first','second','third','encourage'])assert.equal(new Set(catalog.filter(g=>g.tier===tier).map(g=>g.color)).size,1);
  assert.equal(new Set(catalog.map(g=>g.color)).size,5);assert.equal(catalog.find(g=>g.id==='surprise').cashValue,null);
  assert.equal((await rpc('admin-values',{items:catalog.map(g=>({id:g.id,amount:g.id==='surprise'?1000:g.cashValue}))},admin)).status,400);
  assert.ok(!(await rpc('admin-prizes',{items:await rpc('prizes')},admin)).error);
  const special='d'.repeat(64);await rpc('join',{name:'Special test',name_key:'special test',gender:'female',new_hash:special});
  const index=catalog.findIndex(g=>g.id==='surprise');for(let i=0;i<3;i++)await rpc('spin',{random_index:index},special);
  const specialState=await rpc('me',{},special);assert.ok(specialState.spins.every(s=>s.gift.id==='surprise'));
  await rpc('choose',{spinId:specialState.spins[0].id},special);
  assert.equal((await rpc('receive',{mode:'cash',expectedSpinId:specialState.spins[0].id,expectedAmount:1000},special)).status,400);
 }finally{await db.close();}
});

test('Edge handler rejects forbidden origins, bad admin password and SVG uploads without exposing service key',async()=>{
 const calls=[];const env={SUPABASE_URL:'https://example.supabase.co',SUPABASE_SERVICE_ROLE_KEY:'test-service-key',ADMIN_PASSWORD:'test-admin-password',ALLOWED_ORIGINS:'https://example.github.io'};
 const stub=async(url,options)=>{calls.push({url,options});const b=JSON.parse(options.body||'{}');if(b.action==='rate')return Response.json({ok:true});if(b.action==='me')return Response.json({id:1,gender:'female',choice:{spin_id:1},fulfillment:null});if(b.action==='gifts')return Response.json([{},{}]);return Response.json({ok:true});};
 const handler=createHandler(env,stub);
 const req=(path,data,origin='https://example.github.io')=>new Request('https://example.supabase.co/functions/v1/lucky-bloom/api/'+path,{method:data?'POST':'GET',headers:{Origin:origin,...(data?{'Content-Type':'application/json'}:{})},...(data?{body:JSON.stringify(data)}:{})});
 assert.equal((await handler(req('gifts',null,'https://evil.example'))).status,403);
 assert.equal((await handler(req('admin/login',{password:'wrong'}))).status,401);
 const login=await handler(req('admin/login',{password:env.ADMIN_PASSWORD}));assert.equal(login.status,200);assert.equal((await login.json()).sessionToken.length,64);
 assert.equal((await handler(req('fulfillment',{mode:'cash',method:'qr',qrData:'data:image/svg+xml;base64,PHN2Zz4='}))).status,400);
 assert.ok(!calls.some(c=>c.url.includes('/storage/')));
 assert.ok(!JSON.stringify(await (await handler(req('gifts'))).json()).includes(env.SUPABASE_SERVICE_ROLE_KEY));
});

test('tier weights follow 2:3:10:20:60 independently of gift counts',()=>{
 const catalog=JSON.parse(readFileSync(new URL('../gifts.json',import.meta.url),'utf8'));
 const weights={special:2,first:3,second:10,third:20,encourage:60},prizes=Object.entries(weights).map(([id,quantity])=>({id,quantity})),counts=Object.fromEntries(Object.keys(weights).map(id=>[id,0]));
 for(let ticket=0;ticket<95;ticket++){let call=0;const i=pickGiftIndex(catalog,prizes,n=>call++===0?ticket:0);counts[catalog[i].tier]++;}
 assert.deepEqual(counts,weights);assert.equal(pickGiftIndex(catalog,prizes.map(p=>({...p,quantity:0})),()=>0),-1);
});
