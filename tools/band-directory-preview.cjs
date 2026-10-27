'use strict';
// Isolated UI preview. No production credentials, auction records or messages.
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const { BandMemberDirectory } = require('../band-member-directory');
const directory = new BandMemberDirectory({ enabled: true, dbPath: ':memory:', isAdmin: () => true });
for (let index = 0; index < 55; index++) directory.upsert({
    bandNo: '104432443', memberKey: `synthetic-member-${index}`, observedAt: Date.now(),
    displayName: index === 0 ? '긴 이름을 사용하는 가상 업체 / 프로필 번호 없음' : `가상 회원 ${index + 1}`,
    sources: { profile: { text: `가상 회원 ${index + 1}` }, answer: { text: '테스트 연락처 010-0000-0001' } }
});
directory.setMeta('heartbeat', { receivedAt: Date.now(), connected: true, autoApprove: true, state: 'running', pending: 2, rosterComplete: true });
const server = http.createServer(async (req, res) => {
    const url = new URL(req.url, 'http://localhost');
    if (await directory.handle(req, res, url)) return;
    const filename = url.pathname === '/' ? 'band-members.html' : url.pathname.slice(1);
    if (!['band-members.html', 'band-members.js', 'band-members.css', 'band-monitor.css'].includes(filename)) { res.writeHead(404); res.end(); return; }
    res.setHeader('Content-Type', filename.endsWith('.html') ? 'text/html; charset=utf-8' : filename.endsWith('.css') ? 'text/css' : 'text/javascript');
    res.end(fs.readFileSync(path.join(__dirname, '..', 'public', filename)));
}).listen(0, '127.0.0.1', () => console.log(`Preview: http://127.0.0.1:${server.address().port}`));
