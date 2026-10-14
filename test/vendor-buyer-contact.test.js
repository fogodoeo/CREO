'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { registeredVendorBuyerPhone } = require('../vendor-buyer-contact');
const item = { channelId:'alpha', winnerName:'가상 상점' };
const vendor = { id:'buyer-shop', channelId:'alpha', name:'가상 상점', phone:'010-0000-0002', inquiryPhone:'01000000003', active:true };

test('a unique exact business name supplies its business notification number', () => {
    assert.equal(registeredVendorBuyerPhone(item,[vendor]),'01000000002');
    assert.equal(registeredVendorBuyerPhone({...item,winnerName:' 가상  상점 '},[vendor]),'01000000002');
    assert.equal(registeredVendorBuyerPhone({...item,winnerName:'',winnerAlias:vendor.name},[vendor]),'01000000002');
});
test('ambiguous, missing, inactive, deleted, partial and other-channel matches stay unresolved', () => {
    for (const vendors of [[],[vendor,{...vendor,id:'duplicate'}],[vendor,{...vendor,id:'missing-phone',phone:''}],
        [{...vendor,active:false}],[{...vendor,deletedAt:'2026-01-01'}],[{...vendor,phone:''}],
        [{...vendor,phone:'1234'}],[{...vendor,name:'가상 상점 서울점'}],[{...vendor,channelId:'beta'}]]) {
        assert.equal(registeredVendorBuyerPhone(item,vendors),'');
    }
    assert.equal(registeredVendorBuyerPhone({...item,winnerName:'상점'},[vendor]),'');
    assert.equal(registeredVendorBuyerPhone({...item,winnerName:''},[vendor]),'');
});
