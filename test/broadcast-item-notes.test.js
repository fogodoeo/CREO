'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const notes=require('../public/broadcast-item-notes'),contract=require('../public/auction-contract');
test('notes normalize, deduplicate and escape without a placeholder or lost tail',()=>{
 assert.equal(notes.markup('none',' null '),'');assert.equal(notes.text('  흰 벽\n부모 확인  ','흰 벽 부모 확인'),'흰 벽 부모 확인');
 const long='아주 긴 설명 '.repeat(200)+'끝부분';
 const html=notes.markup('<img onerror=alert(1)>',long);
 assert.ok(html.includes('끝부분'));assert.ok(html.includes('&lt;img'));assert.ok(!html.includes('<img'));
});
test('rendered P2 keeps notes after the traits on a dedicated row; next item clears the row',()=>{
 const source=fs.readFileSync(require.resolve('../public/auction-live.html'),'utf8');
 const functions=source.slice(source.indexOf('function pageTwoInfoTraits('),source.indexOf('function pageTwoParents('));
 const c=vm.createContext({CreoBroadcastItemNotes:notes,CreoAuctionContract:contract,esc:String});vm.runInContext(functions,c);
 c.item={name:'A01',attributes:{checklist:'gender:M|weight:20|memo:같은 비고'},note:'같은 비고'};
 const result=vm.runInContext('pageTwoInlineInfo(item, "")',c);
 assert.equal((result.match(/같은 비고/g)||[]).length,1);assert.match(result,/has-item-note/);
 assert.ok(result.indexOf('broadcast-item-note')>result.indexOf('item-inline-traits'));
 assert.ok(!vm.runInContext('pageTwoInfoTraits(item)',c).some(row=>row.text==='같은 비고'));
 c.item={name:'B01'};assert.doesNotMatch(vm.runInContext('pageTwoInlineInfo(item, "")',c),/broadcast-item-note|has-item-note|같은 비고/);
});
test('note observers are disconnected on item replacement and when returning to standby',()=>{
 const source=fs.readFileSync(require.resolve('../public/broadcast-item-notes'),'utf8');let disconnects=0,observers=0;
 const c=vm.createContext({document:{},ResizeObserver:class{constructor(){observers++}observe(){}disconnect(){disconnects++}}});vm.runInContext(source,c);
 const node=()=>({isConnected:true,firstElementChild:{scrollWidth:2000},clientWidth:500,style:{setProperty(){}},dataset:{}});
 let current=node();const container={querySelector:()=>current};
 c.CreoBroadcastItemNotes.hydrate(container);c.CreoBroadcastItemNotes.hydrate(container);assert.equal(observers,1);
 current=node();c.CreoBroadcastItemNotes.hydrate(container);assert.equal(disconnects,1);assert.equal(current.dataset.overflow,'1');
 current=null;c.CreoBroadcastItemNotes.hydrate(container);assert.equal(disconnects,2);
});
test('two-row style overrides saved fixed height and pixel zero-grow traits without changing the anchor',()=>{
 const css=fs.readFileSync(require.resolve('../public/broadcast-item-notes.css'),'utf8');
 const card=css.match(/body\[data-page="2"\] #stage \.item-copy\.is-inline-info\.has-item-note\{([^}]+)\}/)[1];
 assert.match(card,/height:auto!important/);assert.doesNotMatch(card,/(?:^|;)(?:top|left|right|width):/);
 const traits=css.match(/\.has-item-note \.item-inline-traits\{([^}]+)\}/)[1];assert.match(traits,/flex:1 1 0/);
 assert.match(css,/@media\(prefers-reduced-motion:reduce\)/);assert.match(css,/white-space:normal/);
});
test('P2 notes can be hidden in both layouts without removing identity or traits; undefined keeps existing visibility',()=>{
 const source=fs.readFileSync(require.resolve('../public/auction-live.html'),'utf8');let inline=true;
 const c=vm.createContext({CreoBroadcastItemNotes:notes,CreoAuctionContract:contract,esc:String,money:String,
  CreoBroadcastStandby:require('../public/broadcast-standby'),channelId:'alpha',editorMode:false,
  CreoBroadcastProfiles:{resolve:()=>({settings:{page2InfoLayout:inline?'inline-traits':'standard'}})},
  vendorLogo:()=>'',pageTwoProgress:()=>'',pageTwoBidders:()=>'',pageTwoParents:()=>'',banner:()=>'',showBanner:()=>false,pageTicker:()=>''});
 for(const name of ['pageTwoInfoTraits','pageTwoInlineInfo','pageTwo']){const start=source.indexOf('function '+name+'('),end=source.indexOf('\nfunction ',start+1);vm.runInContext(source.slice(start,end),c);}
 const item={id:'live',name:'A01',status:'live',note:'검토할 비고',attributes:{checklist:'gender:M|weight:20|memo:체크리스트 비고'}};
 for(inline of [true,false]){
  const state={mode:'live',activeItemId:'live',page2NoteOn:false};
  const hidden=c.pageTwo({},state,[item],[]);assert.match(hidden,/A01/);assert.doesNotMatch(hidden,/검토할 비고|체크리스트 비고|broadcast-item-note|has-item-note/);
  if(inline){assert.match(hidden,/수컷/);assert.match(hidden,/20g/);}
  assert.match(c.pageTwo({},{...state,page2NoteOn:true},[item],[]),/검토할 비고/);
  assert.match(c.pageTwo({},{...state,page2NoteOn:undefined},[item],[]),/검토할 비고/);
 }
});
test('embedded P2 settings submit the note toggle without submitting auction status',()=>{
 const source=fs.readFileSync(require.resolve('../public/auction-control.html'),'utf8');
 assert.match(source,/name="page2NoteOn" type="checkbox"> 비고 표시/);
 const start=source.indexOf('const compactPageFields='),end=source.indexOf('\nfunction updatePositionWarnings',start);
 const c=vm.createContext({page:2,isBasicDice:()=>false});vm.runInContext(source.slice(start,end),c);
 c.input={page2NoteOn:false,page2InfoOn:true,mode:'sold',activeItemId:'stale'};
 const result=vm.runInContext('compactPatch(input)',c);
 assert.equal(result.page2NoteOn,false);assert.equal(result.page2InfoOn,true);assert.equal(result.mode,undefined);assert.equal(result.activeItemId,undefined);
});
