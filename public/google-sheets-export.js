(function (root, factory) {
    var api = factory();
    if (typeof module === 'object' && module.exports) module.exports = api;
    else root.CreoGoogleSheetsExport = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
    'use strict';

    var SHEETS_CREATE_URL = 'https://sheets.googleapis.com/v4/spreadsheets';

    function cleanTitle(value) {
        return String(value || 'CREO 낙찰 배송 정산').replace(/[\\/?*\[\]:]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 100);
    }

    function cellValue(value) {
        if (typeof value === 'number' && Number.isFinite(value)) return { numberValue: value };
        if (typeof value === 'boolean') return { boolValue: value };
        return { stringValue: String(value == null ? '' : value) };
    }

    function color(red, green, blue) {
        return { red: red / 255, green: green / 255, blue: blue / 255 };
    }

    function buildCell(value, columnIndex, rowIndex) {
        var header = rowIndex === 0;
        var numericWon = rowIndex > 0 && columnIndex >= 6 && columnIndex <= 9 && typeof value === 'number';
        var format = {
            verticalAlignment: 'MIDDLE',
            wrapStrategy: columnIndex === 3 || columnIndex === 13 ? 'WRAP' : 'CLIP'
        };
        if (header) {
            format.backgroundColor = color(15, 23, 42);
            format.textFormat = { bold: true, foregroundColor: color(255, 255, 255) };
            format.horizontalAlignment = 'CENTER';
        } else if (rowIndex % 2 === 0) {
            format.backgroundColor = color(248, 250, 252);
        }
        if (numericWon) {
            format.numberFormat = { type: 'NUMBER', pattern: '#,##0"원"' };
            format.horizontalAlignment = 'RIGHT';
        }
        return { userEnteredValue: cellValue(value), userEnteredFormat: format };
    }

    function buildSpreadsheet(rows, title) {
        var safeRows = Array.isArray(rows) ? rows : [];
        var columnCount = Math.max(1, safeRows.reduce(function (max, row) { return Math.max(max, Array.isArray(row) ? row.length : 0); }, 0));
        var widths = [120, 110, 130, 220, 70, 70, 110, 100, 115, 115, 100, 100, 100, 290, 145];
        return {
            properties: {
                title: cleanTitle(title),
                locale: 'ko_KR',
                timeZone: 'Asia/Seoul'
            },
            sheets: [{
                properties: {
                    title: '낙찰 배송 정산',
                    gridProperties: {
                        rowCount: Math.max(100, safeRows.length + 20),
                        columnCount: columnCount,
                        frozenRowCount: safeRows.length ? 1 : 0
                    }
                },
                basicFilter: safeRows.length ? {
                    range: { startRowIndex: 0, endRowIndex: safeRows.length, startColumnIndex: 0, endColumnIndex: columnCount }
                } : undefined,
                data: [{
                    startRow: 0,
                    startColumn: 0,
                    columnMetadata: Array.from({ length: columnCount }, function (_, index) {
                        return { pixelSize: widths[index] || 120 };
                    }),
                    rowData: safeRows.map(function (row, rowIndex) {
                        return {
                            values: Array.from({ length: columnCount }, function (_, columnIndex) {
                                return buildCell(Array.isArray(row) ? row[columnIndex] : '', columnIndex, rowIndex);
                            })
                        };
                    })
                }]
            }]
        };
    }

    async function createSpreadsheet(accessToken, rows, title, fetchImpl) {
        var send = fetchImpl || (typeof fetch === 'function' ? fetch.bind(globalThis) : null);
        if (!send) throw new Error('Google Sheets 요청 기능을 사용할 수 없습니다.');
        var response = await send(SHEETS_CREATE_URL + '?fields=spreadsheetId,spreadsheetUrl', {
            method: 'POST',
            headers: {
                Authorization: 'Bearer ' + String(accessToken || ''),
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(buildSpreadsheet(rows, title))
        });
        var payload = await response.json().catch(function () { return {}; });
        if (!response.ok || !payload.spreadsheetId) {
            var detail = payload && payload.error && payload.error.message;
            throw new Error(detail || '새 구글시트를 만들지 못했습니다.');
        }
        return {
            spreadsheetId: payload.spreadsheetId,
            spreadsheetUrl: payload.spreadsheetUrl || ('https://docs.google.com/spreadsheets/d/' + payload.spreadsheetId + '/edit')
        };
    }

    return {
        SHEETS_CREATE_URL: SHEETS_CREATE_URL,
        buildSpreadsheet: buildSpreadsheet,
        cleanTitle: cleanTitle,
        createSpreadsheet: createSpreadsheet
    };
});
