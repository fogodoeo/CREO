'use strict';

const fs = require('node:fs');
const path = require('node:path');

function loadLocalEnv(filePath = path.join(__dirname, '.env')) {
    let source;
    try { source = fs.readFileSync(filePath, 'utf8'); }
    catch (error) {
        if (error.code === 'ENOENT') return false;
        throw error;
    }
    for (const line of source.split(/\r?\n/)) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith('#')) continue;
        const separator = trimmed.indexOf('=');
        if (separator < 1) continue;
        const key = trimmed.slice(0, separator).trim();
        if (!/^[A-Z_][A-Z0-9_]*$/.test(key) || process.env[key] !== undefined) continue;
        let value = trimmed.slice(separator + 1).trim();
        if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
            value = value.slice(1, -1);
        }
        process.env[key] = value;
    }
    return true;
}

module.exports = loadLocalEnv;
