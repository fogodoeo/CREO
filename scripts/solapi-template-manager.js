'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { solapiAuthorization } = require('../checkout-notifications');

const ROOT = path.resolve(__dirname, '..');
const SPEC_PATH = path.join(ROOT, 'config', 'kakao-alimtalk-templates.json');
const RESULT_PATH = path.join(ROOT, 'config', 'kakao-template-registration.json');
const API_ROOT = 'https://api.solapi.com';

function required(name) {
    const value = String(process.env[name] || '').trim();
    if (!value) throw new Error(`${name} 환경변수가 필요합니다.`);
    return value;
}

function authorization() {
    return solapiAuthorization(required('SOLAPI_API_KEY'), required('SOLAPI_API_SECRET'));
}

async function request(method, pathname, body) {
    const response = await fetch(`${API_ROOT}${pathname}`, {
        method,
        headers: { Authorization: authorization(), 'Content-Type': 'application/json' },
        body: body === undefined ? undefined : JSON.stringify(body)
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(payload.errorMessage || payload.message || `SOLAPI ${response.status}`);
    return payload;
}

function createPayload(template, spec) {
    const channelId = String(process.env.SOLAPI_KAKAO_CHANNEL_ID || '').trim() || 'SOLAPI_KAKAO_CHANNEL_ID';
    return {
        channelId,
        name: template.name,
        content: template.content,
        categoryCode: String(process.env.SOLAPI_KAKAO_CATEGORY_CODE || spec.categoryCode || '').trim(),
        buttons: [{
            buttonType: 'WL',
            buttonName: template.buttonName,
            linkMo: template.link,
            linkPc: template.link,
            targetOut: false
        }],
        quickReplies: [],
        messageType: 'BA',
        emphasizeType: 'NONE',
        securityFlag: false
    };
}

async function main() {
    const mode = process.argv[2] || '--dry-run';
    const spec = JSON.parse(fs.readFileSync(SPEC_PATH, 'utf8'));
    const payloads = spec.templates.map((template) => ({ key: template.key, payload: createPayload(template, spec) }));
    if (mode === '--dry-run') {
        process.stdout.write(`${JSON.stringify({ channelName: spec.channelName, templates: payloads }, null, 2)}\n`);
        return;
    }
    if (mode === '--create') {
        required('SOLAPI_KAKAO_CHANNEL_ID');
        const registered = [];
        for (const entry of payloads) {
            const result = await request('POST', '/kakao/v2/templates', entry.payload);
            registered.push({ key: entry.key, templateId: result.templateId, status: result.status });
        }
        fs.writeFileSync(RESULT_PATH, `${JSON.stringify({ registeredAt: new Date().toISOString(), templates: registered }, null, 2)}\n`, 'utf8');
        process.stdout.write(`${JSON.stringify(registered, null, 2)}\n`);
        return;
    }
    if (mode === '--inspect') {
        if (!fs.existsSync(RESULT_PATH)) throw new Error('먼저 --create를 실행해 템플릿 ID를 저장해 주세요.');
        const registration = JSON.parse(fs.readFileSync(RESULT_PATH, 'utf8'));
        const inspected = [];
        for (const entry of registration.templates || []) {
            const result = await request('PUT', `/kakao/v2/templates/${encodeURIComponent(entry.templateId)}/inspection`, {
                comment: '옹동2 라이브 방송 운영 지원 서비스의 낙찰·배송·결제 진행 상태를 당사자에게 안내하는 정보성 메시지입니다.'
            });
            inspected.push({ key: entry.key, templateId: entry.templateId, status: result.status });
        }
        process.stdout.write(`${JSON.stringify(inspected, null, 2)}\n`);
        return;
    }
    throw new Error('사용법: npm run kakao:templates -- --dry-run | --create | --inspect');
}

main().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
});
