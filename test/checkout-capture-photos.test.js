'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {withCapturePhotos,withCollectionCapturePhotos}=require('../checkout-capture-photos');
const {checkoutItem}=require('../checkout-item-data');
const {captureIdFor}=require('../capture-api');
const photo={channelId:'alpha',itemId:'one',status:'complete',confirmed:true,shareToken:'sample-share-token-12345',confirmationId:'sample-confirmation-12345'};
const item={id:'one',lotNumber:1,soldPrice:30000,media:[{url:'/registered.jpg'}],parents:[{role:'sire',media:[{url:'/father.jpg'}]}]};
test('confirmed capture augments the exact item without mutating original media or checkout amount',async()=>{
 const reads=[],repo={getRecord:async(...args)=>{reads.push(args);return photo;}};
 const before=JSON.stringify(item),[result]=await withCapturePhotos(repo,'alpha',[item]);
 assert.deepEqual(reads,[['alpha','capture',captureIdFor('alpha','one')]]);
 const projected=checkoutItem(result);assert.equal(projected.media[0].label,'경매 현장 사진');
 assert.match(projected.media[0].url,/confirmation=sample-confirmation/);assert.equal(projected.media[1].url,'/registered.jpg');
 assert.equal(projected.parents[0].media[0].url,'/father.jpg');assert.equal(projected.soldAmount,30000);assert.equal(JSON.stringify(item),before);
 const [again]=await withCapturePhotos(repo,'alpha',[result]);assert.deepEqual(again,result);
});
test('foreign item/channel, incomplete, unconfirmed and invalid tokens never attach photos',async()=>{
 for(const override of [{channelId:'beta'},{itemId:'two'},{status:'pending'},{confirmed:false},{shareToken:'../private'},{confirmationId:''}]){
  const [result]=await withCapturePhotos({getRecord:async()=>({...photo,...override})},'alpha',[item]);assert.equal(result,item);
 }
 const [result]=await withCapturePhotos({getRecord:async()=>{throw Error('offline')}},'alpha',[item]);assert.equal(result,item);
});
test('retake changes the image cache key; archived or resold collection snapshots never adopt current photos',async()=>{
 const repo={getRecord:async()=>photo},records=['current','archived','changed'].map(recordState=>({recordState}));
 const displayed=await withCollectionCapturePhotos(repo,'alpha',records,[item,item,item]);
 assert.notEqual(displayed[0],item);assert.equal(displayed[1],item);assert.equal(displayed[2],item);
 const [replacement]=await withCapturePhotos({getRecord:async()=>({...photo,confirmationId:'replacement-confirmation-12345'})},'alpha',[displayed[0]]);
 assert.equal(replacement.media.length,2);assert.match(replacement.media[0].url,/replacement-confirmation/);
});
