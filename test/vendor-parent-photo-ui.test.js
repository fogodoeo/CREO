'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const source=fs.readFileSync(path.join(__dirname,'../public/vendor-broadcast.js'),'utf8');
function fn(name,next){return source.slice(source.indexOf(' function '+name+'('),source.indexOf(' function '+next+'('));}
const rows=Array.from({length:4},(_,i)=>({id:'item-'+i,displayNumber:'A0'+(i+1),traits:{sex:'male',weight:'12',hatchDate:'2026-05-01'},parents:[],canEdit:i!==2}));
test('assigned auction lots stay together in the spreadsheet view with inline parent uploads',()=>{
 const context={auctionItems:()=>rows,auctionPhotoUndo:new Map(),auctionNameDrafts:new Map(),auctionPhotoPending:null,esc:s=>String(s).replaceAll('<','&lt;').replaceAll('"','&quot;')};
 vm.createContext(context);vm.runInContext(fn('auctionPhotoList','openAuctionList'),context);const html=context.auctionPhotoList();
 assert.equal((html.match(/class="auction-photo-row"/g)||[]).length,4);
 for(const row of rows)assert.ok(html.includes('aria-label="'+row.displayNumber+'"'));
 assert.equal((html.match(/type="file"/g)||[]).length,6,'each editable item has its own sire/dam upload');
 assert.equal((html.match(/data-auction-name=/g)||[]).length,6,'each editable parent can be named without uploading a photo');
 assert.ok(html.includes('data-item="item-0"'));assert.ok(!html.includes('data-item="item-2"'),'sold rows cannot upload or delete');
 assert.ok(!html.includes('data-auction-photo'),'no detour through an individual photo page');
 assert.ok(html.includes('성별')&&html.includes('체중(g)')&&html.includes('출생년월일'));
});

test('editing a parent name preserves the input across redraw and marks only changed values',()=>{
 const row={...rows[0],updatedAt:'v1',parents:[{role:'sire',name:'헐크',media:[]}]},save={hidden:true},context={auctionItems:()=>[row],auctionNameDrafts:new Map(),$:()=>save};
 vm.createContext(context);vm.runInContext(fn('captureAuctionName','auctionPhotoError'),context);
 const input={dataset:{item:row.id,auctionName:'sire'},value:'헐크 수정'};context.captureAuctionName(input);assert.equal(save.hidden,false);assert.equal(context.auctionNameDrafts.get(row.id+'sire').expectedUpdatedAt,'v1');
 row.updatedAt='v2';input.value='헐크 재수정';context.captureAuctionName(input);assert.equal(context.auctionNameDrafts.get(row.id+'sire').expectedUpdatedAt,'v1','do not silently overwrite a newer server revision');
 input.value='헐크';context.captureAuctionName(input);assert.equal(save.hidden,true);assert.equal(context.auctionNameDrafts.size,0);
});

test('unlimited registration remains editable and needs attention after the former deadline',()=>{
 const {broadcastNeedsAction}=require('../public/vendor-task-state');
 const now='2026-10-18T12:00:00.000Z',date={startsAt:'2026-10-19T11:00:00.000Z'},reservation={session:{entriesDueAt:null},completed:0,entryLimit:4};
 assert.equal(broadcastNeedsAction(date,reservation,now),true);
 assert.equal(broadcastNeedsAction(date,reservation,now,false),false);
 const start=source.indexOf('const registrationOpen='),end=source.indexOf('\n',start),context={state:{now},r:reservation};vm.createContext(context);vm.runInContext(source.slice(start,end)+'\nresult=registrationOpen(r)',context);assert.equal(context.result,true);
 reservation.session.entriesDueAt='2026-10-18T11:00:00.000Z';vm.runInContext('result=registrationOpen(r)',context);assert.equal(context.result,false);
});
test('photo redraw replaces only the assigned-item table and preserves the bulk registration form',()=>{
 const table={outerHTML:''},active={id:'item-0'},context={$:selector=>{assert.equal(selector,'#auction-photo-table');return table},auctionPhotoList:()=>'<table>updated</table>',auctionPhotoItem:active,auctionItems:()=>rows};
 vm.createContext(context);vm.runInContext(fn('refreshAuctionPhotos','auctionPhotoError').split(' async function saveAuctionPhoto(')[0],context);context.refreshAuctionPhotos();
 assert.equal(table.outerHTML,'<table>updated</table>');assert.equal(context.auctionPhotoItem,rows[0]);
});
test('new and partially approved reservations still open the existing bulk editor',()=>{
 for(const assigned of [[],rows.slice(0,1)]){
  let opened='';const context={selected:'',state:{dates:[{date:'2026-10-14'}]},reservation:()=>({}),entryLimit:()=>4,auctionItems:()=>assigned,auctionPhotoItem:null,openBulk:()=>{opened='bulk'},openAuctionList:()=>{opened='assigned'}};
  vm.createContext(context);vm.runInContext(fn('openDate','bulkEditable'),context);context.openDate('2026-10-14');assert.equal(opened,'bulk');
 }
});
