(() => {
  'use strict';
  const params = new URLSearchParams(location.search);
  const short = /^\/(?:w|v)\/([A-Za-z0-9_-]{8,24})$/.exec(location.pathname);
  const code = params.get('code') || short?.[1] || '';
  const token = params.get('token') || '';
  let selected = params.get('event') || '', current = null, localMedia = [], recovery = null;
  let mutationEpoch = 0, readSequence = 0;
  const credential = () => code ? { code } : { token };
  const uid = () => crypto.randomUUID();
  const copy = value => structuredClone(value);
  let database;
  function db() {
    if (!database) database = new Promise((resolve, reject) => {
      const request = indexedDB.open('ongdong-vendor-entry-recovery-v1', 1);
      request.onupgradeneeded = () => request.result.createObjectStore('records');
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => { database = null; reject(Error('이 기기에 작성 내용을 보관하지 못했어요. 브라우저 저장 공간을 확인해 주세요.')); };
    });
    return database;
  }
  async function record(type, value, remove = false, scope = { ownerId: current?.ownerId, eventId: selected }) {
    if (!scope.ownerId) throw Error('업체 정보를 먼저 불러와 주세요.');
    const connection = await db(), key = `${scope.ownerId}:${scope.eventId}:${type}`;
    return new Promise((resolve, reject) => {
      const transaction = connection.transaction('records', value === undefined && !remove ? 'readonly' : 'readwrite');
      const store = transaction.objectStore('records');
      const request = remove ? store.delete(key) : value === undefined ? store.get(key) : store.put(value, key);
      transaction.oncomplete = () => resolve(request.result);
      transaction.onerror = transaction.onabort = () => reject(Error('이 기기에 작성 내용을 보관하지 못했어요. 다시 시도해 주세요.'));
    });
  }
  async function request(path, body, { binary = false, timeout = 30000 } = {}) {
    if (!code && !token) throw Error('업체 전용 링크로 다시 열어 주세요.');
    let response;
    try {
      response = await fetch('/api/platform/' + path, body ? {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...body, ...credential(), event: selected }), signal: AbortSignal.timeout(timeout)
      } : { signal: AbortSignal.timeout(timeout), cache: 'no-store' });
    } catch { throw Error('연결하지 못했어요. 작성 내용은 유지돼요. 다시 시도해 주세요.'); }
    if (binary && response.ok) return response.blob();
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw Object.assign(Error(data.error || '저장하지 못했어요. 다시 시도해 주세요.'), { status: response.status });
    return data;
  }
  function merged() {
    const media = new Map((current.media || []).map(row => [row.id, row]));
    for (const row of localMedia) if (!media.has(row.id) || row.pending) media.set(row.id, row);
    return { ...current, media: [...media.values()] };
  }
  async function read() {
    const sequence = ++readSequence, epoch = mutationEpoch;
    const query = new URLSearchParams({ ...credential(), ...(selected ? { event: selected } : {}) });
    const result = await request('vendor-entries?' + query);
    if (selected && result.state.channelId !== selected) throw Error('경매가 일치하지 않아요. 업체 링크를 다시 열어 주세요.');
    const scope = { ownerId: result.state.ownerId, eventId: result.state.channelId };
    const [storedMedia, storedDraft] = await Promise.all([record('media', undefined, false, scope), record('draft', undefined, false, scope)]);
    if (current && (epoch !== mutationEpoch || sequence !== readSequence || result.state.version < current.version)) return merged();
    current = result.state; selected = current.channelId;
    localMedia = storedMedia || [];
    recovery = storedDraft || null;
    // A completed upload may have lost its response; prefer durable server media.
    localMedia = localMedia.filter(row => !current.media.some(saved => saved.id === row.id));
    await record('media', localMedia);
    return merged();
  }
  const base64 = blob => new Promise((resolve, reject) => {
    const reader = new FileReader(); reader.onload = () => resolve(reader.result); reader.onerror = () => reject(Error('사진을 다시 선택해 주세요.')); reader.readAsDataURL(blob);
  });
  async function flushPhoto(id) {
    const media = localMedia.find(row => row.id === id);
    if (!media?.pending) return;
    try {
      const result = await request('vendor-entries/photos', { id, image: await base64(media.blob) });
      mutationEpoch++;
      current.media = current.media.filter(row => row.id !== id).concat(result.media);
      localMedia = localMedia.filter(row => row.id !== id);
      await record('media', localMedia);
    } catch (error) {
      media.error = error.message; await record('media', localMedia); throw error;
    }
  }
  async function stage(media) {
    mutationEpoch++;
    if (!localMedia.some(row => row.id === media.id) && !current.media.some(row => row.id === media.id)) {
      localMedia.push({ ...media, pending: true, error: '' }); await record('media', localMedia);
    }
    try { await flushPhoto(media.id); } catch { /* Keep the selected file available for explicit retry. */ }
    return { state: merged(), result: media.id };
  }
  async function send(input) {
    if (!current) await read();
    if (input.channelId && input.channelId !== selected) throw Error('경매가 변경됐어요. 목록에서 다시 열어 주세요.');
    if (input.type === 'media') return stage(input.media);
    if (input.type === 'retry-photo') { await flushPhoto(input.id); return { state: merged(), result: input.id }; }
    if (!['save','submit','withdraw','revise','parent','import'].includes(input.type)) throw Error('업체 페이지에서 실행할 수 없는 작업이에요.');
    mutationEpoch++;
    const referenced = [...(input.entry?.photoIds || []), input.parent?.photoId, ...Object.values(input.parents || {}).map(p => p?.photoId)].filter(Boolean);
    if (input.type === 'import') {
      await record('import:' + input.entry.sourceId, input);
      recovery = { importUrl: input.entry.sourceUrl, updatedAt: Date.now() }; await record('draft', recovery);
      for (const media of input.media || []) await stage(media);
    }
    for (const id of referenced) await flushPhoto(id);
    const payload = { ...input }; delete payload.media; delete payload.channelId; delete payload.requestId;
    const signature = JSON.stringify(payload);
    // Persist the request ID before sending so reload/network retries remain idempotent.
    let pending = await record('request');
    if (!pending || pending.signature !== signature) { pending = { signature, requestId: uid() }; await record('request', pending); }
    const result = await request('vendor-entries', { ...payload, requestId: pending.requestId });
    mutationEpoch++;
    await record('request', undefined, true);
    if (result.state.version >= current.version) current = result.state;
    if (input.type === 'import') { await record('import:' + input.entry.sourceId, undefined, true); recovery = null; await record('draft', undefined, true); }
    return { ...result, state: merged() };
  }
  function information(state, entry) {
    const source = entry.submission || entry.approved || entry;
    const parent = slot => state.parents.find(p => p.id === source[slot + 'Id'] && p.vendorId === entry.vendorId) || null;
    return { ...copy(source), sire: copy(parent('sire')), dam: copy(parent('dam')) };
  }
  window.EntryPreviewStore = {
    live: true, code, token, get CHANNEL() { return selected; }, get VENDOR() { return current?.ownerId || ''; },
    read, send, information, getState: merged,
    recovery: {
      async save(value) { recovery = copy(value); await record('draft', recovery); },
      read() { return copy(recovery); },
      async clear() { recovery = null; await record('draft', undefined, true); }
    },
    metadata(url) { return request('vendor-entries/feedle', { url }, { timeout: 60000 }); },
    async pendingImport(raw) {
      let url; try { url = new URL(raw); } catch { return null; }
      if (url.protocol !== 'https:' || !['www.feedle.me','feedle.me'].includes(url.hostname)) return null;
      const id = /^\/pet\/([a-f0-9-]{36})\/?$/i.exec(url.pathname)?.[1];
      return id ? record('import:' + id.toLowerCase()) : null;
    },
    image(url) { return request('vendor-entries/feedle-image', { url }, { binary: true }); },
    async profile(body) {
      const query = new URLSearchParams({ ...credential(), event: selected });
      const result = await request('vendor-checkout' + (body ? '/settings' : '') + '?' + query, body);
      return result.vendor;
    },
    pageUrl(section, event = selected) {
      const query = new URLSearchParams({ ...credential(), event });
      if (section === 'settlement') return '/vendor-checkout.html?' + query;
      query.set('section', section); return '/vendor-entries.html?' + query;
    }
  };
})();
