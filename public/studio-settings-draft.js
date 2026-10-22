(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.CreoStudioSettings=api;})(typeof window==='undefined'?globalThis:window,function(){
 'use strict';
 const normalize=value=>typeof value==='boolean'?value:String(value??'');
 function create({fields,write,onChange=()=>{},onSaved=()=>{},onError=()=>{}}){
  const allowed=new Set(fields);
  let baseline={},pending={},versions={},revision=0,queued=0,tail=Promise.resolve(),error='';
  const clean=value=>Object.fromEntries(Object.entries(value||{}).filter(([name])=>allowed.has(name)).map(([name,value])=>[name,normalize(value)]));
  const values=()=>({...baseline,...pending});
  const dirty=()=>Object.keys(pending).length>0;
  const status=()=>({dirty:dirty(),saving:queued>0,error});
  const notify=()=>onChange(status());
  function reconcile(desired){pending={};for(const [name,value] of Object.entries(desired))if(value!==baseline[name])pending[name]=value;}
  return {
   values,status,
   receive(value){baseline=clean(value);reconcile({...baseline,...pending});notify();return values();},
   capture(value){const next=clean(value),current=values();for(const [name,value] of Object.entries(next))if(value!==current[name]){versions[name]=++revision;pending[name]=value;if(value===baseline[name])delete pending[name];}notify();return values();},
   save(names,{automatic=false}={}){
    // Manual double-clicks share one request. Immediate toggles are serialized.
    if(queued&&!automatic)return tail;
    const current=values(),snapshot=Object.fromEntries((names||[...allowed]).filter(name=>allowed.has(name)&&(automatic||Object.hasOwn(pending,name))&&Object.hasOwn(current,name)).map(name=>[name,current[name]]));
    if(!Object.keys(snapshot).length)return Promise.resolve(true);
    const sentVersions={...versions};queued++;error='';notify();
    const operation=tail.then(async()=>{
     try{
      const result=await write(snapshot),before=values(),keep={...pending};
      baseline={...baseline,...snapshot,...clean(result?.state)};
      for(const name of Object.keys(snapshot)){
       if(versions[name]===sentVersions[name])delete keep[name];
       else keep[name]=before[name]; // Includes an edit back to the old baseline while saving.
      }
      reconcile({...baseline,...keep});error='';onSaved(result,snapshot);return true;
     }catch(failure){error=(failure.message||'설정을 저장하지 못했어요.')+' 입력은 유지돼요. 변경 저장을 다시 눌러 주세요.';onError(failure,error);return false;}
     finally{queued--;notify();}
    });
    tail=operation;return operation;
   }
  };
 }
 return {create};
});
