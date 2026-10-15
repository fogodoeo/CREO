'use strict';
const crypto=require('node:crypto');
const Model=require('./item-sheet-model');
const KEY='vendor_entries_v1::';
const fail=message=>{throw new Error(message);};
const uuid=seed=>{const h=crypto.createHash('sha256').update(seed).digest('hex');return h.slice(0,8)+'-'+h.slice(8,12)+'-4'+h.slice(13,16)+'-a'+h.slice(17,20)+'-'+h.slice(20,32);};

function createEntryBridge({directory,entries}){
    async function contexts(channel,data){
        const result=[];
        for(const vendor of data.vendors.filter(v=>v.active!==false)){
            const profile=await directory.profileFor(channel.id,vendor.id);
            if(profile)result.push({channel,vendor,profile});
        }
        return result;
    }
    async function withLocks(channel,data,work){
        const rows=await contexts(channel,data),ids=[...new Set(rows.map(c=>c.profile.id))].sort();
        const next=i=>i===ids.length?work():entries.withOwnerLock(ids[i],()=>next(i+1));
        return next(0);
    }
    async function load(channel,data){
        const sources=new Map(),virtual=[];
        for(const context of await contexts(channel,data)){
            const ownerId=context.profile.id;
            let state=sources.get(ownerId);
            if(!state){state=await entries.sheetAccess.readOwner(ownerId);sources.set(ownerId,state);}
            for(const entry of state.entries.filter(e=>e.channelId===channel.id&&e.channelVendorId===context.vendor.id&&['draft','submitted','changes_requested'].includes(e.status)&&!e.itemId&&!e.approved)){
                const id='entry-'+entry.id;if(data.items.some(i=>i.id===id))continue;
                const facts=await entries.sheetAccess.facts(state,entry);
                virtual.push({id,channelId:channel.id,name:entry.sheetLot||entry.code,vendorId:context.vendor.id,vendorName:context.vendor.name,
                    lotNumber:100000+(entry.entryNumber||0),status:'waiting',startPrice:entry.sheetStartPrice||0,category:facts.morph,note:facts.note,photoUrl:facts.media[0]?.url||'',
                    createdAt:entry.createdAt||entry.updatedAt,updatedAt:entry.updatedAt,
                    attributes:{entry_traits:facts,parents:facts.parents},
                    _sheetEntry:{ownerId,entryId:entry.id,version:entry.version,status:entry.status,code:entry.code,vendorId:context.vendor.id}});
            }
        }
        data.items=data.items.concat(virtual);data.sheetSources=sources;return data;
    }
    function prepare(channel,data,writes,stamp){
        const changed=new Map(),items=[];
        for(const item of writes){
            const ref=item._sheetEntry;if(!ref){items.push(item);continue;}
            let state=changed.get(ref.ownerId);
            if(!state){const original=data.sheetSources.get(ref.ownerId);if(!original)fail('출품 업체를 다시 확인해 주세요.');state=structuredClone(original);changed.set(ref.ownerId,state);}
            const entry=state.entries.find(e=>e.id===ref.entryId&&e.channelId===channel.id&&e.channelVendorId===item.vendorId);
            if(!entry||entry.version!==ref.version||entry.itemId||entry.approved||!['draft','submitted','changes_requested'].includes(entry.status))fail('출품 상태가 바뀌었어요. 다시 확인해요.');
            const prior=data.items.find(i=>i.id===item.id),before=Model.exported(prior,data.vendors),values=Model.exported(item,data.vendors);
            const media=(url,tag)=>{
                if(!url)return '';
                const id='sheet-'+crypto.createHash('sha256').update(entry.id+'\n'+tag+'\n'+url).digest('hex').slice(0,40);
                if(!state.media.some(m=>m.id===id))state.media.push({id,vendorId:ref.ownerId,url,thumbnailUrl:url,size:0,thumbnailSize:0,source:'sheet-link',createdAt:stamp});
                return id;
            };
            const fields={...entry,morph:values[5],sex:({수컷:'male',암컷:'female',미구분:'unknown'})[values[2]]||'unknown',weight:values[3],hatchDate:values[4],note:values[6]};
            if(before[8]!==values[8])fields.photoIds=[media(values[8],'item'),...(entry.photoIds||[]).slice(1)].filter(Boolean);
            for(const [role,ni,pi]of [['sire',9,10],['dam',11,12]]){
                if(before[ni]===values[ni]&&before[pi]===values[pi])continue;
                if(!values[ni]&&!values[pi]){fields[role+'Id']='';continue;}
                const old=state.parents.find(p=>p.id===entry[role+'Id'])||{},id=uuid('sheet-parent:'+entry.id+':'+role),existing=state.parents.find(p=>p.id===id);
                const parent={...old,id,vendorId:ref.ownerId,name:values[ni],code:'sheet-'+entry.entryNumber+'-'+entry.id.slice(0,8)+'-'+role,sourceId:'',sex:role==='sire'?'male':'female',photoId:before[pi]===values[pi]?old.photoId||'':media(values[pi],role),version:(existing?.version||0)+1,updatedAt:stamp};
                if(existing)state.parentHistory.push({...existing,replacedAt:stamp});
                state.parents=state.parents.filter(p=>p.id!==id).concat(parent);fields[role+'Id']=id;
            }
            Object.assign(entry,entries.sheetAccess.normalize(fields),{sheetLot:values[0]===entry.code?'':values[0],sheetStartPrice:item.startPrice,version:entry.version+1,updatedAt:stamp});
            if(entry.status==='submitted')entry.submission=entries.sheetAccess.snapshot(state,entry);
        }
        const rows=[...changed].map(([ownerId,state])=>{state.version++;return {key:KEY+ownerId,value:JSON.stringify(state)};});
        return {items,rows};
    }
    return {withLocks,load,prepare};
}
module.exports={createEntryBridge};
