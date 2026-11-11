'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs'),{parseHTML}=require('linkedom');
const source=fs.readFileSync(require.resolve('../public/vendor-access.js'),'utf8');
function page({linked=false,failed=false}={}){
 const {document}=parseHTML(fs.readFileSync(require.resolve('../public/vendor-access.html'),'utf8'));
 const calls=[],state={available:true,authenticated:true,phone:'01000000001',companies:[],requests:[],regions:['서울·인천','경기'],participations:linked?[{channelId:'clab-new',vendorId:'v'}]:[]};
 const context={document,URLSearchParams,AbortSignal,crypto:require('node:crypto'),location:{search:'',href:''},sessionStorage:{getItem(){return ''},setItem(){},removeItem(){}},window:{scrollTo(){},CreoVendorWork:require('../public/vendor-work-model')},fetch:async(url,options)=>{
  const route=url.split('/vendor-access/')[1];calls.push({route,method:options.method});
  if(failed&&route==='auctions')throw TypeError('offline');
  const data=route==='session'?state:route==='auctions'?{auctions:[{id:'clab-new',name:'씨랩',kind:'channel'},{id:'national-cre',name:'전국크레자랑',kind:'national'}]}:route.startsWith('auction-companies')?{companies:[{id:'v',name:'크레하니',canConnect:true}]}:route==='work'?{now:'2026-11-11T00:00:00Z',rows:[]}:{companies:[]};
  return {ok:true,json:async()=>data};
 }};
 context.setInterval=()=>0;
 vm.runInNewContext(source.slice(0,source.indexOf(" $('close-editor').onclick="))+"globalThis.ui={enter,go,selectAuction,openAuctions};})();",context);
 return {document,calls,context,ui:context.ui};
}
test('first login selects auction before any regional directory; C-LAB never shows national promo or region',async()=>{
 const f=page();await f.ui.enter();
 assert.equal(f.document.querySelector('h1').textContent,'참가할 경매 선택');assert.equal(f.document.querySelector('.promo-library-entry').hidden,true);assert.equal(f.document.querySelector('#directory-region'),null);
 await f.ui.selectAuction('clab-new');assert.equal(f.document.querySelector('h1').textContent,'업체 선택');assert.equal(f.document.querySelector('#directory-region'),null);assert.equal(f.document.querySelector('.promo-library-entry').hidden,true);
 await f.ui.selectAuction('national-cre');assert.ok(f.document.querySelector('#directory-region'));assert.equal(f.document.querySelector('.promo-library-entry').hidden,false);
 assert.ok(f.calls.every(c=>c.method==='GET'),'selection alone must not grant membership');
});
test('known participation still lands on work and a failed auction read shows retry rather than an empty list',async()=>{
 const f=page({linked:true});await f.ui.enter();assert.equal(f.document.querySelector('h1').textContent,'내 경매');assert.ok(f.document.querySelector('#work-auctions'));assert.equal(f.document.querySelector('.promo-library-entry').hidden,true);
 const broken=page({failed:true});await assert.rejects(broken.ui.enter(),/offline/);assert.ok(broken.document.querySelector('#reload-auctions'));assert.match(broken.document.querySelector('h1').textContent,/불러오지 못/);
});
