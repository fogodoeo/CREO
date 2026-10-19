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
 assert.match(autoInfo,/left:auto!important;right:2%!important;width:max-content!important;max-width:96%!important/);
 assert.doesNotMatch(autoInfo,/--layout-x|--layout-width/);
 assert.match(css,/\[data-text-auto-width="1"\]\[data-layout-custom="1"\]\{max-width:calc\(98% - var\(--layout-x\)\)!important/);
 const html=fs.readFileSync(require.resolve('../public/platform-layout-editor.html'),'utf8');
 assert.match(html,/id="font-number"[^>]+aria-label="글자 크기 백분율"/);
 assert.ok(html.indexOf('id="font-number"')<html.indexOf('id="width"'));
});
