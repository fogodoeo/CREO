'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');

test('server repositories contain no default admin password or fallback Supabase project', () => {
    const sources = ['platform-repository.js', 'sqlite-platform-repository.js']
        .map((file) => fs.readFileSync(path.join(ROOT, file), 'utf8'))
        .join('\n');
    assert.doesNotMatch(sources, /DEFAULT_ADMIN_SECRET|['"]1234['"]/);
    assert.doesNotMatch(sources, /FALLBACK_SUPABASE_(?:URL|ANON_KEY)/);
    assert.match(sources, /process\.env\.CREO_ADMIN_SECRET/);
    assert.match(sources, /process\.env\.SUPABASE_URL/);
});

test('operational status decisions are centralized in the auction contract', () => {
    const publicDir = path.join(ROOT, 'public');
    const files = fs.readdirSync(publicDir).filter((file) => /\.(?:html|js)$/.test(file) && !file.startsWith('crewart-survey'));
    const offenders = [];
    for (const file of files) {
        if (file === 'auction-contract.js') continue;
        const source = fs.readFileSync(path.join(publicDir, file), 'utf8');
        if (/\.(?:includes|indexOf)\(['"](?:낙찰|유찰)['"]\)/.test(source)
            || /new Set\(\[['"]완료['"][^\]]*(?:낙찰|유찰)/.test(source)) offenders.push(file);
    }
    assert.deepEqual(offenders, []);
});

test('the operations architecture documents source-of-truth and fail-closed rules', () => {
    const document = fs.readFileSync(path.join(ROOT, 'docs', 'OPERATIONS_ARCHITECTURE.md'), 'utf8');
    assert.match(document, /다른 채널이나 CDCUP로 자동 전환하지 않는다/);
    assert.match(document, /tournament_run_id_4/);
    assert.match(document, /상태 문자열을 직접 비교하지 않는다/);
});
