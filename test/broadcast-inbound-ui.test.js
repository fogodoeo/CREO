'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const Core=require('../public/broadcast-inbound-core'),Origin=require('../public/broadcast-origin-core'),data=require('../public/broadcast-inbound-data.json');
const source=fs.readFileSync(require.resolve('../public/broadcast-inbound.js'),'utf8');
function fixture({region='서울·인천',address='',origins={},failed=false}={}){
 const nodes=new Map(),listeners={},writes=[],state={now:'2026-10-06T00:00:00Z',vendor:{id:'test',name:'가상 업체',region,locality:Origin.locality(data,address,region),inboundOrigins:origins},dates:[{date:'2026-10-14',regionName:region},{date:'2026-11-02',regionName:region}]};
 function node(){return {html:'',dataset:{},attrs:{},disabled:true,classList:{add(){}},insertAdjacentHTML(_where,html){this.html+=html;},getAttribute(k){return this.attrs[k]||'';},setAttribute(k,v){this.attrs[k]=v;},addEventListener(){},remove(){},showModal(){this.open=true;},close(){this.open=false;}};}
 let days,calendar,key;
 const document={activeElement:null,querySelector:s=>nodes.get(s)||null,addEventListener:(type,fn)=>listeners[type]=fn,createElement:node,body:{append:n=>nodes.set('#'+n.id,n)}};
 const window={CreoInboundCore:Core,CreoOriginCore:Origin};
 vm.runInNewContext(source,{window,document,AbortController,setTimeout,clearTimeout,fetch:async()=>({ok:!failed,json:async()=>data})});
 function render(month='2026-10'){
  calendar=node();key=node();days=Array.from({length:31},(_,i)=>{const n=node();n.querySelector=()=>({textContent:String(i+1)});n.attrs['aria-label']=String(i+1)+'일';return n;});
  calendar.querySelector=s=>s==='.calendar-head'?calendar:s==='.calendar-key'||s==='.calendar-key>span:last-child'?key:null;
  calendar.querySelectorAll=()=>days;nodes.set('.broadcast-calendar',calendar);
  window.CreoInbound.render({state,month,redraw:()=>render(month),openDate(){},save:async(...args)=>writes.push(args)});
 }
 return {state,writes,ready:()=>window.CreoInbound.ready(),render,day:n=>days[n-1],html:()=>calendar.html,key:()=>key.html,
  click(n){const target={closest:s=>s==='[data-inbound-date]'?days[n-1]:null};listeners.click({target,stopImmediatePropagation(){}});return nodes.get('#inbound-dialog');},retry(){failed=false;}};
}
test('real calendar renderer shows both carriers before a Seoul vendor chooses a shop',async()=>{
 const f=fixture();await f.ready();f.render();
 assert.equal(f.day(11).disabled,false);assert.equal(f.day(11).dataset.inboundDate,'2026-10-11');
 assert.match(f.day(11).html,/파르게/);assert.match(f.day(11).html,/도도시/);assert.match(f.day(11).attrs['aria-label'],/도도시 예상 배송 마감/);
 assert.match(f.key(),/예상 포함/);assert.match(f.html(),/서울·인천 기준/);assert.match(f.html(),/대구 크레오/);assert.match(f.html(),/대구 크레용/);
 assert.equal(f.writes.length,0);assert.deepEqual(f.state.vendor.inboundOrigins,{});
 assert.match(f.html(),/href="tel:01050029163"/);assert.match(f.html(),/href="tel:01025088240"/);
 const dialog=f.click(11);assert.equal(dialog.open,true);assert.match(dialog.innerHTML,/당일 도착편/);assert.match(dialog.innerHTML,/예상/);assert.match(dialog.innerHTML,/https:\/\/www.dodosi.co.kr\/113/);
 assert.doesNotMatch(dialog.innerHTML,/반드시 방송일 전에/);
 assert.match(dialog.innerHTML,/대구 크레오에 전화 010-5002-9163/);assert.match(dialog.innerHTML,/대구 크레용에 전화 010-2508-8240/);
});
test('calendar estimates use the registered locality and replace them with the chosen shop on redraw',async()=>{
 const f=fixture({address:'서울특별시 송파구 거마로 1'});await f.ready();f.render();assert.match(f.html(),/서울 송파구 인근 · 다이노마켓 · 서울 송파구 기준/);
 const selected=data.dodosi.origins.find(o=>o.shop==='드래곤길들이기');f.state.vendor.inboundOrigins.dodosi=selected.id;f.render();
 assert.doesNotMatch(f.day(11).html,/도도시/);assert.match(f.day(12).html,/도도시/);assert.doesNotMatch(f.day(12).attrs['aria-label'],/예상/);
 const dialog=f.click(12);assert.match(dialog.innerHTML,/당일 도착편/);assert.doesNotMatch(dialog.innerHTML,/inbound-estimate/);assert.equal(f.writes.length,0);
});
test('following-month broadcasts retain their shipping markers in the earlier month and rerenders do not save estimates',async()=>{
 const f=fixture();await f.ready();f.render();assert.match(f.day(25).html,/파르게/);assert.match(f.day(30).html,/도도시/);
 const first=f.day(11).html;f.render();assert.equal(f.day(11).html,first);assert.equal(f.writes.length,0);
 f.state.vendor.inboundOrigins.dodosi='retired-shop';f.render();assert.doesNotMatch(f.day(11).html,/도도시/);assert.match(f.html(),/도도시 마감일 확인/);
});
test('a failed timetable request shows a recoverable error and retry restores calendar estimates',async()=>{
 const f=fixture({failed:true});await f.ready();f.render();assert.match(f.html(),/다시 불러오기/);assert.equal(f.day(11).dataset.inboundDate,undefined);
 f.retry();await f.ready();f.render();assert.match(f.day(11).html,/도도시/);assert.equal(f.writes.length,0);
});
test('submitted-entry delivery details show the same destination contacts and preserve pickup state',()=>{
 const code=fs.readFileSync(require.resolve('../public/vendor-broadcast.js'),'utf8'),start=code.indexOf(' function pickupBlock('),end=code.indexOf('\n function editable(',start);
 const context=vm.createContext({state:{inboundDestinations:data.destinations,inboundDestinationPhones:data.destinationPhones},esc:String,CreoVendorTasks:require('../public/vendor-task-state')});
 vm.runInContext(code.slice(start,end),context);
 assert.equal(context.pickupBlock({completed:3}),'');
 for(const completed of [4,5])for(const pickup of [false,true]){const html=context.pickupBlock({completed,pickup});assert.match(html,/href="tel:01050029163"/);assert.match(html,/href="tel:01025088240"/);assert.ok(html.includes('<span>'+(pickup?'수거 완료':'수거 전')+'</span>'));}
});
