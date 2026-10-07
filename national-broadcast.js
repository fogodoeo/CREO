'use strict';
const crypto=require('node:crypto');
const {channelKey}=require('./platform-core');
const Legacy=require('./broadcast-booking');
const Inbound=require('./public/broadcast-inbound-core'),inboundData=require('./public/broadcast-inbound-data.json');
const Origin=require('./public/broadcast-origin-core');
const Tasks=require('./public/vendor-task-state');
const REGIONS=['서울·인천','경기','전라·충청','대구·경북','부산·울산·경남'];
const START='2026-10-14',MODE='regional-cycle-v1',KEY=channelKey('national-cre','setting','national-broadcasts');
const fail=(message,status=409)=>Object.assign(Error(message),{status});
const uuid=()=>crypto.randomUUID();
const validCapacity=value=>value===null||(Number.isSafeInteger(value)&&value>=4);
const reservedQuantity=(state,date)=>state.reservations.filter(r=>r.date===date&&r.status==='confirmed').reduce((sum,r)=>sum+r.quantity,0);
function entryProgress(r,entries,entryLimit=r.entryIds.length){
 const slots=r.entryIds.map(id=>entries.find(e=>e.id===id)||null),completed=slots.filter(e=>e&&['submitted','approved'].includes(e.status)).length;
 const excessSubmitted=slots.slice(entryLimit).filter(e=>e&&['submitted','approved'].includes(e.status)).length;
 return {entries:slots,completed,entryLimit,excessSubmitted,registrationComplete:Tasks.broadcastRegistrationComplete({entries:slots.slice(0,entryLimit),completed,entryLimit,excessSubmitted})};
}
function regionIndex(name){return ['서울','인천','서울+인천'].includes(name)?0:REGIONS.indexOf(name);}
function regionForVendor(v){const region=regionIndex(v?.broadcastRegion);if(region>=0)return region;return [0,0,1,1,2,2,3,4][v?.bookingRegion]??null;}
function regionEntryPolicy(state,region,vendors){
 const ids=new Set(vendors.filter(v=>v.id&&v.active!==false&&!v.deletedAt&&(state.regions?.[v.id]??regionForVendor(v))===region).map(v=>v.id));
 return {regionVendorCount:ids.size,vendorEntryLimit:ids.size>=9?4:5};
}
function scheduled(date){return /^\d{4}-\d{2}-\d{2}$/.test(date||'')&&Number.isFinite(Legacy.start(date))&&Legacy.day(Legacy.start(date))===date&&date>=START&&[1,3].includes(new Date(date+'T00:00:00Z').getUTCDay());}
function regionAt(date){
 if(!scheduled(date))return null;
 const days=Math.round((Date.parse(date+'T00:00:00Z')-Date.parse(START+'T00:00:00Z'))/86400000);
 return (Math.floor(days/7)*2+(days%7>=5?1:0))%5;
}
function createNationalBroadcast(repository,{now=Date.now,entries,notificationService,contextForVendor}={}){
 const empty=()=>({schema:1,version:0,defaults:{maxQuantity:null,closeHours:72,entryHours:24,selfHours:72,responseHours:24},sessions:{},regions:{},reservations:[],requests:[],audit:[]});
 async function active(channel){return Legacy.enabled(channel)&&(await repository.getRecord(channel.id,'setting','national-cycle-config'))?.mode===MODE;}
 async function read(channel){
  if(!await active(channel))throw fail('전국크레자랑 방송 설정을 확인해 주세요.',404);
  const rows=await repository.getRowsByKeys([KEY]),raw=rows[0]?.value??null;
  if(raw===null&&repository.mirror&&repository.lastMirrorError)throw fail('방송 저장소에 연결하지 못했어요. 다시 시도해 주세요.',503);
  let state;try{state=raw===null?empty():JSON.parse(raw)}catch{throw fail('방송 자료를 읽지 못했어요. 운영자에게 문의해 주세요.',503)}
  if(state.schema!==1||!Array.isArray(state.reservations)||!Array.isArray(state.requests))throw fail('방송 자료를 확인할 수 없어요.',503);
  return {state,raw};
 }
 function session(state,date){return {...Legacy.session(state,date),region:regionAt(date),regionName:REGIONS[regionAt(date)]||''};}
 function dates(state){const result=[],today=Legacy.day(now()),end=Legacy.addDays(today,370);for(let d=START;d<=end;d=Legacy.addDays(d,1))if(scheduled(d))result.push(d);return result;}
 function policySession(state,date,vendors){return {...session(state,date),...regionEntryPolicy(state,regionAt(date),vendors)};}
 function limitFor(state,r,vendors){return Legacy.start(r.date)<=now()?r.entryIds.length:Math.min(r.entryIds.length,regionEntryPolicy(state,r.region,vendors).vendorEntryLimit);}
 function limitMessage(){return '이 권역은 참여업체가 9팀 이상으로 업체당 최대 4마리까지 등록할 수 있어요. 새로고침 후 확인해 주세요.';}
 function availability(state,date,region,vendorId,vendors){
  if(!scheduled(date))return {date,maxQuantityAvailable:0,reason:'방송일을 선택해 주세요.'};
  const s=policySession(state,date,vendors),block=reason=>({...s,maxQuantityAvailable:0,reason});
  if(!Number.isInteger(region))return block('업체 지역을 먼저 등록해 주세요.');
  if(region!==s.region)return block(s.regionName+' 방송이에요.');
  if(!['draft','active'].includes(state.channelStatus||'active'))return block('종료된 채널이에요.');
  if(s.paused)return block('접수가 마감됐어요.');
  if(now()>=Date.parse(s.closesAt))return block('출품 신청이 마감됐어요.');
  if(date>Legacy.addDays(Legacy.day(now()),14))return block('방송 2주 전부터 신청할 수 있어요.');
  if(state.reservations.some(r=>r.vendorId===vendorId&&r.date===date&&r.status==='confirmed'))return block('이미 신청한 방송이에요.');
  const available=s.maxQuantity===null?s.vendorEntryLimit:Math.min(s.vendorEntryLimit,s.maxQuantity-reservedQuantity(state,date));
  if(available<4)return block('방송 정원이 찼어요.');
  return {...s,maxQuantityAvailable:available,reason:''};
 }
 async function view(context){
  const {state}=await read(context.channel),region=state.regions[context.vendor.id]??regionForVendor(context.vendor);
  const entryState=context.profile?await entries.read(context):{entries:[],parents:[],media:[],events:[]};
  const reservations=state.reservations.filter(r=>r.vendorId===context.vendor.id).map(r=>{
   return {...r,linkCode:undefined,session:policySession(state,r.date,context.vendors),...entryProgress(r,entryState.entries,limitFor(state,r,context.vendors)),proposal:null,history:state.audit.filter(a=>a.reservationId===r.id)};
  });
  const place=Origin.locality(inboundData,context.vendor.address,REGIONS[region]);
  return {mode:MODE,enabled:true,version:state.version,now:new Date(now()).toISOString(),channel:{id:context.channel.id,name:context.channel.name,status:context.channel.status},vendor:{id:context.vendor.id,name:context.vendor.name,region:REGIONS[region]||'',locality:place?{id:place.id,city:place.city,district:place.district,label:place.label}:null,inboundOrigins:state.inboundOrigins?.[context.vendor.id]||{}},inboundDestinations:Object.fromEntries(['parge','dodosi'].map(carrier=>[carrier,Inbound.destination(inboundData,carrier)])),inboundDestinationPhones:Object.fromEntries(['parge','dodosi'].map(carrier=>[carrier,Inbound.destinationPhone(inboundData,carrier)])),regions:REGIONS,dates:dates(state).map(d=>availability({...state,channelStatus:context.channel.status},d,region,context.vendor.id,context.vendors)),reservations,entryState,pendingCount:reservations.filter(r=>r.status==='confirmed'&&r.session.startsAt>new Date(now()).toISOString()&&!r.registrationComplete).length};
 }
 async function summary(context){const v=await view(context),open=v.entryState.events?.some(e=>e.id===context.channel.id&&e.entriesOpen),attentionCount=v.dates.filter(d=>d.regionName===v.vendor.region&&require('./public/vendor-task-state').broadcastNeedsAction(d,v.reservations.find(r=>r.date===d.date&&r.status==='confirmed'),v.now,open)).length;return {enabled:true,mode:MODE,pendingCount:v.pendingCount,attentionCount};}
 async function command(context,input,{operator=false}={}){
  if(!['draft','active'].includes(context.channel.status)||(!operator&&context.vendor?.active===false))throw fail('현재 방송을 변경할 수 없어요.',403);
  if(!repository.compareAndSwapRows)throw fail('방송 저장소를 확인해 주세요.',503);
  const {state,raw}=await read(context.channel),requestId=String(input.requestId||''),type=input.type;
  if(!/^[a-zA-Z0-9_-]{8,80}$/.test(requestId))throw fail('요청을 다시 확인해 주세요.',422);
  const allowed=operator?['session','defaults','region','cancel']:['reserve','save-entry','save-entries','reopen-entry','pickup','inbound-origin'];
  if(!allowed.includes(type))throw fail('이 작업을 실행할 수 없어요.',403);
  const clean={...input};for(const k of ['requestId','code','token','bookingCode'])delete clean[k];
  const signature=crypto.createHash('sha256').update(JSON.stringify(clean)).digest('hex'),requestKey=(operator?'operator':context.vendor.id)+':'+requestId,prior=state.requests.find(r=>r.key===requestKey);
  if(prior){if(prior.signature!==signature)throw fail('요청 내용이 변경됐어요. 다시 확인해 주세요.');return {result:prior.result,duplicate:true};}
  let r,result='',action='';
  if(type==='save-entries'){
   r=state.reservations.find(r=>r.id===input.id&&r.vendorId===context.vendor.id&&r.status==='confirmed');
   if(!r||!context.profile)throw fail('출품할 방송을 다시 확인해 주세요.',403);
   if(now()>=Date.parse(session(state,r.date).entriesDueAt))throw fail('개체 등록 기한이 지났어요. 운영자에게 문의해 주세요.');
   if(!Array.isArray(input.entries)||!input.entries.length||input.entries.length>r.entryIds.length||input.entries.some(row=>!row||!Number.isInteger(row.slot)||row.slot<0||row.slot>=r.entryIds.length)||new Set(input.entries.map(row=>row.slot)).size!==input.entries.length)throw fail('등록할 개체를 다시 확인해 주세요.',422);
   if(input.entries.some(row=>row.slot>=limitFor(state,r,context.vendors)))throw fail(limitMessage());
   return entries.saveMany(context,input.entries.map(row=>({broadcast:{id:r.id,date:r.date,slot:row.slot,today:Legacy.day(now())},input:{type:input.submit===true?'submit':'save',entry:{...row.entry,id:r.entryIds[row.slot]},parents:row.parents,expectedVersion:row.expectedVersion}})),requestId);
  }
  if(type==='save-entry'||type==='reopen-entry'){
   r=state.reservations.find(r=>r.id===input.id&&r.vendorId===context.vendor.id&&r.status==='confirmed');
   if(!r||!Number.isInteger(input.slot)||input.slot<0||input.slot>=r.entryIds.length)throw fail('출품할 방송과 개체를 확인해 주세요.',403);
   if(type==='save-entry'&&input.slot>=limitFor(state,r,context.vendors))throw fail(limitMessage());
   if(now()>=Date.parse(session(state,r.date).entriesDueAt))throw fail('개체 등록 기한이 지났어요. 운영자에게 문의해 주세요.');
   if(!context.profile)throw fail('업체 페이지를 다시 열어 주세요.');
   const scoped={...context,nationalBroadcast:{id:r.id,date:r.date,slot:input.slot,today:Legacy.day(now())}};
   const payload=type==='reopen-entry'?{type:'withdraw',id:r.entryIds[input.slot]}:{type:input.submit===true?'submit':'save',entry:{...input.entry,id:r.entryIds[input.slot]},parents:input.parents};
   return entries.command(scoped,{...payload,expectedVersion:input.expectedVersion,requestId});
  }
  if(type==='inbound-origin'){
   if(input.expectedVersion!==state.version)throw fail('다른 화면에서 변경됐어요. 새로고침 후 다시 저장해 주세요.');
   if(!['parge','dodosi'].includes(input.carrier)||typeof input.originId!=='string'||(input.originId&&!Inbound.origins(inboundData,input.carrier).some(o=>o.id===input.originId)))throw fail('목록에서 출발 정거샵을 선택해 주세요.',422);
   state.inboundOrigins||={};state.inboundOrigins[context.vendor.id]={...state.inboundOrigins[context.vendor.id],[input.carrier]:input.originId};result='inbound-origin';
  }else if(type==='reserve'){
   if(![4,5].includes(input.quantity))throw fail('업체당 4~5마리 출품할 수 있어요.',422);
   const region=state.regions[context.vendor.id]??regionForVendor(context.vendor),a=availability(state,input.date,region,context.vendor.id,context.vendors);
   if(input.quantity>a.vendorEntryLimit)throw fail(limitMessage());
   if(a.maxQuantityAvailable<input.quantity)throw fail(a.reason||'신청 가능한 수량이 변경됐어요. 다시 불러와 주세요.');
   r={id:uuid(),vendorId:context.vendor.id,vendorName:context.vendor.name,region,date:input.date,quantity:input.quantity,status:'confirmed',version:1,entryIds:Array.from({length:input.quantity},uuid),pickup:false,linkCode:crypto.randomBytes(18).toString('base64url'),createdAt:new Date(now()).toISOString()};
   state.reservations.push(r);result=r.id;action='예약 확정';
  }else if(['session','defaults','region'].includes(type)){
   if(input.expectedVersion!==state.version)throw fail('설정이 변경됐어요. 새로고침 후 다시 저장해 주세요.');
   if(type==='region'){
    if(!Number.isInteger(input.region)||input.region<0||input.region>4||!context.vendors.some(v=>v.id===input.vendorId))throw fail('업체와 지역을 확인해 주세요.',422);
    if(state.reservations.some(r=>r.vendorId===input.vendorId&&r.status==='confirmed'&&Legacy.start(r.date)>now()&&r.region!==input.region))throw fail('기존 방송 신청이 있어 지역을 변경할 수 없어요.');
    state.regions[input.vendorId]=input.region;
   }else if(type==='defaults'){
    const d=input.defaults||{};if(!validCapacity(d.maxQuantity))throw fail('정원은 4마리 이상 입력하거나 제한 없이 설정해 주세요.',422);
    for(const k of ['closeHours','entryHours','selfHours','responseHours'])if(!Number.isInteger(d[k])||d[k]<(k==='responseHours'?1:0)||d[k]>336)throw fail('기한을 확인해 주세요.',422);
    for(const date of dates(state))if(state.reservations.some(r=>r.date===date))state.sessions[date]=session(state,date);
    state.defaults={...d};
   }else{
    if(!scheduled(input.date)||input.date<Legacy.day(now()))throw fail('앞으로의 방송일을 선택해 주세요.',422);
    const v=input.settings||{};if(!validCapacity(v.maxQuantity)||(v.maxQuantity!==null&&v.maxQuantity<reservedQuantity(state,input.date)))throw fail('이미 확보한 출품 자리 이상으로 입력하거나 제한 없이 설정해 주세요.',422);
    for(const k of ['closesAt','entriesDueAt','selfUntil'])if(!Number.isFinite(Date.parse(v[k]))||Date.parse(v[k])>Legacy.start(input.date))throw fail('기한을 방송 시작 전으로 설정해 주세요.',422);
    if(!Number.isInteger(v.responseHours)||v.responseHours<1||v.responseHours>336)throw fail('응답 기한을 확인해 주세요.',422);
    state.sessions[input.date]={...session(state,input.date),...Object.fromEntries(['maxQuantity','closesAt','entriesDueAt','selfUntil','responseHours'].map(k=>[k,v[k]])),paused:v.paused===true};
   }result=type;
  }else{
   r=state.reservations.find(r=>r.id===input.id&&(operator||r.vendorId===context.vendor.id)&&r.status==='confirmed');
   if(!r)throw fail('방송 신청을 찾을 수 없어요.',404);
   if(r.version!==input.expectedVersion)throw fail('다른 화면에서 변경됐어요. 다시 불러와 주세요.');
   if(type==='cancel'){
    const vendor=context.vendors.find(v=>v.id===r.vendorId);
    if(!contextForVendor)throw fail('업체 출품 자료를 확인할 수 없어요.',503);
    const target=await contextForVendor(context.channel,vendor);
    if(target.profile){const data=await entries.read(target);if(data.entries.some(e=>r.entryIds.includes(e.id)&&['submitted','approved'].includes(e.status)))throw fail('제출된 개체가 있어 취소할 수 없어요. 출품 검토에서 먼저 확인해 주세요.');}
    r.status='cancelled';action='예약 취소';
   }else{
    if(typeof input.pickup!=='boolean')throw fail('수거 상태를 확인해 주세요.',422);
    r.pickup=input.pickup;r.pickupAt=input.pickup?new Date(now()).toISOString():null;action=input.pickup?'수거 완료':'수거 전';
   }r.version++;result=r.id;
  }
  const rows=[];
  if(r){
   r.updatedAt=new Date(now()).toISOString();state.audit.push({reservationId:r.id,action,date:r.date,quantity:r.quantity,at:r.updatedAt,actor:operator?'operator':'vendor'});
   if(['예약 확정','예약 취소'].includes(action)){
    if(!notificationService?.prepare)throw fail('예약 알림 저장소를 확인해 주세요.',503);
    const vendor=operator?context.vendors.find(v=>v.id===r.vendorId):context.vendor;
    const notice=await notificationService.prepare(context.channel.id,{templateKey:'broadcast_booking_updated',eventKey:`booking:${r.id}:${r.version}`,recipientRole:'vendor',recipientPhone:vendor?.phone,transport:'alimtalk',allowSmsFallback:false,failureSmsFallback:false,variables:{업체명:vendor?.name||r.vendorName,예약상태:action,방송일시:r.date+' 오후 8시',수량:r.quantity===4?'4':'4~5',예약접속코드:r.linkCode}});
    r.noticeVersion=r.version;rows.push({key:channelKey(context.channel.id,'notification',notice.record.id),value:JSON.stringify(notice.record)});
   }
  }
  state.version++;state.requests.push({key:requestKey,signature,result});rows.unshift({key:KEY,value:JSON.stringify(state)});
  if(!await repository.compareAndSwapRows(KEY,raw,rows))throw fail('다른 변경이 먼저 반영됐어요. 다시 불러와 주세요.');
  return {result,duplicate:false};
 }
 async function operatorView(channel,vendors){
  const {state}=await read(channel);
  const entrySets=new Map(await Promise.all(vendors.filter(v=>state.reservations.some(r=>r.vendorId===v.id)).map(async v=>{
   const context=await contextForVendor(channel,v);return [v.id,context.profile?(await entries.read(context)).entries:[]];
  })));
  return {mode:MODE,version:state.version,now:new Date(now()).toISOString(),channel:{id:channel.id,name:channel.name},defaults:state.defaults,regions:REGIONS,vendors:vendors.map(v=>({id:v.id,name:v.name,region:state.regions[v.id]??regionForVendor(v)})),sessions:dates(state).filter(d=>d>=Legacy.day(now())||state.reservations.some(r=>r.date===d)).map(date=>{
   const rs=state.reservations.filter(r=>r.date===date),confirmed=reservedQuantity(state,date);
   return {...policySession(state,date,vendors),confirmedQuantity:confirmed,heldQuantity:0,shortfall:0,regions:REGIONS.map((name,i)=>({name,confirmed:i===regionAt(date)?confirmed:0,held:0,available:availability(state,date,i,'operator-probe',vendors).maxQuantityAvailable?(session(state,date).maxQuantity===null?null:session(state,date).maxQuantity-confirmed):0})),reservations:rs.map(r=>{const {completed,registrationComplete,entryLimit,excessSubmitted}=entryProgress(r,entrySets.get(r.vendorId)||[],limitFor(state,r,vendors));return {...r,completed,registrationComplete,entryLimit,excessSubmitted,linkCode:undefined,session:session(state,date),regionName:REGIONS[r.region],vendorName:vendors.find(v=>v.id===r.vendorId)?.name||r.vendorName,proposal:null,history:state.audit.filter(a=>a.reservationId===r.id)};}),incoming:[]};
  })};
 }
 async function resolveLink(channel,code){const {state}=await read(channel),r=state.reservations.find(r=>r.linkCode===code);return r&&/^[A-Za-z0-9_-]{24}$/.test(code||'')&&now()<Legacy.start(r.date)+30*86400000?{vendorId:r.vendorId,reservationId:r.id}:null;}
 async function assertNotification(channel,n){const {state}=await read(channel),[,id,version]=String(n.eventKey).split(':'),r=state.reservations.find(r=>r.id===id);if(!r||r.noticeVersion!==Number(version))throw fail('이전 예약 상태 알림입니다.');}
 return {active,read,summary,vendorView:view,operatorView,command,resolveLink,assertNotification};
}
function createBookingRouter(repository,options){
 const old=Legacy.createBroadcastBooking(repository,options),cycle=createNationalBroadcast(repository,options);
 const router={cycle};
 for(const method of ['read','summary','vendorView','operatorView','command','resolveLink','assertNotification'])router[method]=async(first,...rest)=>(await cycle.active(first.channel||first)?cycle:old)[method](first,...rest);
 return router;
}
module.exports={REGIONS,START,MODE,regionAt,regionIndex,regionForVendor,regionEntryPolicy,createNationalBroadcast,createBookingRouter};
