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
});
