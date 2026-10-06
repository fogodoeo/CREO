'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const source=fs.readFileSync(require.resolve('../public/vendor-portal-shell.js'),'utf8');
const start=source.indexOf(' function currentSection()'),end=source.indexOf('\n',start);
test('company switching keeps the current page even while navigation is loading or behind a modal',()=>{
 for(const [pathname,profileEntry,section]of [['/vendor-access.html','doremi','profile'],['/vendor-checkout.html',false,'settlement'],['/vendor-broadcast.html',false,'booking']]){
  const actual=vm.runInNewContext(source.slice(start,end)+';currentSection()',{profileEntry,location:{pathname}});assert.equal(actual,section);
 }
});
