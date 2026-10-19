'use strict';
window.addEventListener('message',async event=>{
 if(event.source!==window||event.origin!=='https://creok.onrender.com'||event.data?.type!=='creo-parge-command')return;
 const {requestId,action,plan}=event.data;
 if(!['ping','dispatch','release'].includes(action)||typeof requestId!=='string')return;
 try{const result=await chrome.runtime.sendMessage({type:'creo-parge-web',action,plan});window.postMessage({type:'creo-parge-result',requestId,result},location.origin);}
 catch(e){window.postMessage({type:'creo-parge-result',requestId,result:{error:e.message}},location.origin);}
});
