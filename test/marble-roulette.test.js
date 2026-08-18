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
    assert.ok(totalBytes < 1_500_000, `bundle is unexpectedly large: ${totalBytes} bytes`);
});
