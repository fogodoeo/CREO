'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');

const {
    createBandMonitorStatusReader,
    normalizeBandMonitorStatus
} = require('../band-monitor-status');

test('normalizes runtime status without exposing cookies, phones, or applicant data', () => {
    const now = Date.parse('2026-08-22T05:00:20.000Z');
    const status = normalizeBandMonitorStatus({
        version: '0.3.3',
        updated_at: '2026-08-22T05:00:00.000Z',
        state: 'connected',
        connected: true,
        detail: '신청자 01012345678 확인',
        cookie_secret: 'never-public',
        applicant_name: '홍길동',
        applications: { tracked: 3, queued: -1, approved: 2 },
        auth_session: {
            cookie_count: 12,
            installed_cookie_count: 12,
            cookie_source: 'snapshot',
            target_url: 'https://www.band.us/band/101878670/applications',
            raw_cookie: 'never-public'
        },
        member_sync: {
            enabled: true,
            configured: true,
            pending: 3,
            interval_seconds: 300,
            outbox_persistent: true,
            roster_reconcile: {
                enabled: true,
                interval_seconds: 60,
                last_result: {
                    result: 'synced',
                    success: true,
                    scanned: 302,
                    eligible: 290,
                    synced: 1,
                    at: '2026-08-22T05:00:10.000Z',
                    display_name: '홍길동'
                }
            },
            phone: '01012345678',
            display_name: '홍길동'
        }
    }, now);

    assert.equal(status.state, 'CONNECTED');
    assert.equal(status.stale, false);
    assert.equal(status.age_seconds, 20);
    assert.equal(status.detail, '신청자 010-****-5678 확인');
    assert.equal(status.applications.queued, 0);
    assert.equal(status.auth_session.cookie_source, 'snapshot');
    assert.equal(status.auth_session.target_url, 'https://www.band.us/band/101878670/applications');
    assert.equal(status.member_sync.pending, 3);
    assert.equal(status.member_sync.interval_seconds, 300);
    assert.equal(status.member_sync.outbox_persistent, true);
    assert.equal(status.member_sync.roster_reconcile.enabled, true);
    assert.equal(status.member_sync.roster_reconcile.last_result.scanned, 302);
    assert.equal(status.member_sync.roster_reconcile.last_result.synced, 1);
    assert.doesNotMatch(JSON.stringify(status), /never-public|홍길동|01012345678/);
});

test('reads the same persisted status after a reader restart and fails closed when missing', async (t) => {
    const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'creo-band-monitor-'));
    t.after(() => fs.rm(directory, { recursive: true, force: true }));
    const statusFile = path.join(directory, 'runtime.json');
    const now = Date.parse('2026-08-22T05:00:20.000Z');
    await fs.writeFile(statusFile, JSON.stringify({
        updated_at: '2026-08-22T05:00:00.000Z',
        state: 'CONNECTED',
        connected: true,
        applications: { queued: 4 }
    }), 'utf8');

    const firstReader = createBandMonitorStatusReader({ statusFile, now: () => now });
    const secondReader = createBandMonitorStatusReader({ statusFile, now: () => now });
    assert.deepEqual(await secondReader(), await firstReader());
    assert.equal((await secondReader()).applications.queued, 4);

    await fs.rm(statusFile);
    const missing = await secondReader();
    assert.equal(missing.state, 'UNKNOWN');
    assert.equal(missing.connected, false);
    assert.equal(missing.stale, true);
});
