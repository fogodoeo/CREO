'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const D=require('../public/dodosi-labels');
const source=fs.readFileSync(require.resolve('../public/print.html'),'utf8');
function fixture(selection=['departure','arrival'],version=3){
 const nodes=Object.fromEntries(['dodosi-side-departure','dodosi-side-arrival','dodosi-label-name','dodosi-label-phone','print-action-btn'].map(id=>[id,{checked:selection.includes(id.replace('dodosi-side-','')),disabled:false,value:id==='dodosi-label-name'?'발송인':'01000000001'}]));
 const items=[1,2].map(n=>({name:'A0'+n,_platformItemId:'i'+n,shipping_type:'배송',shipping_company:'도도시'}));
 const state={fresh:true,originName:'가상 출발점',broadcastDate:'2026-11-23',groups:[{name:'가상 수령인',phone:'01000000002',shop:'가상 도착점',quantity:2,items:items.map(i=>({id:i._platformItemId,lot:i.name})),schedule:{status:'estimated',dropoffDate:'2026-11-24',arrivalDate:'2026-11-28'}}]};
 const posts=[],alerts=[];
 const scope=vm.createContext({window:{_dodosiLabelState:state},document:{getElementById:id=>nodes[id]},CreoDodosiLabels:D,PRINT_CHANNEL_ID:'fixture',selectedShippingLabelItems:()=>items,alert:m=>alerts.push(m),setD10PrinterStatus(){},renderShippingLabelPreview(){},loadDodosiLabelState:async()=>{},refreshD10PrinterStatus:async()=>{scope.window._dodosiTicketSupported=version>=2;scope.window._dodosiSidesSupported=version>=3;scope.window._dodosiUndatedSupported=version>=4;return true;},fetchD10Bridge:async(path,opts)=>{posts.push(JSON.parse(opts.body));return{ok:true,json:async()=>({ok:true,accepted:posts.at(-1).labels.reduce((n,l)=>n+l.sides.length,0)})};}});
 for(const name of ['dodosiLabelSides','dodosiLabelSender','d10ShippingLabelPayload','printSelectedShippingLabels']){
  const start=source.search(new RegExp('        (?:async )?function '+name+'\\('));
  const after=source.slice(start+1).search(/\n        (?:async )?function /);vm.runInContext(source.slice(start,start+1+after),scope);
 }
 return{scope,nodes,items,posts,alerts};
}
test('Print batch sends only the selected side for every item and paired remains the default',async()=>{
 for(const sides of [['departure'],['arrival'],['departure','arrival']]){
  const f=fixture(sides);await f.scope.printSelectedShippingLabels();
  assert.equal(f.posts.length,1);assert.equal(f.posts[0].labels.length,2);
  assert.deepEqual(f.posts[0].labels.map(l=>l.sides),[sides,sides]);
  assert.deepEqual(f.posts[0].labels.map(l=>l.lot_number),['A01','A02']);
  assert.equal(f.nodes['dodosi-side-departure'].disabled,false);assert.equal(f.scope.window._shippingPrintBusy,false);
 }
});
test('Empty side selection and older app cannot accidentally print both sides',async()=>{
 for(const [sides,version,message] of [[[],3,'하나 이상'],[['arrival'],2,'한쪽만']]){
  const f=fixture(sides,version);await f.scope.printSelectedShippingLabels();assert.equal(f.posts.length,0);assert.match(f.alerts[0],new RegExp(message));assert.equal(f.nodes['dodosi-side-arrival'].disabled,false);
 }
 const both=fixture(['departure','arrival'],2);await both.scope.printSelectedShippingLabels();assert.equal(both.posts.length,1);
});
test('A duplicate click or changing toggles during refresh cannot change the captured batch',async()=>{
 const f=fixture(['departure']);let resume;f.scope.loadDodosiLabelState=()=>new Promise(r=>{resume=r;});
 const first=f.scope.printSelectedShippingLabels();await Promise.resolve();await Promise.resolve();
 assert.equal(f.nodes['dodosi-side-arrival'].disabled,true);
 f.nodes['dodosi-side-departure'].checked=false;f.nodes['dodosi-side-arrival'].checked=true;
 await f.scope.printSelectedShippingLabels();resume();await first;
 assert.equal(f.posts.length,1);assert.deepEqual(f.posts[0].labels.map(l=>l.sides),[['departure'],['departure']]);
});
test('An uncertain bridge failure unlocks controls without retrying the physical batch',async()=>{
 const f=fixture(['arrival']);let attempts=0;f.scope.fetchD10Bridge=async()=>{attempts++;throw Error('connection lost');};
 await f.scope.printSelectedShippingLabels();assert.equal(attempts,1);assert.equal(f.scope.window._shippingPrintBusy,false);assert.equal(f.nodes['dodosi-side-arrival'].disabled,false);assert.match(f.alerts[0],/connection lost/);
});
test('Undated tickets require the matching app and preserve selected sides',async()=>{
 for(const version of [3,4]){
  const f=fixture(['arrival'],version);f.scope.window._dodosiLabelState.fresh=false;
  await f.scope.printSelectedShippingLabels();
  assert.equal(f.posts.length,version===4?1:0);
  if(version===3)assert.match(f.alerts[0],/날짜 없이 출력/);
  else assert.ok(f.posts[0].labels.every(l=>l.dropoff_date===''&&l.arrival_date===''&&l.sides.join()==='arrival'));
 }
});
