'use strict';
const crypto=require('node:crypto');
const {setImmediate:yieldTurn}=require('node:timers/promises');
const {cleanText}=require('./platform-core');
const UUID='[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}';
const PHOTO=new RegExp(`^/__entry_photo__/(${UUID})/(${UUID})/([a-f0-9]{64})/(full|thumb)\\.webp$`);
const ROOT='creo_v2::buyer-collection::record::';
const fail=()=>Object.assign(new Error('사진 등록 정보를 확인하지 못했어요. 다시 조회해 주세요.'),{status:503});
const photo=value=>{const match=typeof value==='string'&&PHOTO.exec(value);return match?{owner:match[1],id:match[2],key:match.slice(1,4).join('/'),variant:match[4]}:null;};
function createEntryPhotoAudit({repository,decodeBuyerRecord,now=Date.now,maxRows=50000,maxBytes=64000000}){
 let pending;
 async function run(){
  const started=now(),registry=new Map(),references=new Map(),external=new Map(),names=new Map(),invalid=new Set();
  let unreadableBuyerRecords=0,scanned=0,bytes=0;
  const retain=(value,kind)=>{
   if(typeof value==='string'){
    const ref=photo(value);if(ref){if(!references.has(ref.key))references.set(ref.key,new Set());references.get(ref.key).add(kind);}
    else if(value.startsWith('/__entry_photo__/'))invalid.add(value);
    return;
   }
   if(value&&typeof value==='object')for(const child of Object.values(value))retain(child,kind);
  };
  function registerState(row){
   const state=JSON.parse(row.value);
   if(state.schema!==1||row.key!=='vendor_entries_v1::'+state.ownerId||!['entries','parents','parentHistory','media'].every(k=>Array.isArray(state[k])))throw fail();
   const ids=new Map();
   for(const media of state.media){
    if(!media||typeof media.id!=='string')throw fail();ids.set(media.id,media);
    const full=photo(media.url),thumb=photo(media.thumbnailUrl);
    if(!full&&!thumb){if(String(media.url||'').startsWith('/__entry_photo__/')||String(media.thumbnailUrl||'').startsWith('/__entry_photo__/'))throw fail();external.set(state.ownerId+':'+media.id,state.ownerId);continue;}
    if(!full||!thumb||full.owner!==state.ownerId||full.id!==media.id||full.key!==thumb.key||full.variant!=='full'||thumb.variant!=='thumb'||![media.size,media.thumbnailSize].every(n=>Number.isSafeInteger(n)&&n>0))throw fail();
    const size=media.size+media.thumbnailSize,old=registry.get(full.key);
    if(!Number.isSafeInteger(size)||(old&&old.bytes!==size))throw fail();
    registry.set(full.key,{owner:state.ownerId,bytes:size});
   }
   const byId=(id,kind)=>{const media=ids.get(id);if(media){retain(media.url,kind);retain(media.thumbnailUrl,kind);}};
   for(const entry of state.entries){
    for(const facts of [entry,entry.submission,entry.approved].filter(Boolean)){
     for(const id of facts.photoIds||[])byId(id,'entries');retain(facts,'entries');
    }
   }
   for(const parent of [...state.parents,...state.parentHistory]){byId(parent.photoId,'parents');retain(parent,'parents');}
  }
  const relevant=key=>!key.startsWith('creo_v2::buyer-auth::')&&(!key.startsWith('creo_v2::buyer-collection::')||key.startsWith(ROOT));
  async function pass(consume){
   const hash=crypto.createHash('sha256');
   for(const prefix of ['vendor_directory_v1','vendor_entries_v1::','creo_v2::']){
    let after='';
    do{
     const page=await repository.scanRowsByPrefix(prefix,{after,limit:250});
     if(!Array.isArray(page.rows)||page.rows.length>250||(page.nextCursor&&page.nextCursor<=after))throw fail();
     for(const row of page.rows){
      scanned++;bytes+=Buffer.byteLength(row.value||'');if(scanned>maxRows||bytes>maxBytes||now()-started>30000)throw fail();
      if(!relevant(row.key))continue;
      hash.update(row.key+'\n'+row.value+'\n');if(!consume)continue;
      if(row.key==='vendor_directory_v1'){
       const directory=JSON.parse(row.value);if(directory.version!==1||!Array.isArray(directory.profiles))throw fail();
       for(const profile of directory.profiles)names.set(profile.id,cleanText(profile.info?.name||'업체명 미등록',100));
      }else if(row.key.startsWith('vendor_entries_v1::'))registerState(row);
      else if(row.key.startsWith(ROOT)){
       try{const record=decodeBuyerRecord(row);if(record.schema!==1||!record.item)throw fail();retain(record.item,'library');}
       catch{unreadableBuyerRecords++;}
      }else if(row.key.startsWith('creo_v2::'))retain(JSON.parse(row.value),'auction');
     }
     after=page.nextCursor;await yieldTurn();
    }while(after);
   }
   return hash.digest('hex');
  }
  // Two matching passes detect edits/deletions during the scan without taking
  // the auction mutation lock or writing/recovering any rows into the cache.
  const first=await pass(true),consistent=first===await pass(false);
  const missingMetadata=[...references.keys()].filter(key=>!registry.has(key)).length;
  const complete=consistent&&!missingMetadata&&!unreadableBuyerRecords&&!invalid.size;
  const totals={photoCount:registry.size,fileCount:registry.size*2,registeredBytes:0,linkedPhotoCount:0,linkedBytes:0,unlinkedPhotoCount:0,unlinkedBytes:0,externalPhotoCount:external.size};
  const uses=Object.fromEntries(['entries','parents','library','auction'].map(id=>[id,{id,photoCount:0,bytes:0}])),vendors=new Map();
  for(const [key,media]of registry){
   if(!vendors.has(media.owner))vendors.set(media.owner,{id:media.owner,name:names.get(media.owner)||'업체명 미등록',photoCount:0,registeredBytes:0,linkedPhotoCount:0,unlinkedPhotoCount:0});
   const vendor=vendors.get(media.owner),kinds=references.get(key)||new Set();
   if(!Number.isSafeInteger(totals.registeredBytes+media.bytes))throw fail();
   vendor.photoCount++;vendor.registeredBytes+=media.bytes;totals.registeredBytes+=media.bytes;
   const field=kinds.size?'linked':'unlinked';totals[field+'PhotoCount']++;totals[field+'Bytes']+=media.bytes;vendor[field+'PhotoCount']++;
   for(const kind of kinds){uses[kind].photoCount++;uses[kind].bytes+=media.bytes;}
  }
  if(!complete){totals.unlinkedPhotoCount=null;totals.unlinkedBytes=null;for(const vendor of vendors.values())vendor.unlinkedPhotoCount=null;}
  if(unreadableBuyerRecords){uses.library.photoCount=null;uses.library.bytes=null;}
  return {scope:'entry_photos',checkedAt:new Date(now()).toISOString(),referenceScanComplete:complete,consistent,objectVerification:false,deletionEnabled:false,
   totals,uses:Object.values(uses),vendors:[...vendors.values()].sort((a,b)=>b.registeredBytes-a.registeredBytes||a.id.localeCompare(b.id)),
   unresolved:{missingMetadata,unreadableBuyerRecords,invalidReferences:invalid.size}};
 }
 return {inspect(){if(!pending)pending=run().catch(error=>{throw error.status?error:fail()}).finally(()=>pending=null);return pending;}};
}
module.exports={createEntryPhotoAudit};
