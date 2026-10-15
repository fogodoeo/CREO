'use strict';
const crypto=require('node:crypto');
const {channelKey}=require('./platform-core');
const Model=require('./item-sheet-model');
const Numbering=require('./public/entry-numbering');
const {createGoogleClient,STRUCTURE}=require('./item-sheet-google');
const CREDENTIAL_KEY='creo_v2::private_item_sheet_credentials';
const settingKey=id=>channelKey(id,'setting','item-sheet-sync');
const parse=(value,fallback=null)=>{try{return JSON.parse(value);}catch{return fallback;}};
const error=message=>Object.assign(Error(message),{status:422});
const lotKey=(name,vendor)=>/^출품 \d+$/.test(name)?name+'\n'+vendor:name;
function seal(value,secret){
    if(!secret)throw error('서버의 비밀키 설정이 필요해요.');
    const key=crypto.createHash('sha256').update('creo-item-sheets\n'+secret).digest(),iv=crypto.randomBytes(12);
    const cipher=crypto.createCipheriv('aes-256-gcm',key,iv),data=Buffer.concat([cipher.update(JSON.stringify(value)),cipher.final()]);
    return {iv:iv.toString('base64'),tag:cipher.getAuthTag().toString('base64'),data:data.toString('base64')};
}
function unseal(value,secret){
    const key=crypto.createHash('sha256').update('creo-item-sheets\n'+secret).digest();
    const decipher=crypto.createDecipheriv('aes-256-gcm',key,Buffer.from(value.iv,'base64'));decipher.setAuthTag(Buffer.from(value.tag,'base64'));
    return JSON.parse(Buffer.concat([decipher.update(Buffer.from(value.data,'base64')),decipher.final()]).toString('utf8'));
}
function planRows(state,rows,data,channel,stamp){
    const bindings=structuredClone(state.bindings||{}),updates=[],writes=[],errors=[];
    const items=data.items.map(x=>structuredClone(x)),assigned=new Set(Object.values(bindings).map(b=>b.itemId));
    const empty=rows.filter(r=>!bindings[r.id]&&!r.values.some(Boolean)&&r.listing!=='출품'&&!r.formula);
    for(const item of items.filter(i=>!assigned.has(i.id)).sort((a,b)=>a.lotNumber-b.lotNumber)){
        const row=empty.shift();if(!row){errors.push('시트의 빈 행이 부족해요.');break;}
        bindings[row.id]={itemId:item.id,base:Array(Model.FIELD_COUNT).fill('')};assigned.add(item.id);
    }
    let nextLot=Math.max(0,...items.filter(i=>!i._sheetEntry).map(i=>Number(i.lotNumber)||0));
    const sheetNames=new Map();
    for(const r of rows)if(r.values[0]){const key=lotKey(r.values[0],r.values[1]);sheetNames.set(key,(sheetNames.get(key)||0)+1);}
    for(const row of rows){
        let binding=bindings[row.id],item=binding&&items.find(i=>i.id===binding.itemId),values,status='',choice=row.choice,listing=row.listing;
        const occupied=row.values.some(Boolean);
        try{
            const explicit=row.listing!==undefined,approve=explicit&&row.listing==='출품'&&!!item?._sheetEntry;
            if(explicit&&!['','대기','출품'].includes(row.listing))throw Error('출품 설정에서 대기 또는 출품을 선택해 주세요.');
            if(row.formula)throw Error('수식 대신 값을 입력해 주세요.');
            if(binding&&!item)throw Error('웹에서 삭제된 개체예요. 이 행은 다시 등록하지 않아요.');
            if(!binding&&!occupied&&row.listing!=='출품')continue;
            if(explicit&&item&&!item._sheetEntry&&binding.listing==='출품'&&row.listing!=='출품')throw Error('이미 출품된 개체예요. 출품 취소는 웹에서 처리해 주세요.');
            if(row.values[0]&&sheetNames.get(lotKey(row.values[0],row.values[1]))>1)throw Error('개체번호가 시트에서 중복됐어요.');
            if(explicit&&!item&&row.listing!=='출품'){
                status='대기 · 개체명 입력 후 출품 선택';listing='대기';
            }else if(item&&Model.locked(item,data.broadcast)){
                if(!Model.same(row.values,binding.base)&&!Model.same(row.values,Model.exported(item,data.vendors)))throw Error('진행·종료된 개체는 시트에서 수정할 수 없어요.');
                values=Model.exported(item,data.vendors);status=item.status==='live'?'진행 중 · 수정 잠금':'종료 · 수정 잠금';choice='';
            }else{
                if(item&&binding.base.some(Boolean)&&!occupied)throw Error('내용을 비웠어요. 개체 삭제는 웹에서 해 주세요.');
                const web=item?Model.exported(item,data.vendors):Array(Model.FIELD_COUNT).fill('');
                const result=Model.merge(binding?.base||Array(Model.FIELD_COUNT).fill(''),web,row.values,choice);
                if(result.conflicts.length)throw Error('충돌: '+result.conflicts.map(i=>Model.HEADERS[i]+' (웹: '+(web[i]||'빈 값').slice(0,70)+')').join(', ')+' · 충돌 해결을 선택해 주세요.');
                const valid=Model.validated(result.values,data.vendors,item?._sheetEntry);values=valid.values;
                if(items.some(i=>i.id!==item?.id&&lotKey(String(i.name).toUpperCase(),i.vendorName||data.vendors.find(v=>v.id===i.vendorId)?.name)===lotKey(values[0],values[1])))throw Error('웹에 같은 개체번호가 있어요.');
                if(approve){
                    if(item._sheetEntry.status!=='submitted')throw Error('제출된 개체만 출품할 수 있어요. 업체의 제출을 확인해 주세요.');
                    if(!Numbering.valid(values[0]))throw Error('방송에 쓸 개체명을 A01 형식으로 입력해 주세요.');
                    if(nextLot>=10000)throw Error('경매 진행 순서를 확인해 주세요.');
                }
                if(!item){
                    const id='sheet-'+crypto.createHash('sha256').update(channel.id+'\n'+row.id).digest('hex').slice(0,32);
                    item={id,channelId:channel.id,lotNumber:++nextLot,name:values[0],vendorId:valid.vendor.id,vendorName:valid.vendor.name,status:'waiting',soldPrice:0,createdAt:stamp,attributes:{broadcastDate:channel.auctionDate||'',sheetRowId:row.id}};
                    binding=bindings[row.id]={itemId:id,base:Array(Model.FIELD_COUNT).fill('')};items.push(item);
                }
                if(approve||!Model.same(Model.exported(item,data.vendors),values)||!data.items.some(i=>i.id===item.id)){
                    const next=Model.apply(item,values,valid.vendor);next.updatedAt=new Date(Math.max(Date.parse(stamp),Date.parse(item.updatedAt||0)+1||0)).toISOString();
                    if(approve){next._sheetApprove=true;next.lotNumber=++nextLot;}
                    writes.push(next);items[items.findIndex(i=>i.id===item.id)]=next;
                }
                status=approve?'출품 완료':item?._sheetEntry?({submitted:'검토 대기',draft:'작성 중',changes_requested:'수정 요청'}[item._sheetEntry.status]+' · 연결됨'):explicit?'출품 완료':'연결됨';choice='';
            }
            if(explicit&&item)listing=!item._sheetEntry||approve?'출품':'대기';
        }catch(e){status=e.message;errors.push({row:row.index+1,message:status});values=undefined;}
        if(values||status!==row.status||choice!==row.choice||listing!==row.listing){
            updates.push({index:row.index,id:row.id,offset:row.offset||0,previous:row.values,values,status,choice,listing,...(values?{base:values}:{}),dirty:!!values&&!Model.same(values,row.values)||status!==row.status||choice!==row.choice||listing!==row.listing});
        }
    }
    return {bindings,updates,writes,errors};
}
function createItemSheetSync({repository,lock,workspace,hydrateItems=async(_,items)=>items,entryBridge,touch=()=>{},sanitizeRecord,validateRecord,secret=repository.adminSecret,google,fetchImpl,now=Date.now,logger=console}){
    let running=null,timer=null,stopped=false;
    const inFlight=new Map();
    const readKey=async key=>parse((await repository.getRowsByKeys([key]))[0]?.value);
    async function credentials(){
        const env=process.env.CREO_GOOGLE_SERVICE_ACCOUNT_JSON;
        if(env)return JSON.parse(env);
        const stored=await readKey(CREDENTIAL_KEY);
        if(!stored)throw error('구글 연결 계정을 먼저 설정해 주세요.');
        try{return unseal(stored,secret);}catch{throw error('구글 연결 계정을 다시 설정해 주세요.');}
    }
    const client=google||createGoogleClient({credentials,fetchImpl,now});
    const read=id=>readKey(settingKey(id));
    const save=(id,value)=>repository.upsertRows([{key:settingKey(id),value:JSON.stringify(value)}]);
    async function view(channelId){
        const data=await workspace(channelId),original=new Map(data.items.map(i=>[i.id,i]));
        data.items=(await hydrateItems(channelId,data.items)).map(i=>({...i,_sheetOriginal:original.get(i.id)}));
        return data;
    }
    async function status(id){
        const s=await read(id);if(!s)return {configured:false};
        return {configured:true,enabled:s.enabled,spreadsheetUrl:'https://docs.google.com/spreadsheets/d/'+s.spreadsheetId+'/edit',lastSuccessAt:s.lastSuccessAt||null,lastError:s.lastError||'',errorCount:s.errorCount||0,intervalSeconds:10};
    }
    async function configure(channel,input){
        return lock('item-sheet:'+channel.id,async()=>{
            if(input.action==='pause'){
                const s=await read(channel.id);if(!s)throw error('연결된 시트가 없어요.');
                await save(channel.id,{...s,enabled:false});return status(channel.id);
            }
            if(input.action==='resume'){
                const s=await read(channel.id);if(!s)throw error('연결된 시트가 없어요.');
                await save(channel.id,{...s,enabled:true});return status(channel.id);
            }
            if(input.action!=='connect')throw error('시트 연결 작업을 확인해 주세요.');
            if(!['active','draft'].includes(channel.status)||channel.dataAdapter!=='platform')throw error('이 채널은 시트를 연결할 수 없어요.');
            const id=String(input.spreadsheetId||''),rowIds=input.rowIds;
            if(!/^[A-Za-z0-9_-]{20,100}$/.test(id)||!Number.isInteger(input.tabId)||input.tabId<0||typeof input.tabName!=='string'||!input.tabName||input.tabName.length>100)throw error('구글시트 주소와 탭을 확인해 주세요.');
            if(!Array.isArray(rowIds)||rowIds.length<1||rowIds.length>500||new Set(rowIds).size!==rowIds.length||rowIds.some(v=>!/^row-[a-f0-9-]{36}$/.test(v)))throw error('시트의 연결 ID를 확인해 주세요.');
            const catalog=await repository.getCatalog();
            for(const c of catalog.channels){const other=await read(c.id);if(c.id!==channel.id&&other?.spreadsheetId===id)throw error('다른 경매에 연결된 시트예요.');}
            const current=await read(channel.id);
            if(current&&current.spreadsheetId!==id)throw error('현재 연결을 교체하려면 운영자에게 문의해 주세요.');
            if(current&&!Model.same(current.rowIds,rowIds))throw error('기존 연결 행을 임의로 바꿀 수 없어요.');
            const sa=input.serviceAccount;
            let setupClient=client;
            if(sa){
                if(sa.type!=='service_account'||!/^[^\s@]+@[^\s@]+\.gserviceaccount\.com$/.test(sa.client_email||'')||!String(sa.private_key||'').includes('BEGIN PRIVATE KEY'))throw error('서비스 계정 파일을 확인해 주세요.');
                const clean={type:'service_account',client_email:sa.client_email,private_key:sa.private_key};
                seal(clean,secret); // Fail before any remote edits if encryption is unavailable.
                setupClient=google||createGoogleClient({credentials:async()=>clean,fetchImpl,now});
            }
            const next={...current,version:1,enabled:true,spreadsheetId:id,tabId:input.tabId,tabName:input.tabName,rowIds,bindings:current?.bindings||{}};
            await setupClient.initialize(next);
            const rows=[{key:settingKey(channel.id),value:JSON.stringify(next)}];
            if(sa)rows.push({key:CREDENTIAL_KEY,value:JSON.stringify(seal({type:'service_account',client_email:sa.client_email,private_key:sa.private_key},secret))});
            await repository.upsertRows(rows);return status(channel.id);
        });
    }
    async function snapshot(channelId){
        return lock('channel:'+channelId,async()=>{
            const channel=(await repository.getCatalog()).channels.find(c=>c.id===channelId);
            if(!channel||!['active','draft'].includes(channel.status)||channel.dataAdapter!=='platform')throw error('종료·보관된 채널은 동기화하지 않아요.');
            const data=await view(channelId);if(entryBridge)await entryBridge.load(channel,data);return {channel,data};
        });
    }
    async function run(channelId){
        return lock('item-sheet:'+channelId,async()=>{
            let state=await read(channelId);if(!state?.enabled)return status(channelId);
            let lease;
            try{
                const first=await client.read(state);
                if(!first.protections.some(p=>p.description===STRUCTURE&&!p.warningOnly))throw error('시트의 연결 보호 설정을 복구해 주세요.');
                const initial=await snapshot(channelId),stamp=new Date(now()).toISOString();
                const preview=planRows(state,first.rows,initial.data,initial.channel,stamp);
                const dirty=preview.updates.filter(u=>u.dirty||preview.writes.some(i=>preview.bindings[u.id]?.itemId===i.id));
                if(!dirty.length){
                    for(const u of preview.updates)if(u.base&&preview.bindings[u.id]){preview.bindings[u.id].base=u.base;if(u.listing!==undefined)preview.bindings[u.id].listing=u.listing;}
                    await save(channelId,{...state,bindings:preview.bindings,lastSuccessAt:stamp,lastError:'',errorCount:preview.errors.length});return status(channelId);
                }
                lease=await client.acquire(state,first,dirty.map(u=>u.index));
                if(!lease)return {...await status(channelId),busy:true};
                const fresh=await client.read(state);
                // A second worker or a sheet owner moving rows cannot redirect the write.
                if(fresh.protections.some(p=>String(p.description||'').startsWith('CREO item sync lease ')&&p.description!==lease.description))return {...await status(channelId),busy:true};
                if(first.offset!==fresh.offset||!Model.same(first.rows.map(r=>r.id),fresh.rows.map(r=>r.id)))throw error('시트 행·열이 이동됐어요. 다음 동기화에서 다시 확인해요.');
                const lockedIds=new Set(dirty.map(r=>r.id));
                let plan;
                await lock('channel:'+channelId,async()=>{
                    const channel=(await repository.getCatalog()).channels.find(c=>c.id===channelId);
                    if(!channel||!['active','draft'].includes(channel.status))throw error('종료된 채널은 동기화하지 않아요.');
                    const data=await view(channelId);
                    const commit=async()=>{
                    if(entryBridge)await entryBridge.load(channel,data);
                    plan=planRows(state,fresh.rows,data,channel,stamp);
                    const allowed=new Set(plan.updates.filter(u=>lockedIds.has(u.id)).map(u=>plan.bindings[u.id]?.itemId));
                    // Only rows protected in this pass may be committed. Other rows wait for the next tick.
                    plan.writes=plan.writes.filter(w=>allowed.has(w.id));
                    plan.updates=plan.updates.filter(u=>lockedIds.has(u.id));
                    const nextBindings=structuredClone(state.bindings||{});
                    for(const id of lockedIds)if(plan.bindings[id])nextBindings[id]=plan.bindings[id];
                    plan.bindings=nextBindings;
                    const prepared=entryBridge?entryBridge.prepare(channel,data,plan.writes,stamp):{items:plan.writes,rows:[]};
                    const rows=prepared.rows;
                    for(const item of prepared.items){
                        const displayed=data.items.find(i=>i.id===item.id),current=displayed?._sheetOriginal||displayed||{};
                        if(current.id&&!current._sheetEntry&&Model.locked(current,data.broadcast))throw error('경매 상태가 변경됐어요.');
                        let saved=sanitizeRecord('item',item,current);
                        saved=require('./auction-settlement').stamp(saved,channel,current);
                        saved={...saved,channelId,createdAt:item.createdAt||stamp,updatedAt:item.updatedAt};
                        const problems=validateRecord('item',saved,{...data,items:data.items.filter(i=>!i._sheetEntry&&i.id!==saved.id).concat(prepared.items),groups:channel.groups||[]});
                        if(problems.length)throw error(problems.join(' '));
                        rows.push({key:channelKey(channelId,'item',saved.id),value:JSON.stringify(saved)});
                    }
                    state={...state,bindings:plan.bindings};rows.push({key:settingKey(channelId),value:JSON.stringify(state)});
                    await repository.upsertRows(rows);if(plan.writes.length)touch(channelId);
                    };
                    if(entryBridge)await entryBridge.withLocks(channel,data,commit);else await commit();
                });
                await client.publish(state,plan.updates,lease);
                for(const u of plan.updates)if(u.base&&state.bindings[u.id]){state.bindings[u.id].base=u.base;if(u.listing!==undefined)state.bindings[u.id].listing=u.listing;}
                await save(channelId,{...state,lastSuccessAt:stamp,lastError:'',errorCount:plan.errors.length});
            }catch(e){
                const fresh=await read(channelId);
                if(fresh)await save(channelId,{...fresh,lastError:String(e.message||'연결 오류').slice(0,240)});
                logger.warn?.('[item-sheet] synchronization paused for retry',channelId);
            }finally{
                if(lease?.ids?.length)try{await client.release(state,lease);}catch{logger.warn?.('[item-sheet] temporary range lock will expire',channelId);}
            }
            return status(channelId);
        });
    }
    function sync(channelId){
        if(inFlight.has(channelId))return inFlight.get(channelId);
        const p=run(channelId).finally(()=>inFlight.delete(channelId));inFlight.set(channelId,p);return p;
    }
    async function tick(){
        if(running||stopped)return;
        running=(async()=>{
            const {channels}=await repository.getCatalog(),eligible=channels.filter(c=>['active','draft'].includes(c.status));
            const settings=await repository.getRowsByKeys(eligible.map(c=>settingKey(c.id)));
            const enabled=new Set(settings.filter(r=>parse(r.value)?.enabled).map(r=>r.key));
            for(const c of eligible){if(stopped)break;if(enabled.has(settingKey(c.id)))await sync(c.id);}
        })();
        try{await running;}catch{logger.warn?.('[item-sheet] worker will retry');}finally{running=null;}
    }
    function start(){if(timer)return;stopped=false;timer=setInterval(tick,10000);timer.unref?.();void tick();}
    async function stop(){stopped=true;clearInterval(timer);timer=null;await Promise.allSettled([running,...inFlight.values()].filter(Boolean));}
    return {configure,status,sync,start,stop};
}
module.exports={createItemSheetSync,planRows,seal,unseal,CREDENTIAL_KEY};
