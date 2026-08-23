import {
  APP_VERSION,
  DEFAULT_CONFIG,
  STORAGE_KEYS,
  THEME_PRESETS,
  type AppConfig,
  type MarbleStyle,
  type WinnerMode,
} from './config';
import options from './options';
import { Roulette } from './roulette';
import type { ColorTheme } from './types/ColorTheme';
import { createSecureSeed, setRandomSeed } from './utils/random';
import { parseName } from './utils/utils';
import { auctionWinnerEntries, getLeadingHouseKey, HOUSE_NAMES } from './auctionEntries.js';

const queryParameters = new URLSearchParams(location.search);
const isBroadcastMode = queryParameters.get('broadcast') === '1';
const remoteChannelId = /^[a-z0-9][a-z0-9_-]{1,63}$/i.test(queryParameters.get('channel') || '')
  ? String(queryParameters.get('channel'))
  : '';
const isRemoteDisplay = isBroadcastMode && Boolean(remoteChannelId);
const isRemoteController = !isBroadcastMode && Boolean(remoteChannelId);
const autoLoadAuctionWinners = isRemoteController && queryParameters.get('theme') === 'academy';
document.documentElement.classList.toggle('broadcast-mode', isBroadcastMode);
document.documentElement.classList.toggle('remote-display-mode', isRemoteDisplay);

type PinballStanding = { rank: number; name: string; finished: boolean };
type PinballResult = {
  runId: string;
  winner: string;
  completedAt: string | null;
  standings: PinballStanding[];
};

type RemoteSession = {
  revision: number;
  phase: 'idle' | 'prepared' | 'running' | 'complete';
  runId: string;
  command: { id: string; type: 'reset' | 'prepare' | 'start'; issuedAt: string | null } | null;
  entries: string[];
  config: Partial<AppConfig> | null;
  seed: string;
  ballCount: number;
  result?: PinballResult | null;
  history?: PinballResult[];
};

type RoundContext = {
  seed: string;
  entries: string[];
  eventTitle: string;
  channelName: string;
  mapIndex: number;
  mapTitle: string;
  speed: number;
  winningRank: number;
  ballCount: number;
  startedAt: number;
};

type RoundRecord = RoundContext & {
  id: string;
  winner: string;
  completedAt: string;
  durationMs: number;
  entriesHash: string;
  standings: PinballStanding[];
};

type PublicApi = {
  version: string;
  configure: (partial: Partial<AppConfig>) => void;
  setEntries: (entries: string[] | string) => void;
  prepare: (seed?: string) => Promise<void>;
  start: () => Promise<void>;
  getHistory: () => RoundRecord[];
  getProgress: () => { finished: number; remaining: number; total: number };
  getStandings: () => PinballStanding[];
};

declare global {
  interface Window {
    CreoMarbleRoulette: PublicApi;
  }
}

const MAP_LABELS: Record<string, string> = {
  'Wheel of fortune': '운명의 수레바퀴',
  BubblePop: '버블 팝',
  'Pot of greed': '욕망의 항아리',
  'Yoru ni Kakeru': '밤을 달리다',
};

function element<T extends HTMLElement>(id: string): T {
  const found = document.getElementById(id);
  if (!found) throw new Error(`필수 화면 요소가 없습니다: #${id}`);
  return found as T;
}

const dom = {
  appShell: element<HTMLElement>('appShell'),
  panel: element<HTMLElement>('controlPanel'),
  panelBackdrop: element<HTMLButtonElement>('panelBackdrop'),
  openPanel: element<HTMLButtonElement>('openPanelButton'),
  resultButton: element<HTMLButtonElement>('resultButton'),
  closePanel: element<HTMLButtonElement>('closePanelButton'),
  fullscreen: element<HTMLButtonElement>('fullscreenButton'),
  statusPill: element<HTMLElement>('statusPill'),
  statusText: element<HTMLElement>('statusText'),
  eventTitle: element<HTMLInputElement>('eventTitleInput'),
  channelName: element<HTMLInputElement>('channelNameInput'),
  entries: element<HTMLTextAreaElement>('entriesInput'),
  personCount: element<HTMLElement>('personCount'),
  ballCount: element<HTMLElement>('ballCount'),
  startBallCount: element<HTMLElement>('startBallCount'),
  syncWinners: element<HTMLButtonElement>('syncWinnersButton'),
  sample: element<HTMLButtonElement>('sampleButton'),
  importEntries: element<HTMLButtonElement>('importEntriesButton'),
  clearEntries: element<HTMLButtonElement>('clearEntriesButton'),
  entriesFile: element<HTMLInputElement>('entriesFileInput'),
  map: element<HTMLSelectElement>('mapSelect'),
  speed: element<HTMLSelectElement>('speedSelect'),
  renderFps: element<HTMLSelectElement>('renderFpsSelect'),
  rankField: element<HTMLElement>('rankField'),
  winningRank: element<HTMLInputElement>('winningRankInput'),
  skills: element<HTMLInputElement>('skillsInput'),
  recording: element<HTMLInputElement>('recordingInput'),
  accent: element<HTMLInputElement>('accentColorInput'),
  winnerLabel: element<HTMLInputElement>('winnerLabelInput'),
  shuffle: element<HTMLButtonElement>('shuffleButton'),
  start: element<HTMLButtonElement>('startButton'),
  exportPreset: element<HTMLButtonElement>('exportPresetButton'),
  importPreset: element<HTMLButtonElement>('importPresetButton'),
  presetFile: element<HTMLInputElement>('presetFileInput'),
  historyCount: element<HTMLElement>('historyCount'),
  historyList: element<HTMLElement>('historyList'),
  exportHistory: element<HTMLButtonElement>('exportHistoryButton'),
  clearHistory: element<HTMLButtonElement>('clearHistoryButton'),
  resultDialog: element<HTMLDialogElement>('resultDialog'),
  resultLabel: element<HTMLElement>('resultLabel'),
  resultWinner: element<HTMLElement>('resultWinner'),
  resultEvent: element<HTMLElement>('resultEvent'),
  resultSeed: element<HTMLElement>('resultSeed'),
  resultDuration: element<HTMLElement>('resultDuration'),
  copyResult: element<HTMLButtonElement>('copyResultButton'),
  replay: element<HTMLButtonElement>('replayButton'),
  newRound: element<HTMLButtonElement>('newRoundButton'),
  toast: element<HTMLElement>('toast'),
  remoteSection: element<HTMLElement>('remoteSessionSection'),
  remoteStatus: element<HTMLElement>('remoteSessionStatus'),
  broadcastSource: element<HTMLInputElement>('broadcastSourceInput'),
  copyBroadcastSource: element<HTMLButtonElement>('copyBroadcastSourceButton'),
  resetBroadcastSession: element<HTMLButtonElement>('resetBroadcastSessionButton'),
  remoteResult: element<HTMLElement>('remoteResult'),
  remoteResultWinner: element<HTMLElement>('remoteResultWinner'),
  remoteResultStandings: element<HTMLOListElement>('remoteResultStandings'),
  copyRemoteResult: element<HTMLButtonElement>('copyRemoteResultButton'),
  exportRemoteResult: element<HTMLButtonElement>('exportRemoteResultButton'),
  privacyNotice: element<HTMLElement>('privacyNotice'),
};

function safeJsonParse<T>(value: string | null, fallback: T): T {
  if (!value) return fallback;
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

function loadConfig(): AppConfig {
  const stored = safeJsonParse<Partial<AppConfig>>(localStorage.getItem(STORAGE_KEYS.config), {});
  const merged = { ...DEFAULT_CONFIG, ...stored };
  if (!THEME_PRESETS[merged.themePreset]) merged.themePreset = DEFAULT_CONFIG.themePreset;
  if (!['first', 'last', 'rank'].includes(merged.winnerMode)) merged.winnerMode = DEFAULT_CONFIG.winnerMode;
  if (!['glass', 'flat'].includes(merged.marbleStyle)) merged.marbleStyle = DEFAULT_CONFIG.marbleStyle;
  if (![0.75, 1, 1.5, 2].includes(Number(merged.defaultSpeed))) merged.defaultSpeed = DEFAULT_CONFIG.defaultSpeed;
  if (![60, 120].includes(Number(merged.renderFps))) merged.renderFps = DEFAULT_CONFIG.renderFps;
  if (!/^#[0-9a-f]{6}$/i.test(merged.accentColor)) merged.accentColor = DEFAULT_CONFIG.accentColor;
  return merged;
}

let config = loadConfig();
const storedHistory = safeJsonParse<unknown>(localStorage.getItem(STORAGE_KEYS.history), []);
let history: RoundRecord[] = Array.isArray(storedHistory) ? (storedHistory as RoundRecord[]) : [];
let roulette: Roulette;
let engineReady = false;
let preparedFingerprint = '';
let currentRound: RoundContext | null = null;
let lastRecord: RoundRecord | null = null;
let running = false;
let toastTimer = 0;
let remoteRevision = 0;
let remotePhase: RemoteSession['phase'] = 'idle';
let remotePreparedRunId = '';
let remoteAppliedCommandId = '';
let remoteStartCommandId = '';
let remoteApplyQueue = Promise.resolve();
let remoteCommandPending = false;
let lastRemoteResult: PinballResult | null = null;

function parseEntries(value = dom.entries.value): string[] {
  return value
    .split(/[,\r\n]+/g)
    .map((entry) => entry.trim())
    .filter(Boolean);
}

function entrySummary(entries = parseEntries()): { people: number; balls: number } {
  let balls = 0;
  for (const entry of entries) {
    const parsed = parseName(entry);
    if (parsed) balls += Math.max(1, parsed.count);
  }
  return { people: entries.length, balls };
}

async function syncAuctionWinnerEntries(showEmptyMessage = true): Promise<void> {
  if (!remoteChannelId) return;
  dom.syncWinners.disabled = true;
  try {
    const response = await fetch(`/api/platform/channels/${encodeURIComponent(remoteChannelId)}/broadcast`, {
      cache: 'no-store',
      credentials: 'same-origin',
    });
    const payload = await response.json().catch(() => ({})) as { items?: Array<Record<string, unknown>>; error?: string };
    if (!response.ok) throw new Error(payload.error || `낙찰 내역 응답 오류 (${response.status})`);
    const entries = auctionWinnerEntries(payload.items || [], 100000, {
      theme: queryParameters.get('theme'),
      house: queryParameters.get('house'),
      isAcademy: queryParameters.get('theme') === 'academy',
    });
    dom.entries.value = entries.join('\n');
    localStorage.setItem(STORAGE_KEYS.entries, dom.entries.value);
    updateCounts();
    if (entries.length) {
      const champKey = getLeadingHouseKey(payload.items || []);
      const houseName = champKey ? (HOUSE_NAMES[champKey] || champKey) : '';
      showToast(houseName ? `우승 기숙사 [${houseName}] ${entries.length}명 · 10만원당 공 1개` : `${entries.length}명 · 10만원당 공 1개`);
    } else if (showEmptyMessage) {
      showToast('10만원 이상 낙찰자가 없습니다.');
    }
  } catch (error) {
    showToast(error instanceof Error ? error.message : '낙찰자를 불러오지 못했습니다.');
  } finally {
    dom.syncWinners.disabled = false;
  }
}

function applyUrlParameters(base: AppConfig): { config: AppConfig; entries?: string } {
  const params = new URLSearchParams(location.search);
  const next = { ...base };
  const title = params.get('title');
  const channel = params.get('channelName') || (!remoteChannelId ? params.get('channel') : '');
  const theme = params.get('theme');
  const accent = params.get('accent');
  const map = Number(params.get('map'));
  const speed = Number(params.get('speed'));
  const renderFps = Number(params.get('fps'));
  const mode = params.get('mode');
  const marbleStyle = params.get('marbleStyle');
  const rank = Number(params.get('rank'));

  if (title) next.eventTitle = title.slice(0, 40);
  if (channel) next.channelName = channel.slice(0, 30);
  if (theme && THEME_PRESETS[theme]) {
    next.themePreset = theme;
    next.accentColor = THEME_PRESETS[theme].coolTimeIndicator;
  }
  if (accent && /^#[0-9a-f]{6}$/i.test(accent)) next.accentColor = accent;
  if (Number.isInteger(map) && map >= 0) next.defaultMap = map;
  if ([0.75, 1, 1.5, 2].includes(speed)) next.defaultSpeed = speed;
  if ([60, 120].includes(renderFps)) next.renderFps = renderFps as 60 | 120;
  if (mode && ['first', 'last', 'rank'].includes(mode)) next.winnerMode = mode as WinnerMode;
  if (marbleStyle && ['glass', 'flat'].includes(marbleStyle)) next.marbleStyle = marbleStyle as MarbleStyle;
  if (Number.isInteger(rank) && rank > 0) next.winningRank = rank;

  const entries = params.get('entries') ?? params.get('names') ?? undefined;
  return { config: next, entries };
}

function currentWinnerMode(): WinnerMode {
  const selected = document.querySelector<HTMLInputElement>('input[name="winnerMode"]:checked');
  return (selected?.value as WinnerMode | undefined) ?? 'first';
}

function currentThemeName(): keyof typeof THEME_PRESETS {
  const selected = document.querySelector<HTMLInputElement>('input[name="theme"]:checked');
  const name = selected?.value ?? 'midnight';
  return (THEME_PRESETS[name] ? name : 'midnight') as keyof typeof THEME_PRESETS;
}

function currentMarbleStyle(): MarbleStyle {
  const selected = document.querySelector<HTMLInputElement>('input[name="marbleStyle"]:checked');
  return selected?.value === 'flat' ? 'flat' : 'glass';
}

function cloneTheme(theme: ColorTheme): ColorTheme {
  return JSON.parse(JSON.stringify(theme)) as ColorTheme;
}

function activeTheme(): ColorTheme {
  const theme = cloneTheme(THEME_PRESETS[currentThemeName()]);
  theme.coolTimeIndicator = dom.accent.value;
  theme.minimapViewport = dom.accent.value;
  theme.entity.circle.fill = dom.accent.value;
  theme.entity.circle.bloom = dom.accent.value;
  return theme;
}

function showToast(message: string): void {
  window.clearTimeout(toastTimer);
  dom.toast.textContent = message;
  dom.toast.classList.add('show');
  toastTimer = window.setTimeout(() => dom.toast.classList.remove('show'), 2200);
}

function setStatus(state: 'loading' | 'ready' | 'running' | 'complete' | 'error', message: string): void {
  dom.statusPill.dataset.state = state;
  dom.statusText.textContent = message;
}

function openPanel(): void {
  if (running) return;
  dom.appShell.classList.add('panel-open');
  dom.openPanel.setAttribute('aria-expanded', 'true');
  if (window.matchMedia('(max-width: 760px)').matches) document.body.classList.add('lock-scroll');
}

function closePanel(): void {
  dom.appShell.classList.remove('panel-open');
  dom.openPanel.setAttribute('aria-expanded', 'false');
  document.body.classList.remove('lock-scroll');
}

function updateBrand(): void {
  dom.resultLabel.textContent = dom.winnerLabel.value.trim() || DEFAULT_CONFIG.winnerLabel;
  document.documentElement.style.setProperty('--accent', dom.accent.value);
  document.documentElement.dataset.rouletteTheme = String(currentThemeName());
  document.title = `${dom.eventTitle.value.trim() || DEFAULT_CONFIG.eventTitle} · ${config.appName}`;
}

function updateCounts(): void {
  const { people, balls } = entrySummary();
  dom.personCount.textContent = String(people);
  dom.ballCount.textContent = String(balls);
  dom.startBallCount.textContent = `${balls}개 공`;
  const valid = engineReady && balls >= 2 && balls <= 500 && !running && !remoteCommandPending;
  dom.shuffle.disabled = !valid;
  dom.start.disabled = !valid;
  dom.winningRank.max = String(Math.max(1, balls));
  if (balls > 500) setStatus('error', '공은 최대 500개까지');
  preparedFingerprint = '';
}

function updateRankVisibility(): void {
  dom.rankField.hidden = currentWinnerMode() !== 'rank';
}

function collectConfig(): AppConfig {
  return {
    ...config,
    eventTitle: dom.eventTitle.value.trim() || DEFAULT_CONFIG.eventTitle,
    channelName: dom.channelName.value.trim(),
    winnerLabel: dom.winnerLabel.value.trim() || DEFAULT_CONFIG.winnerLabel,
    defaultMap: Number(dom.map.value) || 0,
    defaultSpeed: Number(dom.speed.value) || 1,
    renderFps: Number(dom.renderFps.value) === 120 ? 120 : 60,
    winnerMode: currentWinnerMode(),
    winningRank: Math.max(1, Number(dom.winningRank.value) || 1),
    useSkills: dom.skills.checked,
    autoRecording: dom.recording.checked,
    themePreset: currentThemeName(),
    marbleStyle: currentMarbleStyle(),
    accentColor: dom.accent.value,
  };
}

function persistInputs(): void {
  config = collectConfig();
  localStorage.setItem(STORAGE_KEYS.config, JSON.stringify(config));
  localStorage.setItem(STORAGE_KEYS.entries, dom.entries.value);
}

function applyRuntimeAppearance(): void {
  updateBrand();
  options.marbleStyle = currentMarbleStyle();
  if (roulette && engineReady) roulette.setTheme(activeTheme());
  if (roulette && engineReady) roulette.setRenderFps(Number(dom.renderFps.value));
  persistInputs();
}

function winningRank(ballCount: number): number {
  const mode = currentWinnerMode();
  if (mode === 'last') return ballCount;
  if (mode === 'rank') return Math.min(ballCount, Math.max(1, Number(dom.winningRank.value) || 1));
  return 1;
}

function fingerprint(entries: string[]): string {
  return JSON.stringify({
    entries,
    map: dom.map.value,
    speed: dom.speed.value,
    renderFps: dom.renderFps.value,
    winnerMode: currentWinnerMode(),
    rank: dom.winningRank.value,
    skills: dom.skills.checked,
    theme: currentThemeName(),
    marbleStyle: currentMarbleStyle(),
    accent: dom.accent.value,
  });
}

async function prepareRound(seed = createSecureSeed()): Promise<void> {
  if (!engineReady) throw new Error('물리 엔진이 아직 준비되지 않았습니다.');
  if (running) throw new Error('추첨이 진행 중입니다.');

  const entries = parseEntries();
  const summary = entrySummary(entries);
  if (summary.balls < 2) throw new Error('공을 2개 이상 입력해주세요.');
  if (summary.balls > 500) throw new Error('안정적인 실행을 위해 공은 최대 500개까지 지원합니다.');
  if (entries.some((entry) => (parseName(entry)?.name.length ?? 0) > 40)) {
    throw new Error('참가자 이름은 40자 이하로 입력해주세요.');
  }

  dom.resultButton.hidden = true;
  if (dom.resultDialog.open) dom.resultDialog.close();

  persistInputs();
  options.useSkills = dom.skills.checked;
  options.autoRecording = dom.recording.checked;
  options.winnerLabel = dom.winnerLabel.value.trim() || DEFAULT_CONFIG.winnerLabel;
  options.marbleStyle = currentMarbleStyle();
  options.winningRank = winningRank(summary.balls) - 1;
  updateRankVisibility();

  roulette.setAutoRecording(options.autoRecording);
  roulette.setSpeed(Number(dom.speed.value) || 1);
  roulette.setRenderFps(Number(dom.renderFps.value));
  roulette.setTheme(activeTheme());
  roulette.setMap(Number(dom.map.value) || 0);
  setRandomSeed(seed);
  roulette.setMarbles(entries);
  roulette.setWinningRank(options.winningRank);

  const selectedMap = roulette.getCurrentMap();
  currentRound = {
    seed,
    entries: entries.slice(),
    eventTitle: dom.eventTitle.value.trim() || DEFAULT_CONFIG.eventTitle,
    channelName: dom.channelName.value.trim(),
    mapIndex: selectedMap?.index ?? 0,
    mapTitle: MAP_LABELS[selectedMap?.title ?? ''] ?? selectedMap?.title ?? '',
    speed: roulette.getSpeed(),
    winningRank: options.winningRank + 1,
    ballCount: summary.balls,
    startedAt: 0,
  };
  preparedFingerprint = fingerprint(entries);
  setStatus('ready', `${summary.balls}개 공 준비 완료`);
  if (!isBroadcastMode) showToast(`시드 ${seed.slice(0, 8)} · 공 배치 완료`);
}

async function startRound(): Promise<void> {
  if (running) return;
  const entries = parseEntries();
  if (!currentRound || preparedFingerprint !== fingerprint(entries)) await prepareRound();
  if (!currentRound) return;

  currentRound.startedAt = Date.now();
  dom.resultButton.hidden = true;
  running = true;
  dom.appShell.classList.add('is-running');
  dom.openPanel.disabled = true;
  dom.shuffle.disabled = true;
  dom.start.disabled = true;
  closePanel();
  setStatus('running', '추첨 진행 중');
  roulette.start();
  window.dispatchEvent(new CustomEvent('creo:roulette:start', { detail: { ...currentRound } }));
}

async function sha256(value: string): Promise<string> {
  const bytes = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

function saveHistory(): void {
  localStorage.setItem(STORAGE_KEYS.history, JSON.stringify(history.slice(0, config.maxHistory)));
  renderHistory();
}

async function completeRound(winner: string): Promise<void> {
  if (!currentRound || !running) return;
  const durationMs = Math.max(0, Date.now() - currentRound.startedAt);
  const standings = roulette.getStandings();
  const record: RoundRecord = {
    ...currentRound,
    id: `${new Date().toISOString()}-${currentRound.seed.slice(0, 8)}`,
    winner,
    completedAt: new Date().toISOString(),
    durationMs,
    entriesHash: await sha256(currentRound.entries.join('\n')),
    standings,
  };
  running = false;
  dom.appShell.classList.remove('is-running');
  dom.openPanel.disabled = false;
  lastRecord = record;
  history.unshift(record);
  history = history.slice(0, config.maxHistory);
  saveHistory();
  updateCounts();
  setStatus('complete', `${winner} 당첨`);

  dom.resultLabel.textContent = dom.winnerLabel.value.trim() || DEFAULT_CONFIG.winnerLabel;
  dom.resultWinner.textContent = winner;
  dom.resultEvent.textContent = [record.eventTitle, record.channelName].filter(Boolean).join(' · ');
  dom.resultSeed.textContent = record.seed;
  dom.resultDuration.textContent = formatDuration(record.durationMs);
  dom.resultButton.hidden = false;
  window.dispatchEvent(new CustomEvent('creo:roulette:result', { detail: record }));
  if (isRemoteDisplay) void acknowledgeRemoteResult(record);
}

function formatDuration(durationMs: number): string {
  const seconds = Math.round(durationMs / 100) / 10;
  return `${seconds.toLocaleString('ko-KR')}초`;
}

function renderHistory(): void {
  dom.historyCount.textContent = `${history.length}건`;
  dom.historyList.replaceChildren();
  if (!history.length) {
    const empty = document.createElement('p');
    empty.className = 'history-empty';
    empty.textContent = '아직 저장된 추첨이 없습니다.';
    dom.historyList.append(empty);
    return;
  }
  for (const record of history.slice(0, 8)) {
    const item = document.createElement('article');
    const info = document.createElement('div');
    const winner = document.createElement('strong');
    const meta = document.createElement('span');
    const seed = document.createElement('code');
    winner.textContent = record.winner;
    meta.textContent = `${new Date(record.completedAt).toLocaleString('ko-KR')} · ${record.ballCount}개 공`;
    seed.textContent = record.seed.slice(0, 12);
    info.append(winner, meta);
    item.append(info, seed);
    dom.historyList.append(item);
  }
}

function downloadJson(filename: string, value: unknown): void {
  const blob = new Blob([JSON.stringify(value, null, 2)], { type: 'application/json;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

async function copyText(value: string): Promise<void> {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(value);
    return;
  }
  const area = document.createElement('textarea');
  area.value = value;
  document.body.append(area);
  area.select();
  document.execCommand('copy');
  area.remove();
}

function remoteResultText(result: PinballResult | null): string {
  if (!result) return '';
  return [
    `당첨: ${result.winner}`,
    ...(result.standings || []).map((standing) => `${standing.rank}위\t${standing.name}`),
  ].join('\n');
}

function remoteSessionUrl(suffix = ''): string {
  return `/api/platform/channels/${encodeURIComponent(remoteChannelId)}/pinball-session${suffix}`;
}

function remoteSourceUrl(): string {
  const url = new URL('/roulette/', location.origin);
  url.searchParams.set('channel', remoteChannelId);
  url.searchParams.set('broadcast', '1');
  return url.toString();
}

function newRequestId(): string {
  return `pinball_${crypto.randomUUID().replaceAll('-', '')}`;
}

async function remoteRequest(path: string, init: RequestInit = {}): Promise<{ session: RemoteSession; duplicate?: boolean }> {
  const response = await fetch(path, {
    cache: 'no-store',
    credentials: 'same-origin',
    ...init,
    headers: { 'Content-Type': 'application/json', ...(init.headers || {}) },
  });
  const payload = await response.json().catch(() => ({})) as { error?: string; session?: RemoteSession; duplicate?: boolean };
  if (!response.ok || !payload.session) {
    if (payload.session) updateRemoteSnapshot(payload.session);
    throw new Error(payload.error || `송출 서버 응답 오류 (${response.status})`);
  }
  return { session: payload.session, duplicate: payload.duplicate };
}

function updateRemoteSnapshot(session: RemoteSession): void {
  remoteRevision = Math.max(0, Number(session.revision) || 0);
  remotePhase = session.phase;
  const status = session.phase === 'prepared'
    ? `${session.ballCount.toLocaleString('ko-KR')}개 공 · 송출 배치 완료`
    : session.phase === 'running'
      ? '송출 화면에서 추첨 진행 중'
      : session.phase === 'complete'
        ? `${session.result?.winner || '결과'} · 추첨 완료`
        : '송출 화면 연결 대기';
  dom.remoteStatus.textContent = status;
  lastRemoteResult = session.result || session.history?.[0] || null;
  dom.remoteResult.hidden = !lastRemoteResult;
  dom.remoteResultWinner.textContent = lastRemoteResult?.winner || '';
  dom.remoteResultStandings.replaceChildren();
  for (const standing of lastRemoteResult?.standings || []) {
    const row = document.createElement('li');
    row.value = standing.rank;
    row.textContent = standing.name;
    dom.remoteResultStandings.append(row);
  }
  updateCounts();
}

async function sendRemoteCommand(action: 'reset' | 'prepare' | 'start'): Promise<RemoteSession> {
  if (remoteCommandPending) throw new Error('이전 송출 명령을 처리하고 있습니다.');
  remoteCommandPending = true;
  updateCounts();
  const body: Record<string, unknown> = {
    action,
    requestId: newRequestId(),
    expectedRevision: remoteRevision,
  };
  try {
    if (action === 'prepare') {
      const entries = parseEntries();
      const summary = entrySummary(entries);
      if (summary.balls < 2) throw new Error('공을 2개 이상 입력해주세요.');
      if (summary.balls > 500) throw new Error('공은 최대 500개까지 지원합니다.');
      if (entries.some((entry) => (parseName(entry)?.name.length ?? 0) > 40)) throw new Error('참가자 이름은 40자 이하로 입력해주세요.');
      persistInputs();
      Object.assign(body, { entries, config: collectConfig(), seed: createSecureSeed() });
    }
    const response = await remoteRequest(remoteSessionUrl(), { method: 'PUT', body: JSON.stringify(body) });
    updateRemoteSnapshot(response.session);
    return response.session;
  } finally {
    remoteCommandPending = false;
    updateCounts();
  }
}

async function acknowledgeRemoteResult(record: RoundRecord): Promise<void> {
  if (!remotePreparedRunId || !remoteStartCommandId) return;
  try {
    const response = await remoteRequest(remoteSessionUrl('/complete'), {
      method: 'POST',
      body: JSON.stringify({
        runId: remotePreparedRunId,
        commandId: remoteStartCommandId,
        winner: record.winner,
        standings: record.standings,
      }),
    });
    updateRemoteSnapshot(response.session);
  } catch (error) {
    console.error('Pinball result acknowledgement failed', error);
  }
}

async function applyRemoteSession(session: RemoteSession): Promise<void> {
  updateRemoteSnapshot(session);
  if (!session.command || session.command.id === remoteAppliedCommandId) return;
  if (session.command.type === 'reset') {
    remotePreparedRunId = '';
    remoteStartCommandId = '';
    remoteAppliedCommandId = session.command.id;
    setStatus('ready', '노트북에서 공 배치를 기다리는 중');
    return;
  }
  if (session.command.type === 'prepare') {
    configure(session.config || {});
    window.CreoMarbleRoulette.setEntries(session.entries);
    await prepareRound(session.seed);
    remotePreparedRunId = session.runId;
    remoteStartCommandId = '';
    remoteAppliedCommandId = session.command.id;
    closePanel();
    return;
  }
  if (session.command.type === 'start') {
    if (remotePreparedRunId !== session.runId) {
      configure(session.config || {});
      window.CreoMarbleRoulette.setEntries(session.entries);
      await prepareRound(session.seed);
      remotePreparedRunId = session.runId;
    }
    remoteStartCommandId = session.command.id;
    await startRound();
    remoteAppliedCommandId = session.command.id;
  }
}

async function fetchRemoteSession(): Promise<RemoteSession> {
  const response = await remoteRequest(remoteSessionUrl());
  if (isRemoteDisplay) {
    remoteApplyQueue = remoteApplyQueue.then(() => applyRemoteSession(response.session)).catch((error) => {
      console.error('Pinball remote command failed', error);
      setStatus('error', error instanceof Error ? error.message : '송출 명령 적용 실패');
    });
    await remoteApplyQueue;
  } else {
    updateRemoteSnapshot(response.session);
  }
  return response.session;
}

function startRemotePolling(): void {
  let lastPulse = -1;
  const poll = async (): Promise<void> => {
    try {
      const response = await fetch(`/api/platform/channels/${encodeURIComponent(remoteChannelId)}/broadcast-pulse`, {
        cache: 'no-store',
        credentials: 'same-origin',
      });
      if (!response.ok) throw new Error(`송출 연결 오류 (${response.status})`);
      const payload = await response.json() as { revision?: number };
      const pulse = Number(payload.revision) || 0;
      if (lastPulse < 0 || pulse !== lastPulse) {
        lastPulse = pulse;
        await fetchRemoteSession();
      }
    } catch (error) {
      if (isRemoteController) dom.remoteStatus.textContent = error instanceof Error ? error.message : '송출 서버 연결 끊김';
    } finally {
      window.setTimeout(poll, 450);
    }
  };
  void poll();
}

function applyConfigToControls(next: AppConfig): void {
  config = { ...DEFAULT_CONFIG, ...next };
  options.marbleStyle = config.marbleStyle;
  dom.eventTitle.value = config.eventTitle;
  dom.channelName.value = config.channelName;
  dom.speed.value = String(config.defaultSpeed);
  dom.renderFps.value = String(config.renderFps);
  dom.winningRank.value = String(config.winningRank);
  dom.skills.checked = config.useSkills;
  dom.recording.checked = config.autoRecording;
  dom.winnerLabel.value = config.winnerLabel;
  dom.accent.value = config.accentColor;
  document.querySelector<HTMLInputElement>(`input[name="winnerMode"][value="${config.winnerMode}"]`)!.checked = true;
  document.querySelector<HTMLInputElement>(`input[name="theme"][value="${config.themePreset}"]`)!.checked = true;
  document.querySelector<HTMLInputElement>(`input[name="marbleStyle"][value="${config.marbleStyle}"]`)!.checked = true;
  if (dom.map.options.length) dom.map.value = String(config.defaultMap);
  updateRankVisibility();
  updateBrand();
}

function configure(partial: Partial<AppConfig>): void {
  applyConfigToControls({ ...collectConfig(), ...partial });
  applyRuntimeAppearance();
  preparedFingerprint = '';
}

function bindEvents(): void {
  dom.openPanel.addEventListener('click', openPanel);
  dom.closePanel.addEventListener('click', closePanel);
  dom.panelBackdrop.addEventListener('click', closePanel);
  dom.fullscreen.addEventListener('click', async () => {
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
      else await document.documentElement.requestFullscreen();
    } catch {
      showToast('이 브라우저에서는 전체 화면을 사용할 수 없습니다.');
    }
  });

  dom.entries.addEventListener('input', () => {
    updateCounts();
    localStorage.setItem(STORAGE_KEYS.entries, dom.entries.value);
  });
  for (const input of [dom.eventTitle, dom.channelName, dom.winnerLabel]) {
    input.addEventListener('input', applyRuntimeAppearance);
  }
  for (const input of [dom.map, dom.speed, dom.renderFps, dom.winningRank, dom.skills, dom.recording]) {
    input.addEventListener('change', () => {
      if (input === dom.winningRank) updateRankVisibility();
      if (input === dom.renderFps && engineReady) roulette.setRenderFps(Number(dom.renderFps.value));
      updateCounts();
      persistInputs();
    });
  }
  document.querySelectorAll<HTMLInputElement>('input[name="winnerMode"]').forEach((input) => {
    input.addEventListener('change', () => {
      updateRankVisibility();
      updateCounts();
      persistInputs();
    });
  });
  document.querySelectorAll<HTMLInputElement>('input[name="theme"]').forEach((input) => {
    input.addEventListener('change', () => {
      if (input.checked && THEME_PRESETS[input.value]) dom.accent.value = THEME_PRESETS[input.value].coolTimeIndicator;
      applyRuntimeAppearance();
      preparedFingerprint = '';
    });
  });
  document.querySelectorAll<HTMLInputElement>('input[name="marbleStyle"]').forEach((input) => {
    input.addEventListener('change', () => {
      applyRuntimeAppearance();
      preparedFingerprint = '';
    });
  });
  dom.accent.addEventListener('input', () => {
    applyRuntimeAppearance();
    preparedFingerprint = '';
  });

  dom.sample.addEventListener('click', () => {
    dom.entries.value = '참가자 A*2\n참가자 B\n참가자 C*3\n참가자 D\n참가자 E';
    updateCounts();
  });
  dom.syncWinners.addEventListener('click', () => void syncAuctionWinnerEntries());
  dom.clearEntries.addEventListener('click', () => {
    dom.entries.value = '';
    updateCounts();
    dom.entries.focus();
  });
  dom.importEntries.addEventListener('click', () => dom.entriesFile.click());
  dom.entriesFile.addEventListener('change', async () => {
    const file = dom.entriesFile.files?.[0];
    if (!file) return;
    dom.entries.value = (await file.text()).trim();
    dom.entriesFile.value = '';
    updateCounts();
    showToast(`${file.name}을 불러왔습니다.`);
  });

  dom.shuffle.addEventListener('click', () => {
    void prepareRound().then(() => {
      if (isRemoteController) void sendRemoteCommand('prepare').catch(console.error);
    }).catch((error: Error) => showToast(error.message));
  });
  dom.start.addEventListener('click', () => {
    void startRound().then(() => {
      if (isRemoteController) void sendRemoteCommand('start').catch(console.error);
    }).catch((error: Error) => showToast(error.message));
  });

  dom.copyBroadcastSource.addEventListener('click', async () => {
    await copyText(dom.broadcastSource.value);
    showToast('PRISM 송출 주소를 복사했습니다.');
  });
  dom.copyRemoteResult.addEventListener('click', async () => {
    if (!lastRemoteResult) return;
    await copyText(remoteResultText(lastRemoteResult));
    showToast('최근 순위를 복사했습니다.');
  });
  dom.exportRemoteResult.addEventListener('click', () => {
    if (!lastRemoteResult) return;
    downloadJson(`pinball-result-${lastRemoteResult.runId || 'latest'}.json`, {
      version: 1,
      channelId: remoteChannelId,
      result: lastRemoteResult,
    });
  });
  dom.resetBroadcastSession.addEventListener('click', () => {
    if (remotePhase === 'running' && !window.confirm('송출 화면의 진행 상태를 초기화할까요? 실제 핀볼 화면은 새로고침해야 할 수 있습니다.')) return;
    void sendRemoteCommand('reset').then(() => showToast('송출 상태를 초기화했습니다.')).catch((error: Error) => showToast(error.message));
  });

  dom.exportPreset.addEventListener('click', () => {
    persistInputs();
    downloadJson('marble-draw-preset.json', { version: 1, config, entries: dom.entries.value });
  });
  dom.importPreset.addEventListener('click', () => dom.presetFile.click());
  dom.presetFile.addEventListener('change', async () => {
    const file = dom.presetFile.files?.[0];
    if (!file) return;
    try {
      const imported = JSON.parse(await file.text()) as { config?: Partial<AppConfig>; entries?: string };
      configure(imported.config ?? {});
      if (typeof imported.entries === 'string') dom.entries.value = imported.entries;
      updateCounts();
      showToast('설정을 가져왔습니다.');
    } catch {
      showToast('올바른 설정 파일이 아닙니다.');
    }
    dom.presetFile.value = '';
  });

  dom.exportHistory.addEventListener('click', () => downloadJson('marble-draw-history.json', { version: 1, history }));
  dom.clearHistory.addEventListener('click', () => {
    if (!window.confirm('이 브라우저에 저장된 추첨 기록을 모두 삭제할까요?')) return;
    history = [];
    saveHistory();
  });

  dom.copyResult.addEventListener('click', async () => {
    if (!lastRecord) return;
    const text = [
      `${lastRecord.eventTitle} · ${dom.winnerLabel.value || '당첨'}: ${lastRecord.winner}`,
      `공 ${lastRecord.ballCount}개 · ${lastRecord.mapTitle} · ${formatDuration(lastRecord.durationMs)}`,
      `시드: ${lastRecord.seed}`,
      `참가자 해시: ${lastRecord.entriesHash}`,
    ].join('\n');
    await copyText(text);
    showToast('결과를 복사했습니다.');
  });
  dom.resultButton.addEventListener('click', () => {
    if (!lastRecord || dom.resultDialog.open) return;
    dom.resultDialog.showModal();
  });
  dom.replay.addEventListener('click', async () => {
    if (!lastRecord) return;
    dom.resultButton.hidden = true;
    dom.resultDialog.close();
    await prepareRound(lastRecord.seed);
    await startRound();
  });
  dom.newRound.addEventListener('click', async () => {
    dom.resultButton.hidden = true;
    dom.resultDialog.close();
    await prepareRound();
    openPanel();
  });

  window.addEventListener('message', (event) => {
    if (event.origin !== location.origin || !event.data || event.data.type !== 'creo:roulette:configure') return;
    configure(event.data.config ?? {});
    if (event.data.entries) window.CreoMarbleRoulette.setEntries(event.data.entries);
  });
}

async function waitForEngine(): Promise<void> {
  const started = performance.now();
  while (!roulette.isReady) {
    if (performance.now() - started > 15000) throw new Error('물리 엔진을 불러오지 못했습니다. 새로고침해주세요.');
    await new Promise((resolve) => window.setTimeout(resolve, 50));
  }
}

async function initialize(): Promise<void> {
  bindEvents();
  const urlState = applyUrlParameters(config);
  applyConfigToControls(urlState.config);
  dom.entries.value = urlState.entries || localStorage.getItem(STORAGE_KEYS.entries) || config.defaultEntries;
  renderHistory();
  updateCounts();
  if (!isRemoteDisplay) openPanel();
  else closePanel();

  if (isRemoteController) {
    dom.syncWinners.hidden = false;
    dom.remoteSection.hidden = false;
    dom.broadcastSource.value = remoteSourceUrl();
    dom.privacyNotice.textContent = '브로드캐스트 모드에서는 참가자 이름과 추첨 설정이 선택한 채널 세션에 저장됩니다.';
    dom.shuffle.textContent = '송출에 공 배치';
    dom.start.querySelector('span')!.textContent = '송출 추첨 시작';
  }

  if (autoLoadAuctionWinners) await syncAuctionWinnerEntries(false);

  roulette = new Roulette();
  roulette.addEventListener('goal', (event) => {
    const winner = (event as CustomEvent<{ winner: string }>).detail.winner;
    void completeRound(winner);
  });
  roulette.addEventListener('message', (event) => {
    showToast((event as CustomEvent<string>).detail);
  });

  try {
    await waitForEngine();
    engineReady = true;
    const maps = roulette.getMaps();
    for (const map of maps) {
      const option = document.createElement('option');
      option.value = String(map.index);
      option.textContent = MAP_LABELS[map.title] ?? map.title;
      dom.map.append(option);
    }
    dom.map.value = String(Math.min(config.defaultMap, Math.max(0, maps.length - 1)));
    roulette.setTheme(activeTheme());
    updateCounts();
    if (entrySummary().balls >= 2) {
      try {
        await prepareRound();
      } catch (err) {
        console.error('Auto-prepare failed:', err);
      }
    }
    setStatus('ready', isRemoteDisplay ? '노트북에서 공 배치를 기다리는 중' : '추첨 준비 완료');
    if (remoteChannelId) startRemotePolling();
  } catch (error) {
    console.error(error);
    setStatus('error', '엔진 로드 실패');
    showToast(error instanceof Error ? error.message : '초기화에 실패했습니다.');
  }
}

window.CreoMarbleRoulette = {
  version: APP_VERSION,
  configure,
  setEntries(entries) {
    dom.entries.value = Array.isArray(entries) ? entries.join('\n') : entries;
    updateCounts();
  },
  prepare: prepareRound,
  start: startRound,
  getHistory: () => history.slice(),
  getProgress: () => roulette.getProgress(),
  getStandings: () => roulette.getStandings(),
};

void initialize();
