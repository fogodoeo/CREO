'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path'),{Readable}=require('node:stream');
const {SQLitePlatformRepository}=require('../sqlite-platform-repository');
const {createPlatformApi}=require('../platform-api'),{normalizeChannel}=require('../platform-core');
const Adapters=require('../public/channel-adapters');

async function fixture(t) {
    const dir=fs.mkdtempSync(path.join(os.tmpdir(),'creo-rounds-'));
    const options={dbPath:path.join(dir,'local.sqlite'),durable:true,startWorker:false,adminSecret:'secret'};
    let repo,api;
    function start(){repo=new SQLitePlatformRepository(options);api=createPlatformApi({repository:repo,adminSessionSecret:'rounds-test',logger:{error(){},warn(){}}});}
    start();
    t.after(()=>{repo.close();assert.equal(path.dirname(path.resolve(dir)),path.resolve(os.tmpdir()));assert(path.basename(dir).startsWith('creo-rounds-'));fs.rmSync(dir,{recursive:true,force:true});});
    await repo.saveCatalog(['alpha','beta'].map(id=>normalizeChannel({id,name:id,status:'active',dataAdapter:'platform'})));
    await repo.setActiveChannel('alpha');
    await repo.upsertRecord('alpha','vendor',{id:'v',name:'가상 업체',phone:'01000000001',bankName:'가상은행',bankAccount:'000',bankHolder:'가상'});
    await repo.upsertRecord('alpha','item',{id:'old',name:'1부 A01',lotNumber:1,vendorId:'v',vendorName:'가상 업체',status:'sold',soldPrice:30000,buyerSaleId:'original-sale',winnerName:'가상 구매자',winnerPhone:'01000000002',attributes:{bid_log:JSON.stringify([{name:'가상 구매자',amount:3}])}});
    await repo.upsertRecord('alpha','shipment',{id:'ship',itemId:'old',vendorId:'v',recipientName:'가상 구매자',recipientPhone:'01000000002',status:'complete',paymentStatus:'paid',paymentConfirmedAmount:30000});
    await repo.upsertRecord('alpha','broadcast',{id:'state',mode:'standby',activeItemId:'old',page:1});
    async function call(method,route,body,admin=true){
        const req=Readable.from(body?[Buffer.from(JSON.stringify(body))]:[]);req.method=method;req.headers={host:'test.invalid',...(admin?{'x-creo-admin':'secret'}:{})};
        const res={writeHead(status){this.status=status},end(body=''){this.body=String(body)},json(){return JSON.parse(this.body||'{}')}};
        await api.handle(req,res,new URL('https://test.invalid/api/platform/'+route));return res;
    }
    const response=await call('POST','channels/alpha/archives',{title:'가상 이전 회차'});assert.equal(response.status,201,response.body);
    const archiveId=response.json().archive.id;
    return {call,archiveId,close:()=>call('POST',`channels/alpha/archives/${archiveId}/close-round`),get repo(){return repo},restart(){repo.close();start()}};
}

test('closing a round hides auction rows while preserving financial identity, shipping and archive across restart',async t=>{
    const f=await fixture(t),item=await f.repo.getRecord('alpha','item','old'),shipment=await f.repo.getRecord('alpha','shipment','ship');
    const replies=await Promise.all([f.close(),f.close()]);assert(replies.every(r=>r.status===200));assert.deepEqual(replies.map(r=>r.json().duplicate).sort(),[false,true]);
    f.restart();
    const current=(await f.call('GET','channels/alpha/workspace')).json();assert.equal(current.items.length,0);assert.equal(current.archivedItems.length,1);assert.deepEqual(current.shipments,[shipment]);
    assert.equal(current.broadcast.mode,'standby');assert.equal(current.broadcast.activeItemId,'');
    const {auctionArchiveId,updatedAt,...saved}=current.archivedItems[0],{updatedAt:priorTime,...original}=item;
    assert.equal(auctionArchiveId,f.archiveId);assert.deepEqual(saved,original);
    const archive=(await f.call('GET',`channels/alpha/archives/${f.archiveId}`)).json().archive;
    assert(archive.closedAt);assert.deepEqual(archive.items,[item]);
    assert.equal(Adapters.platformShippingItems(current,current.channel).length,1);
    const context=(await f.call('GET','operator-context')).json();assert.deepEqual(context.workspace.items,[]);
    const full=(await f.call('GET','channels/alpha/workspace?includeArchived=1')).json();assert.equal(full.items.length,1);
    const broadcast=(await f.call('GET','channels/alpha/broadcast')).json();assert.equal(broadcast.items.length,0);assert.equal(broadcast.itemProgress.total,0);assert(!JSON.stringify(broadcast).includes('01000000002'));
    const organizer=await f.call('GET','channels/alpha/organizer-shipping');assert.equal(organizer.status,200,organizer.body);assert.deepEqual(organizer.json().auctionItems,[]);
    const checkout=await f.call('GET','channels/alpha/buyer-checkout-preview?itemId=old');assert.equal(checkout.status,200,checkout.body);
    const contacts=(await f.call('GET','channels/alpha/buyer-contacts')).json();assert.equal(contacts.rows[0].archived,true);
    assert.deepEqual(await f.repo.listRecords('beta','item'),[]);
});

test('archived items reject stale edits, deletes, ID reuse, broadcast selection and reopening',async t=>{
    const f=await fixture(t),old=await f.repo.getRecord('alpha','item','old');await f.close();
    for(const [method,route,body] of [
        ['PUT','items/old',{record:old}],['DELETE','items/old'],['POST','items',{record:old}],
        ['PUT','auction-transition',{itemId:'old',status:'live'}],['PUT','broadcast-state',{activeItemId:'old',mode:'live'}],
        ['DELETE',`archives/${f.archiveId}`]
    ]){const r=await f.call(method,'channels/alpha/'+route,body);assert.equal(r.status,409,route+': '+r.body);}
    assert.equal((await f.call('POST',`channels/beta/archives/${f.archiveId}/close-round`)).status,404);
    assert.equal((await f.call('POST',`channels/alpha/archives/${f.archiveId}/close-round`,null,false)).status,401);
});

test('new lots reuse numbering and duplicate close never clears the next live round',async t=>{
    const f=await fixture(t);await f.close();
    const added=await f.call('POST','channels/alpha/items',{allocateNextLot:true,record:{id:'new',name:'1부 A01',vendorId:'v',status:'waiting',startPrice:0}});
    assert.equal(added.status,201,added.body);assert.equal(added.json().record.lotNumber,1);
    const staleSelection=await f.call('PUT','channels/alpha/auction-transition',{itemId:'new',status:'live',mode:'live',state:{activeItemId:'old'}});
    assert.equal(staleSelection.status,409);assert.equal((await f.repo.getRecord('alpha','item','new')).status,'waiting');
    const started=await f.call('PUT','channels/alpha/auction-transition',{itemId:'new',status:'live',mode:'live'});assert.equal(started.status,200,started.body);
    f.restart();assert.equal((await f.close()).json().duplicate,true);
    assert.equal((await f.repo.getRecord('alpha','broadcast','state')).activeItemId,'new');
    assert.equal((await f.repo.getRecord('alpha','item','new')).status,'live');
});

test('live and changed snapshots fail closed; concurrent writes cannot silently discard a changed lot',async t=>{
    const f=await fixture(t),before=await f.repo.getRecord('alpha','item','old');
    await f.repo.upsertRecord('alpha','broadcast',{id:'state',mode:'live'});assert.equal((await f.close()).status,409);
    await f.repo.upsertRecord('alpha','broadcast',{id:'state',mode:'standby'});
    const responses=await Promise.all([
        f.call('PUT','channels/alpha/items/old',{record:{...before,note:'changed'},expectedUpdatedAt:before.updatedAt}),f.close()
    ]);
    assert.deepEqual(responses.map(r=>r.status).sort(),[200,409]);
    assert(!(await f.repo.getRecord('alpha','item','old')).auctionArchiveId);
});

test('atomic storage failure retains all old rows and an unclosed archive; retry after restart succeeds',async t=>{
    const f=await fixture(t),before=await f.repo.listRecords('alpha','item'),state=await f.repo.getRecord('alpha','broadcast','state'),write=f.repo.upsertRows.bind(f.repo);
    f.repo.upsertRows=rows=>write(rows.some(r=>r.key.includes('::item::'))?[...rows,{key:{invalid:true},value:'rollback'}]:rows);
    assert.equal((await f.close()).status,500);assert.deepEqual(await f.repo.listRecords('alpha','item'),before);assert.deepEqual(await f.repo.getRecord('alpha','broadcast','state'),state);assert(!(await f.repo.getRecord('alpha','archive',f.archiveId)).closedAt);
    f.restart();assert.equal((await f.close()).status,200);
});
