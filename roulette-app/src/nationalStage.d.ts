export declare function isNationalChannel(channel: string): boolean;
export declare function createNationalStage(options: {
  root: HTMLElement;
  video: HTMLVideoElement;
  enabled: () => boolean;
  reducedMotion: () => boolean;
  storage?: Pick<Storage, 'getItem' | 'setItem'>;
  storageKey: string;
  roster?: { update: (state: { phase?: string; participants?: string[]; rosterKey?: string }) => void };
}): {
  update: (state: {
    phase?: 'loading' | 'ready' | 'running' | 'complete' | 'error';
    winner?: string;
    winners?: string[];
    drawLabel?: string;
    ballCount?: number;
    eventTitle?: string;
    edition?: string;
    participants?: string[];
    rosterKey?: string;
  }) => void;
  start: (runId: string) => void;
  stop: () => void;
};
