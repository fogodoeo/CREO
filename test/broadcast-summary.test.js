'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const summary=require('../public/broadcast-summary');
const sold=(id,extra={})=>({id,channelId:'a',status:'sold',vendorId:'v1',vendorName:'업체',winnerAlias:'동명',winnerPublicKey:'buyer-one',soldPrice:30000,...extra});
test('rankings count current sold records once and exclude cancelled, reopened and other channels',()=>{
 const rows=[sold('1'),sold('1'),sold('2',{soldPrice:20000}),sold('3',{status:'cancelled'}),sold('4',{status:'live'}),sold('5',{status:'waiting'}),sold('6',{channelId:'b'}),sold('7',{soldPrice:Infinity})];
 assert.deepEqual(summary.rankings(rows,'vendor','a'),[{key:'v1',name:'업체',total:50000,count:2}]);
 const older=sold('1',{updatedAt:'2026-09-14T12:00:00Z'}),newer=sold('1',{status:'cancelled',updatedAt:'2026-09-14T13:00:00Z'});
 for(const input of [[older,newer],[newer,older]])assert.deepEqual(summary.rankings(input,'vendor','a'),[]);
});
test('buyer identities remain separate for the same display name and sum repeat winners',()=>{
 const rows=summary.rankings([sold('1'),sold('2',{winnerPublicKey:'buyer-two'}),sold('3',{winnerAlias:'새 이름'})],'buyer');
 assert.equal(rows.length,2);assert.equal(rows[0].total,60000);assert.equal(rows[1].total,30000);
});
test('one selection holds; both alternate on interval boundaries; disabled modes render nothing',()=>{
 const data=[sold('1')],state={page3On:true,page3VendorRankingOn:true,page3BuyerRankingOn:true,page3RankingInterval:10};
 assert.equal(summary.scene(state,data,9999).kind,'vendor');assert.equal(summary.scene(state,data,10000).kind,'buyer');assert.equal(summary.scene(state,data,20000).kind,'vendor');
 assert.equal(summary.scene({...state,page3BuyerRankingOn:false},data,99999).kind,'vendor');
 assert.equal(summary.scene({...state,page3VendorRankingOn:false},data,99999).kind,'buyer');
 assert.equal(summary.scene({...state,page3On:false},data),null);assert.equal(summary.scene({...state,page3VendorRankingOn:false,page3BuyerRankingOn:false},data),null);
 assert.equal(summary.scene(state,[],10000).kind,'buyer');assert.deepEqual(summary.scene(state,[]).rows,[]);
});
test('all ranks are paged five at a time while selected boards alternate',()=>{
 const rows=Array.from({length:7},(_,i)=>sold('i'+i,{vendorId:'v'+i,vendorName:'업체'+i,winnerPublicKey:'p'+i,winnerAlias:'사람'+i,soldPrice:70000-i*1000}));
 const state={page3BuyerRankingOn:true};const scenes=summary.scenes(state,rows);
 assert.deepEqual(scenes.map(s=>[s.kind,s.page,s.rows.length]),[['vendor',1,5],['buyer',1,5],['vendor',2,2],['buyer',2,2]]);
 assert.equal(scenes[2].offset,5);assert.equal(summary.scene(state,rows,40000).page,1);
});
test('special competition profiles remain independent of standard cash rankings',()=>{
 for(const renderer of ['academy','tournament','dice-teams'])assert.equal(summary.standard({},renderer),false);
 assert.equal(summary.standard({scoreboards:[{metric:'vendorContribution'}]},'scoreboard'),false);
 assert.equal(summary.standard({},'scoreboard'),true);assert.equal(summary.standard({},'status'),true);
});
test('parent roles, names and urls stay paired; absent, private and invalid photos never render',()=>{
 assert.deepEqual(summary.parentPhotos({}),[]);
 assert.deepEqual(summary.parentPhotos({attributes:{photo_sire:'/s.webp',photo_sire_name:'펩시콜라',photo_dam:'/d.webp',photo_dam_name:'코카콜라'}}),[
  {role:'sire',label:'부',name:'펩시콜라',url:'/s.webp'},{role:'dam',label:'모',name:'코카콜라',url:'/d.webp'}]);
 assert.deepEqual(summary.parentPhotos({attributes:{photo_sire:'/old.webp',parents:[{role:'sire',name:'삭제',media:[]}]}}),[]);
 for(const url of ['javascript:alert(1)','//bad.test/x','/__entry_photo__/private',''])assert.deepEqual(summary.parentPhotos({attributes:{photo_sire:url}}),[]);
 assert.equal(summary.parentPhotos({attributes:{parents:[{role:'dam',name:'새 이름',media:[{url:'https://example.org/new.webp'}]}]}})[0].label,'모');
});
