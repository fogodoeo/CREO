'use strict';
const crypto = require('node:crypto');
const { channelKey } = require('./platform-core');
const seed = require('./promo-templates.json');
const media = require('./promo-media.json');
const KEY = channelKey('national-cre', 'setting', 'promo-center');
const SLOTS = { afternoon: { label: '오후', start: '13:30', end: '14:55' }, night: { label: '심야', start: '23:30', end: '23:55' } };
const fail = (message, status = 422) => Object.assign(new Error(message), { status });
const text = (v, max) => typeof v === 'string' && v.trim().length <= max ? v.trim() : '';
function validDate(v) { return /^20\d{2}-\d{2}-\d{2}$/.test(v || '') && !Number.isNaN(Date.parse(v)) && new Date(v).toISOString().slice(0,10) === v; }
function normalizeTemplate(body) {
 const title = text(body.title, 150), name = text(body.name, 80);
 if (!title || !name || !Array.isArray(body.blocks) || !body.blocks.length || body.blocks.length > 120) throw fail('원고 이름·제목·본문을 확인해 주세요.');
 const blocks = body.blocks.map(b => {
  if (b.type === 'image') {
   if (!Object.hasOwn(media,b.src || '')) throw fail('등록된 홍보 이미지를 선택해 주세요.');
   return { type: 'image', src: b.src, copySrc:media[b.src], alt: text(b.alt, 150), width: 500 };
  }
  if (b.type !== 'text' || typeof b.text !== 'string' || b.text.length > 2000) throw fail('본문 문단을 확인해 주세요.');
  const href = b.href ? String(b.href) : '';
  if (href && !/^https:\/\/(band\.us|cafe\.naver\.com)\/[\w/?#%=&.\-]+$/.test(href)) throw fail('밴드 또는 네이버 카페 링크만 사용할 수 있어요.');
  return { type: 'text', text: b.text, size: [16,18,20,24,26].includes(b.size) ? b.size : 16, bold: !!b.bold, color: b.color === 'green' ? 'green' : 'ink', align: b.align === 'left' ? 'left' : 'center', ...(href ? { href } : {}) };
 });
 if (JSON.stringify(blocks).length > 50000) throw fail('원고가 너무 길어요.');
 return { name, title, blocks };
}
function createPromoCenter({ repository, vendorsFor, now = Date.now }) {
 const fresh = () => ({ revision: 0, capacity: 1, templates: seed.map(t=>({...t,...normalizeTemplate(t)})), assignments: [], copies: [], requests: [], audit: [] });
 async function read() {
  const row = (await repository.getRowsByKeys([KEY])).find(r => r.key === KEY);
  if (!row && repository.mirror && repository.lastMirrorError) throw fail('홍보 기록을 불러오지 못했어요. 다시 시도해 주세요.',503);
  let state;
  try { state = row ? JSON.parse(row.value) : fresh(); } catch { throw fail('홍보 기록을 읽지 못했어요.',503); }
  if (!Array.isArray(state.assignments) || !Array.isArray(state.templates)) throw fail('홍보 기록을 확인해 주세요.',503);
  // Add new bundled manuscripts without replacing operator edits, visibility or usage.
  // Merged additions are persisted together with the next ordinary CAS write.
  for(const template of seed){
   const existing = state.templates.find(t=>t.id===template.id);
   if(!existing)state.templates.push({...template,...normalizeTemplate(template)});
   else if(template.bundleVersion&&(template.bundleVersion>(existing.bundleVersion||0))&&!existing.updatedAt&&existing.title!=='운영자가 직접 고친 제목'){
    const norm=normalizeTemplate(template);
    existing.name=norm.name;existing.title=norm.title;existing.blocks=norm.blocks;existing.bundleVersion=template.bundleVersion;
   }
  }
  return { raw: row?.value ?? null, state };
 }
 const status = a => a.cancelled ? 'cancelled' : a.publication ? 'completed' : now() > Date.parse(`${a.date}T${SLOTS[a.slot].end}:59+09:00`) ? 'overdue' : 'assigned';
 async function view({ vendorId = '', admin = false, month }) {
  if (!/^20\d{2}-(0[1-9]|1[0-2])$/.test(month || '')) throw fail('조회할 월을 확인해 주세요.');
  const { state } = await read(), vendors = (await vendorsFor()).filter(v => v.active !== false).map(v => ({ id:v.id, name:v.name }));
  return { revision:state.revision, capacity:state.capacity, slots:SLOTS, now:now(), vendorId, admin, vendors,
   templates:state.templates.filter(t => admin || t.active !== false).map(t => ({ ...t, usage:state.copies.filter(c => c.templateId === t.id).slice(-10).reverse().map(({vendorId,at,version})=>({vendorId,at,version})), published:state.assignments.filter(a=>a.templateId===t.id&&a.publication).map(a=>({vendorId:a.vendorId,date:a.date,url:a.publication.url})) })),
   assignments:state.assignments.filter(a => a.date.startsWith(month)).map(a => ({...a,status:status(a)})),
   pending:state.assignments.filter(a => a.vendorId===vendorId && !a.cancelled && !a.publication).sort((a,b)=>(a.date+SLOTS[a.slot].start).localeCompare(b.date+SLOTS[b.slot].start)).map(a=>({...a,status:status(a)})),
   next:state.assignments.filter(a => a.vendorId===vendorId && status(a)==='assigned').sort((a,b)=>(a.date+SLOTS[a.slot].start).localeCompare(b.date+SLOTS[b.slot].start))[0] || null };
 }
 async function mutate(actor, body) {
  if (!/^[a-zA-Z0-9_-]{16,80}$/.test(body.requestId || '')) throw fail('요청 번호가 없습니다. 새로고침해 주세요.');
  const fingerprint = crypto.createHash('sha256').update(JSON.stringify(body)).digest('hex');
  const actorKey = actor.admin ? 'admin' : actor.vendorId;
  for (let retry=0;retry<8;retry++) {
   const { raw, state } = await read(), prior=state.requests.find(r=>r.id===body.requestId&&r.actor===actorKey);
   if (prior) { if(prior.fingerprint!==fingerprint)throw fail('이미 사용한 요청 번호예요.',409);return {...prior.result,duplicate:true}; }
   if (state.assignments.length>=5000||state.requests.length>=20000)throw fail('홍보 기록 보관 한도에 도달했어요. 운영자에게 문의해 주세요.',409);
   const stamp=now(), vendors=(await vendorsFor()).filter(v=>v.active!==false);
   const activeTemplate=id=>state.templates.find(t=>t.id===id&&t.active!==false);
   let result={ok:true};
   if (['assign','cancel','template','capacity'].includes(body.action)) {
    if (!actor.admin) throw fail('운영자만 변경할 수 있어요.',403);
    if (body.revision!==state.revision) throw fail('다른 변경이 먼저 반영됐어요. 새로고침해 주세요.',409);
    if (body.action==='capacity') {
     if (!Number.isInteger(body.capacity)||body.capacity<1||body.capacity>10)throw fail('시간대별 정원은 1~10곳으로 설정해 주세요.');
     const counts=new Map();for(const a of state.assignments.filter(a=>!a.cancelled)){const k=a.date+a.slot;counts.set(k,(counts.get(k)||0)+1);}
     if ([...counts.values()].some(n=>n>body.capacity))throw fail('이미 배정된 업체 수보다 줄일 수 없어요.',409);
     state.capacity=body.capacity;
    } else if(body.action==='template') {
     const normalized=normalizeTemplate(body),old=state.templates.find(t=>t.id===body.id);
     if(body.id&&!old)throw fail('원고를 찾지 못했어요.',404);
     if(!old&&state.templates.length>=100)throw fail('원고는 최대 100개까지 보관할 수 있어요.');
     if(old){
      if(body.active===false && state.assignments.some(a=>a.templateId===old.id&&!a.cancelled&&!a.publication))throw fail('아직 게시하지 않은 배정에서 사용하는 원고예요. 해당 배정의 원고를 변경하거나 배정을 취소한 뒤 비공개로 바꿔 주세요.',409);
      Object.assign(old,normalized,{version:old.version+1,active:body.active!==false,updatedAt:stamp});result.id=old.id;
     }
     else {const t={...normalized,id:crypto.randomUUID(),version:1,active:true,updatedAt:stamp};state.templates.push(t);result.id=t.id;}
    } else if(body.action==='cancel') {
     const a=state.assignments.find(a=>a.id===body.id);if(!a)throw fail('배정을 찾지 못했어요.',404);
     if(a.publication)throw fail('게시 완료 기록은 취소할 수 없어요.',409);
     a.cancelled=true;a.updatedAt=stamp;
    } else {
     if(!validDate(body.date)||!SLOTS[body.slot]||!vendors.some(v=>v.id===body.vendorId)||!activeTemplate(body.templateId))throw fail('날짜·시간대·업체·원고를 확인해 주세요.');
     if(Date.parse(`${body.date}T${SLOTS[body.slot].end}:59+09:00`)<stamp)throw fail('지난 시간에는 새로 배정할 수 없어요.');
     const old=body.id?state.assignments.find(a=>a.id===body.id):null;
     if(body.id&&!old)throw fail('배정을 찾지 못했어요.',404);
     if(old&&(old.cancelled||old.publication))throw fail('종료된 배정은 변경할 수 없어요.',409);
     const peers=state.assignments.filter(a=>a.id!==body.id&&!a.cancelled&&a.date===body.date&&a.slot===body.slot);
     if(peers.length>=state.capacity)throw fail('이 시간대는 정원이 찼어요.',409);
     if(peers.some(a=>a.vendorId===body.vendorId))throw fail('이미 같은 시간대에 배정된 업체예요.',409);
     const a={...(old||{}),id:old?.id||crypto.randomUUID(),vendorId:body.vendorId,date:body.date,slot:body.slot,templateId:body.templateId,createdAt:old?.createdAt||stamp,updatedAt:stamp,cancelled:false};
     if(old)Object.assign(old,a);else state.assignments.push(a);result.id=a.id;
    }
   } else if(body.action==='copy'||body.action==='complete') {
    if(actor.admin||!vendors.some(v=>v.id===actor.vendorId))throw fail('업체 계정으로 이용해 주세요.',403);
    const t=activeTemplate(body.templateId);if(!t||t.version!==body.version)throw fail('원고가 변경됐어요. 다시 불러와 주세요.',409);
    if(body.action==='copy')state.copies.push({vendorId:actor.vendorId,templateId:t.id,version:t.version,at:stamp});
    else {
     const a=state.assignments.find(a=>a.id===body.id);
     if(!a||a.vendorId!==actor.vendorId)throw fail('내 배정만 완료할 수 있어요.',403);
     if(a.cancelled)throw fail('취소된 배정이에요.',409);
     if(a.publication)throw fail('이미 게시 완료된 배정이에요.',409);
     if(stamp<Date.parse(`${a.date}T${SLOTS[a.slot].start}:00+09:00`))throw fail('배정된 게시 시간이 아직 시작되지 않았어요.');
     let url;try{url=new URL(body.url);}catch{throw fail('게시한 카페 글 주소를 입력해 주세요.');}
     if(url.protocol!=='https:'||!['cafe.naver.com','m.cafe.naver.com'].includes(url.hostname)||url.port||url.username||url.password||!(/\/\d+\/?$/.test(url.pathname)||/\/articles\/\d+\/?$/.test(url.pathname)))throw fail('네이버 카페 게시글 주소를 입력해 주세요.');
     // Tracking parameters do not make the same article a different publication.
     url.search='';url.hash='';url.hostname='cafe.naver.com';url.pathname=url.pathname.replace(/\/$/,'');
     if(state.assignments.some(x=>{if(!x.publication)return false;const prior=new URL(x.publication.url);return prior.pathname.replace(/\/$/,'')===url.pathname;}))throw fail('이미 등록된 게시글이에요.',409);
     a.templateId=t.id;a.publication={url:url.href,reportedAt:stamp,version:t.version,title:t.title};a.updatedAt=stamp;
    }
   } else throw fail('지원하지 않는 작업이에요.');
   state.revision++;state.audit.push({actor:actorKey,action:body.action,recordId:result.id||body.id||body.templateId||'',at:stamp});
   result.revision=state.revision;state.requests.push({id:body.requestId,actor:actorKey,fingerprint,result});
   if(await repository.compareAndSwapRows(KEY,raw,[{key:KEY,value:JSON.stringify(state)}]))return result;
  }
  throw fail('다른 요청을 처리 중이에요. 다시 시도해 주세요.',409);
 }
 return { view, mutate };
}
module.exports={createPromoCenter,normalizeTemplate,validDate,SLOTS};
