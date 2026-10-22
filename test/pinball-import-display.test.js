'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const {auctionWinnerEntries,getLeadingHouseKey,HOUSE_NAMES}=require('../roulette-app/src/auctionEntries');
const {runningParticipantName}=require('../roulette-app/src/participantDisplay');
const {selectDrawWinners,winnerCountError,drawLabel}=require('../roulette-app/src/drawWinners');
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
  .replace(' as { items?: Array<Record<string, unknown>>; error?: string }','')
  .replace('file: File','file').replace(': Promise<void>','')
  .replace(' as { config?: Partial<AppConfig>; entries?: string }','');
 const dom={syncWinners:{disabled:false},syncWinnersByAmount:{disabled:false},entries:{value:'기존 참가자'},undoEntries:{hidden:true},entryFeedback:{hidden:true,dataset:{},focus(){}}};
 const stored=[],messages=[],configs=[];
 Object.defineProperty(dom.entryFeedback,'textContent',{set:value=>messages.push(value),get:()=>messages.at(-1)});
 const helpers=source.slice(source.indexOf('let previousEntries:'),source.indexOf('const remoteControls =')).replaceAll(': string | null','').replaceAll(': boolean','').replaceAll(': string','').replaceAll(': void','');
 const ctx=vm.createContext({
  dom,fetch,remoteChannelId:'national-cre',isNationalChannel:()=>true,
  running:false,remoteCommandPending:false,remoteActionPending:false,isRemoteController:true,remotePhase:'idle',remoteRevision:0,
  configure:config=>configs.push(config),
  queryParameters:new URLSearchParams(),auctionWinnerEntries,getLeadingHouseKey,HOUSE_NAMES,
  localStorage:{setItem:(key,value)=>stored.push(value)},STORAGE_KEYS:{entries:'test'},
  updateCounts(){dom.syncWinners.disabled=dom.syncWinnersByAmount.disabled=ctx.setupLocked();},showToast:text=>messages.push(text),
 });
 vm.runInContext(helpers+'\n'+body,ctx);
 return {run:ctx.syncAuctionWinnerEntries,dom,stored,messages,ctx,configs};
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
 assert.match(f.messages.at(-1),/1명당 공 1개/);
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
 assert.equal(f.messages.at(-1),'다시 불러와 주세요.');
});
test('empty imports explain the selected mode',async()=>{
 const f=importFixture(async()=>({ok:true,json:async()=>({items:[]})}));
 await f.run('person');await f.run('amount');
 assert.deepEqual(f.messages.filter(m=>!m.includes('불러오는 중')),['이 회차에 낙찰자가 없습니다. 기존 명단은 그대로예요.','합산 10만 원 이상 낙찰자가 없습니다. 기존 명단은 그대로예요.']);
 assert.equal(f.dom.entries.value,'기존 참가자');assert.equal(f.stored.length,0);
});

test('successful replacement and clear can be undone without changing the saved phone suffixes',async()=>{
 const f=importFixture(async()=>({ok:true,json:async()=>({items})}));await f.run('person');const imported=f.dom.entries.value;f.ctx.undoEntryReplacement();assert.equal(f.dom.entries.value,'기존 참가자');
 f.ctx.replaceEntries(imported,'불러옴');f.ctx.replaceEntries('','비움');f.ctx.undoEntryReplacement();assert.equal(f.dom.entries.value,imported);assert.equal(f.stored.at(-1),imported);
});
test('late import cannot overwrite an intervening edit or running draw; a running draw cannot start an import',async()=>{
 for(const change of [f=>{f.dom.entries.value='새로 입력';},f=>{f.ctx.remotePhase='running';},f=>{f.ctx.remoteRevision++;}]){
  let resolve;const f=importFixture(()=>new Promise(r=>resolve=r));const importing=f.run('person');change(f);const before=f.dom.entries.value;resolve({ok:true,json:async()=>({items})});await importing;
  assert.equal(f.dom.entries.value,before);assert.match(f.messages.at(-1),/상태가 바뀌었어요/);assert.equal(f.stored.length,0);
 }
 let calls=0;const f=importFixture(async()=>{calls++;return{ok:true,json:async()=>({items})}});f.ctx.remotePhase='running';await f.run('person');assert.equal(calls,0);
});

test('file and preset imports cannot race another import or overwrite a newer session, and remain undoable',async()=>{
 for(const preset of [false,true]){
  let resolve,reads=0;const f=importFixture(async()=>{throw Error('unexpected network');});
  const file={name:'participants.txt',text:()=>new Promise(r=>{reads++;resolve=r;})};
  const pending=f.ctx.importEntryFile(file,preset);await f.ctx.importEntryFile(file,preset);assert.equal(reads,1);
  f.ctx.remoteRevision++;resolve(preset?JSON.stringify({config:{winnerCount:5},entries:'새 명단'}):'새 명단');await pending;
  assert.equal(f.dom.entries.value,'기존 참가자');assert.equal(f.configs.length,0);assert.match(f.messages.at(-1),/상태가 바뀌었어요/);
  await f.ctx.importEntryFile({name:'participants.txt',text:async()=>preset?JSON.stringify({config:{winnerCount:2},entries:'테스트가 (1234)\n테스트나 (5678)'}):'테스트가 (1234)\n테스트나 (5678)'},preset);
  assert.equal(f.dom.entries.value,'테스트가 (1234)\n테스트나 (5678)');assert.equal(f.dom.syncWinners.disabled,false);
  f.ctx.undoEntryReplacement();assert.equal(f.dom.entries.value,'기존 참가자');assert.equal(f.stored.at(-1),'기존 참가자');
 }
});
test('empty, unreadable and invalid files preserve entries/settings and expose a retry path',async()=>{
 for(const [content,preset] of [['',false],['broken',true],['null',true],['{}',true],['{"entries":3}',true],['{"config":[]}',true]]){
  const f=importFixture(()=>{});await f.ctx.importEntryFile({name:'file',text:async()=>content},preset);
  assert.equal(f.dom.entries.value,'기존 참가자');assert.equal(f.configs.length,0);assert.equal(f.stored.length,0);
  assert.equal(f.dom.entryFeedback.dataset.error,'true');assert.equal(f.dom.syncWinners.disabled,false);
  assert.match(f.messages.at(-1),/그대로|다시 선택/);
 }
 const f=importFixture(()=>{});await f.ctx.importEntryFile({name:'file',text:async()=>{throw new Error('파일을 다시 선택해 주세요.');}});
 assert.equal(f.dom.entries.value,'기존 참가자');assert.equal(f.dom.syncWinners.disabled,false);
});

function controlFixture(){
 const f=importFixture(()=>{}),source=read('app.ts');
 const names=['personCount','ballCount','startBallCount','drawSummary','eventTitle','channelName','map','speed','renderFps','winningRank','skills','top5Bounce','recording','accent','winnerLabel','sample','importEntries','clearEntries','importPreset','winnerCount','controlHint','shuffle','start','resetBroadcastSession'];
 for(const name of names)f.dom[name]={value:'',dataset:{},disabled:false};
 f.dom.winnerCount.value='1';f.dom.winnerCount.checkValidity=function(){return this.disabled||(Number.isInteger(Number(this.value))&&Number(this.value)>=1&&Number(this.value)<=20);};
 const radios=[{disabled:false},{disabled:false},{disabled:false}];
 Object.assign(f.ctx,{engineReady:true,mode:'last',entrySummary:()=>({people:6,balls:7}),parseEntries:()=>['가*2','나','다','라','마','바'],parseName:name=>({name}),nationalStage:{update(){}},winnerCountError,drawLabel,currentWinnerMode:()=>f.ctx.mode,collectConfig:()=>({winnerMode:f.ctx.mode,winnerCount:Number(f.dom.winnerCount.value)}),document:{querySelectorAll:()=>radios},setStatus(){},preparedFingerprint:''});
 const counts=source.slice(source.indexOf('function updateCounts()'),source.indexOf('function updateRankVisibility()')).replaceAll(': void','').replaceAll('<HTMLInputElement>','');
 vm.runInContext(counts,f.ctx);f.ctx.updateCounts();return {...f,radios};
}
test('setup and launch controls lock through import/command/running states, then unlock without accepting an invalid winner count',()=>{
 const f=controlFixture();assert.equal(f.dom.start.disabled,false);
 for(const [busy,on,off] of [['entryImportPending',true,false],['remoteCommandPending',true,false],['remoteActionPending',true,false],['remotePhase','running','complete'],['running',true,false]]){
  vm.runInContext(`${busy} = ${JSON.stringify(on)}; updateCounts()`,f.ctx);
  for(const key of ['entries','eventTitle','map','winnerCount','importPreset','syncWinners','shuffle','start'])assert.equal(f.dom[key].disabled,true,key+' must lock for '+busy);
  assert(f.radios.every(r=>r.disabled));
  f.dom.winnerCount.value='0';vm.runInContext(`${busy} = ${JSON.stringify(off)}; updateCounts()`,f.ctx);
  assert.equal(f.dom.winnerCount.disabled,false);assert.equal(f.dom.start.disabled,true);assert.match(f.dom.controlHint.textContent,/1~20/);
  f.dom.winnerCount.value='5';f.ctx.updateCounts();assert.equal(f.dom.start.disabled,false);
 }
 for(const value of ['', '1.5','21','6']){f.dom.winnerCount.value=value;f.ctx.updateCounts();assert.equal(f.dom.start.disabled,true);}
 f.ctx.mode='rank';f.ctx.updateCounts();assert.equal(f.dom.winnerCount.disabled,true);assert.equal(f.dom.start.disabled,false);
});
test('controller reload restores the running list and settings once; prepared/completed polling preserves the editable next-draw draft',()=>{
 const f=controlFixture(),source=read('app.ts'),applied=[];
 for(const name of ['remoteStatus','remoteResult','remoteResultWinner'])f.dom[name]={};
 f.dom.remoteResultStandings={replaceChildren(){},append(){}};
 Object.assign(f.ctx,{config:{winnerCount:1},remoteSessionRunId:'',lastRemoteResult:null,
  applyConfigToControls(config){applied.push(config);f.dom.winnerCount.value=String(config.winnerCount);f.ctx.mode=config.winnerMode;},persistInputs(){}});
 const update=require('node:module').stripTypeScriptTypes(source.slice(source.indexOf('function updateRemoteSnapshot('),source.indexOf('async function sendRemoteCommand(')));
 vm.runInContext(update,f.ctx);
 const session={revision:3,phase:'prepared',runId:'actual-run',entries:['현재가 (1234)*2','현재나 (5678)','현재다 (9999)'],config:{winnerMode:'last',winnerCount:2},ballCount:4};
 f.ctx.updateRemoteSnapshot(session);assert.equal(f.dom.entries.value,'기존 참가자');assert.equal(applied.length,0);
 session.phase='running';session.revision++;f.ctx.updateRemoteSnapshot(session);
 assert.equal(f.dom.entries.value,session.entries.join('\n'));assert.equal(f.dom.winnerCount.value,'2');assert.equal(f.dom.entries.disabled,true);assert.equal(applied.length,1);
 f.ctx.updateRemoteSnapshot(session);assert.equal(applied.length,1);
 session.phase='complete';session.revision++;f.ctx.updateRemoteSnapshot(session);assert.equal(f.dom.entries.disabled,false);
 f.dom.entries.value='다음 추첨 초안';f.ctx.updateRemoteSnapshot(session);assert.equal(f.dom.entries.value,'다음 추첨 초안');assert.equal(applied.length,1);
 f.ctx.undoEntryReplacement();assert.equal(f.dom.entries.value,'기존 참가자');
});
test('control errors remain inline and focus the recovery message without a toast covering launch buttons',()=>{
 const source=read('app.ts'),messages=[],controlFeedback={hidden:true,focus(){this.focused=true;}};
 const dom={controlFeedback,remoteStatus:{}};
 const fn=require('node:module').stripTypeScriptTypes(source.slice(source.indexOf('function reportControlError('),source.indexOf('\nfunction ',source.indexOf('function reportControlError(')+1)));
 const ctx=vm.createContext({dom,isRemoteController:true,isRemoteDisplay:false,setStatus(){},showToast:m=>messages.push(m),Error});vm.runInContext(fn,ctx);
 ctx.reportControlError(new Error('참가자 이름을 줄인 뒤 다시 준비해 주세요.'));
 assert.equal(controlFeedback.hidden,false);assert.equal(controlFeedback.focused,true);assert.match(controlFeedback.textContent,/다시 준비/);assert.equal(dom.remoteStatus.textContent,controlFeedback.textContent);assert.deepEqual(messages,[]);
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
  /private _drawName\([^\n]+\{/,'function(ctx, zoom, simpleLabel, highlighted=false) {',{transformGuard:(_,fn)=>fn()});
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
