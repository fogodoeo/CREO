import { runningParticipantName } from './participantDisplay.js';

// A presentation-only sequence. It cannot start, delay or finish the draw.
export function createRosterSequence({
  render, reducedMotion, schedule = setTimeout, cancel = clearTimeout, pageSize = 24,
}) {
  let names = [], phase = 'loading', key = '', signature = '', page = 0;
  let timer, generation = 0, paused = false;
  const pages = () => Math.max(1, Math.ceil(names.length / pageSize));
  const visible = () => phase === 'ready';
  function stop() {
    generation++;
    if (timer !== undefined) cancel(timer);
    timer = undefined;
  }
  function paint() {
    render({
      visible: visible(), names: names.slice(page * pageSize, (page + 1) * pageSize).map(runningParticipantName),
      offset: page * pageSize, page: page + 1, pages: pages(), total: names.length,
      paused: paused || reducedMotion() || page === pages() - 1,
      automatic: !reducedMotion(),
    });
  }
  function advance() {
    stop();
    paint();
    if (!visible() || paused || reducedMotion() || page >= pages() - 1) return;
    const token = generation;
    timer = schedule(() => {
      if (token !== generation || !visible()) return;
      if (reducedMotion()) { paused = true; advance(); return; }
      page++;
      advance();
    }, 6000);
  }
  function update(state = {}) {
    const nextNames = state.participants === undefined ? names : [...new Set(state.participants.filter(Boolean))];
    const nextSignature = JSON.stringify(nextNames);
    const nextPhase = state.phase ?? phase, nextKey = state.rosterKey ?? key;
    const changed = nextSignature !== signature || nextKey !== key;
    const entering = nextPhase === 'ready' && phase !== 'ready';
    if (!changed && nextPhase === phase) return; // Polls must not restart the tour.
    names = nextNames; signature = nextSignature; phase = nextPhase; key = nextKey;
    if (changed || entering) { page = 0; paused = false; }
    advance();
  }
  function move(delta) {
    paused = true;
    page = Math.min(pages() - 1, Math.max(0, page + delta));
    advance();
  }
  function toggle() {
    if (page === pages() - 1) { page = 0; paused = false; }
    else paused = !paused;
    advance();
  }
  return { update, move, toggle, stop };
}
