'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs'),path=require('node:path');
function fixture(rows){
 let now=0,tick;
 class Element{
  constructor(tag){this.tagName=tag;this.children=[];this.dataset={};this.isConnected=true;this.classList={add(){}};this.hidden=false}
  append(...children){this.children.push(...children)}
  removeAttribute(name){if(name==='data-photos-failed')delete this.dataset.photosFailed}
  contains(target){return this.children.includes(target)}
  decode(){return Promise.resolve()}
 }
 const box=new Element('div');box.dataset.parentPhotos=JSON.stringify(rows);
 const root={querySelectorAll:()=>[box],contains:target=>target===box};
 const context={window:{},document:{createElement:tag=>new Element(tag)},setInterval:cb=>{tick=cb},Date:{now:()=>now}};
 vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../public/broadcast-parent-photos.js'),'utf8'),context);
 context.window.CreoParentPhotos.hydrate(root);
 return {box,api:context.window.CreoParentPhotos,root,advance(ms){now=ms;tick()}};
}
test('parent player keeps first decoded photo while the second loads then swaps photo and caption together',async()=>{
 const f=fixture([{label:'부',name:'펩시콜라',url:'/s.webp'},{label:'모',name:'코카콜라',url:'/d.webp'}]);
 const [s,d]=f.box.children;assert.ok(s.hidden&&d.hidden);
 await s.children[0].onload();assert.equal(s.hidden,false);assert.equal(s.children[1].textContent,'부 펩시콜라');
 f.advance(5000);assert.equal(s.hidden,false);assert.equal(d.hidden,true);
 await d.children[0].onload();f.advance(6000);assert.equal(s.hidden,true);assert.equal(d.hidden,false);assert.equal(d.children[1].textContent,'모 코카콜라');
 f.advance(11000);assert.equal(s.hidden,false);assert.equal(d.hidden,true);
 f.api.hydrate(f.root);assert.equal(f.box.children.length,2,'refresh does not create more images or reset phase');
});
test('failed second photo and disposal cannot blank or resurrect the current item',async()=>{
 const f=fixture([{label:'부',url:'/s.webp'},{label:'모',url:'/bad.webp'}]);const [s,d]=f.box.children;
 await s.children[0].onload();d.children[0].onerror();f.advance(100000);assert.equal(s.hidden,false);assert.equal(d.hidden,true);
 f.api.release(f.box);d.children[0].onload();f.advance(200000);assert.equal(d.hidden,true);
});
test('both photo failures hide production container instead of showing a broken image',()=>{
 const f=fixture([{label:'부',url:'/bad.webp'},{label:'모',url:'/bad2.webp'}]);for(const slide of f.box.children)slide.children[0].onerror();
 assert.equal(f.box.dataset.photosFailed,'1');assert.ok(f.box.children.every(s=>s.hidden));
});
