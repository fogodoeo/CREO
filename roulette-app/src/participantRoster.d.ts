export declare function createRosterSequence(options: {
  render: (state: { visible: boolean; names: string[]; offset: number; page: number; pages: number; total: number; paused: boolean; automatic: boolean }) => void;
  reducedMotion: () => boolean;
}): {
  update: (state: { phase?: string; participants?: string[]; rosterKey?: string }) => void;
  move: (delta: number) => void;
  toggle: () => void;
  stop: () => void;
};
