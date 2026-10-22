'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const html=fs.readFileSync(require.resolve('../public/organizer-shipping.html'),'utf8');
const source=fs.readFileSync(require.resolve('../public/organizer-shipping.js'),'utf8');
const data=(received=50000)=>({scope:'round',round:{channelId:'alpha',archiveId:'',date:'2026-10-19',name:'로컬 경매'},channel:{id:'alpha',name:'로컬 경매'},bank:{bankName:'가상은행',bankAccount:'000-000',bankHolder:'예시 주관사',notificationPhone:'01000000000',updatedAt:'bank-1'},vendors:[{vendorId:'v',vendorName:'예시업체',vendorBankHolder:'예시예금주',totalAmount:80000,remainingAmount:80000-received,receivedAmount:received,itemCount:1,history:[],shippingFeeItems:[],missingDestinationItems:[]}],carriers:[]});
function screen(search='?channel=alpha'){
 const nodes=new Map([...html.matchAll(/id="([^"]+)"/g)].map(m=>[m[1],{hidden:false,value:'',textContent:'',innerHTML:'',disabled:false,open:false,focus(){},setAttribute(){},replaceChildren(){this.innerHTML='';this.textContent=''},querySelectorAll(){return []},close(){this.open=false},showModal(){this.open=true}}]));
 const calls=[],timers=[];
 const context=vm.createContext({URLSearchParams,structuredClone,crypto:{randomUUID:()=> 'same-ui-request'},location:{search,pathname:'/organizer-shipping.html'},document:{getElementById:id=>nodes.get(id),hidden:false,querySelector:()=>null},CreoPlatform:{escapeHtml:String,api:(path,options)=>new Promise((resolve,reject)=>calls.push({path,options,resolve,reject}))},setInterval(fn){timers.push(fn)}});
 context.window=context;
 vm.runInContext(fs.readFileSync(require.resolve('../public/delivery-schedule-view.js'),'utf8'),context);
 vm.runInContext(source,context);
 return {nodes,calls,timers,run:code=>vm.runInContext(code,context),async ready(){calls[0].resolve(data());await new Promise(setImmediate)}};
}
const failure=status=>Object.assign(Error('예시 오류'),{status});

test('first load failure exposes retry; recovery clears the error and never edits the ledger',async()=>{
 const f=screen();f.calls[0].reject(failure(503));await new Promise(setImmediate);
 assert.equal(f.nodes.get('retry').hidden,false);assert.equal(f.nodes.get('message').textContent,'정산 내역을 불러오지 못했어요.');
 f.nodes.get('retry').onclick();assert.equal(f.calls.length,2);f.calls[1].resolve(data());await new Promise(setImmediate);
 assert.equal(f.nodes.get('content').hidden,false);assert.equal(f.nodes.get('message').textContent,'');assert.equal(f.nodes.get('retry').hidden,true);
 assert.ok(f.calls.every(r=>(r.options.method||'GET')==='GET'&&r.options.cache==='no-store'));
});

test('unassigned receipts expose explicit recovery, block only that vendor and preserve pending status',async()=>{
 const f=screen(),view=data();view.unassignedReceiptCount=1;view.vendors[0].unassignedReceiptCount=1;
 view.unassignedReceipts=[{id:'old',vendorId:'v',vendorName:'예시업체',amount:10000,status:'pending',paidOn:'2026-10-15',rounds:[{archiveId:'previous',name:'10/14 회차',date:'2026-10-14',itemIds:['old-item']}]}];
 f.calls[0].resolve(view);await new Promise(setImmediate);
 assert.equal(f.nodes.get('unassigned-receipts').hidden,false);assert.match(f.nodes.get('unassigned-list').innerHTML,/회차 선택/);
 f.run('openReceipt(state.vendors[0])');assert.equal(f.nodes.get('confirm-receipt').disabled,true);assert.equal(f.nodes.get('review-old-receipts').hidden,false);
 await f.run('saveReceipt({preventDefault(){}})');assert.equal(f.calls.length,1);
 await f.run("assignReceipt(0,'')");assert.equal(f.calls.length,1,'must explicitly choose a round');
 const action=f.run("assignReceipt(0,'0')");const payload=JSON.parse(f.calls[1].options.body);
 assert.equal(f.calls[1].path,'channels/alpha/organizer-shipping/assign-round');assert.equal(payload.targetArchiveId,'previous');assert.equal(payload.expectedStatus,'pending');assert.equal(payload.action,undefined);
 f.calls[1].resolve({duplicate:false});await new Promise(setImmediate);f.calls[2].resolve(data());await action;
 assert.equal(f.nodes.get('unassigned-receipts').hidden,true);assert.match(f.nodes.get('message').textContent,/회차를 연결/);
});
test('selected round title stays literal in the page and receipt dialog, and is cleared on lost access',async()=>{
 const f=screen('?channel=alpha&archive=previous'),old=data();
 old.round={channelId:'alpha',archiveId:'previous',date:'2026-10-14',name:'<이전 회차>'};
 f.calls[0].resolve(old);await new Promise(setImmediate);
 assert.equal(f.calls[0].path,'channels/alpha/organizer-shipping?archive=previous');
 assert.equal(f.nodes.get('channel').textContent,'<이전 회차> · 2026-10-14');
 f.run('openReceipt(state.vendors[0])');
 assert.equal(f.nodes.get('receipt-round').textContent,'<이전 회차> · 2026-10-14');
 assert.equal(f.nodes.get('receipt-amount').value,'30,000');
 f.run('clearAccess()');assert.equal(f.nodes.get('channel').textContent,'');assert.equal(f.nodes.get('receipt-round').textContent,'');
});
test('wrong channel or round cannot replace the screen or retain an open receipt; retry restores the requested scope',async()=>{
 for(const mismatch of ['channel','round','archive','missing']){
  const f=screen();await f.ready();f.run('openReceipt(state.vendors[0])');
  const next=data(),refresh=f.run('load()');
  if(mismatch==='channel')next.channel.id='beta';
  if(mismatch==='round')next.round.channelId='beta';
  if(mismatch==='archive')next.round.archiveId='previous';
  if(mismatch==='missing')delete next.round;
  f.calls[1].resolve(next);await refresh;
  assert.equal(f.nodes.get('content').hidden,true);assert.equal(f.nodes.get('receipt-dialog').open,false);
  assert.equal(f.nodes.get('total').textContent,'');assert.equal(f.nodes.get('receipt-amount').value,'');
  assert.match(f.nodes.get('message').textContent,/회차 정보가 일치하지/);assert.equal(f.nodes.get('retry').hidden,false);
  await f.run('saveReceipt({preventDefault(){}})');assert.equal(f.calls.length,2);
  const retry=f.run('load()'),correct=data();correct.round.name='로컬 경매 · 2026-10-19';
  f.calls[2].resolve(correct);await retry;
  assert.equal(f.nodes.get('content').hidden,false);assert.equal(f.nodes.get('channel').textContent,'로컬 경매 · 2026-10-19');
 }
});
test('older success and older authorization failure cannot replace a newer screen',async()=>{
 const f=screen();await f.ready();
 const old=f.run('load()'),latest=f.run('load()');f.calls[2].resolve(data(60000));await latest;f.calls[1].reject(failure(401));await old;
 assert.equal(f.nodes.get('total').textContent,'20,000원');assert.equal(f.nodes.get('content').hidden,false);
 const oldSuccess=f.run('load()'),newer=f.run('load()');f.calls[4].resolve(data(70000));await newer;f.calls[3].resolve(data(0));await oldSuccess;
 assert.equal(f.nodes.get('total').textContent,'10,000원');assert.equal(f.nodes.get('message').textContent,'');
});
test('failed refresh leaves the snapshot readable but blocks new receipts until a successful read',async()=>{
 const f=screen();await f.ready();const pending=f.run('load()');f.calls[1].reject(failure(503));await pending;
 f.run('openReceipt(state.vendors[0])');assert.equal(f.nodes.get('receipt-dialog').open,true);assert.equal(f.nodes.get('receipt-reload').hidden,false);assert.equal(f.nodes.get('confirm-receipt').disabled,true);
 const count=f.calls.length;await f.run('saveReceipt({preventDefault(){}})');assert.equal(f.calls.length,count);
 f.nodes.get('receipt-reload').onclick();f.calls[2].resolve(data(60000));await new Promise(setImmediate);
 assert.equal(f.nodes.get('receipt-amount').value,'20,000');assert.equal(f.nodes.get('confirm-receipt').disabled,false);
});
test('authorization loss on a write clears private forms and a late read cannot restore them',async()=>{
 const f=screen();await f.ready();const old=f.run('load()');
 f.run('openReceipt(state.vendors[0]);setReceiptBusy(true);receiptError({status:401});setReceiptBusy(false)');
 f.calls[1].resolve(data());await old;
 assert.equal(f.nodes.get('receipt-dialog').open,false);assert.equal(f.nodes.get('content').hidden,true);assert.equal(f.nodes.get('login').hidden,false);
 for(const id of ['receipt-amount','receipt-memo','bankAccount','notificationPhone'])assert.equal(f.nodes.get(id).value,'');
 for(const id of ['vendors','carriers','receipt-detail-content','auction-items','auction-vendor'])assert.equal(f.nodes.get(id).innerHTML,'');
 assert.equal(f.nodes.get('receipt-title').textContent,'입금 확인');assert.equal(f.run('state'),null);
 const count=f.calls.length;f.timers[0]();assert.equal(f.calls.length,count,'expired access should not poll repeatedly');
});
test('response loss retries the identical request; no extra receipt is invented by the screen',async()=>{
 const f=screen();await f.ready();f.run('openReceipt(state.vendors[0])');f.nodes.get('receipt-amount').value='10,000';
 const first=f.run('saveReceipt({preventDefault(){}})');f.calls[1].reject(failure(503));await first;
 assert.equal(f.nodes.get('confirm-receipt').disabled,false);assert.equal(f.nodes.get('receipt-amount').value,'10,000');
 const retry=f.run('saveReceipt({preventDefault(){}})');assert.equal(f.calls[2].options.body,f.calls[1].options.body);
 f.calls[2].resolve({duplicate:true});await new Promise(setImmediate);f.calls[3].resolve(data(60000));await retry;
 assert.equal(f.nodes.get('receipt-dialog').open,false);assert.equal(f.nodes.get('total').textContent,'20,000원');assert.equal(f.nodes.get('message').textContent,'입금 확인 완료');
});
test('successful save followed by a failed read distinguishes saved work from stale totals',async()=>{
 const f=screen();await f.ready();f.run('openReceipt(state.vendors[0])');const saving=f.run('saveReceipt({preventDefault(){}})');
 f.calls[1].resolve({ok:true});await new Promise(setImmediate);f.calls[2].reject(failure(503));await saving;
 assert.equal(f.nodes.get('receipt-dialog').open,false);assert.equal(f.nodes.get('retry').hidden,false);assert.equal(f.nodes.get('message').textContent,'입금 확인 완료 · 최신 내역 확인이 필요해요.');assert.equal(f.run('fresh'),false);
});
test('bank draft survives read recovery, while authorization loss erases it',async()=>{
 const f=screen();await f.ready();f.nodes.get('edit-bank').onclick();f.nodes.get('bankAccount').value='draft-account';f.nodes.get('bank-form').oninput();
 const pending=f.run('load()');f.calls[1].resolve(data());await pending;assert.equal(f.nodes.get('bankAccount').value,'draft-account');
 const save=f.nodes.get('bank-form').onsubmit({preventDefault(){}});f.calls[2].reject(failure(401));await save;
 assert.equal(f.nodes.get('bankAccount').value,'');assert.equal(f.nodes.get('content').hidden,true);assert.equal(f.nodes.get('message').textContent,'다시 로그인해 주세요.');
});
test('a bare organizer page asks for its link without a futile network retry',()=>{
 const f=screen('');assert.equal(f.calls.length,0);assert.equal(f.nodes.get('retry').hidden,true);assert.equal(f.nodes.get('message').textContent,'주관사 전용 링크로 접속해 주세요.');
});
test('overpayment is visible separately and does not hide another vendor’s outstanding balance',async()=>{
 const f=screen();await f.ready();
 assert.equal(f.nodes.get('overpaid-total').hidden,true);
 f.run("state.vendors.push({...state.vendors[0],vendorId:'overpaid',receivedAmount:90000,remainingAmount:0,overpaidAmount:10000});render()");
 assert.equal(f.nodes.get('total').textContent,'30,000원');assert.equal(f.nodes.get('received').textContent,'140,000원');assert.equal(f.nodes.get('overpaid-total').textContent,'초과 입금 10,000원');assert.equal(f.nodes.get('overpaid-total').hidden,false);
 assert.equal(f.run('vendorStatus(state.vendors[1])'),'초과 입금');assert.equal(f.run('vendorBalance(state.vendors[1])'),'10,000원 초과');
 f.nodes.get('vendor-stage').value='review';f.nodes.get('vendor-stage').onchange();
 assert.match(f.nodes.get('vendors').innerHTML,/10,000원 초과/);
});

test('organizer starts with confirmation work and filtering never changes round totals or writes receipts',async()=>{
 const f=screen(),view=data();view.vendors.push(
  {...view.vendors[0],vendorId:'request',vendorName:'확인업체',pendingReport:{amount:30000}},
  {...view.vendors[0],vendorId:'done',vendorName:'완료업체',remainingAmount:0,receivedAmount:80000},
  {...view.vendors[0],vendorId:'missing',vendorName:'미확정업체',remainingAmount:0,missingDestinationItems:[{id:'item'}]}
 );
 f.calls[0].resolve(view);await new Promise(setImmediate);
 assert.equal(f.nodes.get('vendor-stage').value,'review');assert.match(f.nodes.get('vendors').innerHTML,/확인업체/);assert.doesNotMatch(f.nodes.get('vendors').innerHTML,/완료업체/);
 const totals=['total','all-total','received'].map(id=>f.nodes.get(id).textContent);
 for(const [stage,name] of [['unpaid','예시업체'],['done','완료업체'],['missing','미확정업체']]){
  f.nodes.get('vendor-stage').value=stage;f.nodes.get('vendor-stage').onchange();
  assert.match(f.nodes.get('vendors').innerHTML,new RegExp(name));assert.equal(f.nodes.get('vendor-result-count').textContent,'1개 업체');
  assert.deepEqual(['total','all-total','received'].map(id=>f.nodes.get(id).textContent),totals);
 }
 assert.equal(f.calls.length,1);assert.equal(f.nodes.get('receipt-dialog').open,false);
});

test('company and account holder search preserves query on refresh and provides a clear empty-state exit',async()=>{
 const f=screen();await f.ready();
 f.nodes.get('vendor-search').value='예시예금주';f.nodes.get('vendor-search').oninput();assert.match(f.nodes.get('vendors').innerHTML,/예시업체/);
 f.nodes.get('vendor-search').value='없는 업체';f.nodes.get('vendor-search').oninput();
 assert.equal(f.nodes.get('vendor-result-count').textContent,'0개 업체');assert.equal(f.nodes.get('vendor-reset').hidden,false);assert.match(f.nodes.get('vendors').innerHTML,/전체 업체 보기/);
 const reload=f.run('load()');f.calls[1].resolve(data());await reload;
 assert.equal(f.nodes.get('vendor-search').value,'없는 업체');assert.equal(f.nodes.get('vendor-result-count').textContent,'0개 업체');
 f.nodes.get('vendor-reset').onclick();assert.equal(f.nodes.get('vendor-search').value,'');assert.equal(f.nodes.get('vendor-stage').value,'all');assert.match(f.nodes.get('vendors').innerHTML,/예시업체/);
 assert.ok(f.calls.every(call=>!call.options.method||call.options.method==='GET'));
});

test('filters reset for another round and authorization loss clears search and counts',async()=>{
 const f=screen();await f.ready();f.nodes.get('vendor-search').value='private query';f.nodes.get('vendor-stage').value='done';f.nodes.get('vendor-stage').onchange();
 f.run("state.round.date='2026-10-21';render()");assert.equal(f.nodes.get('vendor-search').value,'');assert.equal(f.nodes.get('vendor-stage').value,'unpaid');
 f.nodes.get('vendor-search').value='private query';f.run('clearAccess()');
 assert.equal(f.nodes.get('vendor-search').value,'');assert.equal(f.nodes.get('vendor-result-count').textContent,'');assert.equal(f.nodes.get('vendor-stage').innerHTML,'');assert.equal(f.nodes.get('vendor-reset').hidden,true);
 assert.doesNotThrow(()=>f.nodes.get('vendor-search').oninput());
});
test('organizer auction view separates sales from shipping, includes pending and pickup, and filters without writes',async()=>{
 const f=screen();await f.ready();
 f.run(`state.auctionItems=[
  {id:'a',code:'A01',vendorId:'v',vendorName:'업체',buyerName:'가나다',amount:100000,paymentStatus:'pending',method:'delivery',destination:'서울',shippingFee:3500},
  {id:'b',code:'B01',vendorId:'v',vendorName:'업체',buyerName:'나나다',amount:200000,paymentStatus:'paid',method:'pickup',destination:'대구본점'},
  {id:'c',code:'A02',vendorId:'other',vendorName:'다른업체',buyerName:'다나다',amount:500000,paymentStatus:'refunded'}];render();setOrganizerView('auction')`);
 assert.equal(f.nodes.get('auction-total').textContent,'300,000원');assert.equal(f.nodes.get('total').textContent,'30,000원');
 assert.equal(f.nodes.get('shipping-panel').hidden,true);assert.equal(f.nodes.get('auction-panel').hidden,false);
 assert.match(f.nodes.get('auction-items').innerHTML,/결제 대기/);assert.match(f.nodes.get('auction-items').innerHTML,/직수령/);assert.match(f.nodes.get('auction-items').innerHTML,/환불/);
 f.nodes.get('auction-search').value='B01';f.nodes.get('auction-search').oninput();
 assert.match(f.nodes.get('auction-items').innerHTML,/B01/);assert.doesNotMatch(f.nodes.get('auction-items').innerHTML,/A01/);
 f.nodes.get('auction-search').value='';f.nodes.get('auction-vendor').value='other';f.nodes.get('auction-vendor').onchange();
 assert.equal(f.nodes.get('auction-total').textContent,'0원');assert.match(f.nodes.get('auction-items').innerHTML,/A02/);
 f.run('clearAccess()');assert.equal(f.nodes.get('auction-items').innerHTML,'');assert.equal(f.nodes.get('auction-total').textContent,'');
 assert.equal(f.calls.length,1,'view changes are read-only');
});
