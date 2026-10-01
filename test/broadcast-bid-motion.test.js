'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
function fixture(reduced=false){
 const calls=[],window={matchMedia:()=>({matches:reduced})};
 vm.runInNewContext(fs.readFileSync(require.resolve('../public/broadcast-bidders.js'),'utf8'),{window});
 function row(key){return {dataset:key?{bidderKey:key}:{},style:{},exit:false,parent:null,
  classList:{add(name){this.owner.exit=name==='is-exiting';}},
  getBoundingClientRect(){return {top:this.style.top?Number.parseFloat(this.style.top):this.parent.children.filter(r=>!r.exit).indexOf(this)*72,height:60};},
  setAttribute(k,v){this[k]=v;},removeAttribute(){delete this.dataset.bidderKey;},
  getAnimations(){return this.animation?[this.animation]:[];},
  animate(frames,options){calls.push({key:this.dataset.bidderKey,exit:this.exit,frames,options});this.animation={cancel(){},finished:new Promise(()=>{})};return this.animation;},
  cloneNode(){const r=makeRow(key);return r;},remove(){this.parent.children=this.parent.children.filter(r=>r!==this);}};}
 function makeRow(key){const r=row(key);r.classList.owner=r;return r;}
 function list(keys,id='item'){const el={dataset:{itemKey:id},children:[],style:{setProperty(){},getPropertyValue(){return '.94';}},getBoundingClientRect(){return {top:0};},setAttribute(){},getAttribute(){return '실시간 입찰';},querySelectorAll(){return this.children.filter(r=>r.dataset.bidderKey&&!r.exit);},replaceChildren(...rows){this.children=rows;for(const r of rows)r.parent=this;},append(r){this.children.push(r);r.parent=this;}};el.replaceChildren(...keys.map(makeRow));return el;}
 return {calls,list,update:window.CreoBroadcastBidders.update};
}
test('new leader pushes the previous leader down and removes the displaced bidder',()=>{
 const f=fixture(),current=f.list(['a','b']);f.update(current,f.list(['c','a']));
 assert.deepEqual(current.querySelectorAll().map(r=>r.dataset.bidderKey),['c','a']);
 const retained=f.calls.find(r=>r.key==='a');assert.equal(retained.frames[0].transform,'translateY(-72px)');
 assert.equal(f.calls.filter(r=>r.exit).length,1);assert.equal(current.children.find(r=>r.exit)['aria-hidden'],'true');
 f.update(current,f.list(['d','c']));assert.equal(current.children.filter(r=>r.exit).length,1,'rapid updates must discard the previous exit clone');
 assert.deepEqual(current.querySelectorAll().map(r=>r.dataset.bidderKey),['d','c']);
});
test('amount-only refresh, new items, empty state and reduced motion do not slide stale names',()=>{
 for(const reduced of [false,true]){
  const f=fixture(reduced),current=f.list(['a','b']);f.update(current,f.list(['a','b']));assert.equal(f.calls.length,0);
  f.update(current,f.list(['c'],'new-item'));assert.equal(f.calls.length,0);
  f.update(current,f.list([null],'new-item'));assert.equal(current.children.length,1);assert.equal(f.calls.length,0);
 }
 const f=fixture(true),current=f.list(['a','b']);f.update(current,f.list(['c','a']));assert.equal(f.calls.length,0);assert.equal(current.children.length,2);
});
