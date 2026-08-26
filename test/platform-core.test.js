'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
    DEFAULT_CHANNELS,
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
    assert.equal(channelLinks('crewart').shippingCompanies, '/shipping-status.html?channel=crewart&view=company');
    assert.equal(channelLinks('crewart').shippingRates, '/shipping-rates.html?channel=crewart');
    assert.equal(channelLinks('crewart').archives, '/channel-archives.html?channel=crewart');
    assert.equal(channelLinks('crewart').rankings, '/channel-archives.html?channel=crewart&view=current');
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
        winnerAlias: '홍길동/대구/01012345678',
        winnerPhone: '01012345678', shippingAddress: '서울', soldPrice: 20, teamName: 'RED',
        attributes: {
            crewart_house_key: 'B',
            crewart_house_source: 'survey',
            bid_log: JSON.stringify([{ name: '입찰자', bidder_key: 'bidder-1', amount: 31, phone: '01099999999', crewart_house_key: 'G', crewart_house_source: 'survey' }]),
            checklist: 'gender:M|weight:42|sale_mode:quiz|quiz_question_b64:question|quiz_answer_b64:secret|sale_config_b64:secret-config',
            photo_sire: '/sire.webp'
        }
    });
    assert.equal(item.name, '테스트 개체');
    assert.equal(item.soldPrice, 20);
    assert.equal(item.teamName, 'RED');
    assert.equal('winnerPhone' in item, false);
    assert.equal('shippingAddress' in item, false);
    assert.equal(item.winnerAlias, '홍길동/대구');
    assert.equal(item.bidLog.length, 1);
    assert.deepEqual({ ...item.bidLog[0], bidder_key: '<private>' }, {
        name: '입찰자', bidder_key: '<private>', region: '', amount: 31, amount_won: 310000,
        time: '', timestamp: '', created_at: '', bid_sequence: 0,
        crewart_assignment_sequence: 0, isQuiz: false,
        crewart_house_key: 'G', crewart_house_source: 'survey'
    });
    assert.match(item.bidLog[0].bidder_key, /^bidder_/);
    assert.notEqual(item.bidLog[0].bidder_key, 'bidder-1');
    assert.equal('phone' in item.bidLog[0], false);
    assert.equal(item.attributes.checklist, 'gender:M|weight:42|sale_mode:quiz|quiz_question_b64:question');
    assert.equal(item.attributes.photo_sire, '/sire.webp');
    assert.equal(item.attributes.crewart_house_key, 'B');
    assert.equal(item.attributes.crewart_house_source, 'survey');
    assert.doesNotMatch(JSON.stringify(item), /secret/);
});

test('CREWART defaults define viewer-color sold amount competition as channel capability', () => {
    const crewart = DEFAULT_CHANNELS.find(channel => channel.id === 'crewart');
    assert.deepEqual(crewart.audienceCompetition, {
        enabled: true,
        assignment: 'survey-random',
        metric: 'soldPrice'
    });
    assert.deepEqual(crewart.settlementDiscount, {
        enabled: true,
        rule: 'winner-house',
        ratePercent: 10,
        excludeShipping: true
    });
    assert.deepEqual(crewart.scoreboards[0], {
        id: 'houses', name: '팀별 낙찰금 합계', dimension: 'winnerHouse',
        metric: 'soldAmount', unit: '만원', topN: 4
    });
    const disabled = normalizeChannel({
        id: 'invalid-audience-mode', name: 'invalid',
        audienceCompetition: { enabled: true, assignment: 'item-group', metric: 'points' }
    });
    assert.deepEqual(disabled.audienceCompetition, {
        enabled: true, assignment: 'none', metric: 'soldPrice'
    });
});

test('viewer house competition upgrades a stale points board without using a channel id', () => {
    const normalized = normalizeChannel({
        id: 'any-community-auction', name: '어떤 팀전',
        audienceCompetition: { enabled: true, assignment: 'survey-random', metric: 'soldPrice' },
        scoreboards: [{ id: 'houses', name: '예전 점수', dimension: 'group', metric: 'points', unit: '점', topN: 4 }]
    });
    assert.deepEqual(normalized.scoreboards[0], {
        id: 'houses', name: '팀별 낙찰금 합계', dimension: 'winnerHouse',
        metric: 'soldAmount', unit: '만원', topN: 4
    });
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
        shippingDefaults: { pickupLocations: ['크레용 대구지점', ' 크레용 대구지점 ', '크레용 양산지점'] },
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
    assert.deepEqual(channel.shippingDefaults.pickupLocations, ['크레용 대구지점', '크레용 양산지점']);
    assert.equal(channel.pages.survey, '/survey.html');
    assert.equal(channel.pages.unsafe, undefined);
});

test('brushed metal is a reusable channel overlay skin', () => {
    const channel = normalizeChannel({
        id: 'metal-auction', name: 'Metal Auction', overlay: { skin: 'metal', layout: 'balanced' }
    });
    assert.equal(channel.overlay.skin, 'metal');
    assert.equal(channel.overlay.layout, 'balanced');
});

test('channel broadcast defaults preserve all three hosts', () => {
    const channel = normalizeChannel({
        id: 'three-hosts', name: 'Three Hosts',
        broadcastDefaults: { hostName1: 'A', hostName2: 'B', hostName3: 'C', hostRole3: 'Guest' }
    });
    assert.equal(channel.broadcastDefaults.hostName3, 'C');
    assert.equal(channel.broadcastDefaults.hostRole3, 'Guest');
});

test('core archive and ranking routes cannot be replaced by channel page overrides', () => {
    const channel = normalizeChannel({
        id: 'route-test', name: 'Route Test',
        pages: {
            archives: '/legacy-archives.html',
            rankings: '/legacy-rankings.html',
            survey: '/survey.html'
        }
    });
    assert.equal(channel.pages.archives, undefined);
    assert.equal(channel.pages.rankings, undefined);
    assert.equal(channel.pages.survey, '/survey.html');
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

test('BASIC defaults keep phone parity and dice contribution separate from settlement', () => {
    const basic = DEFAULT_CHANNELS.find(channel => channel.id === 'basic');
    assert.equal(basic.broadcastProfile, 'basic-dice');
    assert.deepEqual(basic.groups.map(group => group.id), ['odd', 'even']);
    assert.deepEqual(basic.scoreboards.map(board => [board.dimension, board.metric]), [
        ['winnerGroup', 'soldAmount'],
        ['winnerGroup', 'points']
    ]);
    assert.deepEqual(basic.audienceCompetition, {
        enabled: true, assignment: 'phone-parity', metric: 'soldPrice', contribution: 'dice'
    });
    assert.equal(basic.settlementDiscount.enabled, false);
});
