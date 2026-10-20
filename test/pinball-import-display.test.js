'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const {auctionWinnerEntries,getLeadingHouseKey,HOUSE_NAMES}=require('../roulette-app/src/auctionEntries');
const {runningParticipantName}=require('../roulette-app/src/participantDisplay');
const {selectDrawWinners}=require('../roulette-app/src/drawWinners');
const read=name=>fs.readFileSync(require.resolve('../roulette-app/src/'+name),'utf8');
const items=[
 {status:'sold',winnerName:'테스트가',winnerPhone:'01000001234',soldPrice:260000},
 {status:'complete',winnerName:'테스트가',winnerPhone:'01000001234',soldPrice:40000},
 {status:'sold',winnerName:'테스트나',winnerPhone:'01000005678',soldPrice:50000},
 {status:'sold',winnerName:'테스트다',winnerPhone:'01000009999',soldPrice:0},
 {status:'waiting',winnerName:'대기자',soldPrice:500000},
 {status:'sold',winnerName:'',soldPrice:500000},
];

test('person import gives every sold buyer one ball; amount import keeps aggregate thresholds and weights',()=>{
 assert.deepEqual(auctionWinnerEntries(items,100000,{phoneSuffix:true,mode:'person'}),
  ['테스트가 (1234)*1','테스트나 (5678)*1','테스트다 (9999)*1']);
 assert.deepEqual(auctionWinnerEntries(items,100000,{phoneSuffix:true,mode:'amount'}),['테스트가 (1234)*3']);
 assert.deepEqual(auctionWinnerEntries(items),['테스트가*3'],'legacy automatic import retains amount mode');
 const houseItems=items.map((item,i)=>({...item,groupId:i<2?'R':'B'}));
 assert.deepEqual(auctionWinnerEntries(houseItems,100000,{mode:'person',house:'R'}),['테스트가*1']);
 assert.deepEqual(auctionWinnerEntries(houseItems,100000,{mode:'amount',house:'R'}),['테스트가*3']);
});

function importFixture(fetch) {
 const source=read('app.ts');
 const body=source.slice(source.indexOf('async function syncAuctionWinnerEntries('),source.indexOf('\nfunction applyUrlParameters'))
  .replace(/async function syncAuctionWinnerEntries\([^\n]+\{/, "async function syncAuctionWinnerEntries(mode = 'amount', showEmptyMessage = true) {")
  .replace(' as { items?: Array<Record<string, unknown>>; error?: string }','');
 const dom={syncWinners:{disabled:false},syncWinnersByAmount:{disabled:false},entries:{value:'기존 참가자'}};
 const stored=[],messages=[];
 const run=vm.runInNewContext('('+body.trim()+')',{
  dom,fetch,remoteChannelId:'national-cre',isNationalChannel:()=>true,
  queryParameters:new URLSearchParams(),auctionWinnerEntries,getLeadingHouseKey,HOUSE_NAMES,
  localStorage:{setItem:(key,value)=>stored.push(value)},STORAGE_KEYS:{entries:'test'},
  updateCounts(){},showToast:text=>messages.push(text),
 });
 return {run,dom,stored,messages};
}
test('two import controls cannot race; a completed person import keeps suffixes only in its durable entries',async()=>{
 let resolve,calls=0;
 const pending=new Promise(r=>{resolve=r;});
 const f=importFixture(()=>{calls++;return pending;});
 const first=f.run('person');
 assert.equal(f.dom.syncWinners.disabled,true);
 assert.equal(f.dom.syncWinnersByAmount.disabled,true);
 await f.run('amount');
 assert.equal(calls,1);
 resolve({ok:true,json:async()=>({items})});await first;
 assert.equal(f.dom.entries.value.split('\n').length,3);
 assert.match(f.dom.entries.value,/테스트가 \(1234\)\*1/);
 assert.doesNotMatch(f.stored.join(''),/0100000/);
 assert.match(f.messages[0],/1명당 공 1개/);
 assert.equal(f.dom.syncWinners.disabled,false);
 assert.equal(f.dom.syncWinnersByAmount.disabled,false);
});
test('failed imports preserve the existing list and re-enable both controls for retry',async()=>{
 const f=importFixture(async()=>({ok:false,status:503,json:async()=>({error:'다시 불러와 주세요.'})}));
 await f.run('person');
 assert.equal(f.dom.entries.value,'기존 참가자');
 assert.equal(f.stored.length,0);
 assert.equal(f.dom.syncWinners.disabled,false);
 assert.equal(f.dom.syncWinnersByAmount.disabled,false);
 assert.equal(f.messages[0],'다시 불러와 주세요.');
});
test('empty imports explain the selected mode',async()=>{
 const f=importFixture(async()=>({ok:true,json:async()=>({items:[]})}));
 await f.run('person');await f.run('amount');
 assert.deepEqual(f.messages,['이 회차에 낙찰자가 없습니다.','합산 10만 원 이상 낙찰자가 없습니다.']);
});
test('running labels remove only the imported trailing phone suffix, preserving identity and other name content',()=>{
 for(const [name,expected] of [
  ['테스트 (1234)','테스트'],['테스트 (번호 미등록)','테스트'],['테스트 (본점)','테스트 (본점)'],
  ['1234크레 (5678)','1234크레'],['테스트 (1234) 본점','테스트 (1234) 본점'],
 ])assert.equal(runningParticipantName(name),expected);
 const identities=['동명이인 (1234)','동명이인 (5678)'];
 assert.deepEqual(identities.map(runningParticipantName),['동명이인','동명이인']);
 assert.deepEqual(selectDrawWinners(identities.map(name=>({name,finished:true})),{winnerMode:'first',winnerCount:2}),identities);
});
function canvas() {
 const text=[];
 const ctx=new Proxy({
  fillText(value){text.push(String(value));},strokeText(value){text.push(String(value));},
  measureText(value){return {width:String(value).length*5};},
 },{get:(target,key)=>key in target?target[key]:()=>{}});
 return {ctx,text};
}
function method(file,start,end,header,replacement,extra={}) {
 const source=read(file),body=source.slice(source.indexOf(start),source.indexOf(end));
 return vm.runInNewContext('('+body.replace(header,replacement).trim()+')',{
  runningParticipantName,document:{documentElement:{dataset:{rouletteTheme:'national'}}},...extra,
 });
}
test('actual marble, candidate and rank-row painters show names without phone suffixes',()=>{
 const drawName=method('marble.ts','  private _drawName(','  private _drawOutline(',
  /private _drawName\([^\n]+\{/,'function(ctx, zoom, simpleLabel) {',{transformGuard:(_,fn)=>fn()});
 const drawCandidate=method('rankRenderer.ts','  private drawCandidateLabel(','  private ellipsize(',
  /private drawCandidateLabel\([\s\S]*?\n  \) \{/,'function(ctx,candidate,centerX,centerY,maxWidth,uiScale,academySkin) {');
 const drawRow=method('rankRenderer.ts','  private drawRankRow(','  update(deltaTime:',
  /private drawRankRow\([\s\S]*?\n  \) \{/,'function(ctx,marble,rank,confirmed,rowTop,panelLeft,panelWidth,uiScale,academySkin,compact=false) {');
 const person={name:'동명이인 (1234)',x:0,y:0,size:.5,hue:50};
 for(const render of [
  ctx=>drawName.call(person,ctx,1,false),
  ctx=>drawCandidate.call({fitText:(_,name)=>name},ctx,person,200,20,300,1,false),
  ctx=>drawRow.call({layoutFontHeight:20,hudFont:'sans-serif',drawFittedText:(ctx,name)=>ctx.fillText(name)},ctx,person,0,false,0,0,300,1,false),
 ]){
  const {ctx,text}=canvas();render(ctx);
  assert.ok(text.includes('동명이인'));assert.doesNotMatch(text.join(''),/1234/);
 }
 assert.equal(person.name,'동명이인 (1234)');
});
test('actual completed canvas award retains phone suffixes for every winning person',()=>{
 const render=method('rouletteRenderer.ts','  private renderWinner(','  private renderNationalWinner(',
  /private renderWinner\([\s\S]*?\n  \) \{/,'function({winner,theme,selectedWinners},ctx,width,height,scaleForBroadcast) {');
 const names=['동명이인 (1234)','동명이인 (5678)'],{ctx,text}=canvas();
 render.call({}, {winner:{name:names[0]},theme:{},selectedWinners:names},ctx,1920,1080,true);
 for(const name of names)assert.ok(text.includes(name));
});
