'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const {parseHTML}=require('linkedom');
const html=fs.readFileSync(path.join(__dirname,'../public/shipping.html'),'utf8');
function functionSource(name,next){return html.slice(html.indexOf('function '+name+'('),html.indexOf('function '+next+'('));}
test('buyer cards are native keyboard buttons and treat winner names as text',()=>{
 const {document}=parseHTML('<html><body><main></main></body></html>'),container=document.querySelector('main');let opened;
 const from=html.indexOf("const card = document.createElement("),to=html.indexOf('container.appendChild(card);',from)+'container.appendChild(card);'.length;
 vm.runInNewContext(html.slice(from,to),{document,container,winnerKey:'isolated-key',winnerName:'<img src=x onerror=alert(1)>',state:{phone:'01000000000'},fmtPhone:x=>x,openWinnerEditor:key=>opened=key,CreoPlatform:{escapeHtml:x=>x.replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;')},combinedBadge:'',geckoTagsHtml:'A01',shipSummaryStyle:'',shipSummaryText:'수령지 선택 필요',statusClass:'status-waiting',statusLabel:'입력 대기',grandTotal:100000,groupItems:[]});
 const card=container.firstElementChild;assert.equal(card.tagName,'BUTTON');assert.equal(card.type,'button');assert.equal(card.querySelector('img'),null);assert.match(card.textContent,/<img src=x onerror=alert\(1\)>/);card.click();assert.equal(opened,'isolated-key');assert.equal(card.getAttribute('aria-controls'),'winner-edit-modal');
});
test('shipping form names are bound and the breakdown button tracks visibility without smooth reduced-motion scrolling',()=>{
 const {document}=parseHTML(html);for(const id of ['editor-memo','editor-custom-company','editor-custom-region','shipping-admin-password'])assert.ok(document.querySelector('label[for="'+id+'"]'));
 const button=document.getElementById('btn-toggle-breakdown'),section=document.getElementById('editor-shipping-breakdown');assert.equal(button.tagName,'BUTTON');let scroll;
 section.scrollIntoView=options=>scroll=options;
 const context=vm.createContext({document,shippingScrollBehavior:()=> 'auto'});vm.runInContext(functionSource('toggleShippingBreakdown','renderEditorShippingBreakdown'),context);
 vm.runInContext('toggleShippingBreakdown()',context);assert.equal(button.getAttribute('aria-expanded'),'true');assert.equal(section.style.display,'block');assert.equal(scroll.behavior,'auto');
 vm.runInContext('toggleShippingBreakdown()',context);assert.equal(button.getAttribute('aria-expanded'),'false');assert.equal(section.style.display,'none');
});
test('closing the editor clears selection and restores focus without saving',()=>{
 const {document}=parseHTML(html),card=document.createElement('button');card.className='winner-card is-selected';card.dataset.winner='isolated-key';card.setAttribute('aria-expanded','true');document.body.append(card);let focused=false,historyClosed='';card.focus=()=>focused=true;
 const context=vm.createContext({document,activeEditorWinner:'isolated-key',closeMobileShippingView:name=>historyClosed=name});vm.runInContext(functionSource('closeWinnerEditor','syncEditorHubClearButton'),context);vm.runInContext('closeWinnerEditor()',context);
 assert.equal(focused,true);assert.equal(card.getAttribute('aria-expanded'),'false');assert.equal(document.getElementById('winner-edit-modal').style.display,'none');assert.equal(context.activeEditorWinner,null);assert.equal(historyClosed,'editor');
});
test('company names containing quotes and markup remain literal selectable labels',()=>{
 const {document}=parseHTML(html),company='O\'Brien "샵" <img src=x> & 크레';let selected='';
 const context={document,uniqueSellerCompanies:[company],localStorage:{getItem:()=>null},SHIPPING_COMPANY_STORAGE_KEY:'isolated',activeSellerCompany:'',tempSelectedCompany:'',updateConfirmButtonState(){},updateCurrentCompanyBar(){},clickModalCompanyItem:name=>selected=name};
 vm.runInNewContext(functionSource('populateCompanySelect','clickModalCompanyItem')+'\npopulateCompanySelect();',context);
 const button=document.querySelector('.company-select-item');assert.equal(button.getAttribute('onclick'),null);assert.equal(button.querySelector('img'),null);assert.equal(button.textContent.trim(),company);assert.equal(button.dataset.co,company);button.click();assert.equal(selected,company);
});
test('company selection uses a modal dialog and closes its mobile history once on cancellation',()=>{
 const {document,Event}=parseHTML(html),modal=document.getElementById('company-select-modal');assert.equal(modal.tagName,'DIALOG');assert.equal(modal.getAttribute('aria-labelledby'),'shipping-company-dialog-title');
 const company=document.createElement('button');company.className='company-select-item active';company.dataset.co='가상 업체';company.setAttribute('aria-pressed','true');document.getElementById('modal-company-list').append(company);
 let opened=0,closed=0,focused=0,pushed=0,popped=0;modal.open=false;modal.showModal=()=>{modal.open=true;opened++};modal.close=()=>{modal.open=false;closed++};company.focus=()=>focused++;
 const context=vm.createContext({document,tempSelectedCompany:'가상 업체',updateConfirmButtonState(){},pushMobileShippingView:()=>pushed++,closeMobileShippingView:()=>popped++});
 vm.runInContext(functionSource('openCompanySelectModal','onCompanySelectChange'),context);context.openCompanySelectModal();context.openCompanySelectModal();assert.equal(opened,1);assert.equal(pushed,1);assert.equal(focused,1);assert.equal(company.getAttribute('aria-pressed'),'false');assert.equal(context.tempSelectedCompany,'');
 const cancel=new Event('cancel',{cancelable:true});modal.dispatchEvent(cancel);assert.equal(cancel.defaultPrevented,true);assert.equal(closed,1);assert.equal(popped,1);assert.equal(modal.open,false);assert.equal(modal.style.display,'none');context.closeCompanySelectModal();assert.equal(popped,1);
 context.openCompanySelectModal();context.closeCompanySelectModal(true);assert.equal(popped,1,'a browser Back must not close history twice');
});
