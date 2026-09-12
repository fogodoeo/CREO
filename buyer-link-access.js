'use strict';
const crypto=require('node:crypto');
const locks=new WeakMap();
const fail=(message,status=409)=>Object.assign(new Error(message),{status});

function createBuyerLinkAccess({repository,secret,signToken,verifyToken,shortPrefix,now=Date.now}) {
    let pending=locks.get(repository);if(!pending){pending=new Map();locks.set(repository,pending);}
    const hash=value=>crypto.createHmac('sha256',secret).update(value).digest('base64url');
    function identity(subject){
        if(!subject?.channelId||!subject?.phoneHash)throw fail('구매자 링크 대상을 확인해 주세요.',422);
        return `${subject.channelId}:${subject.phoneHash}`;
    }
    const stateKey=subject=>'buyer_link_access_v1::'+hash(identity(subject));
    const codeFor=(subject,generation=0)=>hash('buyer-shipping-short-v2:'+identity(subject)+(generation?':generation:'+generation:'')).slice(0,11);
    async function locked(subject,work){
        const key=identity(subject),previous=pending.get(key)||Promise.resolve();
        const running=previous.catch(()=>{}).then(work);pending.set(key,running);
        try{return await running;}finally{if(pending.get(key)===running)pending.delete(key);}
    }
    async function load(subject){
        const key=stateKey(subject),row=(await repository.getRowsByKeys([key])).find(row=>row.key===key);
        if(!row)return {revision:0,generation:0,status:'active',history:[]};
        let state;try{state=JSON.parse(row.value);}catch{throw fail('링크 관리 정보를 읽지 못했어요. 다시 확인해 주세요.',503);}
        if(!state||!Number.isSafeInteger(state.revision)||state.revision<1||!Number.isSafeInteger(state.generation)||state.generation<0||(state.status==='revoked'&&state.generation===0)||!['active','revoked'].includes(state.status)||!Array.isArray(state.history))throw fail('링크 관리 정보를 읽지 못했어요. 다시 확인해 주세요.',503);
        return state;
    }
    const matches=(payload,state)=>state.status==='active'&&Number.isSafeInteger(payload?.accessGeneration??0)&&(payload.accessGeneration??0)===state.generation;
    async function accepts(payload){return Boolean(payload?.channelId&&payload?.phoneHash)&&matches(payload,await load(payload));}
    function build(subject,generation){
        const token=signToken({...subject,accessGeneration:generation},now()),payload=verifyToken(token,now());
        if(!payload)throw fail('구매자 링크를 만들지 못했어요.',500);
        return {token,payload,code:codeFor(subject,generation)};
    }
    const shortRow=issued=>({key:shortPrefix+issued.code,value:JSON.stringify({token:issued.token,expiresAt:issued.payload.expiresAt})});
    async function issue(subject){
        return locked(subject,async()=>{
            const state=await load(subject);
            if(state.status==='revoked')throw Object.assign(fail('사용 중지된 구매자 링크예요. 링크 관리에서 새 링크를 발급해 주세요.'),{code:'BUYER_LINK_REVOKED'});
            const issued=build(subject,state.generation);await repository.upsertRows([shortRow(issued)]);return issued;
        });
    }
    async function describe(subject,state=undefined){
        state=state||await load(subject);
        const result={revision:state.revision,status:state.status,code:'',expiresAt:'',history:state.history.map(({action,at,revision})=>({action,at,revision})).reverse()};
        if(state.status==='revoked')return result;
        const code=codeFor(subject,state.generation),row=(await repository.getRowsByKeys([shortPrefix+code])).find(row=>row.key===shortPrefix+code);
        if(!row)return {...result,status:'not_issued'};
        let entry;try{entry=JSON.parse(row.value);}catch{throw fail('현재 링크를 읽지 못했어요. 다시 확인해 주세요.',503);}
        const payload=verifyToken(entry.token,now());
        if(!payload||!matches(payload,state)||!Number.isFinite(entry.expiresAt)||entry.expiresAt<=now())return {...result,status:'expired',expiresAt:Number.isFinite(entry.expiresAt)&&!Number.isNaN(new Date(entry.expiresAt).getTime())?new Date(entry.expiresAt).toISOString():''};
        return {...result,code,expiresAt:new Date(payload.expiresAt).toISOString()};
    }
    async function change(subject,input){
        const {action,requestId,expectedRevision}=input||{};
        if(!['rotate','revoke','renew'].includes(action)||typeof requestId!=='string'||!/^[A-Za-z0-9_-]{8,80}$/.test(requestId)||!Number.isSafeInteger(expectedRevision)||expectedRevision<0)throw fail('링크 요청 정보를 다시 확인해 주세요.',422);
        return locked(subject,async()=>{
            const state=await load(subject),auditKey='buyer_link_audit_v1::'+hash(identity(subject)+':'+requestId);
            const previous=(await repository.getRowsByKeys([auditKey])).find(row=>row.key===auditKey);
            if(previous){
                let audit;try{audit=JSON.parse(previous.value);}catch{throw fail('처리 기록을 확인하지 못했어요.',503);}
                if(audit.action!==action||audit.expectedRevision!==expectedRevision)throw fail('같은 요청으로 다른 작업을 실행할 수 없어요.');
                if(audit.revision!==state.revision)throw fail('이후 링크가 변경됐어요. 최신 상태를 다시 확인해 주세요.');
                return {...await describe(subject,state),duplicate:true};
            }
            if(expectedRevision!==state.revision)throw fail('다른 화면에서 링크가 변경됐어요. 최신 상태를 다시 확인해 주세요.');
            if(action==='revoke'&&state.status==='revoked')throw fail('이미 사용 중지된 링크예요. 최신 상태를 다시 확인해 주세요.');
            if(action==='renew'&&(await describe(subject,state)).status!=='expired')throw fail('기간이 만료된 링크만 연장할 수 있어요. 최신 상태를 다시 확인해 주세요.');
            const at=new Date(now()).toISOString(),revision=state.revision+1,generation=state.generation+(action==='renew'?0:1);
            const audit={channelId:subject.channelId,action,at,revision,generation,expectedRevision,requestId};
            const next={revision,generation,status:action==='revoke'?'revoked':'active',updatedAt:at,history:[...state.history,{action,at,revision}].slice(-20)};
            const rows=[{key:stateKey(subject),value:JSON.stringify(next)},{key:auditKey,value:JSON.stringify(audit)}];
            if(action==='rotate'||action==='renew')rows.push(shortRow(build(subject,generation)));
            // SQLite and a single remote upsert commit the generation and new link together.
            await repository.upsertRows(rows);
            return {...await describe(subject,next),duplicate:false};
        });
    }
    return {issue,accepts,describe,change};
}
module.exports={createBuyerLinkAccess};
