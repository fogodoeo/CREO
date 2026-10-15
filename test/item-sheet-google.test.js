'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const Model=require('../item-sheet-model'),{createGoogleClient,STRUCTURE}=require('../item-sheet-google');
const {privateKey}=crypto.generateKeyPairSync('rsa',{modulusLength:2048});
for(const offset of [0,1])test('Google adapter preserves values, identity and locks for '+(offset?'listing':'legacy')+' columns',async()=>{
    const id='row-'+crypto.randomUUID(),config={spreadsheetId:'test-only',tabId:7,tabName:'출품 개체',rowIds:[id]},calls=[];
    const cell=v=>({userEnteredValue:{stringValue:v},effectiveValue:{stringValue:v}});
    const headers=offset?Model.LISTING_HEADERS:Model.HEADERS;
    const input=[...(offset?['출품']:[]),'A01','업체','암컷','25','2025-07-01','아잔틱','PCR','15','','','','','','연결됨','',id];
    const client=createGoogleClient({credentials:async()=>({type:'service_account',client_email:'test@example.iam.gserviceaccount.com',private_key:privateKey.export({format:'pem',type:'pkcs8'})}),fetchImpl:async(url,options)=>{
        if(url.includes('oauth2'))return {ok:true,json:async()=>({access_token:'fixture',expires_in:3600})};
        if(options.body){const body=JSON.parse(options.body);calls.push(body);return {ok:true,json:async()=>({replies:body.requests.map(()=>({addProtectedRange:{protectedRange:{protectedRangeId:123}}}))})};}
        return {ok:true,json:async()=>({sheets:[{properties:{sheetId:7},protectedRanges:[{description:STRUCTURE}],data:[{rowData:[{values:headers.map(cell)},{values:input.map(cell)}]}]}]})};
    }});
    const snapshot=await client.read(config);assert.equal(snapshot.offset,offset);assert.equal(snapshot.rows[0].id,id);assert.equal(snapshot.rows[0].values[0],'A01');assert.equal(snapshot.rows[0].values[7],'15');assert.equal(snapshot.rows[0].listing,offset?'출품':undefined);
    const lease=await client.acquire(config,snapshot,[1]);assert.equal(calls[0].requests[0].addProtectedRange.protectedRange.range.endColumnIndex,16+offset);
    const values=[...snapshot.rows[0].values];values[0]='B01';values[7]='20';
    await client.publish(config,[{index:1,offset,listing:offset?'출품':undefined,previous:snapshot.rows[0].values,values,status:'출품 완료',choice:''}],lease);
    const updates=calls[1].requests.filter(r=>r.updateCells).map(r=>r.updateCells);
    assert.equal(updates.find(r=>r.range.startColumnIndex===offset).rows[0].values[0].userEnteredValue.stringValue,'B01');
    assert.equal(updates.find(r=>r.range.startColumnIndex===7+offset).rows[0].values[0].userEnteredValue.numberValue,20);
    assert.equal(updates.find(r=>r.range.startColumnIndex===13+offset).rows[0].values[0].userEnteredValue.stringValue,'출품 완료');
    assert.equal(updates.some(r=>r.range.startColumnIndex===15+offset),false);assert.deepEqual(lease.ids,[]);
    await client.initialize(config);assert.equal(calls[2].requests[0].updateDimensionProperties.range.startIndex,15+offset);
});
