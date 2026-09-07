'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const { rankingsForChannel, vendorContribution } = require('../public/ranking-engine');
const { normalizeChannel, publicItem } = require('../platform-core');
const profiles = require('../public/broadcast-profiles');

test('finals inherit BASIC item presentation while retaining team scoreboards', () => {
    const basic=profiles.resolve({broadcastProfile:'basic-dice'});
    const finals=profiles.resolve({broadcastProfile:'cdcup-finals'});
    for(const setting of ['page2Price','page2InfoLayout','soldEffectPage'])assert.equal(finals.settings[setting],basic.settings[setting]);
    assert.equal(finals.page3Renderer,'scoreboard');
    assert.notEqual(finals.settings.diceAssets,true);
    const source=fs.readFileSync(require.resolve('../public/auction-live.html'),'utf8');
    assert.match(source,/\n\s*\.item-copy\.is-inline-info\{[^}]*display:flex/);
    assert.doesNotMatch(source,/body\[data-broadcast-profile="basic-dice"\] \.item-copy\.is-inline-info/);
});

test('vendor contribution is separate from sale totals and recalculates on reopen without accumulation', () => {
    const channel = normalizeChannel({id:'finals',name:'결승',groups:[{id:'a',name:'비송팀'}],scoreboards:[{id:'team',dimension:'group',metric:'vendorContribution',unit:'원'},{id:'sales',dimension:'vendor',metric:'soldAmount'}]});
    const vendors = [{id:'captain',name:'비송',groupId:'a',contributionRate:1},{id:'member',name:'끼리끼리',groupId:'a',contributionRate:0.5}];
    const items = [{id:'one',vendorId:'captain',status:'sold',soldPrice:100000},{id:'two',vendorId:'member',status:'sold',soldPrice:100000}];
    const initial = rankingsForChannel(channel,items,vendors);
    assert.equal(initial[0].rows[0].total,30);
    assert.equal(initial[0].unit,'점');
    assert.equal(initial[1].rows.reduce((sum,row)=>sum+row.total,0),200000);
    assert.deepEqual(rankingsForChannel(channel,structuredClone(items),vendors),initial);
    assert.deepEqual(rankingsForChannel(channel,[...items].reverse(),vendors),initial);
    items[1].status='live';
    assert.equal(rankingsForChannel(channel,items,vendors)[0].rows[0].total,20);
    items[1].status='passed';
    assert.equal(rankingsForChannel(channel,items,vendors)[0].rows[0].total,20);
    items[1].status='sold';
    assert.equal(rankingsForChannel(channel,items,vendors)[0].rows[0].total,30);
    assert.equal(rankingsForChannel(channel,[],vendors)[0].rows.length,0);
    assert.equal(vendorContribution({status:'waiting',soldPrice:100000,vendorContributionRate:0.5}),0);
    assert.equal(vendorContribution({status:'sold',soldPrice:15000,vendorContributionRate:0.5}),1.5);
    assert.equal(vendorContribution({status:'sold',soldPrice:15000,vendorContributionRate:1}),3);
    assert.equal(vendorContribution({status:'sold',soldPrice:-1,vendorContributionRate:1}),0);
    assert.equal(vendorContribution({status:'sold',soldPrice:'invalid',vendorContributionRate:1}),0);
});

test('public broadcast preserves only contribution rate and logo, and P3 shows only the sold vendor', () => {
    const item=publicItem({id:'one',status:'sold',soldPrice:100000,vendorName:'끼리끼리',vendorLogoUrl:'/logo.png',vendorContributionRate:0.5,phone:'private'});
    assert.equal(item.vendorContributionRate,0.5);
    assert.equal(item.phone,undefined);
    const source=fs.readFileSync(require.resolve('../public/auction-live.html'),'utf8');
    const start=source.indexOf('function renderVendorContributionPageThree(');
    const end=source.indexOf('\nfunction ',start+1);
    const context={CreoAuctionContract:{isSoldStatus:status=>status==='sold'},CreoRankingEngine:{vendorContribution},scoreboardRows:()=>[],activeItem:(_,items)=>items[0],vendorLogo:item=>item.vendorLogoUrl,esc:String,money:String,pageThreeFrame:(_,title,body)=>body};
    vm.createContext(context);vm.runInContext(source.slice(start,end),context);
    const channel={groups:[{id:'a',name:'비송팀'}],scoreboards:[{dimension:'group',metric:'vendorContribution'}]};
    const rendered=context.renderVendorContributionPageThree(channel,{mode:'sold'},[item]);
    assert.match(rendered,/끼리끼리 로고/);assert.match(rendered,/비송팀/);assert.match(rendered,/vendor-contribution-result/);assert.doesNotMatch(rendered,/<video|팀원 50%|낙찰가/);
    assert.match(rendered,/100,000/);assert.match(rendered,/기여도 · 100%/);assert.doesNotMatch(rendered,/<small>만<\/small>/);
    const fractional=context.renderVendorContributionPageThree(channel,{mode:'sold'},[{...item,soldPrice:10000}]);
    assert.match(fractional,/끼리끼리/);
    assert.match(fractional,/<strong>1<\/strong>/);
    const captain=context.renderVendorContributionPageThree(channel,{mode:'sold'},[{...item,winnerAlias:'테스트낙찰자',vendorContributionRate:1}]);
    assert.match(captain,/테스트낙찰자/);assert.match(captain,/기여도 · 200%/);assert.match(captain,/<strong>20<\/strong>/);
    assert.match(source,/'p3-effect':'.dice-overlay-card, .contribution-stage'/);
    assert.doesNotMatch(context.renderVendorContributionPageThree(channel,{mode:'live'},[item]),/src="\/logo.png"/);
});
