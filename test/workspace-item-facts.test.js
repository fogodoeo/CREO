'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),Facts=require('../public/workspace-item-facts'),Draft=require('../public/workspace-item-draft'),{checkoutItem}=require('../checkout-item-data');
const item=()=>({id:'a',name:'A01',category:'기존 모프',attributes:{privateNote:'keep',gender:'F',weight:'28',checklist:'gender:F|weight:28|birth:2025-07-01|tail:짧음',entry_traits:{sex:'female',weight:'28',hatchDate:'2025-07-01',morph:'기존 모프'},parents:[{role:'sire',name:'부 이름',morph:'부 모프',media:[{url:'/sire.webp'}],extra:'keep'},{role:'dam',name:'모 이름',media:[{url:'/dam.webp'}]}]}});
test('editing traits keeps broadcast, checkout and sheet representations aligned without touching other facts',()=>{
 const original=item(),values={...Facts.initial(original),sex:'U',weight:'3',hatchDate:'2026-09-01'},result=Facts.apply(original,{...original,category:'새 모프'},values);
 assert.equal(result.attributes.gender,'U');assert.equal(result.attributes.weight,'3');assert.match(result.attributes.checklist,/gender:U\|weight:3\|birth:2026-09-01\|tail:짧음/);assert.equal(result.attributes.privateNote,'keep');assert.deepEqual(result.attributes.parents,original.attributes.parents);assert.deepEqual(checkoutItem(result).traits,{sex:'unknown',weight:'3',hatchDate:'2026-09-01',morph:'새 모프',size:''});assert.equal(original.attributes.weight,'28');
 const cleared=Facts.apply(result,result,{...Facts.initial(result),sex:'',weight:'',hatchDate:''});assert.equal(checkoutItem(cleared).traits.weight,'');assert.equal(checkoutItem(cleared).traits.hatchDate,'');
});
test('unmodified legacy values remain intact and invalid newly entered values identify their field',()=>{
 const original=item();original.attributes.entry_traits={sex:'확인 필요',weight:'미측정',hatchDate:'25년 7월'};const values=Facts.initial(original);assert.equal(Facts.validate(values,original),null);assert.equal(Facts.apply(original,original,values),original);
 for(const [field,value]of [['sex','bad'],['weight','-1'],['weight','0'],['weight','1001'],['weight','3.123'],['hatchDate','2025-02-30'],['hatchDate','2999-01-01']])assert.equal(Facts.validate({...values,[field]:value},original).field,field);
 assert.equal(Facts.validate({...values,weight:'3.25',sex:'PF',hatchDate:'2025-02-28'},original),null);
});
test('parent name changes preserve every photo and mark only the changed side as an override',()=>{
 const original=item(),values={...Facts.initial(original),sireName:'판호'},result=Facts.apply(original,original,values);assert.equal(result.attributes.parents.find(p=>p.role==='sire').name,'판호');assert.equal(result.attributes.parents.find(p=>p.role==='sire').extra,'keep');assert.deepEqual(result.attributes.parents.find(p=>p.role==='sire').media,[{url:'/sire.webp'}]);assert.deepEqual(result.attributes.parentPhotoOverrides,['sire']);assert.equal(original.attributes.parents[0].name,'부 이름');
});
test('photo replacements and removal update the same stored sources used by broadcast and checkout',()=>{
 const original=item(),main={url:'/child.webp',thumbnailUrl:'/thumb.webp'},result=Facts.withPhotos(original,'child',[main]);assert.equal(result.photoUrl,main.url);assert.deepEqual(result.attributes.media,[main]);assert.equal(result.attributes.photo_item,main.url);
 const withSire=Facts.withPhotos(result,'sire',[{url:'/new.webp'}]);assert.deepEqual(Facts.photos(withSire,'sire'),[{url:'/new.webp'}]);assert.equal(withSire.attributes.parents.find(p=>p.role==='sire').name,'부 이름');assert.deepEqual(Facts.photos(withSire,'dam'),[{url:'/dam.webp'}]);assert.deepEqual(Facts.photos(Facts.withPhotos(withSire,'sire',[]),'sire'),[]);assert.equal(Facts.withPhotos(withSire,'child',[]).photoUrl,'');
});
test('failed photo preparation retains the draft, then a successful retry writes once with original version',async()=>{
 let fail=true;const writes=[],errors=[],original={...item(),lotNumber:1,updatedAt:'v1'},context={channelId:'alpha',channel:{},items:[]};const editor=Draft.create({scope:()=> 'alpha',prepare:async record=>{if(fail)throw Error('upload failed');return Facts.withPhotos(record,'child',[{url:'/uploaded.webp'}]);},write:async(channel,method,body)=>{writes.push(body);return {record:{...body.record,updatedAt:'v2'}};},onError:e=>errors.push(e.message)}),values=editor.open(original,context);values.weight='3';
 assert.equal(await editor.save(values),false);assert.equal(writes.length,0);assert.equal(editor.dirty(values),true);fail=false;assert.equal(await editor.save(values),true);assert.equal(writes.length,1);assert.equal(writes[0].expectedUpdatedAt,'v1');assert.equal(writes[0].record.attributes.entry_traits.weight,'3');assert.equal(writes[0].record.photoUrl,'/uploaded.webp');
});
