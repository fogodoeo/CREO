export declare function createRosterSequence(options: {
  render: (state: { visible: boolean; names: string[]; total: number }) => void;
}): {
  update: (state: { phase?: string; participants?: string[]; rosterKey?: string }) => void;
};
export declare function rosterLayout(options: { total: number; width: number; height: number; nameWidth?: number }): {
  columns: number; rows: number; fontSize: number; gap: number;
};
