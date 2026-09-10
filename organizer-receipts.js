'use strict';
const crypto = require('node:crypto');
const fail = (message, status = 409) => { throw Object.assign(new Error(message), {status}); };
function deposit(ledger, vendor, body, bank, now = new Date()) {
    const requestId = String(body.requestId || '');
    const amount = body.amount, paidOn = String(body.paidOn || ''), memo = String(body.memo || '').trim();
    if (!/^[A-Za-z0-9_-]{8,80}$/.test(requestId) || !Number.isSafeInteger(amount) || amount <= 0 || amount > 1000000000 || memo.length > 200)
        fail('입금액과 메모를 확인해 주세요.', 422);
    const today = new Date(now.getTime() + 9 * 3600000).toISOString().slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(paidOn) || !Number.isFinite(Date.parse(paidOn)) || new Date(paidOn).toISOString().slice(0,10) !== paidOn || paidOn > today)
        fail('입금일을 확인해 주세요.', 422);
    const reportId = String(body.reportId || '');
    const signature = crypto.createHash('sha256').update(JSON.stringify([vendor.vendorId,amount,paidOn,memo,reportId,body.expectedReceivedAmount,body.expectedTotalAmount,body.expectedReportAmount])).digest('hex');
    const previous = ledger.find(r => r.depositRequestId === requestId);
    if (previous) {
        if (previous.depositSignature !== signature) fail('이미 사용한 요청입니다. 새로고침해 주세요.');
        return {duplicate:true, ledger};
    }
    if (body.expectedReceivedAmount !== vendor.receivedAmount || body.expectedTotalAmount !== vendor.totalAmount)
        fail('정산 금액이 변경되었습니다. 새로고침 후 확인해 주세요.');
    const pending = ledger.find(r => r.vendorId === vendor.vendorId && r.status === 'pending');
    if ((pending?.id || '') !== reportId || (pending && body.expectedReportAmount !== pending.amount))
        fail('입금 요청이 변경되었습니다. 새로고침 후 확인해 주세요.');
    const record = pending ? {...pending, reportedAmount:pending.amount} : {
        id:'receipt-'+requestId, vendorId:vendor.vendorId, vendorName:vendor.vendorName,
        bank:{bankName:bank.bankName||'',bankAccount:bank.bankAccount||'',bankHolder:bank.bankHolder||''}
    };
    Object.assign(record, {status:'confirmed',amount,paidOn,memo,source:pending?'vendor_request':'manual',
        reviewedAt:now.toISOString(),depositRequestId:requestId,depositSignature:signature});
    return {duplicate:false,ledger:pending?ledger.map(r=>r===pending?record:r):[...ledger,record]};
}
function cancel(ledger, body, now = new Date()) {
    const record=ledger.find(r=>r.id===body.receiptId && r.vendorId===body.vendorId);
    if (!record) fail('입금 내역을 찾을 수 없습니다.',404);
    if (body.expectedAmount !== record.amount) fail('입금 금액이 변경되었습니다.');
    if (record.status === 'cancelled') return {duplicate:true,ledger};
    if (record.status !== 'confirmed') fail('확인 완료된 입금만 취소할 수 있습니다.');
    return {duplicate:false,ledger:ledger.map(r=>r===record?{...r,status:'cancelled',cancelledAt:now.toISOString()}:r)};
}
module.exports={deposit,cancel};
