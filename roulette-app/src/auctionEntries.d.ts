export function auctionWinnerEntries(
  items: Array<{ status?: unknown; winnerAlias?: unknown; winnerName?: unknown; soldPrice?: unknown; attributes?: unknown; groupId?: unknown }>,
  unitAmount?: number,
  options?: { theme?: string | null; house?: string | null; isAcademy?: boolean } | string | null,
): string[];

export function getLeadingHouseKey(
  items: Array<{ status?: unknown; soldPrice?: unknown; attributes?: unknown; groupId?: unknown }>,
): string | null;

export const HOUSE_NAMES: Record<string, string>;
