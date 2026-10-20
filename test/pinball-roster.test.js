'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { createRosterSequence } = require('../roulette-app/src/participantRoster.js');
function fixture(reducedMotion = false) {
  const renders = [], timers = new Map();
  let id = 0;
  const roster = createRosterSequence({
    render: state => renders.push(state), reducedMotion: () => reducedMotion,
    schedule: fn => { timers.set(++id, fn); return id; }, cancel: key => timers.delete(key),
    pageSize: 2,
  });
  const tick = () => { const callback = [...timers.values()][0]; assert.ok(callback); callback(); };
  return { roster, renders, timers, tick, state: () => renders.at(-1) };
}
const participants = ['가 (1234)', '나 (2345)', '동명 (1111)', '동명 (2222)', '다 (3456)'];
test('roster shows each identity once, strips suffixes only in presentation, and tours every page once', () => {
  const f = fixture();
  f.roster.update({ phase: 'ready', participants: [...participants, participants[0]], rosterKey: 'one' });
  assert.equal(f.state().total, 5);
  assert.deepEqual(f.state().names, ['가', '나']);
  f.tick(); assert.deepEqual(f.state().names, ['동명', '동명']);
  f.tick(); assert.deepEqual(f.state().names, ['다']);
  assert.equal(f.state().page, 3); assert.equal(f.timers.size, 0);
  assert.equal(participants[0], '가 (1234)');
});
test('polling, reordered callbacks, start and completion cannot replay or cover the game', () => {
  const f = fixture();
  f.roster.update({ phase: 'ready', participants, rosterKey: 'one' });
  const late = [...f.timers.values()][0];
  f.tick();
  f.roster.update({ phase: 'ready', participants, rosterKey: 'one' });
  assert.equal(f.state().page, 2);
  late(); assert.equal(f.state().page, 2);
  f.roster.update({ phase: 'running' });
  assert.equal(f.state().visible, false); assert.equal(f.timers.size, 0);
  late(); assert.equal(f.state().visible, false);
  f.roster.update({ phase: 'complete' });
  assert.equal(f.timers.size, 0); assert.equal(f.state().visible, false);
});
test('a new run or changed participants begins from the first page; reset clears prior names', () => {
  const f = fixture();
  f.roster.update({ phase: 'ready', participants, rosterKey: 'one' }); f.tick();
  f.roster.update({ rosterKey: 'two' });
  assert.equal(f.state().page, 1);
  f.tick(); f.roster.update({ participants: ['새 참가자 (7777)'] });
  assert.deepEqual(f.state().names, ['새 참가자']); assert.equal(f.state().page, 1);
  f.roster.update({ phase: 'ready', participants: [], rosterKey: '' });
  assert.equal(f.state().total, 0); assert.deepEqual(f.state().names, []);
  assert.equal(f.timers.size, 0);
});
test('restoring an already running or completed session never shows or schedules the roster', () => {
  for (const phase of ['running', 'complete']) {
    const f = fixture();
    f.roster.update({ phase, participants, rosterKey: 'restored' });
    assert.equal(f.state().visible, false); assert.equal(f.timers.size, 0);
  }
});
test('manual paging pauses automatic advance; resume and replay remain bounded', () => {
  const f = fixture();
  f.roster.update({ phase: 'ready', participants });
  f.roster.move(1); assert.equal(f.state().page, 2); assert.equal(f.timers.size, 0);
  f.roster.toggle(); assert.equal(f.timers.size, 1);
  f.tick(); assert.equal(f.state().page, 3); assert.equal(f.timers.size, 0);
  f.roster.move(10); assert.equal(f.state().page, 3);
  f.roster.toggle(); assert.equal(f.state().page, 1);
  f.roster.move(-20); assert.equal(f.state().page, 1);
});
test('reduced motion leaves paging manual and never schedules an automatic tour', () => {
  const f = fixture(true);
  f.roster.update({ phase: 'ready', participants });
  assert.equal(f.timers.size, 0); assert.equal(f.state().paused, true);
  assert.equal(f.state().automatic, false);
  f.roster.move(1); assert.equal(f.state().page, 2); assert.equal(f.timers.size, 0);
  f.roster.toggle(); assert.equal(f.timers.size, 0);
});
test('untrusted participant content remains inert text data and long rosters retain all entries', () => {
  const f = fixture();
  const list = Array.from({ length: 500 }, (_, i) => `<img onerror=alert(${i})> (1234)`);
  f.roster.update({ phase: 'ready', participants: list });
  assert.equal(f.state().total, 500); assert.equal(f.state().pages, 250);
  assert.equal(f.state().names[0], '<img onerror=alert(0)>');
  f.roster.update({ phase: 'error' });
  assert.equal(f.state().visible, false); assert.equal(f.timers.size, 0);
});
