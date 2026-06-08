export type OpenEmailItem = {
  id: string;
  from?: string | null;
  from_addr?: string | null;
  subject?: string | null;
  received_at: string;
  text_preview?: string;
  has_html?: boolean;
};

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
