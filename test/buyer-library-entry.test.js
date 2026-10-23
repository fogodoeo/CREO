'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),crypto=require('node:crypto');
const {parseHTML}=require('linkedom'),Checkout=require('../public/checkout-client');
const html=fs.readFileSync(require.resolve('../public/buyer-library.html'),'utf8'),source=fs.readFileSync(require.resolve('../public/buyer-library.js'),'utf8');
const tick=()=>new Promise(resolve=>setImmediate(resolve));
async function until(check){for(let i=0;i<50;i++){if(check())return;await tick();}assert.ok(check(),'expected UI state');}
const round=key=>({key,name:key==='old'?'2026-10-19 경기편':'2026-10-21 전라·충청편',available:true});
const detail=(key='old',multiple=false)=>({channel:{name:'전국크레자랑',status:'active'},round:round(key),rounds:multiple?[round('old'),round('next')]:[round(key)],items:[{id:key,name:key==='old'?'A01':'B01',vendorName:'가상 업체',soldAmount:100000}]});
async function fixture({hash='',authenticated=true,canLink=true}={}){
 const {document,window:domWindow}=parseHTML(html),events=new EventTarget(),timers=new Map(),calls=[];let timerId=0,focus='',linked=false,handler=null;
 const $=id=>document.getElementById(id);
 Object.defineProperty(domWindow.HTMLElement.prototype,'focus',{configurable:true,value:function(){focus=this.id||this.dataset?.event||'';}});
 Object.defineProperty(domWindow.HTMLSelectElement.prototype,'value',{configurable:true,get(){return this.getAttribute('data-current')||'';},set(value){this.setAttribute('data-current',value);}});
 const dialog=$('connect-dialog');dialog.showModal=()=>{dialog.open=true;};dialog.close=()=>{dialog.open=false;dialog.dispatchEvent(new domWindow.Event('close'));};
 document.hidden=false;
 const normal=path=>path==='buyer-account/session'?{authenticated,available:true,canLink,csrfToken:'isolated-csrf',phoneLast4:'0003'}:path==='buyer-collection'?{revision:linked?1:0,records:linked?[{id:'grant',channelName:'전국크레자랑',roundName:'2026-10-19 경기편',itemCount:1,available:true}]:[],nextOffset:null}:path==='buyer-collection/preview'?{id:'grant',channel:{name:'전국크레자랑'},round:round('old'),itemCount:1,amount:100000}:path==='buyer-collection/connect'?(linked=true,{id:'grant',revision:1}):path.startsWith('buyer-collection/grant?')?detail(path.includes('round=next')?'next':'old',true):path==='buyer-account/logout'?(authenticated=false,{}):{};
 const response=(data,status=200)=>({ok:status<400,status,json:async()=>data});
 const context=vm.createContext({document,window:{addEventListener:events.addEventListener.bind(events),scrollTo(){}},location:{origin:'https://example.test',pathname:'/buyer-library.html',search:'',hash,replace(){}},history:{replaceState(){}},URL,URLSearchParams,AbortController,TextEncoder,crypto:crypto.webcrypto,setTimeout:fn=>{timers.set(++timerId,fn);return timerId;},clearTimeout:id=>timers.delete(id),localStorage:{setItem(){}},CreoCheckoutClient:Checkout,CreoBuyerKakaoLogin:{create:()=>({configure(){}})},CreoCheckoutInquiry:{create:()=>({clear(){}}),contact:()=>null},CreoCheckoutItemView:{createViewer:()=>({clear(){}}),pictures:()=>[],traitSummary:()=>'',parentDetails:()=>[],itemTitle:item=>item.name},fetch:async(url,options)=>{const path=url.replace('/api/platform/',''),call={path,body:options.body&&JSON.parse(options.body),signal:options.signal};calls.push(call);return handler?handler(call,normal,response):response(normal(path));}});
 vm.runInContext(source,context);await until(()=>$('loading').hidden);
 return {document,$,dialog,calls,timers,normal,response,get focus(){return focus;},get linked(){return linked;},set linked(v){linked=v;},set handler(value){handler=value;},dispatch:type=>events.dispatchEvent(new Event(type)),submit:()=> $('connect-form').onsubmit({preventDefault(){}})};
}

test('login return path uses only a validated incoming link, and an empty library explains the next action',async()=>{
 const f=await fixture({hash:'#link=synthetic-link',authenticated:false});
 assert.equal(f.$('login').hidden,false);assert.equal(f.$('return-checkout').getAttribute('href'),'/d/synthetic-link');assert.equal(f.$('login-link').value,'synthetic-link');
 const invalid=await fixture({hash:'#link=evil/route',authenticated:false});assert.equal(invalid.$('return-checkout').hidden,true);assert.equal(invalid.$('return-checkout').getAttribute('href'),null);
 const empty=await fixture();assert.equal(empty.$('empty').hidden,false);assert.match(empty.$('empty').textContent,/카톡으로 받은 낙찰 안내 링크/);
 const noPhone=await fixture({canLink:false});assert.equal(noPhone.$('open-connect').disabled,true);assert.equal(noPhone.$('open-connect').hidden,true);assert.equal(noPhone.$('phone-relogin').hidden,false);assert.equal(noPhone.$('empty').hidden,true);
});

test('first focus on a signed-out login button does not reset the form before its submit gesture',async()=>{
 const f=await fixture({hash:'#link=synthetic-link',authenticated:false}),before=f.calls.length;
 f.dispatch('focus');await tick();assert.equal(f.calls.length,before);assert.equal(f.$('login').hidden,false);assert.equal(f.$('login-link').value,'synthetic-link');
});

test('link validation stays beside the field, preview is read-only, and successful connection opens its exact details',async()=>{
 const f=await fixture();f.$('open-connect').onclick();f.$('link-input').value='https://unrelated.test/d/synthetic-link';await f.submit();
 assert.equal(f.focus,'link-input');assert.equal(f.$('link-input').getAttribute('aria-invalid'),'true');assert.equal(f.calls.filter(c=>c.path.includes('/preview')).length,0);
 f.$('link-input').value='https://example.test/d/synthetic-link';f.$('link-input').oninput();await f.submit();
 assert.equal(f.$('link-input').getAttribute('aria-invalid'),null);assert.equal(f.linked,false);assert.equal(f.focus,'connection-preview');assert.match(f.$('connection-preview').textContent,/2026-10-19 경기편/);assert.equal(f.$('connect-submit').textContent,'보관함에 추가');
 await f.submit();assert.equal(f.linked,true);assert.equal(f.dialog.open,false);assert.equal(f.$('detail').hidden,false);assert.match(f.$('items').textContent,/A01/);assert.equal(f.focus,'event-title');
 assert.equal(f.calls.filter(c=>c.path==='buyer-collection/connect').length,1);assert.equal(f.$('return-checkout').hidden,true);
});

test('a lost connect response retries the same receipt and blocks duplicate submits and closing while pending',async()=>{
 const f=await fixture({hash:'#link=synthetic-link'});await f.submit();let release,attempts=0;
 f.handler=async(call,normal,response)=>{if(call.path==='buyer-collection/connect'){attempts++;if(attempts===1){normal(call.path);await new Promise(r=>release=r);return response({error:'응답을 받지 못했어요. 다시 시도해 주세요.'},503);}}return response(normal(call.path));};
 const pending=f.submit();assert.equal(f.$('close-connect').disabled,true);assert.equal(f.$('link-input').readOnly,true);await f.submit();assert.equal(attempts,1);
 const cancel=new f.document.defaultView.Event('cancel',{cancelable:true});f.dialog.dispatchEvent(cancel);assert.equal(cancel.defaultPrevented,true);release();await pending;
 assert.equal(f.dialog.open,true);assert.equal(f.focus,'connect-error');assert.equal(f.$('link-input').value,'https://example.test/d/synthetic-link');await f.submit();
 const requests=f.calls.filter(c=>c.path==='buyer-collection/connect');assert.equal(requests.length,2);assert.equal(requests[0].body.requestId,requests[1].body.requestId);assert.equal(f.dialog.open,false);
});

test('a successful connection followed by a read failure has a read-only retry and does not ask to add again',async()=>{
 const f=await fixture({hash:'#link=synthetic-link'});await f.submit();let failed=false;
 f.handler=async(call,normal,response)=>{if(call.path==='buyer-collection'&&f.linked&&!failed){failed=true;return response({error:'offline'},503);}return response(normal(call.path));};
 await f.submit();assert.equal(f.dialog.open,false);assert.match(f.$('error').textContent,/보관함에 추가했어요/);assert.equal(f.$('retry').hidden,false);assert.equal(f.focus,'error');
 await f.$('retry').onclick();assert.equal(f.$('detail').hidden,false);assert.equal(f.calls.filter(c=>c.path==='buyer-collection/connect').length,1);
});

test('round loading and failed reads preserve prior content, retry the requested round, and return focus to the originating row',async()=>{
 const f=await fixture();f.linked=true;await f.$('refresh').onclick();await f.$('events').querySelector('button').onclick();let release,fail=true;
 f.handler=async(call,normal,response)=>{if(call.path.includes('round=next')&&fail){await new Promise(r=>release=r);return response({error:'다시 시도해 주세요.'},503);}return response(normal(call.path));};
 f.$('library-round').value='next';const pending=f.$('library-round').onchange();assert.equal(f.$('work-status').hidden,false);assert.equal(f.$('library-round').disabled,true);release();await pending;await until(()=>!f.$('retry').hidden);
 assert.match(f.$('items').textContent,/A01/);assert.equal(f.$('library-round').value,'old');fail=false;await f.$('retry').onclick();assert.match(f.$('items').textContent,/B01/);assert.doesNotMatch(f.$('items').textContent,/A01/);
 f.$('back').onclick();assert.equal(f.focus,'grant');assert.equal(f.$('detail').hidden,true);
});

test('a stalled read times out with a recoverable error and releases its controls',async()=>{
 const f=await fixture();f.handler=call=>new Promise((resolve,reject)=>call.signal.addEventListener('abort',()=>reject(Object.assign(Error('abort'),{name:'AbortError'}))));
 const pending=f.$('refresh').onclick();assert.equal(f.$('refresh').disabled,true);for(const callback of f.timers.values())callback();await pending;
 assert.equal(f.$('refresh').disabled,false);assert.match(f.$('error').textContent,/연결이 늦어지고/);assert.equal(f.$('retry').hidden,false);assert.equal(f.timers.size,0);
 f.handler=null;await f.$('retry').onclick();assert.equal(f.$('error').hidden,true);
});

test('sign-out invalidates a pending detail response, clears the return link and never renders the prior private items',async()=>{
 const f=await fixture();f.linked=true;await f.$('refresh').onclick();let release;
 f.handler=async(call,normal,response)=>{if(call.path.startsWith('buyer-collection/grant?')){await new Promise(r=>release=r);return response(detail());}return response(normal(call.path));};
 const pending=f.$('events').querySelector('button').onclick();await f.$('logout').onclick();release();await pending;
 assert.equal(f.$('detail').hidden,true);assert.equal(f.$('items').textContent,'');assert.equal(f.$('return-checkout').hidden,true);assert.equal(f.$('error').hidden,true);
});
