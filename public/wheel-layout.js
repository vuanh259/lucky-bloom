// Repeat each gift by its tier multiplier, then alternate the tier colors.
export function buildWheelLayout(gifts,prizes){
 const copies={special:1,first:1,second:2,third:2,encourage:3};
 const queues=prizes.map(p=>({tier:p.id,items:gifts.filter(g=>g.tier===p.id).flatMap(g=>Array.from({length:copies[g.tier]||1},()=>g))})).filter(q=>q.items.length);
 const ordered=[];let previous=null;
 while(queues.some(q=>q.items.length)){
  const available=queues.filter(q=>q.items.length&&q.tier!==previous).sort((a,b)=>b.items.length-a.items.length);
  const next=available[0]||queues.find(q=>q.items.length);ordered.push(next.items.shift());previous=next.tier;
 }
 if(ordered.length>2&&ordered[0].tier===ordered.at(-1).tier){
  const last=ordered.length-1;
  for(let i=1;i<last-1;i++)if(ordered[i].tier!==ordered[0].tier&&ordered[i].tier!==ordered[last-1].tier&&ordered[i-1].tier!==ordered[last].tier&&ordered[i+1].tier!==ordered[last].tier){[ordered[i],ordered[last]]=[ordered[last],ordered[i]];break;}
 }
 const arc=Math.PI*2/Math.max(1,ordered.length);
 return ordered.map((gift,i)=>({...gift,start:i*arc,arc}));
}
