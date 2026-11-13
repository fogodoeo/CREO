'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),{parseHTML}=require('linkedom'),Core=require('../public/parge-dispatch-core');
async function screen(search='?channel=national-cre'){
 const {document,window}=parseHTML(fs.readFileSync(require.resolve('../public/parge-dispatch.html'),'utf8'));for(const el of document.querySelectorAll('select'))Object.defineProperty(el,'value',{value:'',writable:true});
 const items=['a1','a2','cart','booked'].map(id=>({id,name:id,vendorId:'v1',winnerName:id.startsWith('a')?'가상 A':id,winnerPhone:id.startsWith('a')?'01000000001':'01000000002',soldPrice:100000,status:'sold',attributes:{broadcastDate:'2026-10-21'}}));
 const shipments=items.map(i=>({id:'s-'+i.id,itemId:i.id,recipientName:i.winnerName,recipientPhone:i.winnerPhone,destinationType:'parge',pargeShop:'가상 매장',pargeRegion:'경기',paymentStatus:'paid'}));
 const record=(id,status)=>({id,status,plan:{date:'2026-10-23',groups:[{name:id,phone:'01000000002',shop:'가상 매장',region:'경기',quantity:1,items:[{id,lot:id}]}]}});
 const calls=[];let broken=false,sender={name:'크레오 대구본점',phone:'01050029163',revision:0};
 const api=async (path,options)=>{calls.push(path);if(path.startsWith('shipping-rates'))return{payload:{data:{경기:[{shop:'가상 매장',cost:19000}]}}};if(broken)throw Error('테스트 연결 오류');if(path.endsWith('workspace?scope=round'))return{items,shipments};if(path.endsWith('parge-dispatch')&&options?.method==='POST'){const body=JSON.parse(options.body);sender={name:body.name,phone:Core.senderPhone(body.phone),revision:sender.revision+1};return{record:sender};}if(path.endsWith('parge-dispatch'))return{sender,records:[record('cart','cart'),record('booked','booked')]};throw Error('Unexpected route '+path);};
 vm.runInNewContext(fs.readFileSync(require.resolve('../public/parge-dispatch.js'),'utf8'),{document,window,location:{search,origin:'https://test'},URLSearchParams,CustomEvent:window.CustomEvent,CreoPlatform:{verifyAdmin:async()=>true,api},CreoPargeDispatch:Core});await new Promise(setImmediate);
 return{document,window,calls,fail:()=>{broken=true}};
}
test('selection total adds pending cart once, excludes booked rows and uses only current-round workspace',async()=>{
 const {document,calls}=await screen();assert(calls.includes('channels/national-cre/workspace?scope=round'));
 assert.equal(document.getElementById('broadcast-date').closest('label').hidden,true);
 assert.deepEqual([...document.querySelectorAll('#partner-totals strong')].map(e=>e.textContent),['16,500원','9,500원','26,000원']);
 const selected=document.querySelector('[data-select]');selected.checked=false;selected.onchange();assert.deepEqual([...document.querySelectorAll('#partner-totals strong')].map(e=>e.textContent),['0원','9,500원','9,500원']);
 assert.match(document.getElementById('rows').textContent,/기본 19,000원 × 50% \+ 추가 1마리 × 7,000원/);
});
test('failed reload clears stale cart estimate and archive query cannot silently use the current round',async()=>{
 const ui=await screen();ui.fail();await ui.document.getElementById('refresh').onclick();assert.match(ui.document.getElementById('partner-totals').textContent,/다시 불러온/);assert.equal(ui.document.getElementById('history').textContent,'');
 const archived=await screen('?channel=national-cre&archive=old');assert.equal(archived.calls.length,0);assert.match(archived.document.getElementById('error').textContent,/보관 회차/);
});
test('phone-only edits block export until saved and survive reload',async()=>{
 const {document}=await screen(),phone=document.getElementById('sender-phone');phone.value='010-1234-5678';phone.oninput();
 await document.getElementById('export').onclick();assert.match(document.getElementById('error').textContent,/먼저 저장/);
 await document.getElementById('sender-form').onsubmit({preventDefault(){}});assert.match(document.getElementById('sender-status').textContent,/저장됨.*01012345678/);
 await document.getElementById('refresh').onclick();assert.equal(phone.value,'01012345678');assert.equal(document.getElementById('sender-name').value,'크레오 대구본점');
});
