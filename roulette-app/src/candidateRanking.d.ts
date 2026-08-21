export type CandidateRank<T> = {
  candidate: T;
  rank: number;
};

export declare function selectCandidateRanks<T extends { name: string }>(
  ranked: T[],
  winnerRank: number,
  limit?: number
): CandidateRank<T>[];
