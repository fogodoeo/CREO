'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os'),crypto=require('node:crypto'),{Readable}=require('node:stream');
const {SQLitePlatformRepository}=require('../sqlite-platform-repository'),{createPlatformApi}=require('../platform-api'),{normalizeChannel}=require('../platform-core');
const {CheckoutNotificationService}=require('../checkout-notifications');
async function expireLink(f,code=f.link.code){
 const key='buyer_shipping_short_v2_'+code,row=(await f.repository.getRowsByKeys([key]))[0],stored=JSON.parse(row.value),payload=JSON.parse(Buffer.from(stored.token.split('.')[1],'base64url'));
 const unsigned='bs2.'+Buffer.from(JSON.stringify({...payload,issuedAt:Date.now()-15*86400000,expiresAt:Date.now()-86400000})).toString('base64url');
 const token=unsigned+'.'+crypto.createHmac('sha256',f.secret).update(unsigned).digest('base64url');await f.repository.upsertRows([{key,value:JSON.stringify({token,expiresAt:Date.now()-86400000})}]);return token;
}
async function fixture(t){
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'creo-link-access-')),secret='isolated-buyer-link-test-secret';
 const options={dbPath:path.join(dir,'isolated.sqlite'),durable:true,startWorker:false,adminSecret:'secret'};
 let repository=new SQLitePlatformRepository(options),api;const start=()=>api=createPlatformApi({repository,adminSessionSecret:secret,logger:{error(){},warn(){}}});
 await repository.saveCatalog(['alpha','beta'].map(id=>normalizeChannel({id,name:id,status:'active',shippingDefaults:{pickupLocations:['가상 행사장']}})));
 for(const ch of ['alpha','beta']){
  await repository.upsertRecord(ch,'vendor',{id:'vendor',name:'가상 업체',phone:'01000000001',bankName:'가상은행',bankAccount:'0000000',bankHolder:'예시 업체'});
  await repository.upsertRecord(ch,'item',{id:'item',name:'A01',status:'sold',soldPrice:30000,winnerName:'가상 구매자',winnerPhone:'01000000002',vendorId:'vendor',vendorName:'가상 업체'});
 }
 start();
 const call=async(method,route,body,admin=false)=>{
  const req=Readable.from(body?[Buffer.from(JSON.stringify(body))]:[]);req.method=method;req.headers={host:'test.invalid',...(admin?{'x-creo-admin':'secret'}:{})};
  const res={writeHead(status){this.status=status},end(body=''){this.body=String(body)},json(){return JSON.parse(this.body||'{}')}};
  await api.handle(req,res,new URL('https://test.invalid/api/platform/'+route));return res;
 };
 const issue=async(channel='alpha')=>{const r=await call('POST',`channels/${channel}/buyer-shipping-link`,{itemId:'item'},true);assert.equal(r.status,200,r.body);return r.json();};
 const link=await issue();
 const saved=await call('POST','buyer-shipping',{code:link.code,destinationId:'pickup-1',payments:[{vendorKey:'vendor',method:'bank_transfer'}],requestId:'initial-isolated-save'});assert.equal(saved.status,200,saved.body);
 const access=(body,channel='alpha',admin=true)=>call(body?'POST':'GET',`channels/${channel}/buyer-link-access${body?'':'?itemId=item'}`,body?{itemId:'item',...body}:undefined,admin);
 t.after(()=>{repository.close();const target=path.resolve(dir);if(path.dirname(target)!==path.resolve(os.tmpdir())||!path.basename(target).startsWith('creo-link-access-'))throw Error('Invalid cleanup target');fs.rmSync(target,{recursive:true,force:true});});
 return {secret,call,issue,access,link,get repository(){return repository},get api(){return api},restart(){repository.close();repository=new SQLitePlatformRepository(options);start();}};
}
test('rotating one buyer link invalidates its old short and signed credentials without changing sold or payment records',async t=>{
 const f=await fixture(t),other=await f.issue('beta'),oldRows=await f.repository.getRowsByKeys(['buyer_shipping_short_v2_'+f.link.code]),oldToken=JSON.parse(oldRows[0].value).token;
 const before=JSON.stringify(await f.repository.listRecords('alpha','shipment'));
 assert.equal((await f.issue()).code,f.link.code,'routine reminders keep their current address');
 const initial=(await f.access()).json();assert.equal(initial.revision,0);assert.equal(initial.status,'active');
 const command={action:'rotate',expectedRevision:0,requestId:'rotate-first-request'};
 const responses=await Promise.all([f.access(command),f.access(command)]);
 assert.deepEqual(responses.map(r=>r.status),[200,200]);assert.deepEqual(responses.map(r=>r.json().duplicate).sort(),[false,true]);
 const changed=responses[0].json();assert.notEqual(changed.code,f.link.code);
 for(const credential of [{code:f.link.code},{token:oldToken}]){
  assert.equal((await f.call('GET','buyer-shipping?'+new URLSearchParams(credential))).status,401);
  assert.equal((await f.call('POST','buyer-shipping',{...credential,requestId:'invalid-save-old',destinationId:'pickup-1'})).status,401);
  assert.equal((await f.call('POST','buyer-shipping/report-payment',{...credential,vendorKey:'vendor',requestId:'invalid-report-old'})).status,401);
 }
 assert.equal((await f.call('GET','buyer-shipping?code='+other.code)).status,200);
 f.restart();assert.equal((await f.call('GET','buyer-shipping?code='+changed.code)).status,200);
 assert.equal(JSON.stringify(await f.repository.listRecords('alpha','shipment')),before);
 assert.equal((await f.issue()).code,changed.code);
 const previous=await f.access(command);assert.equal(previous.json().duplicate,true);
 assert.equal((await f.access({...command,action:'revoke'})).status,409);
});

test('expired link renewal preserves address and generation with one durable effect, while expired signed tokens stay invalid',async t=>{
 const f=await fixture(t),oldToken=await expireLink(f),before=JSON.stringify(await f.repository.listRecords('alpha','shipment'));
 assert.equal((await f.access()).json().status,'expired');assert.equal((await f.call('GET','buyer-shipping?code='+f.link.code)).status,401);
 const command={action:'renew',expectedRevision:0,requestId:'renew-expired-link'};
 const responses=await Promise.all([f.access(command),f.access(command)]);for(const r of responses)assert.equal(r.status,200,r.body);assert.deepEqual(responses.map(r=>r.json().duplicate).sort(),[false,true]);
 assert.equal(responses[0].json().code,f.link.code);assert.equal(responses[0].json().history[0].action,'renew');assert.ok(new Date(responses[0].json().expiresAt).getTime()>Date.now()+13*86400000);
 f.restart();assert.equal((await f.call('GET','buyer-shipping?code='+f.link.code)).status,200);assert.equal((await f.call('GET','buyer-shipping?token='+encodeURIComponent(oldToken))).status,401);
 assert.equal((await f.access(command)).json().duplicate,true);assert.equal((await f.access({...command,requestId:'renew-active-link',expectedRevision:1})).status,409);
 assert.equal(JSON.stringify(await f.repository.listRecords('alpha','shipment')),before);assert.equal((await f.repository.listRecords('alpha','notification')).length,0);
});

test('renewal rejects foreign, revoked and unissued requests; failed writes and competing rotation cannot partially renew',async t=>{
 const f=await fixture(t);await expireLink(f);const command={action:'renew',expectedRevision:0,requestId:'renew-failed-write'};
 assert.equal((await f.access(command,'alpha',false)).status,401);assert.equal((await f.access(command,'beta')).status,409);
 const upsert=f.repository.upsertRows.bind(f.repository);let broken=true;f.repository.upsertRows=async rows=>{if(broken&&rows.some(r=>r.key.startsWith('buyer_link_access_v1::'))){broken=false;throw Error('isolated renewal failure')}return upsert(rows);};
 assert.equal((await f.access(command)).status,500);assert.equal((await f.access()).json().revision,0);assert.equal((await f.call('GET','buyer-shipping?code='+f.link.code)).status,401);
 const results=await Promise.all([f.access(command),f.access({...command,action:'rotate',requestId:'competing-rotation'})]);assert.deepEqual(results.map(r=>r.status).sort(),[200,409]);
 const current=(await f.access()).json();assert.equal(current.revision,1);
 const revoked=await f.access({action:'revoke',expectedRevision:1,requestId:'revoke-renewed'});assert.equal(revoked.status,200,revoked.body);
 assert.equal((await f.access({action:'renew',expectedRevision:2,requestId:'must-not-revive'})).status,409);assert.equal((await f.access()).json().status,'revoked');
 assert.equal((await f.access(command)).status,409,'retry after a newer action cannot resurrect an old link');
});

test('archived link renewal uses frozen winner evidence and keeps checkout read-only',async t=>{
 const f=await fixture(t);await expireLink(f);const catalog=await f.repository.getCatalog();await f.repository.saveCatalog(catalog.channels.map(c=>c.id==='alpha'?{...c,status:'archived'}:c));
 const response=await f.access({action:'renew',expectedRevision:0,requestId:'renew-archive-only'});assert.equal(response.status,200,response.body);assert.equal(response.json().code,f.link.code);
 const buyer=await f.call('GET','buyer-shipping?code='+f.link.code);assert.equal(buyer.json().readOnly,true);
 assert.equal((await f.call('POST','buyer-shipping',{code:f.link.code,destinationId:'pickup-1',requestId:'archive-must-not-write'})).status,401);
 const item=await f.repository.getRecord('alpha','item','item');await f.repository.upsertRecord('alpha','item',{...item,winnerPhone:''});await expireLink(f);
 assert.equal((await f.access({action:'renew',expectedRevision:1,requestId:'missing-frozen-owner'})).status,422);
});
test('revoked links stay revoked through reminders and restart while operators can read and confirm payment',async t=>{
 const f=await fixture(t),revoked=await f.access({action:'revoke',expectedRevision:0,requestId:'revoke-first-request'});
 assert.equal(revoked.status,200,revoked.body);assert.equal(revoked.json().url,'');
 f.restart();assert.equal((await f.call('GET','buyer-shipping?code='+f.link.code)).status,401);
 assert.equal((await f.call('POST','channels/alpha/buyer-shipping-link',{itemId:'item'},true)).status,409);
 const preview=await f.call('GET','channels/alpha/buyer-checkout-preview?itemId=item',null,true);assert.equal(preview.status,200,preview.body);
 const confirmed=await f.call('POST','channels/alpha/buyer-shipping-payment',{itemId:'item',requestId:'confirm-while-revoked',expectedAmount:30000},true);assert.equal(confirmed.status,200,confirmed.body);
 assert.equal(confirmed.json().vendors[0].payment.status,'paid');
 const newLink=await f.access({action:'rotate',expectedRevision:1,requestId:'restore-new-address'});assert.equal(newLink.status,200,newLink.body);
 assert.notEqual(newLink.json().code,f.link.code);assert.equal((await f.call('GET','buyer-shipping?code='+newLink.json().code)).status,200);
 assert.equal((await f.access({action:'revoke',expectedRevision:0,requestId:'revoke-first-request'})).status,409,'old retried changes cannot overwrite a later generation');
});
test('link changes reject foreign callers, stale concurrent actions and failed atomic writes',async t=>{
 const f=await fixture(t),body={action:'rotate',expectedRevision:0,requestId:'first-concurrent-change'};
 assert.equal((await f.access(undefined,'alpha',false)).status,401);
 assert.equal((await f.access(body,'alpha',false)).status,401);
 assert.equal((await f.call('GET','channels/alpha/buyer-checkout-preview?itemId=item')).status,401);
 assert.equal((await f.access({...body,requestId:'bad'})).status,422);
 const upsert=f.repository.upsertRows.bind(f.repository);let fail=true;
 f.repository.upsertRows=async rows=>{if(fail&&rows.some(row=>row.key.startsWith('buyer_link_access_v1::'))){fail=false;throw Error('isolated write failure')}return upsert(rows)};
 assert.equal((await f.access(body)).status,500);assert.equal((await f.access()).json().revision,0);
 assert.equal((await f.call('GET','buyer-shipping?code='+f.link.code)).status,200);
 const results=await Promise.all([f.access(body),f.access({...body,requestId:'second-concurrent-change'})]);assert.deepEqual(results.map(r=>r.status).sort(),[200,409]);
 assert.equal((await f.access()).json().revision,1);assert.equal((await f.access(undefined,'beta')).json().revision,0);
});
test('archived buyer link replacement remains read-only and signed invalid expiry is rejected',async t=>{
 const f=await fixture(t),catalog=await f.repository.getCatalog();await f.repository.saveCatalog(catalog.channels.map(c=>c.id==='alpha'?{...c,status:'archived'}:c));
 const result=await f.access({action:'rotate',expectedRevision:0,requestId:'archived-link-replace'});assert.equal(result.status,200,result.body);
 const code=result.json().code,payload=(await f.call('GET','buyer-shipping?code='+code)).json();assert.equal(payload.readOnly,true);
 assert.equal((await f.call('POST','buyer-shipping',{code,destinationId:'pickup-1',requestId:'archive-cannot-write'})).status,401);
 const row=(await f.repository.getRowsByKeys(['buyer_shipping_short_v2_'+code]))[0],stored=JSON.parse(row.value);
 const parsed=JSON.parse(Buffer.from(stored.token.split('.')[1],'base64url'));
 for(const expiry of [undefined,'invalid']){
  const unsigned='bs2.'+Buffer.from(JSON.stringify({...parsed,expiresAt:expiry})).toString('base64url');
  const token=unsigned+'.'+crypto.createHmac('sha256',f.secret).update(unsigned).digest('base64url');
  assert.equal((await f.call('GET','buyer-shipping?token='+token)).status,401);
 }
});
test('revocation during an authenticated buyer read prevents the later write from committing',async t=>{
 const f=await fixture(t),before=JSON.stringify(await f.repository.listRecords('alpha','shipment'));
 const original=f.repository.listRecords.bind(f.repository);let resume,seen,blocked=false;
 const gate=new Promise(resolve=>resume=resolve),entered=new Promise(resolve=>seen=resolve);
 f.repository.listRecords=async(channel,type)=>{const rows=await original(channel,type);if(!blocked&&channel==='alpha'&&type==='shipment'){blocked=true;seen();await gate;}return rows;};
 const save=f.call('POST','buyer-shipping',{code:f.link.code,destinationId:'pickup-1',payments:[{vendorKey:'vendor',method:'bank_transfer'}],requestId:'read-before-revoke'});
 await entered;const revocation=await f.access({action:'revoke',expectedRevision:0,requestId:'revoke-while-read-waits'});assert.equal(revocation.status,200,revocation.body);
 resume();const response=await save;assert.equal(response.status,409,response.body);
 assert.equal(JSON.stringify(await f.repository.listRecords('alpha','shipment')),before);
});
test('queued buyer notices with retired links never reach the provider, while current links still send once',async t=>{
 const f=await fixture(t),sent=[],provider={testMode:false,readiness:()=>({ready:true,missing:[]}),status:()=>({}),send:async record=>{sent.push(record);return {messageId:'fake-'+record.id}}};
 const service=new CheckoutNotificationService({repository:f.repository,provider,beforeSend:(channelId,record)=>f.api.assertBuyerNotificationLink(channelId,record),logger:{warn(){}}});
  const event=(code,key)=>({eventKey:key,templateKey:'buyer_win_initial',recipientRole:'buyer',recipientPhone:'01000000002',transport:'alimtalk',variables:{접속코드:code}});
 await service.enqueue('alpha',{eventKey:'independent-vendor-notice',templateKey:'vendor_win',recipientRole:'vendor',recipientPhone:'01000000001',variables:{업체접속코드:'vendor-code'}});
 await service.enqueue('alpha',event(f.link.code,'queued-before-rotate'));
 const replacement=(await f.access({action:'rotate',expectedRevision:0,requestId:'rotate-with-queued-notice'})).json();
 await service.enqueue('alpha',event(replacement.code,'queued-after-rotate'));await service.flushChannel('alpha');await service.flushChannel('alpha');
 const buyerNotices=sent.filter(record=>record.recipientRole==='buyer');
 assert.equal(buyerNotices.length,1);assert.equal(buyerNotices[0].variables['#{접속코드}'],replacement.code);
 assert.ok(sent.some(record=>record.recipientRole==='vendor'),'link retirement does not suppress the vendor shipping notice');
 const notices=await f.repository.listRecords('alpha','notification');assert.equal(notices.find(n=>n.eventKey==='queued-before-rotate').status,'expired');
 assert.equal(notices.find(n=>n.eventKey==='queued-after-rotate').status,'sent');
});
test('link metadata failure fails closed without attempting external delivery and can retry after recovery',async t=>{
 const f=await fixture(t),reads=f.repository.getRowsByKeys.bind(f.repository);let broken=true,calls=0;
 f.repository.getRowsByKeys=async keys=>{if(broken&&keys.some(key=>key.startsWith('buyer_link_access_v1::')))throw Error('metadata unavailable');return reads(keys);};
 assert.equal((await f.call('GET','buyer-shipping?code='+f.link.code)).status,500);
 const provider={testMode:false,readiness:()=>({ready:true,missing:[]}),send:async record=>{if(record.eventKey==='temporarily-unavailable')calls++;return {messageId:'fake'}}};
 let clock=Date.now();const service=new CheckoutNotificationService({repository:f.repository,provider,now:()=>clock,beforeSend:(c,n)=>f.api.assertBuyerNotificationLink(c,n),logger:{warn(){}}});
 await service.enqueue('alpha',{eventKey:'temporarily-unavailable',templateKey:'buyer_win_initial',recipientRole:'buyer',recipientPhone:'01000000002',variables:{접속코드:f.link.code}});
 await service.flushChannel('alpha');assert.equal(calls,0);
 broken=false;clock+=60000;await service.flushChannel('alpha');assert.equal(calls,1);
});
