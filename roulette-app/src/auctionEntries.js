'use strict';
const { buyerDisplayName, extractMobilePhone } = require('../../public/mobile-phone');

const SOLD_STATUSES = new Set(['sold', 'complete', 'completed', '낙찰', '완료']);

const HOUSE_NAMES = {
  R: '감각형',
  G: '관리형',
  B: '분석형',
  Y: '비전형',
};

function getLeadingHouseKey(items) {
  const houseTotals = new Map();
  for (const item of Array.isArray(items) ? items : []) {
    const status = String(item?.status || '').trim().toLowerCase();
    const amount = Math.max(0, Math.floor(Number(item?.soldPrice) || 0));
    if (!SOLD_STATUSES.has(status) || amount <= 0) continue;
    const houseKey = String(item?.attributes?.crewart_house_key || item?.groupId || '').toUpperCase();
    if (!houseKey) continue;
    
    const contrib = Math.max(0, Math.floor(Number(item?.attributes?.crewart_contribution_amount) || 0));
    const points = contrib > 0 ? contrib : amount;
    houseTotals.set(houseKey, (houseTotals.get(houseKey) || 0) + points);
  }
  
  if (!houseTotals.size) return null;
  return [...houseTotals.entries()].sort((a, b) => b[1] - a[1])[0][0];
}

function auctionWinnerEntries(items, unitAmount = 100000, options = {}) {
  const unit = Math.max(1, Math.floor(Number(unitAmount) || 100000));
  const totals = new Map();
  
  const houseOption = typeof options === 'string' ? options : options?.house;
  const isAcademyTheme = options?.theme === 'academy' || options?.isAcademy;
  const withPhone = Boolean(options?.phoneSuffix);
  const byPerson = options?.mode === 'person';
  
  let targetHouse = null;
  if (houseOption && houseOption !== 'all') {
    targetHouse = houseOption.toUpperCase();
    if (targetHouse === 'WINNING' || targetHouse === 'CHAMPION' || targetHouse === 'AUTO') {
      targetHouse = getLeadingHouseKey(items);
    }
  } else if (isAcademyTheme) {
    targetHouse = getLeadingHouseKey(items);
  }

  for (const item of Array.isArray(items) ? items : []) {
    const status = String(item?.status || '').trim().toLowerCase();
    const rawName = String(item?.winnerAlias || item?.winnerName || '').replace(/\s+/g, ' ').trim();
    const name = buyerDisplayName(rawName);
    const soldPrice = Math.max(0, Math.floor(Number(item?.soldPrice) || 0));
    if (!SOLD_STATUSES.has(status) || !name || (!byPerson && soldPrice <= 0)) continue;
    
    if (targetHouse) {
      const itemHouse = String(item?.attributes?.crewart_house_key || item?.groupId || '').toUpperCase();
      if (itemHouse !== targetHouse) continue;
    }
    
    const phone = extractMobilePhone(item?.winnerPhone) || extractMobilePhone(rawName);
    const label = withPhone ? `${name} (${phone ? phone.slice(-4) : '번호 미등록'})` : name;
    totals.set(label, (totals.get(label) || 0) + soldPrice);
  }

  return [...totals.entries()]
    .map(([name, total]) => ({ name, total, count: byPerson ? 1 : Math.floor(total / unit) }))
    .filter((entry) => entry.count > 0)
    .sort((left, right) => right.total - left.total || left.name.localeCompare(right.name, 'ko'))
    .map((entry) => `${entry.name}*${entry.count}`);
}

module.exports = { auctionWinnerEntries, getLeadingHouseKey, HOUSE_NAMES };
