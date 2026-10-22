'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),Core=require('../public/parge-dispatch-core');
const rates={data:{수도권:[{shop:'가상 정거샵',cost:19000}],경상:[{shop:'경상 거점',cost:14000}]}};
const group=(quantity,extra={})=>({shop:'가상 정거샵',region:'수도권',quantity,...extra});
test('partner discount applies only to the first base fee, additional animals stay 7000 each',()=>{
 for(const [quantity,amount]of [[1,9500],[2,16500],[5,37500]]){const q=Core.partnerQuote([group(quantity)],rates);assert.equal(q.amount,amount);assert.equal(q.discountAmount,9500);assert.equal(q.additionalAmount,(quantity-1)*7000);}
 const mixed=Core.partnerQuote([group(2),group(1,{shop:'경상 거점',region:'경상'})],rates);assert.equal(mixed.amount,23500);assert.equal(mixed.rows.length,2);
});
test('missing, invalid or ambiguous rates never silently become a zero total',()=>{
 const q=Core.partnerQuote([group(1),group(1,{shop:'없는 매장'})],rates);assert.equal(q.amount,null);assert.equal(q.unknownCount,1);assert.equal(q.knownAmount,9500);
 for(const cost of [null,undefined,'',-1,'x',Infinity])assert.equal(Core.partnerQuote([group(1)],{data:{수도권:[{shop:'가상 정거샵',cost}]}}).amount,null);
 assert.equal(Core.partnerQuote([group(1,{region:''})],{data:{...rates.data,중복:[{shop:'가상 정거샵',cost:20000}]}}).amount,null);
 assert.equal(Core.partnerQuote([group(0)],rates).amount,null);assert.equal(Core.partnerQuote([],rates).amount,0);
});
test('normalized rate catalogs are supported without changing dispatch inputs or buyer shipping totals',()=>{
 const rows=[group(3)],before=structuredClone(rows);const q=Core.partnerQuote(rows,[{region:'수도권',shops:[{name:'가상 정거샵',baseCost:19000}]}]);assert.equal(q.amount,23500);assert.deepEqual(rows,before);assert.deepEqual(Core.shopNames(rates)[0],{name:'가상 정거샵',region:'수도권'});
});
