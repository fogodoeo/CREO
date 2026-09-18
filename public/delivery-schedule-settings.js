'use strict';
function readDeliverySchedule() {
    const field = id => document.getElementById('schedule-' + id);
    return { enabled: field('enabled').checked, auctionDate: field('date').value,
        pargeOrigin: field('parge-origin').value.trim(), dodosiOrigin: field('dodosi-origin').value.trim(),
        pargeDispatchDate: field('parge-dispatch').value, dodosiDispatchDate: field('dodosi-dispatch').value };
}
function fillDeliverySchedule(channel) {
    const config = channel.shippingDefaults?.deliverySchedule || {};
    const field = id => document.getElementById('schedule-' + id);
    field('enabled').checked = config.enabled === true;
    field('date').value = config.auctionDate || '';
    field('date').required = config.enabled === true;
    field('parge-origin').value = config.pargeOrigin || '크레오 대구본점';
    field('dodosi-origin').value = config.dodosiOrigin || '크레용(대구)';
    field('parge-dispatch').value = config.pargeDispatchDate || '';
    field('dodosi-dispatch').value = config.dodosiDispatchDate || '';
}
document.addEventListener('DOMContentLoaded', () => {
    const enabled = document.getElementById('schedule-enabled');
    enabled.addEventListener('change', () => { document.getElementById('schedule-date').required = enabled.checked; });
});
