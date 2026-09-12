'use strict';

const crypto = require('node:crypto');
const {inquiryPhone}=require('./public/checkout-inquiry');
const KEY = 'vendor_directory_v1';
const FIELDS = ['name','manager','phone','inquiryPhone','inquiryPhoneMode','kakaoUrl','bankName','bankAccount','bankHolder','paymentMethods','cardPaymentEnabled','logoUrl','address'];
const locks = new WeakMap();
const fail = (message, status=409) => Object.assign(new Error(message), {status});

// One durable document commits identity, profile and membership together.
// Local channel vendor records remain independent participation records.
function createVendorDirectory(repository) {
    async function read() {
        const rows = await repository.getRowsByKeys([KEY]);
        const row = rows.find(row=>row.key===KEY);
        if (!row) return {version:1,profiles:[]};
        const value = JSON.parse(row.value);
        if (value.version!==1 || !Array.isArray(value.profiles)) throw fail('공통 업체 정보를 읽을 수 없습니다.',503);
        return value;
    }
    function mutate(work) {
        const previous=locks.get(repository)||Promise.resolve();
        const next=previous.catch(()=>{}).then(async()=>{
            const directory=await read();
            const result=await work(directory);
            await repository.upsertRows([{key:KEY,value:JSON.stringify(directory)}]);
            return result;
        });
        locks.set(repository,next);return next;
    }
    function member(profile,channelId,vendorId) { return profile.members.some(m=>m.channelId===channelId&&m.vendorId===vendorId); }
    const pick = record => ({...Object.fromEntries(FIELDS.filter(key=>record[key]!==undefined).map(key=>[key,record[key]])),inquiryPhone:inquiryPhone(record),inquiryPhoneMode:record.inquiryPhoneMode==='shared'?'shared':'separate'});
    // The shared profile is authoritative even when a legacy profile has no mode.
    // A channel-row write from a failed save must not change contact visibility.
    function hydrate(record,profile) { return profile?{...record,...profile.info,inquiryPhoneMode:profile.info.inquiryPhoneMode==='shared'?'shared':'separate',directoryId:profile.id,directoryRevision:profile.revision}:record; }
    async function list(channelId) {
        const [records,directory]=await Promise.all([repository.listRecords(channelId,'vendor'),read()]);
        return records.map(record=>hydrate(record,directory.profiles.find(p=>member(p,channelId,record.id))));
    }
    async function find(channelId,vendorId) { return (await list(channelId)).find(v=>v.id===vendorId)||null; }
    async function profileFor(channelId,vendorId) { return (await read()).profiles.find(p=>member(p,channelId,vendorId))||null; }
    async function enroll(channelId,vendorId) {
        return mutate(async directory=>{
            const existing=directory.profiles.find(p=>member(p,channelId,vendorId));if(existing)return existing;
            const record=await repository.getRecord(channelId,'vendor',vendorId);
            if(!record)throw fail('업체를 찾을 수 없습니다.',404);
            const profile={id:crypto.randomUUID(),revision:1,info:pick(record),members:[{channelId,vendorId}],home:{channelId,vendorId},createdAt:new Date().toISOString()};
            directory.profiles.push(profile);return profile;
        });
    }
    async function attach(profileId,channelId) {
        return mutate(async directory=>{
            const profile=directory.profiles.find(p=>p.id===profileId);if(!profile)throw fail('공통 업체를 찾을 수 없습니다.',404);
            const existing=profile.members.find(m=>m.channelId===channelId);if(existing)return existing;
            // Stable ID makes retry after a storage failure safe, without merging names.
            const vendorId='shared-'+profile.id.replaceAll('-','');
            const record=await repository.getRecord(channelId,'vendor',vendorId);
            if(!record)await repository.upsertRecord(channelId,'vendor',{id:vendorId,...profile.info,active:true,createdAt:new Date().toISOString()});
            const entry={channelId,vendorId};profile.members.push(entry);profile.revision++;return entry;
        });
    }
    async function update(channelId,record,expectedRevision,{firstBankOnly=false}={}) {
        return mutate(async directory=>{
            const profile=directory.profiles.find(p=>member(p,channelId,record.id));
            if(record.inquiryPhone===undefined||record.inquiryPhoneMode===undefined){
                const previous=profile?.info||await repository.getRecord(channelId,'vendor',record.id);
                record={...record,inquiryPhone:record.inquiryPhone??inquiryPhone(previous),inquiryPhoneMode:record.inquiryPhoneMode??previous?.inquiryPhoneMode??'separate'};
            }
            if(record.inquiryPhoneMode==='shared')record={...record,inquiryPhone:inquiryPhone(record)};
            if(!profile)return repository.upsertRecord(channelId,'vendor',record);
            if(Number(expectedRevision)!==profile.revision)throw fail('다른 화면에서 업체 정보가 변경되었습니다. 새로고침 후 다시 저장해 주세요.');
            if(firstBankOnly&&['bankName','bankAccount','bankHolder'].some(k=>profile.info[k])&&['bankName','bankAccount','bankHolder'].some(k=>(record[k]||'')!==(profile.info[k]||'')))throw fail('등록된 계좌 변경은 운영자에게 요청해 주세요.');
            if(['bankName','bankAccount','bankHolder'].every(k=>profile.info[k])&&['bankName','bankAccount','bankHolder'].some(k=>record[k]!==profile.info[k])) {
                for(const m of profile.members)for(const shipment of await repository.listRecords(m.channelId,'shipment')) {
                    if(shipment.vendorId===m.vendorId&&shipment.buyerSubmittedAt&&!shipment.bankSnapshot)await repository.upsertRecord(m.channelId,'shipment',{...shipment,bankSnapshot:{bankName:profile.info.bankName||'',bankAccount:profile.info.bankAccount||'',bankHolder:profile.info.bankHolder||''}});
                }
            }
            await repository.upsertRecord(channelId,'vendor',record);
            profile.info={...profile.info,...pick(record)};profile.revision++;profile.updatedAt=new Date().toISOString();
            return hydrate(record,profile);
        });
    }
    return {read,list,find,profileFor,enroll,attach,update};
}
module.exports={createVendorDirectory};
