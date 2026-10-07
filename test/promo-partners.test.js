'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {createPromoPartners,makeCatalog,publicCatalog,selection,safeLogoURL,curatedId}=require('../promo-partners');
const curated=require('../tools/promo-partners.json');
test('catalog uses live active membership and regions; expands approved split brands without contact data',()=>{
 const doze=curated[0],split=curated.find(v=>v.name==='도레미');
 const vendors=[{id:curatedId(doze),name:'Doze gecko',broadcastRegion:'대구·경북',phone:'secret',address:'private'},{id:curatedId(split),name:'도레미&셀렙',broadcastRegion:'부산·울산·경남'},{id:'inactive',name:'inactive',active:false},{id:'deleted',deletedAt:'now'},{id:'new',name:'새 업체',broadcastRegion:'경기'}];
 const c=makeCatalog(vendors),p=publicCatalog(c);assert.equal(p.items[0].name,'도즈게코');assert.equal(p.count,4);assert.equal(p.vendorCount,3);assert.deepEqual(p.items.filter(v=>v.region===4).map(v=>v.name),['도레미','셀렙']);assert.equal(p.regions[1].count,1);assert.doesNotMatch(JSON.stringify(p),/secret|private|logoUrl|fingerprint/);
 assert.notEqual(c.version,makeCatalog([...vendors,{id:'extra',name:'신규'}]).version);assert.notEqual(c.version,makeCatalog(vendors.slice(1)).version);
 assert.notEqual(c.version,makeCatalog(vendors.map(v=>({...v,broadcastRegion:'경기'}))).version);
});
test('selection and logo sources reject unsupported input',()=>{
 for(const body of [{mode:'none'},{mode:'regions',regions:[]},{mode:'regions',regions:[5]},{mode:'regions',regions:['0']}])assert.throws(()=>selection(body),{status:422});
 assert.deepEqual(selection({mode:'regions',regions:[3,0,3]}),{mode:'regions',regions:[0,3]});
 for(const url of ['http://localhost/a','https://evil.invalid/a','file:///a',curated[0].url.replace('vendor-logos/','private/')])assert.equal(safeLogoURL(url),'');assert.equal(safeLogoURL(curated[0].url),curated[0].url);
});
function fixture(){const rows=new Map(),assets=new Map();let vendors=[{id:'one',name:'업체 하나',broadcastRegion:'서울·인천'},{id:'two',name:'업체 둘',broadcastRegion:'경기'}],renders=0,failed=false;const options={repository:{getRecord:async(c,t,id)=>rows.get(id),upsertRecord:async(c,t,v)=>rows.set(v.id,v)},vendorsFor:async()=>vendors,storage:{put:async(c,n,b)=>{if(failed)throw Error('storage failed');assets.set(n,b);return{url:'https://assets.example/'+n};}},render:async g=>{renders++;return Buffer.from(JSON.stringify(g));},now:()=>123};return {options,rows,assets,get vendors(){return vendors},set vendors(v){vendors=v},get renders(){return renders},set failed(v){failed=v}};}
test('concurrent selection coalesces, restart reuses immutable images, changes create new snapshots',async()=>{
 const f=fixture(),service=createPromoPartners(f.options),catalog=await service.view(),body={mode:'all',catalogVersion:catalog.version};
 const [a,b]=await Promise.all([service.image(body),service.image(body)]);assert.equal(a.images[0].src,b.images[0].src);assert.equal(f.renders,1);assert.equal(a.images[0].columns,4);
 const restarted=createPromoPartners(f.options);assert.equal((await restarted.image(body)).images[0].src,a.images[0].src);assert.equal(f.renders,1);
 const r=await service.image({mode:'regions',regions:[1,0],catalogVersion:catalog.version});assert.equal(r.images.length,2);assert.equal(r.images[0].columns,3);assert.match(r.images[0].alt,/서울/);
 f.vendors=[...f.vendors,{id:'three',name:'새로운 업체',broadcastRegion:'경기'}];await assert.rejects(service.image(body),{status:409});const changed=await service.image({...body,catalogVersion:(await service.view()).version});assert.notEqual(changed.images[0].src,a.images[0].src);assert.ok(f.assets.has(a.images[0].src.split('/').pop()));
});
test('empty regions and failed storage fail closed, retry recovers without a false saved record',async()=>{
 const f=fixture(),s=createPromoPartners(f.options),catalogVersion=(await s.view()).version;
 await assert.rejects(s.image({mode:'regions',regions:[4],catalogVersion}),{status:422});assert.equal(f.renders,0);
 f.failed=true;await assert.rejects(s.image({mode:'all',catalogVersion}),/storage failed/);assert.equal(f.rows.size,0);f.failed=false;assert.equal((await s.image({mode:'all',catalogVersion})).count,2);assert.equal(f.rows.size,1);
});
test('partner API requires authenticated membership and CSRF and produces a usable PNG',async t=>{
 const {createFixture}=require('../tools/vendor-portal-preview.cjs');const files=new Map(),f=await createFixture({apiOptions:{vendorLogoStorage:{put:async(c,n,b)=>{files.set(n,b);return {url:'/api/broadcast-assets/'+c+'/'+n};}}}});t.after(f.close);
 const owner=await f.login('01000000001'),other=await f.login('01000000002'),id=(await f.post(owner,'register',{name:'참여업체',region:'서울·인천',phone:'01000000001'})).json().id;
 const get=await f.call(owner,'GET','/api/platform/promo-center?month=2026-09&company='+id);assert.equal(get.status,200,get.body);const body={action:'partner-image',mode:'all',catalogVersion:get.json().partners.version,company:id};
 assert.equal((await f.call(f.client(),'POST','/api/platform/promo-center',body)).status,401);assert.equal((await f.call(other,'POST','/api/platform/promo-center',body)).status,403);
 assert.equal((await f.call(owner,'POST','/api/platform/promo-center',body,{origin:'https://evil.invalid'})).status,403);assert.equal((await f.call(owner,'POST','/api/platform/promo-center',body,{'x-vendor-csrf':''})).status,403);
 const result=await f.call(owner,'POST','/api/platform/promo-center',body);assert.equal(result.status,200,result.body);assert.equal(result.json().count,1);assert.equal(files.size,1);const meta=await require('sharp')([...files.values()][0]).metadata();assert.equal(meta.format,'png');assert.equal(meta.width,1500);
 f.restart();const repeated=await f.call(owner,'POST','/api/platform/promo-center',body);assert.equal(repeated.json().images[0].src,result.json().images[0].src);assert.equal(files.size,1);
});
