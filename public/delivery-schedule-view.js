(function (global) {
    'use strict';
    function format(value) {
        if (!/^\d{4}-\d{2}-\d{2}$/.test(value || '')) return '';
        const parsed = new Date(value + 'T00:00:00Z');
        if (!Number.isFinite(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== value) return '';
        return `${Number(value.slice(5, 7))}.${Number(value.slice(8, 10))}(${['일','월','화','수','목','금','토'][parsed.getUTCDay()]})`;
    }
    function html(schedule) {
        if (!schedule) return '';
        const dispatch = format(schedule.dispatchDate), arrival = format(schedule.arrivalDate);
        if (schedule.status !== 'estimated' || !dispatch || !arrival) return '<p class="delivery-schedule-pending">배송 일정 확인 중</p>';
        return `<dl class="delivery-schedule"><div><dt>발송 예정</dt><dd><time datetime="${schedule.dispatchDate}">${dispatch}</time></dd></div><div><dt>수령 예정</dt><dd><time datetime="${schedule.arrivalDate}">${arrival}</time></dd></div></dl>`;
    }
    global.CreoDeliverySchedule = Object.freeze({ html, format });
})(window);
