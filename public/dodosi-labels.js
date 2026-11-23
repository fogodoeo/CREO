(function (root, factory) {
    const api = factory();
    if (typeof module === 'object' && module.exports) module.exports = api;
    else root.CreoDodosiLabels = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
    'use strict';
    const text = value => String(value ?? '').trim();
    const phone = value => text(value).replace(/\D/g, '');
    const isDodosi = item => item.shipping_type !== '직접수령' && ['도도시', 'dodosi'].includes(text(item.shipping_company).toLowerCase());
    const date = value => /^\d{4}-\d{2}-\d{2}$/.test(value || '') && Number.isFinite(Date.parse(value + 'T00:00:00Z')) && new Date(value + 'T00:00:00Z').toISOString().slice(0, 10) === value;
    function ticket(item, state) {
        const groups = (state?.groups || []).filter(g => g.items.some(i => i.id === item._platformItemId));
        const group = groups.length === 1 ? groups[0] : null;
        const s = group?.schedule || {};
        const shipment = item._checkoutShipment || {};
        const result = {
            kind: 'dodosi_ticket', lot_number: text(group?.items.find(i => i.id === item._platformItemId)?.lot || item.name),
            origin: text(state?.originName), sender_name: text(state?.sender?.name), sender_phone: phone(state?.sender?.phone),
            destination: text(group?.shop || item.shipping_region),
            winner_name: text(group?.name || shipment.recipientName), winner_phone: phone(group?.phone || shipment.recipientPhone),
            dropoff_date: s.status === 'estimated' ? text(s.dropoffDate) : '',
            arrival_date: s.status === 'estimated' ? text(s.arrivalDate) : '',
            bundle_summary: group?.quantity > 1 ? '합배송 ' + group.quantity + '마리' : '단독 배송'
        };
        const errors = [];
        if (!group) errors.push('도도시 배송 정보 확인 필요');
        if (!result.lot_number) errors.push('개체번호 필요');
        if (!result.origin || !result.sender_name || !/^01\d{8,9}$/.test(result.sender_phone)) errors.push('보내는 분 설정 필요');
        if (!result.destination || !result.winner_name || !/^01\d{8,9}$/.test(result.winner_phone)) errors.push('받는 분·정거샵 확인 필요');
        if (!state?.fresh || !date(result.dropoff_date) || !date(result.arrival_date) || result.arrival_date < result.dropoff_date) errors.push('최신 배송 일정 확인 필요');
        return { payload: result, errors };
    }
    function shortDate(value) {
        return date(value) ? `${+value.slice(5, 7)}/${+value.slice(8)}(${['일','월','화','수','목','금','토'][new Date(value + 'T00:00:00Z').getUTCDay()]})` : '일정 확인';
    }
    const esc = s => text(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
    function preview(result) {
        const p = result.payload;
        const field = (cls, value, size) => `<div class="${cls}" data-ticket-size="${size}"><span>${esc(value)}</span></div>`;
        const side = departure => {
            const tel = departure ? p.sender_phone : p.winner_phone;
            return `<div class="dodosi-label-side"><div class="dodosi-side-caption">${departure ? '① 왼쪽 · 출발' : '② 오른쪽 · 도착'}</div><div class="dodosi-label-paper">`
                + field('dt-heading', departure ? '도도시 · 출발' : '도도시 · 도착', 28)
                + field('dt-lot', p.lot_number, 58)
                + field('dt-shop-label', departure ? '출발지' : '도착지', 22)
                + field('dt-shop', ((departure ? p.origin : p.destination) || '정거샵 확인').replace(/^(\[[^\]]+\])\s*/, '$1\n'), 39)
                + field('dt-person-label', departure ? '보내는 분' : '받는 분', 22)
                + field('dt-person', (departure ? p.sender_name : p.winner_name) || '이름 확인', 40)
                + field('dt-phone', tel.replace(/^(\d{3})(\d{3,4})(\d{4})$/, '$1-$2-$3') || '연락처 확인', 30)
                + field('dt-date-label', departure ? '맡기는 날 · 예정' : '찾는 날 · 도착 예정', 22)
                + field('dt-date', shortDate(departure ? p.dropoff_date : p.arrival_date), 44)
                + field('dt-bundle', p.bundle_summary, 22) + '</div></div>';
        };
        return '<div class="dodosi-label-pair">' + side(true) + side(false) + '</div>'
            + (result.errors.length ? '<p class="dodosi-label-warning" role="status">' + esc(result.errors.join(' · ')) + '</p>' : '');
    }
    function physicalCount(items) { return items.reduce((n, item) => n + (isDodosi(item) ? 2 : 1), 0); }
    return { isDodosi, ticket, shortDate, preview, physicalCount };
});
