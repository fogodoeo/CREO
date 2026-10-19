'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),{parseHTML}=require('linkedom');
const html=fs.readFileSync(require.resolve('../public/broadcast-studio.html'),'utf8'),script=html.match(/<script>\s*(document.addEventListener[\s\S]*?)<\/script>/)[1];
async function setup(search){
 const {document,window}=parseHTML(html),writes=[];let failure=false;
 const channels=[{id:'national-cre',name:'전국크레자랑',status:'active'},{id:'national-cre-20261021',name:'전라충청',status:'draft',nationalRound:{date:'2026-10-21'}}],select=document.getElementById('channel-select');
 Object.defineProperty(select,'value',{writable:true,value:''});
 vm.runInNewContext(script,{document,window,location:{search,origin:'http://test.invalid'},history:{replaceState(){}},URLSearchParams,confirm:()=>true,requestAnimationFrame:f=>f(),CreoStudioTheme:{setChannel(){}},CreoOperatorPipeline:{sync(){}},CreoBroadcastProfiles:{resolve:()=>({id:'standard'}),studioFrame:(c,v)=>'editor.html?channel='+c.id+'&view='+v},CreoPlatform:{escapeHtml:s=>s,verifyAdmin:async()=>true,api:async(path,options)=>{
  if(options){writes.push([path,JSON.parse(options.body)]);if(failure)throw Error('진행 중인 경매를 종료해 주세요.');return {}}
  if(path.startsWith('channels'))return {channels,version:1};return {channelId:'national-cre',catalogVersion:1};
 }}});
 document.dispatchEvent(new window.Event('DOMContentLoaded'));await new Promise(setImmediate);
 return {document,window,writes,fail(){failure=true}};
}
test('requested draft renders its own editor and preview without switching actual broadcast',async()=>{
 const f=await setup('?channel=national-cre-20261021');
 assert.match(f.document.getElementById('control-frame').src,/channel=national-cre-20261021/);
 assert.match(f.document.getElementById('live-2').href,/event=national-cre-20261021.*preview=1/);
 assert.match(f.document.getElementById('engine-label').textContent,/송출: 전국크레자랑/);assert.deepEqual(f.writes,[]);
 f.document.getElementById('channel-switch-button').click();await new Promise(setImmediate);
 assert.deepEqual(f.writes,[['national-rounds',{action:'activate',date:'2026-10-21',expectedActiveChannelId:'national-cre'}]]);
 assert.match(f.document.getElementById('live-2').href,/page=2&live=1/);
});
test('failed switch retains requested editor; invalid and archived round URLs never open another round',async()=>{
 const f=await setup('?channel=national-cre-20261021');f.fail();f.document.getElementById('channel-switch-button').click();await new Promise(setImmediate);
 assert.match(f.document.getElementById('control-frame').src,/national-cre-20261021/);assert.match(f.document.getElementById('engine-label').textContent,/진행 중인 경매/);assert.match(f.document.getElementById('live-2').href,/preview=1/);
 for(const search of ['?channel=missing','?channel=national-cre&archive=old']){
  const bad=await setup(search);assert.equal(bad.document.getElementById('control-frame').getAttribute('src'),null);assert.equal(bad.document.getElementById('studio').hidden,true);assert.deepEqual(bad.writes,[]);
 }
});
