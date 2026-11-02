'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {SQLitePlatformRepository}=require('../sqlite-platform-repository');
const {createSharedBannerLibrary}=require('../shared-banner-library');

test('archived banners stay absent from imports and selected output after restart, and can be restored',async t=>{
 const directory=fs.mkdtempSync(path.join(os.tmpdir(),'banner-archive-'));
 let repo; t.after(async()=>{await repo?.close();fs.rmSync(directory,{recursive:true,force:true});});
 const options={dbPath:path.join(directory,'db.sqlite'),startWorker:false};
 repo=new SQLitePlatformRepository(options);let library=createSharedBannerLibrary(repo);
 await repo.upsertRecord('alpha','asset',{id:'legacy',kind:'banner',imageUrl:'/old.mp4',name:'old',active:true});
 await library.importExisting([{id:'alpha'}]);
 const old=(await library.list())[0],fresh=await library.save({imageUrl:'/new.mp4',name:'new'});
 const state={selectedBannerIds:[old.id,fresh.id]};
 await library.archive(old.id,true);const first=await repo.getRecord('shared-banners','asset',old.id);
 await library.archive(old.id,true);assert.deepEqual(await repo.getRecord('shared-banners','asset',old.id),first);
 assert.deepEqual((await library.selected(state)).map(r=>r.id),[fresh.id]);
 assert.equal((await library.list(true)).length,2);
 assert.deepEqual((await library.importExisting([{id:'alpha'}]))[0].ids,[]);
 await assert.rejects(library.save({imageUrl:'/old.mp4',name:'retry'}),{status:409});
 await repo.close();repo=new SQLitePlatformRepository(options);library=createSharedBannerLibrary(repo);
 assert.deepEqual((await library.list()).map(r=>r.id),[fresh.id]);
 await library.importExisting([{id:'alpha'}]);assert.equal((await library.list()).length,1);
 await library.archive(old.id,false);assert.equal((await library.selected(state)).length,2);
 await assert.rejects(library.archive('missing',true),{status:404});
});

test('failed archive leaves the visible banner unchanged',async()=>{
 const current={id:'one',kind:'banner',name:'one',imageUrl:'/one.mp4'};
 const library=createSharedBannerLibrary({getRecord:async()=>structuredClone(current),listRecords:async()=>[structuredClone(current)],upsertRecord:async()=>{throw Error('offline');}});
 await assert.rejects(library.archive('one',true),/offline/);
 assert.equal((await library.list()).length,1);assert.equal(current.archived,undefined);
});
