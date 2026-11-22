'use strict';
// Read-only public estimate screen. Never invokes order, payment or booking actions.
const Core = require('./delivery-schedule-core');
const BASE = 'https://www.dodosi.co.kr';
function flight(html) {
    return [...html.matchAll(/self\.__next_f\.push\((\[.*?\])\)<\/script>/g)].map(m => {
        try { const row = JSON.parse(m[1]); return row[0] === 1 && typeof row[1] === 'string' ? row[1] : ''; } catch { return ''; }
    }).join('');
}
function records(text) {
    return text.split('\n').flatMap(line => { try { return [JSON.parse(line.slice(line.indexOf(':') + 1))]; } catch { return []; } });
}
function shopsFrom(html) {
    const lists = records(flight(html)).filter(r => Array.isArray(r) && Array.isArray(r[3]?.shops)).map(r => r[3].shops);
    if (lists.length !== 1 || lists[0].length < 20 || lists[0].length > 1000) throw Error('DODOSI public directory changed');
    const shops = lists[0];
    if (shops.some(s => !/^[a-f\d-]{36}$/.test(s.id) || typeof s.label !== 'string' || !s.region) || new Set(shops.map(s => s.id)).size !== shops.length) throw Error('Invalid DODOSI public shops');
    return shops;
}
function shopName(label) { return label.replace(/^\[[^\]]+\]\s*/, '').trim(); }
function rateItem(shop, price) {
    const area = shop.label.match(/^\[([^\]]+)\]/)?.[1] || '';
    const [region, ...sub] = area.split('/');
    return { shop: shopName(shop.label), region, sub: sub.join(' '), route: shop.region, price, day: '', providerShopId: shop.id };
}
async function readModern(get, html, originNames) {
    const shops = shopsFrom(html), actions = {};
    const paths = [...new Set([...html.matchAll(/src="(\/_next\/static\/chunks\/[a-zA-Z0-9_.-]+\.js)"/g)].map(m => m[1]))];
    if (!paths.length || paths.length > 30) throw Error('DODOSI estimate scripts changed');
    for (const path of paths) {
        const script = await get.text(BASE + path);
        for (const name of ['deliverableAction', 'quoteAction']) {
            const re = new RegExp('createServerReference\\)\\("([a-f0-9]{40,64})",[^()]{0,180}?"' + name + '"\\)');
            const id = script.match(re)?.[1];
            if (id) actions[name] = id;
        }
        if (actions.deliverableAction && actions.quoteAction) break;
    }
    if (!actions.deliverableAction || !actions.quoteAction) throw Error('DODOSI public estimate actions changed');
    async function call(name, args) {
        const text = await get.text(BASE + '/estimate', { method: 'POST', headers: { 'Next-Action': actions[name], 'Content-Type': 'text/plain;charset=UTF-8', Origin: BASE }, body: JSON.stringify(args) });
        const rows = records(text).filter(r => r && typeof r.ok === 'boolean');
        if (rows.length !== 1 || !rows[0].ok) throw Error('DODOSI public estimate unavailable');
        return rows[0];
    }
    const names = [...new Set(originNames)];
    if (!names.length || names.length > 8) throw Error('Invalid DODOSI origins');
    const origins = [];
    for (const name of names) {
        const matches = shops.filter(s => Core.compact(shopName(s.label)) === Core.compact(name));
        if (matches.length !== 1) throw Error('DODOSI departure cannot be matched: ' + name);
        const origin = matches[0], ids = (await call('deliverableAction', [origin.id])).value;
        if (!Array.isArray(ids) || ids.length < 20 || ids.length > 1000 || new Set(ids).size !== ids.length || ids.some(id => !shops.some(s => s.id === id))) throw Error('Invalid DODOSI deliverable directory');
        const targets = ids.map(id => shops.find(s => s.id === id)), rates = new Array(targets.length);
        let next = 0;
        // Limit public traffic; a failed quote prevents publishing a partial rate table.
        await Promise.all(Array.from({ length: 3 }, async () => {
            while (next < targets.length) {
                const index = next++, target = targets[index];
                const result = await call('quoteAction', [origin.id, target.id, 1]), quote = result.quote;
                if (!quote || !Number.isSafeInteger(quote.total) || quote.total <= 0 || quote.total > 1000000 || quote.petSurcharge !== 0 || quote.total !== quote.base + quote.zoneSurcharge) throw Error('Invalid DODOSI quote: ' + target.label + ' ' + JSON.stringify(quote));
                rates[index] = rateItem(target, quote.total);
            }
        }));
        origins.push({ name, providerShopId: origin.id, destinations: [], rateItems: rates });
    }
    const main = origins.find(o => Core.compact(o.name) === Core.compact('크레용(대구)')) || origins[0];
    // The public quote does not publish collection/arrival dates. Do not turn old
    // weekday tables into freshly verified delivery promises.
    return { origins, scheduleUnavailable: true, ratePayload: { updated: new Date().toISOString(), source: 'dodosi-public-estimate', items: main.rateItems, origins: origins.map(o => ({ name: o.name, items: o.rateItems })) } };
}
module.exports = { readModern, flight, records, shopsFrom, rateItem };
