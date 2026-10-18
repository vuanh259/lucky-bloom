import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {buildWheelLayout} from '../public/wheel-layout.js';
test('42 wheel slots repeat tier II/III gifts twice and small prizes three times, with interleaved colors',()=>{
 const gifts=JSON.parse(readFileSync(new URL('../gifts.json',import.meta.url),'utf8'));
 const segments=buildWheelLayout(gifts,['special','first','second','third','encourage'].map(id=>({id})));
 assert.equal(segments.length,42);assert.deepEqual(new Set(segments.map(g=>g.id)),new Set(gifts.map(g=>g.id)));
 const copies={special:1,first:1,second:2,third:2,encourage:3};for(const gift of gifts)assert.equal(segments.filter(s=>s.id===gift.id).length,copies[gift.tier]);
 assert.ok(segments.every((g,i)=>g.tier!==segments[(i+1)%segments.length].tier));
 assert.equal(segments.filter(g=>g.tier==='special').length,1);assert.ok(Math.abs(segments.at(-1).start+segments.at(-1).arc-2*Math.PI)<1e-10);
});
