export const DEFAULT_BATCH_LINK_MAX_VIEWS = 100;
export const DEFAULT_BATCH_LINK_EXPIRES_DAYS = 30;

function toNonNegativeNumber(value: unknown): number | null {
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric < 0) {
    return null;
  }
  return numeric;
}

export function parseBatchShareLinkOptions(input: {
  maxViews?: unknown;
  expiresInDays?: unknown;
  expiresInMinutes?: unknown;
}) {
  const maxViews = toNonNegativeNumber(input.maxViews) ?? DEFAULT_BATCH_LINK_MAX_VIEWS;
  const expiresInDaysValue = toNonNegativeNumber(input.expiresInDays);
  const hasLegacyMinutes = input.expiresInMinutes !== undefined && input.expiresInMinutes !== null;

  if (expiresInDaysValue !== null) {
    return {
      maxViews,
      expiresInDays: expiresInDaysValue,
      expiresInMinutes: expiresInDaysValue * 24 * 60,
    };
  }

  if (!hasLegacyMinutes) {
    return {
      maxViews,
      expiresInDays: DEFAULT_BATCH_LINK_EXPIRES_DAYS,
      expiresInMinutes: DEFAULT_BATCH_LINK_EXPIRES_DAYS * 24 * 60,
    };
  }

  const expiresInMinutes = toNonNegativeNumber(input.expiresInMinutes) ?? (DEFAULT_BATCH_LINK_EXPIRES_DAYS * 24 * 60);
  return {
    maxViews,
    expiresInDays: 0,
    expiresInMinutes,
  };
}
