'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
const layout=require('../public/broadcast-text-layout'),draft=require('../public/studio-layout-draft');
test('national info fits whole vendor and trait rows, resets on resize and does not change their text',()=>{
 let width=300;
 const rows=[600,480,120].map(natural=>({textContent:'원문 그대로',scale:1,get clientWidth(){return width;},get scrollWidth(){return Math.max(width,Math.ceil(natural*this.scale+20));},style:{setProperty(name,value){assert.equal(name,'--national-row-fit');this.owner.scale=Number(value);}}}));
 for(const row of rows)row.style.owner=row;
 const element={querySelectorAll:()=>rows};
 layout.fitInfoRows(element);
 for(const row of rows){assert.ok(row.scrollWidth<=row.clientWidth);assert.equal(row.textContent,'원문 그대로');}
 assert.ok(rows[0].scale<rows[1].scale);assert.equal(rows[2].scale,1);
 const scales=rows.map(r=>r.scale);layout.fitInfoRows(element);assert.deepEqual(rows.map(r=>r.scale),scales);
 width=900;layout.fitInfoRows(element);assert.ok(rows.every(r=>r.scale===1));
 width=0;layout.fitInfoRows(element);assert.ok(rows.every(r=>r.scale===1));
});
test('national text auto width defaults on, honors manual width, and leaves other themes and media untouched',()=>{
 for(const slot of ['p2-info','p2-progress','p2-bidders','p2-price','p2-sold']){
  const element={dataset:{}};
  for(const value of [undefined,{}, {fontScale:1.5}, {autoWidth:true}]){layout.apply(element,'national-stage',slot,value);assert.equal(element.dataset.textAutoWidth,'1');}
  layout.apply(element,'national-stage',slot,{autoWidth:false});assert.equal(element.dataset.textAutoWidth,'0');
  layout.apply(element,'pixel',slot,{autoWidth:true});assert.equal(element.dataset.textAutoWidth,undefined);
 }
 for(const slot of ['p1-host-1','p3-board','p2-parents','p2-photo','p2-ticker','unknown'])assert.equal(layout.supports('national-stage',slot),false);
});
test('width mode and font scale survive incoming refresh and an in-flight save without losing a newer edit',()=>{
 const model=draft.create(),base={x:4,y:78,width:73,height:9,fontScale:1,visible:true,opacity:100};
 model.receive({'p2-info':base});model.change('p2-info',{...base,fontScale:1.5,autoWidth:true});
 const saving=model.snapshot();model.change('p2-info',{...base,fontScale:2,autoWidth:false});
 model.receive({'p2-info':base});assert.equal(model.values()['p2-info'].fontScale,2);
 model.saved(saving.values,saving);assert.equal(model.dirty(),true);assert.equal(model.values()['p2-info'].autoWidth,false);
 const final=model.snapshot();model.saved(final.values,final);assert.equal(model.dirty(),false);
 model.change('p2-info',null);assert.equal(model.values()['p2-info'],undefined);
});
test('P2 automatic text sizes follow the requested font scale without a second zoom or container font cap',()=>{
 const css=fs.readFileSync(require.resolve('../public/broadcast-national.css'),'utf8');
 const automaticBids=css.match(/\.live-bidders\[data-text-auto-width\] \.live-bid-row\{([^}]+)\}/)[1];
 assert.match(automaticBids,/font-size:calc\(44px \* var\(--layout-font-scale,1\)\)/);assert.doesNotMatch(automaticBids,/cqw|cqh|min\(/);
 assert.match(css,/:is\(\.item-copy,\.item-progress,\.price-card,\.sold-notice\)>\*\{zoom:1!important\}/);
 const autoInfo=css.match(/\.item-copy\.is-inline-info\[data-text-auto-width="1"\]\[data-layout-custom="1"\]\{([^}]+)\}/)[1];
 assert.match(autoInfo,/left:auto!important;right:calc\(100% - var\(--text-anchor-right,98%\)\)!important;width:max-content!important/);
 assert.doesNotMatch(autoInfo,/--layout-x|--layout-width/);
 assert.match(css,/\[data-text-auto-width="1"\]\[data-layout-custom="1"\]\{max-width:calc\(98% - var\(--layout-x\)\)!important/);
 const html=fs.readFileSync(require.resolve('../public/platform-layout-editor.html'),'utf8');
 assert.match(html,/id="font-number"[^>]+aria-label="글자 크기 백분율"/);
 assert.ok(html.indexOf('id="font-number"')<html.indexOf('id="width"'));
});
test('P2 right anchor reaches beyond the frame and left-handle resizing preserves that edge',()=>{
 const value={x:58,y:4,width:71.7,height:12.7,rightEdge:100};
 const moved=layout.move('national-stage','p2-info',value,2,1);
 assert.equal(moved.rightEdge,102);assert.equal(moved.x,58);assert.equal(moved.y,5);
 const larger=layout.resize('national-stage','p2-info',moved,-10,0);
 assert.equal(larger.width,81.7);assert.equal(larger.rightEdge,102);
 assert.equal(layout.rightEdge({rightEdge:130}),120);assert.equal(layout.rightEdge({rightEdge:-5}),4);assert.equal(layout.rightEdge({}),98);
 assert.equal(layout.move('pixel','p2-info',value,2,1).x,60);
 const props={},element={dataset:{},style:{setProperty:(k,v)=>props[k]=v,removeProperty:k=>delete props[k]}};
 layout.apply(element,'national-stage','p2-info',larger);assert.equal(props['--text-anchor-right'],'102%');
 layout.apply(element,'pixel','p2-info',larger);assert.equal(props['--text-anchor-right'],undefined);
});
test('right edge and automatic width survive server save/restart without affecting other slots or other rounds',async t=>{
 const {fixture}=require('../tools/national-settlement-fixture.cjs'),f=await fixture();t.after(()=>f.close());
 const value={x:58,y:0,width:71.7,height:12.7,fontScale:1.9,visible:true,opacity:100,autoWidth:true,rightEdge:102};
 const result=await f.request('PUT','/channels/national-cre/broadcast-state',{layoutPlacements:{'p2-info':value,'p2-photo':value}});
 assert.equal(result.status,200,result.body);assert.equal(result.json().state.layoutPlacements['p2-info'].rightEdge,102);assert.equal(result.json().state.layoutPlacements['p2-photo'].rightEdge,undefined);
 f.restart();const restored=await f.repository.getRecord('national-cre','broadcast','state');assert.equal(restored.layoutPlacements['p2-info'].rightEdge,102);assert.equal(restored.layoutPlacements['p2-info'].autoWidth,true);
 const limited=await f.request('PUT','/channels/national-cre/broadcast-state',{layoutPlacements:{'p2-info':{...value,rightEdge:500}}});assert.equal(limited.json().state.layoutPlacements['p2-info'].rightEdge,120);
});
