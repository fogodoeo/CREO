'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const { publicItem } = require('../platform-core');
const contract = require('../public/auction-contract');
const source = fs.readFileSync(require.resolve('../public/auction-live.html'), 'utf8');
const context = vm.createContext({
    CreoAuctionContract: contract,
    CreoBroadcastItemNotes: require('../public/broadcast-item-notes'),
    esc: value => String(value).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
});
vm.runInContext(source.slice(source.indexOf('function pageTwoInfoTraits('), source.indexOf('function pageTwoParents(')), context);
const itemWithDate = (hatchDate, checklist = 'gender:F|weight:28') => ({
    id: 'one', name: '1부 A01', status: 'live', note: '비고는 둘째 줄',
    attributes: { checklist, entry_traits: { hatchDate, privateData: 'DO_NOT_EXPOSE' } }
});

test('submitted full hatch date reaches the existing P2 traits row without changing stored data or exposing entry internals', () => {
    const source = itemWithDate('2026-07-14');
    source.attributes.checklist += '|quiz_answer_b64:PRIVATE_ANSWER';
    const before = structuredClone(source);
    const item = publicItem(source);
    assert.equal(contract.parseChecklist(item.attributes.checklist).birth, '26.07.14');
    assert.equal(item.attributes.entry_traits, undefined);
    assert.doesNotMatch(JSON.stringify(item), /DO_NOT_EXPOSE|PRIVATE_ANSWER/);
    assert.deepEqual(source, before);
    assert.deepEqual(publicItem(item), item, 'repeated public projection does not duplicate the date');
    assert.deepEqual(Array.from(context.pageTwoInfoTraits(item), row => row.text), ['암컷', '28g', '26.07.14']);
    const html = context.pageTwoInlineInfo(item, '');
    assert.equal((html.match(/26\.07\.14/g) || []).length, 1);
    assert.ok(html.indexOf('26.07.14') < html.indexOf('broadcast-item-note'));
    assert.match(context.pageTwoInlineInfo(item, '', false), /26\.07\.14/);
});

test('explicit legacy or operator birth values remain intact, while empty birth slots receive the submitted date once', () => {
    for (const birth of ['2025.12', '2025.12.18']) {
        const item = publicItem(itemWithDate('2026-07-14', `gender:M|birth:${birth}|weight:15`));
        assert.equal(contract.parseChecklist(item.attributes.checklist).birth, birth);
        assert.equal((item.attributes.checklist.match(/birth:/g) || []).length, 1);
    }
    const item = publicItem(itemWithDate('2026-07-14', 'birth:|gender:F|birth:|weight:28'));
    assert.equal((item.attributes.checklist.match(/birth:/g) || []).length, 1);
    assert.equal(contract.parseChecklist(item.attributes.checklist).birth, '26.07.14');
});

test('missing, incomplete, impossible or injected hatch dates do not create blank or invented dates', () => {
    for (const birth of [undefined, null, '', '2026-07', '2026-02-30', '2025-02-29', '2026-13-01', '2026-07-14|memo:injected', '<script>']) {
        const item = publicItem(itemWithDate(birth));
        assert.equal(contract.parseChecklist(item.attributes.checklist).birth, undefined);
        assert.deepEqual(Array.from(context.pageTwoInfoTraits(item), row => row.text), ['암컷', '28g']);
    }
    assert.equal(contract.parseChecklist(publicItem(itemWithDate('2024-02-29')).attributes.checklist).birth, '24.02.29');
    assert.equal(contract.parseChecklist(publicItem({}).attributes.checklist).birth, undefined);
});

test('date changes, removal and next-item rendering never retain the preceding item date', () => {
    for (const [date, expected] of [['2026-07-14', '26.07.14'], ['2025-12-18', '25.12.18'], ['', '']]) {
        const item = publicItem(itemWithDate(date));
        const html = context.pageTwoInlineInfo(item, '');
        if (expected) assert.ok(html.includes(expected));
        for (const other of ['26.07.14', '25.12.18'].filter(value => value !== expected)) assert.ok(!html.includes(other));
    }
});
