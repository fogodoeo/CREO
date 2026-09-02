'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const publicRoot = path.join(__dirname, '..', 'public');

test('capture setup ships only the current desktop agent archive', () => {
    const downloads = path.join(publicRoot, 'downloads');
    const archives = fs.readdirSync(downloads)
        .filter(name => /^creo-capture-agent-v.*\.zip$/i.test(name))
        .sort();
    assert.deepEqual(archives, ['creo-capture-agent-v1.2.3.zip']);
    assert.ok(fs.statSync(path.join(downloads, archives[0])).size < 24 * 1024 * 1024);

    const setup = fs.readFileSync(path.join(publicRoot, 'capture-setup.html'), 'utf8');
    assert.match(setup, /downloads\/creo-capture-agent-v1\.2\.3\.zip/);
});

test('pinball keeps one production asset pack instead of duplicate legacy copies', () => {
    assert.equal(fs.existsSync(path.join(publicRoot, 'assets', 'pinball-liongecko')), false);
    assert.equal(fs.existsSync(path.join(publicRoot, 'assets', 'pinball-ryangecko', 'lion-crest.png')), false);

    const renderer = fs.readFileSync(path.join(__dirname, '..', 'roulette-app', 'src', 'rouletteRenderer.ts'), 'utf8');
    for (const name of ['gold-wand.png', 'gold-bumper.png', 'finish-gate.png', 'ryan-billboard.png', 'ryan-crest.png']) {
        assert.match(renderer, new RegExp(`pinball-ryangecko/${name.replace('.', '\\.')}['\"]`));
        assert.equal(fs.existsSync(path.join(publicRoot, 'assets', 'pinball-ryangecko', name)), true);
    }
});
