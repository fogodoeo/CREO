(function (root, factory) {
    'use strict';
    const api = factory();
    if (typeof module === 'object' && module.exports) module.exports = api;
    else root.CreoRankingEngine = api;
})(typeof window !== 'undefined' ? window : globalThis, function () {
    'use strict';

    function rankingsForChannel(channel, items = []) {
        const groups = new Map((channel?.groups || []).map((group) => [group.id, group]));
        return (channel?.scoreboards || []).map((board) => {
            const rows = new Map();
            for (const item of items || []) {
                if (!(item.status === 'sold' || Number(item.soldPrice) > 0)) continue;
                let key = 'unknown';
                let name = '미지정';
                let color = '';
                let logoUrl = '';
                if (board.dimension === 'vendor') {
                    key = item.vendorId || item.vendorName || key;
                    name = item.vendorName || name;
                    logoUrl = item.vendorLogoUrl || '';
                } else if (board.dimension === 'group') {
                    const group = groups.get(item.groupId) || [...groups.values()].find((candidate) => candidate.name === item.teamName || candidate.shortName === item.teamName);
                    key = group?.id || item.groupId || item.teamName || key;
                    name = group?.shortName || group?.name || item.teamName || name;
                    color = group?.color || '';
                    logoUrl = group?.logoUrl || '';
                } else if (board.dimension === 'category') {
                    key = item.category || key;
                    name = item.category || name;
                } else if (board.dimension === 'winnerHouse') {
                    const houseKey = String(
                        item.crewartHouseKey
                        || item.crewart_house_key
                        || item.attributes?.crewart_house_key
                        || ''
                    ).trim().toUpperCase();
                    const group = [...groups.values()].find(candidate => {
                        const tokens = [candidate.id, candidate.name, candidate.shortName]
                            .map(value => String(value || '').trim().toUpperCase());
                        return tokens.includes(houseKey) || tokens.includes(({
                            R: 'RED', G: 'GREEN', B: 'BLUE', Y: 'YELLOW'
                        })[houseKey]);
                    });
                    key = houseKey || key;
                    name = group?.shortName || group?.name || houseKey || name;
                    color = group?.color || '';
                    logoUrl = group?.logoUrl || '';
                } else {
                    key = item.winnerAlias || item.winnerName || key;
                    name = item.winnerAlias || item.winnerName || name;
                }
                const row = rows.get(key) || { key, name, count: 0, total: 0, color, logoUrl };
                row.count += 1;
                row.total += board.metric === 'soldCount' ? 1 : board.metric === 'points' ? Number(item.points) || 0 : Number(item.soldPrice) || 0;
                rows.set(key, row);
            }
            return {
                id: board.id,
                name: board.name,
                dimension: board.dimension,
                metric: board.metric,
                unit: board.unit,
                rows: [...rows.values()]
                    .sort((a, b) => b.total - a.total || b.count - a.count || a.name.localeCompare(b.name, 'ko'))
                    .slice(0, board.topN || 8)
            };
        });
    }

    return Object.freeze({ rankingsForChannel });
});
