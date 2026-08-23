'use strict';

const SOLD_STATUSES = new Set(['sold', 'complete', 'completed', '낙찰', '완료']);

function auctionWinnerEntries(items, unitAmount = 100000) {
  const unit = Math.max(1, Math.floor(Number(unitAmount) || 100000));
  const totals = new Map();

  for (const item of Array.isArray(items) ? items : []) {
    const status = String(item?.status || '').trim().toLowerCase();
    const name = String(item?.winnerAlias || '').replace(/\s+/g, ' ').trim();
    const amount = Math.max(0, Math.floor(Number(item?.soldPrice) || 0));
    if (!SOLD_STATUSES.has(status) || !name || amount <= 0) continue;
    totals.set(name, (totals.get(name) || 0) + amount);
  }

  return [...totals.entries()]
    .map(([name, total]) => ({ name, total, count: Math.floor(total / unit) }))
    .filter((entry) => entry.count > 0)
    .sort((left, right) => right.total - left.total || left.name.localeCompare(right.name, 'ko'))
    .map((entry) => `${entry.name}*${entry.count}`);
}

module.exports = { auctionWinnerEntries };
