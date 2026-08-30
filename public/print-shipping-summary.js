(function (root, factory) {
    var api = factory();
    if (typeof module === 'object' && module.exports) module.exports = api;
    else root.CreoPrintShippingSummary = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
    'use strict';

    function text(value) {
        return String(value == null ? '' : value).replace(/\s+/g, ' ').trim();
    }

    function digits(value) {
        return String(value == null ? '' : value).replace(/[^0-9]/g, '');
    }

    function number(value) {
        var parsed = Number(value);
        return Number.isFinite(parsed) ? Math.max(0, parsed) : 0;
    }

    function formatPhone(value) {
        var phone = digits(value);
        if (phone.length === 11) return phone.slice(0, 3) + '-' + phone.slice(3, 7) + '-' + phone.slice(7);
        if (phone.length === 10) return phone.slice(0, 3) + '-' + phone.slice(3, 6) + '-' + phone.slice(6);
        return phone;
    }

    function formatKoreanDateTime(value) {
        if (!value) return '';
        var date = new Date(value);
        if (Number.isNaN(date.getTime())) return text(value);
        var values = {};
        new Intl.DateTimeFormat('en-CA', {
            timeZone: 'Asia/Seoul',
            year: 'numeric',
            month: '2-digit',
            day: '2-digit',
            hour: '2-digit',
            minute: '2-digit',
            hourCycle: 'h23'
        }).formatToParts(date).forEach(function (part) {
            if (part.type !== 'literal') values[part.type] = part.value;
        });
        return values.year + '-' + values.month + '-' + values.day + ' ' + values.hour + ':' + values.minute;
    }

    function itemWon(item) {
        if (item.sold_amount_won != null && item.sold_amount_won !== '') return number(item.sold_amount_won);
        return number(item.soldPrice) * 10000;
    }

    function buyer(item) {
        return item._winner || { name: text(item.winner_name), phone: digits(item.winner_phone) };
    }

    function bundleKey(item) {
        var winner = buyer(item);
        var identity = winner.phone || text(winner.name).toLowerCase() || 'unknown';
        return text(item.company).toLowerCase() + '|' + identity;
    }

    function shippingDestination(item) {
        var method = text(item.shipping_type);
        var carrier = text(item.shipping_company);
        var address = text(item.shipping_region);
        if (method === '직접수령') return address || '직접수령';
        if (method !== '배송') return '';
        return [carrier, address].filter(Boolean).join(' · ') || '배송';
    }

    function newest(values) {
        return values.filter(Boolean).sort().at(-1) || '';
    }

    function paymentState(items, submitted) {
        var states = items.map(function (item) { return text(item.payment_status); }).filter(Boolean);
        if (states.length && items.every(function (item) { return text(item.payment_status) === 'paid'; })) return 'paid';
        if (states.includes('additional_payment')) return 'additional_payment';
        if (states.includes('on_site')) return 'on_site';
        if (states.includes('awaiting_payment')) return 'awaiting_payment';
        return submitted ? 'awaiting_payment' : 'awaiting_information';
    }

    function paymentLabel(state) {
        return ({
            paid: '결제 완료',
            additional_payment: '추가 결제',
            on_site: '현장 결제',
            awaiting_payment: '결제 대기',
            awaiting_information: '배송 미입력'
        })[state] || '확인 필요';
    }

    function paymentMethodLabel(method) {
        return ({ bank_transfer: '계좌이체', card: '카드결제', on_site: '현장결제' })[method] || '-';
    }

    function groupBundles(items) {
        var grouped = new Map();
        (items || []).forEach(function (item) {
            var key = bundleKey(item);
            if (!grouped.has(key)) grouped.set(key, []);
            grouped.get(key).push(item);
        });
        var rows = [];
        grouped.forEach(function (bundleItems, key) {
            bundleItems.sort(function (left, right) {
                return number(left.num) - number(right.num) || text(left.name).localeCompare(text(right.name), 'ko');
            });
            var first = bundleItems[0] || {};
            var winner = buyer(first);
            var submittedAt = newest(bundleItems.map(function (item) { return text(item.buyer_submitted_at); }));
            var hasShipping = bundleItems.some(function (item) { return Boolean(text(item.shipping_type) || text(item.shipping_region)); });
            var inputState = submittedAt ? 'buyer_submitted' : hasShipping ? 'operator_entered' : 'waiting';
            var destinations = Array.from(new Set(bundleItems.map(shippingDestination).filter(Boolean)));
            var methods = Array.from(new Set(bundleItems.map(function (item) { return text(item.payment_method); }).filter(Boolean)));
            var state = paymentState(bundleItems, Boolean(submittedAt) || hasShipping);
            rows.push({
                key: key,
                company: text(first.company),
                buyerName: text(winner.name),
                phone: digits(winner.phone),
                items: bundleItems,
                itemSummary: bundleItems.map(function (item) { return text(item.name) || String(item.num || ''); }).join(' · '),
                itemCount: bundleItems.length,
                combined: bundleItems.length > 1,
                soldAmountWon: bundleItems.reduce(function (sum, item) { return sum + itemWon(item); }, 0),
                shippingCost: bundleItems.reduce(function (sum, item) { return sum + number(item.shipping_cost); }, 0),
                requestedAmount: Math.max.apply(null, [0].concat(bundleItems.map(function (item) { return number(item.payment_requested_amount); }))),
                confirmedAmount: Math.max.apply(null, [0].concat(bundleItems.map(function (item) { return number(item.payment_confirmed_amount); }))),
                destination: destinations.join(' / '),
                destinationMismatch: destinations.length > 1,
                inputState: inputState,
                inputLabel: inputState === 'buyer_submitted' ? '입력 완료' : inputState === 'operator_entered' ? '운영자 입력' : '미입력',
                paymentState: state,
                paymentLabel: paymentLabel(state),
                paymentMethod: methods[0] || '',
                paymentMethodLabel: methods.length > 1 ? '혼합' : paymentMethodLabel(methods[0]),
                submittedAt: submittedAt
            });
        });
        var priority = { awaiting_information: 0, additional_payment: 1, awaiting_payment: 2, on_site: 3, paid: 4 };
        return rows.sort(function (left, right) {
            return (priority[left.paymentState] - priority[right.paymentState])
                || left.buyerName.localeCompare(right.buyerName, 'ko')
                || left.company.localeCompare(right.company, 'ko');
        });
    }

    function sheetRows(rows) {
        return [[
            '업체', '낙찰자', '연락처', '낙찰 개체', '개체 수', '합배송',
            '낙찰금', '배송비', '결제 요청액', '결제 확인액',
            '배송 입력', '결제 상태', '결제 수단', '수령지', '입력 시각'
        ]].concat((rows || []).map(function (row) {
            return [
                row.company, row.buyerName, formatPhone(row.phone), row.itemSummary, row.itemCount, row.combined ? '합배송' : '',
                row.soldAmountWon, row.shippingCost, row.requestedAmount, row.confirmedAmount,
                row.inputLabel, row.paymentLabel, row.paymentMethodLabel, row.destination, formatKoreanDateTime(row.submittedAt)
            ];
        }));
    }

    return {
        bundleKey: bundleKey,
        formatKoreanDateTime: formatKoreanDateTime,
        groupBundles: groupBundles,
        paymentLabel: paymentLabel,
        paymentMethodLabel: paymentMethodLabel,
        sheetRows: sheetRows,
        shippingDestination: shippingDestination
    };
});
