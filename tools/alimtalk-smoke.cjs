'use strict';
// Explicit one-shot operator smoke. Uses the isolated checkout practice records.
const fs = require('node:fs');
const path = require('node:path');
const { AligoNotificationProvider } = require('../checkout-notifications');
const recipientPhone = '01049278600';
const statePath = path.join(process.env.CREO_DATA_DIR || path.join(__dirname, '../storage'), 'alimtalk-smoke-20260908.json');
async function main() {
    const provider = new AligoNotificationProvider({ testMode: false });
    for (const key of ['buyer_win_initial', 'vendor_win']) if (!provider.readiness(key, 'alimtalk').ready) throw Error(`Not configured: ${key}`);
    const state = fs.existsSync(statePath) ? JSON.parse(fs.readFileSync(statePath, 'utf8')) : { sends: {} };
    const persist = () => fs.writeFileSync(statePath, JSON.stringify(state), { mode: 0o600 });
    const origin = 'https://creok.onrender.com';
    const api = async (url, body) => {
        const response = await fetch(origin + url, { method: body ? 'POST' : 'GET', headers: { 'X-Creo-Admin': process.env.CREO_ADMIN_SECRET, 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined });
        const result = await response.json();
        if (!response.ok) throw Error(`API ${response.status}: ${result.error}`);
        return result;
    };
    if (!state.links) {
        state.links = await api('/api/platform/channels/cdcup/checkout-test', { vendorId: 'championship-a1' });
        if (!state.links.channelId.startsWith('checkout-test-')) throw Error('Test isolation failed');
        persist();
    }
    const buyerCode = new URL(state.links.buyerUrl).pathname.split('/').at(-1);
    const vendorCode = new URL(state.links.vendorUrl).pathname.split('/').at(-1);
    const buyer = await api(`/api/platform/buyer-shipping?code=${buyerCode}`);
    const item = buyer.items[0];
    if (!item || !Number.isFinite(item.soldAmount)) throw Error('Missing test sale amount');
    const variables = { 구매자명: '테스트 구매자', 업체명: item.vendorName, 개체명: item.name, 낙찰금액: `${item.soldAmount.toLocaleString('ko-KR')}원`, 접속코드: buyerCode, 업체접속코드: vendorCode };
    if (process.argv.includes('--send')) {
        for (const [templateKey, recipientRole] of [['buyer_win_initial', 'buyer'], ['vendor_win', 'vendor']]) {
            if (state.sends[templateKey]) continue; // Never retry an uncertain paid request.
            state.sends[templateKey] = { status: 'sending', at: new Date().toISOString() }; persist();
            try {
                const result = await provider.send({ id: `smoke-20260908-${recipientRole}`, templateKey, transport: 'alimtalk', recipientRole, recipientPhone, variables });
                state.sends[templateKey] = { status: 'accepted', ...result }; persist();
            } catch (error) { state.sends[templateKey].error = error.message; persist(); throw error; }
        }
    }
    for (const [key, result] of Object.entries(state.sends)) {
        if (!result.messageId) { console.log(JSON.stringify({ key, ...result })); continue; }
        const response = await fetch('https://kakaoapi.aligo.in/akv10/history/detail/', { method: 'POST', body: new URLSearchParams({ apikey: provider.apiKey, userid: provider.userId, mid: result.messageId }) });
        const payload = await response.json();
        console.log(JSON.stringify({ key, ...result, delivery: (payload.list || []).map(row => ({ result: row.rslt, message: row.rslt_message, template: row.tpl_code })) }));
    }
    console.log(JSON.stringify({ channelId: state.links.channelId, buyerUrl: state.links.buyerUrl, vendorUrl: state.links.vendorUrl }));
}
main().catch(error => { console.error(error.message); process.exitCode = 1; });
