'use strict';
function syncRemoteResult(document, session, enabled) {
  let panel = document.getElementById('restoredDrawResult');
  if (!enabled || session.phase !== 'complete' || !session.result?.winner) {
    if (panel) panel.hidden = true;
    return;
  }
  if (!panel) {
    panel = document.createElement('section');
    panel.id = 'restoredDrawResult';
    panel.className = 'restored-draw-result';
    panel.setAttribute('aria-label', '추첨 결과');
    panel.setAttribute('role', 'status');
    const title = document.createElement('p');
    const label = document.createElement('h1');
    label.textContent = '당첨자';
    const names = document.createElement('strong');
    panel.append(title, label, names);
    document.body.append(panel);
  }
  panel.children[0].textContent = session.config?.eventTitle || '낙찰자 추첨';
  const winners = session.result.winners?.length ? session.result.winners : [session.result.winner];
  panel.children[2].textContent = winners.join('\n');
  panel.style.setProperty('--draw-winner-count', String(winners.length));
  panel.hidden = false;
}
module.exports = { syncRemoteResult };
