'use strict';
const crypto = require('node:crypto');
const KEY = 'creo_v2::dodosi_route_cache';
const DAY = 86400000;
const compact = s => String(s || '').normalize('NFKC').replace(/[\s()[\]·-]/g, '').toLowerCase();
const day = s => /^\d{4}-\d{2}-\d{2}$/.test(s || '') && Number.isFinite(Date.parse(s + 'T00:00:00Z')) && new Date(s + 'T00:00:00Z').toISOString().slice(0, 10) === s;
const today = now => new Date(now + 9 * 3600000).toISOString().slice(0, 10);
const name = s => s.label.replace(/^\[[^\]]+\]\s*/, '');
const error = message => Object.assign(new Error(message), { status: 422 });
function validate(input, now = Date.now()) {
  if (input?.schema !== 'creo.dodosi.routes.v1' || !Number.isFinite(Date.parse(input.checkedAt)) || Date.parse(input.checkedAt) > now + 60000 || now - Date.parse(input.checkedAt) > DAY) throw error('오늘 도도시에서 갱신한 자료가 필요합니다.');
  if (!Array.isArray(input.shops) || input.shops.length < 20 || input.shops.length > 1000) throw error('정거샵 목록을 확인해 주세요.');
  const shops = input.shops.map(s => {
    if (!/^[a-f\d-]{36}$/.test(s.id) || typeof s.label !== 'string' || !s.label || s.label.length > 180 || typeof s.region !== 'string' || s.region.length > 50) throw error('정거샵 정보가 올바르지 않습니다.');
    return { id: s.id, label: s.label, region: s.region };
  });
  const ids = new Set(shops.map(s => s.id));
  if (ids.size !== shops.length || !ids.has(input.origin) || !Number.isInteger(input.discountBp) || input.discountBp < 0 || input.discountBp > 10000) throw error('출발지·할인 정보가 올바르지 않습니다.');
  if (!Array.isArray(input.routes) || input.routes.length !== (shops.length - 1) * 2) throw error('왕복 노선 전체를 갱신해 주세요.');
  const seen = new Set();
  const routes = input.routes.map(r => {
    const key = r.from + ':' + r.to;
    if (!ids.has(r.from) || !ids.has(r.to) || r.from === r.to || (r.from !== input.origin && r.to !== input.origin) || seen.has(key) || typeof r.available !== 'boolean') throw error('노선이 중복되거나 잘못됐습니다.');
    seen.add(key);
    if (!Array.isArray(r.slots) || r.slots.length > 30 || (!r.available && r.slots.length)) throw error('예약 날짜를 확인해 주세요.');
    const slots = r.slots.map(s => {
      if (!day(s.dropoff) || !day(s.pickup) || !day(s.arrival) || s.dropoff > s.pickup || s.pickup > s.arrival || Date.parse(s.arrival) - Date.parse(s.dropoff) > 21 * DAY) throw error('맡김·수거·도착 날짜를 확인해 주세요.');
      return { dropoff: s.dropoff, pickup: s.pickup, arrival: s.arrival };
    }).sort((a, b) => a.dropoff.localeCompare(b.dropoff));
    if (new Set(slots.map(s => s.dropoff)).size !== slots.length) throw error('맡김일이 중복됩니다.');
    let quote = null;
    if (r.available) {
      const q = r.quote;
      if (r.quantity !== 1 || !q || ['base', 'zoneSurcharge', 'petSurcharge', 'total'].some(k => !Number.isSafeInteger(q[k]) || q[k] < 0 || q[k] > 1000000) || q.petSurcharge !== 0 || q.total !== q.base + q.zoneSurcharge) throw error('배송 요금이 올바르지 않습니다.');
      quote = Object.fromEntries(['base', 'zoneSurcharge', 'petSurcharge', 'total'].map(k => [k, q[k]]));
    }
    return { from: r.from, to: r.to, available: r.available, slots, quote, quantity: 1 };
  });
  return { schema: input.schema, checkedAt: input.checkedAt, origin: input.origin, discountBp: input.discountBp, shops, routes };
}
function fresh(data, now = Date.now()) { const age = now - Date.parse(data?.checkedAt); return Number.isFinite(age) && age >= -60000 && age <= 3 * DAY; }
function match(data, shop, region = '') {
  const matches = (data?.shops || []).filter(s => {
    const area=s.label.match(/^\[([^\]]+)\]/)?.[1]?.replace(/\//g,' ')||'';
    return [name(s),s.label,area+' - '+name(s)].some(alias=>compact(alias)===compact(shop)) && (!region || compact(s.region) === compact(region) || compact(s.label.match(/^\[([^/\]]+)/)?.[1]) === compact(region));
  });
  return matches.length === 1 ? matches[0] : null;
}
function outbound(data, config, destination, submittedAt, now = Date.now()) {
  const review = reason => ({ status: 'review', reason, checkedAt: data?.checkedAt || '' });
  if (!day(config?.auctionDate)) return review('configuration');
  if (!fresh(data, now)) return review('schedule_unavailable');
  const origin = match(data, config.dodosiOrigin), target = destination.providerShopId ? data.shops.find(s => s.id === destination.providerShopId) : match(data, destination.shop, destination.region);
  if (!origin || !target) return review('location');
  const route = data.routes.find(r => r.from === origin.id && r.to === target.id);
  if (!route?.available) return review('route_unavailable');
  const registered = Number.isFinite(Date.parse(submittedAt)) ? today(Date.parse(submittedAt)) : today(now);
  const slot = route.slots.find(s => s.dropoff > config.auctionDate && s.dropoff >= registered && (!config.dodosiDispatchDate || s.pickup === config.dodosiDispatchDate));
  if (!slot) return review('schedule_unavailable');
  return { status: 'estimated', dropoffDate: slot.dropoff, dispatchDate: slot.pickup, arrivalDate: slot.arrival, checkedAt: data.checkedAt, sameDayDropoff: slot.dropoff === today(now) };
}
function inbound(data, originId, targetId, broadcastDate, now = Date.now()) {
  if (!fresh(data, now)) return { status: 'review', reason: 'schedule_unavailable' };
  const route = data.routes.find(r => r.from === originId && r.to === targetId && r.available);
  const eligible = (route?.slots || []).filter(s => s.dropoff >= today(now) && s.arrival < broadcastDate);
  const slot = eligible.sort((a, b) => b.dropoff.localeCompare(a.dropoff))[0];
  if (!slot) return { status: 'review', reason: 'no_prebroadcast_arrival' };
  return { status: 'estimated', dropoffDate: slot.dropoff, dispatchDate: slot.pickup, arrivalDate: slot.arrival, checkedAt: data.checkedAt, sameDayDropoff: slot.dropoff === today(now) };
}
function createStore(repository, now = () => Date.now()) {
  let saved = null, loading;
  async function load() { if (!loading) loading = repository.getRowsByKeys([KEY]).then(rows => { saved = JSON.parse(rows[0]?.value || '{"origins":{}}'); }).catch(e => { loading = null; throw e; }); await loading; return saved; }
  async function get(originName = '크레용(대구)') { const all = await load(); return Object.values(all.origins || {}).find(d => compact(name(d.shops.find(s => s.id === d.origin))) === compact(originName)) || null; }
  async function put(input) {
    const clean = validate(input, now()), all = await load();
    if (Date.parse(all.origins[clean.origin]?.checkedAt) > Date.parse(clean.checkedAt)) throw Object.assign(Error('더 최근 일정이 저장되어 있습니다.'), { status: 409 });
    const next = { origins: { ...all.origins, [clean.origin]: clean } };
    await repository.upsertRows([{ key: KEY, value: JSON.stringify(next) }, { key: 'runtime_config_version', value: crypto.randomUUID() }]); saved = next; return { checkedAt: clean.checkedAt, shops: clean.shops.length, routes: clean.routes.filter(r => r.available).length };
  }
  return { get, put, revision: () => Object.values(saved?.origins || {}).map(d => d.checkedAt + (fresh(d, now()) ? '' : ':stale')).join('|') };
}
module.exports = { KEY, validate, fresh, match, outbound, inbound, createStore, today, name };
