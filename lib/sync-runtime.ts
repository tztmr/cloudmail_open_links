import {
  getSyncSetting,
  hasReceivedEmailMessageId,
  insertReceivedEmail,
  listMailboxes,
  listProviders,
} from '@/lib/db';
import { createSyncScheduler } from '@/lib/sync-scheduler';
import { syncAllMailboxesFromProviders, syncMailboxFromProvider } from '@/lib/mail-sync';

type GlobalState = {
  scheduler?: ReturnType<typeof createSyncScheduler>;
};

const globalState = globalThis as typeof globalThis & GlobalState;

export function ensureSyncRuntimeStarted() {
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
          syncMailbox: ({ mailboxEmail, provider }) =>
            syncMailboxFromProvider({
              mailboxEmail,
              provider,
              hasMessageId: (messageId) => hasReceivedEmailMessageId(mailboxEmail, messageId),
              saveEmail: (email) => insertReceivedEmail(email),
            }),
        });
      },
    });
  }

  void globalState.scheduler.refresh();
  return globalState.scheduler;
}
