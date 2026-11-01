'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const {parseHTML}=require('linkedom');
const Profiles=require('../public/broadcast-profiles');
const {auctionWinnerEntries}=require('../roulette-app/src/auctionEntries');
const {createFixture}=require('../tools/vendor-portal-preview.cjs');
test('P3 draw is opt-in, bounded to platform P3, and survives state sanitization',async()=>{
 const channel={id:'jjunine',broadcastProfile:'standard'};
 assert.equal(Profiles.pageContract(channel,3).id,'scoreboard');
 assert.equal(Profiles.pageContract(channel,3,{page3Content:'pinball'}).id,'pinball');
 assert.equal(Profiles.pageContract(channel,2,{page3Content:'pinball'}).id,'item');
 assert.equal(Profiles.pageContract({...channel,dataAdapter:'legacy-cdcup'},3,{page3Content:'pinball'}).id,'scoreboard');
 const f=await createFixture();try{
  const admin=f.client();await f.call(admin,'POST','/api/platform/auth/login',{password:f.secret});
  const route='/api/platform/channels/national-cre/broadcast-state';
  assert.equal((await f.call(admin,'PUT',route,{page3Content:'pinball',page3On:true})).status,200);
  f.restart();
  const saved=(await f.call(admin,'GET','/api/platform/channels/national-cre/broadcast')).json();
  assert.equal(saved.state.page3Content,'pinball');
  assert.equal((await f.call(admin,'PUT',route,{page3Content:'unknown'})).status,200);
  assert.equal((await f.call(admin,'GET','/api/platform/channels/national-cre/broadcast')).json().state.page3Content,'summary');
 }finally{f.close();}
});
test('person import deduplicates full phone identity, separates homonyms, and excludes archived sales',()=>{
 const sold=(name,phone,extra={})=>({status:'sold',winnerName:name,winnerPhone:phone,soldPrice:100000,...extra});
 const rows=[sold('하늘','01011112222'),sold('다른별명','01011112222'),sold('하늘','01033332222'),sold('이전회차','01055556666',{auctionArchiveId:'old'}),sold('유찰','01077778888',{status:'passed'})];
 assert.deepEqual(auctionWinnerEntries(rows,100000,{mode:'person'}),['하늘*1','하늘 (동명이인 2)*1']);
 const withSuffix=auctionWinnerEntries(rows,100000,{mode:'person',phoneSuffix:true});
 assert.deepEqual(withSuffix,['하늘 (2222)*1','하늘 (2222) (동명이인 2)*1']);
 assert.doesNotMatch(withSuffix.join(','),/0101111|0103333|이전회차|유찰/);
});
test('P3 iframe survives refresh, changes with channel, and is inert in layout editor',()=>{
 const html=fs.readFileSync(require.resolve('../public/auction-live.html'),'utf8');
 const {document}=parseHTML('<html><body><main id="stage"></main></body></html>');
 const ctx=vm.createContext({document,window:{},URLSearchParams,CreoBroadcastProfiles:Profiles,editorMode:false,
  stage:document.getElementById('stage'),esc:s=>String(s).replaceAll('&','&amp;').replaceAll('"','&quot;'),pageThreeFrame:()=>'<p>편집 미리보기</p>'});
 vm.runInContext(html.slice(html.indexOf('function profilePageThree('),html.indexOf('const layoutSelectors='))+
  html.slice(html.indexOf('const renderSources='),html.indexOf('const contributionCounters=')),ctx);
 const channel={id:'jjunine',name:'쭌이네'};const state={page3On:true,page3Content:'pinball'};
 const markup=ctx.profilePageThree(channel,state,[],[]);ctx.reconcileStage(markup);
 const frame=ctx.stage.querySelector('iframe');assert.match(frame.src,/channel=jjunine/);
 ctx.reconcileStage(ctx.profilePageThree(channel,{...state,notice:'updated'},[],[]));
 assert.equal(ctx.stage.querySelector('iframe'),frame,'ordinary updates cannot restart a draw');
 ctx.reconcileStage(ctx.profilePageThree({id:'clab-1029',name:'씨랩'},state,[],[]));
 assert.notEqual(ctx.stage.querySelector('iframe'),frame);assert.match(ctx.stage.querySelector('iframe').src,/channel=clab-1029/);
 ctx.editorMode=true;assert.doesNotMatch(ctx.profilePageThree(channel,state,[],[]),/iframe/);
 assert.equal(ctx.profilePageThree(channel,{...state,page3On:false},[],[]),'');
});
