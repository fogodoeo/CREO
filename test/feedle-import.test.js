const { test } = require('node:test');
const assert = require('node:assert/strict');
const { petUrl, imageUrl, parsePublicPage, createImporter } = require('../feedle-import');
const id = 'a4cdde1f-03f1-44bd-9c02-b1a79abb6057';
const url = `https://www.feedle.me/pet/${id}`;
const pic = 'https://api.feedle.me/storage/v1/object/public/public/images/users/f98ebbc9-9e4b-44e9-aafe-158b89ad27b4/pet-images/d10f346c-09d2-4613-8b02-7b5c98d26420';
function html() {
  const product = { '@type': 'Product', url, name: '개체', image: [pic], category: '크레스티드 게코', offers: { price: 100000 }, additionalProperty: [{ name: '모프', value: '달마시안' }, { name: '성별', value: '암컷' }, { name: '체중', value: '11g' }] };
  const pet = { id, description: '입력 내용', hatched_at: null, pet_images: [] };
  const father = { id: '19098cb0-a0e4-47a6-accf-92a01f4b6f9b', nickname: '젖소', trait_names: ['달마시안'], imageUrl: pic };
  const pedigree = { hasPedigree: true, data: { father_pet_id: father.id, mother_pet_id: null, father, mother: null } };
  return `<script type="application/ld+json">${JSON.stringify(product)}</script><script>self.__next_f.push(${JSON.stringify([1, '1:' + JSON.stringify({ pet, pedigree }) + '\n'])})</script>`;
}
test('accepts only public Feedle pet URLs and canonicalizes tracking query parameters', () => {
  assert.equal(petUrl(url + '?ref=login'), url);
  for (const bad of ['http://127.0.0.1/pet/' + id, 'https://www.feedle.me.evil.test/pet/' + id, 'https://www.feedle.me:444/pet/' + id, 'https://user:pass@www.feedle.me/pet/' + id, 'https://www.feedle.me/profile/' + id, 'https://www.feedle.me/pet/no-id']) assert.throws(() => petUrl(bad));
  assert.equal(imageUrl('http://127.0.0.1/photo'), ''); assert.equal(imageUrl(pic), pic);
});
test('reads declarative public data without evaluating scripts, preserves missing mother, and excludes sale price', () => {
  const data = parsePublicPage(html() + '<script>throw new Error("must not execute")</script>', url);
  assert.equal(data.morph, '달마시안'); assert.equal(data.sex, 'female'); assert.equal(data.weight, '11');
  assert.equal(data.sire.name, '젖소'); assert.equal(data.dam, null); assert.equal(data.note, '입력 내용');
  assert.equal('price' in data, false); assert.deepEqual(data.photoUrls, [pic]);
});
test('refuses unrelated, login, missing or changed pages instead of inventing pet data', () => {
  assert.throws(() => parsePublicPage('<html>로그인</html>', url), /공개 개체/);
  assert.throws(() => parsePublicPage(html().replaceAll(id, '00000000-0000-0000-0000-000000000000'), url), /공개 개체/);
});
test('does not follow redirects and only proxies photos discovered on the requested public page', async () => {
  let calls = 0;
  const importer = createImporter(async (requested, options) => { calls++; assert.equal(options.redirect, 'manual'); if (requested === url) return new Response(html()); if (requested === pic) return new Response(new Blob(['image'], { type: 'image/jpeg' })); return new Response('', { status: 302, headers: { location: 'http://127.0.0.1' } }); });
  await assert.rejects(importer.image(pic), /먼저/); await importer.metadata(url); await importer.image(pic);
  const count = calls; await importer.metadata(url); assert.equal(calls, count);
  await assert.rejects(importer.image(pic.replace('d10f346c', 'e10f346c')), /먼저/);
});
test('bounded fetch rejects oversized metadata and non-image content', async () => {
  const large = createImporter(async () => new Response('bad', { headers: { 'content-length': '9999999' } }));
  await assert.rejects(large.metadata(url), /너무 커/);
  const invalid = createImporter(async requested => requested === url ? new Response(html()) : new Response('<html>no image</html>', { headers: { 'content-type': 'text/html' } }));
  await invalid.metadata(url); await assert.rejects(invalid.image(pic), /사진 형식/);
});
