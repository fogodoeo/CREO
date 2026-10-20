'use strict';
const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('node:fs'), vm = require('node:vm');
const { stripTypeScriptTypes } = require('node:module');
const { selectDrawCandidates } = require('../roulette-app/src/candidateRanking');
const { runningParticipantName } = require('../roulette-app/src/participantDisplay');
const balls = names => names.map(name => ({ name }));
const layoutSource = fs.readFileSync(require.resolve('../roulette-app/src/rouletteUiLayout.ts'), 'utf8');
const layout = vm.runInNewContext(stripTypeScriptTypes(layoutSource.replace(/^export /gm, '')) +
  '\n({HUD_HEIGHT,HUD_CONTENT_GAP,NATIONAL_FINISHER_WIDTH,NATIONAL_FINISHER_INSET,nationalPanelScale,nationalPlayfieldRatio});');

test('last-five candidates follow the five trailing people without changing ball or winner order', () => {
  const ranked = balls(['가','나','다','라','마','바','사']);
  const before = ranked.slice(), arrived = balls(['골인']);
  const config = { winnerMode: 'last', winnerCount: 5 };
  assert.deepEqual(selectDrawCandidates(ranked, arrived, config).map(b => b.name), ['사','바','마','라','다']);
  const reordered = [ranked[6], ...ranked.slice(0, 6)];
  assert.deepEqual(selectDrawCandidates(reordered, arrived, config).map(b => b.name), ['바','마','라','다','나']);
  assert.deepEqual(ranked, before);
  assert.deepEqual(arrived, balls(['골인']));
  assert.deepEqual(selectDrawCandidates([], arrived, config), []);
});

test('weighted balls share one candidate place, while same names with different suffixes stay distinct', () => {
  const ranked = balls(['다 (9999)','동명이인 (1234)','동명이인 (5678)','동명이인 (1234)']);
  const selected = selectDrawCandidates(ranked, [], { winnerMode: 'last', winnerCount: 2 });
  assert.deepEqual(selected, [ranked[3], ranked[2]]);
  assert.equal(selectDrawCandidates(ranked, [], { winnerMode: 'last', winnerCount: 1 })[0], ranked[3]);
});

test('first-arrival and exact-rank candidates account for already finished balls', () => {
  const ranked = balls(['가','나','다','라']);
  assert.deepEqual(selectDrawCandidates(ranked, balls(['가','가']), { winnerMode: 'first', winnerCount: 3 }),
    [ranked[1], ranked[2]]);
  assert.deepEqual(selectDrawCandidates(ranked, balls(['가','나','다']), { winnerMode: 'first', winnerCount: 3 }), []);
  assert.deepEqual(selectDrawCandidates(ranked, balls(['완료']), { winnerMode: 'rank' }, 2), [ranked[1]]);
  assert.deepEqual(selectDrawCandidates(ranked, balls(['완료']), { winnerMode: 'rank' }, 0), []);
  assert.equal(selectDrawCandidates(balls(Array.from({ length: 30 }, (_, i) => String(i))), [],
    { winnerMode: 'last', winnerCount: 99 }).length, 20);
});

function loadTypeScript(file, theme = 'national') {
  const source = fs.readFileSync(require.resolve('../roulette-app/src/' + file), 'utf8');
  const constants = { initialZoom: 30, Themes: { dark: {} }, canvasWidth: 960, canvasHeight: 540 };
  const context = {
    document: { documentElement: { dataset: { rouletteTheme: theme } } },
    location: { search: '' }, URLSearchParams, Image: class {},
    ...constants, ...require('../roulette-app/src/candidateRanking'), runningParticipantName,
    ...layout,
  };
  // Exercise actual painters without browser dependencies or installing the build toolchain.
  const isolated = source.replace(/^import .*;\r?\n/gm, '').replace(/^\s*@bound\r?\n/gm, '')
    .replace(/^export /gm, '');
  const className = file === 'rankRenderer.ts' ? 'RankRenderer' : 'RouletteRenderer';
  const Painter = vm.runInNewContext(stripTypeScriptTypes(isolated) + `\n${className};`, context);
  return { [className]: Painter, context };
}
function canvas() {
  const text = [], fills = [], transforms = [];
  const ctx = new Proxy({
    canvas: { dataset: {} },
    fillText(value) { text.push(String(value)); },
    fillRect(...args) { fills.push(args); },
    translate(...args) { transforms.push(['translate', ...args]); },
    scale(...args) { transforms.push(['scale', ...args]); },
    measureText(value) { return { width: String(value).length * 7 }; },
  }, { get: (target, key) => key in target ? target[key] : () => {} });
  return { ctx, text, fills, transforms };
}

test('actual national panel paints only finishers in arrival order with names and a ball count', () => {
  const { RankRenderer } = loadTypeScript('rankRenderer.ts'), renderer = new RankRenderer();
  const { ctx, text, fills } = canvas();
  renderer.render(ctx, { winners: balls(['두번째이름 (1234)', '첫번째이름 (5678)']), marbles: balls(['진행중']), winnerRank: 4 }, 960, 600);
  assert.deepEqual(text.filter(t => t.includes('이름')), ['두번째이름','첫번째이름']);
  assert.ok(text.includes('골인 순서'));
  assert.ok(text.includes('2 / 3개 공'));
  assert.ok(text.includes('★ 현재 당첨 후보'));
  assert.doesNotMatch(text.join('|'), /1234|5678|진행중/);
  assert.ok(fills.every(([x]) => x > 700), 'no restored top HUD or left chat overlay');
  const empty = canvas();
  renderer.render(empty.ctx, { winners: [], marbles: balls(['대기']), winnerRank: 0 }, 960, 600);
  assert.ok(empty.text.includes('아직 골인 전'));
});

test('long finish lists follow arrivals, wheel scrolling stays bounded, and the next draw resets scroll', () => {
  const { RankRenderer } = loadTypeScript('rankRenderer.ts'), renderer = new RankRenderer();
  const state = { winners: balls(Array.from({ length: 60 }, (_, i) => `참가자${i}`)), marbles: [], winnerRank: 0 };
  renderer.render(canvas().ctx, state, 960, 600);
  renderer.update(1000);
  assert.equal(renderer._currentY, renderer.maxY);
  const end = canvas();
  renderer.render(end.ctx, state, 960, 600);
  assert.ok(end.text.includes('참가자59'));
  assert.ok(!end.text.includes('참가자0'));
  renderer.onWheel({ deltaY: -10000 }); renderer.update(250);
  assert.equal(renderer._currentY, 0);
  renderer.onWheel({ deltaY: 10000 }); renderer.update(250);
  assert.equal(renderer._currentY, renderer.maxY);
  renderer.render(canvas().ctx, { ...state, winners: [] }, 960, 600);
  assert.equal(renderer._currentY, 0);
  assert.equal(renderer._targetY, 0);
});

test('other themes keep the existing ranking renderer', () => {
  const { RankRenderer } = loadTypeScript('rankRenderer.ts', 'academy'), renderer = new RankRenderer();
  const { ctx, text } = canvas();
  renderer.render(ctx, { winners: balls(['완료']), marbles: balls(['진행중']), winnerRank: 1 }, 960, 600);
  assert.ok(text.includes('진행중'));
  assert.ok(!text.includes('골인 순서'));
});

test('actual renderer highlights the same balls and broadcast labels, and clears them when the draw stops', () => {
  const { RouletteRenderer, context } = loadTypeScript('rouletteRenderer.ts'), renderer = new RouletteRenderer();
  const { ctx, transforms } = canvas(), bodyFlags = [], labelFlags = [];
  const marbles = balls(['가 (1234)','나 (5678)','다 (9999)']).map(ball => ({
    ...ball, render: (...args) => bodyFlags.push([ball.name, args[2]]),
    renderLabel: (...args) => labelFlags.push([ball.name, args[4]]),
  }));
  renderer._canvas = { width: 1920, height: 1080, dataset: {} };
  renderer._sceneCanvas = { width: 960, height: 540 };
  renderer.ctx = renderer._displayCtx = ctx;
  renderer._broadcastMode = true;
  for (const name of ['renderAdBoards','renderRyanGeckoFinish','renderAcademyFinish','renderEntities','renderEffects','renderWinner']) {
    renderer[name] = () => {};
  }
  const state = {
    marbles, winners: [], winnerRank: 2, drawConfig: { winnerMode: 'last', winnerCount: 2 }, running: true,
    theme: {}, stage: {}, entities: [], camera: { x: 0, y: 0, zoom: 1, renderScene: (_, fn) => fn() },
    particleManager: { render() {} }, size: { x: 960, y: 540 },
  };
  renderer.render(state, []);
  assert.deepEqual(bodyFlags.map(row => row[1]), [false,true,true]);
  assert.deepEqual(bodyFlags, labelFlags);
  assert.equal(renderer._canvas.dataset.highlightedCandidates, '다|나');
  const shift = 960 * (layout.nationalPlayfieldRatio(960) - 1) / 2;
  assert.equal(transforms.filter(([op, x, y]) => op === 'translate' && x === shift && y === 0).length, 2,
    'balls and full-resolution labels both reserve the right list column');
  renderer.render({ ...state, running: false }, []);
  assert.equal(renderer._candidateMarbles.size, 0);
  assert.equal(renderer._canvas.dataset.highlightedCandidates, '');
  context.document.documentElement.dataset.rouletteTheme = 'academy';
  renderer.render(state, []);
  assert.equal(renderer._candidateMarbles.size, 0);
  assert.deepEqual(bodyFlags.slice(-3).map(row => row[1]), [false,false,true]);
  context.document.documentElement.dataset.rouletteTheme = 'national';
  const resultPaint = [];
  renderer.captureNationalFinishFrame = (_, source) => resultPaint.push(['frame', source]);
  renderer.renderWinner = () => resultPaint.push(['award']);
  renderer.render({ ...state, winner: marbles[0], running: false }, []);
  assert.deepEqual(resultPaint.map(row => row[0]), ['frame','award']);
  assert.equal(resultPaint[0][1], renderer._canvas);
  resultPaint.length = 0;
  renderer._broadcastMode = false;
  renderer.render({ ...state, winner: marbles[0], running: false }, []);
  assert.deepEqual(resultPaint.map(row => row[0]), ['frame','award']);
  assert.equal(resultPaint[0][1], renderer._sceneCanvas);
});

test('finish scene is copied once per result, cleared on preparation and never copied from an earlier award', () => {
  const { RouletteRenderer, context } = loadTypeScript('rouletteRenderer.ts'), renderer = new RouletteRenderer();
  const copies = [], frame = { hidden: true, getContext: () => ({ drawImage: (...args) => copies.push(args) }) };
  context.document.querySelector = () => frame;
  const source = { width: 1920, height: 1080 }, winner = { name: '테스트 (1234)' };
  renderer.captureNationalFinishFrame(null, source);
  assert.equal(copies.length, 0);
  renderer.captureNationalFinishFrame(winner, source);
  assert.equal(copies.length, 1);
  assert.equal(copies[0][0], source);
  assert.equal(frame.width, 1920);
  assert.equal(frame.height, 1080);
  assert.equal(frame.hidden, false);
  renderer.captureNationalFinishFrame(winner, source);
  assert.equal(copies.length, 1, 'polls and animation frames cannot recapture the recorded award');
  renderer.captureNationalFinishFrame(null, source);
  assert.equal(frame.hidden, true);
  renderer.captureNationalFinishFrame(winner, source);
  assert.equal(copies.length, 2, 'another draw can capture even the same winner identity');
  context.document.documentElement.dataset.rouletteTheme = 'academy';
  renderer.captureNationalFinishFrame(winner, source);
  assert.equal(frame.hidden, true);
  assert.equal(copies.length, 2);
});

test('a missing or failed finish frame does not throw or repeatedly retry on the animation loop', () => {
  for (const frame of [null, { hidden: false, getContext: () => null },
    { hidden: false, getContext() { throw Error('canvas unavailable'); } }]) {
    const { RouletteRenderer, context } = loadTypeScript('rouletteRenderer.ts'), renderer = new RouletteRenderer();
    let lookups = 0;
    context.document.querySelector = () => { lookups++; return frame; };
    const winner = { name: '테스트 (1234)' }, source = { width: 1920, height: 1080 };
    assert.doesNotThrow(() => renderer.captureNationalFinishFrame(winner, source));
    assert.doesNotThrow(() => renderer.captureNationalFinishFrame(winner, source));
    assert.equal(lookups, 1);
    if (frame) assert.equal(frame.hidden, true);
  }
});

test('actual candidate name chips use a star as well as gold and never show phone suffixes', () => {
  const source = fs.readFileSync(require.resolve('../roulette-app/src/marble.ts'), 'utf8');
  const method = source.slice(source.indexOf('  private _drawName('), source.indexOf('  private _drawOutline('))
    .replace(/private _drawName\([^\n]+\{/, 'function(ctx, zoom, simpleLabel, highlighted=false) {');
  const draw = vm.runInNewContext('(' + method.trim() + ')', {
    runningParticipantName, transformGuard: (_, fn) => fn(),
    document: { documentElement: { dataset: { rouletteTheme: 'national' } } },
  });
  const person = { name: '테스트 (1234)', x: 0, y: 0, size: .5 };
  for (const highlighted of [false,true]) {
    const { ctx, text } = canvas();
    draw.call(person, ctx, 1, false, highlighted);
    assert.deepEqual(text, [highlighted ? '★ 테스트' : '테스트']);
    assert.equal(ctx.strokeStyle, highlighted ? '#f4d48d' : '#739bdb');
  }
});
