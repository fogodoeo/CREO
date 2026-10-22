(function(root,factory){const api=factory(typeof module==='object'&&module.exports?require('./operator-home-model'):root.CreoOperatorHome);if(typeof module==='object'&&module.exports)module.exports=api;else root.CreoOperatorShell=api;})(typeof window!=='undefined'?window:globalThis,function(Home){
 'use strict';
 const groups=[
  ['vendors','업체 관리',[['vendors','전체 업체','program'],['regions','방송 지역 배정','program'],['access','업체 접속 관리','global']]],
  ['schedule','방송 일정',[['rounds','회차 준비·방송 전환'],['bookings','업체 방송 신청'],['promo','전크자 홍보 일정·원고','global']]],
  ['auction','경매 운영',[['intake','출품 접수·검토'],['items','개체·경매 순서'],['members','참여 업체']]],
  ['broadcast','방송 도구',[['broadcast','방송 제어·화면 배치'],['pinball','핀볼 추첨'],['captures','캡처 자료'],['captureSetup','캡처 본체 설정','global']]],
  ['finance','낙찰·배송·정산',[['shipping','낙찰자 입금·배송 관리'],['organizer','업체 정산·입금 확인'],['shippingStatus','배송 현황'],['changes','배송 변경·도도시 승인'],['parge','파르게 운송 접수'],['report','회차 총정산표·엑셀'],['print','내역·라벨 인쇄']]],
  ['settings','설정',[['settings','채널 설정'],['rates','배송 요금·거점','global'],['monitor','BAND 승인봇 상태','global'],['archives','지난 결과·보관 자료'],['survey','참여자 설문']]]
 ];
 const origin='https://operator.invalid';
 function routes(state){const links=Home.links(state),q=new URLSearchParams({channel:state.channel.id,...(state.archiveId?{archive:state.archiveId}:{})});return {...links,
  vendors:'/operator-vendors.html?'+new URLSearchParams({program:Home.family(state.channel)}),regions:Home.national(state.channel)?'/organizer-bookings.html?channel=national-cre&action=region':'',access:'/national-vendors.html',rates:'/shipping-rates.html',promo:'/promo-center.html?admin=1',
  captureSetup:'/capture-setup.html',monitor:'/band-monitor.html',
  intake:links.intake||(links.workspace&&state.channel.dataAdapter==='platform'?'/vendor-entry-review.html?'+new URLSearchParams({channel:state.channel.id,...(state.round?.date?{broadcastDate:state.round.date}:{})}):''),
  items:links.workspace?links.workspace+'&tab=items':'',members:links.workspace?links.workspace+'&tab=vendors':'',
  changes:links.shipping?'/checkout-changes.html?'+q:''};}
 function menu(state){const links=routes(state);return groups.map(([id,label,entries])=>({id,label,entries:entries.map(([key,label,scope='round'])=>({key,label,scope,href:links[key]||'',group:id})).filter(e=>e.href)})).filter(g=>g.entries.length);}
 function entry(state,key='home'){if(key==='home')return{key,label:'운영 홈',scope:'round',group:'',href:''};return menu(state).flatMap(g=>g.entries).find(e=>e.key===key)||null;}
 function home(state,key='home',extra={}){const url=new URL(state.home,origin);if(key!=='home')url.searchParams.set('view',key);for(const[k,v]of Object.entries(extra))if(v)url.searchParams.set(k,v);return url.pathname+url.search;}
 function frame(state,key,search=''){const e=entry(state,key);if(!e?.href)return '';const url=new URL(e.href,origin);if(url.origin!==origin)return '';const q=new URLSearchParams(search);if(['items','members','bookings','regions','intake'].includes(key)&&q.get('vendor'))url.searchParams.set('vendor',q.get('vendor'));if(key==='bookings'&&q.get('action')==='region')url.searchParams.set('action','region');if(key==='intake'&&q.get('status')==='approved')url.searchParams.set('status','approved');url.searchParams.set('embedded','1');url.searchParams.set('adminShell','1');return url.pathname+url.search+url.hash;}
 // Only known same-origin administration pages can become shell destinations.
 // Broadcast displays and buyer/vendor access links deliberately remain separate.
 function resolve(href,state){let url;try{url=new URL(href,origin)}catch{return null}if(url.origin!==origin||url.searchParams.has('broadcast')||url.searchParams.has('live'))return null;
  if(['/main','/main/','/index.html'].includes(url.pathname))return{key:url.searchParams.get('view')||'home',url};
  for(const e of menu(state).flatMap(g=>g.entries)){const target=new URL(e.href,origin);if(target.pathname!==url.pathname)continue;if(['items','members'].includes(e.key)&&e.key!==(url.searchParams.get('tab')==='items'?'items':'members'))continue;if(['bookings','regions'].includes(e.key)&&e.key!==(url.searchParams.get('action')==='region'?'regions':'bookings'))continue;
   return{key:e.key,url};}return null;}
 return{groups,routes,menu,entry,home,frame,resolve};
});
