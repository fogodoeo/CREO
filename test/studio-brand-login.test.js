const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
test('studio activates the authenticated channel after the legacy brand mark is replaced',()=>{
 const html=fs.readFileSync(require.resolve('../public/broadcast-studio.html'),'utf8'),nodes={},views=[],synced=[];
 const studio={dataset:{},style:{setProperty(){}},querySelector(){return null}};
 const ctx=vm.createContext({studio,select:{},switchButton:{},activeView:'layout-1',
  $:id=>nodes[id]??={querySelector:()=>({})},
  CreoBroadcastProfiles:{resolve:()=>({page3Label:'팀 집계',brandMark:'C'})},
  CreoOperatorPipeline:{sync:(...args)=>synced.push(args)},
  liveUrl:(channel,page)=>`/live?channel=${channel.id}&page=${page}`,showView:view=>views.push(view)});
 vm.runInContext(html.slice(html.indexOf('function renderActive('),html.indexOf('function markPending(')),ctx);
 for(const channel of [{id:'alpha',name:'테스트 채널'},{id:'beta',name:'다른 채널'}]){
  assert.doesNotThrow(()=>ctx.renderActive(channel));
  assert.equal(nodes['engine-label'].textContent,'운영 잠금 · '+channel.name);
  assert.equal(nodes['live-2'].href,`/live?channel=${channel.id}&page=2`);
 }
 assert.equal(views.length,2);assert.equal(synced.length,2);
});
