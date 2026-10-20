'use strict';

function initialEntries({ remoteDisplay, urlEntries, readStored, fallback }) {
  // A broadcast must wait for its channel's authoritative session. A previous
  // controller/other channel may have left unrelated names in shared storage.
  if (remoteDisplay) return '';
  return urlEntries || readStored() || fallback;
}

// The server owns the draw. A controller preview must never start a second draw
// or report success before the broadcast command has been accepted.
function createRemoteControls({ sendCommand, readFingerprint, readSession, preview, onBusy }) {
  let busy = false;
  let prepared = null;
  async function prepare() {
    const fingerprint = readFingerprint();
    const session = await sendCommand('prepare');
    prepared = { fingerprint, runId: session.runId };
    await preview(session);
    return session;
  }
  async function run(action) {
    if (busy) return null;
    busy = true;
    onBusy(true);
    try {
      const current = readSession();
      if (current.phase === 'running') throw new Error('현재 송출 추첨이 끝난 뒤 다시 진행해 주세요.');
      if (action === 'prepare') return await prepare();
      if (!prepared || current.phase !== 'prepared' || current.runId !== prepared.runId
          || prepared.fingerprint !== readFingerprint()) await prepare();
      return await sendCommand('start');
    } finally {
      busy = false;
      onBusy(false);
    }
  }
  return { prepare: () => run('prepare'), start: () => run('start') };
}

function createSessionPoller({ readPulse, fetchSession }) {
  let lastPulse = -1;
  return async () => {
    const pulse = await readPulse();
    if (lastPulse < 0 || pulse !== lastPulse) {
      await fetchSession();
      // Failed fetches/applications must be retried even without a new command.
      lastPulse = pulse;
    }
  };
}

module.exports = { createRemoteControls, createSessionPoller, initialEntries };
