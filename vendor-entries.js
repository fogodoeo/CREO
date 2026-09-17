'use strict';

const crypto = require('node:crypto');
const { cleanText, channelKey } = require('./platform-core');
const { normalizePhone } = require('./band-membership');
const { imageUrl } = require('./public/checkout-item-view');
const { privatePhotoReference } = require('./entry-photo-storage');
const Numbering = require('./public/entry-numbering');
const locks = new WeakMap();
const KEY = 'vendor_entries_v1::';
const uuid = value => /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(String(value || ''));
const fail = (text, status = 409) => Object.assign(new Error(text), { status });
const copy = value => structuredClone(value);
const hash = value => crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex');
const empty = ownerId => ({ schema:1, version:0, ownerId, entries:[], parents:[], parentHistory:[], media:[], requests:[] });

function normalizeEntry(input = {}) {
    const weight=cleanText(input.weight,8), hatchDate=cleanText(input.hatchDate,10);
    if(weight && (!/^\d+(\.\d{1,2})?$/.test(weight)||Number(weight)<=0||Number(weight)>1000))throw fail('체중은 0보다 크고 1,000g 이하로 입력해 주세요.',422);
    if(hatchDate && (!/^\d{4}-\d{2}-\d{2}$/.test(hatchDate)||!Number.isFinite(Date.parse(hatchDate))||new Date(hatchDate).toISOString().slice(0,10)!==hatchDate))throw fail('해칭일을 다시 확인해 주세요.',422);
    const sourceId=uuid(input.sourceId)?input.sourceId.toLowerCase():'';
    return {
        morph:cleanText(input.morph,60), sex:['male','female','unknown'].includes(input.sex)?input.sex:'unknown',
        weight, hatchDate, size:['베이비','아성체','준성체','성체'].includes(input.size)?input.size:'', note:cleanText(input.note,600),
        photoIds:[...new Set(Array.isArray(input.photoIds)?input.photoIds:[])].slice(0,3).map(id=>cleanText(id,80)),
        sireId:cleanText(input.sireId,80), damId:cleanText(input.damId,80),
        sourceId, sourceUrl:sourceId?`https://www.feedle.me/pet/${sourceId}`:''
    };
}

function createVendorEntries(repository, { resolveMediaUrl = async value => value, maxMediaBytes = 100000000 } = {}) {
    maxMediaBytes=Number.isSafeInteger(maxMediaBytes)&&maxMediaBytes>0?maxMediaBytes:100000000;
    async function resolvePhoto(photo) {
        const result = { ...photo };
        for (const field of ['url', 'thumbnailUrl']) {
            if (!privatePhotoReference(result[field])) continue;
            try { result[field] = await resolveMediaUrl(result[field]); }
            catch { /* Keep a non-public reference; a storage outage must not block checkout. */ }
        }
        return result;
    }
    async function resolveFacts(facts) {
        if (!facts) return facts;
        return { ...facts,
            ...(facts.media ? { media: await Promise.all(facts.media.map(resolvePhoto)) } : {}),
            ...(facts.parents ? { parents: await Promise.all(facts.parents.map(resolveFacts)) } : {})
        };
    }
    function owner(context) {
        const id=context.profile?.id;
        if(!uuid(id))throw fail('업체 정보를 다시 불러와 주세요.',409);
        if(!context.profile.members.some(member=>member.channelId===context.channel.id&&member.vendorId===context.vendor.id))throw fail('해당 경매의 업체 권한이 없습니다.',403);
        return id;
    }
    async function readOwner(ownerId) {
        if(!uuid(ownerId))throw fail('업체 자료를 확인할 수 없습니다.',403);
        const rows=await repository.getRowsByKeys([KEY+ownerId]),row=rows.find(row=>row.key===KEY+ownerId);
        if(!row)return empty(ownerId);
        let state;
        try{state=JSON.parse(row.value)}catch{throw fail('출품 자료를 읽지 못했습니다. 운영자에게 문의해 주세요.',503)}
        if(state.schema!==1||state.ownerId!==ownerId||!['entries','parents','parentHistory','media','requests'].every(key=>Array.isArray(state[key])))throw fail('출품 자료를 읽지 못했습니다. 운영자에게 문의해 주세요.',503);
        return state;
    }
    function locked(ownerId, work) {
        let map=locks.get(repository);if(!map){map=new Map();locks.set(repository,map)}
        const next=(map.get(ownerId)||Promise.resolve()).catch(()=>{}).then(work);map.set(ownerId,next);
        return next.finally(()=>{if(map.get(ownerId)===next)map.delete(ownerId)});
    }
    function photos(state, ids) {
        return (ids||[]).filter(Boolean).map(id=>{
            const media=state.media.find(media=>media.id===id);
            if(!media)throw fail('사진을 다시 선택해 주세요.',422);
            return {url:media.url,thumbnailUrl:media.thumbnailUrl,label:media.label||''};
        });
    }
    function parent(state, id, role) {
        if(!id)return null;
        const value=state.parents.find(parent=>parent.id===id);
        if(!value||value.sex!==(role==='sire'?'male':'female'))throw fail('부·모 정보를 다시 선택해 주세요.',422);
        return value;
    }
    function parentPhotos(state, source) {
        return ['sire','dam'].map(role=>{
            const value=parent(state,source[role+'Id'],role);
            return value?{role,id:value.id,name:value.name,morph:value.morph,version:value.version,media:photos(state,[value.photoId])}:null;
        }).filter(Boolean);
    }
    function snapshot(state, entry) { return {...normalizeEntry(entry), media:photos(state,entry.photoIds), parents:parentPhotos(state,entry)}; }
    function entriesOpen(context, policy) { return ['draft','active'].includes(context.channel.status)&&policy.open===true; }
    async function policy(channelId) {
        const value=await repository.getRecord(channelId,'setting','entry-policy');
        // Existing live auctions are closed until the operator opens intake.
        return {open:value?.open===true,revision:Number(value?.revision)||0};
    }
    async function summary(context) {
        const currentPolicy = await policy(context.channel.id);
        const state = context.profile ? await readOwner(owner(context)) : null;
        return {entriesOpen:entriesOpen(context,currentPolicy),entryCount:state ? state.entries.filter(entry => entry.status !== 'deleted' && entry.channelId === context.channel.id && entry.channelVendorId === context.vendor.id).length : 0};
    }
    function view(state, context) {
        const memberships=context.profile.members;
        const entries=state.entries.filter(entry=>entry.status!=='deleted'&&memberships.some(member=>member.channelId===entry.channelId&&member.vendorId===entry.channelVendorId));
        const mediaIds=new Set([...state.parents.map(parent=>parent.photoId),...entries.flatMap(entry=>[...(entry.photoIds||[]),...(entry.approved?.photoIds||[]),...(entry.submission?.photoIds||[])])].filter(Boolean));
        // Recent unattached uploads survive a lost response or an interrupted draft.
        const recent = new Set(state.media.filter(media=>!mediaIds.has(media.id)).slice(-12).map(media=>media.id));
        return {version:state.version,ownerId:state.ownerId,entries:copy(entries),parents:copy(state.parents),media:copy(state.media.filter(media=>mediaIds.has(media.id)||recent.has(media.id))),mediaUsage:{bytes:state.media.reduce((sum,media)=>sum+media.size+media.thumbnailSize,0),limitBytes:maxMediaBytes}};
    }
    async function read(context) {
        const state=await readOwner(owner(context));
        const events=await Promise.all(context.profile.members.map(async member=>{
            const channel=context.catalog.channels.find(channel=>channel.id===member.channelId);
            return channel?{id:channel.id,name:channel.name,status:channel.status,entriesOpen:entriesOpen({...context,channel},await policy(channel.id))}:null;
        }));
        const visible=view(state,context);
        visible.media=await Promise.all(visible.media.map(resolvePhoto));
        visible.entries=await Promise.all(visible.entries.map(async entry=>({...entry,
            ...(entry.approved?{approved:await resolveFacts(entry.approved)}:{}),
            ...(entry.submission?{submission:await resolveFacts(entry.submission)}:{})
        })));
        return {...visible,events:events.filter(Boolean),channelId:context.channel.id,vendor:{id:context.vendor.id,name:context.vendor.name},homeSection:(context.items||[]).some(item=>item.vendorId===context.vendor.id&&item.status==='sold')?'settlement':'entries'};
    }
    async function command(context, input, { operator=false }={}) {
        const ownerId=owner(context),type=String(input.type||'');
        const allowed=operator?['approve','request-changes']:['save','submit','withdraw','revise','parent','import','delete'];
        if(!allowed.includes(type))throw fail('이 작업을 실행할 수 없습니다.',403);
        const requestId=cleanText(input.requestId,80);
        if(requestId.length<8)throw fail('요청을 다시 확인해 주세요.',422);
        const signature=hash({type,entry:input.entry,parent:input.parent,parents:input.parents,id:input.id,expectedVersion:input.expectedVersion,lot:input.lot,order:input.order,startPrice:input.startPrice,teamName:input.teamName,groupId:input.groupId,reason:input.reason});
        const execute=()=>locked(ownerId,async()=>{
            const state=await readOwner(ownerId),key=context.channel.id+':'+type+':'+requestId;
            const previous=state.requests.find(request=>request.key===key);
            if(previous){if(previous.signature!==signature)throw fail('같은 요청으로 다른 내용을 저장할 수 없습니다. 다시 시도해 주세요.');return {state:await read(context),result:previous.result,duplicate:true}}
            if(type!=='parent'&&!(operator||type==='delete'?['draft','active'].includes(context.channel.status):entriesOpen(context,await policy(context.channel.id))))throw fail('출품 접수가 마감됐어요. 운영자에게 문의해 주세요.');
            if(type==='parent'&&!['active','draft'].includes(context.channel.status))throw fail('진행 중인 경매의 업체 페이지에서 부모 정보를 수정해 주세요.');
            const now=new Date().toISOString();let result,item=null;
            if(type==='import'){
                const normalized=normalizeEntry(input.entry),id=cleanText(input.entry?.id,80);
                if(normalized.morph&&!normalized.note.startsWith('모프: '+normalized.morph))normalized.note=['모프: '+normalized.morph,normalized.note].filter(Boolean).join('\n').slice(0,600);
                if(!uuid(id)||!normalized.sourceId)throw fail('피들 링크를 다시 불러와 주세요.',422);
                const duplicate=state.entries.find(entry=>entry.status!=='deleted'&&entry.channelId===context.channel.id&&entry.sourceId===normalized.sourceId);
                if(duplicate)return {state:await read(context),result:duplicate.id,duplicate:true};
                if(state.entries.some(entry=>entry.id===id))throw fail('이미 사용한 출품 번호예요. 다시 불러와 주세요.');
                for(const role of ['sire','dam']){
                    const raw=input.parents?.[role];normalized[role+'Id']='';if(!raw)continue;
                    if(!uuid(raw.sourceId)||!uuid(raw.id))throw fail('부모 링크 정보를 다시 확인해 주세요.',422);
                    let existing=state.parents.find(parent=>parent.sourceId===raw.sourceId.toLowerCase());
                    const sex=role==='sire'?'male':'female';
                    if(existing&&existing.sex!==sex)throw fail('등록한 부모의 성별이 달라요. 부모 목록을 확인해 주세요.',422);
                    if(!existing){
                        if(state.parents.some(parent=>parent.id===raw.id))throw fail('부모 정보가 변경됐어요. 다시 불러와 주세요.');
                        const value={id:raw.id,vendorId:ownerId,name:cleanText(raw.name,40),code:cleanText(raw.code,30),morph:cleanText(raw.morph,60),sex,photoId:cleanText(raw.photoId,80),sourceId:raw.sourceId.toLowerCase(),version:1,updatedAt:now};
                        if(!value.name&&!value.code)throw fail('부모 이름을 입력해 주세요.',422);
                        if(value.code&&state.parents.some(parent=>parent.code.toLowerCase()===value.code.toLowerCase()))throw fail('같은 관리번호의 부모가 있어요. 기존 부모를 선택해 주세요.');
                        photos(state,[value.photoId]);state.parents.push(value);existing=value;
                    }
                    normalized[role+'Id']=existing.id;
                }
                const entryNumber=Math.max(0,...state.entries.filter(entry=>entry.channelId===context.channel.id).map(entry=>entry.entryNumber))+1;
                const entry={...normalized,id,vendorId:ownerId,channelVendorId:context.vendor.id,channelId:context.channel.id,entryNumber,code:`출품 ${String(entryNumber).padStart(2,'0')}`,version:1,status:'draft',updatedAt:now};
                snapshot(state,entry);state.entries.push(entry);result=id;
            }else if(type==='parent'){
                const raw=input.parent||{},id=cleanText(raw.id,80),current=state.parents.find(parent=>parent.id===id);
                if(!uuid(id))throw fail('부모 정보를 다시 열어 주세요.',422);
                if(current&&current.version!==input.expectedVersion)throw fail('다른 화면에서 부모 정보가 변경됐어요. 다시 확인해 주세요.');
                const value={id,vendorId:ownerId,name:cleanText(raw.name,40),code:cleanText(raw.code,30),morph:cleanText(raw.morph,60),sex:raw.sex,photoId:cleanText(raw.photoId,80),sourceId:current?.sourceId||(uuid(raw.sourceId)?raw.sourceId.toLowerCase():''),version:(current?.version||0)+1,updatedAt:now};
                if((!value.name&&!value.code)||!['male','female'].includes(value.sex))throw fail('부모 이름 또는 관리번호와 성별을 입력해 주세요.',422);
                if(current&&current.sex!==value.sex)throw fail('연결된 개체를 위해 부모의 성별은 변경할 수 없습니다.');
                if(state.parents.some(parent=>parent.id!==id&&((value.code&&parent.code.toLowerCase()===value.code.toLowerCase())||(value.sourceId&&parent.sourceId===value.sourceId))))throw fail('같은 부모가 이미 등록돼 있어요. 목록에서 선택해 주세요.');
                photos(state,[value.photoId]);
                if(current)state.parentHistory.push({...copy(current),replacedAt:now});
                state.parents=state.parents.filter(parent=>parent.id!==id).concat(value);result=id;
            }else if(['save','submit'].includes(type)){
                const id=cleanText(input.entry?.id,80),current=state.entries.find(entry=>entry.id===id);
                if(!uuid(id))throw fail('출품 화면을 다시 열어 주세요.',422);
                if(current&&(current.channelId!==context.channel.id||current.channelVendorId!==context.vendor.id))throw fail('이 출품을 수정할 수 없습니다.',403);
                if(current&&(current.version!==input.expectedVersion||!['draft','changes_requested'].includes(current.status)))throw fail('출품 상태가 변경됐어요. 목록에서 다시 열어 주세요.');
                const normalized=normalizeEntry(input.entry);
                if(normalized.sourceId&&state.entries.some(entry=>entry.status!=='deleted'&&entry.id!==id&&entry.channelId===context.channel.id&&entry.sourceId===normalized.sourceId))throw fail('이미 가져온 피들 개체예요. 기존 출품을 확인해 주세요.');
                const entryNumber=current?.entryNumber||Math.max(0,...state.entries.filter(entry=>entry.channelId===context.channel.id).map(entry=>entry.entryNumber))+1;
                const entry={...normalized,id,vendorId:ownerId,channelVendorId:context.vendor.id,channelId:context.channel.id,entryNumber,code:`출품 ${String(entryNumber).padStart(2,'0')}`,version:(current?.version||0)+1,status:type==='submit'?'submitted':'draft',updatedAt:now,...(current?.approved?{approved:current.approved,itemId:current.itemId,lot:current.lot}: {})};
                const facts=snapshot(state,entry);
                if(type==='submit'){
                    if(!normalizePhone(context.vendor.phone)||!['bankName','bankAccount','bankHolder'].every(field=>cleanText(context.vendor[field],100)))throw fail('업체 연락처와 계좌를 먼저 등록해 주세요.',422);
                    entry.submission=facts;
                }
                state.entries=state.entries.filter(entry=>entry.id!==id).concat(entry);result=id;
            }else{
                const entry=state.entries.find(entry=>entry.id===input.id&&entry.channelId===context.channel.id&&entry.channelVendorId===context.vendor.id);
                if(!entry)throw fail('출품을 찾을 수 없습니다.',404);
                if(entry.version!==input.expectedVersion)throw fail('출품이 변경됐어요. 내용을 다시 확인해 주세요.');
                if(type==='delete'){
                    if(!['draft','submitted','changes_requested'].includes(entry.status)||entry.itemId||entry.approved)throw fail('이미 편성된 개체는 삭제할 수 없어요. 운영자에게 문의해 주세요.');
                    const items=await repository.listRecords(context.channel.id,'item');
                    if(items.some(item=>item.id==='entry-'+entry.id||item.attributes?.vendor_entry?.entryId===entry.id))throw fail('이미 경매에 반영된 개체예요. 목록을 다시 확인해 주세요.');
                    // Keep a tombstone and its original references: stale saves cannot recreate
                    // this entry, and deleting one offspring never deletes shared parent photos.
                    entry.status='deleted';entry.deletedAt=now;
                }else if(type==='revise'){
                    if(entry.status!=='approved')throw fail('편성된 개체만 변경안을 만들 수 있습니다.');
                    entry.status='draft';delete entry.submission;
                }else{
                    if(entry.status!=='submitted')throw fail('검토 중인 출품만 처리할 수 있습니다.');
                    if(type==='approve'){
                        const lot=Numbering.normalize(cleanText(input.lot,16)),order=Number(input.order),startPrice=Number(input.startPrice||0);
                        if(!Numbering.valid(lot)||!Number.isInteger(order)||order<1||order>10000||!Number.isSafeInteger(startPrice)||startPrice<0)throw fail('경매 번호·순서·시작가를 확인해 주세요.',422);
                        const items=await repository.listRecords(context.channel.id,'item'),itemId=entry.itemId||'entry-'+entry.id,existing=items.find(item=>item.id===itemId);
                        if(existing&&!canArrange(existing))throw fail('입찰이 시작된 개체는 출품 변경안으로 덮어쓸 수 없습니다.');
                        if(!entry.itemId&&existing)throw fail('연결할 개체를 확인해 주세요.');
                        if(existing&&(existing.vendorId!==context.vendor.id||existing.attributes?.vendor_entry?.ownerId!==ownerId||existing.attributes?.vendor_entry?.entryId!==entry.id))throw fail('편성된 개체의 업체 또는 연결 정보가 변경됐어요. 다시 확인해 주세요.');
                        if(items.some(item=>item.id!==itemId&&(String(item.attributes?.displayNumber||item.name).toUpperCase()===lot||Number(item.lotNumber)===order)))throw fail('이미 사용 중인 경매 번호 또는 순서입니다.');
                        const facts=entry.submission;
                        const groupId=cleanText(input.groupId??existing?.groupId??context.vendor.groupId,64),group=context.channel.groups?.find(group=>group.id===groupId);
                        if(groupId&&!group)throw fail('이 경매에 등록된 팀을 선택해 주세요.',422);
                        const teamName=group?.name||cleanText(input.teamName??existing?.teamName??context.vendor.teamName,60);
                        const safe=value=>String(value||'').replace(/[|:]/g,' ');
                        item={...(existing||{}),id:itemId,lotNumber:order,name:lot,vendorId:context.vendor.id,vendorName:context.vendor.name,groupId,teamName,category:facts.morph,status:'waiting',startPrice,soldPrice:0,photoUrl:facts.media[0]?.url||'',createdAt:existing?.createdAt||now,updatedAt:now,attributes:{...(existing?.attributes||{}),checklist:`gender:${{male:'M',female:'F',unknown:''}[facts.sex]}|weight:${facts.weight}|morph:${safe(facts.morph)}|size:${safe(facts.size)}`,displayNumber:lot,entry_traits:{morph:facts.morph,sex:facts.sex,weight:facts.weight,size:facts.size,hatchDate:facts.hatchDate},media:facts.media,parents:facts.parents,vendor_entry:{ownerId,entryId:entry.id}}};
                        item.note=facts.note;
                        entry.approved={...copy(facts),approvedAt:now};entry.itemId=itemId;entry.lot=lot;entry.status='approved';
                    }else{
                        const reason=cleanText(input.reason,200);
                        if(type==='request-changes'&&!reason)throw fail('수정할 내용을 입력해 주세요.',422);
                        entry.status=type==='withdraw'?'draft':'changes_requested';entry.reason=reason;delete entry.submission;
                    }
                }
                entry.version++;entry.updatedAt=now;result=entry.id;
            }
            state.version++;state.requests.push({key,signature,result});state.requests=state.requests.slice(-500);
            const rows=[{key:KEY+ownerId,value:JSON.stringify(state)}];
            if(item)rows.push({key:channelKey(context.channel.id,'item',item.id),value:JSON.stringify(item)});
            await repository.upsertRows(rows);
            return {state:await read(context),result,duplicate:false,itemId:item?.id||null};
        });
        return operator?locked('review:'+context.channel.id,execute):execute();
    }
    function canArrange(item) {
        if(item.status!=='waiting'||item.winnerPhone||item.winnerName||Number(item.soldPrice)>0)return false;
        try {const log=item.attributes?.bid_log;return !log||(Array.isArray(log)?log:JSON.parse(log)).length===0;} catch{return false;}
    }
    function nextItemTimestamp(item) {
        return new Date(Math.max(Date.now(),(Date.parse(item.updatedAt)||0)+1)).toISOString();
    }
    // Stage the existing single-entry command behind all participating owner locks.
    // No item or owner document reaches durable storage until the whole batch succeeds.
    async function batch(channel, contexts, input, { random=Math.random }={}) {
        const requestId=cleanText(input.requestId,80),signature=hash(input),type=input.type;
        if(requestId.length<8||!['approve-many','arrange'].includes(type))throw fail('작업을 다시 선택해 주세요.',422);
        const owners=[...new Set(contexts.map(owner))].sort();
        const lockOwners=(n,work)=>n<owners.length?locked(owners[n],()=>lockOwners(n+1,work)):work();
        return locked('review:'+channel.id,()=>lockOwners(0,async()=>{
            const journal=await repository.getRecord(channel.id,'setting','entry-batch-log')||{id:'entry-batch-log',requests:[]};
            const prior=journal.requests.find(r=>r.id===requestId);
            if(prior){if(prior.signature!==signature)throw fail('다른 내용의 요청입니다. 새로고침 후 다시 시도해 주세요.');return {...prior.result,duplicate:true};}
            if(!['draft','active'].includes(channel.status))throw fail('진행 가능한 경매에서만 편성할 수 있어요.');
            const items=await repository.listRecords(channel.id,'item');
            if(items.some(item=>item.status==='live'))throw fail('경매 진행 중에는 편성을 바꿀 수 없어요. 진행을 마친 뒤 다시 시도해 주세요.');
            const staged=new Map();
            const stage={
                getRowsByKeys:async keys=>{const stored=await repository.getRowsByKeys(keys);return keys.map(key=>staged.get(key)||stored.find(r=>r.key===key)).filter(Boolean);},
                getRecord:async(c,t,id)=>{const row=staged.get(channelKey(c,t,id));return row?JSON.parse(row.value):repository.getRecord(c,t,id);},
                listRecords:async(c,t)=>{const result=new Map((await repository.listRecords(c,t)).map(r=>[r.id,r]));for(const row of staged.values())if(row.key.startsWith(channelKey(c,t,'')+'::')) {const value=JSON.parse(row.value);result.set(value.id,value);}return [...result.values()];},
                upsertRows:async rows=>{for(const row of rows)staged.set(row.key,{...row});}
            };
            let result;
            if(type==='approve-many'){
                const selection=input.entries;
                if(!Array.isArray(selection)||!selection.length||selection.length>120||selection.some(s=>!s||!s.id||!s.vendorId)||new Set(selection.map(s=>s.id)).size!==selection.length||!Numbering.parts.includes(input.part))throw fail('출품할 개체와 부를 선택해 주세요. 한 번에 120마리까지 가능해요.',422);
                const service=createVendorEntries(stage,{resolveMediaUrl,maxMediaBytes}),itemIds=[];
                for(let index=0;index<selection.length;index++){
                    const row=selection[index],context=contexts.find(c=>c.vendor.id===row.vendorId);
                    if(!context||context.channel.id!==channel.id)throw fail('출품 업체를 다시 확인해 주세요.',403);
                    const state=await stage.getRowsByKeys([KEY+owner(context)]),entry=state[0]&&JSON.parse(state[0].value).entries.find(e=>e.id===row.id&&e.channelId===channel.id&&e.channelVendorId===row.vendorId);
                    if(!entry||entry.version!==row.expectedVersion)throw fail('선택한 출품이 변경됐어요. 새로고침 후 다시 선택해 주세요.');
                    const currentItems=await stage.listRecords(channel.id,'item'),existing=currentItems.find(i=>i.id===entry.itemId);
                    let order=existing?.lotNumber||Math.max(0,...currentItems.map(i=>Number(i.lotNumber)||0))+1;
                    if(!existing){
                        const nextPart=currentItems.filter(i=>Numbering.parts.indexOf(Numbering.partOf(i.attributes?.displayNumber||i.name))>Numbering.parts.indexOf(input.part)).sort((a,b)=>a.lotNumber-b.lotNumber)[0];
                        if(nextPart){
                            order=Number(nextPart.lotNumber);
                            const shifted=currentItems.filter(i=>Number(i.lotNumber)>=order);
                            if(shifted.some(i=>!canArrange(i)))throw fail('뒤 순서에 입찰·낙찰 기록이 있어요. 진행 중인 편성을 확인해 주세요.');
                            if(shifted.some(i=>!Number.isInteger(i.lotNumber)||i.lotNumber>=10000))throw fail('진행 순서가 범위를 벗어났어요. 경매 운영에서 확인해 주세요.');
                            await stage.upsertRows(shifted.map(i=>({key:channelKey(channel.id,'item',i.id),value:JSON.stringify({...i,lotNumber:i.lotNumber+1,updatedAt:nextItemTimestamp(i)})})));
                        }
                    }
                    const approved=await service.command(context,{type:'approve',requestId:requestId.slice(0,65)+'-'+index,id:row.id,expectedVersion:row.expectedVersion,lot:existing?.attributes?.displayNumber||existing?.name||Numbering.nextCode(input.part,currentItems),order,startPrice:existing?.startPrice??0},{operator:true});
                    itemIds.push(approved.itemId);
                }
                result={type,count:selection.length,itemIds};
            }else{
                if(!Numbering.parts.includes(input.part))throw fail('교차 배치할 부를 선택해 주세요.',422);
                const targets=items.filter(i=>Numbering.partOf(i.attributes?.displayNumber||i.name)===input.part);
                const expected=Array.isArray(input.items)?input.items:[];
                if(targets.length<2)throw fail('같은 부에 개체가 2마리 이상 있어야 해요.',422);
                if(expected.length!==targets.length||new Set(expected.map(i=>i.id)).size!==targets.length||targets.some(i=>!expected.some(e=>e.id===i.id&&e.updatedAt===i.updatedAt)))throw fail('편성 목록이 변경됐어요. 새로고침 후 다시 배치해 주세요.');
                if(targets.some(i=>!canArrange(i)))throw fail('입찰·낙찰 기록이 있는 개체는 다시 배치할 수 없어요.');
                const slots=targets.map(i=>Number(i.lotNumber)).sort((a,b)=>a-b);
                if(new Set(items.map(i=>Number(i.lotNumber))).size!==items.length)throw fail('진행 순서가 중복돼 있어요. 경매 운영에서 먼저 확인해 주세요.');
                const ordered=Numbering.interleave(targets,random);
                ordered.forEach((item,index)=>staged.set(channelKey(channel.id,'item',item.id),{key:channelKey(channel.id,'item',item.id),value:JSON.stringify({...item,lotNumber:slots[index],updatedAt:nextItemTimestamp(item)})}));
                result={type,count:ordered.length,itemIds:ordered.map(i=>i.id)};
            }
            journal.requests.push({id:requestId,signature,result});journal.requests=journal.requests.slice(-500);
            staged.set(channelKey(channel.id,'setting',journal.id),{key:channelKey(channel.id,'setting',journal.id),value:JSON.stringify(journal)});
            await repository.upsertRows([...staged.values()]);
            return {...result,duplicate:false};
        }));
    }
    // Only trusted upload handling may register media; clients cannot write arbitrary URLs.
    async function addMedia(context, media, persist = async () => {}) {
        const ownerId=owner(context);
        if(!uuid(media?.id)||!imageUrl(media.url,'https://creok.onrender.com')||!imageUrl(media.thumbnailUrl,'https://creok.onrender.com')||!Number.isSafeInteger(media.size)||media.size<=0||media.size>400000||!Number.isSafeInteger(media.thumbnailSize)||media.thumbnailSize<=0||media.thumbnailSize>60000)throw fail('사진 업로드 결과를 확인해 주세요.',422);
        return locked(ownerId,async()=>{
            const state=await readOwner(ownerId),existing=state.media.find(row=>row.id===media.id);
            const row={id:media.id,url:media.url,thumbnailUrl:media.thumbnailUrl,size:media.size,thumbnailSize:media.thumbnailSize,label:cleanText(media.label,100),...(media.width&&media.height?{width:media.width,height:media.height}:{}),...(/^[a-f0-9]{64}$/.test(media.sourceHash||'')?{sourceHash:media.sourceHash}:{})};
            if(privatePhotoReference(row.url)&&(!row.url.startsWith(`/__entry_photo__/${ownerId}/${row.id}/`)||!row.thumbnailUrl.startsWith(`/__entry_photo__/${ownerId}/${row.id}/`)))throw fail('업체의 사진만 등록할 수 있습니다.',403);
            if(existing){if(existing.sourceHash&&existing.sourceHash===row.sourceHash)return existing;if(hash(existing)!==hash(row))throw fail('같은 사진 번호를 덮어쓸 수 없습니다.');return existing;}
            if(state.media.reduce((sum,row)=>sum+row.size+row.thumbnailSize,0)+row.size+row.thumbnailSize>maxMediaBytes)throw fail('사진 저장 한도에 도달했어요. 운영자에게 문의해 주세요.',413);
            await persist(row);
            state.media.push(row);state.version++;await repository.upsertRows([{key:KEY+ownerId,value:JSON.stringify(state)}]);return row;
        });
    }
    async function hydrateItems(channelId, items) {
        const owners=new Map();
        for(const item of items){
            const ownerId=item.attributes?.vendor_entry?.ownerId;
            if(uuid(ownerId)&&!owners.has(ownerId)){
                // A photo-library outage must not stop payment or shipping. The
                // approved snapshot is still authoritative historical material.
                try{owners.set(ownerId,await readOwner(ownerId))}catch{owners.set(ownerId,null)}
            }
        }
        const hydrated=items.map(item=>{
            const link=item.attributes?.vendor_entry,state=owners.get(link?.ownerId);
            if(link&&owners.has(link.ownerId)&&!state)return {...item,parentInfoState:'snapshot'};
            const entry=state?.entries.find(entry=>entry.id===link.entryId&&entry.channelId===channelId&&entry.channelVendorId===item.vendorId&&entry.itemId===item.id&&entry.approved);
            if(!entry)return item;
            try{return {...item,attributes:{...item.attributes,parents:parentPhotos(state,entry.approved)}}}
            catch{return {...item,parentInfoState:'snapshot'}}
        });
        return Promise.all(hydrated.map(async item=>{
            const result={...item,attributes:await resolveFacts(item.attributes||{})};
            if(privatePhotoReference(result.photoUrl)){
                try{result.photoUrl=await resolveMediaUrl(result.photoUrl)}catch{}
            }
            return result;
        }));
    }
    async function hydrateCollectionRecords(records) {
        const owners=new Map();
        for(const record of records){
            const id=record.parentSource?.ownerId;
            if(uuid(id)&&!owners.has(id)){
                try{owners.set(id,await readOwner(id))}catch{owners.set(id,null)}
            }
        }
        return Promise.all(records.map(async record=>{
            let item=copy(record.item);
            const source=record.parentSource,state=owners.get(source?.ownerId);
            if(source?.refs?.length){
                if(!state)item.parentInfoState='snapshot';
                else{
                    let fallback=false;
                    item.parents=(item.parents||[]).map(saved=>{
                        const ref=source.refs.find(ref=>ref.role===saved.role);
                        if(!ref)return saved;
                        try{
                            // Follow the originally selected parent, not a reused
                            // entry's newly selected sire/dam or its new photos.
                            const value=parent(state,ref.id,ref.role);
                            return {role:ref.role,name:value.name,morph:value.morph,media:photos(state,[value.photoId])};
                        }catch{fallback=true;return saved;}
                    });
                    if(fallback)item.parentInfoState='snapshot';
                }
            }
            return resolveFacts(item);
        }));
    }
    return {read,command,batch,addMedia,hydrateItems,hydrateCollectionRecords,policy,summary,withOwnerLock:locked};
}

module.exports={createVendorEntries,normalizeEntry};
