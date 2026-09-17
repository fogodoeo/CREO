'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const source=fs.readFileSync(require.resolve('../public/auction-live.html'),'utf8');
const context=vm.createContext({esc:value=>String(value).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;')});
vm.runInContext(source.slice(source.indexOf('function bidSortValue('),source.indexOf('function pageTwoProgress(')),context);
const rows=item=>context.pageTwoBidRows(item),render=(item,state={})=>context.pageTwoBidders(item,state);
test('only the highest two distinct bidders are shown, without changing bid history',()=>{
    const item={bidLog:[{name:'민수',bidder_key:'a',amount:10},{name:'지수',bidder_key:'b',amount:15},{name:'민수',bidder_key:'a',amount:20},{name:'서준',bidder_key:'c',amount:18}]};
    const before=JSON.stringify(item);
    assert.deepEqual(Array.from(rows(item),row=>[row.key,row.amount]),[['a',20],['c',18]]);
    const html=render(item);assert.equal((html.match(/class="live-bid-row/g)||[]).length,2);
    assert.ok(!html.includes('지수'));assert.equal(JSON.stringify(item),before);
});
test('empty and single-bidder states retain both slots; new item clears the old names',()=>{
    for(const item of [{},{bidLog:[]},{bidLog:[{name:'민수',amount:12}]}]){
        const html=render(item);assert.equal((html.match(/class="live-bid-row/g)||[]).length,2);
        assert.ok(html.includes('입찰 대기'));assert.ok(html.includes('data-rank="2"'));
    }
    assert.ok(!render({bidLog:[]}).includes('민수'));
    assert.equal(render({bidLog:[{name:'민수',amount:12}]},{page2BiddersOn:false}),'');
});
test('rank changes, equal bids, quiz answers and opacity retain their behavior',()=>{
    const item={bidLog:[{name:'가',amount:10,timestamp:'2026-09-17T10:00:00Z'},{name:'나',amount:10,timestamp:'2026-09-17T10:01:00Z'}]};
    assert.equal(rows(item)[0].name,'나');
    item.bidLog.push({name:'가',amount:11});assert.equal(rows(item)[0].name,'가');
    assert.ok(render({bidLog:[{name:'정답자',amount:1,isQuiz:true}]},{page2BiddersOpacity:0}).includes('정답!'));
    assert.ok(render(item,{page2BiddersOpacity:0}).includes('--bidders-opacity:0'));
});
test('bidder names are escaped in content and titles',()=>{
    const html=render({bidLog:[{name:'<img src=x onerror="alert(1)">',amount:5}]});
    assert.ok(!html.includes('<img'));assert.ok(html.includes('&quot;'));assert.ok(html.includes('5만'));
});
