'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),{parseHTML}=require('linkedom');
const view=require('../public/studio-settings-view');
const source=fs.readFileSync(require.resolve('../public/auction-control.html'),'utf8');
function setup(options={}){
 const {document,window}=parseHTML(source),form=document.getElementById('control-form');
 const extra=document.createElement('div');extra.id='shared-page2-controls';extra.className='section';extra.innerHTML='<div class="section-head">세부 표시</div><label><input type="checkbox" name="page2VendorTagOn">업체 이름</label>';
 document.querySelector('[data-panel="2"]').prepend(extra);
 const input=name=>form.querySelector(`[name="${name}"]`);
 for(const [name,value] of Object.entries(options.values||{}))input(name).value=value;
 const before=[...form.querySelectorAll('[name]')];
 const controller=view.create({document,...options});
 return{document,window,form,input,controller,before,refresh:args=>controller.refresh({channelId:'round-a',...args})};
}
test('whole settings groups preserve every control and value; existing hosts open and empty additions stay collapsed',()=>{
 const f=setup({values:{hostName1:'진행',hostName2:'해설',hostName3:'',hostRole3:'게스트'}});f.refresh();
 assert.equal(f.document.querySelector('.page-tabs').hidden,true);
 const pages=[...f.form.querySelectorAll('.settings-page')];assert.equal(pages.length,3);assert.deepEqual(pages.map(el=>Boolean(el.open)),[true,false,false]);
 assert.deepEqual(pages.map(el=>el.querySelector('summary').textContent),['1P 진행 화면','2P 경매 화면','3P 집계 화면']);
 assert.equal(f.input('hostName2').closest('details').open,true);assert.equal(Boolean(f.input('hostName3').closest('details').open),false);
 assert.equal(f.input('hostRole3').value,'게스트');
 assert.deepEqual(new Set(f.form.querySelectorAll('[name]')),new Set(f.before));
 assert.equal(f.document.querySelector('#shared-page2-controls').closest('details').previousElementSibling.querySelector('h2').textContent,'경매 화면 요소');
});
test('refresh and scope reset retain values, disclosure choice, and profile-specific ticker meaning',()=>{
 const f=setup({values:{hostName2:'해설'}});f.refresh({sharedTicker:true});
 const host=f.input('hostName2').closest('details');host.open=false;
 f.input('hostName2').value='바뀐 해설';f.input('hostName2').dispatchEvent(new f.window.Event('input',{bubbles:true}));
 assert.match(host.querySelector('summary').textContent,/바뀐 해설/);assert.equal(host.open,false);
 assert.equal(f.input('page1Ticker').closest('.section').querySelector('h2').textContent,'1P·2P 공통 자막');
 f.refresh({sharedTicker:true});assert.equal(host.open,false);
 f.input('page1Ticker').value='1P 문장';f.input('page2Ticker').value='2P 문장';f.refresh({channelId:'round-b'});
 assert.equal(host.open,true);assert.equal(f.input('page2Ticker').closest('.section').querySelector('h2').textContent,'순환 자막');
 assert.equal(f.input('page1Ticker').value,'1P 문장');assert.equal(f.input('page2Ticker').value,'2P 문장');
});
test('compact mode keeps page selection; all field labels refer to their own controls',()=>{
 const f=setup({compact:true});f.refresh();assert.equal(f.form.querySelector('.settings-page'),null);assert.equal(f.document.querySelector('.page-tabs').hidden,false);
 for(const input of f.form.querySelectorAll('.field [name]'))assert.equal(input.closest('.field').querySelector('label').htmlFor,input.id);
 assert.equal(f.input('hostName2').closest('details').className,'settings-disclosure host-extra');
});
test('unavailable third page stays hidden and invalid inputs expand their collapsed ancestors',()=>{
 const f=setup({initialPage:3});f.document.querySelector('[data-page="3"]').hidden=true;f.refresh();
 assert.equal(f.document.querySelector('[data-settings-page="3"]').hidden,true);assert.equal(f.document.querySelector('[data-settings-page="1"]').open,true);
 const input=f.input('hostName2');input.dispatchEvent(new f.window.Event('invalid',{bubbles:true}));
 assert.equal(input.closest('.host-extra').open,true);assert.equal(input.closest('.settings-page').open,true);
});
