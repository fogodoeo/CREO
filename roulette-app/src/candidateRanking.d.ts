export type CandidateRank<T> = {
  candidate: T;
  rank: number;
};

export declare function selectCandidateRanks<T extends { name: string }>(
  ranked: T[],
  winnerRank: number,
  limit?: number
): CandidateRank<T>[];

export declare function selectDrawCandidates<T extends { name: string }>(
  marbles: T[], finishers: T[],
  config?: { winnerMode?: string; winnerCount?: number }, winnerRank?: number
): T[];
