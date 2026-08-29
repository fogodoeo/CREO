(function (root, factory) {
    'use strict';
    const api = factory();
    if (typeof module === 'object' && module.exports) module.exports = api;
    else root.CreoBasicDice = api;
}(typeof globalThis !== 'undefined' ? globalThis : this, function () {
    'use strict';

    const GROUP_KEYS = Object.freeze(['odd', 'even']);
    const UNIFORM_WEIGHTS = Object.freeze([100 / 6, 100 / 6, 100 / 6, 100 / 6, 100 / 6, 100 / 6]);
    const MAX_COMEBACK_WEIGHTS = Object.freeze([8, 10, 13, 18, 23, 28]);

    function validGroupKey(value) {
        const key = String(value || '').trim().toLowerCase();
        return GROUP_KEYS.includes(key) ? key : '';
    }

    function contributionTotals(items = []) {
        const totals = { odd: 0, even: 0 };
        for (const item of Array.isArray(items) ? items : []) {
            if (String(item?.status || '').toLowerCase() !== 'sold') continue;
            const groupKey = validGroupKey(item?.attributes?.audience_group_key);
            if (!groupKey) continue;
            const contribution = Number(item?.attributes?.audience_contribution_amount);
            const points = Number(item?.points);
            const soldPrice = Number(item?.soldPrice);
            const amount = Number.isFinite(contribution) && contribution >= 0
                ? contribution
                : Number.isFinite(points) && points >= 0
                    ? points
                    : Math.max(0, Number.isFinite(soldPrice) ? soldPrice : 0);
            totals[groupKey] += amount;
        }
        return totals;
    }

    function comebackIntensity(groupKey, totals = {}) {
        const key = validGroupKey(groupKey);
        if (!key) return 0;
        const rivalKey = key === 'odd' ? 'even' : 'odd';
        const own = Math.max(0, Number(totals[key]) || 0);
        const rival = Math.max(0, Number(totals[rivalKey]) || 0);
        if (rival <= own || rival <= 0) return 0;
        return Math.min(1, (rival - own) / rival);
    }

    function balancedDiceWeights(groupKey, totals = {}) {
        const intensity = comebackIntensity(groupKey, totals);
        return UNIFORM_WEIGHTS.map((weight, index) =>
            weight + (MAX_COMEBACK_WEIGHTS[index] - weight) * intensity);
    }

    function chooseBalancedDiceFace(groupKey, totals = {}, randomInt = (maximum) => Math.floor(Math.random() * maximum)) {
        const weights = balancedDiceWeights(groupKey, totals);
        const maximum = 1_000_000;
        const sampled = Math.max(0, Math.min(maximum - 1, Number(randomInt(maximum)) || 0));
        let cursor = sampled / maximum * 100;
        for (let index = 0; index < weights.length; index += 1) {
            cursor -= weights[index];
            if (cursor < 0) return index + 1;
        }
        return 6;
    }

    function rankParityGroups(rows = []) {
        return (Array.isArray(rows) ? rows : []).slice().sort((left, right) => {
            const pointDifference = (Number(right?.points) || 0) - (Number(left?.points) || 0);
            if (pointDifference) return pointDifference;
            const orderDifference = (Number(left?.group?.sortOrder) || 0) - (Number(right?.group?.sortOrder) || 0);
            if (orderDifference) return orderDifference;
            return String(left?.group?.id || '').localeCompare(String(right?.group?.id || ''));
        });
    }

    function scoreFirstAt(position) {
        return Number(position) > 0;
    }

    return Object.freeze({
        MAX_COMEBACK_WEIGHTS,
        UNIFORM_WEIGHTS,
        balancedDiceWeights,
        chooseBalancedDiceFace,
        comebackIntensity,
        contributionTotals,
        rankParityGroups,
        scoreFirstAt
    });
}));
