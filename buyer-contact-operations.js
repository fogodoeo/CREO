'use strict';
const crypto = require('node:crypto');
const {shortSms} = require('./checkout-notifications');
const digest = value => crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex');
const phone = value => {
    const digits = String(value || '').replace(/[\s().-]/g,'').replace(/^\+82/,'0');
    return /^(?:010\d{8}|01[16789]\d{7,8})$/.test(digits) ? digits : '';
};
const error = (message,status=409) => Object.assign(new Error(message),{status});
function saleNotices(item, records) {
    return records.filter(n => n.recipientRole === 'buyer' && (
        n.eventKey === `sale-v2:${item.id}:${item.buyerSaleId}:buyer`
        || n.eventKey?.startsWith(`retry:${item.id}:${item.buyerSaleId || 'legacy'}:`)
        || (!item.buyerSaleId && n.eventKey?.startsWith(`sale:${item.id}:`))
    )).sort((a,b)=>String(b.createdAt||'').localeCompare(String(a.createdAt||'')));
}

function createBuyerContactOperations(deps) {
    const {repository,channelKey,storedPhone,resolvePhone,buyerName,winningBid,prepareLink,notifications,touch} = deps;
    async function list(channelId) {
        const [items,records,shipments,settings] = await Promise.all(['item','notification','shipment','setting'].map(type=>repository.listRecords(channelId,type)));
        const audits=settings.filter(s=>s.id?.startsWith('buyer-contact-audit-'));
        const rows = await Promise.all(items.filter(i=>i.status==='sold').map(async item=>{
            const saved = phone(storedPhone(item)), resolved = saved || phone(await resolvePhone(item));
            const notices = saleNotices(item,records);
            const current = notices.find(n=>phone(n.recipientPhone)===resolved);
            const external = audits.find(a=>a.itemId===item.id && a.saleId===(item.buyerSaleId||'legacy') && a.action==='external' && a.phone===resolved);
            const status = !resolved ? 'missing_phone' : current?.status || (external ? 'external' : 'not_sent');
            return {itemId:item.id,archived:Boolean(item.auctionArchiveId),lot:item.name,lotNumber:item.lotNumber,name:buyerName(item),rawName:item.winnerName||item.winnerAlias||'',phone:resolved,
                phoneSource:saved?'sale':resolved?'member':'missing',updatedAt:item.updatedAt||'',saleId:item.buyerSaleId||'legacy',
                status,lastError:current?.lastError||'',sentAt:current?.sentAt||external?.createdAt||'',noticeId:current?.id||'',
                hasShipment:shipments.some(s=>s.itemId===item.id),attention:!['sent','external','queued','sending'].includes(status)};
        }));
        rows.sort((a,b)=>String(a.lot).localeCompare(String(b.lot),'en',{numeric:true,sensitivity:'base'}));
        return {rows,attentionCount:rows.filter(r=>r.attention).length};
    }
    async function command(channelId, body, req) {
        if (!['save','send','external'].includes(body.action)) throw error('처리 방법을 확인해 주세요.',422);
        const requestId=String(body.requestId||'');
        if (!/^[a-zA-Z0-9_-]{8,80}$/.test(requestId)) throw error('요청 번호를 확인해 주세요.',422);
        const nextPhone=phone(body.phone);
        if (!nextPhone) throw error('휴대전화 번호를 전체 숫자로 입력해 주세요.',422);
        if (body.confirmed !== true) throw error('낙찰자와 연락처를 확인해 주세요.',422);
        const fingerprint=digest([body.itemId,body.action,nextPhone,body.saleId,body.expectedUpdatedAt]);
        const receiptKey=`buyer_contact_action::${channelId}::${digest(requestId)}`;
        const receiptRows=await repository.getRowsByKeys([receiptKey]);
        if(receiptRows.length){const receipt=JSON.parse(receiptRows[0].value);if(receipt.fingerprint!==fingerprint)throw error('다른 작업에 사용된 요청입니다. 다시 열어 주세요.');return{...receipt.result,duplicate:true};}
        const item=await repository.getRecord(channelId,'item',String(body.itemId||''));
        if(!item||item.status!=='sold')throw error('확정된 낙찰 건에서만 처리할 수 있어요.');
        if((item.buyerSaleId||'legacy')!==body.saleId || String(item.updatedAt||'')!==String(body.expectedUpdatedAt||''))throw error('낙찰 정보가 바뀌었어요. 새로고침 후 다시 확인해 주세요.');
        const oldPhone=phone(storedPhone(item)) || phone(await resolvePhone(item));
        const changes=await repository.listRecords(channelId,'checkoutchange');
        if(changes.some(c=>c.state==='pending' && c.itemIds?.includes(item.id)))throw error('배송·결제 변경 요청을 승인 또는 반려한 뒤 번호를 수정해 주세요.');
        const records=await repository.listRecords(channelId,'notification');
        const previous=saleNotices(item,records);
        if(body.action==='send' && previous.some(n=>['sending','delivery_unknown'].includes(n.status)))throw error('이전 발송 결과가 확인되지 않았어요. 알리고 발송 결과를 확인해 주세요.');
        if(body.action==='send' && previous.some(n=>n.status==='queued'&&phone(n.recipientPhone)===nextPhone))throw error('이 번호로 발송 대기 중이에요. 중복으로 보내지 않습니다.');
        if(body.action==='external' && oldPhone!==nextPhone)throw error('번호를 먼저 저장한 후 외부 발송 확인을 기록해 주세요.');
        const now=new Date().toISOString(),updated={...item,winnerPhone:nextPhone};
        // Keep original bid evidence and all financial fields. Only replace a matching visible phone.
        if(oldPhone && oldPhone!==nextPhone)for(const key of ['winnerName','winnerAlias']){
            updated[key]=String(item[key]||'').replace(/01[016789][\d\s().-]{7,16}/g,value=>phone(value)===oldPhone?nextPhone:value);
        }
        const itemChanged=JSON.stringify(item)!==JSON.stringify(updated);
        if(itemChanged)updated.updatedAt=now;
        const rows=itemChanged?[{key:channelKey(channelId,'item',item.id),value:JSON.stringify(updated)}]:[];
        if(oldPhone!==nextPhone){
            for(const s of await repository.listRecords(channelId,'shipment'))if(s.itemId===item.id && (!s.recipientPhone||phone(s.recipientPhone)===oldPhone))rows.push({key:channelKey(channelId,'shipment',s.id),value:JSON.stringify({...s,recipientPhone:nextPhone})});
            for(const n of previous)if(['queued','configuration_pending','failed'].includes(n.status))rows.push({key:channelKey(channelId,'notification',n.id),value:JSON.stringify({...n,status:'expired',lastError:'관리자가 낙찰자 연락처를 수정하여 이전 번호 발송 중지',updatedAt:now})});
        }
        const member=winningBid(item,true),memberKey=String(member?.bidder_key||member?.bidderKey||'');
        if(memberKey && body.action!=='external'){const id='buyer-contact-'+digest(memberKey).slice(0,40);rows.push({key:channelKey(channelId,'setting',id),value:JSON.stringify({id,phone:nextPhone,updatedAt:now})});}
        let notification=null;
        if(body.action==='send'){
            if(!notifications?.prepare)throw error('알림 발송 설정을 확인해 주세요.',503);
            const link=await prepareLink(req,channelId,nextPhone,updated);
            const event={eventKey:`retry:${item.id}:${item.buyerSaleId||'legacy'}:${digest(requestId).slice(0,12)}`,templateKey:'buyer_win_initial',transport:'alimtalk',allowSmsFallback:false,failureSmsFallback:true,
                recipientRole:'buyer',recipientPhone:nextPhone,variables:{구매자명:buyerName(updated),업체명:item.vendorName||await deps.vendorName(channelId,item.vendorId),개체명:item.name,낙찰금액:`${Number(item.soldPrice||0).toLocaleString('ko-KR')}원`,접속코드:link.code},fallbackText:shortSms('낙찰 안내',link.url,item.name)};
            const prepared=await notifications.prepare(channelId,event);
            if(!prepared.duplicate)rows.push({key:channelKey(channelId,'notification',prepared.record.id),value:JSON.stringify(prepared.record)});
            notification={id:prepared.record.id,status:prepared.record.status};
        }
        const auditId='buyer-contact-audit-'+digest([channelId,requestId]).slice(0,40);
        rows.push({key:channelKey(channelId,'setting',auditId),value:JSON.stringify({id:auditId,itemId:item.id,saleId:item.buyerSaleId||'legacy',action:body.action,oldPhone,phone:nextPhone,createdAt:now,notificationId:notification?.id||''})});
        const result={duplicate:false,itemId:item.id,notification};
        rows.push({key:receiptKey,value:JSON.stringify({fingerprint,result})});
        await repository.upsertRows(rows);touch(channelId);
        return result;
    }
    async function correctedPhone(channelId,item){
        const bid=winningBid(item,true),key=String(bid?.bidder_key||bid?.bidderKey||'');
        return key?phone((await repository.getRecord(channelId,'setting','buyer-contact-'+digest(key).slice(0,40)))?.phone):'';
    }
    return {list,command,correctedPhone};
}
module.exports={createBuyerContactOperations,phone,saleNotices};
