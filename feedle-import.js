'use strict';
// Reads one user-supplied public pet page. No browser login, private endpoint or site script execution.
const PET_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const text = (value, max = 600) => typeof value === 'string' ? value.trim().slice(0, max) : '';
function petUrl(raw) {
  let url; try { url = new URL(raw); } catch { throw new Error('피들 개체 링크를 붙여넣어 주세요.'); }
  const id = url.pathname.split('/')[2];
  if (url.protocol !== 'https:' || !['www.feedle.me', 'feedle.me'].includes(url.hostname) || url.port || url.username || url.password || !/^\/pet\/[^/]+\/?$/.test(url.pathname) || !PET_ID.test(id)) throw new Error('https://www.feedle.me/pet/로 시작하는 개체 링크를 입력해 주세요.');
  return `https://www.feedle.me/pet/${id.toLowerCase()}`;
}
function imageUrl(raw) {
  try {
    const url = new URL(raw);
    if (url.protocol !== 'https:' || url.hostname !== 'api.feedle.me' || url.port || url.username || url.password || url.search || url.hash || !/^\/storage\/v1\/object\/public\/public\/images\/users\/[0-9a-f-]+\/pet-images\/(?:\d{2,4}x\d{2,4}\/)?[0-9a-f-]+$/i.test(url.pathname)) return '';
    return url.href;
  } catch { return ''; }
}
function parsePublicPage(html, rawUrl) {
  const url = petUrl(rawUrl), id = url.split('/').at(-1), nodes = [];
  function visit(value, depth = 0) {
    if (!value || typeof value !== 'object' || depth > 30 || nodes.length > 20000) return;
    nodes.push(value); for (const v of Object.values(value)) visit(v, depth + 1);
  }
  const flight = [];
  for (const match of html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)) {
    if (/type=["']application\/ld\+json["']/i.test(match[1])) { try { visit(JSON.parse(match[2])); } catch { /* malformed metadata is ignored */ } }
    const push = match[2].match(/^self\.__next_f\.push\(([\s\S]*)\);?\s*$/);
    if (push) { try { const data = JSON.parse(push[1]); if (data[0] === 1 && typeof data[1] === 'string') flight.push(data[1]); } catch { /* never evaluate page scripts */ } }
  }
  for (const line of flight.join('').split('\n')) {
    const match = line.match(/^[0-9a-z]+:([\[{].*)$/i);
    if (match) { try { visit(JSON.parse(match[1])); } catch { /* React module references are not pet data */ } }
  }
  const products = nodes.filter(n => n['@type'] === 'Product' && n.url === url);
  const product = products[0];
  if (!product) throw new Error('공개 개체 정보를 찾지 못했어요. 피들에서 링크를 확인하거나 직접 입력해 주세요.');
  const props = Object.fromEntries((product.additionalProperty || []).filter(p => p && typeof p.name === 'string').map(p => [p.name, p.value]));
  const pets = nodes.filter(n => n.id === id && ('hatched_at' in n || Array.isArray(n.pet_images)));
  const pet = pets.sort((a, b) => Object.keys(b).length - Object.keys(a).length)[0] || {};
  const pedigrees = nodes.filter(n => n.hasPedigree === true && n.data && ('father_pet_id' in n.data || 'mother_pet_id' in n.data));
  const pedigree = pedigrees.length === 1 ? pedigrees[0].data : null;
  const parent = role => {
    const p = pedigree?.[role]; if (!p || !PET_ID.test(p.id) || p.id !== pedigree[role + '_pet_id']) return null;
    return { sourceId: p.id, sourceUrl: `https://www.feedle.me/pet/${p.id}`, name: text(p.nickname, 40), code: '', morph: (p.trait_names || []).filter(v => typeof v === 'string').join(' · ').slice(0, 60), sex: role === 'father' ? 'male' : 'female', imageUrl: imageUrl(p.imageUrl) };
  };
  const weight = String(props['체중'] || '').replace(/g$/i, '').trim();
  return {
    sourceUrl: url, sourceId: id, sourceVendor: text(product.brand?.name, 80),
    species: text(props['종'] || product.category, 60), morph: text(props['모프'], 60),
    sex: ({ '수컷': 'male', '암컷': 'female' })[props['성별']] || 'unknown',
    size: text(props['크기'], 20), weight: /^\d+(\.\d{1,2})?$/.test(weight) ? weight : '',
    hatchDate: /^\d{4}-\d{2}-\d{2}/.test(pet.hatched_at || '') ? pet.hatched_at.slice(0, 10) : '',
    note: text(pet.description), photoUrls: (Array.isArray(product.image) ? product.image : [product.image]).map(imageUrl).filter(Boolean).slice(0, 3),
    sire: parent('father'), dam: parent('mother'), parentDataAvailable: Boolean(pedigree)
  };
}
async function boundedFetch(url, limit, fetcher = fetch) {
  const res = await fetcher(url, { redirect: 'manual', signal: AbortSignal.timeout(15000), headers: { Accept: '*/*' } });
  if (res.status !== 200) throw new Error('피들에서 정보를 불러오지 못했어요. 링크를 확인하고 다시 시도해 주세요.');
  if (Number(res.headers.get('content-length')) > limit) throw new Error('가져올 파일이 너무 커요. 직접 사진을 선택해 주세요.');
  let size = 0; const chunks = [];
  for await (const chunk of res.body) { size += chunk.byteLength; if (size > limit) throw new Error('가져올 파일이 너무 커요. 직접 사진을 선택해 주세요.'); chunks.push(Buffer.from(chunk)); }
  return { buffer: Buffer.concat(chunks), type: res.headers.get('content-type')?.split(';')[0] || '' };
}
function createImporter(fetcher = fetch) {
  const cache = new Map(), imagePermissions = new Map();
  return {
    async metadata(rawUrl) {
      const url = petUrl(rawUrl), now = Date.now();
      for (const [key, value] of cache) if (value.until < now) cache.delete(key);
      for (const [key, until] of imagePermissions) if (until < now) imagePermissions.delete(key);
      if (cache.get(url)?.until > now) return cache.get(url).data;
      const { buffer } = await boundedFetch(url, 2 * 1024 * 1024, fetcher);
      const data = parsePublicPage(buffer.toString('utf8'), url);
      // A parent card exposes a small thumbnail; read only that linked public
      // parent's page to obtain its first full-size photo, with thumbnail fallback.
      for (const p of [data.sire, data.dam].filter(Boolean)) {
        try {
          const full = await boundedFetch(petUrl(p.sourceUrl), 2 * 1024 * 1024, fetcher);
          const parentData = parsePublicPage(full.buffer.toString('utf8'), p.sourceUrl);
          if (parentData.photoUrls[0]) p.imageUrl = parentData.photoUrls[0];
        } catch { /* keep the publicly rendered parent-card thumbnail */ }
      }
      for (const image of [...data.photoUrls, data.sire?.imageUrl, data.dam?.imageUrl].filter(Boolean)) imagePermissions.set(image, now + 30 * 60 * 1000);
      cache.set(url, { data, until: now + 10 * 60 * 1000 });
      if (cache.size > 30) cache.delete(cache.keys().next().value);
      return data;
    },
    async image(rawUrl) {
      const url = imageUrl(rawUrl);
      if (!url || !(imagePermissions.get(url) > Date.now())) throw new Error('피들 링크를 먼저 불러온 뒤 사진을 다시 가져와 주세요.');
      const result = await boundedFetch(url, 12 * 1024 * 1024, fetcher);
      if (!['image/jpeg', 'image/png', 'image/webp'].includes(result.type)) throw new Error('지원하지 않는 사진 형식이에요. 사진을 직접 선택해 주세요.');
      return result;
    }
  };
}
module.exports = { petUrl, imageUrl, parsePublicPage, createImporter };
