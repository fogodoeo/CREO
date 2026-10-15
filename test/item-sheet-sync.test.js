'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const {createItemSheetSync,seal,unseal,CREDENTIAL_KEY}=require('../item-sheet-sync');
const Model=require('../item-sheet-model');
const {sanitizeRecord,validateRecord,createPlatformApi}=require('../platform-api');
const {channelKey}=require('../platform-core');
const {Readable}=require('node:stream');
const {STRUCTURE}=require('../item-sheet-google');
function fixture(){
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
        async publish(_,updates,lease){if(failPublish)throw Error('network failure');for(const u of updates){const r=grid.find(r=>r.id===u.id);if(u.values)r.values=copy(u.values);r.status=u.status;r.choice=u.choice;}await this.release(_,lease);}
    };
    const locks=new Map();
    const lock=async(key,fn)=>{const old=locks.get(key)||Promise.resolve();let release;const p=new Promise(r=>release=r);locks.set(key,old.then(()=>p));await old;try{return await fn()}finally{release()}};
    const workspace=async id=>({vendors:await repository.listRecords(id,'vendor'),items:await repository.listRecords(id,'item'),shipments:await repository.listRecords(id,'shipment'),broadcast:await repository.getRecord(id,'broadcast','state')||{}});
    const create=()=>createItemSheetSync({repository,lock,workspace,sanitizeRecord,validateRecord,google,now:()=>++time,logger:{warn(){}}});
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
test('credential material is encrypted and the status response cannot expose it',async()=>{
    const sealed=seal({private_key:'test key',client_email:'test'},'secret');assert.equal(JSON.stringify(sealed).includes('test key'),false);assert.deepEqual(unseal(sealed,'secret'),{private_key:'test key',client_email:'test'});assert.throws(()=>unseal(sealed,'wrong'));
    const f=fixture();await f.service.configure(f.channel,{...f.config,serviceAccount:{type:'service_account',client_email:'robot@test.iam.gserviceaccount.com',private_key:'-----BEGIN PRIVATE KEY-----\nfixture\n'}});assert.equal(f.records.get(CREDENTIAL_KEY).includes('PRIVATE KEY'),false);assert.equal(JSON.stringify(await f.service.status('alpha')).includes('private_key'),false);
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
