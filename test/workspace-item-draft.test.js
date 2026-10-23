'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),Draft=require('../public/workspace-item-draft');
const context=()=>({channelId:'round21',channel:{id:'round21',nationalRound:{date:'2026-10-21'},vendorSettlement:{enabled:true},features:{vendors:true,groups:false}},vendors:[],items:[{lotNumber:4}]});
const original=()=>({id:'a01',name:'A01',lotNumber:1,status:'cancelled',vendorId:'old-vendor',groupId:'old-group',updatedAt:'v1',attributes:{broadcastDate:'2026-10-21',checklist:'gender:U|weight:3',parents:[{name:'가상 부모'}],unknown:'keep'}});
test('new editor uses the chosen broadcast date and next order; existing cancelled and unknown states survive',()=>{
 const c=context(),fresh=Draft.initial(null,c);assert.equal(fresh.broadcastDate,'2026-10-21');assert.equal(fresh.lotNumber,'5');
 const parent={...c,channel:{...c.channel,nationalRound:undefined,shippingSupport:{broadcastDate:'2026-10-14'}},round:{date:'2026-10-19'}};assert.equal(Draft.initial(null,parent).broadcastDate,'2026-10-19');
 for(const status of ['cancelled','legacy-state','live']){const record={...original(),status},values=Draft.initial(record,c),saved=Draft.payload(record,{...values,note:'새 비고'},c);assert.equal(saved.status,status);assert.equal(saved.groupId,'old-group');assert.equal(saved.attributes.unknown,'keep');assert.deepEqual(saved.attributes.parents,record.attributes.parents);assert.equal(saved.attributes.checklist,record.attributes.checklist);}
 assert.equal(Draft.validate({...fresh,name:'A05'},c),null);assert.equal(Draft.validate({...fresh,name:'A05',auctionKind:'event'},c).field,'name');assert.equal(Draft.validate({...fresh,name:'A05',soldPrice:'-1'},c).field,'soldPrice');
});
test('dirty state returns to clean when inputs are restored and a duplicate click shares one write',async()=>{
 let release,id=0;const calls=[],changes=[],saved=[];const model=Draft.create({scope:()=> 'round21',makeId:()=>String(++id),write:async(scope,method,body)=>{calls.push({scope,method,body});await new Promise(resolve=>release=resolve);return {record:{...body.record,updatedAt:'v2'}};},onChange:v=>changes.push(v),onSaved:r=>saved.push(r)});
 const values=model.open(original(),context());assert.equal(model.dirty(values),false);assert.equal(model.dirty({...values,note:'x'}),true);assert.equal(model.dirty({...values}),false);
 const first=model.save({...values,note:'x'}),second=model.save({...values,note:'y'});assert.equal(first,second);await Promise.resolve();assert.equal(calls.length,1);assert.equal(model.open(null,context()),null);release();assert.equal(await first,true);assert.equal(saved[0].note,'x');assert.deepEqual(changes,[true,false]);
});
test('uncertain creation retries the same request before applying subsequently changed input',async()=>{
 let fail=true,id=0;const calls=[],saved=[],errors=[];const model=Draft.create({scope:()=> 'round21',makeId:()=>String(++id),write:async(scope,method,body)=>{calls.push(structuredClone({scope,method,body}));if(fail){fail=false;throw Object.assign(Error('응답 지연'),{status:503});}return {record:{...body.record,updatedAt:'v'+calls.length}};},onSaved:r=>saved.push(r),onError:e=>errors.push(e.message)});
 const values={...model.open(null,context()),name:'A05'};assert.equal(await model.save(values),false);assert.equal(model.uncertain(),true);assert.equal(model.dirty(values),true);
 assert.equal(await model.save({...values,note:'추가 입력'}),true);assert.deepEqual(calls.map(c=>c.method),['POST','POST','PUT']);assert.deepEqual(calls[0],calls[1]);assert.equal(calls[2].body.record.id,calls[0].body.record.id);assert.equal(calls[2].body.expectedUpdatedAt,'v2');assert.notEqual(calls[2].body.editorRequestId,calls[0].body.editorRequestId);assert.equal(saved.length,1);assert.equal(saved[0].note,'추가 입력');
});
test('unchanged retry closes after the durable replay and validation or context failures never write',async()=>{
 let fail=true,scope='round21',id=0;const calls=[],errors=[],saved=[];const model=Draft.create({scope:()=>scope,makeId:()=>String(++id),write:async(s,m,b)=>{calls.push(b);if(fail){fail=false;throw Error('network');}return {record:{...b.record,updatedAt:'v2'}};},onError:e=>errors.push(e.message),onSaved:r=>saved.push(r)});
 const values=model.open(original(),context());assert.equal(await model.save({...values,lotNumber:'0'}),false);assert.equal(calls.length,0);
 assert.equal(await model.save({...values,note:'x'}),false);assert.equal(await model.save({...values,note:'x'}),true);assert.equal(calls.length,2);assert.equal(calls[0].editorRequestId,calls[1].editorRequestId);assert.equal(saved.length,1);
 scope='other';assert.equal(await model.save({...values,note:'wrong scope'}),false);assert.equal(calls.length,2);
});
test('stale version rejection keeps input without adopting or overwriting another writer',async()=>{
 const calls=[],errors=[];let id=0;const model=Draft.create({scope:()=> 'round21',makeId:()=>String(++id),write:async(s,m,b)=>{calls.push(b);throw Object.assign(Error('변경된 개체'),{status:409});},onError:e=>errors.push(e.message)});
 const values={...model.open(original(),context()),note:'내 입력'};assert.equal(await model.save(values),false);assert.equal(model.dirty(values),true);assert.equal(model.uncertain(),false);assert.equal(await model.save(values),false);assert.equal(calls[1].expectedUpdatedAt,'v1');assert.notEqual(calls[0].editorRequestId,calls[1].editorRequestId);assert.equal(errors.length,2);
});
