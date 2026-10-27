'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {createPromoPartners,makeCatalog,publicCatalog,selection,safeLogoURL,logoBytes,curatedId}=require('../promo-partners');
const curated=require('../tools/promo-partners.json');
test('catalog uses live active membership and regions; expands approved split brands without contact data',()=>{
 const doze=curated[0],split=curated.find(v=>v.name==='도레미');
 const vendors=[{id:curatedId(doze),name:'Doze gecko',broadcastRegion:'대구·경북',phone:'secret',address:'private'},{id:curatedId(split),name:'도레미&셀렙',broadcastRegion:'부산·울산·경남'},{id:'inactive',name:'inactive',active:false},{id:'deleted',deletedAt:'now'},{id:'new',name:'새 업체',broadcastRegion:'경기'}];
 const c=makeCatalog(vendors),p=publicCatalog(c);assert.equal(p.items[0].name,'도즈게코');assert.equal(p.count,7);assert.equal(p.vendorCount,6);assert.deepEqual(p.items.filter(v=>v.region===4).map(v=>v.name),['도레미','셀렙']);assert.equal(p.regions[1].count,1);assert.doesNotMatch(JSON.stringify(p),/secret|private|logoUrl|fingerprint/);
 assert.notEqual(c.version,makeCatalog([...vendors,{id:'extra',name:'신규'}]).version);assert.notEqual(c.version,makeCatalog(vendors.slice(1)).version);
 assert.notEqual(c.version,makeCatalog(vendors.map(v=>({...v,broadcastRegion:'경기'}))).version);
});
test('separate Celeb registration replaces the legacy split and preserves each registered region and logo',()=>{
 const doremi=curated.find(v=>v.name==='도레미'),celeb=curated.find(v=>v.name==='셀렙');
 const proxy='/api/media/public/broadcast-assets/vendor-logos/'+doremi.url.split('/').pop();
 const ownLogo='/api/broadcast-assets/vendor-logos/nv-celeb-current.webp';
 const vendors=[{id:curatedId(doremi),name:'도레미',broadcastRegion:'부산·울산·경남',logoUrl:proxy},{id:celeb.vendorId,name:'셀렙',broadcastRegion:'경기',logoUrl:ownLogo}];
 const c=makeCatalog(vendors),one=c.items.filter(v=>v.name==='셀렙');
 assert.equal(one.length,1);assert.equal(one[0].vendorId,celeb.vendorId);assert.equal(one[0].region,1);assert.deepEqual(one[0].logo,{url:ownLogo});
 const first=c.items.find(v=>v.name==='도레미');assert.equal(first.logo.file,doremi.file);assert.deepEqual(first.logo.crop,doremi.crop);
 for(const state of [{active:false},{deletedAt:'now'}])assert.equal(makeCatalog([vendors[0],{...vendors[1],...state}]).items.some(v=>v.name==='셀렙'),false);
 assert.equal(makeCatalog([vendors[0]]).items.filter(v=>v.name==='셀렙').length,1);
 assert.equal(makeCatalog([...vendors].reverse()).version,c.version);
});
test('Forest Lizard uses its confirmed Busan promotion fallback and preserved original logo without overwriting a registered region',()=>{
 const approved=curated.find(v=>v.name==='숲속도마뱀 더숲부산');
 const vendor={id:approved.vendorId,name:approved.name,logoUrl:'https://cdninstagram.com/expiring-logo.jpg'};
 const entry=makeCatalog([vendor]).items.find(v=>v.vendorId===vendor.id);
 assert.equal(entry.region,4);assert.equal(entry.logo.file,approved.file);assert.equal(vendor.broadcastRegion,undefined);
 assert.equal(makeCatalog([{...vendor,broadcastRegion:'경기'}]).items.find(v=>v.vendorId===vendor.id).region,1);
 assert.equal(makeCatalog([{...vendor,active:false}]).items.some(v=>v.vendorId===vendor.id),false);
});
test('owned logo paths resolve through asset storage and reject unrelated paths or arbitrary hosts',async()=>{
 const name='nv-celeb-current.webp',relative='/api/broadcast-assets/vendor-logos/'+name,proxy='/api/media/public/broadcast-assets/vendor-logos/'+name;
 const bytes=Buffer.from('logo bytes'),calls=[];
 const storage={view:async(channel,file)=>{calls.push([channel,file]);return 'https://signed-storage.example/'+file;}};
 const fetcher=async(url,options)=>{assert.equal(url,'https://signed-storage.example/'+name);assert.equal(options.redirect,'error');return new Response(bytes);};
 for(const url of [relative,proxy]){assert.equal(safeLogoURL(url),url);assert.deepEqual(await logoBytes({url},fetcher,storage),bytes);}
 assert.deepEqual(calls,[['vendor-logos',name],['vendor-logos',name]]);
 const local=require('node:path').join(__dirname,'../public/promo-assets/partner-logos/18.png'),fs=require('node:fs');
 assert.deepEqual(await logoBytes({url:relative},()=>{throw Error('must not fetch local logo')},{localFile:async()=>({target:local,stat:fs.statSync(local)})}),fs.readFileSync(local));
 await assert.rejects(logoBytes({url:relative},fetcher,{localFile:async()=>({target:local,stat:{size:4*1024*1024}})}),/logo size/);
 await assert.rejects(logoBytes({url:relative},fetcher,{}),/storage unavailable/);
 const remote={remote:true,supabaseUrl:'https://configured-store.example',bucket:'broadcast-assets'};
 await logoBytes({url:proxy},async url=>{assert.equal(url,'https://configured-store.example/storage/v1/object/public/broadcast-assets/vendor-logos/'+name);return new Response(bytes);},remote);
 for(const url of ['/api/broadcast-assets/private/secret.webp','/api/broadcast-assets/vendor-logos/../secret.webp','//evil.invalid/a.webp',relative+'?redirect=https://evil.invalid','https://evil.invalid'+relative]){
  assert.equal(safeLogoURL(url),'');assert.equal(await logoBytes({url},()=>{throw Error('must not fetch rejected logo')},storage),null);
 }
});
test('promotion-only Instagram logos appear in Gyeongbuk without creating or duplicating registrations',()=>{
 const vendors=[],c=makeCatalog(vendors);assert.equal(vendors.length,0);
 assert.deepEqual(c.items.map(v=>[v.name,v.region,!!v.logo]),[['크레빠',3,true],['마이리틀드래곤',3,true],['크레오',3,true]]);
 const registered=makeCatalog([{id:'real-crebar',name:'크레빠',broadcastRegion:'경기'}]);
 assert.equal(registered.items.filter(v=>v.name==='크레빠').length,1);
 const one=registered.items.find(v=>v.name==='크레빠');assert.equal(one.vendorId,'real-crebar');assert.equal(one.region,1);assert.ok(one.logo);
 for(const state of [{active:false},{deletedAt:'now'}])assert.equal(makeCatalog([{id:'real-crebar',name:'크레빠',...state}]).items.some(v=>v.name==='크레빠'),false);
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
 f.failed=true;await assert.rejects(s.image({mode:'all',catalogVersion}),/storage failed/);assert.equal(f.rows.size,0);f.failed=false;assert.equal((await s.image({mode:'all',catalogVersion})).count,5);assert.equal(f.rows.size,1);
});
test('partner API requires authenticated membership and CSRF and produces a usable PNG',async t=>{
 const {createFixture}=require('../tools/vendor-portal-preview.cjs');const files=new Map(),f=await createFixture({apiOptions:{vendorLogoStorage:{put:async(c,n,b)=>{files.set(n,b);return {url:'/api/broadcast-assets/'+c+'/'+n};}}}});t.after(f.close);
 const owner=await f.login('01000000001'),other=await f.login('01000000002'),id=(await f.post(owner,'register',{name:'참여업체',region:'서울·인천',phone:'01000000001'})).json().id;
 const get=await f.call(owner,'GET','/api/platform/promo-center?month=2026-09&company='+id);assert.equal(get.status,200,get.body);const body={action:'partner-image',mode:'all',catalogVersion:get.json().partners.version,company:id};
 assert.equal((await f.call(f.client(),'POST','/api/platform/promo-center',body)).status,401);assert.equal((await f.call(other,'POST','/api/platform/promo-center',body)).status,403);
 assert.equal((await f.call(owner,'POST','/api/platform/promo-center',body,{origin:'https://evil.invalid'})).status,403);assert.equal((await f.call(owner,'POST','/api/platform/promo-center',body,{'x-vendor-csrf':''})).status,403);
 const result=await f.call(owner,'POST','/api/platform/promo-center',body);assert.equal(result.status,200,result.body);assert.equal(result.json().count,4);assert.equal(files.size,1);const meta=await require('sharp')([...files.values()][0]).metadata();assert.equal(meta.format,'png');assert.equal(meta.width,1500);
 f.restart();const repeated=await f.call(owner,'POST','/api/platform/promo-center',body);assert.equal(repeated.json().images[0].src,result.json().images[0].src);assert.equal(files.size,1);
});
