'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs'),path=require('node:path');
test('parent caption follows ticker font scale and resets when the layout changes',()=>{
 const html=fs.readFileSync(path.join(__dirname,'../public/auction-live.html'),'utf8');
 const values={};const context={stage:{style:{setProperty:(key,value)=>{values[key]=value}}}};
 vm.createContext(context);
 for(const name of ['tickerFontScale','syncParentCaptionFont'])vm.runInContext(html.split('\n').find(line=>line.startsWith(`function ${name}(`)),context);
 for(const scale of [.5,1,1.4,2.5]){
  context.syncParentCaptionFont({'p2-ticker':{fontScale:scale}});
  assert.equal(values['--ticker-text-font-size'],`${54.17*scale}px`);
 }
 context.syncParentCaptionFont({});assert.equal(values['--ticker-text-font-size'],'54.17px');
});
function fixture(rows){
 let now=0,tick;
 class Element{
  constructor(tag){this.tagName=tag;this.children=[];this.dataset={};this.isConnected=true;this.classList={add(){}};this.hidden=false;this.style={setProperty(key,value){this[key]=value}}}
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
 await s.children[0].onload();assert.equal(s.hidden,false);assert.equal(s.children[1].children.map(c=>c.textContent).join(' '),'부 펩시콜라');
 f.advance(5000);assert.equal(s.hidden,false);assert.equal(d.hidden,true);
 await d.children[0].onload();f.advance(6000);assert.equal(s.hidden,true);assert.equal(d.hidden,false);assert.equal(d.children[1].children.map(c=>c.textContent).join(' '),'모 코카콜라');
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

test('three references rotate sire, dam, sibling and wrap without starving the third photo',async()=>{
 const f=fixture(['부','모','동배'].map((label,i)=>({label,name:i===2?'':'개체 '+i,url:'/p'+i+'.webp'})));
 for(const slide of f.box.children)await slide.children[0].onload();
 for(const [time,index] of [[0,0],[5000,1],[10000,2],[15000,0],[20000,1]]){f.advance(time);assert.equal(f.box.children.findIndex(s=>!s.hidden),index)}
 assert.equal(f.box.children[2].children[1].children.length,1,'unnamed sibling shows only its role');
});

test('a failed middle reference is skipped while sibling still rotates',async()=>{
 const f=fixture(['부','모','동배'].map((label,i)=>({label,url:'/p'+i+'.webp'})));
 await f.box.children[0].children[0].onload();f.box.children[1].children[0].onerror();await f.box.children[2].children[0].onload();
 f.advance(5000);assert.equal(f.box.children[2].hidden,false);f.advance(10000);assert.equal(f.box.children[0].hidden,false);
});

test('landscape and portrait references retain their own decoded aspect through rotation',async()=>{
 const f=fixture([{label:'부',url:'/wide.webp'},{label:'모',url:'/tall.webp'}]);const [wide,tall]=f.box.children;
 Object.assign(wide.children[0],{naturalWidth:1600,naturalHeight:900});
 Object.assign(tall.children[0],{naturalWidth:900,naturalHeight:1600});
 await wide.children[0].onload();await tall.children[0].onload();
 assert.equal(wide.style['--parent-photo-aspect'],String(16/9));
 assert.equal(tall.style['--parent-photo-aspect'],String(9/16));
 f.advance(5000);assert.equal(tall.hidden,false);assert.equal(wide.hidden,true);
 f.advance(10000);assert.equal(wide.hidden,false);assert.equal(wide.style['--parent-photo-aspect'],String(16/9));
});
