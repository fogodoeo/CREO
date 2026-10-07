'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
test('updated partner artwork bypasses old browser caches without changing external image URLs',()=>{
 const source=fs.readFileSync(require.resolve('../public/promo-center.js'),'utf8');
 const start=source.indexOf(' function imageURL('),end=source.indexOf('\n const kst=',start);
 const ctx=vm.createContext({URL,location:{origin:'https://creok.onrender.com'}});vm.runInContext(source.slice(start,end),ctx);
 assert.equal(ctx.imageURL('/promo-assets/partners-20261007.png'),'https://creok.onrender.com/promo-assets/partners-20261007.png?v=board3');
 assert.equal(ctx.imageURL('/promo-assets/partners-20261007.thumb.webp'),'https://creok.onrender.com/promo-assets/partners-20261007.thumb.webp?v=board3');
 assert.equal(ctx.imageURL('/promo-assets/partners-20261007.png?download=1&v=old'),'https://creok.onrender.com/promo-assets/partners-20261007.png?download=1&v=board3');
 assert.equal(ctx.imageURL('https://example.com/promo-assets/partners-20261007.png?token=keep'),'https://example.com/promo-assets/partners-20261007.png?token=keep');
 assert.equal(ctx.imageURL('/promo-assets/showtime-photo.png'),'https://creok.onrender.com/promo-assets/showtime-photo.png');
 for(const name of ['weekly','easy'])for(const extension of ['png','thumb.webp']){
  assert.equal(ctx.imageURL(`/promo-assets/${name}.${extension}`),`https://creok.onrender.com/promo-assets/${name}-v2.${extension}`);
  assert.equal(ctx.imageURL(`https://creok.onrender.com/promo-assets/${name}.${extension}`),`https://creok.onrender.com/promo-assets/${name}-v2.${extension}`);
  assert.equal(ctx.imageURL(`https://example.com/promo-assets/${name}.${extension}`),`https://example.com/promo-assets/${name}.${extension}`);
 }
});
test('formatted copy also uses refreshed same-origin images while keeping Naver-hosted images intact',()=>{
 const source=fs.readFileSync(require.resolve('../public/promo-center.js'),'utf8');
 const ctx=vm.createContext({URL,location:{origin:'https://creok.onrender.com'},esc:v=>String(v)});
 vm.runInContext(source.slice(source.indexOf(' function imageURL('),source.indexOf('\n const kst=')),ctx);
 vm.runInContext(source.slice(source.indexOf(' function bodyHTML('),source.indexOf('\n function preview(')),ctx);
 const html=ctx.bodyHTML({blocks:[
  {type:'image',src:'/promo-assets/easy.png',copySrc:'https://creok.onrender.com/promo-assets/easy.png',alt:'알림'},
  {type:'image',src:'/promo-assets/hero.jpg',copySrc:'https://cafeptthumb-phinf.pstatic.net/example.jpg?type=w1600',alt:'첫 방송'}
 ]},true);
 assert.match(html,/src="https:\/\/creok.onrender.com\/promo-assets\/easy-v2.png"/);
 assert.match(html,/src="https:\/\/cafeptthumb-phinf.pstatic.net\/example.jpg\?type=w1600"/);
});
