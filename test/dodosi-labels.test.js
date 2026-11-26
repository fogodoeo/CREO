const {test}=require('node:test');
const assert=require('node:assert/strict');
const D=require('../public/dodosi-labels');
const item={name:'A01',shipping_type:'배송',shipping_company:'도도시',_platformItemId:'i1',shipping_region:'old',_checkoutShipment:{recipientName:'old'}};
const state={fresh:true,broadcastDate:'2026-11-23',originName:'크레용(대구)',sender:{name:'발송인',phone:'010-0000-0001'},groups:[{quantity:3,name:'수령인',phone:'01000000002',shop:'[서울/강동] 정거샵',items:[{id:'i1',lot:'B02'},{id:'i3',lot:'C03'},{id:'i2',lot:'A01'}],schedule:{status:'estimated',dropoffDate:'2026-11-24',arrivalDate:'2026-11-28'}}]};
test('Dodosi uses fresh recipient and lot, two physical pages, and never auction date as shipping date',()=>{
 const {payload,errors}=D.ticket({...item,attributes:{broadcastDate:'2026-11-23'}},state);
 assert.deepEqual(errors,[]);assert.equal(payload.lot_number,'B02');assert.equal(payload.winner_name,'수령인');assert.equal(payload.dropoff_date,'2026-11-24');assert.equal(payload.arrival_date,'2026-11-28');
 assert.equal(D.physicalCount([item,{...item,shipping_company:'파르게'},{...item,shipping_type:'직접수령'}]),4);
 assert.equal(D.shortDate('2026-11-28'),'11/28(토)');assert.equal(D.shortDate('2026-02-30'),'일정 확인');
});
test('Missing, expired, duplicate, other-channel and incomplete source data fail closed',()=>{
 for(const s of [null,{...state,fresh:false},{...state,sender:{}},{...state,groups:[]},{...state,groups:[...state.groups,...state.groups]}])assert.ok(D.ticket(item,s).errors.length);
 assert.ok(D.ticket({...item,_platformItemId:'other-channel'},state).errors.length);
 const invalid=structuredClone(state);invalid.groups[0].schedule.arrivalDate='2026-11-22';assert.ok(D.ticket(item,invalid).errors.length);
});
test('Ticket preview escapes untrusted names; only known carrier yields two pages',()=>{
 const s=structuredClone(state);s.groups[0].shop='<img onerror=evil()>';
 const html=D.preview(D.ticket(item,s));assert.ok(html.includes('&lt;img'));assert.ok(!html.includes('<img'));assert.equal((html.match(/class="dodosi-label-paper(?: |")/g)||[]).length,2);
 assert.equal(D.physicalCount([{shipping_company:'unknown'}]),1);
});
test('Arrival sticker prints recipient before phone and date, with bundled lots above the destination',()=>{
 const result=D.ticket(item,state,{name:'전크자',phone:'01049287600'});
 assert.deepEqual(result.errors,[]);assert.equal(result.payload.sender_name,'전크자');
 assert.equal(result.payload.broadcast_date,'2026-11-23');assert.deepEqual(result.payload.bundle_lots,['A01','B02','C03']);assert.equal(result.payload.bundle_index,1);
 const html=D.preview(result);
 assert.equal((html.match(/dt-lot is-current/g)||[]).length,1);
 assert.equal((html.match(/class="dt-lot(?: |")/g)||[]).length,3);
 assert.equal((html.match(/class="dt-broadcast"/g)||[]).length,1);
 assert.ok(html.includes('11/28'));assert.ok(!html.includes('11/28(토)'));
 assert.doesNotMatch(html,/보내는 분|받는 분|도도시 · 출발|출발지|합배송 3마리/);
 assert.equal(D.ticket(item,state).payload.sender_name,'발송인');
 const {parseHTML}=require('linkedom');const {document}=parseHTML(html);
 const departure=document.querySelector('.dodosi-label-paper');
 assert.equal(departure.querySelector('.dt-main').textContent,'크레용(대구)');
 assert.equal(departure.querySelector('.dt-recipient').textContent,'전크자');
 assert.equal(departure.querySelector('.dt-phone').textContent,'01049287600');
 assert.equal(departure.querySelector('.dt-date').textContent,'11/24(화)');
 const arrival=document.querySelector('.is-arrival');
 assert.deepEqual([...arrival.children].map(n=>n.className),['dt-lots','dt-main','dt-recipient','dt-phone','dt-date','dt-broadcast']);
 assert.equal(arrival.querySelector('.dt-recipient').textContent,'수령인');
 assert.equal(arrival.querySelector('.dt-phone').textContent,'01000000002');
 assert.equal(arrival.querySelector('.dt-date').textContent,'11/28');
 assert.equal(arrival.querySelector('.dt-lots').textContent,'A01 · B02 · C03');
 assert.equal(arrival.querySelector('.is-current').textContent,'B02');
});
test('Left, right and paired selection produce matching previews and mixed-carrier sheet counts',()=>{
 for(const [selection,caption] of [[['departure'],'① 왼쪽 · 출발'],[['arrival'],'② 오른쪽 · 도착'],[['departure','arrival'],null]]){
  const result=D.ticket(item,state,undefined,selection),html=D.preview(result);
  assert.deepEqual(result.errors,[]);assert.deepEqual(result.payload.sides,selection);
  assert.equal((html.match(/class="dodosi-label-paper(?: |")/g)||[]).length,selection.length);
  if(caption)assert.ok(html.includes(caption));
  assert.equal(D.physicalCount([item,item,{...item,shipping_company:'파르게'}],selection),selection.length*2+1);
 }
 assert.equal(D.physicalCount([item]),2);
 const empty=D.ticket(item,state,undefined,[]);assert.match(empty.errors.join(' '),/출력할 쪽/);
 assert.equal(D.physicalCount([item],[]),0);assert.doesNotMatch(D.preview(empty),/class="dodosi-label-paper/);
});
