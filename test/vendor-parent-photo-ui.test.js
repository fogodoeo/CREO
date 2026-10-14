'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const source=fs.readFileSync(path.join(__dirname,'../public/vendor-broadcast.js'),'utf8');
function fn(name,next){return source.slice(source.indexOf(' function '+name+'('),source.indexOf(' function '+next+'('));}
const rows=Array.from({length:4},(_,i)=>({id:'item-'+i,displayNumber:'A0'+(i+1),traits:{sex:'male',weight:'12',hatchDate:'2026-05-01'},parents:[],canEdit:i!==2}));
test('assigned auction lots stay together in the spreadsheet view with inline parent uploads',()=>{
 const context={auctionItems:()=>rows,auctionPhotoUndo:new Map(),auctionPhotoPending:null,esc:s=>String(s).replaceAll('<','&lt;').replaceAll('"','&quot;')};
 vm.createContext(context);vm.runInContext(fn('auctionPhotoList','openAuctionList'),context);const html=context.auctionPhotoList();
 assert.equal((html.match(/class="auction-photo-row"/g)||[]).length,4);
 for(const row of rows)assert.ok(html.includes('aria-label="'+row.displayNumber+'"'));
 assert.equal((html.match(/type="file"/g)||[]).length,6,'each editable item has its own sire/dam upload');
 assert.ok(html.includes('data-item="item-0"'));assert.ok(!html.includes('data-item="item-2"'),'sold rows cannot upload or delete');
 assert.ok(!html.includes('data-auction-photo'),'no detour through an individual photo page');
 assert.ok(html.includes('성별')&&html.includes('체중(g)')&&html.includes('출생년월일'));
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
