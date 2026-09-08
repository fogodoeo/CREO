'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const { rankingsForChannel, vendorContribution, liveVendorContribution } = require('../public/ranking-engine');
const { normalizeChannel, publicItem } = require('../platform-core');
const profiles = require('../public/broadcast-profiles');

test('new channel profiles inherit shared item presentation without finals event text', () => {
    assert.equal(profiles.resolve({broadcastProfile:'standard'}).settings.page2InfoLayout,'inline-traits');
    assert.equal(profiles.defaultState({broadcastProfile:'cdcup-finals'}).page3Title,'팀 기여도');
    assert.equal(profiles.defaultState({broadcastProfile:'cdcup-finals',broadcastDefaults:{page3Title:'맞춤 행사'}}).page3Title,'맞춤 행사');
    assert.equal(profiles.resolve({broadcastProfile:'basic-dice'}).page3Renderer,'dice-teams');
});

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
    const item=publicItem({id:'one',updatedAt:new Date().toISOString(),status:'sold',soldPrice:100000,vendorName:'끼리끼리',vendorLogoUrl:'/logo.png',vendorContributionRate:0.5,phone:'private'});
    assert.equal(item.vendorContributionRate,0.5);
    assert.equal(item.phone,undefined);
    const source=fs.readFileSync(require.resolve('../public/auction-live.html'),'utf8');
    const start=source.indexOf('function renderVendorContributionPageThree(');
    const end=source.indexOf('\nfunction ',start+1);
    const context={CreoContributionResult:require('../public/contribution-result'),editorMode:false,CreoAuctionContract:{isSoldStatus:status=>status==='sold'},CreoRankingEngine:{vendorContribution,liveVendorContribution},scoreboardRows:()=>[],activeItem:(_,items)=>items[0],vendorLogo:item=>item.vendorLogoUrl,esc:String,money:String,pageThreeFrame:(_,title,body)=>body};
    vm.createContext(context);vm.runInContext(source.slice(start,end),context);
    const channel={groups:[{id:'a',name:'비송팀'}],scoreboards:[{dimension:'group',metric:'vendorContribution'}]};
    const rendered=context.renderVendorContributionPageThree(channel,{mode:'sold'},[item]);
    assert.match(rendered,/끼리끼리 로고/);assert.match(rendered,/비송팀/);assert.match(rendered,/vendor-contribution-result/);assert.doesNotMatch(rendered,/<video|팀원 50%|낙찰가/);
    assert.match(rendered,/<b>10<\/b>/);assert.doesNotMatch(rendered,/100,000|×2|기여도 ·/);assert.doesNotMatch(rendered,/<small>만<\/small>/);
    const fractional=context.renderVendorContributionPageThree(channel,{mode:'sold'},[{...item,soldPrice:10000}]);
    assert.match(fractional,/끼리끼리/);
    assert.match(fractional,/<b>1<\/b>/);
    const captain=context.renderVendorContributionPageThree(channel,{mode:'sold'},[{...item,winnerAlias:'테스트낙찰자',vendorContributionRate:1}]);
    assert.doesNotMatch(captain,/테스트낙찰자|100,000/);assert.match(captain,/<h2>끼리끼리<\/h2>/);assert.match(captain,/<b>10<\/b>/);assert.match(captain,/×2/);
    const three=context.renderVendorContributionPageThree(channel,{mode:'sold'},[{...item,soldPrice:30000}]);assert.match(three,/<b>3<\/b>/);assert.doesNotMatch(three,/30,000|만원/);
    assert.match(source,/'p3-effect':'.dice-overlay-card, .contribution-stage'/);
    assert.doesNotMatch(context.renderVendorContributionPageThree(channel,{mode:'live'},[item]),/src="\/logo.png"/);
});

test('live vendor points follow the highest valid bid and stop at the sold boundary', () => {
    const item={id:'live',status:'live',vendorContributionRate:1,bidLog:[{amount:3},{amount_won:50000},{amount:4},{amount:'invalid'}]};
    assert.equal(liveVendorContribution(item),10);
    assert.equal(liveVendorContribution({...item,vendorContributionRate:0.5}),5);
    assert.equal(liveVendorContribution({...item,bidLog:[]}),0);
    assert.equal(liveVendorContribution({...item,bidLog:[{amount_won:15000}]}),3);
    assert.equal(liveVendorContribution({...item,status:'sold',soldPrice:50000}),0);
    assert.equal(vendorContribution({...item,status:'sold',soldPrice:50000}),10);
    assert.equal(liveVendorContribution({...item,status:'passed'}),0);
    assert.equal(liveVendorContribution(null),0);
});

test('P3 adds live points once and keeps the same total when the item sells', () => {
    const source=fs.readFileSync(require.resolve('../public/auction-live.html'),'utf8');
    const start=source.indexOf('function renderVendorContributionPageThree('),end=source.indexOf('\nfunction ',start+1);
    const context={CreoContributionResult:require('../public/contribution-result'),editorMode:false,CreoAuctionContract:{isSoldStatus:s=>s==='sold'},CreoRankingEngine:{vendorContribution,liveVendorContribution},scoreboardRows:(c,i,b)=>rankingsForChannel({...c,scoreboards:[b]},i)[0].rows,activeItem:(s,i)=>i.find(x=>x.id===s.activeItemId),vendorLogo:()=>'',esc:String};
    vm.createContext(context);vm.runInContext(source.slice(start,end),context);
    const c={id:'c',groups:[{id:'a',name:'A'}],scoreboards:[{dimension:'group',metric:'vendorContribution'}]};
    const items=[{id:'old',groupId:'a',status:'sold',soldPrice:100000,vendorContributionRate:0.5},{id:'live',updatedAt:new Date().toISOString(),groupId:'a',status:'live',bidLog:[{amount:3}],vendorContributionRate:1}];
    const render=(mode,rows)=>context.renderVendorContributionPageThree(c,{mode,activeItemId:'live',page3ResultBackgroundOpacity:0},rows);
    assert.match(render('live',items),/data-contribution-value="16"/);
    assert.match(render('live',structuredClone(items)),/data-contribution-value="16"/);
    assert.match(render('sold',[items[0],{...items[1],status:'sold',soldPrice:30000}]),/data-contribution-value="16"/);
    assert.match(render('standby',items),/data-contribution-value="10"/);
    assert.match(render('sold',[items[0],{...items[1],status:'sold',soldPrice:30000}]),/--result-background-opacity:0/);
});

test('contribution counter animates from the visible value and retains decimal targets', () => {
    const source=fs.readFileSync(require.resolve('../public/auction-live.html'),'utf8');
    const start=source.indexOf('const contributionCounters='),end=source.indexOf('function finishDiceVideo(',start);
    const el={dataset:{contributionKey:'a',contributionValue:'0'},isConnected:true,textContent:''};
    let callback,now=0;
    const context={stage:{querySelectorAll:()=>[el]},performance:{now:()=>now},requestAnimationFrame:fn=>{callback=fn;return 1},cancelAnimationFrame:()=>{}};
    vm.createContext(context);vm.runInContext(source.slice(start,end),context);
    context.hydrateContributionCounters();el.dataset.contributionValue='10';context.hydrateContributionCounters();
    now=425;callback(now);assert.equal(el.textContent,'5');
    el.dataset.contributionValue='11.5';context.hydrateContributionCounters();assert.equal(el.textContent,'5');
    now=1275;callback(now);assert.equal(el.textContent,'11.5');
});
