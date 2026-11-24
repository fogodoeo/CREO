'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs');
const source=fs.readFileSync(require.resolve('../tools/dodosi-helper/receipts.js'),'utf8');
const html=value=>'<script>self.__next_f.push('+JSON.stringify([1,'8:'+JSON.stringify(['$','$L13',null,value])+'\n'])+')</script>';
const id='00000000-0000-0000-0000-000000000001';
const entry={id,shipmentNo:'D-TEST',status:'scheduled',petCount:6,dropDate:'2026-11-24',pickDate:'2026-11-28',dropShop:'[대구/북구] 테스트',pickShop:'[서울/강동] 테스트'};
function run(list,detail,options={}){
 const paths=[],context={location:{origin:'https://www.dodosi.co.kr'},AbortSignal,Date,fetch:async path=>{paths.push(path);return{ok:true,redirected:!!options.redirect,text:async()=>path==='/deliveries'?html({deliveries:list,initialFilter:options.filter||'전체',initialPage:1}):path==='/order'?html({shops:[{id:'origin',label:entry.dropShop},{id:'target',label:entry.pickShop}],accountDiscountBp:5000}):html({delivery:detail})};}};
 vm.createContext(context);vm.runInContext(source,context);return{promise:context.creoDodosiReceipts(),paths};
}
test('empty complete listing is accepted; filtered/login/unknown pages are not empty success',async()=>{
 const f=run([]);assert.equal((await f.promise).records.length,0);assert.deepEqual(f.paths,['/deliveries']);
 await assert.rejects(run([],{},{filter:'픽업 대기'}).promise,/전체 예약/);
 await assert.rejects(run([],{},{redirect:true}).promise,/로그인/);
});
test('six animals remain one receipt and paid state must come from matching detail',async()=>{
 const d={...entry,receiverName:'가상',receiverTel:'010-0000-0001'};
 const r=await run([entry],d).promise;assert.equal(r.records[0].quantity,6);assert.equal(r.records[0].status,'pickup_pending');assert.equal(r.records[0].destinationId,'target');
 await assert.rejects(run([entry],{...d,status:'pending_payment'}).promise,/변경/);
 await assert.rejects(run([entry],{...d,receiverTel:null}).promise,/연락처/);
 await assert.rejects(run([entry],{...d,recipientName:'다른 사람'}).promise,/수령인/);
});
test('all list rows are read despite client-side pagination; unknown status fails closed',async()=>{
 const entries=Array.from({length:11},(_,i)=>({...entry,id:id.slice(0,-2)+String(i).padStart(2,'0')}));
 const f=run(entries,null);await assert.rejects(f.promise,/상세 정보/);assert.ok(f.paths.includes('/deliveries/'+entries[0].id));
 await assert.rejects(run([{...entry,status:'new_unknown'}],entry).promise,/형식/);
});
