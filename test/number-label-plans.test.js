'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const M=require('../public/number-label-model'),Plans=require('../number-label-plans');
const parts=()=>[{name:'1부',prefix:'A',start:1,vendors:[{company:'크레오',count:2},{company:'크레빠',count:3},{company:'마이리틀드래곤',count:2}]},{name:'2부',prefix:'B',start:1,vendors:[{company:'마리드',count:2},{company:'크레빠',count:2},{company:'크레오',count:1}]},{name:'패널',prefix:'E',start:1,vendors:[{company:'패널',count:2}]}];
test('vendor import preserves manual order and counts, skips duplicates and fails atomically',()=>{
 const existing=[{company:'크레빠',count:7}],candidates=[{name:'크레오'},{name:' 크레빠 '},{name:'크레오'},{name:'마리드'}];
 const result=M.importVendors(existing,candidates,4);
 assert.deepEqual(result,[{company:'크레빠',count:7},{company:'크레오',count:4},{company:'마리드',count:4}]);
 assert.deepEqual(M.importVendors(result,candidates,2),result);assert.deepEqual(existing,[{company:'크레빠',count:7}]);
 assert.throws(()=>M.importVendors(existing,candidates,-1));assert.deepEqual(M.importVendors(existing,[],4),existing);
 assert.throws(()=>M.importVendors(existing,Array.from({length:100},(_,i)=>({name:'업체'+i})),4));assert.equal(existing.length,1);
});
test('independent parts cycle vendor order, skip exhausted quantities and keep panel numbering separate',()=>{
 const input=parts(),before=structuredClone(input),result=M.generate(input);assert.deepEqual(input,before);
 assert.deepEqual(result.labels.map(l=>l.lot_number+':'+l.company),['A01:크레오','A02:크레빠','A03:마이리틀드래곤','A04:크레오','A05:크레빠','A06:마이리틀드래곤','A07:크레빠','B01:마리드','B02:크레빠','B03:크레오','B04:마리드','B05:크레빠','E01:패널','E02:패널']);
 input[0].vendors.reverse();input[0].vendors[0].count=0;input[0].start=10;
 assert.equal(M.generate(input).labels[0].lot_number,'A10');assert.equal(M.generate(input).labels[0].company,'크레빠');
});
test('invalid, duplicate, empty and oversized settings fail before a print or save',()=>{
 for(const change of [p=>p[0].vendors[0].count=-1,p=>p[0].vendors[0].count=1.5,p=>p[1].prefix='A',p=>p[0].vendors[1].company='크레오',p=>p[0].start=999,p=>p[0].vendors[0].company='',p=>p.forEach(s=>s.vendors.forEach(v=>v.count=100))]){const p=parts();change(p);assert.throws(()=>M.generate(p));}
 assert.throws(()=>M.generate([{name:'1부',prefix:'A',start:1,vendors:[]}]),/개수/);
 for(const d of ['2026-02-30','2026-13-01','current',''])assert.throws(()=>M.date(d));assert.equal(M.date('2026-10-26'),'2026-10-26');
 const html=M.labelHtml({company:'<img onerror=x>',lot_number:'A01'},v=>v.replaceAll('<','&lt;'));assert.doesNotMatch(html,/<img/);
});
test('simple setup halves the total, regenerates A/B numbering and makes second-part reversal optional',()=>{
 const setup={vendors:[{company:'크레오',count:4},{company:'크레빠',count:4},{company:'마리드',count:4}],reverse:true};
 const result=M.build({mode:'split',setup});assert.equal(result.labels.length,12);
 assert.deepEqual(result.labels.slice(0,3).map(l=>l.lot_number+':'+l.company),['A01:크레오','A02:크레빠','A03:마리드']);
 assert.deepEqual(result.labels.slice(6,9).map(l=>l.lot_number+':'+l.company),['B01:마리드','B02:크레빠','B03:크레오']);
 assert.equal(M.build({mode:'split',setup:{...setup,reverse:false}}).labels[6].company,'크레오');
 const uneven=M.build({mode:'split',setup:{vendors:[{company:'크레오',count:1},{company:'크레빠',count:4},{company:'마리드',count:4}],reverse:true,panels:[{name:'패널',prefix:'E',start:1,vendors:[{company:'패널',count:2}]}]}});
 assert.equal(uneven.labels.filter(l=>l.prefix==='A').length,5);assert.equal(uneven.labels.filter(l=>l.prefix==='B').length,4);assert.equal(uneven.labels.filter(l=>l.prefix==='E').length,2);
 assert.equal(uneven.labels.filter(l=>l.company==='크레오').length,1);assert.equal(uneven.labels.find(l=>l.prefix==='B').company,'마리드');
});
function fixture(){const records=new Map(),locks=new Map();return {records,repository:{async listRecords(c,t){return [...records.values()].filter(r=>r.channelId===c&&r.type===t).map(r=>structuredClone(r));},async getRecord(c,t,id){return structuredClone(records.get(c+':'+t+':'+id)||null);},async upsertRecord(c,t,r){const stored={...structuredClone(r),channelId:c,type:t};records.set(c+':'+t+':'+r.id,stored);return structuredClone(stored);}},lock(key,work){const p=(locks.get(key)||Promise.resolve()).catch(()=>{}).then(work);locks.set(key,p);return p;}};}
test('append-only plans isolate channel/date, deduplicate retries, survive restart and preserve earlier assignments',async()=>{
 const f=fixture(),options={...f,now:()=> '2026-10-24T00:00:00Z'};let service=Plans.create(options);
 const body={date:'2026-10-26',title:'확정',parts:parts(),requestId:'test-request-00000001'};
 const [a,b]=await Promise.all([service.save('alpha',body),service.save('alpha',body)]);assert.equal(a.id,b.id);assert.equal(f.records.size,1);
 await assert.rejects(service.save('alpha',{...body,title:'달라짐'}),e=>e.status===409);
 const changed=parts();changed[0].vendors.reverse();await service.save('alpha',{...body,parts:changed,requestId:'test-request-00000002'});
 service=Plans.create(options);assert.deepEqual((await service.list('alpha',body.date)).find(p=>p.id===a.id).labels,a.labels);
 assert.equal((await service.list('alpha','2026-10-28')).length,0);assert.equal((await service.list('beta',body.date)).length,0);
 await service.save('beta',body);assert.equal((await service.list('beta',body.date)).length,1);
 f.repository.upsertRecord=async()=>{throw Error('disk failure');};await assert.rejects(service.save('alpha',{...body,requestId:'test-request-00000003'}),/disk/);assert.equal((await service.list('alpha',body.date)).length,2);
});
