(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.CreoStudioAssetSave=api;})(typeof globalThis==='object'?globalThis:this,function(){
 'use strict';
 const imageTypes=['image/png','image/jpeg','image/webp','image/gif','image/svg+xml'];
 function mime(file){return file?.type||'';}
 function validate(record,file){
  if(!String(record.name||'').trim())return '이름을 입력해 주세요.';
  if(record.kind==='vendor'&&!String(record.targetName||'').trim())return '연결할 업체명을 입력해 주세요.';
  if(!['sponsor','vendor'].includes(record.kind))return '협찬 로고 또는 업체 로고를 선택해 주세요.';
  if(file){
   if(!imageTypes.includes(mime(file)))return 'PNG, JPG, WEBP, GIF 또는 SVG 이미지를 선택해 주세요.';
   if(file.size>8*1024*1024)return '이미지는 8MB 이하로 선택해 주세요.';
  }else if(!/^(https?:\/\/|\/[^/]|assets\/)/i.test(String(record.imageUrl||'').trim()))return '파일을 선택하거나 파일 주소를 입력해 주세요.';
  return '';
 }
 function create({context,upload,write,onChange=()=>{},onSaved=()=>{},onError=()=>{},makeId=()=>`asset_${crypto.randomUUID().replace(/-/g,'')}`}={}){
  let pending=null,uploaded=null,createId='';
  function reset(){if(pending)return false;uploaded=null;createId='';return true;}
  function save({record,file=null,existingId=''}){
   if(pending)return pending;
   const scope=context(),copy={...record},error=validate(copy,file);
   if(error){onError(new Error(error));return Promise.resolve(false);}
   const id=existingId||(createId||(createId=makeId()));
   // Install the shared promise before callbacks or upload can trigger another click.
   pending=Promise.resolve().then(async()=>{
    try{
     if(file){
      if(!uploaded||uploaded.file!==file||uploaded.scope!==scope){uploaded=null;const result=await upload(file,copy.kind,scope);if(!result?.url)throw new Error('파일 주소를 받지 못했습니다. 다시 저장해 주세요.');uploaded={file,scope,url:result.url};}
      copy.imageUrl=uploaded.url;
     }
     if(context()!==scope)throw new Error('방송일이 바뀌었습니다. 원래 방송일에서 다시 저장해 주세요.');
     const result=await write(scope,{...copy,id},Boolean(existingId));
     if(!result?.record?.id)throw new Error('저장 결과를 확인하지 못했습니다. 다시 저장해 주세요.');
     uploaded=null;createId='';
     // A view refresh failure must not turn an acknowledged save into another creation.
     try{onSaved(result.record,scope);}catch(error){onError(error,{saved:true});}
     return true;
    }catch(error){onError(error,{saved:false});return false;}
    finally{pending=null;onChange(false);}
   });
   onChange(true);
   return pending;
  }
  return{save,reset,busy:()=>Boolean(pending)};
 }
 return{create,validate,mime};
});
