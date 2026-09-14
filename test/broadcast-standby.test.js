'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const standby=require('../public/broadcast-standby'),profiles=require('../public/broadcast-profiles');
const items=[{id:'old',channelId:'alpha',status:'live',name:'이전 개체',photoUrl:'/old.jpg'},{id:'next',channelId:'alpha',status:'waiting',name:'다음 비밀 개체'}];
test('standby hides selected, sold and stale live items until the authoritative start',()=>{
 for(const state of [{},{mode:'standby'},{mode:'standby',activeItemId:'old'},{mode:'standby',activeItemId:'next'}]){
  const view=standby.view(state,items,'alpha');assert.equal(view.item,null);assert.equal(view.phase,'standby');
 }
 assert.equal(standby.view({mode:'live',activeItemId:'next'},items,'alpha').item.id,'next');
 assert.equal(standby.view({mode:'sold',activeItemId:'old'},items,'alpha').item.id,'old');
 assert.equal(standby.view({mode:'live',activeItemId:'missing'},items,'alpha').item,null);
 assert.equal(standby.view({mode:'live',activeItemId:'old'},items,'beta').item,null);
 assert.equal(standby.view({mode:'live'},[...items,{id:'ambiguous',status:'live'}],'alpha').item,null);
});
test('reveal happens once per live transition, never on reload, repeated polls or bid updates',()=>{
 const waiting=standby.view({mode:'standby',activeItemId:'old'},items,'alpha');
 const live=standby.view({mode:'live',activeItemId:'next'},items,'alpha');
 assert.equal(standby.shouldReveal(null,live),false);
 assert.equal(standby.shouldReveal(waiting,live),true);
 assert.equal(standby.shouldReveal(live,{...live,item:{...live.item,bidLog:[{amount:1}]}}),false);
 const sold={...live,phase:'sold'};assert.equal(standby.shouldReveal(live,sold),false);
 assert.equal(standby.shouldReveal(sold,live),true);
 assert.equal(standby.shouldReveal(live,waiting),false);
});
test('P2 renderer emits only mystery, progress, banner and ticker while waiting',()=>{
 const html=fs.readFileSync(require.resolve('../public/auction-live.html'),'utf8');
 const source=html.slice(html.indexOf('function pageTwo(c,'),html.indexOf('function aggregateStats('));
 const context={CreoBroadcastStandby:standby,channelId:'alpha',pageTwoProgress:()=>'<progress></progress>',banner:()=>'<aside>배너</aside>',showBanner:()=>true,pageTicker:()=>'<footer>자막</footer>'};
 vm.createContext(context);vm.runInContext(source,context);
 const result=context.pageTwo({}, {mode:'standby',activeItemId:'old'},items,[],{});
 assert.match(result,/\?\?\?/);assert.match(result,/다음 개체/);assert.match(result,/<progress/);assert.match(result,/<aside/);assert.match(result,/<footer/);
 assert.doesNotMatch(result,/이전 개체|다음 비밀 개체|old.jpg|parent-photos|live-bidders|price-card/);
});
test('new channel baseline is isolated, editable and does not overwrite established profiles',()=>{
 const a={broadcastProfile:'standard',broadcastDefaults:{layoutPreset:'standard-v1'}},b={...a};
 const first=profiles.defaultState(a),second=profiles.defaultState(b);
 assert.equal(first.page3On,true);assert.equal(first.page3BuyerRankingOn,true);assert.equal(first.page3VendorRankingOn,true);
 first.layoutPlacements['p2-banner'].x=80;assert.notEqual(second.layoutPlacements['p2-banner'].x,80);
 assert.equal(profiles.defaultState({broadcastProfile:'standard'}).layoutPlacements,undefined);
 assert.equal(profiles.defaultState({...a,broadcastProfile:'basic-dice'}).scoreboardId,'team-contribution');
 assert.doesNotMatch(JSON.stringify(profiles.initialState(a)),/creyon|cdcup|김동욱|winner|activeItemId|soldPrice|https:/i);
 for(const box of Object.values(second.layoutPlacements)){assert.ok(box.x+box.width<=100);assert.ok(box.y+box.height<=100);}
});

test('channel theme picker boots inside the document after its dependencies',()=>{
 const html=fs.readFileSync(require.resolve('../public/channel-manager.html'),'utf8');
 const scripts=[...html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/g)];
 const startup=scripts.find(m=>m[2].includes('\nsetupThemePicker();'));
 assert.ok(startup,'theme picker initialization must be executable JavaScript');
 for(const name of ['broadcast-themes.js','broadcast-palette.js'])assert.ok(scripts.some(m=>m[1].includes(name)&&m.index<startup.index));
 assert.equal(html.slice(html.indexOf('</html>')+7).trim(),'');
 for(const script of scripts.filter(m=>!m[1].includes('src=')))assert.doesNotThrow(()=>new Function(script[2]));
});

test('first-open P3 rotation uses the same new-channel defaults as rendering',()=>{
 const html=fs.readFileSync(require.resolve('../public/auction-live.html'),'utf8');
 const source=html.slice(html.indexOf('function renderIfChanged('),html.indexOf('async function refreshFull('));
 let kind='vendor',renders=0;
 const context=vm.createContext({page:3,editorMode:false,CreoBroadcastProfiles:profiles,CreoBroadcastSummary:{standard:()=>true},
  CreoContributionResult:{visible:()=>false},pageAssets:()=>[],activeItem:()=>null,
  summaryScene:(_,state)=>{assert.equal(state.page3BuyerRankingOn,true);return {kind,page:0};},
  lastRevision:null,render:()=>renders++});
 vm.runInContext(source,context);
 const data={channel:{broadcastDefaults:{layoutPreset:'standard-v1'}},state:{},assets:[],items:[],revision:1};
 context.renderIfChanged(data);context.renderIfChanged(data);assert.equal(renders,1);
 kind='buyer';context.renderIfChanged(data);assert.equal(renders,2);
 assert.deepEqual(data.state,{});
});

test('scene switching waits for iframe readiness so an early selection cannot get lost',()=>{
 const source=fs.readFileSync(require.resolve('../public/studio-layout-editor'),'utf8');
 const fields={'save-status':{dataset:{}},save:{},'p2-scene':{}};
 const context=vm.createContext({$:id=>fields[id],model:{dirty:()=>false},saving:false,ready:false});
 vm.runInContext(source.slice(source.indexOf(' function status('),source.indexOf(' function toast(')),context);
 context.status();assert.equal(fields['p2-scene'].disabled,true);
 context.ready=true;context.status();assert.equal(fields['p2-scene'].disabled,false);
 context.ready=false;context.status();assert.equal(fields['p2-scene'].disabled,true);
});

test('editor can preview a selected waiting item without starting the real auction',()=>{
 const html=fs.readFileSync(require.resolve('../public/auction-live.html'),'utf8');
 const source=html.slice(html.indexOf('    const state={...CreoBroadcastProfiles.defaultState'),html.indexOf('    const assets=state.bannerSelectionConfigured'));
 for(const scene of ['waiting','item']){
  const data={channel:{},state:{mode:'standby',activeItemId:'next'},items};
  const context=vm.createContext({data,CreoBroadcastProfiles:profiles,page:2,editorMode:true,editorP2Scene:scene,activeItem:(state,rows)=>rows.find(i=>i.id===state.activeItemId)});
  const preview=vm.runInContext(source+';({state,items});',context);
  assert.equal(preview.state.mode,scene==='waiting'?'standby':'live');
  assert.equal(standby.view(preview.state,preview.items,'alpha').item?.id,scene==='waiting'?undefined:'next');
  assert.equal(data.state.mode,'standby');assert.equal(data.state.activeItemId,'next');
 }
});
