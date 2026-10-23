'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const source=fs.readFileSync(require.resolve('../public/auction-live.html'),'utf8');
function fixture(){
 let now=Date.parse('2026-10-23T10:00:00Z');const timers=[];
 const context=vm.createContext({Date:{now:()=>now,parse:Date.parse},Map,Number,Math,String,editorMode:false,esc:String,scoreUnits:value=>value/10000,
  setTimeout:(fn,ms)=>{timers.push({fn,ms});return timers.length;},stage:{querySelector:()=>null},CSS:{escape:String}});
 vm.runInContext(source.slice(source.indexOf('function latestDiceItem('),source.indexOf('function liveParityContribution(')),context);
 return{context,timers,advance:ms=>{now+=ms;},row:{id:'sold-one',status:'sold',soldPrice:100000,winnerName:'가상 낙찰자',attributes:{audience_dice_event_id:'dice-one',audience_dice_started_at:new Date(now).toISOString(),audience_dice_reveal_at:new Date(now+6000).toISOString(),audience_dice_face:4,audience_contribution_base:100000}}};
}
test('legacy video records never render or delay the numeric result, including repeated refresh and reload',()=>{
 const f=fixture(),before=structuredClone(f.row),assets=[{kind:'dice',targetName:'4',imageUrl:'https://invalid.example/old.mp4'}];
 const render=()=>f.context.renderDiceOverlay([f.row],assets);
 assert.match(render(),/dice-rolling-fallback/);assert.doesNotMatch(render(),/<video|old\.mp4|dice-result-strip/);assert.equal(f.timers.length,0);
 f.advance(6000);assert.match(render(),/낙찰금 ×<\/span><b>4/);assert.doesNotMatch(render(),/<video|old\.mp4/);render();assert.equal(f.timers.length,1);
 f.advance(5100);assert.equal(render(),'');assert.deepEqual(f.row,before);
 const reload=fixture();reload.advance(11100);assert.equal(reload.context.renderDiceOverlay([f.row],assets),'');assert.equal(reload.timers.length,0);
});
test('empty, next-event and invalid-start boundaries do not replay an old video or change sold data',()=>{
 const f=fixture();assert.equal(f.context.renderDiceOverlay([]),'');
 f.advance(6000);f.context.renderDiceOverlay([f.row]);
 const next={...f.row,id:'sold-two',attributes:{...f.row.attributes,audience_dice_event_id:'dice-two',audience_dice_started_at:'2026-10-23T10:00:06Z',audience_dice_reveal_at:'2026-10-23T10:00:12Z',audience_dice_face:2}};
 assert.match(f.context.renderDiceOverlay([f.row,next]),/dice-two/);assert.doesNotMatch(f.context.renderDiceOverlay([f.row,next]),/dice-one|<video/);
 f.advance(6000);assert.match(f.context.renderDiceOverlay([next]),/낙찰금 ×<\/span><b>2/);assert.equal(f.timers.length,2);
 next.attributes.audience_dice_started_at='invalid';assert.equal(f.context.renderDiceOverlay([next]),'');assert.equal(next.soldPrice,100000);
});
