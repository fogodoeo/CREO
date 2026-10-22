(function(root,factory){'use strict';const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.CreoEntryIntake=api;})(typeof window==='object'?window:globalThis,function(){
 'use strict';
 const validDate=value=>{if(!/^\d{4}-\d{2}-\d{2}$/.test(String(value||'')))return false;const date=new Date(value+'T00:00:00Z');return Number.isFinite(date.getTime())&&date.toISOString().slice(0,10)===value;};
 const today=(now=Date.now())=>new Date(Number(now)+9*3600000).toISOString().slice(0,10);
 const rows=data=>(data?.groups||[]).flatMap(group=>(group.entries||[]).map(entry=>({entry,group})));
 const onDate=(row,date)=>!date||row.entry.broadcastDate===date;
 const dates=data=>[...new Set(rows(data).map(row=>row.entry.broadcastDate).filter(validDate))].sort();
 function initialDate(data,requested,now){if(requested==='all')return '';if(validDate(requested))return requested;return data?.channel?.id==='national-cre'?today(now):'';}
 function summarize(data,date){const selected=rows(data).filter(row=>onDate(row,date)),counts={submitted:0,draft:0,changes_requested:0,approved:0};for(const row of selected)if(Object.hasOwn(counts,row.entry.status))counts[row.entry.status]++;return {counts,rows:selected};}
 function arrangement(data,date,part,partOf){const targets=(data?.allocation||[]).filter(item=>partOf(item.code)===part),ids=new Set(rows(data).filter(row=>onDate(row,date)).map(row=>row.entry.itemId));return {targets,scoped:!date||data?.auctionTarget?.date===date||targets.every(item=>ids.has(item.id))};}
 function reviewUrl(channelId,date,vendorId='',status='submitted'){const params=new URLSearchParams({channel:channelId,broadcastDate:date||'all'});if(vendorId)params.set('vendor',vendorId);if(['draft','submitted','changes_requested','approved'].includes(status))params.set('status',status);return '/vendor-entry-review.html?'+params;}
 function sourceChannel(channel){return channel?.nationalRound?.parentId==='national-cre'?{channelId:'national-cre',date:channel.nationalRound.date}:{channelId:channel?.id||'',date:''};}
 return {validDate,today,rows,onDate,dates,initialDate,summarize,arrangement,reviewUrl,sourceChannel};
});
