'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const source = fs.readFileSync(require.resolve('../band_directory_bot.py'), 'utf8').split('API_SCRIPT = r"""')[1].split('"""')[0];
const run = (context, operation, args = []) => vm.runInContext(source.replace('__OPERATION__', JSON.stringify(operation)).replace('__ARGS__', JSON.stringify(args)), context);
function context(owner, factories = {}) {
    const imported = [];
    const require = id => { imported.push(id); const mod = { exports: {} }; factories[id](mod); return mod.exports; };
    require.c = { cached: { exports: owner } }; require.m = factories;
    const window = { __bandWebpackRequire: require };
    return { scope: vm.createContext({ window, location: { pathname: '/band/104432443/applications' } }), imported, window };
}

test('BAND runtime uses the loaded API without initializing screens mentioning its name', async () => {
    const fixture = context({ getApplicationOfBand: async () => ({ items: [] }) }, {
        unrelated() { throw Error('screen only mentions getApplicationOfBand'); }
    });
    const result = await run(fixture.scope, 'getApplicationOfBand', ['104432443']);
    assert.equal(result.ok, true);
    assert.equal(result.data.items.length, 0);
    assert.deepEqual(fixture.imported, []);
});

test('BAND roster indexing merges capped views without duplicates and transfers only identities', async () => {
    let release;
    const gate = new Promise(resolve => { release = resolve; });
    let calls = 0;
    const fixture = context({ getMembersOfBand: async (_band, order) => {
        calls++; await gate;
        return { member_count: 3, members: (order ? [2, 3] : [1, 2]).map(user_no => ({ user_no, name: 'private profile' })) };
    } });
    const first = await run(fixture.scope, 'rosterList');
    assert.equal(first.data.pending, true);
    assert.equal(calls, 1);
    release();
    while (!fixture.window.__creoRosterJob.ready) await new Promise(resolve => setImmediate(resolve));
    const result = await run(fixture.scope, 'rosterList');
    assert.equal(calls, 2);
    assert.equal(result.data.members.length, 3);
    assert.equal(result.data.expectedCount, 3);
    assert.doesNotMatch(JSON.stringify(result), /private profile/);
    assert.equal(new Set(result.data.members.map(m => m.user_no)).size, 3);
});
