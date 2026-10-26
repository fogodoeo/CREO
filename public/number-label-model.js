(function(root){
 'use strict';
 const clean=v=>String(v??'').replace(/\s+/g,' ').trim();
 const fail=m=>{throw Object.assign(Error(m),{status:422});};
 function date(value){const v=clean(value);if(!/^\d{4}-\d{2}-\d{2}$/.test(v)||!Number.isFinite(Date.parse(v))||new Date(v).toISOString().slice(0,10)!==v)fail('방송일을 정확히 선택해 주세요.');return v;}
 function normalize(input){
  if(!Array.isArray(input)||!input.length||input.length>8)fail('부 구성을 1~8개로 지정해 주세요.');
  const used=new Set();
  return input.map(p=>{
   const prefix=clean(p.prefix).toUpperCase(),name=clean(p.name),start=Number(p.start);
   if(!/^[A-Z]$/.test(prefix)||used.has(prefix))fail('부별 번호 앞글자는 겹치지 않는 영문 한 글자로 정해 주세요.');used.add(prefix);
   if(!name||name.length>30||!Number.isInteger(start)||start<1||start>999)fail('부 이름과 시작번호(1~999)를 확인해 주세요.');
   if(!Array.isArray(p.vendors)||p.vendors.length>100)fail('부별 업체는 100곳까지 지정할 수 있어요.');
   const names=new Set();
   const vendors=p.vendors.map(v=>{const company=clean(v.company),count=Number(v.count);
    if(!company||company.length>80)fail('업체명을 80자 이내로 입력해 주세요.');
    if(names.has(company.toLowerCase()))fail(name+'에 같은 업체가 두 번 있어요. 개수로 조절해 주세요.');names.add(company.toLowerCase());
    if(!Number.isInteger(count)||count<0||count>100)fail('업체별 개수는 0~100개로 정해 주세요.');
    return {company,count};
   });const defaultCount=Number(p.defaultCount??2);if(!Number.isInteger(defaultCount)||defaultCount<0||defaultCount>100)fail('기본 개수는 0~100개로 정해 주세요.');return {name,prefix,start,defaultCount,vendors};
  });
 }
 function generate(input){
  const parts=normalize(input),labels=[];
  for(const p of parts){let n=p.start;const max=Math.max(0,...p.vendors.map(v=>v.count));
   for(let lap=0;lap<max;lap++)for(const v of p.vendors)if(v.count>lap){
    if(n>999||labels.length>=500)fail('번호는 999번까지, 한 저장본은 500장까지 만들 수 있어요.');
    labels.push({kind:'identification',format:'numbering',lot_number:p.prefix+String(n++).padStart(2,'0'),company:v.company,part:p.name,prefix:p.prefix});
   }
  }
  if(!labels.length)fail('출력할 업체와 개수를 입력해 주세요.');
  return {parts,labels};
 }
 function build(input){
  if(input.mode!=='split')return {mode:'parts',...generate(input.parts)};
  const setup=input.setup||{},source=normalize([{name:'업체 순서',prefix:'A',start:1,defaultCount:setup.defaultCount??4,vendors:setup.vendors}])[0];
  const all=generate([source]).labels,half=Math.ceil(all.length/2),first=all.slice(0,half),second=all.slice(half);
  const counted=rows=>source.vendors.map(v=>({company:v.company,count:rows.filter(l=>l.company===v.company).length}));
  const a={name:'1부',prefix:'A',start:1,vendors:counted(first)},b={name:'2부',prefix:'B',start:1,vendors:counted(second)};
  if(setup.reverse===true)b.vendors.reverse();
  const panels=setup.panels||[];if(!Array.isArray(panels)||panels.some(p=>p.prefix!=='E')||panels.length>1)fail('패널은 E 번호로 별도 구성해 주세요.');
  const result=generate([a,b,...panels]);
  return {mode:'split',setup:{vendors:source.vendors,defaultCount:source.defaultCount,reverse:setup.reverse===true,panels:result.parts.filter(p=>p.prefix==='E')},...result};
 }
 function importVendors(existing,candidates,count){
  if(!Number.isInteger(count)||count<0||count>100)fail('기본 개수는 0~100개로 정해 주세요.');
  const result=existing.map(v=>({...v})),seen=new Set(existing.map(v=>clean(v.company).toLowerCase()));
  for(const v of candidates){const company=clean(v.name);if(!company||seen.has(company.toLowerCase()))continue;
   if(company.length>80||result.length>=100)fail('업체는 100곳까지, 업체명은 80자 이내로 지정해 주세요.');
   result.push({company,count});seen.add(company.toLowerCase());
  }return result;
 }
 function labelHtml(l,escape){
  // Keep a conservative single-line fit even while print pages are display:none.
  const units=Array.from(l.company).reduce((sum,c)=>sum+(/[\u0000-\u007f]/.test(c)?.7:1),0),top=Math.min(5.5,86/Math.max(1,units)),side=Math.min(4.8,top);
  return `<div class="number-sheet"><div class="number-label"><div class="top-company fit" data-base="${top}cqw" style="font-size:${top}cqw">${escape(l.company)}</div><div class="top-code fit">${escape(l.lot_number)}</div><div class="fold-line"></div><div class="side-company fit" data-base="${side}cqw" style="font-size:${side}cqw">${escape(l.company)}</div><div class="side-code fit">${escape(l.lot_number)}</div></div></div>`;
 }
 const api={clean,date,normalize,generate,build,importVendors,labelHtml};if(typeof module==='object'&&module.exports)module.exports=api;root.CreoNumberLabels=api;
})(typeof window==='object'?window:globalThis);
