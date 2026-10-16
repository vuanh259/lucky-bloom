import {readFileSync,writeFileSync,mkdirSync,unlinkSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
import {resolve} from 'node:path';
const projectUrl=process.env.SUPABASE_URL?.replace(/\/$/,'');
if(!/^https:\/\/[a-z0-9-]+\.supabase\.co$/.test(projectUrl||''))throw Error('Điền SUPABASE_URL trong .env.');
const ref=process.env.SUPABASE_PROJECT_REF||new URL(projectUrl).hostname.split('.')[0];
if(!/^[a-z0-9-]+$/.test(ref)||new URL(projectUrl).hostname!==ref+'.supabase.co')throw Error('SUPABASE_PROJECT_REF không khớp SUPABASE_URL.');
const password=process.env.ADMIN_PASSWORD||'',origins=process.env.ALLOWED_ORIGINS||'';
if(password.length<12||/[\r\n]/.test(password))throw Error('Đặt ADMIN_PASSWORD tối thiểu 12 ký tự trong .env.');
if(!origins||origins.split(',').some(origin=>{try{const u=new URL(origin.trim());return u.origin!==origin.trim()||!['https:','http:'].includes(u.protocol);}catch{return true;}}))throw Error('Điền ALLOWED_ORIGINS bằng origin hợp lệ, không có đường dẫn.');
const cliPackage=JSON.parse(readFileSync('node_modules/supabase/package.json','utf8'));
const cliFile=resolve('node_modules/supabase',typeof cliPackage.bin==='string'?cliPackage.bin:cliPackage.bin.supabase);
function cli(args){const r=spawnSync(process.execPath,[cliFile,...args],{stdio:'inherit'});if(r.error)throw r.error;if(r.status!==0)throw Error('Supabase CLI thất bại. Chạy npx supabase login, kiểm tra project/migration rồi thử lại.');}
mkdirSync('.deployment',{recursive:true});
const path=resolve('.deployment/edge.env');
try{
 writeFileSync(path,'ADMIN_PASSWORD='+JSON.stringify(password)+'\nALLOWED_ORIGINS='+JSON.stringify(origins)+'\n',{mode:0o600});
 cli(['secrets','set','--env-file',path,'--project-ref',ref]);
 cli(['functions','deploy','lucky-bloom','--project-ref',ref,'--no-verify-jwt','--use-api']);
 console.log('Edge Function deployed. Ensure the SQL migration has been applied before publishing Pages.');
}finally{try{unlinkSync(path);}catch{}}
