'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs'),{webcrypto}=require('node:crypto'),{parseHTML}=require('linkedom');
const Core=require('../public/parge-dispatch-core');
function plan(){return Core.manifest([{name:'가상 수령인',phone:'01011112222',shop:'가상 매장',quantity:2,price:350000,items:[{id:'a',price:100000},{id:'b',price:250000}]}],{channelId:'national-cre',date:'2099-10-24'});}
function fixture(options={}){
 const {document,HTMLInputElement,Event}=parseHTML('<html><body><button>로그아웃</button><main></main></body></html>'),root={},history={},state={clicked:0,captured:[]};
 const main=document.querySelector('main'),button=(parent,label,fn,aria='')=>{const b=document.createElement('button');b.textContent=label;if(aria)b.setAttribute('aria-label',aria);b.onclick=fn;parent.append(b);return b;};
 function makeCard(){const card=document.createElement('section');card.innerHTML='<h3>도착지</h3><p>2099년 10월</p><p data-date>위 달력에서 맡김일을 눌러 선택해 주세요.</p><p data-shop>위 버튼으로 도착 매장을 지정해 주세요.</p><input placeholder="이름"><input placeholder="연락처"><select><option value="크레스티드게코">크레스티드게코</option></select><div data-qty><span>01</span></div><input placeholder="예: 150000"><input placeholder="요청사항 (선택)">';
  card.querySelector('option').setAttribute('selected','');
  const day=button(card,'24',()=>card.querySelector('[data-date]').textContent='선택됨: 2099년 10월 24일 토요일');if(options.disabledDate)day.disabled=true;
  button(card,'도착 매장 선택',()=>{const d=document.createElement('div');d.setAttribute('role','dialog');d.innerHTML='<h2>도착 파트너</h2><input placeholder="매장명 검색 (권역 탭 숫자로 다른 지역 결과도 확인)">';button(d,'',()=>{card.querySelector('[data-shop]').textContent='가상 매장';d.remove();refresh();}).innerHTML='<span>가상 매장</span><span>19000원</span>';document.body.append(d);});
  button(card.querySelector('[data-qty]'),'+',()=>{const s=card.querySelector('[data-qty] span');s.textContent=String(Number(s.textContent)+1).padStart(2,'0')},'마릿수 한 마리 늘리기');
  if(options.draft)card.querySelector('input').value='작성 중';main.insertBefore(card,main.querySelector('[data-add]'));return card;
 }
 function refresh(){const n=[...main.querySelectorAll('section [data-shop]')].filter(p=>p.textContent==='가상 매장').length;main.querySelector('[data-cart]').textContent=`장바구니 담고 결제하기 (${n}곳)`;}
 function ready(){main.innerHTML='<div><p>출발지 선택 완료</p><p>크레오 대구본점</p></div><div><input placeholder="이름 (또는 샵명)"><input placeholder="연락처"></div>';
  button(main,'+ 도착지 추가 (다른 매장으로 보낼 개체가 더 있다면 클릭)',()=>makeCard()).setAttribute('data-add','');
  button(main,'장바구니 담고 결제하기 (0곳)',()=>{state.clicked++;state.captured=[...main.querySelectorAll('section')].map(c=>({name:c.querySelector('input[placeholder="이름"]').value,phone:c.querySelector('input[placeholder="연락처"]').value,quantity:Number(c.querySelector('[data-qty] span').textContent),price:Number(c.querySelector('input[placeholder="예: 150000"]').value),memo:c.querySelector('input[placeholder="요청사항 (선택)"]').value}));main.innerHTML='';button(main,'← 다시 목록으로 (수정/추가)',()=>{main.innerHTML='<aside></aside>';const aside=main.querySelector('aside');for(const g of state.captured){const row=document.createElement('div');row.innerHTML=`<span>배송 1</span><span>크레오 대구본점 ➔ 가상 매장</span><p>보내는분: 크레오 대구본점 | 받는분: ${g.name}</p><p>개체: 크레스티드게코 ${String(g.quantity).padStart(2,'0')}마리 · 분양 ${options.wrongCart?1:g.price}원</p><button>삭제</button>`;aside.append(row);}});}).setAttribute('data-cart','');makeCard();
 }
 ready();if(options.dialog){const d=document.createElement('div');d.setAttribute('role','dialog');document.body.append(d);}
 const chrome={storage:{local:{get:async()=>history}},runtime:{sendMessage:async({keys})=>{if(options.storageFail)return {error:'저장 실패'};keys.forEach(k=>history[k]={state:'attempted'});return {reserved:true}}}};
 vm.runInNewContext(fs.readFileSync(require.resolve('../tools/parge-helper/form.js'),'utf8'),{window:root,document,HTMLInputElement,Event,location:{origin:'https://parge.co.kr',pathname:'/booking'},CreoPargeDispatch:Core,chrome,crypto:webcrypto,TextEncoder,setTimeout:fn=>queueMicrotask(fn)});
 return {run:()=>root.CreoPargeForm.run(plan()),state,history};
}
test('fills count 2 and sum 350000, memo, recipient, verifies cart without paying',async()=>{const f=fixture(),r=await f.run();assert.equal(r.cartVerified,true,r.error);assert.equal(f.state.clicked,1);assert.deepEqual(f.state.captured,[{name:'가상 수령인',phone:'01011112222',quantity:2,price:350000,memo:'전크자'}]);assert.ok((await f.run()).error);assert.equal(f.state.clicked,1);});
for(const [label,options]of [['disabled date',{disabledDate:true}],['existing draft',{draft:true}],['open popup',{dialog:true}],['storage failure',{storageFail:true}]])test(label+' never clicks cart',async()=>{const f=fixture(options);assert.ok((await f.run()).error);assert.equal(f.state.clicked,0);});
test('mismatched cart is not reported confirmed and retry is suppressed',async()=>{const f=fixture({wrongCart:true}),r=await f.run();assert.ok(r.error);assert.notEqual(r.cartVerified,true);assert.equal(f.state.clicked,1);assert.ok((await f.run()).error);assert.equal(f.state.clicked,1);});
test('concurrent clicks run only one cart mutation',async()=>{const f=fixture(),results=await Promise.all([f.run(),f.run()]);assert.equal(results.filter(r=>r.cartVerified).length,1);assert.equal(f.state.clicked,1);});
