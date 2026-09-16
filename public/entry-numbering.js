(function(root){
  'use strict';
  function nextCode(prefix,allocation){
    if(!['A','B'].includes(prefix))return '';
    const used=new Set(allocation.map(item=>String(item.code||'').trim().toUpperCase()));
    for(let n=1;n<=10000;n++){const code=prefix+String(n).padStart(2,'0');if(!used.has(code))return code;}
    return '';
  }
  function initial({allocation=[],existing,lot='',teamBased=false,preferred='A'}={}){
    const code=existing?.code||lot;
    const mode=teamBased?'manual':code?(/^([AB])\d+$/.exec(code.toUpperCase())?.[1]||'manual'):preferred;
    return {mode,code:code||nextCode(mode,allocation),order:existing?.order||Math.max(0,...allocation.map(item=>Number(item.order)||0))+1};
  }
  const api={nextCode,initial};
  if(typeof module==='object'&&module.exports)module.exports=api;
  root.CreoEntryNumbering=api;
})(typeof window==='object'?window:globalThis);
