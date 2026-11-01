export function syncRemoteResult(document: Document, session: {
  phase: string;
  config?: { eventTitle?: string } | null;
  result?: { winner: string; winners?: string[] } | null;
}, enabled: boolean): void;
