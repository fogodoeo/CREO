'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs');
const source=fs.readFileSync(require.resolve('../tools/dodosi-helper/background.js'),'utf8');
const id=n=>'00000000-0000-0000-0000-'+String(n).padStart(12,'0');
const plan=(n,date='2026-11-24')=>({schema:'creo.dodosi.dispatch.v1',channelId:'fixture',groupId:'group'+n,originId:id(0),originName:'가상 출발점',destinationId:id(n),quantity:2,name:'가상'+n,phone:'01000000001',sender:{name:'테스트',phone:'01000000002'},schedule:{dropoffDate:date,dispatchDate:'2026-11-25',arrivalDate:'2026-11-28'}});
function fixture(options={}){
 const tabs=[{id:1,url:'https://www.dodosi.co.kr/order',active:false},{id:2,url:'https://www.dodosi.co.kr/order',active:true}],created=[],fills=[];let listener;
 const context={URL,URLSearchParams,TextEncoder,crypto:require('node:crypto').webcrypto,setTimeout,clearTimeout,importScripts(){},creoDodosiRead(){},creoDodosiReceipts(){},creoDodosiFill(){},chrome:{runtime:{onMessage:{addListener(fn){listener=fn;}}},tabs:{async query(){return tabs;},async create(value){const t={...value,id:10+created.length,status:'complete'};created.push(t);tabs.push(t);return t;},async get(id){return tabs.find(t=>t.id===id);},async update(){},async sendMessage(){},onUpdated:{addListener(){},removeListener(){}}},scripting:{async executeScript({func,args}){if(func.name==='creoDodosiReceipts')return[{result:{complete:true,records:options.receipts||[]}}];if(func.name==='creoDodosiRead')return[{result:{available:true,slots:options.badDate?[]:[{dropoff:'2026-11-24',pickup:'2026-11-25',arrival:'2026-11-28'},{dropoff:'2026-11-26',pickup:'2026-11-25',arrival:'2026-11-28'}],quote:{total:30000},discountBp:5000}}];fills.push(args[1]);return[{result:options.fail?{filled:false,error:'화면 변경'}:{filled:true,count:args[1].length}}];}}}};
 vm.createContext(context);vm.runInContext(source,context);return{context,created,fills,tabs,get listener(){return listener;}};
}
test('two logged-in base tabs work; grouped recipients use one form per date and repeated run creates no duplicate',async()=>{
 const f=fixture();assert.equal(f.context.readTab(f.tabs).id,2);
 const plans=[plan(1),plan(2),plan(3,'2026-11-26')],r=await f.context.run('fill-many',{plans});assert.equal(r.count,3);assert.equal(f.created.length,2);assert.equal(f.fills[0].length,2);assert.equal(f.fills[1].length,1);
 await assert.rejects(f.context.run('fill-many',{plans}),/이미 열려/);assert.equal(f.created.length,2);
 const resumed=await f.context.run('fill-many',{plans,resume:true});assert.equal(resumed.count,3);assert.equal(f.created.length,2);
});
test('date drift, malformed input and mixed rounds fail before opening a form',async()=>{
 const f=fixture({badDate:true});await assert.rejects(f.context.run('fill-many',{plans:[plan(1)]}),/일정이 변경/);assert.equal(f.created.length,0);
 const g=fixture();await assert.rejects(g.context.run('fill-many',{plans:[plan(1),{...plan(2),channelId:'other'}]}),/같은 회차/);await assert.rejects(g.context.run('fill-many',{plans:[plan(1),plan(1)]}),/다시 불러/);assert.equal(g.created.length,0);
});
test('21 recipients split into 10, 10, 1 forms without splitting combined animals',async()=>{
 const f=fixture(),plans=Array.from({length:21},(_,i)=>({...plan(i+1),quantity:i===0?6:1}));
 const r=await f.context.run('fill-many',{plans});assert.equal(r.count,21);assert.deepEqual(f.fills.map(x=>x.length),[10,10,1]);assert.equal(f.fills[0][0].quantity,6);
});
test('partial failure stops before the next date and preserves the incomplete review tab',async()=>{
 const f=fixture({fail:true});await assert.rejects(f.context.run('fill-many',{plans:[plan(1),plan(2,'2026-11-26')]}),/화면 변경/);assert.equal(f.created.length,1);assert.equal(f.fills.length,1);
});
test('a booked or pending receipt blocks form creation even when the CREO check was earlier',async()=>{
 const p=plan(1),f=fixture({receipts:[{originId:p.originId,phone:p.phone,dropoffDate:p.schedule.dropoffDate,status:'pending_payment'}]});
 await assert.rejects(f.context.run('fill-many',{plans:[p]}),/이미 접수/);assert.equal(f.created.length,0);
});
test('helper accepts only its exact CREO page and never includes order submit actions',()=>{
 const f=fixture();assert.equal(f.listener({action:'ping'},{tab:{url:'https://creok.onrender.com.evil/dodosi-dispatch.html'}},()=>assert.fail()),undefined);
 assert.equal(f.listener({action:'ping'},{tab:{url:'https://creok.onrender.com/dodosi-dispatch.html.evil'}},()=>assert.fail()),undefined);
 const form=fs.readFileSync(require.resolve('../tools/dodosi-helper/form.js'),'utf8');assert.doesNotMatch(form,/\.submit\(|requestSubmit|button\(['"]결제|fetch\(/);
});
