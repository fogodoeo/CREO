'use strict';
const Core = require('./delivery-schedule-core');
const Rates = require('./shipping-rate-refresh');
const clean = value => String(value ?? '').replace(/&nbsp;|&#160;/g, ' ').replace(/&amp;/g, '&')
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16))).replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();

function createSourceReader(fetchImpl = globalThis.fetch) {
    async function request(url, options = {}) {
        const host = new URL(url).hostname;
        if (!['parge.co.kr', 'www.dodosi.co.kr', 'sheets.googleapis.com'].includes(host)) throw new Error('Unsupported schedule source');
        const response = await fetchImpl(url, { ...options, redirect: 'error', signal: options.signal ? AbortSignal.any([options.signal, AbortSignal.timeout(15000)]) : AbortSignal.timeout(15000) });
        if (!response.ok) throw new Error(`${host}: HTTP ${response.status}`);
        if (Number(response.headers.get('content-length')) > 3_000_000) throw new Error('Schedule response too large');
        const reader = response.body.getReader();
        let size = 0;
        const chunks = [];
        try {
            for (;;) {
                const { done, value } = await reader.read();
                if (done) break;
                size += value.byteLength;
                if (size > 3_000_000) throw new Error('Schedule response too large');
                chunks.push(value);
            }
        } finally { await reader.cancel().catch(() => {}); }
        return Buffer.concat(chunks).toString('utf8');
    }
    const json = async (url, options) => JSON.parse(await request(url, options));
    function budget(milliseconds, signal) {
        const timer = AbortSignal.timeout(milliseconds);
        const joined = signal ? AbortSignal.any([signal, timer]) : timer;
        return { text: (url, options = {}) => request(url, { ...options, signal: joined }), json: (url, options = {}) => json(url, { ...options, signal: joined }) };
    }
    async function parge(_origins, options = {}) {
        const get = budget(45000, options.signal);
        const partnersResult = await get.json('https://parge.co.kr/api/partners');
        const scheduleResult = await get.json('https://parge.co.kr/api/delivery-schedules');
        const guide = clean(await get.text('https://parge.co.kr/guide'));
        const partners = (partnersResult.partners || []).filter(p => p.isActive !== false).map(p => ({ name: clean(p.name), region: clean(p.region) }));
        const schedules = (scheduleResult.schedules || []).filter(r => r.isActive).map(r => ({
            region: clean(r.region), partnerName: clean(r.partnerName), collectDayLabel: clean(r.collectDayLabel), deliveryDayLabel: clean(r.deliveryDayLabel)
        }));
        if (partners.length < 20 || partners.length > 1000 || schedules.length < 5 || schedules.length > 2000) throw new Error('Invalid PARGE schedule data');
        // Fail closed when the audited weekly table changes, including its column order.
        if (!/월요일 화요일 수요일 목요일 금요일 토요일 일요일 수거 \(수도권\/경상권\) 충청\/구미\/대구 배송 경상권 배송 수도권 배송 강원 배송 제주 배송 \(토 에어·당일 도착\) 전라도\/진주\/논산 배송/.test(guide)) throw new Error('PARGE weekly route changed');
        const booking = await get.text('https://parge.co.kr/booking');
        const paths = [...new Set([...booking.matchAll(/\/_next\/static\/chunks\/[^"']+\.js/g)].map(m => m[0]))];
        if (!paths.length || paths.length > 30 || paths.some(p => !/^\/_next\/static\/chunks\/(?:[a-zA-Z0-9_-]+\/)*[a-zA-Z0-9_.-]+\.js$/.test(p))) throw new Error('PARGE rate source changed');
        paths.sort((a, b) => Number(b.includes('/app/booking/')) - Number(a.includes('/app/booking/')));
        let matrix;
        for (const path of paths) {
            const chunk = await get.text('https://parge.co.kr' + path);
            try { matrix = Rates.extractMatrix([chunk]); break; } catch { /* Continue to the next public bundle. */ }
        }
        if (!matrix) throw new Error('PARGE rate matrix unavailable');
        const ratePayload = Rates.buildPargePayload(partnersResult, matrix);
        if (Object.values(ratePayload.data).flat().some(p => !Number.isSafeInteger(p.cost) || p.cost <= 0)) throw new Error('PARGE price is invalid');
        return { ratePayload, partners, schedules, regionDays: { capital: [4], chungcheong: [2], jeolla: [0], gyeongsang: [3], gangwon: [5] },
            jejuSaturdayFrom: guide.includes('토 에어') && guide.includes('당일 도착') ? '2026-09-19' : '' };
    }
    function optionRows(html) {
        return [...html.matchAll(/selectRequireOption\('prod',\s*\d+,\s*'([^']+)',\s*'([^']+)',\s*'([^']*)'/g)].map(m => ({ value_type: 'SELECT', option_code: m[1], value_code: m[2], value_name: clean(m[3]) }));
    }
    function shopRow(row) {
        return { name: clean(row[0]), area: clean(row[1]), collectDays: Core.weekdays(row[2]), closedDays: Core.weekdays(row[3]),
            vacationStart: Core.date(String(row[4] || '').replaceAll('/', '-')), vacationEnd: Core.date(String(row[5] || '').replaceAll('/', '-')),
            collectWeeks: String(row[6] || '').split(',').filter(Boolean).map(Number) };
    }
    async function dodosi(originNames, options = {}) {
        const get = budget(90000, options.signal);
        const html = await get.text('https://www.dodosi.co.kr/113');
        const id = html.match(/const spreadsheetId\s*=\s*'([a-zA-Z0-9_-]+)'/)?.[1];
        const key = html.match(/const apiKey\s*=\s*'([a-zA-Z0-9_-]+)'/)?.[1];
        if (!id || !key) throw new Error('DODOSI schedule source changed');
        const sheets = {};
        for (const range of ['dodosiShopData!A2:G', 'dodosiEditData!A2:C', 'dodosiDeliveryData!A2:G']) {
            const result = await get.json(`https://sheets.googleapis.com/v4/spreadsheets/${id}/values/${encodeURIComponent(range)}?key=${key}`);
            if (!Array.isArray(result.values) || result.values.length > 2000) throw new Error('Invalid DODOSI schedule table');
            sheets[range.split('!')[0]] = result.values;
        }
        const shops = sheets.dodosiShopData.map(shopRow);
        if (shops.length < 20) throw new Error('Incomplete DODOSI shop table');
        const origins = [], names = [...new Set(originNames)], rateItems = [];
        if (names.length > 8) throw new Error('Too many DODOSI departure schedules');
        for (const name of names) {
            const matches = shops.filter(p => Core.compact(p.name) === Core.compact(name));
            if (matches.length !== 1) continue;
            const origin = matches[0];
            const city = origin.area.split('[')[0].replace(/^(경기|경남|경북|충남|충북)\s*/, '');
            // The current directory uses an unambiguous departure-group label for these cities.
            const groups = [...new Set(sheets.dodosiDeliveryData.filter(r => clean(r[1]).replace(/출발$/, '') === city || clean(r[2]).split(/,\s*/).includes(city)).map(r => r[1]))];
            if (groups.length !== 1) continue;
            const routes = sheets.dodosiDeliveryData.filter(r => r[1] === groups[0]);
            if (!routes.length || routes.length > 24) throw new Error('Invalid DODOSI route count');
            const destinations = [];
            for (const route of routes) {
                if (!/^\/shop_view\?idx=\d+$/.test(route[5])) throw new Error('Invalid DODOSI product reference');
                const idx = route[5].split('=')[1];
                const url = 'https://www.dodosi.co.kr' + route[5];
                const product = await get.text(url);
                const edit = product.match(/"prod_edit_time"\s*:\s*"?([^,"}]+)/)?.[1];
                if (!edit) throw new Error('DODOSI product is unavailable');
                async function options(selected = []) {
                    const form = new URLSearchParams({ type: 'prod', prod_idx: idx, '__': edit });
                    selected.forEach((row, i) => Object.entries(row).forEach(([k, v]) => form.append(`selected_require_options[${i}][${k}]`, v)));
                    const payload = await get.json('https://www.dodosi.co.kr/shop/load_option.cm', { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded; charset=UTF-8', 'x-requested-with': 'XMLHttpRequest', referer: url }, body: form });
                    if (!payload.option_html) throw new Error('DODOSI options unavailable');
                    return { rows: optionRows(payload.option_html), html: payload.option_html };
                }
                const first = (await options()).rows.filter(o => Core.compact(o.value_name.split('//')[0].split('-').slice(1).join('-')) === Core.compact(origin.name));
                if (first.length !== 1) throw new Error('DODOSI departure cannot be matched');
                const second = (await options(first)).rows.find(o => o.value_name.replace(/\s/g, '') === '1마리');
                if (!second) throw new Error('DODOSI quantity option unavailable');
                const finalOptions = await options([first[0], second]);
                const last = finalOptions.rows.filter(o => o.value_name.includes('//찾는날-'));
                if (!last.length) throw new Error('DODOSI destination options unavailable');
                if (Core.compact(origin.name) === Core.compact('크레용(대구)')) {
                    const start = finalOptions.html.lastIndexOf('도착&nbsp;샵&nbsp;선택');
                    const prices = Rates.requiredValuesWithPrice(finalOptions.html.slice(Math.max(0, start)))
                        .map(value => Rates.parseDodosiDestination(value, route[3].replace(/도착$/, ''), Number(idx))).filter(Boolean);
                    if (prices.length !== last.length || prices.some(p => !Number.isSafeInteger(p.price) || p.price <= 0)) throw new Error('DODOSI prices are incomplete');
                    rateItems.push(...prices);
                }
                for (const option of last) {
                    const [address, label] = option.value_name.split('//찾는날-');
                    const separator = address.indexOf('-'), area = address.slice(0, separator), shopName = address.slice(separator + 1);
                    let matched = shops.filter(p => Core.compact(p.name) === Core.compact(shopName));
                    if (matched.length > 1) {
                        const exact = matched.filter(p => Core.compact(p.area) === Core.compact(area));
                        matched = exact.length ? exact : matched.filter(p => Core.compact(p.area.split('[')[0]) === Core.compact(area.split('[')[0]));
                    }
                    if (matched.length !== 1) throw new Error(`DODOSI destination cannot be matched: ${area} / ${shopName}`);
                    const exception = sheets.dodosiEditData.find(r => origin.area.includes(r[0]) && r[1] === shopName);
                    const transitDays = exception ? Number(exception[2]) : 1;
                    if (!Core.weekdays(label).length || !Number.isInteger(transitDays)) throw new Error('Invalid DODOSI arrival rule');
                    destinations.push({ ...matched[0], label: `${area.replace(/[\[\]]/g, ' ').replace(/\s+/g, ' ').trim()} - ${shopName}`,
                        route: route[3].replace(/도착$/, ''), arrivalDays: Core.weekdays(label), transitDays,
                        arrivalWeeks: /제주/.test(area) ? [2, 4] : [] });
                }
            }
            origins.push({ ...origin, destinations });
        }
        if (!origins.length) throw new Error('DODOSI departure schedule unavailable');
        return { origins, ...(rateItems.length ? { ratePayload: { updated: new Date().toLocaleString('ko-KR', { timeZone: 'Asia/Seoul' }), source: 'dodosi-public-options', items: rateItems } } : {}) };
    }
    return { parge, dodosi };
}
module.exports = { createSourceReader };
