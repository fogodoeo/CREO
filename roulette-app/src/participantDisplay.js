'use strict';

// Presentation only. The full label remains the participant/result identity.
function runningParticipantName(name) {
  return String(name || '').replace(/\s+\((?:\d{4}|번호 미등록)\)$/, '');
}

module.exports = { runningParticipantName };
