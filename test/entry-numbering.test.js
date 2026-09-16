'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {nextCode,initial}=require('../public/entry-numbering');
test('parts suggest unused numbers independently, including lowercase and more than 99 entries',()=>{
 const allocation=[{code:'a01',order:1},{code:'A03',order:2},{code:'B01',order:3}];
 assert.equal(nextCode('A',allocation),'A02');assert.equal(nextCode('B',allocation),'B02');
 assert.equal(nextCode('manual',allocation),'');
 assert.equal(nextCode('A',Array.from({length:99},(_,i)=>({code:'A'+String(i+1).padStart(2,'0')}))),'A100');
 assert.deepEqual(initial({allocation,preferred:'B'}),{mode:'B',code:'B02',order:4});
 assert.deepEqual(allocation,[{code:'a01',order:1},{code:'A03',order:2},{code:'B01',order:3}]);
});
test('reopening approved entries preserves code and global order; team auctions never infer parts',()=>{
 const existing={code:'A04',order:7};
 assert.deepEqual(initial({existing,preferred:'B'}),{mode:'A',code:'A04',order:7});
 assert.deepEqual(initial({existing,teamBased:true}),{mode:'manual',code:'A04',order:7});
 assert.deepEqual(initial({teamBased:true}),{mode:'manual',code:'',order:1});
 assert.deepEqual(initial({lot:'SPECIAL-1'}),{mode:'manual',code:'SPECIAL-1',order:1});
 assert.deepEqual(initial(),{mode:'A',code:'A01',order:1});
});
