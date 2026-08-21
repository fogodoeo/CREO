'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const appRoot = path.join(root, 'roulette-app');
const publicRoot = path.join(root, 'public', 'roulette');

test('marble roulette keeps the upstream MIT notice and standalone source', () => {
    const license = fs.readFileSync(path.join(appRoot, 'LICENSE'), 'utf8');
    assert.match(license, /^MIT License/);
    assert.match(license, /Copyright \(c\) 2023 LazyGyu/);
    assert.equal(fs.existsSync(path.join(appRoot, 'src', 'data', 'maps.ts')), true);
    assert.equal(fs.existsSync(path.join(appRoot, 'src', 'physics-box2d.ts')), true);
    assert.equal(fs.existsSync(path.join(appRoot, 'src', 'config.ts')), true);
});

test('production roulette bundle is self-contained and free from upstream trackers', () => {
    const html = fs.readFileSync(path.join(publicRoot, 'index.html'), 'utf8');
    assert.match(html, /\/roulette\/roulette-app\.[a-f0-9]+\.js/);
    assert.match(html, /\/roulette\/roulette-app\.[a-f0-9]+\.css/);
    assert.doesNotMatch(html, /https?:\/\//i);

    const files = fs.readdirSync(publicRoot);
    const scripts = files.filter((file) => /^roulette-app\..+\.js$/.test(file));
    const styles = files.filter((file) => /^roulette-app\..+\.css$/.test(file));
    assert.equal(scripts.length, 1, 'only the current application script should remain');
    assert.equal(styles.length, 1, 'only the current stylesheet should remain');
    const [script] = scripts;
    const scriptSource = fs.readFileSync(path.join(publicRoot, script), 'utf8');
    assert.doesNotMatch(scriptSource, /umami\.lazygyu|marblerouletteshop|google-analytics/i);
    assert.match(scriptSource, /CreoMarbleRoulette/);
});

test('production roulette includes Box2D runtimes and stays within a small static budget', () => {
    const files = fs.readdirSync(publicRoot);
    assert.ok(files.some((file) => file.endsWith('.wasm')), 'Box2D wasm must be emitted');
    const totalBytes = files.reduce((sum, file) => sum + fs.statSync(path.join(publicRoot, file)).size, 0);
    assert.ok(totalBytes < 3_750_000, `bundle is unexpectedly large: ${totalBytes} bytes`);
});

test('roulette exposes its version and keeps native broadcast rendering with the smooth upstream physics step', () => {
    const html = fs.readFileSync(path.join(appRoot, 'index.html'), 'utf8');
    const config = fs.readFileSync(path.join(appRoot, 'src', 'config.ts'), 'utf8');
    const roulette = fs.readFileSync(path.join(appRoot, 'src', 'roulette.ts'), 'utf8');
    const renderer = fs.readFileSync(path.join(appRoot, 'src', 'rouletteRenderer.ts'), 'utf8');
    const marble = fs.readFileSync(path.join(appRoot, 'src', 'marble.ts'), 'utf8');

    assert.doesNotMatch(html, /id="versionBadge"/);
    assert.match(config, /APP_VERSION = '1\.8\.0'/);
    assert.match(roulette, /_updateInterval = 10/);
    assert.match(roulette, /!finishedIds\.has\(marble\.id\)/);
    assert.match(renderer, /COMPACT_SCENE_PIXEL_BUDGET = 520_000/);
    assert.match(renderer, /Math\.min\(MAX_DISPLAY_WIDTH, Math\.max\(realSize\.width, 960\)\)/);
    assert.match(renderer, /SCENE_DISPLAY_ZOOM = 1\.3/);
    assert.match(marble, /diameter \* 1\.6/);
    assert.match(marble, /800 16pt 'Pretendard Variable'/);
    assert.match(renderer, /performance: 960/);
    assert.match(renderer, /balanced: 1280/);
    assert.match(renderer, /high: 1920/);
    assert.match(renderer, /BROADCAST_DISPLAY_WIDTH = 1920/);
    assert.match(renderer, /renderBroadcastLabels/);
    assert.match(marble, /_getGlassSprite/);
    assert.match(marble, /createRadialGradient/);
});

test('global pinball launcher exposes reusable skins and carries the selected channel', () => {
    const main = fs.readFileSync(path.join(root, 'public', 'index.html'), 'utf8');

    assert.match(main, /id="quick-pinball-skin"/);
    assert.match(main, /id="quick-pinball"/);
    assert.match(main, /value="academy">마법학교/);
    assert.match(main, /creo_pinball_skin_v1/);
    assert.match(main, /new URLSearchParams\(\{theme:pinballSkin\.value\}\)/);
    assert.match(main, /params\.set\('channel',activeChannel\.name\)/);
});

test('academy pinball skin changes both physics colors and application chrome', () => {
    const html = fs.readFileSync(path.join(appRoot, 'index.html'), 'utf8');
    const config = fs.readFileSync(path.join(appRoot, 'src', 'config.ts'), 'utf8');
    const app = fs.readFileSync(path.join(appRoot, 'src', 'app.ts'), 'utf8');
    const renderer = fs.readFileSync(path.join(appRoot, 'src', 'rouletteRenderer.ts'), 'utf8');
    const physics = fs.readFileSync(path.join(appRoot, 'src', 'physics-box2d.ts'), 'utf8');
    const styles = fs.readFileSync(path.join(appRoot, 'assets', 'app.scss'), 'utf8');

    assert.match(html, /name="theme" value="academy"/);
    assert.match(html, /theme-swatch academy">마법학교/);
    assert.match(config, /academy:\s*\{/);
    assert.match(config, /background: '#101614'/);
    assert.match(app, /dataset\.rouletteTheme = String\(currentThemeName\(\)\)/);
    assert.match(app, /next\.accentColor = THEME_PRESETS\[theme\]\.coolTimeIndicator/);
    assert.match(styles, /html\[data-roulette-theme='academy'\]/);
    assert.match(styles, /\.theme-swatch\.academy/);
    assert.match(styles, /html\[data-roulette-theme='academy'\] \.result-dialog/);
    for (const asset of ['wand-v2.png', 'rune-stone-v2.png', 'finish-gate-v2.png']) {
        const assetPath = path.join(root, 'public', 'assets', 'pinball-academy', asset);
        assert.equal(fs.existsSync(assetPath), true, `${asset} must exist`);
        const png = fs.readFileSync(assetPath);
        assert.equal(png[25], 6, `${asset} must be an RGBA PNG rather than a baked background image`);
    }
    assert.match(physics, /motion: entity\.type/);
    assert.match(renderer, /entity\.motion === 'kinematic' \|\| w >= h \* 2\.4/);
    assert.match(renderer, /wand-v2\.png/);
    assert.doesNotMatch(renderer, /loadGeneratedCutout/);
    assert.match(renderer, /renderAcademyFinish\(renderParameters\.stage\)/);
    assert.match(renderer, /'\/assets\/crewart-crest-v2\.webp'/);
});

test('pinball stage stays clean while candidate and controls remain in their operational positions', () => {
    const html = fs.readFileSync(path.join(appRoot, 'index.html'), 'utf8');
    const app = fs.readFileSync(path.join(appRoot, 'src', 'app.ts'), 'utf8');
    const rankRenderer = fs.readFileSync(path.join(appRoot, 'src', 'rankRenderer.ts'), 'utf8');
    const minimap = fs.readFileSync(path.join(appRoot, 'src', 'minimap.ts'), 'utf8');
    const styles = fs.readFileSync(path.join(appRoot, 'assets', 'app.scss'), 'utf8');

    assert.doesNotMatch(html, /id="stageHelp"|class="brand-lockup"|class="version-badge"/);
    assert.match(html, /class="sr-only" id="statusPill"/);
    assert.doesNotMatch(html, /화면 중앙을 누르고 있으면|추첨 진행 중/);
    assert.doesNotMatch(app, /당첨 유력|candidateLabel/);
    assert.match(rankRenderer, /const uiScale = Math\.max\(1, width \/ 720\)/);
    assert.match(rankRenderer, /const hudHeight = 80 \* uiScale/);
    assert.match(rankRenderer, /850 \$\{20 \* uiScale\}pt/);
    assert.match(rankRenderer, /ctx\.fillText\(candidate\.name/);
    assert.doesNotMatch(rankRenderer, /당첨 유력|`#\$\{rank\}/);
    assert.doesNotMatch(rankRenderer, /const hudHeight = broadcastMode \?/);
    assert.match(minimap, /const controlsReserve = 62 \* uiScale/);
    assert.match(minimap, /this\.top = 90 \* uiScale/);
    assert.match(minimap, /camera\.zoom \* initialZoom \* SCENE_DISPLAY_ZOOM/);
    assert.match(styles, /bottom: calc\(14px \+ var\(--safe-bottom\)\)/);
    assert.match(styles, /left: calc\(20px \+ var\(--safe-left\)\)/);
    assert.match(styles, /PretendardVariable\.woff2/);

    const font = fs.readFileSync(path.join(appRoot, 'assets', 'PretendardVariable.woff2'));
    assert.equal(font.subarray(0, 4).toString('ascii'), 'wOF2');
    assert.ok(font.length > 1_000_000, 'full Korean variable font must be shipped locally');
    assert.match(fs.readFileSync(path.join(appRoot, 'PRETENDARD-LICENSE.txt'), 'utf8'), /SIL OPEN FONT LICENSE/);
    assert.match(fs.readFileSync(path.join(publicRoot, 'PRETENDARD-LICENSE.txt'), 'utf8'), /SIL OPEN FONT LICENSE/);
});

test('candidate bar selects three unique people nearest to the configured winning rank', () => {
    const { selectCandidateRanks } = require(path.join(appRoot, 'src', 'candidateRanking.js'));
    const ranked = [
        { name: '가' },
        { name: '가' },
        { name: '나' },
        { name: '다' },
        { name: '라' },
    ];

    assert.deepEqual(
        selectCandidateRanks(ranked, 0).map(({ candidate, rank }) => [candidate.name, rank]),
        [['가', 1], ['나', 3], ['다', 4]],
    );
    assert.deepEqual(
        selectCandidateRanks(ranked, ranked.length - 1).map(({ candidate, rank }) => [candidate.name, rank]),
        [['라', 5], ['다', 4], ['나', 3]],
    );
    assert.deepEqual(
        selectCandidateRanks(ranked, 2).map(({ candidate, rank }) => [candidate.name, rank]),
        [['나', 3], ['가', 2], ['다', 4]],
    );
});
