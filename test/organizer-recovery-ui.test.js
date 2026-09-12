'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const html=fs.readFileSync(require.resolve('../public/organizer-shipping.html'),'utf8');
const source=fs.readFileSync(require.resolve('../public/organizer-shipping.js'),'utf8');
const data=(received=50000)=>({channel:{name:'로컬 경매'},bank:{bankName:'가상은행',bankAccount:'000-000',bankHolder:'예시 주관사',notificationPhone:'01000000000',updatedAt:'bank-1'},vendors:[{vendorId:'v',vendorName:'예시업체',vendorBankHolder:'예시예금주',totalAmount:80000,remainingAmount:80000-received,receivedAmount:received,itemCount:1,history:[],shippingFeeItems:[],missingDestinationItems:[]}],carriers:[]});
function screen(search='?channel=alpha'){
 const nodes=new Map([...html.matchAll(/id="([^"]+)"/g)].map(m=>[m[1],{hidden:false,value:'',textContent:'',innerHTML:'',disabled:false,open:false,focus(){},setAttribute(){},replaceChildren(){this.innerHTML='';this.textContent=''},querySelectorAll(){return []},close(){this.open=false},showModal(){this.open=true}}]));
 const calls=[],timers=[];
 const context=vm.createContext({URLSearchParams,structuredClone,crypto:{randomUUID:()=> 'same-ui-request'},location:{search,pathname:'/organizer-shipping.html'},document:{getElementById:id=>nodes.get(id),hidden:false,querySelector:()=>null},CreoPlatform:{escapeHtml:String,api:(path,options)=>new Promise((resolve,reject)=>calls.push({path,options,resolve,reject}))},setInterval(fn){timers.push(fn)}});
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
 for(const id of ['vendors','carriers','receipt-detail-content'])assert.equal(f.nodes.get(id).innerHTML,'');
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
 assert.match(f.nodes.get('vendors').innerHTML,/10,000원 초과/);
});
