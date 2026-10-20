// Presentation only: never starts, pauses, seeds or completes a physics round.
const PHASE_LABELS = {
  loading: '화면 준비 중',
  ready: '추첨 준비',
  running: '행운의 공이 달립니다',
  complete: '당첨을 축하합니다',
  error: '연결 확인 필요',
};

export function isNationalChannel(channel) {
  return /^national-cre(?:-\d{8})?$/.test(channel);
}

export function createNationalStage({
  root, video, enabled, reducedMotion, storage,
  storageKey, roster, schedule = setTimeout, cancel = clearTimeout,
}) {
  let timer;
  let generation = 0;
  let lastRun = '';
  let loaded = false;
  const text = (selector, value) => {
    const target = root.querySelector(selector);
    if (target && target.textContent !== String(value)) target.textContent = String(value);
  };
  const stop = () => {
    generation++;
    if (timer !== undefined) cancel(timer);
    timer = undefined;
    video.hidden = true;
    video.pause();
  };
  video.addEventListener('ended', stop);
  video.addEventListener('error', stop);

  function update({ phase, winner, winners, ballCount, eventTitle, edition, drawLabel, participants, rosterKey } = {}) {
    roster?.update({ phase, participants, rosterKey });
    if (phase) root.dataset.drawPhase = phase;
    if (phase && phase !== 'running') stop();
    if (phase) text('[data-national-phase]', PHASE_LABELS[phase] || PHASE_LABELS.ready);
    if (ballCount !== undefined) text('[data-national-count]', Math.max(0, Number(ballCount) || 0));
    if (drawLabel !== undefined) text('[data-national-rule]', drawLabel);
    if (eventTitle !== undefined) text('#nationalEventTitle', eventTitle || '경품 추첨');
    if (edition !== undefined) {
      text('#nationalEdition', String(edition || '').replace(/^전국크레자랑\s*/, '') || '전국크레자랑');
    }
    const award = root.querySelector('[data-national-award]');
    if (phase && phase !== 'complete') {
      award.hidden = true;
      text('[data-national-winner]', '');
    } else if (winner !== undefined) {
      const names = winners?.length ? winners : winner ? [winner] : [];
      text('[data-national-winner]', names.join('\n'));
      root.dataset.winnerCount = String(names.length);
      root.dataset.winnerColumns = names.length > 5 ? '2' : '1';
      text('[data-national-award-title]', names.length > 1 ? `오늘의 당첨자 ${names.length}명` : '오늘의 행운 주인공');
      award.hidden = !names.length || root.dataset.drawPhase !== 'complete';
    }
    // Only this skin downloads the supplied clip. Failure cannot gate the draw.
    if (enabled() && !loaded && !reducedMotion()) {
      loaded = true;
      video.preload = 'auto';
      video.src = '/assets/pinball-national/intro-v2.webm';
      video.load();
    }
    if (!enabled() || reducedMotion()) stop();
  }

  function start(runId) {
    if (!runId || !enabled()) return;
    let seen = lastRun;
    try { seen = storage?.getItem(storageKey) || seen; } catch (_) { /* storage may be disabled */ }
    if (seen === runId) return;
    lastRun = runId;
    try { storage?.setItem(storageKey, runId); } catch (_) { /* memory still suppresses duplicates */ }
    stop();
    if (reducedMotion()) return;
    const token = generation;
    try {
      video.currentTime = 0;
      video.muted = true;
      // A late/failed load is skipped; it must never obscure a finished draw.
      timer = schedule(stop, 4500);
      Promise.resolve(video.play()).then(() => {
        if (generation !== token) return;
        if (root.dataset.drawPhase === 'running' && enabled()) video.hidden = false;
        else stop();
      }).catch(() => { if (generation === token) stop(); });
    } catch (_) {
      stop();
    }
  }
  return { update, start, stop };
}
