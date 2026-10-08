(function(root){
 'use strict';
 const encoder=new TextEncoder(),limit=24*1024*1024;
 const table=Uint32Array.from({length:256},(_,n)=>{for(let k=0;k<8;k++)n=(n&1)?0xedb88320^(n>>>1):n>>>1;return n>>>0;});
 function crc32(bytes){let crc=0xffffffff;for(const byte of bytes)crc=table[(crc^byte)&255]^(crc>>>8);return (crc^0xffffffff)>>>0;}
 function zip(files){
  if(!files.length||files.length>100)throw Error('사진 수를 확인해 주세요.');
  const parts=[],directory=[];let offset=0,total=0;
  for(const file of files){
   const name=encoder.encode(file.name),bytes=file.bytes,crc=crc32(bytes),header=new Uint8Array(30+name.length),view=new DataView(header.buffer);
   if(!name.length||name.length>255||/[/\\]/.test(file.name))throw Error('파일 이름을 확인해 주세요.');
   total+=bytes.length;if(total>limit)throw Error('사진 용량이 커요. 이미지 따로 받기를 이용해 주세요.');
   view.setUint32(0,0x04034b50,true);view.setUint16(4,20,true);view.setUint16(6,0x800,true);view.setUint16(12,33,true);view.setUint32(14,crc,true);view.setUint32(18,bytes.length,true);view.setUint32(22,bytes.length,true);view.setUint16(26,name.length,true);header.set(name,30);
   const central=new Uint8Array(46+name.length),cv=new DataView(central.buffer);
   cv.setUint32(0,0x02014b50,true);cv.setUint16(4,20,true);cv.setUint16(6,20,true);cv.setUint16(8,0x800,true);cv.setUint16(14,33,true);cv.setUint32(16,crc,true);cv.setUint32(20,bytes.length,true);cv.setUint32(24,bytes.length,true);cv.setUint16(28,name.length,true);cv.setUint32(42,offset,true);central.set(name,46);
   parts.push(header,bytes);directory.push(central);offset+=header.length+bytes.length;
  }
  const directoryLength=directory.reduce((sum,v)=>sum+v.length,0),end=new Uint8Array(22),ev=new DataView(end.buffer);
  ev.setUint32(0,0x06054b50,true);ev.setUint16(8,files.length,true);ev.setUint16(10,files.length,true);ev.setUint32(12,directoryLength,true);ev.setUint32(16,offset,true);
  return new Blob([...parts,...directory,end],{type:'application/zip'});
 }
 function extension(bytes){
  if(bytes[0]===137&&bytes[1]===80&&bytes[2]===78&&bytes[3]===71)return 'png';
  if(bytes[0]===255&&bytes[1]===216&&bytes[2]===255)return 'jpg';
  if(bytes[0]===82&&bytes[1]===73&&bytes[2]===70&&bytes[3]===70&&bytes[8]===87&&bytes[9]===69&&bytes[10]===66&&bytes[11]===80)return 'webp';
  throw Error('사진을 불러오지 못했어요. 이미지 따로 받기를 이용해 주세요.');
 }
 async function prepare(images,{fetcher=fetch,signal,text=''}={}){
  if(!images.length||images.length>30)throw Error('사진을 준비한 뒤 다시 눌러 주세요.');
  const files=[],captions=[];let total=0;
  for(let i=0;i<images.length;i++){
   let response;
   try{response=await fetcher(images[i].src,{credentials:'same-origin',mode:'cors',signal});}catch(e){if(signal?.aborted)throw e;throw Error('사진을 모두 받지 못했어요. 연결을 확인하고 다시 시도해 주세요.');}
   if(!response.ok)throw Error('사진을 모두 받지 못했어요. 연결을 확인하고 다시 시도해 주세요.');
   const declared=Number(response.headers?.get('content-length')||0);if(declared>limit-total)throw Error('사진 용량이 커요. 이미지 따로 받기를 이용해 주세요.');
   const bytes=new Uint8Array(await response.arrayBuffer());total+=bytes.length;
   if(total>limit)throw Error('사진 용량이 커요. 이미지 따로 받기를 이용해 주세요.');
   const name=String(i+1).padStart(2,'0')+'_이미지.'+extension(bytes);files.push({name,bytes});captions.push(name+' · '+images[i].alt);
  }
  const guide='휴대폰 파일 앱에서 압축을 푼 뒤 카페 글쓰기의 사진 첨부로 가져오세요.\n사진은 원고에 표시된 순서대로 번호를 붙였습니다.\n밴드 초대 링크는 본문에도 붙여 넣어 주세요.\n\n'+captions.join('\n');
  files.push({name:'사진순서.txt',bytes:encoder.encode(guide)});
  if(text)files.push({name:'본문.txt',bytes:encoder.encode(text)});
  return {blob:zip(files),count:images.length};
 }
 const api={zip,crc32,extension,prepare};
 if(typeof module==='object'&&module.exports)module.exports=api;else root.CreoPromoImageBundle=api;
})(typeof window==='undefined'?{}:window);
