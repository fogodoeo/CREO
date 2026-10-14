'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
const layout=require('../public/broadcast-text-layout'),draft=require('../public/studio-layout-draft');
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
 assert.match(css,/\.item-copy\.is-inline-info\[data-text-auto-width="1"\]\{width:max-content!important/);
 assert.match(css,/\[data-text-auto-width="1"\]\[data-layout-custom="1"\]\{max-width:calc\(98% - var\(--layout-x\)\)!important/);
 const html=fs.readFileSync(require.resolve('../public/platform-layout-editor.html'),'utf8');
 assert.match(html,/id="font-number"[^>]+aria-label="글자 크기 백분율"/);
 assert.ok(html.indexOf('id="font-number"')<html.indexOf('id="width"'));
});
