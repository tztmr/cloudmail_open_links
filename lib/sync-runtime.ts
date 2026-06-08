import {
  getSyncSetting,
  hasReceivedEmailMessageId,
  insertReceivedEmail,
  listMailboxes,
  listProviders,
  pruneReceivedEmailsKeepingLatest,
} from '@/lib/db';
import { getDelayUntilNextDailyRun } from '@/lib/mail-retention';
import { createSyncScheduler } from '@/lib/sync-scheduler';
import { syncAllMailboxesFromProviders, syncMailboxFromProvider } from '@/lib/mail-sync';

type GlobalState = {
  scheduler?: ReturnType<typeof createSyncScheduler>;
  cleanupTimer?: ReturnType<typeof setTimeout>;
};

const globalState = globalThis as typeof globalThis & GlobalState;

function scheduleDailyCleanup() {
  if (globalState.cleanupTimer) return;

  const armNextRun = () => {
    globalState.cleanupTimer = setTimeout(async () => {
      globalState.cleanupTimer = undefined;
      try {
        await pruneReceivedEmailsKeepingLatest(1);
      } finally {
        armNextRun();
      }
    }, getDelayUntilNextDailyRun(new Date(), 3));
  };

  armNextRun();
}

export function ensureSyncRuntimeStarted() {
  scheduleDailyCleanup();
  if (!globalState.scheduler) {
    globalState.scheduler = createSyncScheduler({
      loadSettings: getSyncSetting,
      runSync: async () => {
        const [mailboxes, providers] = await Promise.all([
          listMailboxes(1000),
          listProviders(),
        ]);

        return syncAllMailboxesFromProviders({
          mailboxes,
          providers,
          syncMailbox: ({ mailboxEmail, ownerUserId, provider }) =>
            syncMailboxFromProvider({
              mailboxEmail,
              provider,
              hasMessageId: (messageId) => hasReceivedEmailMessageId(mailboxEmail, messageId, ownerUserId),
              saveEmail: (email) => {
                if (!ownerUserId) {
                  throw new Error(`owner_user_id missing for mailbox ${mailboxEmail}`);
                }

                return insertReceivedEmail({ ...email, owner_user_id: ownerUserId });
              },
            }),
        });
      },
    });
  }

  void globalState.scheduler.refresh();
  return globalState.scheduler;
}
