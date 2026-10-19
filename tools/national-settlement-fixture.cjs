'use strict';
const {createFixture}=require('./vendor-portal-preview.cjs');
const {normalizeChannel}=require('../platform-core');
const day='2026-10-14';
const channel=()=>normalizeChannel({id:'national-cre',name:'전국크레자랑',status:'active',dataAdapter:'platform',broadcastTheme:'national-stage',vendorSettlement:{enabled:true,entryFee:10000,ratePercent:10},shippingSupport:{enabled:true,broadcastDate:day,maxAmount:30000},shippingDefaults:{enabledCarriers:['parge'],pickupLocations:['현장 수령'],pargeAdditionalFee:7000}});
const item=(id,vendorId='v1',extra={})=>({id,name:id.toUpperCase(),lotNumber:Number(id.replace(/\D/g,''))||1,vendorId,status:'sold',soldPrice:100000,winnerName:'가상 낙찰자',winnerPhone:'01000000003',attributes:{broadcastDate:day,organizerFeePolicy:{enabled:true,entryFee:10000,ratePercent:10}},...extra});
async function fixture(options){
 const f=await createFixture(options),c=f.client();
 f.request=(method,path,body,admin=true)=>f.call(c,method,'/api/platform'+path,body,admin?{'x-creo-admin':f.secret}:{});
 await f.repository.saveCatalog([channel(),normalizeChannel({id:'creyon',name:'크레용',status:'active'})]);
 await f.repository.setActiveChannel('national-cre');
 for(const id of ['v1','v2'])await f.repository.upsertRecord('national-cre','vendor',{id,name:id==='v1'?'가상 업체 A':'가상 업체 B',phone:'01000000001',bankName:'테스트은행',bankAccount:'000-000',bankHolder:'가상 업체',paymentMethods:['bank_transfer']});
 await f.repository.upsertRows([{key:'shipping_rate_parge',value:JSON.stringify({data:{수도권:[{shop:'가상 정거샵',cost:19000}]}})}]);
 for(const row of [item('a01'),item('a02'),item('b03','v2')])await f.repository.upsertRecord('national-cre','item',row);
 const link=await f.request('POST','/channels/national-cre/buyer-shipping-link',{itemId:'a01'});if(link.status!==200)throw Error(link.body);f.code=link.json().code;
 f.saveBody={code:f.code,requestId:'quote-initial-0001',destinationId:'parge',pargeRegion:'수도권',pargeShop:'가상 정거샵',payments:[{vendorKey:'v1',method:'bank_transfer'},{vendorKey:'v2',method:'bank_transfer'}]};
 f.read=()=>f.request('GET','/buyer-shipping?code='+f.code,null,false);
 return f;
}
module.exports={fixture,channel,item,day};
