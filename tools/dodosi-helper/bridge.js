'use strict';
window.addEventListener('message',async e=>{
 if(e.source!==window||e.origin!=='https://creok.onrender.com'||e.data?.type!=='creo-dodosi-command')return;
 const {requestId,action,plan}=e.data;
 if(!['ping','sync','quote','fill'].includes(action)||typeof requestId!=='string'||requestId.length>100)return;
 try{const result=await chrome.runtime.sendMessage({action,plan});window.postMessage({type:'creo-dodosi-result',requestId,result},location.origin);}
 catch(error){window.postMessage({type:'creo-dodosi-result',requestId,result:{error:error.message}},location.origin);}
});
