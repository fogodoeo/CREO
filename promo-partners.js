'use strict';
const crypto=require('node:crypto'),fs=require('node:fs'),path=require('node:path');
const National=require('./national-broadcast'),curated=require('./tools/promo-partners.json');
const ASSETS=path.join(__dirname,'public/promo-assets/partner-logos');
const VERSION='partners-layout-5-current-brand-membership';
const fail=(message,status=422)=>Object.assign(Error(message),{status});
const hash=value=>crypto.createHash('sha256').update(value).digest('hex');
const curatedId=v=>v.vendorId||v.url?.match(/vendor-logos\/((?:va|nv)-[a-f0-9]+)/)?.[1];
const approved=curated.map(v=>({...v,vendorId:curatedId(v),fingerprint:hash(fs.readFileSync(path.join(ASSETS,v.file)))}));
const origins=new Set(approved.filter(v=>v.url).map(v=>new URL(v.url).origin));
if(process.env.SUPABASE_URL)origins.add(new URL(process.env.SUPABASE_URL).origin);
function storedLogoName(value){return String(value||'').match(/^\/api\/(?:broadcast-assets|media\/public\/broadcast-assets)\/vendor-logos\/([\w-][\w.-]*\.(?:webp|png|jpe?g|gif))$/i)?.[1]||'';}
function safeLogoURL(value){if(storedLogoName(value))return value;try{const u=new URL(value);return u.protocol==='https:'&&!u.username&&!u.password&&!u.port&&origins.has(u.origin)&&/^\/storage\/v1\/object\/public\/broadcast-assets\/vendor-logos\/[\w.-]+$/.test(u.pathname)?u.href:'';}catch{return '';}}
function sameLogo(a,b){const key=value=>{const safe=safeLogoURL(value);return safe?(storedLogoName(safe)||new URL(safe).pathname.split('/').pop()):'';};return !!key(a)&&key(a)===key(b);}
function makeCatalog(vendors){
 const items=[],seen=new Set();
 // Approved promotion-only brands do not create login, booking or settlement records.
 // A later registration (including an inactive one) owns its membership and region.
 const sameName=(a,b)=>String(a||'').trim().normalize('NFKC').toLowerCase()===String(b||'').trim().normalize('NFKC').toLowerCase();
 const supplements=approved.filter(x=>x.displayOnly&&!vendors.some(v=>v.id===x.vendorId||sameName(v.name,x.name)))
  .map(x=>({id:x.vendorId,name:x.name,broadcastRegion:x.region}));
 for(const v of [...vendors,...supplements]){
  if(!v.id||seen.has(v.id)||v.active===false||v.deletedAt)continue;
  seen.add(v.id);
  // Once a split brand has its own record, even an inactive one, the old
  // combined registration must no longer create an extra copy of that brand.
  const overrides=approved.filter(x=>x.vendorId===v.id||(x.legacyVendorId===v.id&&!vendors.some(v=>v.id===x.vendorId))||(x.displayOnly&&sameName(v.name,x.name)));
  for(const x of overrides.length?overrides:[null]){
   const region=National.regionForVendor(v)??National.regionForVendor({broadcastRegion:x?.region});
   const useLocal=x&&(!v.logoUrl||!x.url||sameLogo(v.logoUrl,x.url)||overrides.length>1);
   const logo=useLocal?{file:x.file,crop:x.crop,circle:x.circle,squareBackground:x.squareBackground,fingerprint:x.fingerprint}:safeLogoURL(v.logoUrl)?{url:safeLogoURL(v.logoUrl)}:null;
   items.push({key:v.id+(overrides.length>1?':'+x.name:''),vendorId:v.id,name:x?.name||String(v.name||'').slice(0,80),region:Number.isInteger(region)?region:null,logo});
  }
 }
 // Keep the approved display order, including 도즈게코 first. New registrations follow.
 const rank=new Map(approved.map((x,i)=>[x.vendorId+':'+x.name,i]));
 items.sort((a,b)=>(rank.get(a.vendorId+':'+a.name)??999)-(rank.get(b.vendorId+':'+b.name)??999)||a.key.localeCompare(b.key));
 return {version:hash(JSON.stringify([VERSION,items])),items};
}
function publicCatalog(catalog){
 const items=catalog.items.map(({key,name,region,logo})=>({key,name,region,hasLogo:!!logo}));
 return {version:catalog.version,items,count:items.length,vendorCount:new Set(catalog.items.map(v=>v.vendorId)).size,regions:National.REGIONS.map((name,id)=>({id,name,count:items.filter(v=>v.region===id).length})),unassigned:items.filter(v=>v.region===null).length};
}
function selection(body){
 if(!['all','regions'].includes(body.mode))throw fail('업체 소개 방식을 선택해 주세요.');
 if(body.mode==='all')return {mode:'all',regions:[]};
 if(!Array.isArray(body.regions)||!body.regions.length||body.regions.length>5||body.regions.some(r=>!Number.isInteger(r)||r<0||r>4))throw fail('소개할 지역을 한 곳 이상 선택해 주세요.');
 return {mode:'regions',regions:[...new Set(body.regions)].sort((a,b)=>a-b)};
}
async function logoBytes(logo,fetcher=fetch,storage){
 if(!logo)return null;
 if(logo.file)return fs.readFileSync(path.join(ASSETS,logo.file));
 let url=safeLogoURL(logo.url);if(!url)return null;
 const storedName=storedLogoName(url);
 if(storedName){
  // Resolve through the configured asset store, never fetch an arbitrary host
  // or loop back through the application's own HTTP server.
  url=await storage?.view?.('vendor-logos',storedName);
  if(!url){
   const local=await storage?.localFile?.('vendor-logos',storedName);
   if(local){if(local.stat.size>3*1024*1024)throw Error('logo size');return fs.readFileSync(local.target);}
   if(storage?.remote)url=`${storage.supabaseUrl}/storage/v1/object/public/${encodeURIComponent(storage.bucket)}/vendor-logos/${encodeURIComponent(storedName)}`;
   else throw Error('logo storage unavailable');
  }
 }
 const response=await fetcher(url,{redirect:'error',signal:AbortSignal.timeout(7000)});
 if(!response.ok)throw Error('logo fetch');
 if(Number(response.headers.get('content-length')||0)>3*1024*1024)throw Error('logo size');
 const chunks=[];let size=0;
 for await(const chunk of response.body){size+=chunk.length;if(size>3*1024*1024)throw Error('logo size');chunks.push(chunk);}
 return Buffer.concat(chunks);
}
function createPromoPartners({repository,vendorsFor,storage,render=require('./promo-partner-render').render,now=Date.now}){
 const pending=new Map();
 const catalog=async()=>makeCatalog(await vendorsFor());
 async function image(body){
  const chosen=selection(body),current=await catalog();
  if(body.catalogVersion!==current.version)throw fail('업체 명단이 변경됐어요. 최신 명단을 불러온 뒤 다시 선택해 주세요.',409);
  if(current.items.length>100)throw fail('참여업체가 많아요. 운영자에게 이미지 구성을 요청해 주세요.');
  const groups=chosen.mode==='all'?[{key:'all',title:'전국크레자랑과 함께하는 업체들',items:current.items,columns:4}]:chosen.regions.map(id=>({key:'region-'+id,title:National.REGIONS[id]+' 참여업체',items:current.items.filter(v=>v.region===id),columns:3}));
  const populated=groups.filter(g=>g.items.length);
  if(!populated.length)throw fail('선택한 지역에 등록된 참여업체가 없습니다. 다른 지역을 선택해 주세요.');
  if(!storage)throw fail('업체 이미지 저장소에 연결하지 못했어요. 잠시 후 다시 시도해 주세요.',503);
  const images=[];
  for(const group of populated){
   const id='promo-partners-'+hash(JSON.stringify([VERSION,group]));
   let stored=await repository.getRecord('national-cre','setting',id);
   if(!stored){
    if(!pending.has(id)){
     const task=(async()=>{
      const png=await render(group,{logoBytes:logo=>logoBytes(logo,fetch,storage)});
      const saved=await storage.put('national-cre',id+'-'+crypto.randomUUID()+'.png',png,'image/png');
      const value={id,url:saved.url,title:group.title,names:group.items.map(v=>v.name),count:group.items.length,columns:group.columns,createdAt:now()};
      await repository.upsertRecord('national-cre','setting',value);
      return value;
     })();
     pending.set(id,task);task.finally(()=>pending.delete(id)).catch(()=>{});
    }
    stored=await pending.get(id);
   }
   images.push({src:stored.url,alt:stored.title+' · '+stored.names.join(', '),count:stored.count,columns:stored.columns});
  }
  return {catalogVersion:current.version,mode:chosen.mode,regions:chosen.regions,images,count:populated.reduce((sum,g)=>sum+g.items.length,0),vendorCount:new Set(populated.flatMap(g=>g.items.map(v=>v.vendorId))).size};
 }
 return {view:async()=>publicCatalog(await catalog()),image};
}
module.exports={createPromoPartners,makeCatalog,publicCatalog,selection,safeLogoURL,logoBytes,curatedId};
