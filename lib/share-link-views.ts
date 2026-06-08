export type EvaluateShareLinkViewInput = {
  maxViews: number;
  viewsUsed: number;
  lastEmailFingerprint?: string | null;
  currentEmailFingerprint?: string | null;
};

export type EvaluateShareLinkViewResult = {
  ok: boolean;
  shouldIncrement: boolean;
  nextViewsUsed: number;
  nextLastEmailFingerprint: string | null;
  remaining: number | null;
};

function normalizeFingerprint(value?: string | null) {
  const normalized = String(value || '').trim();
  return normalized || null;
}

function getRemaining(maxViews: number, viewsUsed: number) {
  return maxViews > 0 ? Math.max(0, maxViews - viewsUsed) : null;
}

export function evaluateShareLinkView({
  maxViews,
  viewsUsed,
  lastEmailFingerprint,
  currentEmailFingerprint,
}: EvaluateShareLinkViewInput): EvaluateShareLinkViewResult {
  const previous = normalizeFingerprint(lastEmailFingerprint);
  const current = normalizeFingerprint(currentEmailFingerprint);

  if (!current || current === previous) {
    return {
      ok: true,
      shouldIncrement: false,
      nextViewsUsed: viewsUsed,
      nextLastEmailFingerprint: previous,
      remaining: getRemaining(maxViews, viewsUsed),
    };
  }

  if (maxViews > 0 && viewsUsed >= maxViews) {
    return {
      ok: false,
      shouldIncrement: false,
      nextViewsUsed: viewsUsed,
      nextLastEmailFingerprint: previous,
      remaining: 0,
    };
  }

  const nextViewsUsed = viewsUsed + 1;
  return {
    ok: true,
    shouldIncrement: true,
    nextViewsUsed,
    nextLastEmailFingerprint: current,
    remaining: getRemaining(maxViews, nextViewsUsed),
  };
}
