'use strict';
const assert=require('node:assert/strict'),puppeteer=require('puppeteer'),{creoDodosiFill}=require('./dodosi-helper/form');
const plan=n=>({schema:'creo.dodosi.dispatch.v1',originId:'origin',originName:'가상 출발점',destinationId:'dest'+n,groupId:'g'+n,shop:'[서울/강동] 가상점'+n,quantity:n===1?2:3,name:'가상'+n,phone:'0100000000'+n,sender:{name:'발송 테스트',phone:'01000000009'},schedule:{dropoffDate:'2026-11-24',arrivalDate:'2026-11-28'}});
(async()=>{const browser=await puppeteer.launch({headless:true,executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe'});try{const page=await browser.newPage();await page.setRequestInterception(true);page.on('request',r=>r.respond({status:200,contentType:'text/html',body:'<html><body><main></main></body></html>'}));for(const size of [1,2]){await page.goto('https://www.dodosi.co.kr/order?myShop=origin&shop=dest1&qty=2');await page.evaluate(()=>{
 const root=document.querySelector('main');let people=[{qty:2,shop:'[서울/강동] 가상점1'}];window.paymentClicks=0;
 const button=(label,click,parent=root,aria)=>{const b=document.createElement('button');b.textContent=label;if(aria)b.setAttribute('aria-label',aria);b.onclick=click;parent.append(b);return b;};
 root.append(document.createTextNode('가상 출발점 [서울/강동] 가상점1'));
 button('맡기는 날을 선택해주세요',()=>button('11월 24일 (화)',()=>button('모두 크레스티드 게코예요',()=>button('확인했어요',()=>button('다음 · 사람 정보 입력',step2)))));
 function input(id,parent){const e=document.createElement('input');e.id=id;parent.append(e);return e;}
 function step2(){root.replaceChildren();input('one-name',root);input('one-tel',root);const cards=document.createElement('div');root.append(cards);
  function card(i){const p=people[i],box=document.createElement('section');cards.append(box);input(`party-${i}-name`,box);input(`party-${i}-tel`,box);
   const destination=document.createElement('div');destination.dataset.destination=String(i);box.append(destination);
   function target(){destination.replaceChildren();if(people.length<2)return;button(p.shop||'도착 정거샵 선택',()=>{const dialog=document.createElement('div');dialog.setAttribute('role','dialog');input('search',dialog);button('[서울/강동] 가상점2 서울 가상 주소',()=>{p.shop='[서울/강동] 가상점2';dialog.remove();target();},dialog);root.append(dialog);},destination);if(p.shop)destination.append(document.createTextNode('찾아가는 날 11월 28일 (토)'));}p.target=target;target();
   const group=document.createElement('div');group.setAttribute('role','group');box.append(group);const status=document.createElement('span');status.setAttribute('role','status');group.append(status);
   function count(){group.setAttribute('aria-label','마리 수. 현재 '+p.qty);status.textContent=p.qty;}count();button('+',()=>{p.qty++;count();},group,'마리 수 더하기');
  }
  card(0);button('받는 사람 추가 여러 건을 한 번에 예약하고 결제해요',()=>{people.push({qty:1});card(people.length-1);people.forEach(p=>p.target());});
  const terms=input('terms',root);terms.type='checkbox';button('결제하기',()=>window.paymentClicks++);
 }
 });const plans=Array.from({length:size},(_,i)=>plan(i+1)),result=await page.evaluate(creoDodosiFill,plans[0],plans);assert.equal(result.filled,true,result.error);assert.equal(result.count,size);assert.equal(result.quantity,size===1?2:5);assert.equal(await page.evaluate(()=>window.paymentClicks),0);assert.equal(await page.$eval('#terms',e=>e.checked),false);assert.equal(await page.$eval('#one-name',e=>e.value),'발송 테스트');}console.log('Dodosi form: single-hidden destination + multiple recipients + counts + no payment passed');}finally{await browser.close();}})().catch(e=>{console.error(e);process.exitCode=1});
