'use strict';

function winnerCount(config = {}) {
  return config.winnerMode === 'rank' ? 1 : Math.max(1, Math.min(20, Math.floor(Number(config.winnerCount) || 1)));
}

function drawLabel(config = {}) {
  return config.winnerMode === 'rank' ? `${config.winningRank || 1}번째 도착 1명`
    : `${config.winnerMode === 'last' ? '마지막까지 남은' : '먼저 도착한'} ${winnerCount(config)}명`;
}

// One person can own multiple balls, but receives at most one winning place.
// Last-survivor winners have no ordering among themselves.
function selectDrawWinners(standings, config = {}) {
  const count = winnerCount(config);
  if (count < 2) return [];
  if (config.winnerMode === 'last') {
    const remaining = [...new Set(standings.filter(row => !row.finished).map(row => row.name))];
    return remaining.length === count && standings.some(row => row.finished) ? remaining.sort() : [];
  }
  const arrived = [...new Set(standings.filter(row => row.finished).map(row => row.name))];
  return arrived.length >= count ? arrived.slice(0, count) : [];
}

function participantCount(entries) {
  const names = new Set(entries.map(entry => String(entry).replace(/(?:\*\d+)?(?:\/\d+(?:\.\d+)?)?\s*$/, '').trim()).filter(Boolean));
  return names.size;
}

function winnerCountError(entries, config = {}) {
  const count = winnerCount(config), people = participantCount(entries);
  if (count > people) return '당첨 인원이 참가자 수보다 많습니다.';
  if (count > 1 && config.winnerMode === 'last' && count === people) return '마지막 생존 추첨은 당첨 인원을 참가자 수보다 적게 설정해 주세요.';
  return '';
}

module.exports = { winnerCount, selectDrawWinners, winnerCountError, drawLabel, participantCount };
