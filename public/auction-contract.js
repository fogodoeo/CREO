(function (root, factory) {
    'use strict';
    const contract = factory();
    if (typeof module === 'object' && module.exports) module.exports = contract;
    if (root) root.CreoAuctionContract = contract;
}(typeof globalThis !== 'undefined' ? globalThis : this, function () {
    'use strict';

    const STATUS = Object.freeze({
        WAITING: 'waiting',
        LIVE: 'live',
        SOLD: 'sold',
        PASSED: 'passed',
        CANCELLED: 'cancelled'
    });

    function normalizedText(value) {
        return String(value == null ? '' : value).trim().toLowerCase();
    }

    function normalizeStatus(value) {
        const status = normalizedText(value);
        if (!status || status === '대기') return STATUS.WAITING;
        if (status === 'sold' || status === '완료' || status.includes('낙찰')) return STATUS.SOLD;
        if (status === 'passed' || status === 'unsold' || status.includes('유찰')) return STATUS.PASSED;
        if (status === 'cancelled' || status === 'canceled' || status.includes('취소')) return STATUS.CANCELLED;
        if (status === 'live' || status === 'active' || status.includes('진행') || status.includes('경매')) return STATUS.LIVE;
        return STATUS.WAITING;
    }

    function isSoldStatus(value) {
        return normalizeStatus(value) === STATUS.SOLD;
    }

    function isLiveStatus(value) {
        return normalizeStatus(value) === STATUS.LIVE;
    }

    function isTerminalStatus(value) {
        const status = normalizeStatus(value);
        return status === STATUS.SOLD || status === STATUS.PASSED || status === STATUS.CANCELLED;
    }

    function parseAmount(value) {
        const normalized = String(value == null ? '' : value).replace(/,/g, '').replace(/[^0-9.-]/g, '');
        return Number.parseFloat(normalized) || 0;
    }

    function parseChecklist(value) {
        const result = {};
        String(value || '').split('|').forEach(function (part) {
            const index = part.indexOf(':');
            if (index > 0) result[part.slice(0, index).trim()] = part.slice(index + 1).trim();
        });
        return result;
    }

    function checklistMeta(itemOrChecklist) {
        const item = itemOrChecklist && typeof itemOrChecklist === 'object' ? itemOrChecklist : null;
        const pairs = parseChecklist(item ? item.checklist : itemOrChecklist);
        const tournamentCode = String(pairs._slot || '').trim().toUpperCase();
        return {
            auctionType: String(pairs._auction || '').trim().toLowerCase(),
            visibilityMode: String(pairs._visibility || '').trim().toLowerCase(),
            tournamentCode,
            teamCode: String(pairs._team || (tournamentCode ? tournamentCode.charAt(0) : '')).trim().toUpperCase(),
            tournamentStage: Number.parseInt(pairs._stage, 10) || 0,
            publicNumber: Number.parseInt(pairs._label || (item ? item.num : ''), 10) || 0
        };
    }

    return Object.freeze({
        STATUS,
        normalizeStatus,
        isSoldStatus,
        isLiveStatus,
        isTerminalStatus,
        parseAmount,
        parseChecklist,
        checklistMeta
    });
}));
