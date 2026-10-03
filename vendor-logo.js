'use strict';
const crypto = require('node:crypto');
const fail = (message, status = 422) => Object.assign(Error(message), {status});
function createVendorLogo(storage) {
 let active = 0;
 return async function save(id, data) {
  if (!storage) throw fail('로고 저장소를 확인 중이에요. 잠시 후 다시 시도해 주세요.', 503);
  if (active >= 2) throw fail('사진을 처리 중이에요. 잠시 후 다시 시도해 주세요.', 429);
  if (typeof data !== 'string' || data.length > 7000000 || !/^data:image\/(?:jpeg|png|webp);base64,[A-Za-z0-9+/]+={0,2}$/.test(data)) throw fail('JPG·PNG·WebP 사진을 선택해 주세요.');
  const bytes = Buffer.from(data.slice(data.indexOf(',') + 1), 'base64');
  if (!bytes.length || bytes.length > 5 * 1024 * 1024) throw fail('5MB 이하의 사진을 선택해 주세요.');
  active++;
  try {
   const sharp = require('sharp'), source = sharp(bytes, {limitInputPixels: 25000000, animated: false});
   const meta = await source.metadata();
   if (!['jpeg','png','webp'].includes(meta.format)) throw fail('JPG·PNG·WebP 사진을 선택해 주세요.');
   const output = await source.rotate().resize(320,320,{fit:'inside',withoutEnlargement:true}).webp({quality:85}).toBuffer();
   const result = await storage.put('vendor-logos', id + '-' + crypto.randomUUID() + '.webp', output, 'image/webp');
   return result.url;
  } catch (e) {
   if (e.status) throw e;
   throw fail('로고를 저장하지 못했어요. 사진을 확인하고 다시 시도해 주세요.', 503);
  } finally { active--; }
 };
}
module.exports = {createVendorLogo};
