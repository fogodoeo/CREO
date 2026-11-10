'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
test('Gyeonggi proclamation stays a single poster in thumbnail, preview and clipboard',()=>{
 const source=fs.readFileSync(require.resolve('../public/promo-center.js'),'utf8');
 const ctx=vm.createContext({URL,location:{origin:'https://creok.onrender.com'},esc:v=>String(v)});
 vm.runInContext(source.slice(source.indexOf(' function imageURL('),source.indexOf('\n const kst=')),ctx);
 vm.runInContext(source.slice(source.indexOf(' function bodyHTML('),source.indexOf('\n function preview(')),ctx);
 const src='/promo-assets/gyeonggi-ten-20261111.png',t={name:'경기십선',title:'전국크레자랑 시즌2',blocks:[{type:'image',src,alt:'경기십선'},{type:'text',text:'11월 11일 수요일 밤 8시',size:20,bold:true}]};
 assert.equal(ctx.thumbnailImage(t).src,src);
 assert.equal(ctx.postBlocks(t,[{src:'/unused-partners.png'}]).filter(b=>b.type==='image').length,1);
 for(const copy of [false,true]){const html=ctx.bodyHTML(t,copy);assert.equal((html.match(/<img /g)||[]).length,1);assert.match(html,/gyeonggi-ten-20261111/);assert.doesNotMatch(html,/museum|ticket|partners/);}
 assert.ok(fs.existsSync(require('node:path').join(__dirname,'../public',src)));
 assert.equal(require('../promo-media.json')[src],'https://creok.onrender.com'+src);
});
test('season 2 preview, copy and thumbnail use approved museum poster while historical manuscripts retain theirs',()=>{
 const source=fs.readFileSync(require.resolve('../public/promo-center.js'),'utf8');
 const ctx=vm.createContext({URL,location:{origin:'https://creok.onrender.com'},esc:v=>String(v)});
 vm.runInContext(source.slice(source.indexOf(' function imageURL('),source.indexOf('\n const kst=')),ctx);
 vm.runInContext(source.slice(source.indexOf(' function bodyHTML('),source.indexOf('\n function preview(')),ctx);
 const src='/promo-assets/hero-season2-museum-v23.png';
 const t={name:'시즌 2 개막',title:'11월 9일 서울·인천 / 11월 11일 경기',blocks:[{type:'text',text:'시즌 2로 돌아옵니다',size:24}]};
 const before=JSON.stringify(t);
 for(const copying of [false,true]){
  const html=ctx.bodyHTML(t,copying);
  assert.ok(html.startsWith('<p'));
  assert.equal((html.match(/hero-season2-museum-v23\.png/g)||[]).length,1);
  assert.doesNotMatch(html,/hero-wolssu-v1/);
 }
 assert.equal(ctx.thumbnailImage(t).src,src);
 assert.equal(JSON.stringify(t),before);
 assert.equal(ctx.postBlocks({...t,name:'지난 원고'})[0].src,'/promo-assets/hero-wolssu-v1.png');
 assert.equal(ctx.postBlocks({...t,name:'',title:'전국크레자랑 시즌2 시작'})[0].src,src);
 assert.ok(fs.existsSync(require('node:path').join(__dirname,'../public',src)));
 assert.equal(require('../promo-media.json')[src],'https://creok.onrender.com'+src);
 const seoul={...t,name:'시즌 2 · 11.9 서울·인천',title:'11월 9일 월요일 밤 8시'};
 const seoulSrc='/promo-assets/hero-season2-20261109-seoul-v2.png';
 assert.equal(ctx.thumbnailImage(seoul).src,seoulSrc);
 for(const copying of [false,true]){
  const html=ctx.bodyHTML(seoul,copying);
  assert.equal((html.match(/hero-season2-20261109-seoul-v2\.png/g)||[]).length,1);
  assert.doesNotMatch(html,/hero-season2-museum-v23/);
 }
 assert.ok(fs.existsSync(require('node:path').join(__dirname,'../public',seoulSrc)));
 assert.equal(require('../promo-media.json')[seoulSrc],'https://creok.onrender.com'+seoulSrc);
});
