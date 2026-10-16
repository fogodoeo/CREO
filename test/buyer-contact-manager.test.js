'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs'),path=require('node:path');
const source=fs.readFileSync(path.join(__dirname,'../public/buyer-contact-manager.js'),'utf8');
function node(){return {disabled:false,textContent:'',focus(){},addEventListener(){},isConnected:true};}
function fixture(){
 const host=node(),message=()=>node();let output=message(),dialog,channel='national-cre',postFailure=false;
 Object.defineProperty(host,'innerHTML',{set(value){this.html=value;output=message();}});
 host.querySelector=selector=>selector==='.contact-message'?output:node();host.querySelectorAll=()=>[];
 const calls=[],row={itemId:'a01',lot:'A01',name:'가상 구매자',rawName:'가상 구매자',phone:'01000000003',status:'not_sent',attention:true,saleId:'sale-1',updatedAt:'version-1'};
 const form=node(),phone={...node(),value:row.phone},confirmed={...node(),checked:true};form.elements=[phone,confirmed];form.elements.phone=phone;form.elements.confirmed=confirmed;
 const error=node(),events={};
 const document={hidden:false,body:{append(){}},getElementById:()=>({before(){}}),addEventListener(){},createElement(type){
  if(type==='section')return host;
  dialog={...node(),remove(){},setAttribute(){},showModal(){},addEventListener(name,fn){events[name]=fn;},close(){queueMicrotask(()=>events.close());},querySelector(selector){return selector==='form'?form:selector==='#contact-error'?error:node();}};return dialog;
 }};
 const ctx={window:{CreoPlatform:{escapeHtml:String,api:async(route,options)=>{
  if(!options)return {rows:[{...row}]};calls.push(JSON.parse(options.body));
  if(postFailure){postFailure=false;throw Object.assign(Error('응답 지연'),{status:504});}
  row.phone=calls.at(-1).phone;row.status='queued';row.attention=false;return{notification:{status:'queued'}};
 }}},document,confirm:()=>true,crypto:{randomUUID:()=>`request-${calls.length+100}`},setInterval(){},queueMicrotask};
 vm.runInNewContext(source,ctx);
 const manager=ctx.window.CreoBuyerContactManager.mount({getChannelId:()=>channel,getTab:()=> 'items',refresh:async()=>manager.load()});
 return {manager,form,phone,error,calls,get message(){return output.textContent},get html(){return host.html},failNext(){postFailure=true},switchChannel(){channel='creyon'}};
}
const tick=()=>new Promise(resolve=>setImmediate(resolve));
test('contact success survives asynchronous dialog close, workspace refresh and later polling',async()=>{
 const f=fixture();await f.manager.load();await f.manager.open('a01',node());
 f.form.onsubmit({preventDefault(){},submitter:{value:'send'}});await tick();
 assert.equal(f.message,'번호 저장 완료 · 알림톡 발송 대기');await f.manager.load();assert.equal(f.message,'번호 저장 완료 · 알림톡 발송 대기');
 f.switchChannel();await f.manager.load();assert.equal(f.message,'');
});
test('unknown response retries the same request id; changing the phone creates a separate request',async()=>{
 const f=fixture();await f.manager.load();await f.manager.open('a01',node());f.failNext();
 const submit=()=>f.form.onsubmit({preventDefault(){},submitter:{value:'send'}});
 submit();await tick();assert.equal(f.error.textContent,'응답 지연');f.failNext();submit();await tick();
 assert.equal(f.calls[0].requestId,f.calls[1].requestId);
 f.phone.value='01000000004';submit();await tick();assert.notEqual(f.calls[1].requestId,f.calls[2].requestId);
});
