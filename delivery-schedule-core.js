'use strict';

const DAY = 86400000;
const DAYS = '일월화수목금토';
const compact = value => String(value || '').normalize('NFKC').replace(/[\s()[\]·-]/g, '').toLowerCase();
function date(value) {
    const raw = String(value || '');
    if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) return '';
    const parsed = new Date(raw + 'T00:00:00Z');
    return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === raw ? raw : '';
}
function add(value, count) { return new Date(Date.parse(value + 'T00:00:00Z') + count * DAY).toISOString().slice(0, 10); }
function weekday(value) { return new Date(value + 'T00:00:00Z').getUTCDay(); }
function weekdays(value) {
    const raw = String(value || '').replace(/요일/g, '').replace(/\([^)]*\)/g, '').trim();
    if (!raw || !/^[일월화수목금토\s/,·.]+$/.test(raw)) return [];
    return [...new Set([...raw].filter(c => DAYS.includes(c)).map(c => DAYS.indexOf(c)))];
}
function region(value) {
    const raw = String(value || '');
    if (/제주/.test(raw)) return 'jeju';
    if (/서울|경기|인천|수도/.test(raw)) return 'capital';
    if (/충청|충남|충북|대전|세종/.test(raw)) return 'chungcheong';
    if (/전라|전남|전북|광주/.test(raw)) return 'jeolla';
    if (/강원/.test(raw)) return 'gangwon';
    if (/경상|경남|경북|대구|부산|울산/.test(raw)) return 'gyeongsang';
    return '';
}
function normalizeConfig(input) {
    if (!input || typeof input !== 'object') return null;
    const clean = value => String(value || '').replace(/[\u0000-\u001f]/g, '').trim().slice(0, 100);
    return {
        enabled: input.enabled === true,
        auctionDate: date(input.auctionDate),
        pargeOrigin: clean(input.pargeOrigin || '크레오 대구본점'),
        dodosiOrigin: clean(input.dodosiOrigin || '크레용(대구)'),
        pargeDispatchDate: date(input.pargeDispatchDate),
        dodosiDispatchDate: date(input.dodosiDispatchDate)
    };
}
function inVacation(value, shop) {
    return shop?.vacationStart && shop?.vacationEnd && value >= shop.vacationStart && value <= shop.vacationEnd;
}
function unique(rows, predicate) { const found = (rows || []).filter(predicate); return found.length === 1 ? found[0] : null; }
function nextDay(start, allowed, { include = false, weeks = [], shop = null } = {}) {
    for (let offset = include ? 0 : 1; offset <= 62; offset++) {
        const candidate = add(start, offset);
        if (!allowed.includes(weekday(candidate))) continue;
        if (weeks.length && !weeks.includes(Math.ceil(Number(candidate.slice(-2)) / 7))) continue;
        if (inVacation(candidate, shop)) continue;
        return candidate;
    }
    return '';
}
function review(reason, source) { return { status: 'review', reason, checkedAt: source?.checkedAt || '' }; }

// Pure projection: never writes shipments, payment, notifications, or auction state.
function estimate({ config: rawConfig, carrier, destination, source, submittedAt = '', now = Date.now() }) {
    const config = normalizeConfig(rawConfig);
    if (!config?.enabled || !['parge', 'dodosi'].includes(carrier) || !destination?.shop) return null;
    if (!config.auctionDate) return review('configuration', source);
    if (!source || !Number.isFinite(Date.parse(source.checkedAt)) || now - Date.parse(source.checkedAt) > 3 * DAY || Date.parse(source.checkedAt) > now + 60000) return review('schedule_unavailable', source);
    let origin, target, collectDays, arrivalDays, transitDays = 1, arrivalWeeks = [];
    if (carrier === 'parge') {
        origin = unique(source.partners, p => compact(p.name) === compact(config.pargeOrigin));
        target = unique(source.partners, p => compact(p.name) === compact(destination.shop) && region(p.region) === region(destination.region));
        if (!origin || !target) return review('location', source);
        const originOverride = unique(source.schedules, r => compact(r.partnerName) === compact(origin.name));
        const originDefault = unique(source.schedules, r => !r.partnerName && region(r.region) === region(origin.region));
        collectDays = weekdays(originOverride?.collectDayLabel || originDefault?.collectDayLabel);
        const targetOverride = unique(source.schedules, r => compact(r.partnerName) === compact(target.name));
        arrivalDays = targetOverride?.deliveryDayLabel ? weekdays(targetOverride.deliveryDayLabel) : source.regionDays?.[region(target.region)] || [];
        if (!targetOverride?.deliveryDayLabel) {
            if (/대구|구미|평택/.test(target.name)) arrivalDays = [2];
            else if (/진주|논산/.test(target.name)) arrivalDays = [0];
        }
        if (region(origin.region) === 'jeju' || region(target.region) === 'jeju') {
            if (!source.jejuSaturdayFrom) return review('jeju_schedule', source);
            if (region(target.region) === 'jeju') arrivalDays = [6];
            // Jeju's collection and flight can be on the same Saturday.
            if (region(origin.region) === 'jeju') { collectDays = [6]; transitDays = 0; }
        }
    } else {
        origin = unique(source.origins, p => compact(p.name) === compact(config.dodosiOrigin));
        if (!origin) return review('location', source);
        target = unique(origin.destinations, p => compact(p.label) === compact(destination.shop) && compact(p.route) === compact(destination.region));
        if (!target) return review('location', source);
        collectDays = origin.collectDays;
        arrivalDays = target.arrivalDays;
        transitDays = target.transitDays;
        arrivalWeeks = target.arrivalWeeks || [];
        if (!Number.isInteger(transitDays) || transitDays < 0 || transitDays > 14) return review('transit', source);
    }
    if (!collectDays?.length || !arrivalDays?.length) return review('schedule_unavailable', source);
    const override = config[carrier + 'DispatchDate'];
    let dispatchDate = override || nextDay(config.auctionDate, collectDays, { weeks: origin.collectWeeks || [], shop: origin });
    if (!dispatchDate || dispatchDate <= config.auctionDate || inVacation(dispatchDate, origin)) return review('dispatch', source);
    // An explicit operator dispatch date can reflect a provider-confirmed special run.
    const submittedDate = submittedAt && Number.isFinite(Date.parse(submittedAt)) ? new Date(Date.parse(submittedAt) + 9 * 3600000).toISOString().slice(0, 10) : '';
    if (submittedDate && submittedDate >= dispatchDate && !override) return review('late_registration', source);
    let earliest = add(dispatchDate, transitDays);
    if (carrier === 'parge' && (region(origin.region) === 'jeju' || region(target.region) === 'jeju') && earliest < source.jejuSaturdayFrom) earliest = source.jejuSaturdayFrom;
    let arrivalDate = nextDay(earliest, arrivalDays, { include: true, weeks: arrivalWeeks });
    if (!arrivalDate) return review('arrival', source);
    if (carrier === 'dodosi' && target.closedDays?.includes(weekday(arrivalDate))) arrivalDate = add(arrivalDate, -1);
    if (arrivalDate < earliest || arrivalDate < dispatchDate || inVacation(arrivalDate, target)) return review('holiday_or_route', source);
    return { status: 'estimated', dispatchDate, arrivalDate, checkedAt: source.checkedAt };
}

module.exports = { DAY, compact, date, add, weekday, weekdays, region, normalizeConfig, nextDay, estimate };
