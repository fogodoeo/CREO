'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { createRosterSequence, rosterLayout } = require('../roulette-app/src/participantRoster.js');
function fixture() {
  const renders = [];
  const roster = createRosterSequence({ render: state => renders.push(state) });
  return { roster, renders, state: () => renders.at(-1) };
}
const participants = ['가 (1234)', '나 (2345)', '동명 (1111)', '동명 (2222)', '다 (3456)'];
test('roster shows every identity at once and strips suffixes only in presentation', () => {
  const f = fixture();
  f.roster.update({ phase: 'ready', participants: [...participants, participants[0]], rosterKey: 'one' });
  assert.equal(f.state().total, 5);
  assert.deepEqual(f.state().names, ['가', '나', '동명', '동명', '다']);
  assert.equal(participants[0], '가 (1234)');
});
test('polling does not redraw the list and start or completion hides it', () => {
  const f = fixture();
  f.roster.update({ phase: 'ready', participants, rosterKey: 'one' });
  const rendered = f.renders.length;
  f.roster.update({ phase: 'ready', participants, rosterKey: 'one' });
  assert.equal(f.renders.length, rendered);
  f.roster.update({ phase: 'running' });
  assert.equal(f.state().visible, false);
  f.roster.update({ phase: 'complete' });
  assert.equal(f.state().visible, false);
});
test('a new run or changed participants replaces the full list; reset clears prior names', () => {
  const f = fixture();
  f.roster.update({ phase: 'ready', participants, rosterKey: 'one' });
  f.roster.update({ rosterKey: 'two' });
  assert.equal(f.state().names.length, participants.length);
  f.roster.update({ participants: ['새 참가자 (7777)'] });
  assert.deepEqual(f.state().names, ['새 참가자']);
  f.roster.update({ phase: 'ready', participants: [], rosterKey: '' });
  assert.equal(f.state().total, 0); assert.deepEqual(f.state().names, []);
});
test('restoring a running, completed or failed session never shows the roster', () => {
  for (const phase of ['running', 'complete', 'error']) {
    const f = fixture();
    f.roster.update({ phase, participants, rosterKey: 'restored' });
    assert.equal(f.state().visible, false);
  }
});
test('crossing the former 24-person boundary never slices the roster or schedules a page change', () => {
  for (const count of [24, 25, 48, 49, 120, 500]) {
    let state;
    const roster = createRosterSequence({ render: value => { state = value; }, schedule: () => assert.fail('no roster timers') });
    roster.update({ phase: 'ready', participants: Array.from({ length: count }, (_, i) => `참가자${i} (1234)`) });
    assert.equal(state.names.length, count);
    assert.equal(state.names.at(-1), `참가자${count - 1}`);
  }
});
test('untrusted participant content remains inert text data and long rosters retain all entries', () => {
  const f = fixture();
  const list = Array.from({ length: 500 }, (_, i) => `<img onerror=alert(${i})> (1234)`);
  f.roster.update({ phase: 'ready', participants: list });
  assert.equal(f.state().total, 500); assert.equal(f.state().names.length, 500);
  assert.equal(f.state().names[0], '<img onerror=alert(0)>');
  f.roster.update({ phase: 'error' });
  assert.equal(f.state().visible, false);
});
test('broadcast grids fit all names at 1080p and 720p without a second page', () => {
  for (const [width, height] of [[1314, 794], [810, 450]]) {
    for (const total of [1, 24, 25, 48, 60, 120]) {
      const layout = rosterLayout({ total, width, height, nameWidth: 5 });
      assert.ok(layout.columns * layout.rows >= total);
      assert.ok(layout.rows * (layout.fontSize * 1.4 + 8) <= height, JSON.stringify({ total, width, layout }));
      const cellWidth = (width - layout.gap * (layout.columns - 1)) / layout.columns;
      assert.ok(cellWidth >= layout.fontSize * 5 + 28);
    }
  }
});
test('small screens keep readable full-list text instead of discarding overflow', () => {
  const layout = rosterLayout({ total: 60, width: 254, height: 500, nameWidth: 8 });
  assert.ok(layout.fontSize >= 14);
  assert.ok(layout.columns * layout.rows >= 60);
});
