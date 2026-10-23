'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),{parseHTML}=require('linkedom');
const html=fs.readFileSync(require.resolve('../public/checkout-changes.html'),'utf8'),script=html.match(/<script>\s*('use strict';[\s\S]*?)<\/script>/)[1];
const settled=()=>new Promise(r=>setImmediate(r));
async function page({login=true,path='/w/ds_0123456789abcdef',search='',changes=[]}={}){
 const {document,window:domWindow}=parseHTML(html),calls=[],messages=[];let signedIn=login,fail=false,allowRefresh=true;
 const record={id:'c1',state:'pending',buyerName:'가상 낙찰자',phone:'01000000003',query:'전북',round:{name:'10/14 서울·인천'}};
 const client={verifyAdmin:async()=>signedIn,api:async(route,options)=>{calls.push({route,options});if(fail)throw Error('연결 실패');if(route.startsWith('carrier-request-link'))return{channelId:'national-cre',id:'c1'};if(route.includes('carrier-requests'))return{archiveId:'old-round',records:[record]};return{archiveId:'old-round',records:changes};}};
 const window={CreoPlatform:client,parent:{postMessage:(data,origin)=>messages.push({data,origin})},addEventListener(){}};
 const context=vm.createContext({window,document,location:{pathname:path,search,origin:'https://creo.test'},URLSearchParams,CreoCarrierRequestReview:require('../public/carrier-request-review'),CreoCheckoutChangeReview:require('../public/checkout-change-review'),confirm:()=>allowRefresh});
 vm.runInContext(script,context);await settled();
 return{context,document,domWindow,calls,messages,login:v=>signedIn=v,fail:v=>fail=v,allowRefresh:v=>allowRefresh=v,$:id=>document.getElementById(id)};
}
test('SMS approval link requires login, opens the precise archived round and exposes no other pending rounds',async()=>{
 const s=await page({login:false});assert.equal(s.$('login').hidden,false);assert.equal(s.calls.length,0);
 s.login(true);await s.$('login').onsubmit({preventDefault(){}});
 assert.equal(s.$('login').hidden,true);assert.deepEqual(s.calls.map(c=>c.route),['carrier-request-link?code=ds_0123456789abcdef','channels/national-cre/carrier-requests?recordId=c1','channels/national-cre/checkout-changes?archive=old-round']);
 assert.equal(s.$('back').getAttribute('href'),'/shipping.html?channel=national-cre&archive=old-round');assert.match(s.$('carrier-requests').textContent,/가상 낙찰자/);
 s.login(false);await s.context.load();assert.equal(s.$('carrier-requests').hidden,true);assert.equal(s.$('carrier-requests').textContent,'');assert.equal(s.$('list').textContent,'');
});
test('review locks page refresh and carrier decisions; successful review makes no follow-up read',async()=>{
 const s=await page({path:'/checkout-changes.html',search:'?channel=national-cre',changes:[{id:'change1',state:'pending',buyerName:'가상',before:{},after:{}}]});
 const client=s.context.window.CreoPlatform,original=client.api;let release,posts=0;
 client.api=async(route,options)=>{if(options?.method==='POST'){posts++;return new Promise(resolve=>release=resolve)}return original(route,options)};
 const row=s.$('list').querySelector('article');row.querySelector('[data-unpaid]').checked=true;
 const pending=row.querySelector('[data-change-action="approve"]').onclick();assert.equal(posts,1);assert.equal(s.$('reload-requests').disabled,true);assert.equal(s.$('carrier-requests').inert,true);
 const reads=s.calls.length;await s.$('reload-requests').onclick();await s.context.load();await s.$('carrier-requests').querySelector('[data-carrier-action="approve"]').onclick();assert.equal(posts,1);assert.equal(s.calls.length,reads);
 release({record:{id:'change1',state:'approved'}});await pending;assert.equal(s.calls.length,reads);assert.equal(s.$('reload-requests').disabled,false);assert.equal(s.$('carrier-requests').inert,false);
});
test('refresh in flight prevents a decision against the previous view and duplicate refresh',async()=>{
 const s=await page({path:'/checkout-changes.html',search:'?channel=national-cre',changes:[{id:'change1',state:'pending',buyerName:'가상',before:{},after:{}}]});
 const client=s.context.window.CreoPlatform,original=client.api;let release;
 client.api=async(route,options)=>route.includes('checkout-changes')?new Promise(resolve=>release=resolve):original(route,options);
 const loading=s.context.load();await settled();assert.equal(s.$('list').inert,true);assert.equal(s.$('carrier-requests').inert,true);
 const before=s.calls.length;await s.context.load();await s.$('list').querySelector('[data-change-action="approve"]').onclick();assert.equal(s.calls.length,before);
 release({records:[],archiveId:'old-round'});await loading;assert.equal(s.$('list').inert,false);assert.match(s.$('list').textContent,/확인할 변경 요청이 없어요/);
});
test('standalone refresh can be cancelled for a draft and failed reads retain a usable retry',async()=>{
 const s=await page({path:'/checkout-changes.html',search:'?channel=national-cre&archive=old-round'});
 assert.deepEqual(s.calls.map(c=>c.route),['channels/national-cre/checkout-changes?archive=old-round','channels/national-cre/carrier-requests?archive=old-round']);
 const input=s.$('carrier-requests').querySelector('textarea');input.value='작성 중';input.dispatchEvent(new s.domWindow.Event('input',{bubbles:true}));assert.equal(s.messages.at(-1).data.dirty,true);
 s.allowRefresh(false);const count=s.calls.length;await s.$('reload-requests').onclick();assert.equal(s.calls.length,count);assert.equal(input.value,'작성 중');
 s.allowRefresh(true);s.fail(true);await s.$('reload-requests').onclick();assert.match(s.$('notice').textContent,/다시 시도/);assert.equal(s.$('reload-requests').disabled,false);assert.equal(input.value,'작성 중');
 s.fail(false);await s.$('reload-requests').onclick();assert.match(s.$('notice').textContent,/최신 요청/);assert.equal(s.$('carrier-requests').querySelector('textarea').value,'작성 중');
});
