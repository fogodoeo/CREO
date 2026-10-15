'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const {createItemSheetSync,seal,unseal,CREDENTIAL_KEY}=require('../item-sheet-sync');
const Model=require('../item-sheet-model');
const {sanitizeRecord,validateRecord,createPlatformApi}=require('../platform-api');
const {channelKey}=require('../platform-core');
const {Readable}=require('node:stream');
const {STRUCTURE}=require('../item-sheet-google');
function fixture({bridgeFactory,hydrateItems}={}){
    const records=new Map(),channel={id:'alpha',name:'가상 경매',dataAdapter:'platform',status:'active'},other={...channel,id:'beta'};
    let time=Date.parse('2026-10-15T08:00:00Z'),failStore=false,failPublish=false,afterAcquire=null;
    const copy=structuredClone;
    const repository={adminSecret:'test-only-secret',async getRowsByKeys(keys){return keys.filter(k=>records.has(k)).map(k=>({key:k,value:records.get(k)}));},async upsertRows(rows){if(failStore)throw Error('storage failure');for(const r of rows)records.set(r.key,r.value);},async getCatalog(){return {channels:[channel,other],version:1}},async listRecords(c,t){return [...records].filter(([k])=>k.startsWith(channelKey(c,t,'')+'::')).map(([,v])=>JSON.parse(v));},async getRecord(c,t,id){return JSON.parse(records.get(channelKey(c,t,id))||'null')},async verifyAdmin(s){return s==='secret'}};
    const put=(type,value,c='alpha')=>records.set(channelKey(c,type,value.id),JSON.stringify(copy(value)));
    put('vendor',{id:'v',name:'가상업체',phone:'01000000000',bankAccount:'private',active:true});
    const grid=Array.from({length:5},(_,i)=>({id:'row-'+crypto.randomUUID(),index:i+1,values:Array(13).fill(''),status:'',choice:'',formula:false}));
    let protections=[{description:STRUCTURE}],count=0;
    const google={
        async initialize(){return {}},async read(){return {rows:copy(grid),protections:copy(protections)}},
        async acquire(_,snapshot,indexes){count++;const description='CREO item sync lease '+time+' test';protections.push({description});if(afterAcquire){const hook=afterAcquire;afterAcquire=null;await hook();}return {ids:indexes,description};},
        async release(_,lease){protections=protections.filter(p=>p.description!==lease.description);lease.ids=[]},
        async publish(_,updates,lease){if(failPublish)throw Error('network failure');for(const u of updates){const r=grid.find(r=>r.id===u.id);if(u.values)r.values=copy(u.values);r.status=u.status;r.choice=u.choice;if(u.listing!==undefined)r.listing=u.listing;}await this.release(_,lease);}
    };
    const locks=new Map();
    const lock=async(key,fn)=>{const old=locks.get(key)||Promise.resolve();let release;const p=new Promise(r=>release=r);locks.set(key,old.then(()=>p));await old;try{return await fn()}finally{release()}};
    const workspace=async id=>({vendors:await repository.listRecords(id,'vendor'),items:await repository.listRecords(id,'item'),shipments:await repository.listRecords(id,'shipment'),broadcast:await repository.getRecord(id,'broadcast','state')||{}});
    const entryBridge=bridgeFactory?.(repository);
    const create=()=>createItemSheetSync({repository,lock,workspace,sanitizeRecord,validateRecord,entryBridge,hydrateItems,google,now:()=>++time,logger:{warn(){}}});
    let service=create();
    const config={action:'connect',spreadsheetId:'test-sheet-12345678901234567890',tabId:1,tabName:'출품 개체',rowIds:grid.map(r=>r.id)};
    const values=()=>['A01','가상업체','암컷','25','2025-07-13','아잔틱','PCR','30','https://example.com/gecko.webp','','','',''];
    return {records,channel,other,repository,grid,google,put,values,config,workspace,create,get service(){return service},restart(){service=create()},connect:()=>service.configure(channel,config),sync:()=>service.sync('alpha'),items:()=>repository.listRecords('alpha','item'),get count(){return count},storeFails(v){failStore=v},publishFails(v){failPublish=v},afterAcquire(fn){afterAcquire=fn}};
}
test('sheet creates one item durably, excludes all private fields and survives retry/restart',async()=>{
    const f=fixture();await f.connect();f.grid[0].values=f.values();await Promise.all([f.sync(),f.sync()]);
    assert.equal((await f.items()).length,1);const item=(await f.items())[0];assert.equal(item.name,'A01');assert.equal(item.startPrice,300000);assert.equal(item.status,'waiting');assert.equal(item.attributes.entry_traits.hatchDate,'2025-07-13');
    assert.equal(JSON.stringify(f.grid).includes('01000000000'),false);assert.equal(JSON.stringify(f.grid).includes('private'),false);
    f.restart();await f.sync();assert.deepEqual(await f.items(),[item]);assert.equal(f.grid[0].status,'연결됨');
});
test('web changes, sheet changes and disjoint fields merge bidirectionally',async()=>{
    const f=fixture();await f.connect();f.grid[0].values=f.values();await f.sync();let item=(await f.items())[0];
    f.put('item',{...item,note:'웹 비고'});f.grid[0].values[3]='27';await f.sync();item=(await f.items())[0];
    assert.equal(item.note,'웹 비고');assert.equal(item.attributes.entry_traits.weight,'27');assert.equal(f.grid[0].values[6],'웹 비고');
    f.grid[0].values[6]='';await f.sync();assert.equal((await f.items())[0].note,'');
});
test('same-cell conflicts retain both edits until an explicit choice',async()=>{
    const f=fixture();await f.connect();f.grid[0].values=f.values();await f.sync();let item=(await f.items())[0];
    f.put('item',{...item,note:'웹 수정'});f.grid[0].values[6]='시트 수정';await f.sync();
    assert.equal((await f.items())[0].note,'웹 수정');assert.equal(f.grid[0].values[6],'시트 수정');assert.match(f.grid[0].status,/충돌.*웹 수정/);
    f.restart();await f.sync();assert.equal(f.grid[0].values[6],'시트 수정');
    f.grid[0].choice='시트 적용';await f.sync();assert.equal((await f.items())[0].note,'시트 수정');assert.equal(f.grid[0].choice,'');
    item=(await f.items())[0];f.put('item',{...item,note:'웹 두번째'});f.grid[0].values[6]='시트 두번째';f.grid[0].choice='웹 적용';await f.sync();assert.equal(f.grid[0].values[6],'웹 두번째');
});
test('changed sheets are re-read after acquiring their temporary protection',async()=>{
    const f=fixture();await f.connect();f.grid[0].values=f.values();await f.sync();const item=(await f.items())[0];
    f.put('item',{...item,note:'웹 수정'});f.afterAcquire(()=>{f.grid[0].values[6]='접수 중 수정'});await f.sync();
    assert.equal((await f.items())[0].note,'웹 수정');assert.equal(f.grid[0].values[6],'접수 중 수정');assert.match(f.grid[0].status,/충돌/);
});
test('web updates during sheet I/O are retained and converge on the next pass',async()=>{
    const f=fixture();await f.connect();f.grid[0].values=f.values();await f.sync();const item=(await f.items())[0];
    f.grid[0].values[6]='시트 수정';const publish=f.google.publish.bind(f.google);
    f.google.publish=async(...args)=>{const saved=(await f.items())[0];f.put('item',{...saved,category:'웹 나중 수정'});await publish(...args);};
    await f.sync();f.google.publish=publish;await f.sync();assert.equal((await f.items())[0].category,'웹 나중 수정');assert.equal(f.grid[0].values[5],'웹 나중 수정');assert.equal((await f.items())[0].note,'시트 수정');
});
test('failed remote publication does not duplicate creates and restart reconciles committed values',async()=>{
    const f=fixture();await f.connect();f.grid[0].values=f.values();f.publishFails(true);await f.sync();
    assert.equal((await f.items()).length,1);assert.match((await f.service.status('alpha')).lastError,/network/);
    f.restart();f.publishFails(false);await f.sync();assert.equal((await f.items()).length,1);assert.equal(f.grid[0].status,'연결됨');assert.equal((await f.service.status('alpha')).lastError,'');
});
test('failed atomic storage does not partially create records or publish acknowledgement',async()=>{
    const f=fixture();await f.connect();f.grid[0].values=f.values();f.storeFails(true);await assert.rejects(f.sync());assert.equal((await f.items()).length,0);assert.equal(f.grid[0].status,'');
    f.storeFails(false);await f.sync();assert.equal((await f.items()).length,1);
});
test('live, sold, passed, archived and previously bid lots cannot be changed by a public sheet',async()=>{
    for(const status of ['live','sold','passed','waiting']){
        const f=fixture();await f.connect();f.grid[0].values=f.values();await f.sync();const original=(await f.items())[0],item={...original,status,soldPrice:status==='sold'?500000:0,winnerName:'private winner',winnerPhone:'01000000000',attributes:{...original.attributes,bid_log:[{name:'private bidder',amount:50}]}};
        f.put('item',item);f.grid[0].values[6]='공개 수정';await f.sync();assert.deepEqual((await f.items())[0],item);assert.match(f.grid[0].status,/수정할 수 없어요/);assert.equal(JSON.stringify(f.grid).includes('private winner'),false);
    }
    const f=fixture();await f.connect();f.channel.status='archived';f.grid[0].values=f.values();await f.sync();assert.equal((await f.items()).length,0);
});
test('auction starts while sheet fetch is in flight: fresh channel lock prevents an overwrite',async()=>{
    const f=fixture();await f.connect();f.grid[0].values=f.values();await f.sync();const item=(await f.items())[0];f.grid[0].values[7]='100';
    f.afterAcquire(()=>f.put('item',{...item,status:'live'}));await f.sync();assert.equal((await f.items())[0].startPrice,300000);assert.equal((await f.items())[0].status,'live');
});
test('web deletions are tombstoned, and clearing a sheet row never deletes a web item',async()=>{
    const f=fixture();await f.connect();f.grid[0].values=f.values();await f.sync();const item=(await f.items())[0];
    f.grid[0].values.fill('');await f.sync();assert.equal((await f.items()).length,1);assert.match(f.grid[0].status,/삭제는 웹/);
    f.records.delete(channelKey('alpha','item',item.id));f.grid[0].values=f.values();await f.sync();assert.equal((await f.items()).length,0);assert.match(f.grid[0].status,/웹에서 삭제/);
});
test('invalid rows, formulas, duplicates and foreign vendors fail without partially importing the row',async()=>{
    for(const mutate of [r=>r.values[1]='다른 업체',r=>r.values[3]='no',r=>r.values[4]='2026-02-31',r=>r.values[7]='-1',r=>r.values[8]='javascript:alert(1)',r=>r.formula=true]){
        const f=fixture();await f.connect();f.grid[0].values=f.values();mutate(f.grid[0]);await f.sync();assert.equal((await f.items()).length,0);assert.notEqual(f.grid[0].status,'연결됨');
    }
    const f=fixture();await f.connect();f.grid[0].values=f.values();f.grid[1].values=f.values();await f.sync();assert.equal((await f.items()).length,0);assert.match(f.grid[0].status,/중복/);
});
test('new web lots export to a blank row without leaking unrelated channels',async()=>{
    const f=fixture();await f.connect();f.put('item',{id:'web',name:'B01',lotNumber:1,vendorId:'v',status:'waiting',category:'릴리화이트',attributes:{checklist:'gender:M|weight:5'}});f.put('item',{id:'private',name:'X01',lotNumber:1,status:'sold'},'beta');
    await f.sync();assert.equal(f.grid[0].values[0],'B01');assert.equal(f.grid[0].values[2],'수컷');assert.equal(JSON.stringify(f.grid).includes('X01'),false);
    await assert.rejects(f.service.configure(f.other,f.config),/다른 경매/);
});
test('clearing a parent photo also clears the legacy photo fallback',()=>{
    const vendor={id:'v',name:'업체'},item={id:'a',name:'A01',vendorId:'v',attributes:{parents:[{role:'sire',name:'부모',photoUrl:'https://example.com/sire.webp'}]}};
    const values=Model.exported(item,[vendor]);values[10]='';
    const next=Model.apply(item,values,vendor);
    assert.equal(Model.exported(next,[vendor])[10],'');
    assert.deepEqual(next.attributes.parents[0].media,[]);
    assert.deepEqual(next.attributes.parentPhotoOverrides,['sire']);
});
test('parent photo overrides preserve all other attributes and fee/buyer data',()=>{
    const item={id:'a',name:'A01',vendorId:'v',status:'waiting',attributes:{vendor_entry:{ownerId:'p',entryId:'e'},organizerFeePolicy:{ratePercent:10},parents:[{role:'sire',name:'기존 부',media:[{url:'/sire.webp',id:'image1'}]},{role:'dam',name:'기존 모',media:[{url:'/dam.webp',id:'image2'}]}]}};
    const vendor={id:'v',name:'업체'},values=Model.exported(item,[vendor]);values[10]='https://example.com/new.webp';const next=Model.apply(item,values,vendor);
    assert.deepEqual(next.attributes.vendor_entry,item.attributes.vendor_entry);assert.deepEqual(next.attributes.organizerFeePolicy,item.attributes.organizerFeePolicy);assert.deepEqual(next.attributes.parents.find(p=>p.role==='dam'),item.attributes.parents[1]);assert.deepEqual(next.attributes.parentPhotoOverrides,['sire']);
});
test('editing text preserves durable private photo references instead of persisting expiring display URLs',async()=>{
    const ref='/__entry_photo__/'+crypto.randomUUID()+'/'+crypto.randomUUID()+'/'+'a'.repeat(64)+'/full.webp';
    const f=fixture({hydrateItems:async(_,items)=>items.map(i=>({...i,photoUrl:'https://example.com/view?expires=1',attributes:{...i.attributes,parents:[{...i.attributes.parents[0],media:[{url:'https://example.com/parent?expires=1'}]}]}}))});
    f.put('item',{id:'private-photo',name:'A01',lotNumber:1,vendorId:'v',status:'waiting',photoUrl:ref,attributes:{media:[{url:ref}],parents:[{role:'sire',name:'부모',media:[{url:ref}]}]}});
    await f.connect();await f.sync();f.grid[0].values[6]='시트 비고';f.grid[0].values[9]='새 부모 이름';await f.sync();
    const item=(await f.items())[0];assert.equal(item.note,'시트 비고');assert.equal(item.photoUrl,ref);assert.equal(item.attributes.media[0].url,ref);assert.equal(item.attributes.parents[0].media[0].url,ref);assert.equal(item.attributes.parents[0].name,'새 부모 이름');assert.equal(JSON.stringify(item).includes('expires='),false);assert.equal('_sheetOriginal' in item,false);
});
test('credential material is encrypted and the status response cannot expose it',async()=>{
    const sealed=seal({private_key:'test key',client_email:'test'},'secret');assert.equal(JSON.stringify(sealed).includes('test key'),false);assert.deepEqual(unseal(sealed,'secret'),{private_key:'test key',client_email:'test'});assert.throws(()=>unseal(sealed,'wrong'));
    const f=fixture();await f.service.configure(f.channel,{...f.config,serviceAccount:{type:'service_account',client_email:'robot@test.iam.gserviceaccount.com',private_key:'-----BEGIN PRIVATE KEY-----\nfixture\n'}});assert.equal(f.records.get(CREDENTIAL_KEY).includes('PRIVATE KEY'),false);assert.equal(JSON.stringify(await f.service.status('alpha')).includes('private_key'),false);
});
function pendingFixture(){
    const ownerId=crypto.randomUUID(),entryId=crypto.randomUUID(),parentId=crypto.randomUUID();let entries;
    const f=fixture({bridgeFactory(repository){
        entries=require('../vendor-entries').createVendorEntries(repository);
        return require('../item-sheet-entries').createEntryBridge({directory:{async profileFor(c,v){return ['v','v2'].includes(v)?{id:ownerId}:null}},entries});
    }});
    const entry={id:entryId,channelId:'alpha',channelVendorId:'v',vendorId:ownerId,entryNumber:1,code:'출품 01',version:1,status:'submitted',sex:'female',weight:'25',hatchDate:'2025-07-13',morph:'아잔틱',note:'PCR',photoIds:['photo'],sireId:parentId,damId:'',updatedAt:'2026-10-14T00:00:00Z'};
    const state={schema:1,version:1,ownerId,entries:[entry,{...entry,id:crypto.randomUUID(),channelId:'beta',note:'다른 채널 비공개'}],media:[{id:'photo',url:'https://example.com/original.webp',thumbnailUrl:'https://example.com/thumb.webp',size:100,thumbnailSize:10}],parents:[{id:parentId,name:'원래 부모',sex:'male',photoId:'photo',version:1}],parentHistory:[],requests:[]};
    const key='vendor_entries_v1::'+ownerId;
    entry.submission=entries.sheetAccess.snapshot(state,entry);
    const put=s=>f.records.set(key,JSON.stringify(s)),read=()=>JSON.parse(f.records.get(key));put(state);
    return {...f,get service(){return f.service},ownerId,entryId,parentId,read,put,putRecord:f.put,entries};
}
test('submitted vendor entries populate the same sheet without approving them or duplicating auction lots',async()=>{
    const f=pendingFixture();await f.connect();await f.sync();
    assert.equal(f.grid[0].values[0],'출품 01');assert.equal(f.grid[0].values[8],'https://example.com/original.webp');assert.equal(f.grid[0].values[9],'원래 부모');assert.equal(f.grid[0].status,'검토 대기 · 연결됨');
    assert.equal((await f.items()).length,0);assert.equal(f.read().entries[0].status,'submitted');assert.equal(JSON.stringify(f.grid).includes('다른 채널 비공개'),false);
    await f.sync();assert.equal(f.grid.filter(r=>r.values[0]).length,1);
});
test('pending entry sheet edits preserve approval, other channels and shared parent records; web changes sync back',async()=>{
    const f=pendingFixture();await f.connect();await f.sync();const original=f.read();
    f.grid[0].values[0]='A01';f.grid[0].values[3]='27.5';f.grid[0].values[6]='시트 비고';f.grid[0].values[7]='10';f.grid[0].values[8]='https://example.com/new.webp';f.grid[0].values[9]='시트 부모';f.grid[0].values[10]='';await f.sync();
    const state=f.read(),entry=state.entries[0];assert.equal(entry.status,'submitted');assert.equal(entry.sheetLot,'A01');assert.equal(entry.sheetStartPrice,100000);assert.equal(entry.weight,'27.5');assert.equal(entry.submission.note,'시트 비고');assert.equal(entry.submission.media[0].url,'https://example.com/new.webp');assert.equal(entry.version,2);
    assert.deepEqual(state.entries[1],original.entries[1]);assert.deepEqual(state.parents.find(p=>p.id===f.parentId),original.parents[0]);assert.equal(entry.submission.parents[0].name,'시트 부모');assert.deepEqual(entry.submission.parents[0].media,[]);assert.equal(state.parents.find(p=>p.id===entry.sireId).sourceId,'');assert.equal((await f.items()).length,0);
    entry.note='웹 비고';entry.version++;f.put(state);await f.sync();assert.equal(f.grid[0].values[6],'웹 비고');
});
test('pending entry races, failed publication and restart preserve the entry version and explicit conflict',async()=>{
    const f=pendingFixture();await f.connect();await f.sync();f.grid[0].values[6]='시트 수정';
    f.afterAcquire(()=>{const s=f.read();s.entries[0].note='웹 수정';s.entries[0].version++;f.put(s)});await f.sync();assert.match(f.grid[0].status,/충돌/);assert.equal(f.read().entries[0].note,'웹 수정');
    f.grid[0].choice='시트 적용';f.publishFails(true);await f.sync();assert.equal(f.read().entries[0].note,'시트 수정');const version=f.read().entries[0].version;
    f.restart();f.publishFails(false);await f.sync();assert.equal(f.read().entries[0].version,version);assert.equal(f.grid[0].status,'검토 대기 · 연결됨');
});
test('approval migrates the existing sheet row to the real auction item and never creates a duplicate',async()=>{
    const f=pendingFixture();await f.connect();await f.sync();
    const entry=f.read().entries[0],context={channel:f.channel,vendor:(await f.workspace('alpha')).vendors[0],profile:{id:f.ownerId,members:[{channelId:'alpha',vendorId:'v'}]},catalog:await f.repository.getCatalog()};
    await f.entries.command(context,{type:'approve',id:entry.id,expectedVersion:entry.version,lot:'1부 A01',order:1,startPrice:300000,requestId:'approve-from-web-0001'},{operator:true});
    await f.sync();assert.equal((await f.items()).length,1);assert.equal(f.grid.filter(r=>r.values[0]).length,1);assert.equal(f.grid[0].values[0],'1부 A01');assert.equal(f.grid[0].values[7],'30');assert.equal(f.grid[0].status,'연결됨');
    f.grid[0].values[6]='편성 뒤 수정';await f.sync();assert.equal((await f.items())[0].note,'편성 뒤 수정');
    const item=(await f.items())[0];f.putRecord('item',{...item,status:'sold',soldPrice:500000});f.grid[0].values[6]='종료 뒤 수정';await f.sync();assert.equal((await f.items())[0].note,'편성 뒤 수정');assert.match(f.grid[0].status,/수정할 수 없어요/);
});
test('same submission numbers in separate vendors stay distinct and cannot be reassigned',async()=>{
    const f=pendingFixture();f.putRecord('vendor',{id:'v2',name:'두번째 업체',active:true});const state=f.read();state.entries.push({...state.entries[0],id:crypto.randomUUID(),channelVendorId:'v2'});f.put(state);
    await f.connect();await f.sync();assert.equal(f.grid.filter(r=>r.values[0]).length,2);assert.equal(f.grid[0].values[0],'출품 01');assert.equal(f.grid[1].values[0],'출품 01');assert.equal(f.grid[1].values[1],'두번째 업체');
    f.grid[0].values[0]='A01';f.grid[0].values[1]='두번째 업체';await f.sync();assert.match(f.grid[0].status,/소속 업체/);assert.equal(f.read().entries[0].channelVendorId,'v');
});
test('deletion, invalid pending edits and atomic failure never approve or partially modify vendor entries',async()=>{
    const f=pendingFixture();await f.connect();await f.sync();const original=f.read();
    f.grid[0].values[3]='2.123';await f.sync();assert.match(f.grid[0].status,/소수 둘째/);assert.deepEqual(f.read(),original);
    f.grid[0].values[3]='30';f.storeFails(true);await assert.rejects(f.sync());assert.deepEqual(f.read(),original);assert.equal((await f.items()).length,0);
    f.storeFails(false);const deleted=f.read();deleted.entries[0].status='deleted';deleted.entries[0].version++;f.put(deleted);await f.sync();assert.match(f.grid[0].status,/삭제된/);assert.equal((await f.items()).length,0);
});
test('admin-only sheet routes, pause, resume and cross-channel status remain isolated',async()=>{
    const f=fixture(),api=createPlatformApi({repository:f.repository,itemSheetGoogle:f.google});
    async function call(method,body,secret='secret',id='alpha'){
        const req=Readable.from(body?[Buffer.from(JSON.stringify(body))]:[]);req.method=method;req.url='/api/platform/channels/'+id+'/item-sheet';req.headers={'x-creo-admin':secret};let status,bodyText;
        await api.handle(req,{writeHead(s){status=s},end(b){bodyText=String(b)}},new URL(req.url,'http://localhost'));return {status,data:JSON.parse(bodyText)};
    }
    assert.equal((await call('GET',null,'')).status,401);assert.equal((await call('POST',f.config,'')).status,401);
    assert.equal((await call('POST',f.config)).status,200);assert.equal((await call('GET',null,'secret','beta')).data.configured,false);
    await call('POST',{action:'pause'});f.grid[0].values=f.values();await api.itemSheetSync.sync('alpha');assert.equal((await f.items()).length,0);
    await call('POST',{action:'resume'});await api.itemSheetSync.sync('alpha');assert.equal((await f.items()).length,1);
});

const listingLayout=f=>{for(const r of f.grid){r.offset=1;r.listing='';}return f;};
test('explicit sheet listing approves a submitted entry atomically with its broadcast name, original photos and vendor links',async()=>{
    const f=listingLayout(pendingFixture());await f.connect();await f.sync();const before=f.read();
    assert.equal(f.grid[0].listing,'대기');f.grid[0].values[0]='A01';f.grid[0].values[7]='15';await f.sync();
    assert.equal((await f.items()).length,0);f.grid[0].listing='출품';await Promise.all([f.sync(),f.sync()]);
    const item=(await f.items())[0],state=f.read();assert.equal((await f.items()).length,1);assert.equal(item.name,'A01');assert.equal(item.attributes.displayNumber,'A01');assert.equal(item.lotNumber,1);assert.equal(item.startPrice,150000);assert.equal(item.status,'waiting');
    assert.deepEqual(item.attributes.vendor_entry,{ownerId:f.ownerId,entryId:f.entryId});assert.equal(item.attributes.parents[0].name,'원래 부모');assert.equal(item.photoUrl,'https://example.com/original.webp');
    assert.equal(state.entries[0].status,'approved');assert.equal(state.entries[0].itemId,item.id);assert.equal(state.entries[0].lot,'A01');assert.deepEqual(state.entries[1],before.entries[1]);assert.equal(f.grid[0].status,'출품 완료');
    f.restart();await f.sync();assert.deepEqual(await f.items(),[item]);assert.equal(f.read().entries[0].version,state.entries[0].version);
    f.grid[0].values[0]='B03';await f.sync();assert.equal((await f.items())[0].name,'B03');assert.equal((await f.items())[0].attributes.displayNumber,'B03');assert.equal(f.read().entries[0].lot,'B03');
});
test('listing is an explicit action for new sheet rows; an unfinished name or source cannot be approved',async()=>{
    const f=listingLayout(fixture());await f.connect();f.grid[0].values=f.values();await f.sync();assert.equal((await f.items()).length,0);assert.equal(f.grid[0].listing,'대기');
    f.grid[0].listing='출품';await f.sync();assert.equal((await f.items()).length,1);
    for(const sourceStatus of ['submitted','draft','changes_requested']){
        const p=listingLayout(pendingFixture());const s=p.read();s.entries[0].status=sourceStatus;p.put(s);await p.connect();await p.sync();p.grid[0].listing='출품';await p.sync();assert.equal((await p.items()).length,0);assert.notEqual(p.grid[0].status,'출품 완료');
    }
});
test('multiple sheet approvals use consecutive actual auction positions and reject duplicate broadcast names per row',async()=>{
    const f=listingLayout(pendingFixture()),s=f.read();s.entries.push({...s.entries[0],id:crypto.randomUUID(),entryNumber:2,code:'출품 02'});f.put(s);await f.connect();await f.sync();
    for(const r of f.grid.slice(0,2)){r.listing='출품';r.values[0]='A01';}await f.sync();assert.equal((await f.items()).length,0);assert.match(f.grid[0].status,/중복/);
    f.grid[1].values[0]='A02';await f.sync();const items=await f.items();assert.deepEqual(items.map(i=>i.name),['A01','A02']);assert.deepEqual(items.map(i=>i.lotNumber),[1,2]);assert.equal(f.read().entries.filter(e=>e.channelId==='alpha'&&e.status==='approved').length,2);
});
test('a failed sheet acknowledgement or server restart cannot duplicate an approval',async()=>{
    const f=listingLayout(pendingFixture());await f.connect();await f.sync();f.grid[0].values[0]='A01';f.grid[0].listing='출품';f.publishFails(true);await f.sync();const entry=f.read().entries[0];assert.equal(entry.status,'approved');assert.equal((await f.items()).length,1);
    f.restart();f.publishFails(false);await f.sync();assert.equal((await f.items()).length,1);assert.equal(f.read().entries[0].version,entry.version);assert.equal(f.grid[0].status,'출품 완료');
});
test('approval storage failure rolls back both source and auction, then retry succeeds once',async()=>{
    const f=listingLayout(pendingFixture());await f.connect();await f.sync();const original=f.read();f.grid[0].values[0]='A01';f.grid[0].listing='출품';f.storeFails(true);await assert.rejects(f.sync());assert.deepEqual(f.read(),original);assert.equal((await f.items()).length,0);
    f.storeFails(false);await f.sync();assert.equal((await f.items()).length,1);assert.equal(f.read().entries[0].status,'approved');
});
test('fresh source status and a removed selection prevent stale sheet approval',async()=>{
    for(const change of ['withdraw','clear']){
        const f=listingLayout(pendingFixture());await f.connect();await f.sync();f.grid[0].values[0]='A01';f.grid[0].listing='출품';
        f.afterAcquire(()=>{if(change==='clear')f.grid[0].listing='대기';else{const s=f.read();s.entries[0].status='draft';s.entries[0].version++;f.put(s);}});
        await f.sync();assert.equal((await f.items()).length,0);assert.notEqual(f.read().entries[0].status,'approved');
    }
});
test('published, live and sold lots cannot be removed by clearing the sheet selection',async()=>{
    const f=listingLayout(pendingFixture());await f.connect();await f.sync();f.grid[0].values[0]='A01';f.grid[0].listing='출품';await f.sync();const item=(await f.items())[0];
    f.grid[0].listing='대기';await f.sync();assert.match(f.grid[0].status,/취소는 웹/);assert.deepEqual(await f.items(),[item]);
    f.grid[0].listing='출품';f.putRecord('item',{...item,status:'live'});f.grid[0].values[0]='A02';await f.sync();assert.equal((await f.items())[0].name,'A01');assert.equal(f.read().entries[0].lot,'A01');
    f.putRecord('item',{...item,status:'sold',soldPrice:350000});await f.sync();assert.equal((await f.items())[0].soldPrice,350000);assert.match(f.grid[0].status,/수정할 수 없어요/);
});
test('sheet approval retains durable private media and its source parent relationship',async()=>{
    const f=listingLayout(pendingFixture()),s=f.read(),ref='/__entry_photo__/'+crypto.randomUUID()+'/'+crypto.randomUUID()+'/'+'a'.repeat(64)+'/full.webp';s.media[0].url=ref;s.media[0].thumbnailUrl=ref;f.put(s);
    await f.connect();await f.sync();f.grid[0].values[0]='E01';f.grid[0].listing='출품';await f.sync();const item=(await f.items())[0];assert.equal(item.photoUrl,ref);assert.equal(item.attributes.parents[0].media[0].url,ref);assert.equal(f.read().entries[0].sireId,f.parentId);
});
