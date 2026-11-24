'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs'),{parseHTML}=require('linkedom');
function fixture(wrongRegion=false){
 const {window,document}=parseHTML('<html><body><input id="one-name"><input id="one-tel"><main></main><button id="add">받는 사람 추가</button></body></html>');
 window.HTMLElement.prototype.getClientRects=function(){return this.isConnected?[{}]:[];};window.HTMLElement.prototype.scrollIntoView=function(){};
 const shop='[서울/강동] 테스트',date='11월 28일 (토)';let confirmations=0;
 function row(i){const div=document.createElement('section');div.innerHTML=`<input id="party-${i}-name"><input id="party-${i}-tel"><button class="shop">${i?'도착 정거샵 선택':shop}</button><span class="date">${i?'':date}</span><button aria-label="마리 수 직접 입력">1</button><button aria-label="마리 수 더하기">+</button>`;document.querySelector('main').append(div);
 div.querySelector('[aria-label="마리 수 더하기"]').onclick=()=>div.querySelector('[aria-label="마리 수 직접 입력"]').textContent=String(+div.querySelector('[aria-label="마리 수 직접 입력"]').textContent+1);
 div.querySelector('.shop').onclick=()=>{const dlg=document.createElement('div');dlg.setAttribute('role','dialog');dlg.innerHTML=`<input><button><span><span>${shop}</span><span>주소</span></span></button>`;document.body.append(dlg);
 dlg.querySelector('button').onclick=()=>{const modal=document.createElement('div');modal.setAttribute('role','dialog');modal.innerHTML=`같은 이름의 지점이 있어요<button role="radio" aria-checked="true"><span><span>[경기/수원] 테스트</span><span>주소</span></span></button><button role="radio" aria-checked="false"><span><span>${wrongRegion?'[부산/남구] 테스트':shop}</span><span>주소</span></span></button><button class="confirm">선택</button>`;document.body.append(modal);
 for(const radio of modal.querySelectorAll('[role="radio"]'))radio.onclick=()=>{modal.querySelectorAll('[role="radio"]').forEach(e=>e.setAttribute('aria-checked',String(e===radio)));};
 modal.querySelector('.confirm').onclick=()=>{confirmations++;div.querySelector('.shop').textContent=modal.querySelector('[aria-checked="true"] span span').textContent;div.querySelector('.date').textContent=date;modal.remove();dlg.remove();};};};
 }
 row(0);document.getElementById('add').onclick=()=>row(1);
 const context={document,HTMLInputElement:window.HTMLInputElement,Event:window.Event,location:{origin:'https://www.dodosi.co.kr',pathname:'/order',search:'?myShop=origin&shop=dest&qty=1'},URLSearchParams,setTimeout:fn=>{fn();}};vm.createContext(context);vm.runInContext(fs.readFileSync(require.resolve('../tools/dodosi-helper/form.js'),'utf8'),context);
 const plan={schema:'creo.dodosi.dispatch.v1',originId:'origin',destinationId:'dest',quantity:1,groupId:'g1',name:'가상1',phone:'01000000001',shop,sender:{name:'테스트',phone:'01000000000'},schedule:{dropoffDate:'2026-11-24',arrivalDate:'2026-11-28'}};
 return{run:()=>context.creoDodosiFill(plan,[plan,{...plan,groupId:'g2',name:'가상2',phone:'01000000002',quantity:6}]),get confirmations(){return confirmations;}};
}
test('duplicate shop dialog auto-confirms exact region and reads back six animals in one recipient row',async()=>{const f=fixture(),r=await f.run();assert.equal(r.filled,true,r.error);assert.equal(r.count,2);assert.equal(r.quantity,7);assert.equal(f.confirmations,1);});
test('duplicate names without the exact region fail without selecting another branch',async()=>{const f=fixture(true),r=await f.run();assert.equal(r.filled,false);assert.match(r.error,/정확한 지역/);assert.equal(f.confirmations,0);});
