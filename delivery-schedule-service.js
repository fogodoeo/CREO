'use strict';
const crypto = require('node:crypto');
const Core = require('./delivery-schedule-core');
const { channelKey } = require('./platform-core');
const { createSourceReader } = require('./delivery-schedule-source');
const KEY = 'creo_v2::delivery_schedule_sources';
const SETTINGS_KEY = 'creo_v2::shipping_refresh_settings', STATUS_KEY = 'creo_v2::shipping_refresh_status';
const SYSTEM_CHANNEL = 'shipping-system';
const carriers = ['parge', 'dodosi'], labels = { parge: '파르게', dodosi: '도도시' };
const hash = value => crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex').slice(0, 16);

function createDeliveryScheduleService({ repository, notificationService = null, reader = createSourceReader(), now = () => Date.now(), logger = console }) {
    let snapshot = {}, rates = {}, health = { providers: {} }, settings = { enabled: true, alertPhone: '' };
    let loaded, running, timer, interval, stopped = false, nextAttempt = 0;
    const controller = new AbortController(), configurations = new Map();
    async function load() {
        if (!loaded) loaded = (async () => {
            const rows = new Map((await repository.getRowsByKeys([KEY, SETTINGS_KEY, STATUS_KEY, ...carriers.map(c => 'shipping_rate_' + c)])).map(r => [r.key, r.value]));
            const read = key => { try { return JSON.parse(rows.get(key) || 'null'); } catch { return null; } };
            const saved = read(KEY);
            if (saved?.version === 1 && saved.sources && typeof saved.sources === 'object') snapshot = saved.sources;
            settings = { ...settings, ...read(SETTINGS_KEY) };
            health = { providers: {}, ...read(STATUS_KEY) };
            rates = Object.fromEntries(carriers.map(c => [c, read('shipping_rate_' + c)]));
        })().catch(error => { loaded = null; throw error; });
        return loaded;
    }
    function revision() {
        return Object.entries(snapshot).map(([id, row]) => `${id}:${row.revision}:${now() - Date.parse(row.checkedAt) > 3 * Core.DAY ? 'stale' : 'ready'}`).sort().join('|');
    }
    async function saveHealth() {
        const failed = carriers.filter(c => health.providers[c]?.failures > 0);
        const rows = [];
        if (!failed.length) { health.episode = ''; health.alertQueued = false; }
        else {
            health.episode ||= crypto.randomUUID();
            if (settings.enabled && settings.alertPhone && notificationService && !health.alertQueued && failed.some(c => health.providers[c].failures >= 3)) {
                const event = await notificationService.prepare(SYSTEM_CHANNEL, {
                    eventKey: 'shipping-refresh:' + health.episode, templateKey: 'shipping_data_refresh_failed', transport: 'sms',
                    recipientRole: 'operator', recipientPhone: settings.alertPhone,
                    fallbackText: '[옹동2] 배송정보 갱신 실패. 공용 배송 확인 필요'
                });
                if (!event.duplicate) rows.push({ key: channelKey(SYSTEM_CHANNEL, 'notification', event.record.id), value: JSON.stringify(event.record) });
                health.alertQueued = true;
            }
        }
        rows.push({ key: STATUS_KEY, value: JSON.stringify(health) });
        try { await repository.upsertRows(rows); } catch (error) { health.alertQueued = false; throw error; }
    }
    async function refresh({ forceCarrier = '' } = {}) {
        if (stopped) return;
        if (running) return running;
        if (!forceCarrier && now() < nextAttempt) return;
        nextAttempt = now() + 60000;
        running = (async () => {
            await load();
            if (!settings.enabled && !forceCarrier) return;
            const catalog = await repository.getCatalog();
            const channels = catalog.channels.filter(c => c.status === 'active' && c.dataAdapter === 'platform' && c.shippingDefaults?.deliverySchedule?.enabled);
            let attempted = false;
            for (const carrier of carriers) {
                if (stopped) break;
                const origins = carrier === 'dodosi' ? [...new Set(['크레용(대구)', ...channels.filter(c => c.shippingDefaults.enabledCarriers?.includes(carrier)).map(c => c.shippingDefaults.deliverySchedule.dodosiOrigin)])] : [];
                const prior = snapshot[carrier], status = health.providers[carrier] || {};
                const covered = carrier === 'parge' || origins.every(name => prior?.origins?.some(o => Core.compact(o.name) === Core.compact(name)));
                const age = now() - Date.parse(prior?.checkedAt);
                const forced = forceCarrier === carrier;
                if (prior && rates[carrier] && covered && age >= 0 && age < (forced ? 60000 : Core.DAY) && !status.failures) continue;
                if (!forced && (status.failures || covered) && Number(status.nextAttempt) > now()) continue;
                attempted = true;
                try {
                    const { ratePayload, ...data } = await reader[carrier](origins, { signal: controller.signal });
                    if (stopped) break;
                    const count = ratePayload?.items?.length ?? Object.values(ratePayload?.data || {}).reduce((sum, rows) => sum + rows.length, 0);
                    if (!count || count > 10000) throw new Error('Incomplete shipping rates');
                    const previousCount = rates[carrier]?.items?.length ?? Object.values(rates[carrier]?.data || {}).reduce((sum, rows) => sum + rows.length, 0);
                    if (previousCount >= 20 && count < previousCount * 0.75) throw new Error('Shipping directory unexpectedly shrank');
                    const record = { ...data, checkedAt: new Date(now()).toISOString(), revision: hash({ data, ratePayload }) };
                    const next = { ...snapshot, [carrier]: record };
                    const nextHealth = { ...health, providers: { ...health.providers, [carrier]: { failures: 0, checkedAt: record.checkedAt, nextAttempt: now() + Core.DAY } } };
                    // Rates and schedule are accepted together; existing customer fees are untouched.
                    await repository.upsertRows([
                        { key: KEY, value: JSON.stringify({ version: 1, sources: next }) },
                        { key: 'shipping_rate_' + carrier, value: JSON.stringify(ratePayload) },
                        { key: 'runtime_config_version', value: `${now().toString(36)}-${crypto.randomBytes(4).toString('hex')}` },
                        { key: STATUS_KEY, value: JSON.stringify(nextHealth) }
                    ]);
                    snapshot = next; rates[carrier] = ratePayload; health = nextHealth;
                } catch {
                    if (stopped) break;
                    const failures = Math.min(1000, (status.failures || 0) + 1);
                    health.providers[carrier] = { ...status, failures, failedAt: new Date(now()).toISOString(), nextAttempt: now() + (failures === 1 ? 60000 : failures === 2 ? 300000 : 3600000) };
                    logger.warn?.(`[shipping-refresh] ${carrier} refresh failed; saved data retained`);
                }
            }
            if (attempted && !stopped) await saveHealth();
        })().catch(() => logger.warn?.('[shipping-refresh] refresh/storage unavailable')).finally(() => { running = null; });
        return running;
    }
    function refreshSoon() {
        if (stopped || timer || running || now() < nextAttempt) return;
        timer = setTimeout(() => { timer = null; void refresh(); }, 50); timer.unref?.();
    }
    function checkConfiguration(channel, carrier) {
        const config = channel.shippingDefaults.deliverySchedule;
        const key = `${channel.id || hash(config)}:${carrier}`, fingerprint = hash(config);
        if (configurations.get(key) === fingerprint) return;
        configurations.set(key, fingerprint);
        if (configurations.size > 256) configurations.delete(configurations.keys().next().value);
        const covered = carrier === 'parge' ? snapshot.parge?.partners?.some(p => Core.compact(p.name) === Core.compact(config.pargeOrigin))
            : snapshot.dodosi?.origins?.some(p => Core.compact(p.name) === Core.compact(config.dodosiOrigin));
        if (!covered) { nextAttempt = 0; refreshSoon(); }
    }
    async function estimate(channel, selection, submittedAt = '') {
        if (!channel?.shippingDefaults?.deliverySchedule?.enabled || !selection) return null;
        const carrier = selection.destinationType;
        if (!carriers.includes(carrier)) return null;
        try { await load(); } catch { return Core.estimate({ config: channel.shippingDefaults.deliverySchedule, carrier, destination: { shop: selection.pargeShop }, now: now() }); }
        checkConfiguration(channel, carrier);
        if (!snapshot[carrier]) refreshSoon();
        return Core.estimate({ config: channel.shippingDefaults.deliverySchedule, carrier,
            destination: { region: selection.pargeRegion, shop: selection.pargeShop }, source: snapshot[carrier], submittedAt, now: now() });
    }
    async function enrichRates(channel, carrier, regions, submittedAt = '', selection = null) {
        if (!channel.shippingDefaults?.deliverySchedule?.enabled) return regions;
        try { await load(); } catch { /* Missing data produces a pending estimate, never blocks checkout. */ }
        checkConfiguration(channel, carrier);
        if (!snapshot[carrier]) refreshSoon();
        return regions.map(group => ({ ...group, shops: group.shops.map(shop => ({ ...shop, deliverySchedule: Core.estimate({
            config: channel.shippingDefaults.deliverySchedule, carrier, destination: { region: group.region, shop: shop.name },
            source: snapshot[carrier], submittedAt: selection?.destinationType === carrier && selection.pargeRegion === group.region && selection.pargeShop === shop.name
                ? submittedAt || new Date(now()).toISOString() : new Date(now()).toISOString(), now: now()
        }) })) }));
    }
    async function refreshCarrier(company) {
        const carrier = carriers.find(c => labels[c] === company);
        if (!carrier) throw new Error('Unsupported shipping provider');
        await refresh({ forceCarrier: carrier });
        if (!rates[carrier] || health.providers[carrier]?.failures) throw new Error('거점·요금·일정을 갱신하지 못했습니다. 기존 자료를 유지합니다.');
        const payload = rates[carrier];
        return { company, payload, count: payload.items?.length ?? Object.values(payload.data || {}).flat().length, persisted: true };
    }
    async function status() { await load(); return { ...settings, providers: structuredClone(health.providers), alertQueued: Boolean(health.alertQueued) }; }
    async function configure(input) {
        await load();
        const alertPhone = String(input.alertPhone || '').replace(/[^0-9]/g, '');
        if (alertPhone && !/^010\d{8}$/.test(alertPhone)) throw Object.assign(new Error('알림 수신번호를 확인해 주세요.'), { status: 422 });
        const next = { enabled: input.enabled === true, alertPhone };
        await repository.upsertRows([{ key: SETTINGS_KEY, value: JSON.stringify(next) }]);
        settings = next; nextAttempt = 0; refreshSoon(); return status();
    }
    async function assertAlertCurrent(notification) {
        await load();
        if (!settings.enabled || notification.recipientPhone !== settings.alertPhone || notification.eventKey !== 'shipping-refresh:' + health.episode || !carriers.some(c => health.providers[c]?.failures >= 3)) {
            throw Object.assign(new Error('복구되었거나 설정이 변경된 배송정보 갱신 알림입니다.'), { code: 'BUYER_LINK_INACTIVE' });
        }
    }
    function start() {
        if (interval || stopped) return;
        refreshSoon(); interval = setInterval(() => void refresh(), 60000); interval.unref?.();
    }
    async function stop() { stopped = true; clearInterval(interval); clearTimeout(timer); controller.abort(); if (running) await running; }
    return { load, refresh, refreshSoon, refreshCarrier, configure, status, assertAlertCurrent, estimate, enrichRates, revision, start, stop };
}
module.exports = { KEY, SETTINGS_KEY, STATUS_KEY, SYSTEM_CHANNEL, createDeliveryScheduleService };
