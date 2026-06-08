export type OpenEmailItem = {
  id: string;
  from?: string | null;
  from_addr?: string | null;
  subject?: string | null;
  received_at: string;
  text_preview?: string;
  has_html?: boolean;
};

export const OPEN_MAIL_POLL_INTERVAL_MS = 5000;

type OpenLink = {
  expires_at?: string | null;
  remaining?: number | null;
  views_used?: number;
  max_views?: number;
};

export type RawOpenEmailItem = Omit<OpenEmailItem, 'id'> & {
  id: string | number;
};

export type RawOpenData = {
  success: boolean;
  mailbox: string;
  link?: OpenLink;
  emails?: RawOpenEmailItem[];
  error?: string;
};

export type OpenData = {
  success: boolean;
  mailbox: string;
  link?: OpenLink;
  emails: OpenEmailItem[];
  error?: string;
};

type VerificationCodeSource = {
  subject?: string | null;
  text_body?: string | null;
  html_body?: string | null;
};

type ClipboardLike = {
  writeText: (text: string) => Promise<void>;
};

export function normalizeOpenData(data: RawOpenData): OpenData {
  return {
    ...data,
    emails: Array.isArray(data.emails)
      ? data.emails.map((email) => ({
          ...email,
          id: String(email.id),
        }))
      : [],
  };
}

export function extractVerificationCode(source: VerificationCodeSource): string | null {
  const segments = [source.subject, source.text_body, source.html_body];

  for (const segment of segments) {
    if (!segment) continue;
    const match = segment.match(/(^|[^\d])(\d{4,8})(?!\d)/);
    if (match?.[2]) return match[2];
  }

  return null;
}

export async function copyTextToClipboard(clipboard: ClipboardLike | null | undefined, text: string) {
  if (!clipboard?.writeText) {
    throw new Error('当前环境不支持剪贴板');
  }

  await clipboard.writeText(text);
}
