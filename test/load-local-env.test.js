'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const loadLocalEnv = require('../load-local-env');

test('local env loader fills missing values without overriding hosted environment', (t) => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'creo-env-'));
    const file = path.join(directory, '.env');
    fs.writeFileSync(file, "CREO_TEST_NEW='one'\nCREO_TEST_EXISTING=local\n# ignored\n", 'utf8');
    process.env.CREO_TEST_EXISTING = 'hosted';
    t.after(() => {
        delete process.env.CREO_TEST_NEW;
        delete process.env.CREO_TEST_EXISTING;
        fs.rmSync(directory, { recursive: true, force: true });
    });
    assert.equal(loadLocalEnv(file), true);
    assert.equal(process.env.CREO_TEST_NEW, 'one');
    assert.equal(process.env.CREO_TEST_EXISTING, 'hosted');
});
