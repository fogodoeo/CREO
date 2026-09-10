'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
function screen(bank){
 const html=fs.readFileSync(require.resolve('../public/organizer-shipping.html'),'utf8');
 const nodes=new Map([...html.matchAll(/id="([^"]+)"/g)].map(m=>[m[1],{hidden:false,value:'',textContent:'',focus(){},setAttribute(){}}]));
 const context=vm.createContext({URLSearchParams,location:{search:'?channel=alpha'},document:{getElementById:id=>nodes.get(id)},CreoPlatform:{escapeHtml:s=>String(s).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;'),api:()=>new Promise(()=>{})},setInterval(){}});
 vm.runInContext(fs.readFileSync(require.resolve('../public/organizer-shipping.js'),'utf8'),context);
 context.bankFixture=bank;vm.runInContext('state={bank:bankFixture};renderBank()',context);
 return {nodes,context,html};
}
test('unregistered organizer sees bank inputs immediately before settlement amounts',()=>{
 const {nodes,html}=screen({});
 assert.equal(nodes.get('bank-form').hidden,false);assert.equal(nodes.get('save').textContent,'계좌 등록하기');
 assert.equal(nodes.get('bank-saved').hidden,true);assert.equal(nodes.get('edit-bank').hidden,true);
 assert.ok(html.indexOf('id="bank-settings"')<html.indexOf('id="total"'));
 assert.ok(!/<details[^>]+id="bank-settings"/.test(html));
});
test('registered account is visible, editable and does not lose a draft during rendering',()=>{
 const bank={bankName:'은행',bankAccount:'123-456',bankHolder:'주관사',notificationPhone:'01011112222',updatedAt:'revision-1'};
 const {nodes,context}=screen(bank);
 assert.equal(nodes.get('bank-form').hidden,true);assert.equal(nodes.get('bank-saved').hidden,false);assert.equal(nodes.get('bank-saved-account').textContent,'123-456');
 nodes.get('edit-bank').onclick();assert.equal(nodes.get('bank-form').hidden,false);
 nodes.get('bankAccount').value='999-999';nodes.get('bank-form').oninput();
 vm.runInContext('renderBank()',context);assert.equal(nodes.get('bankAccount').value,'999-999');
 nodes.get('cancel-bank').onclick();assert.equal(nodes.get('bank-form').hidden,true);assert.equal(nodes.get('bankAccount').value,'123-456');
});
test('legacy account missing its notification phone opens the setup form with account values preserved',()=>{
 const {nodes}=screen({bankName:'은행',bankAccount:'123-456',bankHolder:'주관사'});
 assert.equal(nodes.get('bank-form').hidden,false);assert.equal(nodes.get('bankAccount').value,'123-456');
});
test('fee details start collapsed, escape source text and show the allocated total',()=>{
 const {context}=screen({});
 context.feeFixture={shippingFeeItems:[{id:'a',name:'<img src=x>',carrier:'파르게',destination:'서울 & 테스트점',amount:3500},{id:'b',name:'B01',carrier:'파르게',destination:'서울',amount:3500}]};
 const html=vm.runInContext('feeDetailNotice(feeFixture)',context);
 assert.ok(html.includes('배송비 상세 · 2개체'));assert.ok(html.includes('7,000원'));
 assert.ok(html.includes('&lt;img src=x&gt;'));assert.ok(html.includes('서울 &amp; 테스트점'));assert.ok(!html.includes('<img'));
 assert.ok(!/<details[^>]*\bopen\b/.test(html));
 assert.equal(vm.runInContext('feeDetailNotice({shippingFeeItems:[]})',context),'');
});
