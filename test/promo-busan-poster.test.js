'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
test('Busan November 23 begins with one selected poster in preview and copied HTML',()=>{
 const source=fs.readFileSync(require.resolve('../public/promo-center.js'),'utf8');
 const ctx=vm.createContext({URL,location:{origin:'https://creok.onrender.com'},esc:v=>String(v)});
 vm.runInContext(source.slice(source.indexOf(' function imageURL('),source.indexOf('\n const kst=')),ctx);
 vm.runInContext(source.slice(source.indexOf(' function bodyHTML('),source.indexOf('\n function preview(')),ctx);
 const src='/promo-assets/jeoncre-busan-20261123-v3.jpg';
 const t={name:'부울경편',title:'전국크레자랑',blocks:[{type:'image',src,alt:'부울경편'},{type:'text',text:'11월 23일 월요일 밤 8시',size:20,bold:true}]};
 assert.equal(ctx.thumbnailImage(t).src,src);
 assert.equal(ctx.postBlocks(t)[0].src,src);
 for(const copy of [false,true]){
  const html=ctx.bodyHTML(t,copy);
  assert.equal((html.match(/<img /g)||[]).length,1);
  assert.match(html,/20261123-v3/);
  assert.doesNotMatch(html,/hero-wolssu|museum|ticket|partners/);
 }
 assert.equal(require('../promo-media.json')[src],'https://creok.onrender.com'+src);
});
