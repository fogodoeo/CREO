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
test('unselected vendors see dated route choices, not a borrowed calendar deadline',async()=>{
 const f=fixture();await f.ready();f.render();
 assert.equal(f.day(11).dataset.inboundDate,undefined);assert.doesNotMatch(f.day(11).html,/inbound-span/);
 assert.match(f.html(),/출발지 선택 후 안내/);assert.match(f.html(),/늦게 맡길 수 있는 순/);assert.match(f.html(),/대구 크레오/);assert.match(f.html(),/대구 크레용/);
 assert.equal(f.writes.length,0);assert.deepEqual(f.state.vendor.inboundOrigins,{});
 assert.match(f.html(),/href="tel:01050029163"/);assert.match(f.html(),/href="tel:01025088240"/);
});
test('calendar estimates use the registered locality and replace them with the chosen shop on redraw',async()=>{
 const f=fixture({address:'서울특별시 송파구 거마로 1'});await f.ready();f.render();assert.match(f.html(),/서울 송파구 인근/);assert.match(f.html(),/다이노마켓/);assert.equal(f.day(11).dataset.inboundDate,undefined);
 const selected=data.dodosi.origins.find(o=>o.shop==='드래곤길들이기');f.state.vendor.inboundOrigins.dodosi=selected.id;f.render();
 assert.doesNotMatch(f.day(11).html,/도도시/);assert.match(f.day(12).html,/도도시/);assert.doesNotMatch(f.day(12).attrs['aria-label'],/도도시 예상/);
 const dialog=f.click(12);assert.match(dialog.innerHTML,/당일 도착편/);assert.match(dialog.innerHTML,/<h3>도도시<\/h3>/);assert.equal(f.writes.length,0);
});
test('Monday broadcasts show Friday hand-in, Saturday departure and Sunday Daegu arrival even for another broadcast region',async()=>{
 const origin=data.dodosi.origins.find(o=>o.shop==='드래곤길들이기');
 const f=fixture({region:'대구·경북',origins:{dodosi:origin.id}});await f.ready();
 f.state.dates=[{date:'2026-10-26',regionName:'대구·경북'}];f.render();
 assert.doesNotMatch(f.html(),/class="inbound-route"/);
 for(const day of [23,24,25,26]){
  assert.equal(f.day(day).disabled,false);assert.match(f.day(day).html,/inbound-span dodosi/);
  for(const pattern of [/맡기기<\/span><strong>10\/23\(금\)/,/출발<\/span><strong>10\/24\(토\)/,/대구 도착<\/span><strong>10\/25\(일\)/])assert.match(f.click(day).innerHTML,pattern);
 }
 assert.match(f.day(23).html,/dodosi route-start/);assert.match(f.day(24).html,/dodosi\s+route-end/);assert.match(f.day(25).html,/dodosi route-start/);
 assert.match(f.day(23).html,/route-origin/);assert.doesNotMatch(f.day(23).html,/route-destination/);
 assert.doesNotMatch(f.day(24).html,/route-origin|route-destination/);
 assert.doesNotMatch(f.day(25).html,/route-destination|route-origin/);assert.match(f.day(26).html,/route-destination/);
 assert.match(f.day(23).html,/<b>도도시<\/b>/);assert.doesNotMatch(f.day(25).html,/<b>도도시<\/b>/);
 assert.doesNotMatch(f.day(27).html,/inbound-span dodosi/);assert.match(f.click(26).innerHTML,/이날 방송 보기/);
 assert.equal(f.writes.length,0);
});

test('shipping strips continue into the next month and open the full route there',async()=>{
 const origin=data.dodosi.origins.find(o=>o.shop==='드래곤길들이기');
 const f=fixture({origins:{dodosi:origin.id}});await f.ready();f.render('2026-11');
 assert.match(f.day(1).html,/inbound-span dodosi route-start/);assert.equal(f.day(1).disabled,false);
 assert.doesNotMatch(f.day(1).html,/route-origin|route-destination/);assert.match(f.day(2).html,/route-destination/);
 assert.doesNotMatch(f.day(1).html,/<b>도도시<\/b>/);
 const dialog=f.click(1);assert.match(dialog.innerHTML,/맡기기<\/span><strong>10\/30\(금\)/);assert.match(dialog.innerHTML,/대구 도착<\/span><strong>11\/1\(일\)/);
 assert.equal(f.writes.length,0);
});

test('October 19 PARGE route labels October 11 once and continues unlabeled on October 18',async()=>{
 const f=fixture({region:'경기',origins:{parge:'parge-capital'}});await f.ready();
 f.state.dates=[{date:'2026-10-19',regionName:'경기'}];f.render();
 assert.match(f.day(11).html,/route-origin/);assert.match(f.day(11).html,/<b>파르게<\/b>/);
 for(let n=12;n<=19;n++){
  assert.match(f.day(n).html,/inbound-span parge/);assert.doesNotMatch(f.day(n).html,/<b>파르게<\/b>/);
 }
 assert.match(f.day(18).html,/route-start/);assert.doesNotMatch(f.day(18).html,/route-origin/);
 assert.match(f.day(19).html,/route-destination/);
 assert.match(f.click(18).innerHTML,/10\/19\(월\) 방송/);assert.equal(f.writes.length,0);
});

test('PARGE connects to the broadcast day even when it arrives the day before; actual arrival stays unchanged',async()=>{
 const f=fixture({origins:{parge:'parge-capital'}});await f.ready();f.render();
 for(const day of [11,12,13,14])assert.match(f.day(day).html,/inbound-span parge/);
 assert.match(f.day(11).html,/route-origin/);assert.doesNotMatch(f.day(13).html,/route-destination/);
 assert.match(f.day(14).html,/route-destination/);assert.doesNotMatch(f.day(15).html,/inbound-span parge/);
 assert.match(f.day(14).attrs['aria-label'],/10\/13\(화\) 대구 도착 → 10\/14\(수\) 방송/);
 const dialog=f.click(14);assert.match(dialog.innerHTML,/대구 도착<\/span><strong>10\/13\(화\)/);assert.match(dialog.innerHTML,/이날 방송 보기/);
 assert.equal(f.writes.length,0);
});
test('following-month broadcasts retain their shipping markers in the earlier month and rerenders do not save estimates',async()=>{
 const origin=data.dodosi.origins.find(o=>o.shop==='드래곤길들이기');
 const f=fixture({origins:{parge:'parge-capital',dodosi:origin.id}});await f.ready();f.render();assert.match(f.day(25).html,/파르게/);assert.match(f.day(30).html,/도도시/);
 const first=f.day(11).html;f.render();assert.equal(f.day(11).html,first);assert.equal(f.writes.length,0);
 f.state.vendor.inboundOrigins.dodosi='retired-shop';f.render();assert.doesNotMatch(f.day(11).html,/도도시/);assert.match(f.html(),/도도시 마감일 확인/);
});
test('a failed timetable request shows a recoverable error and retry restores calendar estimates',async()=>{
 const f=fixture({failed:true});await f.ready();f.render();assert.match(f.html(),/다시 불러오기/);assert.equal(f.day(11).dataset.inboundDate,undefined);
 f.retry();await f.ready();f.render();assert.match(f.html(),/출발지 선택 후 안내/);assert.equal(f.day(11).dataset.inboundDate,undefined);assert.equal(f.writes.length,0);
});
test('Daegu route selection replaces the missing timetable with the selected later service only',async()=>{
 const f=fixture({region:'대구·경북'});await f.ready();f.state.dates=[{date:'2026-10-26',regionName:'대구·경북'}];f.render();
 for(const n of [17,18,19,20,21,22,23,24,25])assert.equal(f.day(n).dataset.inboundDate,undefined);
 assert.match(f.html(),/10\/20\(화\) 맡기기 → 10\/25\(일\) 대구 도착/);
 const choice=Core.forSelection(data,'dodosi',f.state.vendor.region,Origin.options(data,'dodosi',f.state.vendor),'2026-10-26','2026-10-06').candidates[0];
 f.state.vendor.inboundOrigins.dodosi=choice.origin.id;f.render();
 assert.equal(f.day(17).dataset.inboundDate,undefined);assert.match(f.day(20).html,/inbound-span dodosi/);assert.match(f.click(20).innerHTML,/10\/20\(화\)/);
 f.state.vendor.inboundOrigins={};f.render();assert.equal(f.day(20).dataset.inboundDate,undefined);assert.equal(f.writes.length,0);
});
test('submitted-entry delivery details show the same destination contacts and preserve pickup state',()=>{
 const code=fs.readFileSync(require.resolve('../public/vendor-broadcast.js'),'utf8'),start=code.indexOf(' function pickupBlock('),end=code.indexOf('\n function editable(',start);
 const context=vm.createContext({state:{inboundDestinations:data.destinations,inboundDestinationPhones:data.destinationPhones},esc:String,CreoVendorTasks:require('../public/vendor-task-state')});
 vm.runInContext(code.slice(start,end),context);
 assert.equal(context.pickupBlock({completed:3}),'');
 for(const completed of [4])for(const pickup of [false,true]){const html=context.pickupBlock({completed,pickup});assert.match(html,/href="tel:01050029163"/);assert.match(html,/href="tel:01025088240"/);assert.ok(html.includes('<span>'+(pickup?'수거 완료':'수거 전')+'</span>'));}
});
