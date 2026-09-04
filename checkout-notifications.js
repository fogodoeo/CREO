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

const NOTIFICATION_TRANSPORTS = Object.freeze(['alimtalk', 'sms']);
const ACTION_SMS_TEMPLATE_KEYS = new Set([
    'buyer_win_initial',
    'buyer_win_additional',
    'vendor_win',
    'vendor_payment_reported',
    'buyer_card_link_ready'
]);

function notificationTransport(templateKey) {
    return ACTION_SMS_TEMPLATE_KEYS.has(templateKey) ? 'sms' : 'alimtalk';
}

function text(value, limit = 1000) {
    return String(value ?? '').replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, limit);
}

function messageText(value, limit = 2000) {
    return String(value ?? '')
        .replace(/\r\n?/g, '\n')
        .replace(/[\u0000-\u0009\u000b-\u001f\u007f]/g, ' ')
        .split('\n')
        .map((line) => line.replace(/[ \t]+/g, ' ').trim())
        .join('\n')
        .replace(/\n{3,}/g, '\n\n')
        .trim()
        .slice(0, limit);
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

function templateVariables(value = {}) {
    const result = safeVariables(value);
    return Object.fromEntries(Object.entries(result).map(([key, entry]) => [key.slice(2, -1), entry]));
}

function renderTemplate(content, variables = {}) {
    const safe = safeVariables(variables);
    let rendered = String(content || '');
    for (const [key, value] of Object.entries(safe)) rendered = rendered.split(key).join(value);
    return rendered;
}

function firstConfigured(...values) {
    return values.map((value) => String(value || '').trim()).find(Boolean) || '';
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
        transport: NOTIFICATION_TRANSPORTS.includes(input.transport)
            ? input.transport
            : (NOTIFICATION_TRANSPORTS.includes(current.transport) ? current.transport : notificationTransport(input.templateKey || current.templateKey)),
        recipientRole: ['buyer', 'vendor'].includes(input.recipientRole) ? input.recipientRole : current.recipientRole,
        recipientPhone: phone(input.recipientPhone || current.recipientPhone),
        variables: safeVariables(input.variables || current.variables),
        fallbackText: messageText(input.fallbackText || current.fallbackText, 2000),
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

class AligoNotificationProvider {
    constructor(options = {}) {
        this.apiKey = firstConfigured(options.apiKey, process.env.ALIGO_API_KEY);
        this.userId = firstConfigured(options.userId, process.env.ALIGO_USER_ID);
        this.senderKey = firstConfigured(options.senderKey, process.env.ALIGO_KAKAO_SENDER_KEY);
        this.from = phone(options.from || process.env.ALIGO_FROM_NUMBER || '');
        const definitions = parseTemplateIds(options.templates || process.env.ALIGO_KAKAO_TEMPLATES_JSON || '');
        const codes = parseTemplateIds(options.templateCodes || process.env.ALIGO_KAKAO_TEMPLATE_CODES_JSON || '');
        const contents = parseTemplateIds(options.templateContents || process.env.ALIGO_KAKAO_TEMPLATE_CONTENTS_JSON || '');
        this.templates = Object.fromEntries(TEMPLATE_KEYS.map((key) => {
            const definition = definitions[key];
            const normalized = definition && typeof definition === 'object' && !Array.isArray(definition) ? definition : {};
            return [key, {
                code: text(normalized.code || normalized.tplCode || codes[key], 120),
                subject: text(normalized.subject || normalized.name || '옹동2 안내', 100),
                content: String(normalized.content || contents[key] || ''),
                button: normalized.button && typeof normalized.button === 'object' ? normalized.button : null
            }];
        }));
        this.fetch = options.fetchImpl || globalThis.fetch;
        this.smsEndpoint = String(options.smsEndpoint || 'https://apis.aligo.in/send/');
        this.alimtalkEndpoint = String(options.alimtalkEndpoint || 'https://kakaoapi.aligo.in/akv10/alimtalk/send/');
        this.testMode = String(options.testMode ?? process.env.ALIGO_TEST_MODE ?? '').trim().toUpperCase() === 'Y';
    }

    readiness(templateKey, transport = notificationTransport(templateKey)) {
        const missing = [];
        if (!this.apiKey) missing.push('ALIGO_API_KEY');
        if (!this.userId) missing.push('ALIGO_USER_ID');
        if (!this.from) missing.push('ALIGO_FROM_NUMBER');
        if (transport === 'alimtalk') {
            if (!this.senderKey) missing.push('ALIGO_KAKAO_SENDER_KEY');
            if (!this.templates[templateKey]?.code) missing.push(`template:${templateKey}`);
            if (!this.templates[templateKey]?.content) missing.push(`content:${templateKey}`);
        }
        return { ready: missing.length === 0, missing };
    }

    status() {
        const templates = Object.fromEntries(TEMPLATE_KEYS.map((key) => [key, {
            transport: notificationTransport(key),
            ...this.readiness(key, notificationTransport(key))
        }]));
        return {
            provider: 'aligo',
            configured: Object.values(templates).every((entry) => entry.ready),
            smsConfigured: this.readiness('buyer_win_initial', 'sms').ready,
            profileConfigured: Boolean(this.senderKey),
            senderConfigured: Boolean(this.from),
            testMode: this.testMode,
            templates
        };
    }

    async send(notification) {
        const transport = NOTIFICATION_TRANSPORTS.includes(notification.transport)
            ? notification.transport
            : notificationTransport(notification.templateKey);
        const ready = this.readiness(notification.templateKey, transport);
        if (!ready.ready) {
            const error = new Error(`알리고 설정 대기: ${ready.missing.join(', ')}`);
            error.code = 'CONFIGURATION_PENDING';
            throw error;
        }
        if (transport === 'sms') return this.sendSms(notification);
        return this.sendAlimtalk(notification);
    }

    async sendSms(notification) {
        const message = messageText(notification.fallbackText, 2000);
        const params = new URLSearchParams({
            key: this.apiKey,
            user_id: this.userId,
            sender: this.from,
            receiver: notification.recipientPhone,
            msg: message,
            msg_type: Buffer.byteLength(message, 'utf8') <= 90 ? 'SMS' : 'LMS',
            title: '옹동2 안내',
            testmode_yn: this.testMode ? 'Y' : 'N'
        });
        const response = await this.fetch(this.smsEndpoint, {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8' },
            body: params.toString()
        });
        const payload = await response.json().catch(() => ({}));
        if (!response.ok || Number(payload.result_code) !== 1 || Number(payload.error_cnt || 0) > 0) {
            throw new Error(text(payload.message || `ALIGO SMS ${response.status}`, 500));
        }
        return {
            messageId: text(payload.msg_id, 120),
            groupId: notification.id,
            statusCode: text(payload.result_code, 40)
        };
    }

    async sendAlimtalk(notification) {
        const template = this.templates[notification.templateKey];
        const variables = templateVariables(notification.variables);
        const params = new URLSearchParams({
            apikey: this.apiKey,
            userid: this.userId,
            senderkey: this.senderKey,
            tpl_code: template.code,
            sender: this.from,
            receiver_1: notification.recipientPhone,
            recvname_1: text(variables.구매자명 || variables.업체명, 100),
            subject_1: template.subject,
            message_1: renderTemplate(template.content, notification.variables),
            failover: 'N',
            testMode: this.testMode ? 'Y' : 'N'
        });
        if (template.button) params.set('button_1', JSON.stringify(template.button));
        const response = await this.fetch(this.alimtalkEndpoint, {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8' },
            body: params.toString()
        });
        const payload = await response.json().catch(() => ({}));
        if (!response.ok || Number(payload.code) !== 0 || Number(payload.info?.fcnt || 0) > 0) {
            throw new Error(text(payload.message || `ALIGO 알림톡 ${response.status}`, 500));
        }
        return {
            messageId: text(payload.info?.mid, 120),
            groupId: notification.id,
            statusCode: text(payload.code, 40)
        };
    }
}

function createDefaultNotificationProvider() {
    return new AligoNotificationProvider();
}

class CheckoutNotificationService {
    constructor(options = {}) {
        if (!options.repository) throw new Error('repository is required');
        this.repository = options.repository;
        this.provider = options.provider || createDefaultNotificationProvider();
        this.logger = options.logger || console;
        this.now = options.now || (() => Date.now());
        this.running = false;
    }

    async enqueue(channelId, event = {}) {
        const templateKey = TEMPLATE_KEYS.includes(event.templateKey) ? event.templateKey : '';
        let transport = NOTIFICATION_TRANSPORTS.includes(event.transport) ? event.transport : notificationTransport(templateKey);
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
        let readiness = this.provider.readiness(templateKey, transport);
        if (!readiness.ready && transport === 'alimtalk' && event.allowSmsFallback !== false) {
            const smsReadiness = this.provider.readiness(templateKey, 'sms');
            if (smsReadiness.ready) {
                transport = 'sms';
                readiness = smsReadiness;
            }
        }
        const record = normalizeNotification({
            id,
            eventKey,
            templateKey,
            transport,
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
            for (const storedCurrent of candidates) {
                let current = normalizeNotification(storedCurrent, storedCurrent);
                if (current.expiresAt && Date.parse(current.expiresAt) <= now) {
                    await this.repository.upsertRecord(channelId, 'notification', normalizeNotification({ ...current, status: 'expired' }, current));
                    processed += 1;
                    continue;
                }
                let readiness = this.provider.readiness(current.templateKey, current.transport);
                if (!readiness.ready && current.transport === 'alimtalk') {
                    const smsReadiness = this.provider.readiness(current.templateKey, 'sms');
                    if (smsReadiness.ready) {
                        current = normalizeNotification({ ...current, transport: 'sms' }, current);
                        readiness = smsReadiness;
                    }
                }
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
    ACTION_SMS_TEMPLATE_KEYS,
    AligoNotificationProvider,
    CheckoutNotificationService,
    NOTIFICATION_STATUSES,
    TEMPLATE_KEYS,
    createDefaultNotificationProvider,
    notificationTransport,
    normalizeNotification,
    notificationId,
    messageText,
    parseTemplateIds,
    safeVariables
};
