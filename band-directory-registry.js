'use strict';
const { BandMemberDirectory } = require('./band-member-directory');
const BANDS = Object.freeze([
    { id: '104432443', name: '전국크레자랑' },
    { id: '105217754', name: '열성가락' }
]);

// A fixed allowlist and one directory per band avoid mutable request-wide band context.
class BandDirectoryRegistry {
    constructor(options = {}) {
        const env = options.env || process.env;
        this.isAdmin = options.isAdmin || (() => false);
        this.directories = new Map(BANDS.map(band => {
            const primary = band.id === BANDS[0].id;
            return [band.id, new BandMemberDirectory({ ...options, bandNo: band.id,
                token: primary ? (options.token || env.BAND_DIRECTORY_BOT_TOKEN || '')
                    : (options.secondaryToken || env.BAND_DIRECTORY_BOT_TOKEN_105217754 || ''),
                env: { ...env, BAND_DIRECTORY_BOT_TOKEN: primary ? env.BAND_DIRECTORY_BOT_TOKEN || ''
                    : env.BAND_DIRECTORY_BOT_TOKEN_105217754 || '',
                    BAND_DIRECTORY_BOT_URL: primary ? env.BAND_DIRECTORY_BOT_URL || ''
                    : env.BAND_DIRECTORY_BOT_URL_105217754 || '' }
            })];
        }));
        this.enabled = this.directories.get(BANDS[0].id).enabled;
    }
    resolve(input) {
        return this.directories.get(String(input.bandNo || BANDS[0].id))?.resolve(input) || null;
    }
    status() { return this.directories.get(BANDS[0].id).status(); }
    async handle(req, res, url) {
        if (!url.pathname.startsWith('/api/band-directory/')) return false;
        if (url.pathname === '/api/band-directory/bands' && req.method === 'GET') {
            const allowed = await this.isAdmin(req);
            res.writeHead(allowed ? 200 : 401, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
            res.end(JSON.stringify(allowed ? { bands: BANDS } : { error: 'unauthorized' }));
            return true;
        }
        const id = url.searchParams.get('bandNo') || BANDS[0].id;
        const directory = this.directories.get(id);
        if (!directory) {
            res.writeHead(404, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
            res.end(JSON.stringify({ error: 'unknown_band' }));
            return true;
        }
        return directory.handle(req, res, url);
    }
    startKeepalive() { for (const d of this.directories.values()) d.startKeepalive(); }
    close() { for (const d of this.directories.values()) d.close(); }
}
module.exports = { BandDirectoryRegistry, BANDS };
