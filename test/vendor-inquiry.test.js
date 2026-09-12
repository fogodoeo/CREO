'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const Inquiry=require('../public/checkout-inquiry');
const {collectionInquiries}=require('../vendor-inquiry');
test('inquiry links accept Kakao channels and one-to-one open profile URLs without arbitrary parameters',()=>{
 for(const value of ['https://pf.kakao.com/_Example','https://pf.kakao.com/_Example/chat',' https://pf.kakao.com/_Example/ '])assert.equal(Inquiry.kakaoUrl(value),'https://pf.kakao.com/_Example/chat');
 for(const value of ['https://open.kakao.com/o/sExample1','https://open.kakao.com/o/sExample-','https://open.kakao.com/me/example_staff'])assert.equal(Inquiry.kakaoUrl(value+'/'),value);
 for(const value of ['https://open.kakao.com/o/gExample1','https://open.kakao.com/o/Example1','https://open.kakao.com/o/sExample?name=buyer','https://open.kakao.com/me/example#buyer','https://open.kakao.com.evil.test/o/sExample','https://user@open.kakao.com/o/sExample','https://open.kakao.com:444/o/sExample','https://open.kakao.com/me/example/extra','http://open.kakao.com/o/sExample','kakaotalk://profile/123'])assert.equal(Inquiry.kakaoUrl(value),'');
 for(const value of ['javascript:alert(1)','https://pf.kakao.com.evil.test/_Example','https://pf.kakao.com@evil.test/_Example','https://user@pf.kakao.com/_Example','https://pf.kakao.com:444/_Example','https://pf.kakao.com/_Example?redirect=evil','https://pf.kakao.com/_Example#secret','https://pf.kakao.com/_Example/posts','https://pf.kakao.com/%5fExample','http://pf.kakao.com/_Example','https://pf.kakao.com/_Exam\nple',{},null])assert.equal(Inquiry.kakaoUrl(value),'');
});
test('inquiry contact exposes only usable business contact fields',()=>{
 assert.deepEqual(Inquiry.contact({name:'업체',phone:'010-1234-5678',kakaoUrl:'https://pf.kakao.com/_Example',bankAccount:'private',manager:'private',note:'private'}),{name:'업체',phone:'01012345678',kakaoUrl:'https://pf.kakao.com/_Example/chat'});
 assert.equal(Inquiry.contact({name:'없는 업체',phone:'not 01012345678',kakaoUrl:'javascript:alert(1)'}),null);
 assert.equal(Inquiry.contact({name:'종료 업체',phone:'01012345678',active:false}),null);
 assert.deepEqual(Inquiry.contact({name:'톡만',kakaoUrl:'https://pf.kakao.com/_Example'}),{name:'톡만',phone:'',kakaoUrl:'https://pf.kakao.com/_Example/chat'});
});
test('business alert phone is separate from the buyer-facing inquiry phone',()=>{
 assert.equal(Inquiry.vendorContact({phone:'01011112222',inquiryPhone:'01033334444',inquiryPhoneMode:'shared'}).phone,'01011112222');
 assert.deepEqual(Inquiry.vendorContact({name:'업체',phone:'01011112222',inquiryPhone:'01033334444'}),{name:'업체',phone:'01033334444',kakaoUrl:''});
 assert.equal(Inquiry.vendorContact({name:'업체',phone:'01011112222',inquiryPhone:''}),null);
 assert.deepEqual(Inquiry.vendorContact({name:'업체',phone:'01011112222',inquiryPhone:'',kakaoUrl:'https://pf.kakao.com/_Example'}),{name:'업체',phone:'',kakaoUrl:'https://pf.kakao.com/_Example/chat'});
 assert.equal(Inquiry.vendorContact({name:'기존 업체',phone:'01011112222'}).phone,'01011112222','legacy public contact remains until it is explicitly separated');
});
test('new operator-created vendor does not expose its operational phone, and legacy edits preserve the old public number',()=>{
 const {sanitizeRecord}=require('../platform-api');
 const created=sanitizeRecord('vendor',{name:'새 업체',phone:'01011112222'});assert.equal(created.inquiryPhone,'');assert.equal(Inquiry.vendorContact(created),null);
 const changed=sanitizeRecord('vendor',{name:'기존 업체',phone:'01033334444'},{id:'old',phone:'01011112222'});assert.equal(changed.inquiryPhone,'01011112222');
 const cleared=sanitizeRecord('vendor',{phone:'01033334444',inquiryPhone:''},changed);assert.equal(Inquiry.vendorContact(cleared),null);
});
test('archives follow the captured directory identity and never infer a vendor from reused names or IDs',async()=>{
 const records=[{item:{vendorName:'동일 업체'},vendorSource:{directoryId:'original'}},{item:{vendorName:'동일 업체'},vendorSource:{directoryId:'deleted'}},{item:{vendorName:'동일 업체',vendorId:'reused'}},{item:{},vendorSource:{directoryId:'detached'}}];
 const directory={read:async()=>({profiles:[{id:'original',members:[{channelId:'old',vendorId:'reused'}],info:{name:'새 상호',phone:'01011112222'}},{id:'replacement',members:[{channelId:'new',vendorId:'reused'}],info:{name:'동일 업체',phone:'01033334444'}},{id:'detached',members:[],info:{name:'연결 해제',phone:'01055556666'}}]})};
 assert.deepEqual(await collectionInquiries(records,directory),[{name:'새 상호',phone:'01011112222',kakaoUrl:''},null,null,null]);
 await assert.rejects(collectionInquiries(records,{read:async()=>{throw Error('storage unavailable')}}),/storage unavailable/);
});
