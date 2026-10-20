'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { createRemoteControls, createSessionPoller, initialEntries } = require('../roulette-app/src/remoteControls');
const { snapshotStandings } = require('../roulette-app/src/standings');

test('broadcast cold start never exposes names from another channel, URL or fallback', () => {
  let reads = 0;
  const names = initialEntries({
    remoteDisplay: true, urlEntries: 'old URL entrant',
    readStored: () => { reads++; return 'different channel entrant'; },
    fallback: 'sample entrant',
  });
  assert.equal(names, '');
  assert.equal(reads, 0, 'broadcast cannot even consult shared participant storage');
});

test('controller retains its explicit list, saved draft and first-use fallback', () => {
  const base = { remoteDisplay: false, readStored: () => 'saved draft', fallback: 'sample' };
  assert.equal(initialEntries({ ...base, urlEntries: 'explicit list' }), 'explicit list');
  assert.equal(initialEntries(base), 'saved draft');
  assert.equal(initialEntries({ ...base, readStored: () => null }), 'sample');
});

test('goal-frame standings contain each ball once even before finishers leave the active array', () => {
  const a = { id: 1, name: 'same participant' }, b = { id: 2, name: 'same participant' }, c = { id: 3, name: 'another' };
  for (const finished of [[a], [a,b], [a,b,c]]) {
    const ranks = snapshotStandings(finished, [a,b,c]);
    assert.equal(ranks.length, 3);
    assert.deepEqual(ranks.map(r => r.rank), [1,2,3]);
    assert.equal(ranks.filter(r => r.name === 'same participant').length, 2);
    assert.equal(ranks.filter(r => r.finished).length, finished.length);
    assert.deepEqual(ranks, snapshotStandings(finished, [a,b,c].filter(m => !finished.includes(m))));
  }
});

function fixture(overrides = {}) {
  const calls = [], busy = [];
  let fingerprint = 'first', state = { phase: 'idle', runId: '', seed: '' }, revision = 0;
  const controls = createRemoteControls({
    readFingerprint: () => fingerprint,
    readSession: () => state,
    onBusy: value => busy.push(value),
    sendCommand: async action => {
      calls.push(action);
      if (action === 'prepare') state = { phase: 'prepared', runId: 'run-' + ++revision, seed: 'server-seed-' + revision };
      else state = { ...state, phase: 'running' };
      return state;
    },
    preview: async session => calls.push('preview:' + session.seed),
    ...overrides,
  });
  return { controls, calls, busy, change: value => fingerprint = value, phase: value => state = { ...state, phase: value } };
}

test('remote start without prior placement prepares the server before starting and previews its seed', async () => {
  const f = fixture(); await f.controls.start();
  assert.deepEqual(f.calls, ['prepare', 'preview:server-seed-1', 'start']);
  assert.deepEqual(f.busy, [true, false]);
});
test('placement then start uses one prepared server run; running draw rejects further clicks', async () => {
  const f = fixture(); await f.controls.prepare(); await f.controls.start();
  assert.deepEqual(f.calls, ['prepare', 'preview:server-seed-1', 'start']);
  await assert.rejects(f.controls.start(), /송출 추첨/);
  assert.equal(f.calls.length, 3);
});
test('changed entrants or settings are sent before the next start', async () => {
  const f = fixture(); await f.controls.prepare(); f.change('new entrants'); await f.controls.start();
  assert.deepEqual(f.calls, ['prepare', 'preview:server-seed-1', 'prepare', 'preview:server-seed-2', 'start']);
});
test('authentication, conflict and network errors cannot run a local preview or a start', async () => {
  for (const message of ['관리자 인증이 필요합니다.', 'revision conflict', 'network unavailable']) {
    let preview = 0, calls = 0;
    const f = fixture({ sendCommand: async () => { calls++; throw Error(message); }, preview: async () => { preview++; } });
    await assert.rejects(f.controls.start(), { message });
    assert.equal(calls, 1); assert.equal(preview, 0); assert.deepEqual(f.busy, [true, false]);
  }
});
test('duplicate clicks during a pending request send one command', async () => {
  let release, calls = 0;
  const pending = new Promise(resolve => { release = resolve; });
  const f = fixture({ sendCommand: async () => { calls++; await pending; return { phase: 'prepared', runId: 'one', seed: 'same' }; } });
  const first = f.controls.prepare();
  assert.equal(await f.controls.prepare(), null); assert.equal(await f.controls.start(), null);
  release(); await first; assert.equal(calls, 1);
});
test('reset or completed session requires a new prepared run', async () => {
  for (const phase of ['idle', 'complete']) {
    const f = fixture(); await f.controls.prepare(); f.phase(phase); await f.controls.start();
    assert.equal(f.calls.filter(c => c === 'prepare').length, 2);
  }
});
test('polling retries failed fetch/application at the same revision and suppresses completed repeats', async () => {
  let calls = 0, pulse = 12;
  const poll = createSessionPoller({ readPulse: async () => pulse, fetchSession: async () => { if (++calls === 1) throw Error('temporary failure'); } });
  await assert.rejects(poll(), /temporary failure/);
  await poll(); await poll(); assert.equal(calls, 2);
  pulse++; await poll(); assert.equal(calls, 3);
  const reloaded = createSessionPoller({ readPulse: async () => pulse, fetchSession: async () => calls++ });
  await reloaded(); assert.equal(calls, 4);
});

test('broadcast reload restores an active run once but never replays a completed draw', async () => {
  const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm');
  const app = fs.readFileSync(path.join(__dirname, '../roulette-app/src/app.ts'), 'utf8');
  const source = app.slice(app.indexOf('async function applyRemoteSession('), app.indexOf('async function fetchRemoteSession('))
    .replace('session: RemoteSession): Promise<void>', 'session)');
  const calls = [];
  const context = {
    updateRemoteSnapshot: () => {}, configure: () => {}, closePanel: () => {}, setStatus: () => {},
    remoteAppliedCommandId: '', remotePreparedRunId: '', remoteStartCommandId: '',
    window: { CreoMarbleRoulette: { setEntries: () => {} } },
    prepareRound: async seed => calls.push('prepare:' + seed), startRound: async () => calls.push('start'),
  };
  const apply = vm.runInNewContext('(' + source + ')', context);
  const session = { phase: 'running', runId: 'run-one', seed: 'shared', entries: ['test-a','test-b'], command: { type: 'start', id: 'start-one' } };
  await apply(session); await apply(session);
  assert.deepEqual(calls, ['prepare:shared', 'start']);
  calls.length = 0; context.remoteAppliedCommandId = ''; context.remotePreparedRunId = '';
  await apply({ ...session, phase: 'complete', result: { winner: 'test-a' } });
  assert.deepEqual(calls, []);
});
