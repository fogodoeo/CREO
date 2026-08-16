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

test('missing runtime configuration never falls back to historical tournament teams', () => {
    const data = loadTournamentData();
    assert.equal(data.isLegacySeason({}), false);
    const amounts = data.buildRoundAmounts({}, []);
    assert.deepEqual({ ...amounts[16] }, {});
    assert.deepEqual({ ...amounts[8] }, {});
});

test('tournament renderer contains no participant-specific fallback data', () => {
    const dataSource = fs.readFileSync(path.join(__dirname, '..', 'public', 'cdcup-tournament-data.js'), 'utf8');
    const bracketSource = fs.readFileSync(path.join(__dirname, '..', 'public', 'tournament-bracket.html'), 'utf8');
    for (const participant of ['비송', '베누스', '히꼬', '자몽']) {
        assert.doesNotMatch(dataSource, new RegExp(participant));
        assert.doesNotMatch(bracketSource, new RegExp(participant));
    }
    assert.match(bracketSource, /stored16\[`16_\$\{index\+1\}`\]/);
    assert.match(bracketSource, /stored8\[`8_\$\{index\+1\}`\]/);
});

test('third-round entrants come only from the current top two second-round groups', () => {
    const data = loadTournamentData();
    const map = {
        tournament_season: '2',
        active_tournament: '8',
        tournament_stage_groups_8: JSON.stringify({
            groups: [
                { code: 'A', name: 'A팀', members: ['A1', 'A2', 'A3', 'A4'] },
                { code: 'B', name: 'B팀', members: ['B1', 'B2', 'B3', 'B4'] },
                { code: 'C', name: 'C팀', members: ['C1', 'C2', 'C3', 'C4'] }
            ]
        }),
        tournament_round_amounts_8: JSON.stringify({ A1: 10, A2: 10, A3: 10, A4: 10, B1: 30, B2: 30, B3: 30, B4: 30, C1: 20, C2: 20, C3: 20, C4: 20 })
    };
    const entrants = data.finalStageEntrants(map, []);
    assert.deepEqual(Array.from(entrants, entry => entry.name), ['B1', 'B2', 'B3', 'B4', 'C1', 'C2', 'C3', 'C4']);
});

test('archived third-round entrants keep stable A-H identities and reorder only by individual totals', () => {
    const data = loadTournamentData();
    const entrants = Array.from({ length: 8 }, (_, index) => ({ member: `업체${index + 1}` }));
    const map = {
        tournament_season: '2',
        active_tournament: '4',
        tournament_finalists_4: JSON.stringify({ entrants }),
        tournament_round_amounts_4: JSON.stringify({ 업체6: 80, 업체2: 50, 업체8: 20 })
    };
    const seeded = data.finalStageEntrants(map, []);
    assert.deepEqual(Array.from(seeded, entry => entry.anonymousCode), ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H']);
    const standings = data.finalIndividualStandings(map, [], 4);
    assert.deepEqual(Array.from(standings, entry => entry.name), ['업체6', '업체2', '업체8', '업체1', '업체3', '업체4', '업체5', '업체7']);
    assert.equal(standings[0].anonymousCode, 'F');
    assert.equal(standings[1].anonymousCode, 'B');
});

test('third-round entrants stay in A-H order before the first result', () => {
    const data = loadTournamentData();
    const entrants = Array.from({ length: 8 }, (_, index) => ({ member: `참가${index + 1}` }));
    const standings = data.finalIndividualStandings({
        active_tournament: '4',
        tournament_finalists_4: JSON.stringify({ entrants })
    }, [], 4);
    assert.deepEqual(Array.from(standings, entry => entry.anonymousCode), ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H']);
});
