'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const themes=require('../public/broadcast-themes'),layout=require('../public/broadcast-text-layout');
test('boxing visual variant inherits national layout and cleans up when switching',()=>{
 const doc={body:{dataset:{}}};themes.apply(doc,'clab-boxing');
 assert.equal(doc.body.dataset.broadcastTheme,'national-stage');assert.equal(doc.body.dataset.broadcastVariant,'clab-boxing');
 for(const slot of ['p2-info','p2-progress','p2-bidders','p2-price','p2-sold'])assert.equal(layout.supports('clab-boxing',slot),layout.supports('national-stage',slot));
 const saved={x:58,width:71.7,rightEdge:99.1,y:2};
 assert.deepEqual(layout.move('clab-boxing','p2-info',saved,2,3),layout.move('national-stage','p2-info',saved,2,3));
 assert.deepEqual(layout.resize('clab-boxing','p2-info',saved,-5,1),layout.resize('national-stage','p2-info',saved,-5,1));
 themes.apply(doc,'clab-gallery');assert.equal(doc.body.dataset.broadcastVariant,'clab-gallery');assert.equal(doc.body.dataset.broadcastTheme,'clab-gallery');
});
