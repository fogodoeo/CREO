'use strict';
// Create an empty channel and open entry intake. Never copy auction records.
async function prepareNationalCre(api,{apply=false}={}){
 const catalog=await api('GET','channels?includeArchived=1'),existing=catalog.channels.find(c=>c.id==='national-cre');
 if(existing&&existing.dataAdapter!=='platform')throw Error('Existing national-cre channel uses a different adapter');
 const channel=existing||{id:'national-cre',name:'전국크레자랑',shortName:'전국크레자랑',status:'active',dataAdapter:'platform',templateId:'standard',broadcastTemplate:'classic',features:{shipping:true}};
 if(!apply)return {exists:Boolean(existing),channel};
 if(!existing)await api('POST','channels',{channel,expectedVersion:catalog.version});
 const policy=await api('GET','channels/national-cre/entry-policy');
 // Do not reopen a preexisting channel intentionally closed by its operator.
 if(!existing&&!policy.open)await api('PUT','channels/national-cre/entry-policy',{open:true,expectedRevision:policy.revision});
 return {created:!existing,channelId:'national-cre',entryPolicy:await api('GET','channels/national-cre/entry-policy')};
}
module.exports={prepareNationalCre};
