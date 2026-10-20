type Session = { phase: string; runId: string; seed: string };
export declare function initialEntries(options: {
  remoteDisplay: boolean;
  urlEntries?: string;
  readStored: () => string | null;
  fallback: string;
}): string;
export declare function createRemoteControls<T extends Session>(options: {
  sendCommand: (action: 'prepare' | 'start') => Promise<T>;
  readFingerprint: () => string;
  readSession: () => { phase: string; runId: string };
  preview: (session: T) => Promise<void>;
  onBusy: (busy: boolean) => void;
}): { prepare: () => Promise<T | null>; start: () => Promise<T | null> };
export declare function createSessionPoller(options: {
  readPulse: () => Promise<number>;
  fetchSession: () => Promise<unknown>;
}): () => Promise<void>;
