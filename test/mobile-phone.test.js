'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const Phone=require('../public/mobile-phone');
const Summary=require('../public/print-shipping-summary');

test('public redaction hides mobile numbers attached to names and regions without changing extraction',()=>{
 for(const value of ['가상업체 광주01012345678','가상업체 광주010-1234-5678','가상업체 광주０１０１２３４５６７８','가상업체 광주010일이삼사5678','가상업체 광주+821012345678']){
  assert.equal(Phone.redactPhoneText(value),'가상업체 광주',value);
  assert.equal(Phone.redactPhoneText(Phone.redactPhoneText(value)),'가상업체 광주');
 }
 assert.equal(Phone.redactPhoneText('크레용 대구본점'),'크레용 대구본점');
 assert.equal(Phone.extractMobilePhone('가상업체 광주01012345678'),'');
});
test('mixed Korean numbers, omitted prefix, spaces, fullwidth and international phones share one policy',()=>{
 for(const [input,expected] of [
  ['쩡/용인/2093-4625','01020934625'],['쩡/용인/20934625','01020934625'],
  ['010이사이이2022','01024222022'],['김준형 01084978955 용인','01084978955'],
  ['가상/서울/공일공 일이삼사 오육칠팔','01012345678'],['０１０－１２３４－５６７８','01012345678'],
  ['+82 10 1234 5678','01012345678'],['김민구 01012345678','01012345678'],
  ['가상/010일2345678','01012345678'],['가상/010\u200b12345678','01012345678']
 ])assert.equal(Phone.extractMobilePhone(input),expected,input);
 assert.equal(Phone.normalizeMobilePhone('010이사이이2022'),'01024222022');
 assert.equal(Phone.normalizeMobilePhone('010일2345678'),'01012345678');
});
test('missing, ambiguous, incomplete, arbitrary letters and overlong numbers cannot invent a contact',()=>{
 for(const value of ['닉네임','0101234567','010123456789','9010123456789','010가나다5678','0101234-5678 / 01087654321','일이삼사오육칠팔','2026-10-18','1234'])assert.equal(Phone.extractMobilePhone(value),'',value);
 for(const value of ['010abc12345678','01012345678hello','010일이?345678','+01012345678'])assert.equal(Phone.normalizeMobilePhone(value),'',value);
 assert.equal(Phone.extractMobilePhone('01012345678 / 010-1234-5678'),'01012345678');
});
test('buyer and label names omit phone and region without changing source identity or business names',()=>{
 for(const [input,expected] of [['김준형 01084978955 용인','김준형'],['쩡/용인/2093-4625','쩡'],['천안/김원철/01012345678','김원철'],['용인/김준형/010이사이이2022','김준형'],['01012345678 김준형 용인','김준형'],['가상 낙찰자','가상 낙찰자'],['크레용 대구본점','크레용 대구본점'],['대구 크레용','대구 크레용'],['김민구 01012345678','김민구']]){
  assert.equal(Phone.buyerDisplayName(input),expected,input);
  const item={winner_name:input,winner_phone:'01000000001'};assert.equal(Summary.winnerIdentity(item).name,expected);assert.equal(item.winner_name,input);
 }
 assert.equal(Phone.redactPhoneText('쩡/용인/010이사이이2022'),'쩡/용인');
});
