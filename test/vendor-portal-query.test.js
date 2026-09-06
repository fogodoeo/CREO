'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {createClient}=require('../public/checkout-client');
test('portal event query keeps bearer credential as a separate query parameter',async()=>{
 let requested='';
 const client=createClient({location:{href:'https://example.com/v/abcdefghijk',origin:'https://example.com',pathname:'/v/abcdefghijk',search:''},endpoint:'/api/platform/vendor-checkout',shortPrefix:'v',fetch:async url=>{requested=url;return{ok:true,json:async()=>({})}}});
 await client.request('?event=beta');const url=new URL(requested);
 assert.equal(url.searchParams.get('event'),'beta');assert.equal(url.searchParams.get('code'),'abcdefghijk');
});
