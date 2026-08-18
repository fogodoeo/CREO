'use strict';

const crypto = require('node:crypto');
const AuctionContract = require('./public/auction-contract');

function replyJson(res, status, value) {
    const payload = Buffer.from(JSON.stringify(value));
    res.writeHead(status, {
        'Content-Type': 'application/json; charset=utf-8',
        'Content-Length': payload.length,
        'Cache-Control': 'no-store'
    });
    res.end(payload);
}

async function readJson(req) {
    if (!req || typeof req[Symbol.asyncIterator] !== 'function') return {};
    const chunks = [];
    for await (const chunk of req) chunks.push(chunk);
    if (!chunks.length) return {};
    try { return JSON.parse(Buffer.concat(chunks).toString('utf8')); } catch { return {}; }
}

function soldAmount(row) {
    return AuctionContract.parseAmount(row?.sold_price);
}

function parseGroups(configMap) {
    try {
        const parsed = JSON.parse(configMap.tournament_stage_groups_8 || 'null');
        if (!parsed || !Array.isArray(parsed.groups)) return [];
        return parsed.groups.map((group, index) => ({
            code: String(group?.code || String.fromCharCode(65 + index)).trim().toUpperCase(),
            name: String(group?.name || '').trim(),
            members: Array.isArray(group?.members) ? group.members.map((name) => String(name || '').trim()).filter(Boolean) : []
        })).filter((group) => group.members.length);
    } catch {
        return [];
    }
}

function parseRoundAmounts(configMap, stage) {
    try {
        const parsed = JSON.parse(configMap[`tournament_round_amounts_${stage}`] || '{}');
        return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
    } catch {
        return {};
    }
}

function sortFinalistsByAmount(entries, amounts) {
    return (entries || []).map((entry, sourceIndex) => ({
        ...entry,
        sourceGroupCode: String(entry?.sourceGroupCode || entry?.groupCode || entry?.code || '').trim().toUpperCase(),
        roundTwoAmount: Number(amounts?.[entry?.member] || 0),
        sourceIndex
    })).sort((a, b) => a.roundTwoAmount - b.roundTwoAmount
        || a.member.localeCompare(b.member, 'ko')
        || a.sourceIndex - b.sourceIndex)
        .map(({ sourceIndex, ...entry }, index) => ({
            ...entry,
            anonymousCode: String.fromCharCode(65 + index),
            seed: index + 1
        }));
}

function roundTwoFinalists(configMap, items) {
    const activeStage = Number.parseInt(configMap.active_tournament, 10) || 0;
    const totals = {};
    let soldCount = 0;
    for (const item of items || []) {
        const meta = AuctionContract.checklistMeta(item);
        const stage = meta.tournamentStage || (meta.auctionType === 'tournament' ? activeStage : 0);
        if (meta.auctionType !== 'tournament' || stage !== 8 || !AuctionContract.isSoldStatus(item.status)) continue;
        const company = String(item.company || '').trim();
        if (!company) continue;
        totals[company] = (totals[company] || 0) + soldAmount(item);
        soldCount += 1;
    }
    if (!soldCount) return [];
    const qualified = parseGroups(configMap).map((group) => ({
        ...group,
        total: group.members.reduce((sum, name) => sum + Number(totals[name] || 0), 0)
    })).sort((a, b) => b.total - a.total || a.code.localeCompare(b.code, 'en'))
        .slice(0, 2)
        .flatMap((group) => group.members.map((member) => ({
            member,
            sourceGroupCode: group.code,
            sourceGroupName: group.name
        })));
    return sortFinalistsByAmount(qualified, totals);
}

function reseedRoundThreeFinalists(configMap) {
    let rows = [];
    try {
        const parsed = JSON.parse(configMap.tournament_finalists_4 || 'null');
        rows = Array.isArray(parsed) ? parsed : (Array.isArray(parsed?.entrants) ? parsed.entrants : []);
    } catch {}
    const entrants = rows.map((entry) => ({
        ...entry,
        member: String(entry?.member || entry?.name || '').trim(),
        sourceGroupCode: String(entry?.sourceGroupCode || entry?.groupCode || entry?.code || '').trim().toUpperCase(),
        sourceGroupName: String(entry?.sourceGroupName || entry?.groupName || '').trim()
    })).filter((entry) => entry.member);
    if (entrants.length !== 8 || new Set(entrants.map((entry) => entry.member)).size !== 8) return [];
    return sortFinalistsByAmount(entrants, parseRoundAmounts(configMap, 8));
}

function roundThreeSnapshot(configMap) {
    try {
        const parsed = JSON.parse(configMap.tournament_finalists_4 || 'null');
        if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return { runId: '', sourceArchiveId: '', entrants: [] };
        return {
            runId: String(parsed.runId || parsed.sourceArchiveId || '').trim(),
            sourceArchiveId: String(parsed.sourceArchiveId || '').trim(),
            entrants: Array.isArray(parsed.entrants) ? parsed.entrants : []
        };
    } catch {
        return { runId: '', sourceArchiveId: '', entrants: [] };
    }
}

function roundThreeAuctionItems(finalists) {
    if (!Array.isArray(finalists) || finalists.length !== 8
        || new Set(finalists.map((entry) => String(entry?.member || '').trim())).size !== 8) {
        throw new Error('3라운드 진출 업체 8곳이 확정되지 않았습니다.');
    }
    return [1, 2, 3].flatMap((slot) => finalists.map((entry, index) => {
        const code = String.fromCharCode(65 + index);
        const publicNumber = (slot - 1) * 8 + index + 1;
        const tournamentCode = `${code}${slot}`;
        return {
            company: String(entry.member || '').trim(),
            num: publicNumber,
            name: `${code}${String(slot).padStart(2, '0')}`,
            start_price: '',
            note: '',
            announce: '',
            photo_item: '',
            photo_sire: '',
            photo_dam: '',
            photo_sibling: '',
            status: '대기',
            sold_price: '',
            winner: '',
            winner_phone: '',
            start_time: '',
            bid_log: '',
            checklist: `_auction:tournament|_label:${publicNumber}|_stage:4|_slot:${tournamentCode}|_team:${code}`,
            checklist_parsed: '',
            sire_id: null,
            dam_id: null
        };
    }));
}

function validateExistingRoundThreeItems(items, expected) {
    const expectedByCode = new Map(expected.map((item) => [AuctionContract.checklistMeta(item).tournamentCode, item]));
    const existingByCode = new Map();
    for (const item of items || []) {
        const meta = AuctionContract.checklistMeta(item);
        if (meta.auctionType !== 'tournament' || meta.tournamentStage !== 4 || !expectedByCode.has(meta.tournamentCode)) {
            throw new Error('현재 목록에 3라운드 외 개체가 남아 있습니다. 이전 회차 개체를 먼저 별도 보관해 주세요.');
        }
        if (existingByCode.has(meta.tournamentCode)) throw new Error(`3라운드 슬롯 ${meta.tournamentCode}가 중복되어 있습니다.`);
        const planned = expectedByCode.get(meta.tournamentCode);
        if (String(item.company || '').trim() !== planned.company) {
            throw new Error(`${meta.tournamentCode} 업체가 확정된 A~H 배정과 다릅니다.`);
        }
        existingByCode.set(meta.tournamentCode, item);
    }
    return existingByCode;
}

async function insertRoundThreeItems(repository, rows) {
    if (!rows.length) return;
    await repository.request('items', {
        method: 'POST',
        headers: { Prefer: 'return=minimal' },
        body: JSON.stringify(rows)
    });
}

function archiveSummary(snapshot) {
    const activeStage = Number.parseInt(snapshot.configs.active_tournament, 10) || 0;
    const stageCounts = {};
    const roundAmounts = {};
    const sold = [];
    for (const item of snapshot.items) {
        const meta = AuctionContract.checklistMeta(item);
        const stage = meta.tournamentStage || (meta.auctionType === 'tournament' ? activeStage : 0);
        const label = meta.auctionType === 'tournament' ? (stage ? `${stage}강` : '토너먼트') : (meta.auctionType || '기타');
        stageCounts[label] = (stageCounts[label] || 0) + 1;
        if (!AuctionContract.isSoldStatus(item.status)) continue;
        sold.push(item);
        const company = String(item.company || '').trim();
        if (meta.auctionType === 'tournament' && [2, 4, 8, 16].includes(stage) && company) {
            roundAmounts[stage] ||= {};
            roundAmounts[stage][company] = (roundAmounts[stage][company] || 0) + soldAmount(item);
        }
    }
    return {
        id: snapshot.id,
        title: snapshot.title,
        createdAt: snapshot.createdAt,
        itemCount: snapshot.items.length,
        soldCount: sold.length,
        totalSoldAmount: sold.reduce((sum, item) => sum + soldAmount(item), 0),
        stageCounts,
        roundAmounts
    };
}

// The legacy CDCUP workspace shares the config table with other channels and
// services. Only keys that the public CDCUP broadcast/control pages consume may
// cross this unauthenticated endpoint boundary.
function isPublicCdcupConfigKey(key) {
    const value = String(key || '').trim();
    if (!value) return false;
    if (new Set([
        'active_event_module',
        'active_tournament',
        'auction_animation_enabled',
        'badge_text',
        'hiddenPhotos',
        'runtime_config_version',
        'ticker'
    ]).has(value)) return true;
    return /^(?:banner(?:\d+|_)|battle_|blind_totals_|bracket_|event_|host_|live_|nametag(?:\d+|_)|p2_|p3_|page2_|rule(?:\d+|s_)|scoreboard_|team_logo\d+|ticker_|tournament_)/.test(value);
}

function createCdcupRoundsApi({ repository, isAdmin }) {
    if (!repository || typeof repository.request !== 'function' || typeof repository.upsertRows !== 'function') {
        throw new Error('CDCUP rounds repository is required');
    }
    if (typeof isAdmin !== 'function') throw new Error('CDCUP rounds admin verifier is required');

    async function handle(req, res, url) {
        if (url.pathname === '/api/cdcup/rounds/public-state' && req.method === 'GET') {
            const [items, configRows] = await Promise.all([
                repository.request('items?select=id,company,num,name,start_price,note,announce,status,sold_price,winner,start_time,bid_log,checklist,checklist_parsed,sire_id,dam_id,shipping_type,shipping_company,shipping_region,shipping_cost,updated_at&order=num.asc'),
                repository.request('config?select=key,value')
            ]);
            replyJson(res, 200, {
                items: items || [],
                config: Object.fromEntries((configRows || [])
                    .filter((row) => isPublicCdcupConfigKey(row.key))
                    .map((row) => [row.key, row.value]))
            });
            return true;
        }
        if (!['/api/cdcup/rounds/prepare-three', '/api/cdcup/rounds/reseed-three', '/api/cdcup/rounds/seed-three-items'].includes(url.pathname)) return false;
        if (req.method !== 'POST') {
            replyJson(res, 405, { error: 'Method not allowed' });
            return true;
        }
        if (!await isAdmin(req)) {
            replyJson(res, 401, { error: '관리자 인증이 필요합니다.' });
            return true;
        }

        if (url.pathname === '/api/cdcup/rounds/seed-three-items') {
            const [items, configRows] = await Promise.all([
                repository.request('items?select=*&order=num.asc'),
                repository.request('config?select=key,value')
            ]);
            const configMap = Object.fromEntries((configRows || []).map((row) => [row.key, row.value]));
            if ((Number.parseInt(configMap.active_tournament, 10) || 0) !== 4) {
                replyJson(res, 409, { error: '현재 운영 회차가 3라운드가 아닙니다.' });
                return true;
            }
            const finalists = reseedRoundThreeFinalists(configMap);
            if (finalists.length !== 8) {
                replyJson(res, 409, { error: '저장된 3라운드 진출 업체 8곳을 확인하지 못했습니다.' });
                return true;
            }
            try {
                const planned = roundThreeAuctionItems(finalists);
                const existing = validateExistingRoundThreeItems(items || [], planned);
                const missing = planned.filter((item) => !existing.has(AuctionContract.checklistMeta(item).tournamentCode));
                const savedSnapshot = roundThreeSnapshot(configMap);
                const activeRunId = String(configMap.tournament_run_id_4 || '').trim();
                if (missing.length && (!activeRunId || savedSnapshot.runId !== activeRunId)) {
                    throw new Error('현재 3라운드 회차 ID를 확인할 수 없어 과거 명단으로 목록을 복구하지 않습니다. 2라운드 종료 절차에서 새 3라운드를 준비해 주세요.');
                }
                await insertRoundThreeItems(repository, missing);
                const configUpdates = [
                    { key: 'runtime_config_version', value: `${Date.now().toString(36)}-${crypto.randomBytes(4).toString('hex')}` }
                ];
                // 이미 완성된 구형 3라운드 목록은 한 번만 현재 회차로 채택한다.
                // 목록이 비었거나 일부만 남은 상태에서는 과거 확정 명단을 절대 재사용하지 않는다.
                if (!activeRunId && missing.length === 0) {
                    const migratedRunId = `legacy-${crypto.randomBytes(8).toString('hex')}`;
                    configUpdates.push(
                        { key: 'tournament_run_id_4', value: migratedRunId },
                        { key: 'tournament_finalists_4', value: JSON.stringify({ runId: migratedRunId, entrants: savedSnapshot.entrants }) }
                    );
                }
                await repository.upsertRows(configUpdates);
                replyJson(res, 200, {
                    success: true,
                    created: missing.length,
                    total: planned.length,
                    order: planned.map((item) => ({ num: item.num, code: item.name, company: item.company }))
                });
            } catch (error) {
                replyJson(res, 409, { error: error.message });
            }
            return true;
        }

        if (url.pathname === '/api/cdcup/rounds/reseed-three') {
            const configRows = await repository.request('config?select=key,value');
            const configMap = Object.fromEntries((configRows || []).map((row) => [row.key, row.value]));
            const snapshot = roundThreeSnapshot(configMap);
            const activeRunId = String(configMap.tournament_run_id_4 || '').trim();
            if (!activeRunId || snapshot.runId !== activeRunId) {
                replyJson(res, 409, { error: '현재 3라운드 회차 ID와 진출 명단이 일치하지 않아 재배정하지 않습니다.' });
                return true;
            }
            const finalists = reseedRoundThreeFinalists(configMap);
            if (finalists.length !== 8) {
                replyJson(res, 409, { error: '저장된 3라운드 진출 업체 8곳을 다시 배정하지 못했습니다.' });
                return true;
            }
            await repository.upsertRows([
                { key: 'tournament_finalists_4', value: JSON.stringify({
                    runId: activeRunId,
                    sourceArchiveId: snapshot.sourceArchiveId || activeRunId,
                    entrants: finalists
                }) },
                { key: 'runtime_config_version', value: `${Date.now().toString(36)}-${crypto.randomBytes(4).toString('hex')}` }
            ]);
            replyJson(res, 200, {
                success: true,
                finalists: finalists.map((entry) => ({ code: entry.anonymousCode, amount: entry.roundTwoAmount }))
            });
            return true;
        }

        const body = await readJson(req);
        const [items, parents, configRows] = await Promise.all([
            repository.request('items?select=*&order=num.asc'),
            repository.request('parents?select=*'),
            repository.request('config?select=key,value')
        ]);
        if ((items || []).some((item) => String(item.status || '').trim() === '진행중')) {
            replyJson(res, 409, { error: '진행 중인 경매를 먼저 종료해주세요.' });
            return true;
        }
        const configMap = Object.fromEntries((configRows || []).map((row) => [row.key, row.value]));
        const finalists = roundTwoFinalists(configMap, items || []);
        const uniqueFinalists = new Set(finalists.map((entry) => entry.member));
        if (finalists.length !== 8 || uniqueFinalists.size !== 8) {
            replyJson(res, 409, { error: '2라운드 상위 2팀의 8개 업체를 확정하지 못했습니다.' });
            return true;
        }

        const now = new Date();
        const id = now.toISOString().replace(/[-:.TZ]/g, '').slice(0, 14) + '_' + crypto.randomBytes(4).toString('hex');
        const safeConfigs = Object.fromEntries(Object.entries(configMap).filter(([key]) => (
            key !== 'admin_pw'
            && key !== 'runtime_config_version'
            && key !== 'auction_archive_index'
            && !key.startsWith('auction_archive_')
        )));
        const snapshot = {
            version: 1,
            id,
            title: String(body.title || 'CDCUP 시즌2 · 2라운드 종료').trim().slice(0, 80) || 'CDCUP 시즌2 · 2라운드 종료',
            createdAt: now.toISOString(),
            items: items || [],
            parents: parents || [],
            configs: safeConfigs
        };
        const summary = archiveSummary(snapshot);
        let archiveIndex = [];
        try {
            const parsed = JSON.parse(configMap.auction_archive_index || '[]');
            if (Array.isArray(parsed)) archiveIndex = parsed;
        } catch {}
        const version = `${Date.now().toString(36)}-${crypto.randomBytes(4).toString('hex')}`;
        const rows = [
            { key: `auction_archive_${id}`, value: JSON.stringify(snapshot) },
            { key: 'auction_archive_index', value: JSON.stringify([summary, ...archiveIndex].slice(0, 100)) },
            ...Object.entries(summary.roundAmounts).map(([stage, amounts]) => ({ key: `tournament_round_amounts_${stage}`, value: JSON.stringify(amounts) })),
            { key: 'active_tournament', value: '4' },
            { key: 'bracket_view_round', value: '4' },
            { key: 'bracket_full_blind', value: '1' },
            { key: 'bracket_full_show', value: '1' },
            { key: 'bracket_live_show', value: '0' },
            { key: 'blind_totals_stage', value: '4' },
            { key: 'blind_totals_show', value: '1' },
            { key: 'tournament_format', value: 'three-round-team-final' },
            { key: 'tournament_run_id_4', value: id },
            { key: 'tournament_finalists_4', value: JSON.stringify({ runId: id, sourceArchiveId: id, entrants: finalists }) },
            { key: 'tournament_round_amounts_4', value: '{}' },
            { key: 'event_match_show', value: '0' },
            { key: 'battle_current_match', value: '' },
            { key: 'battle_state', value: '' },
            { key: 'runtime_config_version', value: version }
        ];

        // 원본 삭제보다 아카이브와 3라운드 설정 저장을 먼저 끝낸다.
        await repository.upsertRows(rows);
        await repository.request('items?id=gt.0', {
            method: 'DELETE',
            headers: { Prefer: 'return=minimal' }
        });
        const roundThreeItems = roundThreeAuctionItems(finalists);
        await insertRoundThreeItems(repository, roundThreeItems);
        replyJson(res, 200, {
            success: true,
            archive: {
                id: summary.id,
                title: summary.title,
                itemCount: summary.itemCount,
                soldCount: summary.soldCount,
                totalSoldAmount: summary.totalSoldAmount
            },
            finalists: finalists.map((entry, index) => ({ code: String.fromCharCode(65 + index), member: entry.member })),
            createdItems: roundThreeItems.length
        });
        return true;
    }

    return { handle };
}

module.exports = { createCdcupRoundsApi, roundTwoFinalists, reseedRoundThreeFinalists, roundThreeAuctionItems, validateExistingRoundThreeItems, archiveSummary };
