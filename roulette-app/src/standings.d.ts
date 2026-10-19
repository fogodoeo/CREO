export declare function snapshotStandings(
  finished: Array<{ id: number; name: string }>,
  active: Array<{ id: number; name: string }>,
): Array<{ rank: number; name: string; finished: boolean }>;
