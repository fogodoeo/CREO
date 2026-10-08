'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {zip,crc32,extension,prepare}=require('../public/promo-image-bundle');
const png=Uint8Array.from([137,80,78,71,13,10,26,10]),jpg=Uint8Array.from([255,216,255,224,0,0]);
test('plain mobile body keeps actual Band URL and editable copy without inserting image alt text',()=>{
 const fs=require('node:fs'),vm=require('node:vm'),source=fs.readFileSync(require.resolve('../public/promo-center.js'),'utf8');
 const ctx=vm.createContext({postBlocks:()=>[{type:'text',text:'업체 인사말'},{type:'image',alt:'사진 설명'},{type:'text',text:'밴드 가입',href:'https://band.us/n/a6a6beMe97Ucc'}]});
 vm.runInContext(source.slice(source.indexOf(' function plainBody('),source.indexOf('\n function preview(')),ctx);const text=ctx.plainBody({});assert.match(text,/업체 인사말/);assert.match(text,/https:\/\/band.us\/n\/a6a6beMe97Ucc/);assert.doesNotMatch(text,/사진 설명/);
});
async function entries(blob){
 const bytes=new Uint8Array(await blob.arrayBuffer()),view=new DataView(bytes.buffer),entries=[];let cursor=0;
 while(view.getUint32(cursor,true)===0x04034b50){
  const length=view.getUint32(cursor+18,true),nameLength=view.getUint16(cursor+26,true),extra=view.getUint16(cursor+28,true),name=new TextDecoder().decode(bytes.slice(cursor+30,cursor+30+nameLength)),data=bytes.slice(cursor+30+nameLength+extra,cursor+30+nameLength+extra+length);
  assert.equal(view.getUint16(cursor+6,true),0x800);assert.equal(view.getUint32(cursor+14,true),crc32(data));entries.push({name,data});cursor+=30+nameLength+extra+length;
 }
 const end=bytes.length-22;assert.equal(view.getUint32(end,true),0x06054b50);assert.equal(view.getUint16(end+8,true),entries.length);assert.equal(view.getUint32(end+16,true),cursor);
 return entries;
}
test('ZIP keeps Korean filenames and complete image bytes in standard UTF-8 store entries',async()=>{
 assert.equal(crc32(new TextEncoder().encode('123456789')),0xcbf43926);
 const result=await entries(zip([{name:'01_이미지.png',bytes:png},{name:'본문.txt',bytes:new TextEncoder().encode('밴드 링크')}]))
 assert.equal(result[0].name,'01_이미지.png');assert.deepEqual(result[0].data,png);assert.equal(new TextDecoder().decode(result[1].data),'밴드 링크');
});
test('mobile bundle includes every selected photo and logo in manuscript order, guide and editable text',async()=>{
 const urls=[],images=[{src:'/hero.png',alt:'대표 이미지'},{src:'/logos.png',alt:'업체 로고'},{src:'/photo.jpg',alt:'방송 사진'}];
 const result=await prepare(images,{text:'수정 가능한 본문\nhttps://band.us/n/test',fetcher:async(url,options)=>{urls.push(url);assert.equal(options.credentials,'same-origin');return{ok:true,headers:{get:()=>null},arrayBuffer:async()=>url.endsWith('.jpg')?jpg.buffer:png.buffer}}});
 assert.equal(result.count,3);assert.deepEqual(urls,images.map(i=>i.src));const saved=await entries(result.blob);assert.deepEqual(saved.map(v=>v.name),['01_이미지.png','02_이미지.png','03_이미지.jpg','사진순서.txt','본문.txt']);assert.match(new TextDecoder().decode(saved[3].data),/업체 로고/);assert.match(new TextDecoder().decode(saved[4].data),/수정 가능한 본문/);
});
test('failed or non-image response never returns an incomplete or invalid photo bundle',async()=>{
 for(const response of [{ok:false},{ok:true,headers:{get:()=>null},arrayBuffer:async()=>new TextEncoder().encode('<html>오류</html>').buffer}])await assert.rejects(prepare([{src:'/missing',alt:'사진'}],{fetcher:async()=>response}),/사진/);
 assert.throws(()=>extension(new Uint8Array()),/사진/);assert.throws(()=>zip([{name:'../wrong.png',bytes:png}]),/이름/);
});
test('large photos are rejected before transfer and no-photo states cannot produce a fake success',async()=>{
 let read=false;await assert.rejects(prepare([{src:'/large',alt:'사진'}],{fetcher:async()=>({ok:true,headers:{get:()=>String(25*1024*1024)},arrayBuffer:async()=>{read=true;return png.buffer;}})}),/용량/);assert.equal(read,false);await assert.rejects(prepare([]),/준비/);
});
test('closing or changing the preview aborts preparation and cannot replace a newer image bundle',async()=>{
 const fs=require('node:fs'),vm=require('node:vm'),source=fs.readFileSync(require.resolve('../public/promo-center.js'),'utf8'),calls=[],revoked=[];
 const nodes=Object.fromEntries(['save-images','mobile-image-status','prepare-images','mobile-post-help','detail'].map(id=>[id,{hidden:true,open:true,textContent:'',setAttribute(){},removeAttribute(name){delete this[name]},focus(){}}]));
 const ctx=vm.createContext({copying:false,partnerReady:true,partnerSequence:1,template:{},partnerImages:[],$:id=>nodes[id],AbortController,TypeError,URL:{createObjectURL:()=> 'blob:ready',revokeObjectURL:url=>revoked.push(url)},syncCopyButtons(){},postBlocks:()=>[{type:'image',src:'/photo.png',alt:'사진'}],imageURL:v=>v,plainBody:()=> '본문',setTimeout:()=>1,clearTimeout(){},window:{CreoPromoImageBundle:{prepare:(_images,options)=>new Promise((resolve,reject)=>calls.push({options,resolve,reject}))}}});
 vm.runInContext(source.slice(source.indexOf(' let imageBundleController='),source.indexOf('\n function openForm(')),ctx);
 const old=ctx.prepareImages();ctx.clearImageBundle();ctx.partnerSequence++;assert.equal(calls[0].options.signal.aborted,true);
 const newer=ctx.prepareImages();calls[0].resolve({blob:{},count:4});await old;assert.equal(nodes['save-images'].hidden,true);
 calls[1].resolve({blob:{},count:5});await newer;assert.equal(nodes['save-images'].hidden,false);assert.equal(nodes['save-images'].textContent,'전체 5장 저장');
 ctx.clearImageBundle();assert.deepEqual(revoked,['blob:ready']);assert.equal(nodes['save-images'].hidden,true);assert.equal(nodes['save-images'].href,undefined);
 const closed=ctx.prepareImages();nodes.detail.open=false;ctx.clearImageBundle();calls[2].resolve({blob:{},count:5});await closed;assert.equal(nodes['save-images'].hidden,true);
});
