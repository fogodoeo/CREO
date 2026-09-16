(function(root){
  'use strict';
  const parts=['1부','2부','이벤'];
  const prefixes={'1부':'A','2부':'B','이벤':'E'};
  const normalize=code=>String(code||'').trim().replace(/\s+/g,' ').toUpperCase();
  const valid=code=>/^(?:[A-Z0-9][A-Z0-9-]{0,15}|1부 A\d{2,5}|2부 B\d{2,5}|이벤 E\d{2,5})$/.test(normalize(code));
  const partOf=code=>/^(1부 A|2부 B|이벤 E)\d+$/.exec(normalize(code))?.[1].split(' ')[0]||'';
  function nextCode(prefix,allocation){
    if(!['A','B',...parts].includes(prefix))return '';
    const used=new Set(allocation.map(item=>normalize(item.code||item.attributes?.displayNumber||item.name)));
    for(let n=1;n<=10000;n++){const code=prefix+(parts.includes(prefix)?' '+prefixes[prefix]:'')+String(n).padStart(2,'0');if(!used.has(code))return code;}
    return '';
  }
  function initial({allocation=[],existing,lot='',teamBased=false,preferred='1부'}={}){
    const code=existing?.code||lot;
    const mode=code?(partOf(code)||(teamBased?'manual':/^([AB])\d+$/.exec(code.toUpperCase())?.[1]||'manual')):preferred;
    return {mode,code:code||nextCode(mode,allocation),order:existing?.order||Math.max(0,...allocation.map(item=>Number(item.order)||0))+1};
  }
  function interleave(items,random=Math.random){
    const grouped=new Map();
    for(const item of [...items].sort((a,b)=>Number(a.lotNumber)-Number(b.lotNumber)||String(a.id).localeCompare(String(b.id)))){
      const key=item.vendorId||item.vendorName||item.id;
      if(!grouped.has(key))grouped.set(key,[]);grouped.get(key).push(item);
    }
    const queues=[...grouped.values()];
    for(let i=queues.length-1;i>0;i--){const j=Math.min(i,Math.max(0,Math.floor(random()*(i+1))));[queues[i],queues[j]]=[queues[j],queues[i]];}
    const ordered=[];
    for(let n=0;ordered.length<items.length;n++)for(const queue of queues)if(queue[n])ordered.push(queue[n]);
    return ordered;
  }
  const api={nextCode,initial,normalize,valid,partOf,parts,interleave};
  if(typeof module==='object'&&module.exports)module.exports=api;
  root.CreoEntryNumbering=api;
})(typeof window==='object'?window:globalThis);
