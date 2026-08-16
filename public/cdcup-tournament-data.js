(function (global) {
    'use strict';

    const SOLD_STATUSES = new Set(['완료', 'sold', '낙찰']);
    const ROUND_SCALES = Object.freeze([16, 8, 4, 2]);

    function parseAmount(value) {
        const normalized = String(value ?? '').replace(/,/g, '').replace(/[^0-9.-]/g, '');
        return Number.parseFloat(normalized) || 0;
    }

    function parseBracket(map, scale) {
        try {
            const parsed = JSON.parse(map?.['tournament_bracket_' + scale] || '{"matches":{}}');
            return parsed && typeof parsed === 'object' ? parsed : { matches: {} };
        } catch (_) {
            return { matches: {} };
        }
    }

    function checklistMeta(item) {
        const pairs = {};
        String(item?.checklist || '').split('|').forEach(part => {
            const index = part.indexOf(':');
            if (index > 0) pairs[part.slice(0, index)] = part.slice(index + 1);
        });
        return {
            auctionType: String(pairs._auction || '').toLowerCase(),
            tournamentStage: Number.parseInt(pairs._stage, 10) || 0
        };
    }

    function itemMeta(item) {
        return typeof global.getItemAuctionMeta === 'function'
            ? global.getItemAuctionMeta(item || {})
            : checklistMeta(item);
    }

    function isTournamentItem(item) {
        const meta = itemMeta(item);
        return meta.auctionType === 'tournament';
    }

    function isSoldItem(item) {
        return SOLD_STATUSES.has(String(item?.status || '').trim());
    }

    function storedWinner(match) {
        return match && (match.winner === 'left' || match.winner === 'right')
            ? String(match[match.winner] || '').trim()
            : '';
    }

    function roundAmount(roundAmounts, name, round) {
        const value = roundAmounts?.[round]?.[String(name || '').trim()];
        return value === undefined || value === null ? undefined : Number(value);
    }

    function winnerByAmount(match, roundAmounts, round) {
        if (!match?.left || !match?.right) return '';
        const saved = storedWinner(match);
        if (saved) return saved;
        const left = roundAmount(roundAmounts, match.left, round);
        const right = roundAmount(roundAmounts, match.right, round);
        if (left === undefined || right === undefined || left === right) return '';
        return left > right ? match.left : match.right;
    }

    function configuredStageTeams(map, stage) {
        const primary = parseBracket(map || {}, stage).matches || {};
        const fallback = stage === 2 ? (parseBracket(map || {}, 4).matches || {}) : {};
        const keys = stage === 4 ? ['4_1', '4_2'] : stage === 2 ? ['2_1', '2_2'] : [];
        return [...new Set(keys.flatMap(key => {
            const match = primary[key] || fallback[key] || {};
            return [match.left, match.right].map(value => String(value || '').trim()).filter(Boolean);
        }))];
    }

    function sumStageItems(items, stage, expectedTeams, allowUnstaged = false) {
        const expected = new Set((expectedTeams || []).map(name => String(name || '').trim()).filter(Boolean));
        return (items || []).reduce((result, item) => {
            const meta = itemMeta(item);
            const name = String(item?.company || '').trim();
            const itemStage = Number(meta.tournamentStage) || 0;
            if (!name
                || !isTournamentItem(item)
                || (itemStage !== Number(stage) && !(allowUnstaged && itemStage === 0))
                || !isSoldItem(item)
                || (expected.size && !expected.has(name))) {
                return result;
            }
            result[name] = (result[name] || 0) + parseAmount(item.sold_price ?? item.soldPrice);
            return result;
        }, {});
    }

    function archivedStageAmounts(map, stage, expectedTeams) {
        let index = [];
        try {
            const parsed = JSON.parse(map?.auction_archive_index || '[]');
            if (Array.isArray(parsed)) index = parsed;
        } catch (_) {}
        const expected = new Set((expectedTeams || []).filter(Boolean));
        for (const summary of index) {
            let snapshot = null;
            try {
                snapshot = JSON.parse(map?.[`auction_archive_${summary?.id}`] || 'null');
            } catch (_) {}
            const amounts = sumStageItems(snapshot?.items || [], stage, expectedTeams);
            const teams = Object.keys(amounts);
            if (!teams.length) continue;
            if (expected.size && [...expected].some(team => amounts[team] === undefined)) continue;
            return amounts;
        }
        return {};
    }

    function storedStageAmounts(map, stage, expectedTeams) {
        let parsed = null;
        try {
            parsed = JSON.parse(map?.[`tournament_round_amounts_${stage}`] || 'null');
        } catch (_) {}
        if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};

        const expected = new Set((expectedTeams || []).map(name => String(name || '').trim()).filter(Boolean));
        const amounts = Object.entries(parsed).reduce((result, [name, value]) => {
            const team = String(name || '').trim();
            if (!team || (expected.size && !expected.has(team))) return result;
            result[team] = parseAmount(value);
            return result;
        }, {});
        if (expected.size && [...expected].some(team => amounts[team] === undefined)) return {};
        return amounts;
    }

    function buildRoundAmounts(map, items) {
        const result = { 16: {}, 8: {}, 4: {}, 2: {} };
        const activeStage = Number.parseInt(map?.active_tournament, 10) || 0;
        [16, 8].forEach(stage => {
            const current = sumStageItems(items || [], stage, [], activeStage === stage);
            const stored = storedStageAmounts(map || {}, stage, []);
            result[stage] = Object.keys(current).length ? current : stored;
        });
        [4, 2].forEach(stage => {
            const expectedTeams = configuredStageTeams(map || {}, stage);
            const current = sumStageItems(items || [], stage, expectedTeams, activeStage === stage);
            const stored = storedStageAmounts(map || {}, stage, expectedTeams);
            result[stage] = Object.keys(current).length
                ? current
                : (Object.keys(stored).length
                    ? stored
                    : archivedStageAmounts(map || {}, stage, expectedTeams));
        });
        return result;
    }

    function parseStageGroups(map, stage = 8) {
        try {
            const parsed = JSON.parse(map?.[`tournament_stage_groups_${stage}`] || 'null');
            if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null;
            const groups = Array.isArray(parsed.groups) ? parsed.groups : [];
            const normalized = groups.map((group, index) => {
                const code = String(group?.code || String.fromCharCode(65 + index)).trim().toUpperCase().slice(0, 2);
                const members = Array.isArray(group?.members) ? group.members : [];
                const seen = new Set();
                return {
                    code,
                    name: String(group?.name || `${code}팀`).trim(),
                    leader: String(group?.leader || '').trim(),
                    members: members.map(value => String(value || '').trim()).filter(value => value && !seen.has(value) && seen.add(value))
                };
            }).filter(group => group.members.length);
            if (!groups.length || !normalized.length) return null;
            return {
                title: String(parsed.title || `${stage}강 팀 배정`).trim(),
                groups: normalized,
                qualification: {
                    winners: Array.isArray(parsed.qualification?.winners) ? parsed.qualification.winners.map(value => String(value || '').trim()).filter(Boolean) : [],
                    wildcards: Array.isArray(parsed.qualification?.wildcards) ? parsed.qualification.wildcards.map(value => String(value || '').trim()).filter(Boolean) : []
                },
                eliminated: Array.isArray(parsed.eliminated) ? parsed.eliminated.map(value => String(value || '').trim()).filter(Boolean) : []
            };
        } catch (_) {
            return null;
        }
    }

    function stageGroupStandings(map, items, stage = 8) {
        const stageGroups = parseStageGroups(map || {}, stage);
        if (!stageGroups) return [];
        const roundAmounts = buildRoundAmounts(map || {}, items || []);
        const standings = stageGroups.groups.map(group => {
            const members = group.members.map(name => ({
                name,
                amount: roundAmount(roundAmounts, name, stage) || 0
            }));
            return {
                ...group,
                members,
                total: members.reduce((sum, member) => sum + member.amount, 0)
            };
        }).sort((a, b) => b.total - a.total || a.code.localeCompare(b.code, 'en'));
        const hasResults = standings.some(group => group.total > 0);
        return standings.map((group, index) => ({ ...group, rank: index + 1, advancing: hasResults && index < 2 }));
    }

    function savedFinalStageEntrants(map) {
        try {
            const parsed = JSON.parse(map?.tournament_finalists_4 || 'null');
            const rows = Array.isArray(parsed) ? parsed : (Array.isArray(parsed?.entrants) ? parsed.entrants : []);
            if (rows.length !== 8) return [];
            return rows.map((entry, index) => ({
                name: String(entry?.name || entry?.member || '').trim(),
                amount: 0,
                sourceGroupCode: String(entry?.sourceGroupCode || entry?.groupCode || entry?.code || '').trim().toUpperCase(),
                sourceGroupName: String(entry?.sourceGroupName || entry?.groupName || '').trim(),
                sourceGroupRank: Number(entry?.sourceGroupRank) || 0,
                seed: index + 1,
                anonymousCode: String.fromCharCode(65 + index)
            })).filter(entry => entry.name);
        } catch (_) {
            return [];
        }
    }

    function finalStageEntrants(map, items) {
        const saved = savedFinalStageEntrants(map || {});
        if (saved.length === 8) return saved;
        return stageGroupStandings(map || {}, items || [], 8)
            .filter(group => group.advancing)
            .flatMap(group => group.members.map(member => ({
                ...member,
                sourceGroupCode: group.code,
                sourceGroupName: group.name,
                sourceGroupRank: group.rank
            })))
            .map((entry, index) => ({
                ...entry,
                seed: index + 1,
                anonymousCode: String.fromCharCode(65 + index)
            }));
    }

    function finalIndividualStandings(map, items, stage = 4) {
        const entrants = finalStageEntrants(map || {}, items || []);
        const roundAmounts = buildRoundAmounts(map || {}, items || []);
        const rows = entrants.map(entrant => ({
            ...entrant,
            amount: roundAmount(roundAmounts, entrant.name, stage) || 0
        }));
        const hasResults = rows.some(entrant => entrant.amount > 0);
        return rows.sort((a, b) => (hasResults ? b.amount - a.amount : 0) || a.seed - b.seed)
            .map((entrant, index) => ({ ...entrant, rank: index + 1, winner: index === 0 && entrant.amount > 0 }));
    }

    function isLegacySeason(map) {
        const season = Number.parseInt(map?.tournament_season, 10);
        return Number.isFinite(season) && season === 1;
    }

    function teamTotal(roundAmounts, name) {
        return ROUND_SCALES.reduce((sum, round) => sum + (roundAmount(roundAmounts, name, round) || 0), 0);
    }

    function allTeamTotals(roundAmounts) {
        const names = new Set();
        ROUND_SCALES.forEach(round => Object.keys(roundAmounts?.[round] || {}).forEach(name => names.add(name)));
        return [...names].reduce((result, name) => {
            result[name] = teamTotal(roundAmounts, name);
            return result;
        }, {});
    }

    global.CdcupTournamentData = Object.freeze({
        ROUND_SCALES,
        parseAmount,
        parseBracket,
        storedWinner,
        roundAmount,
        winnerByAmount,
        configuredStageTeams,
        archivedStageAmounts,
        buildRoundAmounts,
        parseStageGroups,
        stageGroupStandings,
        savedFinalStageEntrants,
        finalStageEntrants,
        finalIndividualStandings,
        isLegacySeason,
        teamTotal,
        allTeamTotals
    });
})(window);
