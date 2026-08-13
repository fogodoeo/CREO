'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
    channelKey,
    channelLinks,
    normalizeChannel,
    publicItem,
    validateChannel
} = require('../platform-core');

test('channel identifiers and storage keys create hard data boundaries', () => {
    assert.equal(channelKey('summer-auction', 'vendor', 'ven_1'), 'creo_v2::summer-auction::vendor::ven_1');
    assert.throws(() => channelKey('!!!', 'vendor', 'one'), /Invalid channel key/);
    assert.match(channelLinks('summer-auction').workspace, /channel=summer-auction/);
    assert.equal(channelLinks('crewart').shipping, '/shipping.html?channel=crewart');
    assert.equal(channelLinks('crewart').shippingStatus, '/shipping-status.html?channel=crewart');
    assert.equal(channelLinks('crewart').shippingRates, '/shipping-rates.html?channel=crewart');
    assert.equal(channelLinks('crewart').archives, '/channel-archives.html?channel=crewart');
    assert.equal(channelLinks('crewart').settings, '/channel-manager.html?channel=crewart');
});

test('channel configuration is normalized and duplicate ids are rejected', () => {
    const channel = normalizeChannel({
        id: 'New Auction!',
        name: '  여름   경매  ',
        status: 'active',
        broadcastTemplate: 'classic',
        theme: { primary: '#ABCDEF', secondary: 'invalid' }
    });
    assert.equal(channel.id, 'new-auction');
    assert.equal(channel.name, '여름 경매');
    assert.equal(channel.theme.primary, '#abcdef');
    assert.equal(channel.theme.secondary, '#d6b25e');

    const result = validateChannel(channel, [{ id: 'new-auction' }]);
    assert.equal(result.valid, false);
    assert.match(result.errors.join(' '), /이미 사용 중/);
});

test('public broadcast items never expose winner or shipping contact data', () => {
    const item = publicItem({
        id: 'item_1', lotNumber: 3, name: '테스트 개체', winnerName: '홍길동',
        winnerPhone: '01012345678', shippingAddress: '서울', soldPrice: 20, teamName: 'RED'
    });
    assert.equal(item.name, '테스트 개체');
    assert.equal(item.soldPrice, 20);
    assert.equal(item.teamName, 'RED');
    assert.equal('winnerPhone' in item, false);
    assert.equal('shippingAddress' in item, false);
});

test('channel builder configuration normalizes reusable groups, scoreboards, and overlays', () => {
    const channel = normalizeChannel({
        id: 'builder-test', name: '빌더 테스트', templateId: 'team', logoUrl: '/logo.png',
        features: { groups: true, shipping: false },
        terminology: { item: '출품물', vendor: '브리더', group: '조' },
        groups: [{ id: 'alpha', name: 'A조', color: '#AA0000' }],
        scoreboards: [{ id: 'group-total', name: '조별 합계', dimension: 'group', metric: 'soldAmount', unit: '만원', topN: 4 }],
        overlay: { skin: 'sport', layout: 'right' },
        dataAdapter: 'platform',
        broadcastProfile: 'cdcup-tournament',
        pages: { survey: '/survey.html', unsafe: 'javascript:alert(1)' }
    });
    assert.equal(channel.logoUrl, '/logo.png');
    assert.equal(channel.features.groups, true);
    assert.equal(channel.features.shipping, false);
    assert.equal(channel.terminology.vendor, '브리더');
    assert.equal(channel.groups[0].color, '#aa0000');
    assert.equal(channel.scoreboards[0].dimension, 'group');
    assert.equal(channel.overlay.layout, 'right');
    assert.equal(channel.dataAdapter, 'platform');
    assert.equal(channel.broadcastProfile, 'cdcup-tournament');
    assert.equal(channel.pages.survey, '/survey.html');
    assert.equal(channel.pages.unsafe, undefined);
});

test('channel validation rejects contradictory feature combinations', () => {
    const invalid = validateChannel({
        id: 'broken-channel', name: '잘못된 채널',
        features: { vendors: false, shipping: true, broadcast: false, scoreboards: true, groups: false },
        scoreboards: [{ id: 'groups', name: '그룹 합계', dimension: 'group', metric: 'soldAmount' }]
    });
    assert.equal(invalid.valid, false);
    assert.match(invalid.errors.join(' '), /배송 기능.*업체 기능/);
    assert.match(invalid.errors.join(' '), /집계판.*방송 기능/);
    assert.match(invalid.errors.join(' '), /그룹 기준 집계판.*그룹 기능/);
});

test('an existing channel can intentionally remove every scoreboard', () => {
    const fallback = normalizeChannel({
        id: 'existing-board', name: '기존 채널',
        scoreboards: [{ id: 'total', name: '전체 합계', dimension: 'vendor', metric: 'soldAmount' }]
    });
    const updated = normalizeChannel({ ...fallback, features: { ...fallback.features, scoreboards: false }, scoreboards: [] }, fallback);
    assert.equal(updated.features.scoreboards, false);
    assert.deepEqual(updated.scoreboards, []);
});
