'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const Export = require('../public/google-sheets-export');

const rows = [
    ['업체', '낙찰자', '연락처', '낙찰 개체', '개체 수', '합배송', '낙찰금', '배송비', '결제 요청액', '결제 확인액', '배송 입력', '결제 상태', '결제 수단', '수령지', '입력 시각'],
    ['라이언게코', '테스트', '010-1234-5678', '=A01', 2, '합배송', 300000, 26000, 326000, 326000, '입력 완료', '결제 완료', '계좌이체', '파르게 · 대구', '2026-08-31T00:00:00Z']
];

test('Google Sheets resource creates a formatted Korean settlement sheet', () => {
    const resource = Export.buildSpreadsheet(rows, 'BASIC / 낙찰:배송 정산');
    const sheet = resource.sheets[0];
    assert.equal(resource.properties.title, 'BASIC 낙찰 배송 정산');
    assert.equal(resource.properties.locale, 'ko_KR');
    assert.equal(resource.properties.timeZone, 'Asia/Seoul');
    assert.equal(sheet.properties.title, '낙찰 배송 정산');
    assert.equal(sheet.properties.gridProperties.frozenRowCount, 1);
    assert.equal(sheet.basicFilter.range.endColumnIndex, 15);
    assert.equal(sheet.data[0].columnMetadata[13].pixelSize, 290);
    assert.equal(sheet.data[0].rowData[0].values[0].userEnteredFormat.textFormat.bold, true);
    assert.equal(sheet.data[0].rowData[1].values[6].userEnteredValue.numberValue, 300000);
    assert.equal(sheet.data[0].rowData[1].values[6].userEnteredFormat.numberFormat.pattern, '#,##0"원"');
    assert.equal(sheet.data[0].rowData[1].values[3].userEnteredValue.stringValue, '=A01');
});

test('Google Sheets create calls the official API and returns the new document URL', async () => {
    let request;
    const result = await Export.createSpreadsheet('token', rows, 'BASIC 정산', async (url, options) => {
        request = { url, options };
        return {
            ok: true,
            json: async () => ({ spreadsheetId: 'sheet_123', spreadsheetUrl: 'https://docs.google.com/spreadsheets/d/sheet_123/edit' })
        };
    });
    assert.match(request.url, /^https:\/\/sheets\.googleapis\.com\/v4\/spreadsheets\?/);
    assert.equal(request.options.headers.Authorization, 'Bearer token');
    assert.equal(JSON.parse(request.options.body).sheets[0].properties.title, '낙찰 배송 정산');
    assert.equal(result.spreadsheetId, 'sheet_123');
    assert.equal(result.spreadsheetUrl, 'https://docs.google.com/spreadsheets/d/sheet_123/edit');
});

test('Google Sheets API errors remain actionable', async () => {
    await assert.rejects(
        Export.createSpreadsheet('bad', rows, 'BASIC 정산', async () => ({
            ok: false,
            json: async () => ({ error: { message: 'OAuth client is not authorized' } })
        })),
        /OAuth client is not authorized/
    );
});
