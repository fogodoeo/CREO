const test=require('node:test'),assert=require('node:assert/strict');
const {presets,custom,apply,match}=require('../public/broadcast-palette');
const luminance=hex=>{const c=hex.slice(1).match(/../g).map(v=>parseInt(v,16)/255).map(v=>v<=.04045?v/12.92:((v+.055)/1.055)**2.4);return c[0]*.2126+c[1]*.7152+c[2]*.0722;};
const contrast=(a,b)=>{const x=luminance(a),y=luminance(b);return (Math.max(x,y)+.05)/(Math.min(x,y)+.05);};
test('preset and custom palettes keep panel text and leading bidder readable',()=>{
 for(const theme of [...presets.map(p=>p.theme),...['#000000','#ffffff','#ff0000','#00ff00','#0000ff'].map(custom)]){
  assert.ok(contrast(theme.text,theme.surface)>=7);assert.ok(contrast('#101a2b',theme.secondary)>=4.5);
 }
});
test('palette application rejects CSS injection and preserves unrelated geometry',()=>{
 const values={'--layout-x':'31%'},doc={documentElement:{style:{setProperty:(k,v)=>values[k]=v}}};
 apply(doc,{...presets[1].theme,background:'red;display:none',layoutX:'0'});
 assert.equal(values['--surface'],presets[1].theme.surface);assert.equal(values['--layout-x'],'31%');assert.equal(values['--background'],undefined);
 assert.throws(()=>custom('red'));assert.equal(match({...presets[1].theme}).id,'blue');assert.equal(match({}),null);
});
