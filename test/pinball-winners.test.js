'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const {selectDrawWinners,winnerCountError,winnerCount,drawLabel,participantCount}=require('../roulette-app/src/drawWinners');
const {snapshotStandings}=require('../roulette-app/src/standings');
const {auctionWinnerEntries}=require('../roulette-app/src/auctionEntries');
const rows=(names,finished)=>names.map(name=>({name,finished}));

test('participant count matches unique winner identity rather than duplicate entry lines or weighted balls',()=>{
 assert.equal(participantCount(['테스트 (1234)','테스트 (1234)']),1);
 assert.equal(participantCount(['테스트 (1234)*3','테스트 (1234)/5','테스트 (5678)']),2);
 assert.equal(participantCount(['A*3/5','A','B*4']),2);
});

test('first N places count people once even when they own many balls',()=>{
 const config={winnerMode:'first',winnerCount:3};
 assert.deepEqual(selectDrawWinners([...rows(['A','A','B'],true),...rows(['C','D'],false)],config),[]);
 assert.deepEqual(selectDrawWinners([...rows(['A','A','B','C'],true),...rows(['D'],false)],config),['A','B','C']);
});
test('last N places wait until N distinct people remain, preserving weighted entries',()=>{
 const config={winnerMode:'last',winnerCount:2};
 assert.deepEqual(selectDrawWinners([...rows(['A'],true),...rows(['A','B','B','C'],false)],config),[]);
 assert.deepEqual(selectDrawWinners([...rows(['A','A'],true),...rows(['B','B','C'],false)],config),['B','C']);
 assert.deepEqual(selectDrawWinners(rows(['B','C'],false),config),[]);
});
test('winner count validates unique people and keeps single rank draws compatible',()=>{
 assert.equal(winnerCount({winnerMode:'rank',winnerCount:5}),1);
 assert.equal(winnerCount({}),1);
 assert.equal(drawLabel({winnerMode:'last',winnerCount:5}),'마지막까지 남은 5명');
 assert.equal(drawLabel({winnerMode:'rank',winningRank:3,winnerCount:5}),'3번째 도착 1명');
 assert.equal(winnerCountError(['A*20','B','B'],{winnerMode:'first',winnerCount:3}),'당첨 인원이 참가자 수보다 많습니다.');
 assert.match(winnerCountError(['A','B'],{winnerMode:'last',winnerCount:2}),/적게/);
 assert.equal(winnerCountError(['A*3','B','C'],{winnerMode:'last',winnerCount:2}),'');
});
test('national auction import distinguishes names with phone suffixes and never publishes the full number',()=>{
 const items=[
  {status:'sold',winnerName:'테스트',winnerPhone:'010-0000-1234',soldPrice:100000},
  {status:'sold',winnerName:'테스트',winnerPhone:'01000001234',soldPrice:200000},
  {status:'sold',winnerName:'테스트',winnerPhone:'01000005678',soldPrice:100000},
  {status:'sold',winnerName:'번호 없음',soldPrice:100000},
  {status:'waiting',winnerName:'미낙찰',winnerPhone:'01000009999',soldPrice:100000},
 ];
 const result=auctionWinnerEntries(items,100000,{phoneSuffix:true});
 assert.deepEqual(result,['테스트 (1234)*3','번호 없음 (번호 미등록)*1','테스트 (5678)*1']);
 assert.doesNotMatch(JSON.stringify(result),/010|0000|미낙찰/);
 assert.deepEqual(auctionWinnerEntries([{status:'sold',winnerName:'테스트/서울/010-0000-1234',soldPrice:100000}],100000,{phoneSuffix:true}),['테스트 (1234)*1']);
});
test('actual engine goal processing completes last N once even with several goals in one frame',()=>{
 const source=fs.readFileSync(require.resolve('../roulette-app/src/roulette.ts'),'utf8');
 const body=source.slice(source.indexOf('  private _updateMarbles('),source.indexOf('  private _calcTimeScale('))
  .replace('private _updateMarbles(deltaTime: number)','function update(deltaTime)')
  .replace('new Set<number>()','new Set()').replace('this._stage!.goalY','this._stage.goalY');
 const update=vm.runInNewContext('('+body.trim()+')',{
  Skills:{Impact:1},options:{useTop5Bounce:false},selectDrawWinners,
  CustomEvent:class{constructor(type,options){this.type=type;this.detail=options.detail;}},
  setTimeout:()=>0,
 });
 const emitted=[],marbles=['A','B','C','D','E','F'].map((name,id)=>({id,name,y:id<3?11:0,update(){}}));
 const game={
  _stage:{goalY:10,zoomY:5},_marbles:marbles,_winners:[],_isRunning:true,_drawConfig:{winnerMode:'last',winnerCount:5},
  _winnerRank:5,_totalMarbleCount:6,_top5BounceBannerTimer:0,_effects:[],
  _particleManager:{shot(){}},_renderer:{width:1920,height:1080},_recorder:{stop(){}},
  physics:{removeMarble(){}},_calcTimeScale:()=>1,
  getStandings(){return snapshotStandings(this._winners,this._marbles);},
  dispatchEvent(event){emitted.push({detail:event.detail,standings:this.getStandings()});},
 };
 update.call(game,10);update.call(game,10);
 assert.equal(emitted.length,1);
 assert.deepEqual([...emitted[0].detail.winners],['B','C','D','E','F']);
 assert.equal(new Set(emitted[0].standings.map(row=>row.name)).size,6);
 assert.equal(emitted[0].standings.filter(row=>row.finished).length,1,'freeze the result before later same-frame exits');
 assert.equal(game._isRunning,false);
});
