'use strict';

function parseParticipantName(nameStr) {
  let remainder = String(nameStr ?? '').trim();
  if (!remainder) return null;

  let weight = 1;
  let count = 1;
  let match;
  while ((match = remainder.match(/([/*])(\d+)\s*$/))) {
    const value = Math.max(1, Number.parseInt(match[2], 10) || 1);
    if (match[1] === '/') weight = value;
    if (match[1] === '*') count = value;
    remainder = remainder.slice(0, match.index).trimEnd();
  }

  if (!remainder) return null;
  return { name: remainder, weight, count };
}

module.exports = { parseParticipantName };

