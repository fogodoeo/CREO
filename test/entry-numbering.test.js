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
test('reopening preserves legacy team codes while new entries default to the first part',()=>{
 const existing={code:'A04',order:7};
 assert.deepEqual(initial({existing,preferred:'B'}),{mode:'A',code:'A04',order:7});
 assert.deepEqual(initial({existing,teamBased:true}),{mode:'manual',code:'A04',order:7});
 assert.deepEqual(initial({teamBased:true}),{mode:'1부',code:'1부 A01',order:1});
 assert.deepEqual(initial({lot:'SPECIAL-1'}),{mode:'manual',code:'SPECIAL-1',order:1});
 assert.deepEqual(initial(),{mode:'1부',code:'1부 A01',order:1});
});
test('part labels keep Korean context and reject mismatched part letters',()=>{
 const n=require('../public/entry-numbering');
 assert.equal(n.nextCode('1부',[{code:'1부 A01'},{code:'2부 B02'}]),'1부 A02');
 assert.equal(n.nextCode('2부',[]),'2부 B01');assert.equal(n.nextCode('이벤',[]),'이벤 E01');
 for(const code of ['1부 A01','2부 B15','이벤 E100', 'A01'])assert.equal(n.valid(code),true);
 for(const code of ['1부 B01','2부 A01','이벤 01','<img>'])assert.equal(n.valid(code),false);
 assert.equal(n.partOf('2부 B15'),'2부');assert.equal(n.partOf('B15'),'');
 assert.deepEqual(initial({existing:{code:'이벤 E01',order:7},teamBased:true}),{mode:'이벤',code:'이벤 E01',order:7});
});
