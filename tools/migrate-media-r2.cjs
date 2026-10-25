'use strict';

require('../load-local-env')();
const fs = require('node:fs/promises');
const path = require('node:path');
const { SupabaseMediaSource, migrateMedia } = require('../media-migration');
const { createR2MediaStorage } = require('../r2-media-storage');
const { DiskMediaSource } = require('../disk-media-source');

async function main() {
    const args = process.argv.slice(2);
    const mode = args.includes('--apply') ? 'copy' : args.includes('--verify') ? 'verify' : 'inventory';
    const concurrencyIndex = args.indexOf('--concurrency');
    const concurrency = concurrencyIndex < 0 ? 1 : Number(args[concurrencyIndex + 1]);
    if (args.includes('--apply') && args.includes('--verify')) throw Error('Choose --apply or --verify');
    const outputIndex = args.indexOf('--output');
    const output = path.resolve(outputIndex >= 0 ? args[outputIndex + 1] : path.join('outputs', 'r2-migration', `${Date.now()}`));
    await fs.mkdir(output, { recursive: true });
    const sourceIndex = args.indexOf('--source');
    const sourceName = sourceIndex >= 0 ? args[sourceIndex + 1] : 'supabase';
    const directoryIndex = args.indexOf('--directory');
    const directory = directoryIndex >= 0 ? args[directoryIndex + 1] : null;
    if (!['supabase', 'site', 'broadcast-disk', 'capture-disk'].includes(sourceName)) throw Error('Invalid --source');
    if (sourceName.endsWith('-disk') && !directory) throw Error('--directory is required for disk uploads');
    const namespace = { site: 'site-assets', 'broadcast-disk': 'broadcast-assets', 'capture-disk': 'auction-captures' }[sourceName];
    const source = sourceName === 'supabase'
        ? new SupabaseMediaSource({ url: process.env.SUPABASE_URL, serviceKey: process.env.SUPABASE_SERVICE_ROLE_KEY })
        : new DiskMediaSource({ directory: directory || path.join(__dirname, '..', 'public'), namespace, contentAddressed: sourceName === 'site' });
    const target = mode === 'inventory' ? null : createR2MediaStorage({ ...process.env, CREO_MEDIA_STORAGE: 'r2' });
    // A new journal per run avoids accepting an old completion marker after failure.
    const run = `${Date.now()}-${process.pid}`;
    const journal = path.join(output, `objects-${run}.jsonl`);
    let count = 0;
    const report = await migrateMedia({ source, target, mode, concurrency, ...(namespace ? { buckets: [namespace] } : {}), onRecord: async record => {
        await fs.appendFile(journal, JSON.stringify(record) + '\n', 'utf8');
        if (++count % 100 === 0) console.log(JSON.stringify({ mode, processed: count }));
    } });
    report.source = sourceName;
    await fs.writeFile(path.join(output, `summary-${run}.json`), JSON.stringify(report, null, 2) + '\n', 'utf8');
    console.log(JSON.stringify(report, null, 2));
}
main().catch(error => { console.error(error.message); process.exitCode = 1; });
