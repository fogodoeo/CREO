'use strict';
const crypto=require('node:crypto');
const Model=require('./item-sheet-model');
const LEASE='CREO item sync lease ';
const STRUCTURE='CREO item sync structure';
const cellValue=cell=>cell?.effectiveValue?.numberValue??cell?.effectiveValue?.stringValue??cell?.effectiveValue?.boolValue??'';
function createGoogleClient({credentials,fetchImpl=globalThis.fetch,now=Date.now}){
    let token='',expires=0,auth;
    async function access(){
        if(token&&now()<expires)return token;
        if(auth)return auth;
        auth=(async()=>{
            const sa=await credentials(),iat=Math.floor(now()/1000),enc=o=>Buffer.from(JSON.stringify(o)).toString('base64url');
            if(sa?.type!=='service_account'||!sa.client_email||!sa.private_key)throw Error('구글 연결 계정이 설정되지 않았어요.');
            const unsigned=enc({alg:'RS256',typ:'JWT'})+'.'+enc({iss:sa.client_email,scope:'https://www.googleapis.com/auth/spreadsheets',aud:'https://oauth2.googleapis.com/token',iat,exp:iat+3600});
            const assertion=unsigned+'.'+crypto.sign('RSA-SHA256',Buffer.from(unsigned),sa.private_key).toString('base64url');
            const r=await fetchImpl('https://oauth2.googleapis.com/token',{method:'POST',body:new URLSearchParams({grant_type:'urn:ietf:params:oauth:grant-type:jwt-bearer',assertion}),signal:AbortSignal.timeout(12000)});
            const j=await r.json();if(!r.ok||!j.access_token)throw Error('구글 계정 인증을 확인해 주세요.');
            token=j.access_token;expires=now()+Math.max(60,Number(j.expires_in||3600)-120)*1000;return token;
        })();
        try{return await auth;}finally{auth=null;}
    }
    async function request(config,path='',body){
        const r=await fetchImpl('https://sheets.googleapis.com/v4/spreadsheets/'+config.spreadsheetId+path,{method:body?'POST':'GET',headers:{Authorization:'Bearer '+await access(),'Content-Type':'application/json'},...(body?{body:JSON.stringify(body)}:{}),signal:AbortSignal.timeout(12000)});
        if(!r.ok){if(r.status===401)expires=0;throw Error(r.status===429?'구글 요청이 많아 잠시 후 다시 연결해요.':`구글시트 연결을 확인해 주세요. (${r.status})`);}
        return r.json();
    }
    async function read(config){
        const range="'"+config.tabName.replaceAll("'","''")+"'!A1:Q"+(config.rowIds.length+1);
        const q=new URLSearchParams({ranges:range,includeGridData:'true',fields:'spreadsheetId,sheets(properties,protectedRanges,data(startRow,startColumn,rowData(values(userEnteredValue,effectiveValue,formattedValue))))'});
        const data=await request(config,'?'+q),sheet=data.sheets?.find(s=>s.properties.sheetId===config.tabId);
        if(!sheet)throw Error('연결한 시트 탭을 찾을 수 없어요.');
        const grid=sheet.data?.[0]?.rowData||[],headers=grid[0]?.values?.map(cellValue)||[];
        const offset=Model.same(headers.slice(0,17),Model.LISTING_HEADERS)?1:0;
        if(!offset&&!Model.same(headers.slice(0,16),Model.HEADERS))throw Error('시트의 열 제목이 바뀌었어요. 원래 제목으로 복구해 주세요.');
        const rows=grid.slice(1,config.rowIds.length+1).map((r,i)=>{
            const cells=Array.from({length:16+offset},(_,j)=>r.values?.[j]||{});
            return {index:i+1,offset,...(offset?{listing:String(cellValue(cells[0])).trim()}:{}),id:String(cellValue(cells[15+offset])),values:Model.normalize(cells.slice(offset,13+offset).map(cellValue)),status:String(cellValue(cells[13+offset])),choice:String(cellValue(cells[14+offset])),formula:cells.some(c=>c.userEnteredValue?.formulaValue),raw:cells.map(c=>c.userEnteredValue||{})};
        });
        if(rows.length!==config.rowIds.length||new Set(rows.map(r=>r.id)).size!==rows.length||rows.some(r=>!config.rowIds.includes(r.id)))throw Error('시트 연결 행이 바뀌었어요. 행 삭제·이동을 되돌려 주세요.');
        return {rows,offset,protections:sheet.protectedRanges||[]};
    }
    async function acquire(config,snapshot,indexes){
        const leases=snapshot.protections.filter(p=>String(p.description||'').startsWith(LEASE));
        const stale=leases.filter(p=>now()-Number(p.description.slice(LEASE.length).split(' ')[0])>120000);
        if(stale.length)await request(config,':batchUpdate',{requests:stale.map(p=>({deleteProtectedRange:{protectedRangeId:p.protectedRangeId}}))});
        if(leases.length!==stale.length)return null;
        const sa=await credentials(),description=LEASE+now()+' '+crypto.randomUUID();
        const result=await request(config,':batchUpdate',{requests:[...new Set(indexes)].map(index=>({addProtectedRange:{protectedRange:{description,range:{sheetId:config.tabId,startRowIndex:index,endRowIndex:index+1,startColumnIndex:0,endColumnIndex:16+(snapshot.offset||0)},warningOnly:false,editors:{users:[sa.client_email]}}}}))});
        return {ids:result.replies.map(r=>r.addProtectedRange.protectedRange.protectedRangeId),description};
    }
    async function release(config,lease){
        if(lease?.ids?.length)await request(config,':batchUpdate',{requests:lease.ids.map(id=>({deleteProtectedRange:{protectedRangeId:id}}))});
    }
    async function publish(config,updates,lease){
        const requests=[];
        for(const u of updates){
            const offset=u.offset||0;
            if(offset&&u.listing!==undefined)requests.push({updateCells:{range:{sheetId:config.tabId,startRowIndex:u.index,endRowIndex:u.index+1,startColumnIndex:0,endColumnIndex:1},rows:[{values:[{userEnteredValue:u.listing?{stringValue:u.listing}:{}}]}],fields:'userEnteredValue'}});
            for(let col=0;col<15;col++){
                const value=col<13?u.values?.[col]:col===13?u.status:u.choice;
                if(value===undefined)continue;
                if(col<13&&u.previous[col]===value)continue;
                let userEnteredValue={stringValue:String(value)};
                if(value==='')userEnteredValue={};
                else if([3,7].includes(col)&&Number.isFinite(Number(value)))userEnteredValue={numberValue:Number(value)};
                else if(col===4&&/^\d{4}-\d{2}-\d{2}$/.test(value))userEnteredValue={numberValue:Date.parse(value)/86400000+25569};
                requests.push({updateCells:{range:{sheetId:config.tabId,startRowIndex:u.index,endRowIndex:u.index+1,startColumnIndex:col+offset,endColumnIndex:col+offset+1},rows:[{values:[{userEnteredValue}]}],fields:'userEnteredValue'}});
            }
        }
        requests.push(...lease.ids.map(id=>({deleteProtectedRange:{protectedRangeId:id}})));
        await request(config,':batchUpdate',{requests});lease.ids=[];
    }
    async function initialize(config){
        const current=await read(config),sa=await credentials(),offset=current.offset||0;
        const requests=[];
        if(!current.protections.some(p=>p.description===STRUCTURE))requests.push({addProtectedRange:{protectedRange:{description:STRUCTURE,range:{sheetId:config.tabId},warningOnly:false,editors:{users:[sa.client_email]},unprotectedRanges:[{sheetId:config.tabId,startRowIndex:1,endRowIndex:config.rowIds.length+1,startColumnIndex:0,endColumnIndex:13+offset},{sheetId:config.tabId,startRowIndex:1,endRowIndex:config.rowIds.length+1,startColumnIndex:14+offset,endColumnIndex:15+offset}]}}});
        requests.push({updateDimensionProperties:{range:{sheetId:config.tabId,dimension:'COLUMNS',startIndex:15+offset,endIndex:26},properties:{hiddenByUser:true},fields:'hiddenByUser'}});
        requests.push({updateSpreadsheetProperties:{properties:{timeZone:'Asia/Seoul'},fields:'timeZone'}});
        await request(config,':batchUpdate',{requests});
        return current;
    }
    return {read,acquire,release,publish,initialize};
}
module.exports={createGoogleClient,LEASE,STRUCTURE};
