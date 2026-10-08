'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {polishPromoBlocks,polishPromoTitle}=require('../promo-copy-polish');
test('polish is idempotent and preserves unrelated text, formatting, image source and footer links',()=>{
 const blocks=[{type:'text',text:'대표님이 다듬은 본문',size:20,bold:true,color:'green',align:'left'},
  {type:'text',text:'배송 안내\n※ 사진은 AI 연출 이미지입니다.\n아이들은 집 근처 업체에서 픽업하는 방식으로 만나게 됩니다.',size:16},
  {type:'image',src:'/promo-assets/taste-v6.jpg',alt:'서로 다른 색과 무늬의 크레스티드게코 세 마리 · AI 연출 이미지'},
  {type:'text',text:'가입하기',href:'https://band.us/n/a6a6beMe97Ucc',size:18,align:'left'}];
 const snapshot=structuredClone(blocks),clean=polishPromoBlocks(blocks);
 assert.deepEqual(blocks,snapshot);assert.deepEqual(polishPromoBlocks(clean),clean);
 assert.deepEqual(clean[0],{...blocks[0],align:'center'});assert.equal(clean[2].src,blocks[2].src);assert.equal(clean[2].alt,'서로 다른 색과 무늬의 크레스티드게코 세 마리');
 assert.equal(clean[3].href,blocks[3].href);assert.match(clean[1].text,/생물 전문 배송업체/);assert.doesNotMatch(clean[1].text,/※ 사진/);
});
test('title hooks replace only known stock titles and keep custom operator titles',()=>{
 const hooks=require('../promo-copy-hooks.json');
 for(const [id,hook]of Object.entries(hooks)){
  for(const old of hook.previous)assert.equal(polishPromoTitle(id,old),hook.title);
  assert.equal(polishPromoTitle(id,hook.title),hook.title);
  assert.equal(polishPromoTitle(id,'대표님이 직접 쓴 제목'),'대표님이 직접 쓴 제목');
 }
});
test('copy hooks keep genre voices but remove unsupported system and quality claims',()=>{
 const seed=require('../promo-templates.json'),hooks=require('../promo-copy-hooks.json');
 for(const t of seed){
  assert.equal(t.title,hooks[t.id].title);assert.equal(t.title.length<65,true);
  assert.doesNotMatch(t.blocks.map(b=>b.text||'').join('\n'),/대한민국 최초|원클릭 정산|조명 왜곡 없이|간편 결제를 한 번에|가장 편리하게|전액 지원/);
 }
 assert.equal(seed.find(t=>t.id==='launch26-taste').blocks[0].text,'당신은 어떤 취향을\n갖고 있나요');
});
test('all published seeds use centered copy, no image notes or parcel claims, and specialist delivery',()=>{
 const seed=require('../promo-templates.json');assert.ok(seed.length>=6);
 for(const template of seed){
  const text=template.blocks.filter(b=>b.type==='text');
  assert.ok(text.every(b=>b.align==='center'),template.id);
  assert.doesNotMatch(text.map(b=>b.text).join('\n'),/택배|※.*(?:사진|이미지).*(?:연출|AI)/,template.id);
  assert.match(text.map(b=>b.text).join('\n'),/생물 전문 배송|전문 배송업체/,template.id);
  assert.ok(template.blocks.filter(b=>b.type==='image').every(b=>!b.alt.includes('AI 연출')),template.id);
 }
});
