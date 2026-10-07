'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {polishPromoBlocks}=require('../promo-copy-polish');
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
test('all six published seeds use centered copy, no image notes or parcel claims, and specialist delivery',()=>{
 const seed=require('../promo-templates.json');assert.equal(seed.length,6);
 for(const template of seed){
  const text=template.blocks.filter(b=>b.type==='text');
  assert.ok(text.every(b=>b.align==='center'),template.id);
  assert.doesNotMatch(text.map(b=>b.text).join('\n'),/택배|※.*(?:사진|이미지).*(?:연출|AI)/,template.id);
  assert.match(text.map(b=>b.text).join('\n'),/생물 전문 배송|전문 배송업체/,template.id);
  assert.ok(template.blocks.filter(b=>b.type==='image').every(b=>!b.alt.includes('AI 연출')),template.id);
 }
});
