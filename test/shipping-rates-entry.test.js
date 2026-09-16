'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
test('global shipping rates opens without a channel and returns to the protected operator home',()=>{
 const html=fs.readFileSync(require.resolve('../public/shipping-rates.html'),'utf8');
 for(const [search,url] of [['','/main'],['?channel=creyon-0917','shipping.html?channel=creyon-0917']]){
  const ctx=vm.createContext({URLSearchParams,location:{search,replace(){throw Error('must not redirect')}}});
  const source=html.slice(html.indexOf('const channel='),html.indexOf('const mobileRateHistory='));
  assert.equal(vm.runInContext(source+';returnUrl',ctx),url);
 }
 assert.match(html,/await CreoPlatform.verifyAdmin/);
 assert.match(html,/\$\('back-link'\)\.href=returnUrl/);
});

test('shipping screens read the current server table instead of the old Supabase copy',async()=>{
 const source=fs.readFileSync(require.resolve('../public/supabase-bridge.js'),'utf8'),calls=[];
 const context=vm.createContext({SHIPPING_RATE_CONFIG_KEYS:{'파르게':'shipping_rate_parge'},fetch:async url=>{calls.push(url);return {ok:true,json:async()=>({company:'파르게',payload:{source:'parge-public-api',data:{서울:[{shop:'현재 지점',cost:10000}]}}})}},_sbFetch(){throw Error('old store must not be read')}});
 const start=source.indexOf('async function _getShippingRateOverride('),end=source.indexOf('async function saveShippingRateData(',start);
 vm.runInContext(source.slice(start,end),context);
 assert.equal((await context._getShippingRateOverride('파르게')).data.서울[0].shop,'현재 지점');assert.equal(calls.length,1);assert.match(calls[0],/^\/api\/platform\/shipping-rates\?company=/);
});

test('dodosi refresh uses Creyon Daegu, not a different Daegu sender',async t=>{
 const {refreshShippingRate}=require('../shipping-rate-refresh'),original=global.fetch;
 t.after(()=>global.fetch=original);
 const option=(id,name)=>`selectRequireOption('prod', 1, 'origin', '${id}', '${name}',`;
 let selected=0,oldOnly=false;
 global.fetch=async(url,options={})=>{
  if(String(url).includes('shop_view'))return {ok:true,text:async()=>'{"prod_edit_time":"today"}'};
  const body=new URLSearchParams(options.body),origin=body.get('selected_require_options[0][value_code]'),one=body.get('selected_require_options[1][value_code]');
  let html;
  if(!origin)html=option('wrong','대구-렙타일아트')+(oldOnly?'':option('creyon','대구[서구]-크레용(대구)//맡기는날-화.토'));
  else {assert.equal(origin,'creyon');selected++;html=one?[1,2].map(n=>option('destination'+n,`서울-수령점${n}//찾는날-수`)+`<strong>10,000원</strong>`).join(''):option('one','1마리');}
  return {ok:true,json:async()=>({option_html:html})};
 };
 const result=await refreshShippingRate('도도시',{force:true});assert.equal(result.count,28);assert.equal(selected,28);
 oldOnly=true;await assert.rejects(refreshShippingRate('도도시',{force:true}),/크레용 대구 출발지/);
});
