'use strict';

function selectCandidateRanks(ranked, winnerRank, limit = 3) {
  if (!Array.isArray(ranked) || ranked.length === 0 || limit <= 0) return [];

  const target = Math.max(0, Math.min(ranked.length - 1, Number(winnerRank) || 0));
  const indexes = [target];
  for (let distance = 1; indexes.length < ranked.length; distance += 1) {
    if (target === 0) {
      if (target + distance < ranked.length) indexes.push(target + distance);
    } else if (target === ranked.length - 1) {
      if (target - distance >= 0) indexes.push(target - distance);
    } else {
      if (target - distance >= 0) indexes.push(target - distance);
      if (target + distance < ranked.length) indexes.push(target + distance);
    }
    if (target - distance < 0 && target + distance >= ranked.length) break;
  }

  const seenNames = new Set();
  const selected = [];
  for (const index of indexes) {
    const candidate = ranked[index];
    if (!candidate || seenNames.has(candidate.name)) continue;
    seenNames.add(candidate.name);
    selected.push({ candidate, rank: index + 1 });
    if (selected.length >= limit) break;
  }
  return selected;
}

// Positional candidates, never a probability estimate or a winner decision.
// Keep one representative ball per person, matching multiwinner identity rules.
function selectDrawCandidates(marbles, finishers, config = {}, winnerRank = 0) {
  if (!marbles.length) return [];
  const count = Math.max(1, Math.min(20, Math.floor(Number(config.winnerCount) || 1)));
  if (config.winnerMode === 'last') {
    return selectCandidateRanks(marbles, marbles.length - 1, count).map(row => row.candidate);
  }
  if (config.winnerMode === 'rank') {
    const index = winnerRank - finishers.length;
    return index >= 0 && index < marbles.length ? [marbles[index]] : [];
  }
  const arrived = new Set(finishers.map(marble => marble.name));
  const remaining = marbles.filter(marble => !arrived.has(marble.name));
  return selectCandidateRanks(remaining, 0, Math.max(0, count - arrived.size)).map(row => row.candidate);
}

module.exports = { selectCandidateRanks, selectDrawCandidates };
