(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.CreoWorkspaceItemFacts=api;})(typeof window==='object'?window:globalThis,function(){
 'use strict';
 const text=v=>String(v??''),roles=['sire','dam'],sexCode={male:'M',female:'F',unknown:'U',M:'M',F:'F',U:'U',PM:'PM',PF:'PF'},sexTrait={M:'male',F:'female',U:'unknown',PM:'PM',PF:'PF'};
 const checklist=record=>new Map(text(record?.attributes?.checklist).split('|').filter(Boolean).map(part=>{const i=part.indexOf(':');return i<0?[part,'']:[part.slice(0,i),part.slice(i+1)];}));
 const parent=(record,role)=>(record?.attributes?.parents||[]).find(p=>p.role===role||p.role===(role==='sire'?'부':'모'))||{role};
 function initial(record){const a=record?.attributes||{},t=a.entry_traits||{},c=checklist(record),sex=text(t.sex||a.gender||c.get('gender'));return {sex:sexCode[sex]||sex,weight:text(t.weight??a.weight??c.get('weight')??''),hatchDate:text(t.hatchDate||c.get('birth')),sireName:text(parent(record,'sire').name),damName:text(parent(record,'dam').name)};}
 function validate(values,record){const before=initial(record),changed=k=>text(values[k])!==before[k];
  if(changed('sex')&&!['','M','F','U','PM','PF'].includes(values.sex))return {field:'sex',message:'성별을 목록에서 선택해 주세요.'};
  if(changed('weight')&&values.weight!==''&&(!/^\d+(\.\d{1,2})?$/.test(values.weight)||Number(values.weight)<=0||Number(values.weight)>1000))return {field:'weight',message:'체중은 0보다 크고 1,000g 이하인 숫자를 소수 둘째 자리까지 입력해 주세요.'};
  if(changed('hatchDate')&&values.hatchDate&&(!/^\d{4}-\d{2}-\d{2}$/.test(values.hatchDate)||!Number.isFinite(Date.parse(values.hatchDate))||new Date(values.hatchDate).toISOString().slice(0,10)!==values.hatchDate||values.hatchDate>new Date(Date.now()+9*3600000).toISOString().slice(0,10)))return {field:'hatchDate',message:'실제 출생일을 연도·월·일 순서로 입력해 주세요. 미래 날짜는 사용할 수 없어요.'};
  for(const role of roles)if(changed(role+'Name')&&text(values[role+'Name']).length>80)return {field:role+'Name',message:'부모 이름은 80자까지 입력해 주세요.'};return null;
 }
 function apply(original,record,values){const before=initial(original),changed=k=>text(values[k])!==before[k],a={...record.attributes},c=checklist(original),t={...a.entry_traits};let traits=false;
  if(changed('sex')){c.set('gender',values.sex||'');t.sex=sexTrait[values.sex]||'';if('gender' in a)a.gender=values.sex;traits=true;}
  if(changed('weight')){c.set('weight',values.weight);t.weight=values.weight;if('weight' in a)a.weight=values.weight;traits=true;}
  if(changed('hatchDate')){t.hatchDate=values.hatchDate;if(c.has('birth'))c.set('birth',values.hatchDate);traits=true;}
  if(record.category!==text(original?.category)){t.morph=record.category;c.set('morph',record.category.replaceAll('|',' '));if('morph' in a)a.morph=record.category;traits=true;}
  if(traits){a.entry_traits=t;a.checklist=[...c].map(([k,v])=>k+':'+v).join('|');}
  let parentsChanged=false;for(const role of roles)if(changed(role+'Name')){const current=parent(original,role);a.parents=(a.parents||[]).filter(p=>p!==current&&p.role!==role&&p.role!==(role==='sire'?'부':'모')).concat({...current,role,name:values[role+'Name']});a.parentPhotoOverrides=[...new Set([...(a.parentPhotoOverrides||[]),role])];parentsChanged=true;}
  return traits||parentsChanged?{...record,attributes:a}:record;
 }
 function photos(record,role){const a=record?.attributes||{},p=role==='child'?record:parent(record,role),source=role==='child'?(a.media||p?.media||p?.photoUrl||a.photo_item):(p.media||p.photoUrl||a['photo_'+role]);return (Array.isArray(source)?source:source?[source]:[]).map(photo=>typeof photo==='string'?{url:photo}:structuredClone(photo));}
 function withPhotos(record,role,media){const a={...record.attributes};if(role==='child'){a.media=media;a.photo_item=media[0]?.url||'';return {...record,photoUrl:media[0]?.url||'',attributes:a};}const old=parent(record,role),next={...old,role,media};delete next.photoUrl;a.parents=(a.parents||[]).filter(p=>p!==old&&p.role!==role&&p.role!==(role==='sire'?'부':'모')).concat(next);a['photo_'+role]=media[0]?.url||'';a.parentPhotoOverrides=[...new Set([...(a.parentPhotoOverrides||[]),role])];return {...record,attributes:a};}
 return {initial,validate,apply,photos,withPhotos};
});
