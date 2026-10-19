const test = require('node:test');
const assert = require('node:assert/strict');
const OperationChannel = require('../public/operation-channel');
const ChannelRuntime = require('../public/channel-runtime');

test('operation channel accepts only the explicit normalized channel query', () => {
    assert.equal(OperationChannel.channelIdFromLocation({ search: '?channel=Winter%20Cup' }, ChannelRuntime), 'winter-cup');
    assert.equal(OperationChannel.channelIdFromLocation({ search: '?event=basic' }, ChannelRuntime), '');
    assert.throws(() => OperationChannel.create({
        channelId: '',
        runtime: ChannelRuntime,
        client: { api: async () => ({}) },
        adapters: { resolve() {} }
    }), /채널 주소가 없습니다/);
});

test('operation channel resolves one verified channel and reuses its adapter context', async () => {
    const calls = [];
    const channel = { id: 'winter-cup', name: 'Winter Cup', dataAdapter: 'platform' };
    const adapter = {
        id: 'platform',
        async loadShippingItems(context) {
            context.workspace = { channelId: context.channel.id };
            calls.push(['load', context.channel.id]);
            return [{ id: 'item-1' }];
        },
        async saveShippingItem(context, row, data, audit) {
            calls.push(['save', context.channel.id, row, data.shipping_type, audit.actor]);
            return { ok: true };
        }
    };
    let channelReads = 0;
    const operation = OperationChannel.create({
        channelId: 'winter-cup',
        runtime: ChannelRuntime,
        client: { api: async () => { channelReads += 1; return { channel }; } },
        adapters: { resolve: resolved => { assert.equal(resolved, channel); return adapter; } }
    });

    const [first, second] = await Promise.all([operation.ready(), operation.ready()]);
    assert.equal(first, second);
    assert.equal(channelReads, 1);
    assert.deepEqual(await operation.loadShippingItems(), [{ id: 'item-1' }]);
    assert.deepEqual(operation.context.workspace, { channelId: 'winter-cup' });
    assert.deepEqual(await operation.saveShippingItem(7, { shipping_type: '배송' }, { actor: 'admin' }), { ok: true });
    assert.deepEqual(calls, [['load', 'winter-cup'], ['save', 'winter-cup', 7, '배송', 'admin']]);
});

test('operation channel fails closed when the server returns another channel', async () => {
    const operation = OperationChannel.create({
        channelId: 'winter-cup',
        runtime: ChannelRuntime,
        client: { api: async () => ({ channel: { id: 'summer-cup' } }) },
        adapters: { resolve() { throw new Error('must not resolve'); } }
    });
    await assert.rejects(operation.ready(), /서버 자료가 일치하지 않습니다/);
});

test('selected archive only loads that round and refuses saves to a different round', async t => {
    const previous=global.CreoPlatform;t.after(()=>{global.CreoPlatform=previous});
    const channel={id:'national-cre',dataAdapter:'platform'};
    const archived=id=>({id,status:'sold',soldPrice:100000,auctionArchiveId:id});
    global.CreoPlatform={api:async()=>({items:[{id:'current',status:'sold',soldPrice:200000}],archivedItems:[archived('round-1'),archived('round-2')],shipments:[],vendors:[]})};
    const adapter=require('../public/channel-adapters').resolve(channel);
    const make=archiveId=>OperationChannel.create({channelId:channel.id,archiveId,runtime:ChannelRuntime,client:{api:async()=>({channel})},adapters:{resolve:()=>adapter}});
    const operation=make('round-1');assert.deepEqual((await operation.loadShippingItems()).map(i=>i.id),['round-1']);
    await assert.rejects(operation.saveShippingItem('current',{}),/선택한 회차/);
    assert.deepEqual(await make('missing').loadShippingItems(),[]);
    assert.deepEqual((await make('').loadShippingItems()).map(i=>i.id),['current']);
});

test('print includes waiting and passed lots while shipping and payments stay sold-only in the selected round',async t=>{
    const previous=global.CreoPlatform;t.after(()=>{global.CreoPlatform=previous});
    const channel={id:'print-round',dataAdapter:'platform'};
    const workspace={vendors:[{id:'vendor',name:'가상 업체'}],shipments:[{id:'shipment',itemId:'sold',status:'complete',cost:19000,paymentStatus:'paid'}],items:[
        {id:'waiting',vendorId:'vendor',status:'waiting',soldPrice:0},
        {id:'passed',vendorId:'vendor',status:'passed',soldPrice:0},
        {id:'sold',vendorId:'vendor',status:'sold',soldPrice:100000},
        {id:'old-sold',status:'sold',soldPrice:200000,auctionArchiveId:'old'}
    ],archivedItems:[{id:'old-waiting',status:'waiting',soldPrice:0,auctionArchiveId:'old'},{id:'other',status:'sold',soldPrice:300000,auctionArchiveId:'other'}]};
    const before=structuredClone(workspace),calls=[];let failure=false;
    global.CreoPlatform={api:async path=>{calls.push(path);if(failure)throw Error('temporary read failure');return structuredClone(workspace)}};
    const adapters=require('../public/channel-adapters'),contract=require('../public/auction-contract');
    const make=archiveId=>OperationChannel.create({channelId:channel.id,archiveId,runtime:ChannelRuntime,client:{api:async()=>({channel})},adapters});
    const operation=make(''),printed=await operation.loadPrintItems(),shipped=await operation.loadShippingItems();
    assert.deepEqual(printed.map(i=>i.id),['waiting','passed','sold']);
    assert.deepEqual(printed.filter(i=>contract.isSoldStatus(i.status)).map(i=>i.id),['sold']);
    assert.equal(contract.normalizeStatus(printed[1].status),'passed');
    assert.deepEqual(shipped,[printed[2]]);assert.equal(shipped[0].sold_amount_won,100000);assert.equal(shipped[0].shipping_cost,19000);assert.equal(shipped[0].payment_status,'paid');
    assert.deepEqual((await make('old').loadPrintItems()).map(i=>i.id),['old-sold','old-waiting']);
    assert.deepEqual((await make('old').loadShippingItems()).map(i=>i.id),['old-sold']);
    assert.deepEqual(await make('missing').loadPrintItems(),[]);
    failure=true;await assert.rejects(operation.loadPrintItems(),/temporary read failure/);failure=false;
    assert.deepEqual(await operation.loadPrintItems(),printed);
    assert.ok(calls.every(path=>path.startsWith('channels/print-round/workspace?scope=round')));assert.deepEqual(workspace,before);
});

test('legacy print keeps existing list behavior and rejects unsupported archive scopes',async t=>{
    const previous=global.getItems;t.after(()=>{global.getItems=previous});
    const rows=[{row:1,status:'대기',name:'가상 레거시 개체'}];global.getItems=async()=>rows;
    const channel={id:'legacy-round',dataAdapter:'legacy-cdcup'},adapters=require('../public/channel-adapters');
    const make=archiveId=>OperationChannel.create({channelId:channel.id,archiveId,runtime:ChannelRuntime,client:{api:async()=>({channel})},adapters});
    assert.deepEqual(await make('').loadPrintItems(),rows);
    await assert.rejects(make('old').loadPrintItems(),/보관 회차/);
});
