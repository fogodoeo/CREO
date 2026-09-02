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
