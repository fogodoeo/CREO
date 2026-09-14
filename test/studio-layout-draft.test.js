const test=require('node:test'),assert=require('node:assert/strict');
const {create}=require('../public/studio-layout-draft');
const box=(x=10)=>({x,y:10,width:30,height:10,fontScale:1,opacity:100,visible:true});
test('renderer refresh preserves unsaved moves and resets while updating untouched slots',()=>{
 const model=create();model.receive({host:box(),ticker:box(),board:box()});model.change('host',box(25));model.change('ticker',null);
 for(let i=0;i<3;i++)model.receive({host:box(),ticker:box(),board:box(40)});
 assert.deepEqual(model.values(),{host:box(25),board:box(40)});assert.equal(model.dirty(),true);
});
test('edits arriving during save remain dirty and require their own save',()=>{
 const model=create();model.receive({host:box()});model.change('host',box(20));const first=model.snapshot();
 model.change('host',box(30));model.saved(first.values,first);assert.equal(model.values().host.x,30);assert.equal(model.dirty(),true);
 const next=model.snapshot();model.saved(next.values,next);assert.equal(model.dirty(),false);assert.equal(model.values().host.x,30);
});
test('reset survives an in-flight save and a failed attempt retains the complete draft',()=>{
 const model=create();model.receive({host:box()});model.change('host',box(20));const attempt=model.snapshot();
 model.change('host',null);model.saved(attempt.values,attempt);assert.deepEqual(model.values(),{});assert.equal(model.dirty(),true);
 const retry=model.snapshot();assert.deepEqual(model.snapshot(),retry);model.saved({},retry);assert.equal(model.dirty(),false);
});
test('separate editor models and snapshots never share mutable placements',()=>{
 const a=create(),b=create(),input={host:box()};a.receive(input);b.receive(input);input.host.x=80;
 a.change('host',box(30));const snapshot=a.snapshot();snapshot.values.host.x=90;
 assert.equal(a.values().host.x,30);assert.equal(b.values().host.x,10);assert.equal(b.dirty(),false);
});
