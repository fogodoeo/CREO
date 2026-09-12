'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { checkoutItem } = require('../checkout-item-data');
test('legacy A/B names display once while numeric lot order stays unchanged',()=>{
 const {itemTitle}=require('../public/checkout-item-view');
 for(const name of ['A01','B15']){const raw={name,lotNumber:4},item=checkoutItem(raw);assert.equal(itemTitle(item),name);assert.equal(item.lotNumber,4);assert.deepEqual(raw,{name,lotNumber:4});}
 assert.equal(checkoutItem({name:'릴리화이트',lotNumber:2}).displayNumber,'2');
 assert.equal(checkoutItem({name:'A01',lotNumber:4,attributes:{displayNumber:'B02'}}).displayNumber,'B02','an explicit operator number remains authoritative');
});
test('entry traits and parents without photos are retained without exposing internal attributes',()=>{
 const item=checkoutItem({name:'A01',category:'릴리화이트',attributes:{displayNumber:'A01',checklist:'gender:F|weight:28|quiz_answer_b64:secret',parents:[{role:'sire',name:'등록한 부모',morph:'화이트월',media:[]}],vendor_entry:{ownerId:'private'}}});
 assert.equal(item.traits.morph,'릴리화이트');assert.equal(item.traits.sex,'female');assert.equal(item.traits.weight,'28');
 assert.equal(item.parents[0].name,'등록한 부모');assert.deepEqual(item.parents[0].media,[]);
 assert.doesNotMatch(JSON.stringify(item),/secret|private|quiz_answer/);
});

test('checkout photo projection retains only item identification and permitted media', () => {
    const item = checkoutItem({id:'one',lotNumber:1,name:'A01',soldPrice:30000,winnerPhone:'01099998888',note:'operator secret',attributes:{bid_log:'secret',photo_sire:'https://api.feedle.me/sire.webp'},photoUrl:'https://demo.supabase.co/storage/v1/object/public/auction-photos/item.webp'});
    assert.equal(item.media[0].url,'https://demo.supabase.co/storage/v1/object/public/auction-photos/item.webp');
    assert.equal(item.parents[0].role,'sire');
    assert.equal(item.parents[0].media[0].url,'https://api.feedle.me/sire.webp');
    assert.doesNotMatch(JSON.stringify(item),/01099998888|secret|bid_log|attributes|winnerPhone/);
});

test('missing or unsafe photos stay absent and do not throw for malformed parent entries', () => {
    for (const photoUrl of ['', 'data:image/png;base64,AAAA', 'javascript:alert(1)', 'https://unknown.example/p.webp', '/'+ 'x'.repeat(2100)]) {
        const item = checkoutItem({id:'one',photoUrl,parents:[null,false,{}, {role:'sire',media:['javascript:bad']}]});
        assert.equal(item.media,undefined);assert.equal(item.parents,undefined);
    }
});

test('stored media and current parent snapshots keep display codes and small thumbnails', () => {
    const item = checkoutItem({id:'one',lotNumber:4,attributes:{displayNumber:'A01',media:[{url:'/assets/item.webp',thumbnailUrl:'/assets/item-thumb.webp'}],parents:[{role:'dam',name:'모 이름',morph:'릴리화이트',phone:'private',media:[{url:'/assets/dam.webp'}]}]}});
    assert.equal(item.lotNumber,4);assert.equal(item.displayNumber,'A01');
    assert.equal(item.media[0].thumbnailUrl,'/assets/item-thumb.webp');
    assert.equal(item.parents[0].name,'모 이름');assert.equal(item.parents[0].phone,undefined);
    assert.equal(checkoutItem({lotNumber:'B15'}).displayNumber,'B15');
});
