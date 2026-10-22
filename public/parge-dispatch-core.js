(function(root,factory){const api=factory(typeof module==='object'&&module.exports?require('./mobile-phone'):root.CreoMobilePhone);if(typeof module==='object'&&module.exports)module.exports=api;else root.CreoPargeDispatch=api;})(typeof globalThis!=='undefined'?globalThis:this,function(Phone){
 'use strict';
 const text=v=>String(v??'').trim(), norm=v=>text(v).normalize('NFKC').replace(/\s+/g,'');
 function shopNames(payload){if(Array.isArray(payload))return payload.flatMap(g=>(g.shops||[]).map(r=>({name:text(r.name||r.shop),region:text(g.region)}))).filter(r=>r.name);return Object.entries(payload?.data||{}).flatMap(([region,rows])=>(Array.isArray(rows)?rows:[]).map(r=>({name:text(r.shop||r.name),region}))).filter(r=>r.name);}
 function partnerQuote(groups,payload){
  const rateRows=Array.isArray(payload)?payload.flatMap(g=>(g.shops||[]).map(r=>({name:r.name||r.shop,region:g.region,cost:r.baseCost??r.cost}))):Object.entries(payload?.data||{}).flatMap(([region,rows])=>(Array.isArray(rows)?rows:[]).map(r=>({name:r.shop||r.name,region,cost:r.cost??r.baseCost})));
  const rows=groups.map(g=>{
   const matches=rateRows.filter(r=>norm(r.name)===norm(g.shop)&&(!text(g.region)||norm(r.region)===norm(g.region)));
   const raw=matches[0]?.cost,baseCost=Number(raw),quantity=Number(g.quantity);
   if(matches.length!==1||raw===null||raw===undefined||text(raw)===''||!Number.isSafeInteger(baseCost)||baseCost<0||!Number.isSafeInteger(quantity)||quantity<1)return{known:false,shop:g.shop,quantity,amount:null};
   const discountedBase=Math.round(baseCost*.5),additionalCount=quantity-1,additionalAmount=additionalCount*7000;
   return{known:true,shop:g.shop,quantity,baseCost,discountAmount:baseCost-discountedBase,discountedBase,additionalCount,additionalAmount,amount:discountedBase+additionalAmount};
  });
  const known=rows.filter(r=>r.known),unknownCount=rows.length-known.length,knownAmount=known.reduce((sum,r)=>sum+r.amount,0);
  return{rows,unknownCount,knownAmount,amount:unknownCount?null:knownAmount,baseAmount:known.reduce((sum,r)=>sum+r.baseCost,0),discountAmount:known.reduce((sum,r)=>sum+r.discountAmount,0),additionalAmount:known.reduce((sum,r)=>sum+r.additionalAmount,0)};
 }
 function destination(s,shops){
  if(s.pargeShop)return text(s.pargeShop);
  const a=norm(s.address),matches=shops.filter(r=>[r.name,r.region+' ('+r.name+')',r.region+' · '+r.name].some(v=>norm(v)===a));
  return matches.length===1?matches[0].name:'';
 }
 function build(workspace,{channelId,shops=[],date=''}={}){
  if(!channelId)throw Error('채널을 선택해 주세요.');
  const groups=new Map(),excluded=[],counts=new Map();
  for(const item of workspace.items||[])if(!item.channelId||item.channelId===channelId)counts.set(item.id,(counts.get(item.id)||0)+1);
  const shipments=new Map();for(const s of workspace.shipments||[]){if(s.channelId&&s.channelId!==channelId)continue;const rows=shipments.get(s.itemId)||[];rows.push(s);shipments.set(s.itemId,rows);}
  for(const item of workspace.items||[]){
   if(item.channelId&&item.channelId!==channelId)continue;
   if(date&&text(item.attributes?.broadcastDate||item.broadcastDate)!==date)continue;
   if(!['sold','낙찰'].includes(item.status))continue;
   const skip=reason=>excluded.push({itemId:item.id,lot:text(item.name),reason});
   if(!text(item.id)||counts.get(item.id)!==1){skip('중복 또는 누락된 개체 식별자');continue;}
   const candidates=shipments.get(item.id)||[];
   if(candidates.length!==1){skip(candidates.length?'배송 기록 중복 — 확인 필요':'배송지 미입력');continue;}
   const s=candidates[0],carrier=text(s.destinationType||s.destinationId||s.carrier).toLowerCase();
   if(s.method==='pickup'||!['parge','파르게'].includes(carrier)){skip('파르게 대상 아님');continue;}
   if(s.shippedAt||s.deliveredAt||['shipped','delivered','cancelled'].includes(s.status)){skip('발송·취소 처리됨');continue;}
   if(item.buyerSaleId&&s.buyerSaleId&&item.buyerSaleId!==s.buyerSaleId){skip('재경매 전 배송 기록');continue;}
   const phone=Phone.normalizeMobilePhone(s.recipientPhone||item.winnerPhone),buyerPhone=Phone.normalizeMobilePhone(item.winnerPhone)||phone;
   const name=Phone.buyerDisplayName(s.recipientName||item.winnerName||item.winnerAlias),shop=destination(s,shops);
   if(!phone||!name||!shop){skip(!phone?'연락처 확인 필요':!name?'받는 분 확인 필요':'도착 매장 확인 필요');continue;}
   const price=Number(item.soldPrice);
   if(item.soldPrice==null||text(item.soldPrice)===''||!Number.isSafeInteger(price)||price<0){skip('낙찰금액 확인 필요');continue;}
   const key=JSON.stringify([channelId,buyerPhone,phone,norm(name),norm(shop)]);
   if(!groups.has(key))groups.set(key,{key,name,phone,shop,region:text(s.pargeRegion),quantity:0,price:0,items:[],paid:true});
   const g=groups.get(key);g.quantity++;g.price+=price;g.items.push({id:item.id,shipmentId:s.id,lot:text(item.name),price});g.paid=g.paid&&s.paymentStatus==='paid';
  }
  const rows=[...groups.values()];for(const g of rows)g.items.sort((a,b)=>a.lot.localeCompare(b.lot,'en',{numeric:true}));
  rows.sort((a,b)=>a.items[0].lot.localeCompare(b.items[0].lot,'en',{numeric:true}));
  return {groups:rows,excluded};
 }
 function validate(plan,now=new Date()){
  if(plan?.schema!=='creo.parge.dispatch.v1'||plan.origin!=='크레오 대구본점'||plan.senderName!=='크레오 대구본점'||plan.senderPhone!=='01050029163')throw Error('CREO 파르게 입력 파일인지 확인해 주세요.');
  if(!/^[a-zA-Z0-9_-]+$/.test(plan.channelId||''))throw Error('채널 정보가 없어요. 다시 내보내 주세요.');
  const today=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Seoul',year:'numeric',month:'2-digit',day:'2-digit'}).format(now);
  if(!/^\d{4}-\d{2}-\d{2}$/.test(plan.date||'')||!Number.isFinite(Date.parse(plan.date+'T00:00:00Z'))||new Date(plan.date+'T00:00:00Z').toISOString().slice(0,10)!==plan.date||plan.date<today)throw Error('맡김일을 오늘 이후로 선택해 주세요.');
  if(!Array.isArray(plan.groups)||!plan.groups.length||plan.groups.length>100)throw Error('배송 건은 1~100건까지 선택해 주세요.');
  const ids=new Set(),keys=new Set();
  for(const g of plan.groups){
   if(!text(g.name)||g.name.length>80||!/^010\d{8}$/.test(g.phone||'')||!text(g.shop)||g.shop.length>180)throw Error('받는 분·연락처·도착 매장을 확인해 주세요.');
   if(!Number.isInteger(g.quantity)||g.quantity<1||g.quantity>99||!Number.isSafeInteger(g.price)||g.price<0||g.price>1000000000)throw Error('마릿수 또는 분양가를 확인해 주세요.');
   if(g.memo!=='전크자'||g.species!=='크레스티드게코'||!Array.isArray(g.items)||g.items.length!==g.quantity)throw Error('개체 정보가 맞지 않아요. 관리페이지에서 다시 내보내 주세요.');
   const key=JSON.stringify([g.phone,norm(g.name),norm(g.shop)]);if(keys.has(key))throw Error('같은 수령인의 배송 건이 중복돼요.');keys.add(key);
   let total=0;for(const item of g.items){if(!text(item.id)||ids.has(item.id))throw Error('중복 개체가 포함됐어요.');ids.add(item.id);if(!Number.isSafeInteger(item.price)||item.price<0)throw Error('개체 낙찰금액이 올바르지 않아요.');total+=item.price;}
   if(total!==g.price)throw Error('분양가는 묶인 개체의 낙찰금 합계여야 해요.');
  }
  return plan;
 }
 function manifest(groups,options){return validate({schema:'creo.parge.dispatch.v1',channelId:options.channelId,date:options.date,origin:'크레오 대구본점',senderName:'크레오 대구본점',senderPhone:'01050029163',createdAt:new Date().toISOString(),groups:groups.map(g=>({name:g.name,phone:g.phone,shop:g.shop,region:g.region,quantity:g.quantity,price:g.price,species:'크레스티드게코',memo:'전크자',items:g.items}))});}
 return {build,manifest,validate,shopNames,partnerQuote};
});
