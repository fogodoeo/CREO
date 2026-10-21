'use strict';
// Isolated SQLite and fake login provider; never reads production.
const {randomUUID}=require('node:crypto');
const {createFixture}=require('./vendor-portal-preview.cjs');
const ROOT='national-cre',DATE='2026-10-21',TARGET='national-cre-20261021';
async function fixture(options){
 const f=await createFixture(options);f.advance(28*86400000);
 await f.repository.setActiveChannel(ROOT);
 await f.repository.upsertRecord(ROOT,'setting',{id:'national-cycle-config',mode:'regional-cycle-v1'});
 const admin={'x-creo-admin':f.secret};
 const request=(method,path,body)=>f.call(f.client(),method,'/api/platform'+path,body,admin);
 const owner=await f.login('01000000001');
 const registered=await f.post(owner,'register',{name:'가상 전라충청 업체',region:'전라·충청',phone:'01000000001'});
 if(registered.status!==200)throw Error(registered.body);
 const vendorId=registered.json().id;
 const vendor=await f.repository.getRecord(ROOT,'vendor',vendorId);
 await f.repository.upsertRecord(ROOT,'vendor',{...vendor,bankName:'가상은행',bankAccount:'000-000',bankHolder:'가상 업체'});
 const token=(await f.post(owner,'select',{id:vendorId})).json().token;
 const booking=(body,event=ROOT)=>f.call(owner,body?'POST':'GET','/api/platform/vendor-bookings'+(body?'':'?'+new URLSearchParams({token,event})),body?{requestId:randomUUID(),...body,token,event}:undefined);
 const reserved=await booking({type:'reserve',date:DATE,quantity:4});if(reserved.status!==200)throw Error(reserved.body);
 const reservation=reserved.json().reservations[0];
 const submitted=await booking({type:'save-entries',id:reservation.id,submit:true,entries:Array.from({length:4},(_,slot)=>({slot,expectedVersion:0,entry:{sex:'unknown',weight:'3',hatchDate:'2026-09-01',note:'보존할 제출 '+(slot+1)}}))});
 if(submitted.status!==200)throw Error(submitted.body);
 return {...f,request,owner,vendorId,token,booking,prepare:()=>request('POST','/national-rounds',{action:'prepare',date:DATE})};
}
module.exports={fixture,ROOT,DATE,TARGET};
