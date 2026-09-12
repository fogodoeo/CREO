'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),{randomUUID}=require('node:crypto');
const {createVendorEntries}=require('../vendor-entries');

function fixture(){
    const rows=new Map();
    const repository={rows,async getRowsByKeys(keys){return keys.map(key=>rows.get(key)).filter(Boolean).map(row=>({...row}))},async upsertRows(values){for(const row of values)rows.set(row.key,{...row})},async getRecord(channel,type,id){const row=rows.get(`creo_v2::${channel}::${type}::${id}`);return row?JSON.parse(row.value):null},async listRecords(channel,type){return [...rows].filter(([key])=>key.startsWith(`creo_v2::${channel}::${type}::`)).map(([,row])=>JSON.parse(row.value))}};
    const channel={id:'alpha',name:'가상 경매',status:'active'},vendor={id:'v1',name:'가상 업체',phone:'01012345678',bankName:'은행',bankAccount:'12345',bankHolder:'가상 예금주'};
    const context={channel,vendor,profile:{id:randomUUID(),members:[{channelId:'alpha',vendorId:'v1'},{channelId:'beta',vendorId:'v2'}]},catalog:{channels:[channel,{id:'beta',name:'다음 경매',status:'active'}]}};
    rows.set('creo_v2::alpha::setting::entry-policy',{key:'creo_v2::alpha::setting::entry-policy',value:JSON.stringify({open:true})});
    rows.set('creo_v2::beta::setting::entry-policy',{key:'creo_v2::beta::setting::entry-policy',value:JSON.stringify({open:true})});
    return {repository,context,service:createVendorEntries(repository)};
}
const draft=()=>({id:randomUUID(),morph:'릴리화이트',sex:'female',weight:'28',photoIds:[]});
const command=(type,fields={})=>({type,requestId:randomUUID(),...fields});

test('Feedle import atomically creates a draft, reuses corrected parents and deduplicates simultaneous imports',async()=>{
    const {repository,context,service}=fixture(),sourceId=randomUUID(),parentSource=randomUUID();
    const make=()=>command('import',{entry:{...draft(),sourceId},parents:{sire:{id:randomUUID(),sourceId:parentSource,name:'공개 부',sex:'male'}}});
    const results=await Promise.all([service.command(context,make()),service.command(context,make())]);
    assert.equal(results[0].result,results[1].result);assert.deepEqual(results.map(r=>r.duplicate).sort(),[false,true]);
    let state=await service.read(context);assert.equal(state.entries.length,1);assert.equal(state.entries[0].status,'draft');assert.equal(state.parents.length,1);
    assert.deepEqual(await repository.listRecords('alpha','item'),[]);
    const parent=state.parents[0];await service.command(context,command('parent',{parent:{...parent,name:'업체가 수정한 부'},expectedVersion:parent.version}));
    const other={...context,channel:context.catalog.channels[1],vendor:{...context.vendor,id:'v2'}};
    await service.command(other,command('import',{entry:{...draft(),sourceId},parents:{sire:{id:randomUUID(),sourceId:parentSource.toUpperCase(),name:'오래된 공개 부',sex:'male'}}}));
    state=await service.read(other);assert.equal(state.parents.length,1);assert.equal(state.parents[0].name,'업체가 수정한 부');
    assert.equal(state.entries.find(e=>e.channelId==='beta').sireId,parent.id);
    assert.equal(state.entries.find(e=>e.channelId==='beta').entryNumber,1);
});

test('invalid or failed Feedle imports never leave half a parent or draft behind',async()=>{
    const {repository,context,service}=fixture();
    const body=command('import',{entry:{...draft(),sourceId:randomUUID()},parents:{sire:{id:randomUUID(),sourceId:randomUUID(),name:'부'},dam:{id:'wrong',sourceId:randomUUID(),name:'모'}}});
    const before=JSON.stringify([...repository.rows]);await assert.rejects(service.command(context,body),error=>error.status===422);assert.equal(JSON.stringify([...repository.rows]),before);
    body.parents.dam.id=randomUUID();body.parents.dam.photoId=randomUUID();
    await assert.rejects(service.command(context,body),/사진/);assert.equal(JSON.stringify([...repository.rows]),before);
    body.parents.dam.photoId='';
    const write=repository.upsertRows;repository.upsertRows=async()=>{throw Error('failed import write')};
    await assert.rejects(service.command(context,body),/failed import/);repository.upsertRows=write;
    assert.equal(JSON.stringify([...repository.rows]),before);
    const saved=await createVendorEntries(repository).command(context,body);assert.equal(saved.state.parents.length,2);assert.equal(saved.state.entries.length,1);
});

test('entry saves and submissions remain separate from auction items until one atomic operator approval',async()=>{
    const {repository,context,service}=fixture(),entry=draft();
    const save=command('save',{entry,expectedVersion:0});
    const saved=await Promise.all([service.command(context,save),service.command(context,save)]);
    assert.deepEqual(saved.map(row=>row.duplicate).sort(),[false,true]);
    assert.equal(saved[0].state.entries[0].code,'출품 01');assert.deepEqual(await repository.listRecords('alpha','item'),[]);
    const submitted=await service.command(context,command('submit',{entry,expectedVersion:1}));
    assert.equal(submitted.state.entries[0].status,'submitted');assert.deepEqual(await repository.listRecords('alpha','item'),[]);
    const approval=command('approve',{id:entry.id,expectedVersion:2,lot:'A01',order:3,startPrice:30000});
    await assert.rejects(service.command(context,approval),error=>error.status===403);
    const results=await Promise.all([service.command(context,approval,{operator:true}),service.command(context,approval,{operator:true})]);
    assert.deepEqual(results.map(row=>row.duplicate).sort(),[false,true]);
    const items=await repository.listRecords('alpha','item');assert.equal(items.length,1);assert.equal(items[0].name,'A01');assert.equal(items[0].lotNumber,3);assert.equal(items[0].status,'waiting');
    assert.equal(results[0].state.entries[0].itemId,items[0].id);
});

test('parent profiles are reused across member auctions, update checkout images, and preserve prior versions',async()=>{
    const {repository,context,service}=fixture(),parentId=randomUUID(),mediaId=randomUUID();
    await service.addMedia(context,{id:mediaId,url:'/assets/sire.webp',thumbnailUrl:'/assets/sire-small.webp',size:2000,thumbnailSize:100});
    const parent={id:parentId,name:'부 이름',code:'M01',morph:'화이트월',sex:'male',photoId:mediaId};
    await service.command(context,command('parent',{parent}));
    const entry={...draft(),sireId:parentId};await service.command(context,command('submit',{entry}));
    await service.command(context,command('approve',{id:entry.id,expectedVersion:1,lot:'A01',order:1}),{operator:true});
    const items=await repository.listRecords('alpha','item'),before=JSON.stringify(items);
    const other={...context,channel:context.catalog.channels[1],vendor:{...context.vendor,id:'v2'}};
    const nextMedia=randomUUID();await service.addMedia(other,{id:nextMedia,url:'/assets/new.webp',thumbnailUrl:'/assets/new-small.webp',size:2000,thumbnailSize:100});
    await service.command(other,command('parent',{parent:{...parent,name:'바뀐 부모 이름',photoId:nextMedia},expectedVersion:1}));
    const restarted=createVendorEntries(repository),hydrated=await restarted.hydrateItems('alpha',items);
    assert.equal(hydrated[0].attributes.parents[0].name,'바뀐 부모 이름');assert.equal(hydrated[0].attributes.parents[0].media[0].url,'/assets/new.webp');
    assert.equal(JSON.stringify(await repository.listRecords('alpha','item')),before,'parent correction never rewrites a sale');
    const state=JSON.parse(repository.rows.get('vendor_entries_v1::'+context.profile.id).value);assert.equal(state.parentHistory.length,1);assert.equal(state.parentHistory[0].name,'부 이름');
    assert.equal((await restarted.read(other)).parents.length,1);
});

test('ownership, stale versions, duplicate requests with changed bodies, and closed intake fail without writes',async()=>{
    const {repository,context,service}=fixture(),entry=draft(),save=command('save',{entry});await service.command(context,save);
    const before=JSON.stringify([...repository.rows]);
    await assert.rejects(service.command(context,{...save,entry:{...entry,morph:'Changed'}}),/같은 요청/);
    await assert.rejects(service.command(context,command('save',{entry,expectedVersion:0})),/변경/);
    const wrong={...context,vendor:{...context.vendor,id:'other'}};
    await assert.rejects(service.read(wrong),error=>error.status===403);
    const otherAuction={...context,channel:context.catalog.channels[1],vendor:{...context.vendor,id:'v2'}};
    await assert.rejects(service.command(otherAuction,command('save',{entry,expectedVersion:1})),error=>error.status===403);
    assert.equal(JSON.stringify([...repository.rows]),before);
    context.channel.status='archived';await assert.rejects(service.command(context,command('submit',{entry,expectedVersion:1})),/마감/);
    assert.equal(JSON.stringify([...repository.rows]),before);
});

test('approval rejects duplicate order and live or sold items, while retaining an approved snapshot for revisions',async()=>{
    const {repository,context,service}=fixture(),entry=draft();await service.command(context,command('submit',{entry}));
    await service.command(context,command('approve',{id:entry.id,expectedVersion:1,lot:'A01',order:1}),{operator:true});
    await service.command(context,command('revise',{id:entry.id,expectedVersion:2}));
    const submitted=await service.command(context,command('submit',{entry:{...entry,morph:'변경안'},expectedVersion:3}));
    assert.equal(submitted.state.entries[0].approved.morph,'릴리화이트');
    const item=(await repository.listRecords('alpha','item'))[0],key=`creo_v2::alpha::item::${item.id}`;
    for(const status of ['live','sold']){
        repository.rows.set(key,{key,value:JSON.stringify({...item,status})});
        const before=JSON.stringify([...repository.rows]);
        await assert.rejects(service.command(context,command('approve',{id:entry.id,expectedVersion:4,lot:'A01',order:1}),{operator:true}),/입찰/);
        assert.equal(JSON.stringify([...repository.rows]),before);
    }
    repository.rows.set(key,{key,value:JSON.stringify({...item,vendorId:'different-vendor'})});
    await assert.rejects(service.command(context,command('approve',{id:entry.id,expectedVersion:4,lot:'A01',order:1}),{operator:true}),/업체 또는 연결 정보/);
    repository.rows.set(key,{key,value:JSON.stringify(item)});
    const other=draft();await service.command(context,command('submit',{entry:other}));
    await assert.rejects(service.command(context,command('approve',{id:other.id,expectedVersion:1,lot:'B01',order:1}),{operator:true}),/사용 중/);
});

test('failed atomic approval can retry after restart without a ghost item or duplicate approval',async()=>{
    const {repository,context,service}=fixture(),entry=draft();await service.command(context,command('submit',{entry}));
    const approval=command('approve',{id:entry.id,expectedVersion:1,lot:'A01',order:1}),write=repository.upsertRows;
    const before=JSON.stringify([...repository.rows]);repository.upsertRows=async()=>{throw Error('storage failed')};
    await assert.rejects(service.command(context,approval,{operator:true}),/storage failed/);assert.equal(JSON.stringify([...repository.rows]),before);
    repository.upsertRows=write;await createVendorEntries(repository).command(context,approval,{operator:true});
    assert.equal((await repository.listRecords('alpha','item')).length,1);assert.equal((await service.read(context)).entries[0].status,'approved');
});

test('missing profile details allow drafts but block submit, and corrupt storage fails closed',async()=>{
    const {repository,context,service}=fixture(),entry=draft();context.vendor.bankAccount='';
    await service.command(context,command('save',{entry}));
    await assert.rejects(service.command(context,command('submit',{entry,expectedVersion:1})),error=>error.status===422);
    const key='vendor_entries_v1::'+context.profile.id;repository.rows.set(key,{key,value:'{broken'});
    await assert.rejects(service.read(context),error=>error.status===503);
    await assert.rejects(service.command(context,command('save',{entry,expectedVersion:1})),error=>error.status===503);
});

test('parent-library read failures keep the approved snapshot available without blocking checkout',async()=>{
    const {repository,context,service}=fixture(),parentId=randomUUID(),entry={...draft(),sireId:parentId};
    await service.command(context,command('parent',{parent:{id:parentId,name:'승인 당시 부모',sex:'male'}}));
    await service.command(context,command('submit',{entry}));
    await service.command(context,command('approve',{id:entry.id,expectedVersion:1,lot:'A01',order:1}),{operator:true});
    const items=await repository.listRecords('alpha','item');
    const key='vendor_entries_v1::'+context.profile.id,stored=JSON.parse(repository.rows.get(key).value);stored.parents=[];
    repository.rows.set(key,{key,value:JSON.stringify(stored)});
    assert.equal((await service.hydrateItems('alpha',items))[0].parentInfoState,'snapshot','a broken parent reference must not block checkout');
    repository.getRowsByKeys=async()=>{throw Error('temporarily unavailable')};
    const result=await service.hydrateItems('alpha',items);
    assert.equal(result[0].parentInfoState,'snapshot');assert.equal(result[0].attributes.parents[0].name,'승인 당시 부모');
});

test('approval inherits the vendor team and keeps an explicit team selection across a revised entry',async()=>{
    const {repository,context,service}=fixture(),entry=draft();
    context.channel.groups=[{id:'a',name:'비송팀'},{id:'b',name:'디어렙팀'}];context.vendor.groupId='a';
    await service.command(context,command('submit',{entry}));
    await service.command(context,command('approve',{id:entry.id,expectedVersion:1,lot:'A01',order:1}),{operator:true});
    let item=(await repository.listRecords('alpha','item'))[0];assert.equal(item.groupId,'a');assert.equal(item.teamName,'비송팀');
    await service.command(context,command('revise',{id:entry.id,expectedVersion:2}));
    await service.command(context,command('submit',{entry,expectedVersion:3}));
    const approval=command('approve',{id:entry.id,expectedVersion:4,lot:'B01',order:1,groupId:'b'});
    await assert.rejects(service.command(context,{...approval,groupId:'foreign-team'},{operator:true}),/등록된 팀/);
    const saved=JSON.stringify(await repository.listRecords('alpha','item'));
    assert.equal((await service.read(context)).entries[0].status,'submitted');assert.equal(saved,JSON.stringify([item]));
    await service.command(context,approval,{operator:true});item=(await repository.listRecords('alpha','item'))[0];assert.equal(item.groupId,'b');assert.equal(item.teamName,'디어렙팀');
    await assert.rejects(service.command(context,{...approval,groupId:'a'},{operator:true}),/같은 요청/);
});
