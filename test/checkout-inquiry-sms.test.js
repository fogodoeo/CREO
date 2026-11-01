'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {parseHTML}=require('linkedom');
const Inquiry=require('../public/checkout-inquiry');
const item={name:'A03',displayNumber:'A03',inquiry:{name:'가상 업체 A',phone:'01000000001'}};
test('inquiry follows program, selected round, buyer and the individual seller',()=>{
 const c=Inquiry.inquiryContext({channel:{id:'clab-1029',name:'씨랩 · 크레용'},round:{name:'2026.10.29 씨랩'},buyer:{name:'이*은'}});
 assert.equal(Inquiry.inquiryMessage(item,c),'[씨랩 개체 문의]\n낙찰자: 이*은\n회차: 2026.10.29 씨랩\n업체: 가상 업체 A\n개체: A03\n문의내용: ');
 assert.match(Inquiry.inquiryMessage(item,{...c,channelId:'national-cre-20261028',roundName:'10.28 경남편'}),/^\[전국크레자랑 개체 문의\][\s\S]*회차: 10.28 경남편/);
 assert.equal(Inquiry.programName({channelId:'custom',channelName:'다른 경매'}),'다른 경매');
 assert.match(Inquiry.inquiryMessage(item,Inquiry.inquiryContext({channel:{id:'clab',name:'씨랩'},round:{name:'지난 회차'}})),/낙찰자: \n회차: 지난 회차/);
});
test('SMS drafts encode user text without adding recipients and distinguish iOS including iPad desktop mode',()=>{
 const body='[씨랩 문의]\n이름: 김 & 이\n문의: ? # 한글';
 const android=Inquiry.smsHref('010-0000-0001',body,{userAgent:'Android'});
 assert.equal(android,'sms:01000000001?body='+encodeURIComponent(body));
 assert.equal(Inquiry.smsHref('01000000001',body,{userAgent:'iPhone'}),'sms:01000000001&body='+encodeURIComponent(body));
 assert.equal(Inquiry.smsHref('01000000001',body,{platform:'MacIntel',maxTouchPoints:5}),'sms:01000000001&body='+encodeURIComponent(body));
 for(const phone of ['021234567','01000000001,01000000002','01000000001?body=bad','','javascript:alert(1)'])assert.equal(Inquiry.smsHref(phone,body),'');
});
test('dialog uses selected vendor, retains edited draft, resets between items and removes private data on clear',()=>{
 const {document}=parseHTML('<html><body><button id="opener">문의</button></body></html>');
 const ui=Inquiry.create({document}),dialog=document.querySelector('dialog'),opener=document.querySelector('#opener');
 dialog.showModal=()=>{dialog.open=true;};dialog.close=()=>{dialog.open=false;dialog.dispatchEvent(new document.defaultView.Event('close'));};
 ui.open(item,{channelId:'clab-1029',roundName:'10월 29일'},opener);
 const draft=document.querySelector('#inquiry-message'),sms=document.querySelector('[data-sms]');
 assert.equal(document.querySelector('#inquiry-title').textContent,'씨랩 개체 문의');
 assert.match(sms.getAttribute('href'),/^sms:01000000001/);
 draft.value+='먹이 & 성별 질문';draft.oninput();assert.ok(decodeURIComponent(sms.getAttribute('href')).endsWith('먹이 & 성별 질문'));
 ui.open({...item,name:'B07',displayNumber:'B07',inquiry:{name:'가상 업체 B',phone:'01000000002'}},{channelId:'national-cre'},opener);
 assert.match(sms.getAttribute('href'),/^sms:01000000002/);assert.doesNotMatch(draft.value,/A03|먹이|씨랩|업체 A/);assert.match(draft.value,/B07/);
 ui.open({...item,inquiry:{name:'톡만',kakaoUrl:'https://pf.kakao.com/_Example'}},{channelId:'clab'},opener);
 assert.equal(sms.hidden,true);assert.equal(sms.getAttribute('href'),null);assert.equal(document.querySelector('[data-chat]').hidden,false);
 ui.clear();assert.equal(draft.value,'');assert.equal(sms.getAttribute('href'),null);assert.equal(dialog.open,false);
});
