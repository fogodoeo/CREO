'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function loadTournamentData() {
    const window = {
        getItemAuctionMeta(item) {
            const stage = String(item.checklist || '').match(/_stage:([^|]+)/)?.[1] || '';
            return { auctionType: 'tournament', tournamentStage: Number.parseInt(stage, 10) || 0 };
        }
    };
    const source = fs.readFileSync(path.join(__dirname, '..', 'public', 'cdcup-tournament-data.js'), 'utf8');
    vm.runInNewContext(source, { window });
    return window.CdcupTournamentData;
}

test('active second-round items without legacy stage tags are counted as round two', () => {
    const data = loadTournamentData();
    const map = {
        tournament_season: '2',
        active_tournament: '8',
        tournament_round_amounts_16: JSON.stringify({ 알파: 70 }),
        tournament_stage_groups_8: JSON.stringify({
            groups: [{ code: 'A', members: ['알파', '베타'] }],
            qualification: { winners: ['알파'], wildcards: ['베타'] },
            eliminated: ['감마']
        })
    };
    const items = [
        { company: '알파', status: '완료', sold_price: 30, checklist: '_auction:tournament' },
        { company: '베타', status: '낙찰', sold_price: 20, checklist: '_auction:tournament' }
    ];
    const amounts = data.buildRoundAmounts(map, items);
    assert.deepEqual({ ...amounts[16] }, { 알파: 70 });
    assert.deepEqual({ ...amounts[8] }, { 알파: 30, 베타: 20 });
    const groups = data.parseStageGroups(map, 8);
    assert.deepEqual([...groups.qualification.winners], ['알파']);
    assert.deepEqual([...groups.qualification.wildcards], ['베타']);
});
