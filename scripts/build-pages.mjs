import {readFileSync,writeFileSync,mkdirSync,readdirSync} from 'node:fs';
const basePath=(process.env.PAGES_BASE_PATH||'/lucky-bloom/').replace(/\/?$/,'/');
const supabaseUrl=process.env.SUPABASE_URL?.replace(/\/$/,'');
if(!supabaseUrl||!/^https:\/\/[a-z0-9-]+\.supabase\.co$/.test(supabaseUrl))throw Error('Điền SUPABASE_URL=https://PROJECT_REF.supabase.co trong .env trước khi build.');
if(!/^\/[A-Za-z0-9._-]+\/$/.test(basePath)&&basePath!=='/')throw Error('PAGES_BASE_PATH cần có dạng /lucky-bloom/ hoặc /.');
mkdirSync('dist-pages',{recursive:true});
const allowed=['index.html','admin.html','style.css','app.js','admin.js','api-client.js'];
for(const file of allowed){
 let source=readFileSync('public/'+file,'utf8');
 if(file.endsWith('.html')){
  source=source.replaceAll('src="/','src="./').replaceAll('href="/style.css"','href="./style.css"').replaceAll('href="/admin"','href="./admin.html"').replaceAll('href="/"','href="./index.html"').replaceAll('href="/prizes"','href="./#/prizes"');
  const csp=`default-src 'self'; connect-src 'self' ${supabaseUrl}; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; object-src 'none'; base-uri 'self'; form-action 'self'`;
  source=source.replace('<meta charset="utf-8">','<meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="'+csp+'"><meta name="referrer" content="same-origin">');
 }
 writeFileSync('dist-pages/'+file,source);
}
writeFileSync('dist-pages/config.js','window.LUCKY_BLOOM_CONFIG = '+JSON.stringify({supabaseUrl,basePath})+';\n');
writeFileSync('dist-pages/.nojekyll','');
// Fail closed if the output ever contains files beyond this static allowlist.
const output=[...allowed,'config.js','.nojekyll'];
if(readdirSync('dist-pages').some(file=>!output.includes(file)))throw Error('Unexpected file in dist-pages. Inspect it before publishing.');
console.log('GitHub Pages frontend built. No .env, admin password, tokens, SQLite or backend source included.');
