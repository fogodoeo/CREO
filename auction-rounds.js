'use strict';
const {isDeepStrictEqual} = require('node:util');
const {channelKey} = require('./platform-core');

const isArchived = item => Boolean(item?.auctionArchiveId);
const currentItems = items => items.filter(item => !isArchived(item));
function currentWorkspace(data) {
    const archivedItems = data.items.filter(isArchived);
    return {...data, items: currentItems(data.items), archivedItems, archivedItemCount: archivedItems.length};
}
function assertCurrent(item) {
    if (isArchived(item)) throw Object.assign(new Error('보관된 회차의 개체입니다. 현재 경매 목록을 새로고침해 주세요.'), {status:409, code:'AUCTION_ARCHIVED'});
}

// The caller holds the channel mutation lock. Keep original sale IDs and rows
// in place so checkout links, payments, shipping and collections remain valid.
async function closeRound(repository, channelId, archiveId) {
    const archive = await repository.getRecord(channelId, 'archive', archiveId);
    if (!archive) throw Object.assign(new Error('회차 기록을 찾을 수 없습니다.'), {status:404});
    if (archive.closedAt) return {archiveId, count:archive.items.length, duplicate:true};
    const [allItems, state] = await Promise.all([
        repository.listRecords(channelId, 'item'), repository.getRecord(channelId, 'broadcast', 'state')
    ]);
    const items = currentItems(allItems);
    if (state?.mode === 'live' || items.some(item => item.status === 'live')) {
        throw Object.assign(new Error('진행 중인 경매를 종료한 뒤 회차를 마감해 주세요.'), {status:409});
    }
    const saved = new Map((archive.items || []).map(item => [item.id, item]));
    if (!items.length || saved.size !== items.length || !items.every(item => isDeepStrictEqual(item, saved.get(item.id)))) {
        throw Object.assign(new Error('보관 후 출품 내역이 변경됐어요. 현재 회차를 다시 저장해 주세요.'), {status:409});
    }
    const now = new Date().toISOString();
    const row = (type, record) => ({key:channelKey(channelId,type,record.id), value:JSON.stringify(record)});
    await repository.upsertRows([
        ...items.map(item => row('item', {...item, auctionArchiveId:archiveId, updatedAt:now})),
        row('archive', {...archive, closedAt:now}),
        row('broadcast', {...state, id:'state', mode:'standby', activeItemId:'',
            audienceSessionStatus:'closed', audienceSessionEndedAt:now, updatedAt:now})
    ]);
    return {archiveId, count:items.length, duplicate:false};
}

module.exports = {isArchived, currentItems, currentWorkspace, assertCurrent, closeRound};
