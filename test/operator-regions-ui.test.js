'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const {parseHTML}=require('linkedom');
test('region directory sorts names, preserves Seoul index zero and separates inactive vendors',()=>{
 const {document}=parseHTML('<html><body><select id="region-vendor"></select><div id="region-directory"></div></body></html>');
 const source=fs.readFileSync(require.resolve('../public/organizer-bookings.js'),'utf8');
 const fn=source.slice(source.indexOf('  function renderRegionDirectory('),source.indexOf('  function reservationForm('));
 const context={document,$:id=>document.getElementById(id),esc:s=>String(s).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('"','&quot;'),state:{regions:['서울·인천','경기'],vendors:[{id:'b',name:'하이',region:0},{id:'a',name:'가나',region:0},{id:'c',name:'경기',region:1},{id:'d',name:'미등록',region:null},{id:'e',name:'사용중지',region:0,active:false}]}};
 // linkedom's select value is read-only; the browser exposes a writable setter.
 Object.defineProperty(document.getElementById('region-vendor'),'value',{writable:true,value:''});
 vm.runInNewContext(fn+';renderRegionDirectory("a");',context);
 const groups=[...document.querySelectorAll('optgroup')];
 assert.equal(groups[0].getAttribute('label'),'지역 미등록 · 1곳');
 assert.deepEqual([...groups[1].querySelectorAll('option')].map(o=>o.textContent),['가나','하이']);
 assert.equal(groups.at(-1).getAttribute('label'),'사용 중지 · 1곳');
 assert.equal(document.querySelector('#region-vendor').value,'a');
 assert.match(document.querySelector('#region-directory').textContent,/활동 업체 4곳/);
 assert.equal(document.querySelectorAll('[data-region-vendor]').length,4);
 assert.equal(document.querySelector('[data-region-vendor="e"]'),null);
});
