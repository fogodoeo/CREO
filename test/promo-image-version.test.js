'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
test('updated partner artwork bypasses old browser caches without changing external image URLs',()=>{
 const source=fs.readFileSync(require.resolve('../public/promo-center.js'),'utf8');
 const start=source.indexOf(' function imageURL('),end=source.indexOf('\n const kst=',start);
 const ctx=vm.createContext({URL,location:{origin:'https://creok.onrender.com'}});vm.runInContext(source.slice(start,end),ctx);
 assert.equal(ctx.imageURL('/promo-assets/partners-20261007.png'),'https://creok.onrender.com/promo-assets/partners-20261007-v4.png');
 assert.equal(ctx.imageURL('/promo-assets/partners-20261007.thumb.webp'),'https://creok.onrender.com/promo-assets/partners-20261007-v4.thumb.webp');
 assert.equal(ctx.imageURL('/promo-assets/partners-20261007.png?download=1&v=old'),'https://creok.onrender.com/promo-assets/partners-20261007-v4.png?download=1&v=old');
 assert.equal(ctx.imageURL('https://example.com/promo-assets/partners-20261007.png?token=keep'),'https://example.com/promo-assets/partners-20261007.png?token=keep');
 assert.equal(ctx.imageURL('/promo-assets/showtime-photo.png'),'https://creok.onrender.com/promo-assets/showtime-photo.png');
 assert.equal(ctx.imageURL('/promo-assets/hero.jpg'),'https://creok.onrender.com/promo-assets/hero-seoul-incheon-v3.png');
 assert.equal(ctx.imageURL('/promo-assets/hero-seoul-incheon-v2.png'),'https://creok.onrender.com/promo-assets/hero-seoul-incheon-v3.png');
 assert.equal(ctx.imageURL('https://example.com/promo-assets/hero.jpg'),'https://example.com/promo-assets/hero.jpg');
 for(const name of ['weekly','easy'])for(const extension of ['png','thumb.webp']){
  assert.equal(ctx.imageURL(`/promo-assets/${name}.${extension}`),`https://creok.onrender.com/promo-assets/${name}-v2.${extension}`);
  assert.equal(ctx.imageURL(`https://creok.onrender.com/promo-assets/${name}.${extension}`),`https://creok.onrender.com/promo-assets/${name}-v2.${extension}`);
  assert.equal(ctx.imageURL(`https://example.com/promo-assets/${name}.${extension}`),`https://example.com/promo-assets/${name}.${extension}`);
 }
});
test('preview and formatted copy use one corrected hero without losing other Naver-hosted images',()=>{
 const source=fs.readFileSync(require.resolve('../public/promo-center.js'),'utf8');
 const ctx=vm.createContext({URL,location:{origin:'https://creok.onrender.com'},esc:v=>String(v)});
 vm.runInContext(source.slice(source.indexOf(' function imageURL('),source.indexOf('\n const kst=')),ctx);
 vm.runInContext(source.slice(source.indexOf(' function bodyHTML('),source.indexOf('\n function preview(')),ctx);
 const manuscript={blocks:[
  {type:'text',text:'인사말',align:'center',size:16},
  {type:'image',src:'/promo-assets/easy.png',copySrc:'https://creok.onrender.com/promo-assets/easy.png',alt:'알림'},
  {type:'image',src:'/promo-assets/hero.jpg',copySrc:'https://cafeptthumb-phinf.pstatic.net/old-seoul.jpg',alt:'첫 방송'},
  {type:'image',src:'/promo-assets/simple.png',copySrc:'https://cafeptthumb-phinf.pstatic.net/example.jpg?type=w1600',alt:'안내'}
 ]};
 const html=ctx.bodyHTML(manuscript,true);
 assert.match(html,/src="https:\/\/creok.onrender.com\/promo-assets\/easy-v2.png"/);
 assert.match(html,/src="https:\/\/cafeptthumb-phinf.pstatic.net\/example.jpg\?type=w1600"/);
 for(const content of [html,ctx.bodyHTML(manuscript)]){
  assert.match(content,/^<p[^>]*><img src="https:\/\/creok.onrender.com\/promo-assets\/hero-seoul-incheon-v3.png"/);
  assert.equal((content.match(/src="[^"]*hero-seoul-incheon-v3.png"/g)||[]).length,1);
  assert.doesNotMatch(content,/old-seoul|src="[^"]*hero.jpg/);
  assert.match(content,/EP 01\. 서울, 인천/);
 }
});
test('shared hero is added once without mutating source blocks, and thumbnails keep manuscript-specific images',()=>{
 const source=fs.readFileSync(require.resolve('../public/promo-center.js'),'utf8');
 const ctx=vm.createContext({URL,location:{origin:'https://creok.onrender.com'}});
 vm.runInContext(source.slice(source.indexOf(' function imageURL('),source.indexOf('\n const kst=')),ctx);
 const text={type:'text',text:'소개'},specific={type:'image',src:'/promo-assets/weekly.png'},oldHero={type:'image',src:'/promo-assets/hero.jpg'},newHero={type:'image',src:'https://creok.onrender.com/promo-assets/hero-seoul-incheon-v2.png?v=2'};
 for(const blocks of [[text,specific],[oldHero,text,newHero,specific],[text],[oldHero]]){
  const snapshot=JSON.stringify(blocks),t={blocks},result=ctx.postBlocks(t);
  assert.equal(result[0].src,'/promo-assets/hero-seoul-incheon-v3.png');
  assert.equal(result.filter(b=>ctx.isSharedHero(b)).length,1);
  assert.deepEqual(Array.from(result.slice(1)).filter(b=>!ctx.isSharedAsset(b,'ticket')),blocks.filter(b=>!ctx.isSharedHero(b)));
  assert.equal(JSON.stringify(blocks),snapshot);
  assert.equal(ctx.thumbnailImage(t),blocks.includes(specific)?specific:undefined);
 }
 const external={type:'image',src:'https://other.example/promo-assets/hero.jpg'};
 assert.equal(ctx.thumbnailImage({blocks:[external]}),external);
});
test('all manuscripts carry one Seoul/Incheon ticket before the Band link, with no old Naver ticket',()=>{
 const source=fs.readFileSync(require.resolve('../public/promo-center.js'),'utf8'),ctx=vm.createContext({URL,location:{origin:'https://creok.onrender.com'},esc:v=>String(v)});
 vm.runInContext(source.slice(source.indexOf(' function imageURL('),source.indexOf('\n const kst=')),ctx);
 vm.runInContext(source.slice(source.indexOf(' function bodyHTML('),source.indexOf('\n function preview(')),ctx);
 for(const t of require('../promo-templates.json')){
  const result=ctx.postBlocks(t);assert.equal(result.filter(b=>ctx.isSharedAsset(b,'ticket')).length,1,t.id);
  const ticket=result.findIndex(b=>ctx.isSharedAsset(b,'ticket')),link=result.findIndex(b=>b.href?.includes('band.us'));assert.ok(ticket<link,t.id);assert.match(result[ticket].alt,/서울·인천/);assert.equal(result[ticket].copySrc,undefined);
  const html=ctx.bodyHTML(t,true);assert.equal((html.match(/src="[^\"]*ticket-seoul-incheon-v2.png"/g)||[]).length,1,t.id);
 }
});
test('none/all/regions replace partner art once and preserve unrelated content and immutable source',()=>{
 const source=fs.readFileSync(require.resolve('../public/promo-center.js'),'utf8'),ctx=vm.createContext({URL,location:{origin:'https://creok.onrender.com'}});
 vm.runInContext(source.slice(source.indexOf(' function imageURL('),source.indexOf('\n const kst=')),ctx);
 for(const t of require('../promo-templates.json'))for(const images of [[],[{src:'https://assets.example/all.png',alt:'전체'}],[{src:'https://assets.example/seoul.png',alt:'서울'},{src:'https://assets.example/busan.png',alt:'부산'}]]){
  const before=JSON.stringify(t),result=ctx.postBlocks(t,images);assert.equal(JSON.stringify(t),before);assert.ok(!result.some(b=>ctx.isSharedAsset(b,'partners')));
  for(const image of images)assert.equal(result.filter(b=>b.src===image.src).length,1,t.id);
  for(const b of t.blocks.filter(b=>b.type==='text'&&!b.text.startsWith('※ 2026.10.07 기준')))assert.ok(result.includes(b),t.id);
 }
});
