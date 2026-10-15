'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const themes=require('../public/broadcast-themes');
const {normalizeChannel}=require('../platform-core');

test('visual concepts default safely and never replace readable typography or auction profiles',()=>{
 const source={id:'event',name:'행사',broadcastProfile:'cdcup-tournament',theme:{primary:'#123456',secondary:'#abcdef',accent:'#ffffff'}};
 const base=normalizeChannel(source),pixel=normalizeChannel({...source,broadcastTheme:'pixel'});
 assert.equal(base.broadcastTheme,'base');assert.equal(pixel.broadcastTheme,'pixel');
 assert.deepEqual({...pixel,broadcastTheme:'base'},base);
 assert.equal(normalizeChannel({...source,broadcastTheme:'unknown'}).broadcastTheme,'base');
 const doc={body:{dataset:{broadcastProfile:'cdcup-tournament'},style:{fontFamily:'Pretendard',fontSize:'72px'}}};
 assert.equal(themes.apply(doc,'pixel'),'pixel');assert.equal(doc.body.dataset.broadcastTheme,'pixel');
 themes.apply(doc,'base');assert.deepEqual(doc.body.style,{fontFamily:'Pretendard',fontSize:'72px'});
 assert.equal(doc.body.dataset.broadcastProfile,'cdcup-tournament');
 for(const preset of themes.presets){
  assert.deepEqual({...normalizeChannel({...source,broadcastTheme:preset.id}),broadcastTheme:'base'},base);
  assert.equal(themes.apply(doc,preset.id),preset.id);
  assert.equal(doc.body.dataset.broadcastProfile,'cdcup-tournament');
  assert.deepEqual(doc.body.style,{fontFamily:'Pretendard',fontSize:'72px'});
 }
});

test('console skin has no external image requests or interactive controls over the camera',()=>{
 const markup=themes.frame();
 assert.match(markup,/class="broadcast-console" aria-hidden="true"/);
 assert.doesNotMatch(markup,/<(?:img|video|iframe|button|input)|\bon\w+=|https?:/);
 const css=fs.readFileSync(path.join(__dirname,'../public/broadcast-themes.css'),'utf8');
 assert.doesNotMatch(css,/url\(|filter:drop-shadow/);
 assert.match(css,/pointer-events:none!important/);
 assert.equal(themes.frame(),markup,'unchanged frame markup can be reconciled without replacing media');
});

test('specialty masthead escapes channel text and stays separate from auction data',()=>{
 const channel={shortName:'크레용 <img src=x onerror="bad()">',broadcastTheme:'recessive-special'};
 const before=JSON.stringify(channel),markup=themes.frame(channel);
 assert.match(markup,/열성모프 특집/);
 assert.match(markup,/크레용 &lt;img/);
 assert.doesNotMatch(markup,/<img/);
 assert.equal(JSON.stringify(channel),before);
 assert.equal(themes.resolve('recessive-special').id,'recessive-special');
});
