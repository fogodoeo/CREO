'use strict';

const { cleanText } = require('./platform-core');
const ItemView = require('./public/checkout-item-view');
const SITE_ORIGIN = 'https://creok.onrender.com';

// This projection runs only after checkout ownership has been resolved. Never
// spread an auction item: attributes also contain bids, contacts and operator data.
function checkoutItem(item = {}) {
    const attributes = item.attributes && typeof item.attributes === 'object' ? item.attributes : {};
    const source = { ...item, media: item.media || attributes.media, parents: item.parents || attributes.parents };
    const pictures = ItemView.pictures(source, SITE_ORIGIN);
    const checklist=Object.fromEntries(String(attributes.checklist||'').split('|').map(part=>{const i=part.indexOf(':');return i<0?['','']:[part.slice(0,i),part.slice(i+1)]}));
    const facts=attributes.entry_traits||{};
    const sex=facts.sex||attributes.gender||checklist.gender;
    const weight=String(facts.weight||attributes.weight||checklist.weight||'');
    const traits={morph:cleanText(facts.morph||attributes.morph||item.category||checklist.morph,60),sex:({M:'male',F:'female',male:'male',female:'female'})[sex]||'unknown',weight:/^\d+(\.\d{1,2})?$/.test(weight)&&Number(weight)<=1000?weight:'',size:cleanText(facts.size||checklist.size,20),hatchDate:cleanText(facts.hatchDate,10)};
    const relative = url => url.startsWith(SITE_ORIGIN + '/') ? url.slice(SITE_ORIGIN.length) : url;
    const media = group => pictures.filter(photo => photo.group === group).map(photo => ({
        url: relative(photo.url),
        ...(photo.thumbnailUrl ? { thumbnailUrl: relative(photo.thumbnailUrl) } : {}),
        label: cleanText(photo.label, 100)
    }));
    const child = media('개체');
    const parents = ['sire', 'dam'].map((role, index) => {
        const group = index === 0 ? '부' : '모';
        const parent = (Array.isArray(source.parents) ? source.parents : []).find(row => row && (row.role === role || row.role === group)) || source[role] || {};
        const photos = media(group);
        const name=cleanText(parent.name,80),morph=cleanText(parent.morph,100);
        if (!photos.length&&!name&&!morph) return null;
        return { role, name, morph, media: photos };
    }).filter(Boolean);
    // Older auctions keep A01/B01 as the name and use lotNumber only for order.
    // Do not turn that into a second visible identifier such as "01 · A01".
    const namedNumber = /^[A-Za-z]\d{2,4}$/.test(String(item.name || '').trim()) ? String(item.name).trim() : '';
    const displayNumber = cleanText(item.displayNumber || item.lotCode || attributes.displayNumber || attributes.lotCode || namedNumber || item.lotNumber, 30);
    return {
        id: item.id,
        lotNumber: Math.max(0, Number(item.lotNumber) || 0),
        displayNumber,
        name: cleanText(item.name || '개체', 100),
        soldAmount: Math.max(0, Number(item.soldPrice) || 0),
        ...(traits.morph||traits.sex!=='unknown'||traits.weight||traits.size||traits.hatchDate?{traits}:{}),
        ...(child.length ? { media: child } : {}),
        ...(parents.length ? { parents } : {}),
        ...(item.parentInfoState==='snapshot'?{parentInfoState:'snapshot'}:{})
    };
}

module.exports = { checkoutItem };
