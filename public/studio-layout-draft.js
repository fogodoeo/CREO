(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.CreoLayoutDraft=api;})(typeof window==='undefined'?globalThis:window,function(){
 'use strict';
 const copy=value=>JSON.parse(JSON.stringify(value));
 function create(){
  let authoritative={},pending={};
  const values=()=>{const result=copy(authoritative);for(const [slot,value] of Object.entries(pending)){if(value===null)delete result[slot];else result[slot]=copy(value)}return result;};
  return {
   receive(value){authoritative=copy(value||{});return values()},
   change(slot,value){pending[slot]=value===null?null:copy(value);return values()},
   values,
   pending(){return copy(pending)},
   dirty(){return Object.keys(pending).length>0},
   snapshot(){return {values:values(),pending:copy(pending)}},
   saved(value,snapshot){authoritative=copy(value||snapshot.values);for(const [slot,saved] of Object.entries(snapshot.pending))if(JSON.stringify(pending[slot])===JSON.stringify(saved))delete pending[slot];return values()}
  };
 }
 return {create};
});
