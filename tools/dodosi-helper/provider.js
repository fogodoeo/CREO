/* Read-only Dodosi adapter. No cookie extraction and no order/payment action. */
async function creoDodosiRead({ originId, originName = '', full = true, destinationId = '', quantity = 1 } = {}) {
  if (location.origin !== 'https://www.dodosi.co.kr' || location.pathname !== '/order') throw Error('로그인한 도도시 배송 예약 화면을 열어 주세요.');
  const records = text => text.split('\n').flatMap(line => { try { return [JSON.parse(line.slice(line.indexOf(':') + 1))]; } catch { return []; } });
  const flight = html => [...html.matchAll(/self\.__next_f\.push\((\[.*?\])\)<\/script>/g)].map(m => { try { const r = JSON.parse(m[1]); return r[0] === 1 ? r[1] : ''; } catch { return ''; } }).join('');
  const get = async (url, options = {}) => { const r = await fetch(url, { ...options, signal: AbortSignal.timeout(20000) }); if (!r.ok || r.redirected) throw Error('도도시 로그인과 연결을 확인해 주세요.'); return r.text(); };
  const html = await get('/order'), rows = records(flight(html));
  const props = rows.find(r => Array.isArray(r) && Array.isArray(r[3]?.shops) && 'accountDiscountBp' in r[3])?.[3];
  if (!props || !Number.isInteger(props.accountDiscountBp)) throw Error('로그인 계정의 배송 예약 화면을 확인해 주세요.');
  const estimateRows = records(flight(await get('/estimate')));
  const directory = estimateRows.find(r => Array.isArray(r) && Array.isArray(r[3]?.shops))?.[3].shops || [];
  const mapRows = records(flight(await get('/map')));
  const mapShops = mapRows.find(r => Array.isArray(r) && Array.isArray(r[3]?.shops))?.[3].shops || [];
  const shops = props.shops.map(({ id, label }) => { const place=mapShops.find(s=>s.id===id);return { id, label, region: directory.find(s => s.id === id)?.region || label.match(/^\[([^/\]]+)/)?.[1] || '', address:place?.address||'',hours:place?.hoursKnown?place.hours:'',off:Array.isArray(place?.off)?place.off:[] }; });
  if (!originId && originName) { const norm=s=>s.replace(/[\s()[\]·-]/g,'');const matches=shops.filter(s=>norm(s.label.replace(/^\[[^\]]+\]\s*/,''))===norm(originName));if(matches.length===1)originId=matches[0].id; }
  if (shops.length < 20 || !shops.some(s => s.id === originId)) throw Error('출발 정거샵을 다시 선택해 주세요.');
  const actions = {};
  for (const path of [...new Set([...html.matchAll(/src="(\/_next\/static\/chunks\/[a-zA-Z0-9_.-]+\.js)"/g)].map(m => m[1]))]) {
    const js = await get(path);
    for (const name of ['deliverableAction', 'scheduleAction', 'quoteAction']) {
      const id = js.match(new RegExp('createServerReference\\)\\("([a-f0-9]{40,64})",[^()]{0,180}?"' + name + '"\\)'))?.[1];
      if (id) actions[name] = id;
    }
    if (Object.keys(actions).length === 3) break;
  }
  if (Object.keys(actions).length !== 3) throw Error('도도시 예약 화면이 변경됐어요. 입력 도구 업데이트가 필요합니다.');
  const call = async (name, args) => {
    const text = await get('/order', { method: 'POST', headers: { 'Next-Action': actions[name], 'Content-Type': 'text/plain;charset=UTF-8' }, body: JSON.stringify(args) });
    const result = records(text).find(r => r && typeof r.ok === 'boolean');
    if (!result?.ok) throw Error('예약 가능한 노선·날짜를 확인하지 못했습니다.');
    return result;
  };
  const allowed = new Map();
  async function deliverable(from) { if (!allowed.has(from)) { const ids = (await call('deliverableAction', [from])).value; if (!Array.isArray(ids) || ids.some(id => !shops.some(s => s.id === id))) throw Error('정거샵 목록이 변경됐습니다.'); allowed.set(from, ids); } return allowed.get(from); }
  async function route(from, to, count = 1) {
    if (!(await deliverable(from)).includes(to)) return { from, to, available: false, slots: [] };
    const slots = (await call('scheduleAction', [from, to])).value;
    const quote = (await call('quoteAction', [from, to, count])).quote;
    if (!Array.isArray(slots) || !quote || !Number.isSafeInteger(quote.total)) throw Error('일정 또는 요금 응답이 변경됐습니다.');
    return { from, to, available: true, slots, quote, quantity: count };
  }
  if (!full) return { ...(await route(originId, destinationId, quantity)), discountBp: props.accountDiscountBp, checkedAt: new Date().toISOString() };
  const jobs = shops.filter(s => s.id !== originId).flatMap(s => [[originId, s.id], [s.id, originId]]), routes = [];
  let next = 0;
  await Promise.all([0, 1].map(async () => { while (next < jobs.length) { const [from, to] = jobs[next++]; routes.push(await route(from, to)); } }));
  return { schema: 'creo.dodosi.routes.v1', checkedAt: new Date().toISOString(), origin: originId, discountBp: props.accountDiscountBp, shops, routes };
}
if (typeof module === 'object') module.exports = { creoDodosiRead };
