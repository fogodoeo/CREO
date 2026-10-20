type DrawConfig = { winnerMode?: string; winnerCount?: number; winningRank?: number };
export function drawLabel(config?: DrawConfig): string;
export function participantCount(entries: string[]): number;
export function winnerCount(config?: DrawConfig): number;
export function selectDrawWinners(standings: { name: string; finished: boolean }[], config?: DrawConfig): string[];
export function winnerCountError(entries: string[], config?: DrawConfig): string;
