'use strict';
const fs=require('node:fs'),vm=require('node:vm'),test=require('node:test'),assert=require('node:assert/strict');
const source=fs.readFileSync(require.resolve('../public/vendor-checkout.html'),'utf8');
const start=source.indexOf('function renderSettings(){'),end=source.indexOf('if(settingsDirty)return;',start)+'if(settingsDirty)return;'.length;
const render=source.slice(start,end)+'}';
test('checkout initializes navigation after its DOM and before fetching its first data',()=>{
 const script=source.match(/<script\b[^>]*src="\/vendor-navigation\.js[^>]*><\/script>/g);
 assert.equal(script?.length,1);assert.doesNotMatch(script[0],/\b(?:defer|async)\b/);
 const position=source.indexOf(script[0]);
 assert.ok(position>source.indexOf('id="vendor-event"'));
 assert.ok(position<source.indexOf("const Checkout=window.CreoCheckoutClient"));
});
test('checkout forwards national booking mode even while settings contain unsaved edits',()=>{
 const summary={enabled:true,mode:'regional-cycle-v1',pendingCount:1},statuses=[];
 vm.runInNewContext(render+';renderSettings();',{settingsDirty:true,data:{vendor:{phone:'01000000001'},entrySummary:{entriesOpen:true,entryCount:0},bookingSummary:summary},window:{CreoVendorNavigation:{profileRequired:()=>false,updateStatus:s=>statuses.push(s)}}});
 assert.equal(statuses.length,1);assert.equal(statuses[0].bookingSummary,summary);
});
test('general checkout forwards disabled booking mode so national navigation can be removed',()=>{
 const summary={enabled:false},statuses=[];
 vm.runInNewContext(render+';renderSettings();',{settingsDirty:true,data:{vendor:{},entrySummary:{entriesOpen:true,entryCount:2},bookingSummary:summary},window:{CreoVendorNavigation:{profileRequired:()=>true,updateStatus:s=>statuses.push(s)}}});
 assert.equal(statuses[0].bookingSummary.enabled,false);assert.equal(statuses[0].entriesRequired,false);
});
