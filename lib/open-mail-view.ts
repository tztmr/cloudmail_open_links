type ViewEmail = {
  id: string;
  message_id?: string | null;
};

type SyncOutcome = {
  status: 'completed' | 'failed' | 'timed_out' | 'skipped_recent';
  result: { fetched: number; inserted: number; skipped: number } | null;
  error: string | null;
};

type ConsumeResult = {
  ok: boolean;
  remaining: number | null;
  views_used: number | null;
};

type LoadOpenMailboxViewArgs<TEmail extends ViewEmail> = {
  mailboxEmail: string;
  ownerUserId?: string;
  token: string;
  mailboxKey: string;
  provider?: { id?: string | null } | null;
  syncMaxWaitMs: number;
  syncMinIntervalMs: number;
  listEmails: () => Promise<TEmail[]>;
  consumeView: (token: string, fingerprint?: string | null) => Promise<ConsumeResult>;
  syncMailbox: (args: {
    mailboxKey: string;
    maxWaitMs: number;
    minIntervalMs: number;
  }) => Promise<SyncOutcome>;
};

function getEmailFingerprint(email?: { message_id?: string | null; id?: string | null }) {
  return String(email?.message_id || email?.id || '').trim() || null;
}

export async function loadOpenMailboxView<TEmail extends ViewEmail>({
  token,
  mailboxKey,
  provider,
  syncMaxWaitMs,
  syncMinIntervalMs,
  listEmails,
  consumeView,
  syncMailbox,
}: LoadOpenMailboxViewArgs<TEmail>) {
  let syncStatus: SyncOutcome['status'] | null = null;
  let syncError: string | null = null;

  if (provider) {
    try {
      const syncOutcome = await syncMailbox({
        mailboxKey,
        maxWaitMs: syncMaxWaitMs,
        minIntervalMs: syncMinIntervalMs,
      });
      syncStatus = syncOutcome.status;
      syncError = syncOutcome.error;
    } catch (error: unknown) {
      syncStatus = 'failed';
      syncError = error instanceof Error ? error.message : 'Sync failed';
    }
  }

  const emails = await listEmails();
  const currentEmailFingerprint = getEmailFingerprint(emails[0]);
  const consumeResult = await consumeView(token, currentEmailFingerprint);

  return {
    emails,
    consumeResult,
    syncStatus,
    syncError,
  };
}
