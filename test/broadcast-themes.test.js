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
});

test('registered pixel asset is a small square RGBA PNG',()=>{
 const asset=path.join(__dirname,'../public',themes.resolve('pixel').frame);
 const buffer=fs.readFileSync(asset);
 assert.equal(buffer.toString('hex',0,8),'89504e470d0a1a0a');assert.equal(buffer[25],6);
 assert.ok(buffer.length<300000);assert.equal(buffer.readUInt32BE(16),buffer.readUInt32BE(20));
 // Center alpha is checked from the generated file during the documented visual review.
});
