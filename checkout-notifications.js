'use strict';

const crypto = require('node:crypto');

const NOTIFICATION_STATUSES = new Set([
    'queued',
    'configuration_pending',
    'sending',
    'sent',
    'failed',
    'expired'
]);

const TEMPLATE_KEYS = Object.freeze([
    'buyer_win_initial',
    'buyer_win_additional',
    'vendor_win',
    'vendor_payment_reported',
    'buyer_card_link_ready',
    'buyer_payment_confirmed'
]);

function text(value, limit = 1000) {
    return String(value ?? '').replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, limit);
}

function phone(value) {
    const digits = String(value ?? '').replace(/[^0-9]/g, '');
    return /^01[016789][0-9]{7,8}$/.test(digits) ? digits : '';
}

function safeVariables(value = {}) {
    const result = {};
    for (const [rawKey, rawValue] of Object.entries(value && typeof value === 'object' ? value : {}).slice(0, 40)) {
        const key = text(rawKey, 40);
        if (!key) continue;
        result[key.startsWith('#{') ? key : `#{${key}}`] = text(rawValue, 1000);
    }
    return result;
}

function parseTemplateIds(value) {
    if (!value) return {};
    if (typeof value === 'object' && !Array.isArray(value)) return { ...value };
    try {
        const parsed = JSON.parse(String(value));
        return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
    } catch {
        return {};
    }
}

function firstConfigured(...values) {
    return values.map((value) => String(value || '').trim()).find(Boolean) || '';
}

function solapiAuthorization(apiKey, apiSecret, now = new Date(), salt = crypto.randomBytes(32).toString('hex')) {
    const date = now.toISOString();
    const signature = crypto.createHmac('sha256', String(apiSecret)).update(`${date}${salt}`).digest('hex');
    return `HMAC-SHA256 apiKey=${apiKey}, date=${date}, salt=${salt}, signature=${signature}`;
}

function notificationId(channelId, eventKey, templateKey, recipientRole) {
    const digest = crypto.createHash('sha256')
        .update([channelId, eventKey, templateKey, recipientRole].map(String).join('\n'))
        .digest('base64url')
        .slice(0, 30);
    return `ntf_${digest}`;
}

function normalizeNotification(input = {}, current = {}) {
    const status = NOTIFICATION_STATUSES.has(input.status) ? input.status : (NOTIFICATION_STATUSES.has(current.status) ? current.status : 'queued');
    return {
        ...current,
        id: text(input.id || current.id, 64),
        eventKey: text(input.eventKey || current.eventKey, 120),
        templateKey: TEMPLATE_KEYS.includes(input.templateKey) ? input.templateKey : current.templateKey,
        recipientRole: ['buyer', 'vendor'].includes(input.recipientRole) ? input.recipientRole : current.recipientRole,
        recipientPhone: phone(input.recipientPhone || current.recipientPhone),
        variables: safeVariables(input.variables || current.variables),
        fallbackText: text(input.fallbackText || current.fallbackText, 2000),
        status,
        attempts: Math.max(0, Number.parseInt(input.attempts ?? current.attempts, 10) || 0),
        providerMessageId: text(input.providerMessageId || current.providerMessageId, 120),
        providerGroupId: text(input.providerGroupId || current.providerGroupId, 120),
        lastError: text(input.lastError || current.lastError, 500),
        nextAttemptAt: text(input.nextAttemptAt || current.nextAttemptAt, 80),
        sentAt: text(input.sentAt || current.sentAt, 80),
        expiresAt: text(input.expiresAt || current.expiresAt, 80)
    };
}

class SolapiAlimtalkProvider {
    constructor(options = {}) {
        this.apiKey = String(options.apiKey || process.env.SOLAPI_API_KEY || '').trim();
        this.apiSecret = String(options.apiSecret || process.env.SOLAPI_API_SECRET || '').trim();
        this.pfId = String(options.pfId || process.env.SOLAPI_KAKAO_PF_ID || '').trim();
        this.from = phone(options.from || process.env.SOLAPI_FROM_NUMBER || '');
        this.templateIds = parseTemplateIds(options.templateIds || process.env.SOLAPI_KAKAO_TEMPLATE_IDS_JSON || '');
        this.fetch = options.fetchImpl || globalThis.fetch;
        this.endpoint = String(options.endpoint || 'https://api.solapi.com/messages/v4/send-many/detail');
    }

    readiness(templateKey) {
        const missing = [];
        if (!this.apiKey) missing.push('SOLAPI_API_KEY');
        if (!this.apiSecret) missing.push('SOLAPI_API_SECRET');
        if (!this.pfId) missing.push('SOLAPI_KAKAO_PF_ID');
        if (!this.from) missing.push('SOLAPI_FROM_NUMBER');
        if (!this.templateIds[templateKey]) missing.push(`template:${templateKey}`);
        return { ready: missing.length === 0, missing };
    }

    status() {
        const templates = Object.fromEntries(TEMPLATE_KEYS.map((key) => [key, this.readiness(key)]));
        return {
            provider: 'solapi-alimtalk',
            configured: Object.values(templates).every((entry) => entry.ready),
            profileConfigured: Boolean(this.pfId),
            senderConfigured: Boolean(this.from),
            templates
        };
    }

    async send(notification) {
        const ready = this.readiness(notification.templateKey);
        if (!ready.ready) {
            const error = new Error(`알림톡 설정 대기: ${ready.missing.join(', ')}`);
            error.code = 'CONFIGURATION_PENDING';
            throw error;
        }
        const kakaoOptions = {
            pfId: this.pfId,
            templateId: this.templateIds[notification.templateKey],
            disableSms: false,
            variables: safeVariables(notification.variables)
        };
        const response = await this.fetch(this.endpoint, {
            method: 'POST',
            headers: {
                Authorization: solapiAuthorization(this.apiKey, this.apiSecret),
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                messages: [{
                    to: notification.recipientPhone,
                    from: this.from,
                    text: notification.fallbackText,
                    autoTypeDetect: true,
                    kakaoOptions
                }],
                allowDuplicates: false,
                showMessageList: true,
                agent: { appId: 'creo-checkout', sdkVersion: 'rest/1.0.0', osPlatform: 'render' }
            })
        });
        const payload = await response.json().catch(() => ({}));
        if (!response.ok || Number(payload.errorCount) > 0) {
            const detail = payload.errorMessage || payload.message || payload.resultList?.[0]?.statusMessage || `SOLAPI ${response.status}`;
            throw new Error(text(detail, 500));
        }
        const result = payload.resultList?.[0] || {};
        return {
            messageId: text(result.messageId, 120),
            groupId: text(result.groupId || payload.groupId, 120),
            statusCode: text(result.statusCode, 40)
        };
    }
}

class NhnCloudAlimtalkProvider {
    constructor(options = {}) {
        this.appKey = firstConfigured(
            options.appKey,
            process.env.NHN_ALIMTALK_APP_KEY,
            process.env.NHN_CLOUD_APP_KEY,
            process.env.NHN_APP_KEY
        );
        this.secretKey = firstConfigured(
            options.secretKey,
            process.env.NHN_ALIMTALK_SECRET_KEY,
            process.env.NHN_CLOUD_SECRET_KEY,
            process.env.NHN_SECRET_KEY
        );
        this.senderKey = firstConfigured(
            options.senderKey,
            process.env.NHN_ALIMTALK_SENDER_KEY,
            process.env.NHN_CLOUD_SENDER_KEY,
            process.env.KAKAO_SENDER_KEY
        );
        this.templateCodes = parseTemplateIds(
            options.templateCodes
            || process.env.NHN_ALIMTALK_TEMPLATE_CODES_JSON
            || process.env.NHN_CLOUD_TEMPLATE_CODES_JSON
        );
        this.fetch = options.fetchImpl || globalThis.fetch;
        const baseUrl = String(options.baseUrl || 'https://kakaotalk-bizmessage.api.nhncloudservice.com').replace(/\/+$/, '');
        this.endpoint = String(options.endpoint || `${baseUrl}/alimtalk/v2.2/appkeys/${encodeURIComponent(this.appKey)}/messages`);
    }

    readiness(templateKey) {
        const missing = [];
        if (!this.appKey) missing.push('NHN_ALIMTALK_APP_KEY');
        if (!this.secretKey) missing.push('NHN_ALIMTALK_SECRET_KEY');
        if (!this.senderKey) missing.push('NHN_ALIMTALK_SENDER_KEY');
        if (!this.templateCodes[templateKey]) missing.push(`template:${templateKey}`);
        return { ready: missing.length === 0, missing };
    }

    status() {
        const templates = Object.fromEntries(TEMPLATE_KEYS.map((key) => [key, this.readiness(key)]));
        return {
            provider: 'nhn-cloud-alimtalk',
            configured: Object.values(templates).every((entry) => entry.ready),
            appConfigured: Boolean(this.appKey),
            secretConfigured: Boolean(this.secretKey),
            profileConfigured: Boolean(this.senderKey),
            senderConfigured: Boolean(this.senderKey),
            templates
        };
    }

    async send(notification) {
        const ready = this.readiness(notification.templateKey);
        if (!ready.ready) {
            const error = new Error(`알림톡 설정 대기: ${ready.missing.join(', ')}`);
            error.code = 'CONFIGURATION_PENDING';
            throw error;
        }
        const response = await this.fetch(this.endpoint, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json;charset=UTF-8',
                'X-Secret-Key': this.secretKey
            },
            body: JSON.stringify({
                senderKey: this.senderKey,
                templateCode: this.templateCodes[notification.templateKey],
                senderGroupingKey: notification.id,
                recipientList: [{
                    recipientNo: notification.recipientPhone,
                    templateParameter: safeVariables(notification.variables),
                    recipientGroupingKey: notification.id
                }]
            })
        });
        const payload = await response.json().catch(() => ({}));
        const result = payload.message?.sendResults?.[0];
        const resultCode = Number(result?.resultCode);
        if (!response.ok || payload.header?.isSuccessful !== true || !result || !Number.isFinite(resultCode) || resultCode !== 0) {
            const detail = result?.resultMessage
                || payload.header?.resultMessage
                || payload.message
                || `NHN Cloud ${response.status}`;
            throw new Error(text(detail, 500));
        }
        return {
            messageId: text(payload.message?.requestId, 120),
            groupId: text(payload.message?.senderGroupingKey || notification.id, 120),
            statusCode: text(result.resultCode, 40)
        };
    }
}

function createDefaultAlimtalkProvider(providerName = process.env.CREO_ALIMTALK_PROVIDER || 'nhn-cloud') {
    const provider = String(providerName).trim().toLowerCase();
    if (provider === 'solapi') return new SolapiAlimtalkProvider();
    return new NhnCloudAlimtalkProvider();
}

class CheckoutNotificationService {
    constructor(options = {}) {
        if (!options.repository) throw new Error('repository is required');
        this.repository = options.repository;
        this.provider = options.provider || createDefaultAlimtalkProvider();
        this.logger = options.logger || console;
        this.now = options.now || (() => Date.now());
        this.running = false;
    }

    async enqueue(channelId, event = {}) {
        const templateKey = TEMPLATE_KEYS.includes(event.templateKey) ? event.templateKey : '';
        const recipientPhone = phone(event.recipientPhone);
        const eventKey = text(event.eventKey, 120);
        const recipientRole = ['buyer', 'vendor'].includes(event.recipientRole) ? event.recipientRole : '';
        if (!channelId || !templateKey || !recipientPhone || !eventKey || !recipientRole) {
            throw new Error('알림 이벤트 정보가 올바르지 않습니다.');
        }
        const id = notificationId(channelId, eventKey, templateKey, recipientRole);
        const current = await this.repository.getRecord(channelId, 'notification', id);
        if (current) return { record: current, duplicate: true };
        const now = this.now();
        const readiness = this.provider.readiness(templateKey);
        const record = normalizeNotification({
            id,
            eventKey,
            templateKey,
            recipientRole,
            recipientPhone,
            variables: event.variables,
            fallbackText: event.fallbackText,
            status: readiness.ready ? 'queued' : 'configuration_pending',
            attempts: 0,
            nextAttemptAt: new Date(now).toISOString(),
            expiresAt: new Date(now + 72 * 60 * 60 * 1000).toISOString(),
            lastError: readiness.ready ? '' : `설정 대기: ${readiness.missing.join(', ')}`
        });
        return { record: await this.repository.upsertRecord(channelId, 'notification', record), duplicate: false };
    }

    async list(channelId, limit = 200) {
        return (await this.repository.listRecords(channelId, 'notification'))
            .sort((left, right) => String(right.createdAt || '').localeCompare(String(left.createdAt || '')))
            .slice(0, Math.max(1, Math.min(1000, Number(limit) || 200)));
    }

    health() {
        return { running: this.running, ...this.provider.status() };
    }

    async flushChannel(channelId, limit = 20) {
        if (this.running) return { skipped: true, processed: 0 };
        this.running = true;
        let processed = 0;
        try {
            const now = this.now();
            const candidates = (await this.repository.listRecords(channelId, 'notification'))
                .filter((record) => ['queued', 'configuration_pending', 'failed'].includes(record.status)
                    || (record.status === 'sending' && (!record.nextAttemptAt || Date.parse(record.nextAttemptAt) <= now)))
                .filter((record) => !record.nextAttemptAt || Date.parse(record.nextAttemptAt) <= now)
                .sort((left, right) => String(left.createdAt || '').localeCompare(String(right.createdAt || '')))
                .slice(0, Math.max(1, Math.min(100, Number(limit) || 20)));
            for (const current of candidates) {
                if (current.expiresAt && Date.parse(current.expiresAt) <= now) {
                    await this.repository.upsertRecord(channelId, 'notification', normalizeNotification({ ...current, status: 'expired' }, current));
                    processed += 1;
                    continue;
                }
                const readiness = this.provider.readiness(current.templateKey);
                if (!readiness.ready) {
                    await this.repository.upsertRecord(channelId, 'notification', normalizeNotification({
                        ...current,
                        status: 'configuration_pending',
                        lastError: `설정 대기: ${readiness.missing.join(', ')}`,
                        nextAttemptAt: new Date(now + 60_000).toISOString()
                    }, current));
                    processed += 1;
                    continue;
                }
                const sending = await this.repository.upsertRecord(channelId, 'notification', normalizeNotification({
                    ...current,
                    status: 'sending',
                    attempts: (Number(current.attempts) || 0) + 1,
                    lastError: '',
                    nextAttemptAt: new Date(now + 2 * 60_000).toISOString()
                }, current));
                try {
                    const result = await this.provider.send(sending);
                    await this.repository.upsertRecord(channelId, 'notification', normalizeNotification({
                        ...sending,
                        status: 'sent',
                        providerMessageId: result.messageId,
                        providerGroupId: result.groupId,
                        sentAt: new Date(this.now()).toISOString(),
                        nextAttemptAt: ''
                    }, sending));
                } catch (error) {
                    const configurationPending = error.code === 'CONFIGURATION_PENDING';
                    const attempts = Number(sending.attempts) || 1;
                    const backoffMs = Math.min(30 * 60_000, 15_000 * Math.pow(2, Math.min(6, attempts - 1)));
                    await this.repository.upsertRecord(channelId, 'notification', normalizeNotification({
                        ...sending,
                        status: configurationPending ? 'configuration_pending' : 'failed',
                        lastError: error.message,
                        nextAttemptAt: new Date(this.now() + (configurationPending ? 60_000 : backoffMs)).toISOString()
                    }, sending));
                    this.logger.warn?.('[checkout-notification] delivery failed', channelId, current.id, error.message);
                }
                processed += 1;
            }
            return { skipped: false, processed };
        } finally {
            this.running = false;
        }
    }
}

module.exports = {
    CheckoutNotificationService,
    NhnCloudAlimtalkProvider,
    NOTIFICATION_STATUSES,
    SolapiAlimtalkProvider,
    TEMPLATE_KEYS,
    createDefaultAlimtalkProvider,
    normalizeNotification,
    notificationId,
    parseTemplateIds,
    safeVariables,
    solapiAuthorization
};
