'use strict';

const fs = require('node:fs/promises');
const path = require('node:path');

const IS_RENDER = Boolean(process.env.RENDER || process.env.RENDER_SERVICE_ID || process.env.RENDER_EXTERNAL_URL);
const DEFAULT_STATUS_FILE = IS_RENDER
    ? '/var/data/band-monitor/runtime.json'
    : path.join(__dirname, '.band-monitor', 'runtime.json');

function cleanText(value, maxLength = 200) {
    return String(value ?? '').replace(/[\u0000-\u001f\u007f]/g, ' ').trim().slice(0, maxLength);
}

function maskPhones(value, maxLength = 200) {
    return cleanText(value, maxLength).replace(
        /(?<!\d)01[016789](?:[\s./_-]*\d){7,8}(?!\d)/g,
        (match) => {
            const digits = match.replace(/\D/g, '');
            return digits.length >= 7 ? `${digits.slice(0, 3)}-****-${digits.slice(-4)}` : '***';
        }
    );
}

function normalizeBandMonitorStatus(value, now = Date.now()) {
    const source = value && typeof value === 'object' ? value : {};
    const applications = source.applications && typeof source.applications === 'object'
        ? source.applications
        : {};
    const phoneVerification = source.phone_verification && typeof source.phone_verification === 'object'
        ? source.phone_verification
        : {};
    const memberSync = source.member_sync && typeof source.member_sync === 'object'
        ? source.member_sync
        : {};
    const authSession = source.auth_session && typeof source.auth_session === 'object'
        ? source.auth_session
        : {};
    const lastAction = source.last_action && typeof source.last_action === 'object'
        ? source.last_action
        : null;
    const lastSync = memberSync.last_result && typeof memberSync.last_result === 'object'
        ? memberSync.last_result
        : null;
    const safeCount = (key) => Math.max(0, Math.min(100000, Number.parseInt(applications[key], 10) || 0));
    const updatedAt = cleanText(source.updated_at, 80);
    const updatedMs = Date.parse(updatedAt);
    const ageSeconds = Number.isFinite(updatedMs)
        ? Math.max(0, Math.floor((now - updatedMs) / 1000))
        : null;
    const state = cleanText(source.state || 'UNKNOWN', 40).toUpperCase();
    const authTarget = cleanText(authSession.target_url, 220);
    const safeAuthTarget = /^https:\/\/(?:[a-z0-9-]+\.)?band\.us\/band\/\d+\/applications\/?$/i.test(authTarget)
        ? authTarget
        : '';
    const cookieSource = cleanText(authSession.cookie_source, 20);

    return {
        version: cleanText(source.version, 40),
        updated_at: updatedAt || null,
        age_seconds: ageSeconds,
        stale: state !== 'DISABLED' && (ageSeconds === null || ageSeconds > 35),
        state,
        detail: maskPhones(source.detail, 200),
        connected: Boolean(source.connected),
        monitor_enabled: Boolean(source.monitor_enabled),
        headless: Boolean(source.headless),
        auth_session: {
            cookie_count: Math.max(0, Math.min(50, Number.parseInt(authSession.cookie_count, 10) || 0)),
            installed_cookie_count: Math.max(0, Math.min(50, Number.parseInt(authSession.installed_cookie_count, 10) || 0)),
            cookie_source: ['json', 'header', 'snapshot'].includes(cookieSource) ? cookieSource : 'none',
            user_agent_mode: cleanText(authSession.user_agent_mode, 40),
            page: cleanText(authSession.page, 180),
            target_url: safeAuthTarget
        },
        auto_approve: Boolean(source.auto_approve),
        auto_reject: Boolean(source.auto_reject),
        follow_up_question: Boolean(source.follow_up_question),
        phone_verification: {
            enabled: Boolean(phoneVerification.enabled),
            require_verified: Boolean(phoneVerification.require_verified),
            require_number_match: Boolean(phoneVerification.require_number_match)
        },
        applications: {
            tracked: safeCount('tracked'),
            queued: safeCount('queued'),
            eligible: safeCount('eligible'),
            invalid: safeCount('invalid'),
            verification_pending: safeCount('verification_pending'),
            phone_mismatch: safeCount('phone_mismatch'),
            approved: safeCount('approved'),
            rejected: safeCount('rejected'),
            action_failed: safeCount('action_failed')
        },
        last_action: lastAction ? {
            type: cleanText(lastAction.type, 24),
            success: Boolean(lastAction.success),
            at: cleanText(lastAction.at, 80) || null
        } : null,
        member_sync: {
            enabled: Boolean(memberSync.enabled),
            configured: Boolean(memberSync.configured),
            pending: Math.max(0, Math.min(100000, Number.parseInt(memberSync.pending, 10) || 0)),
            interval_seconds: Math.max(5, Math.min(
                86400,
                Number.parseInt(memberSync.interval_seconds, 10) || 300
            )),
            outbox_persistent: memberSync.outbox_persistent !== false,
            last_result: lastSync ? {
                result: cleanText(lastSync.result, 60),
                success: Boolean(lastSync.success),
                at: cleanText(lastSync.at, 80) || null
            } : null
        }
    };
}

function createBandMonitorStatusReader(options = {}) {
    const statusFile = options.statusFile || process.env.BAND_MONITOR_STATUS_FILE || DEFAULT_STATUS_FILE;
    const clock = typeof options.now === 'function' ? options.now : Date.now;
    return async function readBandMonitorStatus() {
        try {
            const raw = await fs.readFile(statusFile, 'utf8');
            return normalizeBandMonitorStatus(JSON.parse(raw), clock());
        } catch (error) {
            if (error.code !== 'ENOENT') console.warn('[band-monitor] status read failed:', error.message);
            return normalizeBandMonitorStatus({ state: 'UNKNOWN', connected: false }, clock());
        }
    };
}

module.exports = {
    DEFAULT_STATUS_FILE,
    createBandMonitorStatusReader,
    normalizeBandMonitorStatus
};
