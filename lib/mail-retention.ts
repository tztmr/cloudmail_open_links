export type ReceivedEmailRetentionItem = {
  id: string;
  owner_user_id: string;
  mailbox_email: string;
  received_at: string;
};

function buildGroupKey(item: ReceivedEmailRetentionItem) {
  return `${item.owner_user_id}::${item.mailbox_email.trim().toLowerCase()}`;
}

function toTimestamp(value: string) {
  const timestamp = new Date(value).getTime();
  return Number.isFinite(timestamp) ? timestamp : 0;
}

export function collectReceivedEmailIdsToDelete(
  items: ReceivedEmailRetentionItem[],
  keepPerMailbox = 1,
) {
  if (keepPerMailbox < 1) return items.map((item) => item.id);

  const grouped = new Map<string, ReceivedEmailRetentionItem[]>();
  for (const item of items) {
    const key = buildGroupKey(item);
    const current = grouped.get(key) || [];
    current.push(item);
    grouped.set(key, current);
  }

  const ids: string[] = [];
  for (const groupItems of grouped.values()) {
    groupItems
      .sort((left, right) => {
        const timeDiff = toTimestamp(right.received_at) - toTimestamp(left.received_at);
        if (timeDiff !== 0) return timeDiff;
        return right.id.localeCompare(left.id, 'en');
      })
      .slice(keepPerMailbox)
      .forEach((item) => {
        ids.push(item.id);
      });
  }

  return ids;
}

export function getDelayUntilNextDailyRun(now: Date, runAtHour = 3) {
  const next = new Date(now);
  next.setUTCMinutes(0, 0, 0);
  next.setUTCHours(runAtHour);

  if (next.getTime() <= now.getTime()) {
    next.setUTCDate(next.getUTCDate() + 1);
  }

  return next.getTime() - now.getTime();
}
