'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const source=fs.readFileSync(require.resolve('../public/vendor-broadcast.js'),'utf8');
const fn=source.slice(source.indexOf(' function startRegistration('),source.indexOf(' function openDate('));
function setup(){
 const calls=[],context={busy:false,photoBusy:false,state:{dates:[{date:'2026-10-26',maxQuantityAvailable:4}]},reservation:()=>context.state.reserved,openDate:date=>calls.push('open:'+date),renderCalendar:()=>calls.push('calendar'),sheet:{querySelector:()=>({focus:()=>calls.push('focus')})},request:async body=>{calls.push(body);return {...context.state,reserved:{id:'r'}}},run:async work=>{context.busy=true;try{return await work()}finally{context.busy=false}}};
 vm.runInNewContext(fn,context);return {context,calls};
}
test('registration start opens four slots directly, suppresses duplicate clicks and reuses the existing reservation',async()=>{
 const f=setup(),first=f.context.startRegistration('2026-10-26');await f.context.startRegistration('2026-10-26');await first;
 assert.equal(f.calls.filter(c=>c.type==='reserve').length,1);assert.equal(f.calls.find(c=>c.type==='reserve').quantity,4);assert.deepEqual(f.calls.slice(-2),['calendar','focus']);
 await f.context.startRegistration('2026-10-26');assert.equal(f.calls.filter(c=>c.type==='reserve').length,1);
});
test('closed dates remain information-only; failed registration keeps the retry screen without inventing a reservation',async()=>{
 const f=setup();f.context.state.dates[0].maxQuantityAvailable=0;await f.context.startRegistration('2026-10-26');assert.deepEqual(f.calls,['open:2026-10-26']);
 f.context.state.dates[0].maxQuantityAvailable=4;f.context.request=async()=>{throw Error('연결 실패')};await assert.rejects(f.context.startRegistration('2026-10-26'),/연결 실패/);assert.equal(f.context.state.reserved,undefined);assert.equal(f.context.busy,false);
});
