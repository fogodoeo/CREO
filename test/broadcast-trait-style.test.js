const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
test('loaded shared stylesheet keeps accented traits white and unboxed on desktop and mobile',()=>{
 const html=fs.readFileSync(require.resolve('../public/auction-live.html'),'utf8');
 assert.match(html,/broadcast-ui\.css\?v=20260907-white-traits-v2/);
 const css=fs.readFileSync(require.resolve('../public/broadcast-ui.css'),'utf8');
 const rules=[...css.matchAll(/([^{}]+)\{([^{}]*)\}/g)].filter(row=>row[1].includes('.item-inline-pill'));
 const resolved={};
 for(const [,selector,body] of rules){
  if(selector.includes(':first-child')||selector.includes(':last-child')||selector.includes('+'))continue;
  for(const declaration of body.split(';')){const [key,...value]=declaration.split(':');if(value.length)resolved[key.trim()]=value.join(':').trim()}
 }
 assert.equal(resolved.color,'#fff');assert.equal(resolved.background,'transparent');
 assert.equal(resolved.border,'0');assert.equal(resolved['border-radius'],'0');
 assert.equal(resolved['font-size'],'clamp(18px,4.6vw,24px)');
});
