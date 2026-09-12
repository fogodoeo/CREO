'use strict';

const crypto = require('node:crypto');
const MAX_INPUT = 400000;
const fail = (message, status = 422) => Object.assign(new Error(message), { status });

function decodeImage(value) {
    if (typeof value !== 'string' || value.length > 540000) throw fail('사진 크기를 줄여 다시 선택해 주세요.', 413);
    const encoded = value.replace(/^data:image\/(?:jpeg|png|webp);base64,/, '');
    if (!encoded || encoded.length % 4 || !/^[A-Za-z0-9+/]+={0,2}$/.test(encoded)) throw fail('사진 파일을 다시 선택해 주세요.');
    const buffer = Buffer.from(encoded, 'base64');
    if (buffer.toString('base64') !== encoded || buffer.length > MAX_INPUT) throw fail('사진 크기를 줄여 다시 선택해 주세요.', 413);
    const jpeg = buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff;
    const png = buffer.subarray(0, 8).equals(Buffer.from([137,80,78,71,13,10,26,10]));
    const webp = buffer.toString('ascii', 0, 4) === 'RIFF' && buffer.toString('ascii', 8, 12) === 'WEBP';
    if (!jpeg && !png && !webp) throw fail('JPG, PNG, WebP 사진을 선택해 주세요.');
    return buffer;
}

function createEntryPhotoProcessor({ concurrency = 1, transform } = {}) {
    let active = 0;
    async function convert(buffer) {
        // Lazy loading keeps photo codec failures out of payment/auction startup.
        const sharp = require('sharp');
        const options = { limitInputPixels: 16000000, failOn: 'warning' };
        const metadata = await sharp(buffer, options).metadata();
        if (!['jpeg','png','webp'].includes(metadata.format) || (metadata.pages || 1) !== 1) throw fail('움직이지 않는 사진 한 장을 선택해 주세요.');
        const render = (edge, quality) => sharp(buffer, options).autoOrient()
            .resize({ width: edge, height: edge, fit: 'inside', withoutEnlargement: true })
            .webp({ quality, effort: 3 }).timeout({ seconds: 8 }).toBuffer({ resolveWithObject: true });
        let result;
        for (const [edge, quality] of [[1600,82],[1400,75],[1200,65]]) {
            result = await render(edge, quality);
            if (result.data.length <= 400000) break;
        }
        const small = await render(320, 72);
        if (result.data.length > 400000 || small.data.length > 60000) throw fail('사진 크기를 줄여 다시 선택해 주세요.', 413);
        return { full: result.data, thumb: small.data, width: result.info.width, height: result.info.height };
    }
    return async value => {
        if (active >= concurrency) throw fail('다른 사진을 처리 중이에요. 잠시 후 다시 시도해 주세요.', 429);
        const buffer = decodeImage(value);
        active++;
        try { return { ...await (transform || convert)(buffer), sourceHash: crypto.createHash('sha256').update(buffer).digest('hex') }; }
        catch (cause) {
            if (cause.status) throw cause;
            throw fail('사진을 읽지 못했어요. 다른 사진으로 다시 시도해 주세요.');
        } finally { active--; }
    };
}

module.exports = { createEntryPhotoProcessor, decodeImage, MAX_INPUT };
