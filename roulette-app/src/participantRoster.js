import { runningParticipantName } from './participantDisplay.js';

// Presentation only: the complete roster stays still until the draw starts.
export function createRosterSequence({ render }) {
  let names = [], phase = 'loading', key = '', signature = '';
  function update(state = {}) {
    const nextNames = state.participants === undefined ? names : [...new Set(state.participants.filter(Boolean))];
    const nextSignature = JSON.stringify(nextNames);
    const nextPhase = state.phase ?? phase, nextKey = state.rosterKey ?? key;
    if (nextSignature === signature && nextKey === key && nextPhase === phase) return;
    names = nextNames; signature = nextSignature; phase = nextPhase; key = nextKey;
    render({ visible: phase === 'ready', names: names.map(runningParticipantName), total: names.length });
  }
  return { update };
}

// Fit the full list to the available stage. Narrow screens keep a readable floor
// and can scroll the same list instead of omitting names or adding another page.
export function rosterLayout({ total, width, height, nameWidth = 5 }) {
  const count = Math.max(1, total);
  const preferred = width >= 900 ? 3 : width >= 360 ? 2 : 1;
  const minimum = width < 360 ? 14 : 12;
  const gap = width < 600 ? 12 : 24;
  const numberWidth = Math.max(2, String(count).length) * 9 + 10;
  let best;
  for (let columns = 1; columns <= Math.min(count, Math.max(1, Math.floor(width / 96))); columns++) {
    const rows = Math.ceil(count / columns);
    const cellWidth = (width - gap * (columns - 1)) / columns;
    const size = Math.min(30, (height / rows - 8) / 1.4, (cellWidth - numberWidth) / Math.max(1, nameWidth));
    if (!best || size > best.size || (size === best.size && Math.abs(columns - preferred) < Math.abs(best.columns - preferred))) {
      best = { columns, rows, size };
    }
  }
  return { columns: best.columns, rows: best.rows, fontSize: Math.max(minimum, Math.floor(best.size)), gap };
}
