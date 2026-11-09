'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const html=fs.readFileSync(require.resolve('../public/auction-live.html'),'utf8');
function renderer(){
 const c=vm.createContext({esc:String,banner:()=>'',showBanner:()=>false,pageTicker:()=>''});
 for(const name of ['hostCaptionRole','pageOneProgress','pageOne']){const start=html.indexOf('function '+name+'('),end=html.indexOf('\nfunction ',start+1);vm.runInContext(html.slice(start,end),c);}return c;
}
test('P1 distinguishes the current ordinal from completed progress, including the final live lot',()=>{
 const c=renderer();
 const middle=c.pageOneProgress({current:18,total:34,completed:17},{mode:'live'});
 assert.match(middle,/18<small> \/ 34/);assert.match(middle,/<progress max="34" value="17"/);assert.match(middle,/17개체 완료 · 17개체 남음/);
 const final=c.pageOneProgress({current:34,total:34,completed:33},{mode:'live'});
 assert.match(final,/<progress max="34" value="33"/);assert.match(final,/경매 진행/);assert.doesNotMatch(final,/경매 완료/);
 const done=c.pageOneProgress({current:12,total:34,completed:34},{mode:'sold'});
 assert.match(done,/경매 완료/);assert.match(done,/34<small> \/ 34/);assert.match(done,/34개체 완료 · 0개체 남음/);
});
test('P1 handles empty, preparation, reopened and malformed counts without stale/full progress',()=>{
 const c=renderer();
 assert.match(c.pageOneProgress({total:34,current:1,completed:0},{mode:'standby'}),/0<small> \/ 34.*시작 대기/);
 for(const progress of [undefined,{}, {total:0}, {total:Infinity}, {total:'<img>',completed:-8}]){
  const result=c.pageOneProgress(progress);assert.match(result,/출품 대기 중/);assert.match(result,/<progress max="1" value="0"/);assert.doesNotMatch(result,/NaN|Infinity|<img/);
 }
 const reopened=c.pageOneProgress({current:4,total:34,completed:33},{mode:'live'});assert.match(reopened,/4<small> \/ 34/);assert.match(reopened,/<progress max="34" value="33"/);
 assert.match(c.pageOneProgress({current:500,total:34,completed:500},{mode:'sold'}),/34개체 완료 · 0개체 남음/);
});
test('only the national P1 adds the object and it does not depend on presenter visibility',()=>{
 const c=renderer(),progress={total:34,current:18,completed:17};
 for(const theme of ['national-stage','base','jjun-boutique','recessive-special']){
  const output=c.pageOne({broadcastTheme:theme},{page1HostsOn:false,mode:'live'},[],progress);
  assert.equal(output.includes('class="auction-progress"'),theme==='national-stage');assert.doesNotMatch(output,/host-card/);
 }
});
test('progress placement, hide and font settings persist across restart without altering other slots or channel data',async t=>{
 const {fixture}=require('../tools/national-settlement-fixture.cjs'),f=await fixture();t.after(()=>f.close());
 const value={x:60,y:5,width:32,height:12,fontScale:1.3,opacity:85,visible:false};
 const before=(await f.request('GET','/channels/national-cre/broadcast?page=1',null,false)).json();
 const result=await f.request('PUT','/channels/national-cre/broadcast-state',{layoutPlacements:{'p1-progress':value,'p2-progress':{...value,visible:true}}});
 assert.equal(result.status,200,result.body);assert.deepEqual(result.json().state.layoutPlacements['p1-progress'],value);
 f.restart();const read=(await f.request('GET','/channels/national-cre/broadcast?page=1',null,false)).json();
 assert.deepEqual(read.state.layoutPlacements['p1-progress'],value);assert.equal(read.state.layoutPlacements['p2-progress'].visible,true);
 assert.deepEqual(read.itemProgress,before.itemProgress);assert.deepEqual(read.items,[]);
 const other=(await f.request('GET','/channels/creyon/broadcast?page=1',null,false)).json();assert.equal(other.state?.layoutPlacements?.['p1-progress'],undefined);
});
test('public P1 progress refreshes after a reopened lot is completed without exposing item details',async t=>{
 const {fixture}=require('../tools/national-settlement-fixture.cjs'),f=await fixture();t.after(()=>f.close());
 const row=await f.repository.getRecord('national-cre','item','a02');
 const reopened=await f.request('PUT','/channels/national-cre/items/a02',{record:{...row,status:'live',soldPrice:0}});assert.equal(reopened.status,200,reopened.body);
 await f.request('PUT','/channels/national-cre/broadcast-state',{activeItemId:'a02',mode:'live'});
 const read=async()=>(await f.request('GET','/channels/national-cre/broadcast?page=1',null,false)).json();
 const before=await read();assert.deepEqual(before.itemProgress,{current:2,total:3,completed:2,remaining:1});assert.deepEqual(before.items,[]);
 const updated=await f.repository.getRecord('national-cre','item','a02');
 const sold=await f.request('PUT','/channels/national-cre/items/a02',{record:{...updated,status:'sold',soldPrice:100000}});assert.equal(sold.status,200,sold.body);
 const after=await read();assert.deepEqual(after.itemProgress,{current:2,total:3,completed:3,remaining:0});assert.deepEqual(after.items,[]);
 assert.notEqual(after.revision,before.revision,'existing broadcast revision triggers a P1 refresh');
 assert.doesNotMatch(JSON.stringify(after),/01000000003/);
});
