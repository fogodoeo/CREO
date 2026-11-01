'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {parseHTML}=require('linkedom');
const {syncRemoteResult}=require('../roulette-app/src/remoteResult');
test('generic remote result restores without running a second draw, survives repetition, and clears for the next draw',()=>{
 const {document}=parseHTML('<html><body></body></html>');
 const complete={phase:'complete',config:{eventTitle:'가상 추첨'},result:{winner:'가상 A',winners:['가상 A','<b>가상 B</b>']}};
 syncRemoteResult(document,complete,true);
 const panel=document.getElementById('restoredDrawResult');
 assert.equal(panel.hidden,false);assert.equal(panel.children[2].textContent,'가상 A\n<b>가상 B</b>');assert.equal(panel.querySelector('b'),null);
 syncRemoteResult(document,complete,true);assert.equal(document.querySelectorAll('#restoredDrawResult').length,1);
 for(const phase of ['idle','prepared','running']){syncRemoteResult(document,{phase},true);assert.equal(panel.hidden,true);}
 syncRemoteResult(document,complete,true);assert.equal(panel.hidden,false);
 syncRemoteResult(document,complete,false);assert.equal(panel.hidden,true,'national display keeps its own stage');
});
