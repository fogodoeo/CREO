'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os'),crypto=require('node:crypto'),{Readable}=require('node:stream');
const {SQLitePlatformRepository}=require('../sqlite-platform-repository'),{createPlatformApi}=require('../platform-api'),{normalizeChannel}=require('../platform-core');
const origin='https://buyer.test';
async function fixture(t,{enabled=true,photoResolver}={}){
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'creo-buyer-account-')),options={dbPath:path.join(dir,'isolated.sqlite'),durable:true,startWorker:false,adminSecret:'admin'};
 const config={enabled,origin,clientId:'fake-client',clientSecret:'fake-client-secret',appId:'7',secret:'isolated-account-secret-never-production'};
 let repository,api,clock=Date.now();const upstream=[];
 const users={alice:{sub:'111',phone_number:'+82 10-0000-0002',phone_number_verified:true},bob:{sub:'222',phone_number:'+82 10-0000-0003',phone_number_verified:true},samePhone:{sub:'333',phone_number:'+82 10-0000-0002',phone_number_verified:true},noPhone:{sub:'444'}};
 const fetchImpl=async(url,opts)=>{upstream.push({url,opts});let value;if(url.endsWith('/oauth/token')){const body=new URLSearchParams(opts.body);assert.equal(body.get('client_secret'),config.clientSecret);assert.match(body.get('code_verifier'),/^[\w-]{43}$/);value={access_token:'fake-'+body.get('code'),token_type:'bearer'};}else if(url.endsWith('/access_token_info'))value={app_id:7,expires_in:3600};else if(url.endsWith('/userinfo'))value=users[opts.headers.Authorization.replace('Bearer fake-','')];else throw Error('Unexpected external request');return new Response(JSON.stringify(value),{headers:{'Content-Type':'application/json'}});};
 function start(){repository=new SQLitePlatformRepository(options);api=createPlatformApi({repository,buyerAccountConfig:config,buyerAccountFetch:fetchImpl,buyerAccountNow:()=>clock,adminSessionSecret:'isolated-links-secret',...(photoResolver?{entryPhotoStorage:{resolve:reference=>photoResolver(reference,clock)}}:{}),logger:{error(){},warn(){}}});}start();
 await repository.saveCatalog(['alpha','beta'].map(id=>normalizeChannel({id,name:id==='alpha'?'첫 번째 경매':'지난 경매',status:id==='alpha'?'active':'archived',shippingDefaults:{pickupLocations:['가상 행사장']}})));
 for(const channel of ['alpha','beta']){
  await repository.upsertRecord(channel,'vendor',{id:'vendor',name:'가상 업체',phone:'01000000001',bankName:'가상은행',bankAccount:'00000',bankHolder:'가상 업체'});
  await repository.upsertRecord(channel,'item',{id:'first',name:'A01',lotNumber:1,status:'sold',soldPrice:50000,winnerName:'가상 구매자',winnerPhone:'01000000002',vendorId:'vendor',vendorName:'가상 업체'});
 }
 async function call(method,route,body,{jar={},admin=false,csrf='',requestOrigin=origin,site='',raw=false}={}){
  const req=Readable.from(body!==undefined?[Buffer.from(raw?body:JSON.stringify(body))]:[]);req.method=method;req.headers={host:'buyer.test',origin:requestOrigin,'sec-fetch-site':site,cookie:Object.entries(jar).map(([k,v])=>k+'='+v).join(';'),...(admin?{'x-creo-admin':'admin'}:{}),...(csrf?{'x-buyer-csrf':csrf}:{})};req.socket={remoteAddress:'127.0.0.1'};
  const res={writeHead(status,headers){this.status=status;this.headers=headers},end(body=''){this.body=String(body)},json(){return JSON.parse(this.body||'{}')}};
  await api.handle(req,res,new URL(origin+'/api/platform/'+route));
  for(const line of [res.headers?.['Set-Cookie']||[]].flat()){const [key,value]=line.split(';')[0].split('=');if(value)jar[key]=value;else delete jar[key];}return res;
 }
 async function login(name='alice',jar={}){const start=await call('POST','buyer-account/start','',{jar,raw:true});assert.equal(start.status,303,start.body);const authorize=new URL(start.headers.Location);const callback=await call('GET','buyer-account/callback?state='+authorize.searchParams.get('state')+'&code='+name,undefined,{jar});assert.equal(callback.status,303,callback.body);assert.doesNotMatch(callback.headers.Location,/error/);const session=(await call('GET','buyer-account/session',undefined,{jar})).json();assert.equal(session.authenticated,true);return {jar,session};}
 const link=(await call('POST','channels/alpha/buyer-shipping-link',{itemId:'first'},{admin:true})).json();
 t.after(()=>{repository.close();const target=path.resolve(dir);if(path.dirname(target)!==path.resolve(os.tmpdir())||!path.basename(target).startsWith('creo-buyer-account-'))throw Error('Unsafe cleanup');fs.rmSync(target,{recursive:true,force:true});});
 return {call,login,link,upstream,users,config,get repository(){return repository},advance:ms=>clock+=ms,restart(){repository.close();start()},write:(account,route,body)=>call('POST',route,body,{jar:account.jar,csrf:account.session.csrfToken}),get:(account,route)=>call('GET',route,undefined,{jar:account.jar})};
}
test('account feature is off until explicitly configured and never contacts Kakao implicitly',async t=>{
 const f=await fixture(t,{enabled:false});assert.deepEqual((await f.call('GET','buyer-account/session')).json(),{available:false,authenticated:false});assert.equal((await f.call('POST','buyer-account/start','',{raw:true})).status,503);assert.equal(f.upstream.length,0);
});

test('personal collection retains original business inquiry after resale and follows verified profile edits',async t=>{
 const f=await fixture(t),{createVendorDirectory}=require('../vendor-directory'),directory=createVendorDirectory(f.repository);
 const profile=await directory.enroll('alpha','vendor'),alice=await f.login(),bob=await f.login('bob');
 const connected=await f.write(alice,'buyer-collection/connect',{code:f.link.code,expectedRevision:0,requestId:'inquiry-connect'});assert.equal(connected.status,200,connected.body);const id=connected.json().id;
 assert.equal((await f.get(alice,'buyer-collection/'+id)).json().items[0].inquiry.phone,'01000000001');
 const item=await f.repository.getRecord('alpha','item','first');
 await f.repository.upsertRecord('alpha','vendor',{id:'replacement',name:'가상 업체',phone:'01099999999'});
 await f.repository.upsertRecord('alpha','item',{...item,buyerSaleId:'resale',vendorId:'replacement',winnerPhone:'01000000003',soldPrice:200000});
 const original=await directory.find('alpha','vendor');await directory.update('alpha',{...original,phone:'01077778888',inquiryPhone:'01011112222',kakaoUrl:'https://pf.kakao.com/_Original'},profile.revision);
 f.restart();let data=(await f.get(alice,'buyer-collection/'+id)).json();assert.equal(data.items[0].recordState,'changed');assert.deepEqual(data.items[0].inquiry,{name:'가상 업체',phone:'01011112222',kakaoUrl:'https://pf.kakao.com/_Original/chat'});assert.doesNotMatch(JSON.stringify(data),/99999999|77778888|directoryId|vendorSource/);
 assert.equal((await f.get(bob,'buyer-collection/'+id)).status,404);
 await f.repository.deleteRecord('alpha','item','first');data=(await f.get(alice,'buyer-collection/'+id)).json();assert.equal(data.items[0].recordState,'archived');assert.equal(data.items[0].inquiry.phone,'01011112222');
 const saved=await createVendorDirectory(f.repository).read();saved.profiles=[];await f.repository.upsertRows([{key:'vendor_directory_v1',value:JSON.stringify(saved)}]);
 data=(await f.get(alice,'buyer-collection/'+id)).json();assert.equal(data.items[0].inquiry,undefined,'removed original identity must not retarget the replacement business');
});

test('operator renewal restores expired trade access without disconnecting an existing personal collection',async t=>{
 const f=await fixture(t),alice=await f.login(),connected=await f.write(alice,'buyer-collection/connect',{code:f.link.code,expectedRevision:0,requestId:'connect-before-expiry'});assert.equal(connected.status,200,connected.body);const id=connected.json().id;
 const key='buyer_shipping_short_v2_'+f.link.code,row=(await f.repository.getRowsByKeys([key]))[0];await f.repository.upsertRows([{key,value:JSON.stringify({...JSON.parse(row.value),expiresAt:1})}]);
 assert.equal((await f.call('GET','buyer-shipping?code='+f.link.code)).status,401);assert.equal((await f.get(alice,'buyer-collection/'+id)).status,200);
 const renewed=await f.call('POST','channels/alpha/buyer-link-access',{itemId:'first',action:'renew',expectedRevision:0,requestId:'renew-for-existing-library'},{admin:true});assert.equal(renewed.status,200,renewed.body);assert.equal(renewed.json().code,f.link.code);
 f.restart();assert.equal((await f.get(alice,'buyer-collection/'+id)).status,200);assert.equal((await f.get(alice,'buyer-collection')).json().records[0].available,true);assert.equal((await f.call('GET','buyer-shipping?code='+f.link.code)).status,200);
 const rotated=await f.call('POST','channels/alpha/buyer-link-access',{itemId:'first',action:'rotate',expectedRevision:1,requestId:'replace-after-renewal'},{admin:true});assert.equal(rotated.status,200,rotated.body);assert.equal((await f.get(alice,'buyer-collection/'+id)).status,403,'address replacement intentionally revokes the original connection');
});
test('Kakao flow binds state to the browser, uses PKCE and rejects replay and forged origin',async t=>{
 const f=await fixture(t),jar={};assert.equal((await f.call('POST','buyer-account/start','',{jar,raw:true,requestOrigin:'https://attacker.test'})).status,403);
 const start=await f.call('POST','buyer-account/start','link='+f.link.code,{jar,raw:true}),url=new URL(start.headers.Location);assert.equal(url.origin,'https://kauth.kakao.com');assert.equal(url.searchParams.get('code_challenge_method'),'S256');assert.equal(url.searchParams.get('scope'),'openid,phone_number');
 assert.match(start.headers['Set-Cookie'][0],/HttpOnly; SameSite=Lax;.*Secure/);
 const route='buyer-account/callback?state='+url.searchParams.get('state')+'&code=alice';assert.equal((await f.call('GET',route)).status,401);assert.equal(f.upstream.length,0);
 const responses=await Promise.all([f.call('GET',route,undefined,{jar}),f.call('GET',route,undefined,{jar})]);assert.deepEqual(responses.map(r=>r.status).sort(),[303,401]);assert.equal(f.upstream.filter(r=>r.url.endsWith('/oauth/token')).length,1);
 const successful=responses.find(r=>r.status===303);assert.equal(successful.headers.Location,'/buyer-library.html#link='+f.link.code);assert.ok(f.upstream.every(r=>r.opts.redirect==='error'));
 const value=(await f.call('GET','buyer-account/session',undefined,{jar})).json();assert.equal(value.phoneLast4,'0002');assert.equal(value.accountId,undefined);assert.equal(value.phoneHash,undefined);
 const rows=f.repository.db.prepare("SELECT key,value FROM platform_kv WHERE key LIKE 'creo_v2::buyer-auth::%'").all();assert.ok(rows.length);assert.ok(rows.every(r=>!r.value.includes('fake-alice')&&!r.value.includes('phoneHash')));
});
test('session survives restart, rejects CSRF, logs out durably and expires',async t=>{
 const f=await fixture(t),account=await f.login();f.restart();assert.equal((await f.get(account,'buyer-account/session')).json().authenticated,true);
 assert.equal((await f.call('POST','buyer-account/logout',{}, {jar:account.jar})).status,403);
 assert.equal((await f.call('POST','buyer-account/logout',{}, {jar:account.jar,csrf:account.session.csrfToken,requestOrigin:'https://attacker.test'})).status,403);
 const old={...account.jar};assert.equal((await f.write(account,'buyer-account/logout',{})).status,200);f.restart();assert.equal((await f.call('GET','buyer-account/session',undefined,{jar:old})).json().authenticated,false);
 const later=await f.login();f.advance(8*86400000);assert.equal((await f.get(later,'buyer-account/session')).json().authenticated,false);
});
test('a verified account needs its own valid link and connecting never scans or imports other auctions',async t=>{
 const f=await fixture(t),alice=await f.login(),bob=await f.login('bob'),noPhone=await f.login('noPhone');
 assert.equal((await f.get(alice,'buyer-collection')).json().total,0);
 for(const account of [bob,noPhone])assert.equal((await f.write(account,'buyer-collection/preview',{code:f.link.code})).status,403);
 const preview=await f.write(alice,'buyer-collection/preview',{code:f.link.code});assert.equal(preview.status,200,preview.body);assert.equal(preview.json().itemCount,1);assert.equal(preview.json().channel.id,'alpha');
 const connected=await f.write(alice,'buyer-collection/connect',{code:f.link.code,expectedRevision:0,requestId:'connect-first'});assert.equal(connected.status,200,connected.body);
 const list=(await f.get(alice,'buyer-collection')).json();assert.equal(list.total,1);assert.equal(list.records[0].channelName,'첫 번째 경매');
 assert.equal((await f.get(bob,'buyer-collection/'+list.records[0].id)).status,404);
 const other=await f.login('samePhone');assert.equal((await f.write(other,'buyer-collection/connect',{code:f.link.code,expectedRevision:0,requestId:'other-account'})).status,409);
});
test('linking has one atomic effect across concurrent requests, storage failure and restart',async t=>{
 const f=await fixture(t),account=await f.login(),body={code:f.link.code,expectedRevision:0,requestId:'connect-atomic'},original=f.repository.upsertRows.bind(f.repository);
 const before=await f.repository.getRecord('alpha','item','first');
 f.repository.upsertRows=async rows=>original(rows.some(r=>r.key.startsWith('creo_v2::buyer-collection::'))?[...rows,{key:{invalid:true},value:'force rollback'}]:rows);
 assert.equal((await f.write(account,'buyer-collection/connect',body)).status,500);assert.deepEqual(await f.repository.getRecord('alpha','item','first'),before);assert.equal((await f.get(account,'buyer-collection')).json().total,0);
 assert.equal(f.repository.db.prepare("SELECT count(*) AS n FROM platform_kv WHERE key LIKE 'creo_v2::buyer-collection::%'").get().n,0,'failed connection also rolls back snapshots and owners');
 f.repository.upsertRows=original;const responses=await Promise.all([f.write(account,'buyer-collection/connect',body),f.write(account,'buyer-collection/connect',body)]);assert.deepEqual(responses.map(r=>r.status),[200,200]);assert.deepEqual(responses.map(r=>r.json().duplicate).sort(),[false,true]);
 f.restart();assert.equal((await f.write(account,'buyer-collection/connect',body)).json().duplicate,true);assert.equal((await f.get(account,'buyer-collection')).json().revision,1);
});
test('collection remains read-only after the short link expires and does not include later wins automatically',async t=>{
 const f=await fixture(t),account=await f.login(),connected=await f.write(account,'buyer-collection/connect',{code:f.link.code,expectedRevision:0,requestId:'connect-expiry'});assert.equal(connected.status,200,connected.body);const id=connected.json().id;
 const item=await f.repository.getRecord('alpha','item','first');await f.repository.upsertRecord('alpha','item',{...item,name:'A99',attributes:{morph:'최신 정보'}});
 await f.repository.upsertRecord('alpha','item',{...item,id:'second',name:'A02',buyerSaleId:'different-sale'});
 let detail=await f.get(account,'buyer-collection/'+id);assert.equal(detail.status,200,detail.body);assert.equal(detail.json().readOnly,true);assert.equal(detail.json().items.length,1);assert.equal(detail.json().items[0].name,'A01','saved lot identity does not change when the live row is renamed');assert.equal(detail.json().vendors,undefined);
 const row=(await f.repository.getRowsByKeys(['buyer_shipping_short_v2_'+f.link.code]))[0],stored=JSON.parse(row.value);await f.repository.upsertRows([{key:row.key,value:JSON.stringify({...stored,expiresAt:1})}]);
 assert.equal((await f.call('GET','buyer-shipping?code='+f.link.code)).status,401);assert.equal((await f.get(account,'buyer-collection/'+id)).status,200);
 const catalog=await f.repository.getCatalog();await f.repository.saveCatalog(catalog.channels.map(c=>({...c,status:'archived'})));assert.equal((await f.get(account,'buyer-collection/'+id)).json().channel.status,'archived');
 assert.equal((await f.write(account,'buyer-collection/'+id,{paymentStatus:'paid'})).status,404);
});
test('revoking or rotating a trade link also suspends its library grant until explicit reconnection',async t=>{
 const f=await fixture(t),account=await f.login(),connected=await f.write(account,'buyer-collection/connect',{code:f.link.code,expectedRevision:0,requestId:'connect-revocation'}),id=connected.json().id;
 const changed=await f.call('POST','channels/alpha/buyer-link-access',{itemId:'first',action:'rotate',expectedRevision:0,requestId:'rotate-linked-trade'},{admin:true});assert.equal(changed.status,200,changed.body);
 assert.equal((await f.get(account,'buyer-collection/'+id)).status,403);assert.equal((await f.get(account,'buyer-collection')).json().records[0].available,false);
 const restored=await f.write(account,'buyer-collection/connect',{code:changed.json().code,expectedRevision:1,requestId:'reconnect-rotated'});assert.equal(restored.status,200,restored.body);assert.equal((await f.get(account,'buyer-collection/'+id)).status,200);
});
test('a reopened lot cannot inherit a previous collection grant even with the same buyer and price',async t=>{
 const f=await fixture(t),account=await f.login(),connected=await f.write(account,'buyer-collection/connect',{code:f.link.code,expectedRevision:0,requestId:'connect-old-sale'}),id=connected.json().id;
 const item=await f.repository.getRecord('alpha','item','first');
 const reopened=await f.call('PUT','channels/alpha/auction-transition',{itemId:'first',status:'live',mode:'live'},{admin:true});assert.equal(reopened.status,200,reopened.body);
 const resold=await f.call('PUT','channels/alpha/auction-transition',{itemId:'first',status:'sold',mode:'sold',item:{winnerName:item.winnerName,winnerPhone:item.winnerPhone,soldPrice:item.soldPrice}},{admin:true});assert.equal(resold.status,200,resold.body);
 assert.notEqual((await f.repository.getRecord('alpha','item','first')).buyerSaleId,item.buyerSaleId);
 const old=await f.get(account,'buyer-collection/'+id);assert.equal(old.status,200,old.body);assert.equal(old.json().items.length,1);assert.equal(old.json().items[0].recordState,'changed');
 assert.equal(old.json().items[0].soldAmount,50000);
 const again=await f.write(account,'buyer-collection/connect',{code:f.link.code,expectedRevision:1,requestId:'connect-new-sale'});assert.equal(again.status,200,again.body);
 const records=(await f.get(account,'buyer-collection/'+id)).json().items;assert.equal(records.length,2);assert.equal(new Set(records.map(i=>i.id)).size,2,'same item ID can represent two explicitly connected sales');assert.deepEqual(records.map(i=>i.recordState),['changed','current']);
});
test('no-referrer login forms use same-origin Fetch Metadata without accepting opaque foreign origins',async t=>{
 const f=await fixture(t);
 assert.equal((await f.call('POST','buyer-account/start','',{raw:true,requestOrigin:'null',site:'same-origin'})).status,303);
 for(const site of ['cross-site','same-site',''])assert.equal((await f.call('POST','buyer-account/start','',{raw:true,requestOrigin:'null',site})).status,403);
});
test('encrypted ownership records cannot be transplanted into another account key',async t=>{
 const f=await fixture(t),alice=await f.login(),bob=await f.login('bob');assert.equal((await f.write(alice,'buyer-collection/connect',{code:f.link.code,expectedRevision:0,requestId:'connect-before-tamper'})).status,200);
 const accountKey=sub=>'creo_v2::buyer-collection::account::'+crypto.createHmac('sha256',crypto.createHash('sha256').update(f.config.secret).digest()).update('kakao:'+f.config.clientId+':'+sub).digest('base64url');
 const saved=(await f.repository.getRowsByKeys([accountKey('111')]))[0];await f.repository.upsertRows([{key:accountKey('222'),value:saved.value}]);
 assert.equal((await f.get(bob,'buyer-collection')).status,503);assert.equal((await f.get(alice,'buyer-collection')).json().total,1);
});
test('saved records outlive deleted auction rows without exposing another sale or buyer',async t=>{
 const f=await fixture(t),alice=await f.login(),bob=await f.login('bob');
 const connected=await f.write(alice,'buyer-collection/connect',{code:f.link.code,expectedRevision:0,requestId:'save-old-auction'}),id=connected.json().id;
 const item=await f.repository.getRecord('alpha','item','first');
 await f.repository.upsertRecord('alpha','item',{...item,buyerSaleId:'another-sale',name:'PRIVATE-NEW-LOT',soldPrice:900000,winnerName:'PRIVATE-NEW-BUYER',winnerPhone:'01000000003',attributes:{media:[{url:'/private-new-owner.jpg'}],bidHistory:['PRIVATE-BID'],note:'PRIVATE-NOTE'}});
 const newLink=(await f.call('POST','channels/alpha/buyer-shipping-link',{itemId:'first'},{admin:true})).json();
 assert.equal((await f.write(bob,'buyer-collection/connect',{code:newLink.code,expectedRevision:0,requestId:'save-bobs-auction'})).status,200);
 let detail=await f.get(alice,'buyer-collection/'+id);assert.equal(detail.status,200,detail.body);assert.equal(detail.json().items[0].name,'A01');assert.equal(detail.json().items[0].soldAmount,50000);assert.doesNotMatch(detail.body,/PRIVATE|900000|01000000003|winner|attributes/);
 await f.repository.deleteRecord('alpha','item','first');await f.repository.deleteRecord('alpha','vendor','vendor');
 const catalog=await f.repository.getCatalog();await f.repository.saveCatalog(catalog.channels.filter(c=>c.id!=='alpha'));f.restart();
 detail=await f.get(alice,'buyer-collection/'+id);assert.equal(detail.status,200,detail.body);assert.equal(detail.json().channel.name,'첫 번째 경매');assert.equal(detail.json().channel.status,'archived');assert.equal(detail.json().items[0].recordState,'archived');assert.equal(detail.json().items[0].vendorName,'가상 업체');
});
test('archive keeps durable child references and follows only the originally selected parent',async t=>{
 const f=await fixture(t,{photoResolver:(ref,now)=>'/api/platform/entry-photo/example?photo='+encodeURIComponent(ref)+'&at='+now}),account=await f.login();
 const ownerId='11111111-1111-4111-8111-111111111111',sireId='original-sire',child='/__entry_photo__/original-child',parentPhoto='/__entry_photo__/original-parent',nextPhoto='/__entry_photo__/updated-parent';
 const state={schema:1,version:1,ownerId,entries:[],parents:[{id:sireId,sex:'male',name:'처음 부',morph:'릴리',photoId:'father-photo'}],parentHistory:[],media:[{id:'father-photo',url:parentPhoto}],requests:[]};
 await f.repository.upsertRows([{key:'vendor_entries_v1::'+ownerId,value:JSON.stringify(state)}]);
 const item=await f.repository.getRecord('alpha','item','first');await f.repository.upsertRecord('alpha','item',{...item,attributes:{secret:'NEVER-STORE',bidLog:['NEVER-STORE'],media:[{url:child,thumbnailUrl:child+'/thumb'}],parents:[{id:sireId,role:'sire',name:'처음 부',morph:'릴리',media:[{url:parentPhoto}]}],vendor_entry:{ownerId,entryId:'old-entry'}}});
 const connected=await f.write(account,'buyer-collection/connect',{code:f.link.code,expectedRevision:0,requestId:'save-private-photos'}),id=connected.json().id;assert.equal(connected.status,200,connected.body);
 let detail=(await f.get(account,'buyer-collection/'+id)).json();assert.match(detail.items[0].media[0].url,/original-child/);const oldUrl=detail.items[0].media[0].url;
 state.parents[0].name='수정된 부';state.parents[0].photoId='new-parent-photo';state.media.push({id:'new-parent-photo',url:nextPhoto});await f.repository.upsertRows([{key:'vendor_entries_v1::'+ownerId,value:JSON.stringify(state)}]);
 await f.repository.upsertRecord('alpha','item',{...await f.repository.getRecord('alpha','item','first'),attributes:{media:[{url:'/wrong-new-child.jpg'}],parents:[{id:'wrong-new-parent',role:'sire',name:'다음 경매 부모'}]}});
 f.advance(3600001);detail=(await f.get(account,'buyer-collection/'+id)).json();assert.notEqual(detail.items[0].media[0].url,oldUrl);assert.match(detail.items[0].media[0].url,/original-child/);assert.equal(detail.items[0].parents[0].name,'수정된 부');assert.match(detail.items[0].parents[0].media[0].url,/updated-parent/);assert.doesNotMatch(JSON.stringify(detail),/wrong-new|다음 경매|NEVER-STORE|parentSource|ownerId/);
 const rows=f.repository.db.prepare("SELECT key,value FROM platform_kv WHERE key LIKE 'creo_v2::buyer-collection::record::%'").all();const auth=require('../buyer-account-auth').createBuyerAccountAuth({repository:f.repository,config:f.config,hashPhone:()=>''});const record=await auth.read(rows[0].key);assert.equal(record.item.media[0].url,child);assert.doesNotMatch(JSON.stringify(record),/NEVER-STORE|winnerPhone|bidLog|signature=|expires=/);
 state.parents=[];await f.repository.upsertRows([{key:'vendor_entries_v1::'+ownerId,value:JSON.stringify(state)}]);detail=(await f.get(account,'buyer-collection/'+id)).json();assert.equal(detail.items[0].parents[0].name,'처음 부');assert.equal(detail.items[0].parentInfoState,'snapshot');
});
test('link revocation during archive photo resolution denies the entire response',async t=>{
 let duringResolve;const f=await fixture(t,{photoResolver:async ref=>{if(duringResolve){const run=duringResolve;duringResolve=null;await run();}return ref}}),account=await f.login();
 await f.repository.upsertRecord('alpha','item',{...await f.repository.getRecord('alpha','item','first'),photoUrl:'/__entry_photo__/test'});
 const connected=await f.write(account,'buyer-collection/connect',{code:f.link.code,expectedRevision:0,requestId:'archive-before-revoke'});
 duringResolve=async()=>{const response=await f.call('POST','channels/alpha/buyer-link-access',{itemId:'first',action:'revoke',expectedRevision:0,requestId:'revoke-during-read'},{admin:true});assert.equal(response.status,200,response.body);};
 const detail=await f.get(account,'buyer-collection/'+connected.json().id);assert.equal(detail.status,403);assert.equal(detail.json().items,undefined);
});
test('an old but valid login can read its library and must reauthenticate before connecting',async t=>{
 const f=await fixture(t),account=await f.login();f.advance(16*60000);
 assert.equal((await f.get(account,'buyer-account/session')).json().authenticated,true);
 assert.equal((await f.get(account,'buyer-collection')).status,200);
 assert.equal((await f.write(account,'buyer-collection/preview',{code:f.link.code})).status,401);
 assert.equal((await f.write(account,'buyer-collection/connect',{code:f.link.code,expectedRevision:0,requestId:'stale-login-connect'})).status,401);
 const fresh=await f.login('alice',account.jar);assert.equal((await f.write(fresh,'buyer-collection/connect',{code:f.link.code,expectedRevision:0,requestId:'fresh-login-connect'})).status,200);
});
