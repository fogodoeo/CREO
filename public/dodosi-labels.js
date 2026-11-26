(function (root, factory) {
    const api = factory();
    if (typeof module === 'object' && module.exports) module.exports = api;
    else root.CreoDodosiLabels = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
    'use strict';
    const text = value => String(value ?? '').trim();
    const phone = value => text(value).replace(/\D/g, '');
    const SIDE_ORDER = ['departure', 'arrival'];
    function sides(selection = SIDE_ORDER) {
        return SIDE_ORDER.filter(side => Array.isArray(selection) && selection.includes(side));
    }
    const isDodosi = item => item.shipping_type !== '직접수령' && ['도도시', 'dodosi'].includes(text(item.shipping_company).toLowerCase());
    const date = value => /^\d{4}-\d{2}-\d{2}$/.test(value || '') && Number.isFinite(Date.parse(value + 'T00:00:00Z')) && new Date(value + 'T00:00:00Z').toISOString().slice(0, 10) === value;
    function ticket(item, state, senderOverride, selection) {
        const groups = (state?.groups || []).filter(g => g.items.some(i => i.id === item._platformItemId));
        const group = groups.length === 1 ? groups[0] : null;
        const s = group?.schedule || {};
        const scheduleReady = state?.fresh && s.status === 'estimated' && date(s.dropoffDate) && date(s.arrivalDate) && s.arrivalDate >= s.dropoffDate;
        const shipment = item._checkoutShipment || {};
        const sender = senderOverride || state?.sender || {};
        const members = [...(group?.items || [])].sort((a, b) => text(a.lot).localeCompare(text(b.lot), 'ko', {numeric:true}));
        const result = {
            kind: 'dodosi_ticket', sides: sides(selection), lot_number: text(group?.items.find(i => i.id === item._platformItemId)?.lot || item.name),
            origin: text(state?.originName), sender_name: text(sender.name), sender_phone: phone(sender.phone),
            destination: text(group?.shop || item.shipping_region),
            winner_name: text(group?.name || shipment.recipientName), winner_phone: phone(group?.phone || shipment.recipientPhone),
            dropoff_date: scheduleReady ? text(s.dropoffDate) : '',
            arrival_date: scheduleReady ? text(s.arrivalDate) : '',
            broadcast_date: text(item.attributes?.broadcastDate || item.attributes?.vendor_entry?.broadcastDate || state?.broadcastDate),
            bundle_lots: members.map(m => text(m.lot)),
            bundle_index: members.findIndex(m => m.id === item._platformItemId)
        };
        const errors = [];
        if (!result.sides.length) errors.push('출력할 쪽을 선택해 주세요');
        if (!group) errors.push('도도시 배송 정보 확인 필요');
        if (!result.lot_number) errors.push('개체번호 필요');
        if (!date(result.broadcast_date)) errors.push('방송일 확인 필요');
        if (!members.length || members.length > 12 || members.some(m => !text(m.lot)) || members.length !== group?.quantity) errors.push('합배송 개체번호 확인 필요 (최대 12칸)');
        if (!result.origin || !result.sender_name || !/^01\d{8,9}$/.test(result.sender_phone)) errors.push('보내는 분 설정 필요');
        if (!result.destination || !result.winner_name || !/^01\d{8,9}$/.test(result.winner_phone)) errors.push('받는 분·정거샵 확인 필요');
        const warnings = scheduleReady ? [] : ['배송 일정 미확인 · 날짜 없이 출력합니다'];
        return { payload: result, errors, warnings };
    }
    function shortDate(value, weekday = true) {
        return date(value) ? `${+value.slice(5, 7)}/${+value.slice(8)}${weekday ? '(' + ['일','월','화','수','목','금','토'][new Date(value + 'T00:00:00Z').getUTCDay()] + ')' : ''}` : '일정 확인';
    }
    const esc = s => text(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
    function preview(result) {
        const p = result.payload;
        const field = (cls, value, size) => `<div class="${cls}" data-ticket-size="${size}"><span>${esc(value)}</span></div>`;
        const side = departure => {
            const tel = departure ? p.sender_phone : p.winner_phone;
            return `<div class="dodosi-label-side"><div class="dodosi-side-caption">${departure ? '① 왼쪽 · 출발' : '② 오른쪽 · 도착'}</div><div class="dodosi-label-paper${departure ? '' : ' is-arrival'}">`
                + (departure ? '' : '<div class="dt-lots" data-ticket-size="30"><span>'
                + p.bundle_lots.map((lot, index) => `<span class="dt-lot${index === p.bundle_index ? ' is-current' : ''}"${index === p.bundle_index ? ' aria-label="' + esc(lot + ', 현재 개체') + '"' : ''}>${esc(lot)}</span>`).join(' · ')
                + '</span></div>')
                + field('dt-main', ((departure ? p.origin : p.destination) || '입력 필요').replace(/^(\[[^\]]+\])\s*/, '$1\n'), 48)
                + field('dt-recipient', (departure ? p.sender_name : p.winner_name) || '이름 확인', 44)
                + field('dt-phone', tel || '연락처 확인', 39)
                + field('dt-date', (departure ? p.dropoff_date : p.arrival_date) ? shortDate(departure ? p.dropoff_date : p.arrival_date, departure) : '', 50)
                + (departure ? '' : field('dt-broadcast', shortDate(p.broadcast_date, false) + ' 방송', 20)) + '</div></div>';
        };
        const selected = sides(p.sides);
        return '<div class="dodosi-label-pair' + (selected.length === 1 ? ' is-single' : '') + '">' + selected.map(value => side(value === 'departure')).join('') + '</div>'
            + ([...result.errors, ...(result.warnings || [])].length ? '<p class="dodosi-label-warning" role="status">' + esc([...result.errors, ...(result.warnings || [])].join(' · ')) + '</p>' : '');
    }
    function physicalCount(items, selection) { return items.reduce((n, item) => n + (isDodosi(item) ? sides(selection).length : 1), 0); }
    return { isDodosi, ticket, shortDate, preview, physicalCount, sides };
});
