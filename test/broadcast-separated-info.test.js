'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const layout=require('../public/broadcast-text-layout'),themes=require('../public/broadcast-themes');
test('C-LAB and departure captions preserve saved right edge on the first resize',()=>{
 for(const theme of ['clab-gallery','departure-blue']){
  const original={x:51,y:5,width:43,height:10};
  assert.equal(layout.rightEdge(original,theme),94);
  const resized=layout.resize(theme,'p2-info',original,-6,2);
  assert.equal(resized.width,49);assert.equal(resized.rightEdge,94);assert.equal(resized.height,12);
  const moved=layout.move(theme,'p2-info',resized,-10,3);
  assert.equal(moved.rightEdge,84);assert.equal(moved.y,8);
  assert.deepEqual(original,{x:51,y:5,width:43,height:10});
 }
});
test('shared caption behavior only opts in the requested themes and info slot',()=>{
 for(const theme of ['clab-gallery','departure-blue']){
  assert.equal(layout.separatedInfo(theme),true);assert.equal(layout.supports(theme,'p2-info'),true);
  assert.equal(layout.automatic(theme,'p2-info',{}),true);
  assert.equal(layout.automatic(theme,'p2-info',{autoWidth:false}),false);
  for(const slot of ['p2-progress','p2-bidders','p2-price','p3-board'])assert.equal(layout.supports(theme,slot),false);
 }
 for(const theme of ['base','pixel','jjun-boutique'])assert.equal(layout.separatedInfo(theme),false);
 assert.equal(layout.rightEdge({x:20,width:50},'national-stage'),98);
});
test('departure theme resolves and uses configured event date and title',()=>{
 assert.equal(themes.resolve('departure-blue').id,'departure-blue');
 const html=themes.frame({broadcastTheme:'departure-blue',shortName:'크레용',name:'굿바이 과천점',shippingDefaults:{deliverySchedule:{auctionDate:'2026-11-17'}}});
 assert.match(html,/굿바이 과천점/);assert.match(html,/11\.17/);assert.match(html,/화요일/);
});
