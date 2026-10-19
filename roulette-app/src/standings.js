'use strict';

function snapshotStandings(finished, active) {
  // The goal event fires before that frame removes finishers from active.
  // Deduplicate by marble id, never by name: one entrant may own several balls.
  const finishedIds = new Set(finished.map(marble => marble.id));
  const remaining = active.filter(marble => !finishedIds.has(marble.id));
  return [...finished, ...remaining].map((marble, index) => ({
    rank: index + 1,
    name: marble.name,
    finished: index < finished.length,
  }));
}

module.exports = { snapshotStandings };
