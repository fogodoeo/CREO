'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { createNationalStage, isNationalChannel } = require('../roulette-app/src/nationalStage.js');

function fixture(options = {}) {
  const fields = new Map();
  const root = { dataset: {}, querySelector(selector) {
    if (!fields.has(selector)) fields.set(selector, { textContent: '', hidden: true });
    return fields.get(selector);
  } };
  const events = new Map(), timers = new Map(), data = options.data || new Map();
  let calls = 0, loads = 0, sequence = 0;
  const video = {
    hidden: true, pause() {}, load() { loads++; },
    play() { calls++; return options.play ? options.play() : Promise.resolve(); },
    addEventListener(name, cb) { events.set(name, cb); },
  };
  const stage = createNationalStage({
    root, video, enabled: () => options.enabled !== false,
    reducedMotion: () => Boolean(options.reducedMotion),
    storage: options.storage || { getItem: k => data.get(k), setItem: (k, v) => data.set(k, v) },
    storageKey: 'channel-a',
    schedule: cb => { const id = ++sequence; timers.set(id, cb); return id; },
    cancel: id => timers.delete(id),
  });
  return { stage, root, video, fields, events, timers, data, calls: () => calls, loads: () => loads };
}
const flush = () => new Promise(resolve => setImmediate(resolve));

test('national skin follows explicit dated national rounds, never a similarly named channel', () => {
  for (const id of ['national-cre', 'national-cre-20261021']) assert.equal(isNationalChannel(id), true);
  for (const id of ['creyon', 'national-cre-fake', 'national-cre-202610211', '']) assert.equal(isNationalChannel(id), false);
});

test('a repeated start and same-tab reload play the stinger only once per run', async () => {
  const f = fixture();
  f.stage.update({ phase: 'running' });
  f.stage.start('run-1'); f.stage.start('run-1');
  await flush();
  assert.equal(f.calls(), 1);
  assert.equal(f.video.hidden, false);
  assert.equal(f.timers.size, 1);
  const reloaded = fixture({ data: f.data });
  reloaded.stage.update({ phase: 'running' });
  reloaded.stage.start('run-1');
  assert.equal(reloaded.calls(), 0);
  reloaded.stage.start('run-2');
  await flush();
  assert.equal(reloaded.calls(), 1);
});

test('completed result is restored without replay and a new preparation clears it', () => {
  const f = fixture();
  f.stage.update({ phase: 'complete', winner: '<김테스트>', ballCount: 24, edition: '전국크레자랑 전라·충청편' });
  assert.equal(f.calls(), 0);
  assert.equal(f.fields.get('[data-national-award]').hidden, false);
  assert.equal(f.fields.get('[data-national-winner]').textContent, '<김테스트>');
  assert.equal(f.fields.get('#nationalEdition').textContent, '전라·충청편');
  assert.equal(f.fields.get('[data-national-count]').textContent, '24');
  f.stage.update({ phase: 'ready', winner: '' });
  assert.equal(f.fields.get('[data-national-award]').hidden, true);
  assert.equal(f.fields.get('[data-national-winner]').textContent, '');
});

test('a slow video cannot cover a result or restart after reset', async () => {
  let resolve;
  const f = fixture({ play: () => new Promise(r => { resolve = r; }) });
  f.stage.update({ phase: 'running' }); f.stage.start('run-1');
  f.stage.update({ phase: 'complete', winner: '테스트' });
  resolve(); await flush();
  assert.equal(f.video.hidden, true);
  assert.equal(f.timers.size, 0);
  f.stage.update({ phase: 'ready' });
  assert.equal(f.video.hidden, true);
});

test('play rejection, decode failure and deadline all remove the decorative overlay', async () => {
  for (const failure of ['reject', 'error', 'deadline', 'ended', 'throw']) {
    const f = fixture({ play: () => {
      if (failure === 'throw') throw Error('unsupported');
      return failure === 'reject' ? Promise.reject(Error('blocked')) : Promise.resolve();
    } });
    f.stage.update({ phase: 'running' }); f.stage.start('test');
    await flush();
    if (failure === 'error' || failure === 'ended') f.events.get(failure)();
    if (failure === 'deadline') [...f.timers.values()][0]();
    assert.equal(f.video.hidden, true, failure);
    assert.equal(f.timers.size, 0, failure);
    assert.equal(f.root.dataset.drawPhase, 'running', 'presentation never finishes a draw');
  }
});

test('other themes and reduced motion do not download or play the clip', () => {
  for (const settings of [{ enabled: false }, { reducedMotion: true }]) {
    const f = fixture(settings);
    f.stage.update({ phase: 'running' }); f.stage.start('one');
    assert.equal(f.loads(), 0);
    assert.equal(f.calls(), 0);
  }
});

test('disabled session storage cannot interrupt a draw or repeat an in-memory start', async () => {
  const f = fixture({ storage: { getItem() { throw Error('blocked'); }, setItem() { throw Error('blocked'); } } });
  f.stage.update({ phase: 'running' }); f.stage.start('one'); f.stage.start('one');
  await flush();
  assert.equal(f.calls(), 1);
  assert.equal(f.root.dataset.drawPhase, 'running');
});
