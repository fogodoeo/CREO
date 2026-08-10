'use strict';

const PROVIDERS = Object.freeze({ DODOSI: '도도시', PARGE: '파르게', REPPANG: '랩팡' });
const CACHE_MS = 60 * 1000;
const cache = new Map();
const inflight = new Map();

const DODOSI_ROUTES = [
    [1025, '부산'], [1026, '경상B'], [1028, '경상A'], [1029, '전라'], [1030, '강원'],
    [1031, '충청B'], [1032, '충청A'], [1033, '경기D'], [1034, '경기C'], [1035, '경기B'],
    [1036, '경기A'], [1037, '인천'], [1038, '서울B'], [1039, '서울A']
];

function text(value) {
    return String(value ?? '').replace(/&nbsp;|&#160;/gi, ' ').replace(/&amp;/g, '&')
        .replace(/&#x([0-9a-f]+);/gi, (_, hex) => String.fromCodePoint(parseInt(hex, 16)))
        .replace(/&#(\d+);/g, (_, dec) => String.fromCodePoint(Number(dec)))
        .replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
}

async function request(url, options = {}) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 20000);
    try {
        const response = await fetch(url, { ...options, signal: controller.signal });
        if (!response.ok) throw new Error(`${new URL(url).hostname} HTTP ${response.status}`);
        return response;
    } finally {
        clearTimeout(timer);
    }
}

async function getText(url) { return (await request(url)).text(); }
async function getJson(url) { return (await request(url, { headers: { accept: 'application/json' } })).json(); }

function optionCalls(html) {
    const rows = [];
    const pattern = /selectRequireOption\('prod',\s*\d+,\s*'([^']+)',\s*'([^']+)',\s*'([^']*)'/g;
    for (const match of html.matchAll(pattern)) {
        rows.push({ value_type: 'SELECT', option_code: match[1], value_code: match[2], value_name: text(match[3]) });
    }
    return rows;
}

function optionalValues(html) {
    const rows = [];
    const pattern = /selectOptionalOption\(\d+,\s*'[^']+',\s*'[^']+',\s*'([^']*)',[\s\S]*?<strong>\s*([\d,]+)원<\/strong>/g;
    for (const match of html.matchAll(pattern)) rows.push(`${text(match[1])} ${match[2]}원`);
    return rows;
}

function requiredValuesWithPrice(html) {
    const rows = [];
    const pattern = /selectRequireOption\('prod',\s*\d+,\s*'[^']+',\s*'[^']+',\s*'([^']*)',[\s\S]*?<strong>\s*\+?\s*([\d,]+)원<\/strong>/g;
    for (const match of html.matchAll(pattern)) rows.push(`${text(match[1])} ${match[2]}원`);
    return rows;
}

async function imwebProduct(base, productId) {
    const page = await getText(`${base}/shop_view?idx=${productId}`);
    const editTime = page.match(/"prod_edit_time"\s*:\s*"?([^,"}]+)/)?.[1];
    if (!editTime) throw new Error(`상품 ${productId}의 수정 키를 찾지 못했습니다.`);
    const load = async (selected = []) => {
        const form = new URLSearchParams({ type: 'prod', prod_idx: String(productId), '__': editTime });
        selected.forEach((option, index) => {
            for (const key of ['value_type', 'option_code', 'value_code', 'value_name']) {
                form.append(`selected_require_options[${index}][${key}]`, option[key] || '');
            }
        });
        const response = await request(`${base}/shop/load_option.cm`, {
            method: 'POST',
            headers: {
                'content-type': 'application/x-www-form-urlencoded; charset=UTF-8',
                'x-requested-with': 'XMLHttpRequest',
                referer: `${base}/shop_view?idx=${productId}`
            },
            body: form
        });
        const payload = await response.json();
        if (!payload.option_html) throw new Error(`상품 ${productId}의 옵션을 불러오지 못했습니다.`);
        return payload.option_html;
    };
    return { load };
}

function parseDodosiDestination(raw, route, idx) {
    const match = raw.match(/^(.+?)(?:\[([^\]]+)\])?-(.+?)\/\/찾는날-([^\d]+?)\s+([\d,]+)원$/);
    if (!match) return null;
    return {
        route, idx, region: match[1].trim(), sub: (match[2] || '').trim(), shop: match[3].trim(),
        day: match[4].trim().replace(/,\s*/g, '.'), price: Number(match[5].replace(/,/g, ''))
    };
}

async function refreshDodosiRoute([idx, route]) {
    const product = await imwebProduct('https://www.dodosi.co.kr', idx);
    const first = optionCalls(await product.load());
    const origin = first.find((row) => row.value_name.includes('렙타일아트'));
    if (!origin) throw new Error(`${route} 노선에서 대구 출발지를 찾지 못했습니다.`);
    const second = optionCalls(await product.load([origin]));
    const one = second.find((row) => row.value_name.replace(/\s/g, '') === '1마리');
    if (!one) throw new Error(`${route} 노선의 1마리 옵션을 찾지 못했습니다.`);
    const finalHtml = await product.load([origin, one]);
    const destinationStart = finalHtml.lastIndexOf('도착&nbsp;샵&nbsp;선택');
    return requiredValuesWithPrice(finalHtml.slice(Math.max(0, destinationStart)))
        .map((value) => parseDodosiDestination(value, route, idx)).filter(Boolean);
}

async function refreshDodosi() {
    const results = [];
    for (let offset = 0; offset < DODOSI_ROUTES.length; offset += 4) {
        const batch = await Promise.all(DODOSI_ROUTES.slice(offset, offset + 4).map(refreshDodosiRoute));
        results.push(...batch.flat());
    }
    if (results.length < 20) throw new Error(`도도시 거점이 ${results.length}개만 수집되어 적용하지 않았습니다.`);
    return { updated: new Date().toLocaleString('ko-KR', { timeZone: 'Asia/Seoul' }), source: 'dodosi-public-options', items: results };
}

function parseReppangValue(raw) {
    const match = raw.match(/^(.*?)\s*\((?:도착하는\s*날|도착하는날)\s*:\s*([^)]+)\)\s*([\d,]+)원$/);
    if (!match) return null;
    return { shop: match[1].trim(), day: match[2].trim(), cost: Number(match[3].replace(/,/g, '')) };
}

async function refreshReppang() {
    const product = await imwebProduct('https://www.reppang.co.kr', 17);
    const html = await product.load();
    const titlePattern = /<div class="option_title[^>]*>([\s\S]*?)<\/div>/g;
    const titles = [...html.matchAll(titlePattern)].map((match) => ({ index: match.index, name: text(match[1]) }));
    const groups = {
        '도착지(서울)': '서울', '도착지(경기 인천)': '경기/인천',
        '도착지(대전 충청)': '충청/대전', '도착지(대구 경북)': '대구/경북',
        '도착지(부산 울산 경남)': '부산/경남/울산', '도착지(전라)': '광주/전라', '도착지(제주)': '제주'
    };
    const data = Object.fromEntries(Object.values(groups).map((group) => [group, []]));
    titles.forEach((title, index) => {
        const cleanTitle = title.name.replace(/\s*도착지는.*$/, '').trim();
        const group = groups[cleanTitle];
        if (!group) return;
        const end = titles[index + 1]?.index ?? html.length;
        data[group].push(...optionalValues(html.slice(title.index, end)).map(parseReppangValue).filter(Boolean));
    });
    const total = Object.values(data).reduce((sum, rows) => sum + rows.length, 0);
    if (total < 20) throw new Error(`랩팡 거점이 ${total}개만 수집되어 적용하지 않았습니다.`);
    return { updated: new Date().toLocaleString('ko-KR', { timeZone: 'Asia/Seoul' }), source: 'reppang-public-options', data };
}

function normalizeName(value) { return String(value ?? '').normalize('NFKC').trim().replace(/\s+/g, ' '); }
function compact(value) { return normalizeName(value).replace(/\s/g, '').toLowerCase(); }
function partnerHub(partner) {
    const value = compact([partner.name, partner.address].filter(Boolean).join(' '));
    if (value.includes('제주')) return 'jeju'; if (value.includes('순천')) return 'suncheon'; if (value.includes('익산')) return 'iksan';
    if (value.includes('경기광주') || value.includes('경기도광주')) return 'sudo'; if (value.includes('광주')) return 'gwangju';
    if (value.includes('진주')) return 'jinju'; if (value.includes('창원') || value.includes('마산')) return 'changwon';
    if (value.includes('부산') || value.includes('김해') || value.includes('양산')) return 'busan'; if (value.includes('대구') && !value.includes('해운대구')) return 'daegu';
    if (value.includes('구미') || value.includes('레포리아')) return 'gumi'; if (value.includes('울산')) return 'ulsan';
    if (value.includes('경주')) return 'gyeongju'; if (value.includes('포항')) return 'pohang';
    if (value.includes('고성') || value.includes('강릉') || value.includes('동해')) return 'goseong_gangneung';
    if (value.includes('원주') || value.includes('춘천') || value.includes('강원')) return 'wonchun';
    if (['충청','대전','세종','청주','천안','아산','오송','오창'].some((word) => value.includes(word))) return 'chung';
    if (['서울','인천','경기','수원','용인','성남','고양','부천','평택','파주','안산','남양주'].some((word) => value.includes(word))) return 'sudo';
    const region = compact(partner.region); if (region.includes('제주')) return 'jeju'; if (region.includes('강원')) return 'wonchun';
    if (region.includes('전라')) return 'gwangju'; if (region.includes('경상') || region.includes('경북') || region.includes('경남')) return 'daegu';
    if (region.includes('충청')) return 'chung'; return 'sudo';
}

function groupForHub(hub) {
    if (hub === 'sudo') return '서울/경기/인천'; if (hub === 'chung') return '충청/대전';
    if (['gwangju','suncheon','iksan'].includes(hub)) return '전라/광주';
    if (['daegu','gumi','pohang','gyeongju','busan','ulsan','changwon','jinju'].includes(hub)) return '대구/경북/부산/경남';
    return ['wonchun','goseong_gangneung'].includes(hub) ? '강원도' : '제주도';
}

function extractMatrix(chunks) {
    for (const chunk of chunks) {
        const anchor = chunk.indexOf('sudo:{sudo:'); if (anchor < 0) continue;
        const start = chunk.lastIndexOf('{', anchor); let depth = 0; let end = -1;
        for (let i = start; i < chunk.length; i += 1) { if (chunk[i] === '{') depth += 1; if (chunk[i] === '}') depth -= 1; if (!depth) { end = i + 1; break; } }
        const literal = chunk.slice(start, end); const matrix = {};
        for (const row of literal.matchAll(/([a-z_]+):\{([^{}]+)\}/g)) { matrix[row[1]] = {}; for (const cell of row[2].matchAll(/([a-z_]+):(\d+(?:e\d+)?)/g)) matrix[row[1]][cell[1]] = Number(cell[2]); }
        if (matrix.daegu?.sudo && matrix.daegu?.jeju) return matrix;
    }
    throw new Error('파르게 가격표를 찾지 못했습니다.');
}

async function refreshParge() {
    const [partnersPayload, booking] = await Promise.all([getJson('https://parge.co.kr/api/partners'), getText('https://parge.co.kr/booking')]);
    const paths = [...new Set([...booking.matchAll(/\/_next\/static\/chunks\/[^"']+\.js/g)].map((match) => match[0]))];
    const matrix = extractMatrix(await Promise.all(paths.map((value) => getText(`https://parge.co.kr${value}`))));
    const blocked = ['대구곤충마트','레포리아 (익산)','정글숲 (포항)','크레노바 (창원)','오야지크레 (안양)','BLACK LABEL EXOTIC (대구)','다니엘렙타일 (오창)','트라이디거 하남 본점'].map(compact);
    const partners = partnersPayload.partners.filter((row) => row?.name && row.isActive !== false && !blocked.includes(compact(row.name))).sort((a,b) => a.name.localeCompare(b.name,'ko'));
    const data = Object.fromEntries(['서울/경기/인천','충청/대전','전라/광주','대구/경북/부산/경남','강원도','제주도'].map((group) => [group, []]));
    for (const partner of partners) { const hub = partnerHub(partner); data[groupForHub(hub)].push({ shop: partner.name, cost: matrix.daegu[hub] }); }
    if (partners.length < 50) throw new Error('파르게 거점 검증에 실패했습니다.');
    return { updated: new Date().toLocaleString('ko-KR', { timeZone: 'Asia/Seoul' }), source: 'parge-public-api', origin: '크레오 대구본점', data };
}

async function collect(company) {
    if (company === PROVIDERS.DODOSI) return refreshDodosi();
    if (company === PROVIDERS.PARGE) return refreshParge();
    if (company === PROVIDERS.REPPANG) return refreshReppang();
    throw Object.assign(new Error('지원하지 않는 배송사입니다.'), { status: 422 });
}

async function refreshShippingRate(company, { force = false } = {}) {
    const prior = cache.get(company);
    if (!force && prior && Date.now() - prior.at < CACHE_MS) return { ...prior.result, cached: true };
    if (inflight.has(company)) return inflight.get(company);
    const task = collect(company).then((payload) => {
        const count = Array.isArray(payload.items) ? payload.items.length : Object.values(payload.data || {}).reduce((sum, rows) => sum + rows.length, 0);
        const result = { company, count, payload, cached: false };
        cache.set(company, { at: Date.now(), result }); return result;
    }).finally(() => inflight.delete(company));
    inflight.set(company, task); return task;
}

module.exports = { PROVIDERS, refreshShippingRate };
