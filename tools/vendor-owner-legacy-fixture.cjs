'use strict';
// Only for isolated fixture databases; never load production credentials here.
const crypto=require('node:crypto');
const {regionForVendor}=require('../national-broadcast');
async function seedLegacyOwnerRequest(f,{companyId='existing',phone='01000000001',id=crypto.randomUUID(),name='테스트 대표'}={}){
 if(f.secret!=='isolated-vendor-portal-test-secret-0001')throw Error('Isolated fixture required');
 const recordKey='creo_vendor_access_v1::directory',key=crypto.createHash('sha256').update('vendor-access:'+f.secret).digest();
 const stored=(await f.repository.getRowsByKeys([recordKey]))[0],x=JSON.parse(stored.value);
 const d=crypto.createDecipheriv('aes-256-gcm',key,Buffer.from(x.iv,'base64url'));d.setAAD(Buffer.from(recordKey));d.setAuthTag(Buffer.from(x.tag,'base64url'));
 const state=JSON.parse(Buffer.concat([d.update(Buffer.from(x.data,'base64url')),d.final()])),actor=state.actors.find(a=>a.phone===phone);
 if(!actor)throw Error('Log in the fixture applicant first');
 const v=await f.directory.find('national-cre',companyId);
 const fingerprint=crypto.createHmac('sha256',key).update(JSON.stringify([v.id,v.directoryId||'',v.name,v.phone||'',regionForVendor(v),v.bankName||'',v.bankAccount||'',v.bankHolder||''])).digest('base64url');
 const r={id,companyId,actorId:actor.id,phone,name,companyName:v.name,region:'대구·경북',fingerprint,status:'pending',createdAt:Date.parse('2026-09-23T00:00:00Z')};
 state.ownerSetups=[...(state.ownerSetups||[]),r];state.version++;
 const iv=crypto.randomBytes(12),c=crypto.createCipheriv('aes-256-gcm',key,iv);c.setAAD(Buffer.from(recordKey));const data=Buffer.concat([c.update(JSON.stringify(state)),c.final()]);
 await f.repository.upsertRows([{key:recordKey,value:JSON.stringify({iv:iv.toString('base64url'),tag:c.getAuthTag().toString('base64url'),data:data.toString('base64url')})}]);
 return r;
}
module.exports={seedLegacyOwnerRequest};
