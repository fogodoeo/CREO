'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),{parseHTML}=require('linkedom');
const Access=require('../public/buyer-carrier-access'),Review=require('../public/carrier-request-review'),Search=require('../public/carrier-search');
function buyer(){
 const {document}=parseHTML('<section id="buyer-carrier-request"></section>'),box=document.querySelector('section');
 let focused;Object.defineProperty(document,'activeElement',{get:()=>focused});const create=document.createElement.bind(document);document.createElement=(...args)=>{const node=create(...args);node.focus=()=>focused=node;return node;};
 const state={destinationId:'parge',data:{channel:{id:'show'},round:{key:'date:1'},carrierRequest:{state:'available',canRequest:true}},query:'없는 지역',payments:{v:'card'}};
 const calls=[];let reply=async()=>({carrierRequest:{state:'pending',canRequest:false}}),chosen=0;
 const api=Access.create({document,getState:()=>state,request:(...args)=>{calls.push(args);return reply(...args)},onUpdate:data=>Object.assign(state.data,data),onChoose:()=>chosen++});
 const render=extra=>api.render({visible:true,matches:0,query:state.query,region:'전체',...extra});
 return{state,box,api,render,calls,document,setReply:f=>reply=f,chosen:()=>chosen};
}
test('buyer request stays hidden before an unsuccessful search and appears once without replacing the draft',async()=>{
 const s=buyer();for(const options of [{query:''},{query:'전'},{matches:2},{visible:false}]){s.render(options);assert(s.box.hidden);}
 s.render();assert.equal(s.box.querySelector('button').textContent,'우리 지역에 파르게 거점이 없어요');
 let release;s.setReply(()=>new Promise(r=>release=r));const click=s.box.querySelector('button').onclick;const work=click();click();assert.equal(s.calls.length,1);assert(s.box.querySelector('button').disabled);
 release({carrierRequest:{state:'pending',canRequest:false}});await work;
 assert.match(s.box.textContent,/운영자가 확인 중/);assert.equal(s.state.query,'없는 지역');assert.equal(s.state.payments.v,'card');
 s.setReply(async()=>({carrierRequest:{state:'pending',canRequest:false}}));
 const previous=s.box.querySelector('button');await s.api.refresh(true);assert.equal(s.box.querySelector('button'),previous,'unchanged polling must retain keyboard focus target');
 s.setReply(async()=>({carrierRequest:{state:'approved',canRequest:false,canUseDodosi:true}}));await s.api.refresh();
 assert.match(s.box.textContent,/도도시 지점 찾기/);s.box.querySelector('button').click();assert.equal(s.chosen(),1);
 assert.equal(s.document.activeElement.textContent,'도도시 지점 찾기');
});
test('failed request and manual refresh remain recoverable, reject reason is literal text',async()=>{
 const s=buyer();s.render();s.setReply(async()=>{throw Error('연결 실패')});await s.box.querySelector('button').onclick();
 assert.match(s.box.querySelector('[role=alert]').textContent,/다시 신청/);assert.equal(s.box.querySelector('button').disabled,false);
 s.setReply(async()=>({carrierRequest:{state:'pending'}}));await s.box.querySelector('button').onclick();
 s.setReply(async()=>{throw Error('offline')});await s.api.refresh(false);assert.match(s.box.textContent,/다시 확인/);
 s.setReply(async()=>({carrierRequest:{state:'rejected',reason:'<img src=x> 현장 수령 안내'}}));await s.api.refresh(false);
 assert.match(s.box.textContent,/<img src=x>/);assert.equal(s.box.querySelector('img'),null);assert.equal(s.box.querySelector('button'),null);
});
test('an old round response cannot replace the new round or its draft, and saving blocks application',async()=>{
 const s=buyer();s.state.saving=true;s.render();assert(s.box.querySelector('button').disabled);await s.box.querySelector('button').onclick();assert.equal(s.calls.length,0);
 s.state.saving=false;s.render();let release;s.setReply(()=>new Promise(r=>release=r));const pending=s.box.querySelector('button').onclick();
 s.state.data.round.key='date:2';s.state.query='새 지역';s.render();release({carrierRequest:{state:'approved',canUseDodosi:true}});await pending;
 assert.equal(s.state.data.carrierRequest.state,'available');assert.equal(s.state.query,'새 지역');assert.equal(s.box.querySelector('[role=alert]'),null);
});
function operator(review){
 const {document}=parseHTML('<section></section>'),container=document.querySelector('section'),busy=[];
 const records=[{id:'one',state:'pending',buyerName:'가상 낙찰자',phone:'01000000003',query:'전북',round:{name:'10/14 서울·인천'},notificationStatus:'queued'},{id:'two',state:'pending',buyerName:'다른 낙찰자',query:'강원'},{id:'done',state:'approved',buyerName:'완료한 낙찰자'}];
 Review.render({document,container,records,review,onBusy:v=>busy.push(v)});return{document,container,busy};
}
test('operator approval does not overlap another decision and announces the completed result',async()=>{
 let release,calls=0;const s=operator(async(id,body)=>{calls++;return new Promise(r=>release=()=>r({record:{id,state:'approved'}}))});
 assert(!s.container.querySelector('.carrier-completed').hasAttribute('open'));
 const buttons=s.container.querySelectorAll('[data-carrier-action=approve]'),pending=buttons[0].onclick();buttons[1].onclick();assert.equal(calls,1);assert(buttons[1].disabled);
 s.container.querySelector('[data-carrier-id=two] textarea').value='다른 신청의 작성 중인 사유';
 release();await pending;assert.deepEqual(s.busy,[true,false]);assert.equal(s.container.querySelectorAll('[data-carrier-action=approve]').length,1);
 assert.match(s.container.querySelector('[data-carrier-id=one]').textContent,/도도시 이용을 허용했어요/);assert(s.container.querySelector('.carrier-completed').hasAttribute('open'));
 assert.equal(s.container.querySelector('[data-carrier-id=two] textarea').value,'다른 신청의 작성 중인 사유');
});
test('operator rejection requires a reason and failed approval retains the reason and retry controls',async()=>{
 let fails=true;const s=operator(async(id,body)=>{if(fails)throw Error('저장 실패');return{record:{id,state:'rejected',reason:body.reason}}});
 const row=s.container.querySelector('[data-carrier-id=one]'),button=row.querySelector('[data-carrier-action=reject]');await button.onclick();assert.match(row.textContent,/사유를 적어/);
 row.querySelector('textarea').value='현장 수령으로 안내';await button.onclick();assert.match(row.textContent,/다시 시도/);assert.equal(row.querySelector('textarea').value,'현장 수령으로 안내');assert.equal(button.disabled,false);
 fails=false;await button.onclick();assert.match(s.container.querySelector('[data-carrier-id=one]').textContent,/거절 사유를 낙찰자 페이지에 표시/);
});
test('buyer and server share exact region, multiword, case and Korean initial search matching',()=>{
 const rates=[{region:'경기',shops:[{name:'가상 ABC점'}]},{region:'전북',shops:[{name:'전주점'}]}];
 for(const query of ['경기 abc','ㄱㄱ ㄱㅅ','  가상   ABC '])assert.equal(Search.find(rates,query).length,1,query);
 assert.equal(Search.find(rates,'abc','전북').length,0);assert.equal(Search.find(rates,'전주').length,1);assert.equal(Search.find(rates,'강원').length,0);
});
