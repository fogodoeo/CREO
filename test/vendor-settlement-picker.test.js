'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
function fixture(){
 const element=()=>({children:[],append(...rows){this.children.push(...rows)},prepend(row){this.children.unshift(row)},replaceChildren(){this.children=[]},setAttribute(k,v){this[k]=v},focus(){this.focused=true}}),container=element();
 const current={channelId:'national-cre',key:'date:2026-10-19',name:'10/19 경기'},old={channelId:'national-cre',key:'archive:old',name:'10/14 서울·인천',openCount:2,settlementRemaining:20000},child={channelId:'national-cre-20261021',key:'date:2026-10-21',name:'10/21 전라·충청'};
 let allowed=true,handler=async()=>true,request=async()=>({rounds:[child,current,old]}),key='',calls=[];
 const location={href:'http://localhost/vendor-checkout.html?code=synthetic'};
 const context={window:{},document:{createElement:element},URL,location,history:{replaceState:(_a,_b,url)=>location.href=String(url)}};
 vm.runInNewContext(fs.readFileSync(require.resolve('../public/vendor-settlement-picker.js'),'utf8'),context);
 const picker=context.window.CreoVendorSettlementPicker.create({container,client:{setRound:value=>key=value,request:path=>request(path)},change:async target=>{calls.push([target.channelId,target.key]);return handler(target)},canChange:()=>allowed});
 const data={channel:{id:'national-cre',name:'전국크레자랑'},round:current,rounds:[current,old]};
 return {picker,data,current,old,child,location,panel:container.children[0],get select(){return this.panel.children[1]},calls,get key(){return key},set allowed(v){allowed=v},set handler(v){handler=v},set request(v){request=v}};
}
test('one selector combines archived and dated channels, preserves exact URL and hides for a sole round',async()=>{
 const f=fixture();f.picker.update(f.data);await f.picker.refresh();assert.equal(f.select.children.length,3);assert.ok(f.select.children.some(o=>o.textContent.includes('결제 미완료 2개체 · 정산 남음')));
 f.handler=async target=>{f.picker.update({...f.data,channel:{id:target.channelId},round:target,rounds:[target]});return true};f.select.value=JSON.stringify([f.child.channelId,f.child.key]);await f.select.onchange();
 assert.deepEqual(f.calls,[[f.child.channelId,f.child.key]]);assert.equal(f.key,f.child.key);assert.equal(new URL(f.location.href).searchParams.get('event'),f.child.channelId);assert.equal(f.select.focused,true);
 f.request=async()=>({rounds:[f.child]});await f.picker.refresh();assert.equal(f.select.hidden,true);assert.equal(f.panel.children[2].textContent,f.child.name);
});
test('cancelled edits and duplicate selections do not change scope; failed switch keeps the original financial context',async()=>{
 const f=fixture();f.picker.update(f.data);await f.picker.refresh();f.allowed=false;f.select.value=JSON.stringify([f.old.channelId,f.old.key]);await f.select.onchange();assert.equal(f.calls.length,0);
 f.allowed=true;let resolve;f.handler=()=>new Promise(done=>resolve=done);f.select.value=JSON.stringify([f.old.channelId,f.old.key]);const first=f.select.onchange();await f.select.onchange();assert.equal(f.calls.length,1);resolve(false);await first;
 assert.equal(f.key,f.current.key);assert.equal(f.select.value,JSON.stringify([f.current.channelId,f.current.key]));assert.match(f.panel.children[3].textContent,/열지 못했어요/);assert.equal(f.select.disabled,false);
});
test('failed catalogue keeps an explicit retry instead of hiding unpaid history and retry recovers',async()=>{
 const f=fixture();f.request=async()=>{throw Error('offline')};f.picker.update(f.data);await f.picker.refresh();assert.equal(f.panel.children[4].hidden,false);assert.match(f.panel.children[3].textContent,/다른 회차/);assert.equal(f.key,f.current.key);
 f.request=async()=>({rounds:[f.current,f.old]});await f.panel.children[4].onclick();assert.equal(f.select.children.length,2);assert.equal(f.panel.children[4].hidden,true);
});
