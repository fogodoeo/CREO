'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm');
const {previewScreen}=require('../tools/pinball-preview.cjs');

test('broadcast preview fits small, short and portrait windows without cropping and responds to resizing',()=>{
 const html=previewScreen(1920,1080,'/roulette/?broadcast=1&theme=national');
 const script=html.match(/<script>([\s\S]+)<\/script>/)[1];
 const frame={style:{}},stage={style:{}};
 let resize;
 const context=vm.createContext({
  innerWidth:1280,innerHeight:720,
  document:{querySelector:selector=>selector==='iframe'?frame:stage},
  addEventListener:(name,callback)=>{if(name==='resize')resize=callback;},
 });
 vm.runInContext(script,context);
 assert.equal(stage.style.width,'1280px');
 assert.equal(stage.style.height,'720px');
 for(const [width,height] of [[320,568],[1024,600],[2560,1440],[360,800],[1920,1080]]){
  context.innerWidth=width;context.innerHeight=height;resize();
  const w=parseFloat(stage.style.width),h=parseFloat(stage.style.height);
  assert(w<=width && h<=height,'entire broadcast stays inside the visible window');
  assert(Math.abs(w/h-16/9)<1e-10,'broadcast aspect ratio is preserved');
  assert(w<=1920 && h<=1080,'preview does not upscale beyond its source');
 }
});
