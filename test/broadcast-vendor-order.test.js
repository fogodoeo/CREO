'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const {parseHTML}=require('linkedom'),Order=require('../public/broadcast-vendor-order'),Profiles=require('../public/broadcast-profiles');
const {createFixture}=require('../tools/vendor-portal-preview.cjs');
const channel={id:'national-cre'},state={page3On:true,page3Content:'vendor-order',page3VendorOrder:'첫 업체\n아기공룡&라이카\n마지막 업체',mode:'live',activeItemId:'lot'},item={id:'lot',channelId:channel.id,vendorName:'아기공룡 & 라이카',name:'B03',status:'live'};
test('two parts retain configured order, reverse by default and highlight only the active part',()=>{
 const model=Order.model(channel,state,[item]);assert.deepEqual(model[0].rows.map(r=>r.name),['첫 업체','아기공룡&라이카','마지막 업체']);assert.deepEqual(model[1].rows.map(r=>r.name),['마지막 업체','아기공룡&라이카','첫 업체']);
 assert.equal(model[0].rows.some(r=>r.current),false);assert.equal(model[1].rows[1].current,true);
 assert.deepEqual(Order.model(channel,{...state,page3VendorOrderSecond:'첫 업체\n마지막 업체'},[])[1].rows.map(r=>r.name),['첫 업체','마지막 업체']);
 for(const changed of [{channelId:'other'},{auctionArchiveId:'old'},{name:'C01'},{vendorName:'목록 밖'}])assert.equal(Order.model(channel,state,[{...item,...changed}]).flatMap(p=>p.rows).some(r=>r.current),false);
 assert.equal(Order.model(channel,{...state,mode:'standby'},[item]).flatMap(p=>p.rows).some(r=>r.current),false);
});
test('renderer escapes names, hides when off, and does not create fake vendors when empty',()=>{
 assert.equal(Order.render(channel,{...state,page3On:false},[item]),'');
 const {document}=parseHTML(Order.render(channel,{...state,page3VendorOrder:'<img src=x onerror=alert(1)>\n두번째'},[]));assert.equal(document.querySelector('img'),null);assert.equal(document.querySelectorAll('li').length,4);
 assert.match(Order.render(channel,{page3On:true},[]),/참여업체 순서를 등록/);
 assert.deepEqual(Order.names(' A \n A\n\nB'),['A','B']);assert.equal(Order.names(Array.from({length:20},(_,i)=>'업체'+i).join('\n')).length,12);
});
test('running order persists only in its channel, survives restart and preserves unrelated broadcast settings',async()=>{
 const f=await createFixture();try{
  const admin=f.client();await f.call(admin,'POST','/api/platform/auth/login',{password:f.secret});const route='/api/platform/channels/national-cre/broadcast-state';
  assert.equal((await f.call(admin,'PUT',route,{...state,page1Ticker:'기존 안내',page3VendorOrderSecond:'마지막 업체\n첫 업체'})).status,200);
  f.restart();const saved=(await f.call(admin,'GET','/api/platform/channels/national-cre/broadcast')).json().state;
  assert.equal(saved.page3Content,'vendor-order');assert.equal(saved.page3VendorOrder,state.page3VendorOrder);assert.equal(saved.page3VendorOrderSecond,'마지막 업체\n첫 업체');assert.equal(saved.page1Ticker,'기존 안내');
  assert.equal(Profiles.pageContract(channel,3,saved).id,'vendor-order');assert.equal(Profiles.pageContract(channel,2,saved).id,'item');assert.equal(Profiles.pageContract({...channel,dataAdapter:'legacy-cdcup'},3,saved).id,'scoreboard');
  await f.call(admin,'PUT',route,{page3Content:'summary'});const again=(await f.call(admin,'GET','/api/platform/channels/national-cre/broadcast')).json().state;assert.equal(again.page3VendorOrder,state.page3VendorOrder);
  assert.equal(Profiles.defaultState({id:'other'}).page3VendorOrder,'');
  const file=fs.readFileSync(require.resolve('../national-round-operations'),'utf8');assert.doesNotMatch(file.split('function assertDate')[0],/page3VendorOrder/);
 }finally{f.close()}
});
test('P3 profile dispatch uses the order renderer without disrupting P1/P2 or the quiz/ranking fallback',()=>{
 const html=fs.readFileSync(require.resolve('../public/auction-live.html'),'utf8'),context=vm.createContext({document:{body:{dataset:{}}},CreoBroadcastProfiles:Profiles,CreoVendorOrder:Order});
 vm.runInContext(html.slice(html.indexOf('function profilePageThree('),html.indexOf('const layoutSelectors=')),context);
 assert.equal(context.profilePageThree(channel,state,[item],[]),Order.render(channel,state,[item]));
});
