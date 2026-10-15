'use strict';
const Numbering=require('./public/entry-numbering');

const HEADERS = Object.freeze(['개체번호','업체','성별','체중(g)','출생일','모프','비고','시작가(만원)','개체 사진','부 이름','부 사진','모 이름','모 사진','동기화','충돌 해결','연결 ID']);
const LISTING_HEADERS = Object.freeze(['출품 설정','개체명',...HEADERS.slice(1)]);
const FIELD_COUNT = 13;
const SEX = {M:'수컷',F:'암컷',PM:'수추',PF:'암추',male:'수컷',female:'암컷',unknown:'미구분'};
const SEX_CODE = {수컷:'M',암컷:'F',수추:'PM',암추:'PF',미구분:''};
const text = value => String(value ?? '').trim();
const same = (a,b) => JSON.stringify(a) === JSON.stringify(b);
const fail = message => { throw new Error(message); };
function date(value) {
    if (value === '' || value == null) return '';
    if (typeof value === 'number') return new Date(Math.round((value - 25569) * 86400000)).toISOString().slice(0,10);
    const s=text(value).replace(/\./g,'-').replace(/\/$/,'');
    const m=s.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})$/);
    if(!m) return s;
    return m[1]+'-'+m[2].padStart(2,'0')+'-'+m[3].padStart(2,'0');
}
function image(value) {
    const s=text(value);
    if(!s)return '';
    if(s.startsWith('/')&&!s.startsWith('//'))return 'https://creok.onrender.com'+s;
    try { const u=new URL(s); if(u.protocol==='https:'&&!u.username&&!u.password)return u.toString(); } catch {}
    fail('사진은 https 이미지 주소를 입력해 주세요.');
}
function normalize(values) {
    const row=Array.from({length:FIELD_COUNT},(_,i)=>text(values[i]));
    row[0]=Numbering.normalize(row[0]);
    for(const i of [3,7]) if(row[i]!=='' && Number.isFinite(Number(row[i].replaceAll(',','')))) row[i]=String(Number(row[i].replaceAll(',','')));
    row[4]=date(values[4]);
    return row;
}
function exported(item,vendors) {
    const a=item.attributes||{},traits=a.entry_traits||{}, checklist=Object.fromEntries(String(a.checklist||'').split('|').map(s=>{const i=s.indexOf(':');return [s.slice(0,i),s.slice(i+1)];}));
    const parent=role=>(a.parents||[]).find(p=>p.role===role)||{};
    const photo=p=>p.media?.[0]?.url||p.photoUrl||'';
    const values=normalize([item.name,vendors.find(v=>v.id===item.vendorId)?.name||item.vendorName,
        SEX[checklist.gender]||SEX[traits.sex]|| (checklist.gender ? checklist.gender : ''),
        checklist.weight??traits.weight??'',traits.hatchDate||checklist.birth||'',item.category||traits.morph||checklist.morph||'',item.note||'',
        Number(item.startPrice)>0?Number(item.startPrice)/10000:'',item.photoUrl||'',parent('sire').name||'',photo(parent('sire')),parent('dam').name||'',photo(parent('dam'))]);
    for(const i of [8,10,12])if(values[i])try{values[i]=image(values[i]);}catch{values[i]='';}
    return values;
}
function validated(values,vendors,entry=null) {
    const v=normalize(values);
    if(!Numbering.valid(v[0])&&(!entry||v[0]!==entry.code))fail('개체번호를 A01 형식으로 입력해 주세요.');
    const matches=vendors.filter(row=>row.active!==false&&row.name===v[1]);
    if(matches.length!==1)fail('등록된 업체를 선택해 주세요.');
    if(entry&&matches[0].id!==entry.vendorId)fail('업체가 제출한 개체의 소속 업체는 바꿀 수 없어요.');
    if(entry&&!['수컷','암컷','미구분'].includes(v[2]))fail('제출 개체는 수컷·암컷·미구분 중 선택해 주세요.');
    if(entry&&v[3]&&(!/^\d+(\.\d{1,2})?$/.test(v[3])||v[3].length>8))fail('제출 개체의 체중은 소수 둘째 자리까지 입력해 주세요.');
    if(v[2]&&!Object.hasOwn(SEX_CODE,v[2]))fail('성별을 선택해 주세요.');
    if(v[3]&&(!Number.isFinite(Number(v[3]))||Number(v[3])<=0||Number(v[3])>1000))fail('체중은 0보다 큰 숫자로 입력해 주세요.');
    if(v[4]&&(!/^\d{4}-\d{2}-\d{2}$/.test(v[4])||!Number.isFinite(Date.parse(v[4]))||new Date(v[4]).toISOString().slice(0,10)!==v[4]))fail('출생일을 YYYY-MM-DD 형식으로 입력해 주세요.');
    if(v[7]&&(!Number.isFinite(Number(v[7]))||Number(v[7])<0||Number(v[7])>100000))fail('시작가는 만원 단위 숫자로 입력해 주세요.');
    for(const [i,limit] of [[5,60],[6,1000],[9,100],[11,100]])if(v[i].length>limit)fail(HEADERS[i]+' 내용이 너무 길어요.');
    if(entry&&(v[6].length>600||v[9].length>40||v[11].length>40))fail('제출 개체는 비고 600자, 부모 이름 40자까지 입력할 수 있어요.');
    for(const i of [8,10,12]){v[i]=image(v[i]);if(v[i].length>600)fail('사진 주소가 너무 길어요.');}
    return {values:v,vendor:matches[0]};
}
function apply(item,values,vendor) {
    const before=exported(item,[vendor]),original=item._sheetOriginal||item,a=structuredClone(original.attributes||{});
    const changed=i=>before[i]!==values[i];
    const checklist=new Map(String(a.checklist||'').split('|').filter(Boolean).map(s=>{const i=s.indexOf(':');return [s.slice(0,i),s.slice(i+1)];}));
    const traits={...(a.entry_traits||{})};
    if(changed(2)){checklist.set('gender',SEX_CODE[values[2]]||'');traits.sex=({수컷:'male',암컷:'female',미구분:'unknown'})[values[2]]||values[2];}
    if(changed(3)){checklist.set('weight',values[3]);traits.weight=values[3];}
    if(changed(4)){traits.hatchDate=values[4];if(checklist.has('birth'))checklist.set('birth',values[4]);}
    if(changed(5)){checklist.set('morph',values[5].replaceAll('|',' '));traits.morph=values[5];}
    a.entry_traits=traits;a.checklist=[...checklist].map(([k,v])=>k+':'+v).join('|');a.displayNumber=values[0];
    for(const [role,ni,pi] of [['sire',9,10],['dam',11,12]]){
        if(!changed(ni)&&!changed(pi))continue;
        const parents=a.parents||[],old=parents.find(p=>p.role===role)||{role};
        const next={...old,name:values[ni]};
        if(changed(pi)){
            next.media=values[pi]?[{url:values[pi],thumbnailUrl:values[pi]}]:[];
            delete next.photoUrl;
        }
        a.parents=parents.filter(p=>p.role!==role).concat(next);
        a.parentPhotoOverrides=[...new Set([...(a.parentPhotoOverrides||[]),role])];
    }
    return {...original,name:values[0],vendorId:vendor.id,vendorName:vendor.name,category:values[5],note:values[6],startPrice:Math.round(Number(values[7]||0)*10000),photoUrl:changed(8)?values[8]:original.photoUrl||'',attributes:a};
}
function merge(base,web,sheet,choice='') {
    const values=[],conflicts=[];
    for(let i=0;i<FIELD_COUNT;i++){
        if(web[i]===sheet[i])values.push(web[i]);
        else if(web[i]===base[i])values.push(sheet[i]);
        else if(sheet[i]===base[i])values.push(web[i]);
        else if(choice==='시트 적용')values.push(sheet[i]);
        else if(choice==='웹 적용')values.push(web[i]);
        else {values.push(web[i]);conflicts.push(i);}
    }
    return {values,conflicts};
}
function locked(item,broadcast={}) {
    const bids=item.bidLog??item.bid_log??item.attributes?.bid_log;
    const hasBids=Array.isArray(bids)?bids.length>0:typeof bids==='string'&&bids.trim()!==''&&bids.trim()!=='[]';
    return item.status!=='waiting'||Number(item.soldPrice)>0||(broadcast.mode==='live'&&broadcast.activeItemId===item.id)||
        hasBids;
}
module.exports={HEADERS,LISTING_HEADERS,FIELD_COUNT,normalize,exported,validated,apply,merge,locked,same};
