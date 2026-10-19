(function(root,factory){const api=factory(typeof module==='object'&&module.exports?require('./channel-runtime'):root.CreoChannelRuntime);if(typeof module==='object'&&module.exports)module.exports=api;else root.CreoOperatorHome=api;})(typeof window!=='undefined'?window:globalThis,function(Runtime){
 'use strict';
 const national=c=>c?.id==='national-cre'||c?.nationalRound?.parentId==='national-cre';
 const family=c=>national(c)?'national-cre':/^(?:creyon|clab)(?:-|$)/.test(c.id)?'clab':c.id;
 const key=r=>r.channelId+(r.archiveId?'@'+r.archiveId:'');
 function home(channelId,archiveId=''){return '/main?'+new URLSearchParams({channel:channelId,...(archiveId?{archive:archiveId}:{})});}
 function selection(catalog,rounds,activeId,search){
  const q=new URLSearchParams(search),id=q.get('channel')||activeId,archive=q.get('archive')||'';
  const channel=catalog.channels.find(c=>c.id===id);
  if(!channel)throw Error('선택한 채널을 찾을 수 없습니다. 운영 홈에서 다시 선택해 주세요.');
  const round=rounds.find(r=>r.channelId===id&&(r.archiveId||'')===archive);
  if(!round)throw Error('선택한 회차를 찾을 수 없습니다. 회차 목록을 새로고침해 주세요.');
  if(round.scopeError)throw Error(round.scopeError);
  return {channel,round,archiveId:archive,label:round?.name||channel.name,active:!archive&&id===activeId,home:home(id,archive)};
 }
 function links(s){
  const c=s.channel,id=c.id,arch=s.archiveId,extra=arch?{archive:arch}:{},r=Runtime.channelRoutes(id);
  const result={home:s.home,shipping:Runtime.routeUrl('shipping',id,extra),shippingStatus:Runtime.routeUrl('shippingStatus',id,extra),print:Runtime.routeUrl('print',id,extra),report:'/settlement-report.html?'+new URLSearchParams({channel:id,...extra}),settings:arch?'':r.settings,archives:arch?'':r.archives};
  if(!arch&&['active','draft'].includes(c.status)){
   result.workspace=c.dataAdapter==='legacy-cdcup'&&c.legacy?.managementUrl?Runtime.preserveChannel(c.legacy.managementUrl,id):r.workspace;
   result.broadcast=Runtime.operationalFeatureAvailable(c,'broadcast')?r.control:'';result.captures=r.captures;
   result.parge=c.dataAdapter==='platform'&&Runtime.operationalFeatureAvailable(c,'shipping')?'/parge-dispatch.html?channel='+encodeURIComponent(id):'';
   const theme=national(c)?'national':c.broadcastProfile==='basic-dice'?'ryangecko':'academy';
   result.pinball='/roulette/?'+new URLSearchParams({channel:id,channelName:s.label,theme});
   if(c.features?.survey===true&&c.pages?.survey)result.survey=Runtime.preserveChannel(c.pages.survey,id);
  }
  if(!Runtime.operationalFeatureAvailable(c,'shipping')){result.shipping='';result.shippingStatus='';result.report='';}
  if(c.features?.auction===false){result.workspace='';result.print='';}
  if(c.dataAdapter==='legacy-cdcup'||c.features?.auction===false)result.report='';
  if(national(c)){
   result.rounds='/national-rounds.html?'+new URLSearchParams({channel:id,...extra});
   result.bookings='/organizer-bookings.html?channel=national-cre';
   result.intake='/vendor-entry-review.html?'+new URLSearchParams({channel:'national-cre',...(s.round?.date?{broadcastDate:s.round.date}:{})});
  }else result.rounds=r.archives;
  return result;
 }
 function families(catalog){return [...new Map(catalog.channels.filter(c=>!c.id.startsWith('checkout-test-')).map(c=>[family(c),{id:family(c),name:family(c)==='national-cre'?'전국크레자랑':family(c)==='clab'?'씨랩 · 크레용':c.name}])).values()];}
 return {national,family,key,home,selection,links,families};
});
