'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),{parseHTML}=require('linkedom');
const View=require('../public/checkout-item-view'),Intake=require('../public/entry-intake'),Labels=require('../public/entry-label-print');
const html=fs.readFileSync(require.resolve('../public/vendor-entry-review.html'),'utf8'),script=fs.readFileSync(require.resolve('../public/vendor-entry-review.js'),'utf8');
const tick=()=>new Promise(setImmediate),esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
async function page({channel='national-cre',status='submitted',parents=true,groups=[],approved=false}={}){
 const {document,window:dom}=parseHTML(html),calls=[],views=[];let active=null,fail=false,seq=0;
 Object.defineProperty(document,'activeElement',{get:()=>active});dom.HTMLElement.prototype.focus=function(){active=this};
 for(const el of document.querySelectorAll('select'))Object.defineProperty(el,'value',{value:el.id==='batch-part'?'1부':'',writable:true});
 for(const el of document.querySelectorAll('dialog')){el.showModal=()=>{el.open=true};el.close=()=>{el.open=false;el.dispatchEvent(new dom.Event('close'))};}
 const facts={morph:'릴리화이트 <테스트>',sex:'female',weight:'20',hatchDate:'2026-08-23',sireId:parents?'sire':'',note:'비고 전체 내용 <img onerror=alert(1)>',media:[{url:'/offspring.svg',thumbnailUrl:'/offspring.svg'}],parents:parents?[{role:'dam',name:'가상 모개체',media:[]}]:[]};
 const entry={id:'entry1',entryNumber:1,code:'개체 1',version:1,status,broadcastDate:channel==='national-cre'?'2026-10-21':'',...(status==='draft'?facts:{submission:facts}),...(approved?{approved:facts,itemId:'item1',lot:'A12'}:{})};
 const data={channel:{id:channel,name:channel==='national-cre'?'전국크레자랑':'씨랩',status:'active',groups},policy:{open:true},auctionTarget:{date:entry.broadcastDate,channelId:channel,writable:true,prepared:true},allocation:approved?[{id:'item1',code:'A12',order:12,startPrice:10000}]:[],groups:[{vendor:{id:'v1',name:'가상 업체'},entries:[entry],parents:parents?[{id:'sire',name:'가상 부개체 <이름>',photoId:'photo1'}]:[],media:parents?[{id:'photo1',url:'/sire.svg',thumbnailUrl:'/sire.svg'}]:[]}]};
 const client={escapeHtml:esc,verifyAdmin:async()=>true,api:async(route,options)=>{if(route.startsWith('channels?'))return{channels:[{...data.channel,dataAdapter:'platform'}]};if(options){calls.push({route,body:JSON.parse(options.body)});if(fail)throw Object.assign(Error('연결 실패. 다시 등록해 주세요.'),{status:503});entry.status='approved';entry.version++;return{itemId:'item1'};}return structuredClone(data)}};
 const query='?channel='+channel+(channel==='national-cre'?'&broadcastDate=2026-10-21':'')+(status!=='submitted'?'&status='+status:'');
 const context={document,window:{CreoPlatform:client,CreoEntryIntake:Intake,CreoEntryNumbering:require('../public/entry-numbering'),CreoEntryLabelPrint:{...Labels,create:()=>({open(){}})},CreoCheckoutItemView:{...View,createViewer:()=>({isOpen:()=>false,open:(...args)=>views.push(args)})},addEventListener(){}},location:{search:query,href:'https://test.local/vendor-entry-review.html'+query,origin:'https://test.local'},history:{replaceState(){}},URL,URLSearchParams,crypto:{randomUUID:()=> 'request-0000000'+(++seq)}};
 vm.runInNewContext(script,context);await tick();const $=id=>document.getElementById(id);
 return{document,dom,$,calls,views,data,entry,fail:v=>fail=v,open(){const button=$('entry-list').querySelector('[data-entry]');$('entry-list').onclick({target:button});},input(id,value){$(id).value=value;$(id).dispatchEvent(new dom.Event('input',{bubbles:true}));},submit:()=>$('review-form').onsubmit({preventDefault(){}})};
}
test('list identifies the morph and parents without notes; detail retains complete escaped notes and photos',async()=>{
 const s=await page();assert.match(s.$('entry-list').textContent,/개체 1 · 릴리화이트 <테스트>/);assert.match(s.$('entry-list').textContent,/암컷 · 20g · 출생 2026-08-23/);assert.match(s.$('entry-list').textContent,/부모사진 1\/2/);assert.doesNotMatch(s.$('entry-list').textContent,/비고 전체 내용/);assert.equal(s.$('entry-list').querySelector('[onerror]'),null);
 s.open();assert.match(s.$('entry-information').textContent,/부개체가상 부개체 <이름>사진 등록됨/);assert.match(s.$('entry-information').textContent,/모개체가상 모개체사진 미등록/);
 const note=s.$('entry-information').querySelector('details');assert.equal(note.hasAttribute('open'),false);assert.match(note.textContent,/비고 전체 내용 <img onerror=alert\(1\)>/);assert.equal(note.querySelector('img'),null);
 assert.equal(s.$('entry-information').querySelectorAll('button[data-photo]').length,2);s.$('entry-information').querySelector('button[aria-label^="부개체"]').onclick();assert.equal(s.views[0][2].group,'부');
});
test('missing parent information stays visible and does not make optional parent photos a submission requirement',async()=>{
 const s=await page({parents:false});s.open();assert.match(s.$('entry-information').textContent,/부개체이름 미등록사진 미등록/);assert.match(s.$('entry-information').textContent,/모개체이름 미등록사진 미등록/);
 assert.equal(s.$('allocation-fields').open,false);assert.match(s.$('allocation-summary').textContent,/1부 A01 · 1번째 · 시작가 0원/);await s.submit();assert.equal(s.calls.length,1);assert.equal(s.calls[0].body.broadcastDate,'2026-10-21');assert.equal(s.calls[0].body.lot,'1부 A01');assert.equal(s.$('review-dialog').open,false);
});
test('invalid hidden settings expand and focus the exact field; summary follows corrected values',async()=>{
 const s=await page();s.open();s.input('lot-order','0');await s.submit();assert.equal(s.$('allocation-fields').open,true);assert.equal(s.document.activeElement.id,'lot-order');assert.equal(s.$('lot-order').getAttribute('aria-invalid'),'true');assert.equal(s.calls.length,0);
 s.input('lot-order','5');s.input('lot-price','10000');assert.match(s.$('allocation-summary').textContent,/5번째 · 시작가 10,000원/);assert.equal(s.$('review-target').textContent,s.$('allocation-summary').textContent);await s.submit();assert.equal(s.calls[0].body.order,5);assert.equal(s.calls[0].body.startPrice,10000);
});
test('failed approval preserves input and request identity, focuses recovery, and retry sends the same command once',async()=>{
 const s=await page();s.open();s.input('lot-code','A07');s.input('lot-order','7');s.fail(true);await s.submit();assert.equal(s.$('review-dialog').open,true);assert.equal(s.document.activeElement.id,'review-error');assert.equal(s.$('lot-code').value,'A07');assert.equal(s.$('confirm-review').disabled,false);
 s.fail(false);await s.submit();assert.deepEqual(s.calls[0],s.calls[1]);assert.equal(s.$('review-dialog').open,false);
});
test('CLAB review retains its own channel, group and code; change requests send reasons without assignment fields',async()=>{
 const s=await page({channel:'clab-test',groups:[{id:'blue',name:'청팀'}]});s.open();s.$('allocation-fields').open=true;s.input('lot-code','B03');s.$('lot-group').value='blue';await s.submit();assert.equal(s.calls[0].route,'channels/clab-test/entries/review');assert.equal(s.calls[0].body.groupId,'blue');assert.equal(s.calls[0].body.lot,'B03');assert.equal(s.calls[0].body.broadcastDate,undefined);
 const change=await page({channel:'clab-test'});change.open();change.$('change-review-mode').onclick();assert.equal(change.$('allocation-fields').hidden,true);change.input('review-reason','체중을 확인해 주세요');await change.submit();assert.equal(change.calls[0].body.type,'request-changes');assert.equal(change.calls[0].body.reason,'체중을 확인해 주세요');assert.equal(change.calls[0].body.lot,undefined);
});
test('returning from a change request focuses the visible settings summary rather than a collapsed input',async()=>{
 const s=await page();s.open();s.$('change-review-mode').onclick();assert.equal(s.$('review-target').hidden,true);assert.equal(s.document.activeElement.id,'review-reason');
 s.$('change-review-mode').onclick();assert.equal(s.$('allocation-fields').open,false);assert.equal(s.$('review-target').hidden,false);assert.equal(s.document.activeElement,s.$('allocation-fields').querySelector('summary'));
});
test('draft details remain read-only and an approved entry change keeps its existing identity and price',async()=>{
 const draft=await page({status:'draft'});draft.open();assert.equal(draft.$('review-actions').hidden,true);assert.equal(draft.$('review-form').hidden,true);assert.match(draft.$('entry-information').textContent,/릴리화이트/);
 const revision=await page({approved:true});revision.open();assert.equal(revision.$('confirm-review').textContent,'변경안 반영');assert.match(revision.$('allocation-summary').textContent,/A12 · 12번째 · 시작가 10,000원/);await revision.submit();assert.equal(revision.calls[0].body.lot,'A12');assert.equal(revision.calls[0].body.order,12);assert.equal(revision.calls[0].body.startPrice,10000);
});
