(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.CreoCarrierSearch=api;})(typeof window==='undefined'?globalThis:window,function(){
 'use strict';
 const initial=['ㄱ','ㄲ','ㄴ','ㄷ','ㄸ','ㄹ','ㅁ','ㅂ','ㅃ','ㅅ','ㅆ','ㅇ','ㅈ','ㅉ','ㅊ','ㅋ','ㅌ','ㅍ','ㅎ'];
 const normalize=value=>String(value||'').replace(/\s+/g,' ').trim().toLowerCase();
 function chosung(value){return [...String(value||'')].map(ch=>{const n=ch.charCodeAt(0);return n>=0xac00&&n<=0xd7a3?initial[Math.floor((n-0xac00)/588)]:ch}).join('');}
 function find(regions,query='',region='전체'){
  const words=normalize(query).split(/\s+/).filter(Boolean);
  return (regions||[]).flatMap(group=>(group.shops||[]).map(shop=>({region:group.region,...shop}))).filter(row=>(region==='전체'||row.region===region)&&words.every(word=>normalize(row.region+' '+row.name).includes(word)||chosung(row.region+' '+row.name).includes(word)));
 }
 return{find,normalize,chosung};
});
